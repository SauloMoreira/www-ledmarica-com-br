// Identificação do comprador logo no 1º "Adicionar ao carrinho" + acesso sem senha.
//
// Objetivo: todo carrinho passa a ter nome, e-mail e WhatsApp — o que alimenta
// o e-mail de recuperação (job hourly), o botão "Chamar no WhatsApp" do admin e
// a Central de Comunicação (lead), para entender por que a compra não fechou.
//
// Segurança:
//  - Nunca faz login de ninguém só pelo e-mail digitado. A conta é criada em
//    segundo plano (sem senha) e só dá para entrar provando posse do e-mail
//    (código de 6 dígitos enviado por e-mail) ou pelo Google.
//  - O lead só é atualizado se pertencer à MESMA sessão de carrinho (cookie
//    httpOnly) — ninguém reescreve o lead de outra pessoa.
//  - Rate limit por IP e por e-mail; respostas não revelam se um e-mail tem conta.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enforceRateLimit, getClientIdentifier } from "@/server/security/rateLimit";
import { resolveCartSessionId } from "./cartSession.server";
import { sendLoginCodeEmail, sendWelcomeAccountEmail } from "./email/accessEmails";
import { normalizeBrMobile } from "@/lib/brPhone";

async function resolveOptionalUserId(): Promise<string | null> {
  try {
    const auth = getRequest()?.headers?.get("authorization");
    if (!auth?.startsWith("Bearer ")) return null;
    const { data } = await supabaseAdmin.auth.getUser(auth.slice(7).trim());
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

function likeExact(value: string): string {
  // ilike sem curingas: o e-mail pode conter "_" (que no LIKE casa qualquer caractere).
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

const phoneSchema = z
  .string()
  .transform((v, ctx) => {
    const n = normalizeBrMobile(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "WhatsApp inválido" });
      return z.NEVER;
    }
    return n;
  });

const trackingSchema = z
  .object({
    utm_source: z.string().max(200).nullish(),
    utm_medium: z.string().max(200).nullish(),
    utm_campaign: z.string().max(200).nullish(),
    utm_term: z.string().max(200).nullish(),
    utm_content: z.string().max(200).nullish(),
    origin_page: z.string().max(500).nullish(),
    origin_path: z.string().max(300).nullish(),
    referrer_url: z.string().max(500).nullish(),
  })
  .partial()
  .nullish();

const IdentifyInput = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().toLowerCase().email().max(180).optional(),
  phone: phoneSchema,
  productId: z.string().uuid().nullish(),
  productName: z.string().max(200).nullish(),
  pageUrl: z.string().max(500).nullish(),
  tracking: trackingSchema,
});

export type IdentifyResult =
  | { ok: true; mode: "profile" }
  | { ok: true; mode: "guest"; account: "created" | "exists" };

export const identifyShopper = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IdentifyInput.parse(input))
  .handler(async ({ data }): Promise<IdentifyResult> => {
    const ip = getClientIdentifier();
    await enforceRateLimit(`ip:${ip}`, "identify");

    // ---------------------------------------------------------------
    // Cliente logado: só completa o WhatsApp (e o nome, se vazio).
    // ---------------------------------------------------------------
    const userId = await resolveOptionalUserId();
    if (userId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("name")
        .eq("id", userId)
        .maybeSingle();
      const patch: Record<string, unknown> = { phone: data.phone, updated_at: new Date().toISOString() };
      if (data.name && !profile?.name?.trim()) patch.name = data.name;
      const { error } = await supabaseAdmin.from("profiles").update(patch as never).eq("id", userId);
      if (error) throw new Error("Não foi possível salvar seu WhatsApp. Tente novamente.");
      return { ok: true, mode: "profile" };
    }

    if (!data.name || !data.email) throw new Error("Informe nome e e-mail.");
    const name = data.name;
    const email = data.email;
    await enforceRateLimit(`email:${email}`, "identify", { maxAttempts: 5, windowSeconds: 60 * 60 });

    const sessionId = resolveCartSessionId();
    const nowIso = new Date().toISOString();
    const t = data.tracking ?? {};

    // ---------------------------------------------------------------
    // Lead (Central de Comunicação) — 1 por sessão de carrinho.
    // ---------------------------------------------------------------
    let leadId: string | null = null;
    try {
      const { data: existing } = await supabaseAdmin
        .from("leads")
        .select("id")
        .eq("metadata->>cart_session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const payload = {
        name,
        email,
        phone: data.phone,
        origin: "carrinho",
        origin_context: "add_to_cart",
        interest: data.productName ? `Carrinho: ${data.productName}`.slice(0, 200) : "Carrinho",
        product_id: data.productId ?? null,
        product_name: data.productName ?? null,
        page_url: data.pageUrl ?? null,
        utm_source: t.utm_source ?? null,
        utm_medium: t.utm_medium ?? null,
        utm_campaign: t.utm_campaign ?? null,
        utm_term: t.utm_term ?? null,
        utm_content: t.utm_content ?? null,
        origin_page: t.origin_page ?? data.pageUrl ?? null,
        origin_path: t.origin_path ?? null,
        referrer_url: t.referrer_url ?? null,
        origin_product_id: data.productId ?? null,
        origin_product_name: data.productName ?? null,
        last_interaction_at: nowIso,
        metadata: { cart_session_id: sessionId, source: "add_to_cart", consent_at: nowIso },
      };

      if (existing?.id) {
        await supabaseAdmin.from("leads").update(payload as never).eq("id", existing.id);
        leadId = existing.id;
      } else {
        const { data: created } = await supabaseAdmin
          .from("leads")
          .insert({ ...payload, status: "novo" } as never)
          .select("id")
          .single();
        leadId = (created as { id: string } | null)?.id ?? null;
      }
    } catch (e) {
      console.error("[identify] lead save failed", e);
    }

    // ---------------------------------------------------------------
    // Contato do carrinho (usado por detect_abandoned_carts).
    // ---------------------------------------------------------------
    const { error: contactErr } = await supabaseAdmin.from("guest_cart_contacts").upsert(
      {
        session_id: sessionId,
        name,
        email,
        phone: data.phone,
        lead_id: leadId,
        consent_at: nowIso,
        source: "add_to_cart",
        updated_at: nowIso,
      } as never,
      { onConflict: "session_id" },
    );
    if (contactErr) {
      console.error("[identify] contact upsert failed", contactErr.message);
      throw new Error("Não foi possível salvar seus dados. Tente novamente.");
    }

    // Carrinho desta sessão que já tenha sido detectado sem contato ganha o contato agora.
    await supabaseAdmin
      .from("abandoned_carts")
      .update({
        customer_name: name,
        customer_email: email,
        customer_phone: data.phone,
        lead_id: leadId,
        updated_at: nowIso,
      } as never)
      .eq("session_id", sessionId)
      .is("customer_email", null);

    // ---------------------------------------------------------------
    // Conta automática (sem senha). Só entra quem provar o e-mail (código).
    // ---------------------------------------------------------------
    let account: "created" | "exists" = "exists";
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("email", likeExact(email))
        .limit(1)
        .maybeSingle();
      if (!profile) {
        const { error } = await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { name, phone: data.phone, source: "add_to_cart" },
        });
        if (!error) {
          account = "created";
          await sendWelcomeAccountEmail({ to: email, name });
        } else if (!/already|registered|exists/i.test(error.message)) {
          console.error("[identify] createUser failed", error.message);
        }
      }
    } catch (e) {
      console.error("[identify] account step failed", e);
    }

    return { ok: true, mode: "guest", account };
  });

// ---------------------------------------------------------------------------
// Login sem senha: envia um código numérico (6 a 10 dígitos, conforme o Auth) por e-mail.
// O client confirma com supabase.auth.verifyOtp({ email, token, type: "email" }).
// Se o e-mail ainda não tem conta, cria (sem senha) — a sessão só é emitida
// depois do código, então isso prova a posse do e-mail.
// ---------------------------------------------------------------------------
const CodeInput = z.object({ email: z.string().trim().toLowerCase().email().max(180) });

export const sendLoginCode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CodeInput.parse(input))
  .handler(async ({ data }) => {
    const ip = getClientIdentifier();
    await enforceRateLimit(`ip:${ip}`, "login_code", { maxAttempts: 8, windowSeconds: 10 * 60 });
    await enforceRateLimit(`email:${data.email}`, "login_code");

    let { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: data.email,
    });
    if (error && /not.*found|no user/i.test(error.message)) {
      const created = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        email_confirm: true,
        user_metadata: { source: "login_code" },
      });
      if (!created.error) {
        ({ data: link, error } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: data.email,
        }));
      }
    }

    const code = link?.properties?.email_otp;
    if (error || !code) {
      console.error("[login-code] generateLink failed", error?.message);
      // Mensagem genérica: não revela se o e-mail existe.
      throw new Error("Não foi possível enviar o código agora. Tente novamente em instantes.");
    }

    const sent = await sendLoginCodeEmail({ to: data.email, code });
    if (!sent) throw new Error("Não foi possível enviar o e-mail com o código. Tente novamente.");
    // O tamanho do código depende da configuração do Auth (6 a 10 dígitos).
    return { ok: true as const, length: code.length };
  });
