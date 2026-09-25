// Sanitização de termos de busca usados em filtros PostgREST `.or(...)`.
//
// `.or()` recebe uma string com sintaxe própria (`col.op.valor,col.op.valor`):
// vírgula, parênteses, aspas e barra invertida no termo digitado pelo usuário
// podem fechar a expressão e injetar condições extras (ex.: `x,active.eq.false`
// ou `x),or(id.not.is.null`). `*` e `%` viram curingas de LIKE.
// Este helper remove esses caracteres ANTES de montar o filtro — o termo
// continua servindo para busca textual, mas nunca altera a estrutura do filtro.
// `_` é mantido de propósito (curinga de 1 caractere que também casa com o
// próprio `_`, então SKUs como "ABC_1" continuam sendo encontrados).

const RESERVED = /[\\%*,()"'`]/g;

export function sanitizeSearchTerm(raw: unknown, maxLen = 100): string {
  return String(raw ?? "")
    .normalize("NFC")
    .replace(RESERVED, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/** `%termo%` já sanitizado, pronto para `ilike`. String vazia se não sobrar termo. */
export function ilikePattern(raw: unknown, maxLen = 100): string {
  const t = sanitizeSearchTerm(raw, maxLen);
  return t ? `%${t}%` : "";
}

/**
 * Monta `col1.ilike.%t%,col2.ilike.%t%` com o termo sanitizado.
 * Retorna `null` quando não sobra termo — o chamador simplesmente não aplica o filtro.
 */
export function ilikeOrFilter(columns: readonly string[], raw: unknown, maxLen = 100): string | null {
  const pattern = ilikePattern(raw, maxLen);
  if (!pattern) return null;
  return columns.map((c) => `${c}.ilike.${pattern}`).join(",");
}
