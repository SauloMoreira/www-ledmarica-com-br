import { MP_PAYMENT_TYPE_BY_CONDITION } from "@/lib/couponConditions";
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logSecurityEvent } from "@/server/security/rateLimit";
import { computeMpFees } from "@/server/mercadoPagoFees.server";

// =============================================================================
// Webhook Mercado Pago
// POST /api/public/mercadopago/webhook
// Não confia no body: revalida o pagamento via GET /v1/payments/{id}.
// =============================================================================

type MPPayment = {
  id: number | string;
  status?: string;
  status_detail?: string;
  external_reference?: string | null;
  date_approved?: string | null;
  order?: { id?: number | string; type?: string } | null;
  live_mode?: boolean;
  transaction_amount?: number | null;
  payment_method_id?: string | null;
  payment_type_id?: string | null;
  fee_details?: Array<{ amount?: number; type?: string }> | null;
};

const TERMINAL_PAID = new Set(["approved"]);
const STATUS_MAP: Record<string, string> = {
  approved: "approved",
  authorized: "in_process",
  in_process: "in_process",
  in_mediation: "in_process",
  pending: "pending",
  rejected: "rejected",
  cancelled: "cancelled",
  refunded: "refunded",
  charged_back: "charged_back",
};

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function verifySignature(opts: {
  secret: string;
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
}): { ok: boolean; reason?: string } {
  if (!opts.signatureHeader) return { ok: false, reason: "missing x-signature" };
  if (!opts.dataId) return { ok: false, reason: "missing data.id" };

  // x-signature: ts=<timestamp>,v1=<hex>
  const parts = opts.signatureHeader.split(",").map((p) => p.trim());
  const map: Record<string, string> = {};
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (k && v) map[k.trim()] = v.trim();
  }
  const ts = map["ts"];
  const v1 = map["v1"];
  if (!ts || !v1) return { ok: false, reason: "malformed x-signature" };

  // Manifesto: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
  const manifestParts: string[] = [`id:${opts.dataId};`];
  if (opts.requestId) manifestParts.push(`request-id:${opts.requestId};`);
  manifestParts.push(`ts:${ts};`);
  const manifest = manifestParts.join("");

  const computed = createHmac("sha256", opts.secret).update(manifest).digest("hex");
  try {
    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(v1, "hex");
    if (a.length !== b.length) return { ok: false, reason: "signature length mismatch" };
    if (!timingSafeEqual(a, b)) return { ok: false, reason: "signature mismatch" };
  } catch {
    return { ok: false, reason: "signature compare error" };
  }
  return { ok: true };
}

async function fetchPayment(paymentId: string, accessToken: string): Promise<MPPayment | null> {
  try {
    const r = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!r.ok) {
      console.error("[MP webhook] GET payment falhou", r.status);
      return null;
    }
    return (await r.json()) as MPPayment;
  } catch (e) {
    console.error("[MP webhook] exception GET payment", e);
    return null;
  }
}

export const Route = createFileRoute("/api/public/mercadopago/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
        const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;

        // Headers
        const signatureHeader = request.headers.get("x-signature");
        const requestId = request.headers.get("x-request-id");

        const rawBody = await request.text();
        const body = safeJson(rawBody);

        // Query params (MP envia data.id também via query em alguns casos)
        const url = new URL(request.url);
        const queryDataId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
        const queryType = url.searchParams.get("type") ?? url.searchParams.get("topic");

        const dataIdFromBody =
          (body as { data?: { id?: string | number } }).data?.id != null
            ? String((body as { data?: { id?: string | number } }).data!.id)
            : null;
        const dataId = dataIdFromBody ?? queryDataId;
        const type =
          ((body as { type?: string }).type as string | undefined) ??
          ((body as { topic?: string }).topic as string | undefined) ??
          queryType ??
          null;
        const action = (body as { action?: string }).action ?? null;
        const eventId =
          (body as { id?: string | number }).id != null
            ? String((body as { id?: string | number }).id)
            : null;
        const liveMode =
          typeof (body as { live_mode?: boolean }).live_mode === "boolean"
            ? ((body as { live_mode?: boolean }).live_mode as boolean)
            : null;

        // 1) Auditoria — registra SEMPRE, antes de processar
        const headersObj: Record<string, string> = {};
        request.headers.forEach((v, k) => {
          headersObj[k] = v;
        });

        const { data: auditRow, error: auditErr } = await supabaseAdmin
          .from("payment_webhook_events")
          .insert({
            provider: "mercadopago",
            event_id: eventId,
            action,
            type,
            data_id: dataId,
            live_mode: liveMode,
            payload: body as never,
            headers: headersObj as never,
          })
          .select("id")
          .single();
        if (auditErr) console.error("[MP webhook] erro audit insert", auditErr);
        const auditId = auditRow?.id ?? null;

        // 2) Validar assinatura
        // Em produção, secret é OBRIGATÓRIO — ausente => 503.
        const isProd = process.env.NODE_ENV === "production";
        if (!webhookSecret) {
          if (isProd) {
            console.error(
              "[MP webhook] MERCADOPAGO_WEBHOOK_SECRET ausente em produção — recusando",
            );
            void logSecurityEvent({
              type: "webhook_invalid_signature",
              severity: "error",
              identifier: "mercadopago",
              message: "Webhook recebido sem secret configurado em produção",
              metadata: { auditId, dataId, type },
            });
            if (auditId) {
              await supabaseAdmin
                .from("payment_webhook_events")
                .update({ processing_error: "webhook secret missing in production" })
                .eq("id", auditId);
            }
            return new Response("Webhook secret not configured", { status: 503 });
          }
          console.warn(
            "[MP webhook] MERCADOPAGO_WEBHOOK_SECRET não configurado (dev) — pulando validação",
          );
        } else {
          const sig = verifySignature({
            secret: webhookSecret,
            signatureHeader,
            requestId,
            dataId,
          });
          if (!sig.ok) {
            console.warn("[MP webhook] assinatura inválida:", sig.reason);
            void logSecurityEvent({
              type: "webhook_invalid_signature",
              severity: "warn",
              identifier: "mercadopago",
              message: `Assinatura inválida: ${sig.reason}`,
              metadata: { auditId, dataId, type, requestId },
            });
            if (auditId) {
              await supabaseAdmin
                .from("payment_webhook_events")
                .update({ processing_error: `invalid signature: ${sig.reason}` })
                .eq("id", auditId);
            }
            return new Response("Unauthorized", { status: 401 });
          }
        }

        // 3) Só processa eventos do tipo payment
        const isPayment =
          type === "payment" || type === "payment.updated" || type === "payment.created";
        if (!isPayment || !dataId) {
          if (auditId) {
            await supabaseAdmin
              .from("payment_webhook_events")
              .update({ processed: true })
              .eq("id", auditId);
          }
          return new Response("ok", { status: 200 });
        }

        if (!accessToken) {
          console.error("[MP webhook] MERCADOPAGO_ACCESS_TOKEN não configurado");
          if (auditId) {
            await supabaseAdmin
              .from("payment_webhook_events")
              .update({ processing_error: "access token missing" })
              .eq("id", auditId);
          }
          return new Response("ok", { status: 200 });
        }

        // 4) Buscar dados oficiais do pagamento
        const payment = await fetchPayment(dataId, accessToken);
        if (!payment) {
          if (auditId) {
            await supabaseAdmin
              .from("payment_webhook_events")
              .update({ processing_error: "failed to fetch payment" })
              .eq("id", auditId);
          }
          return new Response("ok", { status: 200 });
        }

        const externalRef = payment.external_reference;
        if (!externalRef) {
          if (auditId) {
            await supabaseAdmin
              .from("payment_webhook_events")
              .update({ processing_error: "no external_reference", processed: true })
              .eq("id", auditId);
          }
          return new Response("ok", { status: 200 });
        }

        // 5) Localizar pedido
        const { data: order, error: orderErr } = await supabaseAdmin
          .from("orders")
          .select("id, order_number, payment_status, status, mp_payment_id, user_id, coupon_code, discount, admin_notes")
          .eq("external_reference", externalRef)
          .single();
        if (orderErr || !order) {
          console.error("[MP webhook] pedido não encontrado para ref", externalRef, orderErr);
          if (auditId) {
            await supabaseAdmin
              .from("payment_webhook_events")
              .update({ processing_error: "order not found" })
              .eq("id", auditId);
          }
          return new Response("ok", { status: 200 });
        }

        const mappedStatus = STATUS_MAP[payment.status ?? ""] ?? "pending";
        const wasAlreadyPaid =
          order.payment_status === "approved" || order.payment_status === "paid";
        const willBePaid = TERMINAL_PAID.has(payment.status ?? "");

        // Idempotência: se já está pago e o evento de novo é "approved", apenas registra e sai
        if (wasAlreadyPaid && willBePaid) {
          if (auditId) {
            await supabaseAdmin
              .from("payment_webhook_events")
              .update({ processed: true })
              .eq("id", auditId);
          }
          return new Response("ok", { status: 200 });
        }

        // 6) Atualizar pedido — inclui campos financeiros do MP (Onda 2)
        const fees = await computeMpFees({
          transaction_amount: payment.transaction_amount ?? null,
          fee_details: payment.fee_details ?? null,
          payment_method_id: payment.payment_method_id ?? null,
          payment_type_id: payment.payment_type_id ?? null,
        });
        const nowIso = new Date().toISOString();
        const updates: Record<string, unknown> = {
          payment_status: mappedStatus,
          mp_payment_id: String(payment.id),
          payment_provider: "mercadopago",
          mp_payment_method: payment.payment_method_id ?? null,
          mp_payment_type: payment.payment_type_id ?? null,
          mp_gross_amount: fees.gross,
          mp_fee_amount: fees.feeReal,
          mp_net_amount: fees.netReal,
          mp_fee_details: fees.feeDetails as never,
          estimated_fee_amount: fees.feeEstimated,
          estimated_net_amount: fees.netEstimated,
          payment_fee_source: fees.source,
          payment_fee_calculated_at: nowIso,
          mp_last_webhook_at: nowIso,
          mp_webhook_status: payment.status ?? null,
          mp_webhook_error: null,
        };
        if (payment.payment_method_id) updates.payment_method = payment.payment_method_id;
        if (payment.order?.id) updates.mp_merchant_order_id = String(payment.order.id);
        if (willBePaid) {
          updates.paid_at = payment.date_approved ?? nowIso;
          if (order.status === "pending") updates.status = "confirmed";
        } else if (mappedStatus === "cancelled" || mappedStatus === "rejected") {
          if (order.status === "pending") updates.status = "cancelled";
          updates.cancelled_reason =
            `Pagamento ${mappedStatus} (${payment.status_detail ?? ""})`.trim();
        }

        const { error: updErr } = await supabaseAdmin
          .from("orders")
          .update(updates as never)
          .eq("id", order.id);
        if (updErr) {
          console.error("[MP webhook] erro update pedido", updErr);
          if (auditId) {
            await supabaseAdmin
              .from("payment_webhook_events")
              .update({ processing_error: `order update: ${updErr.message}` })
              .eq("id", auditId);
          }
          return new Response("ok", { status: 200 });
        }

        // Reconciliação de cupom condicionado à forma de pagamento
        // (crédito/débito/boleto só são confirmáveis depois do pagamento).
        if (willBePaid && order.coupon_code && Number(order.discount ?? 0) > 0) {
          try {
            const { data: coupon } = await supabaseAdmin
              .from("coupons")
              .select("code, condition_type, condition_value")
              .eq("code", order.coupon_code)
              .maybeSingle();
            const cv = (coupon as { condition_type?: string | null; condition_value?: string | null } | null)
              ?.condition_type === "payment_method"
              ? ((coupon as { condition_value?: string | null }).condition_value ?? null)
              : null;
            const expected = cv ? MP_PAYMENT_TYPE_BY_CONDITION[cv] : null;
            if (expected && payment.payment_type_id !== expected) {
              const alert = `[${nowIso}] Cupom ${order.coupon_code} exigia ${cv} mas pagamento foi ${payment.payment_type_id ?? "desconhecido"} — revisar desconto manualmente.`;
              await supabaseAdmin
                .from("orders")
                .update({
                  admin_notes: order.admin_notes ? `${order.admin_notes}\n${alert}` : alert,
                } as never)
                .eq("id", order.id);
            }
          } catch (e) {
            console.error("[MP webhook] falha na reconciliação de cupom", e);
          }
        }

        // Baixa de estoque idempotente quando aprovado
        if (willBePaid) {
          const { data: stockRes, error: stockErr } = await supabaseAdmin.rpc(
            "decrement_stock_for_order",
            { _order_id: order.id },
          );
          if (stockErr) {
            console.error("[MP webhook] erro decrement_stock_for_order", stockErr);
            if (auditId) {
              await supabaseAdmin
                .from("payment_webhook_events")
                .update({ processing_error: `stock decrement: ${stockErr.message}` })
                .eq("id", auditId);
            }
          } else {
            console.log("[MP webhook] estoque", { orderId: order.id, result: stockRes });
          }
        }

        // Sincronizar lead/CRM — idempotente. AWAIT obrigatório:
        // no runtime Worker (Cloudflare), Promises não-aguardadas são abortadas
        // assim que a Response é devolvida — sem await, o lead nunca é criado.
        if (willBePaid) {
          try {
            const { syncApprovedOrderToLead } = await import("@/server/leadSync.server");
            await syncApprovedOrderToLead(order.id);
          } catch (e) {
            console.error("[MP webhook] falha ao sincronizar lead", e);
          }
        }

        // E-mail transacional ao cliente — idempotente. AWAIT obrigatório
        // (mesma razão acima: void Promise é cancelada antes do envio em Worker).
        try {
          const { sendOrderEmail } = await import("@/server/email/orderEmails");
          let emailType: "payment_approved" | "payment_pending" | "payment_failed" | null = null;
          if (willBePaid) emailType = "payment_approved";
          else if (mappedStatus === "pending" || mappedStatus === "in_process")
            emailType = "payment_pending";
          else if (mappedStatus === "rejected" || mappedStatus === "cancelled")
            emailType = "payment_failed";
          if (emailType) {
            await sendOrderEmail({ orderId: order.id, type: emailType });
          }
        } catch (e) {
          console.error("[MP webhook] falha ao agendar e-mail", e);
        }

        if (auditId) {
          await supabaseAdmin
            .from("payment_webhook_events")
            .update({ processed: true })
            .eq("id", auditId);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
