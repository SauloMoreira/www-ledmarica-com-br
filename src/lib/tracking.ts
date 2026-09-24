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
  add_payment_info: "AddPaymentInfo",
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

/**
 * Retorna o `gtag` global garantindo o formato correto de fila: cada comando
 * precisa entrar no dataLayer como objeto `arguments` — o gtag.js IGNORA
 * comandos enfileirados como Array (`push([...args])`). Esse era o motivo de
 * nenhuma tag do Google (GA4/Ads) jamais ser configurada no site.
 */
export function getGtag(): (...args: unknown[]) => void {
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }
  return window.gtag;
}

/*
 * Sincronização: os IDs das tags vêm do banco (marketing_integrations), então
 * o `config` do Google é enfileirado só depois dessa consulta. Eventos críticos
 * (compra) aguardam esse sinal para nunca entrarem na fila antes do `config` —
 * caso típico: o cliente volta do Mercado Pago e a página carrega do zero.
 */
let resolveGoogleTagsReady: () => void = () => {};
const googleTagsReady = new Promise<void>((resolve) => {
  resolveGoogleTagsReady = resolve;
});

export function markGoogleTagsReady() {
  resolveGoogleTagsReady();
}

export function whenGoogleTagsReady(timeoutMs = 5000): Promise<void> {
  return Promise.race([
    googleTagsReady,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * Google Consent Mode v2 — atualiza o estado de consentimento já registrado
 * no dataLayer (o valor padrão "denied" é definido inline no <head>, antes de
 * qualquer script carregar). Chamado sempre que o usuário decide sobre os
 * cookies (aceitar tudo, rejeitar, ou salvar preferências granulares).
 */
export function updateConsentMode(prefs: { analytics: boolean; marketing: boolean }) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("consent", "update", {
      analytics_storage: prefs.analytics ? "granted" : "denied",
      ad_storage: prefs.marketing ? "granted" : "denied",
      ad_user_data: prefs.marketing ? "granted" : "denied",
      ad_personalization: prefs.marketing ? "granted" : "denied",
    });
  } catch {
    /* noop */
  }
}

export function trackEvent(event: string, data?: Record<string, any>) {
  if (typeof window === "undefined") return;

  // GA4 — sempre enviado. O Consent Mode v2 decide o que o Google coleta:
  // sem consentimento vira um "ping" anônimo sem cookie (usado na modelagem
  // de conversões); com consentimento, coleta completa. Bloquear aqui
  // impediria o Google de modelar as conversões dos visitantes que recusam.
  if (typeof window.gtag === "function") {
    try {
      window.gtag("event", event, data);
    } catch {
      /* noop */
    }
  }

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

export function trackAddPaymentInfo(value: number, numItems: number) {
  trackEvent("add_payment_info", { value, currency: "BRL", num_items: numItems });
}

/**
 * Compra confirmada (GA4 + Meta/TikTok). Chamar SÓ com pagamento aprovado —
 * disparar na criação do pedido inflaria as vendas com pedidos não pagos.
 */
export function trackPurchase(order: {
  transactionId: string;
  total: number;
  items?: Array<{ id: string; name: string; qty: number; unitPrice: number }>;
}) {
  trackEvent("purchase", {
    transaction_id: order.transactionId,
    value: order.total,
    currency: "BRL",
    num_items: order.items?.length,
    items: order.items?.map((it) => ({
      item_id: it.id,
      item_name: it.name,
      quantity: it.qty,
      price: it.unitPrice,
    })),
  });
}

const GOOGLE_ADS_CONVERSION_SEND_TO = "AW-18412575433/6cdfCIqvtOgcEMm15stE";

export type EnhancedConversionUserData = { email?: string | null; phone?: string | null };

/** Normaliza telefone BR para E.164 (+55DDDNÚMERO), exigido pelo Google. */
export function toE164BR(phone: string | null | undefined): string | undefined {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `+${d}`;
  return undefined;
}

function normalizeEmail(email: string | null | undefined): string | undefined {
  const e = (email ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : undefined;
}

/**
 * Conversão "Compra" do Google Ads + Conversões Otimizadas (Enhanced
 * Conversions). Sempre dispara: o Consent Mode v2 garante que, sem
 * consentimento de marketing, o Google recebe só um sinal anônimo e o
 * `user_data` NÃO é transmitido (regra do `ad_user_data`). O gtag.js aplica
 * hash SHA-256 no e-mail/telefone antes de enviar.
 */
export function trackGoogleAdsPurchase(order: {
  orderId: string;
  orderNumber: number;
  total: number;
  userData?: EnhancedConversionUserData | null;
}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    const email = normalizeEmail(order.userData?.email);
    const phone_number = toE164BR(order.userData?.phone);
    if (email || phone_number) {
      window.gtag("set", "user_data", {
        ...(email ? { email } : {}),
        ...(phone_number ? { phone_number } : {}),
      });
    }
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

/*
 * O pagamento acontece fora do site (Mercado Pago) e o cliente volta na mesma
 * aba. Guardamos e-mail/telefone só em sessionStorage (some ao fechar a aba),
 * por pedido, para usar nas Conversões Otimizadas quando o pagamento aprovar.
 */
const PENDING_UD_PREFIX = "lm_ec_ud_";

export function savePendingConversionUserData(orderId: string, ud: EnhancedConversionUserData) {
  try {
    window.sessionStorage.setItem(PENDING_UD_PREFIX + orderId, JSON.stringify(ud));
  } catch {
    /* storage indisponível — conversão segue sem user_data */
  }
}

export function takePendingConversionUserData(orderId: string): EnhancedConversionUserData | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_UD_PREFIX + orderId);
    if (!raw) return null;
    window.sessionStorage.removeItem(PENDING_UD_PREFIX + orderId);
    return JSON.parse(raw) as EnhancedConversionUserData;
  } catch {
    return null;
  }
}

export function trackSearch(query: string) {
  trackEvent("search", { search_string: query });
}

export function trackLeadCaptured(origin: string) {
  trackEvent("lead_captured", { lead_origin: origin });
}
