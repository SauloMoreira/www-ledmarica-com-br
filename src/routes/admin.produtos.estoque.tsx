import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  AlertTriangle,
  Package,
  RefreshCw,
  Download,
  TrendingUp,
  TimerOff,
  CircleSlash,
  CircleAlert,
  Settings,
} from "lucide-react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  getStockReport,
  exportStockCsv,
  getStockSettings,
  updateStockSettings,
  adjustProductStock,
  type StockReportRow,
  type StockSettings,
  type StockStatus,
} from "@/server/stockOps.functions";
import {
  DataTable,
  DataTableToolbar,
  DataTablePagination,
  type DataTableColumn,
} from "@/components/admin/datatable";
import { useTableState } from "@/hooks/useTableState";
import { formatDateBR } from "@/lib/dateBR";

type Filter =
  | "all"
  | "low"
  | "zero"
  | "inactive"
  | "high_movement"
  | "no_param"
  | "allow_oos"
  | "block_oos"
  | "healthy";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "low", label: "Estoque baixo" },
  { value: "zero", label: "Estoque zerado" },
  { value: "inactive", label: "Produto parado" },
  { value: "high_movement", label: "Alto giro" },
  { value: "healthy", label: "Saudável" },
  { value: "no_param", label: "Sem mínimo configurado" },
  { value: "allow_oos", label: "Permite venda sem estoque" },
  { value: "block_oos", label: "Não permite venda sem estoque" },
];

const searchSchema = z.object({
  page: fallback(z.number(), 1).default(1),
  pageSize: fallback(z.number(), 25).default(25),
  q: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "status.asc").default("status.asc"),
  filter: fallback(z.string(), "all").default("all"),
});

export const Route = createFileRoute("/admin/produtos/estoque")({
  validateSearch: zodValidator(searchSchema),
  component: StockPage,
});

function statusBadge(status: StockStatus) {
  switch (status) {
    case "healthy":
      return { label: "Saudável", cls: "bg-emerald-100 text-emerald-700" };
    case "low":
      return { label: "Baixo", cls: "bg-amber-100 text-amber-800" };
    case "zero":
      return { label: "Zerado", cls: "bg-red-100 text-red-700" };
    case "inactive":
      return { label: "Parado", cls: "bg-slate-200 text-slate-700" };
    case "high_movement":
      return { label: "Alto giro", cls: "bg-blue-100 text-blue-700" };
    case "no_param":
      return { label: "Sem parâmetro", cls: "bg-muted text-muted-foreground" };
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return formatDateBR(iso);
}

function StockPage() {
  const qc = useQueryClient();
  const ts = useTableState({
    page: 1,
    pageSize: 25,
    sort: { column: "status", direction: "asc" },
  });
  const filter = ((ts.search.filter as string) ?? "all") as Filter;
  const [showSettings, setShowSettings] = useState(false);
  const [adjusting, setAdjusting] = useState<StockReportRow | null>(null);

  const reportQ = useQuery({
    queryKey: ["admin-stock-report"],
    queryFn: () => getStockReport(),
    staleTime: 30_000,
  });
  const settingsQ = useQuery({
    queryKey: ["admin-stock-settings"],
    queryFn: () => getStockSettings(),
    staleTime: 60_000,
  });

  const rows = reportQ.data?.rows ?? [];
  const settings = reportQ.data?.settings ?? settingsQ.data;

  const counters = useMemo(() => {
    let low = 0,
      zero = 0,
      inactive = 0,
      high = 0,
      noParam = 0,
      healthy = 0,
      highLow = 0;
    for (const r of rows) {
      if (r.status === "low") low++;
      if (r.status === "zero") zero++;
      if (r.status === "inactive") inactive++;
      if (r.status === "high_movement") high++;
      if (r.status === "healthy") healthy++;
      if (r.stock_min_alert === null) noParam++;
      if (
        r.status === "high_movement" &&
        settings &&
        r.stock_qty <= (r.stock_min_alert ?? settings.default_min_stock)
      )
        highLow++;
    }
    return { low, zero, inactive, high, noParam, healthy, highLow };
  }, [rows, settings]);

  const order: Record<StockStatus, number> = {
    zero: 0,
    low: 1,
    high_movement: 2,
    inactive: 3,
    no_param: 4,
    healthy: 5,
  };

  const filtered = useMemo(() => {
    let arr = rows;
    switch (filter) {
      case "low":
        arr = arr.filter((r) => r.status === "low");
        break;
      case "zero":
        arr = arr.filter((r) => r.status === "zero");
        break;
      case "inactive":
        arr = arr.filter((r) => r.status === "inactive");
        break;
      case "high_movement":
        arr = arr.filter((r) => r.status === "high_movement");
        break;
      case "healthy":
        arr = arr.filter((r) => r.status === "healthy");
        break;
      case "no_param":
        arr = arr.filter((r) => r.stock_min_alert === null);
        break;
      case "allow_oos":
        arr = arr.filter((r) => r.allow_out_of_stock_sales);
        break;
      case "block_oos":
        arr = arr.filter((r) => !r.allow_out_of_stock_sales);
        break;
    }
    const term = ts.q.trim().toLowerCase();
    if (term) {
      arr = arr.filter(
        (r) =>
          r.name.toLowerCase().includes(term) ||
          (r.sku ?? "").toLowerCase().includes(term) ||
          (r.category_name ?? "").toLowerCase().includes(term),
      );
    }
    const dir = ts.sort.direction === "asc" ? 1 : -1;
    const col = ts.sort.column;
    return [...arr].sort((a, b) => {
      switch (col) {
        case "status":
          return (order[a.status] - order[b.status]) * dir;
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "sku":
          return (a.sku ?? "").localeCompare(b.sku ?? "") * dir;
        case "stock_qty":
          return (a.stock_qty - b.stock_qty) * dir;
        case "qty_sold_window":
          return (a.qty_sold_window - b.qty_sold_window) * dir;
        case "last_sold_at":
          return (
            (new Date(a.last_sold_at ?? 0).getTime() -
              new Date(b.last_sold_at ?? 0).getTime()) *
            dir
          );
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

  const handleExport = async () => {
    try {
      const res = await exportStockCsv();
      const blob = new Blob([res.content], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao exportar CSV.";
      toast.error(msg);
    }
  };

  const refresh = async () => {
    qc.invalidateQueries({ queryKey: ["admin-operations"] });
    await reportQ.refetch();
    toast.success("Relatório de estoque atualizado.");
  };

  const hasFilters = ts.q !== "" || filter !== "all";

  const columns: DataTableColumn<StockReportRow>[] = [
    {
      id: "name",
      header: "Produto",
      sortable: true,
      cell: (r) => (
        <span className="block max-w-[260px] truncate" title={r.name}>
          {r.name}
        </span>
      ),
    },
    {
      id: "sku",
      header: "SKU",
      sortable: true,
      hideOnMobile: true,
      cell: (r) => <span className="text-muted-foreground">{r.sku ?? "—"}</span>,
    },
    {
      id: "category",
      header: "Categoria",
      hideOnMobile: true,
      cell: (r) => <span className="text-muted-foreground">{r.category_name ?? "—"}</span>,
    },
    {
      id: "stock_qty",
      header: "Estoque",
      sortable: true,
      className: "text-right",
      headerClassName: "text-right",
      cell: (r) => <span className="font-medium">{r.stock_qty}</span>,
    },
    {
      id: "min",
      header: "Mín.",
      hideOnMobile: true,
      className: "text-right",
      headerClassName: "text-right",
      cell: (r) => <span className="text-muted-foreground">{r.stock_min_alert ?? "—"}</span>,
    },
    {
      id: "qty_sold_window",
      header: `Vendidos ${settings?.sales_window_days ?? 30}d`,
      sortable: true,
      hideOnMobile: true,
      className: "text-right",
      headerClassName: "text-right",
      cell: (r) => <span>{r.qty_sold_window}</span>,
    },
    {
      id: "last_sold_at",
      header: "Última venda",
      sortable: true,
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-muted-foreground">
          {fmtDate(r.last_sold_at)}
          {r.days_since_last_sale !== null && r.last_sold_at && (
            <span className="text-xs ml-1 opacity-70">({r.days_since_last_sale}d)</span>
          )}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      cell: (r) => {
        const b = statusBadge(r.status);
        return (
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${b.cls}`}>
            {b.label}
          </span>
        );
      },
    },
    {
      id: "oos",
      header: "Sem estoque",
      hideOnMobile: true,
      cell: (r) =>
        r.allow_out_of_stock_sales ? (
          <span className="text-amber-700 text-xs">Permitido</span>
        ) : (
          <span className="text-muted-foreground text-xs">Bloqueado</span>
        ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      headerClassName: "text-right",
      className: "text-right whitespace-nowrap",
      cell: (r) => (
        <>
          <Button size="sm" variant="outline" onClick={() => setAdjusting(r)}>
            Ajustar
          </Button>
          <Link to={"/admin/produtos/$id" as never} params={{ id: r.product_id } as never}>
            <Button size="sm" variant="ghost">
              Editar
            </Button>
          </Link>
        </>
      ),
    },
  ];

  return (
    <AdminLayout
      title="Estoque"
      action={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={reportQ.isFetching}>
            <RefreshCw className={`w-4 h-4 mr-1 ${reportQ.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" /> Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSettings((v) => !v)}>
            <Settings className="w-4 h-4 mr-1" /> Configurações
          </Button>
          <Link to={"/admin/produtos" as never}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" /> Produtos
            </Button>
          </Link>
        </div>
      }
    >
      {/* Cards principais */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <Card icon={CircleAlert} title="Estoque baixo" qty={counters.low} tone="warn" />
        <Card icon={CircleSlash} title="Estoque zerado" qty={counters.zero} tone="danger" />
        <Card icon={TimerOff} title="Produtos parados" qty={counters.inactive} tone="muted" />
        <Card icon={TrendingUp} title="Alto giro" qty={counters.high} tone="info" />
        <Card icon={AlertTriangle} title="Sem mínimo" qty={counters.noParam} tone="muted" />
        <Card icon={Package} title="Saudáveis" qty={counters.healthy} tone="ok" />
      </div>

      {counters.highLow > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <div>
            <strong>{counters.highLow}</strong> produto(s) com boa saída e estoque baixo. Avalie
            priorizar a reposição manual desses itens.
          </div>
        </div>
      )}

      {showSettings && settings && (
        <SettingsPanel
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin-stock-settings"] });
            qc.invalidateQueries({ queryKey: ["admin-stock-report"] });
            qc.invalidateQueries({ queryKey: ["admin-operations"] });
          }}
        />
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <DataTableToolbar
          q={ts.q}
          onQChange={ts.setQ}
          searchPlaceholder="Buscar por nome, SKU ou categoria…"
          hasActiveFilters={hasFilters}
          onClearFilters={ts.clearAll}
          filters={
            <Select value={filter} onValueChange={(v) => ts.setFilter("filter", v)}>
              <SelectTrigger className="h-9 w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        <DataTable<StockReportRow>
          columns={columns}
          rows={paged}
          loading={reportQ.isLoading}
          sort={ts.sort}
          onSort={ts.setSort}
          rowKey={(r) => r.product_id}
          emptyTitle="Nenhum produto"
          emptyDescription="Nenhum produto encontrado para esse filtro."
        />

        <DataTablePagination
          page={ts.page}
          pageSize={ts.pageSize}
          total={total}
          onPageChange={ts.setPage}
          onPageSizeChange={ts.setPageSize}
        />
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        Esta fase é apenas para visibilidade. Não bloqueia venda, não dispara compra e não envia
        pedido para fornecedor.
      </p>

      {adjusting && (
        <AdjustDialog
          row={adjusting}
          onClose={() => setAdjusting(null)}
          onAdjusted={() => {
            setAdjusting(null);
            reportQ.refetch();
          }}
        />
      )}
    </AdminLayout>
  );
}

function Card({
  icon: Icon,
  title,
  qty,
  tone,
}: {
  icon: typeof Package;
  title: string;
  qty: number;
  tone: "ok" | "warn" | "danger" | "info" | "muted";
}) {
  const tones: Record<typeof tone, string> = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
    muted: "border-border bg-card text-foreground",
  } as const;
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-xs font-medium opacity-80">
        <Icon className="w-4 h-4" /> {title}
      </div>
      <div className="text-2xl font-semibold mt-1">{qty}</div>
    </div>
  );
}

function AdjustDialog({
  row,
  onClose,
  onAdjusted,
}: {
  row: StockReportRow;
  onClose: () => void;
  onAdjusted: () => void;
}) {
  const [val, setVal] = useState(String(row.stock_qty));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }
    setSaving(true);
    try {
      await adjustProductStock({ data: { product_id: row.product_id, new_stock_qty: n } });
      toast.success("Estoque ajustado.");
      onAdjusted();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao ajustar estoque.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ajustar estoque</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{row.name}</p>
          <div>
            <label className="text-xs text-muted-foreground">Novo estoque</label>
            <Input
              type="number"
              min={0}
              value={val}
              onChange={(e) => setVal(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Estoque atual: {row.stock_qty}. O ajuste é registrado no log administrativo.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsPanel({
  settings,
  onClose,
  onSaved,
}: {
  settings: StockSettings;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    default_min_stock: settings.default_min_stock,
    inactive_days_threshold: settings.inactive_days_threshold,
    sales_window_days: settings.sales_window_days,
    high_movement_min_qty: settings.high_movement_min_qty,
    alert_low_stock_enabled: settings.alert_low_stock_enabled,
    alert_out_of_stock_enabled: settings.alert_out_of_stock_enabled,
    alert_inactive_product_enabled: settings.alert_inactive_product_enabled,
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await updateStockSettings({ data: form });
      toast.success("Configurações de estoque salvas.");
      onSaved();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao salvar.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">Configurações de estoque</h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <NumField
          label="Estoque mínimo padrão"
          help="Usado quando o produto não tem mínimo configurado."
          value={form.default_min_stock}
          onChange={(v) => setForm({ ...form, default_min_stock: v })}
        />
        <NumField
          label="Dias para considerar parado"
          help="Sem venda neste período → produto parado."
          value={form.inactive_days_threshold}
          onChange={(v) => setForm({ ...form, inactive_days_threshold: v })}
        />
        <NumField
          label="Janela de saída (dias)"
          help="Período usado para calcular quantidade vendida."
          value={form.sales_window_days}
          onChange={(v) => setForm({ ...form, sales_window_days: v })}
        />
        <NumField
          label="Mínimo para alto giro (un.)"
          help="Vendas no período ≥ valor → produto considerado de alto giro."
          value={form.high_movement_min_qty}
          onChange={(v) => setForm({ ...form, high_movement_min_qty: v })}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
        <ToggleField
          label="Alerta de estoque baixo"
          checked={form.alert_low_stock_enabled}
          onChange={(v) => setForm({ ...form, alert_low_stock_enabled: v })}
        />
        <ToggleField
          label="Alerta de estoque zerado"
          checked={form.alert_out_of_stock_enabled}
          onChange={(v) => setForm({ ...form, alert_out_of_stock_enabled: v })}
        />
        <ToggleField
          label="Alerta de produto parado"
          checked={form.alert_inactive_product_enabled}
          onChange={(v) => setForm({ ...form, alert_inactive_product_enabled: v })}
        />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

function NumField({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input
        type="number"
        min={0}
        value={String(value)}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
      {help && <p className="text-[11px] text-muted-foreground mt-1">{help}</p>}
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm border border-border rounded-md px-3 py-2 cursor-pointer hover:bg-muted/30">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded"
      />
      {label}
    </label>
  );
}
