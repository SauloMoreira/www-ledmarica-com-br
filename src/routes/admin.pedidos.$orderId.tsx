import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  RefreshCw,
  Mail,
  Truck,
  Save,
  MessageSquarePlus,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ORDER_STATUS_OPTIONS, PAYMENT_STATUS_OPTIONS, orderStatusLabel } from "@/lib/orderStatus";
import {
  getOrderDetail,
  updateOrderStatus,
  reconsultMercadoPagoPayment,
  addOrderNote,
  resendOrderEmail,
} from "@/server/orderAdmin.functions";
import { InvoiceBlock } from "@/components/admin/InvoiceBlock";

export const Route = createFileRoute("/admin/pedidos/$orderId")({
  component: OrderDetailPage,
});

type DetailPayload = Awaited<ReturnType<typeof getOrderDetail>>;

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const router = useRouter();

  const fetchDetail = useServerFn(getOrderDetail);
  const updateFn = useServerFn(updateOrderStatus);
  const reconsultFn = useServerFn(reconsultMercadoPagoPayment);
  const addNoteFn = useServerFn(addOrderNote);
  const resendFn = useServerFn(resendOrderEmail);

  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reconsulting, setReconsulting] = useState(false);
  const [note, setNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [resendingType, setResendingType] = useState<string | null>(null);

  const [edit, setEdit] = useState({
    status: "",
    payment_status: "",
    tracking_code: "",
    shipping_carrier: "",
    admin_notes: "",
    cancelled_reason: "",
  });

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetchDetail({ data: { orderId } });
      setData(res);
      if (res.ok) {
        setEdit({
          status: res.order.status,
          payment_status: res.order.payment_status ?? "pending",
          tracking_code: res.order.tracking_code ?? "",
          shipping_carrier: res.order.shipping_carrier ?? "",
          admin_notes: res.order.admin_notes ?? "",
          cancelled_reason: res.order.cancelled_reason ?? "",
        });
      }
    } catch (e) {
      toast.error("Erro ao carregar pedido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const fmt = (n: number | string | null | undefined) =>
    Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("pt-BR") : "—");

  const order = data?.ok ? data.order : null;
  const items = data?.ok ? data.items : [];
  const events = data?.ok ? data.events : [];
  const emails = data?.ok ? data.emails : [];
  const webhooks = data?.ok ? data.webhooks : [];
  const customer = data?.ok ? data.customer : null;

  const isTerminal = useMemo(() => {
    if (!order) return false;
    return ["delivered", "cancelled", "refunded"].includes(order.status);
  }, [order]);

  const handleSave = async () => {
    if (!order) return;
    setSaving(true);
    try {
      const res = await updateFn({
        data: {
          orderId,
          status: edit.status as never,
          paymentStatus: edit.payment_status as never,
          trackingCode: edit.tracking_code,
          shippingCarrier: edit.shipping_carrier,
          adminNotes: edit.admin_notes,
          cancelledReason: edit.cancelled_reason || undefined,
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "Falha ao atualizar");
      } else {
        toast.success("Pedido atualizado");
        await reload();
      }
    } catch (e) {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleReconsult = async () => {
    setReconsulting(true);
    try {
      const res = await reconsultFn({ data: { orderId } });
      if (!res.ok) toast.error(res.error ?? "Falha ao reconsultar");
      else {
        toast.success(
          `Mercado Pago: ${res.mp.status}${res.mp.status_detail ? ` (${res.mp.status_detail})` : ""}`,
        );
        await reload();
      }
    } finally {
      setReconsulting(false);
    }
  };

  const handleAddNote = async () => {
    if (!note.trim()) return;
    setNoteSaving(true);
    try {
      const res = await addNoteFn({ data: { orderId, note: note.trim() } });
      if (!res.ok) toast.error("Falha ao adicionar nota");
      else {
        toast.success("Nota adicionada");
        setNote("");
        await reload();
      }
    } finally {
      setNoteSaving(false);
    }
  };

  const handleResend = async (type: string) => {
    setResendingType(type);
    try {
      const res = await resendFn({ data: { orderId, type: type as never } });
      if (!res.ok) toast.error(res.error ?? "Falha ao reenviar e-mail");
      else {
        toast.success("E-mail reenviado");
        await reload();
      }
    } finally {
      setResendingType(null);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Carregando pedido…">
        <div className="text-muted-foreground">Carregando…</div>
      </AdminLayout>
    );
  }

  if (!data?.ok || !order) {
    return (
      <AdminLayout title="Pedido não encontrado">
        <div className="bg-card border border-border rounded-xl p-6">
          <p className="text-muted-foreground mb-4">
            {(data && !data.ok && data.error) || "Pedido não encontrado."}
          </p>
          <Button asChild variant="outline">
            <Link to="/admin/pedidos">
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Link>
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const snap = (order.address_snapshot ?? null) as null | {
    recipient?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zip_code?: string;
  };

  return (
    <AdminLayout title={`Pedido #${order.order_number}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/pedidos">
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Link>
          </Button>
          <div>
            <h2 className="text-xl font-bold">Pedido #{order.order_number}</h2>
            <p className="text-xs text-muted-foreground">Criado em {fmtDate(order.created_at)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge value={order.status} />
          <PaymentBadge value={order.payment_status ?? "pending"} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Coluna esquerda — info principal */}
        <div className="lg:col-span-2 space-y-4">
          {/* Cliente */}
          <Card title="Cliente">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <Field label="Nome" value={customer?.name ?? snap?.recipient ?? "—"} />
              <Field label="E-mail" value={customer?.email ?? "—"} />
              <Field label="Telefone" value={customer?.phone ?? "—"} />
              <Field
                label="CPF"
                value={
                  (order as any).customer_cpf
                    ? String((order as any).customer_cpf).replace(
                        /(\d{3})(\d{3})(\d{3})(\d{2})/,
                        "$1.$2.$3-$4",
                      )
                    : "—"
                }
              />
              <Field
                label="Cliente desde"
                value={customer?.created_at ? fmtDate(customer.created_at) : "—"}
              />
            </div>
            {(order as any).order_type === "b2b" && (
              <>
                <Separator className="my-3" />
                <div className="text-sm">
                  <p className="font-semibold mb-2 flex items-center gap-2">
                    <span className="inline-block px-2 py-0.5 rounded bg-violet-100 text-violet-900 text-[10px] uppercase tracking-wide font-bold">
                      Pedido B2B
                    </span>
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Empresa" value={(order as any).company_name ?? "—"} />
                    <Field
                      label="CNPJ"
                      value={
                        (order as any).company_cnpj
                          ? String((order as any).company_cnpj).replace(
                              /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
                              "$1.$2.$3/$4-$5",
                            )
                          : "—"
                      }
                    />
                    <Field
                      label="Responsável pela empresa"
                      value={(order as any).company_contact_name ?? "—"}
                    />
                  </div>
                </div>
              </>
            )}
            <Separator className="my-3" />
            {(order as any).delivery_method === "pickup" ? (
              <div className="text-sm">
                <p className="font-semibold mb-1 flex items-center gap-2">
                  <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] uppercase tracking-wide font-bold">
                    Retirada na loja
                  </span>
                </p>
                <div className="text-muted-foreground space-y-0.5">
                  {(order as any).pickup_store_name && (
                    <p className="text-foreground font-medium">
                      {(order as any).pickup_store_name}
                    </p>
                  )}
                  {(order as any).pickup_store_address && (
                    <p className="whitespace-pre-line">{(order as any).pickup_store_address}</p>
                  )}
                  {(order as any).pickup_store_phone && (
                    <p>Telefone: {(order as any).pickup_store_phone}</p>
                  )}
                  {snap?.recipient && (
                    <p className="mt-1">
                      Retirada por: <span className="text-foreground">{snap.recipient}</span>
                    </p>
                  )}
                  {snap?.street && (
                    <p className="mt-1">
                      Endereço fiscal: {snap.street}, {snap.number}
                      {snap.complement && ` (${snap.complement})`} — {snap.neighborhood},{" "}
                      {snap.city}/{snap.state} — CEP {snap.zip_code}
                    </p>
                  )}
                </div>
              </div>
            ) : (order as any).delivery_method === "local_delivery" ? (
              <div className="text-sm">
                <p className="font-semibold mb-1 flex items-center gap-2">
                  <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] uppercase tracking-wide font-bold">
                    Frete Local Maricá
                  </span>
                </p>
                <div className="text-muted-foreground space-y-0.5">
                  {(order as any).local_delivery_district && (
                    <p className="text-foreground font-medium">
                      {(order as any).local_delivery_district}
                    </p>
                  )}
                  {(order as any).local_delivery_eta && (
                    <p>Prazo: {(order as any).local_delivery_eta}</p>
                  )}
                  {snap && (
                    <p className="mt-1">
                      {snap.recipient} — {snap.street}, {snap.number}{" "}
                      {snap.complement && `(${snap.complement})`} — {snap.neighborhood}, {snap.city}
                      /{snap.state} — CEP {snap.zip_code}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm">
                <p className="font-semibold mb-1">Endereço de entrega</p>
                {snap ? (
                  <p className="text-muted-foreground">
                    {snap.recipient} — {snap.street}, {snap.number}{" "}
                    {snap.complement && `(${snap.complement})`} — {snap.neighborhood}, {snap.city}/
                    {snap.state} — CEP {snap.zip_code}
                  </p>
                ) : (
                  <p className="text-muted-foreground">—</p>
                )}
              </div>
            )}
          </Card>

          {/* Itens */}
          <Card title="Itens do pedido">
            <div className="space-y-1">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                >
                  {it.product_image && (
                    <img
                      src={it.product_image}
                      alt=""
                      className="w-10 h-10 object-cover rounded border border-border"
                    />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{it.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {it.qty}× {fmt(it.unit_price)}
                      {it.product_sku ? ` · SKU ${it.product_sku}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">{fmt(it.total_price)}</span>
                </div>
              ))}
            </div>
            <Separator className="my-3" />
            <div className="space-y-1 text-sm">
              <Row label="Subtotal" value={fmt(order.subtotal)} />
              <Row
                label={
                  (order as any).delivery_method === "pickup"
                    ? "Retirada na loja"
                    : (order as any).delivery_method === "local_delivery"
                      ? "Frete Local Maricá"
                      : "Frete"
                }
                value={Number(order.shipping_cost) === 0 ? "Grátis" : fmt(order.shipping_cost)}
              />
              {Number(order.discount) > 0 && (
                <Row
                  label={`Desconto${order.coupon_code ? ` (${order.coupon_code})` : ""}`}
                  value={`-${fmt(order.discount)}`}
                  valueClass="text-emerald-600"
                />
              )}
              {Number((order as any).bundle_discount_total ?? 0) > 0 && (
                <Row
                  label="Desconto de combo"
                  value={`-${fmt(Number((order as any).bundle_discount_total))}`}
                  valueClass="text-emerald-600"
                />
              )}
              <div className="flex justify-between pt-2 border-t border-border">
                <span className="font-bold">Total</span>
                <span className="font-bold text-lg">{fmt(order.total)}</span>
              </div>
            </div>
          </Card>

          {/* Pagamento */}
          <Card
            title="Pagamento"
            actions={
              <Button
                size="sm"
                variant="outline"
                onClick={handleReconsult}
                disabled={reconsulting || !order.mp_payment_id}
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${reconsulting ? "animate-spin" : ""}`} />
                Reconsultar Mercado Pago
              </Button>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <Field label="Provedor" value={order.payment_provider ?? "—"} />
              <Field label="Método" value={order.payment_method ?? "—"} />
              <Field label="ID pagamento (MP)" value={order.mp_payment_id ?? "—"} mono />
              <Field label="Preference ID" value={order.mp_preference_id ?? "—"} mono />
              <Field label="Pago em" value={order.paid_at ? fmtDate(order.paid_at) : "—"} />
              <Field label="External reference" value={order.external_reference ?? "—"} mono />
            </div>
            {order.payment_error && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{order.payment_error}</span>
              </div>
            )}
            {order.checkout_url && (
              <a
                href={order.checkout_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-3"
              >
                Abrir checkout MP <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </Card>

          {/* Tabs: timeline / e-mails / webhooks */}
          <Card title="Histórico">
            <Tabs defaultValue="timeline">
              <TabsList>
                <TabsTrigger value="timeline">Timeline ({events.length})</TabsTrigger>
                <TabsTrigger value="emails">E-mails ({emails.length})</TabsTrigger>
                <TabsTrigger value="webhooks">Webhooks ({webhooks.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="timeline" className="mt-3">
                {events.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
                )}
                <ul className="space-y-2">
                  {events.map((ev) => (
                    <li key={ev.id} className="text-sm border-l-2 border-primary/30 pl-3">
                      <div className="flex justify-between gap-3">
                        <span className="font-medium">
                          {ev.type}
                          {ev.status ? ` · ${ev.status}` : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {fmtDate(ev.created_at)}
                        </span>
                      </div>
                      {ev.description && (
                        <p className="text-muted-foreground text-xs">{ev.description}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </TabsContent>

              <TabsContent value="emails" className="mt-3 space-y-2">
                {emails.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum e-mail registrado.</p>
                )}
                {emails.map((em) => (
                  <div key={em.id} className="text-sm border border-border rounded-md p-2.5">
                    <div className="flex justify-between gap-3">
                      <div>
                        <span className="font-medium">{em.type}</span>{" "}
                        <Badge
                          variant={
                            em.status === "sent"
                              ? "default"
                              : em.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {em.status}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(em.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {em.subject} → {em.customer_email}
                    </p>
                    {em.error_message && (
                      <p className="text-xs text-red-600 mt-1">{em.error_message}</p>
                    )}
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="webhooks" className="mt-3 space-y-2">
                {webhooks.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nenhum webhook ligado a este pedido.
                  </p>
                )}
                {webhooks.map((w) => (
                  <div key={w.id} className="text-sm border border-border rounded-md p-2.5">
                    <div className="flex justify-between gap-3">
                      <span className="font-medium">
                        {w.type ?? "webhook"} · {w.action ?? "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">{fmtDate(w.created_at)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {w.processed ? "processado" : "não processado"}
                      {w.live_mode === false ? " · sandbox" : ""}
                      {w.data_id ? ` · data.id=${w.data_id}` : ""}
                    </p>
                    {w.processing_error && (
                      <p className="text-xs text-red-600 mt-1">{w.processing_error}</p>
                    )}
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        {/* Coluna direita — ações */}
        <div className="space-y-4">
          <Card title="Status & Envio">
            <div className="space-y-3">
              <div>
                <Label>Status do pedido</Label>
                <select
                  value={edit.status}
                  onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                  disabled={
                    isTerminal && order.status !== "delivered" && order.status !== "cancelled"
                  }
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {ORDER_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {orderStatusLabel(s)}
                    </option>
                  ))}
                  <option value="refunded">{orderStatusLabel("refunded")}</option>
                </select>
              </div>
              <div>
                <Label>Status do pagamento</Label>
                <select
                  value={edit.payment_status}
                  onChange={(e) => setEdit({ ...edit, payment_status: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {PAYMENT_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {orderStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Transportadora</Label>
                <Input
                  value={edit.shipping_carrier}
                  onChange={(e) => setEdit({ ...edit, shipping_carrier: e.target.value })}
                />
              </div>
              <div>
                <Label>Código de rastreio</Label>
                <Input
                  value={edit.tracking_code}
                  onChange={(e) => setEdit({ ...edit, tracking_code: e.target.value })}
                />
              </div>
              {edit.status === "cancelled" && (
                <div>
                  <Label>Motivo do cancelamento</Label>
                  <Textarea
                    rows={2}
                    value={edit.cancelled_reason}
                    onChange={(e) => setEdit({ ...edit, cancelled_reason: e.target.value })}
                  />
                </div>
              )}
              <div>
                <Label>Notas internas</Label>
                <Textarea
                  rows={3}
                  value={edit.admin_notes}
                  onChange={(e) => setEdit({ ...edit, admin_notes: e.target.value })}
                />
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full">
                <Save className="w-4 h-4 mr-1" /> {saving ? "Salvando…" : "Salvar alterações"}
              </Button>
            </div>
          </Card>

          <Card title="Reenviar e-mails">
            <div className="space-y-2">
              {[
                { type: "order_created", label: "Pedido criado" },
                { type: "payment_approved", label: "Pagamento aprovado" },
                { type: "payment_pending", label: "Pagamento pendente" },
                { type: "payment_failed", label: "Pagamento recusado" },
                { type: "order_shipped", label: "Pedido enviado" },
                { type: "order_delivered", label: "Pedido entregue" },
                { type: "order_cancelled", label: "Pedido cancelado" },
                { type: "order_refunded", label: "Pedido reembolsado" },
              ].map((opt) => (
                <Button
                  key={opt.type}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  disabled={resendingType === opt.type}
                  onClick={() => handleResend(opt.type)}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  {resendingType === opt.type ? "Enviando…" : opt.label}
                </Button>
              ))}
            </div>
          </Card>

          <InvoiceBlock orderId={order.id} paymentStatus={order.payment_status ?? "pending"} />

          <Card title="Adicionar nota ao histórico">
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex.: cliente ligou pedindo troca…"
            />
            <Button
              onClick={handleAddNote}
              disabled={noteSaving || !note.trim()}
              className="w-full mt-2"
              variant="secondary"
            >
              <MessageSquarePlus className="w-4 h-4 mr-1" />{" "}
              {noteSaving ? "Salvando…" : "Registrar nota"}
            </Button>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}

function Card({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-semibold">{title}</h3>
        {actions}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={valueClass ?? ""}>{value}</span>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    confirmed: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    preparing: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
    shipped: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
    out_for_delivery: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
    delivered: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    cancelled: "bg-red-500/10 text-red-700 dark:text-red-400",
    refunded: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${map[value] ?? "bg-muted text-muted-foreground"}`}
    >
      <Truck className="w-3 h-3" /> {orderStatusLabel(value)}
    </span>
  );
}

function PaymentBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    paid: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    failed: "bg-red-500/10 text-red-700 dark:text-red-400",
    refunded: "bg-muted text-muted-foreground",
    preference_created: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${map[value] ?? "bg-muted text-muted-foreground"}`}
    >
      pgto: {orderStatusLabel(value)}
    </span>
  );
}
