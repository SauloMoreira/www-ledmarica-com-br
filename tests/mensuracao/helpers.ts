import { useCookieStore } from "@/stores/cookieStore";
import { __resetMetaPixelStateForTests } from "@/lib/metaPixel";

/** Chamadas que a "biblioteca do Meta" (simulada) efetivamente processou. */
export const sent: unknown[][] = [];
/** Comandos `set` (ex.: autoConfig) recebidos pela biblioteca, em ordem. */
export const sets: unknown[][] = [];

export function resetAll() {
  __resetMetaPixelStateForTests();
  sent.length = 0;
  sets.length = 0;
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  delete (window as any).fbq;
  delete (window as any)._fbq;
  delete (window as any).gtag;
  (window as any).dataLayer = [];
  localStorage.clear();
  sessionStorage.clear();
  useCookieStore.setState({
    consented: false,
    preferences: { necessary: true, analytics: false, marketing: false, personalization: false },
  });
}

export function grantMarketing() {
  useCookieStore.getState().acceptAll();
}

export function rejectOptional() {
  useCookieStore.getState().rejectOptional();
}

/** Simula o fbevents.js carregando: processa a fila do stub, com consentimento. */
export function loadLibrary() {
  const fbq = (window as any).fbq;
  let granted = true;
  const process = (args: unknown[]) => {
    if (args[0] === "set") {
      sets.push(args);
      return;
    }
    if (args[0] === "consent") {
      granted = args[1] === "grant";
      return;
    }
    if (granted) sent.push(args);
  };
  fbq.callMethod = (...args: unknown[]) => process(args);
  for (const a of fbq.queue.splice(0)) process(a as unknown[]);
  document.getElementById("lm-meta-pixel")!.dispatchEvent(new Event("load"));
}

export function failLibrary() {
  document.getElementById("lm-meta-pixel")!.dispatchEvent(new Event("error"));
}

/** Itens na fila do stub (antes da biblioteca carregar). */
export function stubQueue(): unknown[][] {
  return ((window as any).fbq?.queue ?? []) as unknown[][];
}

export function installGtag() {
  const calls: unknown[][] = [];
  (window as any).gtag = (...args: unknown[]) => calls.push(args);
  return calls;
}
