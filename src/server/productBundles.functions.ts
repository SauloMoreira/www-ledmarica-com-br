import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  computeKitPricing,
  type KitConfig,
  type KitPricingResult,
  type KitType,
  type KitPricingMethod,
  type KitB2bPricingMethod,
} from "@/lib/kitPricing";
import { ilikePattern, sanitizeSearchTerm } from "@/lib/postgrestFilter";

// ----------------------------------------------------------------------------
// Tipos compartilhados
// ----------------------------------------------------------------------------
export type BundleAvailability = "available" | "partial" | "unavailable" | "needs_review";

export type BundleItemPublic = {
  id: string;
  product_id: string;
  quantity: number;
  sort_order: number;
  is_required: boolean;
  product: {
    id: string;
    name: string;
    slug: string;
    sku: string | null;
    brand: string | null;
    image: string | null;
    active: boolean;
    retail_price: number; // price (sem sale)
    sale_price: number | null;
    final_price: number; // sale_price ?? price
    stock_qty: number;
    free_shipping_eligible: boolean;
    b2b_enabled: boolean;
    b2b_min_qty: number | null;
    b2b_price: number | null;
    cost_price: number | null;
  };
  // Status calculado por item
  status: "ok" | "inactive" | "no_price" | "no_stock";
};

export type BundleDiscountType = "none" | "fixed_amount" | "percentage";

export type BundleImage = {
  id: string;
  url: string;
  sort_order: number;
  is_primary: boolean;
  source: "manual_upload" | "manual_url" | "ai_generated";
};

/** Campos comerciais do kit persistidos em product_bundles. */
export type BundleKitConfig = {
  kit_type: KitType;
  pricing_method: KitPricingMethod;
  fixed_price: number | null;
  discount_percent: number | null;
  discount_amount: number | null;
  available_retail: boolean;
  available_b2b: boolean;
  b2b_pricing_method: KitB2bPricingMethod;
  b2b_fixed_price: number | null;
  b2b_extra_discount_percent: number | null;
  b2b_min_quantity: number;
  accepts_coupon: boolean;
  stack_with_b2b: boolean;
};

export type BundlePublic = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  images: BundleImage[];
  is_active: boolean;
  is_featured: boolean;
  start_date: string | null;
  end_date: string | null;
  /** legado: enum bundle_discount_type. Mantido para compat. */
  discount_type: BundleDiscountType;
  discount_value: number;
  /** Configuração comercial nova (ondas de kits). */
  kit: BundleKitConfig;
  items: BundleItemPublic[];
  subtotal: number; // soma simples dos itens (compat)
  items_count: number;
  total_units: number;
  availability: BundleAvailability;
  /** Resultado da engine de preços do kit (já considera aprovação B2B do solicitante). */
  pricing: KitPricingResult;
  is_b2b_approved: boolean;
};

// Limite seguro de desconto percentual para combos (admin pode rever depois)
export const BUNDLE_PERCENT_LIMIT = 50;

export type BundleAdminRow = {
  id: string;
  slug: string | null;
  name: string;
  is_active: boolean;
  is_featured: boolean;
  image_url: string | null;
  items_count: number;
  start_date: string | null;
  end_date: string | null;
  updated_at: string;
};

// ----------------------------------------------------------------------------
// Helpers
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

function classifyItem(p: {
  active: boolean;
  final_price: number;
  stock_qty: number;
}): BundleItemPublic["status"] {
  if (!p.active) return "inactive";
  if (!(p.final_price > 0)) return "no_price";
  if (p.stock_qty <= 0) return "no_stock";
  return "ok";
}

function calcAvailability(items: BundleItemPublic[]): BundleAvailability {
  if (items.length === 0) return "needs_review";
  const required = items.filter((i) => i.is_required);
  const reqUnavailable = required.filter(
    (i) => i.product.stock_qty < i.quantity || i.status === "no_stock",
  );
  const reqBroken = required.some((i) => i.status === "inactive" || i.status === "no_price");
  if (reqBroken) return "unavailable";
  if (reqUnavailable.length === required.length && required.length > 0) {
    return "unavailable";
  }
  if (reqUnavailable.length > 0) return "partial";
  // Algum opcional indisponível?
  const someoneShort = items.some((i) => i.product.stock_qty < i.quantity || i.status !== "ok");
  return someoneShort ? "partial" : "available";
}

async function resolveB2bApprovalForRequest(): Promise<boolean> {
  try {
    const userId = await getOptionalUserId();
    if (!userId) return false;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cid } = await (supabaseAdmin as unknown as {
      rpc: (n: string, a: unknown) => Promise<{ data: string | null }>;
    }).rpc("get_user_approved_company_id", { _user_id: userId });
    return !!cid;
  } catch {
    return false;
  }
}

async function loadBundlesWithItems(filter: {
  bundleIds?: string[];
  slug?: string;
  onlyActive?: boolean;
  featuredFirst?: boolean;
  limit?: number;
}): Promise<BundlePublic[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin.from("product_bundles").select(
    `id, slug, name, description, image_url, is_active, is_featured,
       start_date, end_date, discount_type, discount_value, updated_at,
       kit_type, pricing_method, fixed_price, discount_percent, discount_amount,
       available_retail, available_b2b, b2b_pricing_method, b2b_fixed_price,
       b2b_extra_discount_percent, b2b_min_quantity, accepts_coupon, stack_with_b2b,
       images:product_bundle_images (id, url, sort_order, is_primary, source),
       items:product_bundle_items (
         id, product_id, quantity, sort_order, is_required,
         product:products (
           id, name, slug, sku, brand, images, active,
           price, sale_price, stock_qty, free_shipping_eligible,
           b2b_enabled, b2b_min_qty, b2b_price, cost_price
         )
       )`,
  );

  if (filter.bundleIds?.length) q = q.in("id", filter.bundleIds);
  if (filter.slug) q = q.eq("slug", filter.slug);
  if (filter.onlyActive) {
    const nowIso = new Date().toISOString();
    q = q
      .eq("is_active", true)
      .or(`start_date.is.null,start_date.lte.${nowIso}`)
      .or(`end_date.is.null,end_date.gte.${nowIso}`);
  }
  if (filter.featuredFirst) q = q.order("is_featured", { ascending: false });
  q = q.order("updated_at", { ascending: false });
  if (filter.limit) q = q.limit(filter.limit);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as Array<Record<string, any>>;
  const isB2bApproved = await resolveB2bApprovalForRequest();
  return rows.map((b) => {
    const itemRows = (b.items ?? []) as Array<Record<string, any>>;
    const items: BundleItemPublic[] = itemRows
      .map((it) => {
        const p = it.product as Record<string, any> | null;
        if (!p) return null;
        const retail = Number(p.price ?? 0);
        const sale = p.sale_price != null ? Number(p.sale_price) : null;
        const finalPrice = sale != null && sale > 0 ? sale : retail;
        const productInfo: BundleItemPublic["product"] = {
          id: p.id,
          name: p.name,
          slug: p.slug,
          sku: p.sku ?? null,
          brand: p.brand ?? null,
          image: Array.isArray(p.images) && p.images.length > 0 ? (p.images[0] as string) : null,
          active: !!p.active,
          retail_price: retail,
          sale_price: sale,
          final_price: finalPrice,
          stock_qty: Number(p.stock_qty ?? 0),
          free_shipping_eligible: !!p.free_shipping_eligible,
          b2b_enabled: !!p.b2b_enabled,
          b2b_min_qty: p.b2b_min_qty != null ? Number(p.b2b_min_qty) : null,
          b2b_price: p.b2b_price != null ? Number(p.b2b_price) : null,
          cost_price: p.cost_price != null ? Number(p.cost_price) : null,
        };
        return {
          id: it.id,
          product_id: it.product_id,
          quantity: Number(it.quantity ?? 1),
          sort_order: Number(it.sort_order ?? 0),
          is_required: !!it.is_required,
          product: productInfo,
          status: classifyItem(productInfo),
        } as BundleItemPublic;
      })
      .filter((x): x is BundleItemPublic => x !== null)
      .sort((a, b) => a.sort_order - b.sort_order);

    const subtotal = items.reduce((acc, it) => acc + it.product.final_price * it.quantity, 0);
    const totalUnits = items.reduce((acc, it) => acc + it.quantity, 0);

    const imageRows = (b.images ?? []) as Array<Record<string, any>>;
    const images: BundleImage[] = imageRows
      .map((im) => ({
        id: im.id as string,
        url: im.url as string,
        sort_order: Number(im.sort_order ?? 0),
        is_primary: !!im.is_primary,
        source: ((im.source as string) ?? "manual_url") as BundleImage["source"],
      }))
      .sort((a, b2) => {
        if (a.is_primary !== b2.is_primary) return a.is_primary ? -1 : 1;
        return a.sort_order - b2.sort_order;
      });

    const kit: BundleKitConfig = {
      kit_type: ((b.kit_type ?? "combinado") as KitType),
      pricing_method: ((b.pricing_method ?? "sum") as KitPricingMethod),
      fixed_price: b.fixed_price != null ? Number(b.fixed_price) : null,
      discount_percent: b.discount_percent != null ? Number(b.discount_percent) : null,
      discount_amount: b.discount_amount != null ? Number(b.discount_amount) : null,
      available_retail: b.available_retail !== false,
      available_b2b: !!b.available_b2b,
      b2b_pricing_method: ((b.b2b_pricing_method ?? "inherit") as KitB2bPricingMethod),
      b2b_fixed_price: b.b2b_fixed_price != null ? Number(b.b2b_fixed_price) : null,
      b2b_extra_discount_percent:
        b.b2b_extra_discount_percent != null ? Number(b.b2b_extra_discount_percent) : null,
      b2b_min_quantity: Number(b.b2b_min_quantity ?? 1),
      accepts_coupon: b.accepts_coupon !== false,
      stack_with_b2b: !!b.stack_with_b2b,
    };

    const pricing = computeKitPricing({
      kit,
      items: items.map((it) => ({
        quantity: it.quantity,
        retail_unit_price: it.product.final_price,
        b2b_unit_price: it.product.b2b_price,
        cost_unit_price: it.product.cost_price,
        b2b_enabled: it.product.b2b_enabled,
      })),
      isB2bApproved,
      kitQuantity: 1,
    });

    return {
      id: b.id,
      slug: b.slug,
      name: b.name,
      description: b.description,
      image_url: b.image_url,
      images,
      is_active: !!b.is_active,
      is_featured: !!b.is_featured,
      start_date: b.start_date,
      end_date: b.end_date,
      discount_type: (b.discount_type ?? "none") as BundleDiscountType,
      discount_value: Number(b.discount_value ?? 0),
      kit,
      items,
      subtotal,
      items_count: items.length,
      total_units: totalUnits,
      availability: calcAvailability(items),
      pricing,
      is_b2b_approved: isB2bApproved,
    } satisfies BundlePublic;
  });
}

// ----------------------------------------------------------------------------
// PUBLIC: lista combos ativos
// ----------------------------------------------------------------------------
const ListPublicInput = z.object({
  limit: z.number().int().min(1).max(48).optional(),
  featuredOnly: z.boolean().optional(),
  /** Apenas kits com available_b2b=true (vitrine /atacado). */
  b2bOnly: z.boolean().optional(),
  /** Apenas kits com available_retail=true (carrosséis varejo). */
  retailOnly: z.boolean().optional(),
});

export const listPublicBundles = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ListPublicInput.parse(i ?? {}))
  .handler(async ({ data }) => {
    const bundles = await loadBundlesWithItems({
      onlyActive: true,
      featuredFirst: true,
      limit: data.limit ?? 24,
    });
    const filtered = data.featuredOnly ? bundles.filter((b) => b.is_featured) : bundles;
    return filtered.filter((b) => {
      if (b.items.length === 0) return false;
      // Esconde kits B2B-only de visitantes/clientes não aprovados
      if (!b.kit.available_retail && !b.is_b2b_approved) return false;
      if (data.b2bOnly && !b.kit.available_b2b) return false;
      if (data.retailOnly && !b.kit.available_retail) return false;
      return true;
    });
  });

// ----------------------------------------------------------------------------
// PUBLIC: detalhe de combo por slug
// ----------------------------------------------------------------------------
const GetBySlugInput = z.object({ slug: z.string().trim().min(1).max(160) });

export const getPublicBundleBySlug = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => GetBySlugInput.parse(i))
  .handler(async ({ data }) => {
    const bundles = await loadBundlesWithItems({
      slug: data.slug,
      onlyActive: true,
      limit: 1,
    });
    return bundles[0] ?? null;
  });

// ----------------------------------------------------------------------------
// PUBLIC: combos que contêm um produto específico
// ----------------------------------------------------------------------------
const ListByProductInput = z.object({
  productId: z.string().uuid(),
  limit: z.number().int().min(1).max(12).optional(),
});

export const listPublicBundlesByProduct = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ListByProductInput.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // 1. Busca os bundle_ids que contêm este produto
    const { data: links, error } = await supabaseAdmin
      .from("product_bundle_items")
      .select("bundle_id")
      .eq("product_id", data.productId);
    if (error) throw error;
    const bundleIds = Array.from(
      new Set(((links ?? []) as Array<{ bundle_id: string }>).map((l) => l.bundle_id)),
    );
    if (bundleIds.length === 0) return [];

    // 2. Carrega os combos completos, filtrando por ativos/validade
    const bundles = await loadBundlesWithItems({
      bundleIds,
      onlyActive: true,
      featuredFirst: true,
      limit: data.limit ?? 4,
    });

    // 3. Filtra: precisa ter pelo menos 1 item, slug válido, e nenhum
    //    obrigatório quebrado (inativo/sem preço)
    const valid = bundles.filter((b) => {
      if (!b.slug) return false;
      if (b.items.length === 0) return false;
      const broken = b.items.some(
        (it) => it.is_required && (it.status === "inactive" || it.status === "no_price"),
      );
      if (broken) return false;
      return true;
    });

    return valid.slice(0, data.limit ?? 4);
  });

// ----------------------------------------------------------------------------
// ADMIN: lista combos
// ----------------------------------------------------------------------------
export const adminListBundles = createServerFn({ method: "POST" })
  .inputValidator(() => ({}))
  .handler(async () => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("product_bundles")
      .select(
        `id, slug, name, is_active, is_featured, image_url, start_date, end_date, updated_at,
         items:product_bundle_items(id)`,
      )
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, any>>).map<BundleAdminRow>((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      is_active: !!b.is_active,
      is_featured: !!b.is_featured,
      image_url: b.image_url,
      items_count: Array.isArray(b.items) ? b.items.length : 0,
      start_date: b.start_date,
      end_date: b.end_date,
      updated_at: b.updated_at,
    }));
  });

// ----------------------------------------------------------------------------
// ADMIN: detalhe de combo (com itens "crus" + dados de produto)
// ----------------------------------------------------------------------------
const AdminGetInput = z.object({ id: z.string().uuid() });

export const adminGetBundle = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminGetInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const list = await loadBundlesWithItems({ bundleIds: [data.id], limit: 1 });
    return list[0] ?? null;
  });

// ----------------------------------------------------------------------------
// ADMIN: criar
// ----------------------------------------------------------------------------
const slugRegex = /^[a-z0-9-]+$/;

const DiscountTypeEnum = z.enum(["none", "fixed_amount", "percentage"]);

function validateDiscount(input: { discountType?: BundleDiscountType; discountValue?: number }) {
  const t = input.discountType ?? "none";
  const v = Number(input.discountValue ?? 0);
  if (t === "none") return { discount_type: "none" as const, discount_value: 0 };
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error("bundle_discount_value_invalid");
  }
  if (t === "percentage" && v > BUNDLE_PERCENT_LIMIT) {
    throw new Error("bundle_discount_percent_over_limit");
  }
  if (t === "fixed_amount" && v > 100000) {
    throw new Error("bundle_discount_value_invalid");
  }
  return { discount_type: t, discount_value: Math.round(v * 100) / 100 };
}

const AdminCreateInput = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(2).max(160).regex(slugRegex).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  imageUrl: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  discountType: DiscountTypeEnum.optional(),
  discountValue: z.number().min(0).max(100000).optional(),
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const adminCreateBundle = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminCreateInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const slug = data.slug || slugify(data.name);
    const disc = validateDiscount({
      discountType: data.discountType,
      discountValue: data.discountValue,
    });
    const { data: row, error } = await supabaseAdmin
      .from("product_bundles")
      .insert({
        name: data.name,
        slug,
        description: data.description ?? null,
        image_url: data.imageUrl ?? null,
        is_active: data.isActive ?? false,
        is_featured: data.isFeatured ?? false,
        start_date: data.startDate ?? null,
        end_date: data.endDate ?? null,
        notes: data.notes ?? null,
        discount_type: disc.discount_type,
        discount_value: disc.discount_value,
      })
      .select("id")
      .single();
    if (error) {
      if ((error as any).code === "23505") throw new Error("slug_already_exists");
      throw error;
    }
    return { id: row!.id as string };
  });

// ----------------------------------------------------------------------------
// ADMIN: atualizar
// ----------------------------------------------------------------------------
const KitTypeEnum = z.enum(["combinado", "promocional", "b2b", "estrutural"]);
const KitPricingMethodEnum = z.enum([
  "sum",
  "percent_discount",
  "fixed_discount",
  "fixed_price",
]);
const KitB2bMethodEnum = z.enum(["inherit", "fixed_price", "extra_discount"]);

const AdminUpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(160).optional(),
  slug: z.string().trim().min(2).max(160).regex(slugRegex).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  imageUrl: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  discountType: DiscountTypeEnum.optional(),
  discountValue: z.number().min(0).max(100000).optional(),
  // Novos campos comerciais do kit
  kitType: KitTypeEnum.optional(),
  pricingMethod: KitPricingMethodEnum.optional(),
  fixedPrice: z.number().min(0).max(1_000_000).nullable().optional(),
  discountPercent: z.number().min(0).max(100).nullable().optional(),
  discountAmount: z.number().min(0).max(1_000_000).nullable().optional(),
  availableRetail: z.boolean().optional(),
  availableB2b: z.boolean().optional(),
  b2bPricingMethod: KitB2bMethodEnum.optional(),
  b2bFixedPrice: z.number().min(0).max(1_000_000).nullable().optional(),
  b2bExtraDiscountPercent: z.number().min(0).max(100).nullable().optional(),
  b2bMinQuantity: z.number().int().min(1).max(9999).optional(),
  acceptsCoupon: z.boolean().optional(),
  stackWithB2b: z.boolean().optional(),
});

export const adminUpdateBundle = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminUpdateInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.slug !== undefined) patch.slug = data.slug;
    if (data.description !== undefined) patch.description = data.description;
    if (data.imageUrl !== undefined) patch.image_url = data.imageUrl;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    if (data.isFeatured !== undefined) patch.is_featured = data.isFeatured;
    if (data.startDate !== undefined) patch.start_date = data.startDate;
    if (data.endDate !== undefined) patch.end_date = data.endDate;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.discountType !== undefined || data.discountValue !== undefined) {
      const disc = validateDiscount({
        discountType: data.discountType,
        discountValue: data.discountValue,
      });
      patch.discount_type = disc.discount_type;
      patch.discount_value = disc.discount_value;
    }
    if (data.kitType !== undefined) patch.kit_type = data.kitType;
    if (data.pricingMethod !== undefined) patch.pricing_method = data.pricingMethod;
    if (data.fixedPrice !== undefined) patch.fixed_price = data.fixedPrice;
    if (data.discountPercent !== undefined) patch.discount_percent = data.discountPercent;
    if (data.discountAmount !== undefined) patch.discount_amount = data.discountAmount;
    if (data.availableRetail !== undefined) patch.available_retail = data.availableRetail;
    if (data.availableB2b !== undefined) patch.available_b2b = data.availableB2b;
    if (data.b2bPricingMethod !== undefined) patch.b2b_pricing_method = data.b2bPricingMethod;
    if (data.b2bFixedPrice !== undefined) patch.b2b_fixed_price = data.b2bFixedPrice;
    if (data.b2bExtraDiscountPercent !== undefined)
      patch.b2b_extra_discount_percent = data.b2bExtraDiscountPercent;
    if (data.b2bMinQuantity !== undefined) patch.b2b_min_quantity = data.b2bMinQuantity;
    if (data.acceptsCoupon !== undefined) patch.accepts_coupon = data.acceptsCoupon;
    if (data.stackWithB2b !== undefined) patch.stack_with_b2b = data.stackWithB2b;

    // Se for ativar, valida cadastro
    if (data.isActive === true) {
      const detail = await loadBundlesWithItems({ bundleIds: [data.id], limit: 1 });
      const b = detail[0];
      if (!b || b.items.length === 0) throw new Error("bundle_has_no_items");
      const broken = b.items.filter(
        (it) => it.is_required && (it.status === "inactive" || it.status === "no_price"),
      );
      if (broken.length > 0) throw new Error("bundle_has_broken_items");
    }

    const { error } = await supabaseAdmin
      .from("product_bundles")
      .update(patch as never)
      .eq("id", data.id);
    if (error) {
      if ((error as any).code === "23505") throw new Error("slug_already_exists");
      throw error;
    }
    return { ok: true };
  });

// ----------------------------------------------------------------------------
// ADMIN: deletar
// ----------------------------------------------------------------------------
const AdminDeleteInput = z.object({ id: z.string().uuid() });

export const adminDeleteBundle = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminDeleteInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("product_bundles").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ----------------------------------------------------------------------------
// ADMIN: itens (add / update / remove)
// ----------------------------------------------------------------------------
const AdminAddItemInput = z.object({
  bundleId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(9999),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isRequired: z.boolean().optional(),
});

export const adminAddBundleItem = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminAddItemInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Tenta upsert: se já existir, soma quantidade
    const { data: existing } = await supabaseAdmin
      .from("product_bundle_items")
      .select("id, quantity")
      .eq("bundle_id", data.bundleId)
      .eq("product_id", data.productId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from("product_bundle_items")
        .update({ quantity: existing.quantity + data.quantity })
        .eq("id", existing.id);
      if (error) throw error;
      return { ok: true, merged: true };
    }

    const { error } = await supabaseAdmin.from("product_bundle_items").insert({
      bundle_id: data.bundleId,
      product_id: data.productId,
      quantity: data.quantity,
      sort_order: data.sortOrder ?? 0,
      is_required: data.isRequired ?? true,
    });
    if (error) throw error;
    return { ok: true, merged: false };
  });

const AdminUpdateItemInput = z.object({
  id: z.string().uuid(),
  quantity: z.number().int().min(1).max(9999).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isRequired: z.boolean().optional(),
});

export const adminUpdateBundleItem = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminUpdateItemInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    type ItemPatch = { quantity?: number; sort_order?: number; is_required?: boolean };
    const patch: ItemPatch = {};
    if (data.quantity !== undefined) patch.quantity = data.quantity;
    if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;
    if (data.isRequired !== undefined) patch.is_required = data.isRequired;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("product_bundle_items")
      .update(patch)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const AdminRemoveItemInput = z.object({ id: z.string().uuid() });

export const adminRemoveBundleItem = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminRemoveItemInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("product_bundle_items").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ----------------------------------------------------------------------------
// ADMIN: busca de produto para adicionar ao combo
// ----------------------------------------------------------------------------
const AdminSearchInput = z.object({
  query: z.string().trim().min(2).max(120),
  limit: z.number().int().min(1).max(20).optional(),
});

export const adminSearchProductsForBundle = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminSearchInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const term = ilikePattern(data.query) || "%";
    const { data: rows, error } = await supabaseAdmin
      .from("products")
      .select("id, name, slug, sku, brand, active, images, price, sale_price, stock_qty")
      .or(`name.ilike.${term},sku.ilike.${term},gtin_ean.ilike.${term}`)
      .order("active", { ascending: false })
      .order("name", { ascending: true })
      .limit(data.limit ?? 10);
    if (error) throw error;
    return ((rows ?? []) as Array<Record<string, any>>).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      sku: (r.sku as string | null) ?? null,
      brand: (r.brand as string | null) ?? null,
      active: !!r.active,
      image: Array.isArray(r.images) && r.images.length > 0 ? (r.images[0] as string) : null,
      price: Number(r.price ?? 0),
      sale_price: r.sale_price != null ? Number(r.sale_price) : null,
      stock_qty: Number(r.stock_qty ?? 0),
    }));
  });

// ----------------------------------------------------------------------------
// ADMIN: imagens do combo (até 4)
// ----------------------------------------------------------------------------
export const BUNDLE_IMAGES_LIMIT = 4;

const SourceEnum = z.enum(["manual_upload", "manual_url", "ai_generated"]);

const AdminListImagesInput = z.object({ bundleId: z.string().uuid() });

export const adminListBundleImages = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminListImagesInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("product_bundle_images")
      .select("id, url, sort_order, is_primary, source")
      .eq("bundle_id", data.bundleId)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return ((rows ?? []) as Array<Record<string, any>>).map<BundleImage>((r) => ({
      id: r.id,
      url: r.url,
      sort_order: Number(r.sort_order ?? 0),
      is_primary: !!r.is_primary,
      source: ((r.source as string) ?? "manual_url") as BundleImage["source"],
    }));
  });

const AdminAddImageInput = z.object({
  bundleId: z.string().uuid(),
  url: z.string().trim().min(1).max(2000),
  source: SourceEnum.optional(),
  setPrimary: z.boolean().optional(),
});

export const adminAddBundleImage = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminAddImageInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: cntErr } = await supabaseAdmin
      .from("product_bundle_images")
      .select("id, is_primary, sort_order")
      .eq("bundle_id", data.bundleId);
    if (cntErr) throw cntErr;
    const list = (existing ?? []) as Array<{ id: string; is_primary: boolean; sort_order: number }>;
    if (list.length >= BUNDLE_IMAGES_LIMIT) throw new Error("bundle_images_limit_reached");

    const hasPrimary = list.some((r) => r.is_primary);
    const willBePrimary = data.setPrimary === true || !hasPrimary;
    if (willBePrimary && hasPrimary) {
      const { error: clearErr } = await supabaseAdmin
        .from("product_bundle_images")
        .update({ is_primary: false })
        .eq("bundle_id", data.bundleId)
        .eq("is_primary", true);
      if (clearErr) throw clearErr;
    }

    const nextOrder = list.reduce((acc, r) => Math.max(acc, r.sort_order), -1) + 1;
    const { data: row, error } = await supabaseAdmin
      .from("product_bundle_images")
      .insert({
        bundle_id: data.bundleId,
        url: data.url,
        source: data.source ?? "manual_url",
        is_primary: willBePrimary,
        sort_order: nextOrder,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row!.id as string };
  });

const AdminRemoveImageInput = z.object({ id: z.string().uuid() });

export const adminRemoveBundleImage = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminRemoveImageInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: getErr } = await supabaseAdmin
      .from("product_bundle_images")
      .select("bundle_id, is_primary")
      .eq("id", data.id)
      .maybeSingle();
    if (getErr) throw getErr;
    if (!row) return { ok: true };
    const { error } = await supabaseAdmin
      .from("product_bundle_images")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    if (row.is_primary) {
      const { data: next } = await supabaseAdmin
        .from("product_bundle_images")
        .select("id")
        .eq("bundle_id", row.bundle_id)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (next?.id) {
        await supabaseAdmin
          .from("product_bundle_images")
          .update({ is_primary: true })
          .eq("id", next.id);
      }
    }
    return { ok: true };
  });

const AdminSetPrimaryInput = z.object({ id: z.string().uuid() });

export const adminSetPrimaryBundleImage = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminSetPrimaryInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: getErr } = await supabaseAdmin
      .from("product_bundle_images")
      .select("bundle_id")
      .eq("id", data.id)
      .maybeSingle();
    if (getErr) throw getErr;
    if (!row) throw new Error("not_found");
    const { error: clearErr } = await supabaseAdmin
      .from("product_bundle_images")
      .update({ is_primary: false })
      .eq("bundle_id", row.bundle_id)
      .eq("is_primary", true);
    if (clearErr) throw clearErr;
    const { error } = await supabaseAdmin
      .from("product_bundle_images")
      .update({ is_primary: true })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const AdminReorderInput = z.object({
  bundleId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1).max(BUNDLE_IMAGES_LIMIT),
});

export const adminReorderBundleImages = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => AdminReorderInput.parse(i))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (let i = 0; i < data.orderedIds.length; i++) {
      const { error } = await supabaseAdmin
        .from("product_bundle_images")
        .update({ sort_order: i })
        .eq("id", data.orderedIds[i])
        .eq("bundle_id", data.bundleId);
      if (error) throw error;
    }
    return { ok: true };
  });
