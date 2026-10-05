import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, Loader2, ArrowRight } from "lucide-react";
import { z } from "zod";
import { StoreLayout } from "@/components/layout/StoreLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/stores/cartStore";
import { getOrderPaymentStatus } from "@/server/payment.functions";
import { buildSeo } from "@/lib/seo";
import { takePendingConversionUserData } from "@/lib/tracking";
import { isPaymentApproved, trackConfirmedPurchase } from "@/lib/purchaseTracking";

const searchSchema = z.object({
  order_id: z.string().uuid().optional(),
  payment_id: z.string().optional(),
  status: z.string().optional(),
});

export const Route = createFileRoute("/checkout/success")({
  head: () => buildSeo({ title: "Pagamento confirmado", url: "/checkout/success", noindex: true }),
  validateSearch: (s) => searchSchema.parse(s),
  component: CheckoutSuccessPage,
});

function CheckoutSuccessPage() {
  const { order_id } = useSearch({ from: "/checkout/success" });
  const { user, loading } = useAuth();
  const cart = useCart();
  const [status, setStatus] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [polling, setPolling] = useState(true);
  const cleared = useRef(false);

  useEffect(() => {
    if (!cleared.current) {
      cart.clear();
      cleared.current = true;
    }
  }, [cart]);

  useEffect(() => {
    if (!order_id || !user) return;
    let attempts = 0;
    let cancelled = false;
    async function tick() {
      attempts += 1;
      const r = await getOrderPaymentStatus({ data: { orderId: order_id! } });
      if (cancelled) return;
      if (r.ok) {
        setStatus(r.order.payment_status ?? "pending");
        setOrderNumber(r.order.order_number);
        // Compra: o parâmetro `status` da URL de retorno NÃO é usado. Só o
        // status lido do banco (gravado pelo webhook assinado do Mercado Pago,
        // que consulta o pagamento na API do MP) dispara a conversão.
        if (isPaymentApproved(r.order.payment_status)) {
          void trackConfirmedPurchase(
            {
              id: r.order.id,
              orderNumber: r.order.order_number,
              total: Number(r.order.total),
              paymentStatus: r.order.payment_status,
              items: (r.order.order_items ?? []).map((it) => ({
                productId: it.product_id ?? null,
                name: it.product_name,
                qty: Number(it.qty),
                unitPrice: Number(it.unit_price),
              })),
            },
            takePendingConversionUserData(r.order.id),
          );
        }
        if (
          r.order.payment_status === "approved" ||
          r.order.payment_status === "paid" ||
          attempts >= 8
        ) {
          setPolling(false);
          return;
        }
      }
      setTimeout(tick, 2500);
    }
    tick();
    return () => {
      cancelled = true;
    };
  }, [order_id, user]);

  if (loading) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
          Carregando...
        </div>
      </StoreLayout>
    );
  }

  const approved = status === "approved" || status === "paid";

  return (
    <StoreLayout>
      <div className="container mx-auto px-4 py-12 max-w-xl text-center">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${approved ? "bg-success/15" : "bg-primary-tint"}`}
        >
          {approved ? (
            <CheckCircle2 className="w-9 h-9 text-success" />
          ) : (
            <Clock className="w-9 h-9 text-primary" />
          )}
        </div>
        <h1 className="font-display font-bold text-3xl mb-2">
          {approved ? "Pagamento aprovado!" : "Pagamento recebido"}
        </h1>
        {orderNumber && (
          <p className="text-muted-foreground mb-1">
            Pedido <strong className="text-foreground">#{orderNumber}</strong>
          </p>
        )}
        <p className="text-muted-foreground mb-2">
          {approved
            ? "Recebemos a confirmação do Mercado Pago. Vamos preparar seu pedido."
            : "Estamos confirmando seu pagamento com o Mercado Pago. Você será avisado quando for aprovado."}
        </p>
        <p className="text-xs text-muted-foreground mb-6">
          Enviamos as atualizações do pedido para o seu e-mail cadastrado.
        </p>
        {polling && !approved && (
          <p className="text-xs text-muted-foreground mb-6 inline-flex items-center">
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            Aguardando confirmação...
          </p>
        )}
        <div className="flex gap-3 justify-center">
          {order_id && (
            <Button asChild className="h-11">
              <Link to="/pedido/$id/confirmacao" params={{ id: order_id }}>
                Ver pedido <ArrowRight className="w-4 h-4 ml-1.5" />
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" className="h-11">
            <Link to="/catalogo">Continuar comprando</Link>
          </Button>
        </div>
      </div>
    </StoreLayout>
  );
}
