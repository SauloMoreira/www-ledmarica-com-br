import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ShoppingCart, Truck, Shield, ChevronRight, Check, Zap } from "lucide-react";
import { toast } from "sonner";
import { StoreLayout } from "@/components/layout/StoreLayout";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/lib/domain";
import { formatBRL } from "@/lib/domain";
import { useCart } from "@/stores/cartStore";
import { buildSeo, SITE_URL, clamp } from "@/lib/seo";
import { trackViewProduct, trackAddToCart } from "@/lib/tracking";
import { ProductGallery } from "@/components/store/ProductGallery";
import { pickUrl, type ProductImageRow } from "@/lib/productImages";
import { RelatedProductsBlock } from "@/components/store/RelatedProductsBlock";
import { BuyTogetherBlock } from "@/components/store/BuyTogetherBlock";
import { ProductInBundlesBlock } from "@/components/store/ProductInBundlesBlock";
import { ProductSpecsBlock } from "@/components/store/ProductSpecsBlock";
import { ProductReviews } from "@/components/store/ProductReviews";
import { ProductVariantSelector } from "@/components/store/ProductVariantSelector";

type FaqItem = { question: string; answer: string };
type ProductWithSeo = Product & {
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string | null;
  specs?: Record<string, unknown> | null;
};

function extractFaq(specs: Record<string, unknown> | null | undefined): FaqItem[] {
  const raw =
    specs && typeof specs === "object" ? (specs as Record<string, unknown>).seo_faq : null;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (x): x is FaqItem =>
        !!x &&
        typeof x === "object" &&
        typeof (x as FaqItem).question === "string" &&
        typeof (x as FaqItem).answer === "string",
    )
    .slice(0, 6);
}

function buildProductJsonLd(
  p: ProductWithSeo,
  finalPrice: number,
  baseDesc: string,
  allImageUrls: string[],
) {
  const parentId = (p as { parent_product_id?: string | null }).parent_product_id ?? null;
  const variantAttrs = (p as { variant_attributes?: Record<string, string> | null })
    .variant_attributes;
  const isVariantOf = parentId
    ? {
        isVariantOf: {
          "@type": "ProductGroup",
          productGroupID: parentId,
          ...(variantAttrs && Object.keys(variantAttrs).some((k) => k.toLowerCase() === "cor")
            ? { variesBy: ["https://schema.org/color"] }
            : {}),
        },
      }
    : {};
  return {
    ...isVariantOf,
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: baseDesc,
    sku: p.sku ?? undefined,
    mpn: p.ncm ?? undefined,
    brand: { "@type": "Brand", name: p.brand || "Led Maricá" },
    image: allImageUrls,
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/produto/${p.slug}`,
      priceCurrency: "BRL",
      price: finalPrice,
      priceValidUntil: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
      availability:
        p.stock_qty > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "Led Maricá" },
    },
  };
}

function buildFaqJsonLd(faq: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

function buildBreadcrumbJsonLd(p: ProductWithSeo) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Início", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Catálogo", item: `${SITE_URL}/catalogo` },
      { "@type": "ListItem", position: 3, name: p.name, item: `${SITE_URL}/produto/${p.slug}` },
    ],
  };
}

const productQueryOptions = (slug: string) => ({
  queryKey: ["product", slug],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("products")
      .select(
        // Colunas sensíveis (cost_price, b2b_price, fiscal_*, stock_min_alert, stock_alert_enabled etc.)
        // não são retornadas ao público — a leitura das mesmas foi restrita via GRANT no banco.
        "id, name, slug, description, specs, price, sale_price, stock_qty, sku, ncm, brand, weight_kg, height_cm, width_cm, length_cm, category_id, images, tags, active, featured, created_at, updated_at, seo_title, seo_description, seo_keywords, free_shipping_eligible, b2b_enabled, b2b_show_in_vitrine, b2b_commercial_note, allow_out_of_stock_sales, avg_rating, review_count, parent_product_id, variant_attributes",
      )
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    const { data: imgs } = await supabase
      .from("product_images")
      .select("*")
      .eq("product_id", (data as { id: string }).id)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true });
    return { ...(data as unknown as ProductWithSeo), product_images: (imgs ?? []) as ProductImageRow[] };
  },
});

export const Route = createFileRoute("/produto/$slug")({
  loader: async ({ params, context }) => {
    const product = await context.queryClient.ensureQueryData(productQueryOptions(params.slug));
    return { product };
  },
  head: ({ loaderData }) => {
    const p = loaderData?.product;
    if (!p) return buildSeo({ title: "Produto", url: "/catalogo" });
    const finalPrice = p.sale_price ?? p.price;
    const baseDesc =
      p.description?.trim() ||
      `${p.name} — disponível na Led Maricá com entrega rápida em Maricá/RJ. Frete grátis acima de R$199.`;
    const description = clamp(p.seo_description || baseDesc, 160);
    const rawTitle = p.seo_title || `${p.name}${p.brand ? " — " + p.brand : ""}`;
    const title = clamp(rawTitle, 47);
    const productImages = p.product_images ?? [];
    const allImageUrls = productImages.length
      ? productImages
          .map((i) => pickUrl(i, "full") ?? i.original_url)
          .filter((u): u is string => !!u)
      : (p.images ?? []);
    const ogPrimary = productImages.find((i) => i.is_primary) ?? productImages[0];
    const image = ogPrimary
      ? (pickUrl(ogPrimary, "og") ?? ogPrimary.original_url)
      : allImageUrls[0];

    const seo = buildSeo({
      title,
      description,
      url: `/produto/${p.slug}`,
      image: image ?? undefined,
      type: "product",
      product: {
        price: finalPrice,
        availability: p.stock_qty > 0 ? "InStock" : "OutOfStock",
        sku: p.sku,
        brand: p.brand,
      },
    });

    if (p.seo_keywords) seo.meta.push({ name: "keywords", content: p.seo_keywords });

    const productJsonLd = JSON.stringify(buildProductJsonLd(p, finalPrice, baseDesc, allImageUrls));

    const faq = extractFaq(p.specs);
    const scripts: Array<{ type: string; children: string }> = [
      { type: "application/ld+json", children: productJsonLd },
      { type: "application/ld+json", children: JSON.stringify(buildBreadcrumbJsonLd(p)) },
    ];
    if (faq.length > 0) {
      scripts.push({
        type: "application/ld+json",
        children: JSON.stringify(buildFaqJsonLd(faq)),
      });
    }

    return { meta: seo.meta, links: seo.links, scripts };
  },
  component: ProductPage,
  notFoundComponent: () => (
    <StoreLayout>
      <div className="container mx-auto px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold mb-2">Produto não encontrado</h1>
        <Link to="/catalogo" className="text-primary hover:underline">
          Voltar ao catálogo
        </Link>
      </div>
    </StoreLayout>
  ),
});


function ProductPage() {
  const { slug } = Route.useParams();
  const cart = useCart();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);

  const { data: product, isLoading } = useQuery(productQueryOptions(slug));

  useEffect(() => {
    if (product) trackViewProduct(product);
  }, [product]);

  if (isLoading) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-12">
          <div className="h-96 bg-surface animate-pulse rounded-xl" />
        </div>
      </StoreLayout>
    );
  }
  if (!product) return null;

  const finalPrice = product.sale_price ?? product.price;
  const hasDiscount = product.sale_price != null && product.sale_price < product.price;
  const discountPct = hasDiscount
    ? Math.round(((product.price - finalPrice) / product.price) * 100)
    : 0;
  const productImages =
    (product as ProductWithSeo & { product_images?: ProductImageRow[] }).product_images ?? [];
  const cartImage = productImages[0]
    ? (pickUrl(productImages[0], "thumb") ?? productImages[0].original_url)
    : (product.images[0] ?? null);
  const maxQty = Math.min(10, Math.max(1, product.stock_qty));

  const addToCart = (then?: "checkout") => {
    cart.addItem(
      {
        productId: product.id,
        name: product.name,
        slug: product.slug,
        price: finalPrice,
        image: cartImage,
        stock: product.stock_qty,
        freeShippingEligible: !!(product as any).free_shipping_eligible,
      },
      qty,
    );
    trackAddToCart(product, qty);
    if (then === "checkout") {
      navigate({ to: "/checkout" });
    } else {
      toast.success("Adicionado ao carrinho");
    }
  };

  const stockState =
    product.stock_qty > 10
      ? { label: "Em estoque", tone: "text-success" }
      : product.stock_qty > 0
        ? { label: `Apenas ${product.stock_qty} em estoque`, tone: "text-accent" }
        : { label: "Produto indisponível", tone: "text-destructive" };

  return (
    <StoreLayout>
      <div className="container mx-auto px-4 py-6">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6">
          <Link to="/" className="hover:text-foreground">
            Início
          </Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/catalogo" className="hover:text-foreground">
            Catálogo
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground line-clamp-1">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,520px)_360px] xl:grid-cols-[minmax(0,520px)_400px] gap-6 lg:gap-8">
          {/* COLUNA ESQUERDA: GALERIA */}
          <div>
            <ProductGallery images={productImages} productName={product.name} />

            {product.description && (
              <section className="mt-10 max-w-2xl">
                <h2 className="font-display font-semibold text-lg mb-3">Sobre este produto</h2>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {product.description}
                </p>
              </section>
            )}

            <ProductSpecsBlock productId={product.id} />
            <ProductReviews
              productId={product.id}
              avgRating={Number((product as any).avg_rating ?? 0)}
              reviewCount={Number((product as any).review_count ?? 0)}
            />
          </div>

          {/* COLUNA DIREITA: PAINEL DE COMPRA (sticky) */}
          <aside className="lg:sticky lg:top-6 lg:self-start space-y-4">
            <div>
              {product.brand && <div className="label-meta mb-1.5">{product.brand}</div>}
              <h1 className="font-display font-bold text-2xl tracking-tight mb-2 leading-tight">
                {product.name}
              </h1>
            </div>

            <div className="border-t border-border" />

            <div>
              {hasDiscount && (
                <div className="text-xs text-muted-foreground mb-0.5">
                  Preço: <span className="line-through">{formatBRL(product.price)}</span>
                  <span className="ml-2 text-destructive font-semibold">-{discountPct}%</span>
                </div>
              )}
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[15px] text-destructive font-medium">R$</span>
                <span className="font-display font-extrabold text-foreground text-3xl sm:text-4xl leading-none break-all">
                  {finalPrice.toFixed(2).replace(".", ",")}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                ou em até{" "}
                <strong className="text-foreground">12x de {formatBRL(finalPrice / 12)}</strong> sem
                juros no cartão
              </div>
            </div>

            <div className={`text-base font-semibold ${stockState.tone}`}>{stockState.label}</div>

            <div className="flex flex-wrap gap-1.5">
              {product.ncm && <span className="badge-tech">NCM {product.ncm}</span>}
              {product.sku && <span className="badge-tech">SKU {product.sku}</span>}
              <span className="text-[10px] uppercase tracking-wider bg-success-tint text-success border border-success/20 px-2 py-1 rounded font-medium">
                NF garantida
              </span>
              {product.free_shipping_eligible ? (
                <span className="text-[10px] uppercase tracking-wider bg-success-tint text-success border border-success/20 px-2 py-1 rounded font-medium">
                  Frete grátis acima de R$ 199
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-wider bg-primary-tint text-primary border border-primary-border px-2 py-1 rounded font-medium">
                  Entrega local Maricá
                </span>
              )}
              {product.tags.map((t) => (
                <span
                  key={t}
                  className="text-[10px] uppercase tracking-wider bg-surface text-muted-foreground border border-border px-2 py-1 rounded"
                >
                  {t}
                </span>
              ))}
            </div>

            <ProductVariantSelector
              productId={product.id}
              currentSlug={product.slug}
              onChange={() => setQty(1)}
            />

            {product.stock_qty > 0 && (
              <div className="flex items-center gap-2.5">
                <label htmlFor="qty-select" className="text-sm text-muted-foreground">
                  Qtd:
                </label>
                <select
                  id="qty-select"
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  {Array.from({ length: maxQty }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  {product.stock_qty} disponíveis
                </span>
              </div>
            )}

            <div className="space-y-2.5">
              <button
                onClick={() => addToCart()}
                disabled={product.stock_qty === 0}
                className="w-full h-11 rounded-pill bg-accent text-accent-foreground font-semibold text-sm shadow-soft hover:brightness-95 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                <ShoppingCart className="w-4 h-4" />
                {product.stock_qty === 0 ? "Esgotado" : "Adicionar ao carrinho"}
              </button>
              <button
                onClick={() => addToCart("checkout")}
                disabled={product.stock_qty === 0}
                className="w-full h-11 rounded-pill bg-[oklch(0.72_0.18_50)] text-white font-semibold text-sm shadow-soft hover:brightness-95 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" />
                Comprar agora
              </button>
            </div>

            <div className="bg-card border border-border rounded-lg p-3 space-y-2">
              {(product as any).free_shipping_eligible ? (
                <div className="flex items-start gap-2.5 text-xs">
                  <Truck className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">
                    <strong className="text-foreground">Frete grátis</strong> em pedidos acima de R$
                    199,00 (produto participante)
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 text-xs">
                  <Truck className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">
                    Este produto não participa da campanha de frete grátis.
                  </span>
                </div>
              )}
              <div className="flex items-start gap-2.5 text-xs">
                <Shield className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-muted-foreground">
                  <strong className="text-foreground">NF garantida</strong> em todos os pedidos
                </span>
              </div>
              <div className="flex items-start gap-2.5 text-xs">
                <Check className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                <span className="text-muted-foreground">
                  Vendido e entregue por <strong className="text-foreground">Led Maricá</strong>
                </span>
              </div>
            </div>
            <BuyTogetherBlock product={product} />
          </aside>
        </div>

        {(() => {
          const faq = extractFaq(product.specs);
          if (faq.length === 0) return null;
          return (
            <section className="mt-12 max-w-3xl">
              <h2 className="font-display font-bold text-2xl mb-4">Perguntas frequentes</h2>
              <div className="divide-y divide-border border border-border rounded-xl bg-card">
                {faq.map((f, i) => (
                  <details key={i} className="group p-4">
                    <summary className="flex justify-between items-center cursor-pointer font-medium text-sm list-none">
                      <span>{f.question}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-90" />
                    </summary>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          );
        })()}

        <div className="mt-12">
          <ProductInBundlesBlock productId={product.id} />
        </div>

        <div className="mt-12">
          <RelatedProductsBlock
            productId={product.id}
            excludeProductIds={[product.id]}
            prioritizeReplacements={product.stock_qty <= 0}
          />
        </div>
      </div>
    </StoreLayout>
  );
}
