/**
 * AddToCart com a quantidade REALMENTE adicionada ao carrinho.
 *
 * O `addItem` do carrinho limita a quantidade ao estoque; por isso o evento
 * usa a diferença entre antes e depois, não a quantidade pedida. Vários
 * produtos num único clique geram um único evento (ver trackAddToCartLines).
 */
import { useCart } from "@/stores/cartStore";
import { trackAddToCartLines, type TrackedLine } from "@/lib/tracking";

export interface CartAdditionInput {
  productId: string;
  name: string;
  unitPrice: number;
}

function qtyInCart(productId: string): number {
  return useCart.getState().items.find((i) => i.productId === productId)?.qty ?? 0;
}

/**
 * Executa as adições e registra UM AddToCart com o que de fato entrou.
 * Uso: trackCartAdditions([{ productId, name, unitPrice }], () => { cart.addItem(...) })
 */
export function trackCartAdditions(items: CartAdditionInput[], add: () => void): void {
  const snap = cartSnapshot(items.map((it) => it.productId));
  add();
  trackAddedSince(snap, items);
}

/** Quantidades atuais no carrinho (chamar ANTES de adicionar). */
export function cartSnapshot(productIds: string[]): Map<string, number> {
  return new Map(productIds.map((id) => [id, qtyInCart(id)]));
}

/** Registra UM AddToCart com o que entrou no carrinho desde o `snapshot`. */
export function trackAddedSince(snapshot: Map<string, number>, items: CartAdditionInput[]): void {
  const lines: TrackedLine[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    // Mesmo produto em duas linhas (combo/CSV): a diferença é contada uma vez.
    if (seen.has(it.productId)) continue;
    seen.add(it.productId);
    const added = qtyInCart(it.productId) - (snapshot.get(it.productId) ?? 0);
    if (added > 0) {
      lines.push({ productId: it.productId, name: it.name, qty: added, unitPrice: it.unitPrice });
    }
  }
  trackAddToCartLines(lines);
}
