import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ilikePattern, sanitizeSearchTerm } from "@/lib/postgrestFilter";

export const RELATION_TYPES = [
  "related",
  "frequently_bought_together",
  "accessory",
  "replacement",
  "upsell",
  "cross_sell",
  "b2b_recommendation",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const RELATION_TYPE_LABEL: Record<RelationType, string> = {
  related: "Produto relacionado",
  frequently_bought_together: "Compre junto",
  accessory: "Acessório",
  replacement: "Produto substituto",
  upsell: "Venda adicional",
  cross_sell: "Venda complementar",
  b2b_recommendation: "Recomendação para empresas",
};

export type RelatedProduct = {
  relation_id: string;
  relation_type: RelationType;
  sort_order: number;
  product_id: string;
  name: string;
  slug: string;
  brand: string | null;
  image: string | null;
  retail_price: number;
  sale_price: number | null;
  applied_price: number;
  pricing_source: "b2b" | "retail";
  b2b_min_quantity: number | null;
  stock_qty: number;
  free_shipping_eligible: boolean;
};

export type ComplementaryProduct = {
  product_id: string;
  name: string;
  slug: string;
  brand: string | null;
  image: string | null;
  retail_price: number;
  sale_price: number | null;
  applied_price: number;
  pricing_source: "b2b" | "retail";
  stock_qty: number;
  free_shipping_eligible: boolean;
  match_count: number;
};

// ----------------------------------------------------------------------------
// Helpers internos
// ----------------------------------------------------------------------------
async function getOptionalUserId(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const auth = getRequestHeader("Authorization") || getRequestHeader("authorization");
    if (auth && auth.toLowerCase().startsWith("bearer ")) {
      const token = auth.slice(7).trim();
      const { data: userRes } = await supabaseAdmin.auth.getUser(token);
      return userRes.user?.id ?? null;
    }
  } catch {
    /* anon */
  }
  return null;
}

async function requireAdmin(): Promise<string> {
  const { assertAdminAal2FromBearer } = await import("@/integrations/supabase/admin-assertions.server");
  return assertAdminAal2FromBearer();
}

// ----------------------------------------------------------------------------
// PUBLIC: lista relações de um produto (página de produto)
// ----------------------------------------------------------------------------
const LAX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GetForProductInput = z.object({
  productId: z.string().regex(LAX_UUID, "Invalid UUID"),
  limit: z.number().int().min(1).max(24).optional(),
});

export const getRelationsForProduct = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => GetForProductInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await getOptionalUserId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("get_product_relations_public", {
      _product_id: data.productId,
      _user_id: userId ?? undefined,
      _limit: data.limit ?? 12,
    });
    if (error) throw error;
    return (rows ?? []) as RelatedProduct[];
  });

// ----------------------------------------------------------------------------
// PUBLIC: sugestões para o carrinho ("complete sua compra")
// ----------------------------------------------------------------------------
const GetForCartInput = z.object({
  productIds: z.array(z.string().regex(LAX_UUID, "Invalid UUID")).min(1).max(50),
  limit: z.number().int().min(1).max(12).optional(),
});

export const getCartComplementary = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => GetForCartInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await getOptionalUserId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("get_cart_complementary_products", {
      _product_ids: data.productIds,
      _user_id: userId ?? undefined,
      _limit: data.limit ?? 6,
    });
    if (error) throw error;
    return (rows ?? []) as ComplementaryProduct[];
  });

// ----------------------------------------------------------------------------
// ADMIN: listar relações de um produto (com nome do produto relacionado)
// ----------------------------------------------------------------------------
export type AdminRelationRow = {
  id: string;
  product_id: string;
  related_product_id: string;
  relation_type: RelationType;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  related_product: {
    id: string;
    name: string;
    slug: string;
    sku: string | null;
    brand: string | null;
    active: boolean;
    image: string | null;
  } | null;
};

const AdminListInput = z.object({ productId: z.string().uuid() });

export const adminListRelations = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminListInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("product_relations")
      .select(
        `id, product_id, related_product_id, relation_type, sort_order, is_active, created_at,
         related:products!product_relations_related_product_id_fkey (id, name, slug, sku, brand, active, images)`,
      )
      .eq("product_id", data.productId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((rows ?? []) as Array<Record<string, any>>).map((r) => ({
      id: r.id,
      product_id: r.product_id,
      related_product_id: r.related_product_id,
      relation_type: r.relation_type,
      sort_order: r.sort_order,
      is_active: r.is_active,
      created_at: r.created_at,
      related_product: r.related
        ? {
            id: r.related.id,
            name: r.related.name,
            slug: r.related.slug,
            sku: r.related.sku,
            brand: r.related.brand,
            active: r.related.active,
            image:
              Array.isArray(r.related.images) && r.related.images.length > 0
                ? r.related.images[0]
                : null,
          }
        : null,
    })) as AdminRelationRow[];
  });

// ----------------------------------------------------------------------------
// ADMIN: criar/editar/remover
// ----------------------------------------------------------------------------
const AdminCreateInput = z.object({
  productId: z.string().uuid(),
  relatedProductId: z.string().uuid(),
  relationType: z.enum(RELATION_TYPES),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const adminCreateRelation = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminCreateInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (data.productId === data.relatedProductId) {
      throw new Error("cannot_relate_to_self");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("product_relations").insert({
      product_id: data.productId,
      related_product_id: data.relatedProductId,
      relation_type: data.relationType,
      sort_order: data.sortOrder ?? 0,
      is_active: true,
    });
    if (error) {
      if ((error as any).code === "23505") throw new Error("relation_already_exists");
      throw error;
    }
    return { ok: true };
  });

const AdminUpdateInput = z.object({
  id: z.string().uuid(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
  relationType: z.enum(RELATION_TYPES).optional(),
});

export const adminUpdateRelation = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminUpdateInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const patch: {
      sort_order?: number;
      is_active?: boolean;
      relation_type?: RelationType;
    } = {};
    if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    if (data.relationType !== undefined) patch.relation_type = data.relationType;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("product_relations").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const AdminDeleteInput = z.object({ id: z.string().uuid() });

export const adminDeleteRelation = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminDeleteInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("product_relations").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ----------------------------------------------------------------------------
// ADMIN: busca rápida de produto para relacionar
// ----------------------------------------------------------------------------
const AdminSearchInput = z.object({
  query: z.string().trim().min(2).max(120),
  excludeProductId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

export const adminSearchProductsForRelation = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminSearchInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const term = ilikePattern(data.query) || "%";
    let q = supabaseAdmin
      .from("products")
      .select("id, name, slug, sku, brand, active, images, price, sale_price")
      .or(`name.ilike.${term},sku.ilike.${term},gtin_ean.ilike.${term}`)
      .order("active", { ascending: false })
      .order("name", { ascending: true })
      .limit(data.limit ?? 10);
    if (data.excludeProductId) q = q.neq("id", data.excludeProductId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return ((rows ?? []) as Array<Record<string, any>>).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      sku: r.sku as string | null,
      brand: r.brand as string | null,
      active: r.active as boolean,
      image: Array.isArray(r.images) && r.images.length > 0 ? (r.images[0] as string) : null,
      price: r.price as number,
      sale_price: r.sale_price as number | null,
    }));
  });
