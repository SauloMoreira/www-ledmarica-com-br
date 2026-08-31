import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { couponConditionMetPrePayment } from "@/lib/couponConditions";

// ============================================================
// ViaCEP — público, sem token
// ============================================================
export const lookupCep = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        cep: z
          .string()
          .transform((v) => v.replace(/\D/g, ""))
          .pipe(z.string().regex(/^\d{8}$/, "CEP deve ter 8 dígitos")),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const r = await fetch(`https://viacep.com.br/ws/${data.cep}/json/`);
      if (!r.ok) return { ok: false as const, error: "CEP não encontrado" };
      const j = (await r.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (j.erro) return { ok: false as const, error: "CEP não encontrado" };
      return {
        ok: true as const,
        street: j.logradouro ?? "",
        neighborhood: j.bairro ?? "",
        city: j.localidade ?? "",
        state: j.uf ?? "",
      };
    } catch {
      return { ok: false as const, error: "Erro ao consultar CEP" };
    }
  });

// ============================================================
// Lookup zona de frete local Maricá/RJ (com normalização + alias)
// Retornado para o front mostrar/ocultar opção e exibir mensagens.
// O valor final é SEMPRE recalculado no servidor em createOrder.
// ============================================================
export const lookupLocalDeliveryZone = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        city: z.string().max(120).optional().default(""),
        state: z.string().max(2).optional().default(""),
        neighborhood: z.string().max(120).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const state = (data.state || "").toUpperCase();
    if (state !== "RJ" || !data.city || !data.neighborhood) {
      return { ok: false as const, reason: "out_of_area" as const };
    }
    const { data: rows, error } = await supabaseAdmin.rpc(
      "lookup_local_delivery_zone" as never,
      {
        _city: data.city,
        _state: state,
        _neighborhood: data.neighborhood,
      } as never,
    );
    if (error) {
      console.error("[lookupLocalDeliveryZone] rpc err", error);
      return { ok: false as const, reason: "error" as const };
    }
    const row = (Array.isArray(rows) ? rows[0] : rows) as
      | {
          zone_id: string;
          matched_via: string;
          display_name: string;
          district: string;
          shipping_price: number | null;
          estimated_delivery_time: string | null;
          is_active: boolean;
          has_price: boolean;
        }
      | null
      | undefined;
    if (!row) return { ok: false as const, reason: "not_configured" as const };
    if (!row.is_active) {
      return {
        ok: false as const,
        reason: "inactive" as const,
        displayName: row.display_name,
        district: row.district,
      };
    }
    if (!row.has_price || row.shipping_price === null) {
      return {
        ok: false as const,
        reason: "no_price" as const,
        displayName: row.display_name,
        district: row.district,
      };
    }
    return {
      ok: true as const,
      zoneId: row.zone_id,
      displayName: row.display_name,
      district: row.district,
      price: Number(row.shipping_price),
      eta: row.estimated_delivery_time,
      matchedVia: row.matched_via,
    };
  });

// ============================================================
// Cálculo de frete — STUB local
// TODO: substituir pela chamada real ao Melhor Envio quando token disponível
// ============================================================
export const calculateShipping = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        zipCode: z.string().transform((v) => v.replace(/\D/g, "")),
        subtotal: z.number().min(0),
        weightKg: z.number().min(0).default(1),
        // Subtotal somado APENAS dos itens marcados como elegíveis a frete grátis.
        // Se omitido (compatibilidade), assume 0 — não libera frete grátis.
        eligibleSubtotal: z.number().min(0).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!/^\d{8}$/.test(data.zipCode)) {
      return { services: [], estimated: true as const, error: "CEP deve ter 8 dígitos" };
    }
    const { quoteShippingServices } = await import("@/server/shippingQuote.server");
    const services = quoteShippingServices({
      zipCode: data.zipCode,
      weightKg: data.weightKg,
      eligibleSubtotal: data.eligibleSubtotal,
    });
    return { services, estimated: true as const };
  });

// ============================================================
// Aplicar cupom
// ============================================================
export const applyCoupon = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ code: z.string().min(1).max(40), subtotal: z.number().min(0) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc(
      "apply_coupon" as never,
      {
        _code: data.code,
        _subtotal: data.subtotal,
      } as never,
    );
    if (error) return { valid: false, discount: 0, message: "Erro ao validar cupom" };
    const row = (Array.isArray(rows) ? rows[0] : rows) as {
      valid: boolean;
      discount: number;
      message: string;
    } | null;
    return {
      valid: Boolean(row?.valid),
      discount: Number(row?.discount ?? 0),
      message: String(row?.message ?? ""),
    };
  });

// ============================================================
// Cupom automático por condição (forma de pagamento / escopo da compra)
// Regra: entre os cupons automáticos elegíveis, vence SEMPRE o de MAIOR
// desconto para o cliente (especificidade só desempata). A validação final
// (validade, limites, uso por cliente) continua sendo feita por `apply_coupon`.
// ============================================================
type AutoCouponRow = {
  code: string;
  condition_type: string | null;
  condition_value: string | null;
  discount_type: string | null;
  discount_value: number | null;
  min_order_value: number | null;
};

/** Desconto estimado de um cupom sobre um subtotal (mesma fórmula do RPC). */
export function estimateCouponDiscount(
  coupon: { discount_type?: string | null; discount_value?: number | null },
  subtotal: number,
): number {
  const value = Number(coupon.discount_value ?? 0);
  if (value <= 0 || subtotal <= 0) return 0;
  if ((coupon.discount_type ?? "percent") === "percentage" || coupon.discount_type === "percent") {
    return Number(((subtotal * value) / 100).toFixed(2));
  }
  return Number(Math.min(value, subtotal).toFixed(2));
}

export const getAutoCouponForContext = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        intendedPaymentMethod: z.enum(["pix", "other"]).nullable().default(null),
        deliveryMethod: z.enum(["delivery", "local_delivery", "pickup"]).nullable().default(null),
        subtotal: z.number().min(0).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("coupons")
      .select("code, condition_type, condition_value, discount_type, discount_value, min_order_value")
      .eq("active", true)
      .eq("auto_apply", true);
    if (error || !rows) return { code: null as string | null, discount: 0, candidates: [] as { code: string; discount: number }[] };
    // Especificidade só como desempate: condição concreta > "qualquer forma" > sem condição.
    const specificity = (c: { condition_type: string | null; condition_value: string | null }) =>
      !c.condition_type ? 0 : c.condition_value === "any" ? 1 : 2;

    const candidates = (rows as AutoCouponRow[])
      .filter(
        (c) =>
          couponConditionMetPrePayment(c, data) &&
          data.subtotal >= Number(c.min_order_value ?? 0),
      )
      .map((c) => ({
        code: c.code,
        discount: estimateCouponDiscount(c, data.subtotal),
        specificity: specificity(c),
      }))
      .sort((a, b) => b.discount - a.discount || b.specificity - a.specificity);

    const best = candidates[0];
    return {
      code: best?.code ?? null,
      discount: best?.discount ?? 0,
      candidates: candidates.map((c) => ({ code: c.code, discount: c.discount })),
    };
  });





// ============================================================
// Criar pedido (RLS aplicada como o usuário)
// ============================================================
const CreateOrderInput = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        name: z.string(),
        sku: z.string().nullable().optional(),
        image: z.string().nullable().optional(),
        unitPrice: z.number().min(0),
        qty: z.number().int().min(1),
      }),
    )
    .min(1),
  deliveryMethod: z.enum(["delivery", "pickup", "local_delivery"]).default("delivery"),
  shipping: z
    .object({
      carrier: z.string(),
      service: z.string(),
      cost: z.number().min(0),
      // Para frete local: id da zona escolhida (servidor revalida o preço)
      localZoneId: z.string().uuid().optional().nullable(),
    })
    .optional()
    .nullable(),
  address: z
    .object({
      recipient: z.string().min(1),
      zipCode: z
        .string()
        .transform((v) => v.replace(/\D/g, ""))
        .pipe(
          z
            .string()
            .regex(/^\d{8}$/, "CEP deve ter 8 dígitos")
            .or(z.literal("")),
        ),
      street: z.string().optional().nullable(),
      number: z.string().optional().nullable(),
      complement: z.string().optional().nullable(),
      neighborhood: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
      state: z.string().optional().nullable(),
      saveAddress: z.boolean().default(false),
    })
    .nullable()
    .optional(),
  couponCode: z.string().optional().nullable(),
  intendedPaymentMethod: z.enum(["pix", "other"]).optional().nullable(),

  notes: z.string().optional().nullable(),
  tracking: z
    .object({
      utm_source: z.string().max(200).nullable().optional(),
      utm_medium: z.string().max(200).nullable().optional(),
      utm_campaign: z.string().max(200).nullable().optional(),
      utm_term: z.string().max(200).nullable().optional(),
      utm_content: z.string().max(200).nullable().optional(),
      origin_page: z.string().max(500).nullable().optional(),
      origin_path: z.string().max(500).nullable().optional(),
      origin_context: z.string().max(200).nullable().optional(),
      referrer_url: z.string().max(500).nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateOrderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // ========================================================
    // VALIDAÇÃO SERVER-SIDE: preço (B2B + varejo) e estoque
    // Nunca confiar no unitPrice/qty enviados pelo cliente.
    // Usa a engine `validate_b2b_pricing` para definir, item a item,
    // se aplica preço empresa ou varejo (mín/múltiplo/validade/empresa aprovada).
    // ========================================================
    const { computeB2bPricing } = await import("@/server/b2bPricing.server");
    const pricing = await computeB2bPricing({
      userId,
      items: data.items.map((i) => ({ productId: i.productId, qty: i.qty })),
    });

    // Mapeia ids p/ snapshot do cliente (sku/image enviados ficam só como hint)
    const clientHints = new Map(data.items.map((i) => [i.productId, i] as const));

    // Carrega nomes/skus/imagens atuais para snapshot consistente
    const productIds = Array.from(new Set(data.items.map((i) => i.productId)));
    const { data: prodMeta } = await supabase
      .from("products")
      .select("id, name, sku, images, cost_price, free_shipping_eligible")
      .in("id", productIds);
    const metaMap = new Map((prodMeta ?? []).map((p) => [p.id, p]));

    // Verifica disponibilidade + estoque por item priceado
    type LineComputed = {
      productId: string;
      name: string;
      sku: string | null;
      image: string | null;
      qty: number;
      retailUnitPrice: number;
      b2bUnitPrice: number | null;
      appliedUnitPrice: number;
      pricingSource: "retail" | "b2b";
      b2bDiscountUnit: number;
      b2bDiscountTotal: number;
      b2bMinQuantity: number | null;
      b2bRuleApplied: string;
      unitCost: number | null;
    };
    const lines: LineComputed[] = [];
    for (const it of pricing.items) {
      if (!it.available) {
        return {
          ok: false as const,
          error: `Produto indisponível foi removido do catálogo. Atualize o carrinho.`,
        };
      }
      if ((it.stock_qty ?? 0) < it.qty) {
        return {
          ok: false as const,
          error: `Estoque insuficiente para "${it.name}" (disponível: ${it.stock_qty ?? 0}). Ajuste a quantidade.`,
        };
      }
      // Bloqueia preço B2B inválido por mínimo/múltiplo (não cai silenciosamente para varejo
      // se o cliente DECLAROU intenção B2B no carrinho enviando qty respeitando regras).
      // Estratégia conservadora: se a fonte é "retail" mas o produto tem b2b_enabled e empresa aprovada,
      // permitimos prosseguir com varejo (compra mista). Não bloqueamos.
      const meta = metaMap.get(it.product_id);
      const hint = clientHints.get(it.product_id);
      lines.push({
        productId: it.product_id,
        name: it.name ?? meta?.name ?? "",
        sku: meta?.sku ?? hint?.sku ?? null,
        image: hint?.image ?? meta?.images?.[0] ?? null,
        qty: it.qty,
        retailUnitPrice: Number(it.retail_unit_price ?? 0),
        b2bUnitPrice: it.b2b_unit_price != null ? Number(it.b2b_unit_price) : null,
        appliedUnitPrice: Number(it.applied_unit_price ?? it.retail_unit_price ?? 0),
        pricingSource: (it.pricing_source ?? "retail") as "retail" | "b2b",
        b2bDiscountUnit: Number(it.b2b_discount_unit ?? 0),
        b2bDiscountTotal: Number(it.b2b_discount_total ?? 0),
        b2bMinQuantity: it.b2b_min_quantity ?? null,
        b2bRuleApplied: it.reason ?? "retail",
        unitCost: meta?.cost_price != null ? Number(meta.cost_price) : null,
      });
    }

    const retailSubtotal = Number(pricing.retail_subtotal ?? 0);
    const subtotal = Number(pricing.applied_subtotal ?? 0); // já com desconto B2B
    const b2bDiscountTotal = Number(pricing.b2b_discount_total ?? 0);
    const isB2bOrder = pricing.has_b2b_items && pricing.company_approved;

    // Cupom: respeita configuração allow_coupon_in_b2b quando o pedido tiver itens B2B
    let discount = 0;
    if (data.couponCode) {
      let couponAllowed = true;
      if (isB2bOrder) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: settings } = await supabaseAdmin
          .from("b2b_settings")
          .select("allow_coupon_in_b2b")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        couponAllowed = Boolean(
          (settings as { allow_coupon_in_b2b?: boolean } | null)?.allow_coupon_in_b2b,
        );
      }
      if (!couponAllowed) {
        return {
          ok: false as const,
          error: "Cupons promocionais não são acumulativos com condições B2B neste pedido.",
        };
      }
      const { data: rows } = await supabase.rpc(
        "apply_coupon" as never,
        {
          _code: data.couponCode,
          _subtotal: subtotal,
          _user_id: userId,
        } as never,
      );
      const row = Array.isArray(rows)
        ? (rows as Array<{ valid: boolean; discount: number }>)[0]
        : (rows as { valid: boolean; discount: number } | null);
      if (row?.valid) discount = Number(row.discount);
    }

    // ========================================================
    // Onda 9E.4b — DESCONTO DE COMBO
    // REGRA: cupom e combo NUNCA se somam. Calculamos o combo de forma
    // hipotética (sem bloqueio global por cupom, mas respeitando
    // `accepts_coupon=false` por kit via `couponPresent`) e aplicamos
    // apenas o MAIOR desconto para o cliente. Base B2B já foi aplicada antes.
    // ========================================================
    const { computeBundleApplication } = await import("@/server/cartBundleApply.server");
    const bundleApp = await computeBundleApplication({
      userId,
      items: data.items.map((i) => ({ productId: i.productId, qty: i.qty })),
      hasCoupon: false,
      couponPresent: discount > 0,
    });

    let bundleDiscountTotal = bundleApp.bundle_discount_total;
    let bundleDetails = bundleApp.details;
    let bundlePerItem = bundleApp.perItem;
    let appliedCouponCode: string | null = discount > 0 ? (data.couponCode ?? null) : null;
    let discountNotice: string | null = null;
    const fmtBRL = (v: number) =>
      `R$ ${v.toFixed(2).replace(".", ",")}`;

    if (discount > 0 && bundleDiscountTotal > 0) {
      if (bundleDiscountTotal > discount) {
        // Combo vence: zera o cupom
        discountNotice = `Seu combo já garante um desconto maior (${fmtBRL(bundleDiscountTotal)}) do que o cupom ${appliedCouponCode ?? ""} (${fmtBRL(discount)}) — aplicamos o combo.`.trim();
        discount = 0;
        appliedCouponCode = null;
      } else {
        // Cupom vence: zera o combo
        discountNotice = `Seu cupom ${appliedCouponCode ?? ""} garante um desconto maior (${fmtBRL(discount)}) do que o combo (${fmtBRL(bundleDiscountTotal)}) — aplicamos o cupom.`.trim();
        bundleDiscountTotal = 0;
        bundlePerItem = new Map();
        bundleDetails = {
          ...bundleApp.details,
          applied: [],
          blocked: [
            ...bundleApp.details.blocked,
            ...bundleApp.details.applied.map((a) => ({
              bundle_id: a.bundle_id,
              bundle_name: a.bundle_name,
              status: "blocked_by_coupon" as const,
              reason: "Cupom aplicado gerou desconto maior que o combo.",
            })),
          ],
        } as typeof bundleApp.details;
      }
    }
    const hasBundleDiscount = bundleDiscountTotal > 0;

    const isPickup = data.deliveryMethod === "pickup";
    const isLocal = data.deliveryMethod === "local_delivery";

    // Validações específicas por método
    if (isPickup) {
      if (!data.address?.recipient) {
        return { ok: false as const, error: "Informe o nome para retirada." };
      }
    } else {
      if (
        !data.address?.street ||
        !data.address?.number ||
        !data.address?.city ||
        !data.address?.state ||
        !data.address?.zipCode
      ) {
        return { ok: false as const, error: "Endereço de entrega incompleto." };
      }
      if (!isLocal && !data.shipping) {
        return { ok: false as const, error: "Selecione uma opção de frete." };
      }
    }

    // Validar e RECALCULAR frete local no servidor (nunca confiar no cliente)
    let localZoneInfo: {
      zoneId: string;
      displayName: string;
      district: string;
      price: number;
      eta: string | null;
    } | null = null;
    if (isLocal) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows, error: rpcErr } = await supabaseAdmin.rpc(
        "lookup_local_delivery_zone" as never,
        {
          _city: data.address?.city ?? "",
          _state: (data.address?.state ?? "").toUpperCase(),
          _neighborhood: data.address?.neighborhood ?? "",
        } as never,
      );
      if (rpcErr) {
        console.error("[createOrder] lookup zone err", rpcErr);
        return { ok: false as const, error: "Não foi possível validar a zona de frete local." };
      }
      const z = (Array.isArray(rows) ? rows[0] : rows) as {
        zone_id: string;
        display_name: string;
        district: string;
        shipping_price: number | null;
        estimated_delivery_time: string | null;
        is_active: boolean;
        has_price: boolean;
      } | null;
      if (!z)
        return {
          ok: false as const,
          error: "Bairro/localidade não atendido pelo frete local de Maricá.",
        };
      if (!z.is_active)
        return {
          ok: false as const,
          error: `Frete local indisponível para ${z.display_name} no momento.`,
        };
      if (!z.has_price || z.shipping_price === null) {
        return {
          ok: false as const,
          error: `Ainda não há valor de frete local configurado para ${z.display_name}.`,
        };
      }
      localZoneInfo = {
        zoneId: z.zone_id,
        displayName: z.display_name,
        district: z.district,
        price: Number(z.shipping_price),
        eta: z.estimated_delivery_time,
      };
    }

    // === Revalidação autoritativa do frete (delivery remoto) ===
    // Para "delivery", o cliente envia carrier/service/cost mas NUNCA confiamos
    // no `cost`: revalidamos contra a engine server-side (mesma usada no preview).
    // Isso bloqueia tentativa de manipular shipping_cost no payload.
    let validatedDeliveryCost = 0;
    if (!isPickup && !isLocal) {
      const { validateChosenShipping } = await import("@/server/shippingQuote.server");
      // eligibleSubtotal: itens com free_shipping_eligible (server-side).
      const eligibleIds = new Set(
        ((prodMeta ?? []) as Array<{ id: string; free_shipping_eligible?: boolean | null }>)
          .filter((p) => p.free_shipping_eligible === true)
          .map((p) => p.id),
      );
      const eligibleSubtotal = lines.reduce(
        (acc, l) => acc + (eligibleIds.has(l.productId) ? l.appliedUnitPrice * l.qty : 0),
        0,
      );
      const check = validateChosenShipping({
        zipCode: data.address?.zipCode ?? "",
        eligibleSubtotal,
        chosen: {
          carrier: data.shipping?.carrier ?? null,
          service: data.shipping?.service ?? null,
          cost: Number(data.shipping?.cost ?? 0),
        },
      });
      if (!check.ok) {
        return { ok: false as const, error: check.reason };
      }
      validatedDeliveryCost = check.service.price;
    }
    const shippingCost = isPickup
      ? 0
      : isLocal
        ? localZoneInfo!.price
        : validatedDeliveryCost;
    const shippingCarrier = isPickup
      ? "Retirada na loja"
      : isLocal
        ? "Frete Local Maricá/RJ"
        : (data.shipping?.carrier ?? null);
    const shippingService = isPickup
      ? "Retirada na loja"
      : isLocal
        ? `Frete Local Maricá/RJ — ${localZoneInfo!.displayName}`
        : (data.shipping?.service ?? null);
    const total = Math.max(0, subtotal - discount - bundleDiscountTotal + shippingCost);

    // Snapshot dos dados de retirada (loja) — em pickup
    let pickupSnap: {
      pickup_store_name: string | null;
      pickup_store_address: string | null;
      pickup_store_phone: string | null;
      pickup_instructions: string | null;
      pickup_status: string | null;
    } | null = null;
    if (isPickup) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: company } = await supabaseAdmin
        .from("company_settings")
        .select("pickup_store_name, pickup_address, pickup_phone, pickup_instructions, trade_name")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const c = (company ?? {}) as Record<string, string | null>;
      pickupSnap = {
        pickup_store_name: c.pickup_store_name || c.trade_name || null,
        pickup_store_address: c.pickup_address || null,
        pickup_store_phone: c.pickup_phone || null,
        pickup_instructions: c.pickup_instructions || null,
        pickup_status: "awaiting_release",
      };
    }

    // Salvar endereço (opcional) — em entrega/local_delivery
    let addressId: string | null = null;
    if (
      !isPickup &&
      data.address?.saveAddress &&
      data.address.street &&
      data.address.number &&
      data.address.city &&
      data.address.state
    ) {
      const { data: addr } = await supabase
        .from("addresses")
        .insert({
          user_id: userId,
          recipient: data.address.recipient,
          zip_code: data.address.zipCode,
          street: data.address.street,
          number: data.address.number,
          complement: data.address.complement ?? null,
          neighborhood: data.address.neighborhood ?? null,
          city: data.address.city,
          state: data.address.state,
        } as never)
        .select("id")
        .single();
      addressId = addr?.id ?? null;
    }

    // Criar pedido
    const deliveryMethodValue = isPickup ? "pickup" : isLocal ? "local_delivery" : "delivery";
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        status: "pending",
        payment_status: "pending",
        payment_method: "mercadopago",
        subtotal,
        discount,
        shipping_cost: shippingCost,
        total,
        coupon_code: appliedCouponCode,
        intended_payment_method: data.intendedPaymentMethod ?? null,

        shipping_carrier: shippingCarrier,
        shipping_service: shippingService,
        address_id: addressId,
        address_snapshot: (data.address ?? null) as never,
        notes: data.notes ?? null,
        delivery_method: deliveryMethodValue,
        // === Campos B2B ===
        order_type: isB2bOrder ? "b2b" : "b2c",
        company_id: isB2bOrder ? (pricing.company?.id ?? null) : null,
        company_name: isB2bOrder
          ? (pricing.company?.trade_name ?? pricing.company?.legal_name ?? null)
          : null,
        company_cnpj: isB2bOrder ? (pricing.company?.cnpj ?? null) : null,
        company_contact_name: isB2bOrder ? (pricing.company?.contact_name ?? null) : null,
        retail_subtotal: retailSubtotal,
        b2b_subtotal: subtotal,
        b2b_discount_total: b2bDiscountTotal,
        pricing_validated_at: pricing.validated_at,
        // === Onda 9E.4b: desconto de combo ===
        bundle_discount_total: bundleDiscountTotal,
        bundle_discount_details: bundleDetails as never,
        has_bundle_discount: hasBundleDiscount,
        ...(pickupSnap ?? {}),
        ...(localZoneInfo
          ? {
              local_delivery_zone_id: localZoneInfo.zoneId,
              local_delivery_district: localZoneInfo.district,
              local_delivery_eta: localZoneInfo.eta,
            }
          : {}),
        utm_source: data.tracking?.utm_source ?? null,
        utm_medium: data.tracking?.utm_medium ?? null,
        utm_campaign: data.tracking?.utm_campaign ?? null,
        utm_term: data.tracking?.utm_term ?? null,
        utm_content: data.tracking?.utm_content ?? null,
        origin_page: data.tracking?.origin_page ?? null,
        origin_path: data.tracking?.origin_path ?? null,
        origin_context: data.tracking?.origin_context ?? null,
        referrer_url: data.tracking?.referrer_url ?? null,
      } as never)
      .select("id, order_number")
      .single();

    if (orderErr || !order) {
      return { ok: false as const, error: orderErr?.message ?? "Falha ao criar pedido" };
    }

    // Criar itens (com memória da regra B2B aplicada)
    const { error: itemsErr } = await supabase.from("order_items").insert(
      lines.map((i) => {
        const totalPrice = i.appliedUnitPrice * i.qty;
        const hasCost = i.unitCost != null;
        const totalCost = hasCost ? Number((i.unitCost! * i.qty).toFixed(2)) : null;
        const grossMarginAmount = hasCost ? Number((totalPrice - totalCost!).toFixed(2)) : null;
        const grossMarginPercent =
          hasCost && totalPrice > 0
            ? Number(((grossMarginAmount! / totalPrice) * 100).toFixed(2))
            : null;
        const bundleAlloc = bundlePerItem.get(i.productId);
        return {
          order_id: order.id,
          product_id: i.productId,
          product_name: i.name,
          product_sku: i.sku ?? null,
          product_image: i.image ?? null,
          unit_price: i.appliedUnitPrice,
          qty: i.qty,
          total_price: totalPrice,
          retail_unit_price: i.retailUnitPrice,
          b2b_unit_price: i.b2bUnitPrice,
          applied_unit_price: i.appliedUnitPrice,
          b2b_discount_unit: i.b2bDiscountUnit,
          b2b_discount_total: i.b2bDiscountTotal,
          pricing_source: i.pricingSource,
          b2b_min_quantity: i.b2bMinQuantity,
          b2b_rule_applied: i.b2bRuleApplied,
          // Snapshot de custo / margem (Fase 8)
          unit_cost: i.unitCost,
          total_cost: totalCost,
          gross_margin_amount: grossMarginAmount,
          gross_margin_percent: grossMarginPercent,
          cost_source: hasCost ? "product" : "none",
          // === Onda 9E.4b: desconto de combo (rateado) ===
          // applied_unit_price NÃO é alterado — desconto fica em campo separado.
          bundle_id: bundleAlloc?.bundle_id ?? null,
          bundle_name: bundleAlloc?.bundle_name ?? null,
          bundle_applied: bundleAlloc != null && (bundleAlloc.bundle_discount_amount ?? 0) > 0,
          bundle_discount_amount: bundleAlloc?.bundle_discount_amount ?? 0,
          bundle_discount_eligible: bundleAlloc?.bundle_discount_eligible ?? false,
          bundle_block_reason: bundleAlloc?.block_reason ?? null,
        };
      }),
    );

    if (itemsErr) {
      return { ok: false as const, error: itemsErr.message };
    }

    // Disparar e-mail "pedido recebido" — AWAIT obrigatório (Worker aborta promises não aguardadas após a Response); sendOrderEmail nunca propaga erro.
    try {
      const { sendOrderEmail } = await import("@/server/email/orderEmails");
      await sendOrderEmail({ orderId: order.id, type: "order_created" });
    } catch (e) {
      console.error("[checkout] falha ao agendar e-mail order_created", e);
    }

    return {
      ok: true as const,
      orderId: order.id,
      orderNumber: order.order_number,
      discountNotice,
    };
  });

// ============================================================
// Buscar pedido por id (para confirmação e detalhe)
// ============================================================
export const getOrderById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: order, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", data.id)
      .single();
    if (error || !order) return { ok: false as const, error: "Pedido não encontrado" };
    return { ok: true as const, order };
  });

// ============================================================
// Listar pedidos do usuário
// ============================================================
export const listMyOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, status, payment_status, total, created_at, delivery_method")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("[listMyOrders] error", error);
      return { orders: [], error: error.message };
    }
    return { orders: data ?? [], error: null };
  });
