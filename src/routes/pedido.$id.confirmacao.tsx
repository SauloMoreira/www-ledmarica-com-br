import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import {
  CheckCircle2,
  Package,
  Truck,
  Clock,
  ShoppingBag,
  ArrowRight,
  Loader2,
  CreditCard,
  RefreshCw,
  MapPin,
  AlertCircle,
  MessageCircle,
  Store,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import { StoreLayout } from "@/components/layout/StoreLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL } from "@/lib/domain";
import { getOrderForCustomer } from "@/server/orderTracking.functions";
import { createMercadoPagoPreference } from "@/server/payment.functions";
import { orderStatusLabel } from "@/lib/orderStatus";
import { redirectToExternalCheckout } from "@/lib/externalCheckout";
import { trackGoogleAdsPurchase } from "@/lib/tracking";
import { buildSeo } from "@/lib/seo";

const SearchSchema = z.object({
  token: z.string().min(16).max(128).optional(),
});

export const Route = createFileRoute("/pedido/$id/confirmacao")({
  validateSearch: (s) => SearchSchema.parse(s),
  head: () => buildSeo({ title: "Acompanhar pedido", url: "/pedido", noindex: true }),
  component: OrderTrackingPage,
});

type CustomerOrder = {
  id: string;
  orderNumber: number;
  status: string;
  paymentStatus: string | null;
  paymentMethod: string | null;
  subtotal: number;
  discount: number;
  bundleDiscountTotal: number;
  bundles: Array<{ bundle_id: string; bundle_name: string; discount_amount: number }>;
  shippingCost: number;
  total: number;
  couponCode: string | null;
  shippingCarrier: string | null;
  shippingService: string | null;
  trackingCode: string | null;
  estimatedDelivery: string | null;
  createdAt: string | null;
  paidAt: string | null;
  deliveryMethod: "delivery" | "pickup" | "local_delivery" | string;
  localDelivery?: { district: string | null; eta: string | null } | null;
  pickup: {
    status: string | null;
    storeName: string | null;
    storeAddress: string | null;
    storePhone: string | null;
    instructions: string | null;
  } | null;
  address: {
    recipient: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  } | null;
  items: Array<{
    id: string;
    name: string;
    image: string | null;
    qty: number;
    unitPrice: number;
    totalPrice: number;
    bundleName: string | null;
    bundleDiscountAmount: number;
  }>;
};

function statusMessage(status: string, paymentStatus: string | null) {
  if (status === "shipped" || status === "out_for_delivery") {
    return {
      tone: "info" as const,
      title: "Seu pedido foi enviado",
      text: "Acompanhe a entrega pelo código de rastreio.",
    };
  }
  if (status === "delivered" || status === "completed") {
    return { tone: "success" as const, title: "Pedido concluído", text: "Obrigado pela compra!" };
  }
  if (status === "cancelled") {
    return {
      tone: "error" as const,
      title: "Pedido cancelado",
      text: "Este pedido foi cancelado.",
    };
  }
  if (paymentStatus === "paid" || paymentStatus === "approved") {
    return {
      tone: "success" as const,
      title: "Pagamento aprovado!",
      text: "Seu pedido está sendo preparado.",
    };
  }
  if (paymentStatus === "pending" || paymentStatus === "in_process") {
    return {
      tone: "warn" as const,
      title: "Pagamento em análise",
      text: "Assim que for aprovado, seu pedido seguirá para processamento.",
    };
  }
  if (paymentStatus === "rejected" || paymentStatus === "failed") {
    return {
      tone: "error" as const,
      title: "Pagamento não aprovado",
      text: "Você pode tentar realizar o pagamento novamente.",
    };
  }
  return {
    tone: "info" as const,
    title: "Pedido recebido",
    text: "Acompanhe aqui o status do seu pedido.",
  };
}

function timelineSteps(status: string, paymentStatus: string | null, deliveryMethod: string) {
  const isPaid = paymentStatus === "paid" || paymentStatus === "approved";
  const isPreparing = [
    "preparing",
    "shipped",
    "out_for_delivery",
    "delivered",
    "completed",
    "ready_for_pickup",
    "picked_up",
  ].includes(status);
  const isShipped = [
    "shipped",
    "out_for_delivery",
    "delivered",
    "completed",
    "ready_for_pickup",
    "picked_up",
  ].includes(status);
  const isDelivered = ["delivered", "completed", "picked_up"].includes(status);
  if (deliveryMethod === "pickup") {
    return [
      { icon: CheckCircle2, label: "Recebido", active: true },
      { icon: CreditCard, label: "Pagamento", active: isPaid },
      { icon: Package, label: "Preparando", active: isPreparing },
      { icon: Store, label: "Pronto p/ retirar", active: isShipped },
      { icon: CheckCircle2, label: "Retirado", active: isDelivered },
    ];
  }
  if (deliveryMethod === "local_delivery") {
    return [
      { icon: CheckCircle2, label: "Recebido", active: true },
      { icon: CreditCard, label: "Pagamento", active: isPaid },
      { icon: Package, label: "Preparando", active: isPreparing },
      { icon: Truck, label: "A caminho", active: isShipped },
      { icon: CheckCircle2, label: "Entregue", active: isDelivered },
    ];
  }
  return [
    { icon: CheckCircle2, label: "Recebido", active: true },
    { icon: CreditCard, label: "Pagamento", active: isPaid },
    { icon: Package, label: "Preparando", active: isPreparing },
    { icon: Truck, label: "Enviado", active: isShipped },
    { icon: CheckCircle2, label: "Entregue", active: isDelivered },
  ];
}

function trackingUrlFor(carrier: string | null, code: string | null): string | null {
  if (!code) return null;
  const c = (carrier ?? "").toLowerCase();
  if (c.includes("correio"))
    return `https://rastreamento.correios.com.br/app/index.php?objeto=${encodeURIComponent(code)}`;
  return null;
}

function OrderTrackingPage() {
  const { id } = Route.useParams();
  const { token } = useSearch({ from: Route.id });
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [fetching, setFetching] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payRedirecting, setPayRedirecting] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setFetching(true);
      else setRefreshing(true);
      try {
        const r = await getOrderForCustomer({ data: { id, token: token ?? null } });
        if (r.ok) {
          setOrder(r.order);
          setNotFound(false);
        } else {
          setNotFound(true);
        }
      } finally {
        setFetching(false);
        setRefreshing(false);
      }
    },
    [id, token],
  );

  // Aguarda saber se há sessão (envia Authorization header) ou se há token
  useEffect(() => {
    if (loading) return;
    if (!user && !token) {
      navigate({ to: "/login" });
      return;
    }
    load(false);
  }, [user, loading, token, load, navigate]);

  // Conversão "Compra" do Google Ads: só quando pagamento aprovado/pago,
  // com deduplicação por pedido (localStorage) para não repetir em refresh.
  useEffect(() => {
    if (!order) return;
    const isPaid = order.paymentStatus === "paid" || order.paymentStatus === "approved";
    if (!isPaid) return;
    const dedupeKey = `gads_conversion_${order.id}`;
    try {
      if (window.localStorage.getItem(dedupeKey)) return;
      window.localStorage.setItem(dedupeKey, new Date().toISOString());
    } catch {
      /* storage indisponível — tenta mesmo assim */
    }
    trackGoogleAdsPurchase({
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
    });
  }, [order]);

  async function startPayment() {
    if (!order || payRedirecting) return;
    if (!user) {
      toast.error("Faça login para pagar este pedido novamente.");
      return;
    }
    setPayRedirecting(true);
    try {
      const r = await createMercadoPagoPreference({ data: { orderId: order.id } });
      if (r.ok && r.checkoutUrl) {
        redirectToExternalCheckout(r.checkoutUrl);
        return;
      }
      toast.error("Não foi possível iniciar o pagamento. Tente novamente.");
      setPayRedirecting(false);
    } catch {
      toast.error("Não foi possível iniciar o pagamento. Tente novamente.");
      setPayRedirecting(false);
    }
  }

  async function handleRefresh() {
    await load(true);
    toast.success("Status atualizado");
  }

  if (loading || fetching) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
          Carregando pedido...
        </div>
      </StoreLayout>
    );
  }

  if (notFound || !order) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-20 text-center max-w-md">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
          <h1 className="font-display font-bold text-2xl mb-2">Pedido não encontrado</h1>
          <p className="text-sm text-muted-foreground mb-5">
            Verifique se o link está completo. Se você fez login com outra conta, a visualização
            pode estar restrita.
          </p>
          <Button asChild>
            <Link to="/conta/pedidos">Ver meus pedidos</Link>
          </Button>
        </div>
      </StoreLayout>
    );
  }

  const msg = statusMessage(order.status, order.paymentStatus);
  const isPickup = order.deliveryMethod === "pickup";
  const isLocal = order.deliveryMethod === "local_delivery";
  const steps = timelineSteps(order.status, order.paymentStatus, order.deliveryMethod);
  const trackUrl = trackingUrlFor(order.shippingCarrier, order.trackingCode);
  const isPaymentPending =
    order.paymentStatus === "pending" || order.paymentStatus === "in_process";
  const isPaymentRejected = order.paymentStatus === "rejected" || order.paymentStatus === "failed";
  const supportPhone = (import.meta.env.VITE_SUPPORT_WHATSAPP ?? "").toString().replace(/\D/g, "");
  const whatsUrl = supportPhone
    ? `https://wa.me/${supportPhone}?text=${encodeURIComponent(`Olá! Sobre o pedido #${order.orderNumber}.`)}`
    : null;

  const toneClass = {
    success: "bg-success/10 border-success/30 text-success",
    warn: "bg-warning/10 border-warning/30 text-warning",
    error: "bg-destructive/10 border-destructive/30 text-destructive",
    info: "bg-primary-tint border-primary/30 text-primary",
  }[msg.tone];

  return (
    <StoreLayout>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
              Pedido
            </p>
            <h1 className="font-display font-bold text-3xl tracking-tight">#{order.orderNumber}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {order.createdAt && new Date(order.createdAt).toLocaleString("pt-BR")} ·{" "}
              {orderStatusLabel(order.status)}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Atualizar status
          </Button>
        </div>

        {/* Mensagem principal */}
        <div className={`rounded-xl border p-5 mb-6 ${toneClass}`}>
          <p className="font-semibold">{msg.title}</p>
          <p className="text-sm mt-1 opacity-90 text-foreground/80">{msg.text}</p>

          {isPaymentPending && user && (
            <Button onClick={startPayment} disabled={payRedirecting} className="mt-4 h-10">
              {payRedirecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Abrindo...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Pagar com Mercado Pago
                </>
              )}
            </Button>
          )}
          {isPaymentRejected && user && (
            <Button onClick={startPayment} disabled={payRedirecting} className="mt-4 h-10">
              {payRedirecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Abrindo...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Tentar pagar novamente
                </>
              )}
            </Button>
          )}
        </div>

        {/* Timeline */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="font-display font-semibold mb-5">Linha do tempo</h2>
          <div className="grid grid-cols-5 gap-2">
            {steps.map((s) => (
              <div key={s.label} className="flex flex-col items-center text-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center mb-1.5 ${s.active ? "bg-primary text-primary-foreground" : "bg-surface text-text-faint"}`}
                >
                  <s.icon className="w-4 h-4" />
                </div>
                <span
                  className={`text-[11px] sm:text-xs ${s.active ? "font-medium text-foreground" : "text-muted-foreground"}`}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Itens + resumo */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="font-display font-semibold mb-4">Itens</h2>
          <div className="divide-y divide-border">
            {order.items.map((it) => (
              <div key={it.id} className="py-3 flex items-center gap-3">
                <div className="w-12 h-12 rounded bg-surface overflow-hidden flex items-center justify-center shrink-0">
                  {it.image ? (
                    <img src={it.image} alt={it.name} className="w-full h-full object-cover" />
                  ) : (
                    <ShoppingBag className="w-5 h-5 text-text-faint" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-clamp-1">{it.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {it.qty}× {formatBRL(it.unitPrice)}
                  </p>
                </div>
                <div className="font-medium text-sm">{formatBRL(it.totalPrice)}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-border space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatBRL(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-success">
                <span>Desconto{order.couponCode ? ` (${order.couponCode})` : ""}</span>
                <span>−{formatBRL(order.discount)}</span>
              </div>
            )}
            {order.bundleDiscountTotal > 0 && (
              <div className="flex justify-between text-success">
                <span>Desconto de combo</span>
                <span>−{formatBRL(order.bundleDiscountTotal)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {isPickup
                  ? "Retirada na loja"
                  : isLocal
                    ? `Frete Local Maricá${order.localDelivery?.district ? ` (${order.localDelivery.district})` : ""}`
                    : `Frete${order.shippingService ? ` (${order.shippingService})` : ""}`}
              </span>
              <span>{order.shippingCost === 0 ? "Grátis" : formatBRL(order.shippingCost)}</span>
            </div>
            <div className="flex justify-between font-display font-bold text-lg pt-2 border-t border-border">
              <span>Total</span>
              <span className="text-primary">{formatBRL(order.total)}</span>
            </div>
          </div>
        </div>

        {order.bundles.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-primary" />
              <h2 className="font-display font-semibold">Combos aplicados</h2>
            </div>
            <ul className="space-y-2 text-sm">
              {order.bundles.map((b) => (
                <li
                  key={b.bundle_id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-surface/40 px-3 py-2"
                >
                  <span className="font-medium truncate">{b.bundle_name}</span>
                  <span className="text-success font-medium shrink-0">
                    −{formatBRL(b.discount_amount)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Os descontos de combo já estão incluídos no total acima.
            </p>
          </div>
        )}

        {/* Entrega ou Retirada */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            {isPickup ? (
              <Store className="w-4 h-4 text-primary" />
            ) : isLocal ? (
              <Truck className="w-4 h-4 text-primary" />
            ) : (
              <MapPin className="w-4 h-4 text-primary" />
            )}
            <h2 className="font-display font-semibold">
              {isPickup ? "Retirada na loja" : isLocal ? "Frete Local Maricá/RJ" : "Entrega"}
            </h2>
          </div>

          {isPickup ? (
            <div className="text-sm space-y-2">
              {order.pickup?.storeName && <p className="font-medium">{order.pickup.storeName}</p>}
              {order.pickup?.storeAddress && (
                <p className="text-muted-foreground whitespace-pre-line">
                  {order.pickup.storeAddress}
                </p>
              )}
              {order.pickup?.storePhone && (
                <p className="text-muted-foreground flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  <a
                    href={`tel:${order.pickup.storePhone.replace(/\D/g, "")}`}
                    className="text-foreground hover:underline"
                  >
                    {order.pickup.storePhone}
                  </a>
                </p>
              )}
              {order.pickup?.instructions && (
                <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground whitespace-pre-line">
                  {order.pickup.instructions}
                </div>
              )}
              {order.address?.recipient && (
                <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                  Retirada por: <span className="text-foreground">{order.address.recipient}</span>
                </div>
              )}
            </div>
          ) : (
            <>
              {order.address ? (
                <div className="text-sm space-y-0.5">
                  {order.address.recipient && (
                    <p className="font-medium">{order.address.recipient}</p>
                  )}
                  <p className="text-muted-foreground">
                    {order.address.street}
                    {order.address.number ? `, ${order.address.number}` : ""}
                    {order.address.complement ? `, ${order.address.complement}` : ""}
                  </p>
                  <p className="text-muted-foreground">
                    {[
                      order.address.neighborhood,
                      order.address.city && `${order.address.city}/${order.address.state ?? ""}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {order.address.zipCode ? ` · CEP ${order.address.zipCode}` : ""}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Endereço não disponível.</p>
              )}

              {(order.shippingCarrier ||
                order.shippingService ||
                order.estimatedDelivery ||
                (isLocal && order.localDelivery)) && (
                <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground space-y-0.5">
                  {isLocal && order.localDelivery?.district && (
                    <p>
                      Localidade:{" "}
                      <span className="text-foreground">{order.localDelivery.district}</span>
                    </p>
                  )}
                  {isLocal && order.localDelivery?.eta && (
                    <p>
                      Prazo estimado:{" "}
                      <span className="text-foreground">{order.localDelivery.eta}</span>
                    </p>
                  )}
                  {!isLocal && order.shippingCarrier && (
                    <p>
                      Transportadora:{" "}
                      <span className="text-foreground">{order.shippingCarrier}</span>
                    </p>
                  )}
                  {order.estimatedDelivery && (
                    <p>
                      Previsão:{" "}
                      <span className="text-foreground">
                        {new Date(order.estimatedDelivery).toLocaleDateString("pt-BR")}
                      </span>
                    </p>
                  )}
                  {order.trackingCode && (
                    <p>
                      Código:{" "}
                      <span className="text-foreground font-mono">{order.trackingCode}</span>
                    </p>
                  )}
                </div>
              )}

              {trackUrl && (
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <a href={trackUrl} target="_blank" rel="noopener noreferrer">
                    <Truck className="w-4 h-4" />
                    Rastrear pedido
                  </a>
                </Button>
              )}
            </>
          )}
        </div>

        {/* Pagamento */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-4 h-4 text-primary" />
            <h2 className="font-display font-semibold">Pagamento</h2>
          </div>
          <div className="text-sm space-y-1">
            <p className="text-muted-foreground">
              Método: <span className="text-foreground">Mercado Pago</span>
            </p>
            <p className="text-muted-foreground">
              Status:{" "}
              <span className="text-foreground">
                {order.paymentStatus === "paid" || order.paymentStatus === "approved"
                  ? "Aprovado"
                  : order.paymentStatus === "pending" || order.paymentStatus === "in_process"
                    ? "Pendente"
                    : order.paymentStatus === "rejected" || order.paymentStatus === "failed"
                      ? "Recusado"
                      : order.paymentStatus === "refunded"
                        ? "Reembolsado"
                        : "—"}
              </span>
            </p>
            {order.paidAt && (
              <p className="text-muted-foreground">
                Aprovado em:{" "}
                <span className="text-foreground">
                  {new Date(order.paidAt).toLocaleString("pt-BR")}
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {whatsUrl && (
            <Button asChild variant="outline" className="flex-1">
              <a href={whatsUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-4 h-4" />
                Falar com atendimento
              </a>
            </Button>
          )}
          {user && (
            <Button asChild variant="outline" className="flex-1">
              <Link to="/conta/pedidos">Meus pedidos</Link>
            </Button>
          )}
          <Button asChild className="flex-1">
            <Link to="/catalogo">
              Continuar comprando <ArrowRight className="w-4 h-4 ml-1.5" />
            </Link>
          </Button>
        </div>
      </div>
    </StoreLayout>
  );
}
