import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Package, ArrowRight, Loader2, ChevronRight } from "lucide-react";
import { StoreLayout } from "@/components/layout/StoreLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL } from "@/lib/domain";
import { listMyOrders } from "@/server/checkout.functions";
import { orderStatusLabel } from "@/lib/orderStatus";

import { buildSeo } from "@/lib/seo";
import { formatDateTimeBR } from "@/lib/dateBR";

export const Route = createFileRoute("/conta/pedidos")({
  head: () => buildSeo({ title: "Meus pedidos", url: "/conta/pedidos", noindex: true }),
  component: MyOrders,
});

type Row = {
  id: string;
  order_number: number;
  status: string;
  payment_status: string | null;
  total: number;
  created_at: string | null;
  delivery_method: string | null;
};

const STATUS_CLS: Record<string, string> = {
  pending: "bg-warning/15 text-warning",
  awaiting_payment: "bg-warning/15 text-warning",
  confirmed: "bg-primary-tint text-primary",
  paid: "bg-success/15 text-success",
  preparing: "bg-primary-tint text-primary",
  shipped: "bg-primary-tint text-primary",
  out_for_delivery: "bg-primary-tint text-primary",
  delivered: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
  refunded: "bg-surface text-muted-foreground",
};

const PAYMENT_LABEL: Record<string, string> = {
  pending: "Pagamento pendente",
  awaiting_payment: "Aguardando pagamento",
  approved: "Pagamento aprovado",
  paid: "Pago",
  rejected: "Pagamento recusado",
  refunded: "Reembolsado",
  cancelled: "Cancelado",
};

const DELIVERY_LABEL: Record<string, string> = {
  pickup: "Retirada na loja",
  local_delivery: "Entrega local",
  shipping: "Envio",
  correios: "Correios",
};

function MyOrders() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Row[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    setFetching(true);
    setError(null);
    listMyOrders()
      .then((r) => {
        setOrders((r.orders ?? []) as Row[]);
        if ("error" in r && r.error) setError(r.error);
      })
      .catch((e) => {
        console.error("[MyOrders] failed", e);
        setError(e?.message ?? "Falha ao carregar pedidos");
      })
      .finally(() => setFetching(false));
  }, [user]);

  if (loading || fetching) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
          Carregando...
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary-tint flex items-center justify-center">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <h1 className="font-display font-bold text-2xl tracking-tight">Meus pedidos</h1>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg p-4 mb-4 text-sm">
            {error}
          </div>
        )}

        {orders.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-10 text-center">
            <p className="text-muted-foreground mb-5">Você ainda não possui pedidos.</p>
            <Button asChild>
              <Link to="/catalogo">
                Ir para o catálogo <ArrowRight className="w-4 h-4 ml-1.5" />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl divide-y divide-border">
            {orders.map((o) => {
              const st = {
                label: orderStatusLabel(o.status),
                cls: STATUS_CLS[o.status] ?? "bg-surface text-muted-foreground",
              };
              const payLabel = o.payment_status
                ? PAYMENT_LABEL[o.payment_status] ?? o.payment_status
                : null;
              const delivery = o.delivery_method
                ? DELIVERY_LABEL[o.delivery_method] ?? o.delivery_method
                : null;
              return (
                <Link
                  key={o.id}
                  to="/pedido/$id/confirmacao"
                  params={{ id: o.id }}
                  className="flex items-center justify-between gap-4 p-5 hover:bg-surface transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-display font-bold">#{o.order_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>
                        {st.label}
                      </span>
                      {payLabel && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-surface text-muted-foreground">
                          {payLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {o.created_at && formatDateTimeBR(o.created_at)}
                      {delivery && <> · {delivery}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-display font-bold text-primary">
                      {formatBRL(o.total)}
                    </span>
                    <span className="hidden sm:inline text-xs text-primary font-medium">
                      Ver detalhes
                    </span>
                    <ChevronRight className="w-4 h-4 text-text-faint" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </StoreLayout>
  );
}
