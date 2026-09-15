// Identificador anônimo e persistente do carrinho, usado para sincronizar
// `cart_items` no servidor (habilita detecção de carrinho abandonado) sem
// exigir login. Sobrevive a reload/fechamento de aba; troca de navegador ou
// limpeza de dados do site gera um novo id (aceitável — mesma limitação do
// próprio carrinho, que já é local ao navegador).
const KEY = "led-marica-cart-session";

export function getCartSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Navegação privada/local storage bloqueado — segue sem persistir;
    // a sincronização do carrinho simplesmente não acontece nesta sessão.
    return "";
  }
}
