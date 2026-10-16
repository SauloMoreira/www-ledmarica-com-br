// =============================================================================
// Conversões de compra pelo servidor (Meta API de Conversões + GA4 Measurement
// Protocol), disparadas pelo webhook do Mercado Pago quando o pagamento é
// aprovado.
//
// Por quê: o pagamento acontece fora do site (Mercado Pago). O evento de compra
// do navegador só dispara se o cliente voltar à página do pedido; quem não volta
// não é contado no Meta nem no Google. Aqui a compra é enviada pelo servidor,
// com os MESMOS identificadores do navegador para deduplicação:
//   - Meta: event_id = `purchase_<orderId>` (igual a purchaseEventId()).
//   - GA4:  transaction_id = String(order_number) (igual ao navegador).
//
// LGPD: respeita o consentimento registrado no checkout (orders.ad_attribution):
//   - Meta só recebe com consentimento de Marketing.
//   - GA4 só recebe com consentimento de Análise; ad_user_data /
//     ad_personalization seguem o consentimento de Marketing.
//
// Segredos (Lovable Cloud → Secrets). Sem eles, o módulo não envia nada:
//   META_CAPI_ACCESS_TOKEN   token da API de Conversões (Gerenciador de Eventos)
//   META_CAPI_TEST_EVENT_CODE (opcional) código de "Testar eventos"
//   GA4_API_SECRET           segredo do Measurement Protocol (Admin → Fluxos)
//
// Nunca lança erro: o webhook do pagamento não pode falhar por causa disto.
// Idempotente: registra o resultado em orders.server_conversions e não reenvia
// o que já foi enviado.
// =============================================================================

import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v26.0";
const FETCH_TIMEOUT_MS = 8000;

type Consent = { analytics?: boolean; marketing?: boolean };

export type AdAttribution = {
  consent?: Consent;
  fbp?: string | null;
  fbc?: string | null;
  ga_client_id?: string | null;
  ga_session_id?: string | null;
  client_user_agent?: string | null;
  client_ip_address?: string | null;
  event_source_url?: string | null;
  captured_at?: string | null;
};

type ChannelResult = {
  status: "sent" | "skipped" | "failed";
  reason?: string;
  at: string;
  http_status?: number;
};

type ServerConversions = { meta?: ChannelResult; ga4?: ChannelResult };

type OrderRow = {
  id: string;
  order_number: number | null;
  user_id: string | null;
  total: number | null;
  paid_at: string | null;
  address_snapshot: Record<string, unknown> | null;
  ad_attribution: AdAttribution | null;
  server_conversions: ServerConversions | null;
  order_items: Array<{
    product_id: string | null;
    product_name: string | null;
    qty: number | null;
    unit_price: number | null;
  }> | null;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normEmail(v: unknown): string | undefined {
  const e = String(v ?? "")
    .trim()
    .toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : undefined;
}

/** Telefone BR só com dígitos e DDI 55 (formato exigido pela Meta). */
function normPhoneDigits(v: unknown): string | undefined {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return undefined;
}

/** Texto minúsculo, sem acento e sem espaço (cidade/UF para a Meta). */
function normPlain(v: unknown): string | undefined {
  const s = String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
  return s || undefined;
}

async function postJson(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await r.text().catch(() => "");
    return { ok: r.ok, status: r.status, text: text.slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

async function getIntegrationId(provider: "meta_pixel" | "ga4"): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("marketing_integrations")
    .select("account_id, enabled")
    .eq("provider", provider)
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();
  const id = (data as { account_id?: string | null } | null)?.account_id?.trim();
  return id || null;
}

function now(): string {
  return new Date().toISOString();
}

async function sendMeta(
  order: OrderRow,
  profile: { email?: string | null; phone?: string | null; name?: string | null } | null,
): Promise<ChannelResult> {
  const attr = order.ad_attribution ?? {};
  if (!attr.consent?.marketing)
    return { status: "skipped", reason: "no_marketing_consent", at: now() };
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) return { status: "skipped", reason: "missing_META_CAPI_ACCESS_TOKEN", at: now() };
  const pixelId = await getIntegrationId("meta_pixel");
  if (!pixelId) return { status: "skipped", reason: "meta_pixel_not_configured", at: now() };

  const addr = order.address_snapshot ?? {};
  const email = normEmail(profile?.email);
  const phone = normPhoneDigits(profile?.phone);
  const firstName = normPlain(
    String(profile?.name ?? "")
      .trim()
      .split(/\s+/)[0],
  );
  const city = normPlain(addr["city"]);
  const state = normPlain(addr["state"]);
  const zip = String(addr["zipCode"] ?? "").replace(/\D/g, "") || undefined;

  const userData: Record<string, unknown> = {
    external_id: order.user_id ? [sha256(order.user_id)] : undefined,
    em: email ? [sha256(email)] : undefined,
    ph: phone ? [sha256(phone)] : undefined,
    fn: firstName ? [sha256(firstName)] : undefined,
    ct: city ? [sha256(city)] : undefined,
    st: state ? [sha256(state)] : undefined,
    zp: zip ? [sha256(zip)] : undefined,
    country: [sha256("br")],
    fbp: attr.fbp || undefined,
    fbc: attr.fbc || undefined,
    client_user_agent: attr.client_user_agent || undefined,
    client_ip_address: attr.client_ip_address || undefined,
  };

  const items = order.order_items ?? [];
  const value = Number(order.total ?? 0);
  const eventTime = Math.floor(new Date(order.paid_at ?? Date.now()).getTime() / 1000);

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: "Purchase",
        event_time: eventTime,
        event_id: `purchase_${order.id}`,
        action_source: "website",
        event_source_url: attr.event_source_url || "https://www.ledmarica.com.br/checkout",
        user_data: userData,
        custom_data: {
          currency: "BRL",
          value,
          order_id: String(order.order_number ?? order.id),
          content_type: "product",
          content_ids: items.map((i) => i.product_id).filter(Boolean),
          contents: items.map((i) => ({
            id: i.product_id,
            quantity: Number(i.qty ?? 1),
            item_price: Number(i.unit_price ?? 0),
          })),
          num_items: items.reduce((s, i) => s + Number(i.qty ?? 0), 0),
        },
      },
    ],
  };
  const testCode = process.env.META_CAPI_TEST_EVENT_CODE;
  if (testCode) payload.test_event_code = testCode;

  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`;
  try {
    const r = await postJson(url, payload);
    if (r.ok) return { status: "sent", at: now(), http_status: r.status };
    console.error("[adConversions] Meta CAPI recusou", r.status, r.text);
    return { status: "failed", reason: `http_${r.status}`, at: now(), http_status: r.status };
  } catch (e) {
    console.error("[adConversions] Meta CAPI exceção", e);
    return { status: "failed", reason: "exception", at: now() };
  }
}

async function sendGa4(order: OrderRow): Promise<ChannelResult> {
  const attr = order.ad_attribution ?? {};
  if (!attr.consent?.analytics)
    return { status: "skipped", reason: "no_analytics_consent", at: now() };
  if (!attr.ga_client_id) return { status: "skipped", reason: "no_ga_client_id", at: now() };
  const apiSecret = process.env.GA4_API_SECRET;
  if (!apiSecret) return { status: "skipped", reason: "missing_GA4_API_SECRET", at: now() };
  const measurementId = await getIntegrationId("ga4");
  if (!measurementId) return { status: "skipped", reason: "ga4_not_configured", at: now() };

  const items = order.order_items ?? [];
  const marketing = attr.consent?.marketing ? "GRANTED" : "DENIED";
  const params: Record<string, unknown> = {
    transaction_id: String(order.order_number ?? order.id),
    value: Number(order.total ?? 0),
    currency: "BRL",
    items: items.map((i) => ({
      item_id: i.product_id,
      item_name: i.product_name,
      quantity: Number(i.qty ?? 1),
      price: Number(i.unit_price ?? 0),
    })),
    engagement_time_msec: 1,
  };
  const sid = Number(attr.ga_session_id);
  if (Number.isFinite(sid) && sid > 0) params.session_id = sid;

  const body = {
    client_id: attr.ga_client_id,
    user_id: order.user_id ?? undefined,
    timestamp_micros: new Date(order.paid_at ?? Date.now()).getTime() * 1000,
    consent: { ad_user_data: marketing, ad_personalization: marketing },
    events: [{ name: "purchase", params }],
  };
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  try {
    const r = await postJson(url, body);
    // O endpoint /mp/collect responde 2xx mesmo para eventos malformados;
    // validar o formato com /debug/mp/collect ao testar.
    if (r.ok) return { status: "sent", at: now(), http_status: r.status };
    console.error("[adConversions] GA4 MP recusou", r.status, r.text);
    return { status: "failed", reason: `http_${r.status}`, at: now(), http_status: r.status };
  } catch (e) {
    console.error("[adConversions] GA4 MP exceção", e);
    return { status: "failed", reason: "exception", at: now() };
  }
}

/**
 * Envia a compra aprovada ao Meta e ao GA4 pelo servidor. Chamar apenas na
 * transição para "approved" (o webhook já garante isso). Nunca lança.
 */
export async function sendServerPurchaseConversions(
  orderId: string,
): Promise<ServerConversions | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, user_id, total, paid_at, address_snapshot, ad_attribution, server_conversions, order_items(product_id, product_name, qty, unit_price)",
      )
      .eq("id", orderId)
      .single();
    if (error || !data) {
      console.error("[adConversions] pedido não encontrado", orderId, error);
      return null;
    }
    const order = data as unknown as OrderRow;
    const previous = order.server_conversions ?? {};

    let profile: { email?: string | null; phone?: string | null; name?: string | null } | null =
      null;
    if (order.user_id) {
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("email, phone, name")
        .eq("id", order.user_id)
        .maybeSingle();
      profile = (p as typeof profile) ?? null;
    }

    const result: ServerConversions = {
      meta: previous.meta?.status === "sent" ? previous.meta : await sendMeta(order, profile),
      ga4: previous.ga4?.status === "sent" ? previous.ga4 : await sendGa4(order),
    };

    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update({ server_conversions: result } as never)
      .eq("id", orderId);
    if (updErr) console.error("[adConversions] falha ao registrar resultado", updErr);

    console.log("[adConversions] resultado", {
      orderId,
      meta: result.meta?.status,
      metaReason: result.meta?.reason,
      ga4: result.ga4?.status,
      ga4Reason: result.ga4?.reason,
    });
    return result;
  } catch (e) {
    console.error("[adConversions] exceção geral", e);
    return null;
  }
}
