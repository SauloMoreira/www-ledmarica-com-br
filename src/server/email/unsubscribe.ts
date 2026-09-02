// Opt-out de e-mails promocionais (hoje: recuperação de carrinho).
// Server-only — usa service_role. Nunca importar no client.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function siteUrl(): string {
  return (process.env.SITE_URL ?? "").replace(/\/$/, "") || "https://www.ledmarica.com.br";
}

export function normalizeEmail(email: string): string {
  return (email ?? "").trim().toLowerCase();
}

/** True quando o e-mail já pediu para não receber mais mensagens promocionais. */
export async function isUnsubscribed(email: string): Promise<boolean> {
  const e = normalizeEmail(email);
  if (!e) return true;
  const { data } = await supabaseAdmin
    .from("email_unsubscribes")
    .select("unsubscribed_at")
    .eq("email", e)
    .maybeSingle();
  return Boolean(data?.unsubscribed_at);
}

/**
 * Garante que exista um token de descadastro para o e-mail e devolve o link público.
 * Não marca opt-out — apenas cria/recupera o token.
 */
export async function getUnsubscribeUrl(email: string, source?: string): Promise<string | null> {
  const e = normalizeEmail(email);
  if (!e) return null;

  const { data: existing } = await supabaseAdmin
    .from("email_unsubscribes")
    .select("token")
    .eq("email", e)
    .maybeSingle();

  let token = existing?.token ?? null;
  if (!token) {
    const { data: inserted, error } = await supabaseAdmin
      .from("email_unsubscribes")
      .insert({ email: e, source: source ?? null })
      .select("token")
      .single();
    if (error || !inserted?.token) {
      console.error("[unsubscribe] falha ao criar token", error);
      return null;
    }
    token = inserted.token;
  }

  return `${siteUrl()}/descadastro?token=${encodeURIComponent(token)}`;
}

export interface UnsubscribeLookup {
  found: boolean;
  email?: string;
  alreadyUnsubscribed?: boolean;
}

/** Valida o token e devolve o e-mail mascarado para exibição. */
export async function lookupUnsubscribeToken(token: string): Promise<UnsubscribeLookup> {
  const t = (token ?? "").trim();
  if (!t || t.length > 200) return { found: false };
  const { data } = await supabaseAdmin
    .from("email_unsubscribes")
    .select("email, unsubscribed_at")
    .eq("token", t)
    .maybeSingle();
  if (!data) return { found: false };
  return {
    found: true,
    email: maskEmail(data.email),
    alreadyUnsubscribed: Boolean(data.unsubscribed_at),
  };
}

/** Confirma o opt-out. */
export async function confirmUnsubscribe(token: string): Promise<{ ok: boolean }> {
  const t = (token ?? "").trim();
  if (!t || t.length > 200) return { ok: false };
  const { error } = await supabaseAdmin
    .from("email_unsubscribes")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("token", t)
    .is("unsubscribed_at", null);
  if (error) {
    console.error("[unsubscribe] falha ao confirmar", error);
    return { ok: false };
  }
  return { ok: true };
}

function maskEmail(email: string): string {
  const [user, domain] = (email ?? "").split("@");
  if (!user || !domain) return "***";
  const head = user.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, user.length - 2))}@${domain}`;
}
