/**
import { fetchAllRows } from "@/lib/fetchAllRows";
 * Helpers server-only para insights e listagens fiscais.
 * Importado dinamicamente para não vazar `client.server` no bundle do cliente.
 */

export type FiscalQuickCounts = {
  productsActive: number;
  productsFiscalComplete: number;
  productsFiscalIncomplete: number;
  productsNeedReview: number;
  productsNoNcm: number;
  productsNoUnit: number;
  productsNoOrigin: number;
  productsNoWeightOrDims: number;
  productsNoEan: number;
  paidOrdersWithFiscalIssues: number;
  companyFiscalIncomplete: boolean;
  taxRegimeMissing: boolean;
};

export type FiscalProductRow = {
  id: string;
  name: string;
  sku: string | null;
  active: boolean;
  category_id: string | null;
  category_name: string | null;
  ncm: string | null;
  cest: string | null;
  cfop_default: string | null;
  product_origin: number | null;
  commercial_unit: string | null;
  tributary_unit: string | null;
  gtin_ean: string | null;
  gtin_tax: string | null;
  fiscal_description: string | null;
  fiscal_notes: string | null;
  fiscal_status: string;
  fiscal_score: number;
  fiscal_enabled: boolean;
  weight_kg: number | null;
  net_weight: number | null;
  gross_weight: number | null;
  width_cm: number | null;
  height_cm: number | null;
  length_cm: number | null;
  problems: string[];
};

export type FiscalCompanyData = {
  cnpj: string | null;
  legal_name: string | null;
  trade_name: string | null;
  state_registration: string | null;
  municipal_registration: string | null;
  address_zipcode: string | null;
  address_street: string | null;
  address_number: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  support_phone: string | null;
  support_whatsapp: string | null;
  fiscal_tax_regime: string | null;
  fiscal_default_nf_series: string | null;
  fiscal_default_operation_nature: string | null;
  fiscal_default_cfop_internal: string | null;
  fiscal_default_cfop_interstate: string | null;
  fiscal_environment: string | null;
  fiscal_provider: string | null;
  fiscal_main_cnae: string | null;
  fiscal_observations: string | null;
  fiscal_company_data_completed: boolean;
  missing_fields: string[];
};

const ORIGIN_LABELS: Record<number, string> = {
  0: "0 — Nacional",
  1: "1 — Estrangeira (importação direta)",
  2: "2 — Estrangeira (mercado interno)",
  3: "3 — Nacional (>40% e ≤70% importado)",
  4: "4 — Nacional (PPB)",
  5: "5 — Nacional (≤40% importado)",
  6: "6 — Estrangeira CAMEX (direta)",
  7: "7 — Estrangeira CAMEX (mercado interno)",
  8: "8 — Nacional (>70% importado)",
};

export function originLabel(o: number | null | undefined): string {
  if (o == null) return "—";
  return ORIGIN_LABELS[o] ?? `${o}`;
}

export function detectProblems(p: FiscalProductRow): string[] {
  const list: string[] = [];
  if (!p.active) return list;
  if (!p.fiscal_enabled || p.fiscal_status === "nao_aplicavel") return list;
  if (!p.ncm) list.push("Sem NCM");
  else if (!/^\d{8}$/.test(p.ncm)) list.push("NCM inválido (precisa 8 dígitos)");
  if (p.cfop_default && !/^\d{4}$/.test(p.cfop_default)) list.push("CFOP inválido (4 dígitos)");
  if (p.cest && !/^\d{7}$/.test(p.cest)) list.push("CEST inválido (7 dígitos)");
  if (p.product_origin == null) list.push("Sem origem da mercadoria");
  if (!p.commercial_unit || !p.commercial_unit.trim()) list.push("Sem unidade comercial");
  if (!p.gtin_ean || !p.gtin_ean.trim()) list.push("Sem EAN/GTIN");
  const w = Number(p.weight_kg ?? p.net_weight ?? p.gross_weight ?? 0);
  const dimsOk =
    Number(p.width_cm ?? 0) > 0 && Number(p.height_cm ?? 0) > 0 && Number(p.length_cm ?? 0) > 0;
  if (w <= 0 || !dimsOk) list.push("Peso/dimensões ausentes");
  return list;
}

export async function fetchFiscalQuickCounts(): Promise<FiscalQuickCounts> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  async function count(filter: (q: any) => any): Promise<number> {
    try {
      const q = filter(supabaseAdmin.from("products").select("*", { count: "exact", head: true }));
      const { count } = await q;
      return count ?? 0;
    } catch {
      return 0;
    }
  }

  const [
    productsActive,
    productsFiscalComplete,
    productsFiscalIncomplete,
    productsNeedReview,
    productsNoNcm,
    productsNoUnit,
    productsNoOrigin,
    productsNoEan,
  ] = await Promise.all([
    count((q) => q.eq("active", true).neq("fiscal_status", "nao_aplicavel")),
    count((q) => q.eq("active", true).eq("fiscal_status", "completo")),
    count((q) => q.eq("active", true).eq("fiscal_status", "incompleto")),
    count((q) => q.eq("active", true).eq("fiscal_status", "revisar")),
    count((q) => q.eq("active", true).is("ncm", null)),
    count((q) => q.eq("active", true).or("commercial_unit.is.null,commercial_unit.eq.")),
    count((q) => q.eq("active", true).is("product_origin", null)),
    count((q) => q.eq("active", true).or("gtin_ean.is.null,gtin_ean.eq.")),
  ]);

  let productsNoWeightOrDims = 0;
  try {
    const data = await fetchAllRows<any>((fromIdx, toIdx) =>
      supabaseAdmin
        .from("products")
        .select(
          "id, weight_kg, net_weight, gross_weight, width_cm, height_cm, length_cm, active, fiscal_status",
        )
        .eq("active", true)
        .neq("fiscal_status", "nao_aplicavel")
        .range(fromIdx, toIdx),
    );
    productsNoWeightOrDims = (data ?? []).filter((p: any) => {
      const w = Number(p.weight_kg ?? p.net_weight ?? p.gross_weight ?? 0);
      const dimsOk =
        Number(p.width_cm ?? 0) > 0 && Number(p.height_cm ?? 0) > 0 && Number(p.length_cm ?? 0) > 0;
      return w <= 0 || !dimsOk;
    }).length;
  } catch {}

  let paidOrdersWithFiscalIssues = 0;
  try {
    const items = await fetchAllRows<any>((fromIdx, toIdx) =>
      supabaseAdmin
        .from("order_items")
        .select("order_id, product_id, products!inner(fiscal_status, active)")
        .in("products.fiscal_status", ["incompleto", "revisar"])
        .range(fromIdx, toIdx),
    );
    const orderIds = Array.from(
      new Set((items ?? []).map((it: any) => it.order_id).filter(Boolean)),
    );
    if (orderIds.length > 0) {
      const { count } = await supabaseAdmin
        .from("orders")
        .select("*", { count: "exact", head: true })
        .in("id", orderIds)
        .in("payment_status", ["paid", "approved"]);
      paidOrdersWithFiscalIssues = count ?? 0;
    }
  } catch {}

  let companyFiscalIncomplete = true;
  let taxRegimeMissing = true;
  try {
    const { data: fs } = await supabaseAdmin
      .from("finance_settings")
      .select(
        "fiscal_tax_regime, fiscal_default_nf_series, fiscal_default_operation_nature, fiscal_default_cfop_internal, fiscal_company_data_completed",
      )
      .limit(1)
      .maybeSingle();
    if (fs) {
      taxRegimeMissing = !fs.fiscal_tax_regime;
      companyFiscalIncomplete =
        !fs.fiscal_company_data_completed ||
        !fs.fiscal_tax_regime ||
        !fs.fiscal_default_nf_series ||
        !fs.fiscal_default_cfop_internal;
    }
  } catch {}

  return {
    productsActive,
    productsFiscalComplete,
    productsFiscalIncomplete,
    productsNeedReview,
    productsNoNcm,
    productsNoUnit,
    productsNoOrigin,
    productsNoWeightOrDims,
    productsNoEan,
    paidOrdersWithFiscalIssues,
    companyFiscalIncomplete,
    taxRegimeMissing,
  };
}

export type FiscalListFilter =
  | "all"
  | "complete"
  | "incomplete"
  | "review"
  | "na"
  | "no_ncm"
  | "no_unit"
  | "no_origin"
  | "no_weight"
  | "no_ean";

export type FiscalListInput = {
  search?: string;
  filter?: FiscalListFilter;
  categoryId?: string | null;
  active?: "all" | "active" | "inactive";
  page?: number;
  pageSize?: number;
};

export async function fetchFiscalProducts(
  input: FiscalListInput,
): Promise<{ rows: FiscalProductRow[]; total: number; page: number; pageSize: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(input.pageSize ?? 25)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabaseAdmin.from("products").select(
    `id, name, sku, active, category_id, ncm, cest, cfop_default, product_origin,
       commercial_unit, tributary_unit, gtin_ean, gtin_tax, fiscal_description, fiscal_notes,
       fiscal_status, fiscal_score, fiscal_enabled,
       weight_kg, net_weight, gross_weight, width_cm, height_cm, length_cm,
       categories ( name )`,
    { count: "exact" },
  );

  // active filter
  if (input.active === "active") q = q.eq("active", true);
  else if (input.active === "inactive") q = q.eq("active", false);

  // category filter
  if (input.categoryId) q = q.eq("category_id", input.categoryId);

  // status/pendency filter
  switch (input.filter) {
    case "complete":
      q = q.eq("fiscal_status", "completo");
      break;
    case "incomplete":
      q = q.eq("fiscal_status", "incompleto");
      break;
    case "review":
      q = q.eq("fiscal_status", "revisar");
      break;
    case "na":
      q = q.eq("fiscal_status", "nao_aplicavel");
      break;
    case "no_ncm":
      q = q.is("ncm", null);
      break;
    case "no_unit":
      q = q.or("commercial_unit.is.null,commercial_unit.eq.");
      break;
    case "no_origin":
      q = q.is("product_origin", null);
      break;
    case "no_ean":
      q = q.or("gtin_ean.is.null,gtin_ean.eq.");
      break;
    case "no_weight":
      // tratado via filtragem em memória mais abaixo
      break;
    default:
      break;
  }

  // search
  const s = (input.search ?? "").trim();
  if (s) {
    const escaped = s.replace(/[%,]/g, " ").slice(0, 80);
    q = q.or(
      `name.ilike.%${escaped}%,sku.ilike.%${escaped}%,ncm.ilike.%${escaped}%,gtin_ean.ilike.%${escaped}%`,
    );
  }

  q = q.order("fiscal_score", { ascending: true }).order("name", { ascending: true });
  q = q.range(from, to);

  const { data, count, error } = await q;
  if (error) throw new Error(error.message);

  let rows: FiscalProductRow[] = (data ?? []).map((p: any) => {
    const base: FiscalProductRow = {
      id: p.id,
      name: p.name,
      sku: p.sku,
      active: p.active,
      category_id: p.category_id,
      category_name: p.categories?.name ?? null,
      ncm: p.ncm,
      cest: p.cest,
      cfop_default: p.cfop_default,
      product_origin: p.product_origin,
      commercial_unit: p.commercial_unit,
      tributary_unit: p.tributary_unit,
      gtin_ean: p.gtin_ean,
      gtin_tax: p.gtin_tax,
      fiscal_description: p.fiscal_description,
      fiscal_notes: p.fiscal_notes,
      fiscal_status: p.fiscal_status,
      fiscal_score: p.fiscal_score ?? 0,
      fiscal_enabled: p.fiscal_enabled,
      weight_kg: p.weight_kg,
      net_weight: p.net_weight,
      gross_weight: p.gross_weight,
      width_cm: p.width_cm,
      height_cm: p.height_cm,
      length_cm: p.length_cm,
      problems: [],
    };
    base.problems = detectProblems(base);
    return base;
  });

  if (input.filter === "no_weight") {
    rows = rows.filter((r) => r.problems.includes("Peso/dimensões ausentes"));
  }

  return { rows, total: count ?? rows.length, page, pageSize };
}

export async function fetchFiscalCompanyData(): Promise<FiscalCompanyData> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: cs }, { data: fs }] = await Promise.all([
    supabaseAdmin
      .from("company_settings")
      .select(
        "cnpj, legal_name, trade_name, state_registration, municipal_registration, address_zipcode, address_street, address_number, address_neighborhood, address_city, address_state, support_phone, support_whatsapp",
      )
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("finance_settings")
      .select(
        "fiscal_tax_regime, fiscal_default_nf_series, fiscal_default_operation_nature, fiscal_default_cfop_internal, fiscal_default_cfop_interstate, fiscal_environment, fiscal_provider, fiscal_main_cnae, fiscal_observations, fiscal_company_data_completed",
      )
      .limit(1)
      .maybeSingle(),
  ]);

  const out: FiscalCompanyData = {
    cnpj: cs?.cnpj ?? null,
    legal_name: cs?.legal_name ?? null,
    trade_name: cs?.trade_name ?? null,
    state_registration: cs?.state_registration ?? null,
    municipal_registration: cs?.municipal_registration ?? null,
    address_zipcode: cs?.address_zipcode ?? null,
    address_street: cs?.address_street ?? null,
    address_number: cs?.address_number ?? null,
    address_neighborhood: cs?.address_neighborhood ?? null,
    address_city: cs?.address_city ?? null,
    address_state: cs?.address_state ?? null,
    support_phone: cs?.support_phone ?? null,
    support_whatsapp: cs?.support_whatsapp ?? null,
    fiscal_tax_regime: fs?.fiscal_tax_regime ?? null,
    fiscal_default_nf_series: fs?.fiscal_default_nf_series ?? null,
    fiscal_default_operation_nature: fs?.fiscal_default_operation_nature ?? null,
    fiscal_default_cfop_internal: fs?.fiscal_default_cfop_internal ?? null,
    fiscal_default_cfop_interstate: fs?.fiscal_default_cfop_interstate ?? null,
    fiscal_environment: fs?.fiscal_environment ?? null,
    fiscal_provider: fs?.fiscal_provider ?? null,
    fiscal_main_cnae: fs?.fiscal_main_cnae ?? null,
    fiscal_observations: fs?.fiscal_observations ?? null,
    fiscal_company_data_completed: !!fs?.fiscal_company_data_completed,
    missing_fields: [],
  };

  const required: Array<[keyof FiscalCompanyData, string]> = [
    ["cnpj", "CNPJ"],
    ["legal_name", "Razão social"],
    ["address_zipcode", "CEP"],
    ["address_street", "Endereço"],
    ["address_city", "Cidade"],
    ["address_state", "UF"],
    ["fiscal_tax_regime", "Regime tributário"],
    ["fiscal_default_nf_series", "Série NF-e padrão"],
    ["fiscal_default_cfop_internal", "CFOP interno padrão"],
  ];
  out.missing_fields = required
    .filter(([k]) => {
      const v = out[k];
      return v == null || (typeof v === "string" && v.trim() === "");
    })
    .map(([, label]) => label);
  return out;
}

export type ProductFiscalUpdate = {
  id: string;
  ncm?: string | null;
  cest?: string | null;
  cfop_default?: string | null;
  product_origin?: number | null;
  commercial_unit?: string | null;
  tributary_unit?: string | null;
  gtin_ean?: string | null;
  gtin_tax?: string | null;
  fiscal_description?: string | null;
  fiscal_notes?: string | null;
  fiscal_status?: "completo" | "incompleto" | "revisar" | "nao_aplicavel";
};

export async function updateProductFiscalRow(
  input: ProductFiscalUpdate,
): Promise<FiscalProductRow> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { id, ...rest } = input;
  // Normaliza vazios para null
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    if (typeof v === "string") {
      const t = v.trim();
      patch[k] = t === "" ? null : t;
    } else {
      patch[k] = v;
    }
  }
  const { error } = await supabaseAdmin
    .from("products")
    .update(patch as never)
    .eq("id", id);
  if (error) throw new Error(error.message);

  const { data: p, error: e2 } = await supabaseAdmin
    .from("products")
    .select(
      `id, name, sku, active, category_id, ncm, cest, cfop_default, product_origin,
       commercial_unit, tributary_unit, gtin_ean, gtin_tax, fiscal_description, fiscal_notes,
       fiscal_status, fiscal_score, fiscal_enabled,
       weight_kg, net_weight, gross_weight, width_cm, height_cm, length_cm,
       categories ( name )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (e2) throw new Error(e2.message);
  if (!p) throw new Error("Produto não encontrado");

  const row: FiscalProductRow = {
    id: p.id,
    name: p.name,
    sku: p.sku,
    active: p.active ?? true,
    category_id: p.category_id,
    category_name: (p as any).categories?.name ?? null,
    ncm: p.ncm,
    cest: p.cest,
    cfop_default: p.cfop_default,
    product_origin: p.product_origin,
    commercial_unit: p.commercial_unit,
    tributary_unit: p.tributary_unit,
    gtin_ean: p.gtin_ean,
    gtin_tax: p.gtin_tax,
    fiscal_description: p.fiscal_description,
    fiscal_notes: p.fiscal_notes,
    fiscal_status: p.fiscal_status,
    fiscal_score: p.fiscal_score ?? 0,
    fiscal_enabled: p.fiscal_enabled,
    weight_kg: p.weight_kg,
    net_weight: p.net_weight,
    gross_weight: p.gross_weight,
    width_cm: p.width_cm,
    height_cm: p.height_cm,
    length_cm: p.length_cm,
    problems: [],
  };
  row.problems = detectProblems(row);
  return row;
}

export async function fetchPaidOrdersWithFiscalIssues(): Promise<
  Array<{ order_id: string; product_id: string; product_name: string; fiscal_status: string }>
> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const items = await fetchAllRows<any>((fromIdx, toIdx) =>
    supabaseAdmin
      .from("order_items")
      .select("order_id, product_id, product_name, products!inner(fiscal_status)")
      .in("products.fiscal_status", ["incompleto", "revisar"])
      .range(fromIdx, toIdx),
  );
  if (!items || items.length === 0) return [];
  const orderIds = Array.from(new Set(items.map((i: any) => i.order_id).filter(Boolean)));
  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("id")
    .in("id", orderIds)
    .in("payment_status", ["paid", "approved"]);
  const okSet = new Set((orders ?? []).map((o: any) => o.id));
  return items
    .filter((i: any) => okSet.has(i.order_id))
    .map((i: any) => ({
      order_id: i.order_id,
      product_id: i.product_id,
      product_name: i.product_name,
      fiscal_status: i.products?.fiscal_status ?? "incompleto",
    }));
}
