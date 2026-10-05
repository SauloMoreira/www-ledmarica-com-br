import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ShoppingBag, BadgePercent, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  getRelationsForProduct,
  type RelatedProduct,
  type RelationType,
} from "@/server/productRelations.functions";
import { useCart } from "@/stores/cartStore";
import { formatBRL } from "@/lib/domain";
import { cartSnapshot, trackAddedSince } from "@/lib/cartTracking";

type Props = {
  productId: string;
  /** Não sugerir esses produtos (ex.: itens já no carrinho ou o próprio produto) */
  excludeProductIds?: string[];
  /** Se true (loja pública), oculta `frequently_bought_together` (renderizado em bloco próprio
   *  perto do botão de compra) e `b2b_recommendation` (exclusivo da área B2B). */
  hideBuyTogether?: boolean;
  /** Se o produto principal está sem estoque, prioriza substitutos no topo. */
  prioritizeReplacements?: boolean;
  /** Limite total a buscar do servidor */
  limit?: number;
};

const SECTION_LABEL: Record<RelationType, { title: string; subtitle?: string }> = {
  frequently_bought_together: {
    title: "Aproveite e compre junto",
    subtitle: "Combinações populares com este produto",
  },
  accessory: {
    title: "Acessórios compatíveis",
    subtitle: "Itens úteis ou necessários para a instalação",
  },
  cross_sell: {
    title: "Complete sua instalação",
    subtitle: "Produtos que formam uma solução completa",
  },
  related: {
    title: "Produtos relacionados",
    subtitle: "Outras opções para você comparar",
  },
  replacement: {
    title: "Produtos similares",
    subtitle: "Alternativas equivalentes para esse item",
  },
  upsell: {
    title: "Você também pode levar",
    subtitle: "Itens que combinam com o que você está comprando",
  },
  b2b_recommendation: {
    title: "Recomendado para empresas",
    subtitle: "Sugestões para compras corporativas",
  },
};

const DEFAULT_PUBLIC_ORDER: RelationType[] = [
  "accessory",
  "cross_sell",
  "related",
  "replacement",
];

export function RelatedProductsBlock({
  productId,
  excludeProductIds = [],
  hideBuyTogether = true,
  prioritizeReplacements = false,
  limit = 24,
}: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["product-relations", productId, limit],
    queryFn: () => getRelationsForProduct({ data: { productId, limit } }),
    staleTime: 60_000,
  });

  if (isLoading || !data || data.length === 0) return null;

  const exclude = new Set(excludeProductIds);
  const filtered = data.filter(
    (r) =>
      !exclude.has(r.product_id) &&
      r.applied_price > 0 &&
      r.stock_qty > 0 &&
      // ocultos da página pública (renderizados em outros lugares)
      r.relation_type !== "b2b_recommendation" &&
      (!hideBuyTogether || r.relation_type !== "frequently_bought_together"),
  );
  if (filtered.length === 0) return null;

  // Dedupe por produto: mantém a primeira ocorrência seguindo a ordem das seções
  const order = prioritizeReplacements
    ? (["replacement", ...DEFAULT_PUBLIC_ORDER.filter((t) => t !== "replacement"), "upsell"] as RelationType[])
    : ([...DEFAULT_PUBLIC_ORDER, "upsell"] as RelationType[]);

  const seen = new Set<string>();
  const bySection = new Map<RelationType, RelatedProduct[]>();
  for (const t of order) {
    const items = filtered
      .filter((r) => r.relation_type === t)
      .sort((a, b) => a.sort_order - b.sort_order);
    const dedup = items.filter((p) => {
      if (seen.has(p.product_id)) return false;
      seen.add(p.product_id);
      return true;
    });
    if (dedup.length > 0) bySection.set(t, dedup);
  }

  if (bySection.size === 0) return null;

  return (
    <div className="space-y-10">
      {order
        .filter((t) => bySection.has(t))
        .map((t) => {
          const items = bySection.get(t)!.slice(0, 8);
          const label = SECTION_LABEL[t];
          return (
            <RelatedSection
              key={t}
              title={label.title}
              subtitle={label.subtitle}
              items={items}
            />
          );
        })}
    </div>
  );
}

function RelatedSection({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle?: string;
  items: RelatedProduct[];
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-3">
        <h2 className="font-display font-bold text-xl">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {items.map((p) => (
          <RelatedCard key={p.relation_id} item={p} />
        ))}
      </div>
    </section>
  );
}

function RelatedCard({ item }: { item: RelatedProduct }) {
  const cart = useCart();
  const isB2b = item.pricing_source === "b2b";
  const retail = item.sale_price ?? item.retail_price;
  const showStrike = isB2b && retail > item.applied_price;
  const outOfStock = item.stock_qty <= 0;

  const handleAdd = () => {
    if (outOfStock) return;
    const snap = cartSnapshot([item.product_id]);
    cart.addItem({
      productId: item.product_id,
      name: item.name,
      slug: item.slug,
      price: item.applied_price,
      image: item.image,
      stock: item.stock_qty,
      freeShippingEligible: item.free_shipping_eligible,
    });
    trackAddedSince(snap, [
      { productId: item.product_id, name: item.name, unitPrice: item.applied_price },
    ]);
    toast.success("Adicionado ao carrinho");
  };

  return (
    <div className="group bg-card border border-border rounded-xl overflow-hidden flex flex-col hover:border-primary/40 transition">
      <Link
        to="/produto/$slug"
        params={{ slug: item.slug }}
        className="block aspect-square bg-surface relative"
      >
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-faint">
            <ShoppingBag className="w-10 h-10" />
          </div>
        )}
        {isB2b && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-success text-success-foreground text-[10px] font-semibold px-2 py-0.5 shadow-sm">
            <BadgePercent className="w-3 h-3" /> Empresa
          </span>
        )}
      </Link>
      <div className="p-3 flex-1 flex flex-col gap-2">
        {item.brand && (
          <div className="text-[10px] uppercase tracking-wider text-text-faint">{item.brand}</div>
        )}
        <Link
          to="/produto/$slug"
          params={{ slug: item.slug }}
          className="text-sm font-medium leading-tight line-clamp-2 hover:text-primary"
        >
          {item.name}
        </Link>
        <div className="mt-auto">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="font-display font-bold text-primary text-base">
              {formatBRL(item.applied_price)}
            </span>
            {showStrike && (
              <span className="text-[11px] text-text-faint line-through">{formatBRL(retail)}</span>
            )}
          </div>
          {isB2b && item.b2b_min_quantity && item.b2b_min_quantity > 1 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              A partir de {item.b2b_min_quantity} un.
            </p>
          )}
        </div>
        <button
          onClick={handleAdd}
          disabled={outOfStock}
          className="mt-1 h-9 rounded-pill bg-accent text-accent-foreground text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:brightness-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" />
          {outOfStock ? "Indisponível" : "Adicionar"}
        </button>
      </div>
    </div>
  );
}
