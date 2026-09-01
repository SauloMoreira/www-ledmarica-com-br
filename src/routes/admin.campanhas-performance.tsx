import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, TrendingUp, Users, ShoppingCart, Tag } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";

export const Route = createFileRoute("/admin/campanhas-performance")({
  component: PerformancePage,
});

type Campaign = {
  id: string;
  name: string;
  status: string;
  channel?: string | null;
  utm_campaign?: string | null;
  coupon_id?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

type Metrics = {
  leads: number;
  abandonedCarts: number;
  abandonedValue: number;
  recoveredCarts: number;
  orders: number;
  revenue: number;
  couponUses: number;
  ticket: number;
};

const fmtCurrency = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function PerformancePage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [metricsByCampaign, setMetricsByCampaign] = useState<Record<string, Metrics>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: camps } = await supabase
        .from("marketing_campaigns")
        .select("id, name, status, channel, utm_campaign, coupon_id, starts_at, ends_at")
        .order("created_at", { ascending: false });

      const list = ((camps as any) ?? []) as Campaign[];
      setCampaigns(list);

      // Para cada campanha com utm_campaign, buscar métricas em paralelo
      const results = await Promise.all(
        list.map(async (c) => {
          if (!c.utm_campaign) return [c.id, emptyMetrics()] as const;
          const utm = c.utm_campaign;

          const [leads, carts, orders, couponUses] = await Promise.all([
            supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .eq("utm_campaign", utm),
            fetchAllRows<any>((fromIdx, toIdx) =>
              supabase
                .from("abandoned_carts")
                .select("id, status, subtotal_amount, recovered_at")
                .eq("utm_campaign", utm)
                .range(fromIdx, toIdx),
            ).then((data) => ({ data })),
            fetchAllRows<any>((fromIdx, toIdx) =>
              supabase
                .from("orders")
                .select("id, total, payment_status")
                .eq("utm_campaign", utm)
                .range(fromIdx, toIdx),
            ).then((data) => ({ data })),
            c.coupon_id
              ? supabase.from("coupons").select("used_count").eq("id", c.coupon_id).single()
              : Promise.resolve({ data: null }),
          ]);

          const cartsData = (carts.data as any[]) ?? [];
          const ordersData = (ordersFilter(orders.data) as any[]) ?? [];
          const paid = ordersData.filter((o) => o.payment_status === "paid");
          const revenue = paid.reduce((s, o) => s + Number(o.total ?? 0), 0);

          return [
            c.id,
            {
              leads: leads.count ?? 0,
              abandonedCarts: cartsData.length,
              abandonedValue: cartsData.reduce((s, x) => s + Number(x.subtotal_amount ?? 0), 0),
              recoveredCarts: cartsData.filter((x) => x.status === "recuperado").length,
              orders: paid.length,
              revenue,
              couponUses: Number((couponUses.data as any)?.used_count ?? 0),
              ticket: paid.length ? revenue / paid.length : 0,
            } satisfies Metrics,
          ] as const;
        }),
      );

      const map: Record<string, Metrics> = {};
      results.forEach(([id, m]) => {
        map[id] = m;
      });
      setMetricsByCampaign(map);
      setLoading(false);
    })();
  }, []);

  const totals = useMemo(() => {
    const m = Object.values(metricsByCampaign);
    return {
      activeCampaigns: campaigns.filter((c) => c.status === "active").length,
      expiredActive: campaigns.filter(
        (c) => c.status === "active" && c.ends_at && new Date(c.ends_at) < new Date(),
      ).length,
      totalLeads: m.reduce((s, x) => s + x.leads, 0),
      totalOrders: m.reduce((s, x) => s + x.orders, 0),
      totalRevenue: m.reduce((s, x) => s + x.revenue, 0),
      totalCouponUses: m.reduce((s, x) => s + x.couponUses, 0),
      totalAbandoned: m.reduce((s, x) => s + x.abandonedCarts, 0),
      totalRecovered: m.reduce((s, x) => s + x.recoveredCarts, 0),
    };
  }, [campaigns, metricsByCampaign]);

  return (
    <AdminLayout title="Performance de Campanhas">
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/campanhas">
              <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
            </Link>
          </Button>
        </div>

        {/* Cards do dashboard */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            icon={<BarChart3 className="h-4 w-4" />}
            label="Campanhas ativas"
            value={String(totals.activeCampaigns)}
          />
          <KpiCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Receita atribuída"
            value={fmtCurrency(totals.totalRevenue)}
          />
          <KpiCard
            icon={<Users className="h-4 w-4" />}
            label="Leads gerados"
            value={String(totals.totalLeads)}
          />
          <KpiCard
            icon={<ShoppingCart className="h-4 w-4" />}
            label="Pedidos pagos"
            value={String(totals.totalOrders)}
          />
          <KpiCard
            icon={<Tag className="h-4 w-4" />}
            label="Cupons usados"
            value={String(totals.totalCouponUses)}
          />
          <KpiCard label="Carrinhos abandonados" value={String(totals.totalAbandoned)} />
          <KpiCard label="Carrinhos recuperados" value={String(totals.totalRecovered)} />
          <KpiCard
            label="Campanhas vencidas ativas"
            value={String(totals.expiredActive)}
            highlight={totals.expiredActive > 0}
          />
        </div>

        {/* Tabela de campanhas */}
        <div className="rounded-lg border bg-card">
          <div className="border-b p-4">
            <h2 className="text-base font-semibold">Por campanha</h2>
            <p className="text-xs text-muted-foreground">
              Atribuição via <code className="font-mono">utm_campaign</code> em leads, carrinhos
              abandonados e pedidos.
            </p>
          </div>
          {loading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : campaigns.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma campanha cadastrada ainda.
            </div>
          ) : (
            <div className="divide-y">
              {campaigns.map((c) => {
                const m = metricsByCampaign[c.id] ?? emptyMetrics();
                const noData = !c.utm_campaign || m.leads + m.orders + m.abandonedCarts === 0;
                return (
                  <div key={c.id} className="p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{c.name}</h3>
                      <Badge variant="outline">{c.status}</Badge>
                      {c.channel && <Badge variant="outline">{c.channel}</Badge>}
                      {c.utm_campaign && (
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {c.utm_campaign}
                        </code>
                      )}
                    </div>
                    {noData ? (
                      <p className="text-sm text-muted-foreground">
                        Esta campanha ainda não possui dados suficientes para análise.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                        <Mini label="Leads" value={String(m.leads)} />
                        <Mini label="Carrinhos abandonados" value={String(m.abandonedCarts)} />
                        <Mini label="Recuperados" value={String(m.recoveredCarts)} />
                        <Mini label="Pedidos pagos" value={String(m.orders)} />
                        <Mini label="Receita" value={fmtCurrency(m.revenue)} />
                        <Mini label="Ticket médio" value={fmtCurrency(m.ticket)} />
                        <Mini label="Cupons usados" value={String(m.couponUses)} />
                        <Mini label="Valor parado" value={fmtCurrency(m.abandonedValue)} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function KpiCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border bg-card p-4 ${highlight ? "border-amber-500/40" : ""}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`mt-1 text-xl font-semibold ${highlight ? "text-amber-600 dark:text-amber-400" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function emptyMetrics(): Metrics {
  return {
    leads: 0,
    abandonedCarts: 0,
    abandonedValue: 0,
    recoveredCarts: 0,
    orders: 0,
    revenue: 0,
    couponUses: 0,
    ticket: 0,
  };
}

function ordersFilter(data: unknown): unknown[] {
  return Array.isArray(data) ? data : [];
}
