/**
 * Decide se uma notificação de pagamento do Mercado Pago pode marcar o pedido
 * como pago. Regra: status "approved" no MP E valor cobrado igual ao total do
 * pedido (tolerância de R$ 0,05). Valor divergente → "em análise", nunca pago.
 */
export const AMOUNT_TOLERANCE = 0.05;

export function evaluateMpApproval(input: {
  mpStatus: string | null | undefined;
  transactionAmount: number | string | null | undefined;
  orderTotal: number | string | null | undefined;
}): {
  approvedByMp: boolean;
  amountMatches: boolean;
  willBePaid: boolean;
  amountMismatch: boolean;
} {
  const approvedByMp = input.mpStatus === "approved";
  const paid = input.transactionAmount == null ? NaN : Number(input.transactionAmount);
  const total = input.orderTotal == null ? NaN : Number(input.orderTotal);
  const amountMatches =
    Number.isFinite(paid) && Number.isFinite(total) && Math.abs(paid - total) <= AMOUNT_TOLERANCE;
  return {
    approvedByMp,
    amountMatches,
    willBePaid: approvedByMp && amountMatches,
    amountMismatch: approvedByMp && !amountMatches,
  };
}
