import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  AlertTriangle,
  Image as ImageIcon,
  DollarSign,
  Search,
  FileText,
  Package,
  RefreshCw,
} from "lucide-react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listProductQuality, type ProductQualityRow } from "@/server/productQuality.functions";
import { qualityClassColor, qualityClassLabel, type QualityClass } from "@/lib/productQuality";
import {
  DataTable,
  DataTableToolbar,
  DataTablePagination,
  type DataTableColumn,
} from "@/components/admin/datatable";
import { useTableState } from "@/hooks/useTableState";
import { formatTimeBR } from "@/lib/dateBR";

type Filter =
  | "all"
  | "ruim"
  | "atencao"
  | "active_low"
  | "featured_low"
  | "no_image"
  | "no_cost"
  | "no_seo"
  | "no_fiscal"
  | "no_tech"
  | "no_tech_power"
  | "no_tech_color_temp"
  | "no_tech_voltage"
  | "no_tech_ip_rating";

const FILTER_OPTIONS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "ruim", label: "Ruins" },
  { value: "atencao", label: "Atenção" },
  { value: "active_low", label: "Ativos < 70" },
  { value: "featured_low", label: "Destaques < 70" },
  { value: "no_image", label: "Sem imagem" },
  { value: "no_cost", label: "Sem custo" },
  { value: "no_seo", label: "SEO incompleto" },
  { value: "no_fiscal", label: "Fiscal/logística" },
  { value: "no_tech", label: "Sem atributos técnicos" },
  { value: "no_tech_power", label: "Sem potência" },
  { value: "no_tech_color_temp", label: "Sem temperatura" },
  { value: "no_tech_voltage", label: "Sem voltagem" },
  { value: "no_tech_ip_rating", label: "Sem IP" },
];

const searchSchema = z.object({
  page: fallback(z.number(), 1).default(1),
  pageSize: fallback(z.number(), 25).default(25),
  q: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "score.asc").default("score.asc"),
  filter: fallback(z.string(), "all").default("all"),
});

export const Route = createFileRoute("/admin/produtos/qualidade")({
  validateSearch: zodValidator(searchSchema),
  component: ProductQualityPage,
});

function ProductQualityPage() {
  const ts = useTableState({
    page: 1,
    pageSize: 25,
    sort: { column: "score", direction: "asc" },
  });
  const filter = ((ts.search.filter as string) ?? "all") as Filter;
  const qc = useQueryClient();

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["admin-product-quality"],
    queryFn: () => listProductQuality(),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const rows = data?.rows ?? [];
  const counts = data?.counts;

  const handleRefresh = async () => {
    try {
      qc.invalidateQueries({ queryKey: ["admin-operations"] });
      await refetch();
      toast.success("Scores de qualidade atualizados com sucesso.");
    } catch {
      toast.error("Não foi possível atualizar os scores agora. Tente novamente.");
    }
  };

  const filtered = useMemo(() => {
    let arr = rows;
    switch (filter) {
      case "ruim":
        arr = arr.filter((r) => r.quality.classification === "ruim");
        break;
      case "atencao":
        arr = arr.filter((r) => r.quality.classification === "atencao");
        break;
      case "active_low":
        arr = arr.filter((r) => r.active && r.quality.score < 70);
        break;
      case "featured_low":
        arr = arr.filter((r) => r.featured && r.quality.score < 70);
        break;
      case "no_image":
        arr = arr.filter((r) => r.quality.issues.some((i) => i.code === "no_image"));
        break;
      case "no_cost":
        arr = arr.filter((r) => r.quality.issues.some((i) => i.code === "no_cost"));
        break;
      case "no_seo":
        arr = arr.filter((r) =>
          r.quality.issues.some(
            (i) => i.code === "no_seo_title" || i.code === "no_seo_description",
          ),
        );
        break;
      case "no_fiscal":
        arr = arr.filter((r) =>
          r.quality.issues.some((i) => ["no_ncm", "no_weight", "no_dimensions"].includes(i.code)),
        );
        break;
      case "no_tech":
        arr = arr.filter((r) => r.quality.issues.some((i) => i.code === "no_tech_attrs"));
        break;
      case "no_tech_power":
        arr = arr.filter((r) => r.quality.issues.some((i) => i.code === "no_tech_power"));
        break;
      case "no_tech_color_temp":
        arr = arr.filter((r) => r.quality.issues.some((i) => i.code === "no_tech_color_temp"));
        break;
      case "no_tech_voltage":
        arr = arr.filter((r) => r.quality.issues.some((i) => i.code === "no_tech_voltage"));
        break;
      case "no_tech_ip_rating":
        arr = arr.filter((r) => r.quality.issues.some((i) => i.code === "no_tech_ip_rating"));
        break;
    }
    const term = ts.q.trim().toLowerCase();
    if (term)
      arr = arr.filter(
        (r) => r.name.toLowerCase().includes(term) || (r.sku ?? "").toLowerCase().includes(term),
      );
    const dir = ts.sort.direction === "asc" ? 1 : -1;
    const col = ts.sort.column;
    return [...arr].sort((a, b) => {
      switch (col) {
        case "score":
          return (a.quality.score - b.quality.score) * dir;
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "sku":
          return (a.sku ?? "").localeCompare(b.sku ?? "") * dir;
        case "active":
          return ((a.active ? 1 : 0) - (b.active ? 1 : 0)) * dir;
        default:
          return 0;
      }
    });
  }, [rows, filter, ts.q, ts.sort]);

  const total = filtered.length;
  const paged = useMemo(() => {
    const start = (ts.page - 1) * ts.pageSize;
    return filtered.slice(start, start + ts.pageSize);
  }, [filtered, ts.page, ts.pageSize]);

  const hasFilters = ts.q !== "" || filter !== "all";

  const columns: DataTableColumn<ProductQualityRow>[] = [
    {
      id: "name",
      header: "Produto",
      sortable: true,
      cell: (r) => (
        <div className="flex items-center gap-2 min-w-0">
          <Package className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="font-medium truncate">{r.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {r.sku ?? "—"} {r.brand ? `· ${r.brand}` : ""}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "score",
      header: "Score",
      sortable: true,
      cell: (r) => <span className="font-semibold">{r.quality.score}</span>,
    },
    {
      id: "classification",
      header: "Classe",
      cell: (r) => {
        const c = qualityClassColor(r.quality.classification);
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}
          >
            {qualityClassLabel(r.quality.classification)}
          </span>
        );
      },
    },
    {
      id: "active",
      header: "Status",
      sortable: true,
      hideOnMobile: true,
      cell: (r) => (
        <div className="flex flex-col gap-1">
          <span
            className={`inline-flex w-fit items-center px-2 py-0.5 rounded text-[11px] font-medium ${r.active ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}
          >
            {r.active ? "Ativo" : "Inativo"}
          </span>
          {r.featured && r.quality.score < 70 && (
            <span className="inline-flex w-fit items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-500/10 text-red-700 dark:text-red-400">
              <AlertTriangle className="w-3 h-3" /> Destaque baixo
            </span>
          )}
          {r.featured && r.quality.score >= 70 && (
            <span className="inline-flex w-fit items-center px-2 py-0.5 rounded text-[11px] font-medium bg-primary/10 text-primary">
              Destaque
            </span>
          )}
        </div>
      ),
    },
    {
      id: "issues",
      header: "Pendências",
      hideOnMobile: true,
      cell: (r) => {
        const top = r.quality.issues.slice(0, 3);
        if (top.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <ul className="text-xs space-y-0.5">
            {top.map((i) => (
              <li key={i.code} className="text-muted-foreground">
                • {i.label}
              </li>
            ))}
            {r.quality.issues.length > top.length && (
              <li className="text-[11px] text-muted-foreground/70">
                + {r.quality.issues.length - top.length} outras
              </li>
            )}
          </ul>
        );
      },
    },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      headerClassName: "text-right",
      className: "text-right",
      cell: (r) => (
        <Link to={"/admin/produtos/$id" as never} params={{ id: r.id } as never}>
          <Button variant="outline" size="sm">
            Editar
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <AdminLayout
      title="Qualidade do cadastro"
      action={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Atualizando…" : "Atualizar scores"}
          </Button>
          <Link to={"/admin/produtos" as never}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" /> Produtos
            </Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <p className="text-sm text-muted-foreground max-w-2xl">
            Score de 0 a 100 baseado em mídia, conteúdo, SEO, fiscal/logística e custo. Os avisos
            são <strong>não-bloqueantes</strong> — o produto continua sendo vendido normalmente.
            Apenas o destaque (vitrines premium, featured) exige score mínimo de <strong>70</strong>
            .
          </p>
          {dataUpdatedAt > 0 && (
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              Atualizado às{" "}
              {formatTimeBR(dataUpdatedAt)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard
            label="Total"
            value={counts?.total ?? 0}
            onClick={() => ts.setFilter("filter", "all")}
            active={filter === "all"}
          />
          <SummaryCard
            label="Ruins"
            value={counts?.ruim ?? 0}
            tone="danger"
            onClick={() => ts.setFilter("filter", "ruim")}
            active={filter === "ruim"}
          />
          <SummaryCard
            label="Atenção"
            value={counts?.atencao ?? 0}
            tone="warn"
            onClick={() => ts.setFilter("filter", "atencao")}
            active={filter === "atencao"}
          />
          <SummaryCard
            label="Ativos < 70"
            value={counts?.activeBelow70 ?? 0}
            tone="warn"
            onClick={() => ts.setFilter("filter", "active_low")}
            active={filter === "active_low"}
          />
          <SummaryCard
            label="Destaques < 70"
            value={counts?.featuredBelow70 ?? 0}
            tone="danger"
            onClick={() => ts.setFilter("filter", "featured_low")}
            active={filter === "featured_low"}
          />
          <SummaryCard
            label="Sem imagem"
            value={counts?.missingImage ?? 0}
            tone="warn"
            onClick={() => ts.setFilter("filter", "no_image")}
            active={filter === "no_image"}
          />
        </div>

        <div className="bg-card border border-border rounded-xl">
          <DataTableToolbar
            q={ts.q}
            onQChange={ts.setQ}
            searchPlaceholder="Buscar por nome ou SKU…"
            hasActiveFilters={hasFilters}
            onClearFilters={ts.clearAll}
            filters={
              <Select value={filter} onValueChange={(v) => ts.setFilter("filter", v)}>
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
            }
            rightSlot={
              <span className="text-xs text-muted-foreground">
                {filtered.length} de {rows.length}
              </span>
            }
          />

          <DataTable<ProductQualityRow>
            columns={columns}
            rows={paged}
            loading={isLoading}
            sort={ts.sort}
            onSort={ts.setSort}
            rowKey={(r) => r.id}
            emptyTitle="Nenhum produto"
            emptyDescription="Nenhum produto neste filtro."
          />

          <DataTablePagination
            page={ts.page}
            pageSize={ts.pageSize}
            total={total}
            onPageChange={ts.setPage}
            onPageSizeChange={ts.setPageSize}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              { v: "no_image", icon: ImageIcon, label: "Sem imagem" },
              { v: "no_cost", icon: DollarSign, label: "Sem custo" },
              { v: "no_seo", icon: Search, label: "SEO incompleto" },
              { v: "no_fiscal", icon: FileText, label: "Fiscal/logística" },
              { v: "no_tech", icon: Package, label: "Sem atributos técnicos" },
              { v: "no_tech_power", icon: Package, label: "Sem potência" },
              { v: "no_tech_color_temp", icon: Package, label: "Sem temperatura" },
              { v: "no_tech_voltage", icon: Package, label: "Sem voltagem" },
              { v: "no_tech_ip_rating", icon: Package, label: "Sem IP" },
            ] as Array<{ v: Filter; icon: typeof Package; label: string }>
          ).map(({ v, icon: Icon, label }) => {
            const active = filter === v;
            return (
              <button
                key={v}
                onClick={() => ts.setFilter("filter", active ? "all" : v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:border-primary/40"}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: number;
  tone?: "warn" | "danger";
  onClick: () => void;
  active: boolean;
}) {
  const toneCls =
    tone === "danger"
      ? "text-red-700 dark:text-red-400"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-400"
        : "text-foreground";
  return (
    <button
      onClick={onClick}
      className={`text-left bg-card border rounded-xl p-3 transition-colors hover:border-primary/40 ${active ? "border-primary ring-2 ring-primary/20" : "border-border"}`}
    >
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${toneCls}`}>{value}</p>
    </button>
  );
}

type _C = QualityClass;
