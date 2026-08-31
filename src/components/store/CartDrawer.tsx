import { Link } from "@tanstack/react-router";

import { X, Trash2, Plus, Minus, ShoppingBag, AlertCircle, Package } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCart, validateB2bLine } from "@/stores/cartStore";
import { Button } from "@/components/ui/button";
import { formatBRL, FREE_SHIPPING_THRESHOLD, calcFreeShippingProgress } from "@/lib/domain";
import { getCartBundlePreview } from "@/server/cartBundlePreview.functions";

export function CartDrawer() {
  const cart = useCart();
  const subtotal = cart.subtotal();
  const previewItems = cart.items.map((i) => ({ product_id: i.productId, qty: i.qty }));
  const { data: bundleRows } = useQuery({
    queryKey: [
      "cart-drawer-bundle-preview",
      previewItems.map((i) => `${i.product_id}:${i.qty}`).join("|"),
    ],
    queryFn: () => getCartBundlePreview({ data: { items: previewItems, hasCoupon: false } }),
    enabled: cart.isOpen && previewItems.length > 0,
    staleTime: 15_000,
  });
  const eligibleBundles = (bundleRows ?? []).filter((r) => r.status === "eligible_preview");
  const bundleSavings = eligibleBundles.reduce((acc, r) => acc + r.estimated_discount, 0);
  const subtotalWithBundles = Math.max(0, subtotal - bundleSavings);
  const freeShip = calcFreeShippingProgress(
    cart.items.map((i) => ({
      price: i.price,
      qty: i.qty,
      freeShippingEligible: i.freeShippingEligible,
    })),
  );
  const progress = Math.min(100, (freeShip.eligibleSubtotal / FREE_SHIPPING_THRESHOLD) * 100);
  const b2bIssues = cart.items
    .map((i) => ({ item: i, validation: validateB2bLine(i) }))
    .filter((r) => !r.validation.ok) as Array<{
    item: (typeof cart.items)[number];
    validation: { ok: false; reason: string };
  }>;
  const hasB2bIssue = b2bIssues.length > 0;

  const open = cart.isOpen;

  return (
    <>
      {
        <>
          <div
            onClick={cart.close}
            aria-hidden={!open}
            className={`fixed inset-0 bg-foreground/40 backdrop-blur-sm z-[60] transition-opacity duration-200 ${
              open ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          />
          <aside
            aria-hidden={!open}
            className={`fixed top-0 right-0 h-full w-full max-w-md bg-card z-[61] flex flex-col shadow-floating transition-transform duration-200 ease-out will-change-transform ${
              open ? "translate-x-0" : "pointer-events-none translate-x-full"
            }`}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-bold text-lg">Seu carrinho</h2>
              <button
                onClick={cart.close}
                className="w-8 h-8 rounded-md hover:bg-surface flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {cart.items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-primary-tint flex items-center justify-center mb-4">
                  <ShoppingBag className="w-7 h-7 text-primary" />
                </div>
                <p className="font-medium text-foreground mb-1">Seu carrinho está vazio</p>
                <p className="text-sm text-muted-foreground mb-6">Que tal explorar o catálogo?</p>
                <Button onClick={cart.close} asChild>
                  <Link to="/catalogo">Ver catálogo</Link>
                </Button>
              </div>
            ) : (
              <>
                {/* Progress frete grátis — só renderiza com itens elegíveis */}
                {freeShip.hasEligibleItems && (
                  <div className="px-5 py-3 bg-primary-tint border-b border-primary-border">
                    {freeShip.qualifies ? (
                      <p className="text-xs text-success font-medium mb-1.5">
                        🎉 Você ganhou frete grátis!
                      </p>
                    ) : (
                      <p className="text-xs text-primary font-medium mb-1.5">
                        Faltam <strong>{formatBRL(freeShip.remaining)}</strong> em produtos
                        participantes para frete grátis
                      </p>
                    )}
                    <div className="h-1.5 bg-primary-foreground/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                  {cart.items.map((item) => {
                    const v = validateB2bLine(item);
                    const invalid = !v.ok;
                    return (
                      <div
                        key={item.productId}
                        className="flex gap-3 pb-4 border-b border-border last:border-0"
                      >
                        <div className="w-16 h-16 rounded-md bg-surface flex items-center justify-center shrink-0 overflow-hidden">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ShoppingBag className="w-6 h-6 text-text-faint" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-2 mb-1">{item.name}</p>
                          <div className="font-display font-bold text-primary text-sm mb-2">
                            {formatBRL(item.price)}
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="inline-flex items-center border border-border rounded-md">
                              <button
                                onClick={() => cart.updateQty(item.productId, item.qty - 1)}
                                className="w-7 h-7 flex items-center justify-center hover:bg-surface"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-8 text-center text-xs font-medium">
                                {item.qty}
                              </span>
                              <button
                                onClick={() => cart.updateQty(item.productId, item.qty + 1)}
                                className="w-7 h-7 flex items-center justify-center hover:bg-surface"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <button
                              onClick={() => cart.removeItem(item.productId)}
                              className="text-text-faint hover:text-destructive p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {item.source === "b2b" &&
                            ((item.minQty ?? 1) > 1 || (item.qtyMultiple ?? 1) > 1) && (
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {(item.minQty ?? 1) > 1 && <>Mín. {item.minQty} un</>}
                                {(item.minQty ?? 1) > 1 && (item.qtyMultiple ?? 1) > 1 && " · "}
                                {(item.qtyMultiple ?? 1) > 1 && <>Múltiplo de {item.qtyMultiple}</>}
                              </p>
                            )}
                          {invalid && (
                            <div className="mt-1.5 flex items-start gap-1 text-[11px] text-destructive">
                              <AlertCircle className="w-3 h-3 mt-px shrink-0" />
                              <span>{(v as { ok: false; reason: string }).reason}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-border p-5 space-y-3 bg-card">
                  {eligibleBundles.length > 0 && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800">
                        <Package className="w-3.5 h-3.5" />
                        Kits e combos detectados
                      </div>
                      {eligibleBundles.map((b) => (
                        <div
                          key={b.bundle_id}
                          className="flex items-center justify-between text-[11px] text-emerald-800"
                        >
                          <span className="truncate pr-2">{b.bundle_name}</span>
                          <span className="font-semibold whitespace-nowrap">
                            −{formatBRL(b.estimated_discount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span
                      className={
                        bundleSavings > 0
                          ? "text-xs text-muted-foreground line-through"
                          : "font-display font-bold text-lg text-foreground"
                      }
                    >
                      {formatBRL(subtotal)}
                    </span>
                  </div>
                  {bundleSavings > 0 && (
                    <>
                      <div className="flex items-center justify-between text-sm text-emerald-700">
                        <span>Desconto de kit (estimado)</span>
                        <span className="font-medium">−{formatBRL(bundleSavings)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal com kit</span>
                        <span className="font-display font-bold text-lg text-primary">
                          {formatBRL(subtotalWithBundles)}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        O desconto é confirmado no checkout pelo backend.
                      </p>
                    </>
                  )}
                  {hasB2bIssue && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>
                        Ajuste a quantidade dos itens em atacado para respeitar mínimo e múltiplo
                        antes de finalizar.
                      </span>
                    </div>
                  )}
                  {hasB2bIssue ? (
                    <Button className="w-full h-11" disabled>
                      Finalizar pedido
                    </Button>
                  ) : (
                    <Button asChild className="w-full h-11" onClick={cart.close}>
                      <Link to="/checkout">Finalizar pedido</Link>
                    </Button>
                  )}
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={cart.close}
                  >
                    <Link to="/carrinho">Ver carrinho completo</Link>
                  </Button>
                  {cart.hasB2bItems() ? (
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={cart.close}
                    >
                      <Link to="/atacado">Continuar comprando no atacado</Link>
                    </Button>
                  ) : (
                    <button
                      onClick={cart.close}
                      className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
                    >
                      Continuar comprando
                    </button>
                  )}
                </div>
              </>
            )}
          </aside>
        </>
      }
    </>
  );
}
