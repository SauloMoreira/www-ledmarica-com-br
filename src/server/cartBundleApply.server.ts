/**
 * Onda 9E.4b — Helper backend para APLICAR descontos de combo.
 *
 * Não é uma server function; é um módulo server-only chamado de dentro de
 * createOrder. A fonte da verdade do cálculo é a RPC `validate_cart_bundles`
 * (mesma usada pela prévia). Aqui:
 *  - resolvemos conflitos entre combos que disputam o mesmo item
 *    (escolha gulosa por maior desconto);
 *  - rateamos o desconto proporcionalmente entre os itens elegíveis
 *    (com ajuste de centavos no último item);
 *  - retornamos uma estrutura pronta para gravar em orders / order_items.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  computeKitPricing,
  type KitConfig,
  type KitItemForPricing,
} from "@/lib/kitPricing";

type KitRow = {
  id: string;
  kit_type: string | null;
  pricing_method: string | null;
  fixed_price: number | string | null;
  discount_percent: number | string | null;
  discount_amount: number | string | null;
  available_retail: boolean | null;
  available_b2b: boolean | null;
  b2b_pricing_method: string | null;
  b2b_fixed_price: number | string | null;
  b2b_extra_discount_percent: number | string | null;
  b2b_min_quantity: number | string | null;
  accepts_coupon: boolean | null;
  stack_with_b2b: boolean | null;
};

type KitItemRow = {
  bundle_id: string;
  product_id: string;
  quantity: number | string;
  product: {
    price: number | string | null;
    sale_price: number | string | null;
    b2b_enabled: boolean | null;
    b2b_price: number | string | null;
    cost_price: number | string | null;
    active: boolean | null;
  } | null;
};

function toKitConfig(row: KitRow): KitConfig {
  return {
    kit_type: ((row.kit_type as KitConfig["kit_type"]) ?? "combinado") as KitConfig["kit_type"],
    pricing_method: ((row.pricing_method as KitConfig["pricing_method"]) ?? "sum") as KitConfig["pricing_method"],
    fixed_price: row.fixed_price != null ? Number(row.fixed_price) : null,
    discount_percent: row.discount_percent != null ? Number(row.discount_percent) : null,
    discount_amount: row.discount_amount != null ? Number(row.discount_amount) : null,
    available_retail: row.available_retail !== false,
    available_b2b: !!row.available_b2b,
    b2b_pricing_method:
      ((row.b2b_pricing_method as KitConfig["b2b_pricing_method"]) ?? "inherit") as KitConfig["b2b_pricing_method"],
    b2b_fixed_price: row.b2b_fixed_price != null ? Number(row.b2b_fixed_price) : null,
    b2b_extra_discount_percent:
      row.b2b_extra_discount_percent != null ? Number(row.b2b_extra_discount_percent) : null,
    b2b_min_quantity: Number(row.b2b_min_quantity ?? 1),
    accepts_coupon: row.accepts_coupon !== false,
    stack_with_b2b: !!row.stack_with_b2b,
  };
}

function isLegacyKit(kit: KitConfig): boolean {
  // Kit antigo: ainda usa discount_type/discount_value vindo da RPC.
  return (
    kit.pricing_method === "sum" &&
    kit.b2b_pricing_method === "inherit" &&
    !kit.available_b2b
  );
}

async function resolveB2bApprovedForUser(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data } = await (supabaseAdmin as unknown as {
      rpc: (n: string, a: unknown) => Promise<{ data: string | null }>;
    }).rpc("get_user_approved_company_id", { _user_id: userId });
    return !!data;
  } catch {
    return false;
  }
}

export type ApplyCartBundlesInput = {
  userId: string | null;
  /** Itens do carrinho (mesmo formato passado para validate_cart_bundles). */
  items: Array<{ productId: string; qty: number }>;
  /** Cupom efetivamente aplicado no pedido (após validar). */
  hasCoupon: boolean;
  /**
   * Existe cupom válido no contexto, mesmo que este cálculo seja hipotético
   * (comparação cupom x combo). Usado apenas para a regra própria do kit
   * (`accepts_coupon=false` bloqueia o kit incondicionalmente).
   * Default: `hasCoupon`.
   */
  couponPresent?: boolean;
};

export type AppliedBundleItem = {
  product_id: string;
  required_qty: number;
  cart_qty: number;
  unit_price: number;
  pricing_source: "b2b" | "retail";
  considered_qty: number; // min(cart_qty, required_qty) — quantidade que conta para o combo
  bundle_discount_amount: number; // fatia rateada (≥ 0, 2 casas)
};

export type AppliedBundle = {
  bundle_id: string;
  bundle_name: string;
  bundle_slug: string | null;
  discount_type: "fixed_amount" | "percentage";
  discount_value: number;
  eligible_subtotal: number;
  discount_amount: number; // efetivamente aplicado, ≥ 0
  allocation_method: "proportional_by_item_subtotal";
  items: AppliedBundleItem[];
};

export type BlockedBundle = {
  bundle_id: string;
  bundle_name: string;
  status:
    | "blocked_by_b2b"
    | "blocked_by_coupon"
    | "missing_items"
    | "expired"
    | "inactive"
    | "not_eligible"
    | string;
  reason: string | null;
};

export type ApplyCartBundlesResult = {
  /** Soma total de bundle_discount_amount aplicado (= sum(applied.discount_amount)). */
  bundle_discount_total: number;
  /** Detalhes auditáveis (combos aplicados + bloqueados). Vai para orders.bundle_discount_details. */
  details: {
    version: 1;
    has_coupon: boolean;
    allow_with_coupon: boolean;
    applied: AppliedBundle[];
    blocked: BlockedBundle[];
  };
  /**
   * Mapa product_id → { bundle_id, bundle_name, discount_amount, eligible }
   * para preencher order_items.
   *
   * Se um produto está em mais de um combo aplicado (improvável após resolução,
   * mas possível com quantidades disjuntas), somamos os descontos e mantemos
   * o bundle do maior aporte.
   */
  perItem: Map<
    string,
    {
      bundle_id: string;
      bundle_name: string;
      bundle_discount_amount: number;
      bundle_discount_eligible: boolean;
      block_reason: string | null;
    }
  >;
};

type RpcRow = {
  bundle_id: string;
  bundle_slug: string | null;
  bundle_name: string;
  bundle_image: string | null;
  discount_type: "none" | "fixed_amount" | "percentage";
  discount_value: number;
  status: string;
  eligible_subtotal: number;
  estimated_discount: number;
  considered_items: Array<{
    product_id: string;
    required_qty: number;
    cart_qty: number;
    unit_price: number;
    pricing_source: "b2b" | "retail";
  }>;
  missing_items: unknown[];
  reason: string | null;
  warnings: string[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calcula descontos de combo a aplicar no pedido.
 *
 * Regras de produto:
 * 1. Cupom vence sobre combo (`allow_bundle_discount_with_coupon=false` por padrão).
 *    Se há cupom e a config não permite, NENHUM combo é aplicado — todos viram blocked_by_coupon.
 * 2. Itens com pricing_source='b2b' nunca recebem desconto de combo (já tratado pela RPC).
 * 3. Múltiplos combos elegíveis: aplicar todos, mas cada (product_id, unidade) só conta para 1 combo.
 *    Resolução: ordenar combos por estimated_discount desc; ao processar cada combo, "consumir"
 *    o quanto do cart_qty já foi usado por combos anteriores. Se o combo perder seus itens
 *    obrigatórios pela competição, ele é descartado.
 * 4. Rateio dentro do combo: proporcional ao `unit_price * considered_qty` de cada item elegível.
 *    Diferença de centavos vai para o último item.
 */
export async function computeBundleApplication(
  input: ApplyCartBundlesInput,
): Promise<ApplyCartBundlesResult> {
  const empty: ApplyCartBundlesResult = {
    bundle_discount_total: 0,
    details: {
      version: 1,
      has_coupon: input.hasCoupon,
      allow_with_coupon: false,
      applied: [],
      blocked: [],
    },
    perItem: new Map(),
  };

  if (!input.items || input.items.length === 0) return empty;

  // Buscar config de acúmulo com cupom (mesma usada pela prévia).
  const { data: settingsRow } = await supabaseAdmin
    .from("b2b_settings")
    .select("allow_bundle_discount_with_coupon")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const allowWithCoupon = Boolean(
    (settingsRow as { allow_bundle_discount_with_coupon?: boolean } | null)
      ?.allow_bundle_discount_with_coupon,
  );
  empty.details.allow_with_coupon = allowWithCoupon;

  // Chamar a RPC que já calcula tudo (status, eligible_subtotal, estimated_discount, considered_items).
  const { data: rows, error } = await supabaseAdmin.rpc("validate_cart_bundles", {
    _user_id: (input.userId ?? null) as unknown as string,
    _items: input.items.map((i) => ({ product_id: i.productId, qty: i.qty })),
    // Importante: passamos hasCoupon real para o RPC já marcar blocked_by_coupon
    // quando a config não permite acúmulo.
    _has_coupon: input.hasCoupon,
  });

  if (error) {
    console.error("[computeBundleApplication] rpc error:", error);
    return empty;
  }

  const list = (rows ?? []) as RpcRow[];
  if (list.length === 0) return empty;

  // Carregar config nova dos kits + itens (para o motor novo decidir preço final).
  const isB2bApproved = await resolveB2bApprovedForUser(input.userId);
  const allBundleIds = Array.from(new Set(list.map((r) => r.bundle_id)));
  const kitConfigById = new Map<string, KitConfig>();
  const kitItemsByBundle = new Map<string, KitItemForPricing[]>();
  if (allBundleIds.length > 0) {
    const { data: kitRows } = await supabaseAdmin
      .from("product_bundles")
      .select(
        "id, kit_type, pricing_method, fixed_price, discount_percent, discount_amount, available_retail, available_b2b, b2b_pricing_method, b2b_fixed_price, b2b_extra_discount_percent, b2b_min_quantity, accepts_coupon, stack_with_b2b",
      )
      .in("id", allBundleIds);
    for (const k of (kitRows ?? []) as KitRow[]) {
      kitConfigById.set(k.id, toKitConfig(k));
    }
    const { data: kitItemRows } = await supabaseAdmin
      .from("product_bundle_items")
      .select(
        "bundle_id, product_id, quantity, product:products(price, sale_price, b2b_enabled, b2b_price, cost_price, active)",
      )
      .in("bundle_id", allBundleIds);
    for (const it of (kitItemRows ?? []) as unknown as KitItemRow[]) {
      const p = it.product;
      if (!p || p.active === false) continue;
      const retail = Number(p.price ?? 0);
      const sale = p.sale_price != null ? Number(p.sale_price) : null;
      const finalPrice = sale != null && sale > 0 ? sale : retail;
      const arr = kitItemsByBundle.get(it.bundle_id) ?? [];
      arr.push({
        quantity: Number(it.quantity ?? 1),
        retail_unit_price: finalPrice,
        b2b_unit_price: p.b2b_price != null ? Number(p.b2b_price) : null,
        cost_unit_price: p.cost_price != null ? Number(p.cost_price) : null,
        b2b_enabled: !!p.b2b_enabled,
      });
      kitItemsByBundle.set(it.bundle_id, arr);
    }
  }

  // Bloqueios kit-específicos: cupom (kit não aceita cupom), B2B-only para não-B2B.
  const blocked: BlockedBundle[] = [];
  const candidates: RpcRow[] = [];
  for (const r of list) {
    const cfg = kitConfigById.get(r.bundle_id);
    if (cfg) {
      if ((input.couponPresent ?? input.hasCoupon) && !cfg.accepts_coupon) {
        blocked.push({
          bundle_id: r.bundle_id,
          bundle_name: r.bundle_name,
          status: "blocked_by_coupon",
          reason: "Este kit não acumula com cupons promocionais.",
        });
        continue;
      }
      if (!cfg.available_retail && !isB2bApproved) {
        blocked.push({
          bundle_id: r.bundle_id,
          bundle_name: r.bundle_name,
          status: "not_eligible",
          reason: "Kit exclusivo para clientes empresa aprovados.",
        });
        continue;
      }
    }
    if (r.status !== "eligible_preview") {
      blocked.push({
        bundle_id: r.bundle_id,
        bundle_name: r.bundle_name,
        status: r.status,
        reason: r.reason,
      });
      continue;
    }
    candidates.push(r);
  }

  // Ordenar candidatos por maior estimated_discount primeiro (resolução de conflito gulosa).
  // Para kits do motor novo, estimated_discount pode ser 0 — desempate vai para depois (mantemos ordem original).
  const eligible = candidates.sort(
    (a, b) => Number(b.estimated_discount) - Number(a.estimated_discount),
  );

  // Quantidades já consumidas por combos aplicados, por produto.
  const consumed = new Map<string, number>();
  // Carrinho original (qty disponível por produto).
  const cartQty = new Map<string, number>();
  for (const it of input.items) {
    cartQty.set(it.productId, (cartQty.get(it.productId) ?? 0) + it.qty);
  }

  const applied: AppliedBundle[] = [];
  const perItem: ApplyCartBundlesResult["perItem"] = new Map();

  for (const row of eligible) {
    const considered = row.considered_items ?? [];
    if (considered.length === 0) {
      blocked.push({
        bundle_id: row.bundle_id,
        bundle_name: row.bundle_name,
        status: "not_eligible",
        reason: "Sem itens considerados.",
      });
      continue;
    }

    // Para cada item considerado, calcular quanto deste produto ainda está disponível
    // (cart_qty − consumido por combos aplicados anteriormente).
    type ItemBuild = {
      product_id: string;
      required_qty: number;
      cart_qty: number;
      unit_price: number;
      pricing_source: "b2b" | "retail";
      considered_qty: number;
      line_eligible: number; // unit_price * considered_qty para itens varejo
    };
    const builds: ItemBuild[] = [];
    let lostRequired = false;

    for (const ci of considered) {
      const totalCart = cartQty.get(ci.product_id) ?? 0;
      const used = consumed.get(ci.product_id) ?? 0;
      const available = Math.max(0, totalCart - used);
      // Quantidade que CONTA para este combo: até required_qty, limitado ao disponível.
      const consideredQty = Math.min(ci.required_qty, available);

      if (consideredQty < ci.required_qty) {
        // Item obrigatório perdeu unidades para combo anterior. RPC só inclui considered_items
        // com cart_qty>0; esse caso é tratado como conflito → descartar combo.
        lostRequired = true;
        break;
      }

      const unitPrice = Number(ci.unit_price ?? 0);
      // line_value = valor pago de fato pela linha (já reflete pricing_source).
      const lineValue = unitPrice * consideredQty;
      builds.push({
        product_id: ci.product_id,
        required_qty: ci.required_qty,
        cart_qty: ci.cart_qty,
        unit_price: unitPrice,
        pricing_source: ci.pricing_source,
        considered_qty: consideredQty,
        line_eligible: lineValue,
      });
    }

    if (lostRequired) {
      blocked.push({
        bundle_id: row.bundle_id,
        bundle_name: row.bundle_name,
        status: "not_eligible",
        reason: "Itens já alocados a outro combo neste pedido.",
      });
      continue;
    }

    const cfg = kitConfigById.get(row.bundle_id);
    const useNewEngine = cfg ? !isLegacyKit(cfg) : false;

    // Soma do que o carrinho já cobraria pelo conteúdo de UM kit (com fonte por item).
    const baselineForKit = builds.reduce((s, b) => s + b.line_eligible, 0);
    if (baselineForKit <= 0) {
      blocked.push({
        bundle_id: row.bundle_id,
        bundle_name: row.bundle_name,
        status: "not_eligible",
        reason: "Sem subtotal elegível.",
      });
      continue;
    }

    // discount_type/value que vão no detalhamento (legado por compatibilidade).
    let appliedDiscountType: "fixed_amount" | "percentage" = (row.discount_type === "percentage"
      ? "percentage"
      : "fixed_amount");
    let appliedDiscountValue = Number(row.discount_value ?? 0);

    let bundleDiscount = 0;
    let allowAllItems = false; // se true, rateio inclui itens B2B

    if (useNewEngine && cfg) {
      const items = kitItemsByBundle.get(row.bundle_id) ?? [];
      const kitInstancesInCart = builds.length > 0
        ? Math.max(
            1,
            Math.min(
              ...builds.map((b) =>
                b.required_qty > 0 ? Math.floor(b.cart_qty / b.required_qty) : 1,
              ),
            ),
          )
        : 1;
      const result = computeKitPricing({
        kit: cfg,
        items,
        isB2bApproved,
        kitQuantity: kitInstancesInCart,
      });
      if (result.blocked || items.length === 0) {
        blocked.push({
          bundle_id: row.bundle_id,
          bundle_name: row.bundle_name,
          status: "not_eligible",
          reason:
            result.blocked === "below_min_qty"
              ? `Mínimo B2B: ${cfg.b2b_min_quantity} kit(s).`
              : result.blocked === "not_available_retail"
                ? "Kit não disponível no varejo."
                : result.blocked === "not_available_b2b"
                  ? "Kit não disponível para empresas."
                  : "Kit indisponível.",
        });
        continue;
      }
      // Quando source='b2b' o kit usa preço de empresa; rateio cobre todos os itens.
      // Quando source='retail' o rateio cobre todos (kit promo aplica sobre o conjunto).
      bundleDiscount = round2(Math.max(0, baselineForKit - result.appliedPrice));
      allowAllItems = true;
      // Reportar tipo/valor coerente com o método aplicado.
      if (cfg.pricing_method === "fixed_price" || (result.source === "b2b" && cfg.b2b_pricing_method === "fixed_price")) {
        appliedDiscountType = "fixed_amount";
        appliedDiscountValue = bundleDiscount;
      } else if (cfg.pricing_method === "percent_discount") {
        appliedDiscountType = "percentage";
        appliedDiscountValue = Number(cfg.discount_percent ?? 0);
      } else if (cfg.pricing_method === "fixed_discount") {
        appliedDiscountType = "fixed_amount";
        appliedDiscountValue = Number(cfg.discount_amount ?? 0);
      }
    } else {
      // Caminho legado — só rateia sobre itens varejo (compat com kits antigos).
      const eligibleSubtotalRetail = builds
        .filter((b) => b.pricing_source !== "b2b")
        .reduce((s, b) => s + b.line_eligible, 0);
      if (eligibleSubtotalRetail <= 0) {
        blocked.push({
          bundle_id: row.bundle_id,
          bundle_name: row.bundle_name,
          status: "not_eligible",
          reason: "Sem subtotal varejo elegível.",
        });
        continue;
      }
      if (row.discount_type === "fixed_amount") {
        bundleDiscount = Math.min(Math.max(0, Number(row.discount_value)), eligibleSubtotalRetail);
      } else if (row.discount_type === "percentage") {
        const pct = Math.min(Math.max(0, Number(row.discount_value)), 50);
        bundleDiscount = Math.min(
          round2(eligibleSubtotalRetail * (pct / 100)),
          eligibleSubtotalRetail,
        );
      }
      bundleDiscount = round2(bundleDiscount);
    }

    if (bundleDiscount <= 0) {
      blocked.push({
        bundle_id: row.bundle_id,
        bundle_name: row.bundle_name,
        status: "not_eligible",
        reason: "Desconto resultante zero após resolução.",
      });
      continue;
    }

    // Rateio proporcional. allowAllItems=true (motor novo) inclui itens B2B no rateio.
    const rebateItems: AppliedBundleItem[] = builds.map((b) => ({
      product_id: b.product_id,
      required_qty: b.required_qty,
      cart_qty: b.cart_qty,
      unit_price: b.unit_price,
      pricing_source: b.pricing_source,
      considered_qty: b.considered_qty,
      bundle_discount_amount: 0,
    }));

    const allocBaseTotal = allowAllItems
      ? builds.reduce((s, b) => s + b.line_eligible, 0)
      : builds.filter((b) => b.pricing_source !== "b2b").reduce((s, b) => s + b.line_eligible, 0);

    let allocated = 0;
    let lastEligibleIdx = -1;
    for (let i = 0; i < builds.length; i++) {
      const b = builds[i];
      const includes = allowAllItems ? b.line_eligible > 0 : b.line_eligible > 0 && b.pricing_source !== "b2b";
      if (!includes) continue;
      lastEligibleIdx = i;
      const share = round2((b.line_eligible / allocBaseTotal) * bundleDiscount);
      rebateItems[i].bundle_discount_amount = share;
      allocated += share;
    }
    if (lastEligibleIdx >= 0 && Math.abs(allocated - bundleDiscount) > 0.001) {
      const diff = round2(bundleDiscount - allocated);
      rebateItems[lastEligibleIdx].bundle_discount_amount = round2(
        rebateItems[lastEligibleIdx].bundle_discount_amount + diff,
      );
    }

    applied.push({
      bundle_id: row.bundle_id,
      bundle_name: row.bundle_name,
      bundle_slug: row.bundle_slug,
      discount_type: appliedDiscountType,
      discount_value: appliedDiscountValue,
      eligible_subtotal: round2(baselineForKit),
      discount_amount: bundleDiscount,
      allocation_method: "proportional_by_item_subtotal",
      items: rebateItems,
    });

    // Atualizar consumido + perItem
    for (const r of rebateItems) {
      consumed.set(r.product_id, (consumed.get(r.product_id) ?? 0) + r.considered_qty);
      const prev = perItem.get(r.product_id);
      const itemEligible = r.bundle_discount_amount > 0 || r.pricing_source !== "b2b";
      if (!prev) {
        perItem.set(r.product_id, {
          bundle_id: row.bundle_id,
          bundle_name: row.bundle_name,
          bundle_discount_amount: r.bundle_discount_amount,
          bundle_discount_eligible: itemEligible,
          block_reason: itemEligible ? null : "b2b_price_applied",
        });
      } else {
        const newAmount = round2(prev.bundle_discount_amount + r.bundle_discount_amount);
        if (r.bundle_discount_amount > prev.bundle_discount_amount) {
          perItem.set(r.product_id, {
            bundle_id: row.bundle_id,
            bundle_name: row.bundle_name,
            bundle_discount_amount: newAmount,
            bundle_discount_eligible: true,
            block_reason: null,
          });
        } else {
          prev.bundle_discount_amount = newAmount;
        }
      }
    }
  }

  const bundleDiscountTotal = round2(applied.reduce((s, a) => s + a.discount_amount, 0));

  return {
    bundle_discount_total: bundleDiscountTotal,
    details: {
      version: 1,
      has_coupon: input.hasCoupon,
      allow_with_coupon: allowWithCoupon,
      applied,
      blocked,
    },
    perItem,
  };
}
