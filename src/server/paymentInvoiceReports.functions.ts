import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { fetchAllRows } from "@/lib/fetchAllRows";

async function getSupabaseAdmin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

// =============================================================
// Filtros (compatível com financeReports)
// =============================================================

const FiltersSchema = z.object({
  preset: z.enum([
    "today",
    "yesterday",
    "last_7_days",
    "last_30_days",
    "this_month",
    "last_month",
    "custom",
  ]),
  start: z.string().optional(),
  end: z.string().optional(),
  orderType: z.enum(["all", "b2c", "b2b"]).default("all"),
  paymentStatus: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  deliveryMethod: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
});

type Filters = z.infer<typeof FiltersSchema>;

const PAID = ["approved", "paid"];
const PENDING = ["pending", "in_process", "preference_created"];
const REJECTED = ["rejected", "failed"];
const CANCELLED = ["cancelled"];

const INVOICE_STATUSES = [
  "nao_necessaria",
  "pendente_emissao",
  "emitida",
  "erro_emissao",
  "cancelada",
] as const;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function resolveRange(f: Filters): { from: Date; to: Date } {
  const now = new Date();
  switch (f.preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "last_7_days": {
      const x = new Date(now);
      x.setDate(now.getDate() - 6);
      return { from: startOfDay(x), to: endOfDay(now) };
    }
    case "last_30_days": {
      const x = new Date(now);
      x.setDate(now.getDate() - 29);
      return { from: startOfDay(x), to: endOfDay(now) };
    }
    case "this_month":
      return {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: endOfDay(now),
      };
    case "last_month": {
      const a = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const b = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(a), to: endOfDay(b) };
    }
    case "custom": {
      const a = f.start ? new Date(f.start) : startOfDay(now);
      const b = f.end ? new Date(f.end) : endOfDay(now);
      return { from: startOfDay(a), to: endOfDay(b) };
    }
  }
}

function maskCnpj(v: string | null | undefined): string {
  if (!v) return "";
  const d = v.replace(/\D/g, "");
  if (d.length !== 14) return v;
  return `${d.slice(0, 2)}.***.***/${d.slice(8, 12)}-**`;
}
function csvEscape(s: unknown): string {
  if (s == null) return "";
  const v = String(s);
  if (v.includes(";") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
function fmtMoney(n: number) {
  return n.toFixed(2).replace(".", ",");
}
function paymentMethodLabel(key: string | null): string {
  if (!key) return "Não informado";
  const map: Record<string, string> = {
    pix: "Pix",
    credit_card: "Cartão de crédito",
    debit_card: "Cartão de débito",
    bolbradesco: "Boleto",
    boleto: "Boleto",
    account_money: "Saldo Mercado Pago",
  };
  return map[key.toLowerCase()] ?? key;
}

// =============================================================
// Tipos
// =============================================================

export type MpReportCards = {
  rangeFrom: string;
  rangeTo: string;
  grossPaid: number;
  realFees: number;
  estimatedFees: number;
  netRevenue: number;
  countPaid: number;
  countPending: number;
  countRejected: number;
  countCancelled: number;
  countFeeReal: number;
  countFeeEstimated: number;
  countFeeUnknown: number;
  pctFeeReal: number;
  pctFeeEstimated: number;
  pctFeeUnknown: number;
  webhookErrors: number;
  lastWebhookAt: string | null;
  paymentsWithoutMpId: number;
  paymentsWithoutMethod: number;
  pendingOlderThan24h: number;
};

export type MpPaymentRow = {
  id: string;
  order_number: number;
  created_at: string;
  paid_at: string | null;
  customer_name: string;
  order_type: "b2c" | "b2b";
  mp_payment_id: string | null;
  payment_status: string;
  payment_method: string | null;
  payment_method_label: string;
  mp_payment_type: string | null;
  gross_amount: number;
  fee_amount: number;
  fee_source: "mercado_pago_real" | "estimated" | "unknown";
  net_amount: number;
  net_complete: boolean;
  mp_last_webhook_at: string | null;
  mp_webhook_status: string | null;
  mp_webhook_error: string | null;
  has_fee_details: boolean;
  total: number;
};

export type InvoiceReportCards = {
  rangeFrom: string;
  rangeTo: string;
  pending: number;
  issued: number;
  errored: number;
  cancelled: number;
  notRequired: number;
  paidWithoutInvoice: number;
  paidOver24hWithoutInvoice: number;
  b2bPaidWithoutInvoice: number;
  totalIssuedAmount: number;
  totalPendingAmount: number;
};

export type InvoiceRow = {
  id: string;
  order_number: number;
  created_at: string;
  paid_at: string | null;
  customer_name: string;
  order_type: "b2c" | "b2b";
  company_name: string | null;
  company_cnpj_masked: string;
  total: number;
  invoice_status: string;
  invoice_number: string | null;
  invoice_series: string | null;
  invoice_access_key: string | null;
  invoice_issued_at: string | null;
  invoice_danfe_url: string | null;
  invoice_xml_url: string | null;
  invoice_notes: string | null;
  hours_since_paid: number | null;
  has_incomplete_fiscal_items: boolean;
};

// =============================================================
// Fetch base
// =============================================================

const MP_SELECT =
  "id, order_number, status, payment_status, payment_method, order_type, company_name, company_cnpj, address_snapshot, created_at, paid_at, total, mp_payment_id, mp_payment_type, mp_gross_amount, mp_fee_amount, mp_net_amount, mp_fee_details, estimated_fee_amount, estimated_net_amount, payment_fee_source, mp_last_webhook_at, mp_webhook_status, mp_webhook_error";

const INVOICE_SELECT =
  "id, order_number, status, payment_status, payment_method, order_type, company_name, company_cnpj, address_snapshot, created_at, paid_at, total, invoice_status, invoice_number, invoice_series, invoice_access_key, invoice_danfe_url, invoice_xml_url, invoice_issued_at, invoice_notes";

type RawOrder = Record<string, unknown>;

async function fetchOrdersRange(
  filters: Filters,
  range: { from: Date; to: Date },
  selectStr: string,
): Promise<RawOrder[]> {
  const supabaseAdmin = await getSupabaseAdmin();
  const build = () => {
    let q = supabaseAdmin
      .from("orders")
      .select(selectStr)
      .gte("created_at", range.from.toISOString())
      .lte("created_at", range.to.toISOString())
      .order("created_at", { ascending: false });
    if (filters.orderType !== "all") q = q.eq("order_type", filters.orderType);
    if (filters.paymentStatus) q = q.eq("payment_status", filters.paymentStatus);
    if (filters.paymentMethod) q = q.eq("payment_method", filters.paymentMethod);
    if (filters.status) q = q.eq("status", filters.status);
    return q;
  };
  try {
    return (await fetchAllRows<unknown>((from, to) =>
      build().range(from, to),
    )) as unknown as RawOrder[];
  } catch (e) {
    throw new Response(`orders query failed: ${(e as Error).message}`, { status: 500 });
  }
}


function customerOf(o: RawOrder): string {
  const snap = o.address_snapshot as { recipient?: string; name?: string } | null;
  return snap?.recipient ?? snap?.name ?? (o.company_name as string | null) ?? "Cliente";
}

function feeSourceOf(o: RawOrder): "mercado_pago_real" | "estimated" | "unknown" {
  const src = (o.payment_fee_source as string | null) ?? null;
  if (src === "mercado_pago_real") return "mercado_pago_real";
  if (src === "estimated") return "estimated";
  if (o.mp_fee_amount != null) return "mercado_pago_real";
  if (o.estimated_fee_amount != null) return "estimated";
  return "unknown";
}

function feeAmountOf(o: RawOrder): number {
  if (o.mp_fee_amount != null) return Number(o.mp_fee_amount);
  if (o.estimated_fee_amount != null) return Number(o.estimated_fee_amount);
  return 0;
}

function grossAmountOf(o: RawOrder): number {
  if (o.mp_gross_amount != null) return Number(o.mp_gross_amount);
  return Number(o.total ?? 0);
}

function netAmountOf(o: RawOrder): { net: number; complete: boolean } {
  if (o.mp_net_amount != null) return { net: Number(o.mp_net_amount), complete: true };
  if (o.estimated_net_amount != null)
    return { net: Number(o.estimated_net_amount), complete: true };
  const src = feeSourceOf(o);
  if (src === "unknown") return { net: Number(o.total ?? 0), complete: false };
  return { net: grossAmountOf(o) - feeAmountOf(o), complete: true };
}

// =============================================================
// MERCADO PAGO — CARDS
// =============================================================

export const getMpReportCards = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => FiltersSchema.parse(input))
  .handler(async ({ data: filters }): Promise<MpReportCards> => {
    const range = resolveRange(filters);
    const orders = await fetchOrdersRange(filters, range, MP_SELECT);

    const paid = orders.filter((o) => PAID.includes((o.payment_status as string) ?? ""));
    const pending = orders.filter((o) => PENDING.includes((o.payment_status as string) ?? ""));
    const rejected = orders.filter((o) => REJECTED.includes((o.payment_status as string) ?? ""));
    const cancelled = orders.filter((o) => CANCELLED.includes((o.payment_status as string) ?? ""));

    let grossPaid = 0;
    let realFees = 0;
    let estimatedFees = 0;
    let netRevenue = 0;
    let countFeeReal = 0;
    let countFeeEstimated = 0;
    let countFeeUnknown = 0;
    for (const o of paid) {
      grossPaid += grossAmountOf(o);
      const src = feeSourceOf(o);
      const fee = feeAmountOf(o);
      const { net } = netAmountOf(o);
      netRevenue += net;
      if (src === "mercado_pago_real") {
        realFees += fee;
        countFeeReal += 1;
      } else if (src === "estimated") {
        estimatedFees += fee;
        countFeeEstimated += 1;
      } else {
        countFeeUnknown += 1;
      }
    }

    const webhookErrors = orders.filter(
      (o) => (o.mp_webhook_status as string | null) === "error" || !!o.mp_webhook_error,
    ).length;

    let lastWebhookAt: string | null = null;
    for (const o of orders) {
      const w = o.mp_last_webhook_at as string | null;
      if (w && (!lastWebhookAt || w > lastWebhookAt)) lastWebhookAt = w;
    }

    const paymentsWithoutMpId = paid.filter((o) => !o.mp_payment_id).length;
    const paymentsWithoutMethod = paid.filter((o) => !o.payment_method).length;

    const cutoff = Date.now() - 24 * 3600 * 1000;
    const pendingOlderThan24h = pending.filter((o) => {
      const t = new Date((o.created_at as string) ?? "").getTime();
      return Number.isFinite(t) && t < cutoff;
    }).length;

    const totalCounted = countFeeReal + countFeeEstimated + countFeeUnknown;
    const pct = (n: number) => (totalCounted > 0 ? (n / totalCounted) * 100 : 0);

    return {
      rangeFrom: range.from.toISOString(),
      rangeTo: range.to.toISOString(),
      grossPaid,
      realFees,
      estimatedFees,
      netRevenue,
      countPaid: paid.length,
      countPending: pending.length,
      countRejected: rejected.length,
      countCancelled: cancelled.length,
      countFeeReal,
      countFeeEstimated,
      countFeeUnknown,
      pctFeeReal: pct(countFeeReal),
      pctFeeEstimated: pct(countFeeEstimated),
      pctFeeUnknown: pct(countFeeUnknown),
      webhookErrors,
      lastWebhookAt,
      paymentsWithoutMpId,
      paymentsWithoutMethod,
      pendingOlderThan24h,
    };
  });

// =============================================================
// MERCADO PAGO — TABELA
// =============================================================

const MpListSchema = FiltersSchema.extend({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  feeSource: z.enum(["all", "mercado_pago_real", "estimated", "unknown"]).default("all"),
});

export type MpListResult = {
  rangeFrom: string;
  rangeTo: string;
  total: number;
  page: number;
  pageSize: number;
  rows: MpPaymentRow[];
};

export const getMpPayments = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => MpListSchema.parse(input))
  .handler(async ({ data }): Promise<MpListResult> => {
    const range = resolveRange(data);
    const orders = await fetchOrdersRange(data, range, MP_SELECT);

    const filtered =
      data.feeSource === "all" ? orders : orders.filter((o) => feeSourceOf(o) === data.feeSource);

    const total = filtered.length;
    const startIdx = (data.page - 1) * data.pageSize;
    const slice = filtered.slice(startIdx, startIdx + data.pageSize);

    const rows: MpPaymentRow[] = slice.map((o) => {
      const src = feeSourceOf(o);
      const fee = feeAmountOf(o);
      const { net, complete } = netAmountOf(o);
      return {
        id: o.id as string,
        order_number: Number(o.order_number ?? 0),
        created_at: o.created_at as string,
        paid_at: (o.paid_at as string | null) ?? null,
        customer_name: customerOf(o),
        order_type: ((o.order_type as string) ?? "b2c") as "b2c" | "b2b",
        mp_payment_id: (o.mp_payment_id as string | null) ?? null,
        payment_status: (o.payment_status as string) ?? "unknown",
        payment_method: (o.payment_method as string | null) ?? null,
        payment_method_label: paymentMethodLabel((o.payment_method as string | null) ?? null),
        mp_payment_type: (o.mp_payment_type as string | null) ?? null,
        gross_amount: grossAmountOf(o),
        fee_amount: fee,
        fee_source: src,
        net_amount: net,
        net_complete: complete,
        mp_last_webhook_at: (o.mp_last_webhook_at as string | null) ?? null,
        mp_webhook_status: (o.mp_webhook_status as string | null) ?? null,
        mp_webhook_error: (o.mp_webhook_error as string | null) ?? null,
        has_fee_details: o.mp_fee_details != null,
        total: Number(o.total ?? 0),
      };
    });

    return {
      rangeFrom: range.from.toISOString(),
      rangeTo: range.to.toISOString(),
      total,
      page: data.page,
      pageSize: data.pageSize,
      rows,
    };
  });

// =============================================================
// MERCADO PAGO — CSV
// =============================================================

export const exportMpPaymentsCsv = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => MpListSchema.parse(input))
  .handler(async ({ data }): Promise<{ filename: string; content: string }> => {
    const range = resolveRange(data);
    const orders = await fetchOrdersRange(data, range, MP_SELECT);
    const filtered =
      data.feeSource === "all" ? orders : orders.filter((o) => feeSourceOf(o) === data.feeSource);
    const limited = filtered.slice(0, 5000);

    const headers = [
      "Data",
      "Pedido",
      "Cliente",
      "Tipo",
      "ID Mercado Pago",
      "Status pagamento",
      "Método pagamento",
      "Tipo pagamento",
      "Valor bruto",
      "Taxa MP",
      "Origem da taxa",
      "Valor líquido",
      "Último webhook",
      "Status webhook",
      "Erro webhook",
    ];
    const lines: string[] = [headers.join(";")];

    for (const o of limited) {
      const src = feeSourceOf(o);
      const fee = feeAmountOf(o);
      const { net } = netAmountOf(o);
      lines.push(
        [
          new Date(o.created_at as string).toLocaleString("pt-BR"),
          `#${o.order_number}`,
          customerOf(o),
          (o.order_type as string) === "b2b" ? "B2B" : "B2C",
          (o.mp_payment_id as string | null) ?? "",
          (o.payment_status as string | null) ?? "",
          paymentMethodLabel((o.payment_method as string | null) ?? null),
          (o.mp_payment_type as string | null) ?? "",
          fmtMoney(grossAmountOf(o)),
          fmtMoney(fee),
          src,
          fmtMoney(net),
          o.mp_last_webhook_at
            ? new Date(o.mp_last_webhook_at as string).toLocaleString("pt-BR")
            : "",
          (o.mp_webhook_status as string | null) ?? "",
          (o.mp_webhook_error as string | null) ?? "",
        ]
          .map(csvEscape)
          .join(";"),
      );
    }

    const filename = `mercado_pago_${range.from.toISOString().slice(0, 10)}_${range.to
      .toISOString()
      .slice(0, 10)}.csv`;
    return { filename, content: "\ufeff" + lines.join("\n") };
  });

// =============================================================
// NOTAS FISCAIS — CARDS
// =============================================================

export const getInvoiceReportCards = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => FiltersSchema.parse(input))
  .handler(async ({ data: filters }): Promise<InvoiceReportCards> => {
    const range = resolveRange(filters);
    const orders = await fetchOrdersRange(filters, range, INVOICE_SELECT);

    let pending = 0,
      issued = 0,
      errored = 0,
      cancelled = 0,
      notRequired = 0;
    let paidWithoutInvoice = 0;
    let paidOver24hWithoutInvoice = 0;
    let b2bPaidWithoutInvoice = 0;
    let totalIssuedAmount = 0;
    let totalPendingAmount = 0;

    const cutoff = Date.now() - 24 * 3600 * 1000;

    for (const o of orders) {
      const status = (o.invoice_status as string | null) ?? "pendente_emissao";
      const paid = PAID.includes((o.payment_status as string) ?? "");
      const total = Number(o.total ?? 0);

      if (status === "pendente_emissao") {
        pending += 1;
        if (paid) totalPendingAmount += total;
      } else if (status === "emitida") {
        issued += 1;
        totalIssuedAmount += total;
      } else if (status === "erro_emissao") {
        errored += 1;
      } else if (status === "cancelada") {
        cancelled += 1;
      } else if (status === "nao_necessaria") {
        notRequired += 1;
      }

      if (paid && status !== "emitida" && status !== "nao_necessaria" && status !== "cancelada") {
        paidWithoutInvoice += 1;
        if ((o.order_type as string) === "b2b") b2bPaidWithoutInvoice += 1;
        const paidAt = o.paid_at ? new Date(o.paid_at as string).getTime() : null;
        if (paidAt && paidAt < cutoff) paidOver24hWithoutInvoice += 1;
      }
    }

    return {
      rangeFrom: range.from.toISOString(),
      rangeTo: range.to.toISOString(),
      pending,
      issued,
      errored,
      cancelled,
      notRequired,
      paidWithoutInvoice,
      paidOver24hWithoutInvoice,
      b2bPaidWithoutInvoice,
      totalIssuedAmount,
      totalPendingAmount,
    };
  });

// =============================================================
// NOTAS FISCAIS — TABELA
// =============================================================

const InvoiceListSchema = FiltersSchema.extend({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  invoiceStatus: z
    .enum([
      "all",
      "nao_necessaria",
      "pendente_emissao",
      "emitida",
      "erro_emissao",
      "cancelada",
      "paid_no_invoice",
      "paid_over_24h",
      "b2b_no_invoice",
    ])
    .default("all"),
});

export type InvoiceListResult = {
  rangeFrom: string;
  rangeTo: string;
  total: number;
  page: number;
  pageSize: number;
  rows: InvoiceRow[];
};

async function detectIncompleteFiscalItems(orderIds: string[]): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set();
  try {
    const supabaseAdmin = await getSupabaseAdmin();
    // Tenta inferir incompletos via products fiscal flags se houver
    const items = await fetchAllRows<{ order_id: string; product_id: string | null }>((from, to) =>
      supabaseAdmin
        .from("order_items")
        .select("order_id, product_id")
        .in("order_id", orderIds)
        .range(from, to),
    );
    const productIds = Array.from(
      new Set(items.map((i) => i.product_id).filter(Boolean) as string[]),
    );
    if (productIds.length === 0) return new Set();
    const products = await fetchAllRows<Record<string, unknown>>((from, to) =>
      supabaseAdmin
        .from("products")
        .select("id, ncm, cfop_default, commercial_unit, fiscal_status")
        .in("id", productIds)
        .range(from, to),
    );
    const incompleteProducts = new Set<string>();
    for (const p of products) {
      const missing =
        !p.ncm || !p.cfop_default || !p.commercial_unit || p.fiscal_status === "incomplete";
      if (missing) incompleteProducts.add(p.id as string);
    }
    const orderHasIncomplete = new Set<string>();
    for (const it of items) {
      if (it.product_id && incompleteProducts.has(it.product_id)) {
        orderHasIncomplete.add(it.order_id);
      }
    }
    return orderHasIncomplete;
  } catch {
    return new Set();
  }
}

export const getInvoicesReport = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => InvoiceListSchema.parse(input))
  .handler(async ({ data }): Promise<InvoiceListResult> => {
    const range = resolveRange(data);
    const orders = await fetchOrdersRange(data, range, INVOICE_SELECT);

    const cutoff = Date.now() - 24 * 3600 * 1000;
    const filtered = orders.filter((o) => {
      const status = (o.invoice_status as string | null) ?? "pendente_emissao";
      const paid = PAID.includes((o.payment_status as string) ?? "");
      switch (data.invoiceStatus) {
        case "all":
          return true;
        case "paid_no_invoice":
          return (
            paid && status !== "emitida" && status !== "nao_necessaria" && status !== "cancelada"
          );
        case "paid_over_24h": {
          if (!paid) return false;
          if (status === "emitida" || status === "nao_necessaria" || status === "cancelada")
            return false;
          const t = o.paid_at ? new Date(o.paid_at as string).getTime() : null;
          return t != null && t < cutoff;
        }
        case "b2b_no_invoice":
          return (
            paid &&
            (o.order_type as string) === "b2b" &&
            status !== "emitida" &&
            status !== "nao_necessaria" &&
            status !== "cancelada"
          );
        default:
          return status === data.invoiceStatus;
      }
    });

    const total = filtered.length;
    const startIdx = (data.page - 1) * data.pageSize;
    const slice = filtered.slice(startIdx, startIdx + data.pageSize);
    const incompleteSet = await detectIncompleteFiscalItems(slice.map((o) => o.id as string));

    const rows: InvoiceRow[] = slice.map((o) => {
      const paidAt = o.paid_at ? new Date(o.paid_at as string).getTime() : null;
      const hours = paidAt ? Math.floor((Date.now() - paidAt) / 3600000) : null;
      return {
        id: o.id as string,
        order_number: Number(o.order_number ?? 0),
        created_at: o.created_at as string,
        paid_at: (o.paid_at as string | null) ?? null,
        customer_name: customerOf(o),
        order_type: ((o.order_type as string) ?? "b2c") as "b2c" | "b2b",
        company_name: (o.company_name as string | null) ?? null,
        company_cnpj_masked: maskCnpj((o.company_cnpj as string | null) ?? null),
        total: Number(o.total ?? 0),
        invoice_status: (o.invoice_status as string | null) ?? "pendente_emissao",
        invoice_number: (o.invoice_number as string | null) ?? null,
        invoice_series: (o.invoice_series as string | null) ?? null,
        invoice_access_key: (o.invoice_access_key as string | null) ?? null,
        invoice_issued_at: (o.invoice_issued_at as string | null) ?? null,
        invoice_danfe_url: (o.invoice_danfe_url as string | null) ?? null,
        invoice_xml_url: (o.invoice_xml_url as string | null) ?? null,
        invoice_notes: (o.invoice_notes as string | null) ?? null,
        hours_since_paid: hours,
        has_incomplete_fiscal_items: incompleteSet.has(o.id as string),
      };
    });

    return {
      rangeFrom: range.from.toISOString(),
      rangeTo: range.to.toISOString(),
      total,
      page: data.page,
      pageSize: data.pageSize,
      rows,
    };
  });

// =============================================================
// NOTAS FISCAIS — CSV
// =============================================================

export const exportInvoicesCsv = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => InvoiceListSchema.parse(input))
  .handler(async ({ data }): Promise<{ filename: string; content: string }> => {
    const range = resolveRange(data);
    const orders = await fetchOrdersRange(data, range, INVOICE_SELECT);

    const cutoff = Date.now() - 24 * 3600 * 1000;
    const filtered = orders.filter((o) => {
      const status = (o.invoice_status as string | null) ?? "pendente_emissao";
      const paid = PAID.includes((o.payment_status as string) ?? "");
      switch (data.invoiceStatus) {
        case "all":
          return true;
        case "paid_no_invoice":
          return (
            paid && status !== "emitida" && status !== "nao_necessaria" && status !== "cancelada"
          );
        case "paid_over_24h": {
          if (!paid) return false;
          if (status === "emitida" || status === "nao_necessaria" || status === "cancelada")
            return false;
          const t = o.paid_at ? new Date(o.paid_at as string).getTime() : null;
          return t != null && t < cutoff;
        }
        case "b2b_no_invoice":
          return (
            paid &&
            (o.order_type as string) === "b2b" &&
            status !== "emitida" &&
            status !== "nao_necessaria" &&
            status !== "cancelada"
          );
        default:
          return status === data.invoiceStatus;
      }
    });

    const limited = filtered.slice(0, 5000);

    const headers = [
      "Data do pedido",
      "Pedido",
      "Cliente",
      "Tipo",
      "Empresa",
      "CNPJ",
      "Valor do pedido",
      "Status fiscal",
      "Número da nota",
      "Série",
      "Chave de acesso",
      "Data de emissão",
      "Link DANFE",
      "Link XML",
      "Tempo desde pagamento (h)",
      "Observações fiscais",
    ];
    const lines: string[] = [headers.join(";")];

    for (const o of limited) {
      const paidAt = o.paid_at ? new Date(o.paid_at as string).getTime() : null;
      const hours = paidAt ? Math.floor((Date.now() - paidAt) / 3600000) : null;
      lines.push(
        [
          new Date(o.created_at as string).toLocaleString("pt-BR"),
          `#${o.order_number}`,
          customerOf(o),
          (o.order_type as string) === "b2b" ? "B2B" : "B2C",
          (o.company_name as string | null) ?? "",
          maskCnpj((o.company_cnpj as string | null) ?? null),
          fmtMoney(Number(o.total ?? 0)),
          (o.invoice_status as string | null) ?? "pendente_emissao",
          (o.invoice_number as string | null) ?? "",
          (o.invoice_series as string | null) ?? "",
          (o.invoice_access_key as string | null) ?? "",
          o.invoice_issued_at
            ? new Date(o.invoice_issued_at as string).toLocaleString("pt-BR")
            : "",
          (o.invoice_danfe_url as string | null) ?? "",
          (o.invoice_xml_url as string | null) ?? "",
          hours != null ? String(hours) : "",
          (o.invoice_notes as string | null) ?? "",
        ]
          .map(csvEscape)
          .join(";"),
      );
    }

    const filename = `notas_fiscais_${range.from.toISOString().slice(0, 10)}_${range.to
      .toISOString()
      .slice(0, 10)}.csv`;
    return { filename, content: "\ufeff" + lines.join("\n") };
  });

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  nao_necessaria: "Não necessária",
  pendente_emissao: "Pendente",
  emitida: "Emitida",
  erro_emissao: "Erro",
  cancelada: "Cancelada",
};

export const FEE_SOURCE_LABELS: Record<string, string> = {
  mercado_pago_real: "Real",
  estimated: "Estimado",
  unknown: "Desconhecido",
};

export const ALL_INVOICE_STATUSES = INVOICE_STATUSES;
