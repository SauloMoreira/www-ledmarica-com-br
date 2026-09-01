import { createServerFn } from "@tanstack/react-start";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

async function getSupabaseAdmin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

// ============================================================
// Filtros (compatíveis com financeReports/marginReports)
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

export type CommercialFilters = z.infer<typeof FiltersSchema>;

const PAID = ["approved", "paid"];

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
function resolveRange(f: CommercialFilters): { from: Date; to: Date } {
  const now = new Date();
  switch (f.preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "last_7_days": {
      const x = new Date(now);
      x.setDate(now.getDate() - 6);
      return { from: startOfDay(x), to: endOfDay(now) };
    }
    case "last_30_days": {
      const x = new Date(now);
      x.setDate(now.getDate() - 29);
      return { from: startOfDay(x), to: endOfDay(now) };
    }
    case "this_month":
      return {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: endOfDay(now),
      };
    case "last_month": {
      const f1 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t1 = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(f1), to: endOfDay(t1) };
    }
    case "custom": {
      const from = f.start ? new Date(f.start) : startOfDay(now);
      const to = f.end ? new Date(f.end) : endOfDay(now);
      return { from: startOfDay(from), to: endOfDay(to) };
    }
  }
}

function maskCnpj(cnpj: string | null | undefined): string {
  if (!cnpj) return "não informado";
  const digits = String(cnpj).replace(/\D/g, "");
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0, 2)}.***.***/${digits.slice(8, 12)}-**`;
}

type OrderRow = {
  id: string;
  order_number: number | string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  delivery_method: string | null;
  order_type: string;
  total: number | string | null;
  subtotal: number | string | null;
  shipping_cost: number | string | null;
  discount: number | string | null;
  b2b_discount_total: number | string | null;
  bundle_discount_total: number | string | null;
  retail_subtotal: number | string | null;
  b2b_subtotal: number | string | null;
  coupon_code: string | null;
  company_id: string | null;
  company_name: string | null;
  company_cnpj: string | null;
  local_delivery_zone_id: string | null;
  local_delivery_district: string | null;
  mp_fee_amount: number | string | null;
  estimated_fee_amount: number | string | null;
  payment_fee_source: string | null;
  address_snapshot: unknown;
  created_at: string;
  paid_at: string | null;
};

async function fetchPaidOrders(
  filters: CommercialFilters,
  range: { from: Date; to: Date },
): Promise<OrderRow[]> {
  const supabaseAdmin = await getSupabaseAdmin();
  const data = await fetchAllRows<Record<string, unknown>>((fromIdx, toIdx) => {
    let q = supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, status, payment_status, payment_method, delivery_method, order_type, " +
          "total, subtotal, shipping_cost, discount, b2b_discount_total, bundle_discount_total, retail_subtotal, b2b_subtotal, " +
          "coupon_code, company_id, company_name, company_cnpj, local_delivery_zone_id, local_delivery_district, " +
          "mp_fee_amount, estimated_fee_amount, payment_fee_source, address_snapshot, created_at, paid_at",
      )
      .gte("created_at", range.from.toISOString())
      .lte("created_at", range.to.toISOString())
      .in("payment_status", PAID)
      .order("created_at", { ascending: false })
      .range(fromIdx, toIdx);

    if (filters.orderType !== "all") q = q.eq("order_type", filters.orderType);
    if (filters.paymentMethod) q = q.eq("payment_method", filters.paymentMethod);
    if (filters.deliveryMethod) q = q.eq("delivery_method", filters.deliveryMethod);
    if (filters.status) q = q.eq("status", filters.status);
    return q.returns<Record<string, unknown>[]>();
  });
  return data as unknown as OrderRow[];
}

function feeOf(o: OrderRow): number {
  return Number(o.mp_fee_amount ?? o.estimated_fee_amount ?? 0);
}

async function fetchItemsForOrders(orderIds: string[]) {
  if (orderIds.length === 0)
    return [] as Array<{
      order_id: string;
      product_id: string | null;
      product_name: string;
      product_sku: string | null;
      qty: number;
      unit_price: number;
      applied_unit_price: number | null;
      retail_unit_price: number | null;
      pricing_source: string;
      b2b_discount_unit: number;
      b2b_discount_total: number;
      unit_cost: number | null;
      total_cost: number | null;
    }>;
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("order_items")
    .select(
      "order_id, product_id, product_name, product_sku, qty, unit_price, applied_unit_price, retail_unit_price, " +
        "pricing_source, b2b_discount_unit, b2b_discount_total, unit_cost, total_cost",
    )
    .in("order_id", orderIds);
  if (error) throw new Response(`order_items query failed: ${error.message}`, { status: 500 });
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return rows.map((it) => ({
    order_id: it.order_id as string,
    product_id: (it.product_id as string | null) ?? null,
    product_name: (it.product_name as string) ?? "Produto",
    product_sku: (it.product_sku as string | null) ?? null,
    qty: Number(it.qty ?? 0),
    unit_price: Number(it.unit_price ?? 0),
    applied_unit_price: it.applied_unit_price != null ? Number(it.applied_unit_price) : null,
    retail_unit_price: it.retail_unit_price != null ? Number(it.retail_unit_price) : null,
    pricing_source: (it.pricing_source as string) ?? "retail",
    b2b_discount_unit: Number(it.b2b_discount_unit ?? 0),
    b2b_discount_total: Number(it.b2b_discount_total ?? 0),
    unit_cost: it.unit_cost != null ? Number(it.unit_cost) : null,
    total_cost: it.total_cost != null ? Number(it.total_cost) : null,
  }));
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

function customerNameOf(o: OrderRow): string {
  const snap = (o.address_snapshot ?? null) as { recipient?: string; name?: string } | null;
  return snap?.recipient ?? snap?.name ?? o.company_name ?? "Cliente";
}

// ============================================================
// B2B / ATACADO
// ============================================================

export type B2bCards = {
  rangeFrom: string;
  rangeTo: string;
  ordersB2b: number;
  ordersMixed: number;
  revenueB2b: number;
  averageTicketB2b: number;
  b2bDiscountTotal: number;
  estimatedProfitB2b: number;
  estimatedMarginPercentB2b: number;
  companiesBuying: number;
  productsB2bSold: number;
  itemsB2bWithoutCost: number;
  hasIncomplete: boolean;
};

export type B2bCompanyRow = {
  company_id: string | null;
  company_name: string;
  cnpj_masked: string;
  status: string | null;
  orders: number;
  revenue: number;
  b2b_discount: number;
  average_ticket: number;
  estimated_profit: number;
  margin_percent: number;
  margin_incomplete: boolean;
  last_order_at: string | null;
};

export type B2bProductRow = {
  product_id: string | null;
  product_name: string;
  sku: string | null;
  category: string | null;
  qty_sold: number;
  revenue: number;
  avg_price: number;
  b2b_discount_total: number;
  estimated_profit: number;
  margin_percent: number;
  margin_incomplete: boolean;
  companies_count: number;
};

export const getB2bReport = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => FiltersSchema.parse(input))
  .handler(
    async ({
      data: filters,
    }): Promise<{
      cards: B2bCards;
      companies: B2bCompanyRow[];
      products: B2bProductRow[];
    }> => {
      const range = resolveRange(filters);
      const supabaseAdmin = await getSupabaseAdmin();
      const allOrders = await fetchPaidOrders(filters, range);
      const items = await fetchItemsForOrders(allOrders.map((o) => o.id));
      const minMargin = await getDefaultMinMargin();

      // Identifica pedidos com itens B2B
      const itemsByOrder = new Map<string, typeof items>();
      for (const it of items) {
        const arr = itemsByOrder.get(it.order_id) ?? [];
        arr.push(it);
        itemsByOrder.set(it.order_id, arr);
      }

      const b2bOrders: OrderRow[] = [];
      const mixedOrderIds = new Set<string>();
      for (const o of allOrders) {
        const its = itemsByOrder.get(o.id) ?? [];
        const hasB2b = o.order_type === "b2b" || its.some((i) => i.pricing_source === "b2b");
        const hasRetail = its.some((i) => i.pricing_source === "retail");
        if (hasB2b) {
          b2bOrders.push(o);
          if (hasRetail) mixedOrderIds.add(o.id);
        }
      }

      // Cards
      let revenueB2b = 0;
      let b2bDiscountTotal = 0;
      let cogsB2b = 0;
      let feeB2bAlloc = 0;
      let itemsB2bWithoutCost = 0;
      const productsB2bSet = new Set<string>();
      const companiesSet = new Set<string>();
      let hasIncomplete = false;

      for (const o of b2bOrders) {
        const its = (itemsByOrder.get(o.id) ?? []).filter((i) => i.pricing_source === "b2b");
        const orderB2bRevenue = its.reduce(
          (s, i) => s + Number(i.applied_unit_price ?? i.unit_price ?? 0) * i.qty,
          0,
        );
        revenueB2b += orderB2bRevenue;
        b2bDiscountTotal += its.reduce((s, i) => s + i.b2b_discount_total, 0);

        for (const i of its) {
          if (i.product_id) productsB2bSet.add(i.product_id);
          if (i.unit_cost == null) {
            itemsB2bWithoutCost += 1;
            hasIncomplete = true;
          } else {
            cogsB2b += Number(i.total_cost ?? i.unit_cost * i.qty);
          }
        }

        // Aloca taxa MP proporcional ao share B2B do pedido
        const orderTotal = Number(o.total ?? 0);
        if (orderTotal > 0) {
          const share = orderB2bRevenue / orderTotal;
          feeB2bAlloc += feeOf(o) * share;
        }

        if (o.company_id) companiesSet.add(o.company_id);
      }

      const estimatedProfitB2b = revenueB2b - cogsB2b - feeB2bAlloc;
      const estimatedMarginPercentB2b =
        revenueB2b > 0 ? (estimatedProfitB2b / revenueB2b) * 100 : 0;
      const averageTicketB2b = b2bOrders.length > 0 ? revenueB2b / b2bOrders.length : 0;

      const cards: B2bCards = {
        rangeFrom: range.from.toISOString(),
        rangeTo: range.to.toISOString(),
        ordersB2b: b2bOrders.length,
        ordersMixed: mixedOrderIds.size,
        revenueB2b,
        averageTicketB2b,
        b2bDiscountTotal,
        estimatedProfitB2b,
        estimatedMarginPercentB2b,
        companiesBuying: companiesSet.size,
        productsB2bSold: productsB2bSet.size,
        itemsB2bWithoutCost,
        hasIncomplete,
      };

      // Empresas
      const companyAgg = new Map<
        string,
        {
          company_id: string;
          company_name: string;
          cnpj: string | null;
          orders: number;
          revenue: number;
          b2b_discount: number;
          cogs: number;
          fee: number;
          incomplete: boolean;
          last_order_at: string | null;
        }
      >();

      for (const o of b2bOrders) {
        const its = (itemsByOrder.get(o.id) ?? []).filter((i) => i.pricing_source === "b2b");
        const orderB2bRevenue = its.reduce(
          (s, i) => s + Number(i.applied_unit_price ?? i.unit_price ?? 0) * i.qty,
          0,
        );
        const orderTotal = Number(o.total ?? 0);
        const share = orderTotal > 0 ? orderB2bRevenue / orderTotal : 0;
        const orderFee = feeOf(o) * share;

        let cogs = 0;
        let incomplete = false;
        for (const i of its) {
          if (i.unit_cost == null) incomplete = true;
          else cogs += Number(i.total_cost ?? i.unit_cost * i.qty);
        }

        const key = o.company_id ?? `unknown:${o.company_name ?? o.id}`;
        const cur = companyAgg.get(key) ?? {
          company_id: o.company_id ?? "",
          company_name: o.company_name ?? "Sem empresa",
          cnpj: o.company_cnpj ?? null,
          orders: 0,
          revenue: 0,
          b2b_discount: 0,
          cogs: 0,
          fee: 0,
          incomplete: false,
          last_order_at: null as string | null,
        };
        cur.orders += 1;
        cur.revenue += orderB2bRevenue;
        cur.b2b_discount += its.reduce((s, i) => s + i.b2b_discount_total, 0);
        cur.cogs += cogs;
        cur.fee += orderFee;
        if (incomplete) cur.incomplete = true;
        if (!cur.last_order_at || cur.last_order_at < o.created_at)
          cur.last_order_at = o.created_at;
        companyAgg.set(key, cur);
      }

      // Status das empresas
      const companyIds = Array.from(companyAgg.values())
        .map((c) => c.company_id)
        .filter(Boolean);
      const statusMap = new Map<string, string>();
      if (companyIds.length > 0) {
        const { data: companiesData } = await supabaseAdmin
          .from("companies")
          .select("id, status")
          .in("id", companyIds);
        for (const c of companiesData ?? []) {
          statusMap.set(c.id as string, c.status as string);
        }
      }

      const companies: B2bCompanyRow[] = Array.from(companyAgg.values())
        .map((c) => {
          const profit = c.incomplete ? 0 : c.revenue - c.cogs - c.fee;
          const marginPercent = !c.incomplete && c.revenue > 0 ? (profit / c.revenue) * 100 : 0;
          return {
            company_id: c.company_id || null,
            company_name: c.company_name,
            cnpj_masked: maskCnpj(c.cnpj),
            status: c.company_id ? (statusMap.get(c.company_id) ?? null) : null,
            orders: c.orders,
            revenue: c.revenue,
            b2b_discount: c.b2b_discount,
            average_ticket: c.orders > 0 ? c.revenue / c.orders : 0,
            estimated_profit: profit,
            margin_percent: marginPercent,
            margin_incomplete: c.incomplete,
            last_order_at: c.last_order_at,
          } satisfies B2bCompanyRow;
        })
        .sort((a, b) => b.revenue - a.revenue);

      // Produtos B2B
      const productAgg = new Map<
        string,
        {
          product_id: string | null;
          product_name: string;
          sku: string | null;
          qty: number;
          revenue: number;
          b2b_discount: number;
          cogs: number;
          incomplete: boolean;
          companies: Set<string>;
        }
      >();
      for (const o of b2bOrders) {
        const its = (itemsByOrder.get(o.id) ?? []).filter((i) => i.pricing_source === "b2b");
        for (const i of its) {
          const pid = i.product_id ?? `unknown:${i.product_name}`;
          const cur = productAgg.get(pid) ?? {
            product_id: i.product_id,
            product_name: i.product_name,
            sku: i.product_sku,
            qty: 0,
            revenue: 0,
            b2b_discount: 0,
            cogs: 0,
            incomplete: false,
            companies: new Set<string>(),
          };
          cur.qty += i.qty;
          cur.revenue += Number(i.applied_unit_price ?? i.unit_price ?? 0) * i.qty;
          cur.b2b_discount += i.b2b_discount_total;
          if (i.unit_cost == null) cur.incomplete = true;
          else cur.cogs += Number(i.total_cost ?? i.unit_cost * i.qty);
          if (o.company_id) cur.companies.add(o.company_id);
          productAgg.set(pid, cur);
        }
      }

      // Categorias
      const productIds = Array.from(productAgg.values())
        .map((p) => p.product_id)
        .filter((x): x is string => Boolean(x));
      const categoryMap = new Map<string, string>();
      if (productIds.length > 0) {
        const { data: prods } = await supabaseAdmin
          .from("products")
          .select("id, category_id")
          .in("id", productIds);
        const catIds = new Set<string>();
        for (const p of prods ?? []) {
          if (p.category_id) catIds.add(p.category_id as string);
        }
        const catNameMap = new Map<string, string>();
        if (catIds.size > 0) {
          const { data: cats } = await supabaseAdmin
            .from("categories")
            .select("id, name")
            .in("id", Array.from(catIds));
          for (const c of cats ?? []) catNameMap.set(c.id as string, c.name as string);
        }
        for (const p of prods ?? []) {
          if (p.category_id)
            categoryMap.set(p.id as string, catNameMap.get(p.category_id as string) ?? "");
        }
      }

      const products: B2bProductRow[] = Array.from(productAgg.values())
        .map((p) => {
          const profit = p.incomplete ? 0 : p.revenue - p.cogs;
          const marginPercent = !p.incomplete && p.revenue > 0 ? (profit / p.revenue) * 100 : 0;
          return {
            product_id: p.product_id,
            product_name: p.product_name,
            sku: p.sku,
            category: p.product_id ? (categoryMap.get(p.product_id) ?? null) : null,
            qty_sold: p.qty,
            revenue: p.revenue,
            avg_price: p.qty > 0 ? p.revenue / p.qty : 0,
            b2b_discount_total: p.b2b_discount,
            estimated_profit: profit,
            margin_percent: marginPercent,
            margin_incomplete: p.incomplete,
            companies_count: p.companies.size,
          } satisfies B2bProductRow;
        })
        .sort((a, b) => b.revenue - a.revenue);

      // Mantém variável minMargin para futura sinalização de critical
      void minMargin;

      return { cards, companies, products };
    },
  );

// ============================================================
// CUPONS E DESCONTOS
// ============================================================

export type CouponsCards = {
  rangeFrom: string;
  rangeTo: string;
  totalDiscounts: number;
  b2bDiscounts: number;
  couponDiscounts: number;
  bundleDiscounts: number;
  couponsUsed: number;
  ordersWithCoupon: number;
  ordersWithBundle: number;
  averageTicketWithCoupon: number;
  averageMarginWithCoupon: number;
  couponsCritical: number;
  couponsExpiredButActive: number;
};

export type CouponPerfRow = {
  code: string;
  active: boolean;
  expires_at: string | null;
  expired: boolean;
  uses: number;
  revenue: number;
  discount_total: number;
  average_ticket: number;
  margin_percent: number;
  orders_critical: number;
  margin_incomplete: boolean;
};

export type DiscountByOrderRow = {
  id: string;
  order_number: number;
  created_at: string;
  customer_name: string;
  order_type: "b2c" | "b2b";
  coupon_code: string | null;
  coupon_discount: number;
  b2b_discount: number;
  bundle_discount: number;
  total_discount: number;
  final_revenue: number;
  margin_percent: number;
  margin_status: "good" | "warning" | "critical" | "incomplete";
};

export const getCouponsReport = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => FiltersSchema.parse(input))
  .handler(
    async ({
      data: filters,
    }): Promise<{
      cards: CouponsCards;
      coupons: CouponPerfRow[];
      orders: DiscountByOrderRow[];
    }> => {
      const range = resolveRange(filters);
      const supabaseAdmin = await getSupabaseAdmin();
      const orders = await fetchPaidOrders(filters, range);
      const items = await fetchItemsForOrders(orders.map((o) => o.id));
      const minMargin = await getDefaultMinMargin();

      const itemsByOrder = new Map<string, typeof items>();
      for (const it of items) {
        const arr = itemsByOrder.get(it.order_id) ?? [];
        arr.push(it);
        itemsByOrder.set(it.order_id, arr);
      }

      // Cupons cadastrados (para join e expirados)
      const { data: couponsData } = await supabaseAdmin
        .from("coupons")
        .select("code, active, expires_at");
      const couponInfo = new Map<string, { active: boolean; expires_at: string | null }>();
      for (const c of couponsData ?? []) {
        couponInfo.set(String(c.code).toUpperCase(), {
          active: Boolean(c.active),
          expires_at: (c.expires_at as string | null) ?? null,
        });
      }

      // Métricas por pedido
      type OrderMetrics = {
        revenue: number;
        cogs: number;
        fee: number;
        incomplete: boolean;
        margin_percent: number;
        coupon_discount: number;
        b2b_discount: number;
        bundle_discount: number;
      };
      const orderMetrics = new Map<string, OrderMetrics>();
      for (const o of orders) {
        const its = itemsByOrder.get(o.id) ?? [];
        let cogs = 0;
        let incomplete = false;
        for (const i of its) {
          if (i.unit_cost == null) incomplete = true;
          else cogs += Number(i.total_cost ?? i.unit_cost * i.qty);
        }
        const revenue = Number(o.total ?? 0);
        const fee = feeOf(o);
        const profit = incomplete ? 0 : revenue - fee - cogs;
        const marginPercent = !incomplete && revenue > 0 ? (profit / revenue) * 100 : 0;
        const couponDisc = o.coupon_code ? Number(o.discount ?? 0) : 0;
        orderMetrics.set(o.id, {
          revenue,
          cogs,
          fee,
          incomplete,
          margin_percent: marginPercent,
          coupon_discount: couponDisc,
          b2b_discount: Number(o.b2b_discount_total ?? 0),
          bundle_discount: Number(o.bundle_discount_total ?? 0),
        });
      }

      // Cupons agg
      const couponAgg = new Map<
        string,
        {
          code: string;
          uses: number;
          revenue: number;
          discount_total: number;
          orders_critical: number;
          incomplete: boolean;
          margin_sum: number;
          margin_count: number;
        }
      >();

      let couponDiscountTotal = 0;
      let b2bDiscountTotal = 0;
      let bundleDiscountTotal = 0;
      let ordersWithCoupon = 0;
      let ordersWithBundle = 0;
      let revenueWithCoupon = 0;
      let marginWithCouponSum = 0;
      let marginWithCouponCount = 0;

      for (const o of orders) {
        const m = orderMetrics.get(o.id)!;
        b2bDiscountTotal += m.b2b_discount;
        if (m.bundle_discount > 0) {
          bundleDiscountTotal += m.bundle_discount;
          ordersWithBundle += 1;
        }
        if (o.coupon_code) {
          ordersWithCoupon += 1;
          couponDiscountTotal += m.coupon_discount;
          revenueWithCoupon += m.revenue;
          if (!m.incomplete) {
            marginWithCouponSum += m.margin_percent;
            marginWithCouponCount += 1;
          }
          const code = o.coupon_code.toUpperCase();
          const cur = couponAgg.get(code) ?? {
            code,
            uses: 0,
            revenue: 0,
            discount_total: 0,
            orders_critical: 0,
            incomplete: false,
            margin_sum: 0,
            margin_count: 0,
          };
          cur.uses += 1;
          cur.revenue += m.revenue;
          cur.discount_total += m.coupon_discount;
          if (m.incomplete) cur.incomplete = true;
          else {
            cur.margin_sum += m.margin_percent;
            cur.margin_count += 1;
            if (m.margin_percent < minMargin) cur.orders_critical += 1;
          }
          couponAgg.set(code, cur);
        }
      }

      const coupons: CouponPerfRow[] = Array.from(couponAgg.values())
        .map((c) => {
          const info = couponInfo.get(c.code);
          const expiresAt = info?.expires_at ?? null;
          const expired = expiresAt ? new Date(expiresAt) < new Date() : false;
          return {
            code: c.code,
            active: info?.active ?? false,
            expires_at: expiresAt,
            expired,
            uses: c.uses,
            revenue: c.revenue,
            discount_total: c.discount_total,
            average_ticket: c.uses > 0 ? c.revenue / c.uses : 0,
            margin_percent: c.margin_count > 0 ? c.margin_sum / c.margin_count : 0,
            orders_critical: c.orders_critical,
            margin_incomplete: c.incomplete,
          } satisfies CouponPerfRow;
        })
        .sort((a, b) => b.revenue - a.revenue);

      // Inclui cupons cadastrados expirados ainda ativos (mesmo sem uso no período)
      let couponsExpiredButActive = coupons.filter((c) => c.expired && c.active).length;
      for (const [code, info] of couponInfo.entries()) {
        if (info.active && info.expires_at && new Date(info.expires_at) < new Date()) {
          if (!couponAgg.has(code)) couponsExpiredButActive += 1;
        }
      }

      const cards: CouponsCards = {
        rangeFrom: range.from.toISOString(),
        rangeTo: range.to.toISOString(),
        totalDiscounts: couponDiscountTotal + b2bDiscountTotal + bundleDiscountTotal,
        b2bDiscounts: b2bDiscountTotal,
        couponDiscounts: couponDiscountTotal,
        bundleDiscounts: bundleDiscountTotal,
        couponsUsed: couponAgg.size,
        ordersWithCoupon,
        ordersWithBundle,
        averageTicketWithCoupon: ordersWithCoupon > 0 ? revenueWithCoupon / ordersWithCoupon : 0,
        averageMarginWithCoupon:
          marginWithCouponCount > 0 ? marginWithCouponSum / marginWithCouponCount : 0,
        couponsCritical: coupons.filter((c) => c.orders_critical > 0).length,
        couponsExpiredButActive,
      };

      // Descontos por pedido (somente pedidos com algum desconto)
      function statusOf(margin: number, incomplete: boolean) {
        if (incomplete) return "incomplete" as const;
        if (margin < 0 || margin < minMargin) return "critical" as const;
        if (margin < minMargin + 5) return "warning" as const;
        return "good" as const;
      }
      const discountOrders: DiscountByOrderRow[] = orders
        .filter((o) => {
          const m = orderMetrics.get(o.id)!;
          return m.coupon_discount > 0 || m.b2b_discount > 0 || m.bundle_discount > 0;
        })
        .map((o) => {
          const m = orderMetrics.get(o.id)!;
          return {
            id: o.id,
            order_number: Number(o.order_number ?? 0),
            created_at: o.created_at,
            customer_name: customerNameOf(o),
            order_type: (o.order_type as "b2c" | "b2b") ?? "b2c",
            coupon_code: o.coupon_code,
            coupon_discount: m.coupon_discount,
            b2b_discount: m.b2b_discount,
            bundle_discount: m.bundle_discount,
            total_discount: m.coupon_discount + m.b2b_discount + m.bundle_discount,
            final_revenue: m.revenue,
            margin_percent: m.margin_percent,
            margin_status: statusOf(m.margin_percent, m.incomplete),
          } satisfies DiscountByOrderRow;
        });

      return { cards, coupons, orders: discountOrders };
    },
  );

// ============================================================
// FRETE / LOGÍSTICA
// ============================================================

export type ShippingCards = {
  rangeFrom: string;
  rangeTo: string;
  shippingTotal: number;
  averageShipping: number;
  ordersPickup: number;
  ordersLocalDelivery: number;
  ordersConventional: number;
  ordersFreeShipping: number;
  ordersZeroShipping: number;
  localShippingRevenue: number;
  pickupPending: number;
  localDistrictsCount: number;
};

export type ShippingOrderRow = {
  id: string;
  order_number: number;
  created_at: string;
  customer_name: string;
  order_type: "b2c" | "b2b";
  delivery_method: string;
  district: string | null;
  shipping_cost: number;
  total: number;
  status: string;
};

export type ShippingDistrictRow = {
  district: string;
  zone_id: string | null;
  orders: number;
  shipping_revenue: number;
  average_shipping: number;
  orders_revenue: number;
  average_ticket: number;
  last_delivery_at: string | null;
};

const ShippingInput = FiltersSchema.extend({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const getShippingReport = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => ShippingInput.parse(input))
  .handler(
    async ({
      data,
    }): Promise<{
      cards: ShippingCards;
      orders: { rows: ShippingOrderRow[]; total: number; page: number; pageSize: number };
      districts: ShippingDistrictRow[];
    }> => {
      const range = resolveRange(data);
      const orders = await fetchPaidOrders(data, range);

      let shippingTotal = 0;
      let ordersPickup = 0;
      let ordersLocalDelivery = 0;
      let ordersConventional = 0;
      let ordersFreeShipping = 0;
      let ordersZeroShipping = 0;
      let localShippingRevenue = 0;
      let pickupPending = 0;

      for (const o of orders) {
        const cost = Number(o.shipping_cost ?? 0);
        shippingTotal += cost;
        const dm = o.delivery_method ?? "delivery";
        if (dm === "pickup") {
          ordersPickup += 1;
          // pickup_status diferente de "delivered"/"completed" — usamos pickup_status do banco se houver
        } else if (dm === "local_delivery") {
          ordersLocalDelivery += 1;
          localShippingRevenue += cost;
        } else {
          ordersConventional += 1;
        }
        if (cost === 0) {
          ordersZeroShipping += 1;
          if (dm !== "pickup") ordersFreeShipping += 1;
        }
      }

      // Pickup pendente: pedidos pickup criados há mais de 3 dias com status != entregue
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      pickupPending = orders.filter(
        (o) =>
          o.delivery_method === "pickup" &&
          o.status !== "delivered" &&
          o.status !== "completed" &&
          o.status !== "cancelled" &&
          new Date(o.created_at) < threeDaysAgo,
      ).length;

      // Bairros
      const districtAgg = new Map<
        string,
        {
          district: string;
          zone_id: string | null;
          orders: number;
          shipping_revenue: number;
          orders_revenue: number;
          last: string | null;
        }
      >();
      for (const o of orders) {
        if (o.delivery_method !== "local_delivery") continue;
        const district = o.local_delivery_district ?? "Não informado";
        const cur = districtAgg.get(district) ?? {
          district,
          zone_id: o.local_delivery_zone_id,
          orders: 0,
          shipping_revenue: 0,
          orders_revenue: 0,
          last: null as string | null,
        };
        cur.orders += 1;
        cur.shipping_revenue += Number(o.shipping_cost ?? 0);
        cur.orders_revenue += Number(o.total ?? 0);
        if (!cur.last || cur.last < o.created_at) cur.last = o.created_at;
        districtAgg.set(district, cur);
      }

      const districts: ShippingDistrictRow[] = Array.from(districtAgg.values())
        .map((d) => ({
          district: d.district,
          zone_id: d.zone_id,
          orders: d.orders,
          shipping_revenue: d.shipping_revenue,
          average_shipping: d.orders > 0 ? d.shipping_revenue / d.orders : 0,
          orders_revenue: d.orders_revenue,
          average_ticket: d.orders > 0 ? d.orders_revenue / d.orders : 0,
          last_delivery_at: d.last,
        }))
        .sort((a, b) => b.orders - a.orders);

      const cards: ShippingCards = {
        rangeFrom: range.from.toISOString(),
        rangeTo: range.to.toISOString(),
        shippingTotal,
        averageShipping: orders.length > 0 ? shippingTotal / orders.length : 0,
        ordersPickup,
        ordersLocalDelivery,
        ordersConventional,
        ordersFreeShipping,
        ordersZeroShipping,
        localShippingRevenue,
        pickupPending,
        localDistrictsCount: districts.length,
      };

      const allRows: ShippingOrderRow[] = orders.map((o) => ({
        id: o.id,
        order_number: Number(o.order_number ?? 0),
        created_at: o.created_at,
        customer_name: customerNameOf(o),
        order_type: (o.order_type as "b2c" | "b2b") ?? "b2c",
        delivery_method: o.delivery_method ?? "delivery",
        district: o.local_delivery_district,
        shipping_cost: Number(o.shipping_cost ?? 0),
        total: Number(o.total ?? 0),
        status: o.status,
      }));

      const startIdx = (data.page - 1) * data.pageSize;
      const slice = allRows.slice(startIdx, startIdx + data.pageSize);

      return {
        cards,
        orders: { rows: slice, total: allRows.length, page: data.page, pageSize: data.pageSize },
        districts,
      };
    },
  );

// ============================================================
// EXPORTAÇÕES CSV
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
function fmtDateTimeCsv(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR");
}
function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.join(";")];
  for (const r of rows) lines.push(r.map(csvEscape).join(";"));
  return "\ufeff" + lines.join("\n");
}

const deliveryLabels: Record<string, string> = {
  pickup: "Retirada na loja",
  local_delivery: "Frete local",
  delivery: "Frete convencional",
};

export const exportB2bCompaniesCsv = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => FiltersSchema.parse(input))
  .handler(async ({ data }): Promise<{ filename: string; content: string }> => {
    const r = await getB2bReport({ data });
    const headers = [
      "Empresa",
      "CNPJ",
      "Status",
      "Pedidos",
      "Faturamento",
      "Desconto B2B",
      "Ticket médio",
      "Lucro estimado",
      "Margem %",
      "Margem incompleta",
      "Última compra",
    ];
    const rows = r.companies.map((c) => [
      c.company_name,
      c.cnpj_masked,
      c.status ?? "",
      String(c.orders),
      fmtMoney(c.revenue),
      fmtMoney(c.b2b_discount),
      fmtMoney(c.average_ticket),
      c.margin_incomplete ? "" : fmtMoney(c.estimated_profit),
      c.margin_incomplete ? "" : fmtPct(c.margin_percent),
      c.margin_incomplete ? "Sim" : "Não",
      fmtDateTimeCsv(c.last_order_at),
    ]);
    const range = resolveRange(data);
    return {
      filename: `b2b_empresas_${range.from.toISOString().slice(0, 10)}_${range.to
        .toISOString()
        .slice(0, 10)}.csv`,
      content: buildCsv(headers, rows),
    };
  });

export const exportB2bProductsCsv = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => FiltersSchema.parse(input))
  .handler(async ({ data }): Promise<{ filename: string; content: string }> => {
    const r = await getB2bReport({ data });
    const headers = [
      "Produto",
      "SKU",
      "Categoria",
      "Quantidade B2B",
      "Receita B2B",
      "Preço médio B2B",
      "Desconto B2B total",
      "Lucro estimado",
      "Margem %",
      "Empresas compradoras",
      "Margem incompleta",
    ];
    const rows = r.products.map((p) => [
      p.product_name,
      p.sku ?? "",
      p.category ?? "",
      String(p.qty_sold),
      fmtMoney(p.revenue),
      fmtMoney(p.avg_price),
      fmtMoney(p.b2b_discount_total),
      p.margin_incomplete ? "" : fmtMoney(p.estimated_profit),
      p.margin_incomplete ? "" : fmtPct(p.margin_percent),
      String(p.companies_count),
      p.margin_incomplete ? "Sim" : "Não",
    ]);
    const range = resolveRange(data);
    return {
      filename: `b2b_produtos_${range.from.toISOString().slice(0, 10)}_${range.to
        .toISOString()
        .slice(0, 10)}.csv`,
      content: buildCsv(headers, rows),
    };
  });

export const exportCouponsCsv = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => FiltersSchema.parse(input))
  .handler(async ({ data }): Promise<{ filename: string; content: string }> => {
    const r = await getCouponsReport({ data });
    const headers = [
      "Cupom",
      "Status",
      "Validade",
      "Vencido",
      "Usos",
      "Faturamento",
      "Desconto concedido",
      "Ticket médio",
      "Margem média %",
      "Pedidos críticos",
    ];
    const rows = r.coupons.map((c) => [
      c.code,
      c.active ? "Ativo" : "Inativo",
      c.expires_at ? new Date(c.expires_at).toLocaleDateString("pt-BR") : "",
      c.expired ? "Sim" : "Não",
      String(c.uses),
      fmtMoney(c.revenue),
      fmtMoney(c.discount_total),
      fmtMoney(c.average_ticket),
      c.margin_incomplete ? "" : fmtPct(c.margin_percent),
      String(c.orders_critical),
    ]);
    const range = resolveRange(data);
    return {
      filename: `cupons_${range.from.toISOString().slice(0, 10)}_${range.to
        .toISOString()
        .slice(0, 10)}.csv`,
      content: buildCsv(headers, rows),
    };
  });

export const exportDiscountsByOrderCsv = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => FiltersSchema.parse(input))
  .handler(async ({ data }): Promise<{ filename: string; content: string }> => {
    const r = await getCouponsReport({ data });
    const statusLabel: Record<string, string> = {
      good: "Boa",
      warning: "Atenção",
      critical: "Crítica",
      incomplete: "Incompleta",
    };
    const headers = [
      "Data",
      "Pedido",
      "Cliente",
      "Tipo",
      "Cupom",
      "Desconto cupom",
      "Desconto B2B",
      "Desconto combo",
      "Desconto total",
      "Receita final",
      "Margem %",
      "Status margem",
    ];
    const rows = r.orders.map((o) => [
      fmtDateTimeCsv(o.created_at),
      `#${o.order_number}`,
      o.customer_name,
      o.order_type === "b2b" ? "B2B" : "B2C",
      o.coupon_code ?? "",
      fmtMoney(o.coupon_discount),
      fmtMoney(o.b2b_discount),
      fmtMoney(o.bundle_discount),
      fmtMoney(o.total_discount),
      fmtMoney(o.final_revenue),
      o.margin_status === "incomplete" ? "" : fmtPct(o.margin_percent),
      statusLabel[o.margin_status] ?? o.margin_status,
    ]);
    const range = resolveRange(data);
    return {
      filename: `descontos_pedidos_${range.from.toISOString().slice(0, 10)}_${range.to
        .toISOString()
        .slice(0, 10)}.csv`,
      content: buildCsv(headers, rows),
    };
  });

export const exportShippingByOrderCsv = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => FiltersSchema.parse(input))
  .handler(async ({ data }): Promise<{ filename: string; content: string }> => {
    const range = resolveRange(data);
    const orders = await fetchPaidOrders(data, range);
    const headers = [
      "Data",
      "Pedido",
      "Cliente",
      "Tipo",
      "Método de entrega",
      "Bairro",
      "Frete",
      "Total do pedido",
      "Status",
    ];
    const rows = orders
      .slice(0, 5000)
      .map((o) => [
        fmtDateTimeCsv(o.created_at),
        `#${o.order_number}`,
        customerNameOf(o),
        o.order_type === "b2b" ? "B2B" : "B2C",
        deliveryLabels[o.delivery_method ?? "delivery"] ?? o.delivery_method ?? "",
        o.local_delivery_district ?? "",
        fmtMoney(Number(o.shipping_cost ?? 0)),
        fmtMoney(Number(o.total ?? 0)),
        o.status,
      ]);
    return {
      filename: `frete_pedidos_${range.from.toISOString().slice(0, 10)}_${range.to
        .toISOString()
        .slice(0, 10)}.csv`,
      content: buildCsv(headers, rows),
    };
  });

export const exportShippingByDistrictCsv = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => FiltersSchema.parse(input))
  .handler(async ({ data }): Promise<{ filename: string; content: string }> => {
    const r = await getShippingReport({ data: { ...data, page: 1, pageSize: 1 } });
    const headers = [
      "Bairro",
      "Pedidos",
      "Receita de frete",
      "Frete médio",
      "Faturamento",
      "Ticket médio",
      "Última entrega",
    ];
    const rows = r.districts.map((d) => [
      d.district,
      String(d.orders),
      fmtMoney(d.shipping_revenue),
      fmtMoney(d.average_shipping),
      fmtMoney(d.orders_revenue),
      fmtMoney(d.average_ticket),
      fmtDateTimeCsv(d.last_delivery_at),
    ]);
    const range = resolveRange(data);
    return {
      filename: `frete_bairros_${range.from.toISOString().slice(0, 10)}_${range.to
        .toISOString()
        .slice(0, 10)}.csv`,
      content: buildCsv(headers, rows),
    };
  });
