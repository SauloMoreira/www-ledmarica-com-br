import { beforeEach, describe, expect, it } from "vitest";
import { activateMetaPixel } from "@/lib/metaPixel";
import {
  trackViewProduct,
  trackAddToCart,
  trackBeginCheckout,
  trackLeadCaptured,
  trackNewsletterSignup,
  trackEvent,
} from "@/lib/tracking";
import {
  installWhatsAppClickTracking,
  __resetWhatsAppTrackingForTests,
} from "@/lib/whatsappTracking";
import {
  resetAll,
  grantMarketing,
  rejectOptional,
  loadLibrary,
  sent,
  installGtag,
} from "./helpers";

const PIXEL = "1144605414568984";

function ready() {
  grantMarketing();
  activateMetaPixel(PIXEL);
  loadLibrary();
  sent.length = 0;
}

describe("mesmo ID de produto em ViewContent e AddToCart", () => {
  beforeEach(resetAll);

  it("ViewContent e AddToCart usam products.id com quantidade, valor e BRL", () => {
    ready();
    trackViewProduct({ id: "prod-a", name: "Lâmpada A", price: 15, sale_price: 12.9 });
    trackAddToCart({ id: "prod-a", name: "Lâmpada A", unitPrice: 12.9 }, 3);
    const [vc, atc] = sent;
    expect(vc[1]).toBe("ViewContent");
    expect((vc[2] as any).content_ids).toEqual(["prod-a"]);
    expect((vc[2] as any).value).toBe(12.9);
    expect((vc[2] as any).currency).toBe("BRL");
    expect(atc[1]).toBe("AddToCart");
    expect(atc[2]).toMatchObject({
      content_ids: ["prod-a"],
      contents: [{ id: "prod-a", quantity: 3, item_price: 12.9 }],
      num_items: 3,
      value: 38.7,
      currency: "BRL",
    });
  });

  it("AddToCart com preço B2B usa o preço gravado no carrinho", () => {
    ready();
    trackAddToCart({ id: "prod-b", name: "Cabo", unitPrice: 4.5 }, 10);
    expect(sent[0][2]).toMatchObject({
      value: 45,
      contents: [{ id: "prod-b", quantity: 10, item_price: 4.5 }],
    });
  });

  it("quantidade inválida não dispara", () => {
    ready();
    trackAddToCart({ id: "prod-b", name: "Cabo", unitPrice: 4.5 }, 0);
    expect(sent).toEqual([]);
  });
});

describe("InitiateCheckout sem duplicidade", () => {
  beforeEach(resetAll);
  const lines = [
    { productId: "prod-a", qty: 2, unitPrice: 10 },
    { productId: "prod-b", qty: 1, unitPrice: 5 },
  ];

  it("recarregar /checkout com o mesmo carrinho não repete", () => {
    ready();
    expect(trackBeginCheckout(lines, 25)).toBe(true);
    expect(trackBeginCheckout([...lines].reverse(), 25)).toBe(false);
    expect(sent.filter((a) => a[1] === "InitiateCheckout")).toHaveLength(1);
    expect(sent[0][2]).toMatchObject({
      num_items: 3,
      value: 25,
      content_ids: ["prod-a", "prod-b"],
    });
  });

  it("carrinho alterado conta como novo início de checkout", () => {
    ready();
    trackBeginCheckout(lines, 25);
    trackBeginCheckout([{ productId: "prod-a", qty: 3, unitPrice: 10 }], 30);
    expect(sent.filter((a) => a[1] === "InitiateCheckout")).toHaveLength(2);
  });
});

describe("WhatsApp → Contact com origem", () => {
  let uninstall: () => void = () => {};
  beforeEach(() => {
    resetAll();
    __resetWhatsAppTrackingForTests();
    uninstall();
    uninstall = installWhatsAppClickTracking();
  });

  function link(html: string) {
    document.body.innerHTML = html;
    const a = document.querySelector("a")!;
    a.addEventListener("click", (e) => e.preventDefault()); // não navegar no jsdom
    return a;
  }

  it("clique com data-wa-origin envia Contact com a origem (não Lead)", () => {
    ready();
    link(
      '<a href="https://wa.me/5521982126467" data-wa-origin="rodape"><button>WhatsApp</button></a>',
    );
    document.querySelector("button")!.click();
    expect(sent).toEqual([
      ["track", "Contact", { contact_channel: "whatsapp", contact_origin: "rodape" }],
    ]);
    expect(sent.some((a) => a[1] === "Lead")).toBe(false);
  });

  it("sem atributo: origem pelo caminho da página; links whatsapp:// também contam", () => {
    ready();
    link('<a href="whatsapp://send?phone=55">app</a>');
    document.querySelector("a")!.click();
    expect((sent[0][2] as any).contact_origin).toMatch(/^pagina:/);
  });

  it("duplo clique no mesmo botão conta uma vez", () => {
    ready();
    const a = link('<a href="https://wa.me/55" data-wa-origin="contato">x</a>');
    a.click();
    a.click();
    expect(sent).toHaveLength(1);
  });

  it("sem consentimento de Marketing: nada vai ao Meta", () => {
    rejectOptional();
    const a = link('<a href="https://wa.me/55" data-wa-origin="contato">x</a>');
    a.click();
    expect(sent).toEqual([]);
    expect((window as any).fbq).toBeUndefined();
  });

  it("clique antes do aceite e logo após o aceite: o segundo é contado", async () => {
    rejectOptional();
    const a = link('<a href="https://wa.me/55" data-wa-origin="contato">x</a>');
    a.click();
    grantMarketing();
    activateMetaPixel(PIXEL);
    loadLibrary();
    sent.length = 0;
    a.click();
    expect(sent.map((x) => x[1])).toEqual(["Contact"]);
  });

  it("links que não são de WhatsApp são ignorados", () => {
    ready();
    const a = link('<a href="https://instagram.com/ledmarica">ig</a>');
    a.click();
    expect(sent).toEqual([]);
  });
});

describe("Lead x cadastro x newsletter", () => {
  beforeEach(resetAll);

  it("Lead leva a origem; newsletter é NewsletterSignup (custom); conta é CompleteRegistration", () => {
    ready();
    trackLeadCaptured("contact_form");
    trackNewsletterSignup("site");
    trackEvent("sign_up", { method: "email" });
    expect(sent).toEqual([
      ["track", "Lead", { lead_origin: "contact_form" }],
      ["trackCustom", "NewsletterSignup", { signup_origin: "site" }],
      ["track", "CompleteRegistration", { method: "email" }],
    ]);
  });

  it("GA4 recebe os eventos com nomes próprios", () => {
    const g = installGtag();
    trackLeadCaptured("b2b_company_signup");
    trackNewsletterSignup();
    expect(g.map((c) => c[1])).toEqual(["lead_captured", "newsletter_signup"]);
  });
});
