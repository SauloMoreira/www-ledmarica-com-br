import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { neutralizeCsvFormula } from "@/lib/csvSafe";

/**
 * Server functions da área Financeiro & Fiscal > Impostos.
 * Todas as funções fazem import dinâmico do server module para não vazar
 * `client.server` no bundle do cliente.
 */

// ============================================================
// Tipos reexportados do server module
// ============================================================

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

export const FISCAL_ORIGIN_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "0 — Nacional (regra geral)" },
  { value: 1, label: "1 — Estrangeira (importação direta)" },
  { value: 2, label: "2 — Estrangeira (mercado interno)" },
  { value: 3, label: "3 — Nacional (>40% e ≤70% importado)" },
  { value: 4, label: "4 — Nacional (PPB)" },
  { value: 5, label: "5 — Nacional (≤40% importado)" },
  { value: 6, label: "6 — Estrangeira CAMEX (direta)" },
  { value: 7, label: "7 — Estrangeira CAMEX (mercado interno)" },
  { value: 8, label: "8 — Nacional (>70% importado)" },
];

export const FISCAL_UNIT_SUGGESTIONS = ["UN", "PC", "CX", "M", "KG", "LT", "RL", "PAR", "KIT"];

export const FISCAL_STATUS_LABEL: Record<string, string> = {
  completo: "Completo",
  incompleto: "Incompleto",
  revisar: "Revisar",
  nao_aplicavel: "Não aplicável",
};

// ============================================================
// Quick counts (já consumido pela sidebar / Painel do Dia)
// ============================================================

export const getFiscalQuickCounts = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { fetchFiscalQuickCounts } = await import("./fiscalInsights.server");
    return fetchFiscalQuickCounts();
  });

// ============================================================
// Listagem paginada com filtros
// ============================================================

const ListInput = z.object({
  search: z.string().trim().max(80).optional(),
  filter: z
    .enum([
      "all",
      "complete",
      "incomplete",
      "review",
      "na",
      "no_ncm",
      "no_unit",
      "no_origin",
      "no_weight",
      "no_ean",
    ])
    .default("all"),
  categoryId: z.string().uuid().nullable().optional(),
  active: z.enum(["all", "active", "inactive"]).default("active"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
});

export const listFiscalProducts = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => ListInput.parse(input))
  .handler(async ({ data }) => {
    const { fetchFiscalProducts } = await import("./fiscalInsights.server");
    return fetchFiscalProducts(data);
  });

// ============================================================
// Atualização rápida de dados fiscais de um produto
// ============================================================

const UpdateInput = z.object({
  id: z.string().uuid(),
  ncm: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((v) => v == null || v === "" || /^\d{8}$/.test(v), {
      message: "NCM deve ter 8 dígitos numéricos",
    }),
  cest: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((v) => v == null || v === "" || /^\d{7}$/.test(v), {
      message: "CEST deve ter 7 dígitos numéricos",
    }),
  cfop_default: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((v) => v == null || v === "" || /^\d{4}$/.test(v), {
      message: "CFOP deve ter 4 dígitos numéricos",
    }),
  product_origin: z.number().int().min(0).max(8).nullable().optional(),
  commercial_unit: z.string().trim().max(10).nullable().optional(),
  tributary_unit: z.string().trim().max(10).nullable().optional(),
  gtin_ean: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((v) => v == null || v === "" || /^\d{8,14}$/.test(v), {
      message: "EAN/GTIN deve ter entre 8 e 14 dígitos numéricos",
    }),
  gtin_tax: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((v) => v == null || v === "" || /^\d{8,14}$/.test(v), {
      message: "GTIN tributável deve ter entre 8 e 14 dígitos",
    }),
  fiscal_description: z.string().trim().max(500).nullable().optional(),
  fiscal_notes: z.string().trim().max(2000).nullable().optional(),
  fiscal_status: z.enum(["completo", "incompleto", "revisar", "nao_aplicavel"]).optional(),
});

export const updateProductFiscal = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { updateProductFiscalRow } = await import("./fiscalInsights.server");
    const result = await updateProductFiscalRow(data);
    try {
      const { logAdminAction } = await import("./security/auditLog");
      const ctx = context as { adminUserId?: string; adminEmail?: string | null } | undefined;
      await logAdminAction({
        adminId: ctx?.adminUserId ?? "00000000-0000-0000-0000-000000000000",
        adminEmail: ctx?.adminEmail ?? null,
        action: "product_fiscal_updated",
        resourceType: "product_fiscal",
        resourceId: data.id,
        description: `Dados fiscais do produto atualizados (NCM/CFOP/EAN/Origem).`,
        after: data,
      });
    } catch {
      // não bloquear
    }
    return result;
  });

// ============================================================
// Dados fiscais da empresa (read-only nesta sub-onda)
// ============================================================

export const getFiscalCompanyData = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { fetchFiscalCompanyData } = await import("./fiscalInsights.server");
    return fetchFiscalCompanyData();
  });

// ============================================================
// Pedidos pagos com itens fiscais incompletos (para tela de NF)
// ============================================================

export const listPaidOrdersWithFiscalIssues = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { fetchPaidOrdersWithFiscalIssues } = await import("./fiscalInsights.server");
    return fetchPaidOrdersWithFiscalIssues();
  });

// ============================================================
// Export CSV (server-side, respeitando filtros)
// ============================================================

const ExportInput = ListInput.omit({ page: true, pageSize: true });

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = neutralizeCsvFormula(v);
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export const exportFiscalCsv = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => ExportInput.parse(input))
  .handler(async ({ data }) => {
    const { fetchFiscalProducts } = await import("./fiscalInsights.server");
    // limite seguro: até 5000 linhas
    const all: any[] = [];
    let page = 1;
    const pageSize = 100;
    for (let i = 0; i < 50; i++) {
      const res = await fetchFiscalProducts({ ...data, page, pageSize });
      all.push(...res.rows);
      if (res.rows.length < pageSize) break;
      page += 1;
    }
    const headers = [
      "SKU",
      "Produto",
      "Categoria",
      "NCM",
      "CEST",
      "Origem",
      "Unidade comercial",
      "Unidade tributavel",
      "CFOP padrao",
      "EAN/GTIN",
      "Status fiscal",
      "Score fiscal",
      "Problemas",
    ];
    const lines = [headers.map(csvEscape).join(",")];
    for (const r of all) {
      lines.push(
        [
          r.sku,
          r.name,
          r.category_name,
          r.ncm,
          r.cest,
          r.product_origin,
          r.commercial_unit,
          r.tributary_unit,
          r.cfop_default,
          r.gtin_ean,
          FISCAL_STATUS_LABEL[r.fiscal_status] ?? r.fiscal_status,
          r.fiscal_score,
          (r.problems ?? []).join(" | "),
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    const csv = "\uFEFF" + lines.join("\n");
    return { csv, count: all.length, generatedAt: new Date().toISOString() };
  });
