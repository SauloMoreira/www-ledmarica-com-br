import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enforceRateLimit, getClientIdentifier } from "@/server/security/rateLimit";

interface HandoffInput {
  name: string;
  phone: string;
  sessionId: string;
  pageUrl?: string | null;
  productId?: string | null;
  productName?: string | null;
  productUrl?: string | null;
  tracking?: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_term?: string | null;
    utm_content?: string | null;
    origin_page?: string | null;
    origin_path?: string | null;
    referrer_url?: string | null;
    origin_context?: string | null;
    origin_product_id?: string | null;
    origin_product_name?: string | null;
    origin_category_id?: string | null;
  } | null;
}

const STORE_WHATSAPP_FALLBACK = "5521982126467";

function onlyDigits(v: string): string {
  return v.replace(/\D+/g, "");
}

function validateName(name: string): string {
  const trimmed = (name ?? "").trim();
  if (trimmed.length < 2) throw new Error("Informe um nome válido.");
  if (/^\d+$/.test(trimmed)) throw new Error("Nome não pode ser apenas números.");
  if (trimmed.length > 120) throw new Error("Nome muito longo.");
  return trimmed;
}

function validatePhone(phone: string): string {
  const digits = onlyDigits(phone ?? "");
  if (digits.length < 10 || digits.length > 13) {
    throw new Error("Telefone inválido. Use DDD + número.");
  }
  // Normaliza para formato internacional 55XXXXXXXXXXX
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return withCountry;
}

async function buildSummary(sessionId: string): Promise<{
  summary: string;
  lastUserMessage: string;
}> {
  const { data: msgs } = await supabaseAdmin
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(20);

  const all = (msgs ?? []).reverse();
  const userMsgs = all.filter((m) => m.role === "user");
  const lastUserMessage = userMsgs[userMsgs.length - 1]?.content?.slice(0, 500) ?? "";

  const recent = userMsgs.slice(-5).map((m, i) => `${i + 1}. ${m.content.slice(0, 200)}`);
  const summary =
    recent.length > 0
      ? `Últimas perguntas do cliente:\n${recent.join("\n")}`
      : "Cliente solicitou atendimento humano sem mensagens prévias.";

  return { summary: summary.slice(0, 1500), lastUserMessage };
}

async function getStoreWhatsapp(): Promise<string> {
  try {
    const { data } = await supabaseAdmin
      .from("company_settings")
      .select("support_whatsapp")
      .limit(1)
      .maybeSingle();
    const raw = data?.support_whatsapp ? onlyDigits(data.support_whatsapp) : "";
    if (raw && raw.length >= 10) {
      return raw.startsWith("55") ? raw : `55${raw}`;
    }
  } catch {
    // ignore
  }
  return STORE_WHATSAPP_FALLBACK;
}

export const requestHumanHandoff = createServerFn({ method: "POST" })
  .inputValidator((input: HandoffInput) => {
    if (
      !input?.sessionId ||
      typeof input.sessionId !== "string" ||
      input.sessionId.length < 8 ||
      input.sessionId.length > 80
    ) {
      throw new Error("sessionId obrigatório");
    }
    return {
      name: validateName(input.name),
      phone: validatePhone(input.phone),
      sessionId: input.sessionId,
      pageUrl: input.pageUrl?.slice(0, 500) ?? null,
      productId: input.productId ?? null,
      productName: input.productName?.slice(0, 200) ?? null,
      productUrl: input.productUrl?.slice(0, 500) ?? null,
      tracking: input.tracking ?? null,
    };
  })
  .handler(async ({ data }) => {
    // Rate limit por IP e por sessão (bem mais restrito que chat normal)
    const ip = getClientIdentifier();
    await enforceRateLimit(`session:${data.sessionId}`, "lead_handoff", {
      maxAttempts: 5,
      windowSeconds: 10 * 60,
    });
    await enforceRateLimit(`ip:${ip}`, "lead_handoff", {
      maxAttempts: 10,
      windowSeconds: 10 * 60,
    });

    const storeWhats = await getStoreWhatsapp();
    const { summary, lastUserMessage } = await buildSummary(data.sessionId);

    const productLine = data.productName
      ? `\nProduto mencionado: ${data.productName}${data.productUrl ? ` (${data.productUrl})` : ""}`
      : "";
    const lastLine = lastUserMessage ? `\n\nÚltima mensagem:\n${lastUserMessage}` : "";

    const whatsappText =
      `Olá! Vim pelo site e gostaria de atendimento humano.\n\n` +
      `Meu nome: ${data.name}\n` +
      `Meu telefone: ${data.phone}` +
      productLine +
      `\n\nResumo da minha dúvida:\n${summary}` +
      lastLine;

    // wa.me é o link oficial e mais universal: redireciona para o app no mobile
    // e para web.whatsapp.com no desktop. Se o navegador do cliente bloquear o
    // domínio (extensão/proxy/firewall), o ChatWidget oferece alternativas:
    // copiar número, copiar mensagem e ligar.
    const whatsappUrl = `https://wa.me/${storeWhats}?text=${encodeURIComponent(whatsappText)}`;

    // Deduplicação: só reaproveita um lead das últimas 24h se ele for do MESMO
    // telefone E da MESMA sessão de chat. Antes bastava o telefone — qualquer
    // pessoa que digitasse o número de outro cliente sobrescrevia o nome, o
    // resumo e a mensagem do lead dele. Sessão diferente => lead novo (a
    // equipe vê os dois e decide), nunca reescrita de dados de terceiros.
    let leadId: string | null = null;
    let leadError: string | null = null;
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabaseAdmin
        .from("leads")
        .select("id")
        .eq("phone", data.phone)
        .eq("notes", `chat:${data.sessionId}`)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const t = data.tracking ?? {};
      const payload = {
        name: data.name,
        phone: data.phone,
        origin: "ai_chat",
        origin_context: t.origin_context ?? "chat",
        status: "novo",
        interest: "atendimento_humano",
        conversation_summary: summary,
        last_user_message: lastUserMessage,
        product_id: data.productId,
        product_name: data.productName,
        product_url: data.productUrl,
        page_url: data.pageUrl,
        whatsapp_message: whatsappText,
        notes: `chat:${data.sessionId}`,
        utm_source: t.utm_source ?? null,
        utm_medium: t.utm_medium ?? null,
        utm_campaign: t.utm_campaign ?? null,
        utm_term: t.utm_term ?? null,
        utm_content: t.utm_content ?? null,
        origin_page: t.origin_page ?? data.pageUrl ?? null,
        origin_path: t.origin_path ?? null,
        referrer_url: t.referrer_url ?? null,
        origin_product_id: t.origin_product_id ?? data.productId ?? null,
        origin_product_name: t.origin_product_name ?? data.productName ?? null,
        origin_category_id: t.origin_category_id ?? null,
        metadata: {
          session_id: data.sessionId,
          intent: "human_handoff",
        },
      };

      if (existing?.id) {
        // Não rebaixa o status: se a equipe já está atendendo, o lead não
        // volta para "novo" só porque o cliente clicou de novo.
        const { status: _status, ...updatePayload } = payload;
        await supabaseAdmin.from("leads").update(updatePayload).eq("id", existing.id);
        leadId = existing.id;
      } else {
        const { data: created } = await supabaseAdmin
          .from("leads")
          .insert(payload)
          .select("id")
          .single();
        leadId = created?.id ?? null;
      }
    } catch (e) {
      console.error("requestHumanHandoff: lead save failed", e);
      leadError = "lead_save_failed";
    }

    return {
      ok: true,
      whatsappUrl,
      whatsappPhone: storeWhats,
      whatsappText,
      leadId,
      leadSaved: leadId !== null,
      leadError,
    };
  });
