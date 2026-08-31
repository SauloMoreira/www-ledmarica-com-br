import { Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import type { Product } from "@/lib/domain";
import { formatBRL } from "@/lib/domain";
import { useCart } from "@/stores/cartStore";
import { ProductImagePlaceholder } from "@/components/store/ProductImagePlaceholder";
import { responsiveSrcSet } from "@/lib/productImages";

export function ProductCard({
  product,
  index = 0,
  b2bApproved = false,
}: {
  product: Product;
  index?: number;
  b2bApproved?: boolean;
}) {
  const cart = useCart();

  const showB2bPrice =
    b2bApproved && !!product.b2b_enabled && product.b2b_price != null && product.b2b_price > 0;

  const retailFinal = product.sale_price ?? product.price;
  const finalPrice = showB2bPrice ? (product.b2b_price as number) : retailFinal;
  const hasDiscount =
    !showB2bPrice && product.sale_price != null && product.sale_price < product.price;

  const minQty = product.b2b_min_qty ?? 1;

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cart.addItem({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      price: finalPrice,
      image: product.images[0] ?? null,
      stock: product.stock_qty,
      freeShippingEligible: !!product.free_shipping_eligible,
    });
  };

  // Apenas a 1ª imagem ganha prioridade alta para não competir com o LCP do banner
  const isAboveFold = index === 0;
  return (
    <div>
      <Link
        to="/produto/$slug"
        params={{ slug: product.slug }}
        preload="intent"
        className="group block bg-card rounded-lg border border-border shadow-soft hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
      >
        <div className="aspect-square bg-surface relative overflow-hidden flex items-center justify-center">
          {product.images[0] ? (
            <img
              src={product.images[0]}
              srcSet={responsiveSrcSet(product.images[0]) ?? undefined}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"
              alt={product.name}
              width={400}
              height={400}
              loading={isAboveFold ? "eager" : "lazy"}
              fetchPriority={isAboveFold ? "high" : "auto"}
              decoding="async"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <ProductImagePlaceholder iconSize={56} />
          )}
          {product.featured && (
            <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider bg-accent text-accent-foreground px-2 py-1 rounded">
              Destaque
            </span>
          )}
          {hasDiscount && (
            <span className="absolute top-2 right-2 text-[10px] font-bold bg-destructive text-destructive-foreground px-2 py-1 rounded">
              −{Math.round(((product.price - finalPrice) / product.price) * 100)}%
            </span>
          )}
        </div>
        <div className="p-2.5 sm:p-4">
          {product.brand && (
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1 truncate">
              {product.brand}
            </div>
          )}
          <h3 className="text-xs sm:text-sm font-medium text-foreground line-clamp-2 leading-snug mb-2 sm:mb-3 min-h-[2.25rem] sm:min-h-[2.5rem] break-words">
            {product.name}
          </h3>
          <div className="flex items-end justify-between gap-1.5 sm:gap-2">
            <div className="min-w-0">
              {showB2bPrice ? (
                <>
                  <div className="text-[10px] sm:text-xs text-muted-foreground line-through leading-none mb-0.5 truncate">
                    {formatBRL(retailFinal)}
                  </div>
                  <div className="font-display font-extrabold text-primary text-base sm:text-lg leading-none truncate">
                    {formatBRL(finalPrice)}
                  </div>
                  <div className="text-[10px] text-success font-semibold mt-0.5">Preço empresa</div>
                </>
              ) : (
                <>
                  {hasDiscount && (
                    <div className="text-[10px] sm:text-xs text-muted-foreground line-through leading-none mb-0.5 truncate">
                      {formatBRL(product.price)}
                    </div>
                  )}
                  <div className="font-display font-extrabold text-primary text-base sm:text-lg leading-none truncate">
                    {formatBRL(finalPrice)}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={handleAdd}
              disabled={product.stock_qty === 0}
              className="w-9 h-9 rounded-md bg-primary text-primary-foreground hover:brightness-110 transition-all flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shadow-primary shrink-0"
              aria-label="Adicionar ao carrinho"
            >
              <ShoppingCart className="w-4 h-4" />
            </button>
          </div>
          {showB2bPrice && minQty > 1 && (
            <div className="text-[10px] text-muted-foreground mt-1">
              a partir de <span className="font-semibold text-foreground">{minQty} un</span>
            </div>
          )}
          {product.stock_qty <= 5 && product.stock_qty > 0 && (
            <div className="text-[10px] text-warning font-medium mt-2">
              ⚠ Últimas {product.stock_qty} unidades
            </div>
          )}
          {product.stock_qty === 0 && (
            <div className="text-[10px] text-destructive font-medium mt-2">Esgotado</div>
          )}
          {product.free_shipping_eligible && product.stock_qty > 0 && (
            <div className="text-[10px] text-success font-medium mt-2 leading-tight">
              🚚 Frete grátis acima de R$ 199,00
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
