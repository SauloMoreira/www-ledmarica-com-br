import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Search,
  RefreshCw,
  Globe,
  FileText,
  Tags,
  Home as HomeIcon,
  Lightbulb,
  Image as ImageIcon,
  Type,
  FileQuestion,
  FolderTree,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getSeoInsights,
  type SeoInsights,
  type SeoSeverity,
  type SeoIssue,
  type SeoProductRow,
} from "@/server/seoInsights.functions";

export const Route = createFileRoute("/admin/seo")({
  component: SeoPage,
  head: () => ({ meta: [{ title: "SEO da loja | Admin" }] }),
});

type ProductFilter =
  | "all"
  | "bad"
  | "warn"
  | "ok"
  | "no_seo_title"
  | "no_seo_description"
  | "no_image"
  | "short_description"
  | "no_category";

function severityColor(sev: SeoSeverity): string {
  if (sev === "danger") return "bg-destructive/10 text-destructive border-destructive/30";
  if (sev === "warn")
    return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
  return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 71 ? "bg-emerald-500" : score >= 41 ? "bg-amber-500" : "bg-destructive";
  return (
    <div className="flex items-center gap-2 w-full max-w-[140px]">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs tabular-nums w-8 text-right">{score}</span>
    </div>
  );
}

function IssueList({ issues }: { issues: SeoIssue[] }) {
  if (issues.length === 0) {
    return (
      <span className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" /> Tudo certo
      </span>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {issues.map((i) => (
          <Badge
            key={i.code}
            variant="outline"
            className={`text-[10px] ${severityColor(i.severity)}`}
          >
            {i.label}
          </Badge>
        ))}
      </div>
      {issues.some((i) => i.recommendation) && (
        <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
          {issues
            .filter((i) => i.recommendation)
            .slice(0, 2)
            .map((i) => (
              <li key={`rec-${i.code}`}>{i.recommendation}</li>
            ))}
        </ul>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  qty,
  total,
  hint,
  ctaHref,
  ctaLabel,
  onCtaClick,
  tone = "neutral",
}: {
  icon: any;
  title: string;
  qty: number;
  total?: number;
  hint?: string;
  ctaHref?: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "bad"
          ? "text-destructive"
          : "text-foreground";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" /> {title}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${toneClass}`}>
          {qty}
          {total != null && (
            <span className="text-xs text-muted-foreground font-normal"> /{total}</span>
          )}
        </div>
        {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
        {ctaHref && (
          <Link to={ctaHref}>
            <Button size="sm" variant="link" className="px-0 h-auto mt-1 text-xs">
              {ctaLabel ?? "Ver detalhes"}
            </Button>
          </Link>
        )}
        {!ctaHref && onCtaClick && (
          <Button
            size="sm"
            variant="link"
            className="px-0 h-auto mt-1 text-xs"
            onClick={onCtaClick}
          >
            {ctaLabel ?? "Ver detalhes"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function SeoPage() {
  const [data, setData] = useState<SeoInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ProductFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  const [activeTab, setActiveTab] = useState("produtos");
  const tabsSectionRef = useRef<HTMLDivElement>(null);

  function goToProblemPages() {
    setActiveTab("paginas");
    requestAnimationFrame(() => {
      tabsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function load() {
    setLoading(true);
    try {
      const res = await getSeoInsights({ data: { productLimit: 500 } });
      setData(res);
      setPage(1);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredProducts = useMemo<SeoProductRow[]>(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.products.filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.slug} ${p.sku ?? ""} ${p.categoryName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (categoryFilter !== "all" && p.categoryId !== categoryFilter) return false;
      switch (filter) {
        case "bad":
          return p.severity === "danger";
        case "warn":
          return p.severity === "warn";
        case "ok":
          return p.severity === "ok";
        case "no_seo_title":
          return p.issues.some((i) => i.code === "no_seo_title");
        case "no_seo_description":
          return p.issues.some((i) => i.code === "no_seo_description");
        case "no_image":
          return p.issues.some((i) => i.code === "no_image");
        case "short_description":
          return p.issues.some((i) => i.code === "short_description");
        case "no_category":
          return p.issues.some((i) => i.code === "no_category");
        default:
          return true;
      }
    });
  }, [data, search, filter, categoryFilter]);

  const pagedProducts = useMemo(
    () => filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredProducts, page],
  );
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));

  if (loading || !data) {
    return (
      <AdminLayout title="SEO da loja">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  const s = data.summary;
  const categories = data.categories;
  const problemPages = data.pages.filter((p) => p.severity !== "ok");

  const filterChips: { id: ProductFilter; label: string; qty?: number }[] = [
    { id: "all", label: "Todos", qty: data.products.length },
    {
      id: "bad",
      label: "SEO ruim",
      qty: data.products.filter((p) => p.severity === "danger").length,
    },
    {
      id: "warn",
      label: "Em atenção",
      qty: data.products.filter((p) => p.severity === "warn").length,
    },
    { id: "ok", label: "SEO bom", qty: data.products.filter((p) => p.severity === "ok").length },
    { id: "no_seo_title", label: "Sem título SEO", qty: s.productsNoSeoTitle },
    { id: "no_seo_description", label: "Sem meta description", qty: s.productsNoSeoDescription },
    { id: "no_image", label: "Sem imagem", qty: s.productsNoImage },
    { id: "short_description", label: "Sem descrição", qty: s.productsNoDescription },
    { id: "no_category", label: "Sem categoria", qty: s.productsNoCategory },
  ];

  return (
    <AdminLayout
      title="SEO da loja"
      action={
        <Button onClick={() => void load()} size="sm" variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" /> Reanalisar
        </Button>
      }
    >
      <div className="space-y-6 p-4 md:p-6">
        <p className="text-sm text-muted-foreground -mt-2">
          Veja oportunidades para melhorar a presença dos seus produtos e páginas no Google.
        </p>

        {/* Explicação para iniciantes */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 text-sm text-muted-foreground flex gap-3">
            <Lightbulb className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <strong className="text-foreground">SEO</strong> é o conjunto de informações que ajuda
              sua loja a aparecer melhor no Google. Produtos com boa <strong>descrição</strong>,{" "}
              <strong>imagem</strong> e <strong>título SEO</strong> têm mais chance de gerar visitas
              e vendas. Comece corrigindo os produtos com SEO ruim (vermelho).
            </div>
          </CardContent>
        </Card>

        {/* Resumo geral — KPIs principais */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={CheckCircle2}
            title="Score médio (produtos)"
            qty={s.averageProductScore}
            hint="0–100. Mais alto = melhor."
            tone={
              s.averageProductScore >= 71 ? "good" : s.averageProductScore >= 41 ? "warn" : "bad"
            }
          />
          <SummaryCard
            icon={HomeIcon}
            title="Score da Homepage"
            qty={s.homepageScore}
            hint="Quanto maior, melhor."
            ctaHref="/admin/conteudo/homepage"
            ctaLabel="Editar homepage"
            tone={s.homepageScore >= 71 ? "good" : s.homepageScore >= 41 ? "warn" : "bad"}
          />
          <SummaryCard
            icon={AlertTriangle}
            title="Produtos críticos"
            qty={s.productsCritical}
            total={s.productsTotal}
            hint="Score baixo (0–40)."
            tone={s.productsCritical > 0 ? "bad" : "good"}
          />
          <SummaryCard
            icon={FileText}
            title="Páginas com problemas"
            qty={s.pagesWithIssues}
            total={s.pagesTotal}
            tone={s.pagesWithIssues > 0 ? "warn" : "good"}
            hint={
              problemPages.length > 0
                ? problemPages
                    .slice(0, 3)
                    .map((p) => p.title)
                    .join(", ") + (problemPages.length > 3 ? ` e mais ${problemPages.length - 3}` : "")
                : undefined
            }
            ctaLabel={problemPages.length > 0 ? "Ver página(s)" : undefined}
            onCtaClick={problemPages.length > 0 ? goToProblemPages : undefined}
          />
        </div>

        {/* Cards granulares de problemas */}
        <div>
          <h2 className="font-display font-semibold text-base mb-3">Problemas a corrigir</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <SummaryCard
              icon={Type}
              title="Sem título SEO"
              qty={s.productsNoSeoTitle}
              hint="Aparece como o título azul nas buscas."
              tone={s.productsNoSeoTitle > 0 ? "bad" : "good"}
            />
            <SummaryCard
              icon={FileQuestion}
              title="Sem meta description"
              qty={s.productsNoSeoDescription}
              hint="Aparece como descrição nos resultados."
              tone={s.productsNoSeoDescription > 0 ? "bad" : "good"}
            />
            <SummaryCard
              icon={FileText}
              title="Sem descrição"
              qty={s.productsNoDescription}
              hint="Produtos sem descrição vendem menos."
              tone={s.productsNoDescription > 0 ? "warn" : "good"}
            />
            <SummaryCard
              icon={ImageIcon}
              title="Sem imagem"
              qty={s.productsNoImage}
              hint="Imagem é essencial para conversão."
              tone={s.productsNoImage > 0 ? "bad" : "good"}
            />
            <SummaryCard
              icon={FolderTree}
              title="Sem categoria"
              qty={s.productsNoCategory}
              hint="Atrapalha navegação e indexação."
              tone={s.productsNoCategory > 0 ? "warn" : "good"}
            />
            <SummaryCard
              icon={Tags}
              title="Categorias sem descrição"
              qty={s.categoriesNoDescription}
              total={s.categoriesTotal}
              tone={s.categoriesNoDescription > 0 ? "warn" : "good"}
            />
            <SummaryCard
              icon={FileText}
              title="Páginas incompletas"
              qty={s.pagesIncomplete}
              total={s.pagesTotal}
              tone={s.pagesIncomplete > 0 ? "warn" : "good"}
            />
            <SummaryCard
              icon={Globe}
              title="Vitrine B2B com SEO"
              qty={s.b2bSeoConfigured ? 1 : 0}
              hint={s.b2bSeoConfigured ? "Configurada" : "Sem título/descrição SEO."}
              tone={s.b2bSeoConfigured ? "good" : "warn"}
            />
          </div>
        </div>

        {/* SEO Local */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="w-4 h-4 text-primary" /> SEO local — Maricá / RJ
            </CardTitle>
            <CardDescription>
              SEO local ajuda clientes próximos a encontrarem sua loja quando procuram produtos na
              região.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              <LocalCheck label='"Maricá" no título da home' ok={data.local.hasMaricaInTitle} />
              <LocalCheck
                label='"Maricá" na meta description'
                ok={data.local.hasMaricaInDescription}
              />
              <LocalCheck
                label="Bairros de entrega cadastrados"
                ok={data.local.hasLocalDeliveryZones}
              />
              <LocalCheck
                label="Endereço da empresa preenchido"
                ok={data.local.hasCompanyAddress}
              />
              <LocalCheck
                label="Dados estruturados (geo) na home"
                ok={data.local.hasGeoStructuredData}
              />
            </div>
            {data.local.notes.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <strong className="text-amber-700 dark:text-amber-400 block mb-1">
                  Recomendações urgentes
                </strong>
                <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                  {data.local.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <strong className="block mb-1">Sugestões de SEO local</strong>
              <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                {data.local.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <div ref={tabsSectionRef}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start flex-wrap h-auto">
            <TabsTrigger value="produtos">
              Produtos{" "}
              <Badge variant="secondary" className="ml-2">
                {s.productsWithIssues}/{s.productsTotal}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="categorias">
              <Tags className="w-3.5 h-3.5 mr-1" />
              Categorias{" "}
              <Badge variant="secondary" className="ml-2">
                {s.categoriesWithIssues}/{s.categoriesTotal}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="paginas">
              <FileText className="w-3.5 h-3.5 mr-1" />
              Páginas{" "}
              <Badge variant="secondary" className="ml-2">
                {s.pagesWithIssues}/{s.pagesTotal}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="homepage">
              <HomeIcon className="w-3.5 h-3.5 mr-1" />
              Homepage
            </TabsTrigger>
          </TabsList>

          {/* Produtos */}
          <TabsContent value="produtos" className="mt-4 space-y-3">
            {/* Busca + filtros */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex flex-col md:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome, SKU, slug ou categoria…"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                      className="pl-9"
                    />
                  </div>
                  <Select
                    value={categoryFilter}
                    onValueChange={(v) => {
                      setCategoryFilter(v);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-full md:w-[220px]">
                      <SelectValue placeholder="Todas as categorias" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as categorias</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {filterChips.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setFilter(c.id);
                        setPage(1);
                      }}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${
                        filter === c.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted border-border text-muted-foreground"
                      }`}
                    >
                      {c.label}
                      {c.qty != null && <span className="ml-1 opacity-70">({c.qty})</span>}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 space-y-2">
                {pagedProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhum produto encontrado para o filtro atual.
                  </p>
                ) : (
                  pagedProducts.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 p-3 border rounded-lg"
                    >
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{p.name}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${severityColor(p.severity)}`}
                          >
                            {p.severity === "ok"
                              ? "Bom"
                              : p.severity === "warn"
                                ? "Atenção"
                                : "Ruim"}
                          </Badge>
                          {p.categoryName && (
                            <Badge variant="secondary" className="text-[10px]">
                              {p.categoryName}
                            </Badge>
                          )}
                          {p.sku && (
                            <code className="text-[10px] text-muted-foreground">SKU {p.sku}</code>
                          )}
                        </div>
                        <IssueList issues={p.issues} />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <ScoreBar score={p.score} />
                        <Link to="/admin/produtos/$id" params={{ id: p.id }}>
                          <Button size="sm" variant="outline">
                            Editar
                          </Button>
                        </Link>
                        {p.slug && (
                          <a href={`/produto/${p.slug}`} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="ghost">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                )}

                {/* Paginação */}
                {filteredProducts.length > PAGE_SIZE && (
                  <div className="flex items-center justify-between pt-3 border-t">
                    <span className="text-xs text-muted-foreground">
                      {(page - 1) * PAGE_SIZE + 1}–
                      {Math.min(page * PAGE_SIZE, filteredProducts.length)} de{" "}
                      {filteredProducts.length}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={page === 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Anterior
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Categorias */}
          <TabsContent value="categorias" className="mt-4">
            <Card>
              <CardContent className="pt-4 space-y-2">
                {data.categories.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhuma categoria.
                  </p>
                ) : (
                  data.categories.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 p-3 border rounded-lg"
                    >
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{c.name}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${severityColor(c.severity)}`}
                          >
                            {c.severity === "ok"
                              ? "Bom"
                              : c.severity === "warn"
                                ? "Atenção"
                                : "Ruim"}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {c.productsActive} produto(s) ativo(s)
                          </Badge>
                        </div>
                        <IssueList issues={c.issues} />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <ScoreBar score={c.score} />
                        <Link to="/admin/categorias">
                          <Button size="sm" variant="outline">
                            Editar
                          </Button>
                        </Link>
                        {c.slug && (
                          <a href={`/categoria/${c.slug}`} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="ghost">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Páginas */}
          <TabsContent value="paginas" className="mt-4">
            <Card>
              <CardContent className="pt-4 space-y-2">
                {data.pages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhuma página institucional.
                  </p>
                ) : (
                  data.pages.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 p-3 border rounded-lg"
                    >
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{p.title}</span>
                          <code className="text-[11px] text-muted-foreground">/{p.slug}</code>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${severityColor(p.severity)}`}
                          >
                            {p.severity === "ok"
                              ? "Bom"
                              : p.severity === "warn"
                                ? "Atenção"
                                : "Ruim"}
                          </Badge>
                        </div>
                        <IssueList issues={p.issues} />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <ScoreBar score={p.score} />
                        <Link to="/admin/institutional-pages/$id" params={{ id: p.id }}>
                          <Button size="sm" variant="outline">
                            Editar
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Homepage */}
          <TabsContent value="homepage" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" /> Homepage
                  </CardTitle>
                  <Link to="/admin/conteudo/homepage">
                    <Button size="sm" variant="outline">
                      Editar homepage
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <ScoreBar score={s.homepageScore} />
                </div>
                <IssueList issues={s.homepageIssues} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Análise baseada em campos cadastrados — não realiza crawling externo. Atualizada em{" "}
          {new Date(data.generatedAt).toLocaleString("pt-BR")}.
        </p>
      </div>
    </AdminLayout>
  );
}

function LocalCheck({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-amber-500" />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}
