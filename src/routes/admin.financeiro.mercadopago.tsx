import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { buildSeo } from "@/lib/seo";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  getMpOverview,
  listMpPayments,
  recalcEstimatedFee,
  type MpOverview,
  type MpPaymentRow,
} from "@/server/mercadoPagoFinance.functions";
import { formatDateTimeBR } from "@/lib/dateBR";

export const Route = createFileRoute("/admin/financeiro/mercadopago")({
  head: () =>
    buildSeo({
      title: "Mercado Pago — Financeiro",
      url: "/admin/financeiro/mercadopago",
      noindex: true,
    }),
  component: MpFinancePage,
});

const brl = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function sourceBadge(src: MpPaymentRow["source"]) {
  if (src === "mercado_pago_real") return <Badge variant="default">Real</Badge>;
  if (src === "estimated") return <Badge variant="secondary">Estimada</Badge>;
  return <Badge variant="outline">Sem dado</Badge>;
}

function statusBadge(s: string | null) {
  if (!s) return <Badge variant="outline">—</Badge>;
  if (s === "paid" || s === "approved") return <Badge>Pago</Badge>;
  if (s === "pending" || s === "in_process") return <Badge variant="secondary">Pendente</Badge>;
  if (s === "rejected") return <Badge variant="destructive">Recusado</Badge>;
  if (s === "cancelled") return <Badge variant="outline">Cancelado</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function MpFinancePage() {
  const [overview, setOverview] = useState<MpOverview | null>(null);
  const [rows, setRows] = useState<MpPaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "paid" | "pending" | "rejected" | "cancelled">(
    "all",
  );
  const [source, setSource] = useState<"all" | "mercado_pago_real" | "estimated" | "unknown">(
    "all",
  );
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const reload = async () => {
    setLoading(true);
    try {
      const [ov, list] = await Promise.all([
        getMpOverview({ data: {} }),
        listMpPayments({ data: { search: search || undefined, status, source, page, pageSize } }),
      ]);
      setOverview(ov);
      setRows(list.rows);
      setTotal(list.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [status, source, page]);

  const recalc = async (orderId: string) => {
    try {
      await recalcEstimatedFee({ data: { orderId } });
      toast.success("Taxa estimada recalculada.");
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao recalcular.");
    }
  };

  return (
    <AdminLayout title="Mercado Pago — Financeiro">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold">Mercado Pago — Financeiro</h1>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/financeiro/configuracoes">Configurar taxas estimadas</Link>
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Algumas taxas são estimadas porque o Mercado Pago ainda não retornou os detalhes da
          transação. Quando o webhook traz <code>fee_details</code>, a taxa real é gravada
          automaticamente.
        </p>

        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card title="Total bruto (pagos)" value={brl(overview.totalGross)} />
            <Card title="Taxa real" value={brl(overview.totalFeeReal)} />
            <Card title="Taxa estimada" value={brl(overview.totalFeeEstimated)} />
            <Card title="Líquido" value={brl(overview.totalNet)} />
            <Card title="Pagos" value={String(overview.totals.paid)} />
            <Card title="Pendentes" value={String(overview.totals.pending)} />
            <Card title="Com taxa real" value={String(overview.totals.withRealFee)} />
            <Card title="Sem taxa identificada" value={String(overview.totals.withUnknownFee)} />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">Buscar (ID MP / e-mail)</label>
            <div className="flex gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ex.: cliente@..."
              />
              <Button
                onClick={() => {
                  setPage(1);
                  void reload();
                }}
              >
                Buscar
              </Button>
            </div>
          </div>
          <select
            className="h-10 rounded-md border bg-background px-2 text-sm"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as typeof status);
            }}
          >
            <option value="all">Todos status</option>
            <option value="paid">Pagos</option>
            <option value="pending">Pendentes</option>
            <option value="rejected">Recusados</option>
            <option value="cancelled">Cancelados</option>
          </select>
          <select
            className="h-10 rounded-md border bg-background px-2 text-sm"
            value={source}
            onChange={(e) => {
              setPage(1);
              setSource(e.target.value as typeof source);
            }}
          >
            <option value="all">Toda taxa</option>
            <option value="mercado_pago_real">Taxa real</option>
            <option value="estimated">Taxa estimada</option>
            <option value="unknown">Sem dado</option>
          </select>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-2">Pedido</th>
                <th className="p-2">Cliente</th>
                <th className="p-2">Status</th>
                <th className="p-2">Método</th>
                <th className="p-2 text-right">Bruto</th>
                <th className="p-2 text-right">Taxa</th>
                <th className="p-2 text-right">Líquido</th>
                <th className="p-2">Origem</th>
                <th className="p-2">Webhook</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="p-6 text-center">
                    <Loader2 className="inline h-4 w-4 animate-spin" /> Carregando…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-muted-foreground">
                    Nenhum pagamento encontrado.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((r) => (
                  <tr key={r.orderId} className="border-t">
                    <td className="p-2">#{r.orderNumber ?? "—"}</td>
                    <td className="p-2">{r.customerName ?? "—"}</td>
                    <td className="p-2">{statusBadge(r.paymentStatus)}</td>
                    <td className="p-2">{r.paymentType ?? r.paymentMethod ?? "—"}</td>
                    <td className="p-2 text-right">{r.gross != null ? brl(r.gross) : "—"}</td>
                    <td className="p-2 text-right">
                      {(r.feeReal ?? r.feeEstimated) != null
                        ? brl(r.feeReal ?? r.feeEstimated)
                        : "—"}
                    </td>
                    <td className="p-2 text-right">{r.net != null ? brl(r.net) : "—"}</td>
                    <td className="p-2">{sourceBadge(r.source)}</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {r.webhookAt ? formatDateTimeBR(r.webhookAt) : "—"}
                      {r.webhookError && <div className="text-destructive">{r.webhookError}</div>}
                    </td>
                    <td className="p-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link to="/admin/pedidos/$orderId" params={{ orderId: r.orderId }}>
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => recalc(r.orderId)}
                          title="Recalcular taxa estimada"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{total} pagamentos</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <span className="px-2 self-center">Página {page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
