import { createFileRoute, Link } from "@tanstack/react-router";
import { formatStoredTaxDocument } from "@/lib/taxDocument";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Receipt,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  ExternalLink,
  Search,
  Copy,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listInvoices,
  getInvoiceSummary,
  registerInvoice,
  getInvoiceDetail,
  setInvoiceStatus,
  INVOICE_STATUS_LABEL,
  type InvoiceStatus,
} from "@/server/invoices.functions";
import {
  InvoiceDeliveryPanel,
  toDeliveryState,
} from "@/components/admin/invoices/InvoiceDeliveryPanel";

export const Route = createFileRoute("/admin/financeiro/notas-fiscais")({
  component: NotasFiscaisPage,
});

type Row = Awaited<ReturnType<typeof listInvoices>> extends { rows: infer R } ? R : never;

function fmtBRL(n: number | string | null | undefined) {
  return Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d: string | null | undefined) {
  return d ? new Date(d).toLocaleString("pt-BR") : "—";
}
function hoursSince(d: string | null | undefined) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 3600000);
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    nao_necessaria: "bg-muted text-muted-foreground",
    pendente_emissao: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    emitida: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    erro_emissao: "bg-red-500/10 text-red-700 dark:text-red-400",
    cancelada: "bg-muted text-muted-foreground line-through",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${map[s] ?? "bg-muted"}`}
    >
      {INVOICE_STATUS_LABEL[s as InvoiceStatus] ?? s}
    </span>
  );
}

function FiscalIssuesBanner() {
  const { data } = useQuery({
    queryKey: ["fiscal-paid-issues"],
    queryFn: async () => {
      const { listPaidOrdersWithFiscalIssues } = await import("@/server/fiscal.functions");
      return listPaidOrdersWithFiscalIssues();
    },
  });
  if (!data || data.length === 0) return null;
  const orderIds = Array.from(new Set(data.map((d) => d.order_id)));
  return (
    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-sm">
            {orderIds.length} pedido(s) pago(s) com produto sem dados fiscais completos.
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Informativo apenas. Os campos fiscais são opcionais — a emissão da NF é feita fora do sistema.
          </p>
          <div className="mt-2 text-xs text-amber-700 dark:text-amber-400 line-clamp-2">
            {data
              .slice(0, 4)
              .map((d) => d.product_name)
              .join(" • ")}
            {data.length > 4 && ` +${data.length - 4}`}
          </div>
          <div className="mt-2">
            <Link
              to="/admin/financeiro/impostos"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              <FileText className="w-3 h-3" /> Ir para Impostos
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotasFiscaisPage() {
  const qc = useQueryClient();
  const list = useServerFn(listInvoices);
  const setStatus = useServerFn(setInvoiceStatus);

  const [filters, setFilters] = useState({
    status: "all",
    orderType: "all" as "all" | "b2c" | "b2b",
    search: "",
    onlyOverdue: false,
    page: 1,
  });

  const summary = useQuery({
    queryKey: ["invoice-summary"],
    queryFn: () => getInvoiceSummary(),
    staleTime: 60_000,
  });

  const rows = useQuery({
    queryKey: ["invoices", filters],
    queryFn: () =>
      list({
        data: {
          status: filters.status,
          orderType: filters.orderType,
          search: filters.search || undefined,
          onlyOverdue: filters.onlyOverdue,
          page: filters.page,
          pageSize: 25,
        },
      }),
    staleTime: 30_000,
  });

  const [registerOrder, setRegisterOrder] = useState<{ id: string; number: number } | null>(null);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["invoice-summary"] });
  };

  const handleQuickStatus = async (orderId: string, newStatus: InvoiceStatus) => {
    const r = await setStatus({ data: { orderId, status: newStatus } });
    if (!r.ok) toast.error(r.error ?? "Falha ao atualizar status");
    else {
      toast.success("Status fiscal atualizado");
      refreshAll();
    }
  };

  return (
    <AdminLayout
      title="Notas fiscais"
      action={
        <Button size="sm" variant="outline" onClick={refreshAll}>
          <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground -mt-2 mb-6">
        <strong>Controle fiscal externo.</strong> A emissão de nota fiscal é feita fora do sistema
        (contador/emissor próprio). Esta tela é apenas para{" "}
        <strong>acompanhamento manual opcional</strong>: registre aqui número/série/data da NF
        emitida externamente, se quiser manter o histórico. Pedidos não ficam bloqueados pela
        ausência de NF.
      </p>

      <FiscalIssuesBanner />

      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard icon={Clock} label="Pendentes" value={summary.data?.pendentes} accent="warn" />
        <SummaryCard
          icon={CheckCircle2}
          label="Emitidas"
          value={summary.data?.emitidas}
          accent="ok"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Com erro"
          value={summary.data?.comErro}
          accent="danger"
        />
        <SummaryCard icon={XCircle} label="Canceladas" value={summary.data?.canceladas} />
        <SummaryCard
          icon={Receipt}
          label="Pagos sem nota"
          value={summary.data?.semNota}
          accent="warn"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="+24h sem nota"
          value={summary.data?.overdue}
          accent="danger"
        />
        <SummaryCard
          icon={FileText}
          label="B2B sem nota"
          value={summary.data?.b2bSemNota}
          accent="warn"
        />
        <SummaryCard icon={Receipt} label="Pagos no mês" value={summary.data?.paidMonth} />
      </div>

      {/* Filtros */}
      <div className="bg-card border border-border rounded-xl p-4 mb-4 grid gap-3 md:grid-cols-12">
        <div className="md:col-span-4">
          <Label className="text-xs">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-7"
              placeholder="Pedido, cliente, CNPJ, número/chave da NF…"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
            />
          </div>
        </div>
        <div className="md:col-span-3">
          <Label className="text-xs">Status fiscal</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
          >
            <option value="all">Todos</option>
            <option value="pendente_emissao">Pendente</option>
            <option value="emitida">Emitida</option>
            <option value="erro_emissao">Com erro</option>
            <option value="cancelada">Cancelada</option>
            <option value="nao_necessaria">Não necessária</option>
            <option value="sem_nota">Sem nota (não necessária + pendente)</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Tipo</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={filters.orderType}
            onChange={(e) =>
              setFilters({
                ...filters,
                orderType: e.target.value as "all" | "b2c" | "b2b",
                page: 1,
              })
            }
          >
            <option value="all">B2C + B2B</option>
            <option value="b2c">B2C</option>
            <option value="b2b">B2B</option>
          </select>
        </div>
        <div className="md:col-span-3 flex items-end">
          <label className="inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={filters.onlyOverdue}
              onChange={(e) => setFilters({ ...filters, onlyOverdue: e.target.checked, page: 1 })}
            />
            Apenas pagos há +24h sem nota
          </label>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Cliente / Empresa</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status fiscal</TableHead>
              <TableHead>NF</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : !rows.data?.ok || rows.data.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                  Nenhum pedido encontrado.
                </TableCell>
              </TableRow>
            ) : (
              rows.data.rows.map((r: any) => {
                const h = hoursSince(r.paid_at);
                const overdue = r.invoice_status === "pendente_emissao" && (h ?? 0) >= 24;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        to="/admin/pedidos/$orderId"
                        params={{ orderId: r.id }}
                        className="text-primary hover:underline font-mono text-xs"
                      >
                        #{r.order_number}
                      </Link>
                      <div className="text-[10px] text-muted-foreground">
                        {fmtDate(r.paid_at)}
                        {h !== null && <span className="ml-1">· há {h}h</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.order_type === "b2b" ? (
                        <>
                          <div className="font-medium">{r.company_name ?? "—"}</div>
                          <div className="text-muted-foreground">{r.company_cnpj ?? ""}</div>
                        </>
                      ) : r.customer_document_type === "cnpj" ? (
                        <>
                          <div className="font-medium">{r.customer_legal_name ?? "—"}</div>
                          <div className="text-muted-foreground">
                            CNPJ {formatStoredTaxDocument(r.customer_cnpj)}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="font-medium">{r.customer_name ?? "—"}</div>
                          <div className="text-muted-foreground">{r.customer_email ?? ""}</div>
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.order_type === "b2b" ? "default" : "secondary"}>
                        {r.order_type === "b2b" ? "B2B" : "B2C"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{fmtDate(r.paid_at)}</TableCell>
                    <TableCell className="text-xs">{fmtBRL(r.total)}</TableCell>
                    <TableCell>
                      {statusBadge(r.invoice_status)}
                      {overdue && (
                        <div className="text-[10px] text-red-600 mt-0.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> +24h sem nota
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.invoice_number ? (
                        <>
                          <div>
                            #{r.invoice_number}
                            {r.invoice_series ? `/s${r.invoice_series}` : ""}
                          </div>
                          {r.invoice_access_key && (
                            <button
                              className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                              onClick={() => {
                                navigator.clipboard.writeText(r.invoice_access_key);
                                toast.success("Chave copiada");
                              }}
                            >
                              <Copy className="w-2.5 h-2.5" />
                              {r.invoice_access_key.slice(0, 6)}…{r.invoice_access_key.slice(-4)}
                            </button>
                          )}
                          <div className="flex gap-2 mt-0.5">
                            {r.invoice_danfe_url && (
                              <a
                                href={r.invoice_danfe_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5"
                              >
                                DANFE <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                            {r.invoice_xml_url && (
                              <a
                                href={r.invoice_xml_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5"
                              >
                                XML <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {(r.invoice_pdf_path || r.invoice_email_sent_at) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {r.invoice_pdf_path && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                              <FileText className="w-2.5 h-2.5" aria-hidden /> PDF anexado
                            </span>
                          )}
                          {r.invoice_email_sent_at && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400"
                              title={`Enviada para ${r.invoice_email_sent_to ?? "cliente"} em ${fmtDate(r.invoice_email_sent_at)}`}
                            >
                              <CheckCircle2 className="w-2.5 h-2.5" aria-hidden /> Enviada ao cliente
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex flex-wrap gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setRegisterOrder({ id: r.id, number: r.order_number })}
                        >
                          {r.invoice_status === "emitida" ? "NF / Enviar" : "Registrar NF"}
                        </Button>
                        <select
                          className="h-7 rounded border border-input bg-background px-1 text-[11px]"
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            handleQuickStatus(r.id, e.target.value as InvoiceStatus);
                            e.target.value = "";
                          }}
                        >
                          <option value="">Status…</option>
                          <option value="pendente_emissao">Pendente</option>
                          <option value="erro_emissao">Erro</option>
                          <option value="cancelada">Cancelada</option>
                          <option value="nao_necessaria">Não necessária</option>
                        </select>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {rows.data?.ok && rows.data.total > rows.data.pageSize && (
          <div className="flex items-center justify-between p-3 text-xs border-t">
            <span className="text-muted-foreground">
              Página {rows.data.page} · {rows.data.total} pedidos
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={filters.page <= 1}
                onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={filters.page * rows.data.pageSize >= rows.data.total}
                onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>

      {registerOrder && (
        <RegisterInvoiceDialog
          orderId={registerOrder.id}
          orderNumber={registerOrder.number}
          onClose={() => setRegisterOrder(null)}
          onSaved={() => {
            setRegisterOrder(null);
            refreshAll();
          }}
        />
      )}
    </AdminLayout>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: number | undefined;
  accent?: "ok" | "warn" | "danger";
}) {
  const cls =
    accent === "danger"
      ? "text-red-600"
      : accent === "warn"
        ? "text-amber-600"
        : accent === "ok"
          ? "text-emerald-600"
          : "text-muted-foreground";
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className={`flex items-center gap-2 text-xs ${cls}`}>
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value ?? "—"}</div>
    </div>
  );
}

export function RegisterInvoiceDialog({
  orderId,
  orderNumber,
  onClose,
  onSaved,
}: {
  orderId: string;
  orderNumber: number | string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const register = useServerFn(registerInvoice);
  const fetchDetail = useServerFn(getInvoiceDetail);
  const [form, setForm] = useState({
    invoice_number: "",
    invoice_series: "1",
    invoice_access_key: "",
    invoice_danfe_url: "",
    invoice_xml_url: "",
    invoice_issued_at: new Date().toISOString().slice(0, 16),
    invoice_notes: "",
  });
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getInvoiceDetail>> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState(false);

  const loadDetail = async (prefill: boolean) => {
    const r = await fetchDetail({ data: { orderId } });
    setDetail(r);
    if (prefill && r.ok) {
      const o = r.order;
      // Editar uma NF já registrada parte dos dados salvos (antes abria em
      // branco e salvar apagava número/chave/links existentes).
      setForm((f) => ({
        invoice_number: o.invoice_number ?? f.invoice_number,
        invoice_series: o.invoice_series ?? f.invoice_series,
        invoice_access_key: o.invoice_access_key ?? f.invoice_access_key,
        invoice_danfe_url: o.invoice_danfe_url ?? f.invoice_danfe_url,
        invoice_xml_url: o.invoice_xml_url ?? f.invoice_xml_url,
        invoice_issued_at: o.invoice_issued_at
          ? new Date(o.invoice_issued_at).toISOString().slice(0, 16)
          : f.invoice_issued_at,
        invoice_notes: o.invoice_notes ?? f.invoice_notes,
      }));
    }
    setLoaded(true);
  };

  useEffect(() => {
    void loadDetail(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const save = async (opts: { quiet?: boolean } = {}): Promise<boolean> => {
    setSaving(true);
    try {
      const r = await register({
        data: {
          orderId,
          invoice_number: form.invoice_number || null,
          invoice_series: form.invoice_series || null,
          invoice_access_key: form.invoice_access_key || null,
          invoice_danfe_url: form.invoice_danfe_url || null,
          invoice_xml_url: form.invoice_xml_url || null,
          invoice_issued_at: form.invoice_issued_at
            ? new Date(form.invoice_issued_at).toISOString()
            : null,
          invoice_notes: form.invoice_notes || null,
        } as any,
      });
      if (!r.ok) {
        toast.error(r.error ?? "Falha ao registrar NF");
        return false;
      }
      setChanged(true);
      if (!opts.quiet) toast.success("Nota fiscal registrada");
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? "Erro inesperado");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (await save()) onSaved();
  };

  const close = () => (changed ? onSaved() : onClose());

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nota fiscal · Pedido #{orderNumber}</DialogTitle>
          <DialogDescription>
            Registre os dados da NF-e emitida fora da plataforma, anexe o PDF e envie ao cliente.
            Esta tela não emite a nota.
          </DialogDescription>
        </DialogHeader>
        {!loaded ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="nf-number">Número da NF</Label>
                <Input
                  id="nf-number"
                  value={form.invoice_number}
                  onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="nf-series">Série</Label>
                <Input
                  id="nf-series"
                  value={form.invoice_series}
                  onChange={(e) => setForm({ ...form, invoice_series: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="nf-key">Chave de acesso (44 dígitos)</Label>
                <Input
                  id="nf-key"
                  value={form.invoice_access_key}
                  maxLength={44}
                  inputMode="numeric"
                  onChange={(e) =>
                    setForm({ ...form, invoice_access_key: e.target.value.replace(/\D/g, "") })
                  }
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="nf-issued">Data de emissão</Label>
                <Input
                  id="nf-issued"
                  type="datetime-local"
                  value={form.invoice_issued_at}
                  onChange={(e) => setForm({ ...form, invoice_issued_at: e.target.value })}
                />
              </div>
              <details className="col-span-2 text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Links externos do DANFE/XML (opcional, se a nota estiver hospedada no emissor)
                </summary>
                <div className="grid gap-3 mt-2">
                  <div>
                    <Label htmlFor="nf-danfe-url">Link do DANFE (PDF)</Label>
                    <Input
                      id="nf-danfe-url"
                      type="url"
                      placeholder="https://…"
                      value={form.invoice_danfe_url}
                      onChange={(e) => setForm({ ...form, invoice_danfe_url: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="nf-xml-url">Link do XML</Label>
                    <Input
                      id="nf-xml-url"
                      type="url"
                      placeholder="https://…"
                      value={form.invoice_xml_url}
                      onChange={(e) => setForm({ ...form, invoice_xml_url: e.target.value })}
                    />
                  </div>
                </div>
              </details>
              <div className="col-span-2">
                <Label htmlFor="nf-notes">Observações internas</Label>
                <Textarea
                  id="nf-notes"
                  rows={2}
                  value={form.invoice_notes}
                  onChange={(e) => setForm({ ...form, invoice_notes: e.target.value })}
                />
              </div>
            </div>

            {detail?.ok && (
              <div className="border-t border-border pt-4">
                <InvoiceDeliveryPanel
                  orderId={orderId}
                  state={toDeliveryState(detail.order, detail.customerEmail)}
                  onChanged={async () => {
                    setChanged(true);
                    await loadDetail(false);
                  }}
                  beforeSend={() => save({ quiet: true })}
                />
              </div>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Fechar
          </Button>
          <Button onClick={handleSave} disabled={saving || !loaded}>
            {saving ? "Salvando…" : "Salvar nota fiscal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
