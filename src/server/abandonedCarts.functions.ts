import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ilikePattern, sanitizeSearchTerm } from "@/lib/postgrestFilter";

/**
 * Carrinhos abandonados — Fase 5.3
 *
 * Toda lógica é exclusivamente do admin. A captura é manual (via botão)
 * ou pode ser ativada por job futuro chamando a função SQL
 * `detect_abandoned_carts`.
 *
 * Não disparamos WhatsApp/email automaticamente nesta fase.
 */

export type CartStatus = "novo" | "contato_enviado" | "recuperado" | "perdido" | "ignorado";

export const CART_STATUSES: { value: CartStatus; label: string; color: string }[] = [
  { value: "novo", label: "Novo", color: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
  {
    value: "contato_enviado",
    label: "Contato enviado",
    color: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  },
  {
    value: "recuperado",
    label: "Recuperado",
    color: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  },
  { value: "perdido", label: "Perdido", color: "bg-rose-500/15 text-rose-700 border-rose-500/30" },
  { value: "ignorado", label: "Ignorado", color: "bg-muted text-muted-foreground border-border" },
];

// =====================================================================
// Detectar carrinhos abandonados
// =====================================================================
export const detectAbandonedCarts = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) =>
    z
      .object({
        minutes: z
          .number()
          .int()
          .min(5)
          .max(60 * 24)
          .default(60),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { data: result, error } = await supabaseAdmin.rpc("detect_abandoned_carts", {
      _minutes: data.minutes,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    return {
      created: Number(row?.created_count ?? 0),
      skipped: Number(row?.skipped_count ?? 0),
    };
  });

// =====================================================================
// Listar carrinhos abandonados (com filtros)
// =====================================================================
const listSchema = z.object({
  status: z.array(z.string()).optional(),
  minValue: z.number().nullable().optional(),
  maxValue: z.number().nullable().optional(),
  search: z.string().optional(),
  hasPhone: z.boolean().nullable().optional(),
  isB2B: z.boolean().nullable().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export const listAbandonedCarts = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) => listSchema.parse(d))
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("abandoned_carts")
      .select(
        "id, status, customer_name, customer_email, customer_phone, company_id, company_name, subtotal_amount, items_count, abandoned_at, last_activity_at, last_contacted_at, recovery_attempts, recovered_at, converted_order_id, user_id, lead_id, origin_page, notes",
        { count: "exact" },
      )
      .order("abandoned_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.status && data.status.length > 0) {
      q = q.in("status", data.status);
    }
    if (typeof data.minValue === "number") q = q.gte("subtotal_amount", data.minValue);
    if (typeof data.maxValue === "number") q = q.lte("subtotal_amount", data.maxValue);
    if (data.hasPhone === true) q = q.not("customer_phone", "is", null);
    if (data.hasPhone === false) q = q.is("customer_phone", null);
    if (data.isB2B === true) q = q.not("company_id", "is", null);
    if (data.isB2B === false) q = q.is("company_id", null);
    if (data.search && data.search.trim()) {
      const s = ilikePattern(data.search) || "%";
      q = q.or(
        `customer_name.ilike.${s},customer_email.ilike.${s},customer_phone.ilike.${s},company_name.ilike.${s}`,
      );
    }

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    // Enriquecer com dados do user/lead se faltarem nos campos próprios
    const userIds = Array.from(
      new Set((rows ?? []).map((r) => r.user_id).filter(Boolean) as string[]),
    );
    const leadIds = Array.from(
      new Set((rows ?? []).map((r) => r.lead_id).filter(Boolean) as string[]),
    );

    const profilesMap = new Map<
      string,
      { name: string | null; email: string | null; phone: string | null }
    >();
    if (userIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, name, email, phone")
        .in("id", userIds);
      (profs ?? []).forEach((p) =>
        profilesMap.set(p.id, { name: p.name, email: p.email, phone: p.phone }),
      );
    }
    const leadsMap = new Map<
      string,
      { name: string; email: string | null; phone: string | null }
    >();
    if (leadIds.length > 0) {
      const { data: ls } = await supabaseAdmin
        .from("leads")
        .select("id, name, email, phone")
        .in("id", leadIds);
      (ls ?? []).forEach((l) =>
        leadsMap.set(l.id, { name: l.name, email: l.email, phone: l.phone }),
      );
    }

    const enriched = (rows ?? []).map((r) => {
      const prof = r.user_id ? profilesMap.get(r.user_id) : undefined;
      const lead = r.lead_id ? leadsMap.get(r.lead_id) : undefined;
      return {
        ...r,
        customer_name: r.customer_name ?? prof?.name ?? lead?.name ?? null,
        customer_email: r.customer_email ?? prof?.email ?? lead?.email ?? null,
        customer_phone: r.customer_phone ?? prof?.phone ?? lead?.phone ?? null,
      };
    });

    return { rows: enriched, total: count ?? 0 };
  });

// =====================================================================
// Detalhe
// =====================================================================
export const getAbandonedCart = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: cart, error } = await supabaseAdmin
      .from("abandoned_carts")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    let profile = null as {
      name: string | null;
      email: string | null;
      phone: string | null;
    } | null;
    if (cart.user_id) {
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("name, email, phone")
        .eq("id", cart.user_id)
        .maybeSingle();
      profile = p ?? null;
    }
    let lead = null as {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      status: string | null;
    } | null;
    if (cart.lead_id) {
      const { data: l } = await supabaseAdmin
        .from("leads")
        .select("id, name, email, phone, status")
        .eq("id", cart.lead_id)
        .maybeSingle();
      lead = l ?? null;
    }
    let company = null as { legal_name: string; trade_name: string | null; cnpj: string } | null;
    if (cart.company_id) {
      const { data: c } = await supabaseAdmin
        .from("companies")
        .select("legal_name, trade_name, cnpj")
        .eq("id", cart.company_id)
        .maybeSingle();
      company = c ?? null;
    }

    // histórico de interações marcadas como vinculadas ao carrinho
    const { data: interactions } = await supabaseAdmin
      .from("lead_interactions")
      .select("id, type, content, created_at, created_by")
      .ilike("content", `%${data.id}%`)
      .order("created_at", { ascending: false })
      .limit(50);

    return { cart, profile, lead, company, interactions: interactions ?? [] };
  });

// =====================================================================
// Atualizar status / observações
// =====================================================================
export const updateAbandonedCart = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["novo", "contato_enviado", "recuperado", "perdido", "ignorado"]).optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.status) {
      patch.status = data.status;
      if (data.status === "recuperado") patch.recovered_at = new Date().toISOString();
    }
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await supabaseAdmin
      .from("abandoned_carts")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =====================================================================
// Registrar tentativa de contato (após abrir/copiar WhatsApp)
// =====================================================================
export const logContactAttempt = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        kind: z.enum(["whatsapp_opened", "message_copied"]),
        message: z.string().optional(),
        markAsContacted: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminId = (context as { adminUserId: string }).adminUserId;

    // incrementar tentativas + last_contacted_at + (talvez) status
    const { data: cart } = await supabaseAdmin
      .from("abandoned_carts")
      .select("recovery_attempts, status, lead_id")
      .eq("id", data.id)
      .maybeSingle();

    const patch: Record<string, unknown> = {
      recovery_attempts: Number(cart?.recovery_attempts ?? 0) + 1,
      last_contacted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (data.markAsContacted && cart?.status === "novo") {
      patch.status = "contato_enviado";
    }
    await supabaseAdmin
      .from("abandoned_carts")
      .update(patch as never)
      .eq("id", data.id);

    // Histórico vinculado ao lead, se houver — referenciamos o id do carrinho
    // dentro do conteúdo para encontrar via ilike no detalhe.
    if (cart?.lead_id) {
      await supabaseAdmin.from("lead_interactions").insert({
        lead_id: cart.lead_id,
        type: data.kind === "whatsapp_opened" ? "whatsapp" : "note",
        content:
          (data.kind === "whatsapp_opened"
            ? "WhatsApp aberto para recuperação de carrinho "
            : "Mensagem de carrinho copiada ") + `[carrinho:${data.id}]`,
        created_by: adminId,
      });
    }
    return { ok: true };
  });
