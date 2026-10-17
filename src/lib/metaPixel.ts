/**
 * Meta Pixel (Facebook/Instagram) — carregamento e envio sob consentimento LGPD.
 *
 * Regras:
 *  - Nada é carregado nem disparado sem consentimento de Marketing. Quem ativa o
 *    Pixel é o ConditionalScripts (`activateMetaPixel`), só com
 *    `preferences.marketing`; todo evento passa por `metaTrack`, que confere o
 *    consentimento NO MOMENTO DA AÇÃO.
 *  - O código do Pixel é gerado aqui (stub oficial `fbq` + fbevents.js por
 *    `src`); o admin informa apenas o Pixel ID numérico. Nenhum script vindo
 *    do banco é executado e o ID nunca é interpolado em código.
 *  - Fila de espera: uma ação feita COM consentimento, antes de o Pixel ser
 *    ativado (consulta das integrações ainda em curso), fica numa fila em
 *    memória e é entregue logo após o `init` + `PageView`. Ações feitas SEM
 *    consentimento nunca entram na fila — não há reenvio de ações anteriores
 *    ao aceite. A revogação esvazia a fila.
 *  - Revogação: `fbq('consent','revoke')` faz o Meta descartar os disparos
 *    seguintes (inclusive PageView automáticos de navegação SPA) até novo
 *    `fbq('consent','grant')`.
 *
 * Estados de um evento (o que este código consegue afirmar):
 *  - "blocked"    → não enviado: sem consentimento de Marketing.
 *  - "pending"    → enfileirado aqui, aguardando a ativação do Pixel.
 *  - "queued"     → entregue ao stub `fbq`, aguardando o fbevents.js carregar.
 *  - "dispatched" → entregue à biblioteca do Meta já carregada no navegador.
 *                   Ela emite a requisição quando a configuração do Pixel
 *                   termina de carregar. NÃO comprova envio nem recebimento
 *                   pelo Meta — isso só se confirma no Gerenciador de Eventos.
 *  - "failed"     → a biblioteca não carregou (bloqueador, rede) ou o evento
 *                   expirou na fila; não foi enviado.
 */
import { useCookieStore } from "@/stores/cookieStore";
import { META_PIXEL_SCRIPT_SRC, isValidIntegrationId } from "@/lib/integrationIds";

export { META_PIXEL_SCRIPT_SRC };

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  push?: unknown;
  loaded?: boolean;
  version?: string;
};

export type MetaDispatchStatus = "blocked" | "pending" | "queued" | "dispatched" | "failed";

export interface MetaTrackOptions {
  /** ID estável do evento (deduplicação no Meta, ex.: `purchase_<pedido>`). */
  eventId?: string;
  /** `trackCustom` em vez de `track` (eventos não padronizados). */
  custom?: boolean;
  /** Notificado a cada mudança de estado do evento. */
  onStatus?: (status: MetaDispatchStatus) => void;
}

interface PendingEvent {
  name: string;
  params?: Record<string, unknown>;
  opts: MetaTrackOptions;
  at: number;
}

interface LogEntry {
  name: string;
  eventId?: string;
  status: MetaDispatchStatus;
  at: string;
}

const SCRIPT_ID = "lm-meta-pixel";
const PENDING_MAX = 50;
const PENDING_TTL_MS = 2 * 60 * 1000;
const LOG_MAX = 100;

const initializedIds = new Set<string>();
let consentState: "granted" | "revoked" | "unset" = "unset";
let libraryState: "idle" | "loading" | "loaded" | "failed" = "idle";
let pending: PendingEvent[] = [];
let awaitingLibrary: Array<(s: MetaDispatchStatus) => void> = [];
const log: LogEntry[] = [];

function getWindow(): (Window & { fbq?: Fbq; _fbq?: Fbq }) | null {
  return typeof window === "undefined" ? null : (window as Window & { fbq?: Fbq; _fbq?: Fbq });
}

function marketingAllowed(): boolean {
  const { consented, preferences } = useCookieStore.getState();
  return Boolean(consented && preferences.marketing);
}

function debugEnabled(): boolean {
  try {
    return import.meta.env.DEV || window.localStorage.getItem("lm_debug_tracking") === "1";
  } catch {
    return false;
  }
}

function record(name: string, status: MetaDispatchStatus, opts: MetaTrackOptions) {
  log.push({ name, eventId: opts.eventId, status, at: new Date().toISOString() });
  if (log.length > LOG_MAX) log.shift();
  if (debugEnabled()) console.info(`[Meta] ${name} → ${status}`, opts.eventId ?? "");
  try {
    opts.onStatus?.(status);
  } catch {
    /* noop */
  }
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

function settleAwaiting(status: MetaDispatchStatus) {
  const list = awaitingLibrary;
  awaitingLibrary = [];
  for (const cb of list) cb(status);
}

function ensureLibraryScript(): void {
  if (typeof document === "undefined" || document.getElementById(SCRIPT_ID)) return;
  const s = document.createElement("script");
  s.id = SCRIPT_ID;
  s.async = true;
  s.src = META_PIXEL_SCRIPT_SRC;
  libraryState = "loading";
  s.addEventListener("load", () => {
    // O fbevents.js define `callMethod` e processa a fila do stub ao carregar.
    libraryState = "loaded";
    settleAwaiting("dispatched");
  });
  s.addEventListener("error", () => {
    // Bloqueador de anúncios, rede ou CSP: nada do que está na fila é enviado.
    libraryState = "failed";
    settleAwaiting("failed");
  });
  document.head.appendChild(s);
}

function isLibraryReady(w: Window & { fbq?: Fbq }): boolean {
  return libraryState === "loaded" || typeof w.fbq?.callMethod === "function";
}

/** Entrega o evento ao `fbq` (Pixel já inicializado). */
function deliver(w: Window & { fbq?: Fbq }, ev: PendingEvent): void {
  const fbq = w.fbq!;
  const method = ev.opts.custom ? "trackCustom" : "track";
  const extra = ev.opts.eventId ? { eventID: ev.opts.eventId } : undefined;
  if (extra) fbq(method, ev.name, ev.params ?? {}, extra);
  else fbq(method, ev.name, ev.params ?? {});

  if (isLibraryReady(w)) {
    record(ev.name, "dispatched", ev.opts);
  } else if (libraryState === "failed") {
    record(ev.name, "failed", ev.opts);
  } else {
    record(ev.name, "queued", ev.opts);
    awaitingLibrary.push((status) => record(ev.name, status, ev.opts));
  }
}

function flushPending(w: Window & { fbq?: Fbq }): void {
  const now = Date.now();
  const list = pending;
  pending = [];
  for (const ev of list) {
    if (now - ev.at > PENDING_TTL_MS) {
      record(ev.name, "failed", ev.opts);
      continue;
    }
    deliver(w, ev);
  }
}

/**
 * Envia um evento ao Meta Pixel respeitando o consentimento de Marketing.
 * Retorna o estado imediato; mudanças posteriores chegam por `opts.onStatus`.
 */
export function metaTrack(
  name: string,
  params?: Record<string, unknown>,
  opts: MetaTrackOptions = {},
): MetaDispatchStatus {
  const w = getWindow();
  if (!w) return "blocked";
  if (!marketingAllowed()) {
    record(name, "blocked", opts);
    return "blocked";
  }
  const ev: PendingEvent = { name, params, opts, at: Date.now() };
  if (initializedIds.size === 0 || typeof w.fbq !== "function" || consentState !== "granted") {
    pending.push(ev);
    if (pending.length > PENDING_MAX) {
      const dropped = pending.shift()!;
      record(dropped.name, "failed", dropped.opts);
    }
    record(name, "pending", opts);
    return "pending";
  }
  deliver(w, ev);
  return log[log.length - 1]?.status ?? "queued";
}

/**
 * Ativa o Pixel após consentimento de Marketing: concede consentimento,
 * inicializa o ID (uma vez), dispara `PageView` e entrega a fila de espera.
 * Idempotente — pode ser chamado a cada mudança de preferências.
 */
export function activateMetaPixel(pixelId: string): boolean {
  const w = getWindow();
  const id = String(pixelId ?? "").trim();
  if (!w || !isValidIntegrationId("meta_pixel", id)) return false;
  if (!marketingAllowed()) return false;

  const fbq = ensureFbqStub(w);
  if (consentState !== "granted") {
    fbq("consent", "grant");
    consentState = "granted";
  }
  if (!initializedIds.has(id)) {
    // Desliga a configuração automática do Meta (eventos de clique em botão
    // "SubscribedButtonClick" e metadados da página). Mecanismo oficial:
    // `fbq('set','autoConfig', false, <id>)` ANTES do `init` desse Pixel.
    // Os eventos explícitos do site (PageView, ViewContent, Contact...) não
    // são afetados.
    fbq("set", "autoConfig", false, id);
    fbq("init", id);
    fbq("track", "PageView");
    initializedIds.add(id);
  }
  ensureLibraryScript();
  flushPending(w);
  return true;
}

/**
 * Bloqueia novos disparos após revogação do consentimento de Marketing e
 * descarta a fila de espera (nada feito antes da revogação é reenviado depois).
 */
export function revokeMetaPixelConsent(): void {
  for (const ev of pending) record(ev.name, "blocked", ev.opts);
  pending = [];
  const w = getWindow();
  if (!w || typeof w.fbq !== "function" || consentState === "revoked") return;
  // Biblioteca ainda carregando: eventos já entregues ao stub sairiam DEPOIS
  // da revogação. Removemos da fila do stub (mantém consent/init).
  if (!isLibraryReady(w) && Array.isArray(w.fbq.queue)) {
    w.fbq.queue = w.fbq.queue.filter((args) => {
      const m = Array.isArray(args) ? args[0] : undefined;
      return m !== "track" && m !== "trackCustom";
    });
    settleAwaiting("failed");
  }
  w.fbq("consent", "revoke");
  consentState = "revoked";
}

/** Situação atual, para diagnóstico (console / testes no preview). */
export function getMetaPixelDiagnostics() {
  return {
    consentState,
    libraryState,
    initializedIds: [...initializedIds],
    pendingCount: pending.length,
    log: [...log],
  };
}

/** Somente para testes automatizados. */
export function __resetMetaPixelStateForTests(): void {
  initializedIds.clear();
  consentState = "unset";
  libraryState = "idle";
  pending = [];
  awaitingLibrary = [];
  log.length = 0;
}
