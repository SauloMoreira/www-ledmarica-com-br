import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { fetchAllRows } from "@/lib/fetchAllRows";

/**
 * Painel resumido da Central de Segurança.
 * - Eventos de webhook (últimos N e contagem por status)
 * - Eventos de segurança (CSP, falhas auth, rate limit, ssrf, etc.)
 * - Eventos de rate limit recentes
 * - Status MFA dos admins
 */
export const getSecurityOverview = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [webhooks, secEvents, rlEvents, admins] = await Promise.all([
      supabaseAdmin
        .from("payment_webhook_events")
        .select(
          "id, provider, type, action, processed, processing_error, created_at, data_id, live_mode",
        )
        .gte("created_at", since7d)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("security_events")
        .select("id, type, severity, identifier, message, metadata, created_at")
        .gte("created_at", since7d)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("rate_limit_events")
        .select("action, identifier, created_at")
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("profiles")
        .select("id, email, name, role, created_at")
        .eq("role", "admin"),
    ]);

    // Stats de webhook (últimos 7d)
    const webhookList = webhooks.data ?? [];
    const webhookStats = {
      total: webhookList.length,
      processed: webhookList.filter((w) => w.processed).length,
      withError: webhookList.filter((w) => w.processing_error).length,
      invalidSignature: webhookList.filter((w) =>
        (w.processing_error ?? "").toLowerCase().includes("invalid signature"),
      ).length,
    };

    // Stats de eventos de segurança
    const secList = secEvents.data ?? [];
    const secStats = {
      total: secList.length,
      byType: secList.reduce<Record<string, number>>((acc, e) => {
        acc[e.type] = (acc[e.type] ?? 0) + 1;
        return acc;
      }, {}),
      bySeverity: secList.reduce<Record<string, number>>((acc, e) => {
        acc[e.severity] = (acc[e.severity] ?? 0) + 1;
        return acc;
      }, {}),
    };

    // Stats de rate limit
    const rlList = rlEvents.data ?? [];
    const rlByIdent = rlList.reduce<Record<string, number>>((acc, e) => {
      const k = e.identifier ?? "unknown";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    const rlTopIdentifiers = Object.entries(rlByIdent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([identifier, count]) => ({ identifier, count }));
    const rlStats = {
      total: rlList.length,
      byAction: rlList.reduce<Record<string, number>>((acc, e) => {
        acc[e.action] = (acc[e.action] ?? 0) + 1;
        return acc;
      }, {}),
      topIdentifiers: rlTopIdentifiers,
    };

    // MFA status — Supabase não expõe MFA factors via service_role na tabela profiles,
    // então buscamos via Admin API auth.users
    const adminUsers = admins.data ?? [];
    const adminMfa: Array<{
      id: string;
      email: string;
      name: string | null;
      hasMfa: boolean;
      factors: number;
    }> = [];
    for (const a of adminUsers) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(a.id);
        type FactorLite = { status?: string };
        const factors = (u?.user?.factors ?? []) as FactorLite[];
        const verified = factors.filter((f) => f?.status === "verified");
        adminMfa.push({
          id: a.id,
          email: a.email,
          name: a.name ?? null,
          hasMfa: verified.length > 0,
          factors: verified.length,
        });
      } catch {
        adminMfa.push({
          id: a.id,
          email: a.email,
          name: a.name ?? null,
          hasMfa: false,
          factors: 0,
        });
      }
    }

    return {
      webhookStats,
      webhookRecent: webhookList.slice(0, 20),
      secStats,
      secRecent: secList.slice(0, 30),
      rlStats,
      rlRecent: rlList.slice(0, 30),
      adminMfa,
    };
  });

export const listSecurityEvents = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(
    z.object({
      type: z.string().max(50).optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }),
  )
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("security_events")
      .select("id, type, severity, identifier, message, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.type) q = q.eq("type", data.type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { events: rows ?? [] };
  });

/** Lista o histórico de auditoria de ações administrativas (versão simples – usada na Central de Segurança). */
export const listAdminAuditLog = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(
    z.object({
      resourceType: z.string().max(50).optional(),
      adminId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }),
  )
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("admin_audit_log")
      .select(
        "id, admin_id, admin_email, action, resource_type, resource_id, description, ip, user_agent, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.resourceType) q = q.eq("resource_type", data.resourceType);
    if (data.adminId) q = q.eq("admin_id", data.adminId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { events: rows ?? [] };
  });

/** Versão completa para a tela /admin/seguranca/auditoria com filtros e paginação. */
export const searchAdminAuditLog = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(
    z.object({
      days: z.number().int().min(1).max(365).default(30),
      resourceType: z.string().max(50).optional(),
      action: z.string().max(80).optional(),
      adminId: z.string().uuid().optional(),
      search: z.string().max(200).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(10).max(200).default(50),
    }),
  )
  .handler(async ({ data }) => {
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = supabaseAdmin
      .from("admin_audit_log")
      .select(
        "id, admin_id, admin_email, action, resource_type, resource_id, description, ip, user_agent, source, created_at",
        { count: "exact" },
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data.resourceType) q = q.eq("resource_type", data.resourceType);
    if (data.action) q = q.eq("action", data.action);
    if (data.adminId) q = q.eq("admin_id", data.adminId);
    if (data.search && data.search.trim()) {
      const term = data.search.trim().replace(/%/g, "");
      q = q.or(
        `description.ilike.%${term}%,admin_email.ilike.%${term}%,resource_id.ilike.%${term}%`,
      );
    }

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return {
      events: rows ?? [],
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

/** Detalhe completo de um log (inclui before/after já mascarados). */
export const getAdminAuditLogDetail = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("admin_audit_log")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Registro não encontrado");
    return { event: row };
  });

/** Opções de filtro (admins distintos, módulos e ações usadas nos últimos 90 dias). */
export const getAdminAuditFilterOptions = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const rows = await fetchAllRows<{
      admin_id: string | null;
      admin_email: string | null;
      action: string | null;
      resource_type: string | null;
    }>((from, to) =>
      supabaseAdmin
        .from("admin_audit_log")
        .select("admin_id, admin_email, action, resource_type")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(from, to),
    );


    const admins = new Map<string, { id: string; email: string | null }>();
    const actions = new Set<string>();
    const resourceTypes = new Set<string>();
    for (const r of rows ?? []) {
      if (r.admin_id) admins.set(r.admin_id, { id: r.admin_id, email: r.admin_email });
      if (r.action) actions.add(r.action);
      if (r.resource_type) resourceTypes.add(r.resource_type);
    }
    return {
      admins: Array.from(admins.values()).sort((a, b) =>
        (a.email ?? "").localeCompare(b.email ?? ""),
      ),
      actions: Array.from(actions).sort(),
      resourceTypes: Array.from(resourceTypes).sort(),
    };
  });

/** Exporta auditoria como CSV (string). Limita a 5000 linhas. Aceita os mesmos filtros. */
export const exportAdminAuditCsv = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(
    z.object({
      days: z.number().int().min(1).max(365).default(90),
      resourceType: z.string().max(50).optional(),
      action: z.string().max(80).optional(),
      adminId: z.string().uuid().optional(),
      search: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();
    const rows = await fetchAllRows<Record<string, unknown>>((from, to) => {
      let q = supabaseAdmin
        .from("admin_audit_log")
        .select(
          "created_at, admin_email, admin_id, action, resource_type, resource_id, description, ip, user_agent",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (data.resourceType) q = q.eq("resource_type", data.resourceType);
      if (data.action) q = q.eq("action", data.action);
      if (data.adminId) q = q.eq("admin_id", data.adminId);
      if (data.search && data.search.trim()) {
        const term = data.search.trim().replace(/%/g, "");
        q = q.or(
          `description.ilike.%${term}%,admin_email.ilike.%${term}%,resource_id.ilike.%${term}%`,
        );
      }
      return q;
    });


    const escape = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n;]/.test(s) ? `"${s}"` : s;
    };
    const header = [
      "created_at",
      "admin_email",
      "admin_id",
      "action",
      "resource_type",
      "resource_id",
      "description",
      "ip",
      "user_agent",
    ];
    const lines = [header.join(",")];
    for (const r of rows ?? []) {
      lines.push(header.map((h) => escape((r as Record<string, unknown>)[h])).join(","));
    }
    // BOM para Excel reconhecer UTF-8
    return { csv: "\uFEFF" + lines.join("\n"), count: rows?.length ?? 0 };
  });
