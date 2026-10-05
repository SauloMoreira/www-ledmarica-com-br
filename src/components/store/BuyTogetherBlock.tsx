import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, ShoppingBag, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getRelationsForProduct } from "@/server/productRelations.functions";
import { useCart } from "@/stores/cartStore";
import { formatBRL } from "@/lib/domain";
import { cartSnapshot, trackAddedSince, type CartAdditionInput } from "@/lib/cartTracking";
import type { Product } from "@/lib/domain";

type Props = {
  product: Pick<Product, "id" | "name" | "slug" | "stock_qty" | "price" | "sale_price"> & {
    images?: string[] | null;
  };
};

/**
 * Bloco "Aproveite e compre junto": exibe sugestões `frequently_bought_together`
 * próximas ao painel de compra, com seleção por checkbox e botão "Adicionar tudo".
 */
export function BuyTogetherBlock({ product }: Props) {
  const cart = useCart();
  const { data, isLoading } = useQuery({
    queryKey: ["product-relations-fbt", product.id],
    queryFn: () => getRelationsForProduct({ data: { productId: product.id, limit: 6 } }),
    staleTime: 60_000,
  });

  const items = useMemo(
    () =>
      (data ?? [])
        .filter(
          (r) =>
            r.relation_type === "frequently_bought_together" &&
            r.product_id !== product.id &&
            r.applied_price > 0 &&
            r.stock_qty > 0,
        )
        .sort((a, b) => a.sort_order - b.sort_order)
        .slice(0, 3),
    [data, product.id],
  );

  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // Seleciona todos por padrão quando os itens chegam
  const initSelection = useMemo(() => {
    const map: Record<string, boolean> = {};
    items.forEach((i) => (map[i.product_id] = true));
    return map;
  }, [items]);

  const effectiveSelection = Object.keys(selected).length > 0 ? selected : initSelection;

  if (isLoading || items.length === 0) return null;

  const mainPrice = product.sale_price ?? product.price;
  const total =
    mainPrice +
    items
      .filter((i) => effectiveSelection[i.product_id])
      .reduce((acc, i) => acc + i.applied_price, 0);

  const mainImage = (product.images && product.images[0]) || null;

  const handleAddAll = () => {
    // Um único AddToCart com todos os itens do "compre junto".
    const tracked: CartAdditionInput[] = [];
    if (product.stock_qty > 0)
      tracked.push({ productId: product.id, name: product.name, unitPrice: mainPrice });
    items
      .filter((i) => effectiveSelection[i.product_id])
      .forEach((i) =>
        tracked.push({ productId: i.product_id, name: i.name, unitPrice: i.applied_price }),
      );
    const snap = cartSnapshot(tracked.map((t) => t.productId));
    if (product.stock_qty > 0) {
      cart.addItem(
        {
          productId: product.id,
          name: product.name,
          slug: product.slug,
          price: mainPrice,
          image: mainImage,
          stock: product.stock_qty,
          freeShippingEligible: false,
        },
        1,
        { openDrawer: false },
      );
    }
    items
      .filter((i) => effectiveSelection[i.product_id])
      .forEach((i) => {
        cart.addItem(
          {
            productId: i.product_id,
            name: i.name,
            slug: i.slug,
            price: i.applied_price,
            image: i.image,
            stock: i.stock_qty,
            freeShippingEligible: i.free_shipping_eligible,
          },
          1,
          { openDrawer: false },
        );
      });
    trackAddedSince(snap, tracked);
    cart.open();
    toast.success("Itens adicionados ao carrinho");
  };

  return (
    <section className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h2 className="font-display font-semibold text-base">Aproveite e compre junto</h2>
      </div>

      <div className="space-y-2">
        {/* produto principal (sempre incluído) */}
        <BuyTogetherRow
          image={mainImage}
          name={product.name}
          price={mainPrice}
          locked
          checked
        />
        {items.map((i) => (
          <BuyTogetherRow
            key={i.product_id}
            image={i.image}
            name={i.name}
            price={i.applied_price}
            slug={i.slug}
            checked={!!effectiveSelection[i.product_id]}
            onToggle={(v) =>
              setSelected((s) => ({
                ...(Object.keys(s).length > 0 ? s : initSelection),
                [i.product_id]: v,
              }))
            }
          />
        ))}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="text-xs text-muted-foreground">
          Total selecionado
          <div className="font-display font-bold text-foreground text-lg leading-none">
            {formatBRL(total)}
          </div>
        </div>
        <button
          onClick={handleAddAll}
          disabled={product.stock_qty <= 0}
          className="h-10 px-4 rounded-pill bg-accent text-accent-foreground text-xs font-semibold inline-flex items-center gap-1.5 hover:brightness-95 transition disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar tudo ao carrinho
        </button>
      </div>
    </section>
  );
}

function BuyTogetherRow({
  image,
  name,
  price,
  slug,
  checked,
  locked,
  onToggle,
}: {
  image: string | null;
  name: string;
  price: number;
  slug?: string;
  checked: boolean;
  locked?: boolean;
  onToggle?: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center gap-3 p-2 rounded-md ${
        locked ? "bg-primary-tint/40" : "hover:bg-surface cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={locked}
        onChange={(e) => onToggle?.(e.target.checked)}
        className="w-4 h-4 accent-primary"
      />
      <div className="w-12 h-12 rounded bg-surface flex-shrink-0 overflow-hidden">
        {image ? (
          <img src={image} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-faint">
            <ShoppingBag className="w-5 h-5" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {slug ? (
          <Link
            to="/produto/$slug"
            params={{ slug }}
            className="text-sm font-medium line-clamp-2 hover:text-primary"
          >
            {name}
          </Link>
        ) : (
          <span className="text-sm font-medium line-clamp-2">
            {name} <span className="text-[10px] text-muted-foreground">(este item)</span>
          </span>
        )}
        <div className="text-xs font-semibold text-primary">{formatBRL(price)}</div>
      </div>
    </label>
  );
}
