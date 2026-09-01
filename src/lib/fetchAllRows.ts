/**
 * Pagina uma query Supabase (PostgREST) até esgotar todas as linhas.
 *
 * O Supabase limita cada requisição REST a um teto fixo de linhas
 * (Max Rows do projeto — 1000 por padrão) mesmo quando o código pede mais
 * via `.limit()`. Sem paginação real, qualquer tabela que ultrapasse esse
 * teto passa a ter linhas descartadas silenciosamente (sem erro) — isso já
 * aconteceu em produção com `product_attributes`.
 *
 * Use esta função em vez de um `.select()` solto sempre que o resultado
 * precisar conter TODAS as linhas que atendem ao filtro (relatórios,
 * agregações em memória, exports, telas admin que carregam tudo de uma vez).
 * Não use para listagens paginadas na UI que já usam `.range()` página a
 * página controlada pelo usuário (essas continuam como estão).
 */
export async function fetchAllRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  opts?: { pageSize?: number; hardCap?: number },
): Promise<T[]> {
  const pageSize = opts?.pageSize ?? 1000;
  const hardCap = opts?.hardCap ?? 200_000; // proteção contra loop indevido
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize || all.length >= hardCap) break;
    from += pageSize;
  }
  return all;
}
