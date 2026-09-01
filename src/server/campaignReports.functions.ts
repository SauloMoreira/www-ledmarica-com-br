import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

async function getSupabaseAdmin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

// ============================================================
// Filtros (compatíveis com financeReports/marginReports/commercial)
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
  utmSource: z.string().nullable().optional(),
  utmMedium: z.string().nullable().optional(),
  utmCampaign: z.string().nullable().optional(),
  campaignId: z.string().uuid().nullable().optional(),
  couponCode: z.string().nullable().optional(),
  originContext: z.string().nullable().optional(),
  attribution: z.enum(["all", "attributed", "unattributed"]).default("all"),
});

export type CampaignFilters = z.infer<typeof FiltersSchema>;

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
function resolveRange(f: CampaignFilters): { from: Date; to: Date } {
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

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function feeOf(o: OrderRow): number {
  return num(o.mp_fee_amount ?? o.estimated_fee_amount);
}

function safeStr(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

// ============================================================
// Tipos
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
  subtotal: number | string | null;
  discount: number | string | null;
  shipping_cost: number | string | null;
  coupon_code: string | null;
  company_id: string | null;
  company_name: string | null;
  customer_name?: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  origin_context: string | null;
  origin_page: string | null;
  mp_fee_amount: number | string | null;
  estimated_fee_amount: number | string | null;
  payment_fee_source: string | null;
  user_id: string | null;
  created_at: string;
  paid_at: string | null;
};

type ItemCostRow = {
  order_id: string;
  total_price: number | string | null;
  total_cost: number | string | null;
  cost_source: string | null;
};

type CampaignRow = {
  id: string;
  name: string;
  status: string | null;
  channel: string | null;
  starts_at: string | null;
  ends_at: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  coupon_id: string | null;
};

// ============================================================
// Helpers de atribuição
// ============================================================

export type AttributionSource = "utm_campaign" | "coupon_campaign" | "origin_context" | "none";

function pickAttribution(
  o: OrderRow,
  couponToCampaign: Map<string, string>,
): {
  source: AttributionSource;
  campaignKey: string | null;
  campaignLabel: string;
} {
  const utm = safeStr(o.utm_campaign);
  if (utm) {
    return { source: "utm_campaign", campaignKey: utm.toLowerCase(), campaignLabel: utm };
  }
  const code = safeStr(o.coupon_code);
  if (code && couponToCampaign.has(code.toUpperCase())) {
    const label = couponToCampaign.get(code.toUpperCase())!;
    return {
      source: "coupon_campaign",
      campaignKey: `coupon:${code.toUpperCase()}`,
      campaignLabel: label,
    };
  }
  const ctx = safeStr(o.origin_context);
  if (ctx) {
    return {
      source: "origin_context",
      campaignKey: `ctx:${ctx.toLowerCase()}`,
      campaignLabel: ctx,
    };
  }
  return { source: "none", campaignKey: null, campaignLabel: "Sem atribuição" };
}

function originBucket(o: OrderRow): {
  source: string;
  medium: string;
  context: string;
} {
  const s = safeStr(o.utm_source);
  const m = safeStr(o.utm_medium);
  const c = safeStr(o.origin_context);
  if (s || m) {
    return {
      source: s ?? "sem_source",
      medium: m ?? "sem_medium",
      context: c ?? "—",
    };
  }
  if (c) return { source: "sem atribuição", medium: "—", context: c };
  return { source: "sem atribuição", medium: "—", context: "—" };
}

// ============================================================
// Buscas base
// ============================================================

async function fetchPaidOrders(
  filters: CampaignFilters,
  range: { from: Date; to: Date },
): Promise<OrderRow[]> {
  const supabaseAdmin = await getSupabaseAdmin();
  const data = await fetchAllRows<Record<string, unknown>>((fromIdx, toIdx) => {
    let q = supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, status, payment_status, payment_method, delivery_method, order_type, " +
          "total, subtotal, discount, shipping_cost, coupon_code, company_id, company_name, " +
          "utm_source, utm_medium, utm_campaign, utm_content, utm_term, origin_context, origin_page, " +
          "mp_fee_amount, estimated_fee_amount, payment_fee_source, user_id, created_at, paid_at",
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
    if (filters.utmSource) q = q.eq("utm_source", filters.utmSource);
    if (filters.utmMedium) q = q.eq("utm_medium", filters.utmMedium);
    if (filters.utmCampaign) q = q.eq("utm_campaign", filters.utmCampaign);
    if (filters.couponCode) q = q.eq("coupon_code", filters.couponCode);
    if (filters.originContext) q = q.eq("origin_context", filters.originContext);
    return q;
  });
  return data as unknown as OrderRow[];
}

async function fetchItemsCostForOrders(orderIds: string[]): Promise<ItemCostRow[]> {
  if (orderIds.length === 0) return [];
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("order_items")
    .select("order_id, total_price, total_cost, cost_source")
    .in("order_id", orderIds);
  if (error) throw new Response(`order_items query failed: ${error.message}`, { status: 500 });
  return (data ?? []) as unknown as ItemCostRow[];
}

async function fetchActiveCampaigns(): Promise<CampaignRow[]> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("marketing_campaigns")
    .select(
      "id, name, status, channel, starts_at, ends_at, utm_source, utm_medium, utm_campaign, coupon_id",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Response(`campaigns query failed: ${error.message}`, { status: 500 });
  return (data ?? []) as unknown as CampaignRow[];
}

async function fetchCouponCampaignMap(campaigns: CampaignRow[]): Promise<Map<string, string>> {
  const ids = Array.from(
    new Set(campaigns.map((c) => c.coupon_id).filter((v): v is string => !!v)),
  );
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.from("coupons").select("id, code").in("id", ids);
  if (error) return out;
  const codeById = new Map<string, string>();
  for (const c of data ?? [])
    codeById.set(
      String((c as { id: string }).id),
      String((c as { code: string }).code).toUpperCase(),
    );
  for (const camp of campaigns) {
    if (camp.coupon_id && codeById.has(camp.coupon_id)) {
      out.set(codeById.get(camp.coupon_id)!, camp.name);
    }
  }
  return out;
}

async function fetchLeadsByCampaign(range: {
  from: Date;
  to: Date;
}): Promise<Map<string, { total: number; hot: number; won: number; lost: number }>> {
  const out = new Map<string, { total: number; hot: number; won: number; lost: number }>();
  const supabaseAdmin = await getSupabaseAdmin();
  let data: Record<string, unknown>[];
  try {
    data = await fetchAllRows<Record<string, unknown>>((fromIdx, toIdx) =>
      supabaseAdmin
        .from("leads")
        .select("utm_campaign, status, score_temperature, created_at")
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString())
        .not("utm_campaign", "is", null)
        .range(fromIdx, toIdx),
    );
  } catch {
    return out;
  }
  for (const r of data as Array<{
    utm_campaign: string | null;
    status: string | null;
    score_temperature: string | null;
  }>) {
    const key = (safeStr(r.utm_campaign) ?? "").toLowerCase();
    if (!key) continue;
    const cur = out.get(key) ?? { total: 0, hot: 0, won: 0, lost: 0 };
    cur.total += 1;
    if (r.score_temperature === "quente") cur.hot += 1;
    if (r.status === "ganho" || r.status === "won") cur.won += 1;
    if (r.status === "perdido" || r.status === "lost") cur.lost += 1;
    out.set(key, cur);
  }
  return out;
}

async function fetchAbandonedByCampaign(range: {
  from: Date;
  to: Date;
}): Promise<Map<string, { abandoned: number; recovered: number; abandonedValue: number }>> {
  const out = new Map<string, { abandoned: number; recovered: number; abandonedValue: number }>();
  const supabaseAdmin = await getSupabaseAdmin();
  let data: Record<string, unknown>[];
  try {
    data = await fetchAllRows<Record<string, unknown>>((fromIdx, toIdx) =>
      supabaseAdmin
        .from("abandoned_carts")
        .select("utm_campaign, recovered_at, subtotal_amount, abandoned_at")
        .gte("abandoned_at", range.from.toISOString())
        .lte("abandoned_at", range.to.toISOString())
        .not("utm_campaign", "is", null)
        .range(fromIdx, toIdx),
    );
  } catch {
    return out;
  }
  for (const r of data as Array<{
    utm_campaign: string | null;
    recovered_at: string | null;
    subtotal_amount: number | string | null;
  }>) {
    const key = (safeStr(r.utm_campaign) ?? "").toLowerCase();
    if (!key) continue;
    const cur = out.get(key) ?? { abandoned: 0, recovered: 0, abandonedValue: 0 };
    cur.abandoned += 1;
    cur.abandonedValue += num(r.subtotal_amount);
    if (r.recovered_at) cur.recovered += 1;
    out.set(key, cur);
  }
  return out;
}

// ============================================================
// Tipos de saída
// ============================================================

export type CampaignCards = {
  attributedRevenue: number;
  attributedOrders: number;
  attributedLeads: number;
  attributedAbandoned: number;
  recoveredCarts: number;
  avgTicketAttributed: number;
  estimatedMargin: number;
  topRevenueCampaign: { label: string; revenue: number } | null;
  topMarginCampaign: { label: string; margin: number } | null;
  topOriginByOrders: { label: string; orders: number } | null;
  unattributedOrders: number;
  attributionRate: number; // 0..100
};

export type CampaignPerfRow = {
  campaignKey: string;
  campaignLabel: string;
  source: AttributionSource;
  channel: string | null;
  status: string | null;
  startsAt: string | null;
  endsAt: string | null;
  orders: number;
  revenue: number;
  avgTicket: number;
  discountTotal: number;
  itemsCost: number;
  mpFees: number;
  estimatedProfit: number;
  marginPercent: number | null;
  leads: number;
  abandoned: number;
  recovered: number;
  couponsUsed: number;
  campaignId: string | null;
};

export type OriginPerfRow = {
  source: string;
  medium: string;
  context: string;
  orders: number;
  revenue: number;
  avgTicket: number;
  leads: number;
  abandoned: number;
  recovered: number;
  estimatedProfit: number;
  marginPercent: number | null;
  ordersB2B: number;
  ordersB2C: number;
};

export type AttributedOrderRow = {
  id: string;
  order_number: number | string;
  created_at: string;
  customer: string;
  order_type: string;
  campaignLabel: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  origin_context: string | null;
  revenue: number;
  discount: number;
  mpFee: number;
  estimatedProfit: number;
  marginPercent: number | null;
  calcStatus: "ok" | "sem_custo" | "parcial";
};

export type AttributionQuality = {
  totalOrders: number;
  withUtm: number;
  withCampaign: number;
  withCouponCampaign: number;
  unattributed: number;
  attributionRate: number;
};

// ============================================================
// Server functions
// ============================================================

export const getCampaignCards = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input) => FiltersSchema.parse(input))
  .handler(async ({ data }) => {
    const range = resolveRange(data);
    const orders = await fetchPaidOrders(data, range);
    const ids = orders.map((o) => o.id);
    const items = await fetchItemsCostForOrders(ids);
    const campaigns = await fetchActiveCampaigns();
    const couponMap = await fetchCouponCampaignMap(campaigns);
    const leadsMap = await fetchLeadsByCampaign(range);
    const abMap = await fetchAbandonedByCampaign(range);

    // custos por pedido
    const costByOrder = new Map<string, number>();
    for (const it of items) {
      costByOrder.set(it.order_id, (costByOrder.get(it.order_id) ?? 0) + num(it.total_cost));
    }

    let attributedRevenue = 0;
    let attributedOrders = 0;
    let unattributedOrders = 0;
    let totalRevenueAttributed = 0;
    let totalProfit = 0;

    const byCampaign = new Map<string, { label: string; revenue: number; profit: number }>();
    const byOriginOrders = new Map<string, { label: string; count: number }>();

    for (const o of orders) {
      const att = pickAttribution(o, couponMap);
      const rev = num(o.total);
      const fee = feeOf(o);
      const cost = costByOrder.get(o.id) ?? 0;
      const profit = rev - fee - cost - num(o.shipping_cost);
      if (att.source === "none") {
        unattributedOrders += 1;
      } else {
        attributedOrders += 1;
        attributedRevenue += rev;
        totalRevenueAttributed += rev;
        totalProfit += profit;
        const cur = byCampaign.get(att.campaignKey!) ?? {
          label: att.campaignLabel,
          revenue: 0,
          profit: 0,
        };
        cur.revenue += rev;
        cur.profit += profit;
        byCampaign.set(att.campaignKey!, cur);
      }
      const ob = originBucket(o);
      const okey = `${ob.source}|${ob.medium}`;
      const oc = byOriginOrders.get(okey) ?? { label: `${ob.source} / ${ob.medium}`, count: 0 };
      oc.count += 1;
      byOriginOrders.set(okey, oc);
    }

    let topRev: { label: string; revenue: number } | null = null;
    let topMar: { label: string; margin: number } | null = null;
    for (const v of byCampaign.values()) {
      if (!topRev || v.revenue > topRev.revenue) topRev = { label: v.label, revenue: v.revenue };
      const mp = v.revenue > 0 ? (v.profit / v.revenue) * 100 : 0;
      if (!topMar || mp > topMar.margin) topMar = { label: v.label, margin: mp };
    }
    let topOrigin: { label: string; orders: number } | null = null;
    for (const v of byOriginOrders.values()) {
      if (!topOrigin || v.count > topOrigin.orders) topOrigin = { label: v.label, orders: v.count };
    }

    let attributedLeads = 0;
    for (const v of leadsMap.values()) attributedLeads += v.total;
    let attributedAbandoned = 0;
    let recoveredCarts = 0;
    for (const v of abMap.values()) {
      attributedAbandoned += v.abandoned;
      recoveredCarts += v.recovered;
    }

    const totalOrders = orders.length;
    const attributionRate = totalOrders === 0 ? 0 : (attributedOrders / totalOrders) * 100;
    const avgTicket = attributedOrders === 0 ? 0 : totalRevenueAttributed / attributedOrders;
    const estimatedMargin =
      totalRevenueAttributed === 0 ? 0 : (totalProfit / totalRevenueAttributed) * 100;

    const cards: CampaignCards = {
      attributedRevenue,
      attributedOrders,
      attributedLeads,
      attributedAbandoned,
      recoveredCarts,
      avgTicketAttributed: avgTicket,
      estimatedMargin,
      topRevenueCampaign: topRev,
      topMarginCampaign: topMar,
      topOriginByOrders: topOrigin,
      unattributedOrders,
      attributionRate,
    };
    return cards;
  });

export const getCampaignPerformance = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input) => FiltersSchema.parse(input))
  .handler(async ({ data }) => {
    const range = resolveRange(data);
    const orders = await fetchPaidOrders(data, range);
    const ids = orders.map((o) => o.id);
    const items = await fetchItemsCostForOrders(ids);
    const campaigns = await fetchActiveCampaigns();
    const couponMap = await fetchCouponCampaignMap(campaigns);
    const leadsMap = await fetchLeadsByCampaign(range);
    const abMap = await fetchAbandonedByCampaign(range);

    const costByOrder = new Map<string, number>();
    for (const it of items) {
      costByOrder.set(it.order_id, (costByOrder.get(it.order_id) ?? 0) + num(it.total_cost));
    }

    type Agg = {
      label: string;
      source: AttributionSource;
      orders: number;
      revenue: number;
      discount: number;
      itemsCost: number;
      mpFees: number;
      profit: number;
      coupons: Set<string>;
    };
    const map = new Map<string, Agg>();
    for (const o of orders) {
      const att = pickAttribution(o, couponMap);
      if (data.attribution === "attributed" && att.source === "none") continue;
      if (data.attribution === "unattributed" && att.source !== "none") continue;
      const key = att.campaignKey ?? "__none__";
      const cur = map.get(key) ?? {
        label: att.campaignLabel,
        source: att.source,
        orders: 0,
        revenue: 0,
        discount: 0,
        itemsCost: 0,
        mpFees: 0,
        profit: 0,
        coupons: new Set<string>(),
      };
      const rev = num(o.total);
      const fee = feeOf(o);
      const cost = costByOrder.get(o.id) ?? 0;
      cur.orders += 1;
      cur.revenue += rev;
      cur.discount += num(o.discount);
      cur.itemsCost += cost;
      cur.mpFees += fee;
      cur.profit += rev - fee - cost - num(o.shipping_cost);
      const code = safeStr(o.coupon_code);
      if (code) cur.coupons.add(code.toUpperCase());
      map.set(key, cur);
    }

    // Enriquecer com metadados de campanha cadastrada (match por utm_campaign label)
    const campMetaByLabel = new Map<string, CampaignRow>();
    for (const c of campaigns) {
      const label = safeStr(c.utm_campaign) ?? c.name;
      campMetaByLabel.set(label.toLowerCase(), c);
    }

    const rows: CampaignPerfRow[] = Array.from(map.entries()).map(([key, v]) => {
      const meta = campMetaByLabel.get(v.label.toLowerCase()) ?? null;
      const labelKey = v.label.toLowerCase();
      const lead = leadsMap.get(labelKey) ?? { total: 0, hot: 0, won: 0, lost: 0 };
      const ab = abMap.get(labelKey) ?? { abandoned: 0, recovered: 0, abandonedValue: 0 };
      return {
        campaignKey: key,
        campaignLabel: v.label,
        source: v.source,
        channel: meta?.channel ?? null,
        status: meta?.status ?? null,
        startsAt: meta?.starts_at ?? null,
        endsAt: meta?.ends_at ?? null,
        orders: v.orders,
        revenue: v.revenue,
        avgTicket: v.orders === 0 ? 0 : v.revenue / v.orders,
        discountTotal: v.discount,
        itemsCost: v.itemsCost,
        mpFees: v.mpFees,
        estimatedProfit: v.profit,
        marginPercent: v.revenue === 0 ? null : (v.profit / v.revenue) * 100,
        leads: lead.total,
        abandoned: ab.abandoned,
        recovered: ab.recovered,
        couponsUsed: v.coupons.size,
        campaignId: meta?.id ?? null,
      };
    });
    rows.sort((a, b) => b.revenue - a.revenue);
    return rows;
  });

export const getOriginPerformance = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input) => FiltersSchema.parse(input))
  .handler(async ({ data }) => {
    const range = resolveRange(data);
    const orders = await fetchPaidOrders(data, range);
    const ids = orders.map((o) => o.id);
    const items = await fetchItemsCostForOrders(ids);

    const costByOrder = new Map<string, number>();
    for (const it of items) {
      costByOrder.set(it.order_id, (costByOrder.get(it.order_id) ?? 0) + num(it.total_cost));
    }

    type OAgg = {
      source: string;
      medium: string;
      context: string;
      orders: number;
      revenue: number;
      profit: number;
      ordersB2B: number;
      ordersB2C: number;
    };
    const map = new Map<string, OAgg>();
    for (const o of orders) {
      const ob = originBucket(o);
      const key = `${ob.source}|${ob.medium}|${ob.context}`;
      const cur = map.get(key) ?? {
        source: ob.source,
        medium: ob.medium,
        context: ob.context,
        orders: 0,
        revenue: 0,
        profit: 0,
        ordersB2B: 0,
        ordersB2C: 0,
      };
      const rev = num(o.total);
      const fee = feeOf(o);
      const cost = costByOrder.get(o.id) ?? 0;
      cur.orders += 1;
      cur.revenue += rev;
      cur.profit += rev - fee - cost - num(o.shipping_cost);
      if (o.order_type === "b2b") cur.ordersB2B += 1;
      else cur.ordersB2C += 1;
      map.set(key, cur);
    }

    // Lead/abandoned por origem (utm_source) — agregar separadamente
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: leadsData } = await supabaseAdmin
      .from("leads")
      .select("utm_source, utm_medium")
      .gte("created_at", range.from.toISOString())
      .lte("created_at", range.to.toISOString())
      .limit(5000);
    const leadCount = new Map<string, number>();
    for (const r of leadsData ?? []) {
      const k = `${safeStr((r as { utm_source: string | null }).utm_source) ?? "sem atribuição"}|${
        safeStr((r as { utm_medium: string | null }).utm_medium) ?? "—"
      }`;
      leadCount.set(k, (leadCount.get(k) ?? 0) + 1);
    }
    const abData = await fetchAllRows<Record<string, unknown>>((fromIdx, toIdx) =>
      supabaseAdmin
        .from("abandoned_carts")
        .select("utm_source, utm_medium, recovered_at")
        .gte("abandoned_at", range.from.toISOString())
        .lte("abandoned_at", range.to.toISOString())
        .range(fromIdx, toIdx),
    );
    const abCount = new Map<string, { ab: number; rec: number }>();
    for (const r of abData ?? []) {
      const row = r as {
        utm_source: string | null;
        utm_medium: string | null;
        recovered_at: string | null;
      };
      const k = `${safeStr(row.utm_source) ?? "sem atribuição"}|${safeStr(row.utm_medium) ?? "—"}`;
      const cur = abCount.get(k) ?? { ab: 0, rec: 0 };
      cur.ab += 1;
      if (row.recovered_at) cur.rec += 1;
      abCount.set(k, cur);
    }

    const rows: OriginPerfRow[] = Array.from(map.values()).map((v) => {
      const k2 = `${v.source}|${v.medium}`;
      const lc = leadCount.get(k2) ?? 0;
      const ac = abCount.get(k2) ?? { ab: 0, rec: 0 };
      return {
        source: v.source,
        medium: v.medium,
        context: v.context,
        orders: v.orders,
        revenue: v.revenue,
        avgTicket: v.orders === 0 ? 0 : v.revenue / v.orders,
        leads: lc,
        abandoned: ac.ab,
        recovered: ac.rec,
        estimatedProfit: v.profit,
        marginPercent: v.revenue === 0 ? null : (v.profit / v.revenue) * 100,
        ordersB2B: v.ordersB2B,
        ordersB2C: v.ordersB2C,
      };
    });
    rows.sort((a, b) => b.revenue - a.revenue);
    return rows;
  });

const PageSchema = FiltersSchema.extend({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const getAttributedOrders = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input) => PageSchema.parse(input))
  .handler(async ({ data }) => {
    const range = resolveRange(data);
    const orders = await fetchPaidOrders(data, range);
    const ids = orders.map((o) => o.id);
    const items = await fetchItemsCostForOrders(ids);
    const campaigns = await fetchActiveCampaigns();
    const couponMap = await fetchCouponCampaignMap(campaigns);

    const costByOrder = new Map<string, number>();
    const sourceByOrder = new Map<string, string>();
    for (const it of items) {
      costByOrder.set(it.order_id, (costByOrder.get(it.order_id) ?? 0) + num(it.total_cost));
      if (it.cost_source && it.cost_source !== "none") sourceByOrder.set(it.order_id, "ok");
      else if (!sourceByOrder.has(it.order_id)) sourceByOrder.set(it.order_id, "sem_custo");
    }

    const filtered: AttributedOrderRow[] = [];
    for (const o of orders) {
      const att = pickAttribution(o, couponMap);
      if (data.attribution === "attributed" && att.source === "none") continue;
      if (data.attribution === "unattributed" && att.source !== "none") continue;
      const rev = num(o.total);
      const fee = feeOf(o);
      const cost = costByOrder.get(o.id) ?? 0;
      const profit = rev - fee - cost - num(o.shipping_cost);
      const cs = sourceByOrder.get(o.id) ?? "sem_custo";
      filtered.push({
        id: o.id,
        order_number: o.order_number,
        created_at: o.created_at,
        customer: o.company_name ?? o.customer_name ?? "—",
        order_type: o.order_type,
        campaignLabel: att.campaignLabel,
        utm_source: o.utm_source,
        utm_medium: o.utm_medium,
        utm_campaign: o.utm_campaign,
        utm_content: o.utm_content,
        utm_term: o.utm_term,
        origin_context: o.origin_context,
        revenue: rev,
        discount: num(o.discount),
        mpFee: fee,
        estimatedProfit: profit,
        marginPercent: rev === 0 ? null : (profit / rev) * 100,
        calcStatus: cs === "ok" ? "ok" : "sem_custo",
      });
    }

    const total = filtered.length;
    const start = (data.page - 1) * data.pageSize;
    const slice = filtered.slice(start, start + data.pageSize);
    return { rows: slice, total, page: data.page, pageSize: data.pageSize };
  });

export const getAttributionQuality = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input) => FiltersSchema.parse(input))
  .handler(async ({ data }) => {
    const range = resolveRange(data);
    const orders = await fetchPaidOrders(data, range);
    const campaigns = await fetchActiveCampaigns();
    const couponMap = await fetchCouponCampaignMap(campaigns);

    let withUtm = 0;
    let withCampaign = 0;
    let withCoupon = 0;
    let unattributed = 0;
    for (const o of orders) {
      if (safeStr(o.utm_source) || safeStr(o.utm_campaign) || safeStr(o.utm_medium)) withUtm += 1;
      const att = pickAttribution(o, couponMap);
      if (att.source === "utm_campaign") withCampaign += 1;
      else if (att.source === "coupon_campaign") withCoupon += 1;
      else if (att.source === "none") unattributed += 1;
    }
    const total = orders.length;
    const result: AttributionQuality = {
      totalOrders: total,
      withUtm,
      withCampaign,
      withCouponCampaign: withCoupon,
      unattributed,
      attributionRate: total === 0 ? 0 : ((total - unattributed) / total) * 100,
    };
    return result;
  });

// ============================================================
// CSV Exports
// ============================================================

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(csvEscape).join(";")];
  for (const r of rows) lines.push(r.map(csvEscape).join(";"));
  return "\uFEFF" + lines.join("\n");
}
function brl(n: number) {
  return n.toFixed(2).replace(".", ",");
}

export const exportCampaignPerformanceCsv = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input) => FiltersSchema.parse(input))
  .handler(async ({ data }) => {
    const rows = await getCampaignPerformance({ data });
    const headers = [
      "Campanha",
      "Atribuição",
      "Status",
      "Canal",
      "Pedidos",
      "Receita",
      "Ticket médio",
      "Desconto",
      "Custo dos produtos",
      "Taxas Mercado Pago",
      "Lucro estimado",
      "Margem %",
      "Leads",
      "Abandonados",
      "Recuperados",
      "Cupons",
    ];
    const body = rows.map((r) => [
      r.campaignLabel,
      r.source,
      r.status ?? "",
      r.channel ?? "",
      r.orders,
      brl(r.revenue),
      brl(r.avgTicket),
      brl(r.discountTotal),
      brl(r.itemsCost),
      brl(r.mpFees),
      brl(r.estimatedProfit),
      r.marginPercent == null ? "" : r.marginPercent.toFixed(2).replace(".", ","),
      r.leads,
      r.abandoned,
      r.recovered,
      r.couponsUsed,
    ]);
    return { content: toCsv(headers, body), filename: `campanhas_${Date.now()}.csv` };
  });

export const exportOriginPerformanceCsv = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input) => FiltersSchema.parse(input))
  .handler(async ({ data }) => {
    const rows = await getOriginPerformance({ data });
    const headers = [
      "Origem",
      "Meio",
      "Contexto",
      "Pedidos",
      "Receita",
      "Ticket médio",
      "Leads",
      "Abandonados",
      "Recuperados",
      "Lucro estimado",
      "Margem %",
      "Pedidos B2B",
      "Pedidos B2C",
    ];
    const body = rows.map((r) => [
      r.source,
      r.medium,
      r.context,
      r.orders,
      brl(r.revenue),
      brl(r.avgTicket),
      r.leads,
      r.abandoned,
      r.recovered,
      brl(r.estimatedProfit),
      r.marginPercent == null ? "" : r.marginPercent.toFixed(2).replace(".", ","),
      r.ordersB2B,
      r.ordersB2C,
    ]);
    return { content: toCsv(headers, body), filename: `origens_${Date.now()}.csv` };
  });

export const exportAttributedOrdersCsv = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input) => FiltersSchema.parse(input))
  .handler(async ({ data }) => {
    const res = await getAttributedOrders({
      data: { ...data, page: 1, pageSize: 200 },
    });
    const headers = [
      "Data",
      "Pedido",
      "Cliente",
      "Tipo",
      "Campanha",
      "UTM source",
      "UTM medium",
      "UTM campaign",
      "UTM content",
      "UTM term",
      "Origin context",
      "Receita",
      "Desconto",
      "Taxa Mercado Pago",
      "Lucro estimado",
      "Margem %",
      "Status do cálculo",
    ];
    const body = res.rows.map((r) => [
      r.created_at,
      `#${r.order_number}`,
      r.customer,
      r.order_type,
      r.campaignLabel,
      r.utm_source ?? "",
      r.utm_medium ?? "",
      r.utm_campaign ?? "",
      r.utm_content ?? "",
      r.utm_term ?? "",
      r.origin_context ?? "",
      brl(r.revenue),
      brl(r.discount),
      brl(r.mpFee),
      brl(r.estimatedProfit),
      r.marginPercent == null ? "" : r.marginPercent.toFixed(2).replace(".", ","),
      r.calcStatus,
    ]);
    return { content: toCsv(headers, body), filename: `pedidos_atribuidos_${Date.now()}.csv` };
  });

export const exportAttributionQualityCsv = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input) => FiltersSchema.parse(input))
  .handler(async ({ data }) => {
    const q = await getAttributionQuality({ data });
    const headers = ["Indicador", "Valor"];
    const body: Array<[string, string | number]> = [
      ["Total de pedidos", q.totalOrders],
      ["Pedidos com UTM", q.withUtm],
      ["Pedidos com campanha (UTM)", q.withCampaign],
      ["Pedidos atribuídos por cupom", q.withCouponCampaign],
      ["Pedidos sem atribuição", q.unattributed],
      ["Taxa de atribuição (%)", q.attributionRate.toFixed(2).replace(".", ",")],
    ];
    return {
      content: toCsv(headers, body),
      filename: `qualidade_atribuicao_${Date.now()}.csv`,
    };
  });
