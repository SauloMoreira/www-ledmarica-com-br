import { lazy, Suspense, useEffect, useState } from "react";
import { installWhatsAppClickTracking } from "@/lib/whatsappTracking";

const CookieBanner = lazy(() =>
  import("@/components/lgpd/CookieBanner").then((module) => ({ default: module.CookieBanner })),
);
const CookiePreferencesModal = lazy(() =>
  import("@/components/lgpd/CookiePreferencesModal").then((module) => ({
    default: module.CookiePreferencesModal,
  })),
);
const ConditionalScripts = lazy(() =>
  import("@/components/lgpd/ConditionalScripts").then((module) => ({
    default: module.ConditionalScripts,
  })),
);

export function LgpdLayer() {
  const [enabled, setEnabled] = useState(false);

  // Cliques em WhatsApp: listener leve, instalado já na montagem (não espera o
  // idle) para não perder cliques rápidos. O envio ao Meta continua sujeito ao
  // consentimento de Marketing.
  useEffect(() => installWhatsAppClickTracking(), []);

  useEffect(() => {
    let idleId: number | null = null;
    let timeoutId: number | null = null;

    const activateWhenIdle = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(() => setEnabled(true), { timeout: 1200 });
        return;
      }

      timeoutId = window.setTimeout(() => setEnabled(true), 500);
    };

    if (document.readyState === "complete") {
      activateWhenIdle();
    } else {
      window.addEventListener("load", activateWhenIdle, { once: true });
    }

    return () => {
      window.removeEventListener("load", activateWhenIdle);
      if (idleId !== null) window.cancelIdleCallback(idleId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, []);

  if (!enabled) return null;

  return (
    <Suspense fallback={null}>
      <CookieBanner />
      <CookiePreferencesModal />
      <ConditionalScripts />
    </Suspense>
  );
}
