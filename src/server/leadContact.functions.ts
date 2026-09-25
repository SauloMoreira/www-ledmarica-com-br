// Central de comunicação com o lead (admin).
//
// - WhatsApp: o envio é manual (wa.me no navegador do atendente). Aqui só
//   registramos a tentativa — sem API paga e sem risco de bloqueio do número.
// - E-mail: enviado pelo transport transacional (Resend), respeitando o
//   descadastro do cliente; fica em email_events e no histórico do lead.
// - Toda ação alimenta lead_interactions, last_interaction_at e o "próximo
//   retorno" (next_action / next_action_at), que é o que monta a fila
//   "Retornar hoje" na tela de Leads.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendTransactionalEmail } from "./email/transport";
import { getUnsubscribeUrl, isUnsubscribed } from "./email/unsubscribe";

const STORE_NAME = process.env.STORE_NAME ?? "Led Maricá";
const BRAND = "#0073E6";

type AdminCtx = { adminUserId: string };

const followUpSchema = z
  .object({
    at: z.string().datetime({ offset: true }).nullable(),
    action: z.string().trim().max(200).optional(),
  })
  .optional();

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Status que ainda indicam "ninguém falou com o cliente". */
const UNTOUCHED = new Set(["novo", "new", null, undefined, ""]);

async function touchLead(
  leadId: string,
  opts: { contacted: boolean; followUp?: z.infer<typeof followUpSchema> },
): Promise<void> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("status")
    .eq("id", leadId)
    .maybeSingle();

  const patch: Record<string, unknown> = { last_interaction_at: new Date().toISOString() };
  if (opts.contacted && UNTOUCHED.has(lead?.status as string | null)) {
    patch.status = "primeiro_contato";
  }
  if (opts.followUp) {
    patch.next_action_at = opts.followUp.at;
    patch.next_action = opts.followUp.at
      ? opts.followUp.action?.trim() || "Retornar contato"
      : null;
  }
  const { error } = await supabaseAdmin
    .from("leads")
    .update(patch as never)
    .eq("id", leadId);
  if (error) throw new Error("Não foi possível atualizar o lead.");
}

async function addInteraction(row: {
  leadId: string;
  type: "whatsapp" | "email" | "call" | "note";
  content: string;
  adminId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("lead_interactions").insert({
    lead_id: row.leadId,
    type: row.type,
    content: row.content.slice(0, 4000),
    created_by: row.adminId,
    metadata: (row.metadata ?? {}) as never,
  });
  if (error) throw new Error("Não foi possível registrar no histórico.");
}

// ---------------------------------------------------------------------------
// WhatsApp aberto / ligação / nota
// ---------------------------------------------------------------------------
export const logLeadContact = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) =>
    z
      .object({
        leadId: z.string().uuid(),
        channel: z.enum(["whatsapp", "call", "note"]),
        content: z.string().trim().min(1).max(4000),
        templateName: z.string().max(120).optional(),
        outcome: z.enum(["respondeu", "sem_resposta", "sem_interesse", "vai_comprar"]).optional(),
        followUp: followUpSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminId = (context as AdminCtx).adminUserId;
    await addInteraction({
      leadId: data.leadId,
      type: data.channel,
      content: data.content,
      adminId,
      metadata: {
        ...(data.templateName ? { template: data.templateName } : {}),
        ...(data.outcome ? { outcome: data.outcome } : {}),
      },
    });
    await touchLead(data.leadId, { contacted: data.channel !== "note", followUp: data.followUp });
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// E-mail avulso para o lead
// ---------------------------------------------------------------------------
function leadEmailHtml(body: string, unsubscribeUrl: string | null): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;">${esc(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  const unsub = unsubscribeUrl
    ? `<br/><a href="${esc(unsubscribeUrl)}" style="color:#6b7280;">Não quero mais receber e-mails</a>`
    : "";
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:${BRAND};padding:20px 28px;color:#fff;font-size:18px;font-weight:bold;">${esc(STORE_NAME)}</td></tr>
        <tr><td style="padding:28px;color:#1f2937;font-size:15px;line-height:1.55;">${paragraphs}</td></tr>
        <tr><td style="padding:16px 28px;background:#f9fafb;color:#6b7280;font-size:12px;line-height:1.5;">
          Rod. Ernani do Amaral Peixoto, 28354 — Lojas 5/6/7, Mumbuca, Maricá/RJ · (21) 3731-2324<br/>
          Responda este e-mail para falar com a nossa equipe.${unsub}
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export const sendLeadEmail = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) =>
    z
      .object({
        leadId: z.string().uuid(),
        subject: z.string().trim().min(3).max(150),
        body: z.string().trim().min(5).max(5000),
        templateName: z.string().max(120).optional(),
        followUp: followUpSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminId = (context as AdminCtx).adminUserId;
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, email")
      .eq("id", data.leadId)
      .maybeSingle();
    const to = lead?.email?.trim();
    if (!to) throw new Error("Este lead não tem e-mail.");
    if (await isUnsubscribed(to)) {
      throw new Error("O cliente pediu para não receber e-mails. Use o WhatsApp.");
    }

    const unsubscribeUrl = await getUnsubscribeUrl(to, "lead_manual");
    const result = await sendTransactionalEmail({
      to,
      subject: data.subject,
      html: leadEmailHtml(data.body, unsubscribeUrl),
      text: `${data.body}\n\n— ${STORE_NAME}${unsubscribeUrl ? `\n\nPara não receber mais: ${unsubscribeUrl}` : ""}`,
      metadata: { type: "lead_manual" },
    });

    await supabaseAdmin.from("email_events").insert({
      customer_email: to,
      type: "lead_manual",
      subject: data.subject,
      provider: result.provider,
      provider_message_id: result.messageId ?? null,
      status: result.ok ? (result.skipped ? "skipped" : "sent") : "failed",
      error_message: result.error ?? null,
      sent_at: result.ok ? new Date().toISOString() : null,
      payload: { lead_id: data.leadId } as never,
    } as never);

    if (!result.ok) throw new Error("O e-mail não pôde ser enviado. Tente de novo em instantes.");

    await addInteraction({
      leadId: data.leadId,
      type: "email",
      content: `${data.subject}\n\n${data.body}`,
      adminId,
      metadata: {
        subject: data.subject,
        ...(data.templateName ? { template: data.templateName } : {}),
        ...(result.messageId ? { message_id: result.messageId } : {}),
      },
    });
    await touchLead(data.leadId, { contacted: true, followUp: data.followUp });
    return { ok: true as const, skipped: Boolean(result.skipped) };
  });

// ---------------------------------------------------------------------------
// Só agendar / limpar o próximo retorno
// ---------------------------------------------------------------------------
export const setLeadFollowUp = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d) =>
    z
      .object({
        leadId: z.string().uuid(),
        at: z.string().datetime({ offset: true }).nullable(),
        action: z.string().trim().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("leads")
      .update({
        next_action_at: data.at,
        next_action: data.at ? data.action?.trim() || "Retornar contato" : null,
      } as never)
      .eq("id", data.leadId);
    if (error) throw new Error("Não foi possível salvar o retorno.");
    return { ok: true as const };
  });
