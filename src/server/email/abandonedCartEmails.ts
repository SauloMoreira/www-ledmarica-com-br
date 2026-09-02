// Recuperação de carrinho abandonado — e-mail promocional (com opt-out).
// Server-only. NUNCA lança: falha de e-mail não pode quebrar nenhum fluxo.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTransactionalEmail } from "./transport";
import { buildOrderEmailTemplate } from "./templates";
import { getUnsubscribeUrl, isUnsubscribed, normalizeEmail } from "./unsubscribe";

const TYPE = "abandoned_cart_recovery";

function siteUrl(): string {
  return (process.env.SITE_URL ?? "").replace(/\/$/, "") || "https://www.ledmarica.com.br";
}
function storeName(): string {
  return process.env.STORE_NAME ?? "Led Maricá";
}

interface SnapshotItem {
  product_name?: string | null;
  qty?: number | string | null;
  unit_price?: number | string | null;
  subtotal?: number | string | null;
}

export type AbandonedCartEmailSkip =
  | "already_sent"
  | "no_email"
  | "cart_not_found"
  | "not_eligible"
  | "unsubscribed"
  | "template_disabled"
  | "no_items";

export async function sendAbandonedCartEmail(opts: {
  cartId: string;
  force?: boolean;
}): Promise<{ ok: boolean; skipped?: AbandonedCartEmailSkip; error?: string }> {
  try {
    const { data: cart, error: cartErr } = await supabaseAdmin
      .from("abandoned_carts")
      .select(
        "id, status, customer_email, customer_name, cart_snapshot, subtotal_amount, recovery_attempts",
      )
      .eq("id", opts.cartId)
      .maybeSingle();

    if (cartErr || !cart) return { ok: false, skipped: "cart_not_found" };
    if (!opts.force && cart.status !== "novo") return { ok: true, skipped: "not_eligible" };

    const email = normalizeEmail(cart.customer_email ?? "");
    if (!email) return { ok: false, skipped: "no_email" };

    // Idempotência por carrinho + tipo
    if (!opts.force) {
      const { data: existing } = await supabaseAdmin
        .from("email_events")
        .select("id")
        .eq("abandoned_cart_id", cart.id)
        .eq("type", TYPE)
        .eq("status", "sent")
        .maybeSingle();
      if (existing) return { ok: true, skipped: "already_sent" };
    }

    // Opt-out
    if (await isUnsubscribed(email)) return { ok: true, skipped: "unsubscribed" };

    // Template editável
    const { data: tplRow } = await supabaseAdmin
      .from("email_templates")
      .select(
        "subject, preheader, headline, intro_html, cta_label, cta_url, secondary_cta_label, secondary_cta_url, is_active, auto_send",
      )
      .eq("type", TYPE)
      .maybeSingle();

    if (tplRow && !opts.force && (tplRow.is_active === false || tplRow.auto_send === false)) {
      return { ok: true, skipped: "template_disabled" };
    }

    const raw = Array.isArray(cart.cart_snapshot) ? (cart.cart_snapshot as SnapshotItem[]) : [];
    const items = raw
      .filter((i) => i && typeof i === "object" && i.product_name)
      .map((i) => {
        const qty = Number(i.qty ?? 1) || 1;
        const unit = Number(i.unit_price ?? 0) || 0;
        return {
          name: String(i.product_name),
          qty,
          unitPrice: unit,
          totalPrice: Number(i.subtotal ?? unit * qty) || unit * qty,
        };
      });

    if (items.length === 0) return { ok: true, skipped: "no_items" };

    const subtotal = Number(cart.subtotal_amount ?? 0);
    const unsubscribeUrl = await getUnsubscribeUrl(email, TYPE);
    const cartUrl = `${siteUrl()}/carrinho`;

    const { subject, html, text } = buildOrderEmailTemplate({
      storeName: storeName(),
      customerName: cart.customer_name,
      orderNumber: "",
      items,
      subtotal,
      shippingTotal: 0,
      discountTotal: 0,
      total: subtotal,
      orderUrl: cartUrl,
      supportEmail: process.env.RESEND_REPLY_TO_EMAIL ?? null,
      messageType: TYPE,
      unsubscribeUrl,
      override: tplRow ?? null,
      variables: {
        cliente_nome: cart.customer_name ?? "",
        cliente_email: email,
        site_url: siteUrl(),
      },
    });

    const { data: eventRow } = await supabaseAdmin
      .from("email_events")
      .insert({
        abandoned_cart_id: cart.id,
        customer_email: email,
        type: TYPE,
        subject,
        provider: (process.env.EMAIL_PROVIDER ?? "resend").toLowerCase(),
        status: "pending",
      })
      .select("id")
      .single();

    const result = await sendTransactionalEmail({
      to: email,
      subject,
      html,
      text,
      metadata: { type: TYPE, cartId: cart.id },
    });

    if (eventRow?.id) {
      await supabaseAdmin
        .from("email_events")
        .update(
          result.ok
            ? {
                status: result.skipped ? "skipped" : "sent",
                provider: result.provider,
                provider_message_id: result.messageId ?? null,
                sent_at: new Date().toISOString(),
              }
            : {
                status: "failed",
                provider: result.provider,
                error_message: result.error ?? "unknown",
              },
        )
        .eq("id", eventRow.id);
    }

    if (result.ok) {
      await supabaseAdmin
        .from("abandoned_carts")
        .update({
          status: "contato_enviado",
          recovery_attempts: Number(cart.recovery_attempts ?? 0) + 1,
          last_contacted_at: new Date().toISOString(),
        })
        .eq("id", cart.id);
    }

    return { ok: result.ok, error: result.error };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[email] sendAbandonedCartEmail exception", e);
    return { ok: false, error: msg };
  }
}

/**
 * Varre carrinhos elegíveis (status novo, com e-mail, abandonados entre 1h e 48h)
 * e dispara um único e-mail por carrinho.
 */
export async function runAbandonedCartRecovery(): Promise<{
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
}> {
  const now = Date.now();
  const from = new Date(now - 48 * 60 * 60 * 1000).toISOString();
  const to = new Date(now - 60 * 60 * 1000).toISOString();

  const { data: carts, error } = await supabaseAdmin
    .from("abandoned_carts")
    .select("id")
    .eq("status", "novo")
    .eq("recovery_attempts", 0)
    .not("customer_email", "is", null)
    .gte("abandoned_at", from)
    .lte("abandoned_at", to)
    .order("abandoned_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[cron] abandoned cart query error", error);
    return { scanned: 0, sent: 0, skipped: 0, failed: 0 };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const c of carts ?? []) {
    const r = await sendAbandonedCartEmail({ cartId: c.id });
    if (r.skipped) skipped += 1;
    else if (r.ok) sent += 1;
    else failed += 1;
  }
  return { scanned: (carts ?? []).length, sent, skipped, failed };
}
