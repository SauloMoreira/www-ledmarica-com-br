import { createServerFn } from "@tanstack/react-start";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./security/assertAdmin";
import { logAdminAction } from "./security/auditLog";

/**
 * v1.1.0-a — Administração de Usuários e Clientes (fase de leitura).
 *
 * Server functions somente-leitura para listar e ver detalhes de
 * usuários/clientes cadastrados. Nenhuma ação destrutiva nesta fase.
 *
 * Todas as funções:
 * - exigem sessão autenticada (requireSupabaseAuth)
 * - validam que o usuário é admin (assertAdmin)
 * - operam via supabaseAdmin (bypass RLS) com escopo controlado
 * - nunca retornam senhas, tokens ou secrets
 */

// ---------- Tipos públicos ----------

export type AdminUserType =
  | "admin"
  | "cliente_b2b_aprovado"
  | "cliente_b2b_pendente"
  | "cliente_b2b_bloqueado"
  | "cliente_b2c"
  | "cliente_bloqueado"
  | "cliente_arquivado";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  created_at: string | null;
  derived_type: AdminUserType;
  company_id: string | null;
  company_name: string | null;
  company_status: string | null;
  orders_count: number;
  last_order_at: string | null;
};

type FilterKind =
  | "all"
  | "admins"
  | "b2c"
  | "b2b_approved"
  | "b2b_pending"
  | "blocked"
  | "active"
  | "with_orders"
  | "without_orders";

function deriveType(args: {
  role: string;
  status: string;
  companyStatus: string | null;
}): AdminUserType {
  if (args.role === "admin") return "admin";
  if (args.status === "archived") return "cliente_arquivado";
  if (args.status === "blocked") return "cliente_bloqueado";
  if (args.companyStatus === "approved") return "cliente_b2b_aprovado";
  if (args.companyStatus === "pending") return "cliente_b2b_pendente";
  if (args.companyStatus === "blocked" || args.companyStatus === "rejected") {
    return "cliente_b2b_bloqueado";
  }
  return "cliente_b2c";
}

// ---------- Listagem ----------

const listInput = z.object({
  search: z.string().trim().max(200).optional().nullable(),
  filter: z
    .enum([
      "all",
      "admins",
      "b2c",
      "b2b_approved",
      "b2b_pending",
      "blocked",
      "active",
      "with_orders",
      "without_orders",
    ])
    .optional()
    .nullable(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // `data.limit` é mantido no contrato por compatibilidade, mas não impõe
    // mais teto: a busca pagina todas as linhas (limite de 1000 do PostgREST).
    const term = (data.search ?? "").trim();

    // 1. Perfis (filtro de role / status quando possível direto na query)
    const profiles = await fetchAllRows<{
      id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      role: string;
      status: string;
      created_at: string;
    }>((fromIdx, toIdx) => {
      let q = supabaseAdmin
        .from("profiles")
        .select("id, name, email, phone, role, status, created_at")
        .order("created_at", { ascending: false })
        .range(fromIdx, toIdx);

      if (data.filter === "admins") q = q.eq("role", "admin");
      if (data.filter === "blocked") q = q.in("status", ["blocked", "archived"]);
      if (data.filter === "active") q = q.eq("status", "active");

      if (term) {
        const s = `%${term}%`;
        q = q.or(`name.ilike.${s},email.ilike.${s},phone.ilike.${s}`);
      }
      return q.returns<Record<string, unknown>[]>() as never;
    });

    const rows = profiles ?? [];

    if (rows.length === 0) {
      return { users: [] as AdminUserRow[], total: 0 };
    }

    const userIds = rows.map((r) => r.id);

    // 2. Vínculos com empresas (company_users + companies)
    const { data: links } = await supabaseAdmin
      .from("company_users")
      .select("user_id, company_id")
      .in("user_id", userIds);

    const linkByUser = new Map<string, string>();
    const companyIds = new Set<string>();
    for (const l of links ?? []) {
      // primeiro vínculo vence (na prática há 1 empresa por usuário)
      if (!linkByUser.has(l.user_id)) {
        linkByUser.set(l.user_id, l.company_id);
        companyIds.add(l.company_id);
      }
    }

    const companyMap = new Map<
      string,
      { id: string; name: string; status: string }
    >();
    if (companyIds.size > 0) {
      const { data: companies } = await supabaseAdmin
        .from("companies")
        .select("id, legal_name, trade_name, status")
        .in("id", Array.from(companyIds));
      for (const c of companies ?? []) {
        companyMap.set(c.id, {
          id: c.id,
          name: c.trade_name || c.legal_name,
          status: c.status,
        });
      }
    }

    // 3. Pedidos: contagem + último por usuário
    const orders = await fetchAllRows<{ user_id: string | null; created_at: string | null }>(
      (fromIdx, toIdx) =>
        supabaseAdmin
          .from("orders")
          .select("user_id, created_at")
          .in("user_id", userIds)
          .order("created_at", { ascending: false })
          .range(fromIdx, toIdx),
    );

    const orderStats = new Map<string, { count: number; last: string | null }>();
    for (const o of orders ?? []) {
      if (!o.user_id) continue;
      const cur = orderStats.get(o.user_id) ?? { count: 0, last: null };
      cur.count += 1;
      if (!cur.last) cur.last = o.created_at as string;
      orderStats.set(o.user_id, cur);
    }

    // 4. Empresa-busca (filtro por nome de empresa só pode ser pós-join)
    let users: AdminUserRow[] = rows.map((p) => {
      const companyId = linkByUser.get(p.id) ?? null;
      const company = companyId ? companyMap.get(companyId) ?? null : null;
      const stats = orderStats.get(p.id) ?? { count: 0, last: null };
      const derived = deriveType({
        role: p.role,
        status: p.status,
        companyStatus: company?.status ?? null,
      });
      return {
        id: p.id,
        name: p.name,
        email: p.email,
        phone: p.phone,
        role: p.role,
        status: p.status,
        created_at: p.created_at,
        derived_type: derived,
        company_id: companyId,
        company_name: company?.name ?? null,
        company_status: company?.status ?? null,
        orders_count: stats.count,
        last_order_at: stats.last,
      };
    });

    // Busca por nome de empresa (pós-join)
    if (term) {
      const lower = term.toLowerCase();
      users = users.filter(
        (u) =>
          u.name.toLowerCase().includes(lower) ||
          u.email.toLowerCase().includes(lower) ||
          (u.phone ?? "").toLowerCase().includes(lower) ||
          (u.company_name ?? "").toLowerCase().includes(lower),
      );
    }

    // Filtros pós-derivação
    if (data.filter === "b2c") {
      users = users.filter((u) => u.derived_type === "cliente_b2c");
    } else if (data.filter === "b2b_approved") {
      users = users.filter((u) => u.derived_type === "cliente_b2b_aprovado");
    } else if (data.filter === "b2b_pending") {
      users = users.filter((u) => u.derived_type === "cliente_b2b_pendente");
    } else if (data.filter === "with_orders") {
      users = users.filter((u) => u.orders_count > 0);
    } else if (data.filter === "without_orders") {
      users = users.filter((u) => u.orders_count === 0);
    }

    return { users, total: users.length };
  });

// ---------- Resumo (cards) ----------

export const adminUsersSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [
      totalRes,
      adminsRes,
      blockedRes,
      pendingCompaniesRes,
      approvedCompaniesRes,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("status", "active"),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("status", ["blocked", "archived"]),
      supabaseAdmin
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabaseAdmin
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
    ]);

    const total = totalRes.count ?? 0;
    const admins = adminsRes.count ?? 0;
    const blocked = blockedRes.count ?? 0;
    const b2bPending = pendingCompaniesRes.count ?? 0;
    const b2bApproved = approvedCompaniesRes.count ?? 0;

    return {
      total,
      admins,
      blocked,
      b2b_pending: b2bPending,
      b2b_approved: b2bApproved,
      // B2C = total - admins - (usuários vinculados a empresa aprovada/pendente)
      // calculado de forma aproximada via company_users distinct
      b2c_approx: Math.max(0, total - admins - b2bApproved - b2bPending),
    };
  });

// ---------- Detalhe ----------

const detailInput = z.object({ user_id: z.string().uuid() });

export const adminGetUserDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => detailInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, phone, role, status, avatar_url, created_at, updated_at")
      .eq("id", data.user_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Usuário não encontrado");

    const { data: links } = await supabaseAdmin
      .from("company_users")
      .select("company_id, role, created_at")
      .eq("user_id", data.user_id);

    const companyIds = (links ?? []).map((l) => l.company_id);
    const { data: companies } = companyIds.length
      ? await supabaseAdmin
          .from("companies")
          .select(
            "id, cnpj, legal_name, trade_name, status, approved_at, approved_by, blocked_at, rejection_reason",
          )
          .in("id", companyIds)
      : { data: [] };

    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, total, status, payment_status, created_at")
      .eq("user_id", data.user_id)
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: addresses } = await supabaseAdmin
      .from("addresses")
      .select(
        "id, label, recipient, zip_code, street, number, complement, neighborhood, city, state, is_default",
      )
      .eq("user_id", data.user_id);

    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("id, name, status, score_temperature, created_at, converted_order")
      .or(`email.eq.${profile.email}`)
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: auditLogs } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, action, resource_type, description, created_at, admin_email")
      .eq("resource_type", "user")
      .eq("resource_id", data.user_id)
      .order("created_at", { ascending: false })
      .limit(20);

    return {
      profile,
      companies: companies ?? [],
      orders: orders ?? [],
      addresses: addresses ?? [],
      leads: leads ?? [],
      audit_logs: auditLogs ?? [],
    };
  });

// ============================================================
// v1.1.0-b — Ações operacionais (bloquear / desbloquear /
// arquivar / restaurar / reset de senha por e-mail).
// Todas exigem admin ativo, registram auditoria e bloqueiam
// ações sobre o próprio usuário e sobre o último admin ativo.
// ============================================================

type NewStatus = "active" | "blocked" | "archived";

const STATUS_LABELS: Record<NewStatus, string> = {
  active: "ativo",
  blocked: "bloqueado",
  archived: "arquivado",
};

async function loadTargetProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, name, email, role, status")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Usuário não encontrado");
  return data as {
    id: string;
    name: string | null;
    email: string;
    role: string;
    status: string;
  };
}

async function assertNotLastActiveAdmin(targetUserId: string) {
  const { count } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("status", "active");
  if ((count ?? 0) <= 1) {
    // Confirma se o alvo é o admin ativo restante
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .eq("status", "active")
      .limit(2);
    if ((data ?? []).some((d) => d.id === targetUserId)) {
      throw new Error(
        "Não é possível bloquear ou arquivar o último administrador ativo.",
      );
    }
  }
}

const statusInput = z.object({
  user_id: z.string().uuid(),
  reason: z.string().trim().min(1).max(500).optional().nullable(),
});

async function changeStatus(
  adminUserId: string,
  adminEmail: string,
  targetId: string,
  newStatus: NewStatus,
  reason: string | null,
) {
  if (targetId === adminUserId) {
    throw new Error("Você não pode alterar o status da própria conta.");
  }
  const target = await loadTargetProfile(targetId);
  if (target.status === newStatus) {
    return { ok: true, profile: target };
  }
  if (
    (newStatus === "blocked" || newStatus === "archived") &&
    target.role === "admin"
  ) {
    await assertNotLastActiveAdmin(targetId);
  }
  const { data: updated, error } = await supabaseAdmin
    .from("profiles")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", targetId)
    .select("id, name, email, role, status")
    .maybeSingle();
  if (error) throw new Error(error.message);

  // Se bloqueando/arquivando, encerra sessões ativas do usuário.
  if (newStatus !== "active") {
    try {
      await supabaseAdmin.auth.admin.signOut(targetId, "global");
    } catch (e) {
      console.warn("[users] signOut do alvo falhou:", e);
    }
  }

  await logAdminAction({
    adminId: adminUserId,
    adminEmail,
    action: `user_status_${newStatus}`,
    resourceType: "user",
    resourceId: targetId,
    description: `${STATUS_LABELS[target.status as NewStatus] ?? target.status} → ${STATUS_LABELS[newStatus]}${reason ? ` · motivo: ${reason}` : ""}`,
    before: { status: target.status },
    after: { status: newStatus, reason },
  });

  return { ok: true, profile: updated ?? target };
}

export const adminBlockUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => statusInput.parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    assertAal2(context.claims);
    return changeStatus(
      admin.id,
      admin.email,
      data.user_id,
      "blocked",
      data.reason ?? null,
    );
  });

export const adminUnblockUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => statusInput.parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    assertAal2(context.claims);
    return changeStatus(
      admin.id,
      admin.email,
      data.user_id,
      "active",
      data.reason ?? null,
    );
  });

export const adminArchiveUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => statusInput.parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    assertAal2(context.claims);
    return changeStatus(
      admin.id,
      admin.email,
      data.user_id,
      "archived",
      data.reason ?? null,
    );
  });

export const adminRestoreUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => statusInput.parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    assertAal2(context.claims);
    return changeStatus(
      admin.id,
      admin.email,
      data.user_id,
      "active",
      data.reason ?? null,
    );
  });

const resetInput = z.object({ user_id: z.string().uuid() });

export const adminSendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => resetInput.parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    assertAal2(context.claims);
    const target = await loadTargetProfile(data.user_id);
    if (target.status !== "active") {
      throw new Error(
        "Reative o usuário antes de enviar o link de redefinição de senha.",
      );
    }

    const siteUrl =
      process.env.SITE_URL ||
      process.env.VITE_SITE_URL ||
      "https://www.ledmarica.com.br";

    try {
      const { error } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: target.email,
        options: { redirectTo: `${siteUrl}/reset-password` },
      });
      if (error) throw error;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao gerar link";
      throw new Error(`Não foi possível enviar o e-mail de redefinição: ${msg}`);
    }

    await logAdminAction({
      adminId: admin.id,
      adminEmail: admin.email,
      action: "user_password_reset_sent",
      resourceType: "user",
      resourceId: target.id,
      description: `E-mail de redefinição de senha enviado para ${target.email}`,
    });

    return { ok: true };
  });

// ============================================================
// v1.1.0-c — Ações sensíveis (alterar função, anonimizar LGPD,
// excluir). Exigem AAL2 (MFA) e auditoria completa.
// ============================================================

import { assertAal2 } from "./security/assertAdmin";

const roleInput = z.object({
  user_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  confirm: z.literal("CONFIRMAR"),
});

async function changeRole(
  adminId: string,
  adminEmail: string,
  targetId: string,
  newRole: "admin" | "customer",
  reason: string,
) {
  if (targetId === adminId) {
    throw new Error("Você não pode alterar a própria função.");
  }
  const target = await loadTargetProfile(targetId);
  if (target.status !== "active") {
    throw new Error("Reative o usuário antes de alterar a função.");
  }
  if (target.role === newRole) {
    return { ok: true, role: newRole };
  }
  if (newRole === "customer" && target.role === "admin") {
    // Despromovendo um admin — garante que não é o último ativo.
    await assertNotLastActiveAdmin(targetId);
  }
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq("id", targetId);
  if (error) throw new Error(error.message);

  await logAdminAction({
    adminId,
    adminEmail,
    action: newRole === "admin" ? "user_role_promote_admin" : "user_role_demote_customer",
    resourceType: "user",
    resourceId: targetId,
    description: `Função alterada: ${target.role} → ${newRole} · motivo: ${reason}`,
    before: { role: target.role },
    after: { role: newRole, reason },
  });

  // Encerra sessões para forçar reavaliação de claims/role.
  try {
    await supabaseAdmin.auth.admin.signOut(targetId, "global");
  } catch (e) {
    console.warn("[users] signOut após mudança de role falhou:", e);
  }

  return { ok: true, role: newRole };
}

export const adminPromoteToAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => roleInput.parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    assertAal2(context.claims);
    return changeRole(admin.id, admin.email, data.user_id, "admin", data.reason);
  });

export const adminDemoteToUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => roleInput.parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    assertAal2(context.claims);
    return changeRole(admin.id, admin.email, data.user_id, "customer", data.reason);
  });

// ---------- Anonimização LGPD ----------
//
// Mantém o registro (para integridade referencial de pedidos,
// notas fiscais e auditoria), mas substitui PII por valores
// genéricos e marca status como "archived".

const anonymizeInput = z.object({
  user_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  confirm: z.literal("ANONIMIZAR"),
});

export const adminAnonymizeUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => anonymizeInput.parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    assertAal2(context.claims);
    if (data.user_id === admin.id) {
      throw new Error("Você não pode anonimizar a própria conta.");
    }
    const target = await loadTargetProfile(data.user_id);
    if (target.role === "admin") {
      throw new Error("Despromova o administrador para 'cliente' antes de anonimizar.");
    }

    const stamp = Date.now().toString(36);
    const anonEmail = `anonimizado+${stamp}@ledmarica.invalid`;
    const anonName = "Usuário Anonimizado (LGPD)";

    // 1) profiles
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({
        name: anonName,
        email: anonEmail,
        phone: null,
        avatar_url: null,
        status: "archived",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.user_id);
    if (pErr) throw new Error(pErr.message);

    // 2) auth.users — atualiza e-mail + bloqueia login
    try {
      await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
        email: anonEmail,
        user_metadata: { anonymized_at: new Date().toISOString() },
        ban_duration: "876000h", // ~100 anos
      });
    } catch (e) {
      console.warn("[users] auth.updateUserById em anonimização falhou:", e);
    }

    // 3) Encerra sessões
    try {
      await supabaseAdmin.auth.admin.signOut(data.user_id, "global");
    } catch (e) {
      console.warn("[users] signOut em anonimização falhou:", e);
    }

    await logAdminAction({
      adminId: admin.id,
      adminEmail: admin.email,
      action: "user_anonymize_lgpd",
      resourceType: "user",
      resourceId: data.user_id,
      description: `Anonimização LGPD aplicada · motivo: ${data.reason}`,
      before: { email: target.email, name: target.name, status: target.status },
      after: { email: anonEmail, name: anonName, status: "archived" },
    });

    return { ok: true };
  });

// ---------- Exclusão segura ----------
//
// Só permite excluir se NÃO houver pedidos vinculados. Caso
// contrário, instrui o admin a usar a anonimização (LGPD).

const deleteInput = z.object({
  user_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  confirm: z.literal("EXCLUIR"),
});

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => deleteInput.parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    assertAal2(context.claims);
    if (data.user_id === admin.id) {
      throw new Error("Você não pode excluir a própria conta.");
    }
    const target = await loadTargetProfile(data.user_id);
    if (target.role === "admin") {
      throw new Error("Despromova o administrador antes de excluir.");
    }

    const { count: orderCount } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", data.user_id);

    if ((orderCount ?? 0) > 0) {
      throw new Error(
        `Não é possível excluir: usuário possui ${orderCount} pedido(s). Use a anonimização LGPD para preservar histórico.`,
      );
    }

    // Limpeza de tabelas auxiliares antes do auth.admin.deleteUser.
    await supabaseAdmin.from("company_users").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("addresses").delete().eq("user_id", data.user_id);

    try {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
      if (error) throw error;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao remover usuário";
      throw new Error(`Não foi possível excluir o usuário: ${msg}`);
    }

    // O ON DELETE CASCADE da FK em profiles.id remove o perfil
    // automaticamente. Se a FK não existir, removemos por segurança.
    await supabaseAdmin.from("profiles").delete().eq("id", data.user_id);

    await logAdminAction({
      adminId: admin.id,
      adminEmail: admin.email,
      action: "user_delete",
      resourceType: "user",
      resourceId: data.user_id,
      description: `Usuário excluído · motivo: ${data.reason}`,
      before: { email: target.email, name: target.name },
    });

    return { ok: true };
  });

