import { useCookieStore } from "@/stores/cookieStore";
import { metaTrack, type MetaDispatchStatus, type MetaTrackOptions } from "@/lib/metaPixel";

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

/**
 * Eventos internos → eventos do Meta. Custom = `trackCustom` (não padronizado).
 * Diferenciação de cadastros:
 *  - lead_captured     → Lead (contato interessado capturado com sucesso)
 *  - sign_up           → CompleteRegistration (conta de cliente criada)
 *  - newsletter_signup → NewsletterSignup (custom; NÃO é Lead)
 *  - whatsapp_click    → Contact (clique no WhatsApp; NÃO comprova conversa)
 */
const META_EVENT_MAP: Record<string, { name: string; custom?: boolean }> = {
  view_product: { name: "ViewContent" },
  add_to_cart: { name: "AddToCart" },
  begin_checkout: { name: "InitiateCheckout" },
  add_payment_info: { name: "AddPaymentInfo" },
  purchase: { name: "Purchase" },
  search: { name: "Search" },
  lead_captured: { name: "Lead" },
  sign_up: { name: "CompleteRegistration" },
  newsletter_signup: { name: "NewsletterSignup", custom: true },
  whatsapp_click: { name: "Contact" },
};

const TIKTOK_EVENT_MAP: Record<string, string> = {
  view_product: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "CompletePayment",
  search: "Search",
  lead_captured: "SubmitForm",
};

/** Item no formato comum a todos os eventos de produto (ID = products.id). */
export interface TrackedLine {
  productId: string;
  name?: string;
  qty: number;
  unitPrice: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Parâmetros de produto no padrão do Meta, com o mesmo ID em todos os eventos. */
export function buildContentParams(lines: TrackedLine[]) {
  const valid = lines.filter((l) => l.productId && l.qty > 0);
  return {
    content_type: "product",
    content_ids: valid.map((l) => l.productId),
    contents: valid.map((l) => ({
      id: l.productId,
      quantity: l.qty,
      item_price: round2(l.unitPrice),
    })),
    num_items: valid.reduce((s, l) => s + l.qty, 0),
  };
}

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

export interface TrackEventOptions {
  /** Envia ao GA4 via gtag (padrão: true). */
  google?: boolean;
  /** Envia ao Meta Pixel (padrão: true; sempre sujeito a consentimento). */
  meta?: boolean;
  /** Envia aos demais destinos: dataLayer/GTM, Clarity e TikTok (padrão: true). */
  others?: boolean;
  /** Parâmetros específicos do Meta (se ausente, usa `data`). */
  metaParams?: Record<string, unknown>;
  /** Opções do envio ao Meta (eventId, acompanhamento de estado). */
  metaOptions?: MetaTrackOptions;
}

/**
 * Envia um evento aos destinos configurados. Retorna o estado do envio ao
 * Meta ("blocked" quando não há consentimento de Marketing ou o evento não
 * tem equivalente no Meta).
 */
export function trackEvent(
  event: string,
  data?: Record<string, any>,
  options: TrackEventOptions = {},
): MetaDispatchStatus {
  if (typeof window === "undefined") return "blocked";

  // GA4 — sempre enviado. O Consent Mode v2 decide o que o Google coleta:
  // sem consentimento vira um "ping" anônimo sem cookie (usado na modelagem
  // de conversões); com consentimento, coleta completa. Bloquear aqui
  // impediria o Google de modelar as conversões dos visitantes que recusam.
  if (options.google !== false && typeof window.gtag === "function") {
    try {
      window.gtag("event", event, data);
    } catch {
      /* noop */
    }
  }

  // Meta Pixel — o próprio `metaTrack` confere o consentimento de Marketing
  // no momento da ação e cuida da fila até o Pixel estar pronto.
  let metaStatus: MetaDispatchStatus = "blocked";
  const mapped = META_EVENT_MAP[event];
  if (options.meta !== false && mapped) {
    metaStatus = metaTrack(mapped.name, options.metaParams ?? data, {
      ...options.metaOptions,
      custom: mapped.custom,
    });
  }

  const { preferences, consented } = useCookieStore.getState();
  if (!consented || options.others === false) return metaStatus;

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

  // TikTok Pixel
  if (preferences.marketing && window.ttq && typeof window.ttq.track === "function") {
    const mappedTt = TIKTOK_EVENT_MAP[event];
    if (mappedTt) {
      try {
        window.ttq.track(mappedTt, data);
      } catch {
        /* noop */
      }
    }
  }
  return metaStatus;
}

export function trackViewProduct(product: {
  id: string;
  name: string;
  price: number;
  sale_price?: number | null;
  category_id?: string | null;
}) {
  const unitPrice = product.sale_price ?? product.price;
  trackEvent(
    "view_product",
    {
      content_type: "product",
      content_ids: [product.id],
      content_name: product.name,
      content_category: product.category_id ?? undefined,
      value: unitPrice,
      currency: "BRL",
    },
    {
      metaParams: {
        ...buildContentParams([{ productId: product.id, qty: 1, unitPrice }]),
        content_name: product.name,
        value: round2(unitPrice),
        currency: "BRL",
      },
    },
  );
}

/**
 * Adicionar ao carrinho. `unitPrice` deve ser o MESMO preço gravado no
 * carrinho (varejo, promoção ou B2B), e `qty` a quantidade adicionada.
 */
export function trackAddToCart(item: { id: string; name: string; unitPrice: number }, qty: number) {
  if (!item.id || !(qty > 0)) return;
  const value = round2(item.unitPrice * qty);
  trackEvent(
    "add_to_cart",
    {
      content_ids: [item.id],
      content_name: item.name,
      value,
      currency: "BRL",
      num_items: qty,
    },
    {
      metaParams: {
        ...buildContentParams([{ productId: item.id, qty, unitPrice: item.unitPrice }]),
        content_name: item.name,
        value,
        currency: "BRL",
      },
    },
  );
}

/**
 * Vários produtos adicionados num único clique (combo, compra rápida,
 * "compre junto"): UM evento AddToCart com todos os itens em `contents`.
 */
export function trackAddToCartLines(lines: TrackedLine[]) {
  const valid = lines.filter((l) => l.productId && l.qty > 0);
  if (valid.length === 0) return;
  if (valid.length === 1) {
    const l = valid[0];
    trackAddToCart({ id: l.productId, name: l.name ?? "", unitPrice: l.unitPrice }, l.qty);
    return;
  }
  const content = buildContentParams(valid);
  const value = round2(valid.reduce((s, l) => s + l.unitPrice * l.qty, 0));
  trackEvent(
    "add_to_cart",
    { content_ids: content.content_ids, value, currency: "BRL", num_items: content.num_items },
    { metaParams: { ...content, value, currency: "BRL" } },
  );
}

const BEGIN_CHECKOUT_KEY = "lm_begin_checkout_sig";

/** Assinatura do carrinho: mesmo carrinho = mesmo início de checkout. */
export function cartSignature(lines: TrackedLine[]): string {
  return lines
    .map((l) => `${l.productId}:${l.qty}`)
    .sort()
    .join("|");
}

/**
 * Início de checkout. Deduplicado por sessão do navegador e conteúdo do
 * carrinho: recarregar ou voltar ao /checkout com o mesmo carrinho não
 * dispara de novo. Retorna `false` quando ignorado por duplicidade.
 */
export function trackBeginCheckout(lines: TrackedLine[], value: number): boolean {
  if (typeof window === "undefined" || lines.length === 0) return false;
  const sig = cartSignature(lines);
  try {
    if (window.sessionStorage.getItem(BEGIN_CHECKOUT_KEY) === sig) return false;
    window.sessionStorage.setItem(BEGIN_CHECKOUT_KEY, sig);
  } catch {
    /* storage indisponível — segue sem deduplicação entre recargas */
  }
  const content = buildContentParams(lines);
  trackEvent(
    "begin_checkout",
    { value: round2(value), currency: "BRL", num_items: content.num_items },
    { metaParams: { ...content, value: round2(value), currency: "BRL" } },
  );
  return true;
}

export function trackAddPaymentInfo(lines: TrackedLine[], value: number) {
  const content = buildContentParams(lines);
  trackEvent(
    "add_payment_info",
    { value: round2(value), currency: "BRL", num_items: content.num_items },
    { metaParams: { ...content, value: round2(value), currency: "BRL" } },
  );
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

/**
 * Lead = contato interessado capturado COM SUCESSO (registro salvo no
 * servidor). Origens usadas: chat_handoff, chat, contact_form,
 * b2b_company_signup, cart_identify, cart_contact.
 */
export function trackLeadCaptured(origin: string) {
  trackEvent("lead_captured", { lead_origin: origin });
}

/** Inscrição na newsletter — evento próprio, não é Lead. */
export function trackNewsletterSignup(origin = "site") {
  trackEvent("newsletter_signup", { signup_origin: origin });
}
