/**
 * Condições de cupom (par único condition_type + condition_value).
 *
 * Tipos suportados:
 * - `payment_method`: pix | credit_card | debit_card | boleto | any
 * - `delivery_scope`: local | national
 * - sem condição (`condition_type = null`): aplica sempre
 */

export type CouponConditionType = "payment_method" | "delivery_scope";

export type CouponCondition = {
  condition_type?: string | null;
  condition_value?: string | null;
};

export const PAYMENT_CONDITION_VALUES = [
  { value: "pix", label: "Pix", badge: "🔵 Pix" },
  { value: "credit_card", label: "Cartão de crédito", badge: "💳 Crédito" },
  { value: "debit_card", label: "Cartão de débito", badge: "💳 Débito" },
  { value: "boleto", label: "Boleto", badge: "🧾 Boleto" },
  { value: "any", label: "Qualquer forma de pagamento", badge: "✅ Qualquer forma" },
] as const;

export const DELIVERY_SCOPE_VALUES = [
  { value: "local", label: "Compra local (retirada/entrega em Maricá)", badge: "📍 Local" },
  { value: "national", label: "Compra nacional", badge: "🌎 Nacional" },
] as const;

/** Formas de pagamento que só podem ser confirmadas depois do pagamento. */
export const POST_PAYMENT_ONLY_VALUES = ["credit_card", "debit_card", "boleto"] as const;

/** Mapa condition_value -> mp_payment_type esperado no webhook. */
export const MP_PAYMENT_TYPE_BY_CONDITION: Record<string, string> = {
  credit_card: "credit_card",
  debit_card: "debit_card",
  boleto: "ticket",
};

export function conditionLabel(coupon: CouponCondition): string {
  if (!coupon.condition_type) return "Sem condição";
  if (coupon.condition_type === "payment_method") {
    const v = PAYMENT_CONDITION_VALUES.find((p) => p.value === coupon.condition_value);
    return v ? `Forma de pagamento: ${v.label}` : `Forma de pagamento: ${coupon.condition_value}`;
  }
  if (coupon.condition_type === "delivery_scope") {
    const v = DELIVERY_SCOPE_VALUES.find((d) => d.value === coupon.condition_value);
    return v ? v.label : `Escopo da compra: ${coupon.condition_value}`;
  }
  return `${coupon.condition_type}: ${coupon.condition_value}`;
}

export function conditionBadge(coupon: CouponCondition): string {
  if (!coupon.condition_type) return "⚪ Sem condição";
  const list =
    coupon.condition_type === "payment_method"
      ? (PAYMENT_CONDITION_VALUES as readonly { value: string; badge: string }[])
      : (DELIVERY_SCOPE_VALUES as readonly { value: string; badge: string }[]);
  return list.find((v) => v.value === coupon.condition_value)?.badge ?? "⚪ Sem condição";
}

export type PrePaymentContext = {
  intendedPaymentMethod: "pix" | "other" | null;
  deliveryMethod: "delivery" | "local_delivery" | "pickup" | null;
};

/**
 * Avalia se a condição do cupom é satisfeita ANTES do pagamento
 * (no carrinho/checkout, onde só existe intenção de pagamento).
 */
export function couponConditionMetPrePayment(
  coupon: CouponCondition,
  ctx: PrePaymentContext,
): boolean {
  if (!coupon.condition_type) return true;
  if (coupon.condition_type === "payment_method") {
    if (coupon.condition_value === "any") return true;
    if (coupon.condition_value === "pix") return ctx.intendedPaymentMethod === "pix";
    return false; // credit_card/debit_card/boleto só confirmáveis pós-pagamento
  }
  if (coupon.condition_type === "delivery_scope") {
    const isLocal = ctx.deliveryMethod === "local_delivery" || ctx.deliveryMethod === "pickup";
    return coupon.condition_value === "local" ? isLocal : !isLocal;
  }
  return false;
}
