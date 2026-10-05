import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ShoppingCart, AlertCircle, CheckCircle2, PackagePlus, Building2, Sparkles, Tag } from "lucide-react";
import { toast } from "sonner";
import { StoreLayout } from "@/components/layout/StoreLayout";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/domain";
import { useCart } from "@/stores/cartStore";
import { cartSnapshot, trackAddedSince, type CartAdditionInput } from "@/lib/cartTracking";
import {
  getPublicBundleBySlug,
  type BundleAvailability,
  type BundleItemPublic,
  type BundlePublic,
} from "@/server/productBundles.functions";
import { KIT_TYPE_BADGES } from "@/lib/kitPricing";

export const Route = createFileRoute("/combo/$slug")({
  component: ComboDetailPage,
  head: ({ params }) => ({
    meta: [
      { title: `Combo ${params.slug} — Led Maricá` },
      { name: "description", content: "Combo de produtos selecionados pela Led Maricá." },
    ],
  }),
});

const TONE: Record<BundleAvailability, string> = {
  available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  partial: "bg-amber-50 text-amber-700 border-amber-200",
  unavailable: "bg-red-50 text-red-700 border-red-200",
  needs_review: "bg-muted text-muted-foreground border-border",
};

const LABEL: Record<BundleAvailability, string> = {
  available: "Disponível",
  partial: "Parcialmente disponível",
  unavailable: "Indisponível",
  needs_review: "Em revisão",
};

function ComboDetailPage() {
  const { slug } = Route.useParams();
  const addItem = useCart((s) => s.addItem);
  const open = useCart((s) => s.open);
  const [adding, setAdding] = useState(false);

  const q = useQuery({
    queryKey: ["public-bundle", slug],
    queryFn: () => getPublicBundleBySlug({ data: { slug } }),
    staleTime: 30_000,
  });

  if (q.isLoading) {
    return (
      <StoreLayout>
        <div className="container max-w-5xl py-10 px-4 text-sm text-muted-foreground">
          Carregando…
        </div>
      </StoreLayout>
    );
  }

  const bundle = q.data;
  if (!bundle) {
    return (
      <StoreLayout>
        <div className="container max-w-5xl py-16 px-4 text-center space-y-4">
          <h1 className="font-display text-2xl font-bold">Combo não encontrado</h1>
          <p className="text-sm text-muted-foreground">
            Esse kit pode ter sido desativado ou removido.
          </p>
          <Link to="/combos">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" /> Ver combos disponíveis
            </Button>
          </Link>
        </div>
      </StoreLayout>
    );
  }

  const canAddSomething = bundle.items.some(
    (i) => i.status === "ok" || i.status === "no_stock", // permite tentar; loja decide via stock
  );

  function handleAddAll() {
    setAdding(true);
    let added = 0;
    let skipped = 0;
    // Um único AddToCart com os itens do combo que de fato entraram no carrinho.
    const tracked: CartAdditionInput[] = bundle!.items.map((it) => ({
      productId: it.product.id,
      name: it.product.name,
      unitPrice: it.product.final_price,
    }));
    const snap = cartSnapshot(tracked.map((t) => t.productId));
    for (const it of bundle!.items) {
      if (it.status === "inactive" || it.status === "no_price") {
        skipped++;
        continue;
      }
      if (it.product.stock_qty <= 0) {
        skipped++;
        continue;
      }
      const qty = Math.min(it.quantity, it.product.stock_qty);
      addItem(
        {
          productId: it.product.id,
          name: it.product.name,
          slug: it.product.slug,
          price: it.product.final_price,
          image: it.product.image,
          stock: it.product.stock_qty,
          freeShippingEligible: it.product.free_shipping_eligible,
          source: "b2c",
        },
        qty,
        { openDrawer: false },
      );
      added++;
    }
    setAdding(false);
    trackAddedSince(snap, tracked);
    if (added > 0 && skipped === 0) {
      toast.success("Itens adicionados ao carrinho");
      open();
    } else if (added > 0 && skipped > 0) {
      toast.warning(`Adicionados ${added} item(ns). ${skipped} indisponível(is) foram ignorados.`);
      open();
    } else {
      toast.error("Nenhum item disponível para adicionar.");
    }
  }

  return (
    <StoreLayout>
      <div className="container max-w-5xl py-8 px-4">
        <Link
          to="/combos"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-3 h-3" /> Todos os combos
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-4">
            <ComboGallery
              images={
                bundle.images && bundle.images.length > 0
                  ? bundle.images.map((i) => i.url)
                  : bundle.image_url
                    ? [bundle.image_url]
                    : []
              }
              alt={bundle.name}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <KitTypeBadge bundle={bundle} />
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${TONE[bundle.availability]}`}
              >
                {bundle.availability === "available" ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <AlertCircle className="w-3 h-3" />
                )}
                {LABEL[bundle.availability]}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {bundle.items_count} {bundle.items_count === 1 ? "item" : "itens"} ·{" "}
                {bundle.total_units} {bundle.total_units === 1 ? "unidade" : "unidades"}
              </span>
            </div>
            <h1 className="font-display text-3xl font-bold">{bundle.name}</h1>
            {bundle.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {bundle.description}
              </p>
            )}

            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {bundle.items.map((it) => (
                <ItemRow key={it.id} item={it} />
              ))}
            </div>
          </div>

          {/* Aside: subtotal + CTA */}
          <aside className="bg-card border border-border rounded-xl p-5 h-fit lg:sticky lg:top-20 space-y-3">
            <KitPricingPanel bundle={bundle} />
            <Button
              className="w-full gap-2"
              size="lg"
              onClick={handleAddAll}
              disabled={!canAddSomething || adding || bundle.availability === "unavailable"}
            >
              <ShoppingCart className="w-4 h-4" />
              Adicionar itens ao carrinho
            </Button>
            {bundle.availability === "unavailable" && (
              <p className="text-[11px] text-red-700">
                Combo indisponível no momento. Volte em breve.
              </p>
            )}
          </aside>
        </div>
      </div>
    </StoreLayout>
  );
}

function ItemRow({ item }: { item: BundleItemPublic }) {
  const lineSubtotal = item.product.final_price * item.quantity;
  const broken = item.status !== "ok";
  return (
    <div className="flex items-center gap-3 p-3">
      <Link
        to="/produto/$slug"
        params={{ slug: item.product.slug }}
        className="w-16 h-16 rounded bg-surface overflow-hidden flex-shrink-0"
      >
        {item.product.image && (
          <img
            src={item.product.image}
            alt={item.product.name}
            className="w-full h-full object-cover"
          />
        )}
      </Link>
      <div className="flex-1 min-w-0">
        <Link
          to="/produto/$slug"
          params={{ slug: item.product.slug }}
          className="text-sm font-medium hover:text-primary truncate block"
        >
          {item.product.name}
        </Link>
        <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
          <span>Qtd: {item.quantity}</span>
          <span>· {formatBRL(item.product.final_price)} cada</span>
          {broken && (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <AlertCircle className="w-3 h-3" />
              {item.status === "inactive" && "item inativo"}
              {item.status === "no_price" && "sem preço"}
              {item.status === "no_stock" && "sem estoque"}
            </span>
          )}
        </div>
      </div>
      <div className="text-sm font-display font-semibold">{formatBRL(lineSubtotal)}</div>
    </div>
  );
}

function ComboGallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  if (images.length === 0) {
    return (
      <div className="aspect-[16/9] bg-surface rounded-xl overflow-hidden border border-border flex items-center justify-center">
        <PackagePlus className="w-12 h-12 text-muted-foreground/50" />
      </div>
    );
  }
  const current = images[Math.min(active, images.length - 1)];
  return (
    <div className="space-y-2">
      <div className="aspect-[16/9] bg-surface rounded-xl overflow-hidden border border-border">
        <img src={current} alt={alt} className="w-full h-full object-cover" />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((url, i) => (
            <button
              key={url + i}
              type="button"
              onClick={() => setActive(i)}
              className={`flex-shrink-0 w-20 h-16 rounded-md overflow-hidden bg-surface border-2 ${
                i === active ? "border-accent" : "border-border hover:border-accent/60"
              }`}
              aria-label={`Ver imagem ${i + 1}`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function KitTypeBadge({ bundle }: { bundle: BundlePublic }) {
  const t = bundle.kit.kit_type;
  const isB2bSource = bundle.pricing.source === "b2b";
  const label = isB2bSource ? "Preço empresa" : KIT_TYPE_BADGES[t];
  const tone = isB2bSource
    ? "bg-blue-50 text-blue-700 border-blue-200"
    : t === "promocional"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : t === "b2b"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-emerald-50 text-emerald-700 border-emerald-200";
  const Icon = isB2bSource || t === "b2b" ? Building2 : t === "promocional" ? Tag : Sparkles;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${tone}`}
    >
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
}

function KitPricingPanel({ bundle }: { bundle: BundlePublic }) {
  const p = bundle.pricing;
  const showStrike = p.savings > 0 && p.appliedPrice < p.retailSum;
  const minQty = bundle.kit.b2b_min_quantity ?? 1;
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground uppercase tracking-wider">
        {p.source === "b2b" ? "Preço empresa" : "Preço do kit"}
      </div>
      {showStrike && (
        <div className="text-sm text-muted-foreground line-through">{formatBRL(p.retailSum)}</div>
      )}
      <div className="font-display text-2xl font-bold text-primary">
        {formatBRL(p.appliedPrice)}
      </div>
      {p.savings > 0 && (
        <div className="text-xs text-emerald-700 font-medium">
          Economia de {formatBRL(p.savings)}
        </div>
      )}
      {p.unitApprox != null && (
        <div className="text-[11px] text-muted-foreground">
          ≈ {formatBRL(p.unitApprox)} por unidade ({p.totalUnits} un)
        </div>
      )}
      {p.source === "b2b" && minQty > 1 && (
        <div className="text-[11px] text-blue-700">
          Quantidade mínima para preço empresa: {minQty} kit(s).
        </div>
      )}
      {p.blocked === "not_available_retail" && (
        <p className="text-[11px] text-amber-700">
          Este kit é exclusivo para empresas aprovadas.
        </p>
      )}
      <p className="text-[11px] text-muted-foreground pt-1">
        Os preços por item são aplicados no carrinho. O preço empresa, quando aplicável, é
        recalculado pelo backend para clientes empresariais aprovados.
      </p>
    </div>
  );
}
