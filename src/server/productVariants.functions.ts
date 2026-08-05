import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { slugify } from "@/lib/productImport";

/**
 * Variações de Produto (ex.: Cor = Vermelho / Branco / Azul).
 *
 * Modelo: cada variação É um produto completo em `products`, ligado ao
 * produto-pai por `parent_product_id`, com os valores em `variant_attributes`.
 * A "opção" da família (título + tipo de exibição) fica em
 * `product_variant_options`, sempre apontando para o produto-pai.
 *
 * Nada de checkout, B2B, estoque auditado ou combos é alterado aqui.
 */

export type VariantOption = {
  id: string;
  product_id: string;
  option_title: string;
  display_type: "text_chip" | "swatch_color" | "swatch_image";
  sort_order: number;
};

export type FamilyMember = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  price: number;
  sale_price: number | null;
  stock_qty: number;
  active: boolean;
  variant_attributes: Record<string, string>;
  image: string | null;
  is_parent: boolean;
};

export type ProductFamily = {
  parentId: string;
  option: Pick<VariantOption, "option_title" | "display_type"> | null;
  members: FamilyMember[];
};

const DISPLAY_TYPES = ["text_chip", "swatch_color", "swatch_image"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireAdmin(): Promise<string> {
  const { assertAdminAal2FromBearer } = await import(
    "@/integrations/supabase/admin-assertions.server"
  );
  return assertAdminAal2FromBearer();
}

async function getAdminIdentity(userId: string): Promise<{ id: string; email: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("id", userId)
    .maybeSingle();
  return { id: userId, email: (data?.email as string | null) ?? null };
}

/** Resolve sempre para o id do produto-pai da família. */
async function resolveParentId(productId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, parent_product_id")
    .eq("id", productId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("produto_nao_encontrado");
  return (data.parent_product_id as string | null) ?? (data.id as string);
}

function toVariantAttributes(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

async function primaryImages(productIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (productIds.length === 0) return map;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("product_images")
    .select("product_id, original_url, thumb_url, is_primary, sort_order")
    .in("product_id", productIds)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });
  for (const row of (data ?? []) as Array<{
    product_id: string;
    original_url: string | null;
    thumb_url: string | null;
  }>) {
    if (map.has(row.product_id)) continue;
    const url = row.thumb_url ?? row.original_url;
    if (url) map.set(row.product_id, url);
  }
  return map;
}

async function uniqueSlug(base: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const root = slugify(base) || "produto";
  let candidate = root;
  for (let i = 2; i < 50; i++) {
    const { data } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${root}-${i}`;
  }
  return `${root}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Opção da família
// ---------------------------------------------------------------------------
const ProductIdInput = z.object({ productId: z.string().uuid() });

export const adminGetVariantOption = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ProductIdInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const parentId = await resolveParentId(data.productId);
    const { data: row, error } = await supabaseAdmin
      .from("product_variant_options")
      .select("id, product_id, option_title, display_type, sort_order")
      .eq("product_id", parentId)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { parentId, option: (row as VariantOption | null) ?? null };
  });

const UpsertOptionInput = z.object({
  productId: z.string().uuid(),
  optionTitle: z.string().trim().min(2).max(40),
  displayType: z.enum(DISPLAY_TYPES).default("text_chip"),
});

export const adminUpsertVariantOption = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => UpsertOptionInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAdminAction } = await import("./security/auditLog");
    const admin = await getAdminIdentity(userId);
    const parentId = await resolveParentId(data.productId);

    const { data: existing } = await supabaseAdmin
      .from("product_variant_options")
      .select("id, option_title, display_type")
      .eq("product_id", parentId)
      .limit(1)
      .maybeSingle();

    let saved: VariantOption;
    if (existing) {
      const { data: row, error } = await supabaseAdmin
        .from("product_variant_options")
        .update({ option_title: data.optionTitle, display_type: data.displayType })
        .eq("id", existing.id)
        .select("id, product_id, option_title, display_type, sort_order")
        .single();
      if (error) throw error;
      saved = row as VariantOption;
    } else {
      const { data: row, error } = await supabaseAdmin
        .from("product_variant_options")
        .insert({
          product_id: parentId,
          option_title: data.optionTitle,
          display_type: data.displayType,
          sort_order: 0,
        })
        .select("id, product_id, option_title, display_type, sort_order")
        .single();
      if (error) throw error;
      saved = row as VariantOption;
    }

    await logAdminAction({
      adminId: admin.id,
      adminEmail: admin.email,
      action: existing ? "variant_option_updated" : "variant_option_created",
      resourceType: "product_variant_options",
      resourceId: saved.id,
      description: `Opção de variação "${data.optionTitle}" ${existing ? "atualizada" : "configurada"} para a família do produto ${parentId}.`,
      before: existing ?? null,
      after: { option_title: saved.option_title, display_type: saved.display_type },
    });

    return { parentId, option: saved };
  });

// ---------------------------------------------------------------------------
// Lista da família (admin)
// ---------------------------------------------------------------------------
export const adminListFamilyVariants = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ProductIdInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const parentId = await resolveParentId(data.productId);

    const { data: rows, error } = await supabaseAdmin
      .from("products")
      .select(
        "id, name, slug, sku, price, sale_price, stock_qty, active, variant_attributes, parent_product_id",
      )
      .or(`id.eq.${parentId},parent_product_id.eq.${parentId}`)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const list = (rows ?? []) as Array<Record<string, unknown>>;
    const images = await primaryImages(list.map((r) => r.id as string));

    const members: FamilyMember[] = list.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      sku: (r.sku as string | null) ?? null,
      price: Number(r.price ?? 0),
      sale_price: r.sale_price == null ? null : Number(r.sale_price),
      stock_qty: Number(r.stock_qty ?? 0),
      active: !!r.active,
      variant_attributes: toVariantAttributes(r.variant_attributes),
      image: images.get(r.id as string) ?? null,
      is_parent: (r.parent_product_id as string | null) == null,
    }));

    return { parentId, members };
  });

// ---------------------------------------------------------------------------
// Criar variação (clona campos não comerciais do pai)
// ---------------------------------------------------------------------------
const CreateVariantInput = z.object({
  baseProductId: z.string().uuid(),
  variantValue: z.string().trim().min(1).max(60),
  name: z.string().trim().min(2).max(200).optional(),
  price: z.number().nonnegative(),
  costPrice: z.number().nonnegative().nullable().optional(),
  stockQty: z.number().int().min(0),
  salePrice: z.number().nonnegative().nullable().optional(),
});

export const adminCreateVariant = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => CreateVariantInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAdminAction } = await import("./security/auditLog");
    const admin = await getAdminIdentity(userId);
    const parentId = await resolveParentId(data.baseProductId);

    const { data: option } = await supabaseAdmin
      .from("product_variant_options")
      .select("option_title")
      .eq("product_id", parentId)
      .limit(1)
      .maybeSingle();
    if (!option) throw new Error("option_not_configured");

    const { data: parent, error: pErr } = await supabaseAdmin
      .from("products")
      .select(
        "name, category_id, description, specs, ncm, brand, weight_kg, height_cm, width_cm, length_cm, tags, b2b_enabled, b2b_price, b2b_min_qty, b2b_qty_multiple, b2b_show_in_vitrine, b2b_commercial_note, free_shipping_eligible, allow_out_of_stock_sales, seo_title, seo_description, seo_keywords",
      )
      .eq("id", parentId)
      .single();
    if (pErr || !parent) throw new Error("produto_pai_nao_encontrado");

    const optionTitle = option.option_title as string;
    const name = data.name?.trim() || `${parent.name} - ${data.variantValue}`;
    const slug = await uniqueSlug(`${parent.name}-${data.variantValue}`);

    const insertPayload = {
      ...parent,
      name,
      slug,
      parent_product_id: parentId,
      variant_attributes: { [optionTitle]: data.variantValue },
      price: data.price,
      sale_price: data.salePrice ?? null,
      cost_price: data.costPrice ?? null,
      stock_qty: data.stockQty,
      active: true,
      featured: false,
      images: [],
    };

    const { data: created, error } = await supabaseAdmin
      .from("products")
      .insert(insertPayload as never)
      .select("id, name, slug")
      .single();
    if (error) throw error;

    await logAdminAction({
      adminId: admin.id,
      adminEmail: admin.email,
      action: "product_variant_created",
      resourceType: "products",
      resourceId: created.id,
      description: `Variação "${optionTitle}: ${data.variantValue}" criada a partir do produto ${parent.name}.`,
      before: null,
      after: {
        id: created.id,
        name: created.name,
        slug: created.slug,
        parent_product_id: parentId,
        variant_attributes: { [optionTitle]: data.variantValue },
        price: data.price,
        stock_qty: data.stockQty,
      },
    });

    return created as { id: string; name: string; slug: string };
  });

// ---------------------------------------------------------------------------
// Desvincular variação (não destrutivo)
// ---------------------------------------------------------------------------
export const adminUnlinkVariant = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ProductIdInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAdminAction } = await import("./security/auditLog");
    const admin = await getAdminIdentity(userId);

    const { data: before } = await supabaseAdmin
      .from("products")
      .select("id, name, parent_product_id, variant_attributes")
      .eq("id", data.productId)
      .maybeSingle();
    if (!before) throw new Error("produto_nao_encontrado");
    if (!before.parent_product_id) throw new Error("nao_e_variacao");

    const { error } = await supabaseAdmin
      .from("products")
      .update({ parent_product_id: null })
      .eq("id", data.productId);
    if (error) throw error;

    await logAdminAction({
      adminId: admin.id,
      adminEmail: admin.email,
      action: "product_variant_unlinked",
      resourceType: "products",
      resourceId: data.productId,
      description: `Produto "${before.name}" desvinculado da família de variações.`,
      before: { parent_product_id: before.parent_product_id },
      after: { parent_product_id: null },
    });

    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Vincular produto existente como variação
// ---------------------------------------------------------------------------
const LinkInput = z.object({
  productId: z.string().uuid(),
  parentProductId: z.string().uuid(),
  variantValue: z.string().trim().min(1).max(60),
});

export const adminLinkExistingProductAsVariant = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => LinkInput.parse(i))
  .handler(async ({ data }) => {
    const userId = await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAdminAction } = await import("./security/auditLog");
    const admin = await getAdminIdentity(userId);

    if (data.productId === data.parentProductId) throw new Error("produto_igual_ao_pai");
    const parentId = await resolveParentId(data.parentProductId);

    const { data: option } = await supabaseAdmin
      .from("product_variant_options")
      .select("option_title")
      .eq("product_id", parentId)
      .limit(1)
      .maybeSingle();
    if (!option) throw new Error("option_not_configured");

    const { data: before } = await supabaseAdmin
      .from("products")
      .select("id, name, parent_product_id, variant_attributes")
      .eq("id", data.productId)
      .maybeSingle();
    if (!before) throw new Error("produto_nao_encontrado");

    const variantAttributes = { [option.option_title as string]: data.variantValue };
    const { error } = await supabaseAdmin
      .from("products")
      .update({ parent_product_id: parentId, variant_attributes: variantAttributes })
      .eq("id", data.productId);
    if (error) throw error;

    await logAdminAction({
      adminId: admin.id,
      adminEmail: admin.email,
      action: "product_variant_linked",
      resourceType: "products",
      resourceId: data.productId,
      description: `Produto "${before.name}" vinculado como variação (${option.option_title}: ${data.variantValue}).`,
      before: {
        parent_product_id: before.parent_product_id,
        variant_attributes: before.variant_attributes,
      },
      after: { parent_product_id: parentId, variant_attributes: variantAttributes },
    });

    return { ok: true };
  });

// ---------------------------------------------------------------------------
// PÚBLICO — família do produto para a loja (apenas colunas públicas)
// ---------------------------------------------------------------------------
export const getProductFamily = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ProductIdInput.parse(i))
  .handler(async ({ data }): Promise<ProductFamily> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const parentId = await resolveParentId(data.productId);

    const { data: option } = await supabaseAdmin
      .from("product_variant_options")
      .select("option_title, display_type")
      .eq("product_id", parentId)
      .limit(1)
      .maybeSingle();

    const { data: rows, error } = await supabaseAdmin
      .from("products")
      .select("id, name, slug, sku, price, sale_price, stock_qty, active, variant_attributes, parent_product_id")
      .or(`id.eq.${parentId},parent_product_id.eq.${parentId}`)
      .eq("active", true)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const list = (rows ?? []) as Array<Record<string, unknown>>;
    const images = await primaryImages(list.map((r) => r.id as string));

    const members: FamilyMember[] = list.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      sku: (r.sku as string | null) ?? null,
      price: Number(r.price ?? 0),
      sale_price: r.sale_price == null ? null : Number(r.sale_price),
      stock_qty: Number(r.stock_qty ?? 0),
      active: !!r.active,
      variant_attributes: toVariantAttributes(r.variant_attributes),
      image: images.get(r.id as string) ?? null,
      is_parent: (r.parent_product_id as string | null) == null,
    }));

    return {
      parentId,
      option: (option as Pick<VariantOption, "option_title" | "display_type"> | null) ?? null,
      members,
    };
  });
