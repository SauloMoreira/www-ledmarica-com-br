/**
 * Cliques em links de WhatsApp → evento "whatsapp_click" (Meta: Contact).
 *
 * Um único listener delegado no documento cobre todos os links do site,
 * inclusive os que vêm de conteúdo do CMS (páginas institucionais, botões
 * configuráveis da home). A origem vem do atributo `data-wa-origin` do link
 * (ou de um ancestral); sem ele, usa `rodape` dentro do <footer> ou
 * `pagina:<caminho>`.
 *
 * Importante: um clique NÃO comprova que a conversa aconteceu nem que há um
 * lead — é só a intenção de contato. O envio ao Meta continua sujeito ao
 * consentimento de Marketing (ver `metaTrack`).
 */
import { trackEvent } from "@/lib/tracking";
import { useCookieStore } from "@/stores/cookieStore";

const WA_SELECTOR =
  'a[href*="wa.me/"], a[href*="api.whatsapp.com/"], a[href*="web.whatsapp.com/"], a[href^="whatsapp:"]';
const REPEAT_WINDOW_MS = 1500;

let installed = false;
let last: { origin: string; at: number; allowed: boolean } | null = null;

export function resolveWhatsAppOrigin(link: Element): string {
  const tagged = link.closest("[data-wa-origin]");
  const explicit = tagged?.getAttribute("data-wa-origin")?.trim();
  if (explicit) return explicit.slice(0, 60);
  if (link.closest("footer")) return "rodape";
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  return `pagina:${path || "/"}`.slice(0, 60);
}

function onClick(e: Event) {
  // auxclick: só o botão do meio (abrir em nova aba); ignora o botão direito.
  if (e.type === "auxclick" && (e as MouseEvent).button !== 1) return;
  const target = e.target as Element | null;
  const link = target?.closest?.(WA_SELECTOR);
  if (!link) return;
  const origin = resolveWhatsAppOrigin(link);
  const { consented, preferences } = useCookieStore.getState();
  const allowed = Boolean(consented && preferences.marketing);
  const now = Date.now();
  // Duplo clique / clique repetido no mesmo botão conta uma vez (por estado de
  // consentimento: um clique logo após o aceite não é descartado).
  if (
    last &&
    last.origin === origin &&
    last.allowed === allowed &&
    now - last.at < REPEAT_WINDOW_MS
  )
    return;
  last = { origin, at: now, allowed };
  trackEvent("whatsapp_click", {
    contact_channel: "whatsapp",
    contact_origin: origin,
  });
}

/** Instala o listener (idempotente). Chamar uma vez, no carregamento do site. */
export function installWhatsAppClickTracking(): () => void {
  if (typeof document === "undefined" || installed) return () => {};
  installed = true;
  // Captura: registra mesmo que algum componente pare a propagação.
  document.addEventListener("click", onClick, true);
  document.addEventListener("auxclick", onClick, true);
  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("auxclick", onClick, true);
    installed = false;
  };
}

/** Somente para testes automatizados. */
export function __resetWhatsAppTrackingForTests(): void {
  last = null;
}
