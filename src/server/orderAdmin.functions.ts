import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin, requireAdminMfaSoft } from "@/integrations/supabase/admin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendOrderEmail } from "./email/orderEmails";
import { logAdminAction } from "./security/auditLog";

// ============================================================
// Helpers
// ============================================================

const ALLOWED_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refunded",
] as const;

const ALLOWED_PAYMENT_STATUSES = [
  "pending",
  "preference_created",
  "approved",
  "paid",
  "in_process",
  "in_mediation",
  "failed",
  "rejected",
  "refunded",
  "charged_back",
  "cancelled",
] as const;

type OrderStatus = (typeof ALLOWED_ORDER_STATUSES)[number];
type PaymentStatus = (typeof ALLOWED_PAYMENT_STATUSES)[number];

async function logOrderEvent(opts: {
  orderId: string;
  type: string;
  status?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  createdBy?: string | null;
}) {
  await supabaseAdmin.from("order_status_events").insert({
    order_id: opts.orderId,
    type: opts.type,
    status: opts.status ?? null,
    description: opts.description ?? null,
    metadata: (opts.metadata ?? null) as never,
    created_by: opts.createdBy ?? null,
  });
}

// ============================================================
// 1) getOrderDetail — agrega tudo para a tela admin
// ============================================================
export const getOrderDetail = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { orderId } = data;

    const [orderRes, itemsRes, eventsRes, emailsRes, webhookRes, profileLookup] = await Promise.all(
      [
        supabaseAdmin.from("orders").select("*").eq("id", orderId).single(),
        supabaseAdmin
          .from("order_items")
          .select("*")
          .eq("order_id", orderId)
          .order("product_name", { ascending: true }),
        supabaseAdmin
          .from("order_status_events")
          .select("*")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false })
          .limit(200),
        supabaseAdmin
          .from("email_events")
          .select(
            "id, type, subject, status, customer_email, provider, provider_message_id, sent_at, error_message, created_at",
          )
          .eq("order_id", orderId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin
          .from("payment_webhook_events")
          .select(
            "id, type, action, processed, processing_error, live_mode, created_at, payload, data_id",
          )
          .order("created_at", { ascending: false })
          .limit(20),
        Promise.resolve(null),
      ],
    );

    if (orderRes.error || !orderRes.data) {
      return { ok: false as const, error: "Pedido não encontrado" };
    }
    const order = orderRes.data;

    // Profile do cliente
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, phone, created_at")
      .eq("id", order.user_id)
      .single();

    // Filtrar webhooks ligados a este pedido (via mp_payment_id ou external_reference no payload)
    const allWebhooks = webhookRes.data ?? [];
    const webhooks = allWebhooks.filter((w) => {
      if (!w) return false;
      const payload = (w.payload ?? {}) as Record<string, unknown>;
      const dataField = (payload?.data ?? {}) as Record<string, unknown>;
      const externalRef = (payload?.external_reference ?? dataField?.external_reference) as
        | string
        | undefined;
      const matchExternal = externalRef === order.id;
      const matchPaymentId = !!order.mp_payment_id && w.data_id === order.mp_payment_id;
      return matchExternal || matchPaymentId;
    });

    void profileLookup; // silencia tipagem

    return {
      ok: true as const,
      order,
      items: itemsRes.data ?? [],
      events: eventsRes.data ?? [],
      emails: emailsRes.data ?? [],
      webhooks,
      customer: profile ?? null,
    };
  });

// ============================================================
// 2) reconsultar Mercado Pago
// ============================================================
export const reconsultMercadoPagoPayment = createServerFn({ method: "POST" })
  .middleware([requireAdminMfaSoft])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const adminUserId = (context as { adminUserId: string }).adminUserId;
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      return { ok: false as const, error: "Mercado Pago não configurado" };
    }

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, mp_payment_id, mp_preference_id, payment_status, status")
      .eq("id", data.orderId)
      .single();

    if (!order) return { ok: false as const, error: "Pedido não encontrado" };
    if (!order.mp_payment_id) {
      return { ok: false as const, error: "Pedido ainda não tem ID de pagamento do Mercado Pago" };
    }

    let mpJson: Record<string, unknown> = {};
    let mpStatusCode = 0;
    try {
      const resp = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(order.mp_payment_id)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      mpStatusCode = resp.status;
      mpJson = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
      if (!resp.ok) {
        return { ok: false as const, error: `MP HTTP ${resp.status}` };
      }
    } catch (e) {
      return { ok: false as const, error: "Falha ao consultar Mercado Pago" };
    }

    const mpStatus = String((mpJson.status as string | undefined) ?? "");
    const mpStatusDetail = String((mpJson.status_detail as string | undefined) ?? "");

    await logOrderEvent({
      orderId: order.id,
      type: "payment_reconsulted",
      status: mpStatus,
      description: `Reconsulta Mercado Pago: ${mpStatus}${mpStatusDetail ? ` (${mpStatusDetail})` : ""}`,
      metadata: {
        http_status: mpStatusCode,
        status: mpStatus,
        status_detail: mpStatusDetail,
        payment_id: order.mp_payment_id,
      },
      createdBy: adminUserId,
    });

    return {
      ok: true as const,
      mp: {
        status: mpStatus,
        status_detail: mpStatusDetail,
        id: mpJson.id ?? order.mp_payment_id,
        date_approved: mpJson.date_approved ?? null,
        transaction_amount: mpJson.transaction_amount ?? null,
        payment_method_id: mpJson.payment_method_id ?? null,
        payment_type_id: mpJson.payment_type_id ?? null,
      },
    };
  });

// ============================================================
// 3) Atualizar status do pedido (com transições controladas)
// ============================================================

const TERMINAL_STATUSES = new Set(["delivered", "cancelled", "refunded"]);

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireAdminMfaSoft])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        status: z.enum(ALLOWED_ORDER_STATUSES).optional(),
        paymentStatus: z.enum(ALLOWED_PAYMENT_STATUSES).optional(),
        trackingCode: z.string().max(120).optional(),
        shippingCarrier: z.string().max(120).optional(),
        adminNotes: z.string().max(2000).optional(),
        cancelledReason: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminUserId = (context as { adminUserId: string; adminEmail: string | null }).adminUserId;
    const adminEmail = (context as { adminEmail: string | null }).adminEmail;

    const { data: current, error: curErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, payment_status, tracking_code, shipping_carrier, admin_notes")
      .eq("id", data.orderId)
      .single();
    if (curErr || !current) return { ok: false as const, error: "Pedido não encontrado" };

    if (
      data.status &&
      data.status !== current.status &&
      TERMINAL_STATUSES.has(current.status) &&
      current.status !== data.status
    ) {
      // Permite refunded depois de cancelled / delivered, mas bloqueia voltar para preparing etc.
      const allowedFromTerminal: Record<string, OrderStatus[]> = {
        delivered: ["refunded"],
        cancelled: ["refunded"],
        refunded: [],
      };
      const allowed = allowedFromTerminal[current.status] ?? [];
      if (!allowed.includes(data.status)) {
        return {
          ok: false as const,
          error: `Pedido em status "${current.status}" não pode voltar para "${data.status}"`,
        };
      }
    }

    type OrderUpdate = {
      status?: OrderStatus;
      payment_status?: PaymentStatus;
      tracking_code?: string | null;
      shipping_carrier?: string | null;
      admin_notes?: string | null;
      cancelled_reason?: string | null;
      updated_at?: string;
    };
    const patch: OrderUpdate = { updated_at: new Date().toISOString() };
    if (data.status) patch.status = data.status;
    if (data.paymentStatus) patch.payment_status = data.paymentStatus;
    if (typeof data.trackingCode === "string") patch.tracking_code = data.trackingCode || null;
    if (typeof data.shippingCarrier === "string")
      patch.shipping_carrier = data.shippingCarrier || null;
    if (typeof data.adminNotes === "string") patch.admin_notes = data.adminNotes;
    if (data.status === "cancelled" && data.cancelledReason)
      patch.cancelled_reason = data.cancelledReason;

    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update(patch)
      .eq("id", data.orderId);
    if (updErr) return { ok: false as const, error: updErr.message };

    // Eventos
    const tasks: Promise<unknown>[] = [];
    if (data.status && data.status !== current.status) {
      tasks.push(
        logOrderEvent({
          orderId: data.orderId,
          type: "status_changed",
          status: data.status,
          description: `Status alterado de "${current.status}" para "${data.status}"`,
          createdBy: adminUserId,
        }),
      );
    }
    if (data.paymentStatus && data.paymentStatus !== current.payment_status) {
      tasks.push(
        logOrderEvent({
          orderId: data.orderId,
          type: "payment_status_changed",
          status: data.paymentStatus,
          description: `Pagamento alterado de "${current.payment_status ?? "pending"}" para "${data.paymentStatus}"`,
          createdBy: adminUserId,
        }),
      );
    }
    if (data.trackingCode && data.trackingCode !== current.tracking_code) {
      tasks.push(
        logOrderEvent({
          orderId: data.orderId,
          type: "tracking_updated",
          description: `Código de rastreio: ${data.trackingCode}${data.shippingCarrier ? ` (${data.shippingCarrier})` : ""}`,
          metadata: { tracking_code: data.trackingCode, carrier: data.shippingCarrier ?? null },
          createdBy: adminUserId,
        }),
      );
    }
    await Promise.all(tasks);

    // Disparo automático de e-mail quando o pedido muda para entregue/cancelado.
    // sendOrderEmail é idempotente (verifica email_events), então salvar
    // novamente um pedido com o mesmo status não envia duplicado.
    // AWAIT obrigatório (Worker aborta promises não aguardadas após a Response); sendOrderEmail nunca propaga erro.
    if (data.status === "delivered" && current.status !== "delivered") {
      await sendOrderEmail({ orderId: data.orderId, type: "order_delivered" });
    }
    if (data.status === "cancelled" && current.status !== "cancelled") {
      await sendOrderEmail({ orderId: data.orderId, type: "order_cancelled" });
    }

    await logAdminAction({
      adminId: adminUserId,
      adminEmail,
      action: "update",
      resourceType: "order",
      resourceId: data.orderId,
      description: `Pedido atualizado${data.status ? ` → status ${data.status}` : ""}${data.paymentStatus ? ` / pagamento ${data.paymentStatus}` : ""}${data.trackingCode ? ` / rastreio ${data.trackingCode}` : ""}`,
      before: current,
      after: { ...current, ...patch },
    });

    return { ok: true as const };
  });

// ============================================================
// 4) Adicionar nota administrativa
// ============================================================
export const addOrderNote = createServerFn({ method: "POST" })
  .middleware([requireAdminMfaSoft])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        note: z.string().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminUserId = (context as { adminUserId: string }).adminUserId;
    await logOrderEvent({
      orderId: data.orderId,
      type: "admin_note",
      description: data.note,
      createdBy: adminUserId,
    });
    await logAdminAction({
      adminId: adminUserId,
      action: "note",
      resourceType: "order",
      resourceId: data.orderId,
      description: "Adicionou nota ao pedido",
      after: { note: data.note },
    });
    return { ok: true as const };
  });

// ============================================================
// 5) Reenviar e-mail transacional (admin)
// ============================================================
export const resendOrderEmail = createServerFn({ method: "POST" })
  .middleware([requireAdminMfaSoft])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        type: z.enum([
          "order_created",
          "payment_approved",
          "payment_pending",
          "payment_failed",
          "order_processing",
          "order_shipped",
          "order_delivered",
          "order_cancelled",
          "order_refunded",
        ]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminUserId = (context as { adminUserId: string }).adminUserId;

    // Bloqueia reenvio manual se o template estiver com allow_manual_resend=false
    const { data: tpl } = await supabaseAdmin
      .from("email_templates")
      .select("allow_manual_resend")
      .eq("type", data.type)
      .maybeSingle();
    if (tpl && tpl.allow_manual_resend === false) {
      return {
        ok: false as const,
        error: "Reenvio manual desativado para este modelo nas configurações.",
      };
    }

    // A-03 — Lock idempotente: bloqueia reenvio manual do mesmo (order_id, type)
    // se houver evento muito recente (sent ou pending) nos últimos 2 minutos.
    const TWO_MIN_AGO = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("email_events")
      .select("id, status, created_at")
      .eq("order_id", data.orderId)
      .eq("type", data.type)
      .gte("created_at", TWO_MIN_AGO)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent) {
      return {
        ok: false as const,
        skipped: "rate_limited" as const,
        error: "Já existe um reenvio recente deste e-mail. Aguarde alguns instantes.",
      };
    }

    const result = await sendOrderEmail({ orderId: data.orderId, type: data.type, force: true });

    await logOrderEvent({
      orderId: data.orderId,
      type: "email_resent",
      status: result.ok ? "sent" : "failed",
      description: result.ok
        ? `E-mail "${data.type}" reenviado pelo admin`
        : `Falha ao reenviar e-mail "${data.type}": ${result.error ?? result.skipped ?? "erro"}`,
      metadata: { email_type: data.type, skipped: result.skipped ?? null },
      createdBy: adminUserId,
    });

    await logAdminAction({
      adminId: adminUserId,
      action: "resend_email",
      resourceType: "order",
      resourceId: data.orderId,
      description: `Reenviou e-mail "${data.type}" (${result.ok ? "sucesso" : "falha"})`,
      after: { email_type: data.type, ok: result.ok, error: result.error ?? null },
    });

    return { ok: result.ok, error: result.error, skipped: result.skipped };
  });
