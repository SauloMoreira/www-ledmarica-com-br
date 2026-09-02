// Server functions para gerenciar os modelos de e-mail transacional.
// O HTML/layout permanece no código (templates.ts). Aqui o admin só
// edita textos editoriais (assunto, headline, intro, CTA) e flags.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin, requireAdminMfaSoft } from "@/integrations/supabase/admin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildOrderEmailTemplate, type EmailMessageType } from "./email/templates";
import {
  AVAILABLE_VARIABLES,
  variablesForType,
  validateTemplate,
  buildVariableContext,
} from "./email/templateVars";
import { sendTransactionalEmail } from "./email/transport";
import { logAdminAction } from "./security/auditLog";

const ALL_TYPES = [
  "order_created",
  "payment_approved",
  "payment_pending",
  "payment_failed",
  "order_processing",
  "order_shipped",
  "order_delivered",
  "order_cancelled",
  "order_refunded",
  "payment_reminder_2h",
  "payment_reminder_24h",
  "abandoned_cart_recovery",

] as const satisfies readonly EmailMessageType[];

const TypeSchema = z.enum(ALL_TYPES);

function siteUrl(): string {
  return (process.env.SITE_URL ?? "").replace(/\/$/, "") || "https://www.ledmarica.com.br";
}
function storeName(): string {
  return process.env.STORE_NAME ?? "Led Maricá";
}

// ============================================================
// Lista
// ============================================================
export const listEmailTemplates = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("email_templates")
      .select("*")
      .order("display_name", { ascending: true });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, templates: data ?? [] };
  });

// ============================================================
// Get (com defaults do código + variáveis aplicáveis)
// ============================================================
export const getEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ type: TypeSchema }).parse(input))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("email_templates")
      .select("*")
      .eq("type", data.type)
      .maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    if (!row) return { ok: false as const, error: "Template não encontrado" };

    // Calcula defaults via build com pedido fictício mínimo só para extrair textos
    const fakeUrl = `${siteUrl()}/pedido/exemplo/confirmacao`;
    const built = buildOrderEmailTemplate({
      storeName: storeName(),
      orderNumber: "0000",
      items: [{ name: "Exemplo", qty: 1, unitPrice: 0, totalPrice: 0 }],
      subtotal: 0,
      shippingTotal: 0,
      discountTotal: 0,
      total: 0,
      orderUrl: fakeUrl,
      messageType: data.type,
      override: null,
      variables: null,
    });

    return {
      ok: true as const,
      template: row,
      defaults: {
        subject: built.subject,
        // Textos individuais ficam em getContent — para o editor, mostramos
        // apenas o assunto como referência; o resto fica como placeholder.
      },
      variables: variablesForType(data.type),
      allVariables: AVAILABLE_VARIABLES,
    };
  });

// ============================================================
// Update
// ============================================================
const UpdateSchema = z.object({
  type: TypeSchema,
  fields: z.object({
    display_name: z.string().min(1).max(120).optional(),
    subject: z.string().max(300).nullable().optional(),
    preheader: z.string().max(300).nullable().optional(),
    headline: z.string().max(300).nullable().optional(),
    intro_html: z.string().max(5000).nullable().optional(),
    cta_label: z.string().max(120).nullable().optional(),
    cta_url: z.string().max(500).nullable().optional(),
    secondary_cta_label: z.string().max(120).nullable().optional(),
    secondary_cta_url: z.string().max(500).nullable().optional(),
    is_active: z.boolean().optional(),
    auto_send: z.boolean().optional(),
    allow_manual_resend: z.boolean().optional(),
  }),
  confirmUnknownVars: z.boolean().optional(),
});

export const updateEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireAdminMfaSoft])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const adminUserId = (context as { adminUserId: string }).adminUserId;
    const adminEmail = (context as { adminEmail: string | null }).adminEmail;

    // S5 — bloqueia URLs perigosas (javascript:, data:, etc.) em CTAs
    const { isSafePublicUrl } = await import("@/lib/uploadGuards");
    if (!isSafePublicUrl(data.fields.cta_url ?? null)) {
      throw new Error("URL do CTA inválida. Use apenas http(s) ou caminho interno.");
    }
    if (!isSafePublicUrl(data.fields.secondary_cta_url ?? null)) {
      throw new Error("URL do CTA secundário inválida.");
    }

    const validation = validateTemplate({
      subject: data.fields.subject ?? null,
      preheader: data.fields.preheader ?? null,
      headline: data.fields.headline ?? null,
      intro_html: data.fields.intro_html ?? null,
      cta_label: data.fields.cta_label ?? null,
      cta_url: data.fields.cta_url ?? null,
      secondary_cta_label: data.fields.secondary_cta_label ?? null,
      secondary_cta_url: data.fields.secondary_cta_url ?? null,
    });
    if (validation.unknownVars.length > 0 && data.confirmUnknownVars !== true) {
      return { ok: false as const, unknownVars: validation.unknownVars };
    }

    const { data: before } = await supabaseAdmin
      .from("email_templates")
      .select("*")
      .eq("type", data.type)
      .maybeSingle();

    // Normaliza strings vazias → null (volta ao fallback do código)
    const patch: Record<string, unknown> = { ...data.fields };
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      if (typeof v === "string" && v.trim() === "") patch[k] = null;
    }

    const { error } = await supabaseAdmin
      .from("email_templates")
      .update(patch as never)
      .eq("type", data.type);
    if (error) return { ok: false as const, error: error.message };

    const { data: after } = await supabaseAdmin
      .from("email_templates")
      .select("*")
      .eq("type", data.type)
      .maybeSingle();

    await logAdminAction({
      adminId: adminUserId,
      adminEmail,
      action: "update",
      resourceType: "email_template",
      resourceId: data.type,
      description: `Modelo de e-mail "${data.type}" atualizado`,
      before,
      after,
    });

    return { ok: true as const };
  });

// ============================================================
// Carrega pedido "real" para preview (descarta #1–#13 — testes antigos)
// ============================================================
async function loadOrderForPreview(orderIdOrNull: string | null) {
  let q = supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, user_id, status, payment_status, total, subtotal, discount, shipping_cost, tracking_code, address_snapshot, public_access_token, delivery_method, pickup_store_name, pickup_store_address, pickup_store_phone, pickup_instructions, local_delivery_district, local_delivery_eta, shipping_carrier, bundle_discount_total, cancelled_reason, created_at, order_items(product_name, qty, unit_price, total_price)",
    );
  if (orderIdOrNull) {
    q = q.eq("id", orderIdOrNull);
  } else {
    q = q.gte("order_number", 14).order("created_at", { ascending: false }).limit(1);
  }
  const { data, error } = orderIdOrNull ? await q.maybeSingle() : await q;
  if (error) throw new Error(error.message);
  const order = Array.isArray(data) ? (data[0] ?? null) : data;
  if (!order) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, name")
    .eq("id", order.user_id)
    .maybeSingle();
  return { order, profile: profile ?? null };
}

// ============================================================
// Preview
// ============================================================
export const previewEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        type: TypeSchema,
        orderId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: tplRow } = await supabaseAdmin
      .from("email_templates")
      .select("*")
      .eq("type", data.type)
      .maybeSingle();

    const loaded = await loadOrderForPreview(data.orderId ?? null);
    if (!loaded) return { ok: false as const, error: "Nenhum pedido real disponível para preview" };
    const { order, profile } = loaded;

    const items = (order.order_items ?? []).map((i) => ({
      name: i.product_name,
      qty: Number(i.qty),
      unitPrice: Number(i.unit_price),
      totalPrice: Number(i.total_price),
    }));
    const tokenQuery = order.public_access_token
      ? `?token=${encodeURIComponent(order.public_access_token)}`
      : "";
    const orderUrl = `${siteUrl()}/pedido/${order.id}/confirmacao${tokenQuery}`;

    const variables = buildVariableContext(
      order as any,
      profile,
      items.map((i) => ({ product_name: i.name, qty: i.qty })),
      { siteUrl: siteUrl() },
    );

    const orderAny = order as any;
    const deliveryMethod = (orderAny.delivery_method ?? "delivery") as
      | "delivery"
      | "pickup"
      | "local_delivery";

    const built = buildOrderEmailTemplate({
      storeName: storeName(),
      customerName: profile?.name ?? null,
      orderNumber: order.order_number,
      items,
      subtotal: Number(order.subtotal ?? 0),
      shippingTotal: Number(order.shipping_cost ?? 0),
      discountTotal: Number(order.discount ?? 0),
      bundleDiscountTotal: Number((order as any).bundle_discount_total ?? 0),
      total: Number(order.total ?? 0),
      orderUrl,
      trackingCode: order.tracking_code ?? null,
      cancelledReason: (order as any).cancelled_reason ?? null,
      messageType: data.type,
      deliveryMethod,
      pickup:
        deliveryMethod === "pickup"
          ? {
              storeName: orderAny.pickup_store_name ?? null,
              storeAddress: orderAny.pickup_store_address ?? null,
              storePhone: orderAny.pickup_store_phone ?? null,
              instructions: orderAny.pickup_instructions ?? null,
              readyEta: null,
            }
          : null,
      localDelivery:
        deliveryMethod === "local_delivery"
          ? {
              district: orderAny.local_delivery_district ?? null,
              eta: orderAny.local_delivery_eta ?? null,
              service: null,
            }
          : null,
      override: tplRow ?? null,
      variables,
    });

    return {
      ok: true as const,
      subject: built.subject,
      html: built.html,
      text: built.text,
      orderNumber: order.order_number,
      orderId: order.id,
    };
  });

// ============================================================
// Enviar teste
// ============================================================
export const sendTestEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireAdminMfaSoft])
  .inputValidator((input: unknown) =>
    z
      .object({
        type: TypeSchema,
        orderId: z.string().uuid().nullable().optional(),
        recipientEmail: z.string().email(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminUserId = (context as { adminUserId: string }).adminUserId;
    const adminEmail = (context as { adminEmail: string | null }).adminEmail;

    const preview = await (async () => {
      // reaproveita a montagem do preview
      const { data: tplRow } = await supabaseAdmin
        .from("email_templates")
        .select("*")
        .eq("type", data.type)
        .maybeSingle();
      const loaded = await loadOrderForPreview(data.orderId ?? null);
      if (!loaded) return null;
      const { order, profile } = loaded;
      const items = (order.order_items ?? []).map((i) => ({
        name: i.product_name,
        qty: Number(i.qty),
        unitPrice: Number(i.unit_price),
        totalPrice: Number(i.total_price),
      }));
      const tokenQuery = order.public_access_token
        ? `?token=${encodeURIComponent(order.public_access_token)}`
        : "";
      const orderUrl = `${siteUrl()}/pedido/${order.id}/confirmacao${tokenQuery}`;
      const variables = buildVariableContext(
        order as any,
        profile,
        items.map((i) => ({ product_name: i.name, qty: i.qty })),
        { siteUrl: siteUrl() },
      );
      const built = buildOrderEmailTemplate({
        storeName: storeName(),
        customerName: profile?.name ?? null,
        orderNumber: order.order_number,
        items,
        subtotal: Number(order.subtotal ?? 0),
        shippingTotal: Number(order.shipping_cost ?? 0),
        discountTotal: Number(order.discount ?? 0),
        bundleDiscountTotal: Number((order as any).bundle_discount_total ?? 0),
        total: Number(order.total ?? 0),
        orderUrl,
        trackingCode: order.tracking_code ?? null,
        cancelledReason: (order as any).cancelled_reason ?? null,
        messageType: data.type,
        override: tplRow ?? null,
        variables,
      });
      return { built, orderId: order.id };
    })();

    if (!preview) return { ok: false as const, error: "Nenhum pedido real disponível" };

    const subject = `[TESTE] ${preview.built.subject}`;

    // Registra evento como teste
    const { data: evt } = await supabaseAdmin
      .from("email_events")
      .insert({
        order_id: preview.orderId,
        customer_email: data.recipientEmail,
        type: `test_${data.type}`,
        subject,
        provider: (process.env.EMAIL_PROVIDER ?? "resend").toLowerCase(),
        status: "pending",
      })
      .select("id")
      .single();

    const result = await sendTransactionalEmail({
      to: data.recipientEmail,
      subject,
      html: preview.built.html,
      text: preview.built.text,
      metadata: { test: true, type: data.type, orderId: preview.orderId },
    });

    if (evt?.id) {
      await supabaseAdmin
        .from("email_events")
        .update({
          status: result.ok ? (result.skipped ? "skipped" : "sent") : "failed",
          provider: result.provider,
          provider_message_id: result.messageId ?? null,
          sent_at: result.ok ? new Date().toISOString() : null,
          error_message: result.ok ? null : (result.error ?? "unknown"),
        })
        .eq("id", evt.id);
    }

    await logAdminAction({
      adminId: adminUserId,
      adminEmail,
      action: "test_send",
      resourceType: "email_template",
      resourceId: data.type,
      description: `Enviou teste do modelo "${data.type}" para ${data.recipientEmail}`,
      after: { recipient: data.recipientEmail, ok: result.ok, error: result.error ?? null },
    });

    return { ok: result.ok, error: result.error };
  });

// ============================================================
// Histórico recente do tipo
// ============================================================
export const listEmailEventsForTemplate = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z.object({ type: TypeSchema, limit: z.number().min(1).max(100).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const limit = data.limit ?? 25;
    const { data: rows, error } = await supabaseAdmin
      .from("email_events")
      .select(
        "id, type, subject, status, customer_email, provider, sent_at, error_message, created_at",
      )
      .in("type", [data.type, `test_${data.type}`])
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, events: rows ?? [] };
  });
