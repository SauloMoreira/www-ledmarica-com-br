import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { sanitizeSearchTerm } from "@/lib/postgrestFilter";

export type InvoiceStatus =
  | "nao_necessaria"
  | "pendente_emissao"
  | "emitida"
  | "erro_emissao"
  | "cancelada";

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  nao_necessaria: "Não necessária",
  pendente_emissao: "Pendente de emissão",
  emitida: "Emitida",
  erro_emissao: "Erro de emissão",
  cancelada: "Cancelada",
};

const STATUS_VALUES: InvoiceStatus[] = [
  "nao_necessaria",
  "pendente_emissao",
  "emitida",
  "erro_emissao",
  "cancelada",
];

// ============================================================
// Helpers
// ============================================================

function isUrl(v: string | null | undefined) {
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const InvoiceDataSchema = z.object({
  invoice_number: z.string().trim().max(40).optional().nullable(),
  invoice_series: z.string().trim().max(20).optional().nullable(),
  invoice_access_key: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((v) => !v || /^\d{44}$/.test(v), {
      message: "A chave de acesso deve ter 44 dígitos.",
    }),
  invoice_danfe_url: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((v) => isUrl(v), { message: "Link DANFE inválido." }),
  invoice_xml_url: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((v) => isUrl(v), { message: "Link XML inválido." }),
  invoice_issued_at: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine(
      (v) => {
        if (!v) return true;
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return false;
        // tolera até 1 dia no futuro (fuso)
        return d.getTime() <= Date.now() + 24 * 3600 * 1000;
      },
      { message: "Data de emissão inválida ou futura." },
    ),
  invoice_notes: z.string().trim().max(2000).optional().nullable(),
});

// ============================================================
// list — tabela e cards
// ============================================================
export const listInvoices = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.string().optional(),
        orderType: z.enum(["all", "b2c", "b2b"]).optional().default("all"),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        search: z.string().optional(),
        onlyOverdue: z.boolean().optional(),
        page: z.number().int().min(1).optional().default(1),
        pageSize: z.number().int().min(1).max(100).optional().default(25),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const stale24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    let q = supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, user_id, total, payment_status, paid_at, created_at, order_type, company_id, company_name, company_cnpj, invoice_status, invoice_number, invoice_series, invoice_access_key, invoice_danfe_url, invoice_xml_url, invoice_issued_at, invoice_required, invoice_registered_at, address_snapshot",
        { count: "exact" },
      )
      .in("payment_status", ["paid", "approved"])
      .order("paid_at", { ascending: false, nullsFirst: false });

    if (data.status && data.status !== "all") {
      if (data.status === "sem_nota") {
        q = q.in("invoice_status", ["nao_necessaria", "pendente_emissao"]);
      } else {
        q = q.eq("invoice_status", data.status);
      }
    }
    if (data.orderType === "b2b") q = q.eq("order_type", "b2b");
    if (data.orderType === "b2c") q = q.neq("order_type", "b2b");
    if (data.startDate) q = q.gte("paid_at", data.startDate);
    if (data.endDate) q = q.lte("paid_at", data.endDate);
    if (data.onlyOverdue) {
      q = q.in("invoice_status", ["pendente_emissao"]).lt("paid_at", stale24h);
    }
    if (data.search) {
      const s = sanitizeSearchTerm(data.search, 80);
      const orParts: string[] = [];
      if (/^\d+$/.test(s)) orParts.push(`order_number.eq.${s}`);
      orParts.push(`invoice_number.ilike.%${s}%`);
      orParts.push(`invoice_access_key.ilike.%${s}%`);
      orParts.push(`company_legal_name.ilike.%${s}%`);
      orParts.push(`company_cnpj.ilike.%${s}%`);
      if (s) q = q.or(orParts.join(","));
    }

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    q = q.range(from, to);

    const { data: rows, count, error } = await q;
    if (error) {
      return { ok: false as const, error: error.message };
    }

    // hidrata e-mail/nome do cliente em batch
    const userIds = Array.from(
      new Set((rows ?? []).map((r) => r.user_id).filter(Boolean) as string[]),
    );
    const profilesMap = new Map<string, { name: string | null; email: string | null }>();
    if (userIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, name, email")
        .in("id", userIds);
      (profs ?? []).forEach((p) =>
        profilesMap.set(p.id, { name: p.name ?? null, email: p.email ?? null }),
      );
    }

    return {
      ok: true as const,
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      rows: (rows ?? []).map((r) => ({
        ...r,
        customer_name:
          profilesMap.get(r.user_id ?? "")?.name ??
          (r.address_snapshot as { recipient?: string } | null)?.recipient ??
          null,
        customer_email: profilesMap.get(r.user_id ?? "")?.email ?? null,
      })),
    };
  });

// ============================================================
// summary — cards do topo
// ============================================================
export const getInvoiceSummary = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const stale24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const startMonth = new Date();
    startMonth.setDate(1);
    startMonth.setHours(0, 0, 0, 0);
    const startMonthISO = startMonth.toISOString();

    async function count(filter: (q: any) => any): Promise<number> {
      try {
        const q = filter(supabaseAdmin.from("orders").select("*", { count: "exact", head: true }));
        const { count } = await q;
        return count ?? 0;
      } catch {
        return 0;
      }
    }

    const [pendentes, emitidas, comErro, canceladas, semNota, overdue, b2bSemNota, paidMonth] =
      await Promise.all([
        count((q) => q.in("payment_status", ["paid", "approved"]).eq("invoice_status", "pendente_emissao")),
        count((q) => q.in("payment_status", ["paid", "approved"]).eq("invoice_status", "emitida")),
        count((q) => q.in("payment_status", ["paid", "approved"]).eq("invoice_status", "erro_emissao")),
        count((q) => q.in("payment_status", ["paid", "approved"]).eq("invoice_status", "cancelada")),
        count((q) =>
          q
            .in("payment_status", ["paid", "approved"])
            .in("invoice_status", ["nao_necessaria", "pendente_emissao"]),
        ),
        count((q) =>
          q
            .in("payment_status", ["paid", "approved"])
            .eq("invoice_status", "pendente_emissao")
            .lt("paid_at", stale24h),
        ),
        count((q) =>
          q
            .in("payment_status", ["paid", "approved"])
            .eq("order_type", "b2b")
            .in("invoice_status", ["nao_necessaria", "pendente_emissao"]),
        ),
        count((q) => q.in("payment_status", ["paid", "approved"]).gte("paid_at", startMonthISO)),
      ]);

    return {
      pendentes,
      emitidas,
      comErro,
      canceladas,
      semNota,
      overdue,
      b2bSemNota,
      paidMonth,
    };
  });

// Contadores leves (para sidebar/painel)
export const getInvoiceQuickCounts = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stale24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    async function count(filter: (q: any) => any): Promise<number> {
      try {
        const q = filter(supabaseAdmin.from("orders").select("*", { count: "exact", head: true }));
        const { count } = await q;
        return count ?? 0;
      } catch {
        return 0;
      }
    }
    const [pendentes, comErro, overdue, b2bSemNota] = await Promise.all([
      count((q) => q.in("payment_status", ["paid", "approved"]).eq("invoice_status", "pendente_emissao")),
      count((q) => q.in("payment_status", ["paid", "approved"]).eq("invoice_status", "erro_emissao")),
      count((q) =>
        q
          .in("payment_status", ["paid", "approved"])
          .eq("invoice_status", "pendente_emissao")
          .lt("paid_at", stale24h),
      ),
      count((q) =>
        q
          .in("payment_status", ["paid", "approved"])
          .eq("order_type", "b2b")
          .in("invoice_status", ["nao_necessaria", "pendente_emissao"]),
      ),
    ]);
    return { pendentes, comErro, overdue, b2bSemNota };
  });

// ============================================================
// getInvoiceDetail — para o bloco no detalhe do pedido
// ============================================================
export const getInvoiceDetail = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, payment_status, paid_at, order_type, invoice_status, invoice_number, invoice_series, invoice_access_key, invoice_danfe_url, invoice_xml_url, invoice_issued_at, invoice_notes, invoice_required, invoice_registered_by, invoice_registered_at, invoice_updated_at",
      )
      .eq("id", data.orderId)
      .single();
    if (error || !order)
      return { ok: false as const, error: error?.message ?? "Pedido não encontrado" };

    let registeredByEmail: string | null = null;
    if (order.invoice_registered_by) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("email, name")
        .eq("id", order.invoice_registered_by)
        .maybeSingle();
      registeredByEmail = prof?.email ?? prof?.name ?? null;
    }

    const { data: audit } = await supabaseAdmin
      .from("order_invoice_audit")
      .select("*")
      .eq("order_id", data.orderId)
      .order("created_at", { ascending: false })
      .limit(50);

    return { ok: true as const, order, registeredByEmail, audit: audit ?? [] };
  });

// ============================================================
// registerInvoice — registra/edita dados da NF emitida fora
// ============================================================
export const registerInvoice = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z.object({ orderId: z.string().uuid() }).merge(InvoiceDataSchema).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAdminAction } = await import("./security/auditLog");

    const { data: prev, error: prevErr } = await supabaseAdmin
      .from("orders")
      .select(
        "invoice_status, invoice_number, invoice_series, invoice_access_key, invoice_danfe_url, invoice_xml_url, invoice_issued_at, invoice_notes, invoice_registered_by, invoice_registered_at",
      )
      .eq("id", data.orderId)
      .single();
    if (prevErr || !prev) return { ok: false as const, error: "Pedido não encontrado" };

    const adminId = (context as { adminUserId?: string } | undefined)?.adminUserId ?? null;
    const now = new Date().toISOString();

    const update: Record<string, unknown> = {
      invoice_status: "emitida",
      invoice_number: data.invoice_number ?? null,
      invoice_series: data.invoice_series ?? null,
      invoice_access_key: data.invoice_access_key ?? null,
      invoice_danfe_url: data.invoice_danfe_url ?? null,
      invoice_xml_url: data.invoice_xml_url ?? null,
      invoice_issued_at: data.invoice_issued_at ?? now,
      invoice_notes: data.invoice_notes ?? null,
      invoice_registered_by: prev.invoice_registered_by ?? adminId,
      invoice_registered_at: prev.invoice_registered_at ?? now,
      invoice_updated_at: now,
    };

    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update(update as never)
      .eq("id", data.orderId);
    if (updErr) return { ok: false as const, error: updErr.message };

    await supabaseAdmin.from("order_invoice_audit").insert({
      order_id: data.orderId,
      event_type: prev.invoice_status === "emitida" ? "invoice_updated" : "invoice_registered",
      previous_status: prev.invoice_status,
      new_status: "emitida",
      previous_data: prev as never,
      new_data: update as never,
      changed_by: adminId,
    });

    await logAdminAction({
      adminId: adminId ?? "00000000-0000-0000-0000-000000000000",
      action: prev.invoice_status === "emitida" ? "update" : "create",
      resourceType: "order_invoice",
      resourceId: data.orderId,
      description: `Nota fiscal ${data.invoice_number ?? ""} registrada`,
      before: prev,
      after: update,
    });

    return { ok: true as const };
  });

// ============================================================
// setInvoiceStatus — pendente / erro / cancelada / nao_necessaria
// ============================================================
export const setInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        status: z.enum(STATUS_VALUES as [InvoiceStatus, ...InvoiceStatus[]]),
        notes: z.string().max(1000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAdminAction } = await import("./security/auditLog");
    const adminId = (context as { adminUserId?: string } | undefined)?.adminUserId ?? null;

    const { data: prev, error: prevErr } = await supabaseAdmin
      .from("orders")
      .select("invoice_status, invoice_notes")
      .eq("id", data.orderId)
      .single();
    if (prevErr || !prev) return { ok: false as const, error: "Pedido não encontrado" };

    const update: Record<string, unknown> = {
      invoice_status: data.status,
      invoice_updated_at: new Date().toISOString(),
    };
    if (data.notes !== undefined) update.invoice_notes = data.notes;

    const { error } = await supabaseAdmin
      .from("orders")
      .update(update as never)
      .eq("id", data.orderId);
    if (error) return { ok: false as const, error: error.message };

    await supabaseAdmin.from("order_invoice_audit").insert({
      order_id: data.orderId,
      event_type: "invoice_status_changed",
      previous_status: prev.invoice_status,
      new_status: data.status,
      notes: data.notes ?? null,
      changed_by: adminId,
    });

    await logAdminAction({
      adminId: adminId ?? "00000000-0000-0000-0000-000000000000",
      action: "update",
      resourceType: "order_invoice",
      resourceId: data.orderId,
      description: `Status fiscal: ${prev.invoice_status} → ${data.status}`,
      before: prev,
      after: update,
    });

    return { ok: true as const };
  });
