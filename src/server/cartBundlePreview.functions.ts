import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type CartBundlePreviewStatus =
  | "eligible_preview"
  | "not_eligible"
  | "blocked_by_b2b"
  | "blocked_by_coupon"
  | "missing_items"
  | "expired"
  | "inactive"
  | "needs_review";

export type CartBundleConsideredItem = {
  product_id: string;
  product_name: string;
  product_slug: string | null;
  image: string | null;
  required_qty: number;
  cart_qty: number;
  is_required: boolean;
  unit_price: number;
  pricing_source: "b2b" | "retail";
};

export type CartBundleMissingItem = {
  product_id: string;
  product_name: string;
  product_slug: string | null;
  required_qty: number;
  cart_qty: number;
  is_required: boolean;
  reason: "inactive" | "no_price" | "missing" | "low_qty" | "ok";
};

export type CartBundlePreviewRow = {
  bundle_id: string;
  bundle_slug: string | null;
  bundle_name: string;
  bundle_image: string | null;
  discount_type: "none" | "fixed_amount" | "percentage";
  discount_value: number;
  status: CartBundlePreviewStatus;
  eligible_subtotal: number;
  estimated_discount: number;
  considered_items: CartBundleConsideredItem[];
  missing_items: CartBundleMissingItem[];
  reason: string | null;
  warnings: string[];
};

const Input = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID"),
        qty: z.number().int().min(1).max(99999),
      }),
    )
    .min(0)
    .max(200),
  hasCoupon: z.boolean().optional(),
  couponPresent: z.boolean().optional(),
});

async function getOptionalUserId(): Promise<string | null> {
  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const auth = getRequestHeader("Authorization") || getRequestHeader("authorization");
    if (!auth || !auth.toLowerCase().startsWith("bearer ")) return null;
    const token = auth.slice(7).trim();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.auth.getUser(token);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Server function: prévia (somente leitura) dos descontos de combo aplicáveis
 * ao carrinho. NÃO altera total real, checkout, pedido ou Mercado Pago.
 */
export const getCartBundlePreview = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data }): Promise<CartBundlePreviewRow[]> => {
    if (!data.items || data.items.length === 0) return [];
    const userId = await getOptionalUserId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("validate_cart_bundles", {
      _user_id: (userId ?? null) as unknown as string,
      _items: data.items,
      _has_coupon: data.hasCoupon ?? false,
    });
    if (error) {
      console.error("[getCartBundlePreview] rpc error:", error);
      return [];
    }
    // Roda o motor de aplicação (mesmo do checkout) para alinhar valores reais.
    const { computeBundleApplication } = await import("@/server/cartBundleApply.server");
    const app = await computeBundleApplication({
      userId,
      items: data.items.map((i) => ({ productId: i.product_id, qty: i.qty })),
      hasCoupon: data.hasCoupon ?? false,
      couponPresent: data.couponPresent ?? data.hasCoupon ?? false,
    });
    const appliedById = new Map(app.details.applied.map((a) => [a.bundle_id, a]));
    const blockedById = new Map(app.details.blocked.map((b) => [b.bundle_id, b]));

    const list = (rows ?? []) as Array<Record<string, unknown>>;
    return list.map((r) => {
      const id = String(r.bundle_id);
      const appliedRow = appliedById.get(id);
      const blockedRow = blockedById.get(id);
      let status = (r.status as CartBundlePreviewStatus) ?? "not_eligible";
      let estimated_discount = Number(r.estimated_discount ?? 0);
      let discount_type = (r.discount_type as CartBundlePreviewRow["discount_type"]) ?? "none";
      let discount_value = Number(r.discount_value ?? 0);
      let eligible_subtotal = Number(r.eligible_subtotal ?? 0);
      let reason = (r.reason as string | null) ?? null;
      if (appliedRow) {
        status = "eligible_preview";
        estimated_discount = appliedRow.discount_amount;
        eligible_subtotal = appliedRow.eligible_subtotal;
        discount_type = appliedRow.discount_type;
        discount_value = appliedRow.discount_value;
        reason = null;
      } else if (blockedRow) {
        status = (blockedRow.status as CartBundlePreviewStatus) ?? status;
        reason = blockedRow.reason ?? reason;
        estimated_discount = 0;
      }
      return {
        bundle_id: id,
        bundle_slug: (r.bundle_slug as string | null) ?? null,
        bundle_name: String(r.bundle_name ?? ""),
        bundle_image: (r.bundle_image as string | null) ?? null,
        discount_type,
        discount_value,
        status,
        eligible_subtotal,
        estimated_discount,
        considered_items: Array.isArray(r.considered_items)
          ? (r.considered_items as CartBundleConsideredItem[])
          : [],
        missing_items: Array.isArray(r.missing_items)
          ? (r.missing_items as CartBundleMissingItem[])
          : [],
        reason,
        warnings: Array.isArray(r.warnings) ? (r.warnings as string[]) : [],
      };
    });
  });
