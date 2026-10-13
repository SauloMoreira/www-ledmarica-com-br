// Documento fiscal do comprador: CPF (pessoa física) ou CNPJ (empresa/MEI).
// Camada fina sobre src/lib/cpf.ts e src/lib/cnpj.ts — usada no checkout
// (client) e revalidada no servidor (checkout.functions.ts).

import { formatCPF, isValidCPF } from "@/lib/cpf";
import { formatCNPJ, isValidCNPJ } from "@/lib/cnpj";

export type TaxDocumentType = "cpf" | "cnpj";

export const TAX_DOCUMENT_LENGTH: Record<TaxDocumentType, number> = {
  cpf: 11,
  cnpj: 14,
};

export function onlyDigits(value: string): string {
  return (value || "").replace(/\D+/g, "");
}

export function formatTaxDocument(value: string, type: TaxDocumentType): string {
  return type === "cnpj" ? formatCNPJ(value) : formatCPF(value);
}

export function isValidTaxDocument(value: string, type: TaxDocumentType): boolean {
  return type === "cnpj" ? isValidCNPJ(value) : isValidCPF(value);
}

/** Razão social mínima aceitável (evita "x", "." etc.). */
export function isValidLegalName(value: string | null | undefined): boolean {
  return (value ?? "").trim().length >= 2;
}

/** Formata um documento já salvo (só dígitos) para exibição, inferindo o tipo pelo tamanho. */
export function formatStoredTaxDocument(digits: string | null | undefined): string {
  const d = onlyDigits(digits ?? "");
  if (d.length === 14) return formatCNPJ(d);
  if (d.length === 11) return formatCPF(d);
  return d;
}
