import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ShoppingBag, BadgePercent, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getCartComplementary } from "@/server/productRelations.functions";
import { useCart } from "@/stores/cartStore";
import { formatBRL } from "@/lib/domain";
import { cartSnapshot, trackAddedSince } from "@/lib/cartTracking";

export function CartUpsell() {
  const cart = useCart();
  const productIds = cart.items.map((i) => i.productId);
  const cartKey = productIds.slice().sort().join(",");

  const { data, isLoading } = useQuery({
    queryKey: ["cart-complementary", cartKey],
    queryFn: () =>
      getCartComplementary({
        data: { productIds, limit: 6 },
      }),
    enabled: productIds.length > 0,
    staleTime: 30_000,
  });

  if (productIds.length === 0 || isLoading || !data) return null;

  const inCart = new Set(productIds);
  const items = data.filter((p) => !inCart.has(p.product_id) && p.applied_price > 0).slice(0, 6);
  if (items.length === 0) return null;

  return (
    <section className="mt-8 bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold text-lg">Leve também</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Sugestões que combinam com o que você está comprando.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {items.map((p) => {
          const isB2b = p.pricing_source === "b2b";
          const retail = p.sale_price ?? p.retail_price;
          const showStrike = isB2b && retail > p.applied_price;
          const outOfStock = p.stock_qty <= 0;
          return (
            <div
              key={p.product_id}
              className="bg-background border border-border rounded-lg overflow-hidden flex flex-col hover:border-primary/40 transition"
            >
              <Link
                to="/produto/$slug"
                params={{ slug: p.slug }}
                className="block aspect-square bg-surface relative"
              >
                {p.image ? (
                  <img
                    src={p.image}
                    alt={p.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text-faint">
                    <ShoppingBag className="w-7 h-7" />
                  </div>
                )}
                {isB2b && (
                  <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 rounded-full bg-success text-success-foreground text-[9px] font-semibold px-1.5 py-0.5">
                    <BadgePercent className="w-2.5 h-2.5" /> Empresa
                  </span>
                )}
              </Link>
              <div className="p-2 flex-1 flex flex-col gap-1.5">
                <Link
                  to="/produto/$slug"
                  params={{ slug: p.slug }}
                  className="text-xs font-medium leading-tight line-clamp-2 hover:text-primary"
                >
                  {p.name}
                </Link>
                <div className="mt-auto">
                  <div className="flex items-baseline gap-1 flex-wrap">
                    <span className="font-display font-bold text-primary text-sm">
                      {formatBRL(p.applied_price)}
                    </span>
                    {showStrike && (
                      <span className="text-[10px] text-text-faint line-through">
                        {formatBRL(retail)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (outOfStock) return;
                    const snap = cartSnapshot([p.product_id]);
                    cart.addItem({
                      productId: p.product_id,
                      name: p.name,
                      slug: p.slug,
                      price: p.applied_price,
                      image: p.image,
                      stock: p.stock_qty,
                      freeShippingEligible: p.free_shipping_eligible,
                    });
                    trackAddedSince(snap, [
                      { productId: p.product_id, name: p.name, unitPrice: p.applied_price },
                    ]);
                    toast.success("Adicionado ao carrinho");
                  }}
                  disabled={outOfStock}
                  className="mt-1 h-8 rounded-pill bg-accent text-accent-foreground text-[11px] font-semibold inline-flex items-center justify-center gap-1 hover:brightness-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3 h-3" />
                  {outOfStock ? "Indisponível" : "Adicionar"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
