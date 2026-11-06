import { describe, expect, it } from "vitest";
import { computeQuoteTotals, effectiveQuoteStatus, marginAlert } from "./quotes";

describe("computeQuoteTotals", () => {
  it("aplica desconto de item, comercial, frete e PIX conforme a fórmula", () => {
    const t = computeQuoteTotals({
      items: [
        { quantity: 10, unit_price: 20, discount_pct: 10 }, // 180
        { quantity: 2, unit_price: 50, discount_pct: 0 }, // 100
      ],
      commercial_discount_pct: 5,
      freight_amount: 30,
      pix_discount_pct: 5,
    });
    expect(t.subtotal_gross).toBe(300);
    expect(t.items_discount_total).toBe(20);
    expect(t.commercial_discount_amount).toBe(14);
    expect(t.total).toBe(296); // 280 - 14 + 30
    expect(t.total_pix).toBe(282.7); // 266 * 0.95 + 30
  });
});

describe("effectiveQuoteStatus", () => {
  it("rascunho vencido vira expirado; aprovado não", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(effectiveQuoteStatus("rascunho", past)).toBe("expirado");
    expect(effectiveQuoteStatus("aprovado", past)).toBe("aprovado");
  });
});

describe("marginAlert", () => {
  it("abaixo do custo e abaixo da margem mínima", () => {
    expect(marginAlert(9, 10, 20)).toBe("below_cost");
    expect(marginAlert(11, 10, 20)).toBe("below_min_margin");
    expect(marginAlert(12, 10, 20)).toBeNull();
  });
});
