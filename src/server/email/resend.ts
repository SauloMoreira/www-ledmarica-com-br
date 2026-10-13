// Cliente Resend — usado APENAS no servidor.
// Nunca importe este arquivo no client.
import { Resend } from "resend";

let _client: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_client) _client = new Resend(key);
  return _client;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  metadata?: Record<string, string | number | boolean | null>;
  /** Anexos (ex.: DANFE em PDF e XML da NF-e). `content` em base64. */
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  /** Conteúdo do arquivo codificado em base64. */
  content: string;
  contentType?: string;
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean; // true quando RESEND_API_KEY não está configurada (dev mode)
}

/**
 * Envia um e-mail transacional via Resend.
 * - Em dev sem RESEND_API_KEY: loga e retorna { ok:true, skipped:true }, não quebra o fluxo.
 * - Erros do provedor são retornados em { ok:false, error }, nunca lançados.
 */
export async function sendTransactionalEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const from = process.env.RESEND_FROM_EMAIL;
  const replyTo = params.replyTo ?? process.env.RESEND_REPLY_TO_EMAIL;

  const client = getClient();
  if (!client || !from) {
    // Modo dev / não configurado — não quebra o fluxo
    console.warn("[email] RESEND_API_KEY ou RESEND_FROM_EMAIL ausente — e-mail não enviado", {
      to: params.to,
      subject: params.subject,
    });
    return { ok: true, skipped: true };
  }

  try {
    const res = await client.emails.send({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: replyTo ?? undefined,
      attachments: params.attachments?.length
        ? params.attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
          }))
        : undefined,
      headers: params.metadata
        ? { "X-Entity-Ref-ID": String(params.metadata.orderId ?? params.metadata.type ?? "") }
        : undefined,
    });

    if (res.error) {
      console.error("[email] erro Resend", res.error);
      return { ok: false, error: res.error.message ?? "Resend error" };
    }
    return { ok: true, messageId: res.data?.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido ao enviar e-mail";
    console.error("[email] exception envio", e);
    return { ok: false, error: msg };
  }
}
