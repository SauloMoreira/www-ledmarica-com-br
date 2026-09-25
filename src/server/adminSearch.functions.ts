import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeSearch } from "@/lib/searchNormalize";
import { ilikePattern, sanitizeSearchTerm } from "@/lib/postgrestFilter";

const PER_GROUP = 5;

const inputSchema = z.object({
  q: z.string().min(1).max(120),
});

export type AdminSearchGroup =
  | "product"
  | "order"
  | "customer"
  | "company"
  | "lead"
  | "coupon"
  | "campaign"
  | "invoice"
  | "bundle";

export interface AdminSearchHit {
  group: AdminSearchGroup;
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  to: string;
}

function maskCnpj(v?: string | null) {
  if (!v) return "";
  const d = v.replace(/\D/g, "");
  if (d.length !== 14) return v;
  return `${d.slice(0, 2)}.***.***/${d.slice(8, 12)}-**`;
}

function escapeIlike(term: string) {
  // escape % and _ and , for PostgREST or() expression
  return sanitizeSearchTerm(term);
}

export const adminGlobalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Verify admin server-side
    const { data: isAdminRow } = await (supabaseAdmin as any).rpc("is_admin", { _user_id: userId });
    const isAdmin = isAdminRow === true;
    if (!isAdmin) {
      return { hits: [] as AdminSearchHit[] };
    }

    const raw = data.q.trim();
    const term = escapeIlike(raw);
    if (term.length < 2) return { hits: [] as AdminSearchHit[] };
    const like = `%${term}%`;
    const normalized = normalizeSearch(raw);

    const hits: AdminSearchHit[] = [];

    // Run independent queries in parallel
    const [
      productsRes,
      ordersRes,
      customersRes,
      companiesRes,
      leadsRes,
      couponsRes,
      campaignsRes,
      bundlesRes,
      invoicesRes,
      attrMatchRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id, name, sku, brand, active, gtin_ean")
        .or(
          [
            `name.ilike.${like}`,
            `sku.ilike.${like}`,
            `brand.ilike.${like}`,
            `gtin_ean.ilike.${like}`,
          ].join(","),
        )
        .limit(PER_GROUP),

      supabaseAdmin
        .from("orders")
        .select(
          "id, order_number, status, payment_status, total, address_snapshot, company_name, invoice_number, created_at",
        )
        .or(
          [
            `order_number.ilike.${like}`,
            `invoice_number.ilike.${like}`,
            `company_name.ilike.${like}`,
          ].join(","),
        )
        .order("created_at", { ascending: false })
        .limit(PER_GROUP),

      supabaseAdmin
        .from("profiles")
        .select("id, name, email, phone")
        .or([`name.ilike.${like}`, `email.ilike.${like}`, `phone.ilike.${like}`].join(","))
        .limit(PER_GROUP),

      supabaseAdmin
        .from("companies")
        .select("id, legal_name, trade_name, cnpj, status")
        .or(
          [`legal_name.ilike.${like}`, `trade_name.ilike.${like}`, `cnpj.ilike.${like}`].join(","),
        )
        .limit(PER_GROUP),

      supabaseAdmin
        .from("leads")
        .select("id, name, email, phone, status, origin")
        .or([`name.ilike.${like}`, `email.ilike.${like}`, `phone.ilike.${like}`].join(","))
        .order("created_at", { ascending: false })
        .limit(PER_GROUP),

      supabaseAdmin
        .from("coupons")
        .select("id, code, active, expires_at, discount_type, discount_value")
        .ilike("code", like)
        .limit(PER_GROUP),

      supabaseAdmin
        .from("marketing_campaigns")
        .select("id, name, status, utm_campaign, channel")
        .or([`name.ilike.${like}`, `utm_campaign.ilike.${like}`].join(","))
        .limit(PER_GROUP),

      supabaseAdmin
        .from("product_bundles")
        .select("id, name, slug")
        .or([`name.ilike.${like}`, `slug.ilike.${like}`].join(","))
        .limit(PER_GROUP),

      // Notas fiscais: pesquisar por número, série ou access key (truncado)
      supabaseAdmin
        .from("orders")
        .select(
          "id, order_number, invoice_number, invoice_series, invoice_access_key, invoice_status",
        )
        .not("invoice_number", "is", null)
        .or(
          [
            `invoice_number.ilike.${like}`,
            `invoice_series.ilike.${like}`,
            `invoice_access_key.ilike.${like}`,
          ].join(","),
        )
        .limit(PER_GROUP),

      // Atributos técnicos: localiza produtos por valor/label/unidade técnica
      // (ex.: "IP66", "Bivolt", "6500K", "18W"). Limita a 8 e depois resolve produtos.
      supabaseAdmin
        .from("product_attributes")
        .select("product_id")
        .or(
          [
            `attribute_value.ilike.${like}`,
            `attribute_label.ilike.${like}`,
            `attribute_unit.ilike.${like}`,
          ].join(","),
        )
        .limit(20),
    ]);

    const productIds = new Set<string>();
    for (const p of productsRes.data ?? []) {
      productIds.add(p.id);
      hits.push({
        group: "product",
        id: p.id,
        title: p.name,
        subtitle: [p.sku && `SKU: ${p.sku}`, p.brand].filter(Boolean).join(" · "),
        badge: p.active ? "Ativo" : "Inativo",
        to: `/admin/produtos/${p.id}`,
      });
    }

    // Produtos encontrados por atributos técnicos (IP66, Bivolt, 6500K, 18W…)
    const extraAttrIds = Array.from(
      new Set(
        ((attrMatchRes.data ?? []) as Array<{ product_id: string }>)
          .map((r) => r.product_id)
          .filter((id) => id && !productIds.has(id)),
      ),
    ).slice(0, PER_GROUP);
    if (extraAttrIds.length > 0) {
      const { data: extraProducts } = await supabaseAdmin
        .from("products")
        .select("id, name, sku, brand, active")
        .in("id", extraAttrIds);
      for (const p of extraProducts ?? []) {
        productIds.add(p.id);
        hits.push({
          group: "product",
          id: p.id,
          title: p.name,
          subtitle: [p.sku && `SKU: ${p.sku}`, p.brand, "atributo técnico"]
            .filter(Boolean)
            .join(" · "),
          badge: p.active ? "Ativo" : "Inativo",
          to: `/admin/produtos/${p.id}`,
        });
      }
    }

    for (const o of ordersRes.data ?? []) {
      const snap = (o as any).address_snapshot as { recipient?: string } | null;
      const cust = o.company_name || snap?.recipient || "—";
      hits.push({
        group: "order",
        id: o.id,
        title: `Pedido #${o.order_number ?? o.id.slice(0, 6)}`,
        subtitle: `${cust} · ${o.status ?? "—"}`,
        badge: o.payment_status ?? undefined,
        to: `/admin/pedidos/${o.id}`,
      });
    }

    for (const c of customersRes.data ?? []) {
      hits.push({
        group: "customer",
        id: c.id,
        title: c.name || c.email || "Cliente",
        subtitle: c.email ?? undefined,
        to: `/admin/leads?customer=${encodeURIComponent(c.email ?? "")}`,
      });
    }

    for (const co of companiesRes.data ?? []) {
      hits.push({
        group: "company",
        id: co.id,
        title: co.trade_name || co.legal_name,
        subtitle: `CNPJ: ${maskCnpj(co.cnpj)}`,
        badge: co.status ?? undefined,
        to: `/admin/empresas?id=${co.id}`,
      });
    }

    for (const l of leadsRes.data ?? []) {
      hits.push({
        group: "lead",
        id: l.id,
        title: l.name,
        subtitle: [l.email, l.origin].filter(Boolean).join(" · "),
        badge: l.status ?? undefined,
        to: `/admin/leads?id=${l.id}`,
      });
    }

    for (const c of couponsRes.data ?? []) {
      hits.push({
        group: "coupon",
        id: c.id,
        title: c.code,
        subtitle: c.discount_type === "percent" ? `${c.discount_value}%` : `R$ ${c.discount_value}`,
        badge: c.active ? "Ativo" : "Inativo",
        to: `/admin/cupons`,
      });
    }

    for (const cp of campaignsRes.data ?? []) {
      hits.push({
        group: "campaign",
        id: cp.id,
        title: cp.name,
        subtitle: [cp.channel, cp.utm_campaign].filter(Boolean).join(" · "),
        badge: cp.status ?? undefined,
        to: `/admin/campanhas`,
      });
    }

    for (const b of bundlesRes.data ?? []) {
      hits.push({
        group: "bundle",
        id: b.id,
        title: b.name,
        subtitle: b.slug ?? undefined,
        to: `/admin/produtos/combos`,
      });
    }

    for (const inv of invoicesRes.data ?? []) {
      const key = inv.invoice_access_key
        ? `${String(inv.invoice_access_key).slice(0, 6)}…${String(inv.invoice_access_key).slice(-4)}`
        : null;
      hits.push({
        group: "invoice",
        id: inv.id,
        title: `NF ${inv.invoice_number}${inv.invoice_series ? ` · S${inv.invoice_series}` : ""}`,
        subtitle: [`Pedido #${inv.order_number ?? inv.id.slice(0, 6)}`, key]
          .filter(Boolean)
          .join(" · "),
        badge: inv.invoice_status ?? undefined,
        to: `/admin/pedidos/${inv.id}`,
      });
    }

    // Log empty searches
    if (hits.length === 0) {
      try {
        await supabaseAdmin.from("search_logs").insert({
          search_term: raw.slice(0, 200),
          normalized_term: normalized.slice(0, 200) || raw.slice(0, 200),
          results_count: 0,
          source: "admin",
          user_id: userId,
        });
      } catch {
        // best-effort
      }
    }

    // Cap to 30 total
    return { hits: hits.slice(0, 30) };
  });
