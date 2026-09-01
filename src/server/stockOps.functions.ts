import { createServerFn } from "@tanstack/react-start";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

/**
 * Onda Estoque Operacional 1A — funções de servidor.
 *
 * Apenas leitura/ajuste manual de estoque + configurações.
 * NÃO altera checkout, baixa de estoque, Mercado Pago, B2B ou combos.
 */

export type StockStatus = "healthy" | "low" | "zero" | "inactive" | "high_movement" | "no_param";

export type StockReportRow = {
  product_id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  category_name: string | null;
  stock_qty: number;
  stock_min_alert: number | null;
  stock_alert_enabled: boolean;
  allow_out_of_stock_sales: boolean;
  qty_sold_window: number;
  last_sold_at: string | null;
  status: StockStatus;
  days_since_last_sale: number | null;
};

export type StockSettings = {
  id: string;
  default_min_stock: number;
  inactive_days_threshold: number;
  sales_window_days: number;
  alert_low_stock_enabled: boolean;
  alert_out_of_stock_enabled: boolean;
  alert_inactive_product_enabled: boolean;
  high_movement_min_qty: number;
};

export type StockCounters = {
  low_stock: number;
  out_of_stock: number;
  inactive_products: number;
  high_movement_low_stock: number;
  no_min_stock: number;
};

function classifyStatus(args: {
  stock_qty: number;
  effective_min: number;
  qty_sold_window: number;
  high_movement_min_qty: number;
  inactive_days_threshold: number;
  last_sold_at: string | null;
  created_at?: string | null;
  has_min: boolean;
}): { status: StockStatus; days_since_last_sale: number | null } {
  const {
    stock_qty,
    effective_min,
    qty_sold_window,
    high_movement_min_qty,
    inactive_days_threshold,
    last_sold_at,
    created_at,
    has_min,
  } = args;

  const ref = last_sold_at ? new Date(last_sold_at) : created_at ? new Date(created_at) : null;
  const days_since_last_sale = ref
    ? Math.floor((Date.now() - ref.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  if (stock_qty <= 0) return { status: "zero", days_since_last_sale };
  if (stock_qty <= effective_min) {
    if (qty_sold_window >= high_movement_min_qty) {
      return { status: "high_movement", days_since_last_sale };
    }
    return { status: "low", days_since_last_sale };
  }
  if (
    stock_qty > 0 &&
    days_since_last_sale !== null &&
    days_since_last_sale >= inactive_days_threshold
  ) {
    return { status: "inactive", days_since_last_sale };
  }
  if (qty_sold_window >= high_movement_min_qty) {
    return { status: "high_movement", days_since_last_sale };
  }
  if (!has_min) return { status: "no_param", days_since_last_sale };
  return { status: "healthy", days_since_last_sale };
}

export const getStockSettings = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<StockSettings> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("stock_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      const { data: created, error: insErr } = await supabaseAdmin
        .from("stock_settings")
        .insert({})
        .select("*")
        .single();
      if (insErr) throw new Error(insErr.message);
      return created as StockSettings;
    }
    return data as StockSettings;
  });

const settingsInput = z.object({
  default_min_stock: z.number().int().min(0).max(99999),
  inactive_days_threshold: z.number().int().min(1).max(3650),
  sales_window_days: z.number().int().min(1).max(3650),
  alert_low_stock_enabled: z.boolean(),
  alert_out_of_stock_enabled: z.boolean(),
  alert_inactive_product_enabled: z.boolean(),
  high_movement_min_qty: z.number().int().min(0).max(999999),
});

export const updateStockSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data) => settingsInput.parse(data))
  .handler(async ({ data, context }): Promise<StockSettings> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("stock_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    let result: StockSettings;
    if (!existing) {
      const { data: created, error } = await supabaseAdmin
        .from("stock_settings")
        .insert(data)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      result = created as StockSettings;
    } else {
      const { data: updated, error } = await supabaseAdmin
        .from("stock_settings")
        .update(data)
        .eq("id", (existing as { id: string }).id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      result = updated as StockSettings;
    }
    try {
      const { logAdminAction } = await import("./security/auditLog");
      const ctx = context as { adminUserId?: string; adminEmail?: string | null } | undefined;
      await logAdminAction({
        adminId: ctx?.adminUserId ?? "00000000-0000-0000-0000-000000000000",
        adminEmail: ctx?.adminEmail ?? null,
        action: "stock_settings_updated",
        resourceType: "stock_settings",
        resourceId: result.id ?? null,
        description: "Configurações de estoque atualizadas.",
        before: existing ?? null,
        after: data,
      });
    } catch {
      // não bloquear
    }
    return result;
  });

export const getStockReport = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(
    async (): Promise<{
      rows: StockReportRow[];
      settings: StockSettings;
      generated_at: string;
    }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: settingsRow } = await supabaseAdmin
        .from("stock_settings")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const settings: StockSettings = (settingsRow as StockSettings) ?? {
        id: "",
        default_min_stock: 3,
        inactive_days_threshold: 60,
        sales_window_days: 30,
        alert_low_stock_enabled: true,
        alert_out_of_stock_enabled: true,
        alert_inactive_product_enabled: true,
        high_movement_min_qty: 10,
      };

      const data = await fetchAllRows<any>((fromIdx, toIdx) =>
        supabaseAdmin
          .rpc("get_stock_report", {
            _sales_window_days: settings.sales_window_days,
          })
          .range(fromIdx, toIdx),
      );

      const isHiddenTest = (r: any) => {
        const n = (r.name ?? "").toLowerCase().trim();
        const s = (r.slug ?? "").toLowerCase();
        return n === "produto teste excluir" || n.startsWith("produto teste") || s.includes("-arq-");
      };
      const rows: StockReportRow[] = (data ?? []).filter((r: any) => !isHiddenTest(r)).map((r: any) => {
        const has_min = r.stock_min_alert !== null && r.stock_min_alert !== undefined;
        const effective_min = has_min ? Number(r.stock_min_alert) : settings.default_min_stock;
        const cls = classifyStatus({
          stock_qty: Number(r.stock_qty ?? 0),
          effective_min,
          qty_sold_window: Number(r.qty_sold_window ?? 0),
          high_movement_min_qty: settings.high_movement_min_qty,
          inactive_days_threshold: settings.inactive_days_threshold,
          last_sold_at: r.last_sold_at ?? null,
          created_at: r.created_at ?? null,
          has_min,
        });
        return {
          product_id: r.product_id,
          name: r.name,
          sku: r.sku ?? null,
          category_id: r.category_id ?? null,
          category_name: r.category_name ?? null,
          stock_qty: Number(r.stock_qty ?? 0),
          stock_min_alert: has_min ? Number(r.stock_min_alert) : null,
          stock_alert_enabled: Boolean(r.stock_alert_enabled),
          allow_out_of_stock_sales: Boolean(r.allow_out_of_stock_sales),
          qty_sold_window: Number(r.qty_sold_window ?? 0),
          last_sold_at: r.last_sold_at ?? null,
          status: cls.status,
          days_since_last_sale: cls.days_since_last_sale,
        };
      });

      return { rows, settings, generated_at: new Date().toISOString() };
    },
  );

const adjustInput = z.object({
  product_id: z.string().uuid(),
  new_stock_qty: z.number().int().min(0).max(99999999),
  reason: z.string().trim().max(300).optional(),
});

export const adjustProductStock = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((data) => adjustInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prev, error: prevErr } = await supabaseAdmin
      .from("products")
      .select("id, stock_qty, name")
      .eq("id", data.product_id)
      .single();
    if (prevErr || !prev) throw new Error("Produto não encontrado");

    const { error: updErr } = await supabaseAdmin
      .from("products")
      .update({ stock_qty: data.new_stock_qty, updated_at: new Date().toISOString() })
      .eq("id", data.product_id);
    if (updErr) throw new Error(updErr.message);

    try {
      const { logAdminAction } = await import("./security/auditLog");
      const ctx = context as { adminUserId?: string; adminEmail?: string | null };
      await logAdminAction({
        adminId: ctx.adminUserId ?? "00000000-0000-0000-0000-000000000000",
        adminEmail: ctx.adminEmail ?? null,
        action: "stock_manual_adjust",
        resourceType: "product_stock",
        resourceId: data.product_id,
        description: `Estoque de "${prev.name ?? "produto"}" ajustado: ${prev.stock_qty} → ${data.new_stock_qty}${data.reason ? ` (${data.reason})` : ""}.`,
        before: { stock_qty: prev.stock_qty },
        after: { stock_qty: data.new_stock_qty, reason: data.reason ?? null },
      });
    } catch {
      // não bloquear ajuste se auditoria falhar
    }

    return { ok: true, previous_stock_qty: prev.stock_qty, new_stock_qty: data.new_stock_qty };
  });

export const getStockCountersForOps = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<StockCounters> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("get_stock_counters");
    if (error) {
      return {
        low_stock: 0,
        out_of_stock: 0,
        inactive_products: 0,
        high_movement_low_stock: 0,
        no_min_stock: 0,
      };
    }
    const j = (data ?? {}) as Record<string, number>;
    return {
      low_stock: Number(j.low_stock ?? 0),
      out_of_stock: Number(j.out_of_stock ?? 0),
      inactive_products: Number(j.inactive_products ?? 0),
      high_movement_low_stock: Number(j.high_movement_low_stock ?? 0),
      no_min_stock: Number(j.no_min_stock ?? 0),
    };
  });

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const STATUS_LABEL: Record<StockStatus, string> = {
  healthy: "Saudavel",
  low: "Baixo",
  zero: "Zerado",
  inactive: "Parado",
  high_movement: "Alto giro",
  no_param: "Sem parametro",
};

export const exportStockCsv = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<{ filename: string; content: string }> => {
    const { rows, settings } = await getStockReport();
    const header = [
      "SKU",
      "Produto",
      "Categoria",
      "Estoque atual",
      "Estoque minimo",
      `Vendidos ultimos ${settings.sales_window_days} dias`,
      "Ultima venda",
      "Status do estoque",
      "Permite venda sem estoque",
    ].join(",");
    const body = rows
      .map((r) =>
        [
          csvEscape(r.sku ?? ""),
          csvEscape(r.name),
          csvEscape(r.category_name ?? ""),
          csvEscape(r.stock_qty),
          csvEscape(r.stock_min_alert ?? ""),
          csvEscape(r.qty_sold_window),
          csvEscape(r.last_sold_at ?? ""),
          csvEscape(STATUS_LABEL[r.status]),
          csvEscape(r.allow_out_of_stock_sales ? "Sim" : "Nao"),
        ].join(","),
      )
      .join("\n");
    const stamp = new Date().toISOString().slice(0, 10);
    return {
      filename: `estoque-${stamp}.csv`,
      content: `${header}\n${body}\n`,
    };
  });

export const STOCK_STATUS_LABEL_MAP = STATUS_LABEL;
