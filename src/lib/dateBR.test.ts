import { describe, expect, it } from "vitest";
import { currentYearBR, endOfDayBR, formatDateBR, formatDateTimeBR, formatTimeBR, startOfDayBR } from "./dateBR";

describe("dateBR", () => {
  it("31/12 às 23:30 em São Paulo continua sendo 2026", () => {
    const d = new Date("2026-12-31T23:30:00-03:00");
    expect(currentYearBR(d)).toBe(2026);
    expect(formatDateTimeBR(d)).toBe("31/12/2026 23:30");
  });
  it("02:30 UTC de 01/01/2027 exibe 31/12/2026 23:30", () => {
    expect(formatDateTimeBR("2027-01-01T02:30:00Z")).toBe("31/12/2026 23:30");
    expect(formatDateBR("2027-01-01T02:30:00Z")).toBe("31/12/2026");
    expect(formatTimeBR("2027-01-01T02:30:00Z")).toBe("23:30");
  });
  it("entrada inválida retorna —", () => {
    expect(formatDateTimeBR("abc")).toBe("—");
    expect(formatDateBR(null)).toBe("—");
    expect(currentYearBR(new Date("2026-12-31T23:30:00-03:00"))).toBe(2026);
  });
  it("início e fim do dia no fuso de São Paulo", () => {
    const d = new Date("2027-01-01T02:30:00Z");
    expect(startOfDayBR(d).toISOString()).toBe("2026-12-31T03:00:00.000Z");
    expect(endOfDayBR(d).toISOString()).toBe("2027-01-01T02:59:59.999Z");
  });
});
