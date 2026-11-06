import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Building2, CheckCircle2, ShieldX, XCircle, Clock } from "lucide-react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { buildSeo } from "@/lib/seo";
import { formatCNPJ } from "@/lib/cnpj";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminListCompanies, adminUpdateCompanyStatus } from "@/server/companies.functions";
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
import { formatDateBR } from "@/lib/dateBR";

type Company = {
  id: string;
  cnpj: string;
  legal_name: string;
  trade_name: string | null;
  status: "pending" | "approved" | "blocked" | "rejected";
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  created_at: string;
  rejection_reason: string | null;
  admin_notes: string | null;
};

type StatusFilter = "all" | "pending" | "approved" | "blocked" | "rejected";

const searchSchema = z.object({
  page: fallback(z.number(), 1).default(1),
  pageSize: fallback(z.number(), 25).default(25),
  q: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "created_at.desc").default("created_at.desc"),
  status: fallback(
    z.enum(["all", "pending", "approved", "blocked", "rejected"]),
    "pending",
  ).default("pending"),
});

export const Route = createFileRoute("/admin/empresas")({
  validateSearch: zodValidator(searchSchema),
  head: () => buildSeo({ title: "Empresas B2B", url: "/admin/empresas", noindex: true }),
  component: AdminEmpresasPage,
});

function AdminEmpresasPage() {
  const ts = useTableState({
    page: 1,
    pageSize: 25,
    sort: { column: "created_at", direction: "desc" },
  });
  const status = ((ts.search.status as string) ?? "pending") as StatusFilter;

  const [items, setItems] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Company | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { companies } = await adminListCompanies({
        data: {
          status: (status === "all" ? undefined : status) as
            | "pending"
            | "approved"
            | "blocked"
            | "rejected"
            | undefined,
          search: "",
        },
      });
      setItems(companies as Company[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const updateStatus = async (
    company_id: string,
    next: "approved" | "rejected" | "blocked" | "pending",
    extras?: { rejection_reason?: string; admin_notes?: string },
  ) => {
    try {
      await adminUpdateCompanyStatus({ data: { company_id, status: next, ...extras } });
      toast.success("Status atualizado");
      setSelected(null);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao atualizar";
      toast.error(msg);
    }
  };

  const filtered = useMemo(() => {
    const term = ts.q.trim().toLowerCase();
    let arr = items.filter((c) => {
      if (!term) return true;
      const cnpjDigits = (c.cnpj ?? "").replace(/\D+/g, "");
      return (
        c.legal_name.toLowerCase().includes(term) ||
        (c.trade_name ?? "").toLowerCase().includes(term) ||
        cnpjDigits.includes(term.replace(/\D+/g, "")) ||
        c.contact_name.toLowerCase().includes(term) ||
        c.contact_email.toLowerCase().includes(term)
      );
    });
    const dir = ts.sort.direction === "asc" ? 1 : -1;
    const col = ts.sort.column;
    arr = [...arr].sort((a, b) => {
      const av = (a as Record<string, unknown>)[col];
      const bv = (b as Record<string, unknown>)[col];
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
    return arr;
  }, [items, ts.q, ts.sort]);

  const total = filtered.length;
  const paged = useMemo(() => {
    const start = (ts.page - 1) * ts.pageSize;
    return filtered.slice(start, start + ts.pageSize);
  }, [filtered, ts.page, ts.pageSize]);

  const hasFilters = ts.q !== "" || status !== "pending";

  const columns: DataTableColumn<Company>[] = [
    {
      id: "legal_name",
      header: "Empresa",
      sortable: true,
      cell: (c) => (
        <div>
          <div className="font-medium text-foreground">{c.trade_name || c.legal_name}</div>
          {c.trade_name && (
            <div className="text-xs text-muted-foreground">{c.legal_name}</div>
          )}
        </div>
      ),
    },
    {
      id: "cnpj",
      header: "CNPJ",
      sortable: true,
      hideOnMobile: true,
      cell: (c) => <span className="text-foreground/80">{formatCNPJ(c.cnpj)}</span>,
    },
    {
      id: "contact_name",
      header: "Responsável",
      sortable: true,
      hideOnMobile: true,
      cell: (c) => (
        <div className="text-foreground/80">
          <div>{c.contact_name}</div>
          <div className="text-xs text-muted-foreground">{c.contact_email}</div>
        </div>
      ),
    },
    {
      id: "created_at",
      header: "Cadastro",
      sortable: true,
      hideOnMobile: true,
      cell: (c) => (
        <span className="text-xs text-muted-foreground">
          {formatDateBR(c.created_at)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      className: "text-right",
      headerClassName: "text-right",
      cell: (c) => <StatusBadge status={c.status} />,
    },
  ];

  return (
    <AdminLayout title="Empresas B2B">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link
            to={"/admin" as never}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar ao painel
          </Link>
        </div>
        <div className="flex items-center gap-3 mb-6">
          <Building2 className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-display font-bold text-foreground">Empresas cadastradas</h2>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <DataTableToolbar
            q={ts.q}
            onQChange={ts.setQ}
            searchPlaceholder="Buscar por razão social, CNPJ, responsável ou e-mail…"
            hasActiveFilters={hasFilters}
            onClearFilters={() => {
              ts.clearAll();
              ts.setFilter("status", "pending");
            }}
            filters={
              <Select value={status} onValueChange={(v) => ts.setFilter("status", v)}>
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="approved">Aprovadas</SelectItem>
                  <SelectItem value="blocked">Bloqueadas</SelectItem>
                  <SelectItem value="rejected">Recusadas</SelectItem>
                </SelectContent>
              </Select>
            }
          />

          <DataTable<Company>
            columns={columns}
            rows={paged}
            loading={loading}
            sort={ts.sort}
            onSort={ts.setSort}
            rowKey={(c) => c.id}
            onRowClick={(c) => setSelected(c)}
            emptyTitle="Nenhuma empresa"
            emptyDescription="Nenhuma empresa encontrada com os filtros atuais."
          />

          <DataTablePagination
            page={ts.page}
            pageSize={ts.pageSize}
            total={total}
            onPageChange={ts.setPage}
            onPageSizeChange={ts.setPageSize}
          />
        </div>

        {selected && (
          <Drawer
            company={selected}
            onClose={() => setSelected(null)}
            onApprove={() => updateStatus(selected.id, "approved")}
            onReject={(reason) =>
              updateStatus(selected.id, "rejected", { rejection_reason: reason })
            }
            onBlock={() => updateStatus(selected.id, "blocked")}
            onReactivate={() => updateStatus(selected.id, "approved")}
            onResetPending={() => updateStatus(selected.id, "pending")}
          />
        )}
      </div>
    </AdminLayout>
  );
}

function StatusBadge({ status }: { status: Company["status"] }) {
  const map = {
    pending: { Icon: Clock, cls: "bg-warning/15 text-warning", label: "Pendente" },
    approved: { Icon: CheckCircle2, cls: "bg-success/15 text-success", label: "Aprovada" },
    blocked: { Icon: ShieldX, cls: "bg-destructive/15 text-destructive", label: "Bloqueada" },
    rejected: { Icon: XCircle, cls: "bg-destructive/15 text-destructive", label: "Recusada" },
  } as const;
  const info = map[status];
  const Icon = info.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold ${info.cls}`}
    >
      <Icon className="w-3 h-3" /> {info.label}
    </span>
  );
}

function Drawer({
  company,
  onClose,
  onApprove,
  onReject,
  onBlock,
  onReactivate,
  onResetPending,
}: {
  company: Company;
  onClose: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onBlock: () => void;
  onReactivate: () => void;
  onResetPending: () => void;
}) {
  const [reason, setReason] = useState(company.rejection_reason ?? "");
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-lg bg-background border-l border-border h-full overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">
            {company.trade_name || company.legal_name}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
        <div className="space-y-2 text-sm">
          <Info label="Razão social" value={company.legal_name} />
          <Info label="CNPJ" value={formatCNPJ(company.cnpj)} />
          <Info label="Responsável" value={company.contact_name} />
          <Info label="E-mail" value={company.contact_email} />
          <Info label="Telefone" value={company.contact_phone} />
          <Info label="Status atual" value={<StatusBadge status={company.status} />} />
        </div>

        {(company.status === "rejected" || company.status === "pending") && (
          <div className="mt-6">
            <label className="text-xs font-medium text-foreground">Motivo (caso recuse)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
            />
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-2">
          {company.status !== "approved" && (
            <button
              onClick={company.status === "blocked" ? onReactivate : onApprove}
              className="h-10 rounded-md bg-success text-success-foreground font-semibold"
            >
              {company.status === "blocked" ? "Reativar" : "Aprovar"}
            </button>
          )}
          {company.status !== "rejected" && company.status !== "blocked" && (
            <button
              onClick={() => {
                if (!reason.trim()) {
                  toast.error("Informe o motivo da recusa");
                  return;
                }
                onReject(reason);
              }}
              className="h-10 rounded-md bg-destructive text-destructive-foreground font-semibold"
            >
              Recusar
            </button>
          )}
          {company.status === "approved" && (
            <button
              onClick={onBlock}
              className="h-10 rounded-md bg-destructive text-destructive-foreground font-semibold"
            >
              Bloquear
            </button>
          )}
          {company.status !== "pending" && (
            <button
              onClick={onResetPending}
              className="h-10 rounded-md border border-border text-foreground font-medium col-span-2"
            >
              Voltar para pendente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm border-b border-border pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground text-right">{value}</span>
    </div>
  );
}
