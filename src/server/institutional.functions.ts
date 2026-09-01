import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { requireAdmin, requireAdminMfaSoft } from "@/integrations/supabase/admin-middleware";
import { enforceRateLimit, getClientIdentifier } from "@/server/security/rateLimit";
import { logAdminAction } from "@/server/security/auditLog";

// ============================================================
// PUBLIC: Company settings (single record) - read only
// ============================================================
export const getPublicCompanySettings = createServerFn({ method: "GET" }).handler(async () => {
  // Filtra explicitamente campos não-sensíveis. CNPJ, inscrições estadual/municipal,
  // razão social e endereço completo NÃO são expostos publicamente — apenas no admin.
  const { data, error } = await supabaseAdmin
    .from("company_settings")
    .select(
      "id, trade_name, logo_url, support_email, support_phone, support_whatsapp, business_hours, instagram_url, facebook_url, tiktok_url, linkedin_url, website_url, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zipcode, pickup_enabled, pickup_store_name, pickup_address, pickup_phone, pickup_business_hours, pickup_instructions, pickup_ready_eta",
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[getPublicCompanySettings] db error:", error);
    throw new Error("Serviço temporariamente indisponível");
  }
  return { company: data };
});

// ============================================================
// PUBLIC: list footer pages
// ============================================================
export const getFooterPages = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("institutional_pages")
    .select("id,title,slug,sort_order")
    .eq("status", "published")
    .eq("show_in_footer", true)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("[getFooterPages] db error:", error);
    throw new Error("Serviço temporariamente indisponível");
  }
  return { pages: data ?? [] };
});

// ============================================================
// PUBLIC: get one published page by slug
// ============================================================
export const getPublicInstitutionalPage = createServerFn({ method: "POST" })
  .inputValidator(z.object({ slug: z.string().min(1).max(120) }))
  .handler(async ({ data }) => {
    const { data: page, error } = await supabaseAdmin
      .from("institutional_pages")
      .select("id,title,slug,content,excerpt,seo_title,seo_description,updated_at")
      .eq("slug", data.slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) {
      console.error("[getPublicInstitutionalPage] db error:", error);
      throw new Error("Serviço temporariamente indisponível");
    }
    return { page };
  });

// ============================================================
// PUBLIC: submit contact form
// ============================================================
const contactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  subject: z.string().trim().max(200).optional().or(z.literal("")),
  message: z.string().trim().min(1).max(5000),
});

export const submitContactMessage = createServerFn({ method: "POST" })
  .inputValidator(contactSchema)
  .handler(async ({ data }) => {
    const ip = getClientIdentifier();
    // Rate limit por IP e por e-mail (qualquer um que estoure bloqueia)
    await enforceRateLimit(`ip:${ip}`, "contact");
    await enforceRateLimit(`email:${data.email.toLowerCase()}`, "contact");

    const { error } = await supabaseAdmin.from("contact_messages").insert({
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      subject: data.subject || null,
      message: data.message,
      status: "new",
      source: "contact_page",
    });
    if (error) throw new Error("Não foi possível enviar sua mensagem. Tente novamente.");
    return { ok: true };
  });

// ============================================================
// ADMIN: company settings - update
// ============================================================
const companyUpdateSchema = z.object({
  legal_name: z.string().max(200).nullable().optional(),
  trade_name: z.string().max(200).nullable().optional(),
  cnpj: z.string().max(20).nullable().optional(),
  state_registration: z.string().max(40).nullable().optional(),
  municipal_registration: z.string().max(40).nullable().optional(),
  address_street: z.string().max(200).nullable().optional(),
  address_number: z.string().max(20).nullable().optional(),
  address_complement: z.string().max(120).nullable().optional(),
  address_neighborhood: z.string().max(120).nullable().optional(),
  address_city: z.string().max(120).nullable().optional(),
  address_state: z.string().max(2).nullable().optional(),
  address_zipcode: z.string().max(10).nullable().optional(),
  support_email: z.string().email().max(255).nullable().optional().or(z.literal("")),
  support_phone: z.string().max(40).nullable().optional(),
  support_whatsapp: z.string().max(40).nullable().optional(),
  business_hours: z.string().max(300).nullable().optional(),
  instagram_url: z.string().url().max(255).nullable().optional().or(z.literal("")),
  facebook_url: z.string().url().max(255).nullable().optional().or(z.literal("")),
  tiktok_url: z.string().url().max(255).nullable().optional().or(z.literal("")),
  linkedin_url: z.string().url().max(255).nullable().optional().or(z.literal("")),
  website_url: z.string().url().max(255).nullable().optional().or(z.literal("")),
  logo_url: z.string().max(500).nullable().optional(),
  pickup_enabled: z.union([z.boolean(), z.string()]).optional(),
  pickup_store_name: z.string().max(200).nullable().optional(),
  pickup_address: z.string().max(500).nullable().optional(),
  pickup_phone: z.string().max(40).nullable().optional(),
  pickup_business_hours: z.string().max(300).nullable().optional(),
  pickup_instructions: z.string().max(1000).nullable().optional(),
  pickup_ready_eta: z.string().max(120).nullable().optional(),
});

export const adminGetCompanySettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("company_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      const { data: created, error: insErr } = await supabaseAdmin
        .from("company_settings")
        .insert({})
        .select("*")
        .single();
      if (insErr) throw new Error(insErr.message);
      return { company: created };
    }
    return { company: data };
  });

export const adminUpdateCompanySettings = createServerFn({ method: "POST" })
  .middleware([requireAdminMfaSoft])
  .inputValidator(companyUpdateSchema)
  .handler(async ({ data, context }) => {
    const adminId = (context as { adminUserId: string }).adminUserId;
    const { data: existing } = await supabaseAdmin
      .from("company_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const cleaned: Record<string, string | boolean | null> = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === "pickup_enabled") {
        cleaned[k] = v === true || v === "true" || v === "1" || v === "on";
      } else {
        cleaned[k] = v === "" || v === undefined ? null : (v as string | null);
      }
    }
    const payload = cleaned as never;
    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from("company_settings")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      await logAdminAction({
        adminId,
        action: "update",
        resourceType: "company_settings",
        resourceId: existing.id,
        description: "Atualizou dados da empresa",
        before: existing,
        after: payload,
      });
      return { ok: true };
    }
    const { error } = await supabaseAdmin.from("company_settings").insert(payload);
    if (error) throw new Error(error.message);
    await logAdminAction({
      adminId,
      action: "create",
      resourceType: "company_settings",
      description: "Criou registro de dados da empresa",
      after: payload,
    });
    return { ok: true };
  });

// ============================================================
// ADMIN: institutional pages
// ============================================================
export const adminListInstitutionalPages = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("institutional_pages")
      .select(
        "id,title,slug,status,sort_order,show_in_footer,show_in_header,is_required,updated_at",
      )
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });
    if (error) throw new Error(error.message);
    return { pages: data ?? [] };
  });

export const adminGetInstitutionalPage = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { data: page, error } = await supabaseAdmin
      .from("institutional_pages")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!page) throw new Error("Página não encontrada");
    return { page };
  });

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const pageUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(120).regex(slugRegex, "Slug inválido"),
  content: z.string().max(200_000).default(""),
  excerpt: z.string().max(500).nullable().optional(),
  seo_title: z.string().max(200).nullable().optional(),
  seo_description: z.string().max(300).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]),
  sort_order: z.number().int().min(0).max(9999),
  show_in_footer: z.boolean(),
  show_in_header: z.boolean(),
});

export const adminSaveInstitutionalPage = createServerFn({ method: "POST" })
  .middleware([requireAdminMfaSoft])
  .inputValidator(pageUpsertSchema)
  .handler(async ({ data, context }) => {
    const userId = (context as { adminUserId: string }).adminUserId;
    const payload = {
      title: data.title,
      slug: data.slug,
      content: data.content,
      excerpt: data.excerpt ?? null,
      seo_title: data.seo_title ?? null,
      seo_description: data.seo_description ?? null,
      status: data.status,
      sort_order: data.sort_order,
      show_in_footer: data.show_in_footer,
      show_in_header: data.show_in_header,
      updated_by: userId,
      published_at: data.status === "published" ? new Date().toISOString() : null,
    };
    if (data.id) {
      const { data: before } = await supabaseAdmin
        .from("institutional_pages")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      const { error } = await supabaseAdmin
        .from("institutional_pages")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await logAdminAction({
        adminId: userId,
        action: "update",
        resourceType: "institutional_page",
        resourceId: data.id,
        description: `Atualizou página "${data.title}"`,
        before,
        after: payload,
      });
      return { ok: true, id: data.id };
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("institutional_pages")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logAdminAction({
      adminId: userId,
      action: "create",
      resourceType: "institutional_page",
      resourceId: inserted.id,
      description: `Criou página "${data.title}"`,
      after: payload,
    });
    return { ok: true, id: inserted.id };
  });

export const adminDeleteInstitutionalPage = createServerFn({ method: "POST" })
  .middleware([requireAdminMfaSoft])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const adminId = (context as { adminUserId: string }).adminUserId;
    const { data: page } = await supabaseAdmin
      .from("institutional_pages")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (page?.is_required)
      throw new Error("Esta página é obrigatória e não pode ser excluída. Arquive-a.");
    const { error } = await supabaseAdmin.from("institutional_pages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAdminAction({
      adminId,
      action: "delete",
      resourceType: "institutional_page",
      resourceId: data.id,
      description: `Excluiu página "${page?.title ?? data.id}"`,
      before: page,
    });
    return { ok: true };
  });

// ============================================================
// ADMIN: contact messages
// ============================================================
export const adminListContactMessages = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const data = await fetchAllRows<any>((fromIdx, toIdx) =>
      supabaseAdmin
        .from("contact_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .range(fromIdx, toIdx),
    );
    return { messages: data ?? [] };
  });

export const adminUpdateContactMessageStatus = createServerFn({ method: "POST" })
  .middleware([requireAdminMfaSoft])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      status: z.enum(["new", "read", "answered", "archived"]),
    }),
  )
  .handler(async ({ data, context }) => {
    const adminId = (context as { adminUserId: string }).adminUserId;
    const { error } = await supabaseAdmin
      .from("contact_messages")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAdminAction({
      adminId,
      action: "update",
      resourceType: "contact_message",
      resourceId: data.id,
      description: `Marcou mensagem como "${data.status}"`,
      after: { status: data.status },
    });
    return { ok: true };
  });
