// Fonte única de formatação e cálculo de datas no padrão brasileiro.
// O SSR roda em UTC (Cloudflare); por isso TODO formato/cálculo de dia, mês
// e ano usa explicitamente o fuso de São Paulo. A gravação no banco continua
// em ISO/UTC — aqui só se trata exibição e limites de período.

export const TZ = "America/Sao_Paulo";
const DASH = "—";

type DateInput = string | number | Date | null | undefined;

const base = { timeZone: TZ, hourCycle: "h23" } as const;
const fmtDate = new Intl.DateTimeFormat("pt-BR", {
  ...base,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const fmtDateTime = new Intl.DateTimeFormat("pt-BR", {
  ...base,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const fmtTime = new Intl.DateTimeFormat("pt-BR", { ...base, hour: "2-digit", minute: "2-digit" });
const fmtLong = new Intl.DateTimeFormat("pt-BR", {
  ...base,
  day: "numeric",
  month: "long",
  year: "numeric",
});
const fmtParts = new Intl.DateTimeFormat("en-US", {
  ...base,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function toDate(v: DateInput): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateBR(v: DateInput): string {
  const d = toDate(v);
  return d ? fmtDate.format(d) : DASH;
}

export function formatDateTimeBR(v: DateInput): string {
  const d = toDate(v);
  // pt-BR insere vírgula entre data e hora; padronizamos "dd/mm/aaaa hh:mm".
  return d ? fmtDateTime.format(d).replace(",", "") : DASH;
}

export function formatTimeBR(v: DateInput): string {
  const d = toDate(v);
  return d ? fmtTime.format(d) : DASH;
}

export function formatDateLongBR(v: DateInput): string {
  const d = toDate(v);
  return d ? fmtLong.format(d) : DASH;
}

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/** Componentes de calendário/relógio da data no fuso de São Paulo. */
export function zonedPartsBR(d: Date): ZonedParts {
  const p: Record<string, number> = {};
  for (const part of fmtParts.formatToParts(d)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return {
    year: p.year,
    month: p.month,
    day: p.day,
    hour: p.hour === 24 ? 0 : p.hour,
    minute: p.minute,
    second: p.second,
  };
}

export function currentYearBR(now: Date = new Date()): number {
  return zonedPartsBR(now).year;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "AAAA-MM-DD" no fuso de São Paulo. */
export function isoDateBR(v: Date = new Date()): string {
  const p = zonedPartsBR(v);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function todayISODateBR(): string {
  return isoDateBR(new Date());
}

/** Instante UTC correspondente a um horário de parede em São Paulo. */
export function zonedTimeToUtcBR(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const p = zonedPartsBR(new Date(guess));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offset = asUtc - Math.floor(guess / 1000) * 1000;
  return new Date(guess - offset);
}

export function startOfDayBR(d: Date): Date {
  const p = zonedPartsBR(d);
  return zonedTimeToUtcBR(p.year, p.month, p.day, 0, 0, 0, 0);
}

export function endOfDayBR(d: Date): Date {
  const p = zonedPartsBR(d);
  return zonedTimeToUtcBR(p.year, p.month, p.day, 23, 59, 59, 999);
}

/** Desloca N dias de calendário (São Paulo), preservando o meio-dia local. */
export function addDaysBR(d: Date, days: number): Date {
  const p = zonedPartsBR(d);
  const t = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return zonedTimeToUtcBR(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), 12);
}

/** Início do mês (São Paulo), com deslocamento opcional de meses. */
export function startOfMonthBR(d: Date, monthOffset = 0): Date {
  const p = zonedPartsBR(d);
  const t = new Date(Date.UTC(p.year, p.month - 1 + monthOffset, 1));
  return zonedTimeToUtcBR(t.getUTCFullYear(), t.getUTCMonth() + 1, 1);
}

/** Fim do mês (São Paulo), com deslocamento opcional de meses. */
export function endOfMonthBR(d: Date, monthOffset = 0): Date {
  const p = zonedPartsBR(d);
  const t = new Date(Date.UTC(p.year, p.month + monthOffset, 0));
  return zonedTimeToUtcBR(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), 23, 59, 59, 999);
}

/**
 * Converte valor de input type="date" ("AAAA-MM-DD") para meio-dia em São
 * Paulo (evita cair no dia anterior). Outros formatos usam o parser nativo.
 */
export function parseDateInputBR(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (m) return zonedTimeToUtcBR(Number(m[1]), Number(m[2]), Number(m[3]), 12);
  return new Date(s);
}

/** Valor para input type="datetime-local" no fuso de São Paulo. */
export function toDateTimeLocalBR(d: Date): string {
  const p = zonedPartsBR(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
