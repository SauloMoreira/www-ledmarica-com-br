import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, FileText, Plus, Printer, Trash2 } from "lucide-react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { buildSeo } from "@/lib/seo";
import { formatCNPJ } from "@/lib/cnpj";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DataTable,
  DataTableToolbar,
  DataTablePagination,
  type DataTableColumn,
} from "@/components/admin/datatable";
import { useTableState } from "@/hooks/useTableState";
import {
  formatDateTimeBR,
  formatMoney,
  hoursUntil,
  QUOTE_STATUS_CLASS,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUSES,
  type QuoteStatus,
} from "@/lib/quotes";
import { deleteQuote, duplicateQuote, listQuotes } from "@/server/quotes.functions";

type Row = Awaited<ReturnType<typeof listQuotes>>["rows"][number];

const searchSchema = z.object({
  page: fallback(z.number(), 1).default(1),
  pageSize: fallback(z.number(), 25).default(25),
  q: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "issued_at.desc").default("issued_at.desc"),
  status: fallback(z.enum(["all", ...QUOTE_STATUSES]), "all").default("all"),
});

export const Route = createFileRoute("/admin/orcamentos/")({
  validateSearch: zodValidator(searchSchema),
  head: () => buildSeo({ title: "Orçamentos PJ", url: "/admin/orcamentos", noindex: true }),
  component: QuotesListPage,
});

function QuotesListPage() {
  const navigate = useNavigate();
  const ts = useTableState({ page: 1, pageSize: 25, sort: { column: "issued_at", direction: "desc" } });
  const status = ((ts.search.status as string) ?? "all") as "all" | QuoteStatus;
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toDelete, setToDelete] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listQuotes({ data: { status, q: ts.q, page: ts.page, pageSize: ts.pageSize } });
      setRows(r.rows);
      setTotal(r.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [status, ts.q, ts.page, ts.pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const doDuplicate = async (r: Row) => {
    try {
      const d = await duplicateQuote({ data: { id: r.id } });
      toast.success(`Orçamento ${d.number} criado`);
      navigate({ to: "/admin/orcamentos/$id", params: { id: d.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao duplicar");
    }
  };

  const doDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteQuote({ data: { id: toDelete.id } });
      toast.success("Orçamento excluído");
      setToDelete(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  };

  const columns: DataTableColumn<Row>[] = [
    {
      id: "number",
      header: "Número",
      cell: (r) => <span className="font-mono font-semibold">{r.number}</span>,
    },
    {
      id: "client",
      header: "Cliente",
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground truncate">{r.client_legal_name}</div>
          <div className="text-xs text-muted-foreground font-mono">{formatCNPJ(r.client_cnpj)}</div>
        </div>
      ),
    },
    {
      id: "issued_at",
      header: "Emissão",
      hideOnMobile: true,
      cell: (r) => <span className="text-xs text-muted-foreground">{formatDateTimeBR(r.issued_at)}</span>,
    },
    {
      id: "expires_at",
      header: "Validade",
      hideOnMobile: true,
      cell: (r) => {
        if (r.status === "expirado")
          return <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${QUOTE_STATUS_CLASS.expirado}`}>Expirado</span>;
        const h = hoursUntil(r.expires_at);
        if (r.status === "rascunho" || r.status === "enviado")
          return <span className="text-xs text-muted-foreground">expira em {h}h</span>;
        return <span className="text-xs text-muted-foreground">{r.validity_hours}h</span>;
      },
    },
    {
      id: "total",
      header: "Total",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (r) => <span className="font-semibold">{formatMoney(r.total)}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${QUOTE_STATUS_CLASS[r.status]}`}>
          {QUOTE_STATUS_LABEL[r.status]}
        </span>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="icon" variant="ghost" aria-label={`Duplicar ${r.number}`} onClick={() => doDuplicate(r)}>
            <Copy className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" asChild>
            <a href={`/admin/orcamentos/${r.id}/imprimir`} target="_blank" rel="noopener" aria-label={`Imprimir ${r.number}`}>
              <Printer className="w-4 h-4" />
            </a>
          </Button>
          {r.status === "rascunho" && (
            <Button size="icon" variant="ghost" aria-label={`Excluir ${r.number}`} onClick={() => setToDelete(r)}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AdminLayout title="Orçamentos PJ">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-display font-bold text-foreground">Orçamentos PJ</h2>
          </div>
          <Button asChild>
            <Link to="/admin/orcamentos/novo">
              <Plus className="w-4 h-4" /> Novo orçamento
            </Link>
          </Button>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <DataTableToolbar
            q={ts.q}
            onQChange={ts.setQ}
            searchPlaceholder="Buscar por número, razão social ou CNPJ…"
            hasActiveFilters={ts.q !== "" || status !== "all"}
            onClearFilters={() => ts.clearAll()}
            filters={
              <Select value={status} onValueChange={(v) => ts.setFilter("status", v)}>
                <SelectTrigger className="h-9 w-[160px]" aria-label="Filtrar status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {QUOTE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {QUOTE_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
          <DataTable<Row>
            columns={columns}
            rows={rows}
            loading={loading}
            sort={ts.sort}
            onSort={ts.setSort}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate({ to: "/admin/orcamentos/$id", params: { id: r.id } })}
            emptyTitle="Nenhum orçamento"
            emptyDescription="Crie o primeiro orçamento PJ pelo botão “Novo orçamento”."
          />
          <DataTablePagination
            page={ts.page}
            pageSize={ts.pageSize}
            total={total}
            onPageChange={ts.setPage}
            onPageSizeChange={ts.setPageSize}
          />
        </div>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir orçamento {toDelete?.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. Só rascunhos podem ser excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
