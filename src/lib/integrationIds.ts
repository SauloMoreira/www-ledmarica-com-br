/**
 * Regras de validação dos IDs públicos das integrações de marketing.
 *
 * Fonte única usada por: server functions (salvar/testar), tela de admin,
 * carregador da loja (ConditionalScripts) e painel de pendências. Módulo puro
 * (sem dependências de runtime) — pode ser importado no client e no server.
 */

export type IntegrationProvider =
  | "ga4"
  | "gtm"
  | "meta_pixel"
  | "tiktok_pixel"
  | "clarity"
  | "google_ads";

export const INTEGRATION_ID_PATTERNS: Record<IntegrationProvider, RegExp> = {
  ga4: /^G-[A-Z0-9]{6,}$/i,
  gtm: /^GTM-[A-Z0-9]{4,}$/i,
  // Pixel ID do Meta: número de 15 ou 16 dígitos (Gerenciador de Eventos → Fontes de dados).
  meta_pixel: /^[0-9]{15,16}$/,
  tiktok_pixel: /^[A-Z0-9]{15,30}$/i,
  clarity: /^[a-z0-9]{6,20}$/i,
  google_ads: /^AW-[0-9]{6,}$/i,
};

/** Biblioteca oficial do Meta que inicializa o Pixel (carregada só após consentimento). */
export const META_PIXEL_SCRIPT_SRC = "https://connect.facebook.net/en_US/fbevents.js";

/** Provedores que, por regra, só podem rodar sob consentimento de Marketing. */
export const MARKETING_ONLY_PROVIDERS: ReadonlySet<IntegrationProvider> = new Set(["meta_pixel"]);

/** Detecta tentativa de colar script/HTML no lugar do ID. */
export function looksLikeScript(value: string): boolean {
  return /[<>(){};'"`]|script|javascript:|fbq|on\w+=|https?:\/\//i.test(value);
}

export function isValidIntegrationId(provider: IntegrationProvider, accountId: string): boolean {
  const pattern = INTEGRATION_ID_PATTERNS[provider];
  return !!pattern && pattern.test(String(accountId ?? "").trim());
}

/** Integração "efetiva": ativa e com ID em formato válido. */
export function isEffectiveIntegration(row: {
  provider: string;
  account_id: string;
  enabled: boolean;
}): boolean {
  return (
    row.enabled &&
    row.provider in INTEGRATION_ID_PATTERNS &&
    isValidIntegrationId(row.provider as IntegrationProvider, row.account_id)
  );
}
