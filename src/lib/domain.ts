// Tipos compartilhados do domínio Led Maricá
export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  sale_price: number | null;
  stock_qty: number;
  sku: string | null;
  ncm: string | null;
  brand: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  width_cm: number | null;
  length_cm: number | null;
  category_id: string | null;
  images: string[];
  tags: string[];
  active: boolean;
  featured: boolean;
  free_shipping_eligible: boolean;
  specs: Record<string, unknown>;
  b2b_enabled?: boolean;
  b2b_price?: number | null;
  b2b_min_qty?: number | null;
  b2b_qty_multiple?: number | null;
  b2b_show_in_vitrine?: boolean;
  parent_product_id?: string | null;
  variant_attributes?: Record<string, string>;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  sort_order: number;
  active: boolean;
};

export type CartLine = {
  productId: string;
  name: string;
  slug: string;
  price: number;
  image: string | null;
  qty: number;
  stock: number;
  freeShippingEligible?: boolean;
  minQty?: number;
  qtyMultiple?: number;
  source?: "b2c" | "b2b";
};

/**
 * Ajusta a quantidade respeitando mínimo, múltiplo e estoque.
 * - Garante qty >= minQty (quando definido)
 * - Arredonda para o múltiplo mais próximo (>= minQty)
 * - Limita ao estoque disponível
 */
export function snapQty(
  qty: number,
  opts: { minQty?: number; qtyMultiple?: number; stock: number },
): number {
  const min = Math.max(1, opts.minQty ?? 1);
  const mult = Math.max(1, opts.qtyMultiple ?? 1);
  let q = Math.max(min, Math.floor(qty));
  if (mult > 1) {
    // arredonda para o múltiplo mais próximo, partindo de min
    const offset = q - min;
    const steps = Math.round(offset / mult);
    q = min + steps * mult;
    if (q < min) q = min;
  }
  if (opts.stock > 0) q = Math.min(q, opts.stock);
  return q;
}

export const formatBRL = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const STORE_WHATSAPP = "5521982126467";
export const STORE_NAME = "Led Maricá";

// Loja física — usados na seção "Visite nossa loja" e nos selos de confiança
// da home. Mantidos aqui como fonte única para não divergir entre componentes.
export const STORE_PHONE_DISPLAY = "(21) 3731-2324";
export const STORE_ADDRESS =
  "Rod. Ernani do Amaral Peixoto, 28354, Loja 5/6/7 — Mumbuca, Maricá/RJ, 24913-700";
export const STORE_HOURS = "Seg a sáb, 8h às 18h";
export const GOOGLE_RATING = 4.6;
export const GOOGLE_REVIEW_COUNT = 213;
/** Link estável do Google Maps para a loja — usa busca por nome + endereço (não depende de place_id). */
export const GOOGLE_MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=Led+Marica+Rod.+Ernani+do+Amaral+Peixoto+28354+Marica+RJ";

/**
 * Dias úteis que a loja leva, em média, para separar e postar um pedido
 * após a confirmação do pagamento. O prazo retornado pela Melhor Envio
 * (`ShippingService.days`) é só o trânsito da transportadora, contado a
 * partir da postagem — não inclui esse tempo de separação. Somamos os
 * dois para mostrar ao cliente um prazo total realista (compra →
 * recebimento) e evitar prometer uma entrega mais rápida do que a loja
 * de fato consegue cumprir.
 */
export const ORDER_HANDLING_DAYS = 2;

/** Prazo total (dias úteis) mostrado ao cliente: separação + trânsito da transportadora. */
export function totalDeliveryDays(carrierTransitDays: number): number {
  return ORDER_HANDLING_DAYS + Math.max(0, carrierTransitDays);
}

export function formatBusinessDays(days: number): string {
  return `${days} ${days === 1 ? "dia útil" : "dias úteis"}`;
}

// NOTA: a promoção de frete grátis por valor mínimo de compra está
// desativada (set/2026) — não é aplicada no checkout, então foi removida de
// toda a UI (badges, carrinho, chat) para não prometer algo que não se
// cumpre. O campo `Product.free_shipping_eligible` continua existindo no
// modelo de dados (uso interno/admin), mas nenhuma tela pública o exibe.
// Se a promoção for reativada, recriar aqui a função de progresso
// (`calcFreeShippingProgress`) e os limiares antes de voltar a exibi-la.
