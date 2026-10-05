import { beforeEach, describe, expect, it } from "vitest";
import {
  activateMetaPixel,
  revokeMetaPixelConsent,
  getMetaPixelDiagnostics,
  metaTrack,
} from "@/lib/metaPixel";
import { trackSearch, trackViewProduct, trackEvent } from "@/lib/tracking";
import {
  resetAll,
  grantMarketing,
  rejectOptional,
  loadLibrary,
  failLibrary,
  sent,
  stubQueue,
  installGtag,
} from "./helpers";

const PIXEL = "1144605414568984";

describe("consentimento de Marketing", () => {
  beforeEach(resetAll);

  it("sem decisão de cookies: nada é enfileirado nem enviado ao Meta", () => {
    expect(metaTrack("Search", { search_string: "x" })).toBe("blocked");
    expect(activateMetaPixel(PIXEL)).toBe(false);
    expect((window as any).fbq).toBeUndefined();
    expect(document.getElementById("lm-meta-pixel")).toBeNull();
    expect(getMetaPixelDiagnostics().pendingCount).toBe(0);
  });

  it("'Apenas necessários': Pixel não carrega e eventos são bloqueados", () => {
    rejectOptional();
    trackSearch("lampada");
    expect(activateMetaPixel(PIXEL)).toBe(false);
    expect((window as any).fbq).toBeUndefined();
    expect(getMetaPixelDiagnostics().log.map((l) => l.status)).toEqual(["blocked"]);
  });

  it("GA4 continua recebendo o evento sem consentimento (Consent Mode)", () => {
    const g = installGtag();
    trackSearch("lampada");
    expect(g).toEqual([["event", "search", { search_string: "lampada" }]]);
  });

  it("ações ANTERIORES ao aceite não são reenviadas depois do aceite", () => {
    trackSearch("antes-do-aceite");
    grantMarketing();
    activateMetaPixel(PIXEL);
    loadLibrary();
    const names = sent.map((a) => a[1]);
    expect(names).toEqual([PIXEL, "PageView"]);
    expect(sent.some((a) => a[1] === "Search")).toBe(false);
  });
});

describe("fila até o Pixel ficar pronto", () => {
  beforeEach(resetAll);

  it("evento feito com consentimento antes da ativação é entregue após init + PageView", () => {
    grantMarketing();
    const st = metaTrack("ViewContent", { content_ids: ["p1"] });
    expect(st).toBe("pending");
    activateMetaPixel(PIXEL);
    // ordem na fila do stub: consent grant, init, PageView, ViewContent
    const q = stubQueue().map((a) => `${a[0]}:${a[1]}`);
    expect(q).toEqual([
      "consent:grant",
      "set:autoConfig",
      `init:${PIXEL}`,
      "track:PageView",
      "track:ViewContent",
    ]);
    loadLibrary();
    expect(sent.map((a) => a[1])).toEqual([PIXEL, "PageView", "ViewContent"]);
    const statuses = getMetaPixelDiagnostics().log.filter((l) => l.name === "ViewContent");
    expect(statuses.map((s) => s.status)).toEqual(["pending", "queued", "dispatched"]);
  });

  it("após a biblioteca carregar, novos eventos saem como 'dispatched'", () => {
    grantMarketing();
    activateMetaPixel(PIXEL);
    loadLibrary();
    expect(metaTrack("Search", { search_string: "x" })).toBe("dispatched");
    expect(sent.at(-1)).toEqual(["track", "Search", { search_string: "x" }]);
  });

  it("biblioteca bloqueada (ex.: extensão): eventos ficam 'failed', nunca 'dispatched'", () => {
    grantMarketing();
    activateMetaPixel(PIXEL);
    metaTrack("Search", { search_string: "x" });
    failLibrary();
    const s = getMetaPixelDiagnostics();
    expect(s.libraryState).toBe("failed");
    expect(s.log.filter((l) => l.name === "Search").map((l) => l.status)).toEqual([
      "queued",
      "failed",
    ]);
    expect(metaTrack("Lead", {})).toBe("failed");
    expect(sent).toEqual([]);
  });

  it("eventID é repassado ao fbq", () => {
    grantMarketing();
    activateMetaPixel(PIXEL);
    loadLibrary();
    metaTrack("Purchase", { value: 10 }, { eventId: "purchase_abc" });
    expect(sent.at(-1)).toEqual(["track", "Purchase", { value: 10 }, { eventID: "purchase_abc" }]);
  });

  it("eventos custom usam trackCustom", () => {
    grantMarketing();
    activateMetaPixel(PIXEL);
    loadLibrary();
    trackEvent("newsletter_signup", { signup_origin: "home" });
    expect(sent.at(-1)).toEqual(["trackCustom", "NewsletterSignup", { signup_origin: "home" }]);
  });
});

describe("revogação", () => {
  beforeEach(resetAll);

  it("revogar esvazia a fila de espera: nada pendente é enviado depois", () => {
    grantMarketing();
    metaTrack("ViewContent", { content_ids: ["p1"] });
    useCookieStoreRevoke();
    revokeMetaPixelConsent();
    grantMarketing();
    activateMetaPixel(PIXEL);
    loadLibrary();
    expect(sent.some((a) => a[1] === "ViewContent")).toBe(false);
  });

  it("após revogar, novos eventos são bloqueados e o fbq recebe consent revoke", () => {
    grantMarketing();
    activateMetaPixel(PIXEL);
    loadLibrary();
    sent.length = 0;
    useCookieStoreRevoke();
    revokeMetaPixelConsent();
    expect(metaTrack("Search", {})).toBe("blocked");
    trackViewProduct({ id: "p1", name: "Lâmpada", price: 10 });
    expect(sent).toEqual([]);
    expect(getMetaPixelDiagnostics().consentState).toBe("revoked");
  });
});

describe("revogação com a biblioteca ainda carregando", () => {
  beforeEach(resetAll);
  it("eventos já no stub são removidos antes do revoke; consent/init permanecem", () => {
    grantMarketing();
    activateMetaPixel(PIXEL);
    metaTrack("Search", { search_string: "x" });
    useCookieStoreRevoke();
    revokeMetaPixelConsent();
    const q = stubQueue().map((a) => `${a[0]}:${a[1]}`);
    expect(q).toEqual(["consent:grant", "set:autoConfig", `init:${PIXEL}`, "consent:revoke"]);
    loadLibrary();
    expect(sent.filter((a) => a[0] === "track")).toEqual([]);
    const st = getMetaPixelDiagnostics()
      .log.filter((l) => l.name === "Search")
      .map((l) => l.status);
    expect(st).toEqual(["queued", "failed"]);
  });
});

import { useCookieStore } from "@/stores/cookieStore";
function useCookieStoreRevoke() {
  useCookieStore.getState().savePreferences({ marketing: false });
}

describe("configuração automática do Meta (SubscribedButtonClick)", () => {
  beforeEach(resetAll);
  it("autoConfig=false é enviado ANTES do init, para o Pixel certo, uma única vez", async () => {
    const { sets } = await import("./helpers");
    grantMarketing();
    activateMetaPixel(PIXEL);
    activateMetaPixel(PIXEL); // reativação (mudança de preferências) não repete
    const q = stubQueue().map((a) => a.slice(0, 4));
    const iSet = q.findIndex((a) => a[0] === "set");
    const iInit = q.findIndex((a) => a[0] === "init");
    expect(q[iSet]).toEqual(["set", "autoConfig", false, PIXEL]);
    expect(iSet).toBeGreaterThan(-1);
    expect(iSet).toBeLessThan(iInit);
    expect(q.filter((a) => a[0] === "set")).toHaveLength(1);
    loadLibrary();
    expect(sets).toEqual([["set", "autoConfig", false, PIXEL]]);
  });
});
