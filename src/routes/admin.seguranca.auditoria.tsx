import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ScrollText,
  Download,
  RefreshCw,
  Search,
  Filter,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  searchAdminAuditLog,
  getAdminAuditLogDetail,
  getAdminAuditFilterOptions,
  exportAdminAuditCsv,
} from "@/server/security.functions";
import { formatDateTimeBR } from "@/lib/dateBR";

export const Route = createFileRoute("/admin/seguranca/auditoria")({
  component: AdminAuditLogPage,
});

const PERIOD_OPTIONS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "60", label: "Últimos 60 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "180", label: "Últimos 180 dias" },
  { value: "365", label: "Último ano" },
];

const RESOURCE_LABELS: Record<string, string> = {
  product: "Produtos",
  home_banner: "Banners",
  coupon: "Cupons",
  bundle: "Combos",
  bundle_item: "Itens de combo",
  company: "Empresas B2B",
  homepage_settings: "Homepage",
  finance_settings: "Financeiro",
  order: "Pedidos",
  invoice: "Notas fiscais",
  marketing_integration: "Integrações",
  banner_image: "Imagem de banner",
  fiscal_settings: "Fiscal",
};

function fmtDate(iso: string) {
  return formatDateTimeBR(iso);
}

function resourceLabel(t: string | null | undefined) {
  if (!t) return "—";
  return RESOURCE_LABELS[t] ?? t.replace(/_/g, " ");
}

function actionTone(action: string): "default" | "destructive" | "outline" | "secondary" {
  if (
    action.includes("deleted") ||
    action.includes("cancelled") ||
    action.includes("blocked") ||
    action.includes("rejected")
  ) {
    return "destructive";
  }
  if (action.includes("created") || action.includes("approved") || action.includes("unblocked")) {
    return "default";
  }
  return "secondary";
}

function AdminAuditLogPage() {
  const [days, setDays] = useState("30");
  const [resourceType, setResourceType] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [adminId, setAdminId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const pageSize = 50;

  const filterPayload = useMemo(
    () => ({
      days: Number(days),
      resourceType: resourceType === "all" ? undefined : resourceType,
      action: action === "all" ? undefined : action,
      adminId: adminId === "all" ? undefined : adminId,
      search: search.trim() || undefined,
      page,
      pageSize,
    }),
    [days, resourceType, action, adminId, search, page],
  );

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-audit-search", filterPayload],
    queryFn: () => searchAdminAuditLog({ data: filterPayload }),
  });

  const { data: filterOptions } = useQuery({
    queryKey: ["admin-audit-filter-options"],
    queryFn: () => getAdminAuditFilterOptions({ data: undefined as never }),
    staleTime: 60_000,
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportAdminAuditCsv({
        data: {
          days: Number(days),
          resourceType: resourceType === "all" ? undefined : resourceType,
          action: action === "all" ? undefined : action,
          adminId: adminId === "all" ? undefined : adminId,
          search: search.trim() || undefined,
        },
      });
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${res.count} registros exportados`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao exportar");
    } finally {
      setExporting(false);
    }
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AdminLayout
      title="Auditoria de ações administrativas"
      action={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={handleExport} disabled={exporting}>
            <Download className="w-4 h-4" /> {exporting ? "Exportando…" : "Exportar CSV"}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="w-4 h-4" /> Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <Select
                value={days}
                onValueChange={(v) => {
                  setDays(v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={resourceType}
                onValueChange={(v) => {
                  setResourceType(v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Módulo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os módulos</SelectItem>
                  {(filterOptions?.resourceTypes ?? []).map((r) => (
                    <SelectItem key={r} value={r}>
                      {resourceLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={action}
                onValueChange={(v) => {
                  setAction(v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as ações</SelectItem>
                  {(filterOptions?.actions ?? []).map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={adminId}
                onValueChange={(v) => {
                  setAdminId(v);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Administrador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os admins</SelectItem>
                  {(filterOptions?.admins ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.email ?? a.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearch(searchInput);
                  setPage(1);
                }}
                className="relative"
              >
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Buscar descrição/email/id…"
                  className="pl-9"
                />
              </form>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <ScrollText className="w-4 h-4" /> Histórico
              </span>
              <span className="text-xs text-muted-foreground font-normal">
                {total} {total === 1 ? "registro" : "registros"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
            ) : !data?.events.length ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhum registro encontrado para os filtros selecionados.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="py-2 pr-2 w-8" />
                      <th className="py-2 pr-3">Quando</th>
                      <th className="py-2 pr-3">Administrador</th>
                      <th className="py-2 pr-3">Ação</th>
                      <th className="py-2 pr-3">Módulo</th>
                      <th className="py-2 pr-3">Descrição</th>
                      <th className="py-2">Origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((e) => (
                      <AuditRow
                        key={e.id}
                        event={e}
                        expanded={expanded === e.id}
                        onToggle={() => setExpanded(expanded === e.id ? null : e.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <span className="text-xs text-muted-foreground">
                  Página {page} de {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

interface AuditEvent {
  id: string;
  admin_id: string | null;
  admin_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  description: string | null;
  ip: string | null;
  user_agent: string | null;
  source: string;
  created_at: string;
}

function AuditRow({
  event,
  expanded,
  onToggle,
}: {
  event: AuditEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ["audit-detail", event.id],
    queryFn: () => getAdminAuditLogDetail({ data: { id: event.id } }),
    enabled: expanded,
    staleTime: Infinity,
  });

  const sourceLabel =
    event.source === "trigger_user"
      ? "Admin"
      : event.source === "trigger_system"
        ? "Sistema"
        : "Servidor";

  return (
    <>
      <tr
        className={`border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors ${expanded ? "bg-muted/40" : ""}`}
        onClick={onToggle}
      >
        <td className="py-2 pr-2 text-muted-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">
          {fmtDate(event.created_at)}
        </td>
        <td className="py-2 pr-3 text-xs">
          {event.admin_email ?? (event.admin_id ? event.admin_id.slice(0, 8) : "sistema")}
        </td>
        <td className="py-2 pr-3">
          <Badge variant={actionTone(event.action)} className="text-[10px] uppercase">
            {event.action}
          </Badge>
        </td>
        <td className="py-2 pr-3 text-xs">{resourceLabel(event.resource_type)}</td>
        <td className="py-2 pr-3 text-xs max-w-[400px] truncate">{event.description ?? "—"}</td>
        <td className="py-2 text-xs text-muted-foreground">{sourceLabel}</td>
      </tr>
      {expanded && (
        <tr className="border-b bg-muted/20">
          <td colSpan={7} className="p-4">
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Carregando detalhe…</p>
            ) : detail?.event ? (
              <AuditDetail
                event={detail.event as AuditEvent & { before: unknown; after: unknown }}
              />
            ) : (
              <p className="text-xs text-muted-foreground">Sem detalhes adicionais.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function AuditDetail({ event }: { event: AuditEvent & { before: unknown; after: unknown } }) {
  const before = event.before as Record<string, unknown> | null;
  const after = event.after as Record<string, unknown> | null;

  // Computa diff: campos que mudaram
  const diff = useMemo(() => {
    if (!before || !after) return null;
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const out: Array<{ key: string; before: unknown; after: unknown }> = [];
    for (const k of keys) {
      if (k === "updated_at" || k === "created_at") continue;
      const b = (before as Record<string, unknown>)[k];
      const a = (after as Record<string, unknown>)[k];
      if (JSON.stringify(b) !== JSON.stringify(a)) out.push({ key: k, before: b, after: a });
    }
    return out;
  }, [before, after]);

  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DetailField label="ID do recurso" value={event.resource_id ?? "—"} mono />
        <DetailField label="IP" value={event.ip ?? "—"} mono />
        <DetailField label="Origem" value={event.source} />
        <DetailField label="User-agent" value={event.user_agent ?? "—"} className="truncate" />
      </div>

      {diff && diff.length > 0 && (
        <div>
          <p className="font-medium text-foreground mb-2">Campos alterados</p>
          <div className="rounded border bg-card divide-y">
            {diff.map((d) => (
              <div key={d.key} className="p-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                <code className="text-muted-foreground">{d.key}</code>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Antes</p>
                  <pre className="text-xs whitespace-pre-wrap break-all">
                    {formatValue(d.before)}
                  </pre>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Depois</p>
                  <pre className="text-xs whitespace-pre-wrap break-all">
                    {formatValue(d.after)}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(!diff || diff.length === 0) && (before || after) && (
        <details className="rounded border bg-card p-2">
          <summary className="cursor-pointer text-muted-foreground">Ver dados completos</summary>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            {before && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase mb-1">Antes</p>
                <pre className="text-xs whitespace-pre-wrap break-all bg-muted/40 p-2 rounded max-h-64 overflow-auto">
                  {JSON.stringify(before, null, 2)}
                </pre>
              </div>
            )}
            {after && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase mb-1">Depois</p>
                <pre className="text-xs whitespace-pre-wrap break-all bg-muted/40 p-2 rounded max-h-64 overflow-auto">
                  {JSON.stringify(after, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function DetailField({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className={mono ? "font-mono" : ""}>{value}</p>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v, null, 2);
}
