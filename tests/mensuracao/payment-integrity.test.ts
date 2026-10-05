import { describe, expect, it } from "vitest";
import { evaluateMpApproval } from "@/lib/paymentIntegrity";

describe("webhook do MP: só marca pago com status aprovado E valor igual ao total", () => {
  it("aprovado e valor igual → pago", () => {
    expect(
      evaluateMpApproval({ mpStatus: "approved", transactionAmount: 187.5, orderTotal: "187.50" }),
    ).toMatchObject({ willBePaid: true, amountMismatch: false });
  });
  it("aprovado com diferença de centavos dentro da tolerância → pago", () => {
    expect(
      evaluateMpApproval({ mpStatus: "approved", transactionAmount: 187.46, orderTotal: 187.5 })
        .willBePaid,
    ).toBe(true);
  });
  it("aprovado mas valor menor que o pedido → NÃO pago (em análise)", () => {
    expect(
      evaluateMpApproval({ mpStatus: "approved", transactionAmount: 0.01, orderTotal: 187.5 }),
    ).toMatchObject({ willBePaid: false, amountMismatch: true });
  });
  it("aprovado sem valor informado → NÃO pago", () => {
    expect(
      evaluateMpApproval({ mpStatus: "approved", transactionAmount: null, orderTotal: 187.5 })
        .willBePaid,
    ).toBe(false);
  });
  it("pendente/recusado → não pago e sem divergência", () => {
    for (const s of ["pending", "in_process", "rejected", undefined]) {
      expect(
        evaluateMpApproval({ mpStatus: s, transactionAmount: 187.5, orderTotal: 187.5 }),
      ).toMatchObject({ willBePaid: false, amountMismatch: false });
    }
  });
});
