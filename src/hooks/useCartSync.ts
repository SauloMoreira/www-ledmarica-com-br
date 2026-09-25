import { useEffect, useRef } from "react";
import { useCart } from "@/stores/cartStore";
import { getCartSessionId } from "@/lib/cartSession";
import { syncCart } from "@/server/cartSync.functions";
import { useAuthContext } from "@/components/auth/AuthProvider";

/**
 * Espelha o carrinho (Zustand, local) para `cart_items` — server-only.
 * debounce, sempre que ele muda. Alimenta a detecção de carrinho abandonado
 * (job hourly). Monte uma única vez perto da raiz do storefront.
 *
 * Também re-sincroniza quando o visitante ENTRA ou SE CADASTRA: é o que move o
 * carrinho da sessão anônima para a conta (e o carrinho abandonado passa a ter
 * nome/e-mail/WhatsApp). Antes, sem mudança nos itens, nada acontecia e o
 * carrinho ficava "sem contato" mesmo com o cliente logado.
 */
export function useCartSync() {
  const items = useCart((s) => s.items);
  const { user, loading } = useAuthContext();
  const uid = user?.id ?? null;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastItems = useRef(items);
  const lastUid = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (loading) return;
    const sessionId = getCartSessionId();
    if (!sessionId) return;

    const itemsChanged = lastItems.current !== items;
    const uidChanged = lastUid.current !== undefined && lastUid.current !== uid;
    const firstRun = lastUid.current === undefined;
    lastItems.current = items;
    lastUid.current = uid;

    // Troca de conta com carrinho vazio (ex.: login em outro aparelho) não pode
    // apagar o carrinho que já está salvo no servidor para esse cliente.
    if (!itemsChanged && !firstRun && (!uidChanged || items.length === 0)) return;
    if (!itemsChanged && firstRun && items.length === 0) return;

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
  }, [items, uid, loading]);
}
