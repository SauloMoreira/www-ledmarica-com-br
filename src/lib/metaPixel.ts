/**
 * Meta Pixel (Facebook/Instagram) — carregamento sob consentimento LGPD.
 *
 * Regras:
 *  - Nada é carregado nem disparado sem consentimento de Marketing: quem chama
 *    `activateMetaPixel` é o ConditionalScripts, só com `preferences.marketing`.
 *  - O código do Pixel é gerado aqui (stub oficial `fbq` + fbevents.js por
 *    `src`); o admin informa apenas o Pixel ID numérico. Nenhum script vindo
 *    do banco é executado e o ID nunca é interpolado em código.
 *  - Revogação: `fbq('consent','revoke')` faz o Meta descartar TODOS os
 *    disparos seguintes (inclusive os PageView automáticos de navegação SPA)
 *    até um novo `fbq('consent','grant')`.
 */
import { META_PIXEL_SCRIPT_SRC, isValidIntegrationId } from "@/lib/integrationIds";

export { META_PIXEL_SCRIPT_SRC };

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  push?: unknown;
  loaded?: boolean;
  version?: string;
};

const SCRIPT_ID = "lm-meta-pixel";

const initializedIds = new Set<string>();
let consentState: "granted" | "revoked" | "unset" = "unset";

function getWindow(): (Window & { fbq?: Fbq; _fbq?: Fbq }) | null {
  return typeof window === "undefined" ? null : (window as Window & { fbq?: Fbq; _fbq?: Fbq });
}

/** Cria o stub `fbq` (fila) no mesmo formato do snippet oficial do Meta. */
function ensureFbqStub(w: Window & { fbq?: Fbq; _fbq?: Fbq }): Fbq {
  if (typeof w.fbq === "function") return w.fbq;
  const n = function (...args: unknown[]) {
    if (n.callMethod) n.callMethod(...args);
    else n.queue!.push(args);
  } as Fbq;
  n.push = n;
  n.loaded = true;
  n.version = "2.0";
  n.queue = [];
  w.fbq = n;
  if (!w._fbq) w._fbq = n;
  return n;
}

function ensureLibraryScript(): void {
  if (typeof document === "undefined" || document.getElementById(SCRIPT_ID)) return;
  const s = document.createElement("script");
  s.id = SCRIPT_ID;
  s.async = true;
  s.src = META_PIXEL_SCRIPT_SRC;
  document.head.appendChild(s);
}

/**
 * Ativa o Pixel após consentimento de Marketing: concede consentimento,
 * inicializa o ID (uma vez) e dispara `PageView` na inicialização.
 * Idempotente — pode ser chamado a cada mudança de preferências.
 */
export function activateMetaPixel(pixelId: string): boolean {
  const w = getWindow();
  const id = String(pixelId ?? "").trim();
  if (!w || !isValidIntegrationId("meta_pixel", id)) return false;

  const fbq = ensureFbqStub(w);
  if (consentState !== "granted") {
    fbq("consent", "grant");
    consentState = "granted";
  }
  if (!initializedIds.has(id)) {
    fbq("init", id);
    fbq("track", "PageView");
    initializedIds.add(id);
  }
  ensureLibraryScript();
  return true;
}

/**
 * Bloqueia novos disparos após revogação do consentimento de Marketing.
 * Só age se o Pixel já tiver sido carregado nesta página.
 */
export function revokeMetaPixelConsent(): void {
  const w = getWindow();
  if (!w || typeof w.fbq !== "function" || consentState === "revoked") return;
  w.fbq("consent", "revoke");
  consentState = "revoked";
}

/** Somente para testes automatizados. */
export function __resetMetaPixelStateForTests(): void {
  initializedIds.clear();
  consentState = "unset";
}
