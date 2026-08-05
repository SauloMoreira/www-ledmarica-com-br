import "@tanstack/react-start/server-only";
import { slugify } from "@/lib/productImport";
import { variantUrl } from "@/lib/productImages";
import type { VariantOption } from "./productVariants.types";

export const DISPLAY_TYPES = ["text_chip", "swatch_color", "swatch_image"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function requireAdmin(): Promise<string> {
  const { assertAdminAal2FromBearer } = await import(
    "@/integrations/supabase/admin-assertions.server"
  );
  return assertAdminAal2FromBearer();
}

export async function getAdminIdentity(userId: string): Promise<{ id: string; email: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("id", userId)
    .maybeSingle();
  return { id: userId, email: (data?.email as string | null) ?? null };
}

/** Resolve sempre para o id do produto-pai da família. */
export async function resolveParentId(productId: string): Promise<string> {
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

export function toVariantAttributes(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export async function primaryImages(productIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (productIds.length === 0) return map;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("product_images")
    .select("product_id, original_url, is_primary, sort_order")
    .in("product_id", productIds)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });
  for (const row of (data ?? []) as unknown as Array<{
    product_id: string;
    original_url: string | null;
  }>) {
    if (map.has(row.product_id)) continue;
    const url = variantUrl(row.original_url, "thumb") ?? row.original_url;
    if (url) map.set(row.product_id, url);
  }
  return map;
}

export async function uniqueSlug(base: string): Promise<string> {
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

