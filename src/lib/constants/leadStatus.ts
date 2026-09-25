export const LEAD_STATUSES = [
  "novo",
  "primeiro_contato",
  "em_atendimento",
  "qualificado",
  "orcamento_enviado",
  "negociacao",
  "aguardando_cliente",
  "ganhou",
  "perdido",
  "sem_resposta",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  primeiro_contato: "Primeiro contato",
  em_atendimento: "Em atendimento",
  qualificado: "Qualificado",
  orcamento_enviado: "Orçamento enviado",
  negociacao: "Negociação",
  aguardando_cliente: "Aguardando cliente",
  ganhou: "Ganhou",
  perdido: "Perdido",
  sem_resposta: "Sem resposta",
  // legados (caso ainda existam registros não migrados)
  new: "Novo",
  contacted: "Primeiro contato",
  qualified: "Qualificado",
  proposal: "Orçamento enviado",
  won: "Ganhou",
  lost: "Perdido",
};

export const LEAD_STATUS_OPTIONS = [
  { value: "all", label: "Todos os status" },
  ...LEAD_STATUSES.map((value) => ({ value, label: LEAD_STATUS_LABELS[value] })),
];

// Mapas de cor para badges/Kanban
export const LEAD_STATUS_STYLES: Record<string, string> = {
  novo: "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400",
  primeiro_contato: "bg-sky-500/15 text-sky-600 border-sky-500/30 dark:text-sky-400",
  em_atendimento: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30 dark:text-indigo-400",
  qualificado: "bg-violet-500/15 text-violet-600 border-violet-500/30 dark:text-violet-400",
  orcamento_enviado: "bg-cyan-500/15 text-cyan-600 border-cyan-500/30 dark:text-cyan-400",
  negociacao: "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400",
  aguardando_cliente: "bg-orange-500/15 text-orange-600 border-orange-500/30 dark:text-orange-400",
  ganhou: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  perdido: "bg-rose-500/15 text-rose-600 border-rose-500/30 dark:text-rose-400",
  sem_resposta: "bg-slate-500/15 text-slate-600 border-slate-500/30 dark:text-slate-400",
};

export const LEAD_ORIGIN_LABELS: Record<string, string> = {
  site: "Site",
  chat: "Chat IA",
  ai_chat: "Chat IA",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  indicacao: "Indicação",
  contact_form: "Formulário de contato",
  cadastro_empresa: "Cadastro empresa",
  b2b_showcase: "Vitrine B2B",
  b2b_negotiation: "Negociação B2B",
  checkout: "Checkout incompleto",
  abandoned_cart: "Carrinho abandonado",
  carrinho: "Carrinho (identificação)",
  produto: "Página de produto",
  campanha: "Campanha",
  outro: "Outro",
};

export const LEAD_INTERACTION_LABELS: Record<string, string> = {
  note: "Anotação",
  call: "Ligação",
  email: "E-mail",
  whatsapp: "WhatsApp",
  chat: "Chat",
  meeting: "Reunião",
  status_change: "Mudança de status",
};

export const LEAD_LOST_REASONS = [
  { value: "preco", label: "Preço" },
  { value: "prazo", label: "Prazo" },
  { value: "produto_indisponivel", label: "Produto indisponível" },
  { value: "comprou_outro_lugar", label: "Comprou em outro lugar" },
  { value: "sem_resposta", label: "Sem resposta" },
  { value: "fora_area_entrega", label: "Fora da área de entrega" },
  { value: "desistiu", label: "Desistiu" },
  { value: "outro", label: "Outro" },
];

export const LEAD_LOST_REASON_LABELS: Record<string, string> = Object.fromEntries(
  LEAD_LOST_REASONS.map((r) => [r.value, r.label]),
);

export const leadStatusLabel = (s?: string | null) => (s && LEAD_STATUS_LABELS[s]) || s || "—";

export const leadOriginLabel = (s?: string | null) => (s && LEAD_ORIGIN_LABELS[s]) || s || "—";

export const leadInteractionLabel = (s?: string | null) =>
  (s && LEAD_INTERACTION_LABELS[s]) || s || "—";

export const leadLostReasonLabel = (s?: string | null) =>
  (s && LEAD_LOST_REASON_LABELS[s]) || s || "—";

// Mapeia status legados para os novos
export function normalizeLeadStatus(s?: string | null): LeadStatus {
  if (!s) return "novo";
  const map: Record<string, LeadStatus> = {
    new: "novo",
    contacted: "primeiro_contato",
    qualified: "qualificado",
    proposal: "orcamento_enviado",
    won: "ganhou",
    lost: "perdido",
  };
  if ((LEAD_STATUSES as readonly string[]).includes(s)) return s as LeadStatus;
  return map[s] ?? "novo";
}

export const TEMPERATURE_LABELS: Record<string, string> = {
  frio: "Frio",
  morno: "Morno",
  quente: "Quente",
};

export const TEMPERATURE_STYLES: Record<string, string> = {
  frio: "bg-slate-500/15 text-slate-600 border-slate-500/30",
  morno: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  quente: "bg-rose-500/15 text-rose-600 border-rose-500/30 dark:text-rose-400",
};
