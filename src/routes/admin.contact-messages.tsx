import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Archive, CheckCircle2, Eye } from "lucide-react";
import { toast } from "sonner";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import {
  adminListContactMessages,
  adminUpdateContactMessageStatus,
} from "@/server/institutional.functions";
import { formatDateTimeBR } from "@/lib/dateBR";

const searchSchema = z.object({
  page: fallback(z.number(), 1).default(1),
  pageSize: fallback(z.number(), 25).default(25),
  q: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "created_at.desc").default("created_at.desc"),
  status: fallback(
    z.enum(["all", "new", "read", "answered", "archived"]),
    "all",
  ).default("all"),
});

export const Route = createFileRoute("/admin/contact-messages")({
  validateSearch: zodValidator(searchSchema),
  component: AdminContactMessages,
});

type Msg = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  new: "Nova",
  read: "Lida",
  answered: "Respondida",
  archived: "Arquivada",
};

function AdminContactMessages() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-contact-messages"],
    queryFn: () => adminListContactMessages({ data: undefined as never }),
  });
  const [selected, setSelected] = useState<Msg | null>(null);

  const sp = Route.useSearch();
  const { page, pageSize, q, sort, setPage, setPageSize, setQ, setSort, setFilter, clearAll } =
    useTableState({ page: 1, pageSize: 25, sort: { column: "created_at", direction: "desc" } });

  const setStatus = useMutation({
    mutationFn: (p: { id: string; status: "new" | "read" | "answered" | "archived" }) =>
      adminUpdateContactMessageStatus({ data: p }),
    onSuccess: () => {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["admin-contact-messages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const messages = (data?.messages as Msg[] | undefined) ?? [];

  const filtered = useMemo(() => {
    let arr = messages;
    if (q) {
      const n = q.toLowerCase();
      arr = arr.filter(
        (m) =>
          m.name.toLowerCase().includes(n) ||
          m.email.toLowerCase().includes(n) ||
          (m.subject ?? "").toLowerCase().includes(n) ||
          m.message.toLowerCase().includes(n),
      );
    }
    if (sp.status !== "all") arr = arr.filter((m) => m.status === sp.status);

    return [...arr].sort((a, b) => {
      const dir = sort.direction === "asc" ? 1 : -1;
      const av = (a as any)[sort.column];
      const bv = (b as any)[sort.column];
      if (av == null) return 1;
      if (bv == null) return -1;
      return String(av).localeCompare(String(bv), "pt-BR") * dir;
    });
  }, [messages, q, sp.status, sort]);

  const total = filtered.length;
  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  const hasActiveFilters = !!q || sp.status !== "all";

  const columns: DataTableColumn<Msg>[] = [
    {
      id: "created_at",
      header: "Data",
      sortable: true,
      cell: (m) => (
        <span className="text-muted-foreground text-xs">
          {formatDateTimeBR(m.created_at)}
        </span>
      ),
    },
    {
      id: "name",
      header: "Nome",
      sortable: true,
      cell: (m) => <span className="font-medium">{m.name}</span>,
    },
    {
      id: "email",
      header: "E-mail",
      sortable: true,
      hideOnMobile: true,
      cell: (m) => <span className="text-muted-foreground">{m.email}</span>,
    },
    {
      id: "subject",
      header: "Assunto",
      hideOnMobile: true,
      cell: (m) => (
        <span className="text-muted-foreground truncate block max-w-[260px]">
          {m.subject || "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      cell: (m) => (
        <Badge variant={m.status === "new" ? "default" : "outline"}>
          {STATUS_LABEL[m.status] || m.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      headerClassName: "text-right",
      className: "text-right",
      cell: (m) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setSelected(m);
            if (m.status === "new") setStatus.mutate({ id: m.id, status: "read" });
          }}
        >
          <Eye className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  return (
    <AdminLayout title="Mensagens de Contato">
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <DataTableToolbar
          q={q}
          onQChange={setQ}
          searchPlaceholder="Buscar por nome, e-mail, assunto…"
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearAll}
          filters={
            <Select value={sp.status} onValueChange={(v) => setFilter("status", v)}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="new">Novas</SelectItem>
                <SelectItem value="read">Lidas</SelectItem>
                <SelectItem value="answered">Respondidas</SelectItem>
                <SelectItem value="archived">Arquivadas</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <DataTable
          columns={columns}
          rows={paged}
          loading={isLoading}
          sort={sort}
          onSort={(c) => setSort(c)}
          rowKey={(m) => m.id}
          emptyTitle="Nenhuma mensagem"
        />
        <DataTablePagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.subject || "Mensagem de contato"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Nome</div>
                    <div>{selected.name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">E-mail</div>
                    <div>{selected.email}</div>
                  </div>
                  {selected.phone && (
                    <div>
                      <div className="text-xs text-muted-foreground">Telefone</div>
                      <div>{selected.phone}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-muted-foreground">Recebida</div>
                    <div>{formatDateTimeBR(selected.created_at)}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Mensagem</div>
                  <div className="rounded-md border border-border p-3 whitespace-pre-wrap bg-muted/30">
                    {selected.message}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button asChild size="sm">
                    <a
                      href={`mailto:${selected.email}?subject=${encodeURIComponent("Re: " + (selected.subject || "Seu contato"))}`}
                    >
                      <Mail className="w-4 h-4" /> Responder por e-mail
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStatus.mutate({ id: selected.id, status: "answered" })}
                  >
                    <CheckCircle2 className="w-4 h-4" /> Marcar como respondida
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setStatus.mutate({ id: selected.id, status: "archived" });
                      setSelected(null);
                    }}
                  >
                    <Archive className="w-4 h-4" /> Arquivar
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
