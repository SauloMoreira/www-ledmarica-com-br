import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { fetchAllRows } from "@/lib/fetchAllRows";

async function getSupabaseAdmin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

// ============================================================
// Tipos compartilhados (mesmos filtros do financeReports)
// ============================================================

export type MarginPreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "last_month"
  | "custom";

export type MarginFilters = {
  preset: MarginPreset;
  start?: string;
  end?: string;
  orderType: "all" | "b2c" | "b2b";
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  deliveryMethod?: string | null;
  status?: string | null;
};

const PAID = ["approved", "paid"];

const FiltersSchema = z.object({
  preset: z.enum([
    "today",
    "yesterday",
    "last_7_days",
    "last_30_days",
    "this_month",
    "last_month",
    "custom",
  ]),
  start: z.string().optional(),
  end: z.string().optional(),
  orderType: z.enum(["all", "b2c", "b2b"]).default("all"),
  paymentStatus: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  deliveryMethod: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
});

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function resolveRange(filters: MarginFilters): { from: Date; to: Date } {
  const now = new Date();
  switch (filters.preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "last_7_days": {
      const f = new Date(now);
      f.setDate(now.getDate() - 6);
      return { from: startOfDay(f), to: endOfDay(now) };
    }
    case "last_30_days": {
      const f = new Date(now);
      f.setDate(now.getDate() - 29);
      return { from: startOfDay(f), to: endOfDay(now) };
    }
    case "this_month":
      return {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: endOfDay(now),
      };
    case "last_month": {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(f), to: endOfDay(t) };
    }
    case "custom": {
      const from = filters.start ? new Date(filters.start) : startOfDay(now);
      const to = filters.end ? new Date(filters.end) : endOfDay(now);
      return { from: startOfDay(from), to: endOfDay(to) };
    }
  }
}

// ============================================================
// Tipos públicos
// ============================================================

export type MarginStatus = "good" | "warning" | "critical" | "incomplete";
export type CalcStatus = "real" | "estimated" | "incomplete";

export type MarginCards = {
  rangeFrom: string;
  rangeTo: string;
  paidOrdersCount: number;
  revenue: number;
  cogs: number;
  estimatedFees: number;
  estimatedGrossProfit: number;
  averageMarginPercent: number;
  ordersCritical: number;
  ordersIncomplete: number;
  itemsWithoutCost: number;
  productsWithoutCost: number;
  hasEstimatedFees: boolean;
  defaultMinMargin: number;
};

export type MarginOrderRow = {
  id: string;
  order_number: number;
  created_at: string;
  customer_name: string;
  company_name: string | null;
  order_type: "b2c" | "b2b";
  revenue: number;
  b2b_discount_total: number;
  coupon_discount: number;
  fee: number;
  fee_source: string;
  cogs: number;
  profit: number;
  margin_percent: number;
  margin_status: MarginStatus;
  calc_status: CalcStatus;
  items_without_cost: number;
};

export type MarginOrderResult = {
  rangeFrom: string;
  rangeTo: string;
  rows: MarginOrderRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type ProductReportRow = {
  product_id: string;
  product_name: string;
  sku: string | null;
  category: string | null;
  qty_sold: number;
  revenue: number;
  total_cost: number;
  profit: number;
  margin_percent: number;
  avg_price: number;
  avg_discount: number;
  stock_qty: number | null;
  has_cost: boolean;
  margin_status: MarginStatus;
};

export type ProductsReportResult = {
  rangeFrom: string;
  rangeTo: string;
  rows: ProductReportRow[];
  cards: {
    productsCount: number;
    qtyTotal: number;
    revenue: number;
    cogs: number;
    profit: number;
    productsWithoutCost: number;
    productsCritical: number;
  };
  topByRevenue: ProductReportRow[];
  topByProfit: ProductReportRow[];
  topByQty: ProductReportRow[];
  critical: ProductReportRow[];
  withoutCost: ProductReportRow[];
};

// ============================================================
// Helpers compartilhados
// ============================================================

type OrderRow = {
  id: string;
  order_number: number | string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  delivery_method: string | null;
  order_type: string;
  total: number | string | null;
  discount: number | string | null;
  b2b_discount_total: number | string | null;
  coupon_code: string | null;
  mp_fee_amount: number | string | null;
  estimated_fee_amount: number | string | null;
  payment_fee_source: string | null;
  company_name: string | null;
  address_snapshot: unknown;
  created_at: string;
};

async function fetchPaidOrders(
  filters: MarginFilters,
  range: { from: Date; to: Date },
): Promise<OrderRow[]> {
  const supabaseAdmin = await getSupabaseAdmin();
  const build = () => {
    let q = supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, status, payment_status, payment_method, delivery_method, order_type, " +
          "total, discount, b2b_discount_total, coupon_code, mp_fee_amount, estimated_fee_amount, " +
          "payment_fee_source, company_name, address_snapshot, created_at",
      )
      .gte("created_at", range.from.toISOString())
      .lte("created_at", range.to.toISOString())
      .in("payment_status", PAID)
      .order("created_at", { ascending: false });

    if (filters.orderType !== "all") q = q.eq("order_type", filters.orderType);
    if (filters.paymentMethod) q = q.eq("payment_method", filters.paymentMethod);
    if (filters.deliveryMethod) q = q.eq("delivery_method", filters.deliveryMethod);
    if (filters.status) q = q.eq("status", filters.status);
    return q;
  };

  try {
    return (await fetchAllRows<unknown>((from, to) =>
      build().range(from, to),
    )) as unknown as OrderRow[];
  } catch (e) {
    throw new Response(`orders query failed: ${(e as Error).message}`, { status: 500 });
  }
}


function feeOf(o: {
  mp_fee_amount: number | string | null;
  estimated_fee_amount: number | string | null;
}): number {
  return Number(o.mp_fee_amount ?? o.estimated_fee_amount ?? 0);
}

function computeMarginStatus(
  marginPercent: number,
  hasIncomplete: boolean,
  minMargin: number,
): MarginStatus {
  if (hasIncomplete) return "incomplete";
  if (marginPercent < 0 || marginPercent < minMargin) return "critical";
  if (marginPercent < minMargin + 5) return "warning";
  return "good";
}

function computeCalcStatus(hasIncompleteCost: boolean, feeSource: string | null): CalcStatus {
  if (hasIncompleteCost) return "incomplete";
  if (feeSource === "estimated" || feeSource === "unknown" || !feeSource) {
    return "estimated";
  }
  return "real";
}

async function getDefaultMinMargin(): Promise<number> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from("finance_settings")
    .select("default_min_margin_percent")
    .limit(1)
    .maybeSingle();
  return Number(data?.default_min_margin_percent ?? 25);
}

// ============================================================
// CARDS DE MARGEM
// ============================================================

export const getMarginCards = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => FiltersSchema.parse(input))
  .handler(async ({ data: filters }): Promise<MarginCards> => {
    const range = resolveRange(filters);
    const supabaseAdmin = await getSupabaseAdmin();

    const orders = await fetchPaidOrders(filters, range);
    const minMargin = await getDefaultMinMargin();

    let revenue = 0;
    let estimatedFees = 0;
    let hasEstimatedFees = false;
    for (const o of orders) {
      revenue += Number(o.total ?? 0);
      estimatedFees += feeOf(o);
      if (
        o.payment_fee_source === "estimated" ||
        o.payment_fee_source === "unknown" ||
        !o.payment_fee_source
      ) {
        hasEstimatedFees = true;
      }
    }

    let cogs = 0;
    let itemsWithoutCost = 0;
    const productsWithoutCostSet = new Set<string>();
    const incompleteOrderIds = new Set<string>();
    const orderCogs = new Map<string, number>();
    const orderRevenue = new Map<string, number>();

    if (orders.length > 0) {
      const ids = orders.map((o) => o.id);
      const items = await fetchAllRows<any>((from, to) =>
        supabaseAdmin
          .from("order_items")
          .select("order_id, product_id, qty, unit_cost, total_cost, applied_unit_price, unit_price")
          .in("order_id", ids)
          .range(from, to),
      );
      for (const it of items) {
        const oid = it.order_id as string;
        const itemRevenue =
          Number(it.applied_unit_price ?? it.unit_price ?? 0) * Number(it.qty ?? 0);
        orderRevenue.set(oid, (orderRevenue.get(oid) ?? 0) + itemRevenue);

        if (it.unit_cost == null) {
          itemsWithoutCost += 1;
          if (it.product_id) productsWithoutCostSet.add(it.product_id as string);
          incompleteOrderIds.add(oid);
          continue;
        }
        const itemCost = Number(it.total_cost ?? Number(it.unit_cost) * Number(it.qty ?? 0));
        cogs += itemCost;
        orderCogs.set(oid, (orderCogs.get(oid) ?? 0) + itemCost);
      }
    }

    const estimatedGrossProfit = revenue - estimatedFees - cogs;

    // Margem média ponderada por pedido (apenas pedidos completos)
    let totalCompleteRevenue = 0;
    let totalCompleteProfit = 0;
    let ordersCritical = 0;
    for (const o of orders) {
      if (incompleteOrderIds.has(o.id)) continue;
      const orev = Number(o.total ?? 0);
      const ocogs = orderCogs.get(o.id) ?? 0;
      const ofee = feeOf(o);
      const oprofit = orev - ofee - ocogs;
      const omargin = orev > 0 ? (oprofit / orev) * 100 : 0;
      totalCompleteRevenue += orev;
      totalCompleteProfit += oprofit;
      if (omargin < minMargin) ordersCritical += 1;
    }
    const averageMarginPercent =
      totalCompleteRevenue > 0 ? (totalCompleteProfit / totalCompleteRevenue) * 100 : 0;

    return {
      rangeFrom: range.from.toISOString(),
      rangeTo: range.to.toISOString(),
      paidOrdersCount: orders.length,
      revenue,
      cogs,
      estimatedFees,
      estimatedGrossProfit,
      averageMarginPercent,
      ordersCritical,
      ordersIncomplete: incompleteOrderIds.size,
      itemsWithoutCost,
      productsWithoutCost: productsWithoutCostSet.size,
      hasEstimatedFees,
      defaultMinMargin: minMargin,
    };
  });

// ============================================================
// MARGEM POR PEDIDO
// ============================================================

const MarginOrdersInput = FiltersSchema.extend({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  marginStatus: z.enum(["all", "good", "warning", "critical", "incomplete"]).default("all"),
});

export const getMarginByOrder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => MarginOrdersInput.parse(input))
  .handler(async ({ data }): Promise<MarginOrderResult> => {
    const range = resolveRange(data);
    const supabaseAdmin = await getSupabaseAdmin();
    const orders = await fetchPaidOrders(data, range);
    const minMargin = await getDefaultMinMargin();

    const orderCogs = new Map<string, { cost: number; missing: number }>();
    if (orders.length > 0) {
      const ids = orders.map((o) => o.id);
      const items = await fetchAllRows<any>((from, to) =>
        supabaseAdmin
          .from("order_items")
          .select("order_id, qty, unit_cost, total_cost")
          .in("order_id", ids)
          .range(from, to),
      );
      for (const it of items) {
        const oid = it.order_id as string;
        const cur = orderCogs.get(oid) ?? { cost: 0, missing: 0 };
        if (it.unit_cost == null) {
          cur.missing += 1;
        } else {
          cur.cost += Number(it.total_cost ?? Number(it.unit_cost) * Number(it.qty ?? 0));
        }
        orderCogs.set(oid, cur);
      }
    }

    const allRows: MarginOrderRow[] = orders.map((o) => {
      const snap = (o.address_snapshot ?? null) as { recipient?: string; name?: string } | null;
      const customerName = snap?.recipient ?? snap?.name ?? o.company_name ?? "Cliente";
      const revenue = Number(o.total ?? 0);
      const fee = feeOf(o);
      const ocogs = orderCogs.get(o.id) ?? { cost: 0, missing: 0 };
      const incomplete = ocogs.missing > 0;
      const profit = revenue - fee - ocogs.cost;
      const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;
      return {
        id: o.id,
        order_number: Number(o.order_number ?? 0),
        created_at: o.created_at,
        customer_name: customerName,
        company_name: o.company_name,
        order_type: (o.order_type as "b2c" | "b2b") ?? "b2c",
        revenue,
        b2b_discount_total: Number(o.b2b_discount_total ?? 0),
        coupon_discount: o.coupon_code ? Number(o.discount ?? 0) : 0,
        fee,
        fee_source: o.payment_fee_source ?? "unknown",
        cogs: ocogs.cost,
        profit,
        margin_percent: marginPercent,
        margin_status: computeMarginStatus(marginPercent, incomplete, minMargin),
        calc_status: computeCalcStatus(incomplete, o.payment_fee_source),
        items_without_cost: ocogs.missing,
      };
    });

    const filtered =
      data.marginStatus === "all"
        ? allRows
        : allRows.filter((r) => r.margin_status === data.marginStatus);

    const total = filtered.length;
    const startIdx = (data.page - 1) * data.pageSize;
    const slice = filtered.slice(startIdx, startIdx + data.pageSize);

    return {
      rangeFrom: range.from.toISOString(),
      rangeTo: range.to.toISOString(),
      rows: slice,
      total,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

// ============================================================
// PRODUTOS
// ============================================================

export const getProductsReport = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => FiltersSchema.parse(input))
  .handler(async ({ data }): Promise<ProductsReportResult> => {
    const range = resolveRange(data);
    const supabaseAdmin = await getSupabaseAdmin();
    const orders = await fetchPaidOrders(data, range);
    const minMargin = await getDefaultMinMargin();

    type Agg = {
      product_id: string;
      product_name: string;
      sku: string | null;
      qty_sold: number;
      revenue: number;
      total_cost: number;
      missing_cost_qty: number;
      total_qty_for_avg: number;
      sum_unit_price: number;
      sum_discount_unit: number;
    };
    const agg = new Map<string, Agg>();

    if (orders.length > 0) {
      const ids = orders.map((o) => o.id);
      const items = await fetchAllRows<any>((from, to) =>
        supabaseAdmin
          .from("order_items")
          .select(
            "order_id, product_id, product_name, product_sku, qty, unit_cost, total_cost, applied_unit_price, retail_unit_price, unit_price, b2b_discount_unit",
          )
          .in("order_id", ids)
          .range(from, to),
      );
      for (const it of items) {
        const pid = (it.product_id as string | null) ?? `unknown-${it.product_name}`;
        const cur =
          agg.get(pid) ??
          ({
            product_id: pid,
            product_name: (it.product_name as string) ?? "Produto",
            sku: (it.product_sku as string | null) ?? null,
            qty_sold: 0,
            revenue: 0,
            total_cost: 0,
            missing_cost_qty: 0,
            total_qty_for_avg: 0,
            sum_unit_price: 0,
            sum_discount_unit: 0,
          } as Agg);
        const qty = Number(it.qty ?? 0);
        const unitPrice = Number(it.applied_unit_price ?? it.unit_price ?? 0);
        const retail = Number(it.retail_unit_price ?? it.unit_price ?? 0);
        cur.qty_sold += qty;
        cur.revenue += unitPrice * qty;
        if (it.unit_cost == null) {
          cur.missing_cost_qty += qty;
        } else {
          cur.total_cost += Number(it.total_cost ?? Number(it.unit_cost) * qty);
        }
        cur.total_qty_for_avg += qty;
        cur.sum_unit_price += unitPrice * qty;
        cur.sum_discount_unit += Math.max(0, retail - unitPrice) * qty;
        agg.set(pid, cur);
      }
    }

    // Buscar categorias e estoque atual
    const productIds = Array.from(agg.keys()).filter((id) => !id.startsWith("unknown-"));
    const productMeta = new Map<string, { stock_qty: number | null; category: string | null }>();
    if (productIds.length > 0) {
      const products = await fetchAllRows<any>((from, to) =>
        supabaseAdmin
          .from("products")
          .select("id, stock_qty, category_id")
          .in("id", productIds)
          .range(from, to),
      );
      const catIds = new Set<string>();
      for (const p of products) {
        if (p.category_id) catIds.add(p.category_id as string);
      }
      const catMap = new Map<string, string>();
      if (catIds.size > 0) {
        const cats = await fetchAllRows<any>((from, to) =>
          supabaseAdmin
            .from("categories")
            .select("id, name")
            .in("id", Array.from(catIds))
            .range(from, to),
        );
        for (const c of cats) catMap.set(c.id as string, c.name as string);
      }
      for (const p of products) {
        productMeta.set(p.id as string, {
          stock_qty: p.stock_qty != null ? Number(p.stock_qty) : null,
          category: p.category_id ? (catMap.get(p.category_id as string) ?? null) : null,
        });
      }
    }

    const rows: ProductReportRow[] = Array.from(agg.values()).map((a) => {
      const meta = productMeta.get(a.product_id);
      const hasCost = a.missing_cost_qty === 0 && a.qty_sold > 0;
      const profit = hasCost ? a.revenue - a.total_cost : 0;
      const marginPercent = hasCost && a.revenue > 0 ? (profit / a.revenue) * 100 : 0;
      const avgPrice = a.total_qty_for_avg > 0 ? a.sum_unit_price / a.total_qty_for_avg : 0;
      const avgDiscount = a.total_qty_for_avg > 0 ? a.sum_discount_unit / a.total_qty_for_avg : 0;
      return {
        product_id: a.product_id,
        product_name: a.product_name,
        sku: a.sku,
        category: meta?.category ?? null,
        qty_sold: a.qty_sold,
        revenue: a.revenue,
        total_cost: a.total_cost,
        profit,
        margin_percent: marginPercent,
        avg_price: avgPrice,
        avg_discount: avgDiscount,
        stock_qty: meta?.stock_qty ?? null,
        has_cost: hasCost,
        margin_status: computeMarginStatus(marginPercent, !hasCost, minMargin),
      };
    });

    const cards = {
      productsCount: rows.length,
      qtyTotal: rows.reduce((s, r) => s + r.qty_sold, 0),
      revenue: rows.reduce((s, r) => s + r.revenue, 0),
      cogs: rows.reduce((s, r) => s + r.total_cost, 0),
      profit: rows.reduce((s, r) => s + r.profit, 0),
      productsWithoutCost: rows.filter((r) => !r.has_cost).length,
      productsCritical: rows.filter((r) => r.margin_status === "critical").length,
    };

    const sortedByRevenue = [...rows].sort((a, b) => b.revenue - a.revenue);
    const sortedByProfit = [...rows].filter((r) => r.has_cost).sort((a, b) => b.profit - a.profit);
    const sortedByQty = [...rows].sort((a, b) => b.qty_sold - a.qty_sold);

    return {
      rangeFrom: range.from.toISOString(),
      rangeTo: range.to.toISOString(),
      rows: sortedByRevenue,
      cards,
      topByRevenue: sortedByRevenue.slice(0, 5),
      topByProfit: sortedByProfit.slice(0, 5),
      topByQty: sortedByQty.slice(0, 5),
      critical: rows.filter((r) => r.margin_status === "critical").slice(0, 10),
      withoutCost: rows.filter((r) => !r.has_cost).slice(0, 10),
    };
  });

// ============================================================
// CSV — Margem por pedido
// ============================================================

function csvEscape(s: unknown): string {
  if (s == null) return "";
  const v = String(s);
  if (v.includes(";") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
function fmtMoney(n: number) {
  return n.toFixed(2).replace(".", ",");
}
function fmtPct(n: number) {
  return n.toFixed(2).replace(".", ",");
}

const marginStatusLabel: Record<MarginStatus, string> = {
  good: "Boa",
  warning: "Atenção",
  critical: "Crítica",
  incomplete: "Incompleta",
};
const calcStatusLabel: Record<CalcStatus, string> = {
  real: "Real",
  estimated: "Estimado",
  incomplete: "Incompleto",
};

export const exportMarginByOrderCsv = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => FiltersSchema.parse(input))
  .handler(async ({ data: filters }): Promise<{ filename: string; content: string }> => {
    const range = resolveRange(filters);
    const supabaseAdmin = await getSupabaseAdmin();
    const orders = await fetchPaidOrders(filters, range);
    const minMargin = await getDefaultMinMargin();

    const orderCogs = new Map<string, { cost: number; missing: number }>();
    if (orders.length > 0) {
      const ids = orders.map((o) => o.id);
      const items = await fetchAllRows<any>((from, to) =>
        supabaseAdmin
          .from("order_items")
          .select("order_id, qty, unit_cost, total_cost")
          .in("order_id", ids)
          .range(from, to),
      );
      for (const it of items) {
        const oid = it.order_id as string;
        const cur = orderCogs.get(oid) ?? { cost: 0, missing: 0 };
        if (it.unit_cost == null) cur.missing += 1;
        else cur.cost += Number(it.total_cost ?? Number(it.unit_cost) * Number(it.qty ?? 0));
        orderCogs.set(oid, cur);
      }
    }

    const headers = [
      "Data",
      "Pedido",
      "Cliente",
      "Tipo",
      "Receita",
      "Desconto B2B",
      "Desconto cupom",
      "Taxa Mercado Pago",
      "Origem da taxa",
      "Custo dos itens",
      "Lucro estimado",
      "Margem %",
      "Status da margem",
      "Status do cálculo",
    ];
    const lines: string[] = [headers.join(";")];

    for (const o of orders.slice(0, 5000)) {
      const snap = (o.address_snapshot ?? null) as { recipient?: string; name?: string } | null;
      const name = snap?.recipient ?? snap?.name ?? o.company_name ?? "Cliente";
      const revenue = Number(o.total ?? 0);
      const fee = feeOf(o);
      const ocogs = orderCogs.get(o.id) ?? { cost: 0, missing: 0 };
      const incomplete = ocogs.missing > 0;
      const profit = revenue - fee - ocogs.cost;
      const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;
      const marginStatus = computeMarginStatus(marginPercent, incomplete, minMargin);
      const calcStatus = computeCalcStatus(incomplete, o.payment_fee_source);

      lines.push(
        [
          new Date(o.created_at).toLocaleString("pt-BR"),
          `#${o.order_number}`,
          name,
          o.order_type === "b2b" ? "B2B" : "B2C",
          fmtMoney(revenue),
          fmtMoney(Number(o.b2b_discount_total ?? 0)),
          fmtMoney(o.coupon_code ? Number(o.discount ?? 0) : 0),
          fmtMoney(fee),
          o.payment_fee_source ?? "unknown",
          fmtMoney(ocogs.cost),
          incomplete ? "" : fmtMoney(profit),
          incomplete ? "" : fmtPct(marginPercent),
          marginStatusLabel[marginStatus],
          calcStatusLabel[calcStatus],
        ]
          .map(csvEscape)
          .join(";"),
      );
    }

    const filename = `margem_pedidos_${range.from.toISOString().slice(0, 10)}_${range.to
      .toISOString()
      .slice(0, 10)}.csv`;
    return { filename, content: "\ufeff" + lines.join("\n") };
  });

// ============================================================
// CSV — Produtos
// ============================================================

export const exportProductsReportCsv = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => FiltersSchema.parse(input))
  .handler(async ({ data: filters }): Promise<{ filename: string; content: string }> => {
    const result = await (async () => {
      // Reaproveita a função interna chamando o handler — duplicamos a lógica para evitar
      // chamada cruzada de createServerFn. Aqui replicamos fetch + agregação.
      const range = resolveRange(filters);
      const supabaseAdmin = await getSupabaseAdmin();
      const orders = await fetchPaidOrders(filters, range);
      const minMargin = await getDefaultMinMargin();

      type Agg = {
        product_id: string;
        product_name: string;
        sku: string | null;
        qty_sold: number;
        revenue: number;
        total_cost: number;
        missing_cost_qty: number;
        total_qty_for_avg: number;
        sum_unit_price: number;
        sum_discount_unit: number;
      };
      const agg = new Map<string, Agg>();
      if (orders.length > 0) {
        const ids = orders.map((o) => o.id);
        const items = await fetchAllRows<any>((from, to) =>
          supabaseAdmin
            .from("order_items")
            .select(
              "order_id, product_id, product_name, product_sku, qty, unit_cost, total_cost, applied_unit_price, retail_unit_price, unit_price",
            )
            .in("order_id", ids)
            .range(from, to),
        );
        for (const it of items) {
          const pid = (it.product_id as string | null) ?? `unknown-${it.product_name}`;
          const cur =
            agg.get(pid) ??
            ({
              product_id: pid,
              product_name: (it.product_name as string) ?? "Produto",
              sku: (it.product_sku as string | null) ?? null,
              qty_sold: 0,
              revenue: 0,
              total_cost: 0,
              missing_cost_qty: 0,
              total_qty_for_avg: 0,
              sum_unit_price: 0,
              sum_discount_unit: 0,
            } as Agg);
          const qty = Number(it.qty ?? 0);
          const unitPrice = Number(it.applied_unit_price ?? it.unit_price ?? 0);
          const retail = Number(it.retail_unit_price ?? it.unit_price ?? 0);
          cur.qty_sold += qty;
          cur.revenue += unitPrice * qty;
          if (it.unit_cost == null) cur.missing_cost_qty += qty;
          else cur.total_cost += Number(it.total_cost ?? Number(it.unit_cost) * qty);
          cur.total_qty_for_avg += qty;
          cur.sum_unit_price += unitPrice * qty;
          cur.sum_discount_unit += Math.max(0, retail - unitPrice) * qty;
          agg.set(pid, cur);
        }
      }
      const productIds = Array.from(agg.keys()).filter((id) => !id.startsWith("unknown-"));
      const meta = new Map<string, { stock_qty: number | null; category: string | null }>();
      if (productIds.length > 0) {
        const products = await fetchAllRows<any>((from, to) =>
          supabaseAdmin
            .from("products")
            .select("id, stock_qty, category_id")
            .in("id", productIds)
            .range(from, to),
        );
        const catIds = new Set<string>();
        for (const p of products) if (p.category_id) catIds.add(p.category_id as string);
        const catMap = new Map<string, string>();
        if (catIds.size > 0) {
          const cats = await fetchAllRows<any>((from, to) =>
            supabaseAdmin
              .from("categories")
              .select("id, name")
              .in("id", Array.from(catIds))
              .range(from, to),
          );
          for (const c of cats) catMap.set(c.id as string, c.name as string);
        }
        for (const p of products) {
          meta.set(p.id as string, {
            stock_qty: p.stock_qty != null ? Number(p.stock_qty) : null,
            category: p.category_id ? (catMap.get(p.category_id as string) ?? null) : null,
          });
        }
      }
      return { agg, meta, minMargin, range };
    })();

    const headers = [
      "Produto",
      "SKU",
      "Categoria",
      "Quantidade vendida",
      "Receita",
      "Custo total",
      "Lucro estimado",
      "Margem %",
      "Preço médio",
      "Desconto médio",
      "Estoque atual",
      "Status da margem",
      "Possui custo",
    ];
    const lines: string[] = [headers.join(";")];

    for (const a of Array.from(result.agg.values())
      .sort((x, y) => y.revenue - x.revenue)
      .slice(0, 5000)) {
      const m = result.meta.get(a.product_id);
      const hasCost = a.missing_cost_qty === 0 && a.qty_sold > 0;
      const profit = hasCost ? a.revenue - a.total_cost : 0;
      const marginPercent = hasCost && a.revenue > 0 ? (profit / a.revenue) * 100 : 0;
      const avgPrice = a.total_qty_for_avg > 0 ? a.sum_unit_price / a.total_qty_for_avg : 0;
      const avgDiscount = a.total_qty_for_avg > 0 ? a.sum_discount_unit / a.total_qty_for_avg : 0;
      const status = computeMarginStatus(marginPercent, !hasCost, result.minMargin);

      lines.push(
        [
          a.product_name,
          a.sku ?? "",
          m?.category ?? "",
          a.qty_sold,
          fmtMoney(a.revenue),
          hasCost ? fmtMoney(a.total_cost) : "",
          hasCost ? fmtMoney(profit) : "",
          hasCost ? fmtPct(marginPercent) : "",
          fmtMoney(avgPrice),
          fmtMoney(avgDiscount),
          m?.stock_qty ?? "",
          marginStatusLabel[status],
          hasCost ? "Sim" : "Não",
        ]
          .map(csvEscape)
          .join(";"),
      );
    }

    const filename = `produtos_${result.range.from.toISOString().slice(0, 10)}_${result.range.to
      .toISOString()
      .slice(0, 10)}.csv`;
    return { filename, content: "\ufeff" + lines.join("\n") };
  });
