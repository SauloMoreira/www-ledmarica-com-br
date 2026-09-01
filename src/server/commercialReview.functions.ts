import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { fetchAllRows } from "@/lib/fetchAllRows";
import {
  computeCommercialReview,
  type CommercialReviewResult,
  type CommercialStatus,
} from "@/lib/commercialReview";

/**
 * Revisão Comercial — Onda 1 + Onda 2.
 *
 * SOMENTE LEITURA. Não altera produtos, preços, B2B, combos, pedidos,
 * checkout, Mercado Pago, frete ou estoque.
 *
 * Onda 2 acrescenta análise baseada em histórico de vendas:
 * - vendidos no período / receita / última venda;
 * - produto parado (ativo + estoque > 0 + sem venda no período inactive_days);
 * - alto giro (vendas no período >= high_movement_min_qty);
 * - alto giro com margem baixa.
 * Janela e limiar reaproveitam stock_settings.
 */

export type CommercialFilter =
  | "all"
  | "no_cost"
  | "no_price"
  | "negative_margin"
  | "critical_margin"
  | "attention_margin"
  | "b2b_critical"
  | "b2b_incomplete"
  | "healthy"
  | "stalled"
  | "high_movement"
  | "high_movement_low_margin"
  | "no_sales_window"
  | "with_sales_window";

export type CommercialSalesInfo = {
  qty_sold_window: number;
  revenue_window: number;
  bundle_discount_window: number;
  orders_count_window: number;
  last_sold_at: string | null;
  days_since_last_sale: number | null;
};

export type CommercialMovementStatus =
  | "high_movement"
  | "with_sales"
  | "stalled"
  | "no_sales_no_stock"
  | "no_sales_yet";

export type CommercialReviewRow = {
  id: string;
  name: string;
  sku: string | null;
  slug: string | null;
  active: boolean;
  category_id: string | null;
  category_name: string | null;
  brand: string | null;
  price: number | null;
  sale_price: number | null;
  cost_price: number | null;
  min_margin_percent: number | null;
  b2b_enabled: boolean | null;
  b2b_price: number | null;
  b2b_min_qty: number | null;
  stock_qty: number;
  sales: CommercialSalesInfo;
  movement: CommercialMovementStatus;
  high_movement_low_margin: boolean;
  review: CommercialReviewResult;
};

export type CommercialReviewSummary = {
  totalActive: number;
  noCost: number;
  noPrice: number;
  negativeMargin: number;
  criticalMargin: number;
  attentionMargin: number;
  b2bCritical: number;
  b2bIncomplete: number;
  healthy: number;
  stalledWithStock: number;
  highMovement: number;
  highMovementLowMargin: number;
  noSalesInWindow: number;
  withSalesInWindow: number;
  revenueInWindow: number;
  defaultMinMarginPercent: number;
  salesWindowDays: number;
  inactiveDaysThreshold: number;
  highMovementMinQty: number;
};

export type CommercialReviewReport = {
  summary: CommercialReviewSummary;
  rows: CommercialReviewRow[];
  page: number;
  pageSize: number;
  total: number;
  filter: CommercialFilter;
  generatedAt: string;
};

export type CommercialFilterOptions = {
  categories: Array<{ id: string; name: string }>;
  brands: string[];
};

const inputSchema = z.object({
  filter: z
    .enum([
      "all",
      "no_cost",
      "no_price",
      "negative_margin",
      "critical_margin",
      "attention_margin",
      "b2b_critical",
      "b2b_incomplete",
      "healthy",
      "stalled",
      "high_movement",
      "high_movement_low_margin",
      "no_sales_window",
      "with_sales_window",
    ])
    .default("all"),
  search: z.string().trim().max(200).optional(),
  categoryId: z.string().uuid().optional(),
  brand: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).max(500).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
});

const exportSchema = inputSchema.extend({
  // Para CSV permitimos limite maior; pageSize é ignorado.
  page: z.number().int().min(1).max(1).default(1),
  pageSize: z.number().int().min(10).max(5000).default(2000),
});

const SALES_WINDOW_FALLBACK = 30;
const INACTIVE_FALLBACK = 60;
const HIGH_MOV_FALLBACK = 10;

async function loadDefaultMinMargin(): Promise<number> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("finance_settings")
      .select("default_min_margin_percent")
      .limit(1)
      .maybeSingle();
    const v = (data as { default_min_margin_percent?: number | string | null } | null)
      ?.default_min_margin_percent;
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? n : 25;
  } catch {
    return 25;
  }
}

async function loadStockSettings(): Promise<{
  salesWindow: number;
  inactiveDays: number;
  highMovementMin: number;
}> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("stock_settings")
      .select("sales_window_days, inactive_days_threshold, high_movement_min_qty")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const r = (data ?? {}) as {
      sales_window_days?: number | null;
      inactive_days_threshold?: number | null;
      high_movement_min_qty?: number | null;
    };
    return {
      salesWindow:
        Number(r.sales_window_days) > 0 ? Number(r.sales_window_days) : SALES_WINDOW_FALLBACK,
      inactiveDays:
        Number(r.inactive_days_threshold) > 0
          ? Number(r.inactive_days_threshold)
          : INACTIVE_FALLBACK,
      highMovementMin:
        Number(r.high_movement_min_qty) >= 0 ? Number(r.high_movement_min_qty) : HIGH_MOV_FALLBACK,
    };
  } catch {
    return {
      salesWindow: SALES_WINDOW_FALLBACK,
      inactiveDays: INACTIVE_FALLBACK,
      highMovementMin: HIGH_MOV_FALLBACK,
    };
  }
}

type SalesAggMap = Map<string, CommercialSalesInfo>;

async function loadSalesAggregates(salesWindow: number): Promise<SalesAggMap> {
  const map: SalesAggMap = new Map();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("get_commercial_sales_aggregate", {
      _sales_window_days: salesWindow,
    });
    if (error) return map;
    type Row = {
      product_id: string;
      qty_sold_window: number | null;
      revenue_window: number | string | null;
      bundle_discount_window: number | string | null;
      orders_count_window: number | null;
      last_sold_at: string | null;
    };
    for (const r of (data ?? []) as Row[]) {
      const lastSold = r.last_sold_at;
      const days = lastSold
        ? Math.floor((Date.now() - new Date(lastSold).getTime()) / 86_400_000)
        : null;
      map.set(r.product_id, {
        qty_sold_window: Number(r.qty_sold_window ?? 0),
        revenue_window: Number(r.revenue_window ?? 0),
        bundle_discount_window: Number(r.bundle_discount_window ?? 0),
        orders_count_window: Number(r.orders_count_window ?? 0),
        last_sold_at: lastSold,
        days_since_last_sale: days,
      });
    }
  } catch {
    /* noop */
  }
  return map;
}

function classifyMovement(args: {
  stock_qty: number;
  qty_sold_window: number;
  high_movement_min_qty: number;
  inactive_days_threshold: number;
  last_sold_at: string | null;
}): CommercialMovementStatus {
  const {
    stock_qty,
    qty_sold_window,
    high_movement_min_qty,
    inactive_days_threshold,
    last_sold_at,
  } = args;
  if (qty_sold_window > 0 && qty_sold_window >= high_movement_min_qty) return "high_movement";
  if (qty_sold_window > 0) return "with_sales";
  // sem venda no período
  const lastDays = last_sold_at
    ? Math.floor((Date.now() - new Date(last_sold_at).getTime()) / 86_400_000)
    : null;
  if (stock_qty > 0) {
    if (lastDays == null || lastDays >= inactive_days_threshold) return "stalled";
    return "with_sales"; // vendeu fora da janela mas dentro do inactive_days
  }
  return last_sold_at ? "no_sales_no_stock" : "no_sales_yet";
}

async function buildEnriched() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [defMin, settings] = await Promise.all([loadDefaultMinMargin(), loadStockSettings()]);
  const salesMap = await loadSalesAggregates(settings.salesWindow);

  let products: unknown[];
  try {
    products = await fetchAllRows((from, to) =>
      supabaseAdmin
        .from("products")
        .select(
          "id, name, sku, slug, active, category_id, brand, price, sale_price, cost_price, min_margin_percent, b2b_enabled, b2b_price, b2b_min_qty, stock_qty, categories:category_id(name)",
        )
        .eq("active", true)
        .range(from, to),
    );
  } catch (e) {
    throw new Error(`Falha ao carregar produtos: ${(e as Error).message}`);
  }


  type Raw = {
    id: string;
    name: string | null;
    sku: string | null;
    slug: string | null;
    active: boolean;
    category_id: string | null;
    brand: string | null;
    price: number | null;
    sale_price: number | null;
    cost_price: number | null;
    min_margin_percent: number | null;
    b2b_enabled: boolean | null;
    b2b_price: number | null;
    b2b_min_qty: number | null;
    stock_qty: number | null;
    categories: { name: string | null } | { name: string | null }[] | null;
  };

  const enriched: CommercialReviewRow[] = [];
  for (const raw of products as Raw[]) {
    const review = computeCommercialReview(
      {
        id: raw.id,
        name: raw.name,
        sku: raw.sku,
        price: raw.price,
        sale_price: raw.sale_price,
        cost_price: raw.cost_price,
        min_margin_percent: raw.min_margin_percent,
        b2b_enabled: raw.b2b_enabled,
        b2b_price: raw.b2b_price,
        b2b_min_qty: raw.b2b_min_qty,
      },
      defMin,
    );

    const sales: CommercialSalesInfo = salesMap.get(raw.id) ?? {
      qty_sold_window: 0,
      revenue_window: 0,
      bundle_discount_window: 0,
      orders_count_window: 0,
      last_sold_at: null,
      days_since_last_sale: null,
    };
    const stock = Number(raw.stock_qty ?? 0);
    const movement = classifyMovement({
      stock_qty: stock,
      qty_sold_window: sales.qty_sold_window,
      high_movement_min_qty: settings.highMovementMin,
      inactive_days_threshold: settings.inactiveDays,
      last_sold_at: sales.last_sold_at,
    });
    const lowMarginIssue = review.issues.some(
      (i) =>
        i.code === "critical_margin" ||
        i.code === "negative_margin" ||
        i.code === "attention_margin",
    );
    const highMovementLowMargin = movement === "high_movement" && lowMarginIssue;

    const categoryName = Array.isArray(raw.categories)
      ? (raw.categories[0]?.name ?? null)
      : (raw.categories?.name ?? null);

    enriched.push({
      id: raw.id,
      name: raw.name ?? "(sem nome)",
      sku: raw.sku,
      slug: raw.slug,
      active: raw.active,
      category_id: raw.category_id,
      category_name: categoryName,
      brand: raw.brand,
      price: raw.price,
      sale_price: raw.sale_price,
      cost_price: raw.cost_price,
      min_margin_percent: raw.min_margin_percent,
      b2b_enabled: raw.b2b_enabled,
      b2b_price: raw.b2b_price,
      b2b_min_qty: raw.b2b_min_qty,
      stock_qty: stock,
      sales,
      movement,
      high_movement_low_margin: highMovementLowMargin,
      review,
    });
  }

  return { enriched, defMin, settings };
}

function applyFilters(
  rows: CommercialReviewRow[],
  filter: CommercialFilter,
  search: string | undefined,
  categoryId: string | undefined,
  brand: string | undefined,
): CommercialReviewRow[] {
  let out = rows;
  if (search) {
    const term = search.toLowerCase();
    out = out.filter(
      (r) => r.name.toLowerCase().includes(term) || (r.sku ?? "").toLowerCase().includes(term),
    );
  }
  if (categoryId) out = out.filter((r) => r.category_id === categoryId);
  if (brand) out = out.filter((r) => (r.brand ?? "") === brand);

  switch (filter) {
    case "no_cost":
      return out.filter((r) => r.review.issues.some((i) => i.code === "no_cost"));
    case "no_price":
      return out.filter((r) => r.review.issues.some((i) => i.code === "no_price"));
    case "negative_margin":
      return out.filter((r) => r.review.issues.some((i) => i.code === "negative_margin"));
    case "critical_margin":
      return out.filter((r) => r.review.issues.some((i) => i.code === "critical_margin"));
    case "attention_margin":
      return out.filter((r) => r.review.issues.some((i) => i.code === "attention_margin"));
    case "b2b_critical":
      return out.filter((r) => r.review.issues.some((i) => i.code === "b2b_critical"));
    case "b2b_incomplete":
      return out.filter((r) =>
        r.review.issues.some(
          (i) =>
            i.code === "b2b_price_without_min_qty" ||
            i.code === "b2b_min_qty_without_price" ||
            i.code === "b2b_inconsistent",
        ),
      );
    case "healthy":
      return out.filter((r) => r.review.status === "healthy");
    case "stalled":
      return out.filter((r) => r.movement === "stalled");
    case "high_movement":
      return out.filter((r) => r.movement === "high_movement");
    case "high_movement_low_margin":
      return out.filter((r) => r.high_movement_low_margin);
    case "no_sales_window":
      return out.filter((r) => r.sales.qty_sold_window === 0);
    case "with_sales_window":
      return out.filter((r) => r.sales.qty_sold_window > 0);
    default:
      return out;
  }
}

const STATUS_RANK: Record<CommercialStatus, number> = {
  negative_margin: 0,
  critical_margin: 1,
  b2b_critical: 2,
  no_price: 3,
  no_cost: 4,
  b2b_incomplete: 5,
  attention_margin: 6,
  healthy: 7,
};

function sortRows(rows: CommercialReviewRow[]): CommercialReviewRow[] {
  return rows.slice().sort((a, b) => {
    // Alto giro com margem baixa vai pro topo
    const aHi = a.high_movement_low_margin ? 0 : 1;
    const bHi = b.high_movement_low_margin ? 0 : 1;
    if (aHi !== bHi) return aHi - bHi;
    const r = STATUS_RANK[a.review.status] - STATUS_RANK[b.review.status];
    if (r !== 0) return r;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

function computeSummary(
  enriched: CommercialReviewRow[],
  defMin: number,
  settings: { salesWindow: number; inactiveDays: number; highMovementMin: number },
): CommercialReviewSummary {
  const summary: CommercialReviewSummary = {
    totalActive: 0,
    noCost: 0,
    noPrice: 0,
    negativeMargin: 0,
    criticalMargin: 0,
    attentionMargin: 0,
    b2bCritical: 0,
    b2bIncomplete: 0,
    healthy: 0,
    stalledWithStock: 0,
    highMovement: 0,
    highMovementLowMargin: 0,
    noSalesInWindow: 0,
    withSalesInWindow: 0,
    revenueInWindow: 0,
    defaultMinMarginPercent: defMin,
    salesWindowDays: settings.salesWindow,
    inactiveDaysThreshold: settings.inactiveDays,
    highMovementMinQty: settings.highMovementMin,
  };

  for (const row of enriched) {
    summary.totalActive += 1;
    const codes = new Set(row.review.issues.map((i) => i.code));
    if (codes.has("no_cost")) summary.noCost += 1;
    if (codes.has("no_price")) summary.noPrice += 1;
    if (codes.has("negative_margin")) summary.negativeMargin += 1;
    if (codes.has("critical_margin")) summary.criticalMargin += 1;
    if (codes.has("attention_margin")) summary.attentionMargin += 1;
    if (codes.has("b2b_critical")) summary.b2bCritical += 1;
    if (
      codes.has("b2b_price_without_min_qty") ||
      codes.has("b2b_min_qty_without_price") ||
      codes.has("b2b_inconsistent")
    ) {
      summary.b2bIncomplete += 1;
    }
    if (row.review.status === "healthy") summary.healthy += 1;
    if (row.movement === "stalled") summary.stalledWithStock += 1;
    if (row.movement === "high_movement") summary.highMovement += 1;
    if (row.high_movement_low_margin) summary.highMovementLowMargin += 1;
    if (row.sales.qty_sold_window === 0) summary.noSalesInWindow += 1;
    else summary.withSalesInWindow += 1;
    summary.revenueInWindow += row.sales.revenue_window;
  }
  return summary;
}

export const getCommercialReviewReport = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) => inputSchema.parse(data ?? {}))
  .handler(async ({ data }): Promise<CommercialReviewReport> => {
    const { enriched, defMin, settings } = await buildEnriched();
    const summary = computeSummary(enriched, defMin, settings);

    const filtered = applyFilters(enriched, data.filter, data.search, data.categoryId, data.brand);
    const sorted = sortRows(filtered);
    const total = sorted.length;
    const start = (data.page - 1) * data.pageSize;
    const rows = sorted.slice(start, start + data.pageSize);

    return {
      summary,
      rows,
      page: data.page,
      pageSize: data.pageSize,
      total,
      filter: data.filter,
      generatedAt: new Date().toISOString(),
    };
  });

export const getCommercialReviewFilterOptions = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<CommercialFilterOptions> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: cats }, brandsData] = await Promise.all([
      supabaseAdmin.from("categories").select("id, name").order("name"),
      fetchAllRows<{ brand: string | null }>((from, to) =>
        supabaseAdmin
          .from("products")
          .select("brand")
          .eq("active", true)
          .not("brand", "is", null)
          .range(from, to),
      ),
    ]);
    const brandSet = new Set<string>();
    for (const b of brandsData) {
      const v = (b.brand ?? "").trim();
      if (v) brandSet.add(v);
    }
    return {
      categories: ((cats ?? []) as Array<{ id: string; name: string }>).map((c) => ({
        id: c.id,
        name: c.name,
      })),
      brands: Array.from(brandSet).sort((a, b) => a.localeCompare(b, "pt-BR")),
    };
  });

// ====================================================================
// CSV Export — respeita filtros, restrito a admin (gate financeiro atual)
// ====================================================================

function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR");
  } catch {
    return "";
  }
}

const MOVEMENT_LABEL: Record<CommercialMovementStatus, string> = {
  high_movement: "Alto giro",
  with_sales: "Com venda",
  stalled: "Parado com estoque",
  no_sales_no_stock: "Sem venda e sem estoque",
  no_sales_yet: "Sem venda registrada",
};

export const exportCommercialReviewCsv = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((data: unknown) => exportSchema.parse(data ?? {}))
  .handler(async ({ data }): Promise<{ filename: string; csv: string; total: number }> => {
    const { enriched, settings } = await buildEnriched();
    const filtered = applyFilters(enriched, data.filter, data.search, data.categoryId, data.brand);
    const sorted = sortRows(filtered);
    const cap = Math.min(sorted.length, data.pageSize);
    const slice = sorted.slice(0, cap);

    const header = [
      "SKU",
      "Produto",
      "Categoria",
      "Marca",
      "Preço atual",
      "Custo",
      "Margem (R$)",
      "Margem (%)",
      "Margem mínima (%)",
      "Preço B2B",
      "Margem B2B (R$)",
      "Margem B2B (%)",
      "Estoque atual",
      `Vendidos (últ. ${settings.salesWindow}d)`,
      `Receita (últ. ${settings.salesWindow}d)`,
      `Pedidos (últ. ${settings.salesWindow}d)`,
      "Última venda",
      "Dias desde última venda",
      "Status comercial",
      "Status de giro",
      "Alto giro c/ margem baixa",
      "Problemas encontrados",
      "Recomendações",
    ];

    const lines: string[] = [header.map(csvEscape).join(",")];
    for (const r of slice) {
      const issues = r.review.issues.map((i) => i.message).join(" | ");
      const recs = r.review.issues.map((i) => i.recommendation).join(" | ");
      lines.push(
        [
          csvEscape(r.sku ?? ""),
          csvEscape(r.name),
          csvEscape(r.category_name ?? ""),
          csvEscape(r.brand ?? ""),
          csvEscape(r.review.effectivePrice?.toFixed(2) ?? ""),
          csvEscape(r.cost_price?.toFixed(2) ?? ""),
          csvEscape(r.review.margin?.toFixed(2) ?? ""),
          csvEscape(r.review.marginPercent?.toFixed(2) ?? ""),
          csvEscape(r.review.effectiveMinMargin.toFixed(2)),
          csvEscape(r.b2b_price?.toFixed(2) ?? ""),
          csvEscape(r.review.b2bMargin?.toFixed(2) ?? ""),
          csvEscape(r.review.b2bMarginPercent?.toFixed(2) ?? ""),
          csvEscape(r.stock_qty),
          csvEscape(r.sales.qty_sold_window),
          csvEscape(r.sales.revenue_window.toFixed(2)),
          csvEscape(r.sales.orders_count_window),
          csvEscape(fmtDate(r.sales.last_sold_at)),
          csvEscape(r.sales.days_since_last_sale ?? ""),
          csvEscape(r.review.primaryStatusLabel),
          csvEscape(MOVEMENT_LABEL[r.movement]),
          csvEscape(r.high_movement_low_margin ? "sim" : "não"),
          csvEscape(issues),
          csvEscape(recs),
        ].join(","),
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    return {
      filename: `revisao-comercial-${today}.csv`,
      csv: "\uFEFF" + lines.join("\n"),
      total: slice.length,
    };
  });
