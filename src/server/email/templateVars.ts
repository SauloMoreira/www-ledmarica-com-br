// Engine pura de variáveis para os templates de e-mail transacional.
// - AVAILABLE_VARIABLES: catálogo do que o admin pode usar.
// - buildVariableContext: monta o dicionário a partir do pedido real.
// - interpolate: substitui {{var}} → valor (deixa desconhecidas literais).
// - validateTemplate: detecta variáveis desconhecidas para o editor avisar.
//
// LGPD: nenhuma variável expõe CPF, token de pagamento, dados de cartão,
// chaves internas ou snapshot bruto. Endereço completo NÃO é exposto.

import type { EmailMessageType } from "./templates";
import { formatDateBR } from "@/lib/dateBR";

export interface VariableDescriptor {
  key: string;
  label: string;
  description: string;
  /** Se vazio, vale para todos os tipos. */
  types?: EmailMessageType[];
}

export const AVAILABLE_VARIABLES: VariableDescriptor[] = [
  { key: "cliente_nome", label: "Nome do cliente", description: "Primeiro nome ou nome completo." },
  { key: "cliente_email", label: "E-mail do cliente", description: "E-mail do destinatário." },
  { key: "pedido_numero", label: "Número do pedido", description: "Ex.: 14" },
  { key: "pedido_status", label: "Status do pedido", description: "Em português, ex.: Pago" },
  { key: "pagamento_status", label: "Status do pagamento", description: "Em português." },
  { key: "pedido_total", label: "Total do pedido", description: "Formatado em BRL." },
  { key: "resumo_itens", label: "Resumo dos itens", description: "Lista curta (até 3 itens)." },
  { key: "site_url", label: "URL da loja", description: "Ex.: https://www.ledmarica.com.br" },
  { key: "pedido_url", label: "URL do pedido", description: "Link com token público." },
  {
    key: "transportadora",
    label: "Transportadora",
    description: "Nome da transportadora (se houver).",
    types: ["order_shipped"],
  },
  {
    key: "codigo_rastreio",
    label: "Código de rastreio",
    description: "Código fornecido pela transportadora.",
    types: ["order_shipped"],
  },
  {
    key: "motivo_cancelamento",
    label: "Motivo do cancelamento",
    description: "Motivo informado no admin.",
    types: ["order_cancelled"],
  },
  { key: "data_pedido", label: "Data do pedido", description: "Formato dd/mm/aaaa." },
  {
    key: "data_entrega",
    label: "Data de entrega",
    description: "Estimativa ou data real (se houver).",
    types: ["order_delivered"],
  },
];

export function variablesForType(type: EmailMessageType): VariableDescriptor[] {
  return AVAILABLE_VARIABLES.filter((v) => !v.types || v.types.includes(type));
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando pagamento",
  awaiting_payment: "Aguardando pagamento",
  confirmed: "Confirmado",
  paid: "Pago",
  preparing: "Em preparação",
  shipped: "Enviado",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  failed: "Falhou",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  preference_created: "Iniciado",
  approved: "Aprovado",
  paid: "Pago",
  in_process: "Em análise",
  in_mediation: "Em mediação",
  failed: "Falhou",
  rejected: "Recusado",
  refunded: "Reembolsado",
  charged_back: "Estornado",
  cancelled: "Cancelado",
};

function firstName(full: string | null | undefined): string {
  if (!full) return "";
  return String(full).trim().split(/\s+/)[0] || "";
}


export interface OrderForVars {
  id: string;
  order_number: number | string;
  status?: string | null;
  payment_status?: string | null;
  total?: number | string | null;
  tracking_code?: string | null;
  shipping_carrier?: string | null;
  cancelled_reason?: string | null;
  created_at?: string | null;
  delivered_at?: string | null;
  local_delivery_eta?: string | null;
  public_access_token?: string | null;
  address_snapshot?: { recipient?: string } | null;
}

export interface ProfileForVars {
  email?: string | null;
  name?: string | null;
}

export interface ItemForVars {
  product_name: string;
  qty: number;
}

export interface BuildContextOptions {
  siteUrl: string;
}

export function buildVariableContext(
  order: OrderForVars,
  profile: ProfileForVars | null,
  items: ItemForVars[],
  opts: BuildContextOptions,
): Record<string, string> {
  const customerName = firstName(profile?.name) || firstName(order.address_snapshot?.recipient);
  const tokenQuery = order.public_access_token
    ? `?token=${encodeURIComponent(order.public_access_token)}`
    : "";
  const orderUrl = `${opts.siteUrl}/pedido/${order.id}/confirmacao${tokenQuery}`;

  const itemsShort = items.slice(0, 3).map((i) => `${i.product_name} ×${i.qty}`);
  const resumoItens =
    items.length === 0
      ? "—"
      : items.length > 3
        ? `${itemsShort.join(", ")} e mais ${items.length - 3}`
        : itemsShort.join(", ");

  const status = order.status ?? "";
  const paymentStatus = order.payment_status ?? "";

  return {
    cliente_nome: customerName || "cliente",
    cliente_email: profile?.email ?? "—",
    pedido_numero: String(order.order_number),
    pedido_status: ORDER_STATUS_LABELS[status] ?? status ?? "—",
    pagamento_status: PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus ?? "—",
    pedido_total: BRL.format(Number(order.total ?? 0)),
    resumo_itens: resumoItens,
    site_url: opts.siteUrl,
    pedido_url: orderUrl,
    transportadora: order.shipping_carrier ?? "—",
    codigo_rastreio: order.tracking_code ?? "—",
    motivo_cancelamento:
      (order.cancelled_reason ?? "").trim() ||
      "Pedido cancelado conforme atualização de status no atendimento.",
    data_pedido: formatDateBR(order.created_at),
    data_entrega: formatDateBR(order.delivered_at ?? order.local_delivery_eta ?? null),
  };
}

const VAR_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function interpolate(
  text: string | null | undefined,
  context: Record<string, string>,
): { output: string; unknown: string[] } {
  if (!text) return { output: "", unknown: [] };
  const unknown = new Set<string>();
  const output = text.replace(VAR_PATTERN, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(context, name)) return context[name];
    unknown.add(name);
    return match;
  });
  return { output, unknown: Array.from(unknown) };
}

export interface TemplateOverrideFields {
  subject?: string | null;
  preheader?: string | null;
  headline?: string | null;
  intro_html?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  secondary_cta_label?: string | null;
  secondary_cta_url?: string | null;
}

const KNOWN_KEYS = new Set(AVAILABLE_VARIABLES.map((v) => v.key));

/** Lista todas as variáveis usadas no template que NÃO existem no catálogo. */
export function validateTemplate(fields: TemplateOverrideFields): { unknownVars: string[] } {
  const found = new Set<string>();
  const texts = [
    fields.subject,
    fields.preheader,
    fields.headline,
    fields.intro_html,
    fields.cta_label,
    fields.cta_url,
    fields.secondary_cta_label,
    fields.secondary_cta_url,
  ];
  for (const t of texts) {
    if (!t) continue;
    let m: RegExpExecArray | null;
    const re = new RegExp(VAR_PATTERN.source, "g");
    while ((m = re.exec(t)) !== null) {
      const name = m[1];
      if (!KNOWN_KEYS.has(name)) found.add(name);
    }
  }
  return { unknownVars: Array.from(found) };
}
