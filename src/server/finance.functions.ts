import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

async function getSupabaseAdmin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

// ============================================================
// Tipos compartilhados (cliente pode importar destes apenas tipos)
// ============================================================

export type FinanceSettings = {
  id: string;
  default_min_margin_percent: number;
  consider_shipping_in_margin: boolean;
  consider_coupon_in_margin: boolean;
  consider_b2b_discount_in_margin: boolean;
  critical_margin_alert_enabled: boolean;
  critical_margin_threshold_percent: number;
  mp_fee_pix_percent: number;
  mp_fee_pix_fixed: number;
  mp_fee_credit_percent: number;
  mp_fee_credit_fixed: number;
  mp_fee_boleto_percent: number;
  mp_fee_boleto_fixed: number;
  mp_fee_default_percent: number;
  default_currency: string;
};

export type FinanceOverview = {
  rangeFrom: string;
  rangeTo: string;
  ordersPaid: number;
  ordersPending: number;
  grossRevenue: number;
  estimatedNetRevenue: number;
  averageTicket: number;
  totalDiscounts: number;
  couponDiscounts: number;
  b2bDiscounts: number;
  shippingCharged: number;
  estimatedPaymentFees: number;
  estimatedCogs: number;
  estimatedGrossMargin: number;
  estimatedGrossProfit: number;
  estimatedMarginPercent: number;
  itemsWithoutCost: number;
};

export type FinanceMarginRow = {
  id: string;
  name: string;
  sku: string | null;
  active: boolean;
  category_name: string | null;
  price: number | null;
  sale_price: number | null;
  b2b_price: number | null;
  cost_price: number | null;
  min_margin_percent: number | null;
  effective_min_margin_percent: number;
  margin_amount: number | null;
  margin_percent: number | null;
  b2b_margin_amount: number | null;
  b2b_margin_percent: number | null;
  status: "good" | "attention" | "critical" | "no_cost";
  b2b_status: "good" | "attention" | "critical" | "no_cost" | "na";
  qty_sold: number;
  gross_profit: number;
};

// ============================================================
// finance_settings (singleton)
// ============================================================

async function loadSettings(): Promise<FinanceSettings> {
  const supabaseAdmin = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("finance_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("finance_settings ausente");
  return data as unknown as FinanceSettings;
}

export const getFinanceSettings = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => loadSettings());

const SettingsInput = z.object({
  default_min_margin_percent: z.number().min(0).max(100),
  consider_shipping_in_margin: z.boolean(),
  consider_coupon_in_margin: z.boolean(),
  consider_b2b_discount_in_margin: z.boolean(),
  critical_margin_alert_enabled: z.boolean(),
  critical_margin_threshold_percent: z.number().min(-100).max(100),
  mp_fee_pix_percent: z.number().min(0).max(100),
  mp_fee_pix_fixed: z.number().min(0).max(100),
  mp_fee_credit_percent: z.number().min(0).max(100),
  mp_fee_credit_fixed: z.number().min(0).max(100),
  mp_fee_boleto_percent: z.number().min(0).max(100),
  mp_fee_boleto_fixed: z.number().min(0).max(100),
  mp_fee_default_percent: z.number().min(0).max(100),
});

export const updateFinanceSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => SettingsInput.parse(input))
  .handler(async ({ data }) => {
    const supabaseAdmin = await getSupabaseAdmin();
    const current = await loadSettings();
    const { error } = await supabaseAdmin
      .from("finance_settings")
      .update(data as never)
      .eq("id", current.id);
    if (error) throw new Error(error.message);
    return loadSettings();
  });

// ============================================================
// Helpers de taxa estimada Mercado Pago
// ============================================================

function estimateFee(method: string | null, gross: number, s: FinanceSettings): number {
  if (gross <= 0) return 0;
  let pct = s.mp_fee_default_percent;
  let fixed = 0;
  const m = (method ?? "").toLowerCase();
  if (m.includes("pix")) {
    pct = s.mp_fee_pix_percent;
    fixed = s.mp_fee_pix_fixed;
  } else if (m.includes("credit") || m.includes("cart") || m.includes("card")) {
    pct = s.mp_fee_credit_percent;
    fixed = s.mp_fee_credit_fixed;
  } else if (m.includes("bol") || m.includes("ticket")) {
    pct = s.mp_fee_boleto_percent;
    fixed = s.mp_fee_boleto_fixed;
  }
  return Number(((gross * pct) / 100 + fixed).toFixed(2));
}

// ============================================================
// Resumo financeiro por período
// ============================================================

const RangeInput = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  preset: z
    .enum(["today", "yesterday", "last_7_days", "this_month", "last_month", "custom"])
    .default("last_7_days"),
  orderType: z.enum(["all", "b2c", "b2b"]).default("all"),
});

function resolveRange(preset: string, from?: string, to?: string): { from: string; to: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  let f = startOfDay(now);
  let t = endOfDay(now);
  switch (preset) {
    case "today":
      break;
    case "yesterday": {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      f = startOfDay(d);
      t = endOfDay(d);
      break;
    }
    case "last_7_days": {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      f = startOfDay(d);
      break;
    }
    case "this_month":
      f = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "last_month": {
      f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      t = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      break;
    }
    case "custom":
      if (from) f = new Date(from);
      if (to) t = new Date(to);
      break;
  }
  return { from: f.toISOString(), to: t.toISOString() };
}

export const getFinanceOverview = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => RangeInput.parse(input))
  .handler(async ({ data }): Promise<FinanceOverview> => {
    const supabaseAdmin = await getSupabaseAdmin();
    const settings = await loadSettings();
    const { from, to } = resolveRange(data.preset, data.from, data.to);

    const orders = await fetchAllRows<Record<string, unknown>>((fromIdx, toIdx) => {
      let q = supabaseAdmin
        .from("orders")
        .select(
          "id, payment_status, total, subtotal, discount, shipping_cost, coupon_code, b2b_discount_total, order_type, payment_method, created_at, paid_at",
        )
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: false })
        .range(fromIdx, toIdx);

      if (data.orderType === "b2b") q = q.eq("order_type", "b2b");
      else if (data.orderType === "b2c") q = q.eq("order_type", "b2c");
      return q;
    });

    const list = (orders ?? []) as unknown as Array<{
      id: string;
      payment_status: string | null;
      total: number | null;
      subtotal: number | null;
      discount: number | null;
      shipping_cost: number | null;
      coupon_code: string | null;
      b2b_discount_total: number | null;
      payment_method: string | null;
    }>;


    const paid = list.filter((o) => o.payment_status === "paid" || o.payment_status === "approved");
    const ordersPaid = paid.length;
    const ordersPending = list.filter((o) => o.payment_status === "pending").length;
    const grossRevenue = paid.reduce((s, o) => s + Number(o.total ?? 0), 0);
    const couponDiscounts = paid
      .filter((o) => o.coupon_code)
      .reduce((s, o) => s + Number(o.discount ?? 0), 0);
    const b2bDiscounts = paid.reduce((s, o) => s + Number(o.b2b_discount_total ?? 0), 0);
    const totalDiscounts = paid.reduce((s, o) => s + Number(o.discount ?? 0), 0) + b2bDiscounts;
    const shippingCharged = paid.reduce((s, o) => s + Number(o.shipping_cost ?? 0), 0);
    const estimatedPaymentFees = paid.reduce(
      (s, o) => s + estimateFee(o.payment_method, Number(o.total ?? 0), settings),
      0,
    );

    // COGS — soma de total_cost dos itens dos pedidos pagos
    let estimatedCogs = 0;
    let itemsWithoutCost = 0;
    if (paid.length > 0) {
      const { data: items, error: itErr } = await supabaseAdmin
        .from("order_items")
        .select("order_id, total_cost, cost_source")
        .in(
          "order_id",
          paid.map((p) => p.id),
        );
      if (itErr) throw new Error(itErr.message);
      for (const it of items ?? []) {
        if ((it as { cost_source?: string }).cost_source === "none") itemsWithoutCost += 1;
        estimatedCogs += Number((it as { total_cost?: number | null }).total_cost ?? 0);
      }
    }

    const estimatedNetRevenue = Number((grossRevenue - estimatedPaymentFees).toFixed(2));
    const estimatedGrossMargin = Number((grossRevenue - estimatedCogs).toFixed(2));
    const estimatedGrossProfit = Number(
      (grossRevenue - estimatedCogs - estimatedPaymentFees).toFixed(2),
    );
    const estimatedMarginPercent =
      grossRevenue > 0 ? Number(((estimatedGrossMargin / grossRevenue) * 100).toFixed(2)) : 0;
    const averageTicket = ordersPaid > 0 ? Number((grossRevenue / ordersPaid).toFixed(2)) : 0;

    return {
      rangeFrom: from,
      rangeTo: to,
      ordersPaid,
      ordersPending,
      grossRevenue: Number(grossRevenue.toFixed(2)),
      estimatedNetRevenue,
      averageTicket,
      totalDiscounts: Number(totalDiscounts.toFixed(2)),
      couponDiscounts: Number(couponDiscounts.toFixed(2)),
      b2bDiscounts: Number(b2bDiscounts.toFixed(2)),
      shippingCharged: Number(shippingCharged.toFixed(2)),
      estimatedPaymentFees: Number(estimatedPaymentFees.toFixed(2)),
      estimatedCogs: Number(estimatedCogs.toFixed(2)),
      estimatedGrossMargin,
      estimatedGrossProfit,
      estimatedMarginPercent,
      itemsWithoutCost,
    };
  });

// ============================================================
// Lista de margem por produto
// ============================================================

const MarginListInput = z.object({
  search: z.string().max(120).optional(),
  status: z.enum(["all", "good", "attention", "critical", "no_cost"]).default("all"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(10).max(200).default(50),
});

function classify(percent: number | null, minPercent: number, criticalPct: number) {
  if (percent === null) return "no_cost" as const;
  if (percent < criticalPct) return "critical" as const;
  if (percent < minPercent) return "attention" as const;
  return "good" as const;
}

export const getFinanceMargin = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => MarginListInput.parse(input))
  .handler(async ({ data }) => {
    const supabaseAdmin = await getSupabaseAdmin();
    const settings = await loadSettings();
    const min = settings.default_min_margin_percent;
    const crit = settings.critical_margin_threshold_percent;

    let q = supabaseAdmin
      .from("products")
      .select(
        "id, name, sku, active, price, sale_price, b2b_price, cost_price, min_margin_percent, category_id",
        { count: "exact" },
      )
      .order("name", { ascending: true });

    if (data.search && data.search.trim()) {
      const s = `%${data.search.trim()}%`;
      q = q.or(`name.ilike.${s},sku.ilike.${s}`);
    }

    const fromIdx = (data.page - 1) * data.pageSize;
    q = q.range(fromIdx, fromIdx + data.pageSize - 1);

    const { data: products, error, count } = await q;
    if (error) throw new Error(error.message);
    const list = (products ?? []) as Array<{
      id: string;
      name: string;
      sku: string | null;
      active: boolean;
      price: number | null;
      sale_price: number | null;
      b2b_price: number | null;
      cost_price: number | null;
      min_margin_percent: number | null;
      category_id: string | null;
    }>;

    // Categorias (para nomes)
    const catIds = Array.from(new Set(list.map((p) => p.category_id).filter(Boolean) as string[]));
    const catMap = new Map<string, string>();
    if (catIds.length > 0) {
      const { data: cats } = await supabaseAdmin
        .from("categories")
        .select("id, name")
        .in("id", catIds);
      for (const c of cats ?? []) catMap.set(c.id as string, (c as { name: string }).name);
    }

    // Quantidade vendida + lucro bruto (apenas pedidos pagos)
    const ids = list.map((p) => p.id);
    const sales = new Map<string, { qty: number; profit: number }>();
    if (ids.length > 0) {
      const { data: items } = await supabaseAdmin
        .from("order_items")
        .select("product_id, qty, gross_margin_amount, orders!inner(payment_status)")
        .in("product_id", ids)
        .in("orders.payment_status", ["paid", "approved"]);
      for (const it of (items ?? []) as Array<{
        product_id: string | null;
        qty: number | null;
        gross_margin_amount: number | null;
      }>) {
        if (!it.product_id) continue;
        const cur = sales.get(it.product_id) ?? { qty: 0, profit: 0 };
        cur.qty += Number(it.qty ?? 0);
        cur.profit += Number(it.gross_margin_amount ?? 0);
        sales.set(it.product_id, cur);
      }
    }

    const rows: FinanceMarginRow[] = list.map((p) => {
      const sellPrice = Number(p.sale_price ?? p.price ?? 0);
      const cost = p.cost_price != null ? Number(p.cost_price) : null;
      const effectiveMin = p.min_margin_percent != null ? Number(p.min_margin_percent) : min;
      const marginAmount = cost != null ? Number((sellPrice - cost).toFixed(2)) : null;
      const marginPercent =
        cost != null && sellPrice > 0
          ? Number((((sellPrice - cost) / sellPrice) * 100).toFixed(2))
          : null;
      const status = classify(marginPercent, effectiveMin, crit);

      const b2bPrice = p.b2b_price != null ? Number(p.b2b_price) : null;
      const b2bMarginAmount =
        cost != null && b2bPrice != null ? Number((b2bPrice - cost).toFixed(2)) : null;
      const b2bMarginPercent =
        cost != null && b2bPrice != null && b2bPrice > 0
          ? Number((((b2bPrice - cost) / b2bPrice) * 100).toFixed(2))
          : null;
      const b2bStatus = b2bPrice == null ? "na" : classify(b2bMarginPercent, effectiveMin, crit);

      const sale = sales.get(p.id) ?? { qty: 0, profit: 0 };

      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        active: p.active,
        category_name: p.category_id ? (catMap.get(p.category_id) ?? null) : null,
        price: p.price != null ? Number(p.price) : null,
        sale_price: p.sale_price != null ? Number(p.sale_price) : null,
        b2b_price: b2bPrice,
        cost_price: cost,
        min_margin_percent: p.min_margin_percent != null ? Number(p.min_margin_percent) : null,
        effective_min_margin_percent: effectiveMin,
        margin_amount: marginAmount,
        margin_percent: marginPercent,
        b2b_margin_amount: b2bMarginAmount,
        b2b_margin_percent: b2bMarginPercent,
        status,
        b2b_status: b2bStatus,
        qty_sold: sale.qty,
        gross_profit: Number(sale.profit.toFixed(2)),
      };
    });

    const filtered = data.status === "all" ? rows : rows.filter((r) => r.status === data.status);

    return {
      rows: filtered,
      page: data.page,
      pageSize: data.pageSize,
      total: count ?? rows.length,
    };
  });

// ============================================================
// Atualizar custo / margem mínima de um produto (admin)
// ============================================================

const ProductCostInput = z.object({
  productId: z.string().uuid(),
  cost_price: z.number().min(0).max(99999999).nullable(),
  min_margin_percent: z.number().min(0).max(100).nullable(),
});

export const updateProductCost = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => ProductCostInput.parse(input))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: prev } = await supabaseAdmin
      .from("products")
      .select("name, cost_price, min_margin_percent")
      .eq("id", data.productId)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("products")
      .update({
        cost_price: data.cost_price,
        min_margin_percent: data.min_margin_percent,
      } as never)
      .eq("id", data.productId);
    if (error) throw new Error(error.message);
    try {
      const { logAdminAction } = await import("./security/auditLog");
      const ctx = context as { adminUserId?: string; adminEmail?: string | null } | undefined;
      const productName = (prev as { name?: string } | null)?.name ?? "Produto";
      await logAdminAction({
        adminId: ctx?.adminUserId ?? "00000000-0000-0000-0000-000000000000",
        adminEmail: ctx?.adminEmail ?? null,
        action: "product_cost_updated",
        resourceType: "product_cost",
        resourceId: data.productId,
        description: `Custo/margem mínima de "${productName}" atualizado.`,
        before: {
          cost_price: (prev as { cost_price?: number | null } | null)?.cost_price ?? null,
          min_margin_percent:
            (prev as { min_margin_percent?: number | null } | null)?.min_margin_percent ?? null,
        },
        after: { cost_price: data.cost_price, min_margin_percent: data.min_margin_percent },
      });
    } catch {
      // auditoria nunca quebra
    }
    return { ok: true as const };
  });

// ============================================================
// Resumo financeiro de UM pedido (bloco do detalhe do pedido)
// ============================================================

const OrderFinanceInput = z.object({ orderId: z.string().uuid() });

export type OrderFinanceSummary = {
  orderId: string;
  subtotal: number;
  couponDiscount: number;
  b2bDiscount: number;
  shipping: number;
  estimatedPaymentFee: number;
  estimatedCogs: number;
  grossMarginAmount: number;
  grossMarginPercent: number;
  estimatedGrossProfit: number;
  hasMissingCost: boolean;
  isB2b: boolean;
  paymentMethod: string | null;
};

export const getOrderFinance = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => OrderFinanceInput.parse(input))
  .handler(async ({ data }): Promise<OrderFinanceSummary> => {
    const supabaseAdmin = await getSupabaseAdmin();
    const settings = await loadSettings();
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, total, subtotal, discount, shipping_cost, coupon_code, b2b_discount_total, payment_method, order_type",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Pedido não encontrado");

    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("total_price, total_cost, cost_source")
      .eq("order_id", data.orderId);

    let cogs = 0;
    let hasMissingCost = false;
    for (const it of (items ?? []) as Array<{
      total_cost: number | null;
      cost_source: string | null;
    }>) {
      if (it.cost_source === "none") hasMissingCost = true;
      cogs += Number(it.total_cost ?? 0);
    }

    const total = Number((order as { total: number | null }).total ?? 0);
    const fee = estimateFee(
      (order as { payment_method: string | null }).payment_method,
      total,
      settings,
    );
    const couponDiscount = (order as { coupon_code: string | null }).coupon_code
      ? Number((order as { discount: number | null }).discount ?? 0)
      : 0;
    const b2bDiscount = Number(
      (order as { b2b_discount_total: number | null }).b2b_discount_total ?? 0,
    );
    const shipping = Number((order as { shipping_cost: number | null }).shipping_cost ?? 0);
    const subtotal = Number((order as { subtotal: number | null }).subtotal ?? 0);

    const grossMarginAmount = Number((total - cogs).toFixed(2));
    const grossMarginPercent =
      total > 0 ? Number(((grossMarginAmount / total) * 100).toFixed(2)) : 0;
    const estimatedGrossProfit = Number((grossMarginAmount - fee).toFixed(2));

    return {
      orderId: data.orderId,
      subtotal,
      couponDiscount,
      b2bDiscount,
      shipping,
      estimatedPaymentFee: fee,
      estimatedCogs: Number(cogs.toFixed(2)),
      grossMarginAmount,
      grossMarginPercent,
      estimatedGrossProfit,
      hasMissingCost,
      isB2b: (order as { order_type: string | null }).order_type === "b2b",
      paymentMethod: (order as { payment_method: string | null }).payment_method,
    };
  });

// ============================================================
// Contadores rápidos para Painel do Dia
// ============================================================

export type FinanceQuickCounts = {
  productsWithoutCost: number;
  productsBelowMinMargin: number;
  b2bProductsBelowMinMargin: number;
  ordersPaidWithMissingCost: number;
};

export const getFinanceQuickCounts = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<FinanceQuickCounts> => {
    const supabaseAdmin = await getSupabaseAdmin();
    const settings = await loadSettings();
    const min = settings.default_min_margin_percent;

    // Produtos ativos
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id, price, sale_price, b2b_price, cost_price, min_margin_percent")
      .eq("active", true);

    let withoutCost = 0;
    let belowMin = 0;
    let b2bBelowMin = 0;
    for (const p of (products ?? []) as Array<{
      price: number | null;
      sale_price: number | null;
      b2b_price: number | null;
      cost_price: number | null;
      min_margin_percent: number | null;
    }>) {
      if (p.cost_price == null) {
        withoutCost += 1;
        continue;
      }
      const effMin = p.min_margin_percent != null ? Number(p.min_margin_percent) : min;
      const sell = Number(p.sale_price ?? p.price ?? 0);
      if (sell > 0) {
        const pct = ((sell - Number(p.cost_price)) / sell) * 100;
        if (pct < effMin) belowMin += 1;
      }
      if (p.b2b_price != null && Number(p.b2b_price) > 0) {
        const b2bPct = ((Number(p.b2b_price) - Number(p.cost_price)) / Number(p.b2b_price)) * 100;
        if (b2bPct < effMin) b2bBelowMin += 1;
      }
    }

    // Pedidos pagos recentes (últimos 30 dias) com itens sem custo —
    // respeita o "corte de alertas" para ignorar pedidos de teste/homologação.
    const since = new Date();
    since.setDate(since.getDate() - 30);
    let sinceISO = since.toISOString();
    try {
      const { data: fs } = await supabaseAdmin
        .from("finance_settings")
        .select("alerts_baseline_at")
        .limit(1)
        .maybeSingle();
      const baseline = (fs as { alerts_baseline_at?: string } | null)?.alerts_baseline_at;
      if (baseline && baseline > sinceISO) sinceISO = baseline;
    } catch {}
    const { data: missing } = await supabaseAdmin
      .from("order_items")
      .select("order_id, orders!inner(payment_status, paid_at)")
      .eq("cost_source", "none")
      .in("orders.payment_status", ["paid", "approved"])
      .gte("orders.paid_at", sinceISO);
    const orderIds = new Set<string>();
    for (const m of (missing ?? []) as Array<{ order_id: string }>) {
      orderIds.add(m.order_id);
    }

    return {
      productsWithoutCost: withoutCost,
      productsBelowMinMargin: belowMin,
      b2bProductsBelowMinMargin: b2bBelowMin,
      ordersPaidWithMissingCost: orderIds.size,
    };
  });
