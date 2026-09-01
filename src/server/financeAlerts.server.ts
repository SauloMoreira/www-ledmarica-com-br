/**
 * Helper SERVER-ONLY para alertas financeiros do Painel do Dia.
 * Apenas leitura. Reutiliza dados que já existem no banco — não recalcula
 * pedidos, checkout, Mercado Pago nem notas fiscais.
 *
 * Foco: margem crítica, produtos sem custo, NF pendente e taxa MP desconhecida.
 * Campanhas/UTM ficam para etapa posterior.
 */

import { fetchAllRows } from "@/lib/fetchAllRows";

export type FinanceAlertCounts = {
  // Margem / custo
  productsWithoutCost: number;
  productsBelowMinMargin: number;
  ordersPaidWithMissingCost: number;
  ordersPaidNegativeMargin: number;
  // Notas fiscais
  invoicesPending: number;
  invoicesPendingOver24h: number;
  invoicesPendingB2bOver24h: number;
  invoicesError: number;
  // Mercado Pago
  mpPaidNoFee30d: number;
  mpPaidEstimatedFee30d: number;
  mpWebhookErrors7d: number;
};

const EMPTY: FinanceAlertCounts = {
  productsWithoutCost: 0,
  productsBelowMinMargin: 0,
  ordersPaidWithMissingCost: 0,
  ordersPaidNegativeMargin: 0,
  invoicesPending: 0,
  invoicesPendingOver24h: 0,
  invoicesPendingB2bOver24h: 0,
  invoicesError: 0,
  mpPaidNoFee30d: 0,
  mpPaidEstimatedFee30d: 0,
  mpWebhookErrors7d: 0,
};

function hoursAgoISO(h: number): string {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

async function safeCount(build: () => any): Promise<number> {
  try {
    const { count, error } = await build();
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function fetchFinanceAlertCounts(): Promise<FinanceAlertCounts> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stale24h = hoursAgoISO(24);
    const since30dISO = hoursAgoISO(24 * 30);
    const since7dISO = hoursAgoISO(24 * 7);
    // "Corte de alertas" — eventos anteriores são considerados teste/homologação.
    let baselineISO = "1970-01-01T00:00:00.000Z";
    try {
      const { data: fs } = await supabaseAdmin
        .from("finance_settings")
        .select("alerts_baseline_at")
        .limit(1)
        .maybeSingle();
      if (fs?.alerts_baseline_at) baselineISO = fs.alerts_baseline_at as string;
    } catch {}
    const webhookSinceISO = baselineISO > since7dISO ? baselineISO : since7dISO;
    const negMarginSinceISO = baselineISO > since30dISO ? baselineISO : since30dISO;
    const out: FinanceAlertCounts = { ...EMPTY };

    // ---------- Margem / custo (reaproveita finance.functions) ----------
    try {
      const { getFinanceQuickCounts } = await import("./finance.functions");
      const fc = await getFinanceQuickCounts();
      out.productsWithoutCost = fc.productsWithoutCost;
      out.productsBelowMinMargin = fc.productsBelowMinMargin;
      out.ordersPaidWithMissingCost = fc.ordersPaidWithMissingCost;
    } catch {}

    // Pedidos pagos (últimos 30 dias) com algum item de margem negativa
    try {
      const negItems = await fetchAllRows<{ order_id: string }>((from, to) =>
        supabaseAdmin
          .from("order_items")
          .select("order_id, orders!inner(payment_status, paid_at)")
          .lt("gross_margin_amount", 0)
          .eq("orders.payment_status", "paid")
          .gte("orders.paid_at", negMarginSinceISO)
          .range(from, to),
      );
      const ids = new Set<string>();
      for (const r of negItems) {
        ids.add(r.order_id);
      }
      out.ordersPaidNegativeMargin = ids.size;
    } catch {}

    // ---------- Notas fiscais (count exact, leve) ----------
    out.invoicesPending = await safeCount(() =>
      supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("payment_status", ["paid", "approved"])
        .eq("invoice_status", "pendente_emissao"),
    );
    out.invoicesPendingOver24h = await safeCount(() =>
      supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("payment_status", ["paid", "approved"])
        .eq("invoice_status", "pendente_emissao")
        .lt("paid_at", stale24h),
    );
    out.invoicesPendingB2bOver24h = await safeCount(() =>
      supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("payment_status", ["paid", "approved"])
        .eq("order_type", "b2b")
        .in("invoice_status", ["pendente_emissao", "nao_necessaria"])
        .lt("paid_at", stale24h),
    );
    out.invoicesError = await safeCount(() =>
      supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("payment_status", ["paid", "approved"])
        .eq("invoice_status", "erro_emissao"),
    );

    // ---------- Mercado Pago — taxa real x estimada x desconhecida ----------
    // (head:true não nos dá a comparação que precisamos; lemos só as colunas
    // necessárias, paginando via fetchAllRows.)
    try {
      const mpRows = await fetchAllRows<{
        mp_fee_amount: number | string | null;
        estimated_fee_amount: number | string | null;
      }>((from, to) =>
        supabaseAdmin
          .from("orders")
          .select("mp_fee_amount, estimated_fee_amount")
          .in("payment_status", ["paid", "approved"])
          .gte("paid_at", since30dISO)
          .range(from, to),
      );
      for (const r of mpRows) {
        const realFee = r.mp_fee_amount != null && Number(r.mp_fee_amount) > 0;
        const estFee = r.estimated_fee_amount != null && Number(r.estimated_fee_amount) > 0;
        if (!realFee && !estFee) out.mpPaidNoFee30d += 1;
        else if (!realFee && estFee) out.mpPaidEstimatedFee30d += 1;
      }
    } catch {}

    // Webhooks MP com erro nos últimos 7 dias
    out.mpWebhookErrors7d = await safeCount(() =>
      supabaseAdmin
        .from("payment_webhook_events")
        .select("id", { count: "exact", head: true })
        .gte("created_at", webhookSinceISO)
        .not("processing_error", "is", null),
    );

    return out;
  } catch {
    return EMPTY;
  }
}
