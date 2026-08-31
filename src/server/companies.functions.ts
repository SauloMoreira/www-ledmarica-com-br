import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAal2 } from "./security/assertAdmin";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isValidCNPJ, onlyDigits } from "@/lib/cnpj";
import { decideAutoApproval, lookupCnpj } from "./cnpjLookup";

const cnpjSchema = z
  .string()
  .transform((v) => onlyDigits(v))
  .refine((v) => v.length === 14, "CNPJ deve ter 14 dígitos")
  .refine((v) => isValidCNPJ(v), "CNPJ inválido");

const createCompanyInput = z.object({
  cnpj: cnpjSchema,
  legal_name: z.string().trim().min(2).max(200),
  trade_name: z.string().trim().max(200).optional().nullable(),
  state_registration: z.string().trim().max(40).optional().nullable(),
  contact_name: z.string().trim().min(2).max(120),
  contact_role: z.string().trim().max(80).optional().nullable(),
  contact_email: z.string().trim().email().max(255),
  contact_phone: z.string().trim().min(8).max(40),
  address_zipcode: z.string().trim().max(20).optional().nullable(),
  address_street: z.string().trim().max(200).optional().nullable(),
  address_number: z.string().trim().max(20).optional().nullable(),
  address_complement: z.string().trim().max(120).optional().nullable(),
  address_neighborhood: z.string().trim().max(120).optional().nullable(),
  address_city: z.string().trim().max(120).optional().nullable(),
  address_state: z.string().trim().max(2).optional().nullable(),
});

export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createCompanyInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verifica duplicidade
    const { data: existing } = await supabaseAdmin
      .from("companies")
      .select("id, status")
      .eq("cnpj", data.cnpj)
      .maybeSingle();
    if (existing) {
      throw new Error(
        "Já existe uma empresa cadastrada com este CNPJ. Faça login ou solicite acesso.",
      );
    }

    // Consulta a Receita (ReceitaWS) para decidir aprovação automática.
    const cnpjInfo = await lookupCnpj(data.cnpj);
    const decision = decideAutoApproval(cnpjInfo);

    const autoApproved = decision.approve;
    const adminNoteParts: string[] = [];
    if (cnpjInfo.ok) {
      adminNoteParts.push(
        `ReceitaWS: ${cnpjInfo.situation || "sem situação"}; abertura ${cnpjInfo.openedAt ?? "n/d"}; razão "${cnpjInfo.legalName}"`,
      );
    } else {
      adminNoteParts.push(`ReceitaWS indisponível: ${cnpjInfo.reason}`);
    }
    adminNoteParts.push(`Auto-aprovação: ${decision.reason}`);

    // Insere empresa via admin (auth já validada pelo middleware).
    const { data: company, error } = await supabaseAdmin
      .from("companies")
      .insert({
        cnpj: data.cnpj,
        legal_name: data.legal_name,
        trade_name: data.trade_name ?? null,
        state_registration: data.state_registration ?? null,
        contact_name: data.contact_name,
        contact_role: data.contact_role ?? null,
        contact_email: data.contact_email,
        contact_phone: data.contact_phone,
        address_zipcode: data.address_zipcode ?? null,
        address_street: data.address_street ?? null,
        address_number: data.address_number ?? null,
        address_complement: data.address_complement ?? null,
        address_neighborhood: data.address_neighborhood ?? null,
        address_city: data.address_city ?? null,
        address_state: data.address_state ?? null,
        status: autoApproved ? "approved" : "pending",
        approved_at: autoApproved ? new Date().toISOString() : null,
        approved_by: null,
        blocked_at: null,
        blocked_by: null,
        admin_notes: adminNoteParts.join(" | "),
      })
      .select("id")
      .single();

    if (error || !company) {
      throw new Error(error?.message ?? "Não foi possível cadastrar a empresa.");
    }

    // Vincula usuário como owner
    const { error: linkErr } = await supabaseAdmin.from("company_users").insert({
      company_id: company.id,
      user_id: userId,
      role: "owner",
    });
    if (linkErr) {
      await supabaseAdmin.from("companies").delete().eq("id", company.id);
      throw new Error("Falha ao vincular usuário à empresa: " + linkErr.message);
    }

    return { id: company.id, auto_approved: autoApproved, reason: decision.reason };
  });

export const getMyCompany = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: link } = await supabase
      .from("company_users")
      .select("company_id, role")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!link) return { company: null };

    const { data: company } = await supabase
      .from("companies")
      .select("*")
      .eq("id", link.company_id)
      .maybeSingle();

    return { company: company ?? null, role: link.role };
  });

const updateStatusInput = z.object({
  company_id: z.string().uuid(),
  status: z.enum(["approved", "rejected", "blocked", "pending"]),
  rejection_reason: z.string().max(500).optional().nullable(),
  admin_notes: z.string().max(1000).optional().nullable(),
});

export const adminUpdateCompanyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateStatusInput.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;


    // verifica admin
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (prof?.role !== "admin") throw new Error("Acesso negado");
    assertAal2(context.claims);

    const patch: {
      status: "approved" | "rejected" | "blocked" | "pending";
      admin_notes: string | null;
      rejection_reason: string | null;
      approved_at?: string | null;
      approved_by?: string | null;
      blocked_at?: string | null;
      blocked_by?: string | null;
    } = {
      status: data.status,
      admin_notes: data.admin_notes ?? null,
      rejection_reason: data.status === "rejected" ? (data.rejection_reason ?? null) : null,
    };
    if (data.status === "approved") {
      patch.approved_at = new Date().toISOString();
      patch.approved_by = userId;
      patch.blocked_at = null;
      patch.blocked_by = null;
    }
    if (data.status === "blocked") {
      patch.blocked_at = new Date().toISOString();
      patch.blocked_by = userId;
    }
    if (data.status === "pending") {
      patch.approved_at = null;
      patch.approved_by = null;
      patch.blocked_at = null;
      patch.blocked_by = null;
    }

    const { data: prevCompany } = await supabaseAdmin
      .from("companies")
      .select("legal_name, trade_name, cnpj, status")
      .eq("id", data.company_id)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("companies").update(patch).eq("id", data.company_id);
    if (error) throw new Error(error.message);

    try {
      const { logAdminAction } = await import("./security/auditLog");
      const statusLabel: Record<string, string> = {
        approved: "aprovada",
        rejected: "rejeitada",
        blocked: "bloqueada",
        pending: "marcada como pendente",
      };
      const actionMap: Record<string, string> = {
        approved: "b2b_company_approved",
        rejected: "b2b_company_rejected",
        blocked: "b2b_company_blocked",
        pending: "b2b_company_unblocked",
      };
      const companyName =
        (prevCompany as { trade_name?: string | null; legal_name?: string | null } | null)
          ?.trade_name ??
        (prevCompany as { legal_name?: string | null } | null)?.legal_name ??
        "Empresa";
      await logAdminAction({
        adminId: userId,
        action: actionMap[data.status] ?? "b2b_company_updated",
        resourceType: "company",
        resourceId: data.company_id,
        description: `Empresa ${companyName} ${statusLabel[data.status] ?? data.status} para compras B2B.`,
        before: { status: (prevCompany as { status?: string } | null)?.status ?? null },
        after: {
          status: data.status,
          rejection_reason: patch.rejection_reason ?? null,
          admin_notes: patch.admin_notes ?? null,
          cnpj: (prevCompany as { cnpj?: string } | null)?.cnpj ?? null,
        },
      });
    } catch {
      // auditoria nunca quebra a operação
    }

    return { ok: true };
  });

export const adminListCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        status: z.enum(["pending", "approved", "blocked", "rejected"]).optional().nullable(),
        search: z.string().max(100).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (prof?.role !== "admin") throw new Error("Acesso negado");

    let q = supabaseAdmin
      .from("companies")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    if (data.search && data.search.trim()) {
      const s = `%${data.search.trim()}%`;
      q = q.or(`legal_name.ilike.${s},trade_name.ilike.${s},cnpj.ilike.${s}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { companies: rows ?? [] };
  });
