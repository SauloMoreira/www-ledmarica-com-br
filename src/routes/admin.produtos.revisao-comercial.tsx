import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  DataTableToolbar,
  DataTablePagination,
} from "@/components/admin/datatable";
import { useTableState } from "@/hooks/useTableState";
import {
  ArrowLeft,
  Search,
  RefreshCw,
  ExternalLink,
  Pencil,
  Sparkles,
  AlertTriangle,
  AlertOctagon,
  Tag,
  Briefcase,
  CheckCircle2,
  DollarSign,
  Info,
  TrendingUp,
  TrendingDown,
  Clock,
  Download,
  Flame,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCommercialReviewReport,
  getCommercialReviewFilterOptions,
  exportCommercialReviewCsv,
  type CommercialFilter,
  type CommercialReviewRow,
} from "@/server/commercialReview.functions";
import { STATUS_LABEL, STATUS_TONE, type CommercialStatus } from "@/lib/commercialReview";
import { formatDateBR } from "@/lib/dateBR";

export const Route = createFileRoute("/admin/produtos/revisao-comercial")({
  validateSearch: zodValidator(
    z.object({
      page: fallback(z.number(), 1).default(1),
      pageSize: fallback(z.number(), 25).default(25),
      q: fallback(z.string(), "").default(""),
      filter: fallback(z.string(), "all").default("all"),
      categoryId: fallback(z.string(), "all").default("all"),
      brand: fallback(z.string(), "all").default("all"),
    }),
  ),
  component: CommercialReviewPage,
});

const FILTER_OPTIONS: Array<{ value: CommercialFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "no_cost", label: "Sem custo" },
  { value: "no_price", label: "Sem preço" },
  { value: "negative_margin", label: "Margem negativa" },
  { value: "critical_margin", label: "Margem crítica" },
  { value: "attention_margin", label: "Margem em atenção" },
  { value: "b2b_critical", label: "B2B crítico" },
  { value: "b2b_incomplete", label: "B2B incompleto" },
  { value: "healthy", label: "Saudáveis" },
  { value: "stalled", label: "Produto parado" },
  { value: "high_movement", label: "Alto giro" },
  { value: "high_movement_low_margin", label: "Alto giro c/ margem baixa" },
  { value: "no_sales_window", label: "Sem venda no período" },
  { value: "with_sales_window", label: "Com venda no período" },
];

function fmtBRL(v: number | null | undefined): string {
  if (v == null) return "—";
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${v.toFixed(2)}`;
  }
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatDateBR(iso);
  } catch {
    return "—";
  }
}

function StatusBadge({ status }: { status: CommercialStatus }) {
  const tone = STATUS_TONE[status];
  const cls =
    tone === "danger"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : tone === "warn"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
        : tone === "ok"
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
          : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${cls}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function MovementBadge({ row }: { row: CommercialReviewRow }) {
  const m = row.movement;
  let label = "";
  let cls = "bg-muted text-muted-foreground border-border";
  let Icon = Clock;
  if (m === "high_movement") {
    label = "Alto giro";
    cls = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
    Icon = Flame;
  } else if (m === "with_sales") {
    label = "Com venda";
    cls = "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";
    Icon = TrendingUp;
  } else if (m === "stalled") {
    label = "Parado";
    cls = "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
    Icon = TrendingDown;
  } else if (m === "no_sales_no_stock") {
    label = "Sem venda/estoque";
  } else {
    label = "Sem venda registrada";
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${cls}`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function CommercialReviewPage() {
  const ts = useTableState({
    page: 1,
    pageSize: 25,
    sort: { column: "name", direction: "asc" },
  });
  const filter = ((ts.search.filter as string) ?? "all") as CommercialFilter;
  const categoryId = (ts.search.categoryId as string) ?? "all";
  const brand = (ts.search.brand as string) ?? "all";
  const [exporting, setExporting] = useState(false);

  const setFilter = (v: CommercialFilter) => ts.setFilter("filter", v);
  const setCategoryId = (v: string) => ts.setFilter("categoryId", v);
  const setBrand = (v: string) => ts.setFilter("brand", v);
  const setPage = (p: number) => ts.setPage(p);

  const { data: filterOptions } = useQuery({
    queryKey: ["commercial-review-filter-options"],
    queryFn: () => getCommercialReviewFilterOptions(),
    staleTime: 5 * 60_000,
  });

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["commercial-review", filter, ts.q, categoryId, brand, ts.page, ts.pageSize],
    queryFn: () =>
      getCommercialReviewReport({
        data: {
          filter,
          search: ts.q || undefined,
          categoryId: categoryId !== "all" ? categoryId : undefined,
          brand: brand !== "all" ? brand : undefined,
          page: ts.page,
          pageSize: ts.pageSize,
        },
      }),
    staleTime: 30_000,
  });

  const summary = data?.summary;
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const hasFilters =
    ts.q !== "" || filter !== "all" || categoryId !== "all" || brand !== "all";

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const res = await exportCommercialReviewCsv({
        data: {
          filter,
          search: ts.q || undefined,
          categoryId: categoryId !== "all" ? categoryId : undefined,
          brand: brand !== "all" ? brand : undefined,
          page: 1,
          pageSize: 2000,
        },
      });
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export CSV falhou", err);
      alert("Não foi possível exportar a revisão comercial.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminLayout
      title="Revisão comercial"
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={exporting || isLoading}
          >
            <Download className={`w-4 h-4 mr-1 ${exporting ? "animate-pulse" : ""}`} />
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Link to={"/admin/produtos" as any}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" /> Produtos
            </Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground max-w-3xl -mt-2">
          Análise comercial baseada no cadastro do produto e no histórico de vendas pagas.
          <strong> Esta tela não altera nada automaticamente</strong> — apenas sinaliza o que merece
          revisão.
          {summary && (
            <>
              {" "}
              Análise baseada na janela configurada em{" "}
              <Link to={"/admin/produtos/estoque" as any} className="underline">
                Estoque
              </Link>
              : vendas dos últimos <strong>{summary.salesWindowDays}</strong> dias, produto parado
              quando sem venda há <strong>{summary.inactiveDaysThreshold}</strong> dias, alto giro a
              partir de <strong>{summary.highMovementMinQty}</strong> unidades vendidas no período.
            </>
          )}
        </p>

        {error && (
          <Card className="p-4 border-destructive/40 bg-destructive/10 text-sm text-destructive">
            Não foi possível carregar a revisão comercial. Tente atualizar.
          </Card>
        )}

        {/* CARDS */}
        <section>
          <h2 className="font-display font-semibold text-base mb-3">Resumo comercial</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <SummaryCard
              icon={DollarSign}
              label="Sem custo"
              value={summary?.noCost}
              loading={isLoading}
              tone="warn"
              onClick={() => {
                setFilter("no_cost");
                setPage(1);
              }}
              active={filter === "no_cost"}
            />
            <SummaryCard
              icon={Tag}
              label="Sem preço"
              value={summary?.noPrice}
              loading={isLoading}
              tone="danger"
              onClick={() => {
                setFilter("no_price");
                setPage(1);
              }}
              active={filter === "no_price"}
            />
            <SummaryCard
              icon={AlertOctagon}
              label="Margem negativa"
              value={summary?.negativeMargin}
              loading={isLoading}
              tone="danger"
              onClick={() => {
                setFilter("negative_margin");
                setPage(1);
              }}
              active={filter === "negative_margin"}
            />
            <SummaryCard
              icon={AlertTriangle}
              label="Margem crítica"
              value={summary?.criticalMargin}
              loading={isLoading}
              tone="danger"
              onClick={() => {
                setFilter("critical_margin");
                setPage(1);
              }}
              active={filter === "critical_margin"}
            />
            <SummaryCard
              icon={Info}
              label="Margem em atenção"
              value={summary?.attentionMargin}
              loading={isLoading}
              tone="warn"
              onClick={() => {
                setFilter("attention_margin");
                setPage(1);
              }}
              active={filter === "attention_margin"}
            />
            <SummaryCard
              icon={Briefcase}
              label="B2B crítico"
              value={summary?.b2bCritical}
              loading={isLoading}
              tone="danger"
              onClick={() => {
                setFilter("b2b_critical");
                setPage(1);
              }}
              active={filter === "b2b_critical"}
            />
            <SummaryCard
              icon={Briefcase}
              label="B2B incompleto"
              value={summary?.b2bIncomplete}
              loading={isLoading}
              tone="warn"
              onClick={() => {
                setFilter("b2b_incomplete");
                setPage(1);
              }}
              active={filter === "b2b_incomplete"}
            />
            <SummaryCard
              icon={CheckCircle2}
              label="Saudáveis"
              value={summary?.healthy}
              loading={isLoading}
              tone="ok"
              onClick={() => {
                setFilter("healthy");
                setPage(1);
              }}
              active={filter === "healthy"}
            />
          </div>

          <h2 className="font-display font-semibold text-base mt-5 mb-3">
            Resumo por giro (últimos {summary?.salesWindowDays ?? 30} dias)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <SummaryCard
              icon={TrendingDown}
              label="Parados com estoque"
              value={summary?.stalledWithStock}
              loading={isLoading}
              tone="warn"
              onClick={() => {
                setFilter("stalled");
                setPage(1);
              }}
              active={filter === "stalled"}
            />
            <SummaryCard
              icon={Flame}
              label="Alto giro"
              value={summary?.highMovement}
              loading={isLoading}
              tone="ok"
              onClick={() => {
                setFilter("high_movement");
                setPage(1);
              }}
              active={filter === "high_movement"}
            />
            <SummaryCard
              icon={AlertOctagon}
              label="Alto giro c/ margem baixa"
              value={summary?.highMovementLowMargin}
              loading={isLoading}
              tone="danger"
              onClick={() => {
                setFilter("high_movement_low_margin");
                setPage(1);
              }}
              active={filter === "high_movement_low_margin"}
            />
            <SummaryCard
              icon={Clock}
              label="Sem venda no período"
              value={summary?.noSalesInWindow}
              loading={isLoading}
              tone="info"
              onClick={() => {
                setFilter("no_sales_window");
                setPage(1);
              }}
              active={filter === "no_sales_window"}
            />
            <SummaryCard
              icon={DollarSign}
              label="Receita no período"
              value={undefined}
              valueOverride={summary ? fmtBRL(summary.revenueInWindow) : "—"}
              loading={isLoading}
              tone="ok"
            />
          </div>
          {summary && (
            <p className="text-xs text-muted-foreground mt-2">
              {summary.totalActive} produto(s) ativo(s) analisado(s). Margem mínima padrão:{" "}
              <strong>{summary.defaultMinMarginPercent}%</strong>.
            </p>
          )}
        </section>

        {/* FILTROS */}
        <DataTableToolbar
          q={ts.q}
          onQChange={ts.setQ}
          searchPlaceholder="Buscar por nome ou SKU…"
          hasActiveFilters={hasFilters}
          onClearFilters={ts.clearAll}
          filters={
            <>
              <Select
                value={filter}
                onValueChange={(v) => setFilter(v as CommercialFilter)}
              >
                <SelectTrigger className="h-9 w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryId} onValueChange={(v) => setCategoryId(v)}>
                <SelectTrigger className="h-9 w-[200px]">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {(filterOptions?.categories ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(filterOptions?.brands?.length ?? 0) > 0 && (
                <Select value={brand} onValueChange={(v) => setBrand(v)}>
                  <SelectTrigger className="h-9 w-[180px]">
                    <SelectValue placeholder="Marca" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as marcas</SelectItem>
                    {(filterOptions?.brands ?? []).map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </>
          }
        />

        {/* TABELA */}
        <section>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Produto</th>
                    <th className="text-left px-3 py-2">Categoria</th>
                    <th className="text-right px-3 py-2">Preço</th>
                    <th className="text-right px-3 py-2">Custo</th>
                    <th className="text-right px-3 py-2">Margem</th>
                    <th className="text-right px-3 py-2">B2B</th>
                    <th className="text-right px-3 py-2">Vendidos</th>
                    <th className="text-right px-3 py-2">Receita</th>
                    <th className="text-left px-3 py-2">Última venda</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Giro</th>
                    <th className="text-left px-3 py-2">Problemas</th>
                    <th className="text-right px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={13} className="px-3 py-8 text-center text-muted-foreground">
                        Carregando…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-3 py-8 text-center text-muted-foreground">
                        Nenhum produto encontrado para os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => <ReviewRow key={row.id} row={row} />)
                  )}
                </tbody>
              </table>
            </div>
            <DataTablePagination
              page={ts.page}
              pageSize={ts.pageSize}
              total={total}
              onPageChange={ts.setPage}
              onPageSizeChange={ts.setPageSize}
            />
          </Card>
        </section>
      </div>
    </AdminLayout>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  valueOverride,
  loading,
  tone,
  onClick,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | undefined;
  valueOverride?: string;
  loading: boolean;
  tone: "ok" | "warn" | "danger" | "info";
  onClick?: () => void;
  active?: boolean;
}) {
  const toneCls =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "ok"
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-muted-foreground";
  const display = valueOverride ?? (loading ? "—" : (value ?? 0).toLocaleString("pt-BR"));
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`text-left rounded-xl border p-3 transition-colors ${
        active
          ? "border-primary/60 bg-primary/5"
          : onClick
            ? "border-border bg-card hover:bg-muted/50"
            : "border-border bg-card cursor-default"
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`w-4 h-4 ${toneCls}`} />
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-display font-semibold ${toneCls}`}>{display}</div>
    </button>
  );
}

function ReviewRow({ row }: { row: CommercialReviewRow }) {
  const r = row.review;
  const marginCls =
    r.marginPercent == null
      ? "text-muted-foreground"
      : r.marginPercent < 0
        ? "text-destructive font-medium"
        : r.marginPercent < r.effectiveMinMargin
          ? "text-destructive"
          : r.marginPercent < r.effectiveMinMargin + 5
            ? "text-amber-600 dark:text-amber-400"
            : "text-emerald-600 dark:text-emerald-400";
  return (
    <tr
      className={`border-t border-border hover:bg-muted/30 ${row.high_movement_low_margin ? "bg-destructive/5" : ""}`}
    >
      <td className="px-3 py-2 align-top">
        <div className="font-medium leading-tight">{row.name}</div>
        <div className="text-xs text-muted-foreground">
          {row.sku ? <>SKU: {row.sku}</> : <span className="italic">sem SKU</span>}
          {row.brand ? ` • ${row.brand}` : ""}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">Estoque: {row.stock_qty}</div>
      </td>
      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
        {row.category_name ?? <span className="italic">sem categoria</span>}
      </td>
      <td className="px-3 py-2 align-top text-right tabular-nums">
        {fmtBRL(r.effectivePrice)}
        {row.sale_price && row.sale_price > 0 && row.price && row.sale_price < row.price && (
          <div className="text-[10px] text-muted-foreground line-through">{fmtBRL(row.price)}</div>
        )}
      </td>
      <td className="px-3 py-2 align-top text-right tabular-nums">{fmtBRL(row.cost_price)}</td>
      <td className={`px-3 py-2 align-top text-right tabular-nums ${marginCls}`}>
        <div>{fmtBRL(r.margin)}</div>
        <div className="text-xs">{fmtPct(r.marginPercent)}</div>
        <div className="text-[10px] text-muted-foreground">mín. {fmtPct(r.effectiveMinMargin)}</div>
      </td>
      <td className="px-3 py-2 align-top text-right tabular-nums">
        {row.b2b_price ? (
          <>
            <div>{fmtBRL(row.b2b_price)}</div>
            {r.b2bMarginPercent != null && (
              <div className="text-xs text-muted-foreground">{fmtPct(r.b2bMarginPercent)}</div>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 align-top text-right tabular-nums">
        {row.sales.qty_sold_window > 0 ? (
          row.sales.qty_sold_window
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
        {row.sales.orders_count_window > 0 && (
          <div className="text-[10px] text-muted-foreground">
            {row.sales.orders_count_window} pedido(s)
          </div>
        )}
      </td>
      <td className="px-3 py-2 align-top text-right tabular-nums">
        {row.sales.revenue_window > 0 ? (
          fmtBRL(row.sales.revenue_window)
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 align-top text-xs">
        {fmtDate(row.sales.last_sold_at)}
        {row.sales.days_since_last_sale != null && (
          <div className="text-[10px] text-muted-foreground">
            há {row.sales.days_since_last_sale}d
          </div>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <StatusBadge status={r.status} />
      </td>
      <td className="px-3 py-2 align-top">
        <MovementBadge row={row} />
        {row.high_movement_low_margin && (
          <div className="text-[10px] text-destructive mt-1 font-medium">
            Vende muito, margem baixa
          </div>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        {r.issues.length === 0 ? (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">Nenhum problema.</span>
        ) : (
          <ul className="space-y-1 text-xs">
            {r.issues.slice(0, 3).map((i) => (
              <li key={i.code} className="flex gap-1.5">
                <Sparkles
                  className={`w-3 h-3 flex-shrink-0 mt-0.5 ${
                    i.severity === "high"
                      ? "text-destructive"
                      : i.severity === "medium"
                        ? "text-amber-500"
                        : "text-muted-foreground"
                  }`}
                />
                <span>
                  <span className="font-medium">{i.message}</span>
                </span>
              </li>
            ))}
            {r.issues.length > 3 && (
              <li className="text-muted-foreground">+{r.issues.length - 3} outro(s)…</li>
            )}
          </ul>
        )}
      </td>
      <td className="px-3 py-2 align-top text-right">
        <div className="flex flex-col gap-1 items-end">
          <Link to={"/admin/produtos/$id" as any} params={{ id: row.id } as any}>
            <Badge variant="outline" className="cursor-pointer">
              <Pencil className="w-3 h-3 mr-1" /> Editar
            </Badge>
          </Link>
          <Link to={"/admin/produtos/estoque" as any}>
            <Badge variant="outline" className="cursor-pointer">
              <TrendingDown className="w-3 h-3 mr-1" /> Estoque
            </Badge>
          </Link>
          {row.slug && (
            <a href={`/produto/${row.slug}`} target="_blank" rel="noreferrer">
              <Badge variant="outline" className="cursor-pointer">
                <ExternalLink className="w-3 h-3 mr-1" /> Ver na loja
              </Badge>
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}
