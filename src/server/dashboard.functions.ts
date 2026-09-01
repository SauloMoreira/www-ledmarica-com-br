import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllRows } from "@/lib/fetchAllRows";

/**
 * Server function de agregações para o dashboard administrativo.
 * Toda lógica roda no backend; o frontend recebe apenas os números prontos.
 *
 * Convenções de status (alinhadas ao código atual do projeto):
 *   - approved/paid     => pedido pago
 *   - pending           => pedido pendente
 *   - in_process        => pendente (compat MP)
 *   - preference_created => pendente (preferência MP criada, ainda sem pgto)
 *   - rejected/failed/cancelled => recusado/cancelado
 *   - refunded/charged_back => reembolsado / chargeback
 */

const PAID_STATUSES = ["approved", "paid"] as const;
const PENDING_STATUSES = ["pending", "in_process", "preference_created"] as const;
const FAILED_STATUSES = ["rejected", "failed", "cancelled"] as const;
const REFUND_STATUSES = ["refunded", "charged_back"] as const;

const InputSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export type DashboardData = {
  range: { start: string; end: string };
  cards: {
    grossRevenue: number;
    totalOrders: number;
    paidOrders: number;
    pendingOrders: number;
    failedOrders: number;
    refundedOrders: number;
    avgTicket: number;
    paymentApprovalRate: number; // 0..1
    productsSold: number;
  };
  salesByDay: Array<{ date: string; revenue: number; paidOrders: number }>;
  orderStatus: Array<{ status: string; count: number }>;
  paymentStatus: Array<{ status: string; count: number }>;
  topProducts: Array<{
    productId: string | null;
    name: string;
    qty: number;
    revenue: number;
  }>;
  revenueByCategory: Array<{ categoryId: string | null; name: string; revenue: number }>;
  hasCategories: boolean;
  avgTicketByDay: Array<{ date: string; avgTicket: number }>;
  emailStats: {
    sent: number;
    failed: number;
    pending: number;
    total: number;
    failureRate: number; // 0..1
  };
  webhookStats: {
    total: number;
    processed: number;
    errors: number;
    lastReceivedAt: string | null;
  };
};

function toDayKey(iso: string): string {
  return iso.slice(0, 10);
}

function buildDayBuckets(startISO: string, endISO: string): string[] {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const days: string[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cur <= last) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

export const getAdminDashboard = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<DashboardData> => {
    const { start, end } = data;

    // ============================================================
    // 1) Pedidos no período (created_at) — base para cards e gráficos
    // ============================================================
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select("id, total, status, payment_status, created_at, paid_at, updated_at")
      .gte("created_at", start)
      .lte("created_at", end);

    if (ordersError) {
      throw new Response(`orders query failed: ${ordersError.message}`, { status: 500 });
    }

    const allOrders = orders ?? [];
    const paidOrders = allOrders.filter((o) =>
      PAID_STATUSES.includes(o.payment_status as (typeof PAID_STATUSES)[number]),
    );
    const pendingOrders = allOrders.filter((o) =>
      PENDING_STATUSES.includes(o.payment_status as (typeof PENDING_STATUSES)[number]),
    );
    const failedOrders = allOrders.filter((o) =>
      FAILED_STATUSES.includes(o.payment_status as (typeof FAILED_STATUSES)[number]),
    );
    const refundedOrders = allOrders.filter((o) =>
      REFUND_STATUSES.includes(o.payment_status as (typeof REFUND_STATUSES)[number]),
    );

    const grossRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total ?? 0), 0);
    const avgTicket = paidOrders.length > 0 ? grossRevenue / paidOrders.length : 0;

    const totalAttempts = paidOrders.length + failedOrders.length;
    const paymentApprovalRate = totalAttempts > 0 ? paidOrders.length / totalAttempts : 0;

    // ============================================================
    // 2) Vendas por dia (receita aprovada + qtd pedidos aprovados)
    //    Usa paid_at quando existir; senão cai pra updated_at; fallback created_at.
    // ============================================================
    const dayKeys = buildDayBuckets(start, end);
    const salesMap: Record<string, { revenue: number; paidOrders: number }> = {};
    const ticketMap: Record<string, { sum: number; count: number }> = {};
    for (const k of dayKeys) {
      salesMap[k] = { revenue: 0, paidOrders: 0 };
      ticketMap[k] = { sum: 0, count: 0 };
    }
    for (const o of paidOrders) {
      const ref = o.paid_at ?? o.updated_at ?? o.created_at;
      if (!ref) continue;
      const key = toDayKey(String(ref));
      if (!(key in salesMap)) continue;
      const total = Number(o.total ?? 0);
      salesMap[key].revenue += total;
      salesMap[key].paidOrders += 1;
      ticketMap[key].sum += total;
      ticketMap[key].count += 1;
    }
    const salesByDay = dayKeys.map((d) => ({
      date: d,
      revenue: salesMap[d].revenue,
      paidOrders: salesMap[d].paidOrders,
    }));
    const avgTicketByDay = dayKeys.map((d) => ({
      date: d,
      avgTicket: ticketMap[d].count > 0 ? ticketMap[d].sum / ticketMap[d].count : 0,
    }));

    // ============================================================
    // 3) Distribuição por status de pedido e por status de pagamento
    // ============================================================
    const orderStatusCounts: Record<string, number> = {};
    const paymentStatusCounts: Record<string, number> = {};
    for (const o of allOrders) {
      const s = (o.status ?? "unknown") as string;
      orderStatusCounts[s] = (orderStatusCounts[s] ?? 0) + 1;
      const ps = (o.payment_status ?? "unknown") as string;
      paymentStatusCounts[ps] = (paymentStatusCounts[ps] ?? 0) + 1;
    }
    const orderStatus = Object.entries(orderStatusCounts).map(([status, count]) => ({
      status,
      count,
    }));
    const paymentStatus = Object.entries(paymentStatusCounts).map(([status, count]) => ({
      status,
      count,
    }));

    // ============================================================
    // 4) Top produtos vendidos + receita por categoria
    //    Considera APENAS pedidos pagos no período.
    // ============================================================
    const paidIds = paidOrders.map((o) => o.id);
    let topProducts: DashboardData["topProducts"] = [];
    let revenueByCategory: DashboardData["revenueByCategory"] = [];
    let productsSold = 0;
    let hasCategories = false;

    if (paidIds.length > 0) {
      const { data: items, error: itemsError } = await supabaseAdmin
        .from("order_items")
        .select("product_id, product_name, qty, total_price")
        .in("order_id", paidIds);

      if (itemsError) {
        throw new Response(`order_items query failed: ${itemsError.message}`, { status: 500 });
      }
      const allItems = items ?? [];

      // top produtos
      const prodMap = new Map<
        string,
        { name: string; qty: number; revenue: number; productId: string | null }
      >();
      for (const it of allItems) {
        const key = it.product_id ?? `__name:${it.product_name}`;
        const cur = prodMap.get(key) ?? {
          name: it.product_name ?? "Produto removido",
          qty: 0,
          revenue: 0,
          productId: it.product_id ?? null,
        };
        cur.qty += Number(it.qty ?? 0);
        cur.revenue += Number(it.total_price ?? 0);
        prodMap.set(key, cur);
      }
      productsSold = Array.from(prodMap.values()).reduce((s, p) => s + p.qty, 0);
      topProducts = Array.from(prodMap.values())
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10);

      // receita por categoria
      const productIds = Array.from(prodMap.keys()).filter((k) => !k.startsWith("__name:"));
      if (productIds.length > 0) {
        const { data: products } = await supabaseAdmin
          .from("products")
          .select("id, category_id, categories:category_id(id, name)")
          .in("id", productIds);

        const catMap = new Map<
          string,
          { name: string; revenue: number; categoryId: string | null }
        >();
        const productToCat = new Map<string, { id: string | null; name: string }>();
        for (const p of products ?? []) {
          const cat = (p as { categories: { id: string; name: string } | null }).categories;
          if (cat) {
            hasCategories = true;
            productToCat.set(p.id, { id: cat.id, name: cat.name });
          } else {
            productToCat.set(p.id, { id: null, name: "Sem categoria" });
          }
        }
        for (const [pid, info] of prodMap) {
          if (pid.startsWith("__name:")) continue;
          const cat = productToCat.get(pid) ?? { id: null, name: "Sem categoria" };
          const key = cat.id ?? "__none";
          const cur = catMap.get(key) ?? { name: cat.name, revenue: 0, categoryId: cat.id };
          cur.revenue += info.revenue;
          catMap.set(key, cur);
        }
        revenueByCategory = Array.from(catMap.values()).sort((a, b) => b.revenue - a.revenue);
      }
    }

    // ============================================================
    // 5) E-mails transacionais (email_events)
    // ============================================================
    const { data: emailRows } = await supabaseAdmin
      .from("email_events")
      .select("status")
      .gte("created_at", start)
      .lte("created_at", end);

    const emailStats = { sent: 0, failed: 0, pending: 0, total: 0, failureRate: 0 };
    for (const e of emailRows ?? []) {
      emailStats.total += 1;
      const s = String(e.status ?? "").toLowerCase();
      if (s === "sent" || s === "delivered") emailStats.sent += 1;
      else if (s === "failed" || s === "bounced" || s === "complained" || s === "dlq")
        emailStats.failed += 1;
      else emailStats.pending += 1;
    }
    emailStats.failureRate = emailStats.total > 0 ? emailStats.failed / emailStats.total : 0;

    // ============================================================
    // 6) Webhooks Mercado Pago
    // ============================================================
    const { data: webhookRows } = await supabaseAdmin
      .from("payment_webhook_events")
      .select("processed, processing_error, created_at")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false });

    const webhookStats = {
      total: 0,
      processed: 0,
      errors: 0,
      lastReceivedAt: null as string | null,
    };
    if (webhookRows && webhookRows.length > 0) {
      webhookStats.lastReceivedAt = webhookRows[0].created_at;
      for (const w of webhookRows) {
        webhookStats.total += 1;
        if (w.processed) webhookStats.processed += 1;
        if (w.processing_error) webhookStats.errors += 1;
      }
    }

    return {
      range: { start, end },
      cards: {
        grossRevenue,
        totalOrders: allOrders.length,
        paidOrders: paidOrders.length,
        pendingOrders: pendingOrders.length,
        failedOrders: failedOrders.length,
        refundedOrders: refundedOrders.length,
        avgTicket,
        paymentApprovalRate,
        productsSold,
      },
      salesByDay,
      orderStatus,
      paymentStatus,
      topProducts,
      revenueByCategory,
      hasCategories,
      avgTicketByDay,
      emailStats,
      webhookStats,
    };
  });
