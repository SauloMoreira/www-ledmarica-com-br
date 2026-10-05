// ============================================================
// Acesso do CLIENTE ao detalhe do pedido.
// Suporta:
//  - cliente logado (dono do pedido)
//  - cliente sem login via token público (link enviado por e-mail)
//
// IMPORTANTE: Esta função NUNCA expõe dados administrativos.
// Não retorna: payment_id, mp_payment_id, mp_preference_id,
// mp_merchant_order_id, payment_error, admin_notes, public_access_token,
// payload de webhooks, headers, e-mails internos, etc.
// ============================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

const Input = z.object({
  id: z.string().uuid(),
  token: z.string().min(16).max(128).optional().nullable(),
});

type Address = {
  recipient?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
} | null;

async function getAuthenticatedUserId(): Promise<string | null> {
  const authHeader = getRequestHeader("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  if (!token) return null;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;
  try {
    const sb = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
    const { data, error } = await sb.auth.getClaims(token);
    if (error || !data?.claims?.sub) return null;
    return data.claims.sub as string;
  } catch {
    return null;
  }
}

export const getOrderForCustomer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    // Carrega o pedido completo via admin (vamos validar acesso manualmente)
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, user_id, status, payment_status, payment_method, subtotal, discount, shipping_cost, total, coupon_code, shipping_carrier, shipping_service, tracking_code, estimated_delivery, address_snapshot, created_at, paid_at, public_access_token, delivery_method, pickup_status, pickup_store_name, pickup_store_address, pickup_store_phone, pickup_instructions, local_delivery_district, local_delivery_eta, bundle_discount_total, bundle_discount_details, has_bundle_discount, order_items(id, product_id, product_name, product_image, qty, unit_price, total_price, bundle_id, bundle_name, bundle_applied, bundle_discount_amount)",
      )
      .eq("id", data.id)
      .single();

    if (error || !order) {
      return { ok: false as const, error: "Pedido não encontrado" };
    }

    // Validar acesso
    const userId = await getAuthenticatedUserId();
    const isOwner = userId && userId === order.user_id;
    const tokenMatches =
      !!data.token && !!order.public_access_token && data.token === order.public_access_token;

    if (!isOwner && !tokenMatches) {
      return { ok: false as const, error: "Pedido não encontrado" };
    }

    // Sanitizar e retornar APENAS o que o cliente pode ver
    const addr = (order.address_snapshot as Address) ?? null;
    const orderAny = order as any;
    type AppliedBundleSummary = {
      bundle_id: string;
      bundle_name: string;
      discount_amount: number;
    };
    const rawDetails = (orderAny.bundle_discount_details ?? null) as {
      applied?: Array<{ bundle_id?: string; bundle_name?: string; discount_amount?: number }>;
    } | null;
    const appliedBundles: AppliedBundleSummary[] =
      rawDetails?.applied
        ?.filter((b) => Number(b?.discount_amount ?? 0) > 0)
        .map((b) => ({
          bundle_id: String(b.bundle_id ?? ""),
          bundle_name: String(b.bundle_name ?? "Combo"),
          discount_amount: Number(b.discount_amount ?? 0),
        })) ?? [];

    return {
      ok: true as const,
      order: {
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        paymentStatus: order.payment_status,
        paymentMethod: order.payment_method,
        subtotal: Number(order.subtotal ?? 0),
        discount: Number(order.discount ?? 0),
        bundleDiscountTotal: Number(orderAny.bundle_discount_total ?? 0),
        bundles: appliedBundles,
        shippingCost: Number(order.shipping_cost ?? 0),
        total: Number(order.total ?? 0),
        couponCode: order.coupon_code,
        shippingCarrier: order.shipping_carrier,
        shippingService: order.shipping_service,
        trackingCode: order.tracking_code,
        estimatedDelivery: order.estimated_delivery,
        createdAt: order.created_at,
        paidAt: order.paid_at,
        deliveryMethod: orderAny.delivery_method ?? "delivery",
        pickup:
          orderAny.delivery_method === "pickup"
            ? {
                status: orderAny.pickup_status ?? null,
                storeName: orderAny.pickup_store_name ?? null,
                storeAddress: orderAny.pickup_store_address ?? null,
                storePhone: orderAny.pickup_store_phone ?? null,
                instructions: orderAny.pickup_instructions ?? null,
              }
            : null,
        localDelivery:
          orderAny.delivery_method === "local_delivery"
            ? {
                district: orderAny.local_delivery_district ?? null,
                eta: orderAny.local_delivery_eta ?? null,
              }
            : null,
        address: addr
          ? {
              recipient: addr.recipient ?? null,
              street: addr.street ?? null,
              number: addr.number ?? null,
              complement: addr.complement ?? null,
              neighborhood: addr.neighborhood ?? null,
              city: addr.city ?? null,
              state: addr.state ?? null,
              zipCode: addr.zipCode ?? null,
            }
          : null,
        items: (order.order_items ?? []).map((i) => {
          const ii = i as any;
          return {
            id: i.id,
            productId: (ii.product_id as string | null) ?? null,
            name: i.product_name,
            image: i.product_image,
            qty: Number(i.qty),
            unitPrice: Number(i.unit_price),
            totalPrice: Number(i.total_price),
            bundleName: ii.bundle_applied ? (ii.bundle_name ?? null) : null,
            bundleDiscountAmount: Number(ii.bundle_discount_amount ?? 0),
          };
        }),
      },
    };
  });
