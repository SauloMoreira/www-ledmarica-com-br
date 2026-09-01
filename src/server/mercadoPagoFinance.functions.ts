import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { fetchAllRows } from "@/lib/fetchAllRows";

export type MpOverview = {
  rangeFrom: string;
  rangeTo: string;
  totals: {
    paid: number;
    pending: number;
    rejected: number;
    cancelled: number;
    withRealFee: number;
    withEstimatedFee: number;
    withUnknownFee: number;
  };
  totalGross: number;
  totalFeeReal: number;
  totalFeeEstimated: number;
  totalNet: number;
  lastWebhookAt: string | null;
};

export type MpPaymentRow = {
  orderId: string;
  orderNumber: number | string | null;
  customerName: string | null;
  createdAt: string;
  paidAt: string | null;
  paymentStatus: string | null;
  webhookStatus: string | null;
  paymentMethod: string | null;
  paymentType: string | null;
  gross: number | null;
  feeReal: number | null;
  feeEstimated: number | null;
  net: number | null;
  source: "mercado_pago_real" | "estimated" | "unknown";
  webhookAt: string | null;
  webhookError: string | null;
};

const RangeInput = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  return { from: from.toISOString(), to: to.toISOString() };
}

export const getMpOverview = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => RangeInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<MpOverview> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = { from: data.from ?? defaultRange().from, to: data.to ?? defaultRange().to };
    const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
      supabaseAdmin
        .from("orders")
        .select(
          "payment_status, mp_gross_amount, mp_fee_amount, mp_net_amount, estimated_fee_amount, estimated_net_amount, payment_fee_source, mp_last_webhook_at",
        )
        .eq("payment_provider", "mercadopago")
        .gte("created_at", r.from)
        .lte("created_at", r.to)
        .range(from, to),
    );

    const out: MpOverview = {
      rangeFrom: r.from,
      rangeTo: r.to,
      totals: {
        paid: 0,
        pending: 0,
        rejected: 0,
        cancelled: 0,
        withRealFee: 0,
        withEstimatedFee: 0,
        withUnknownFee: 0,
      },
      totalGross: 0,
      totalFeeReal: 0,
      totalFeeEstimated: 0,
      totalNet: 0,
      lastWebhookAt: null,
    };

    for (const o of rows) {
      const status = String(o.payment_status ?? "");
      if (status === "paid" || status === "approved") out.totals.paid += 1;
      else if (status === "pending" || status === "in_process") out.totals.pending += 1;
      else if (status === "rejected") out.totals.rejected += 1;
      else if (status === "cancelled") out.totals.cancelled += 1;

      const src = String(o.payment_fee_source ?? "unknown");
      if (src === "mercado_pago_real") out.totals.withRealFee += 1;
      else if (src === "estimated") out.totals.withEstimatedFee += 1;
      else out.totals.withUnknownFee += 1;

      const gross = Number(o.mp_gross_amount ?? 0);
      const feeReal = Number(o.mp_fee_amount ?? 0);
      const feeEst = Number(o.estimated_fee_amount ?? 0);
      const net = Number(o.mp_net_amount ?? o.estimated_net_amount ?? 0);

      if (status === "paid" || status === "approved") {
        out.totalGross += gross;
        out.totalFeeReal += feeReal;
        out.totalFeeEstimated += src === "estimated" ? feeEst : 0;
        out.totalNet += net;
      }

      const wh = o.mp_last_webhook_at ? String(o.mp_last_webhook_at) : null;
      if (wh && (!out.lastWebhookAt || wh > out.lastWebhookAt)) out.lastWebhookAt = wh;
    }

    out.totalGross = round2(out.totalGross);
    out.totalFeeReal = round2(out.totalFeeReal);
    out.totalFeeEstimated = round2(out.totalFeeEstimated);
    out.totalNet = round2(out.totalNet);

    return out;
  });

const ListInput = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["all", "paid", "pending", "rejected", "cancelled"]).default("all"),
  source: z.enum(["all", "mercado_pago_real", "estimated", "unknown"]).default("all"),
  page: z.number().int().min(1).max(500).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
});

export const listMpPayments = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => ListInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<{ rows: MpPaymentRow[]; total: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, address_snapshot, created_at, paid_at, payment_status, mp_webhook_status, mp_payment_method, mp_payment_type, mp_gross_amount, mp_fee_amount, estimated_fee_amount, mp_net_amount, estimated_net_amount, payment_fee_source, mp_last_webhook_at, mp_webhook_error",
        { count: "exact" },
      )
      .eq("payment_provider", "mercadopago")
      .order("created_at", { ascending: false });

    if (data.status !== "all") {
      if (data.status === "paid") q = q.in("payment_status", ["paid", "approved"]);
      else q = q.eq("payment_status", data.status);
    }
    if (data.source !== "all") q = q.eq("payment_fee_source", data.source);
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(`mp_payment_id.ilike.${s},customer_email.ilike.${s}`);
    }

    const offset = (data.page - 1) * data.pageSize;
    const { data: rows, count } = await q.range(offset, offset + data.pageSize - 1);

    const out: MpPaymentRow[] = ((rows ?? []) as unknown as Array<Record<string, unknown>>).map(
      (o) => {
        const src = String(o.payment_fee_source ?? "unknown") as MpPaymentRow["source"];
        const feeReal = o.mp_fee_amount != null ? Number(o.mp_fee_amount) : null;
        const feeEst = o.estimated_fee_amount != null ? Number(o.estimated_fee_amount) : null;
        const net =
          o.mp_net_amount != null
            ? Number(o.mp_net_amount)
            : o.estimated_net_amount != null
              ? Number(o.estimated_net_amount)
              : null;
        const snap = (o.address_snapshot as { recipient?: string } | null) ?? null;
        return {
          orderId: String(o.id),
          orderNumber: (o.order_number as number | null) ?? null,
          customerName: snap?.recipient ?? null,
          createdAt: String(o.created_at),
          paidAt: o.paid_at ? String(o.paid_at) : null,
          paymentStatus: (o.payment_status as string | null) ?? null,
          webhookStatus: (o.mp_webhook_status as string | null) ?? null,
          paymentMethod: (o.mp_payment_method as string | null) ?? null,
          paymentType: (o.mp_payment_type as string | null) ?? null,
          gross: o.mp_gross_amount != null ? Number(o.mp_gross_amount) : null,
          feeReal,
          feeEstimated: feeEst,
          net,
          source: src,
          webhookAt: o.mp_last_webhook_at ? String(o.mp_last_webhook_at) : null,
          webhookError: (o.mp_webhook_error as string | null) ?? null,
        };
      },
    );

    return { rows: out, total: count ?? out.length };
  });

const RecalcInput = z.object({ orderId: z.string().uuid() });

export const recalcEstimatedFee = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => RecalcInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadFeeConfig, estimateFee } = await import("./mercadoPagoFees.server");
    const { data: o } = await supabaseAdmin
      .from("orders")
      .select(
        "id, total, mp_gross_amount, mp_payment_method, mp_payment_type, payment_method, payment_fee_source, mp_fee_amount",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (!o) throw new Error("Pedido não encontrado");

    const cfg = await loadFeeConfig();
    const gross = Number(
      (o as Record<string, unknown>).mp_gross_amount ?? (o as Record<string, unknown>).total ?? 0,
    );
    const method =
      ((o as Record<string, unknown>).mp_payment_type as string | null) ??
      ((o as Record<string, unknown>).mp_payment_method as string | null) ??
      ((o as Record<string, unknown>).payment_method as string | null);
    const fee = estimateFee(gross, method, cfg);
    const net = round2(gross - fee);

    const updates: Record<string, unknown> = {
      estimated_fee_amount: fee,
      estimated_net_amount: net,
      payment_fee_calculated_at: new Date().toISOString(),
    };
    // Só promove a "estimated" se não havia taxa real
    if ((o as Record<string, unknown>).payment_fee_source !== "mercado_pago_real") {
      updates.payment_fee_source = gross > 0 ? "estimated" : "unknown";
    }
    await supabaseAdmin
      .from("orders")
      .update(updates as never)
      .eq("id", data.orderId);
    return { ok: true, fee, net };
  });

// Recalcula e exporta breakdown bruto p/ uso futuro
export const computeFeesPreview = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        gross: z.number().min(0),
        method: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { loadFeeConfig, estimateFee } = await import("./mercadoPagoFees.server");
    const cfg = await loadFeeConfig();
    const fee = estimateFee(data.gross, data.method ?? null, cfg);
    return { fee, net: round2(data.gross - fee) };
  });

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Ajuda compartilhada para reaproveitar no detalhe do pedido
export async function getMpFinanceForOrder(orderId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: o } = await supabaseAdmin
    .from("orders")
    .select(
      "mp_payment_id, mp_payment_method, mp_payment_type, mp_gross_amount, mp_fee_amount, mp_net_amount, estimated_fee_amount, estimated_net_amount, payment_fee_source, payment_fee_calculated_at, mp_last_webhook_at, mp_webhook_status, mp_webhook_error, payment_status",
    )
    .eq("id", orderId)
    .maybeSingle();
  return o ?? null;
}
