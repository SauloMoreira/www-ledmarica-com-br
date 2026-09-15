import { useEffect, useRef } from "react";
import { useCart } from "@/stores/cartStore";
import { getCartSessionId } from "@/lib/cartSession";
import { syncCart } from "@/server/cartSync.functions";

/**
 * Espelha o carrinho (Zustand, local) para `cart_items` — server-only.
 * debounce, sempre que ele muda. Alimenta a detecção de carrinho abandonado
 * (job hourly). Monte uma única vez perto da raiz do storefront.
 */
export function useCartSync() {
  const items = useCart((s) => s.items);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sessionId = getCartSessionId();
    if (!sessionId) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void syncCart({
        data: {
          sessionId,
          items: items.map((i) => ({ productId: i.productId, qty: i.qty })),
        },
      }).catch(() => {
        /* best-effort: nunca interrompe a navegação */
      });
    }, 1200);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [items]);
}
