import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import {
  Sparkles,
  Truck,
  Shield,
  MessageSquareText,
  ArrowRight,
  Lightbulb,
  Zap,
  Cable,
  Plug,
  Sun,
  LayoutGrid,
  Wrench,
  Package,
  Tag,
  Flame,
  Star,
} from "lucide-react";
import { getLucideIcon } from "@/lib/iconMap";
import { StoreLayout } from "@/components/layout/StoreLayout";
import { ProductCard } from "@/components/store/ProductCard";
import { HeroCarousel, type HeroBanner } from "@/components/store/HeroCarousel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Product, Category } from "@/lib/domain";
import { FREE_SHIPPING_THRESHOLD, formatBRL } from "@/lib/domain";
import { imageUrlsFromProductImages } from "@/lib/productImages";
import { fetchHomepageSettings, isPromoBarVisible } from "@/lib/homepageContent";
import {
  fetchHomepageCards,
  fetchHomepageFeaturedCategories,
  fetchHomepageShowcasesPublic,
  fetchHomepageSections,
  DEFAULT_HOMEPAGE_SECTION_ORDER,
  type HomepageSection,
} from "@/lib/homepageBlocks";
import { HomepageShowcaseSection } from "@/components/store/HomepageShowcaseSection";
import { KitsCarousel } from "@/components/store/KitsCarousel";
import { NewsletterSignup } from "@/components/store/NewsletterSignup";
import logoHero from "@/assets/logo-hero.webp";
import { optimizeBannerUrl } from "@/lib/bannerImages";
import { fetchHomeBanners } from "@/server/homepage.functions";

import { buildSeo } from "@/lib/seo";

export const Route = createFileRoute("/")({
  loader: async () => {
    try {
      const banners = await fetchHomeBanners();
      return { banners: banners as HeroBanner[] };
    } catch {
      return { banners: [] as HeroBanner[] };
    }
  },
  head: ({ loaderData }) => {
    const seo = buildSeo({
      title: "Material Elétrico e Iluminação LED em Maricá/RJ",
      description:
        "Lâmpadas LED, disjuntores, cabos, refletores e tomadas com entrega rápida. Atendimento com IA 24h. Frete grátis acima de R$199.",
      url: "/",
    });
    // Preload the first banner's mobile image for LCP
    const firstBanner = loaderData?.banners?.[0];
    const preloadLinks: Array<Record<string, string>> = [];
    if (firstBanner) {
      const mobileSrc = optimizeBannerUrl(
        firstBanner.image_mobile ?? firstBanner.image_desktop,
        { width: 720, quality: 72 },
      );
      if (mobileSrc) {
        preloadLinks.push({
          rel: "preload",
          as: "image",
          href: mobileSrc,
          type: "image/webp",
          fetchPriority: "high",
          media: "(max-width: 640px)",
        } as any);
      }
      const tabletSrc = optimizeBannerUrl(firstBanner.image_desktop, { width: 1024, quality: 75 });
      if (tabletSrc) {
        preloadLinks.push({
          rel: "preload",
          as: "image",
          href: tabletSrc,
          type: "image/webp",
          fetchPriority: "high",
          media: "(min-width: 641px) and (max-width: 1024px)",
        } as any);
      }
      const desktopSrc = optimizeBannerUrl(firstBanner.image_desktop, { width: 1280, quality: 75 });
      if (desktopSrc) {
        preloadLinks.push({
          rel: "preload",
          as: "image",
          href: desktopSrc,
          type: "image/webp",
          fetchPriority: "high",
          media: "(min-width: 1025px)",
        } as any);
      }
    }
    return {
      ...seo,
      links: [...(seo.links ?? []), ...preloadLinks],
    };
  },
  component: HomePage,
});

const ICONS: Record<string, any> = {
  Lightbulb,
  Zap,
  Cable,
  Plug,
  Sun,
  LayoutGrid,
  Wrench,
  Package,
};


function isExternalLink(url?: string | null) {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

const PRODUCT_LIST_COLS =
  "id, name, slug, price, sale_price, images, brand, tags, stock_qty, featured, category_id, product_images(url_thumb, url_card, original_url, is_primary, sort_order)";

function normalizeProductImages<T extends { images?: string[] | null; product_images?: any[] }>(
  product: T,
) {
  return { ...product, images: imageUrlsFromProductImages(product.product_images, product.images) };
}

function HomePage() {
  const queryClient = useQueryClient();
  const { banners: ssrBanners } = Route.useLoaderData();

  // Seed React Query cache with SSR banners
  useEffect(() => {
    if (ssrBanners && ssrBanners.length > 0) {
      queryClient.setQueryData(["home-banners"], ssrBanners);
    }
  }, [ssrBanners, queryClient]);

  const { data: homepage } = useQuery({
    queryKey: ["homepage_settings"],
    staleTime: 1000 * 60 * 5,
    queryFn: fetchHomepageSettings,
  });

  // Use SSR banners as initialData so no flash
  const { data: banners } = useQuery({
    queryKey: ["home-banners"],
    staleTime: 1000 * 60 * 5,
    initialData: ssrBanners.length > 0 ? ssrBanners : undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("home_banners")
        .select(
          "id, title, subtitle, description, image_desktop, image_mobile, cta_label, cta_link, badge, bg_color, text_color, title_color",
        )
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HeroBanner[];
    },
  });

  // ---- Below-fold queries: deferred until after first paint ----
  const [belowFoldReady, setBelowFoldReady] = useState(false);
  useEffect(() => {
    const hasRic = typeof window !== "undefined" && typeof window.requestIdleCallback === "function";
    if (hasRic) {
      const id = window.requestIdleCallback(() => setBelowFoldReady(true), { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(() => setBelowFoldReady(true), 800);
    return () => clearTimeout(t);
  }, []);

  const { data: featured } = useQuery({
    queryKey: ["products", "featured"],
    staleTime: 1000 * 60 * 10,
    enabled: belowFoldReady,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_LIST_COLS)
        .eq("active", true)
        .is("parent_product_id", null)
        .eq("featured", true)
        .limit(8);
      if (error) throw error;
      return (data ?? []).map((p: any) => normalizeProductImages(p)) as Product[];
    },
  });

  const { data: deals } = useQuery({
    queryKey: ["products", "deals"],
    staleTime: 1000 * 60 * 10,
    enabled: belowFoldReady,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_LIST_COLS)
        .eq("active", true)
        .is("parent_product_id", null)
        .gt("stock_qty", 0)
        .not("sale_price", "is", null)
        .order("updated_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? [])
        .filter((p: any) => p.sale_price != null && p.sale_price < p.price)
        .map((p: any) => normalizeProductImages(p)) as Product[];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    staleTime: 1000 * 60 * 60,
    enabled: belowFoldReady,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, icon, sort_order")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data as Category[];
    },
  });

  const { data: benefitCards } = useQuery({
    queryKey: ["homepage-cards", "benefit"],
    staleTime: 1000 * 60 * 5,
    enabled: belowFoldReady,
    queryFn: () => fetchHomepageCards("benefit"),
  });

  const { data: promoCards } = useQuery({
    queryKey: ["homepage-cards", "promo"],
    staleTime: 1000 * 60 * 5,
    enabled: belowFoldReady,
    queryFn: () => fetchHomepageCards("promo"),
  });

  const { data: featuredCategories } = useQuery({
    queryKey: ["homepage-featured-categories"],
    staleTime: 1000 * 60 * 5,
    enabled: belowFoldReady,
    queryFn: fetchHomepageFeaturedCategories,
  });

  const { data: showcases } = useQuery({
    queryKey: ["homepage-showcases"],
    staleTime: 1000 * 60 * 5,
    enabled: belowFoldReady,
    queryFn: fetchHomepageShowcasesPublic,
  });

  const { data: sectionsConfig } = useQuery({
    queryKey: ["homepage_sections", "public"],
    staleTime: 1000 * 60 * 5,
    queryFn: fetchHomepageSections,
  });

  const validShowcases = (showcases ?? []).filter((s) => (s.items?.length ?? 0) > 0);
  const offersShowcase = validShowcases.find((s) => s.showcase_type === "offers");
  const featuredShowcase = validShowcases.find((s) => s.showcase_type === "featured");
  const otherShowcases = validShowcases.filter(
    (s) => s.showcase_type !== "offers" && s.showcase_type !== "featured",
  );
  // Prefetch do catálogo (adiado até idle para não competir com LCP)
  useEffect(() => {
    if (!belowFoldReady) return;
    const run = () => {
      queryClient.prefetchQuery({
        queryKey: ["products", "catalog", undefined, undefined, 1],
        staleTime: 1000 * 60 * 10,
        queryFn: async () => {
          const { data, count } = await supabase
            .from("products")
            .select(PRODUCT_LIST_COLS, { count: "exact" })
            .eq("active", true)
            .is("parent_product_id", null)
            .order("featured", { ascending: false })
            .order("created_at", { ascending: false })
            .range(0, 23);
          return {
            products: (data ?? []).map((p: any) => normalizeProductImages(p)) as Product[],
            total: count ?? 0,
          };
        },
      });
    };
    const ric = (window as any).requestIdleCallback as
      | undefined
      | ((cb: () => void, opts?: { timeout: number }) => number);
    const cic = (window as any).cancelIdleCallback as undefined | ((id: number) => void);
    if (ric) {
      const id = ric(run, { timeout: 3000 });
      return () => cic && cic(id);
    }
    const t = window.setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, [queryClient, belowFoldReady]);

  type PromoCardItem = {
    key: string;
    icon: any;
    title: string;
    desc: string;
    tone: string;
    to?: string;
    searchParams?: Record<string, any>;
    href?: string;
    newTab?: boolean;
    onClick?: () => void;
  };

  const PROMO_CARDS_FALLBACK: PromoCardItem[] = [
    {
      key: "fb-ofertas",
      icon: Flame,
      title: "Ofertas da semana",
      desc: "Descontos imperdíveis",
      to: "/catalogo",
      searchParams: { oferta: true },
      tone: "from-orange-500 to-red-500",
    },
    {
      key: "fb-destaques",
      icon: Star,
      title: "Destaques da loja",
      desc: "O que está bombando",
      to: "/catalogo",
      searchParams: { sort: "best_sellers" },
      tone: "from-amber-400 to-yellow-500",
    },
    {
      key: "fb-frete",
      icon: Truck,
      title: "Frete grátis",
      desc: `Acima de ${formatBRL(FREE_SHIPPING_THRESHOLD)}`,
      to: "/catalogo",
      searchParams: { shipping: "free" },
      tone: "from-emerald-500 to-teal-500",
    },
    {
      key: "fb-ia",
      icon: Sparkles,
      title: "Atendimento IA 24h",
      desc: "Tire dúvidas técnicas",
      tone: "from-violet-500 to-indigo-500",
      onClick: () => {
        if (typeof window !== "undefined") window.dispatchEvent(new Event("open-chat"));
      },
    },
  ];

  const PROMO_TONES = [
    "from-orange-500 to-red-500",
    "from-amber-400 to-yellow-500",
    "from-emerald-500 to-teal-500",
    "from-violet-500 to-indigo-500",
    "from-sky-500 to-blue-500",
    "from-pink-500 to-rose-500",
  ];

  const promoCardsToRender: PromoCardItem[] =
    promoCards && promoCards.length > 0
      ? promoCards.map((c, i) => {
          const Icon = getLucideIcon(c.icon, Sparkles);
          const link = (c.link_url ?? "").trim();
          const isChat = link === "#chat";
          const ext = isExternalLink(link);
          return {
            key: c.id,
            icon: Icon,
            title: c.title,
            desc: c.description ?? "",
            tone: c.visual_variant?.trim() || PROMO_TONES[i % PROMO_TONES.length],
            to: !isChat && !ext && link ? link : undefined,
            href: !isChat && ext ? link : undefined,
            newTab: ext,
            onClick: isChat
              ? () => {
                  if (typeof window !== "undefined") window.dispatchEvent(new Event("open-chat"));
                }
              : undefined,
          };
        })
      : PROMO_CARDS_FALLBACK;

  type BenefitCardItem = {
    key: string;
    icon: any;
    title: string;
    desc: string;
    href?: string;
    to?: string;
    newTab?: boolean;
  };
  const BENEFITS_FALLBACK: BenefitCardItem[] = [
    {
      key: "fb-ia",
      icon: Sparkles,
      title: "IA 24h",
      desc: "Atendimento inteligente sempre disponível",
    },
    {
      key: "fb-truck",
      icon: Truck,
      title: "Entrega Rápida",
      desc: "Logística otimizada via Melhor Envio",
    },
    { key: "fb-nf", icon: Shield, title: "NF Garantida", desc: "Nota fiscal em todos os pedidos" },
  ];
  const benefitsToRender: BenefitCardItem[] =
    benefitCards && benefitCards.length > 0
      ? benefitCards.map((c) => {
          const link = (c.link_url ?? "").trim();
          const ext = isExternalLink(link);
          return {
            key: c.id,
            icon: getLucideIcon(c.icon, Sparkles),
            title: c.title,
            desc: c.description ?? "",
            to: !ext && link ? link : undefined,
            href: ext ? link : undefined,
            newTab: ext,
          };
        })
      : BENEFITS_FALLBACK;

  type FeaturedCategoryItem = {
    key: string;
    slug: string;
    name: string;
    icon: any;
    imageUrl?: string | null;
  };
  const featuredCategoriesToRender: FeaturedCategoryItem[] =
    featuredCategories && featuredCategories.length > 0
      ? featuredCategories
          .filter((fc) => fc.category && fc.category.active !== false)
          .map((fc) => ({
            key: fc.id,
            slug: fc.category!.slug,
            name: fc.custom_title?.trim() || fc.category!.name,
            icon: getLucideIcon(fc.icon ?? fc.category!.icon, Package),
            imageUrl: fc.custom_image_url ?? null,
          }))
      : (categories ?? []).map((c) => ({
          key: c.id,
          slug: c.slug,
          name: c.name,
          icon: ICONS[c.icon ?? "Package"] ?? Package,
          imageUrl: null,
        }));

  // ---- Renderizadores por section_key ----

  const renderHero = () => (
    <div key="hero">
      {/* CARROSSEL HERO PRINCIPAL */}
      {banners && banners.length > 0 ? (
        <HeroCarousel banners={banners} />
      ) : (
        <div className="w-full h-[260px] xs:h-[300px] sm:h-[380px] md:h-[440px] lg:h-[480px] bg-muted animate-pulse" aria-hidden="true" />
      )}

      {/* HERO INSTITUCIONAL (administrável via /admin/conteudo/homepage) */}
      {(homepage?.hero_is_active ?? true) &&
        (() => {
          const HeroBadgeIcon = getLucideIcon(homepage?.hero_badge_icon, Sparkles);
          const PrimaryIcon = getLucideIcon(homepage?.hero_primary_button_icon, ArrowRight);
          const SecondaryIcon = getLucideIcon(
            homepage?.hero_secondary_button_icon,
            MessageSquareText,
          );
          const heroTitle = homepage?.hero_title ?? "Material elétrico e iluminação";
          const heroHighlight = homepage?.hero_highlight_text ?? "com qualidade que ilumina.";
          const heroDesc =
            homepage?.hero_description ??
            "Lâmpadas LED, disjuntores, fios, refletores e tudo que seu projeto precisa.";
          const heroSub =
            homepage?.hero_subdescription ?? "Nota fiscal garantida e suporte técnico de verdade.";
          const heroBadge =
            homepage?.hero_badge_text ??
            "Atendimento com IA 24h · Entrega rápida em Maricá e região";
          const logoSrc = homepage?.hero_logo_url || logoHero;
          const logoAlt = homepage?.hero_logo_alt || "Led Maricá";
          const primaryActive = homepage?.hero_primary_button_active ?? true;
          const secondaryActive = homepage?.hero_secondary_button_active ?? true;
          const primaryUrl = homepage?.hero_primary_button_url ?? "/catalogo";
          const secondaryUrl = homepage?.hero_secondary_button_url ?? "#chat";
          const primaryText = homepage?.hero_primary_button_text ?? "Ver catálogo";
          const secondaryText = homepage?.hero_secondary_button_text ?? "Falar com IA";

          const renderPrimary = () => {
            if (!primaryActive) return null;
            if (primaryUrl === "#chat") {
              return (
                <Button
                  size="lg"
                  className="h-11 px-6 font-semibold"
                  onClick={() => {
                    if (typeof window !== "undefined") window.dispatchEvent(new Event("open-chat"));
                  }}
                >
                  {primaryText} <PrimaryIcon className="w-4 h-4 ml-1.5" />
                </Button>
              );
            }
            if (isExternalLink(primaryUrl)) {
              return (
                <Button asChild size="lg" className="h-11 px-6 font-semibold">
                  <a
                    href={primaryUrl}
                    target={homepage?.hero_primary_button_new_tab ? "_blank" : undefined}
                    rel="noreferrer"
                  >
                    {primaryText} <PrimaryIcon className="w-4 h-4 ml-1.5" />
                  </a>
                </Button>
              );
            }
            return (
              <Button asChild size="lg" className="h-11 px-6 font-semibold">
                <Link to={primaryUrl as any}>
                  {primaryText} <PrimaryIcon className="w-4 h-4 ml-1.5" />
                </Link>
              </Button>
            );
          };

          const renderSecondary = () => {
            if (!secondaryActive) return null;
            const cls =
              "h-11 px-6 border-primary/30 text-primary hover:bg-primary-tint hover:text-primary font-semibold";
            if (secondaryUrl === "#chat") {
              return (
                <Button
                  size="lg"
                  variant="outline"
                  className={cls}
                  onClick={() => {
                    if (typeof window !== "undefined") window.dispatchEvent(new Event("open-chat"));
                  }}
                >
                  <SecondaryIcon className="w-4 h-4 mr-1.5" /> {secondaryText}
                </Button>
              );
            }
            if (isExternalLink(secondaryUrl)) {
              return (
                <Button asChild size="lg" variant="outline" className={cls}>
                  <a
                    href={secondaryUrl}
                    target={homepage?.hero_secondary_button_new_tab ? "_blank" : undefined}
                    rel="noreferrer"
                  >
                    <SecondaryIcon className="w-4 h-4 mr-1.5" /> {secondaryText}
                  </a>
                </Button>
              );
            }
            return (
              <Button asChild size="lg" variant="outline" className={cls}>
                <Link to={secondaryUrl as any}>
                  <SecondaryIcon className="w-4 h-4 mr-1.5" /> {secondaryText}
                </Link>
              </Button>
            );
          };

          return (
            <section className="relative overflow-hidden bg-card border-y border-border">
              <div className="container mx-auto px-4 py-6 md:py-8 relative">
                <div className="max-w-3xl mx-auto text-center">
                  <img
                    src={logoSrc}
                    alt={logoAlt}
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    width={240}
                    height={88}
                    className="w-full max-w-[200px] md:max-w-[240px] h-auto mx-auto mb-3"
                  />
                  {heroBadge && (
                    <div className="inline-flex items-center gap-2 bg-primary-tint text-primary px-3 py-1 rounded-full text-xs font-medium mb-3">
                      <HeroBadgeIcon className="w-3.5 h-3.5" /> {heroBadge}
                    </div>
                  )}
                  <h1 className="font-display font-extrabold text-xl md:text-3xl leading-tight mb-2 tracking-tight text-foreground">
                    {heroTitle}
                    {heroHighlight && (
                      <>
                        <br />
                        <span className="text-primary">{heroHighlight}</span>
                      </>
                    )}
                  </h1>
                  {(heroDesc || heroSub) && (
                    <p className="text-sm md:text-base text-muted-foreground mb-4 max-w-xl mx-auto leading-relaxed">
                      {heroDesc}
                      {heroSub ? ` ${heroSub}` : ""}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 justify-center">
                    {renderPrimary()}
                    {renderSecondary()}
                  </div>
                </div>
              </div>
            </section>
          );
        })()}
    </div>
  );

  const renderPromoBar = () => {
    if (!isPromoBarVisible(homepage)) return null;
    const bg = homepage?.promo_bar_background_color;
    const fg = homepage?.promo_bar_text_color;
    const style: React.CSSProperties = {};
    if (bg) style.background = bg;
    if (fg) style.color = fg;
    const promoIconValue = homepage?.promo_bar_icon;
    const PromoIcon = getLucideIcon(promoIconValue, null);
    const inner = (
      <span className="inline-flex items-center justify-center gap-1.5">
        {PromoIcon ? (
          <PromoIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
        ) : promoIconValue ? (
          <span className="leading-none" aria-hidden="true">
            {promoIconValue}
          </span>
        ) : null}
        <strong className="font-semibold">{homepage?.promo_bar_text}</strong>
      </span>
    );
    const baseCls = "py-3 text-center text-sm font-medium";
    const themeCls = bg || fg ? "" : "bg-accent text-accent-foreground";
    let body: React.ReactNode;
    if (homepage?.promo_bar_url) {
      const ext = isExternalLink(homepage.promo_bar_url);
      body = ext ? (
        <a
          href={homepage.promo_bar_url}
          className={`${baseCls} ${themeCls} block hover:opacity-90`}
          style={style}
        >
          {inner}
        </a>
      ) : (
        <Link
          to={homepage.promo_bar_url as any}
          className={`${baseCls} ${themeCls} block hover:opacity-90`}
          style={style}
        >
          {inner}
        </Link>
      );
    } else {
      body = (
        <div className={`${baseCls} ${themeCls}`} style={style}>
          {inner}
        </div>
      );
    }
    return (
      <div key="promo_bar" className="border-b border-border">
        {body}
      </div>
    );
  };

  const renderPromoCards = () => (
    <section key="promo_cards" className="container mx-auto px-4 py-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {promoCardsToRender.map((c) => {
          const inner = (
            <>
              <div
                className={`absolute inset-0 opacity-10 group-hover:opacity-20 bg-gradient-to-br ${c.tone} transition-opacity`}
              />
              <div className="relative">
                <div
                  className={`w-9 h-9 rounded-lg bg-gradient-to-br ${c.tone} flex items-center justify-center mb-3 shadow-md`}
                >
                  <c.icon className="w-4 h-4 text-white" />
                </div>
                <div className="font-display font-semibold text-sm leading-tight">{c.title}</div>
                {c.desc && <div className="text-xs text-muted-foreground mt-0.5">{c.desc}</div>}
              </div>
            </>
          );
          const cls =
            "group relative overflow-hidden rounded-xl bg-card border border-border p-4 hover:shadow-elevated transition-all hover:-translate-y-0.5 text-left";
          if (c.onClick) {
            return (
              <button key={c.key} type="button" onClick={c.onClick} className={cls}>
                {inner}
              </button>
            );
          }
          if (c.href) {
            return (
              <a
                key={c.key}
                href={c.href}
                target={c.newTab ? "_blank" : undefined}
                rel={c.newTab ? "noopener noreferrer" : undefined}
                className={cls}
              >
                {inner}
              </a>
            );
          }
          if (c.to) {
            return (
              <Link
                key={c.key}
                to={c.to as any}
                search={(c.searchParams ?? {}) as any}
                className={cls}
              >
                {inner}
              </Link>
            );
          }
          return (
            <div key={c.key} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );

  const renderBenefits = () => (
    <section key="benefits_cards" className="container mx-auto px-4 py-10" aria-label="Benefícios">
      <h2 className="sr-only">Benefícios</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {benefitsToRender.map((d) => {
          const inner = (
            <>
              <div className="w-12 h-12 rounded-lg bg-primary-tint flex items-center justify-center shrink-0">
                <d.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-base mb-0.5">{d.title}</h3>
                {d.desc && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{d.desc}</p>
                )}
              </div>
            </>
          );
          const cls =
            "bg-card border border-border rounded-xl p-5 flex items-center gap-4 shadow-soft";
          if (d.href) {
            return (
              <a
                key={d.key}
                href={d.href}
                target={d.newTab ? "_blank" : undefined}
                rel={d.newTab ? "noopener noreferrer" : undefined}
                className={`${cls} hover:border-primary transition-colors`}
              >
                {inner}
              </a>
            );
          }
          if (d.to) {
            return (
              <Link
                key={d.key}
                to={d.to as any}
                className={`${cls} hover:border-primary transition-colors`}
              >
                {inner}
              </Link>
            );
          }
          return (
            <div key={d.key} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );

  const renderOffersShowcase = () => {
    if (offersShowcase)
      return <HomepageShowcaseSection key="offers_showcase" showcase={offersShowcase} />;
    if (!deals || deals.length === 0) return null;
    return (
      <section key="offers_showcase" className="container mx-auto px-4 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 text-accent-foreground mb-2">
              <Tag className="w-3.5 h-3.5 text-accent" />
              <span className="label-meta !text-accent">Promoção</span>
            </div>
            <h2 className="font-display font-bold text-2xl tracking-tight">Ofertas da semana</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Produtos com desconto direto no preço
            </p>
          </div>
          <Link
            to="/catalogo"
            className="text-sm text-primary hover:underline font-medium hidden sm:inline-flex items-center gap-1"
          >
            Ver todos <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {deals.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      </section>
    );
  };

  const renderFeaturedCategories = () => (
    <section key="featured_categories" className="container mx-auto px-4 py-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="label-meta mb-2">Categorias</div>
          <h2 className="font-display font-bold text-2xl tracking-tight">
            Encontre por departamento
          </h2>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {featuredCategoriesToRender.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.key}
              to="/catalogo"
              search={{ cat: c.slug } as any}
              className="group flex flex-col items-center text-center p-5 bg-card border border-border rounded-xl hover:border-primary hover:shadow-elevated transition-all"
            >
              {c.imageUrl ? (
                <img
                  src={c.imageUrl}
                  alt={c.name}
                  width={48}
                  height={48}
                  loading="lazy"
                  decoding="async"
                  className="w-12 h-12 rounded-full object-cover mb-3"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary-tint flex items-center justify-center mb-3 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Icon className="w-5 h-5 text-primary group-hover:text-primary-foreground" />
                </div>
              )}
              <div className="text-xs font-medium leading-tight">{c.name}</div>
            </Link>
          );
        })}
      </div>
    </section>
  );

  const renderDynamicShowcases = () => {
    if (otherShowcases.length === 0) return null;
    return (
      <div key="dynamic_showcases">
        {otherShowcases.map((s) => (
          <HomepageShowcaseSection key={s.id} showcase={s} />
        ))}
      </div>
    );
  };

  const renderFeaturedShowcase = () => {
    if (featuredShowcase)
      return <HomepageShowcaseSection key="featured_showcase" showcase={featuredShowcase} />;
    if (!featured || featured.length === 0) return null;
    return (
      <section key="featured_showcase" className="container mx-auto px-4 py-12">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="label-meta mb-2">Mais procurados</div>
            <h2 className="font-display font-bold text-2xl tracking-tight">Produtos em destaque</h2>
          </div>
          <Link
            to="/catalogo"
            className="text-sm text-primary hover:underline font-medium hidden sm:inline-flex items-center gap-1"
          >
            Ver tudo <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {featured.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      </section>
    );
  };

  const renderMainCta = (compact = false) => {
    if (!(homepage?.main_cta_is_active ?? true)) return null;
    const CtaIcon = getLucideIcon(homepage?.main_cta_icon, Sparkles);
    const title = homepage?.main_cta_title ?? "A loja certa para o seu projeto";
    const desc =
      homepage?.main_cta_description ??
      "Nota fiscal garantida, suporte técnico de verdade, atendimento com IA 24h e entrega rápida em Maricá e região.";
    const btnActive = homepage?.main_cta_button_active ?? true;
    const btnText = homepage?.main_cta_button_text ?? "Ver catálogo completo";
    const btnUrl = homepage?.main_cta_button_url ?? "/catalogo";
    const bg = homepage?.main_cta_background_color;
    const fg = homepage?.main_cta_text_color;
    const bgImage = homepage?.main_cta_image_url;
    const containerStyle: React.CSSProperties = {};
    if (bgImage) {
      containerStyle.backgroundImage = `linear-gradient(135deg, rgba(0,0,0,0.55), rgba(0,0,0,0.35)), url(${bgImage})`;
      containerStyle.backgroundSize = "cover";
      containerStyle.backgroundPosition = "center";
    } else if (bg) {
      containerStyle.background = bg;
    }
    if (fg) containerStyle.color = fg;
    const pad = compact ? "p-6 md:p-8" : "p-8 md:p-12";
    const baseCls =
      bg || bgImage
        ? `rounded-2xl text-primary-foreground ${pad} text-center shadow-elevated`
        : `rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground ${pad} text-center shadow-elevated`;

    const renderBtn = () => {
      if (!btnActive) return null;
      const btnStyle: React.CSSProperties = {};
      if (homepage?.main_cta_button_color) btnStyle.background = homepage.main_cta_button_color;
      if (isExternalLink(btnUrl)) {
        return (
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="h-12 px-6 font-semibold"
            style={btnStyle}
          >
            <a href={btnUrl} rel="noreferrer">
              {btnText} <ArrowRight className="w-4 h-4 ml-1.5" />
            </a>
          </Button>
        );
      }
      return (
        <Button
          asChild
          size="lg"
          variant="secondary"
          className="h-12 px-6 font-semibold"
          style={btnStyle}
        >
          <Link to={btnUrl as any}>
            {btnText} <ArrowRight className="w-4 h-4 ml-1.5" />
          </Link>
        </Button>
      );
    };

    const card = (
      <div className={baseCls} style={containerStyle}>
        <CtaIcon className="w-8 h-8 mx-auto mb-3 opacity-90" />
        <h3 className={`font-display font-bold ${compact ? "text-xl md:text-2xl" : "text-2xl md:text-3xl"} mb-3`}>
          {title}
        </h3>
        {desc && (
          <p className="text-sm md:text-base opacity-90 max-w-xl mx-auto mb-6 leading-relaxed">
            {desc}
          </p>
        )}
        {renderBtn()}
      </div>
    );
    if (compact) return card;
    return (
      <section key="main_cta" className="container mx-auto px-4 pb-12">
        {card}
      </section>
    );
  };

  const SECTION_RENDERERS: Record<string, () => React.ReactNode> = {
    promo_bar: renderPromoBar,
    hero: renderHero,
    benefits_cards: renderBenefits,
    promo_cards: renderPromoCards,
    featured_categories: renderFeaturedCategories,
    offers_showcase: renderOffersShowcase,
    featured_showcase: renderFeaturedShowcase,
    dynamic_showcases: renderDynamicShowcases,
    combos_showcase: () => (
      <KitsCarousel
        key="combos_showcase"
        title="Kits e Combos em destaque"
        subtitle="Soluções prontas para economizar e facilitar sua instalação."
        mode="retail"
        limit={6}
      />
    ),
    institutional_block: () => null,
    main_cta: renderMainCta,
    newsletter_signup: () => <NewsletterSignup key="newsletter_signup" />,
  };

  // Fallback se a tabela falhar/voltar vazia: usa a ordem padrão hardcoded.
  const effectiveSections: Array<
    Pick<HomepageSection, "section_key" | "is_active" | "sort_order">
  > =
    sectionsConfig && sectionsConfig.length > 0
      ? sectionsConfig
      : DEFAULT_HOMEPAGE_SECTION_ORDER.map((d) => ({
          section_key: d.section_key,
          is_active: d.is_active,
          sort_order: d.sort_order,
        }));

  const orderedSections = effectiveSections
    .filter((s) => s.is_active && SECTION_RENDERERS[s.section_key])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  const renderedNodes: React.ReactNode[] = [];
  for (let i = 0; i < orderedSections.length; i++) {
    const s = orderedSections[i];
    const next = orderedSections[i + 1];
    if (s.section_key === "main_cta" && next?.section_key === "newsletter_signup") {
      renderedNodes.push(
        <section key="main_cta_newsletter_combo" className="container mx-auto px-4 pb-12">
          <div className="grid md:grid-cols-2 gap-4 md:gap-6">
            {renderMainCta(true)}
            <NewsletterSignup compact />
          </div>
        </section>,
      );
      i++;
      continue;
    }
    const node = SECTION_RENDERERS[s.section_key]();
    if (!node) continue;
    renderedNodes.push(<React.Fragment key={s.section_key}>{node}</React.Fragment>);
  }

  return <StoreLayout>{renderedNodes}</StoreLayout>;
}
