import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { expandSearchTerms, normalizeSearch } from "@/lib/searchNormalize";

// ----------------------------------------------------------------
// searchProducts — usado pela /catalogo (público)
// ----------------------------------------------------------------
const ALLOWED_FILTER_KEYS = new Set(["power", "color_temperature", "voltage", "ip_rating"]);

const attrFilterSchema = z
  .object({
    key: z.string().min(1).max(80),
    values: z.array(z.string().min(1).max(60)).max(20).optional(),
    min: z.number().min(0).max(1000000).optional(),
    max: z.number().min(0).max(1000000).optional(),
  })
  .refine((f) => (f.values && f.values.length > 0) || f.min != null || f.max != null, {
    message: "attr filter precisa de values ou min/max",
  });

const searchInput = z.object({
  q: z.string().max(200).optional(),
  categorySlug: z.string().max(120).optional(),
  categoryId: z.string().uuid().optional(),
  brand: z.string().max(120).optional(),
  priceMin: z.number().min(0).max(999999).optional(),
  priceMax: z.number().min(0).max(999999).optional(),
  inStock: z.boolean().optional(),
  onSale: z.boolean().optional(),
  freeShipping: z.boolean().optional(),
  b2bOnly: z.boolean().optional(),
  minQtyMax: z.number().int().min(1).max(100000).optional(),
  attrFilters: z.array(attrFilterSchema).max(10).optional(),
  sort: z
    .enum([
      "relevance",
      "featured",
      "price_asc",
      "price_desc",
      "newest",
      "best_sellers",
      "b2b_discount_desc",
      "b2b_min_qty_asc",
      "stock_first",
      "name_asc",
    ])
    .optional(),
  page: z.number().int().min(1).max(500).optional(),
  pageSize: z.number().int().min(1).max(48).optional(),
  source: z.enum(["public_store", "admin", "b2b_store"]).optional(),
});

export const searchProducts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => searchInput.parse(input))
  .handler(async ({ data }) => {
    const pageSize = data.pageSize ?? 24;
    const page = data.page ?? 1;
    const offset = (page - 1) * pageSize;

    const terms = data.q ? expandSearchTerms(data.q) : null;

    let categoryId: string | null = data.categoryId ?? null;
    if (!categoryId && data.categorySlug) {
      const { data: cat } = await supabaseAdmin
        .from("categories")
        .select("id")
        .eq("slug", data.categorySlug)
        .maybeSingle();
      categoryId = cat?.id ?? null;
    }

    // Sanitiza attrFilters: só chaves permitidas
    const sanitizedAttrFilters = (data.attrFilters ?? [])
      .filter((f) => ALLOWED_FILTER_KEYS.has(f.key.toLowerCase()))
      .map((f) => ({
        key: f.key.toLowerCase(),
        ...(f.values && f.values.length > 0 ? { values: f.values } : {}),
        ...(f.min != null ? { min: f.min } : {}),
        ...(f.max != null ? { max: f.max } : {}),
      }));

    const { data: rows, error } = await (supabaseAdmin as any).rpc("search_products_public", {
      _terms: terms,
      _category_id: categoryId,
      _brand: data.brand ?? null,
      _price_min: data.priceMin ?? null,
      _price_max: data.priceMax ?? null,
      _in_stock: data.inStock ?? null,
      _on_sale: data.onSale ?? null,
      _free_shipping: data.freeShipping ?? null,
      _sort: data.sort ?? "relevance",
      _limit: pageSize,
      _offset: offset,
      _b2b_only: data.b2bOnly ?? false,
      _min_qty_max: data.minQtyMax ?? null,
      _attr_filters: sanitizedAttrFilters.length > 0 ? sanitizedAttrFilters : null,
    });

    if (error) {
      console.error("[searchProducts] RPC error", error);
      throw new Error("Falha ao buscar produtos");
    }

    const total = Number((rows?.[0] as any)?.total_count ?? 0);
    const products = (rows ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      price: Number(r.price),
      sale_price: r.sale_price != null ? Number(r.sale_price) : null,
      stock_qty: r.stock_qty,
      brand: r.brand,
      tags: r.tags ?? [],
      images: r.images ?? [],
      featured: !!r.featured,
      free_shipping_eligible: !!r.free_shipping_eligible,
      category_id: r.category_id,
      // Campos B2B (podem vir como undefined em chamadas antigas — toleramos).
      b2b_enabled: r.b2b_enabled === true,
      b2b_price: r.b2b_price != null ? Number(r.b2b_price) : null,
      b2b_min_qty: r.b2b_min_qty != null ? Number(r.b2b_min_qty) : null,
      b2b_qty_multiple: r.b2b_qty_multiple != null ? Number(r.b2b_qty_multiple) : null,
      b2b_show_in_vitrine: r.b2b_show_in_vitrine !== false,
      b2b_valid_until: r.b2b_valid_until ?? null,
    }));

    // Grade/vitrine: esconder produtos-filho (variações) para não duplicar cards.
    // Buscas por texto continuam retornando variações normalmente.
    let visibleProducts = products;
    if ((terms?.length ?? 0) === 0 && products.length > 0) {
      const { data: childRows } = await supabaseAdmin
        .from("products")
        .select("id")
        .in(
          "id",
          products.map((p: { id: string }) => p.id),
        )
        .not("parent_product_id", "is", null);
      const childIds = new Set((childRows ?? []).map((r: { id: string }) => r.id));
      if (childIds.size > 0) {
        visibleProducts = products.filter((p: { id: string }) => !childIds.has(p.id));
      }
    }



    // Log de buscas sem resultado (best-effort, não bloqueia)
    if (data.q && data.q.trim().length >= 2 && total === 0) {
      try {
        await supabaseAdmin.from("search_logs").insert({
          search_term: data.q.trim().slice(0, 200),
          normalized_term: normalizeSearch(data.q).slice(0, 200) || data.q.slice(0, 200),
          results_count: 0,
          source: data.source ?? "public_store",
        });
      } catch (e) {
        console.warn("[searchProducts] failed to log empty search", e);
      }
    }

    return { products: visibleProducts, total, page, pageSize };
  });

// ----------------------------------------------------------------
// autocompleteSearch — usado pelo Header (debounce no client)
// ----------------------------------------------------------------
const autocompleteInput = z.object({
  q: z.string().min(2).max(80),
});

export const autocompleteSearch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => autocompleteInput.parse(input))
  .handler(async ({ data }) => {
    const terms = expandSearchTerms(data.q);
    if (!terms.length) return { suggestions: [] as Array<any> };

    const { data: rows, error } = await (supabaseAdmin as any).rpc("autocomplete_products_public", {
      _terms: terms,
      _limit: 6,
    });

    if (error) {
      console.error("[autocompleteSearch] RPC error", error);
      return { suggestions: [] as Array<any> };
    }

    const suggestions = (rows ?? []).map((r: any) => ({
      kind: r.kind as "product" | "category",
      id: r.id,
      name: r.name,
      slug: r.slug,
      brand: r.brand,
      image: r.image,
      price: r.price != null ? Number(r.price) : null,
      sale_price: r.sale_price != null ? Number(r.sale_price) : null,
    }));

    return { suggestions };
  });

// ----------------------------------------------------------------
// getCatalogAttributeFacets — opções de filtros técnicos disponíveis
// ----------------------------------------------------------------
const facetsInput = z.object({
  categorySlug: z.string().max(120).optional(),
  categoryId: z.string().uuid().optional(),
});

export type CatalogFacetValue = {
  value: string;
  productCount: number;
};

export type CatalogFacetGroup = {
  key: string;
  label: string;
  unit: string | null;
  values: CatalogFacetValue[];
};

const FACET_KEYS = ["power", "color_temperature", "voltage", "ip_rating"] as const;

export const getCatalogAttributeFacets = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => facetsInput.parse(input))
  .handler(async ({ data }): Promise<{ facets: CatalogFacetGroup[] }> => {
    let categoryId: string | null = data.categoryId ?? null;
    if (!categoryId && data.categorySlug) {
      const { data: cat } = await supabaseAdmin
        .from("categories")
        .select("id")
        .eq("slug", data.categorySlug)
        .maybeSingle();
      categoryId = cat?.id ?? null;
    }

    const { data: rows, error } = await (supabaseAdmin as any).rpc("get_catalog_attribute_facets", {
      _category_id: categoryId,
      _keys: FACET_KEYS as unknown as string[],
    });

    if (error) {
      console.error("[getCatalogAttributeFacets] RPC error", error);
      return { facets: [] };
    }

    const grouped = new Map<string, CatalogFacetGroup>();
    for (const r of (rows ?? []) as Array<any>) {
      const key = String(r.attribute_key);
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          label: r.attribute_label ?? key,
          unit: r.attribute_unit ?? null,
          values: [],
        });
      }
      grouped.get(key)!.values.push({
        value: String(r.attribute_value),
        productCount: Number(r.product_count ?? 0),
      });
    }

    return { facets: Array.from(grouped.values()) };
  });
