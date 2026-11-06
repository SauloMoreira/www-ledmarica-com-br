import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Download,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Info,
  ExternalLink,
} from "lucide-react";
import { buildSeo } from "@/lib/seo";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getFinanceReportCards,
  getSalesReport,
  exportSalesReportCsv,
  type FinanceReportCards,
  type SalesReportResult,
  type ReportPreset,
  type OrderTypeFilter,
} from "@/server/financeReports.functions";
import {
  getMarginCards,
  getMarginByOrder,
  getProductsReport,
  exportMarginByOrderCsv,
  exportProductsReportCsv,
  type MarginCards,
  type MarginOrderResult,
  type MarginOrderRow,
  type ProductsReportResult,
  type ProductReportRow,
  type MarginStatus,
  type CalcStatus,
} from "@/server/marginReports.functions";
import {
  getB2bReport,
  getCouponsReport,
  getShippingReport,
  exportB2bCompaniesCsv,
  exportB2bProductsCsv,
  exportCouponsCsv,
  exportDiscountsByOrderCsv,
  exportShippingByOrderCsv,
  exportShippingByDistrictCsv,
  type B2bCards,
  type B2bCompanyRow,
  type B2bProductRow,
  type CouponsCards,
  type CouponPerfRow,
  type DiscountByOrderRow,
  type ShippingCards,
  type ShippingOrderRow,
  type ShippingDistrictRow,
} from "@/server/commercialReports.functions";
import {
  getMpReportCards,
  getMpPayments,
  exportMpPaymentsCsv,
  getInvoiceReportCards,
  getInvoicesReport,
  exportInvoicesCsv,
  FEE_SOURCE_LABELS,
  INVOICE_STATUS_LABELS,
  type MpReportCards,
  type MpListResult,
  type MpPaymentRow,
  type InvoiceReportCards,
  type InvoiceListResult,
  type InvoiceRow,
} from "@/server/paymentInvoiceReports.functions";
import {
  getCampaignCards,
  getCampaignPerformance,
  getOriginPerformance,
  getAttributedOrders,
  getAttributionQuality,
  exportCampaignPerformanceCsv,
  exportOriginPerformanceCsv,
  exportAttributedOrdersCsv,
  exportAttributionQualityCsv,
  type CampaignCards,
  type CampaignPerfRow,
  type OriginPerfRow,
  type AttributedOrderRow,
  type AttributionQuality,
} from "@/server/campaignReports.functions";
import { formatDateBR, formatDateTimeBR } from "@/lib/dateBR";

export const Route = createFileRoute("/admin/financeiro/relatorios")({
  head: () =>
    buildSeo({
      title: "Relatórios financeiros",
      url: "/admin/financeiro/relatorios",
      noindex: true,
    }),
  component: ReportsPage,
});

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function pct(n: number) {
  return `${n.toFixed(1).replace(".", ",")}%`;
}
function fmtDate(iso: string) {
  return formatDateBR(iso);
}
function fmtDateTime(iso: string) {
  return formatDateTimeBR(iso);
}

const PRESETS: Array<{ id: ReportPreset; label: string }> = [
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "last_7_days", label: "7 dias" },
  { id: "last_30_days", label: "30 dias" },
  { id: "this_month", label: "Este mês" },
  { id: "last_month", label: "Mês anterior" },
];
const ORDER_TYPES: Array<{ id: OrderTypeFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "b2c", label: "B2C" },
  { id: "b2b", label: "B2B" },
];
const PAYMENT_STATUSES = [
  { id: "", label: "Todos" },
  { id: "approved", label: "Aprovado" },
  { id: "paid", label: "Pago" },
  { id: "pending", label: "Pendente" },
  { id: "in_process", label: "Em processamento" },
  { id: "rejected", label: "Recusado" },
  { id: "cancelled", label: "Cancelado" },
];
const PAYMENT_METHODS = [
  { id: "", label: "Todos" },
  { id: "pix", label: "Pix" },
  { id: "credit_card", label: "Cartão de crédito" },
  { id: "debit_card", label: "Cartão de débito" },
  { id: "bolbradesco", label: "Boleto" },
];
const DELIVERY_METHODS = [
  { id: "", label: "Todos" },
  { id: "delivery", label: "Entrega" },
  { id: "local_delivery", label: "Entrega local" },
  { id: "pickup", label: "Retirada" },
];

function DeltaBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
  const positive = value >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        positive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
      }`}
    >
      <Icon className="w-3 h-3" />
      {positive ? "+" : ""}
      {pct(value)}
    </span>
  );
}

type CardDef = {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  tooltip?: string;
  warn?: boolean;
};

function MetricCard({ card }: { card: CardDef }) {
  return (
    <div
      className={`bg-card border rounded-xl p-4 flex flex-col gap-1.5 min-h-[110px] ${
        card.warn ? "border-amber-500/40" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{card.label}</span>
          {card.tooltip && (
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-3 h-3 opacity-60" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{card.tooltip}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {card.delta !== undefined && <DeltaBadge value={card.delta ?? null} />}
      </div>
      <p className="font-display font-bold text-2xl tracking-tight leading-none">{card.value}</p>
      {card.hint && <p className="text-[11px] text-muted-foreground">{card.hint}</p>}
    </div>
  );
}

function MarginStatusBadge({ status }: { status: MarginStatus }) {
  const map: Record<MarginStatus, { label: string; cls: string }> = {
    good: { label: "Boa", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    warning: { label: "Atenção", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    critical: { label: "Crítica", cls: "bg-destructive/15 text-destructive" },
    incomplete: { label: "Incompleta", cls: "bg-muted text-muted-foreground" },
  };
  const m = map[status];
  return (
    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${m.cls}`}>{m.label}</span>
  );
}

function CalcStatusBadge({ status }: { status: CalcStatus }) {
  const map: Record<CalcStatus, { label: string; cls: string }> = {
    real: { label: "Real", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    estimated: { label: "Estimado", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    incomplete: { label: "Incompleto", cls: "bg-muted text-muted-foreground" },
  };
  const m = map[status];
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${m.cls}`}>{m.label}</span>;
}

// Força o code-splitter a manter estas seções no chunk de ReportsPage
// (sem isto, MpSection/InvoicesSection/UtmSection eram tree-shaken e causavam
//  ReferenceError em runtime SSR — "UtmSection is not defined").
const __keepSections = { MpSection, InvoicesSection, UtmSection };
void __keepSections;

function ReportsPage() {
  // Filtros
  const [preset, setPreset] = useState<ReportPreset>("this_month");
  const [orderType, setOrderType] = useState<OrderTypeFilter>("all");
  const [paymentStatus, setPaymentStatus] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [deliveryMethod, setDeliveryMethod] = useState<string>("");

  // Aba ativa — aceita ?tab=... na URL (com aliases pt-BR)
  const initialTab = (() => {
    if (typeof window === "undefined") return "sales" as const;
    const raw = new URLSearchParams(window.location.search).get("tab")?.toLowerCase() ?? "";
    const map: Record<
      string,
      "sales" | "margin" | "products" | "b2b" | "coupons" | "shipping" | "mp" | "invoices" | "utm"
    > = {
      sales: "sales",
      vendas: "sales",
      margin: "margin",
      margem: "margin",
      products: "products",
      produtos: "products",
      b2b: "b2b",
      atacado: "b2b",
      coupons: "coupons",
      cupons: "coupons",
      shipping: "shipping",
      frete: "shipping",
      mp: "mp",
      "mercado-pago": "mp",
      mercadopago: "mp",
      invoices: "invoices",
      notas: "invoices",
      "notas-fiscais": "invoices",
      utm: "utm",
      campanhas: "utm",
    };
    return map[raw] ?? "sales";
  })();
  const [tab, setTab] = useState<
    "sales" | "margin" | "products" | "b2b" | "coupons" | "shipping" | "mp" | "invoices" | "utm"
  >(initialTab);

  // Dados
  const [cards, setCards] = useState<FinanceReportCards | null>(null);
  const [sales, setSales] = useState<SalesReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  // Margem
  const [marginCards, setMarginCards] = useState<MarginCards | null>(null);
  const [marginRows, setMarginRows] = useState<MarginOrderResult | null>(null);
  const [marginLoading, setMarginLoading] = useState(false);
  const [marginPage, setMarginPage] = useState(1);
  const [marginStatusFilter, setMarginStatusFilter] = useState<
    "all" | "good" | "warning" | "critical" | "incomplete"
  >("all");

  // Produtos
  const [products, setProducts] = useState<ProductsReportResult | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);

  // B2B
  const [b2b, setB2b] = useState<{
    cards: B2bCards;
    companies: B2bCompanyRow[];
    products: B2bProductRow[];
  } | null>(null);
  const [b2bLoading, setB2bLoading] = useState(false);

  // Cupons
  const [coupons, setCoupons] = useState<{
    cards: CouponsCards;
    coupons: CouponPerfRow[];
    orders: DiscountByOrderRow[];
  } | null>(null);
  const [couponsLoading, setCouponsLoading] = useState(false);

  // Frete
  const [shipping, setShipping] = useState<{
    cards: ShippingCards;
    orders: { rows: ShippingOrderRow[]; total: number; page: number; pageSize: number };
    districts: ShippingDistrictRow[];
  } | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingPage, setShippingPage] = useState(1);

  // Mercado Pago
  const [mpCards, setMpCards] = useState<MpReportCards | null>(null);
  const [mpList, setMpList] = useState<MpListResult | null>(null);
  const [mpLoading, setMpLoading] = useState(false);
  const [mpPage, setMpPage] = useState(1);
  const [mpFeeSource, setMpFeeSource] = useState<
    "all" | "mercado_pago_real" | "estimated" | "unknown"
  >("all");

  // Notas Fiscais
  const [invCards, setInvCards] = useState<InvoiceReportCards | null>(null);
  const [invList, setInvList] = useState<InvoiceListResult | null>(null);
  const [invLoading, setInvLoading] = useState(false);
  const [invPage, setInvPage] = useState(1);
  const [invStatus, setInvStatus] = useState<
    "all" | "nao_necessaria" | "pendente_emissao" | "emitida" | "erro_emissao" | "cancelada"
  >("all");

  // Campanhas / UTM
  const [utmCards, setUtmCards] = useState<CampaignCards | null>(null);
  const [utmCampaigns, setUtmCampaigns] = useState<CampaignPerfRow[] | null>(null);
  const [utmOrigins, setUtmOrigins] = useState<OriginPerfRow[] | null>(null);
  const [utmOrders, setUtmOrders] = useState<{
    rows: AttributedOrderRow[];
    total: number;
    page: number;
    pageSize: number;
  } | null>(null);
  const [utmQuality, setUtmQuality] = useState<AttributionQuality | null>(null);
  const [utmLoading, setUtmLoading] = useState(false);
  const [utmPage, setUtmPage] = useState(1);
  const [attribution, setAttribution] = useState<"all" | "attributed" | "unattributed">("all");

  const filters = useMemo(
    () => ({
      preset,
      orderType,
      paymentStatus: paymentStatus || null,
      paymentMethod: paymentMethod || null,
      deliveryMethod: deliveryMethod || null,
    }),
    [preset, orderType, paymentStatus, paymentMethod, deliveryMethod],
  );

  // Carrega cards globais + vendas
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      getFinanceReportCards({ data: filters }),
      getSalesReport({ data: { ...filters, page, pageSize: 50 } }),
    ])
      .then(([c, s]) => {
        if (!alive) return;
        setCards(c);
        setSales(s);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar relatórios."))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [filters, page]);

  // Carrega Margem (lazy quando aba ativa)
  useEffect(() => {
    if (tab !== "margin") return;
    let alive = true;
    setMarginLoading(true);
    Promise.all([
      getMarginCards({ data: filters }),
      getMarginByOrder({
        data: { ...filters, page: marginPage, pageSize: 50, marginStatus: marginStatusFilter },
      }),
    ])
      .then(([c, r]) => {
        if (!alive) return;
        setMarginCards(c);
        setMarginRows(r);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar margem."))
      .finally(() => {
        if (alive) setMarginLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tab, filters, marginPage, marginStatusFilter]);

  // Carrega Produtos (lazy)
  useEffect(() => {
    if (tab !== "products") return;
    let alive = true;
    setProductsLoading(true);
    getProductsReport({ data: filters })
      .then((p) => alive && setProducts(p))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar produtos."))
      .finally(() => alive && setProductsLoading(false));
    return () => {
      alive = false;
    };
  }, [tab, filters]);

  // Carrega B2B (lazy)
  useEffect(() => {
    if (tab !== "b2b") return;
    let alive = true;
    setB2bLoading(true);
    getB2bReport({ data: filters })
      .then((r) => alive && setB2b(r))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar B2B."))
      .finally(() => alive && setB2bLoading(false));
    return () => {
      alive = false;
    };
  }, [tab, filters]);

  // Carrega Cupons (lazy)
  useEffect(() => {
    if (tab !== "coupons") return;
    let alive = true;
    setCouponsLoading(true);
    getCouponsReport({ data: filters })
      .then((r) => alive && setCoupons(r))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar cupons."))
      .finally(() => alive && setCouponsLoading(false));
    return () => {
      alive = false;
    };
  }, [tab, filters]);

  // Carrega Frete (lazy)
  useEffect(() => {
    if (tab !== "shipping") return;
    let alive = true;
    setShippingLoading(true);
    getShippingReport({ data: { ...filters, page: shippingPage, pageSize: 50 } })
      .then((r) => alive && setShipping(r))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar frete."))
      .finally(() => alive && setShippingLoading(false));
    return () => {
      alive = false;
    };
  }, [tab, filters, shippingPage]);

  // Carrega Mercado Pago (lazy)
  useEffect(() => {
    if (tab !== "mp") return;
    let alive = true;
    setMpLoading(true);
    Promise.all([
      getMpReportCards({ data: filters }),
      getMpPayments({
        data: { ...filters, page: mpPage, pageSize: 50, feeSource: mpFeeSource },
      }),
    ])
      .then(([c, l]) => {
        if (!alive) return;
        setMpCards(c);
        setMpList(l);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar Mercado Pago."))
      .finally(() => alive && setMpLoading(false));
    return () => {
      alive = false;
    };
  }, [tab, filters, mpPage, mpFeeSource]);

  // Carrega Notas Fiscais (lazy)
  useEffect(() => {
    if (tab !== "invoices") return;
    let alive = true;
    setInvLoading(true);
    Promise.all([
      getInvoiceReportCards({ data: filters }),
      getInvoicesReport({
        data: { ...filters, page: invPage, pageSize: 50, invoiceStatus: invStatus },
      }),
    ])
      .then(([c, l]) => {
        if (!alive) return;
        setInvCards(c);
        setInvList(l);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao carregar notas fiscais."))
      .finally(() => alive && setInvLoading(false));
    return () => {
      alive = false;
    };
  }, [tab, filters, invPage, invStatus]);

  // Carrega Campanhas / UTM (lazy)
  useEffect(() => {
    if (tab !== "utm") return;
    let alive = true;
    setUtmLoading(true);
    const utmFilters = { ...filters, attribution };
    Promise.all([
      getCampaignCards({ data: utmFilters }),
      getCampaignPerformance({ data: utmFilters }),
      getOriginPerformance({ data: utmFilters }),
      getAttributedOrders({ data: { ...utmFilters, page: utmPage, pageSize: 50 } }),
      getAttributionQuality({ data: utmFilters }),
    ])
      .then(([c, camps, origins, orders, q]) => {
        if (!alive) return;
        setUtmCards(c);
        setUtmCampaigns(camps);
        setUtmOrigins(origins);
        setUtmOrders(orders);
        setUtmQuality(q);
      })
      .catch((e) =>
        toast.error(e instanceof Error ? e.message : "Erro ao carregar campanhas / UTM."),
      )
      .finally(() => alive && setUtmLoading(false));
    return () => {
      alive = false;
    };
  }, [tab, filters, utmPage, attribution]);

  // Reset página quando filtros mudam
  useEffect(() => {
    setPage(1);
    setMarginPage(1);
    setShippingPage(1);
    setMpPage(1);
    setInvPage(1);
    setUtmPage(1);
  }, [preset, orderType, paymentStatus, paymentMethod, deliveryMethod]);

  const cardDefs: CardDef[] = cards
    ? [
        {
          label: "Faturamento bruto",
          value: brl(cards.grossRevenue),
          delta: cards.deltaGrossRevenue,
          tooltip: "Total vendido (pedidos pagos) antes de taxas e custos.",
        },
        {
          label: "Faturamento líquido estimado",
          value: brl(cards.estimatedNetRevenue),
          tooltip: cards.hasEstimatedFees
            ? "Considera taxa real do Mercado Pago quando disponível, e taxa estimada caso contrário."
            : "Considera taxa real do Mercado Pago.",
          warn: cards.hasEstimatedFees,
          hint: cards.hasEstimatedFees ? "Inclui taxas estimadas" : undefined,
        },
        { label: "Pedidos pagos", value: String(cards.ordersPaid), delta: cards.deltaOrdersPaid },
        { label: "Pedidos pendentes", value: String(cards.ordersPending) },
        { label: "Ticket médio", value: brl(cards.averageTicket), delta: cards.deltaAverageTicket },
        {
          label: "Custo dos produtos vendidos",
          value: brl(cards.cogs),
          tooltip:
            "Custo dos produtos com base no snapshot gravado no momento da venda (não recalcula com custo atual).",
          warn: cards.hasItemsWithoutCost,
          hint: cards.hasItemsWithoutCost ? "Há produtos sem custo cadastrado" : undefined,
        },
        {
          label: "Lucro bruto estimado",
          value: brl(cards.estimatedGrossProfit),
          delta: cards.deltaGrossProfit,
          tooltip:
            "Líquido estimado − custo dos produtos. É uma estimativa, principalmente quando há taxas estimadas ou produtos sem custo.",
          warn: cards.hasItemsWithoutCost || cards.hasEstimatedFees,
        },
        {
          label: "Margem bruta estimada",
          value: pct(cards.estimatedMarginPercent),
          tooltip: "Lucro bruto estimado / faturamento bruto.",
        },
        {
          label: "Taxa Mercado Pago total",
          value: brl(cards.totalMpFees),
          tooltip:
            "Soma das taxas reais e estimadas do Mercado Pago para os pedidos pagos do período.",
        },
        { label: "Descontos totais", value: brl(cards.totalDiscounts) },
        { label: "Desconto B2B", value: brl(cards.b2bDiscounts) },
        { label: "Desconto de cupons", value: brl(cards.couponDiscounts) },
        { label: "Frete cobrado", value: brl(cards.shippingCharged) },
        {
          label: "Notas fiscais pendentes",
          value: String(cards.invoicePending),
          warn: cards.invoicePending > 0,
          tooltip:
            "Pedidos pagos com nota fiscal pendente (visão geral, fora do filtro de período).",
        },
      ]
    : [];

  async function handleExport(
    fn: (args: { data: typeof filters }) => Promise<{ filename: string; content: string }>,
    label: string,
  ) {
    try {
      setExporting(true);
      const { filename, content } = await fn({ data: filters });
      const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exportação de ${label} concluída.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao exportar.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <AdminLayout title="Relatórios financeiros">
      <TooltipProvider delayDuration={150}>
        <div className="max-w-7xl mx-auto space-y-6 p-4 md:p-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link
                to="/admin"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-3 h-3" /> Voltar ao admin
              </Link>
              <h1 className="font-display text-2xl md:text-3xl font-bold mt-1">
                Relatórios financeiros
              </h1>
              <p className="text-sm text-muted-foreground">
                Acompanhe vendas, margem, descontos, taxas e resultados da loja.
              </p>
            </div>
          </div>

          {/* Filtros */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">Período:</span>
              {PRESETS.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={preset === p.id ? "default" : "outline"}
                  onClick={() => setPreset(p.id)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Tipo</label>
                <Select value={orderType} onValueChange={(v) => setOrderType(v as OrderTypeFilter)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_TYPES.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Pagamento</label>
                <Select
                  value={paymentStatus || "all"}
                  onValueChange={(v) => setPaymentStatus(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {PAYMENT_STATUSES.filter((s) => s.id).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Método</label>
                <Select
                  value={paymentMethod || "all"}
                  onValueChange={(v) => setPaymentMethod(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {PAYMENT_METHODS.filter((s) => s.id).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Entrega</label>
                <Select
                  value={deliveryMethod || "all"}
                  onValueChange={(v) => setDeliveryMethod(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {DELIVERY_METHODS.filter((s) => s.id).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {cards && (
              <p className="text-xs text-muted-foreground">
                Período analisado:{" "}
                <strong>
                  {fmtDate(cards.rangeFrom)} → {fmtDate(cards.rangeTo)}
                </strong>{" "}
                · comparado com {fmtDate(cards.prevRangeFrom)} → {fmtDate(cards.prevRangeTo)}
              </p>
            )}
          </div>

          {/* Avisos */}
          {cards && (cards.hasEstimatedFees || cards.hasItemsWithoutCost) && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="space-y-0.5">
                {cards.hasEstimatedFees && (
                  <p>
                    Algumas taxas do Mercado Pago são <strong>estimadas</strong>. O líquido pode
                    mudar quando o pagamento for confirmado.
                  </p>
                )}
                {cards.hasItemsWithoutCost && (
                  <p>
                    Existem itens vendidos <strong>sem custo cadastrado</strong>. O lucro pode estar
                    incompleto.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Cards globais */}
          {loading && !cards ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {cardDefs.map((c) => (
                <MetricCard key={c.label} card={c} />
              ))}
            </div>
          )}

          {/* Abas */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="sales">Vendas</TabsTrigger>
              <TabsTrigger value="margin">Margem e lucro</TabsTrigger>
              <TabsTrigger value="products">Produtos</TabsTrigger>
              <TabsTrigger value="b2b">B2B / Atacado</TabsTrigger>
              <TabsTrigger value="coupons">Cupons</TabsTrigger>
              <TabsTrigger value="shipping">Frete</TabsTrigger>
              <TabsTrigger value="mp">Mercado Pago</TabsTrigger>
              <TabsTrigger value="invoices">Notas fiscais</TabsTrigger>
              <TabsTrigger value="utm">Campanhas / UTM</TabsTrigger>
            </TabsList>

            {/* ABA: VENDAS */}
            <TabsContent value="sales" className="space-y-4 mt-4">
              <div className="flex justify-end">
                <Button
                  onClick={() => handleExport(exportSalesReportCsv, "vendas")}
                  disabled={exporting || !sales}
                  variant="outline"
                  size="sm"
                >
                  {exporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Exportar CSV
                </Button>
              </div>
              {sales && (
                <SalesSection sales={sales} loading={loading} page={page} setPage={setPage} />
              )}
            </TabsContent>

            {/* ABA: MARGEM */}
            <TabsContent value="margin" className="space-y-4 mt-4">
              <MarginSection
                cards={marginCards}
                rows={marginRows}
                loading={marginLoading}
                page={marginPage}
                setPage={setMarginPage}
                statusFilter={marginStatusFilter}
                setStatusFilter={setMarginStatusFilter}
                onExport={() => handleExport(exportMarginByOrderCsv, "margem")}
                exporting={exporting}
              />
            </TabsContent>

            {/* ABA: PRODUTOS */}
            <TabsContent value="products" className="space-y-4 mt-4">
              <ProductsSection
                data={products}
                loading={productsLoading}
                onExport={() => handleExport(exportProductsReportCsv, "produtos")}
                exporting={exporting}
              />
            </TabsContent>

            {/* ABA: B2B */}
            <TabsContent value="b2b" className="space-y-4 mt-4">
              <B2bSection
                data={b2b}
                loading={b2bLoading}
                exporting={exporting}
                onExportCompanies={() => handleExport(exportB2bCompaniesCsv, "B2B empresas")}
                onExportProducts={() => handleExport(exportB2bProductsCsv, "B2B produtos")}
              />
            </TabsContent>

            {/* ABA: CUPONS */}
            <TabsContent value="coupons" className="space-y-4 mt-4">
              <CouponsSection
                data={coupons}
                loading={couponsLoading}
                exporting={exporting}
                onExportCoupons={() => handleExport(exportCouponsCsv, "cupons")}
                onExportDiscounts={() => handleExport(exportDiscountsByOrderCsv, "descontos")}
              />
            </TabsContent>

            {/* ABA: FRETE */}
            <TabsContent value="shipping" className="space-y-4 mt-4">
              <ShippingSection
                data={shipping}
                loading={shippingLoading}
                exporting={exporting}
                page={shippingPage}
                setPage={setShippingPage}
                onExportOrders={() => handleExport(exportShippingByOrderCsv, "frete pedidos")}
                onExportDistricts={() => handleExport(exportShippingByDistrictCsv, "frete bairros")}
              />
            </TabsContent>

            {/* ABA: MERCADO PAGO */}
            <TabsContent value="mp" className="space-y-4 mt-4">
              <MpSection
                cards={mpCards}
                list={mpList}
                loading={mpLoading}
                page={mpPage}
                setPage={setMpPage}
                feeSource={mpFeeSource}
                setFeeSource={setMpFeeSource}
                onExport={() => handleExport(exportMpPaymentsCsv, "Mercado Pago")}
                exporting={exporting}
              />
            </TabsContent>

            {/* ABA: NOTAS FISCAIS */}
            <TabsContent value="invoices" className="space-y-4 mt-4">
              <InvoicesSection
                cards={invCards}
                list={invList}
                loading={invLoading}
                page={invPage}
                setPage={setInvPage}
                statusFilter={invStatus}
                setStatusFilter={setInvStatus}
                onExport={() => handleExport(exportInvoicesCsv, "notas fiscais")}
                exporting={exporting}
              />
            </TabsContent>

            {/* ABA: CAMPANHAS / UTM */}
            <TabsContent value="utm" className="space-y-4 mt-4">
              <UtmSection
                cards={utmCards}
                campaigns={utmCampaigns}
                origins={utmOrigins}
                orders={utmOrders}
                quality={utmQuality}
                loading={utmLoading}
                page={utmPage}
                setPage={setUtmPage}
                attribution={attribution}
                setAttribution={setAttribution}
                onExportCampaigns={() => handleExport(exportCampaignPerformanceCsv, "campanhas")}
                onExportOrigins={() => handleExport(exportOriginPerformanceCsv, "origens")}
                onExportOrders={() => handleExport(exportAttributedOrdersCsv, "pedidos atribuídos")}
                onExportQuality={() =>
                  handleExport(exportAttributionQualityCsv, "qualidade da atribuição")
                }
                exporting={exporting}
              />
            </TabsContent>
          </Tabs>
        </div>
      </TooltipProvider>
    </AdminLayout>
  );
}

// ============================================================
// SECTION: VENDAS
// ============================================================

function SalesSection({
  sales,
  loading,
  page,
  setPage,
}: {
  sales: SalesReportResult;
  loading: boolean;
  page: number;
  setPage: (fn: (p: number) => number) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-bold">Vendas</h2>
        <span className="text-xs text-muted-foreground">
          {sales.summary.totalOrders} pedido(s) · página {sales.page}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-2">Por tipo</p>
          <div className="flex justify-between text-sm">
            <span>B2C</span>
            <span className="font-medium">
              {sales.summary.byOrderType.b2c.count} · {brl(sales.summary.byOrderType.b2c.total)}
            </span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span>B2B</span>
            <span className="font-medium">
              {sales.summary.byOrderType.b2b.count} · {brl(sales.summary.byOrderType.b2b.total)}
            </span>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-2">Por método de pagamento</p>
          {sales.summary.byPaymentMethod.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados.</p>
          ) : (
            sales.summary.byPaymentMethod.slice(0, 4).map((m) => (
              <div key={m.key} className="flex justify-between text-sm">
                <span className="truncate">{m.label}</span>
                <span className="font-medium">
                  {m.count} · {brl(m.total)}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-2">Por entrega</p>
          {sales.summary.byDeliveryMethod.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados.</p>
          ) : (
            sales.summary.byDeliveryMethod.map((m) => (
              <div key={m.key} className="flex justify-between text-sm">
                <span className="truncate">{m.label}</span>
                <span className="font-medium">
                  {m.count} · {brl(m.total)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Data</th>
                <th className="text-left px-3 py-2">Pedido</th>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Tipo</th>
                <th className="text-right px-3 py-2">Bruto</th>
                <th className="text-right px-3 py-2">Desc.</th>
                <th className="text-right px-3 py-2">Frete</th>
                <th className="text-right px-3 py-2">Taxa MP</th>
                <th className="text-right px-3 py-2">Líquido</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {sales.rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-muted-foreground">
                    Nenhum pedido no período com esses filtros.
                  </td>
                </tr>
              ) : (
                sales.rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {fmtDateTime(r.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to="/admin/pedidos/$orderId"
                        params={{ orderId: r.id }}
                        className="text-primary hover:underline font-medium"
                      >
                        #{r.order_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 truncate max-w-[200px]">
                      {r.customer_name}
                      {r.company_name && (
                        <span className="block text-xs text-muted-foreground truncate">
                          {r.company_name}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={r.order_type === "b2b" ? "default" : "secondary"}>
                        {r.order_type.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{brl(r.total)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
                      {r.discount > 0 ? `-${brl(r.discount)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
                      {brl(r.shipping_cost)}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
                      {r.mp_fee_amount != null
                        ? brl(r.mp_fee_amount)
                        : r.estimated_fee_amount != null
                          ? `~${brl(r.estimated_fee_amount)}`
                          : "—"}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-medium">
                      {brl(r.net_amount)}
                    </td>
                    <td className="px-3 py-2 text-xs">{r.payment_status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {sales.total > sales.pageSize && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs">
            <span className="text-muted-foreground">
              {(sales.page - 1) * sales.pageSize + 1}–
              {Math.min(sales.page * sales.pageSize, sales.total)} de {sales.total}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={sales.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={sales.page * sales.pageSize >= sales.total || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================
// SECTION: MARGEM
// ============================================================

function MarginSection({
  cards,
  rows,
  loading,
  page,
  setPage,
  statusFilter,
  setStatusFilter,
  onExport,
  exporting,
}: {
  cards: MarginCards | null;
  rows: MarginOrderResult | null;
  loading: boolean;
  page: number;
  setPage: (fn: (p: number) => number) => void;
  statusFilter: "all" | MarginStatus;
  setStatusFilter: (s: "all" | MarginStatus) => void;
  onExport: () => void;
  exporting: boolean;
}) {
  if (loading && !cards) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando margem…
      </div>
    );
  }
  if (!cards) return null;

  const cardDefs: CardDef[] = [
    { label: "Receita (pedidos pagos)", value: brl(cards.revenue) },
    {
      label: "Custo dos produtos vendidos",
      value: brl(cards.cogs),
      tooltip: "Soma do custo gravado no momento da venda. Não usa custo atual do cadastro.",
      warn: cards.itemsWithoutCost > 0,
    },
    {
      label: "Lucro bruto estimado",
      value: brl(cards.estimatedGrossProfit),
      tooltip: "Receita − taxas Mercado Pago − custo dos produtos.",
      warn: cards.hasEstimatedFees || cards.itemsWithoutCost > 0,
    },
    {
      label: "Margem média ponderada",
      value: pct(cards.averageMarginPercent),
      tooltip: "Margem ponderada entre os pedidos com cálculo completo.",
    },
    {
      label: "Pedidos com margem crítica",
      value: String(cards.ordersCritical),
      warn: cards.ordersCritical > 0,
      tooltip: `Margem abaixo de ${pct(cards.defaultMinMargin)} (mínima padrão).`,
    },
    {
      label: "Pedidos com cálculo incompleto",
      value: String(cards.ordersIncomplete),
      warn: cards.ordersIncomplete > 0,
      tooltip: "Pedidos com pelo menos um item sem custo cadastrado.",
    },
    {
      label: "Itens vendidos sem custo",
      value: String(cards.itemsWithoutCost),
      warn: cards.itemsWithoutCost > 0,
    },
    {
      label: "Produtos sem custo cadastrado",
      value: String(cards.productsWithoutCost),
      warn: cards.productsWithoutCost > 0,
    },
  ];

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cardDefs.map((c) => (
          <MetricCard key={c.label} card={c} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-bold">Margem por pedido</h2>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as "all" | MarginStatus)}
          >
            <SelectTrigger className="h-8 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as margens</SelectItem>
              <SelectItem value="good">Boa</SelectItem>
              <SelectItem value="warning">Atenção</SelectItem>
              <SelectItem value="critical">Crítica</SelectItem>
              <SelectItem value="incomplete">Incompleta</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={onExport} disabled={exporting}>
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Exportar CSV
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        O custo usado aqui é o custo salvo no momento da venda — alterar o custo de um produto hoje
        não modifica pedidos antigos.
      </p>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Data</th>
                <th className="text-left px-3 py-2">Pedido</th>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Tipo</th>
                <th className="text-right px-3 py-2">Receita</th>
                <th className="text-right px-3 py-2">Taxa MP</th>
                <th className="text-right px-3 py-2">Custo</th>
                <th className="text-right px-3 py-2">Lucro</th>
                <th className="text-right px-3 py-2">Margem</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Cálculo</th>
              </tr>
            </thead>
            <tbody>
              {!rows || rows.rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-10 text-muted-foreground">
                    Nenhum pedido no período com esses filtros.
                  </td>
                </tr>
              ) : (
                rows.rows.map((r) => <MarginRow key={r.id} row={r} />)
              )}
            </tbody>
          </table>
        </div>
        {rows && rows.total > rows.pageSize && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs">
            <span className="text-muted-foreground">
              {(rows.page - 1) * rows.pageSize + 1}–
              {Math.min(rows.page * rows.pageSize, rows.total)} de {rows.total}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={rows.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={rows.page * rows.pageSize >= rows.total || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function MarginRow({ row }: { row: MarginOrderRow }) {
  const incomplete = row.calc_status === "incomplete";
  return (
    <tr className="border-t border-border hover:bg-muted/20">
      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDateTime(row.created_at)}</td>
      <td className="px-3 py-2">
        <Link
          to="/admin/pedidos/$orderId"
          params={{ orderId: row.id }}
          className="text-primary hover:underline font-medium"
        >
          #{row.order_number}
        </Link>
      </td>
      <td className="px-3 py-2 truncate max-w-[180px]">
        {row.customer_name}
        {row.company_name && (
          <span className="block text-xs text-muted-foreground truncate">{row.company_name}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <Badge variant={row.order_type === "b2b" ? "default" : "secondary"}>
          {row.order_type.toUpperCase()}
        </Badge>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">{brl(row.revenue)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
        {row.fee > 0 ? brl(row.fee) : "—"}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
        {incomplete ? <span className="italic text-xs">incompleto</span> : brl(row.cogs)}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap font-medium">
        {incomplete ? "—" : brl(row.profit)}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap font-medium">
        {incomplete ? "—" : pct(row.margin_percent)}
      </td>
      <td className="px-3 py-2">
        <MarginStatusBadge status={row.margin_status} />
      </td>
      <td className="px-3 py-2">
        <CalcStatusBadge status={row.calc_status} />
      </td>
    </tr>
  );
}

// ============================================================
// SECTION: PRODUTOS
// ============================================================

function ProductsSection({
  data,
  loading,
  onExport,
  exporting,
}: {
  data: ProductsReportResult | null;
  loading: boolean;
  onExport: () => void;
  exporting: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando produtos…
      </div>
    );
  }
  if (!data) return null;

  const cardDefs: CardDef[] = [
    { label: "Produtos vendidos", value: String(data.cards.productsCount) },
    { label: "Quantidade total", value: String(data.cards.qtyTotal) },
    { label: "Receita por produtos", value: brl(data.cards.revenue) },
    {
      label: "Custo total",
      value: brl(data.cards.cogs),
      warn: data.cards.productsWithoutCost > 0,
      hint: data.cards.productsWithoutCost > 0 ? "Há produtos sem custo" : undefined,
    },
    {
      label: "Lucro estimado",
      value: brl(data.cards.profit),
      tooltip: "Soma de receita − custo (apenas produtos com custo cadastrado).",
    },
    {
      label: "Produtos sem custo",
      value: String(data.cards.productsWithoutCost),
      warn: data.cards.productsWithoutCost > 0,
    },
    {
      label: "Produtos com margem crítica",
      value: String(data.cards.productsCritical),
      warn: data.cards.productsCritical > 0,
    },
  ];

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cardDefs.map((c) => (
          <MetricCard key={c.label} card={c} />
        ))}
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <RankCard title="Top por faturamento" items={data.topByRevenue} mode="revenue" />
        <RankCard title="Top por lucro estimado" items={data.topByProfit} mode="profit" />
        <RankCard title="Top por quantidade" items={data.topByQty} mode="qty" />
      </div>
      {(data.critical.length > 0 || data.withoutCost.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.critical.length > 0 && (
            <RankCard title="Margem crítica" items={data.critical} mode="margin" />
          )}
          {data.withoutCost.length > 0 && (
            <RankCard title="Sem custo cadastrado" items={data.withoutCost} mode="qty" />
          )}
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="font-display text-xl font-bold">Produtos</h2>
        <Button size="sm" variant="outline" onClick={onExport} disabled={exporting}>
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Exportar CSV
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Produto</th>
                <th className="text-left px-3 py-2">SKU</th>
                <th className="text-left px-3 py-2">Categoria</th>
                <th className="text-right px-3 py-2">Qtd</th>
                <th className="text-right px-3 py-2">Receita</th>
                <th className="text-right px-3 py-2">Custo</th>
                <th className="text-right px-3 py-2">Lucro</th>
                <th className="text-right px-3 py-2">Margem</th>
                <th className="text-right px-3 py-2">Preço médio</th>
                <th className="text-right px-3 py-2">Estoque</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-10 text-muted-foreground">
                    Nenhum produto vendido no período.
                  </td>
                </tr>
              ) : (
                data.rows.slice(0, 200).map((r) => (
                  <tr key={r.product_id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2">
                      {r.product_id.startsWith("unknown-") ? (
                        <span>{r.product_name}</span>
                      ) : (
                        <Link
                          to="/admin/produtos/$id"
                          params={{ id: r.product_id }}
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {r.product_name}
                          <ExternalLink className="w-3 h-3 opacity-60" />
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.sku ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.category ?? "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{r.qty_sold}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{brl(r.revenue)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
                      {r.has_cost ? brl(r.total_cost) : <span className="italic text-xs">sem</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-medium">
                      {r.has_cost ? brl(r.profit) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-medium">
                      {r.has_cost ? pct(r.margin_percent) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
                      {brl(r.avg_price)}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
                      {r.stock_qty ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <MarginStatusBadge status={r.margin_status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data.rows.length > 200 && (
          <p className="text-xs text-muted-foreground px-3 py-2 border-t border-border">
            Exibindo 200 de {data.rows.length} produtos. Use a exportação CSV para a lista completa.
          </p>
        )}
      </div>
    </section>
  );
}

function RankCard({
  title,
  items,
  mode,
}: {
  title: string;
  items: ProductReportRow[];
  mode: "revenue" | "profit" | "qty" | "margin";
}) {
  const valueOf = (r: ProductReportRow) => {
    switch (mode) {
      case "revenue":
        return brl(r.revenue);
      case "profit":
        return brl(r.profit);
      case "qty":
        return `${r.qty_sold} un`;
      case "margin":
        return r.has_cost ? pct(r.margin_percent) : "—";
    }
  };
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs font-medium text-muted-foreground mb-3">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem dados.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((r, i) => (
            <li key={r.product_id} className="flex items-start justify-between gap-2 text-sm">
              <span className="truncate">
                <span className="text-muted-foreground mr-1">{i + 1}.</span>
                {r.product_name}
              </span>
              <span className="font-medium whitespace-nowrap">{valueOf(r)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================
// SECTION: B2B / ATACADO
// ============================================================

function B2bSection({
  data,
  loading,
  exporting,
  onExportCompanies,
  onExportProducts,
}: {
  data: { cards: B2bCards; companies: B2bCompanyRow[]; products: B2bProductRow[] } | null;
  loading: boolean;
  exporting: boolean;
  onExportCompanies: () => void;
  onExportProducts: () => void;
}) {
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando B2B…
      </div>
    );
  }
  if (!data) return null;
  const c = data.cards;
  const cardDefs: CardDef[] = [
    { label: "Pedidos B2B", value: String(c.ordersB2b) },
    { label: "Faturamento B2B", value: brl(c.revenueB2b) },
    { label: "Ticket médio B2B", value: brl(c.averageTicketB2b) },
    {
      label: "Desconto B2B concedido",
      value: brl(c.b2bDiscountTotal),
      tooltip: "Economia concedida para empresas em relação ao preço normal.",
    },
    {
      label: "Lucro estimado B2B",
      value: brl(c.estimatedProfitB2b),
      warn: c.hasIncomplete,
      tooltip: "Receita B2B − custo dos itens B2B − parcela da taxa MP atribuída ao B2B.",
    },
    {
      label: "Margem B2B estimada",
      value: pct(c.estimatedMarginPercentB2b),
      warn: c.hasIncomplete,
    },
    { label: "Empresas compradoras", value: String(c.companiesBuying) },
    { label: "Produtos B2B vendidos", value: String(c.productsB2bSold) },
    {
      label: "Pedidos mistos",
      value: String(c.ordersMixed),
      tooltip: "Pedidos com itens com preço B2B e itens com preço normal na mesma compra.",
    },
    {
      label: "Itens B2B sem custo",
      value: String(c.itemsB2bWithoutCost),
      warn: c.itemsB2bWithoutCost > 0,
    },
  ];
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {cardDefs.map((d) => (
          <MetricCard key={d.label} card={d} />
        ))}
      </div>

      {c.ordersB2b === 0 && (
        <div className="bg-muted/40 border border-border rounded-xl p-6 text-sm text-muted-foreground text-center">
          Nenhum pedido B2B no período com esses filtros.
        </div>
      )}

      {/* Empresas */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Empresas B2B</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={onExportCompanies}
          disabled={exporting || data.companies.length === 0}
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Exportar CSV
        </Button>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Empresa</th>
                <th className="text-left px-3 py-2">CNPJ</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Pedidos</th>
                <th className="text-right px-3 py-2">Faturamento</th>
                <th className="text-right px-3 py-2">Desconto B2B</th>
                <th className="text-right px-3 py-2">Ticket médio</th>
                <th className="text-right px-3 py-2">Lucro</th>
                <th className="text-right px-3 py-2">Margem</th>
                <th className="text-left px-3 py-2">Última</th>
              </tr>
            </thead>
            <tbody>
              {data.companies.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-muted-foreground">
                    Sem dados.
                  </td>
                </tr>
              ) : (
                data.companies.slice(0, 200).map((r, i) => (
                  <tr
                    key={`${r.company_id ?? "x"}-${i}`}
                    className="border-t border-border hover:bg-muted/20"
                  >
                    <td className="px-3 py-2 truncate max-w-[200px]">
                      {r.company_id ? (
                        <Link
                          to="/admin/empresas"
                          search={{ id: r.company_id }}
                          className="text-primary hover:underline"
                        >
                          {r.company_name}
                        </Link>
                      ) : (
                        r.company_name
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.cnpj_masked}</td>
                    <td className="px-3 py-2 text-xs">{r.status ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{r.orders}</td>
                    <td className="px-3 py-2 text-right">{brl(r.revenue)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {brl(r.b2b_discount)}
                    </td>
                    <td className="px-3 py-2 text-right">{brl(r.average_ticket)}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {r.margin_incomplete ? (
                        <span className="italic text-xs text-muted-foreground">incompleto</span>
                      ) : (
                        brl(r.estimated_profit)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {r.margin_incomplete ? "—" : pct(r.margin_percent)}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {r.last_order_at ? fmtDate(r.last_order_at) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Produtos B2B */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Produtos B2B</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={onExportProducts}
          disabled={exporting || data.products.length === 0}
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Exportar CSV
        </Button>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Produto</th>
                <th className="text-left px-3 py-2">SKU</th>
                <th className="text-left px-3 py-2">Categoria</th>
                <th className="text-right px-3 py-2">Qtd</th>
                <th className="text-right px-3 py-2">Receita B2B</th>
                <th className="text-right px-3 py-2">Preço médio</th>
                <th className="text-right px-3 py-2">Desconto B2B</th>
                <th className="text-right px-3 py-2">Lucro</th>
                <th className="text-right px-3 py-2">Margem</th>
                <th className="text-right px-3 py-2">Empresas</th>
              </tr>
            </thead>
            <tbody>
              {data.products.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-muted-foreground">
                    Sem dados.
                  </td>
                </tr>
              ) : (
                data.products.slice(0, 200).map((r, i) => (
                  <tr
                    key={`${r.product_id ?? "x"}-${i}`}
                    className="border-t border-border hover:bg-muted/20"
                  >
                    <td className="px-3 py-2 truncate max-w-[200px]">
                      {r.product_id ? (
                        <Link
                          to="/admin/produtos/$id"
                          params={{ id: r.product_id }}
                          className="text-primary hover:underline"
                        >
                          {r.product_name}
                        </Link>
                      ) : (
                        r.product_name
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.sku ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.category ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{r.qty_sold}</td>
                    <td className="px-3 py-2 text-right">{brl(r.revenue)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {brl(r.avg_price)}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {brl(r.b2b_discount_total)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {r.margin_incomplete ? (
                        <span className="italic text-xs text-muted-foreground">incompleto</span>
                      ) : (
                        brl(r.estimated_profit)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {r.margin_incomplete ? "—" : pct(r.margin_percent)}
                    </td>
                    <td className="px-3 py-2 text-right">{r.companies_count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// SECTION: CUPONS E DESCONTOS
// ============================================================

function CouponsSection({
  data,
  loading,
  exporting,
  onExportCoupons,
  onExportDiscounts,
}: {
  data: { cards: CouponsCards; coupons: CouponPerfRow[]; orders: DiscountByOrderRow[] } | null;
  loading: boolean;
  exporting: boolean;
  onExportCoupons: () => void;
  onExportDiscounts: () => void;
}) {
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando cupons…
      </div>
    );
  }
  if (!data) return null;
  const c = data.cards;
  const cardDefs: CardDef[] = [
    {
      label: "Descontos totais",
      value: brl(c.totalDiscounts),
      tooltip: "Soma de descontos B2B + cupons + combos no período.",
    },
    { label: "Desconto B2B", value: brl(c.b2bDiscounts) },
    { label: "Desconto de cupons", value: brl(c.couponDiscounts) },
    {
      label: "Desconto de combos",
      value: brl(c.bundleDiscounts),
      tooltip: "Soma dos descontos aplicados via combos/kits no período.",
    },
    { label: "Cupons utilizados", value: String(c.couponsUsed) },
    { label: "Pedidos com cupom", value: String(c.ordersWithCoupon) },
    { label: "Pedidos com combo", value: String(c.ordersWithBundle) },
    { label: "Ticket médio com cupom", value: brl(c.averageTicketWithCoupon) },
    { label: "Margem média com cupom", value: pct(c.averageMarginWithCoupon) },
    {
      label: "Cupons com margem crítica",
      value: String(c.couponsCritical),
      warn: c.couponsCritical > 0,
    },
    {
      label: "Cupons vencidos ativos",
      value: String(c.couponsExpiredButActive),
      warn: c.couponsExpiredButActive > 0,
      tooltip: "Cupons marcados como ativos mas com data de validade já expirada.",
    },
  ];
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {cardDefs.map((d) => (
          <MetricCard key={d.label} card={d} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Cupons podem aumentar vendas, mas também podem reduzir a margem. Acompanhe os pedidos
        críticos.
      </p>

      {/* Performance de cupons */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Performance de cupons</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={onExportCoupons}
          disabled={exporting || data.coupons.length === 0}
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Exportar CSV
        </Button>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Cupom</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Usos</th>
                <th className="text-right px-3 py-2">Faturamento</th>
                <th className="text-right px-3 py-2">Desconto</th>
                <th className="text-right px-3 py-2">Ticket médio</th>
                <th className="text-right px-3 py-2">Margem média</th>
                <th className="text-right px-3 py-2">Críticos</th>
                <th className="text-left px-3 py-2">Validade</th>
              </tr>
            </thead>
            <tbody>
              {data.coupons.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-muted-foreground">
                    Nenhum cupom usado no período.
                  </td>
                </tr>
              ) : (
                data.coupons.map((r) => (
                  <tr key={r.code} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{r.code}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.expired && r.active ? (
                        <span className="text-amber-600 dark:text-amber-400">Vencido (ativo)</span>
                      ) : r.active ? (
                        "Ativo"
                      ) : (
                        "Inativo"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{r.uses}</td>
                    <td className="px-3 py-2 text-right">{brl(r.revenue)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {brl(r.discount_total)}
                    </td>
                    <td className="px-3 py-2 text-right">{brl(r.average_ticket)}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {r.margin_incomplete ? "—" : pct(r.margin_percent)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right ${r.orders_critical > 0 ? "text-destructive font-medium" : ""}`}
                    >
                      {r.orders_critical}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {r.expires_at ? fmtDate(r.expires_at) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Descontos por pedido */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Descontos por pedido</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={onExportDiscounts}
          disabled={exporting || data.orders.length === 0}
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Exportar CSV
        </Button>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Data</th>
                <th className="text-left px-3 py-2">Pedido</th>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Tipo</th>
                <th className="text-left px-3 py-2">Cupom</th>
                <th className="text-right px-3 py-2">Desc. cupom</th>
                <th className="text-right px-3 py-2">Desc. B2B</th>
                <th className="text-right px-3 py-2">Desc. combo</th>
                <th className="text-right px-3 py-2">Total desc.</th>
                <th className="text-right px-3 py-2">Receita</th>
                <th className="text-right px-3 py-2">Margem</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-8 text-muted-foreground">
                    Sem pedidos com desconto no período.
                  </td>
                </tr>
              ) : (
                data.orders.slice(0, 300).map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {fmtDateTime(r.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to="/admin/pedidos/$orderId"
                        params={{ orderId: r.id }}
                        className="text-primary hover:underline font-medium"
                      >
                        #{r.order_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 truncate max-w-[160px]">{r.customer_name}</td>
                    <td className="px-3 py-2">
                      <Badge variant={r.order_type === "b2b" ? "default" : "secondary"}>
                        {r.order_type.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.coupon_code ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {r.coupon_discount > 0 ? brl(r.coupon_discount) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {r.b2b_discount > 0 ? brl(r.b2b_discount) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {r.bundle_discount > 0 ? brl(r.bundle_discount) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{brl(r.total_discount)}</td>
                    <td className="px-3 py-2 text-right">{brl(r.final_revenue)}</td>
                    <td className="px-3 py-2 text-right">
                      {r.margin_status === "incomplete" ? "—" : pct(r.margin_percent)}
                    </td>
                    <td className="px-3 py-2">
                      <MarginStatusBadge status={r.margin_status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data.orders.length > 300 && (
          <p className="text-xs text-muted-foreground px-3 py-2 border-t border-border">
            Exibindo 300 de {data.orders.length}. Use a exportação para a lista completa.
          </p>
        )}
      </div>
    </section>
  );
}

// ============================================================
// SECTION: FRETE / LOGÍSTICA
// ============================================================

function ShippingSection({
  data,
  loading,
  exporting,
  page,
  setPage,
  onExportOrders,
  onExportDistricts,
}: {
  data: {
    cards: ShippingCards;
    orders: { rows: ShippingOrderRow[]; total: number; page: number; pageSize: number };
    districts: ShippingDistrictRow[];
  } | null;
  loading: boolean;
  exporting: boolean;
  page: number;
  setPage: (fn: (p: number) => number) => void;
  onExportOrders: () => void;
  onExportDistricts: () => void;
}) {
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando frete…
      </div>
    );
  }
  if (!data) return null;
  const c = data.cards;
  const deliveryLabel: Record<string, string> = {
    pickup: "Retirada",
    local_delivery: "Frete local",
    delivery: "Convencional",
  };
  const cardDefs: CardDef[] = [
    { label: "Frete total cobrado", value: brl(c.shippingTotal) },
    { label: "Valor médio de frete", value: brl(c.averageShipping) },
    { label: "Pedidos com retirada", value: String(c.ordersPickup) },
    { label: "Pedidos com frete local", value: String(c.ordersLocalDelivery) },
    { label: "Pedidos com convencional", value: String(c.ordersConventional) },
    { label: "Receita de frete local", value: brl(c.localShippingRevenue) },
    {
      label: "Pedidos com frete grátis",
      value: String(c.ordersFreeShipping),
      tooltip: "Pedidos com entrega cobrada R$ 0,00 (excluindo retirada).",
    },
    { label: "Pedidos com frete R$ 0", value: String(c.ordersZeroShipping) },
    { label: "Bairros atendidos", value: String(c.localDistrictsCount) },
    {
      label: "Retiradas pendentes",
      value: String(c.pickupPending),
      warn: c.pickupPending > 0,
      tooltip: "Retiradas criadas há mais de 3 dias e ainda não concluídas.",
    },
  ];
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {cardDefs.map((d) => (
          <MetricCard key={d.label} card={d} />
        ))}
      </div>

      {/* Bairros */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Frete local por bairro</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={onExportDistricts}
          disabled={exporting || data.districts.length === 0}
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Exportar CSV
        </Button>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Bairro</th>
                <th className="text-right px-3 py-2">Pedidos</th>
                <th className="text-right px-3 py-2">Receita frete</th>
                <th className="text-right px-3 py-2">Frete médio</th>
                <th className="text-right px-3 py-2">Faturamento</th>
                <th className="text-right px-3 py-2">Ticket médio</th>
                <th className="text-left px-3 py-2">Última entrega</th>
              </tr>
            </thead>
            <tbody>
              {data.districts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground">
                    Sem entregas locais no período.
                  </td>
                </tr>
              ) : (
                data.districts.map((r) => (
                  <tr key={r.district} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2">{r.district}</td>
                    <td className="px-3 py-2 text-right">{r.orders}</td>
                    <td className="px-3 py-2 text-right">{brl(r.shipping_revenue)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {brl(r.average_shipping)}
                    </td>
                    <td className="px-3 py-2 text-right">{brl(r.orders_revenue)}</td>
                    <td className="px-3 py-2 text-right">{brl(r.average_ticket)}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {r.last_delivery_at ? fmtDate(r.last_delivery_at) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Frete por pedido */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Frete por pedido</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={onExportOrders}
          disabled={exporting || data.orders.rows.length === 0}
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Exportar CSV
        </Button>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Data</th>
                <th className="text-left px-3 py-2">Pedido</th>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Tipo</th>
                <th className="text-left px-3 py-2">Entrega</th>
                <th className="text-left px-3 py-2">Bairro</th>
                <th className="text-right px-3 py-2">Frete</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-muted-foreground">
                    Sem pedidos no período.
                  </td>
                </tr>
              ) : (
                data.orders.rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {fmtDateTime(r.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to="/admin/pedidos/$orderId"
                        params={{ orderId: r.id }}
                        className="text-primary hover:underline font-medium"
                      >
                        #{r.order_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 truncate max-w-[160px]">{r.customer_name}</td>
                    <td className="px-3 py-2">
                      <Badge variant={r.order_type === "b2b" ? "default" : "secondary"}>
                        {r.order_type.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {deliveryLabel[r.delivery_method] ?? r.delivery_method}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.district ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{brl(r.shipping_cost)}</td>
                    <td className="px-3 py-2 text-right">{brl(r.total)}</td>
                    <td className="px-3 py-2 text-xs">{r.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data.orders.total > data.orders.pageSize && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs">
            <span className="text-muted-foreground">
              {(data.orders.page - 1) * data.orders.pageSize + 1}–
              {Math.min(data.orders.page * data.orders.pageSize, data.orders.total)} de{" "}
              {data.orders.total}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={data.orders.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={data.orders.page * data.orders.pageSize >= data.orders.total || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================
// SECTION: MERCADO PAGO
// ============================================================

const MP_FEE_SOURCE_OPTIONS: Array<{
  id: "all" | "mercado_pago_real" | "estimated" | "unknown";
  label: string;
}> = [
  { id: "all", label: "Todas as origens" },
  { id: "mercado_pago_real", label: "Taxa real" },
  { id: "estimated", label: "Taxa estimada" },
  { id: "unknown", label: "Taxa desconhecida" },
];

function FeeSourceBadge({ src }: { src: "mercado_pago_real" | "estimated" | "unknown" }) {
  const map = {
    mercado_pago_real: {
      label: "Real",
      cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    },
    estimated: { label: "Estimada", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    unknown: { label: "Desconhecida", cls: "bg-muted text-muted-foreground" },
  } as const;
  const m = map[src];
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${m.cls}`}>{m.label}</span>
  );
}

function MpSection({
  cards,
  list,
  loading,
  page,
  setPage,
  feeSource,
  setFeeSource,
  onExport,
  exporting,
}: {
  cards: MpReportCards | null;
  list: MpListResult | null;
  loading: boolean;
  page: number;
  setPage: (fn: (p: number) => number) => void;
  feeSource: "all" | "mercado_pago_real" | "estimated" | "unknown";
  setFeeSource: (v: "all" | "mercado_pago_real" | "estimated" | "unknown") => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const cardDefs: CardDef[] = cards
    ? [
        { label: "Valor bruto pago", value: brl(cards.grossPaid) },
        {
          label: "Taxas reais MP",
          value: brl(cards.realFees),
          tooltip: "Soma das taxas confirmadas pelo Mercado Pago.",
        },
        {
          label: "Taxas estimadas MP",
          value: brl(cards.estimatedFees),
          warn: cards.estimatedFees > 0,
          tooltip: "Estimativa usada quando o MP não retorna a taxa real.",
        },
        { label: "Valor líquido", value: brl(cards.netRevenue) },
        { label: "Pagamentos pagos", value: String(cards.countPaid) },
        {
          label: "Pendentes",
          value: String(cards.countPending),
          warn: cards.pendingOlderThan24h > 0,
          hint: cards.pendingOlderThan24h > 0 ? `${cards.pendingOlderThan24h} há +24h` : undefined,
        },
        { label: "Recusados", value: String(cards.countRejected) },
        { label: "Cancelados", value: String(cards.countCancelled) },
        { label: "Com taxa real", value: `${cards.countFeeReal} (${pct(cards.pctFeeReal)})` },
        {
          label: "Com taxa estimada",
          value: `${cards.countFeeEstimated} (${pct(cards.pctFeeEstimated)})`,
          warn: cards.countFeeEstimated > 0,
        },
        {
          label: "Com taxa desconhecida",
          value: `${cards.countFeeUnknown} (${pct(cards.pctFeeUnknown)})`,
          warn: cards.countFeeUnknown > 0,
        },
        {
          label: "Webhooks com erro",
          value: String(cards.webhookErrors),
          warn: cards.webhookErrors > 0,
        },
        {
          label: "Último webhook",
          value: cards.lastWebhookAt ? fmtDateTime(cards.lastWebhookAt) : "—",
        },
        {
          label: "Sem ID Mercado Pago",
          value: String(cards.paymentsWithoutMpId),
          warn: cards.paymentsWithoutMpId > 0,
        },
        {
          label: "Sem método identificado",
          value: String(cards.paymentsWithoutMethod),
          warn: cards.paymentsWithoutMethod > 0,
        },
      ]
    : [];

  return (
    <section className="space-y-4">
      <div className="bg-muted/30 border border-border rounded-lg p-3 text-xs text-muted-foreground flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          A <strong>taxa real</strong> é retornada pelo Mercado Pago. A{" "}
          <strong>taxa estimada</strong> é usada quando o MP não retorna os detalhes da transação.
          Pagamentos com taxa <strong>desconhecida</strong> não puderam ser estimados — verifique o
          webhook.
        </p>
      </div>

      {loading && !cards ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {cardDefs.map((c) => (
            <MetricCard key={c.label} card={c} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Origem da taxa:</span>
          <Select value={feeSource} onValueChange={(v) => setFeeSource(v as typeof feeSource)}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MP_FEE_SOURCE_OPTIONS.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={onExport} disabled={exporting || !list}>
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Exportar CSV
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Data</th>
                <th className="text-left px-3 py-2">Pedido</th>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Tipo</th>
                <th className="text-left px-3 py-2">Método</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Bruto</th>
                <th className="text-right px-3 py-2">Taxa</th>
                <th className="text-left px-3 py-2">Origem</th>
                <th className="text-right px-3 py-2">Líquido</th>
                <th className="text-left px-3 py-2">Webhook</th>
              </tr>
            </thead>
            <tbody>
              {list && list.rows.length > 0 ? (
                list.rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {fmtDateTime(r.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to="/admin/pedidos/$orderId"
                        params={{ orderId: r.id }}
                        className="text-primary hover:underline font-medium"
                      >
                        #{r.order_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.customer_name || "—"}</td>
                    <td className="px-3 py-2 text-xs uppercase">{r.order_type}</td>
                    <td className="px-3 py-2 text-xs">{r.payment_method_label}</td>
                    <td className="px-3 py-2 text-xs">{r.payment_status}</td>
                    <td className="px-3 py-2 text-right text-xs">{brl(r.gross_amount)}</td>
                    <td className="px-3 py-2 text-right text-xs">
                      {r.fee_amount > 0 ? brl(r.fee_amount) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <FeeSourceBadge src={r.fee_source} />
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-medium">
                      {r.net_complete ? (
                        brl(r.net_amount)
                      ) : (
                        <span className="text-muted-foreground">incompleto</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.mp_webhook_error ? (
                        <span className="text-destructive" title={r.mp_webhook_error}>
                          Erro
                        </span>
                      ) : r.mp_last_webhook_at ? (
                        <span className="text-muted-foreground">
                          {fmtDateTime(r.mp_last_webhook_at)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground text-sm">
                    Nenhum pagamento no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {list && list.total > list.pageSize && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs">
            <span className="text-muted-foreground">
              {(list.page - 1) * list.pageSize + 1}–
              {Math.min(list.page * list.pageSize, list.total)} de {list.total}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={list.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={list.page * list.pageSize >= list.total || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================
// SECTION: NOTAS FISCAIS
// ============================================================

const INVOICE_STATUS_OPTIONS: Array<{
  id: "all" | "nao_necessaria" | "pendente_emissao" | "emitida" | "erro_emissao" | "cancelada";
  label: string;
}> = [
  { id: "all", label: "Todos os status" },
  { id: "pendente_emissao", label: "Pendente" },
  { id: "emitida", label: "Emitida" },
  { id: "erro_emissao", label: "Com erro" },
  { id: "cancelada", label: "Cancelada" },
  { id: "nao_necessaria", label: "Não necessária" },
];

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    nao_necessaria: { label: "Não necessária", cls: "bg-muted text-muted-foreground" },
    pendente_emissao: {
      label: "Pendente",
      cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    },
    emitida: { label: "Emitida", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    erro_emissao: { label: "Erro", cls: "bg-destructive/15 text-destructive" },
    cancelada: { label: "Cancelada", cls: "bg-muted text-muted-foreground" },
  };
  const m = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${m.cls}`}>{m.label}</span>
  );
}

function truncateKey(key: string | null) {
  if (!key) return "—";
  if (key.length <= 14) return key;
  return `${key.slice(0, 6)}…${key.slice(-6)}`;
}

function InvoicesSection({
  cards,
  list,
  loading,
  page,
  setPage,
  statusFilter,
  setStatusFilter,
  onExport,
  exporting,
}: {
  cards: InvoiceReportCards | null;
  list: InvoiceListResult | null;
  loading: boolean;
  page: number;
  setPage: (fn: (p: number) => number) => void;
  statusFilter:
    | "all"
    | "nao_necessaria"
    | "pendente_emissao"
    | "emitida"
    | "erro_emissao"
    | "cancelada";
  setStatusFilter: (
    v: "all" | "nao_necessaria" | "pendente_emissao" | "emitida" | "erro_emissao" | "cancelada",
  ) => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const cardDefs: CardDef[] = cards
    ? [
        { label: "Pendentes", value: String(cards.pending), warn: cards.pending > 0 },
        { label: "Emitidas", value: String(cards.issued) },
        { label: "Com erro", value: String(cards.errored), warn: cards.errored > 0 },
        { label: "Canceladas", value: String(cards.cancelled) },
        { label: "Não necessárias", value: String(cards.notRequired) },
        {
          label: "Pagos sem nota",
          value: String(cards.paidWithoutInvoice),
          warn: cards.paidWithoutInvoice > 0,
        },
        {
          label: "Pagos +24h sem nota",
          value: String(cards.paidOver24hWithoutInvoice),
          warn: cards.paidOver24hWithoutInvoice > 0,
        },
        {
          label: "B2B sem nota",
          value: String(cards.b2bPaidWithoutInvoice),
          warn: cards.b2bPaidWithoutInvoice > 0,
        },
        { label: "Valor emitido", value: brl(cards.totalIssuedAmount) },
        { label: "Valor pendente", value: brl(cards.totalPendingAmount) },
      ]
    : [];

  return (
    <section className="space-y-4">
      <div className="bg-muted/30 border border-border rounded-lg p-3 text-xs text-muted-foreground flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          Notas fiscais são <strong>registradas manualmente</strong> aqui após emissão fora da
          plataforma. Esta tela <strong>não emite NF-e automaticamente</strong>.
        </p>
      </div>

      {loading && !cards ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {cardDefs.map((c) => (
            <MetricCard key={c.label} card={c} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Status fiscal:</span>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INVOICE_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={onExport} disabled={exporting || !list}>
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Exportar CSV
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Data</th>
                <th className="text-left px-3 py-2">Pedido</th>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Tipo</th>
                <th className="text-left px-3 py-2">Empresa</th>
                <th className="text-right px-3 py-2">Valor</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Nº / Série</th>
                <th className="text-left px-3 py-2">Chave</th>
                <th className="text-left px-3 py-2">Emissão</th>
                <th className="text-left px-3 py-2">Tempo desde pagto</th>
                <th className="text-left px-3 py-2">Links</th>
              </tr>
            </thead>
            <tbody>
              {list && list.rows.length > 0 ? (
                list.rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {fmtDateTime(r.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to="/admin/pedidos/$orderId"
                        params={{ orderId: r.id }}
                        className="text-primary hover:underline font-medium"
                      >
                        #{r.order_number}
                      </Link>
                      {r.has_incomplete_fiscal_items && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400 inline ml-1" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            Este pedido contém produto com dados fiscais incompletos. Revise antes
                            de emitir a nota fiscal no sistema externo.
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{r.customer_name || "—"}</td>
                    <td className="px-3 py-2 text-xs uppercase">{r.order_type}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.company_name ? (
                        <div>
                          <div>{r.company_name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {r.company_cnpj_masked}
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">{brl(r.total)}</td>
                    <td className="px-3 py-2">
                      <InvoiceStatusBadge status={r.invoice_status} />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.invoice_number
                        ? `${r.invoice_number}${r.invoice_series ? ` / ${r.invoice_series}` : ""}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono">
                      {r.invoice_access_key ? (
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          title="Copiar chave de acesso"
                          onClick={() => {
                            navigator.clipboard.writeText(r.invoice_access_key!);
                            toast.success("Chave copiada.");
                          }}
                        >
                          {truncateKey(r.invoice_access_key)}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {r.invoice_issued_at ? fmtDateTime(r.invoice_issued_at) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.hours_since_paid != null ? `${Math.round(r.hours_since_paid)}h` : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex gap-2">
                        {r.invoice_danfe_url && (
                          <a
                            href={r.invoice_danfe_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-0.5"
                          >
                            DANFE <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {r.invoice_xml_url && (
                          <a
                            href={r.invoice_xml_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-0.5"
                          >
                            XML <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-muted-foreground text-sm">
                    Nenhuma nota fiscal no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {list && list.total > list.pageSize && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs">
            <span className="text-muted-foreground">
              {(list.page - 1) * list.pageSize + 1}–
              {Math.min(list.page * list.pageSize, list.total)} de {list.total}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={list.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={list.page * list.pageSize >= list.total || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================
// SECTION: CAMPANHAS / UTM
// ============================================================

function AttributionBadge({
  src,
}: {
  src: "utm_campaign" | "coupon_campaign" | "origin_context" | "none";
}) {
  const map = {
    utm_campaign: { label: "UTM", variant: "default" as const },
    coupon_campaign: { label: "Cupom", variant: "secondary" as const },
    origin_context: { label: "Origem", variant: "outline" as const },
    none: { label: "Sem atribuição", variant: "outline" as const },
  };
  const m = map[src];
  return (
    <Badge variant={m.variant} className="text-[10px]">
      {m.label}
    </Badge>
  );
}

function UtmSection({
  cards,
  campaigns,
  origins,
  orders,
  quality,
  loading,
  page,
  setPage,
  attribution,
  setAttribution,
  onExportCampaigns,
  onExportOrigins,
  onExportOrders,
  onExportQuality,
  exporting,
}: {
  cards: CampaignCards | null;
  campaigns: CampaignPerfRow[] | null;
  origins: OriginPerfRow[] | null;
  orders: { rows: AttributedOrderRow[]; total: number; page: number; pageSize: number } | null;
  quality: AttributionQuality | null;
  loading: boolean;
  page: number;
  setPage: (n: number) => void;
  attribution: "all" | "attributed" | "unattributed";
  setAttribution: (v: "all" | "attributed" | "unattributed") => void;
  onExportCampaigns: () => void;
  onExportOrigins: () => void;
  onExportOrders: () => void;
  onExportQuality: () => void;
  exporting: boolean;
}) {
  const totalPages = orders ? Math.max(1, Math.ceil(orders.total / orders.pageSize)) : 1;

  return (
    <div className="space-y-6">
      {/* Filtros locais */}
      <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Atribuição:</span>
        {(["all", "attributed", "unattributed"] as const).map((v) => (
          <Button
            key={v}
            size="sm"
            variant={attribution === v ? "default" : "outline"}
            onClick={() => setAttribution(v)}
          >
            {v === "all" ? "Todos" : v === "attributed" ? "Atribuídos" : "Sem atribuição"}
          </Button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onExportCampaigns}
            disabled={exporting || !campaigns}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Campanhas
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onExportOrigins}
            disabled={exporting || !origins}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Origens
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onExportOrders}
            disabled={exporting || !orders}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Pedidos
          </Button>
        </div>
      </div>

      {loading && !cards ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
        </div>
      ) : cards ? (
        <>
          {/* CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <MetricCard
              card={{
                label: "Receita atribuída",
                value: brl(cards.attributedRevenue),
                tooltip:
                  "Pedidos atribuídos são pedidos que possuem UTM ou vínculo com campanha/cupom.",
              }}
            />
            <MetricCard
              card={{ label: "Pedidos atribuídos", value: String(cards.attributedOrders) }}
            />
            <MetricCard
              card={{
                label: "% de atribuição",
                value: pct(cards.attributionRate),
                tooltip: "Quanto maior, melhor a análise de campanhas.",
                warn: cards.attributionRate < 30,
                hint: cards.attributionRate < 30 ? "Use links com UTM para melhorar" : undefined,
              }}
            />
            <MetricCard
              card={{
                label: "Pedidos sem atribuição",
                value: String(cards.unattributedOrders),
                warn: cards.unattributedOrders > 0,
                tooltip: "Vendas sem origem/campanha identificada.",
              }}
            />
            <MetricCard card={{ label: "Ticket médio", value: brl(cards.avgTicketAttributed) }} />
            <MetricCard
              card={{
                label: "Margem estimada",
                value: pct(cards.estimatedMargin),
                tooltip: "Margem por campanha usa o custo salvo no pedido no momento da venda.",
              }}
            />
            <MetricCard
              card={{ label: "Leads atribuídos", value: String(cards.attributedLeads) }}
            />
            <MetricCard
              card={{
                label: "Carrinhos abandonados",
                value: String(cards.attributedAbandoned),
                hint: cards.recoveredCarts > 0 ? `${cards.recoveredCarts} recuperados` : undefined,
              }}
            />
            <MetricCard
              card={{
                label: "Top campanha (receita)",
                value: cards.topRevenueCampaign?.label ?? "—",
                hint: cards.topRevenueCampaign ? brl(cards.topRevenueCampaign.revenue) : undefined,
              }}
            />
            <MetricCard
              card={{
                label: "Top campanha (margem)",
                value: cards.topMarginCampaign?.label ?? "—",
                hint: cards.topMarginCampaign ? pct(cards.topMarginCampaign.margin) : undefined,
              }}
            />
            <MetricCard
              card={{
                label: "Top origem (pedidos)",
                value: cards.topOriginByOrders?.label ?? "—",
                hint: cards.topOriginByOrders
                  ? `${cards.topOriginByOrders.orders} pedidos`
                  : undefined,
              }}
            />
          </div>

          {/* QUALIDADE */}
          {quality && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Qualidade da atribuição</h3>
                <Button size="sm" variant="ghost" onClick={onExportQuality} disabled={exporting}>
                  <Download className="w-4 h-4" /> CSV
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Total de pedidos</div>
                  <div className="font-semibold">{quality.totalOrders}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Com UTM</div>
                  <div className="font-semibold">{quality.withUtm}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Por campanha (UTM)</div>
                  <div className="font-semibold">{quality.withCampaign}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Por cupom</div>
                  <div className="font-semibold">{quality.withCouponCampaign}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Sem atribuição</div>
                  <div className="font-semibold">{quality.unattributed}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {quality.attributionRate.toFixed(0)}% dos pedidos deste período possuem origem
                identificada. Quanto maior esse percentual, melhor será a análise de campanhas. Use
                links com UTM e vincule cupons a campanhas.
              </p>
            </div>
          )}

          {/* PERFORMANCE POR CAMPANHA */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-sm">Performance por campanha</h3>
              <span className="text-xs text-muted-foreground">
                {campaigns?.length ?? 0} campanhas
              </span>
            </div>
            {!campaigns || campaigns.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">
                Nenhuma campanha com dados no período.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs">
                    <tr>
                      <th className="text-left px-3 py-2">Campanha</th>
                      <th className="text-left px-3 py-2">Atrib.</th>
                      <th className="text-right px-3 py-2">Pedidos</th>
                      <th className="text-right px-3 py-2">Receita</th>
                      <th className="text-right px-3 py-2">Ticket</th>
                      <th className="text-right px-3 py-2">Desconto</th>
                      <th className="text-right px-3 py-2">Custo</th>
                      <th className="text-right px-3 py-2">Taxa MP</th>
                      <th className="text-right px-3 py-2">Lucro est.</th>
                      <th className="text-right px-3 py-2">Margem %</th>
                      <th className="text-right px-3 py-2">Leads</th>
                      <th className="text-right px-3 py-2">Abandon.</th>
                      <th className="text-right px-3 py-2">Recup.</th>
                      <th className="text-right px-3 py-2">Cupons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((r) => (
                      <tr key={r.campaignKey} className="border-t border-border hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">
                          <div>{r.campaignLabel}</div>
                          {(r.channel || r.status) && (
                            <div className="text-[10px] text-muted-foreground">
                              {r.channel ?? ""} {r.status ? `· ${r.status}` : ""}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <AttributionBadge src={r.source} />
                        </td>
                        <td className="px-3 py-2 text-right">{r.orders}</td>
                        <td className="px-3 py-2 text-right">{brl(r.revenue)}</td>
                        <td className="px-3 py-2 text-right">{brl(r.avgTicket)}</td>
                        <td className="px-3 py-2 text-right">{brl(r.discountTotal)}</td>
                        <td className="px-3 py-2 text-right">{brl(r.itemsCost)}</td>
                        <td className="px-3 py-2 text-right">{brl(r.mpFees)}</td>
                        <td className="px-3 py-2 text-right">{brl(r.estimatedProfit)}</td>
                        <td
                          className={`px-3 py-2 text-right ${r.marginPercent != null && r.marginPercent < 10 ? "text-destructive font-semibold" : ""}`}
                        >
                          {r.marginPercent == null ? "—" : pct(r.marginPercent)}
                        </td>
                        <td className="px-3 py-2 text-right">{r.leads}</td>
                        <td className="px-3 py-2 text-right">{r.abandoned}</td>
                        <td className="px-3 py-2 text-right">{r.recovered}</td>
                        <td className="px-3 py-2 text-right">{r.couponsUsed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* PERFORMANCE POR ORIGEM */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-sm">Performance por origem</h3>
              <span className="text-xs text-muted-foreground">{origins?.length ?? 0} origens</span>
            </div>
            {!origins || origins.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">
                Nenhuma origem identificada no período.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs">
                    <tr>
                      <th className="text-left px-3 py-2">Origem</th>
                      <th className="text-left px-3 py-2">Meio</th>
                      <th className="text-left px-3 py-2">Contexto</th>
                      <th className="text-right px-3 py-2">Pedidos</th>
                      <th className="text-right px-3 py-2">Receita</th>
                      <th className="text-right px-3 py-2">Ticket</th>
                      <th className="text-right px-3 py-2">Leads</th>
                      <th className="text-right px-3 py-2">Abandon.</th>
                      <th className="text-right px-3 py-2">Recup.</th>
                      <th className="text-right px-3 py-2">Lucro est.</th>
                      <th className="text-right px-3 py-2">Margem %</th>
                      <th className="text-right px-3 py-2">B2B</th>
                      <th className="text-right px-3 py-2">B2C</th>
                    </tr>
                  </thead>
                  <tbody>
                    {origins.map((r, i) => (
                      <tr
                        key={`${r.source}|${r.medium}|${r.context}|${i}`}
                        className="border-t border-border hover:bg-muted/20"
                      >
                        <td className="px-3 py-2 font-medium">{r.source}</td>
                        <td className="px-3 py-2">{r.medium}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{r.context}</td>
                        <td className="px-3 py-2 text-right">{r.orders}</td>
                        <td className="px-3 py-2 text-right">{brl(r.revenue)}</td>
                        <td className="px-3 py-2 text-right">{brl(r.avgTicket)}</td>
                        <td className="px-3 py-2 text-right">{r.leads}</td>
                        <td className="px-3 py-2 text-right">{r.abandoned}</td>
                        <td className="px-3 py-2 text-right">{r.recovered}</td>
                        <td className="px-3 py-2 text-right">{brl(r.estimatedProfit)}</td>
                        <td className="px-3 py-2 text-right">
                          {r.marginPercent == null ? "—" : pct(r.marginPercent)}
                        </td>
                        <td className="px-3 py-2 text-right">{r.ordersB2B}</td>
                        <td className="px-3 py-2 text-right">{r.ordersB2C}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* PEDIDOS ATRIBUÍDOS */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-sm">Pedidos por campanha / origem</h3>
              <span className="text-xs text-muted-foreground">{orders?.total ?? 0} pedidos</span>
            </div>
            {!orders || orders.rows.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">
                Nenhum pedido no período.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs">
                      <tr>
                        <th className="text-left px-3 py-2">Data</th>
                        <th className="text-left px-3 py-2">Pedido</th>
                        <th className="text-left px-3 py-2">Cliente</th>
                        <th className="text-left px-3 py-2">Tipo</th>
                        <th className="text-left px-3 py-2">Campanha</th>
                        <th className="text-left px-3 py-2">UTM source / medium</th>
                        <th className="text-right px-3 py-2">Receita</th>
                        <th className="text-right px-3 py-2">Desconto</th>
                        <th className="text-right px-3 py-2">Taxa MP</th>
                        <th className="text-right px-3 py-2">Lucro est.</th>
                        <th className="text-right px-3 py-2">Margem %</th>
                        <th className="text-left px-3 py-2">Cálculo</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.rows.map((r) => (
                        <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {fmtDateTime(r.created_at)}
                          </td>
                          <td className="px-3 py-2 font-medium">#{r.order_number}</td>
                          <td className="px-3 py-2">{r.customer}</td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={r.order_type === "b2b" ? "default" : "secondary"}
                              className="text-[10px]"
                            >
                              {r.order_type.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">{r.campaignLabel}</td>
                          <td className="px-3 py-2 text-xs">
                            {r.utm_source ?? "—"} / {r.utm_medium ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right">{brl(r.revenue)}</td>
                          <td className="px-3 py-2 text-right">{brl(r.discount)}</td>
                          <td className="px-3 py-2 text-right">{brl(r.mpFee)}</td>
                          <td className="px-3 py-2 text-right">{brl(r.estimatedProfit)}</td>
                          <td
                            className={`px-3 py-2 text-right ${r.marginPercent != null && r.marginPercent < 10 ? "text-destructive font-semibold" : ""}`}
                          >
                            {r.marginPercent == null ? "—" : pct(r.marginPercent)}
                          </td>
                          <td className="px-3 py-2">
                            {r.calcStatus === "sem_custo" ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-amber-600 border-amber-500/40"
                              >
                                sem custo
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">
                                ok
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              to="/admin/pedidos/$orderId"
                              params={{ orderId: r.id }}
                              className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                            >
                              Abrir <ExternalLink className="w-3 h-3" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Paginação */}
                {totalPages > 1 && (
                  <div className="px-4 py-3 border-t border-border flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Página {orders.page} de {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={orders.page <= 1}
                        onClick={() => setPage(orders.page - 1)}
                      >
                        Anterior
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={orders.page >= totalPages}
                        onClick={() => setPage(orders.page + 1)}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground text-center py-8">
          Sem dados de campanhas / UTM neste período.
        </div>
      )}
    </div>
  );
}
