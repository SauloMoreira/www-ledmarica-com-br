// "Modo teste" — marca um navegador como da equipe da loja.
//
// Com o modo ativo:
//  - o carrinho não é sincronizado com `cart_items` (não vira carrinho abandonado);
//  - o contato do carrinho não é salvo (não vira lead);
//  - o pedido é gravado com `orders.is_test = true` e fica fora dos relatórios,
//    do CRM e das conversões enviadas ao Google/Meta;
//  - as tags de marketing (GA4, Google Ads, Meta, TikTok, Clarity) não carregam.
//
// Liga com `?modo=teste` em qualquer página (ou automaticamente ao abrir o
// painel /admin) e desliga com `?modo=normal`. O cookie NÃO é httpOnly de
// propósito: não é credencial — quem o define só exclui a si mesmo — e o
// client precisa lê-lo para não carregar as tags.
export const TEST_MODE_COOKIE = "lm_modo_teste";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 ano

export function isTestModeClient(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim() === `${TEST_MODE_COOKIE}=1`);
}

export function setTestMode(on: boolean): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = on
    ? `${TEST_MODE_COOKIE}=1; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`
    : `${TEST_MODE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

/**
 * Lê `?modo=teste|normal` da URL atual, aplica e remove o parâmetro da barra de
 * endereço (para não ser compartilhado sem querer). Retorna o estado final.
 */
export function applyTestModeFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    const modo = url.searchParams.get("modo");
    if (modo === "teste" || modo === "normal") {
      setTestMode(modo === "teste");
      url.searchParams.delete("modo");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  } catch {
    // URL inválida: mantém o estado atual.
  }
  return isTestModeClient();
}
