// Motivos de não conversão do carrinho — registrados pela equipe após o
// contato (WhatsApp/e-mail). Alimentam a análise de "por que não vendeu".
export const LOSS_REASONS = [
  { value: "preco", label: "Achou caro / preço" },
  { value: "frete", label: "Frete caro" },
  { value: "prazo", label: "Prazo de entrega" },
  { value: "comprou_loja_fisica", label: "Comprou na loja física" },
  { value: "comprou_concorrente", label: "Comprou em outro lugar" },
  { value: "so_pesquisando", label: "Só pesquisando / sem urgência" },
  { value: "duvida_tecnica", label: "Dúvida técnica sobre o produto" },
  { value: "pagamento", label: "Problema no pagamento" },
  { value: "cadastro_login", label: "Dificuldade com cadastro/login" },
  { value: "estoque", label: "Produto sem estoque / variação" },
  { value: "sem_resposta", label: "Não respondeu" },
  { value: "outro", label: "Outro (ver observações)" },
] as const;

export type LossReason = (typeof LOSS_REASONS)[number]["value"];

export const LOSS_REASON_VALUES = LOSS_REASONS.map((r) => r.value) as [LossReason, ...LossReason[]];

export function lossReasonLabel(v: string | null | undefined): string | null {
  return LOSS_REASONS.find((r) => r.value === v)?.label ?? null;
}
