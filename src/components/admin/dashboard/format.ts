import { formatDateTimeBR } from "@/lib/dateBR";
/**
 * Helpers de formatação para o dashboard administrativo.
 */
export const fmtBRL = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtInt = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export const fmtPct = (n: number) => `${(Number(n || 0) * 100).toFixed(1)}%`;

export const fmtDayShort = (iso: string) => {
  // iso = YYYY-MM-DD (vindo do backend, sem timezone)
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

export const fmtDateTime = (iso: string) => {
  return formatDateTimeBR(iso);
};

/**
 * Mapas de tradução pt-BR para status (rótulos amigáveis nos gráficos).
 */
export const orderStatusPtBR: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  preparing: "Em preparo",
  processing: "Processando",
  shipped: "Enviado",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  completed: "Concluído",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  unknown: "Desconhecido",
};

export const paymentStatusPtBR: Record<string, string> = {
  approved: "Aprovado",
  paid: "Pago",
  pending: "Pendente",
  in_process: "Em processamento",
  preference_created: "Aguardando pagamento",
  rejected: "Recusado",
  cancelled: "Cancelado",
  failed: "Falhou",
  refunded: "Reembolsado",
  charged_back: "Chargeback",
  unknown: "Desconhecido",
};

/**
 * Paleta acessível para gráficos de pizza/barra.
 * Usa tokens semânticos quando faz sentido + cores neutras.
 */
export const CHART_COLORS = [
  "hsl(var(--primary))",
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#f97316", // orange
  "#a855f7", // purple
  "#84cc16", // lime
  "#06b6d4", // cyan
];
