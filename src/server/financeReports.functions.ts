import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

async function getSupabaseAdmin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

// ============================================================
// Tipos compartilhados
// ============================================================

export type ReportPreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "last_month"
  | "custom";

export type OrderTypeFilter = "all" | "b2c" | "b2b";

export type ReportFilters = {
  preset: ReportPreset;
  start?: string; // ISO date when preset = custom
  end?: string;
  orderType: OrderTypeFilter;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  deliveryMethod?: string | null;
  status?: string | null;
};

export type FinanceReportCards = {
  rangeFrom: string;
  rangeTo: string;
  prevRangeFrom: string;
  prevRangeTo: string;
  // Totais período atual
  grossRevenue: number;
  estimatedNetRevenue: number;
  ordersPaid: number;
  ordersPending: number;
  ordersCancelled: number;
  averageTicket: number;
  cogs: number;
  estimatedGrossProfit: number;
  estimatedMarginPercent: number;
  totalMpFees: number;
  totalDiscounts: number;
  b2bDiscounts: number;
  couponDiscounts: number;
  shippingCharged: number;
  invoicePending: number;
  // Variação vs período anterior (delta absoluto e percentual)
  deltaGrossRevenue: number | null;
  deltaOrdersPaid: number | null;
  deltaAverageTicket: number | null;
  deltaGrossProfit: number | null;
  // Flags
  hasEstimatedFees: boolean;
  hasItemsWithoutCost: boolean;
};

export type SalesReportRow = {
  id: string;
  order_number: number;
  created_at: string;
  paid_at: string | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  delivery_method: string;
  order_type: "b2c" | "b2b";
  customer_name: string;
  company_name: string | null;
  subtotal: number;
  discount: number;
  shipping_cost: number;
  total: number;
  mp_fee_amount: number | null;
  estimated_fee_amount: number | null;
  payment_fee_source: string;
  net_amount: number; // total - fee
};

export type SalesReportSummary = {
  totalOrders: number;
  ordersPaid: number;
  ordersPending: number;
  ordersCancelled: number;
  grossRevenue: number;
  estimatedNetRevenue: number;
  averageTicket: number;
  byPaymentMethod: Array<{ key: string; label: string; count: number; total: number }>;
  byDeliveryMethod: Array<{ key: string; label: string; count: number; total: number }>;
  byOrderType: { b2c: { count: number; total: number }; b2b: { count: number; total: number } };
};

// ============================================================
// Helpers
// ============================================================

const PAID = ["approved", "paid"];
const PENDING = ["pending", "in_process", "preference_created"];
const CANCELLED = ["rejected", "failed", "cancelled"];

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

function resolveRange(filters: ReportFilters): { from: Date; to: Date } {
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

function previousRange(from: Date, to: Date): { from: Date; to: Date } {
  const diff = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - diff);
  return { from: prevFrom, to: prevTo };
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / prev) * 100;
}

function paymentMethodLabel(key: string | null): string {
  if (!key) return "Não informado";
  const map: Record<string, string> = {
    pix: "Pix",
    credit_card: "Cartão de crédito",
    debit_card: "Cartão de débito",
    bolbradesco: "Boleto",
    boleto: "Boleto",
    account_money: "Saldo Mercado Pago",
  };
  return map[key.toLowerCase()] ?? key;
}

function deliveryMethodLabel(key: string): string {
  const map: Record<string, string> = {
    delivery: "Entrega",
    local_delivery: "Entrega local",
    pickup: "Retirada na loja",
  };
  return map[key] ?? key;
}

// ============================================================
// Aplicação dos filtros (consulta orders)
// ============================================================

type OrderRow = {
  id: string;
  order_number: number | string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  delivery_method: string | null;
  order_type: "b2c" | "b2b" | string;
  subtotal: number | string | null;
  discount: number | string | null;
  shipping_cost: number | string | null;
  total: number | string | null;
  b2b_discount_total: number | string | null;
  coupon_code: string | null;
  mp_fee_amount: number | string | null;
  estimated_fee_amount: number | string | null;
  mp_net_amount: number | string | null;
  estimated_net_amount: number | string | null;
  payment_fee_source: string | null;
  company_name: string | null;
  company_cnpj?: string | null;
  address_snapshot: unknown;
  created_at: string;
  paid_at: string | null;
  invoice_status: string | null;
};

async function fetchOrders(
  filters: ReportFilters,
  range: { from: Date; to: Date },
): Promise<OrderRow[]> {
  const supabaseAdmin = await getSupabaseAdmin();
  const build = () => {
    let q = supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, status, payment_status, payment_method, delivery_method, order_type, " +
          "subtotal, discount, shipping_cost, total, b2b_discount_total, coupon_code, " +
          "mp_fee_amount, estimated_fee_amount, mp_net_amount, estimated_net_amount, payment_fee_source, " +
          "company_name, company_cnpj, address_snapshot, created_at, paid_at, invoice_status",
      )
      .gte("created_at", range.from.toISOString())
      .lte("created_at", range.to.toISOString())
      .order("created_at", { ascending: false });

    if (filters.orderType !== "all") q = q.eq("order_type", filters.orderType);
    if (filters.paymentStatus) q = q.eq("payment_status", filters.paymentStatus);
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


function netOf(o: {
  total: number | string | null;
  mp_net_amount: number | string | null;
  estimated_net_amount: number | string | null;
  mp_fee_amount: number | string | null;
  estimated_fee_amount: number | string | null;
}): number {
  const total = Number(o.total ?? 0);
  if (o.mp_net_amount != null) return Number(o.mp_net_amount);
  if (o.estimated_net_amount != null) return Number(o.estimated_net_amount);
  const fee = Number(o.mp_fee_amount ?? o.estimated_fee_amount ?? 0);
  return total - fee;
}

function feeOf(o: {
  mp_fee_amount: number | string | null;
  estimated_fee_amount: number | string | null;
}): number {
  return Number(o.mp_fee_amount ?? o.estimated_fee_amount ?? 0);
}

// ============================================================
// CARDS PRINCIPAIS
// ============================================================

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

export const getFinanceReportCards = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => FiltersSchema.parse(input))
  .handler(async ({ data: filters }): Promise<FinanceReportCards> => {
    const range = resolveRange(filters);
    const prev = previousRange(range.from, range.to);

    const supabaseAdmin = await getSupabaseAdmin();

    const [orders, prevOrders] = await Promise.all([
      fetchOrders(filters, range),
      fetchOrders(filters, prev),
    ]);

    const paid = orders.filter((o) => PAID.includes(o.payment_status ?? ""));
    const pending = orders.filter((o) => PENDING.includes(o.payment_status ?? ""));
    const cancelled = orders.filter((o) => CANCELLED.includes(o.payment_status ?? ""));

    const grossRevenue = paid.reduce((s, o) => s + Number(o.total ?? 0), 0);
    const totalMpFees = paid.reduce((s, o) => s + feeOf(o), 0);
    const estimatedNetRevenue = paid.reduce((s, o) => s + netOf(o), 0);
    const averageTicket = paid.length > 0 ? grossRevenue / paid.length : 0;
    const totalDiscounts = paid.reduce((s, o) => s + Number(o.discount ?? 0), 0);
    const b2bDiscounts = paid.reduce((s, o) => s + Number(o.b2b_discount_total ?? 0), 0);
    const couponDiscounts = paid.reduce(
      (s, o) => s + (o.coupon_code ? Number(o.discount ?? 0) : 0),
      0,
    );
    const shippingCharged = paid.reduce((s, o) => s + Number(o.shipping_cost ?? 0), 0);

    const hasEstimatedFees = paid.some(
      (o) => o.payment_fee_source === "estimated" || o.payment_fee_source === "unknown",
    );

    // COGS via order_items snapshot (apenas pedidos pagos)
    let cogs = 0;
    let itemsWithoutCost = 0;
    if (paid.length > 0) {
      const ids = paid.map((o) => o.id);
      const items = await fetchAllRows<{
        order_id: string;
        qty: number | string | null;
        unit_cost: number | string | null;
        total_cost: number | string | null;
      }>((from, to) =>
        supabaseAdmin
          .from("order_items")
          .select("order_id, qty, unit_cost, total_cost")
          .in("order_id", ids)
          .range(from, to),
      );
      for (const it of items) {
        if (it.unit_cost == null) {
          itemsWithoutCost += 1;
          continue;
        }
        cogs += Number(it.total_cost ?? Number(it.unit_cost) * Number(it.qty ?? 0));
      }
    }

    const estimatedGrossProfit = estimatedNetRevenue - cogs;
    const estimatedMarginPercent =
      grossRevenue > 0 ? (estimatedGrossProfit / grossRevenue) * 100 : 0;

    // Período anterior: comparativos simples
    const prevPaid = prevOrders.filter((o) => PAID.includes(o.payment_status ?? ""));
    const prevGross = prevPaid.reduce((s, o) => s + Number(o.total ?? 0), 0);
    const prevNet = prevPaid.reduce((s, o) => s + netOf(o), 0);
    const prevAvg = prevPaid.length > 0 ? prevGross / prevPaid.length : 0;

    let prevCogs = 0;
    if (prevPaid.length > 0) {
      const ids = prevPaid.map((o) => o.id);
      const { data: items } = await supabaseAdmin
        .from("order_items")
        .select("order_id, qty, unit_cost, total_cost")
        .in("order_id", ids);
      for (const it of items ?? []) {
        if (it.unit_cost == null) continue;
        prevCogs += Number(it.total_cost ?? Number(it.unit_cost) * Number(it.qty ?? 0));
      }
    }
    const prevProfit = prevNet - prevCogs;

    // Notas fiscais pendentes (geral, não filtrado por período — operacional)
    const { count: invoicePending } = await supabaseAdmin
      .from("orders")
      .select("id", { head: true, count: "exact" })
      .in("payment_status", PAID)
      .in("invoice_status", ["pendente", "pending"]);

    return {
      rangeFrom: range.from.toISOString(),
      rangeTo: range.to.toISOString(),
      prevRangeFrom: prev.from.toISOString(),
      prevRangeTo: prev.to.toISOString(),
      grossRevenue,
      estimatedNetRevenue,
      ordersPaid: paid.length,
      ordersPending: pending.length,
      ordersCancelled: cancelled.length,
      averageTicket,
      cogs,
      estimatedGrossProfit,
      estimatedMarginPercent,
      totalMpFees,
      totalDiscounts,
      b2bDiscounts,
      couponDiscounts,
      shippingCharged,
      invoicePending: invoicePending ?? 0,
      deltaGrossRevenue: pctDelta(grossRevenue, prevGross),
      deltaOrdersPaid: pctDelta(paid.length, prevPaid.length),
      deltaAverageTicket: pctDelta(averageTicket, prevAvg),
      deltaGrossProfit: pctDelta(estimatedGrossProfit, prevProfit),
      hasEstimatedFees,
      hasItemsWithoutCost: itemsWithoutCost > 0,
    };
  });

// ============================================================
// RELATÓRIO DE VENDAS
// ============================================================

const SalesInputSchema = FiltersSchema.extend({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export type SalesReportResult = {
  rangeFrom: string;
  rangeTo: string;
  summary: SalesReportSummary;
  rows: SalesReportRow[];
  total: number;
  page: number;
  pageSize: number;
};

export const getSalesReport = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => SalesInputSchema.parse(input))
  .handler(async ({ data }): Promise<SalesReportResult> => {
    const range = resolveRange(data);
    const all = await fetchOrders(data, range);

    const paid = all.filter((o) => PAID.includes(o.payment_status ?? ""));
    const pending = all.filter((o) => PENDING.includes(o.payment_status ?? ""));
    const cancelled = all.filter((o) => CANCELLED.includes(o.payment_status ?? ""));

    const grossRevenue = paid.reduce((s, o) => s + Number(o.total ?? 0), 0);
    const estimatedNetRevenue = paid.reduce((s, o) => s + netOf(o), 0);
    const averageTicket = paid.length > 0 ? grossRevenue / paid.length : 0;

    const byPaymentMap = new Map<string, { count: number; total: number }>();
    const byDeliveryMap = new Map<string, { count: number; total: number }>();
    let b2cCount = 0,
      b2cTotal = 0,
      b2bCount = 0,
      b2bTotal = 0;

    for (const o of paid) {
      const pm = o.payment_method ?? "unknown";
      const cur = byPaymentMap.get(pm) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(o.total ?? 0);
      byPaymentMap.set(pm, cur);

      const dm = o.delivery_method ?? "delivery";
      const curd = byDeliveryMap.get(dm) ?? { count: 0, total: 0 };
      curd.count += 1;
      curd.total += Number(o.total ?? 0);
      byDeliveryMap.set(dm, curd);

      if (o.order_type === "b2b") {
        b2bCount += 1;
        b2bTotal += Number(o.total ?? 0);
      } else {
        b2cCount += 1;
        b2cTotal += Number(o.total ?? 0);
      }
    }

    const summary: SalesReportSummary = {
      totalOrders: all.length,
      ordersPaid: paid.length,
      ordersPending: pending.length,
      ordersCancelled: cancelled.length,
      grossRevenue,
      estimatedNetRevenue,
      averageTicket,
      byPaymentMethod: Array.from(byPaymentMap.entries())
        .map(([k, v]) => ({ key: k, label: paymentMethodLabel(k), ...v }))
        .sort((a, b) => b.total - a.total),
      byDeliveryMethod: Array.from(byDeliveryMap.entries())
        .map(([k, v]) => ({ key: k, label: deliveryMethodLabel(k), ...v }))
        .sort((a, b) => b.total - a.total),
      byOrderType: {
        b2c: { count: b2cCount, total: b2cTotal },
        b2b: { count: b2bCount, total: b2bTotal },
      },
    };

    const total = all.length;
    const startIdx = (data.page - 1) * data.pageSize;
    const slice = all.slice(startIdx, startIdx + data.pageSize);

    const rows: SalesReportRow[] = slice.map((o) => {
      const snap = (o.address_snapshot ?? null) as { recipient?: string; name?: string } | null;
      const customerName = snap?.recipient ?? snap?.name ?? o.company_name ?? "Cliente";
      return {
        id: o.id,
        order_number: Number(o.order_number ?? 0),
        created_at: o.created_at as string,
        paid_at: (o.paid_at as string | null) ?? null,
        status: o.status as string,
        payment_status: (o.payment_status as string) ?? "unknown",
        payment_method: (o.payment_method as string | null) ?? null,
        delivery_method: (o.delivery_method as string) ?? "delivery",
        order_type: (o.order_type as "b2c" | "b2b") ?? "b2c",
        customer_name: customerName,
        company_name: (o.company_name as string | null) ?? null,
        subtotal: Number(o.subtotal ?? 0),
        discount: Number(o.discount ?? 0),
        shipping_cost: Number(o.shipping_cost ?? 0),
        total: Number(o.total ?? 0),
        mp_fee_amount: o.mp_fee_amount != null ? Number(o.mp_fee_amount) : null,
        estimated_fee_amount:
          o.estimated_fee_amount != null ? Number(o.estimated_fee_amount) : null,
        payment_fee_source: (o.payment_fee_source as string) ?? "unknown",
        net_amount: netOf(o),
      };
    });

    return {
      rangeFrom: range.from.toISOString(),
      rangeTo: range.to.toISOString(),
      summary,
      rows,
      total,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

// ============================================================
// EXPORT CSV (vendas) — respeita filtros, limita a 5000 linhas
// ============================================================

function maskCnpj(v: string | null | undefined): string {
  if (!v) return "";
  const d = v.replace(/\D/g, "");
  if (d.length !== 14) return v;
  return `${d.slice(0, 2)}.***.***/${d.slice(8, 12)}-**`;
}

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

export const exportSalesReportCsv = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => FiltersSchema.parse(input))
  .handler(async ({ data: filters }): Promise<{ filename: string; content: string }> => {
    const range = resolveRange(filters);
    const all = await fetchOrders(filters, range);
    const limited = all.slice(0, 5000);

    const headers = [
      "Data",
      "Pedido",
      "Cliente",
      "Empresa (CNPJ)",
      "Tipo",
      "Status pedido",
      "Status pagamento",
      "Método pagamento",
      "Entrega",
      "Subtotal",
      "Desconto",
      "Frete",
      "Total",
      "Taxa MP",
      "Origem da taxa",
      "Líquido estimado",
    ];

    const lines: string[] = [headers.join(";")];

    for (const o of limited) {
      const snap = (o.address_snapshot ?? null) as { recipient?: string; name?: string } | null;
      const customerName = snap?.recipient ?? snap?.name ?? o.company_name ?? "Cliente";
      const fee = feeOf(o);
      const net = netOf(o);
      lines.push(
        [
          new Date(o.created_at as string).toLocaleString("pt-BR"),
          `#${o.order_number}`,
          customerName,
          o.company_name
            ? `${o.company_name} (${maskCnpj((o as unknown as { company_cnpj?: string }).company_cnpj ?? "")})`
            : "",
          o.order_type === "b2b" ? "B2B" : "B2C",
          o.status,
          o.payment_status,
          paymentMethodLabel((o.payment_method as string | null) ?? null),
          deliveryMethodLabel((o.delivery_method as string) ?? "delivery"),
          fmtMoney(Number(o.subtotal ?? 0)),
          fmtMoney(Number(o.discount ?? 0)),
          fmtMoney(Number(o.shipping_cost ?? 0)),
          fmtMoney(Number(o.total ?? 0)),
          fmtMoney(fee),
          o.payment_fee_source ?? "unknown",
          fmtMoney(net),
        ]
          .map(csvEscape)
          .join(";"),
      );
    }

    const filename = `vendas_${range.from.toISOString().slice(0, 10)}_${range.to
      .toISOString()
      .slice(0, 10)}.csv`;

    return { filename, content: "\ufeff" + lines.join("\n") };
  });
