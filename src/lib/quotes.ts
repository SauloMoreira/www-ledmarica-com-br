// Regras puras do módulo de Orçamentos PJ — compartilhadas entre servidor
// (fonte da verdade dos totais) e editor (prévia em tempo real).

export const QUOTE_STATUSES = [
  "rascunho",
  "enviado",
  "aprovado",
  "recusado",
  "expirado",
  "convertido",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aprovado: "Aprovado",
  recusado: "Recusado",
  expirado: "Expirado",
  convertido: "Convertido",
};

export const QUOTE_STATUS_CLASS: Record<QuoteStatus, string> = {
  rascunho: "bg-muted text-muted-foreground",
  enviado: "bg-primary/15 text-primary",
  aprovado: "bg-success/15 text-success",
  recusado: "bg-destructive/15 text-destructive",
  expirado: "bg-warning/15 text-warning",
  convertido: "bg-success/25 text-success",
};

export type QuoteTerm = { label: string; text: string };

export type QuoteItemInput = {
  quantity: number;
  unit_price: number;
  discount_pct: number;
};

export type QuoteTotalsInput = {
  items: QuoteItemInput[];
  commercial_discount_pct: number;
  freight_amount: number;
  pix_discount_pct: number;
};

export type QuoteTotals = {
  line_totals: number[];
  subtotal_gross: number;
  items_discount_total: number;
  commercial_discount_amount: number;
  total: number;
  total_pix: number;
  savings: number;
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function lineTotal(item: QuoteItemInput): number {
  return round2(item.quantity * item.unit_price * (1 - item.discount_pct / 100));
}

export function computeQuoteTotals(input: QuoteTotalsInput): QuoteTotals {
  const line_totals = input.items.map(lineTotal);
  const subtotal_gross = round2(
    input.items.reduce((s, i) => s + i.quantity * i.unit_price, 0),
  );
  const sumLines = round2(line_totals.reduce((s, v) => s + v, 0));
  const items_discount_total = round2(subtotal_gross - sumLines);
  const commercial_discount_amount = round2((sumLines * input.commercial_discount_pct) / 100);
  const net = round2(sumLines - commercial_discount_amount);
  const total = round2(net + input.freight_amount);
  const total_pix = round2(round2(net * (1 - input.pix_discount_pct / 100)) + input.freight_amount);
  const savings = round2(items_discount_total + commercial_discount_amount);
  return {
    line_totals,
    subtotal_gross,
    items_discount_total,
    commercial_discount_amount,
    total,
    total_pix,
    savings,
  };
}

/** Status efetivo: rascunho/enviado vencidos são exibidos como "expirado". */
export function effectiveQuoteStatus(
  status: QuoteStatus,
  expiresAt: string | Date,
  now: Date = new Date(),
): QuoteStatus {
  if ((status === "rascunho" || status === "enviado") && now > new Date(expiresAt)) {
    return "expirado";
  }
  return status;
}

export function validityText(hours: number): string {
  return `Este orçamento é válido por ${hours} horas a partir da emissão. Após esse prazo, preços e disponibilidade devem ser reconfirmados.`;
}

export function paymentText(pix: number): string {
  return `PIX com ${formatPct(pix)}% de desconto · Cartão em até 12x sem juros · Boleto faturado mediante análise de crédito`;
}

export function defaultQuoteTerms(validityHours: number, pixPct: number): QuoteTerm[] {
  return [
    { label: "Validade", text: validityText(validityHours) },
    { label: "Pagamento", text: paymentText(pixPct) },
    { label: "Entrega", text: "Em até 24 h úteis em Maricá após confirmação · demais regiões a combinar" },
    { label: "Frete", text: "Grátis em Maricá · retirada sem custo na loja" },
    { label: "Faturamento", text: "NF-e emitida para o CNPJ do cliente" },
    { label: "Garantia", text: "Conforme fabricante, com suporte técnico da loja" },
    { label: "Observações", text: "Preços sujeitos à disponibilidade de estoque na data do pedido" },
  ];
}

/** Preço sugerido ao adicionar produto: B2B (se habilitado) → promoção → cheio. */
export function suggestedUnitPrice(p: {
  b2b_enabled: boolean | null;
  b2b_price: number | null;
  sale_price: number | null;
  price: number | null;
}): number {
  if (p.b2b_enabled && p.b2b_price != null && p.b2b_price > 0) return Number(p.b2b_price);
  if (p.sale_price != null && p.sale_price > 0) return Number(p.sale_price);
  return Number(p.price ?? 0);
}

export type MarginAlert = "below_cost" | "below_min_margin" | null;

export function marginAlert(
  netUnitPrice: number,
  cost: number | null | undefined,
  minMarginPct: number | null | undefined,
): MarginAlert {
  if (cost == null || cost <= 0) return null;
  if (netUnitPrice < cost) return "below_cost";
  const floor = cost * (1 + (minMarginPct ?? 0) / 100);
  if (netUnitPrice < floor) return "below_min_margin";
  return null;
}

// ---------- Formatação pt-BR ----------
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatMoney = (n: number) => brl.format(Number.isFinite(n) ? n : 0);

export function formatPct(n: number): string {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function formatQty(n: number): string {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/** Converte "1.234,56" / "1234.56" / "12,5" em número. Retorna NaN se inválido. */
export function parseBRNumber(raw: string): number {
  const s = (raw ?? "").trim().replace(/\s|R\$/g, "");
  if (!s) return NaN;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return Number(normalized);
}

export { formatDateTimeBR } from "./dateBR";

export function hoursUntil(iso: string, now: Date = new Date()): number {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 3_600_000);
}
