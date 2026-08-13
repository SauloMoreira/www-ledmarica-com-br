import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ============================================================
// Helpers
// ============================================================
function getSiteUrl(): string {
  const fromEnv = process.env.SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  // Fallback: derive from request
  const host = getRequestHost();
  const proto = getRequestHeader("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

// Para back_urls do Mercado Pago: o domínio id-preview--*.lovable.app
// bloqueia requests externos com referer (retorna "Forbidden" no redirect
// vindo do MP). Convertemos para a URL estável project--{id}-dev.lovable.app
// que aceita esses redirects.
function getPublicReturnUrl(siteUrl: string): string {
  try {
    const u = new URL(siteUrl);
    const host = u.hostname;
    // id-preview--<projectId>.lovable.app  -> project--<projectId>-dev.lovable.app
    const m = host.match(/^id-preview--([0-9a-f-]+)\.lovable\.app$/i);
    if (m) {
      return `https://project--${m[1]}-dev.lovable.app`;
    }
    return siteUrl;
  } catch {
    return siteUrl;
  }
}

function isSandboxToken(token: string): boolean {
  // No Brasil, credenciais de TESTE também usam o prefixo APP_USR-.
  // Por isso não dá para distinguir produção/teste apenas pelo prefixo.
  return token.startsWith("TEST-");
}

function shouldUseSandboxCheckout(siteUrl: string, accessToken: string): boolean {
  const host = new URL(siteUrl).hostname;
  return (
    isSandboxToken(accessToken) ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".lovableproject.com") ||
    host.startsWith("id-preview--") ||
    host.endsWith("-dev.lovable.app")
  );
}

// ============================================================
// Criar preference do Mercado Pago para um pedido existente
// ============================================================
export const createMercadoPagoPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      console.error("[MP] MERCADOPAGO_ACCESS_TOKEN não configurado");
      return {
        ok: false as const,
        error: "Pagamento indisponível no momento. Token não configurado.",
      };
    }

    // 1) Carregar pedido + itens (RLS garante posse)
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(
        "id, user_id, order_number, status, payment_status, subtotal, discount, bundle_discount_total, shipping_cost, total, address_snapshot, mp_preference_id, checkout_url, intended_payment_method, order_items(id, product_id, product_name, qty, unit_price, total_price)",
      )
      .eq("id", data.orderId)
      .single();


    if (orderErr || !order) {
      console.error("[MP] pedido não encontrado", orderErr);
      return { ok: false as const, error: "Pedido não encontrado" };
    }
    if (order.user_id !== userId) {
      return { ok: false as const, error: "Sem permissão" };
    }
    if (order.payment_status === "approved" || order.payment_status === "paid") {
      return { ok: false as const, error: "Pedido já está pago" };
    }

    // Idempotência: se já existe preference válida para este pedido, reaproveita.
    if (order.mp_preference_id && order.checkout_url) {
      console.log("[MP] reaproveitando preference existente", {
        orderId: order.id,
        preferenceId: order.mp_preference_id,
      });
      return {
        ok: true as const,
        checkoutUrl: order.checkout_url,
        preferenceId: order.mp_preference_id,
      };
    }

    const items = order.order_items ?? [];
    if (!items.length) {
      return { ok: false as const, error: "Pedido sem itens" };
    }

    // 2) Validar valores
    const itemsSubtotal = items.reduce((s, i) => s + Number(i.unit_price) * Number(i.qty), 0);
    if (Math.abs(itemsSubtotal - Number(order.subtotal)) > 0.05) {
      console.error("[MP] subtotal divergente", { itemsSubtotal, orderSubtotal: order.subtotal });
      return { ok: false as const, error: "Inconsistência no valor do pedido" };
    }
    const expectedTotal = Math.max(
      0,
      Number(order.subtotal) -
        Number(order.discount ?? 0) -
        Number(order.bundle_discount_total ?? 0) +
        Number(order.shipping_cost ?? 0),
    );
    if (Math.abs(expectedTotal - Number(order.total)) > 0.05) {
      console.error("[MP] total divergente", { expectedTotal, total: order.total });
      return { ok: false as const, error: "Inconsistência no total do pedido" };
    }

    // 3) Dados do pagador
    const externalReference = order.id;
    const siteUrl = getSiteUrl();
    const sandbox = shouldUseSandboxCheckout(siteUrl, accessToken);
    const payer = sandbox
      ? {
          email: "test_payer_7835120424@testuser.com",
          first_name: "APRO",
          last_name: "Teste",
        }
      : undefined;

    // Build items para MP. Adiciona um item virtual de frete/desconto se necessário.
    const mpItems: Array<Record<string, unknown>> = items.map((i) => ({
      id: i.product_id ?? i.id,
      title: i.product_name.slice(0, 250),
      quantity: Number(i.qty),
      currency_id: "BRL",
      unit_price: Number(Number(i.unit_price).toFixed(2)),
    }));

    if (Number(order.shipping_cost ?? 0) > 0) {
      mpItems.push({
        id: "shipping",
        title: "Frete",
        quantity: 1,
        currency_id: "BRL",
        unit_price: Number(Number(order.shipping_cost).toFixed(2)),
      });
    }
    if (Number(order.discount ?? 0) > 0) {
      mpItems.push({
        id: "discount",
        title: "Desconto (cupom)",
        quantity: 1,
        currency_id: "BRL",
        unit_price: -Number(Number(order.discount).toFixed(2)),
      });
    }
    if (Number(order.bundle_discount_total ?? 0) > 0) {
      mpItems.push({
        id: "bundle_discount",
        title: "Desconto de combo",
        quantity: 1,
        currency_id: "BRL",
        unit_price: -Number(Number(order.bundle_discount_total).toFixed(2)),
      });
    }

    const orderIdParam = encodeURIComponent(order.id);
    const returnBaseUrl = getPublicReturnUrl(siteUrl);
    const preferencePayload = {
      items: mpItems,
      ...(payer ? { payer } : {}),
      external_reference: externalReference,
      back_urls: {
        success: `${returnBaseUrl}/checkout/success?order_id=${orderIdParam}`,
        failure: `${returnBaseUrl}/checkout/failure?order_id=${orderIdParam}`,
        pending: `${returnBaseUrl}/checkout/pending?order_id=${orderIdParam}`,
      },
      auto_return: "approved",
      notification_url: `${siteUrl}/api/public/mercadopago/webhook`,
      statement_descriptor: "LED MARICA",
      metadata: { order_id: order.id, order_number: order.order_number },
      // Quando o cliente escolheu Pix no checkout (e por isso pode ter recebido
      // o desconto automático), restringimos a preference a Pix/saldo MP —
      // evita ganhar o desconto e pagar no cartão.
      ...(order.intended_payment_method === "pix"
        ? {
            payment_methods: {
              excluded_payment_types: [
                { id: "credit_card" },
                { id: "debit_card" },
                { id: "prepaid_card" },
                { id: "ticket" },
                { id: "atm" },
              ],
              installments: 1,
            },
          }
        : {}),
    };


    // 4) Criar preference
    console.log("[MP] criando preference", {
      orderId: order.id,
      sandbox,
      tokenPrefix: accessToken.slice(0, 8),
      siteUrl,
      itemsCount: mpItems.length,
      total: order.total,
      hasPayer: !!payer,
    });

    let mpJson: {
      id?: string;
      init_point?: string;
      sandbox_init_point?: string;
      message?: string;
      error?: string;
    } = {};
    let mpRawText = "";
    let mpStatus = 0;
    try {
      const resp = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          // Idempotency-Key garante que cliques duplicados não criem 2 preferências.
          // Usamos o id do pedido — único e estável.
          "X-Idempotency-Key": `order-${order.id}`,
        },
        body: JSON.stringify(preferencePayload),
      });
      mpStatus = resp.status;
      mpRawText = await resp.text();
      try {
        mpJson = JSON.parse(mpRawText);
      } catch {
        mpJson = { message: mpRawText };
      }

      if (!resp.ok || !mpJson.id) {
        console.error("[MP] erro ao criar preference", {
          status: resp.status,
          body: mpRawText,
          payloadSent: preferencePayload,
        });
        const errMsg =
          mpJson.message ?? mpJson.error ?? `MP HTTP ${resp.status}: ${mpRawText.slice(0, 200)}`;
        await supabaseAdmin.from("orders").update({ payment_error: errMsg }).eq("id", order.id);
        return { ok: false as const, error: errMsg };
      }
      console.log("[MP] preference criada com sucesso", { id: mpJson.id });
    } catch (e) {
      console.error("[MP] exception createPreference", e);
      return { ok: false as const, error: "Erro de comunicação com Mercado Pago" };
    }

    const checkoutUrl =
      (sandbox ? mpJson.sandbox_init_point : mpJson.init_point) ??
      mpJson.init_point ??
      mpJson.sandbox_init_point;

    // 5) Persistir no pedido (via admin para garantir gravação independente da RLS de update)
    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update({
        mp_preference_id: mpJson.id,
        checkout_url: checkoutUrl ?? null,
        external_reference: externalReference,
        payment_provider: "mercadopago",
        payment_status: "preference_created",
        payment_error: null,
      })
      .eq("id", order.id);
    if (updErr) console.error("[MP] erro ao salvar preference no pedido", updErr);

    return {
      ok: true as const,
      checkoutUrl: checkoutUrl ?? "",
      preferenceId: mpJson.id,
    };
  });

// ============================================================
// Consultar status do pedido (usado nas páginas de retorno)
// ============================================================
export const getOrderPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: order, error } = await supabase
      .from("orders")
      .select(
        "id, order_number, status, payment_status, total, paid_at, checkout_url, payment_error",
      )
      .eq("id", data.orderId)
      .single();
    if (error || !order) return { ok: false as const, error: "Pedido não encontrado" };
    return { ok: true as const, order };
  });
