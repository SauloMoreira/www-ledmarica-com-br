import { useCookieStore } from "@/stores/cookieStore";

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
    ttq?: { track: (event: string, data?: any) => void; page?: () => void; [k: string]: any };
    clarity?: (...args: any[]) => void;
    dataLayer?: any[];
    __LM_PERSONALIZATION?: boolean;
  }
}

const META_EVENT_MAP: Record<string, string> = {
  view_product: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
  search: "Search",
  lead_captured: "Lead",
};

const TIKTOK_EVENT_MAP: Record<string, string> = {
  view_product: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "CompletePayment",
  search: "Search",
  lead_captured: "SubmitForm",
};

export function trackEvent(event: string, data?: Record<string, any>) {
  if (typeof window === "undefined") return;
  const { preferences, consented } = useCookieStore.getState();
  if (!consented) return;

  // dataLayer (GTM) — analytics
  if (preferences.analytics && Array.isArray(window.dataLayer)) {
    try {
      window.dataLayer.push({ event, ...data });
    } catch {
      /* noop */
    }
  }

  // GA4
  if (preferences.analytics && typeof window.gtag === "function") {
    try {
      window.gtag("event", event, data);
    } catch {
      /* noop */
    }
  }

  // Clarity (custom event)
  if (preferences.analytics && typeof window.clarity === "function") {
    try {
      window.clarity("event", event);
    } catch {
      /* noop */
    }
  }

  // Meta Pixel
  if (preferences.marketing && typeof window.fbq === "function") {
    const mapped = META_EVENT_MAP[event];
    if (mapped) {
      try {
        window.fbq("track", mapped, data);
      } catch {
        /* noop */
      }
    }
  }

  // TikTok Pixel
  if (preferences.marketing && window.ttq && typeof window.ttq.track === "function") {
    const mapped = TIKTOK_EVENT_MAP[event];
    if (mapped) {
      try {
        window.ttq.track(mapped, data);
      } catch {
        /* noop */
      }
    }
  }
}

export function trackViewProduct(product: {
  id: string;
  name: string;
  price: number;
  sale_price?: number | null;
  category_id?: string | null;
}) {
  trackEvent("view_product", {
    content_type: "product",
    content_ids: [product.id],
    content_name: product.name,
    content_category: product.category_id ?? undefined,
    value: product.sale_price ?? product.price,
    currency: "BRL",
  });
}

export function trackAddToCart(
  product: { id: string; name: string; price: number; sale_price?: number | null },
  qty: number,
) {
  trackEvent("add_to_cart", {
    content_ids: [product.id],
    content_name: product.name,
    value: (product.sale_price ?? product.price) * qty,
    currency: "BRL",
    num_items: qty,
  });
}

export function trackBeginCheckout(value: number, numItems: number) {
  trackEvent("begin_checkout", { value, currency: "BRL", num_items: numItems });
}

export function trackPurchase(order: {
  order_number?: number | string;
  total: number;
  items?: unknown[];
}) {
  trackEvent("purchase", {
    transaction_id: order.order_number,
    value: order.total,
    currency: "BRL",
    num_items: order.items?.length,
  });
}

const GOOGLE_ADS_CONVERSION_SEND_TO = "AW-18412575433/6cdfCIqvtOgcEMm15stE";

/**
 * Conversão "Compra" do Google Ads. Dispara apenas com consentimento
 * da categoria "marketing" (mesma regra do trackEvent).
 */
export function trackGoogleAdsPurchase(order: {
  orderId: string;
  orderNumber: number;
  total: number;
}) {
  if (typeof window === "undefined") return;
  const { preferences, consented } = useCookieStore.getState();
  if (!consented || !preferences.marketing) return;
  if (typeof window.gtag !== "function") return;
  try {
    window.gtag("event", "conversion", {
      send_to: GOOGLE_ADS_CONVERSION_SEND_TO,
      value: order.total,
      currency: "BRL",
      transaction_id: String(order.orderNumber ?? order.orderId),
    });
  } catch {
    /* noop */
  }
}

export function trackSearch(query: string) {
  trackEvent("search", { search_string: query });
}

export function trackLeadCaptured(origin: string) {
  trackEvent("lead_captured", { lead_origin: origin });
}
