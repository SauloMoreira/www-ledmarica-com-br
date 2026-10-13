// Transport abstrato de e-mail transacional.
// - Único ponto de envio usado por orderEmails / fluxos transacionais.
// - Switch por env EMAIL_PROVIDER ("resend" | "lovable_email").
// - Default: "resend" (atual). Migração para Lovable Emails é apenas trocar a env
//   após o domínio próprio estar configurado e validado.
//
// IMPORTANTE: nenhum outro módulo deve importar 'resend.ts' diretamente.
// Toda a aplicação envia e-mail via sendTransactionalEmail() deste arquivo.

import {
  sendTransactionalEmail as sendViaResend,
  type SendEmailParams,
  type SendEmailResult,
} from "./resend";

export type EmailProvider = "resend" | "lovable_email";

function getProvider(): EmailProvider {
  const raw = (process.env.EMAIL_PROVIDER ?? "resend").toLowerCase();
  if (raw === "lovable_email" || raw === "lovable") return "lovable_email";
  return "resend";
}

/**
 * Envia um e-mail transacional usando o provider configurado.
 * Retorna sempre um resultado — nunca lança — para não quebrar fluxos de pedido/pagamento.
 */
export async function sendTransactionalEmail(
  params: SendEmailParams,
): Promise<SendEmailResult & { provider: EmailProvider }> {
  const provider = getProvider();

  if (provider === "lovable_email") {
    // Stub preparado: a integração real será plugada quando o domínio próprio
    // estiver verificado em Cloud → Emails. Enquanto não estiver, caímos para Resend
    // para não interromper envios em produção.
    console.warn(
      "[email] EMAIL_PROVIDER=lovable_email ainda não implementado, usando Resend como fallback",
      {
        to: params.to,
        subject: params.subject,
      },
    );
    const result = await sendViaResend(params);
    return { ...result, provider: "resend" };
  }

  const result = await sendViaResend(params);
  return { ...result, provider: "resend" };
}

export type { SendEmailParams, SendEmailResult };
export type { EmailAttachment } from "./resend";
