import { createServerFn } from "@tanstack/react-start";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

/**
 * Agrega todos os contadores e alertas usados pelo
 * "Painel do Dia" e pela página de "Pendências".
 *
 * Tudo aqui é apenas leitura — nenhuma regra de negócio é alterada.
 * Usamos `count: 'exact', head: true` sempre que possível para não
 * trafegar listas grandes.
 */

export type Severity = "low" | "medium" | "high";
export type CardStatus = "ok" | "warn" | "danger" | "unknown";

export type OperationsCard = {
  id: string;
  title: string;
  description: string;
  qty: number;
  status: CardStatus;
  ctaLabel: string;
  ctaHref: string | null;
  group: string;
};

export type OperationsAlert = {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  ctaLabel: string;
  ctaHref: string | null;
};

export type DailyOperation = {
  ordersCreatedToday: number;
  ordersPaidToday: number;
  revenueToday: number;
  leadsToday: number;
  b2bNegotiationsToday: number;
  productsSoldToday: number;
  avgTicketToday: number;
};

export type OperationsData = {
  cards: OperationsCard[];
  alerts: OperationsAlert[];
  daily: DailyOperation;
  generatedAt: string;
};

function startOfTodayISO(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return d.toISOString();
}

function hoursAgoISO(h: number): string {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

/**
 * Retorna a maior data entre o "corte de alertas" das configurações
 * financeiras (`finance_settings.alerts_baseline_at`) e a janela
 * informada (em horas). Eventos anteriores ao corte — tipicamente
 * erros de teste/homologação já resolvidos — não geram alerta.
 */
async function alertsSinceISO(supabaseAdmin: any, hoursWindow: number): Promise<string> {
  const windowISO = hoursAgoISO(hoursWindow);
  try {
    const { data } = await supabaseAdmin
      .from("finance_settings")
      .select("alerts_baseline_at")
      .limit(1)
      .maybeSingle();
    const baseline = data?.alerts_baseline_at as string | null | undefined;
    if (baseline && baseline > windowISO) return baseline;
  } catch {}
  return windowISO;
}

async function safeCount(build: () => any, filter: (q: any) => any): Promise<number> {
  try {
    const q = filter(build().select("*", { count: "exact", head: true }));
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export const getAdminOperations = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<OperationsData> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const todayISO = startOfTodayISO();
    const stale24h = hoursAgoISO(24);

    // ============================================================
    // Pedidos
    // ============================================================
    const paidAwaitingShipping = await safeCount(
      () => supabaseAdmin.from("orders"),
      (q) => q.in("payment_status", ["paid", "approved"]).in("status", ["paid", "confirmed", "preparing"]),
    );
    const paidStuck24h = await safeCount(
      () => supabaseAdmin.from("orders"),
      (q) =>
        q
          .in("payment_status", ["paid", "approved"])
          .in("status", ["paid", "confirmed", "preparing"])
          .lt("updated_at", stale24h),
    );
    const ordersAwaitingPayment = await safeCount(
      () => supabaseAdmin.from("orders"),
      (q) => q.in("payment_status", ["pending", "in_process", "preference_created"]),
    );

    // ============================================================
    // Leads
    // ============================================================
    const newLeads = await safeCount(
      () => supabaseAdmin.from("leads"),
      (q) => q.in("status", ["novo", "new"]),
    );
    const leadsNoResponse24h = await safeCount(
      () => supabaseAdmin.from("leads"),
      (q) => q.in("status", ["novo", "new"]).lt("created_at", stale24h),
    );

    // ============================================================
    // B2B
    // ============================================================
    const pendingCompanies = await safeCount(
      () => supabaseAdmin.from("companies"),
      (q) => q.eq("status", "pending"),
    );
    const openNegotiations = await safeCount(
      () => supabaseAdmin.from("b2b_negotiations"),
      (q) => q.in("status", ["nova", "em_andamento"]),
    );

    // Pedidos B2B pagos aguardando separação
    const b2bPaidAwaitingShipping = await safeCount(
      () => supabaseAdmin.from("orders"),
      (q) =>
        q
          .eq("order_type", "b2b")
          .in("payment_status", ["paid", "approved"])
          .in("status", ["paid", "confirmed", "preparing"]),
    );

    // Receita / ticket médio B2B do dia + total economizado em B2B hoje
    let b2bRevenueToday = 0;
    let b2bOrdersPaidToday = 0;
    let b2bAvgTicketToday = 0;
    let b2bDiscountGivenToday = 0;
    try {
      const { data: b2bPaid } = await supabaseAdmin
        .from("orders")
        .select("total, b2b_discount_total")
        .eq("order_type", "b2b")
        .in("payment_status", ["paid", "approved"])
        .gte("paid_at", startOfTodayISO());
      b2bOrdersPaidToday = (b2bPaid ?? []).length;
      b2bRevenueToday = (b2bPaid ?? []).reduce((s, o) => s + Number(o.total ?? 0), 0);
      b2bDiscountGivenToday = (b2bPaid ?? []).reduce(
        (s, o) => s + Number((o as { b2b_discount_total?: number }).b2b_discount_total ?? 0),
        0,
      );
      b2bAvgTicketToday = b2bOrdersPaidToday > 0 ? b2bRevenueToday / b2bOrdersPaidToday : 0;
    } catch {}

    // Configuração B2B (cupom)
    let b2bAllowsCoupon = false;
    try {
      const { data: bs } = await supabaseAdmin
        .from("b2b_settings")
        .select("allow_coupon_in_b2b")
        .limit(1)
        .maybeSingle();
      b2bAllowsCoupon = Boolean(
        (bs as { allow_coupon_in_b2b?: boolean } | null)?.allow_coupon_in_b2b,
      );
    } catch {}

    // Revisão Comercial — contadores de catálogo (varejo + B2B)
    const commercial = {
      productsCriticalMargin: 0, // varejo abaixo da mínima
      productsAttentionMargin: 0,
      productsNegativeMargin: 0,
      b2bCriticalMargin: 0,
    };
    try {
      const { computeCommercialReview } = await import("@/lib/commercialReview");
      const { data: financeS } = await supabaseAdmin
        .from("finance_settings")
        .select("default_min_margin_percent")
        .limit(1)
        .maybeSingle();
      const defMin =
        Number(
          (financeS as { default_min_margin_percent?: number | string | null } | null)
            ?.default_min_margin_percent,
        ) || 25;
      const prodList = await fetchAllRows<any>((fromIdx, toIdx) =>
        supabaseAdmin
          .from("products")
          .select(
            "id, price, sale_price, cost_price, min_margin_percent, b2b_enabled, b2b_price, b2b_min_qty",
          )
          .eq("active", true)
          .range(fromIdx, toIdx),
      );
      for (const p of (prodList ?? []) as Array<{
        id: string;
        price: number | null;
        sale_price: number | null;
        cost_price: number | null;
        min_margin_percent: number | null;
        b2b_enabled: boolean | null;
        b2b_price: number | null;
        b2b_min_qty: number | null;
      }>) {
        const r = computeCommercialReview(
          {
            id: p.id,
            price: p.price,
            sale_price: p.sale_price,
            cost_price: p.cost_price,
            min_margin_percent: p.min_margin_percent,
            b2b_enabled: p.b2b_enabled,
            b2b_price: p.b2b_price,
            b2b_min_qty: p.b2b_min_qty,
          },
          defMin,
        );
        const codes = new Set(r.issues.map((i) => i.code));
        if (codes.has("critical_margin")) commercial.productsCriticalMargin += 1;
        if (codes.has("attention_margin")) commercial.productsAttentionMargin += 1;
        if (codes.has("negative_margin")) commercial.productsNegativeMargin += 1;
        if (codes.has("b2b_critical")) commercial.b2bCriticalMargin += 1;
      }
    } catch {}

    // Revisão Comercial — Onda 2: contadores de giro (RPC leve)
    let stalledWithStock = 0;
    let highMovementLowMargin = 0;
    try {
      const { data: cr } = await supabaseAdmin.rpc("get_commercial_review_counters");
      const j = (cr ?? {}) as Record<string, number>;
      stalledWithStock = Number(j.stalled_with_stock ?? 0);
      highMovementLowMargin = Number(j.high_movement_low_margin ?? 0);
    } catch {}

    // ============================================================
    // Produtos
    // ============================================================
    // Estoque baixo / zerado / parados / alto giro com estoque baixo — via RPC agregada
    let lowStock = 0;
    let productsOutOfStock = 0;
    let inactiveProducts = 0;
    let highMovementLowStock = 0;
    let stockNoMin = 0;
    try {
      const { data: counters } = await supabaseAdmin.rpc("get_stock_counters");
      const j = (counters ?? {}) as Record<string, number>;
      lowStock = Number(j.low_stock ?? 0);
      productsOutOfStock = Number(j.out_of_stock ?? 0);
      inactiveProducts = Number(j.inactive_products ?? 0);
      highMovementLowStock = Number(j.high_movement_low_stock ?? 0);
      stockNoMin = Number(j.no_min_stock ?? 0);
    } catch {}

    const productsNoImage = await safeCount(
      () => supabaseAdmin.from("products"),
      (q) => q.eq("active", true).or("images.is.null,images.eq.{}"),
    );
    const productsNoPrice = await safeCount(
      () => supabaseAdmin.from("products"),
      (q) => q.eq("active", true).or("price.is.null,price.eq.0"),
    );
    const productsNoWeight = await safeCount(
      () => supabaseAdmin.from("products"),
      (q) => q.eq("active", true).or("weight_kg.is.null,weight_kg.eq.0"),
    );
    const productsNoCategory = await safeCount(
      () => supabaseAdmin.from("products"),
      (q) => q.eq("active", true).is("category_id", null),
    );
    const productsNoSeo = await safeCount(
      () => supabaseAdmin.from("products"),
      (q) => q.eq("active", true).or("seo_title.is.null,seo_description.is.null"),
    );

    // B2B: preço sem qty mínima e vice-versa
    const b2bPriceNoMinQty = await safeCount(
      () => supabaseAdmin.from("products"),
      (q) =>
        q
          .eq("active", true)
          .eq("b2b_enabled", true)
          .not("b2b_price", "is", null)
          .or("b2b_min_qty.is.null,b2b_min_qty.eq.0"),
    );
    const b2bMinQtyNoPrice = await safeCount(
      () => supabaseAdmin.from("products"),
      (q) =>
        q
          .eq("active", true)
          .eq("b2b_enabled", true)
          .not("b2b_min_qty", "is", null)
          .gt("b2b_min_qty", 0)
          .is("b2b_price", null),
    );

    // ============================================================
    // Logística — bairros frete local
    // ============================================================
    const localZonesActive = await safeCount(
      () => supabaseAdmin.from("local_delivery_zones"),
      (q) => q.eq("is_active", true),
    );
    const localZonesNoPrice = await safeCount(
      () => supabaseAdmin.from("local_delivery_zones"),
      (q) => q.eq("is_active", true).eq("inherits_parent_price", false).is("shipping_price", null),
    );

    // Retirada na loja sem endereço
    let pickupMissingAddress = 0;
    try {
      const { data: cs } = await supabaseAdmin
        .from("company_settings")
        .select("pickup_enabled, pickup_address")
        .limit(1)
        .maybeSingle();
      if (cs?.pickup_enabled && !cs?.pickup_address) {
        pickupMissingAddress = 1;
      }
    } catch {}

    // Webhook MP com erro — respeita "corte de alertas" (ignora erros antigos
    // de teste/homologação, sem apagar nada do log).
    const webhookSinceISO = await alertsSinceISO(supabaseAdmin, 24 * 7);
    const webhookErrors = await safeCount(
      () => supabaseAdmin.from("payment_webhook_events"),
      (q) => q.gte("created_at", webhookSinceISO).not("processing_error", "is", null),
    );

    // E-mails transacionais travados/falhos — mesmo corte de alertas do webhook.
    // "pending" só conta como problema se estiver parado há mais de 1h (evita
    // falso positivo de e-mail que ainda está sendo processado normalmente).
    const emailIssuesSinceISO = await alertsSinceISO(supabaseAdmin, 24 * 7);
    const stalePendingCutoff = hoursAgoISO(1);
    const emailFailuresOrStuck = await safeCount(
      () => supabaseAdmin.from("email_events"),
      (q) =>
        q
          .gte("created_at", emailIssuesSinceISO)
          .or(`status.eq.failed,and(status.eq.pending,created_at.lt.${stalePendingCutoff})`),
    );

    // Notas fiscais — emissão é externa; mantemos só contagens informativas usadas no card.
    const invoicesPending = await safeCount(
      () => supabaseAdmin.from("orders"),
      (q) => q.in("payment_status", ["paid", "approved"]).eq("invoice_status", "pendente_emissao"),
    );
    const invoicesError = await safeCount(
      () => supabaseAdmin.from("orders"),
      (q) => q.in("payment_status", ["paid", "approved"]).eq("invoice_status", "erro_emissao"),
    );
    void invoicesError;

    // ============================================================
    // Operação de hoje
    // ============================================================
    const ordersCreatedToday = await safeCount(
      () => supabaseAdmin.from("orders"),
      (q) => q.gte("created_at", todayISO),
    );
    const ordersPaidToday = await safeCount(
      () => supabaseAdmin.from("orders"),
      (q) => q.in("payment_status", ["paid", "approved"]).gte("paid_at", todayISO),
    );
    let revenueToday = 0;
    let productsSoldToday = 0;
    let avgTicketToday = 0;
    try {
      const { data: paid } = await supabaseAdmin
        .from("orders")
        .select("id, total")
        .in("payment_status", ["paid", "approved"])
        .gte("paid_at", todayISO);
      const ids = (paid ?? []).map((o) => o.id);
      revenueToday = (paid ?? []).reduce((s, o) => s + Number(o.total ?? 0), 0);
      avgTicketToday = (paid ?? []).length > 0 ? revenueToday / (paid as any[]).length : 0;
      if (ids.length > 0) {
        const { data: items } = await supabaseAdmin
          .from("order_items")
          .select("qty")
          .in("order_id", ids);
        productsSoldToday = (items ?? []).reduce((s, it) => s + Number(it.qty ?? 0), 0);
      }
    } catch {}

    const leadsToday = await safeCount(
      () => supabaseAdmin.from("leads"),
      (q) => q.gte("created_at", todayISO),
    );
    const b2bNegotiationsToday = await safeCount(
      () => supabaseAdmin.from("b2b_negotiations"),
      (q) => q.gte("created_at", todayISO),
    );

    // Carrinhos abandonados
    const abandonedNew = await safeCount(
      () => supabaseAdmin.from("abandoned_carts"),
      (q) => q.in("status", ["novo", "contato_enviado"]),
    );
    const abandonedStuck24h = await safeCount(
      () => supabaseAdmin.from("abandoned_carts"),
      (q) => q.in("status", ["novo", "contato_enviado"]).lt("abandoned_at", stale24h),
    );
    let abandonedHighValue = 0;
    let abandonedTotalValue = 0;
    let abandonedB2bCount = 0;
    try {
      const ac = await fetchAllRows<any>((fromIdx, toIdx) =>
        supabaseAdmin
          .from("abandoned_carts")
          .select("subtotal_amount, company_id")
          .in("status", ["novo", "contato_enviado"])
          .range(fromIdx, toIdx),
      );
      (ac ?? []).forEach((c) => {
        const v = Number(c.subtotal_amount ?? 0);
        abandonedTotalValue += v;
        if (v >= 1000) abandonedHighValue += 1;
        if (c.company_id) abandonedB2bCount += 1;
      });
    } catch {}

    // ============================================================
    // SEO Insights (counts leves)
    // ============================================================
    let seo = {
      productsNoSeoTitle: 0,
      productsNoSeoDescription: 0,
      productsNoImage: 0,
      productsNoDescription: 0,
      categoriesNoDescription: 0,
      homepageMissingSeo: false,
      b2bMissingSeo: false,
    };
    try {
      const { fetchSeoQuickCounts } = await import("./seoInsights.server");
      seo = await fetchSeoQuickCounts();
    } catch {}

    const seoTotalIssues =
      seo.productsNoSeoTitle +
      seo.productsNoSeoDescription +
      seo.productsNoImage +
      seo.categoriesNoDescription +
      (seo.homepageMissingSeo ? 1 : 0) +
      (seo.b2bMissingSeo ? 1 : 0);

    // ============================================================
    // Marketing Integrations (pixels/analytics)
    // ============================================================
    let hasGa4 = false;
    let hasMetaPixel = false;
    let activeBadFormatCount = 0;
    try {
      const { data: integs } = await supabaseAdmin
        .from("marketing_integrations")
        .select("provider, account_id, enabled");
      const ID_PATTERNS: Record<string, RegExp> = {
        ga4: new RegExp("^G-[A-Z0-9]{6,}$", "i"),
        gtm: new RegExp("^GTM-[A-Z0-9]{4,}$", "i"),
        meta_pixel: new RegExp("^[0-9]{6,20}$"),
        tiktok_pixel: new RegExp("^[A-Z0-9]{15,30}$", "i"),
        clarity: new RegExp("^[a-z0-9]{6,20}$", "i"),
        google_ads: new RegExp("^AW-[0-9]{6,}$", "i"),
      };
      (integs ?? []).forEach((i: any) => {
        if (i.provider === "ga4") hasGa4 = true;
        if (i.provider === "meta_pixel") hasMetaPixel = true;
        if (i.enabled) {
          const re = ID_PATTERNS[i.provider];
          if (re && !re.test(String(i.account_id ?? "").trim())) {
            activeBadFormatCount += 1;
          }
        }
      });
    } catch {}

    // ============================================================
    // Fiscal (sub-onda 4a)
    // ============================================================
    let fiscal = {
      productsActive: 0,
      productsFiscalComplete: 0,
      productsFiscalIncomplete: 0,
      productsNeedReview: 0,
      productsNoNcm: 0,
      productsNoUnit: 0,
      productsNoOrigin: 0,
      productsNoWeightOrDims: 0,
      productsNoEan: 0,
      paidOrdersWithFiscalIssues: 0,
      companyFiscalIncomplete: false,
      taxRegimeMissing: false,
    };
    try {
      const { fetchFiscalQuickCounts } = await import("./fiscalInsights.server");
      fiscal = await fetchFiscalQuickCounts();
    } catch {}

    const fiscalTotalIssues =
      fiscal.productsFiscalIncomplete +
      fiscal.productsNeedReview +
      (fiscal.companyFiscalIncomplete ? 1 : 0);

    // ============================================================
    // Financeiro — margem, custo, NF, taxa MP (helper isolado)
    // ============================================================
    let financeAlerts = {
      productsWithoutCost: 0,
      productsBelowMinMargin: 0,
      ordersPaidWithMissingCost: 0,
      ordersPaidNegativeMargin: 0,
      invoicesPending: 0,
      invoicesPendingOver24h: 0,
      invoicesPendingB2bOver24h: 0,
      invoicesError: 0,
      mpPaidNoFee30d: 0,
      mpPaidEstimatedFee30d: 0,
      mpWebhookErrors7d: 0,
    };
    try {
      const { fetchFinanceAlertCounts } = await import("./financeAlerts.server");
      financeAlerts = await fetchFinanceAlertCounts();
    } catch {}

    // Qualidade do cadastro de produtos (helper isolado)
    const productQuality = { activeBelow70: 0, featuredBelow70: 0, ruim: 0, missingTech: 0 };
    try {
      const { computeProductQuality } = await import("@/lib/productQuality");
      const data = await fetchAllRows<any>((fromIdx, toIdx) =>
        supabaseAdmin
          .from("products")
          .select(
            "id, name, tags, featured, description, specs, seo_title, seo_description, slug, ncm, weight_kg, height_cm, width_cm, length_cm, cost_price, category_id, images, product_images(alt_text, original_url), product_attributes(attribute_key, attribute_value, attribute_unit, is_visible)",
          )
          .eq("active", true)
          .range(fromIdx, toIdx),
      );
      for (const p of (data ?? []) as any[]) {
        const q = computeProductQuality(p);
        if (q.score < 70) productQuality.activeBelow70++;
        if (p.featured && q.score < 70) productQuality.featuredBelow70++;
        if (q.classification === "ruim") productQuality.ruim++;
        if (q.issues.some((i) => i.code === "no_tech_attrs")) productQuality.missingTech++;
      }
    } catch {}

    const cards: OperationsCard[] = [
      {
        id: "paid-awaiting-shipping",
        title: "Pedidos pagos aguardando separação",
        description: "Pedidos já pagos que precisam ser separados para entrega ou retirada.",
        qty: paidAwaitingShipping,
        status: paidAwaitingShipping === 0 ? "ok" : paidStuck24h > 0 ? "danger" : "warn",
        ctaLabel: "Ver pedidos",
        ctaHref: "/admin/pedidos",
        group: "Pedidos",
      },
      {
        id: "orders-awaiting-payment",
        title: "Pedidos aguardando pagamento",
        description: "Pedidos criados mas ainda sem confirmação de pagamento.",
        qty: ordersAwaitingPayment,
        status: ordersAwaitingPayment === 0 ? "ok" : "warn",
        ctaLabel: "Ver pedidos",
        ctaHref: "/admin/pedidos",
        group: "Pedidos",
      },
      {
        id: "new-leads",
        title: "Leads novos",
        description: "Leads que chegaram e ainda não foram trabalhados.",
        qty: newLeads,
        status: newLeads === 0 ? "ok" : leadsNoResponse24h > 0 ? "danger" : "warn",
        ctaLabel: "Responder leads",
        ctaHref: "/admin/leads",
        group: "Clientes e leads",
      },
      {
        id: "leads-no-response",
        title: "Leads sem resposta há +24h",
        description: "Leads que estão parados há mais de um dia. Risco de perder a venda.",
        qty: leadsNoResponse24h,
        status: leadsNoResponse24h === 0 ? "ok" : "danger",
        ctaLabel: "Responder leads",
        ctaHref: "/admin/leads",
        group: "Clientes e leads",
      },
      {
        id: "pending-companies",
        title: "Empresas B2B pendentes",
        description: "Empresas aguardando aprovação para acessar preços de atacado.",
        qty: pendingCompanies,
        status: pendingCompanies === 0 ? "ok" : "warn",
        ctaLabel: "Analisar empresas",
        ctaHref: "/admin/empresas",
        group: "B2B",
      },
      {
        id: "b2b-open-negotiations",
        title: "Negociações B2B abertas",
        description: "Negociações em andamento que precisam de retorno.",
        qty: openNegotiations,
        status: openNegotiations === 0 ? "ok" : "warn",
        ctaLabel: "Ver negociações",
        ctaHref: null,
        group: "B2B",
      },
      {
        id: "b2b-paid-awaiting",
        title: "Pedidos B2B pagos aguardando separação",
        description: "Pedidos de empresa já pagos que precisam ser separados — priorize.",
        qty: b2bPaidAwaitingShipping,
        status: b2bPaidAwaitingShipping === 0 ? "ok" : "warn",
        ctaLabel: "Ver pedidos",
        ctaHref: "/admin/pedidos",
        group: "B2B",
      },
      {
        id: "b2b-revenue-today",
        title: "Vendas B2B pagas hoje",
        description:
          b2bOrdersPaidToday > 0
            ? `Ticket médio ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(b2bAvgTicketToday)} · ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(b2bDiscountGivenToday)} concedidos em desconto empresa.`
            : "Nenhum pedido B2B pago foi registrado hoje ainda.",
        qty: b2bOrdersPaidToday,
        status: "ok",
        ctaLabel: "Ver pedidos B2B",
        ctaHref: "/admin/pedidos",
        group: "B2B",
      },
      {
        id: "low-stock",
        title: "Produtos com estoque baixo",
        description: "Produtos com estoque igual ou abaixo do mínimo definido.",
        qty: lowStock,
        status: lowStock === 0 ? "ok" : "warn",
        ctaLabel: "Ver estoque",
        ctaHref: "/admin/produtos/estoque",
        group: "Produtos",
      },
      {
        id: "out-of-stock",
        title: "Produtos ativos sem estoque",
        description: "Produtos publicados mas sem unidades disponíveis.",
        qty: productsOutOfStock,
        status: productsOutOfStock === 0 ? "ok" : "danger",
        ctaLabel: "Ver produtos zerados",
        ctaHref: "/admin/produtos/estoque",
        group: "Produtos",
      },
      {
        id: "inactive-products",
        title: "Produtos parados",
        description: "Produtos ativos com estoque mas sem venda no período configurado.",
        qty: inactiveProducts,
        status: inactiveProducts === 0 ? "ok" : "warn",
        ctaLabel: "Ver produtos parados",
        ctaHref: "/admin/produtos/estoque",
        group: "Produtos",
      },
      {
        id: "high-movement-low-stock",
        title: "Alto giro com estoque baixo",
        description: "Produtos com boa saída no período cujo estoque já caiu para o nível mínimo.",
        qty: highMovementLowStock,
        status: highMovementLowStock === 0 ? "ok" : "danger",
        ctaLabel: "Ver estoque",
        ctaHref: "/admin/produtos/estoque",
        group: "Produtos",
      },
      {
        id: "stock-no-min",
        title: "Produtos sem estoque mínimo",
        description: "Produtos ativos sem mínimo configurado — sem alerta de reposição.",
        qty: stockNoMin,
        status: stockNoMin === 0 ? "ok" : "warn",
        ctaLabel: "Configurar mínimos",
        ctaHref: "/admin/produtos/estoque",
        group: "Produtos",
      },
      {
        id: "no-image",
        title: "Produtos sem imagem",
        description: "Produtos publicados sem imagem prejudicam a conversão.",
        qty: productsNoImage,
        status: productsNoImage === 0 ? "ok" : "warn",
        ctaLabel: "Corrigir produtos",
        ctaHref: "/admin/produtos",
        group: "Produtos",
      },
      {
        id: "no-price",
        title: "Produtos sem preço",
        description: "Produtos ativos sem preço configurado não podem ser vendidos.",
        qty: productsNoPrice,
        status: productsNoPrice === 0 ? "ok" : "danger",
        ctaLabel: "Ver revisão comercial",
        ctaHref: "/admin/produtos/revisao-comercial",
        group: "Produtos",
      },
      {
        id: "no-weight",
        title: "Produtos sem peso/dimensão",
        description: "Sem essas informações o cálculo de frete pode falhar.",
        qty: productsNoWeight,
        status: productsNoWeight === 0 ? "ok" : "warn",
        ctaLabel: "Corrigir produtos",
        ctaHref: "/admin/produtos",
        group: "Produtos",
      },
      {
        id: "local-zones-no-price",
        title: "Bairros sem valor de frete",
        description: "Bairros ativos para entrega local que ainda não têm valor configurado.",
        qty: localZonesNoPrice,
        status: localZonesNoPrice === 0 ? "ok" : "danger",
        ctaLabel: "Configurar frete",
        ctaHref: "/admin/settings/frete-local",
        group: "Logística",
      },
      {
        id: "abandoned-carts",
        title: "Carrinhos abandonados",
        description:
          abandonedTotalValue > 0
            ? `Valor total parado: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(abandonedTotalValue)}.`
            : "Clientes que adicionaram produtos mas não finalizaram a compra.",
        qty: abandonedNew,
        status:
          abandonedNew === 0
            ? "ok"
            : abandonedHighValue > 0 || abandonedStuck24h > 0
              ? "danger"
              : "warn",
        ctaLabel: "Ver carrinhos",
        ctaHref: "/admin/carrinhos-abandonados",
        group: "Pedidos",
      },
      {
        id: "seo-pendencias",
        title: "SEO com pendências",
        description:
          "Produtos, categorias ou páginas com SEO incompleto. Corrigir ajuda a aparecer no Google.",
        qty: seoTotalIssues,
        status:
          seoTotalIssues === 0
            ? "ok"
            : seo.homepageMissingSeo || seo.productsNoSeoTitle > 10
              ? "danger"
              : "warn",
        ctaLabel: "Ver SEO Insights",
        ctaHref: "/admin/seo",
        group: "Marketing",
      },
      {
        id: "invoices-pending",
        title: "Controle fiscal externo",
        description:
          "Notas fiscais são emitidas fora do sistema. Use esta tela apenas para acompanhamento manual opcional.",
        qty: invoicesPending,
        status: "ok",
        ctaLabel: "Ver acompanhamento fiscal",
        ctaHref: "/admin/financeiro/notas-fiscais",
        group: "Financeiro",
      },
      {
        id: "fiscal-pending",
        title: "Informações fiscais opcionais",
        description:
          "Campos fiscais (NCM, CFOP, origem, NF) são opcionais — emissão é feita em sistema externo.",
        qty: fiscalTotalIssues,
        status: "ok",
        ctaLabel: "Ver dados fiscais",
        ctaHref: "/admin/financeiro/impostos",
        group: "Financeiro",
      },
      {
        id: "finance-margin-critical",
        title: "Pedidos com margem crítica",
        description:
          financeAlerts.ordersPaidNegativeMargin > 0
            ? `${financeAlerts.ordersPaidNegativeMargin} pedido(s) pago(s) com margem negativa nos últimos 30 dias.`
            : "Nenhum pedido pago com margem negativa nos últimos 30 dias.",
        qty: financeAlerts.ordersPaidNegativeMargin,
        status: financeAlerts.ordersPaidNegativeMargin === 0 ? "ok" : "danger",
        ctaLabel: "Ver relatório de margem",
        ctaHref: "/admin/financeiro/relatorios?tab=margem",
        group: "Financeiro",
      },
      {
        id: "finance-products-no-cost",
        title: "Produtos ativos sem custo cadastrado",
        description:
          financeAlerts.productsWithoutCost > 0
            ? `${financeAlerts.productsWithoutCost} produto(s) ativo(s) sem cost_price — margem não pode ser calculada.`
            : "Todos os produtos ativos têm custo cadastrado.",
        qty: financeAlerts.productsWithoutCost,
        status:
          financeAlerts.productsWithoutCost === 0
            ? "ok"
            : financeAlerts.ordersPaidWithMissingCost > 0
              ? "danger"
              : "warn",
        ctaLabel: "Ver revisão comercial",
        ctaHref: "/admin/produtos/revisao-comercial",
        group: "Financeiro",
      },
      {
        id: "finance-mp-fee-unknown",
        title: "Pagamentos com taxa Mercado Pago desconhecida",
        description:
          financeAlerts.mpPaidNoFee30d > 0
            ? `${financeAlerts.mpPaidNoFee30d} pagamento(s) sem taxa real nem estimada nos últimos 30 dias.`
            : financeAlerts.mpPaidEstimatedFee30d > 0
              ? `${financeAlerts.mpPaidEstimatedFee30d} pagamento(s) usando taxa estimada — webhook pendente.`
              : "Todas as taxas Mercado Pago dos últimos 30 dias estão registradas.",
        qty: financeAlerts.mpPaidNoFee30d || financeAlerts.mpPaidEstimatedFee30d,
        status:
          financeAlerts.mpPaidNoFee30d > 0
            ? "warn"
            : financeAlerts.mpPaidEstimatedFee30d > 0
              ? "warn"
              : "ok",
        ctaLabel: "Ver Mercado Pago",
        ctaHref: "/admin/financeiro/relatorios?tab=mercado-pago",
        group: "Financeiro",
      },
      {
        id: "products-quality-low",
        title: "Produtos com cadastro incompleto",
        description:
          productQuality.activeBelow70 > 0
            ? `${productQuality.activeBelow70} produto(s) ativo(s) com score abaixo de 70 — não podem ser destacados em vitrines.`
            : "Todos os produtos ativos têm cadastro adequado.",
        qty: productQuality.activeBelow70,
        status:
          productQuality.activeBelow70 === 0
            ? "ok"
            : productQuality.featuredBelow70 > 0
              ? "danger"
              : "warn",
        ctaLabel: "Ver qualidade do cadastro",
        ctaHref: "/admin/produtos/qualidade",
        group: "Catálogo",
      },
      {
        id: "commercial-margin-critical",
        title: "Produtos com margem de venda crítica",
        description:
          commercial.productsCriticalMargin > 0
            ? `${commercial.productsCriticalMargin} produto(s) ativo(s) com margem abaixo da mínima cadastrada.`
            : "Nenhum produto ativo com margem de venda abaixo da mínima.",
        qty: commercial.productsCriticalMargin,
        status:
          commercial.productsCriticalMargin === 0
            ? "ok"
            : commercial.productsNegativeMargin > 0
              ? "danger"
              : "warn",
        ctaLabel: "Ver revisão comercial",
        ctaHref: "/admin/produtos/revisao-comercial",
        group: "Catálogo",
      },
      {
        id: "commercial-b2b-critical",
        title: "Produtos com preço B2B crítico",
        description:
          commercial.b2bCriticalMargin > 0
            ? `${commercial.b2bCriticalMargin} produto(s) com margem B2B abaixo da mínima — atacado pode estar dando prejuízo.`
            : "Nenhum produto com margem B2B crítica.",
        qty: commercial.b2bCriticalMargin,
        status: commercial.b2bCriticalMargin === 0 ? "ok" : "danger",
        ctaLabel: "Ver revisão comercial",
        ctaHref: "/admin/produtos/revisao-comercial",
        group: "Catálogo",
      },
      {
        id: "commercial-stalled-with-stock",
        title: "Produtos parados com estoque",
        description:
          stalledWithStock > 0
            ? `${stalledWithStock} produto(s) ativo(s) com estoque mas sem venda no período configurado.`
            : "Nenhum produto ativo parado no período analisado.",
        qty: stalledWithStock,
        status: stalledWithStock === 0 ? "ok" : "warn",
        ctaLabel: "Ver revisão comercial",
        ctaHref: "/admin/produtos/revisao-comercial",
        group: "Catálogo",
      },
      {
        id: "commercial-high-movement-low-margin",
        title: "Alto giro com margem baixa",
        description:
          highMovementLowMargin > 0
            ? `${highMovementLowMargin} produto(s) vendendo bem mas com margem abaixo da mínima — atenção ao resultado.`
            : "Nenhum produto de alto giro com margem comprometida.",
        qty: highMovementLowMargin,
        status: highMovementLowMargin === 0 ? "ok" : "danger",
        ctaLabel: "Ver revisão comercial",
        ctaHref: "/admin/produtos/revisao-comercial",
        group: "Catálogo",
      },
    ];

    // ============================================================
    // Monta alertas importantes
    // ============================================================
    const alerts: OperationsAlert[] = [];

    if (paidStuck24h > 0) {
      alerts.push({
        id: "paid-stuck",
        title: "Pedidos pagos parados há mais de 24h",
        description: `${paidStuck24h} pedido(s) pago(s) ainda não foram separados. Atrasos comprometem a entrega.`,
        severity: "high",
        ctaLabel: "Ver pedidos",
        ctaHref: "/admin/pedidos",
      });
    }
    if (productsNoPrice > 0) {
      alerts.push({
        id: "alert-no-price",
        title: "Produtos ativos sem preço",
        description: `${productsNoPrice} produto(s) publicado(s) sem preço. O cliente não consegue comprar.`,
        severity: "high",
        ctaLabel: "Corrigir produtos",
        ctaHref: "/admin/produtos",
      });
    }
    if (localZonesActive === 0) {
      alerts.push({
        id: "alert-local-zones-empty",
        title: "Frete local sem bairros ativos",
        description: "Você ainda não ativou nenhum bairro para entrega local em Maricá.",
        severity: "medium",
        ctaLabel: "Configurar frete",
        ctaHref: "/admin/settings/frete-local",
      });
    }
    if (localZonesNoPrice > 0) {
      alerts.push({
        id: "alert-local-zones-no-price",
        title: "Bairros ativos sem valor de frete",
        description: `${localZonesNoPrice} bairro(s) ativo(s) sem preço de frete. O checkout pode falhar.`,
        severity: "high",
        ctaLabel: "Configurar frete",
        ctaHref: "/admin/settings/frete-local",
      });
    }
    if (pickupMissingAddress > 0) {
      alerts.push({
        id: "alert-pickup-no-address",
        title: "Retirada na loja sem endereço",
        description: "Você ativou a retirada na loja mas não cadastrou o endereço.",
        severity: "medium",
        ctaLabel: "Configurar empresa",
        ctaHref: "/admin/settings/company",
      });
    }
    if (pendingCompanies > 0) {
      alerts.push({
        id: "alert-pending-companies",
        title: "Empresas B2B aguardando aprovação",
        description: `${pendingCompanies} empresa(s) aguardando análise para liberar preços B2B.`,
        severity: "medium",
        ctaLabel: "Analisar empresas",
        ctaHref: "/admin/empresas",
      });
    }
    if (b2bPriceNoMinQty > 0) {
      alerts.push({
        id: "alert-b2b-price-no-min",
        title: "Produto B2B sem quantidade mínima",
        description: `${b2bPriceNoMinQty} produto(s) com preço B2B mas sem quantidade mínima definida.`,
        severity: "medium",
        ctaLabel: "Corrigir produtos",
        ctaHref: "/admin/produtos",
      });
    }
    if (b2bMinQtyNoPrice > 0) {
      alerts.push({
        id: "alert-b2b-min-no-price",
        title: "Produto B2B sem preço de atacado",
        description: `${b2bMinQtyNoPrice} produto(s) com quantidade mínima B2B mas sem preço B2B.`,
        severity: "medium",
        ctaLabel: "Corrigir produtos",
        ctaHref: "/admin/produtos",
      });
    }
    if (abandonedHighValue > 0) {
      alerts.push({
        id: "alert-abandoned-high-value",
        title: "Carrinho abandonado de alto valor",
        description: `${abandonedHighValue} carrinho(s) acima de R$ 1.000 aguardando contato pelo WhatsApp.`,
        severity: "high",
        ctaLabel: "Ver carrinhos",
        ctaHref: "/admin/carrinhos-abandonados",
      });
    }
    if (abandonedStuck24h > 0) {
      alerts.push({
        id: "alert-abandoned-stuck",
        title: "Carrinhos sem retorno há +24h",
        description: `${abandonedStuck24h} carrinho(s) abandonado(s) sem retorno do cliente.`,
        severity: "medium",
        ctaLabel: "Ver carrinhos",
        ctaHref: "/admin/carrinhos-abandonados",
      });
    }
    if (abandonedB2bCount > 0) {
      alerts.push({
        id: "alert-abandoned-b2b",
        title: "Carrinho B2B abandonado",
        description: `${abandonedB2bCount} carrinho(s) B2B aguardando recuperação.`,
        severity: "medium",
        ctaLabel: "Ver carrinhos",
        ctaHref: "/admin/carrinhos-abandonados",
      });
    }
    if (productsNoImage > 0) {
      alerts.push({
        id: "alert-no-image",
        title: "Produtos ativos sem imagem",
        description: `${productsNoImage} produto(s) publicado(s) sem imagem. Isso reduz suas vendas.`,
        severity: "low",
        ctaLabel: "Corrigir produtos",
        ctaHref: "/admin/produtos",
      });
    }

    if (webhookErrors > 0) {
      alerts.push({
        id: "alert-webhook-errors",
        title: "Webhooks de pagamento com erro",
        description: `${webhookErrors} webhook(s) do Mercado Pago com erro nos últimos 7 dias.`,
        severity: "high",
        ctaLabel: "Ver detalhes",
        ctaHref: "/admin",
      });
    }

    if (emailFailuresOrStuck > 0) {
      alerts.push({
        id: "alert-email-failures",
        title: "E-mails de pedido travados ou com falha",
        description: `${emailFailuresOrStuck} e-mail(is) de pedido falharam ou ficaram parados em "pendente" por mais de 1h nos últimos 7 dias. O cliente pode não ter recebido a confirmação/atualização do pedido.`,
        severity: "high",
        ctaLabel: "Ver pedidos",
        ctaHref: "/admin/pedidos",
      });
    }

    // SEO alerts
    if (seo.homepageMissingSeo) {
      alerts.push({
        id: "alert-seo-home",
        title: "Homepage sem SEO configurado",
        description: "A homepage está sem título ou descrição SEO — perde tráfego do Google.",
        severity: "high",
        ctaLabel: "Configurar SEO",
        ctaHref: "/admin/conteudo/homepage",
      });
    }
    if (seo.b2bMissingSeo) {
      alerts.push({
        id: "alert-seo-b2b",
        title: "Vitrine B2B sem SEO",
        description: "A página B2B está sem título e descrição SEO configurados.",
        severity: "medium",
        ctaLabel: "Ver SEO Insights",
        ctaHref: "/admin/seo",
      });
    }
    if (seo.productsNoSeoTitle > 0 || seo.productsNoSeoDescription > 0) {
      alerts.push({
        id: "alert-seo-products",
        title: "Produtos com SEO incompleto",
        description: `${seo.productsNoSeoTitle} sem título SEO, ${seo.productsNoSeoDescription} sem meta description.`,
        severity: "medium",
        ctaLabel: "Ver SEO Insights",
        ctaHref: "/admin/seo",
      });
    }
    if (seo.categoriesNoDescription > 0) {
      alerts.push({
        id: "alert-seo-categories",
        title: "Categorias sem descrição",
        description: `${seo.categoriesNoDescription} categoria(s) sem descrição prejudicam a navegação e o SEO.`,
        severity: "low",
        ctaLabel: "Ver SEO Insights",
        ctaHref: "/admin/seo",
      });
    }

    // Marketing Integrations (pixels/analytics)
    if (!hasGa4) {
      alerts.push({
        id: "alert-no-ga4",
        title: "Google Analytics 4 não configurado",
        description: "Sem GA4 você não mede tráfego, conversões nem origem das vendas.",
        severity: "medium",
        ctaLabel: "Configurar GA4",
        ctaHref: "/admin/integracoes",
      });
    }
    if (!hasMetaPixel) {
      alerts.push({
        id: "alert-no-meta-pixel",
        title: "Meta Pixel não configurado",
        description: "Sem o Meta Pixel, campanhas no Facebook/Instagram não otimizam para vendas.",
        severity: "low",
        ctaLabel: "Configurar Meta Pixel",
        ctaHref: "/admin/integracoes",
      });
    }
    if (activeBadFormatCount > 0) {
      alerts.push({
        id: "alert-integrations-bad-format",
        title: "Integração ativa com ID inválido",
        description: `${activeBadFormatCount} integração(ões) ativa(s) com ID em formato inválido — não estão coletando dados.`,
        severity: "high",
        ctaLabel: "Corrigir integrações",
        ctaHref: "/admin/integracoes",
      });
    }
    if (b2bPaidAwaitingShipping > 0) {
      alerts.push({
        id: "alert-b2b-paid-awaiting",
        title: "Pedidos B2B pagos aguardando separação",
        description: `${b2bPaidAwaitingShipping} pedido(s) de empresa pago(s) precisam ser separados — clientes B2B costumam ser exigentes com prazo.`,
        severity: "medium",
        ctaLabel: "Ver pedidos",
        ctaHref: "/admin/pedidos",
      });
    }
    if (b2bAllowsCoupon) {
      alerts.push({
        id: "alert-b2b-coupon-on",
        title: "Cupons permitidos em pedidos B2B",
        description:
          "A configuração atual permite acumular cupom sobre o preço empresa. Revise se realmente quer essa política.",
        severity: "low",
        ctaLabel: "Revisar configurações B2B",
        ctaHref: "/admin/configuracoes-b2b",
      });
    }

    // Notas fiscais — emissão fora do sistema; sem alertas bloqueantes.
    // (NF é controle manual opcional. Acompanhamento fica em /admin/financeiro/notas-fiscais.)

    // Financeiro — margem / custo / MP (Onda 5E parte 3)
    if (financeAlerts.ordersPaidNegativeMargin > 0) {
      alerts.push({
        id: "alert-finance-negative-margin",
        title: "Pedidos pagos com margem negativa",
        description: `${financeAlerts.ordersPaidNegativeMargin} pedido(s) pago(s) nos últimos 30 dias estão dando prejuízo. Revise preços e custos.`,
        severity: "high",
        ctaLabel: "Ver relatório de margem",
        ctaHref: "/admin/financeiro/relatorios?tab=margem",
      });
    }
    if (financeAlerts.ordersPaidWithMissingCost > 0) {
      alerts.push({
        id: "alert-finance-missing-cost-orders",
        title: "Itens vendidos sem custo cadastrado",
        description: `${financeAlerts.ordersPaidWithMissingCost} pedido(s) pago(s) recente(s) com item sem custo — margem real impossível de calcular.`,
        severity: "high",
        ctaLabel: "Ver relatório de margem",
        ctaHref: "/admin/financeiro/relatorios?tab=margem",
      });
    }
    if (financeAlerts.productsWithoutCost > 0) {
      alerts.push({
        id: "alert-finance-products-no-cost",
        title: "Produtos ativos sem custo",
        description: `${financeAlerts.productsWithoutCost} produto(s) ativo(s) sem cost_price. Sem isso a margem fica em branco.`,
        severity: "medium",
        ctaLabel: "Ver produtos",
        ctaHref: "/admin/produtos",
      });
    }
    if (financeAlerts.productsBelowMinMargin > 0) {
      alerts.push({
        id: "alert-finance-below-min-margin",
        title: "Produtos abaixo da margem mínima",
        description: `${financeAlerts.productsBelowMinMargin} produto(s) com preço atual abaixo da margem mínima configurada.`,
        severity: "medium",
        ctaLabel: "Ver relatório de margem",
        ctaHref: "/admin/financeiro/relatorios?tab=margem",
      });
    }
    // NF B2B fora do sistema — sem alerta bloqueante.
    if (financeAlerts.mpWebhookErrors7d > 0) {
      alerts.push({
        id: "alert-finance-mp-webhook-error",
        title: "Webhook Mercado Pago com erro",
        description: `${financeAlerts.mpWebhookErrors7d} webhook(s) com erro nos últimos 7 dias. Pagamentos podem não estar sendo confirmados.`,
        severity: "high",
        ctaLabel: "Ver Mercado Pago",
        ctaHref: "/admin/financeiro/relatorios?tab=mercado-pago",
      });
    }
    if (financeAlerts.mpPaidNoFee30d > 0) {
      alerts.push({
        id: "alert-finance-mp-fee-unknown",
        title: "Taxa Mercado Pago desconhecida",
        description: `${financeAlerts.mpPaidNoFee30d} pagamento(s) sem taxa real nem estimada — lucro líquido pode estar incorreto.`,
        severity: "medium",
        ctaLabel: "Ver Mercado Pago",
        ctaHref: "/admin/financeiro/relatorios?tab=mercado-pago",
      });
    }
    if (financeAlerts.mpPaidEstimatedFee30d > 0) {
      alerts.push({
        id: "alert-finance-mp-fee-estimated",
        title: "Pagamentos usando taxa MP estimada",
        description: `${financeAlerts.mpPaidEstimatedFee30d} pagamento(s) com taxa estimada — webhook do Mercado Pago ainda não confirmou a taxa real.`,
        severity: "low",
        ctaLabel: "Ver Mercado Pago",
        ctaHref: "/admin/financeiro/relatorios?tab=mercado-pago",
      });
    }

    // Catálogo — qualidade de cadastro
    if (productQuality.featuredBelow70 > 0) {
      alerts.push({
        id: "alert-products-featured-low-quality",
        title: "Produtos destacados com cadastro incompleto",
        description: `${productQuality.featuredBelow70} produto(s) marcado(s) como destaque têm score de qualidade abaixo de 70. Corrija ou remova o destaque.`,
        severity: "high",
        ctaLabel: "Ver qualidade do cadastro",
        ctaHref: "/admin/produtos/qualidade",
      });
    }
    if (productQuality.ruim > 0) {
      alerts.push({
        id: "alert-products-quality-ruim",
        title: "Produtos com qualidade ruim",
        description: `${productQuality.ruim} produto(s) com score abaixo de 40 — afeta SEO, conversão e cálculo de margem.`,
        severity: "medium",
        ctaLabel: "Ver qualidade do cadastro",
        ctaHref: "/admin/produtos/qualidade",
      });
    }
    if (productQuality.missingTech > 0) {
      alerts.push({
        id: "alert-products-missing-tech-attrs",
        title: "Produtos sem atributos técnicos",
        description: `${productQuality.missingTech} produto(s) ativo(s) sem atributos técnicos cadastrados — prejudica busca, filtros e SEO.`,
        severity: "low",
        ctaLabel: "Ver qualidade do cadastro",
        ctaHref: "/admin/produtos/qualidade",
      });
    }
    // Dados fiscais — informativo, opcional. Emissão é externa.
    if (fiscal.companyFiscalIncomplete) {
      alerts.push({
        id: "alert-fiscal-company-data",
        title: "Dados fiscais da empresa incompletos (opcional)",
        description:
          "Preenchimento opcional. Útil apenas se quiser registrar dados fiscais para acompanhamento manual — emissão de NF é feita fora do sistema.",
        severity: "low",
        ctaLabel: "Configurar (opcional)",
        ctaHref: "/admin/financeiro/impostos",
      });
    }
    if (fiscal.paidOrdersWithFiscalIssues > 0) {
      alerts.push({
        id: "alert-fiscal-paid-orders",
        title: "Pedidos pagos sem dados fiscais completos",
        description: `${fiscal.paidOrdersWithFiscalIssues} pedido(s) pago(s) com item sem dados fiscais. Informativo apenas — não bloqueia o pedido. Emissão de NF é externa.`,
        severity: "low",
        ctaLabel: "Ver dados fiscais",
        ctaHref: "/admin/financeiro/impostos",
      });
    }
    if (fiscal.productsNoNcm > 0) {
      alerts.push({
        id: "alert-fiscal-no-ncm",
        title: "Produtos sem NCM (opcional)",
        description: `${fiscal.productsNoNcm} produto(s) ativo(s) sem NCM. Campo opcional — preencha se quiser usar no controle fiscal manual.`,
        severity: "low",
        ctaLabel: "Ver produtos",
        ctaHref: "/admin/financeiro/impostos?filter=no_ncm",
      });
    }
    if (fiscal.productsNoUnit > 0) {
      alerts.push({
        id: "alert-fiscal-no-unit",
        title: "Produtos sem unidade comercial (opcional)",
        description: `${fiscal.productsNoUnit} produto(s) ativo(s) sem unidade. Campo opcional para acompanhamento fiscal manual.`,
        severity: "low",
        ctaLabel: "Ver produtos",
        ctaHref: "/admin/financeiro/impostos?filter=no_unit",
      });
    }
    if (fiscal.productsNoOrigin > 0) {
      alerts.push({
        id: "alert-fiscal-no-origin",
        title: "Produtos sem origem da mercadoria (opcional)",
        description: `${fiscal.productsNoOrigin} produto(s) sem origem definida. Campo opcional — útil só para controle fiscal manual.`,
        severity: "low",
        ctaLabel: "Ver produtos",
        ctaHref: "/admin/financeiro/impostos?filter=no_origin",
      });
    }

    return {
      cards,
      alerts,
      daily: {
        ordersCreatedToday,
        ordersPaidToday,
        revenueToday,
        leadsToday,
        b2bNegotiationsToday,
        productsSoldToday,
        avgTicketToday,
      },
      generatedAt: new Date().toISOString(),
    };
  });
