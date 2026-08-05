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

export const FREE_SHIPPING_THRESHOLD = 199;
export const STORE_WHATSAPP = "5521982126467";
export const STORE_NAME = "Led Maricá";

/**
 * Calcula se o carrinho atingiu a regra de frete grátis.
 * Regra: somente produtos elegíveis contam para o subtotal mínimo.
 */
export function calcFreeShippingProgress(
  items: Array<{ price: number; qty: number; freeShippingEligible?: boolean }>,
) {
  const eligibleSubtotal = items
    .filter((i) => i.freeShippingEligible)
    .reduce((acc, i) => acc + i.price * i.qty, 0);
  const hasEligibleItems = items.some((i) => i.freeShippingEligible);
  const qualifies = hasEligibleItems && eligibleSubtotal >= FREE_SHIPPING_THRESHOLD;
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - eligibleSubtotal);
  return { eligibleSubtotal, hasEligibleItems, qualifies, remaining };
}
