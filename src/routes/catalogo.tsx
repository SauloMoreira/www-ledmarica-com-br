import { createFileRoute } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  X,
  Truck,
  MessageCircle,
  Tag,
} from "lucide-react";
import { z } from "zod";
import { StoreLayout } from "@/components/layout/StoreLayout";
import { ProductCard } from "@/components/store/ProductCard";
import { ProductCardSkeleton } from "@/components/ui/shimmer";
import { KitsCarousel } from "@/components/store/KitsCarousel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Product, Category } from "@/lib/domain";
import { FREE_SHIPPING_THRESHOLD, formatBRL } from "@/lib/domain";
import { trackSearch } from "@/lib/tracking";
import { searchProducts, getCatalogAttributeFacets } from "@/server/productSearch.functions";
import { getPublicAttributeLabels } from "@/server/productAttributeLabels.functions";
import { buildLabelLookup } from "@/lib/attributeLabels";
import { getPublicCompanySettings } from "@/server/institutional.functions";
import {
  TECH_FILTERS,
  toAttrFilterPayload,
  parseFilterCsv,
  joinFilterCsv,
  type SelectedTechFilters,
  type TechFilterKey,
} from "@/lib/catalogTechFilters";

const PAGE_SIZE = 24;

const searchSchema = z.object({
  cat: z.string().optional(),
  q: z.string().optional(),
  sort: z
    .enum(["relevance", "featured", "price_asc", "price_desc", "newest", "best_sellers"])
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  oferta: z.coerce.boolean().optional(),
  shipping: z.enum(["free"]).optional(),
  marca: z.string().optional(),
  precoMin: z.coerce.number().min(0).optional(),
  precoMax: z.coerce.number().min(0).optional(),
  estoque: z.coerce.boolean().optional(),
  // Filtros técnicos (CSV de ids)
  pot: z.string().max(120).optional(),
  cor: z.string().max(120).optional(),
  volt: z.string().max(120).optional(),
  ip: z.string().max(120).optional(),
});

import { buildSeo, SITE_URL } from "@/lib/seo";

type CatalogSearch = z.infer<typeof searchSchema>;

/**
 * Opções da busca do catálogo compartilhadas entre o loader (SSR) e o
 * componente — a queryKey precisa ser idêntica para reaproveitar o cache
 * sem refetch no client. A lógica de busca em si não muda.
 */
function catalogSearchQueryOptions(search: CatalogSearch) {
  const page = search.page ?? 1;
  const sortValue = search.sort ?? (search.q ? "relevance" : "featured");
  const attrFilters = toAttrFilterPayload({
    power: parseFilterCsv(search.pot),
    color_temperature: parseFilterCsv(search.cor),
    voltage: parseFilterCsv(search.volt),
    ip_rating: parseFilterCsv(search.ip),
  });
  return {
    queryKey: [
      "products",
      "catalog-search",
      search.q ?? "",
      search.cat ?? "",
      search.marca ?? "",
      search.precoMin ?? null,
      search.precoMax ?? null,
      !!search.estoque,
      !!search.oferta,
      search.shipping ?? "",
      sortValue,
      page,
      // Filtros técnicos entram na chave para invalidar cache
      JSON.stringify(attrFilters),
    ],
    queryFn: async () =>
      await searchProducts({
        data: {
          q: search.q || undefined,
          categorySlug: search.cat || undefined,
          brand: search.marca || undefined,
          priceMin: search.precoMin,
          priceMax: search.precoMax,
          inStock: search.estoque || undefined,
          onSale: search.oferta || undefined,
          freeShipping: search.shipping === "free" || undefined,
          sort: sortValue,
          page,
          pageSize: PAGE_SIZE,
          source: "public_store" as const,
          attrFilters: attrFilters.length > 0 ? attrFilters : undefined,
        },
      }),
  };
}

export const Route = createFileRoute("/catalogo")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    try {
      const result = await context.queryClient.ensureQueryData(catalogSearchQueryOptions(deps));
      // Devolvemos o resultado inteiro para o cliente usar como initialData:
      // sem isso o HTML do SSR (com os produtos) é substituído pelo skeleton
      // na hidratação, causando layout shift.
      return {
        firstImage:
          (result?.products?.[0] as { images?: string[] } | undefined)?.images?.[0] ?? null,
        initialResult: result,
      };
    } catch {
      return { firstImage: null, initialResult: null };
    }
  },
  head: ({ loaderData }) => {
    const seo = buildSeo({
      title: "Catálogo de Produtos — Material Elétrico e LED",
      description:
        "Explore nosso catálogo completo de material elétrico e iluminação LED. Filtros por categoria, preço e marca. Entrega para todo o Brasil.",
      url: "/catalogo",
    });
    const first = loaderData?.firstImage;
    if (first) {
      (seo.links as Array<Record<string, string>>).push({
        rel: "preload",
        as: "image",
        href: first,
        fetchPriority: "high",
      });
    }
    return seo;
  },
  component: CatalogPage,
});

function onlyDigits(s: string | null | undefined) {
  return (s ?? "").replace(/\D+/g, "");
}

function CatalogPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [q, setQ] = useState(search.q ?? "");
  const [priceMin, setPriceMin] = useState(search.precoMin?.toString() ?? "");
  const [priceMax, setPriceMax] = useState(search.precoMax?.toString() ?? "");
  const page = search.page ?? 1;

  // Sincroniza inputs locais quando os search params mudam por outras vias
  useEffect(() => {
    setQ(search.q ?? "");
  }, [search.q]);
  useEffect(() => {
    setPriceMin(search.precoMin?.toString() ?? "");
  }, [search.precoMin]);
  useEffect(() => {
    setPriceMax(search.precoMax?.toString() ?? "");
  }, [search.precoMax]);

  const [filtersOpen, setFiltersOpen] = useState(false);



  const { data: categories } = useQuery({
    queryKey: ["categories"],
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, slug, icon, sort_order")
        .eq("active", true)
        .order("sort_order");
      return (data ?? []) as Category[];
    },
  });

  const { data: brandsData } = useQuery({
    queryKey: ["catalog-brands"],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const data = await fetchAllRows<{ brand: string | null }>((from, to) =>
        supabase
          .from("products")
          .select("brand")
          .eq("active", true)
          .not("brand", "is", null)
          .range(from, to),
      );
      const set = new Set<string>();
      data.forEach((r) => {
        const b = (r.brand ?? "").trim();
        if (b) set.add(b);
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
    },
  });

  const { data: companyData } = useQuery({
    queryKey: ["public-company-settings"],
    staleTime: 1000 * 60 * 30,
    queryFn: () => getPublicCompanySettings(),
  });
  const supportWhats = onlyDigits(companyData?.company?.support_whatsapp);

  const sortValue = search.sort ?? (search.q ? "relevance" : "featured");

  // Filtros técnicos selecionados (parsed da URL)
  const selectedTech: SelectedTechFilters = useMemo(
    () => ({
      power: parseFilterCsv(search.pot),
      color_temperature: parseFilterCsv(search.cor),
      voltage: parseFilterCsv(search.volt),
      ip_rating: parseFilterCsv(search.ip),
    }),
    [search.pot, search.cor, search.volt, search.ip],
  );

  const techCount =
    (selectedTech.power?.length ?? 0) +
    (selectedTech.color_temperature?.length ?? 0) +
    (selectedTech.voltage?.length ?? 0) +
    (selectedTech.ip_rating?.length ?? 0);

  const attrFilters = useMemo(() => toAttrFilterPayload(selectedTech), [selectedTech]);

  // Rótulos amigáveis cadastrados pelo admin (cache 10min)
  const { data: techLabels } = useQuery({
    queryKey: ["public-attribute-labels", "catalog-tech"],
    staleTime: 1000 * 60 * 10,
    queryFn: () =>
      getPublicAttributeLabels({
        data: { attributeKeys: ["color_temperature", "voltage", "ip_rating", "power"] },
      }),
  });
  const labelLookup = useMemo(() => buildLabelLookup(techLabels ?? []), [techLabels]);

  /** Aplica rótulo amigável ao texto da opção do filtro técnico, quando existir. */
  function decorateOptionLabel(
    defKey: TechFilterKey,
    opt: { id: string; label: string; values?: string[] },
  ): string {
    if (!opt.values || opt.values.length === 0) return opt.label;
    for (const v of opt.values) {
      const f = labelLookup.find(defKey, v);
      if (f) return f.display_label;
    }
    return opt.label;
  }

  // Facets disponíveis para o contexto atual (categoria)
  const { data: facetsData } = useQuery({
    queryKey: ["catalog-facets", search.cat ?? ""],
    staleTime: 1000 * 60 * 5,
    queryFn: () => getCatalogAttributeFacets({ data: { categorySlug: search.cat || undefined } }),
  });
  const facetsByKey = useMemo(() => {
    const m = new Map<string, Set<string>>();
    (facetsData?.facets ?? []).forEach((g) => {
      m.set(g.key, new Set(g.values.map((v) => v.value.toLowerCase())));
    });
    return m;
  }, [facetsData]);

  const { initialResult } = Route.useLoaderData();

  const { data, isLoading, isFetching } = useQuery({
    ...catalogSearchQueryOptions(search),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    ...(initialResult ? { initialData: initialResult, initialDataUpdatedAt: Date.now() } : {}),
  });

  const products = (data?.products ?? []) as Product[];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goPage = (p: number) => navigate({ search: (s: any) => ({ ...s, page: p }) as any });

  const submitSearch = () => {
    if (q) trackSearch(q);
    navigate({ search: (s: any) => ({ ...s, q: q || undefined, page: 1 }) as any });
  };

  const applyPrice = () => {
    const min = priceMin ? Number(priceMin) : undefined;
    const max = priceMax ? Number(priceMax) : undefined;
    navigate({ search: (s: any) => ({ ...s, precoMin: min, precoMax: max, page: 1 }) as any });
  };

  const pageTitle = search.q
    ? `Resultados para "${search.q}"`
    : search.oferta
      ? "Ofertas da semana"
      : search.shipping === "free"
        ? "Produtos elegíveis a frete grátis"
        : sortValue === "best_sellers"
          ? "Destaques da loja"
          : search.cat
            ? (categories?.find((c) => c.slug === search.cat)?.name ?? "Produtos")
            : "Todos os produtos";

  const pageSubtitle = search.oferta
    ? "Produtos com desconto ativo"
    : sortValue === "best_sellers"
      ? "Os produtos mais procurados pelos nossos clientes."
      : null;

  const hasActiveFilters = !!(
    search.cat ||
    search.oferta ||
    search.shipping ||
    search.sort ||
    search.q ||
    search.marca ||
    search.precoMin != null ||
    search.precoMax != null ||
    search.estoque ||
    techCount > 0
  );

  const clearFilters = () => navigate({ search: {} as any });

  const techKeyToCsv: Record<TechFilterKey, "pot" | "cor" | "volt" | "ip"> = {
    power: "pot",
    color_temperature: "cor",
    voltage: "volt",
    ip_rating: "ip",
  };

  const toggleTechId = (key: TechFilterKey, id: string) => {
    const current = (selectedTech[key] ?? []).slice();
    const idx = current.indexOf(id);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(id);
    navigate({
      search: (s: any) => ({ ...s, [techKeyToCsv[key]]: joinFilterCsv(current), page: 1 }) as any,
    });
  };

  const clearTechKey = (key: TechFilterKey) => {
    navigate({ search: (s: any) => ({ ...s, [techKeyToCsv[key]]: undefined, page: 1 }) as any });
  };

  return (
    <StoreLayout>
      <div className="bg-card border-b border-border">
        <div className="container mx-auto px-4 py-6 sm:py-8">
          <div className="label-meta mb-2">Catálogo</div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight mb-2 break-words">
            {pageTitle}
          </h1>
          {pageSubtitle && <p className="text-sm text-muted-foreground mb-4">{pageSubtitle}</p>}

          {search.shipping === "free" && (
            <div
              role="note"
              aria-label="Regra da promoção de frete grátis"
              className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:p-5 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                <Truck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm sm:text-base text-amber-900 leading-snug dark:text-amber-100">
                  Frete grátis para compras acima de{" "}
                  <strong className="font-semibold text-amber-900 dark:text-amber-50">
                    {formatBRL(FREE_SHIPPING_THRESHOLD)}
                  </strong>{" "}
                  em{" "}
                  <span className="inline-flex items-center rounded-md bg-amber-200/70 px-1.5 py-0.5 text-xs font-medium text-amber-900 align-baseline dark:bg-amber-500/25 dark:text-amber-100">
                    produtos participantes
                  </span>
                  .
                </p>
                <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/80">
                  A promoção é aplicada automaticamente no carrinho quando a regra for atendida.
                </p>
              </div>
            </div>
          )}

          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {search.q && (
                <button
                  onClick={() => {
                    setQ("");
                    navigate({ search: (s: any) => ({ ...s, q: undefined, page: 1 }) as any });
                  }}
                  className="inline-flex items-center gap-1.5 text-xs bg-surface px-2.5 py-1 rounded-full hover:bg-muted"
                >
                  "{search.q}" <X className="w-3 h-3" />
                </button>
              )}
              {search.cat && (
                <button
                  onClick={() =>
                    navigate({ search: (s: any) => ({ ...s, cat: undefined, page: 1 }) as any })
                  }
                  className="inline-flex items-center gap-1.5 text-xs bg-primary-tint text-primary px-2.5 py-1 rounded-full hover:bg-primary/10"
                >
                  {categories?.find((c) => c.slug === search.cat)?.name ?? search.cat}{" "}
                  <X className="w-3 h-3" />
                </button>
              )}
              {search.marca && (
                <button
                  onClick={() =>
                    navigate({ search: (s: any) => ({ ...s, marca: undefined, page: 1 }) as any })
                  }
                  className="inline-flex items-center gap-1.5 text-xs bg-surface px-2.5 py-1 rounded-full hover:bg-muted"
                >
                  Marca: {search.marca} <X className="w-3 h-3" />
                </button>
              )}
              {(search.precoMin != null || search.precoMax != null) && (
                <button
                  onClick={() => {
                    setPriceMin("");
                    setPriceMax("");
                    navigate({
                      search: (s: any) =>
                        ({ ...s, precoMin: undefined, precoMax: undefined, page: 1 }) as any,
                    });
                  }}
                  className="inline-flex items-center gap-1.5 text-xs bg-surface px-2.5 py-1 rounded-full hover:bg-muted"
                >
                  Preço {search.precoMin ?? 0}–{search.precoMax ?? "∞"} <X className="w-3 h-3" />
                </button>
              )}
              {search.estoque && (
                <button
                  onClick={() =>
                    navigate({ search: (s: any) => ({ ...s, estoque: undefined, page: 1 }) as any })
                  }
                  className="inline-flex items-center gap-1.5 text-xs bg-surface px-2.5 py-1 rounded-full hover:bg-muted"
                >
                  Em estoque <X className="w-3 h-3" />
                </button>
              )}
              {search.oferta && (
                <button
                  onClick={() =>
                    navigate({ search: (s: any) => ({ ...s, oferta: undefined, page: 1 }) as any })
                  }
                  className="inline-flex items-center gap-1.5 text-xs bg-accent/10 text-accent-foreground px-2.5 py-1 rounded-full hover:bg-accent/20"
                >
                  Oferta <X className="w-3 h-3" />
                </button>
              )}
              {search.shipping === "free" && (
                <button
                  onClick={() =>
                    navigate({
                      search: (s: any) => ({ ...s, shipping: undefined, page: 1 }) as any,
                    })
                  }
                  className="inline-flex items-center gap-1.5 text-xs bg-accent/10 text-accent-foreground px-2.5 py-1 rounded-full hover:bg-accent/20"
                >
                  Frete grátis <X className="w-3 h-3" />
                </button>
              )}
              {sortValue === "best_sellers" && (
                <button
                  onClick={() =>
                    navigate({ search: (s: any) => ({ ...s, sort: undefined, page: 1 }) as any })
                  }
                  className="inline-flex items-center gap-1.5 text-xs bg-accent/10 text-accent-foreground px-2.5 py-1 rounded-full hover:bg-accent/20"
                >
                  Destaques <X className="w-3 h-3" />
                </button>
              )}
              {TECH_FILTERS.flatMap((def) => {
                const ids = selectedTech[def.key] ?? [];
                return ids.map((id) => {
                  const opt = def.options.find((o) => o.id === id);
                  if (!opt) return null;
                  const friendly = decorateOptionLabel(def.key, opt as any);
                  return (
                    <button
                      key={`${def.key}-${id}`}
                      onClick={() => toggleTechId(def.key, id)}
                      className="inline-flex items-center gap-1.5 text-xs bg-primary-tint text-primary px-2.5 py-1 rounded-full hover:bg-primary/10"
                    >
                      {def.label}: {friendly} <X className="w-3 h-3" />
                    </button>
                  );
                });
              })}
              <button
                onClick={clearFilters}
                className="text-xs text-muted-foreground underline hover:text-foreground ml-1"
              >
                Limpar filtros
              </button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitSearch();
            }}
            className="max-w-md"
          >
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nome, SKU, marca..."
                className="pl-11 h-11 rounded-pill bg-surface"
              />
            </div>
          </form>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="lg:w-64 shrink-0">
            {/* Mobile: painel fechado por padrão — evita que dados assíncronos
                (categorias, marcas, facetas) empurrem a grade e gerem CLS. */}
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className="lg:hidden w-full h-11 mb-4 inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium"
            >
              <SlidersHorizontal className="w-4 h-4 text-primary" />
              {filtersOpen ? "Ocultar filtros" : "Filtrar produtos"}
            </button>
            <div
              className={`${filtersOpen ? "block" : "hidden"} lg:block bg-card border border-border rounded-xl p-5 lg:sticky lg:top-20 space-y-6`}
            >
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <SlidersHorizontal className="w-4 h-4 text-primary" />
                  <h3 className="font-display font-semibold text-sm">Categorias</h3>
                </div>
                <ul className="space-y-1">
                  <li>
                    <button
                      onClick={() =>
                        navigate({ search: (s: any) => ({ ...s, cat: undefined, page: 1 }) as any })
                      }
                      className={`w-full text-left text-sm px-3 py-2 rounded-md transition-colors ${!search.cat ? "bg-primary-tint text-primary font-medium" : "hover:bg-surface text-muted-foreground"}`}
                    >
                      Todas
                    </button>
                  </li>
                  {categories?.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() =>
                          navigate({ search: (s: any) => ({ ...s, cat: c.slug, page: 1 }) as any })
                        }
                        className={`w-full text-left text-sm px-3 py-2 rounded-md transition-colors ${search.cat === c.slug ? "bg-primary-tint text-primary font-medium" : "hover:bg-surface text-muted-foreground"}`}
                      >
                        {c.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-display font-semibold text-sm mb-3 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-primary" /> Faixa de preço
                </h3>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="Min"
                    value={priceMin}
                    onChange={(e) => setPriceMin(e.target.value)}
                    onBlur={applyPrice}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyPrice();
                    }}
                    className="h-9 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">a</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="Max"
                    value={priceMax}
                    onChange={(e) => setPriceMax(e.target.value)}
                    onBlur={applyPrice}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyPrice();
                    }}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {brandsData && brandsData.length > 0 && (
                <div>
                  <h3 className="font-display font-semibold text-sm mb-3">Marca</h3>
                  <select
                    value={search.marca ?? ""}
                    onChange={(e) =>
                      navigate({
                        search: (s: any) =>
                          ({ ...s, marca: e.target.value || undefined, page: 1 }) as any,
                      })
                    }
                    className="w-full text-sm border border-border rounded-md px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Todas as marcas</option>
                    {brandsData.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <h3 className="font-display font-semibold text-sm mb-3">Disponibilidade</h3>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!search.estoque}
                    onChange={(e) =>
                      navigate({
                        search: (s: any) =>
                          ({ ...s, estoque: e.target.checked || undefined, page: 1 }) as any,
                      })
                    }
                    className="rounded border-border"
                  />
                  Apenas em estoque
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    checked={!!search.oferta}
                    onChange={(e) =>
                      navigate({
                        search: (s: any) =>
                          ({ ...s, oferta: e.target.checked || undefined, page: 1 }) as any,
                      })
                    }
                    className="rounded border-border"
                  />
                  Em promoção
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    checked={search.shipping === "free"}
                    onChange={(e) =>
                      navigate({
                        search: (s: any) =>
                          ({
                            ...s,
                            shipping: e.target.checked ? "free" : undefined,
                            page: 1,
                          }) as any,
                      })
                    }
                    className="rounded border-border"
                  />
                  Frete grátis
                </label>
              </div>

              {(facetsData?.facets?.length ?? 0) > 0 && (
                <div className="space-y-5 pt-1">
                  <div>
                    <h3 className="font-display font-semibold text-sm mb-1">Filtros técnicos</h3>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Encontre produtos pela potência, cor da luz, voltagem ou proteção.
                    </p>
                  </div>
                  {TECH_FILTERS.map((def) => {
                    const facetValues = facetsByKey.get(def.key);
                    if (!facetValues || facetValues.size === 0) return null;
                    // Mostra apenas opções que têm pelo menos um produto cadastrado.
                    const visibleOptions = def.options.filter((opt: any) => {
                      if (def.kind === "value") {
                        const values: string[] = opt.values ?? [];
                        return values.some((v) => facetValues.has(v.toLowerCase()));
                      }
                      // Para potência (range), checa se há valor numérico dentro do intervalo.
                      const min: number = opt.min ?? 0;
                      const max: number = opt.max ?? 99999;
                      for (const v of facetValues) {
                        const n = Number(v);
                        if (Number.isFinite(n) && n >= min && n <= max) return true;
                      }
                      return false;
                    });
                    if (visibleOptions.length === 0) return null;
                    const selectedIds = selectedTech[def.key] ?? [];
                    return (
                      <div key={def.key}>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium">{def.label}</h4>
                          {selectedIds.length > 0 && (
                            <button
                              onClick={() => clearTechKey(def.key)}
                              className="text-[11px] text-muted-foreground hover:text-foreground underline"
                            >
                              limpar
                            </button>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {visibleOptions.map((opt) => (
                            <label
                              key={opt.id}
                              className="flex items-center gap-2 text-sm cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(opt.id)}
                                onChange={() => toggleTechId(def.key, opt.id)}
                                className="rounded border-border"
                              />
                              <span className="text-muted-foreground">
                                {decorateOptionLabel(def.key, opt as any)}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
              <p className="text-sm text-muted-foreground">
                {isLoading
                  ? "Carregando..."
                  : `${total} produto${total === 1 ? "" : "s"} · página ${page} de ${totalPages}`}
                {isFetching && !isLoading && (
                  <span className="ml-2 text-xs text-muted-foreground/60">atualizando…</span>
                )}
              </p>
              <select
                value={sortValue}
                onChange={(e) =>
                  navigate({
                    search: (s: any) => ({ ...s, sort: e.target.value as any, page: 1 }) as any,
                  })
                }
                className="text-sm border border-border rounded-md px-3 py-1.5 bg-card focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {search.q && <option value="relevance">Mais relevantes</option>}
                <option value="featured">Em destaque</option>
                <option value="price_asc">Menor preço</option>
                <option value="price_desc">Maior preço</option>
                <option value="newest">Novidades</option>
                <option value="best_sellers">Mais vendidos</option>
              </select>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            ) : products.length === 0 ? (
              <EmptyResults
                query={search.q}
                hasFilters={hasActiveFilters}
                onClear={clearFilters}
                supportWhats={supportWhats}
              />
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4">
                  {products.map((p, i) => (
                    <ProductCard key={p.id} product={p} index={i} />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => goPage(page - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" /> Anterior
                    </Button>
                    <span className="text-sm text-muted-foreground px-3">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => goPage(page + 1)}
                    >
                      Próxima <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <KitsCarousel
          title="Confira também nossos kits prontos"
          subtitle="Produtos combinados para facilitar sua instalação."
          mode="retail"
          preferCategorySlug={search.cat}
          limit={6}
          className="mt-2"
        />
      </div>
      {products.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "CollectionPage",
              name: pageTitle,
              url: `${SITE_URL}/catalogo`,
              description:
                "Catálogo de material elétrico e iluminação LED da Led Maricá. Lâmpadas, disjuntores, cabos, refletores e muito mais. Frete grátis acima de R$199.",
              mainEntity: {
                "@type": "ItemList",
                itemListElement: products.slice(0, 24).map((p, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  item: {
                    "@type": "Product",
                    name: p.name,
                    url: `${SITE_URL}/produto/${p.slug}`,
                    image: p.images?.[0],
                    offers: {
                      "@type": "Offer",
                      price: String(p.price),
                      priceCurrency: "BRL",
                      availability:
                        p.stock_qty > 0
                          ? "https://schema.org/InStock"
                          : "https://schema.org/OutOfStock",
                    },
                  },
                })),
              },
            }),
          }}
        />
      )}
    </StoreLayout>
  );
}

function EmptyResults({
  query,
  hasFilters,
  onClear,
  supportWhats,
}: {
  query: string | undefined;
  hasFilters: boolean;
  onClear: () => void;
  supportWhats: string;
}) {
  const message = query
    ? `Não encontramos produtos para "${query}".`
    : "Nenhum produto corresponde aos filtros selecionados.";

  const whatsappText = encodeURIComponent(
    query
      ? `Olá! Estou procurando por "${query}" no site e não encontrei. Vocês têm disponível?`
      : "Olá! Não encontrei o produto que procuro no site. Podem me ajudar?",
  );

  return (
    <div className="text-center py-16 px-4 max-w-xl mx-auto">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-tint text-primary mb-4">
        <Search className="w-6 h-6" />
      </div>
      <p className="text-base font-medium text-foreground mb-2">{message}</p>
      <p className="text-sm text-muted-foreground mb-6">
        Tente outro termo, ajuste os filtros ou fale com nosso atendimento — temos muito mais
        produtos do que aparece no site.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {hasFilters && (
          <Button variant="outline" size="sm" onClick={onClear}>
            Limpar filtros
          </Button>
        )}
        <a href="/catalogo" className="inline-flex">
          <Button variant="outline" size="sm">
            Ver todas as categorias
          </Button>
        </a>
        {supportWhats && (
          <a
            href={`https://wa.me/${supportWhats}?text=${whatsappText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex"
          >
            <Button size="sm" className="gap-1.5">
              <MessageCircle className="w-4 h-4" /> Falar no WhatsApp
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}
