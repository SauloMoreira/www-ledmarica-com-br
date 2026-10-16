// =============================================================================
// Identificadores de anúncio lidos no checkout para as conversões pelo servidor
// (ver src/server/adConversions.server.ts).
//
// Só lê cookies que o próprio site já grava (_fbp/_fbc do Meta Pixel, _ga/_ga_*
// do GA4) e o consentimento LGPD do banner. Não cria cookie nem identificador.
// Sem consentimento da categoria, o identificador correspondente não é enviado.
// =============================================================================

import { useCookieStore } from "@/stores/cookieStore";

export interface AdAttributionPayload {
  consent_analytics: boolean;
  consent_marketing: boolean;
  fbp?: string | null;
  fbc?: string | null;
  ga_client_id?: string | null;
  ga_session_id?: string | null;
  event_source_url?: string | null;
}

function readCookie(name: string): string | null {
  try {
    const parts = document.cookie ? document.cookie.split("; ") : [];
    for (const p of parts) {
      const i = p.indexOf("=");
      if (i > 0 && p.slice(0, i) === name) return decodeURIComponent(p.slice(i + 1));
    }
  } catch {
    /* noop */
  }
  return null;
}

/** _ga = "GA1.1.<rand>.<ts>" → client_id "<rand>.<ts>". */
function gaClientId(): string | null {
  const v = readCookie("_ga");
  if (!v) return null;
  const parts = v.split(".");
  return parts.length >= 4 ? `${parts[2]}.${parts[3]}` : null;
}

/**
 * _ga_<ID> guarda a sessão atual. Formatos conhecidos:
 *   "GS1.1.<session_id>.<n>.…"  e  "GS2.1.s<session_id>$o<n>$…"
 */
function gaSessionId(): string | null {
  try {
    const parts = document.cookie ? document.cookie.split("; ") : [];
    for (const p of parts) {
      if (!p.startsWith("_ga_")) continue;
      const v = decodeURIComponent(p.slice(p.indexOf("=") + 1));
      const gs2 = v.match(/^GS2\.\d+\.s(\d+)/);
      if (gs2) return gs2[1];
      const gs1 = v.match(/^GS1\.\d+\.(\d+)\./);
      if (gs1) return gs1[1];
    }
  } catch {
    /* noop */
  }
  return null;
}

export function getAdAttributionPayload(): AdAttributionPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const { consented, preferences } = useCookieStore.getState();
    const analytics = Boolean(consented && preferences.analytics);
    const marketing = Boolean(consented && preferences.marketing);
    return {
      consent_analytics: analytics,
      consent_marketing: marketing,
      fbp: marketing ? readCookie("_fbp") : null,
      fbc: marketing ? readCookie("_fbc") : null,
      ga_client_id: analytics ? gaClientId() : null,
      ga_session_id: analytics ? gaSessionId() : null,
      event_source_url: `${window.location.origin}${window.location.pathname}`,
    };
  } catch {
    return null;
  }
}
