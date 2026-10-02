import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logAdminAction } from "@/server/security/auditLog";
import {
  INTEGRATION_ID_PATTERNS,
  MARKETING_ONLY_PROVIDERS,
  META_PIXEL_SCRIPT_SRC,
  looksLikeScript,
  type IntegrationProvider,
} from "@/lib/integrationIds";

export type { IntegrationProvider };

export type ConsentCategory = "analytics" | "marketing";

export interface MarketingIntegration {
  id: string;
  provider: IntegrationProvider;
  account_id: string;
  enabled: boolean;
  consent_category: ConsentCategory;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const PROVIDERS = ["ga4", "gtm", "meta_pixel", "tiktok_pixel", "clarity", "google_ads"] as const;
const CATEGORIES = ["analytics", "marketing"] as const;

// Validação por provider para evitar IDs malformados (fonte única em @/lib/integrationIds)
const ID_PATTERNS = INTEGRATION_ID_PATTERNS;

function validateAccountId(provider: IntegrationProvider, accountId: string): string {
  const cleaned = accountId.trim();
  if (!cleaned) throw new Error("ID da conta é obrigatório");
  if (cleaned.length > 80) throw new Error("ID muito longo");
  // bloqueio defensivo contra colagem de scripts
  if (looksLikeScript(cleaned)) {
    throw new Error("Informe apenas o ID oficial. Scripts personalizados não são permitidos.");
  }
  const pattern = ID_PATTERNS[provider];
  if (!pattern.test(cleaned)) {
    if (provider === "meta_pixel") {
      throw new Error("Pixel ID inválido: informe apenas os 15 ou 16 dígitos do Pixel do Meta.");
    }
    throw new Error(`Formato de ID inválido para ${provider}`);
  }
  return cleaned;
}

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  provider: z.enum(PROVIDERS),
  account_id: z.string().min(1).max(80),
  enabled: z.boolean().default(true),
  consent_category: z.enum(CATEGORIES).default("analytics"),
  notes: z.string().max(500).nullable().optional(),
});

/** Lista pública de integrações ativas (consumida pelo ConditionalScripts no front da loja). */
export const listPublicIntegrations = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("marketing_integrations")
    .select("id, provider, account_id, consent_category")
    .eq("enabled", true);
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    provider: IntegrationProvider;
    account_id: string;
    consent_category: ConsentCategory;
  }>;
});

/**
 * Lista completa para o admin (inclui `notes`, `created_at`, `updated_at`).
 *
 * Lê com service role atrás de `requireAdmin` (admin + MFA/AAL2), no mesmo
 * padrão de upsert/delete/test. Não usa o cliente do usuário porque a
 * migration 20260717200000 restringiu o SELECT de anon/authenticated às
 * colunas públicas (id, provider, account_id, enabled, consent_category) —
 * um `select("*")` com a role authenticated falha com 42501.
 */
export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("marketing_integrations")
      .select("*")
      .order("provider", { ascending: true });
    if (error) throw error;
    return (data ?? []) as MarketingIntegration[];
  });

export const upsertIntegration = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const account_id = validateAccountId(data.provider, data.account_id);
    // Pixels de anúncio só podem rodar sob consentimento de Marketing (LGPD).
    if (MARKETING_ONLY_PROVIDERS.has(data.provider) && data.consent_category !== "marketing") {
      throw new Error("Esta integração exige a categoria de consentimento Marketing.");
    }

    const payload = {
      provider: data.provider,
      account_id,
      enabled: data.enabled,
      consent_category: data.consent_category,
      notes: data.notes ?? null,
    };

    let before: MarketingIntegration | null = null;
    if (data.id) {
      const { data: prev } = await supabaseAdmin
        .from("marketing_integrations")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      before = (prev as MarketingIntegration | null) ?? null;
    }

    let row: MarketingIntegration;
    if (data.id) {
      const { data: updated, error } = await supabaseAdmin
        .from("marketing_integrations")
        .update(payload)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw error;
      row = updated as MarketingIntegration;
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("marketing_integrations")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      row = inserted as MarketingIntegration;
    }

    // Auditoria — não loga IDs sensíveis em texto, apenas mascara para confirmação visual
    try {
      const masked =
        row.account_id.length > 6
          ? `${row.account_id.slice(0, 4)}…${row.account_id.slice(-2)}`
          : row.account_id;
      await logAdminAction({
        adminId: (context as { adminUserId: string }).adminUserId,
        adminEmail: (context as { adminEmail: string | null }).adminEmail,
        action: data.id ? "update" : "create",
        resourceType: "marketing_integration",
        resourceId: row.id,
        description: `${data.id ? "Atualizou" : "Criou"} integração ${row.provider} (${masked}) — ${row.enabled ? "ativa" : "inativa"}`,
        before: before
          ? {
              provider: before.provider,
              enabled: before.enabled,
              consent_category: before.consent_category,
            }
          : null,
        after: {
          provider: row.provider,
          enabled: row.enabled,
          consent_category: row.consent_category,
        },
      });
    } catch {
      // auditoria nunca quebra a operação principal
    }

    return row;
  });

export const deleteIntegration = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: prev } = await supabaseAdmin
      .from("marketing_integrations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("marketing_integrations").delete().eq("id", data.id);
    if (error) throw error;

    try {
      await logAdminAction({
        adminId: (context as { adminUserId: string }).adminUserId,
        adminEmail: (context as { adminEmail: string | null }).adminEmail,
        action: "delete",
        resourceType: "marketing_integration",
        resourceId: data.id,
        description: prev
          ? `Removeu integração ${(prev as MarketingIntegration).provider}`
          : "Removeu integração",
        before: prev
          ? {
              provider: (prev as MarketingIntegration).provider,
              enabled: (prev as MarketingIntegration).enabled,
              consent_category: (prev as MarketingIntegration).consent_category,
            }
          : null,
        after: null,
      });
    } catch {
      // ignore
    }

    return { ok: true };
  });

/**
 * "Testar configuração" — verificação leve no servidor:
 *  - confirma que o ID atende ao formato esperado;
 *  - tenta um GET no endpoint público do provedor (quando faz sentido)
 *    apenas para confirmar que o ID resolve (status 2xx/3xx);
 *  - falhas de rede não invalidam a integração — retorna `reachable: 'unknown'`.
 *
 * Não envia eventos de produção e não persiste nada além de auditoria.
 */
export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await supabaseAdmin
      .from("marketing_integrations")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error("Integração não encontrada");

    const integ = row as MarketingIntegration;
    const formatOk = ID_PATTERNS[integ.provider].test(integ.account_id.trim());
    const consentOk =
      !MARKETING_ONLY_PROVIDERS.has(integ.provider) || integ.consent_category === "marketing";

    let reachable: "ok" | "unknown" | "failed" = "unknown";
    let detail = "";
    if (formatOk)
      try {
        const ac = encodeURIComponent(integ.account_id.trim());
        let url: string | null = null;
        switch (integ.provider) {
          case "ga4":
          case "google_ads":
            url = `https://www.googletagmanager.com/gtag/js?id=${ac}`;
            break;
          case "gtm":
            url = `https://www.googletagmanager.com/gtm.js?id=${ac}`;
            break;
          case "clarity":
            url = `https://www.clarity.ms/tag/${ac}`;
            break;
          case "meta_pixel":
            // Confirma que a biblioteca oficial (fbevents.js) que inicializa o
            // Pixel está disponível. A existência do Pixel na conta do Meta só é
            // confirmável no Gerenciador de Eventos (aba "Testar eventos").
            url = META_PIXEL_SCRIPT_SRC;
            break;
          // TikTok Pixel não expõe endpoint simples sem inicialização JS;
          // mantemos como "unknown" e validamos apenas o formato.
          default:
            url = null;
        }
        if (url) {
          const resp = await fetch(url, { method: "GET" });
          if (resp.ok) {
            reachable = "ok";
          } else {
            reachable = "failed";
            detail = `HTTP ${resp.status}`;
          }
        }
      } catch (e: any) {
        reachable = "unknown";
        detail = e?.message ?? "";
      }

    try {
      await logAdminAction({
        adminId: (context as { adminUserId: string }).adminUserId,
        adminEmail: (context as { adminEmail: string | null }).adminEmail,
        action: "test",
        resourceType: "marketing_integration",
        resourceId: integ.id,
        description: `Testou integração ${integ.provider} — formato:${formatOk ? "ok" : "invalido"} consentimento:${consentOk ? "ok" : "incorreto"} alcance:${reachable}`,
      });
    } catch {
      // ignore
    }

    return { formatOk, consentOk, reachable, detail, provider: integ.provider };
  });
