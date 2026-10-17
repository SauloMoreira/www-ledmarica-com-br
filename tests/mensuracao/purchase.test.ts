import { beforeEach, describe, expect, it } from "vitest";
import { activateMetaPixel } from "@/lib/metaPixel";
import {
  trackConfirmedPurchase,
  getMetaPurchaseRecord,
  __resetPurchaseTrackingForTests,
  type ConfirmedOrderForTracking,
} from "@/lib/purchaseTracking";
import { markGoogleTagsReady } from "@/lib/tracking";
import {
  resetAll,
  grantMarketing,
  rejectOptional,
  loadLibrary,
  failLibrary,
  sent,
  installGtag,
} from "./helpers";

const PIXEL = "1144605414568984";
markGoogleTagsReady();

const order = (paymentStatus: string | null): ConfirmedOrderForTracking => ({
  id: "11111111-1111-1111-1111-111111111111",
  orderNumber: 1042,
  total: 187.5,
  paymentStatus,
  items: [
    { productId: "prod-a", name: "Lâmpada A", qty: 3, unitPrice: 12.9 },
    { productId: "prod-b", name: "Spot B", qty: 1, unitPrice: 59 },
  ],
});

const purchases = () => sent.filter((a) => a[1] === "Purchase");
const gtagPurchases = (g: unknown[][]) =>
  g.filter((c) => c[0] === "event" && (c[1] === "purchase" || c[1] === "conversion"));

describe("Purchase só com pagamento aprovado pelo servidor", () => {
  beforeEach(() => {
    resetAll();
    __resetPurchaseTrackingForTests();
  });

  for (const st of ["pending", "in_process", "preference_created", "rejected", null]) {
    it(`status "${st}": nada é enviado (Google ou Meta)`, async () => {
      const g = installGtag();
      grantMarketing();
      activateMetaPixel(PIXEL);
      loadLibrary();
      const r = await trackConfirmedPurchase(order(st));
      expect(r).toEqual({ google: "skipped", meta: "skipped" });
      expect(purchases()).toEqual([]);
      expect(gtagPurchases(g)).toEqual([]);
      expect(
        Object.keys(localStorage).filter((k) => /^(gads_conversion_|lm_meta_purchase_)/.test(k)),
      ).toEqual([]);
    });
  }

  it("aprovado + consentimento: Meta recebe IDs de produto, quantidades, valor, moeda e eventID", async () => {
    const g = installGtag();
    grantMarketing();
    activateMetaPixel(PIXEL);
    loadLibrary();
    const r = await trackConfirmedPurchase(order("approved"));
    expect(r.meta).toBe("dispatched");
    expect(r.google).toBe("sent");
    expect(purchases()).toEqual([
      [
        "track",
        "Purchase",
        {
          content_type: "product",
          content_ids: ["prod-a", "prod-b"],
          contents: [
            { id: "prod-a", quantity: 3, item_price: 12.9 },
            { id: "prod-b", quantity: 1, item_price: 59 },
          ],
          num_items: 4,
          value: 187.5,
          currency: "BRL",
          order_id: "1042",
        },
        { eventID: "purchase_11111111-1111-1111-1111-111111111111" },
      ],
    ]);
    // Google: conversão Ads + purchase GA4 com item_id = ID do produto
    const ga = g.find((c) => c[1] === "purchase")!;
    expect((ga[2] as any).items.map((i: any) => i.item_id)).toEqual(["prod-a", "prod-b"]);
    expect((ga[2] as any).transaction_id).toBe("1042");
    expect(g.some((c) => c[1] === "conversion")).toBe(true);
    expect(getMetaPurchaseRecord(order("approved").id)!.state).toBe("dispatched");
  });

  it("recarregar/revisitar a confirmação não duplica (Meta nem Google)", async () => {
    const g = installGtag();
    grantMarketing();
    activateMetaPixel(PIXEL);
    loadLibrary();
    await trackConfirmedPurchase(order("approved"));
    await trackConfirmedPurchase(order("approved"));
    await trackConfirmedPurchase(order("paid"));
    expect(purchases()).toHaveLength(1);
    expect(gtagPurchases(g).filter((c) => c[1] === "purchase")).toHaveLength(1);
    expect(gtagPurchases(g).filter((c) => c[1] === "conversion")).toHaveLength(1);
  });

  it("chamadas simultâneas (página de retorno + página do pedido) enviam uma vez", async () => {
    installGtag();
    grantMarketing();
    activateMetaPixel(PIXEL);
    loadLibrary();
    await Promise.all([
      trackConfirmedPurchase(order("approved")),
      trackConfirmedPurchase(order("approved")),
    ]);
    expect(purchases()).toHaveLength(1);
  });

  it("Pixel ainda não ativo: fica 'pending', depois 'queued' e 'dispatched' — sem marcar enviado antes", async () => {
    installGtag();
    grantMarketing();
    const r = await trackConfirmedPurchase(order("approved"));
    expect(r.meta).toBe("pending");
    expect(getMetaPurchaseRecord(order("approved").id)!.state).toBe("pending");
    activateMetaPixel(PIXEL);
    expect(getMetaPurchaseRecord(order("approved").id)!.state).toBe("queued");
    loadLibrary();
    expect(getMetaPurchaseRecord(order("approved").id)!.state).toBe("dispatched");
    expect(purchases()).toHaveLength(1);
  });

  it("página fechada antes de o Pixel carregar: nova visita reenvia com o MESMO eventID", async () => {
    installGtag();
    grantMarketing();
    await trackConfirmedPurchase(order("approved")); // pending; página "fechada"
    // nova página
    const saved = localStorage.getItem(`lm_meta_purchase_${order("approved").id}`);
    resetAll();
    localStorage.setItem(`lm_meta_purchase_${order("approved").id}`, saved!);
    localStorage.setItem(`gads_conversion_${order("approved").id}`, "x");
    __resetPurchaseTrackingForTests();
    grantMarketing();
    activateMetaPixel(PIXEL);
    loadLibrary();
    await trackConfirmedPurchase(order("approved"));
    expect(purchases()).toHaveLength(1);
    expect(purchases()[0][3]).toEqual({
      eventID: "purchase_11111111-1111-1111-1111-111111111111",
    });
  });

  it("biblioteca do Meta bloqueada: estado 'failed', não 'enviado'", async () => {
    installGtag();
    grantMarketing();
    activateMetaPixel(PIXEL);
    await trackConfirmedPurchase(order("approved"));
    expect(getMetaPurchaseRecord(order("approved").id)!.state).toBe("queued");
    failLibrary();
    expect(getMetaPurchaseRecord(order("approved").id)!.state).toBe("failed");
  });

  it("sem consentimento de Marketing: Meta nada recebe e a compra não é reenviada após aceite posterior; Google segue (Consent Mode)", async () => {
    const g = installGtag();
    rejectOptional();
    const r = await trackConfirmedPurchase(order("approved"));
    expect(r.meta).toBe("not_consented");
    expect(r.google).toBe("sent");
    expect(gtagPurchases(g).length).toBe(2);
    // aceita depois e revisita
    grantMarketing();
    activateMetaPixel(PIXEL);
    loadLibrary();
    await trackConfirmedPurchase(order("approved"));
    expect(purchases()).toEqual([]);
  });

  it("chave do Google é gravada só DEPOIS do envio", async () => {
    // com gtag presente: a chave só existe depois dos envios ao Google
    const g = installGtag();
    grantMarketing();
    expect(localStorage.getItem(`gads_conversion_${order("approved").id}`)).toBeNull();
    await trackConfirmedPurchase(order("approved"));
    expect(gtagPurchases(g).length).toBe(2);
    expect(localStorage.getItem(`gads_conversion_${order("approved").id}`)).not.toBeNull();
  });

  it("item sem product_id (produto excluído) fica fora de content_ids, valor total preservado", async () => {
    installGtag();
    grantMarketing();
    activateMetaPixel(PIXEL);
    loadLibrary();
    const o = order("approved");
    o.items.push({ productId: null, name: "Removido", qty: 1, unitPrice: 5 });
    await trackConfirmedPurchase(o);
    const p = purchases()[0][2] as any;
    expect(p.content_ids).toEqual(["prod-a", "prod-b"]);
    expect(p.value).toBe(187.5);
  });
});

describe("Google sem gtag", () => {
  beforeEach(() => {
    resetAll();
    __resetPurchaseTrackingForTests();
  });
  it("sem gtag na página: não marca a compra como enviada ao Google", async () => {
    const r = await trackConfirmedPurchase(order("approved"));
    expect(r.google).toBe("skipped");
    expect(localStorage.getItem(`gads_conversion_${order("approved").id}`)).toBeNull();
  });
});

describe("revisões pós-revisão independente", () => {
  beforeEach(() => {
    resetAll();
    __resetPurchaseTrackingForTests();
  });

  it("mesma página: retorno do MP e depois página do pedido (sequencial) não duplicam o Purchase pendente", async () => {
    installGtag();
    grantMarketing();
    await trackConfirmedPurchase(order("approved")); // pending
    await trackConfirmedPurchase(order("approved")); // nova chamada, mesma carga de página
    activateMetaPixel(PIXEL);
    loadLibrary();
    expect(purchases()).toHaveLength(1);
  });

  it("dataLayer/TikTok recebem 'purchase' uma única vez (a chamada do Meta não duplica)", async () => {
    installGtag();
    grantMarketing();
    activateMetaPixel(PIXEL);
    loadLibrary();
    (window as any).dataLayer = [];
    const tt: unknown[][] = [];
    (window as any).ttq = { track: (...a: unknown[]) => tt.push(a) };
    await trackConfirmedPurchase(order("approved"));
    const dl = ((window as any).dataLayer as any[]).filter((e) => e && e.event === "purchase");
    expect(dl).toHaveLength(1);
    expect(dl[0].transaction_id).toBe("1042");
    expect(tt).toHaveLength(1);
    delete (window as any).ttq;
  });

  it("GA4 purchase mantém num_items (linhas do pedido) como antes", async () => {
    const g = installGtag();
    await trackConfirmedPurchase(order("approved"));
    const ga = g.find((c) => c[1] === "purchase")!;
    expect((ga[2] as any).num_items).toBe(2);
  });
});

describe("tentativa que falhou pode ser repetida", () => {
  beforeEach(() => {
    resetAll();
    __resetPurchaseTrackingForTests();
  });
  it("biblioteca bloqueada → 'failed'; nova carga de página com Pixel OK reenvia, com o mesmo eventID, e marca 'dispatched'", async () => {
    installGtag();
    grantMarketing();
    activateMetaPixel(PIXEL);
    await trackConfirmedPurchase(order("approved"));
    failLibrary();
    const rec = localStorage.getItem(`lm_meta_purchase_${order("approved").id}`)!;
    expect(JSON.parse(rec).state).toBe("failed");
    // nova carga de página
    const g = localStorage.getItem(`gads_conversion_${order("approved").id}`);
    resetAll();
    localStorage.setItem(`lm_meta_purchase_${order("approved").id}`, rec);
    if (g) localStorage.setItem(`gads_conversion_${order("approved").id}`, g);
    __resetPurchaseTrackingForTests();
    installGtag();
    grantMarketing();
    activateMetaPixel(PIXEL);
    loadLibrary();
    await trackConfirmedPurchase(order("approved"));
    expect(purchases()).toHaveLength(1);
    expect(purchases()[0][3]).toEqual({ eventID: `purchase_${order("approved").id}` });
    expect(getMetaPurchaseRecord(order("approved").id)!.state).toBe("dispatched");
  });
});
