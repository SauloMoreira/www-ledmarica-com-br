import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Mail, Pencil, ScrollText } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DataTable,
  DataTablePagination,
  DataTableToolbar,
  type DataTableColumn,
} from "@/components/admin/datatable";
import { useTableState } from "@/hooks/useTableState";
import { listEmailTemplates } from "@/server/emailTemplates.functions";
import { formatDateTimeBR } from "@/lib/dateBR";

const searchSchema = z.object({
  page: fallback(z.number(), 1).default(1),
  pageSize: fallback(z.number(), 25).default(25),
  q: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "display_name.asc").default("display_name.asc"),
  status: fallback(z.enum(["all", "active", "inactive"]), "all").default("all"),
  auto: fallback(z.enum(["all", "yes", "no"]), "all").default("all"),
});

export const Route = createFileRoute("/admin/comunicacao/emails/")({
  validateSearch: zodValidator(searchSchema),
  component: EmailTemplatesListPage,
});

type Row = {
  id: string;
  type: string;
  display_name: string;
  subject: string | null;
  is_active: boolean;
  auto_send: boolean;
  allow_manual_resend: boolean;
  updated_at: string;
};

function fmt(iso: string) {
  return formatDateTimeBR(iso);
}

function EmailTemplatesListPage() {
  const fetchList = useServerFn(listEmailTemplates);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const search = Route.useSearch();
  const { page, pageSize, q, sort, setPage, setPageSize, setQ, setSort, setFilter, clearAll } =
    useTableState({ page: 1, pageSize: 25, sort: { column: "display_name", direction: "asc" } });
  const status = search.status;
  const auto = search.auto;

  useEffect(() => {
    fetchList({ data: undefined as never })
      .then((r) => {
        if (r.ok) setRows(r.templates as Row[]);
        else setError(r.error);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erro"));
  }, [fetchList]);

  const filtered = useMemo(() => {
    let list = rows ?? [];
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter(
        (r) =>
          r.display_name.toLowerCase().includes(needle) ||
          r.type.toLowerCase().includes(needle) ||
          (r.subject ?? "").toLowerCase().includes(needle),
      );
    }
    if (status === "active") list = list.filter((r) => r.is_active);
    else if (status === "inactive") list = list.filter((r) => !r.is_active);
    if (auto === "yes") list = list.filter((r) => r.auto_send);
    else if (auto === "no") list = list.filter((r) => !r.auto_send);

    const sorted = [...list].sort((a, b) => {
      const dir = sort.direction === "asc" ? 1 : -1;
      const av = (a as any)[sort.column];
      const bv = (b as any)[sort.column];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "boolean") return (Number(av) - Number(bv)) * dir;
      return String(av).localeCompare(String(bv), "pt-BR") * dir;
    });
    return sorted;
  }, [rows, q, status, auto, sort]);

  const total = filtered.length;
  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  const hasActiveFilters = !!q || status !== "all" || auto !== "all";

  const columns: DataTableColumn<Row>[] = [
    {
      id: "display_name",
      header: "Modelo",
      sortable: true,
      cell: (r) => <span className="font-medium">{r.display_name}</span>,
    },
    {
      id: "type",
      header: "Chave técnica",
      sortable: true,
      cell: (r) => <span className="text-xs text-muted-foreground font-mono">{r.type}</span>,
    },
    {
      id: "is_active",
      header: "Status",
      sortable: true,
      cell: (r) => (
        <Badge variant={r.is_active ? "default" : "secondary"}>
          {r.is_active ? "Ativo" : "Inativo"}
        </Badge>
      ),
    },
    {
      id: "auto_send",
      header: "Envio automático",
      sortable: true,
      hideOnMobile: true,
      cell: (r) => (
        <Badge variant={r.auto_send ? "default" : "outline"}>{r.auto_send ? "Sim" : "Não"}</Badge>
      ),
    },
    {
      id: "allow_manual_resend",
      header: "Reenvio manual",
      hideOnMobile: true,
      cell: (r) => (
        <Badge variant={r.allow_manual_resend ? "default" : "outline"}>
          {r.allow_manual_resend ? "Sim" : "Não"}
        </Badge>
      ),
    },
    {
      id: "updated_at",
      header: "Atualizado",
      sortable: true,
      hideOnMobile: true,
      cell: (r) => <span className="text-xs text-muted-foreground">{fmt(r.updated_at)}</span>,
    },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      headerClassName: "text-right",
      className: "text-right",
      cell: (r) => (
        <Button asChild size="sm" variant="outline">
          <Link
            to={"/admin/comunicacao/emails/$type" as any}
            params={{ type: r.type } as any}
          >
            <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <AdminLayout title="Modelos de e-mail transacional">
      <p className="text-sm text-muted-foreground mb-4">
        Edite assunto, textos e CTA dos e-mails enviados ao cliente. O layout e blocos visuais
        permanecem padronizados.
      </p>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Mail className="w-4 h-4" /> {rows?.length ?? 0} modelos
        </div>
        <Button asChild variant="outline" size="sm">
          <Link
            to={"/admin/seguranca/auditoria" as any}
            search={{ resourceType: "email_template" } as any}
          >
            <ScrollText className="w-4 h-4 mr-1" /> Histórico de alterações
          </Link>
        </Button>
      </div>

      {error && <div className="text-sm text-destructive mb-3">Erro ao carregar: {error}</div>}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <DataTableToolbar
          q={q}
          onQChange={setQ}
          searchPlaceholder="Buscar por nome, chave ou assunto…"
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearAll}
          filters={
            <>
              <Select value={status} onValueChange={(v) => setFilter("status", v)}>
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="inactive">Inativos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={auto} onValueChange={(v) => setFilter("auto", v)}>
                <SelectTrigger className="h-9 w-[170px]">
                  <SelectValue placeholder="Envio automático" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Envio: todos</SelectItem>
                  <SelectItem value="yes">Auto: sim</SelectItem>
                  <SelectItem value="no">Auto: não</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        />
        <DataTable
          columns={columns}
          rows={paged}
          loading={rows === null}
          sort={sort}
          onSort={(c) => setSort(c)}
          rowKey={(r) => r.id}
          emptyTitle="Nenhum modelo encontrado"
          emptyDescription="Ajuste a busca ou os filtros."
        />
        <DataTablePagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </AdminLayout>
  );
}
