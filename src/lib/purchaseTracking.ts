/**
 * Registro da conversão "Compra" (GA4 + Google Ads + Meta Pixel).
 *
 * Confiabilidade:
 *  - Só dispara com `paymentStatus` "approved"/"paid" vindo do SERVIDOR
 *    (pedido lido do banco). No fluxo normal esse status é gravado pelo
 *    webhook do Mercado Pago, que valida a assinatura e consulta o pagamento
 *    na API do MP (também pode ser marcado manualmente pelo admin).
 *    Parâmetros da URL de retorno (`status=approved`) NÃO são considerados.
 *
 * Deduplicação, por pedido e por canal (localStorage do navegador):
 *  - Google (GA4 + Ads): chave `gads_conversion_<pedido>` — mantida por
 *    compatibilidade com pedidos já registrados; gravada DEPOIS do envio.
 *  - Meta: chave `lm_meta_purchase_<pedido>` com o estado do evento:
 *      prepared   → montado, ainda não entregue ao Pixel;
 *      pending    → aguardando a ativação do Pixel nesta página;
 *      queued     → entregue ao stub fbq, aguardando a biblioteca do Meta;
 *      dispatched → processado pela biblioteca no navegador (terminal);
 *      not_consented → aprovação vista sem consentimento de Marketing
 *                      (terminal: a compra não é reenviada após um aceite
 *                      posterior);
 *      failed     → biblioteca bloqueada/sem rede; nova tentativa na próxima
 *                   visita, com o MESMO eventID.
 *    "dispatched" não significa recebido pelo Meta — confirmar no
 *    Gerenciador de Eventos.
 */
import {
  buildContentParams,
  trackEvent,
  trackGoogleAdsPurchase,
  whenGoogleTagsReady,
  type EnhancedConversionUserData,
  type TrackedLine,
} from "@/lib/tracking";
import type { MetaDispatchStatus } from "@/lib/metaPixel";

export type MetaPurchaseState =
  "prepared" | "pending" | "queued" | "dispatched" | "not_consented" | "failed";

export interface MetaPurchaseRecord {
  state: MetaPurchaseState;
  eventId: string;
  updatedAt: string;
}

export interface ConfirmedOrderForTracking {
  id: string;
  orderNumber: number;
  total: number;
  paymentStatus: string | null;
  items: Array<{ productId: string | null; name?: string; qty: number; unitPrice: number }>;
}

const GOOGLE_KEY = (orderId: string) => `gads_conversion_${orderId}`;
const META_KEY = (orderId: string) => `lm_meta_purchase_${orderId}`;
const TERMINAL: MetaPurchaseState[] = ["dispatched", "not_consented"];

export function isPaymentApproved(paymentStatus: string | null | undefined): boolean {
  return paymentStatus === "approved" || paymentStatus === "paid";
}

export function purchaseEventId(orderId: string): string {
  return `purchase_${orderId}`;
}

function readMeta(orderId: string): MetaPurchaseRecord | null {
  try {
    const raw = window.localStorage.getItem(META_KEY(orderId));
    return raw ? (JSON.parse(raw) as MetaPurchaseRecord) : null;
  } catch {
    return null;
  }
}

function writeMeta(orderId: string, state: MetaPurchaseState): void {
  try {
    const rec: MetaPurchaseRecord = {
      state,
      eventId: purchaseEventId(orderId),
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(META_KEY(orderId), JSON.stringify(rec));
  } catch {
    /* storage indisponível */
  }
}

export function getMetaPurchaseRecord(orderId: string): MetaPurchaseRecord | null {
  return readMeta(orderId);
}

function googleAlreadySent(orderId: string): boolean {
  try {
    return Boolean(window.localStorage.getItem(GOOGLE_KEY(orderId)));
  } catch {
    return false;
  }
}

function markGoogleSent(orderId: string): void {
  try {
    window.localStorage.setItem(GOOGLE_KEY(orderId), new Date().toISOString());
  } catch {
    /* noop */
  }
}

function statusToState(s: MetaDispatchStatus): MetaPurchaseState {
  if (s === "blocked") return "not_consented";
  return s; // pending | queued | dispatched | failed
}

/** Evita processar o mesmo pedido duas vezes na mesma página (StrictMode, re-render). */
const inFlight = new Set<string>();
/**
 * Pedidos já entregues ao Meta NESTA carga de página (ex.: retorno do MP →
 * clique em "Ver pedido", navegação SPA). Nova tentativa só em nova carga.
 */
const metaHandedThisPage = new Set<string>();

/**
 * Registra a compra confirmada. Idempotente: pode ser chamada a cada
 * carregamento/atualização da página do pedido ou do retorno do pagamento.
 * Retorna o que foi feito, para diagnóstico e testes.
 */
export async function trackConfirmedPurchase(
  order: ConfirmedOrderForTracking,
  userData?: EnhancedConversionUserData | null,
): Promise<{ google: "sent" | "skipped"; meta: MetaPurchaseState | "skipped" }> {
  const result: { google: "sent" | "skipped"; meta: MetaPurchaseState | "skipped" } = {
    google: "skipped",
    meta: "skipped",
  };
  if (typeof window === "undefined") return result;
  if (!isPaymentApproved(order.paymentStatus)) return result;
  if (inFlight.has(order.id)) return result;
  inFlight.add(order.id);

  try {
    const lines: TrackedLine[] = order.items
      .filter((it) => Boolean(it.productId))
      .map((it) => ({
        productId: it.productId as string,
        name: it.name,
        qty: Number(it.qty),
        unitPrice: Number(it.unitPrice),
      }));
    const value = Math.round(Number(order.total) * 100) / 100;
    const transactionId = String(order.orderNumber);

    // ---- Meta: decide ANTES de aguardar o Google, para a decisão de
    // consentimento valer para o momento em que a aprovação foi vista.
    const metaRec = readMeta(order.id);
    const sendMeta =
      !metaHandedThisPage.has(order.id) && (!metaRec || !TERMINAL.includes(metaRec.state));

    // ---- Google (GA4 + Ads): aguarda o `config` das tags, envia e só então
    // grava a deduplicação.
    const sendGoogle = !googleAlreadySent(order.id);

    if (sendMeta) {
      metaHandedThisPage.add(order.id);
      writeMeta(order.id, "prepared");
      const status = trackEvent(
        "purchase",
        {},
        {
          google: false,
          others: false,
          metaParams: {
            ...buildContentParams(lines),
            value,
            currency: "BRL",
            order_id: transactionId,
          },
          metaOptions: {
            eventId: purchaseEventId(order.id),
            onStatus: (s) => {
              const st = statusToState(s);
              const cur = readMeta(order.id);
              // Não rebaixa um estado terminal.
              if (cur && TERMINAL.includes(cur.state)) return;
              writeMeta(order.id, st);
            },
          },
        },
      );
      result.meta = statusToState(status);
    } else if (metaRec) {
      result.meta = metaRec.state;
    }

    if (sendGoogle) {
      await whenGoogleTagsReady();
      // Sem gtag na página não há envio — e a compra não é marcada como enviada.
      if (!googleAlreadySent(order.id) && typeof window.gtag === "function") {
        trackGoogleAdsPurchase({
          orderId: order.id,
          orderNumber: order.orderNumber,
          total: value,
          userData,
        });
        trackEvent(
          "purchase",
          {
            transaction_id: transactionId,
            value,
            currency: "BRL",
            num_items: order.items.length,
            items: lines.map((l) => ({
              item_id: l.productId,
              item_name: l.name,
              quantity: l.qty,
              price: l.unitPrice,
            })),
          },
          { meta: false },
        );
        markGoogleSent(order.id);
        result.google = "sent";
      }
    }
    return result;
  } finally {
    inFlight.delete(order.id);
  }
}

/** Somente para testes automatizados. */
export function __resetPurchaseTrackingForTests(): void {
  inFlight.clear();
  metaHandedThisPage.clear();
}
