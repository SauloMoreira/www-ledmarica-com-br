import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import type { Database } from "@/integrations/supabase/types";
import { isValidCNPJ, onlyDigits } from "@/lib/cnpj";
import { ilikePattern } from "@/lib/postgrestFilter";
import {
  computeQuoteTotals,
  effectiveQuoteStatus,
  QUOTE_STATUSES,
  type QuoteStatus,
  type QuoteTerm,
} from "@/lib/quotes";
import { logAdminAction } from "./security/auditLog";
import { lookupCnpj } from "./cnpjLookup";
import { currentYearBR } from "@/lib/dateBR";

type QuoteRow = Database["public"]["Tables"]["quotes"]["Row"];
type QuoteItemRow = Database["public"]["Tables"]["quote_items"]["Row"];

export type QuoteItem = Omit<QuoteItemRow, "quantity" | "unit_price" | "discount_pct" | "line_total"> & {
  quantity: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
};

export type Quote = Omit<
  QuoteRow,
  | "status"
  | "terms"
  | "commercial_discount_pct"
  | "freight_amount"
  | "pix_discount_pct"
  | "subtotal_gross"
  | "items_discount_total"
  | "commercial_discount_amount"
  | "total"
  | "total_pix"
> & {
  status: QuoteStatus;
  stored_status: QuoteStatus;
  terms: QuoteTerm[];
  commercial_discount_pct: number;
  freight_amount: number;
  pix_discount_pct: number;
  subtotal_gross: number;
  items_discount_total: number;
  commercial_discount_amount: number;
  total: number;
  total_pix: number;
};

export type QuoteWithItems = Quote & { items: QuoteItem[] };

function normalizeQuote(r: QuoteRow): Quote {
  const stored = r.status as QuoteStatus;
  return {
    ...r,
    stored_status: stored,
    status: effectiveQuoteStatus(stored, r.expires_at),
    terms: Array.isArray(r.terms) ? (r.terms as unknown as QuoteTerm[]) : [],
    commercial_discount_pct: Number(r.commercial_discount_pct),
    freight_amount: Number(r.freight_amount),
    pix_discount_pct: Number(r.pix_discount_pct),
    subtotal_gross: Number(r.subtotal_gross),
    items_discount_total: Number(r.items_discount_total),
    commercial_discount_amount: Number(r.commercial_discount_amount),
    total: Number(r.total),
    total_pix: Number(r.total_pix),
  };
}

function normalizeItem(r: QuoteItemRow): QuoteItem {
  return {
    ...r,
    quantity: Number(r.quantity),
    unit_price: Number(r.unit_price),
    discount_pct: Number(r.discount_pct),
    line_total: Number(r.line_total),
  };
}

// ---------------- Schemas ----------------
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const itemSchema = z.object({
  product_id: z.string().uuid().nullable().optional(),
  sku: optText(80),
  name: z.string().trim().min(1, "Informe o nome do item").max(300),
  specs: optText(1000),
  ncm: optText(20),
  unit: z.string().trim().min(1).max(10).default("pç"),
  quantity: z.number().positive("Quantidade deve ser maior que zero").max(10_000_000),
  unit_price: z.number().min(0).max(100_000_000),
  discount_pct: z.number().min(0).max(100).default(0),
});

const quoteBodySchema = z.object({
  company_id: z.string().uuid().nullable().optional(),
  negotiation_id: z.string().uuid().nullable().optional(),
  client_legal_name: z.string().trim().min(2, "Informe a razão social").max(200),
  client_trade_name: optText(200),
  client_cnpj: z
    .string()
    .transform((v) => onlyDigits(v))
    .refine((v) => isValidCNPJ(v), "CNPJ inválido"),
  client_state_registration: optText(40),
  client_contact_name: optText(120),
  client_phone: optText(40),
  client_email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v == null || z.string().email().safeParse(v).success, "E-mail inválido"),
  client_address: optText(400),
  client_reference: optText(200),
  validity_hours: z.number().int().min(1).max(720).default(24),
  commercial_discount_pct: z.number().min(0).max(100).default(0),
  freight_amount: z.number().min(0).max(10_000_000).default(0),
  pix_discount_pct: z.number().min(0).max(100).default(5),
  terms: z
    .array(z.object({ label: z.string().trim().max(60), text: z.string().trim().max(1000) }))
    .max(20),
  internal_notes: optText(4000),
  seller_name: optText(120),
  items: z.array(itemSchema).max(300),
});
export type QuoteBodyInput = z.input<typeof quoteBodySchema>;

function buildRows(body: z.output<typeof quoteBodySchema>) {
  const totals = computeQuoteTotals({
    items: body.items,
    commercial_discount_pct: body.commercial_discount_pct,
    freight_amount: body.freight_amount,
    pix_discount_pct: body.pix_discount_pct,
  });
  const { items, ...rest } = body;
  const header = {
    ...rest,
    company_id: rest.company_id ?? null,
    negotiation_id: rest.negotiation_id ?? null,
    terms: rest.terms as unknown as Database["public"]["Tables"]["quotes"]["Insert"]["terms"],
    subtotal_gross: totals.subtotal_gross,
    items_discount_total: totals.items_discount_total,
    commercial_discount_amount: totals.commercial_discount_amount,
    total: totals.total,
    total_pix: totals.total_pix,
  };
  const itemRows = (quoteId: string) =>
    items.map((it, idx) => ({
      quote_id: quoteId,
      position: idx,
      product_id: it.product_id ?? null,
      sku: it.sku,
      name: it.name,
      specs: it.specs,
      ncm: it.ncm,
      unit: it.unit,
      quantity: it.quantity,
      unit_price: it.unit_price,
      discount_pct: it.discount_pct,
      line_total: totals.line_totals[idx],
    }));
  return { header, itemRows };
}

// ---------------- List ----------------
export const listQuotes = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z.enum(["all", ...QUOTE_STATUSES]).default("all"),
        q: z.string().max(100).default(""),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const nowIso = new Date().toISOString();
    const from = (data.page - 1) * data.pageSize;
    let q = sb
      .from("quotes")
      .select(
        "id, number, client_legal_name, client_trade_name, client_cnpj, issued_at, expires_at, validity_hours, total, total_pix, status",
        { count: "exact" },
      )
      .order("issued_at", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (data.status === "expirado") {
      q = q.or(`status.eq.expirado,and(status.in.(rascunho,enviado),expires_at.lt.${nowIso})`);
    } else if (data.status === "rascunho" || data.status === "enviado") {
      q = q.eq("status", data.status).gte("expires_at", nowIso);
    } else if (data.status !== "all") {
      q = q.eq("status", data.status);
    }
    const term = data.q.trim();
    if (term) {
      const p = ilikePattern(term);
      const digits = onlyDigits(term);
      const ors = p ? [`number.ilike.${p}`, `client_legal_name.ilike.${p}`, `client_trade_name.ilike.${p}`] : [];
      if (digits.length >= 3) ors.push(`client_cnpj.ilike.%${digits}%`);
      if (ors.length) q = q.or(ors.join(","));
    }
    const { data: rows, error, count } = await q;
    if (error) {
      console.error("[quotes] list", error.message);
      throw new Error("Não foi possível carregar os orçamentos");
    }
    return {
      rows: (rows ?? []).map((r) => ({
        ...r,
        total: Number(r.total),
        total_pix: Number(r.total_pix),
        status: effectiveQuoteStatus(r.status as QuoteStatus, r.expires_at),
      })),
      total: count ?? 0,
    };
  });

// ---------------- Get ----------------
async function loadQuote(
  sb: import("@supabase/supabase-js").SupabaseClient<Database>,
  id: string,
): Promise<QuoteWithItems> {
  const { data: q, error } = await sb.from("quotes").select("*").eq("id", id).maybeSingle();
  if (error || !q) throw new Error("Orçamento não encontrado");
  const { data: items, error: e2 } = await sb
    .from("quote_items")
    .select("*")
    .eq("quote_id", id)
    .order("position");
  if (e2) throw new Error("Não foi possível carregar os itens");
  return { ...normalizeQuote(q), items: (items ?? []).map(normalizeItem) };
}

export const getQuote = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => loadQuote(context.supabase, data.id));

/** Versão para impressão: sem observações internas. Custos nunca são lidos aqui. */
export const getQuoteForPrint = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const q = await loadQuote(context.supabase, data.id);
    const { internal_notes: _omit, ...rest } = q;
    const { data: cs } = await context.supabase
      .from("company_settings")
      .select(
        "legal_name, trade_name, cnpj, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zipcode, support_phone, support_whatsapp, website_url, business_hours",
      )
      .limit(1)
      .maybeSingle();
    return { quote: { ...rest, internal_notes: null }, issuer: cs ?? null };
  });

// ---------------- Create / Update ----------------
export const createQuote = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => quoteBodySchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const year = currentYearBR();
    const { data: number, error: ne } = await sb.rpc("next_quote_number", { _year: year });
    if (ne || !number) throw new Error("Não foi possível gerar o número do orçamento");
    const seq = Number(String(number).split("-").pop());
    const { header, itemRows } = buildRows(data);
    const { data: created, error } = await sb
      .from("quotes")
      .insert({ ...header, number, year, seq, created_by: context.userId, status: "rascunho" })
      .select("id, number, total")
      .single();
    if (error || !created) {
      console.error("[quotes] create", error?.message);
      throw new Error("Não foi possível criar o orçamento");
    }
    const rows = itemRows(created.id);
    if (rows.length) {
      const { error: ie } = await sb.from("quote_items").insert(rows);
      if (ie) {
        await sb.from("quotes").delete().eq("id", created.id);
        throw new Error("Não foi possível salvar os itens");
      }
    }
    await logAdminAction({
      adminId: context.userId,
      adminEmail: context.adminEmail,
      action: "quote_created",
      resourceType: "quote",
      resourceId: created.id,
      description: `Orçamento ${created.number} criado para ${data.client_legal_name}.`,
      after: { number: created.number, total: created.total, items: rows.length },
    });
    return { id: created.id, number: created.number };
  });

export const updateQuote = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), body: quoteBodySchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { header, itemRows } = buildRows(data.body);
    const { error } = await sb.from("quotes").update(header).eq("id", data.id);
    if (error) {
      console.error("[quotes] update", error.message);
      throw new Error("Não foi possível salvar o orçamento");
    }
    const { error: de } = await sb.from("quote_items").delete().eq("quote_id", data.id);
    if (de) throw new Error("Não foi possível salvar os itens");
    const rows = itemRows(data.id);
    if (rows.length) {
      const { error: ie } = await sb.from("quote_items").insert(rows);
      if (ie) throw new Error("Não foi possível salvar os itens");
    }
    return loadQuote(sb, data.id);
  });

export const duplicateQuote = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const src = await loadQuote(sb, data.id);
    const year = currentYearBR();
    const { data: number, error: ne } = await sb.rpc("next_quote_number", { _year: year });
    if (ne || !number) throw new Error("Não foi possível gerar o número do orçamento");
    const seq = Number(String(number).split("-").pop());
    const body = quoteBodySchema.parse({
      ...src,
      items: src.items.map((i) => ({ ...i })),
    });
    const { header, itemRows } = buildRows(body);
    const { data: created, error } = await sb
      .from("quotes")
      .insert({
        ...header,
        number,
        year,
        seq,
        status: "rascunho",
        issued_at: new Date().toISOString(),
        created_by: context.userId,
      })
      .select("id, number")
      .single();
    if (error || !created) throw new Error("Não foi possível duplicar o orçamento");
    const rows = itemRows(created.id);
    if (rows.length) {
      const { error: ie } = await sb.from("quote_items").insert(rows);
      if (ie) {
        await sb.from("quotes").delete().eq("id", created.id);
        throw new Error("Não foi possível duplicar os itens");
      }
    }
    await logAdminAction({
      adminId: context.userId,
      adminEmail: context.adminEmail,
      action: "quote_duplicated",
      resourceType: "quote",
      resourceId: created.id,
      description: `Orçamento ${created.number} criado a partir de ${src.number}.`,
      before: { source_id: src.id, source_number: src.number },
      after: { number: created.number },
    });
    return { id: created.id, number: created.number };
  });

export const setQuoteStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["rascunho", "enviado", "aprovado", "recusado", "convertido"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: prev } = await sb
      .from("quotes")
      .select("id, number, status, negotiation_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!prev) throw new Error("Orçamento não encontrado");
    const { error } = await sb.from("quotes").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error("Não foi possível alterar o status");
    if (data.status === "enviado" && prev.negotiation_id) {
      const { error: ne } = await sb
        .from("b2b_negotiations")
        .update({ status: "proposta_enviada" })
        .eq("id", prev.negotiation_id);
      if (ne) console.error("[quotes] negotiation status", ne.message);
    }
    await logAdminAction({
      adminId: context.userId,
      adminEmail: context.adminEmail,
      action: "quote_status_changed",
      resourceType: "quote",
      resourceId: data.id,
      description: `Orçamento ${prev.number}: status ${prev.status} → ${data.status}.`,
      before: { status: prev.status },
      after: { status: data.status },
    });
    return { ok: true };
  });

export const deleteQuote = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: prev } = await sb
      .from("quotes")
      .select("id, number, status, client_legal_name, total")
      .eq("id", data.id)
      .maybeSingle();
    if (!prev) throw new Error("Orçamento não encontrado");
    if (prev.status !== "rascunho") throw new Error("Só é possível excluir orçamentos em rascunho");
    const { error } = await sb.from("quotes").delete().eq("id", data.id).eq("status", "rascunho");
    if (error) throw new Error("Não foi possível excluir o orçamento");
    await logAdminAction({
      adminId: context.userId,
      adminEmail: context.adminEmail,
      action: "quote_deleted",
      resourceType: "quote",
      resourceId: data.id,
      description: `Orçamento ${prev.number} (rascunho) excluído.`,
      before: prev,
    });
    return { ok: true };
  });

// ---------------- Apoio ao editor ----------------
export type QuoteProductOption = {
  id: string;
  name: string;
  sku: string | null;
  ncm: string | null;
  commercial_unit: string | null;
  price: number | null;
  sale_price: number | null;
  b2b_price: number | null;
  b2b_enabled: boolean;
  b2b_min_qty: number | null;
  specs: string | null;
  cost_price: number | null;
  min_margin_percent: number | null;
};

function specsToText(specs: unknown): string | null {
  if (!specs) return null;
  if (typeof specs === "string") return specs.slice(0, 500);
  if (typeof specs === "object" && !Array.isArray(specs)) {
    const parts = Object.entries(specs as Record<string, unknown>)
      .filter(([, v]) => v != null && v !== "")
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${String(v)}`);
    return parts.length ? parts.join(" · ").slice(0, 500) : null;
  }
  return null;
}

/** Reaproveita a RPC admin_list_products (já protegida por is_admin). */
export const searchQuoteProducts = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ q: z.string().max(100) }).parse(d))
  .handler(async ({ data, context }): Promise<QuoteProductOption[]> => {
    const p = ilikePattern(data.q.trim());
    let q = context.supabase
      .rpc("admin_list_products")
      .select(
        "id, name, sku, ncm, commercial_unit, price, sale_price, b2b_price, b2b_enabled, b2b_min_qty, specs, cost_price, min_margin_percent, active",
      )
      .neq("active", false)
      .order("name")
      .limit(20);
    if (p) q = q.or(`name.ilike.${p},sku.ilike.${p},gtin_ean.ilike.${p}`);
    const { data: rows, error } = await q;
    if (error) {
      console.error("[quotes] product search", error.message);
      throw new Error("Falha na busca de produtos");
    }
    return (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      sku: r.sku,
      ncm: r.ncm,
      commercial_unit: r.commercial_unit,
      price: r.price != null ? Number(r.price) : null,
      sale_price: r.sale_price != null ? Number(r.sale_price) : null,
      b2b_price: r.b2b_price != null ? Number(r.b2b_price) : null,
      b2b_enabled: !!r.b2b_enabled,
      b2b_min_qty: r.b2b_min_qty,
      specs: specsToText(r.specs),
      cost_price: r.cost_price != null ? Number(r.cost_price) : null,
      min_margin_percent: r.min_margin_percent != null ? Number(r.min_margin_percent) : null,
    }));
  });

/** Custos/margens dos produtos já presentes num orçamento (só para o editor). */
export const getQuoteProductCosts = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!data.ids.length) return {} as Record<string, { cost_price: number | null; min_margin_percent: number | null; b2b_min_qty: number | null }>;
    const { data: rows } = await context.supabase
      .rpc("admin_list_products")
      .select("id, cost_price, min_margin_percent, b2b_min_qty")
      .in("id", data.ids);
    const out: Record<string, { cost_price: number | null; min_margin_percent: number | null; b2b_min_qty: number | null }> = {};
    for (const r of rows ?? []) {
      out[r.id] = {
        cost_price: r.cost_price != null ? Number(r.cost_price) : null,
        min_margin_percent: r.min_margin_percent != null ? Number(r.min_margin_percent) : null,
        b2b_min_qty: r.b2b_min_qty,
      };
    }
    return out;
  });

export const searchQuoteCompanies = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ q: z.string().max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("companies")
      .select(
        "id, cnpj, legal_name, trade_name, state_registration, contact_name, contact_phone, contact_email, address_street, address_number, address_neighborhood, address_city, address_state, address_zipcode",
      )
      .order("legal_name")
      .limit(15);
    const term = data.q.trim();
    if (term) {
      const p = ilikePattern(term);
      const digits = onlyDigits(term);
      const ors = p ? [`legal_name.ilike.${p}`, `trade_name.ilike.${p}`] : [];
      if (digits.length >= 3) ors.push(`cnpj.ilike.%${digits}%`);
      if (ors.length) q = q.or(ors.join(","));
    }
    const { data: rows, error } = await q;
    if (error) {
      console.error("[quotes] companies", error.message);
      throw new Error("Falha na busca de empresas");
    }
    return rows ?? [];
  });

export const listQuoteNegotiations = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ company_id: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("b2b_negotiations")
      .select("id, company_name, cnpj, status, created_at")
      .not("status", "in", "(convertida_em_pedido,perdida,cancelada)")
      .order("created_at", { ascending: false })
      .limit(30);
    if (data.company_id) q = q.eq("company_id", data.company_id);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const lookupQuoteCnpj = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({ cnpj: z.string().transform(onlyDigits).refine(isValidCNPJ, "CNPJ inválido") })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const r = await lookupCnpj(data.cnpj);
    if (!r.ok) return { ok: false as const, reason: r.reason };
    const raw = r.raw;
    const s = (k: string) => (raw[k] ? String(raw[k]) : "");
    const address = [
      [s("logradouro"), s("numero")].filter(Boolean).join(", "),
      s("complemento"),
      s("bairro"),
      [s("municipio"), s("uf")].filter(Boolean).join("/"),
      s("cep"),
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      ok: true as const,
      situation: r.situation,
      legalName: r.legalName,
      tradeName: r.tradeName,
      phone: s("telefone") || null,
      email: s("email") || null,
      address: address || null,
    };
  });
