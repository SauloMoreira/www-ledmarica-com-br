// E-mails de acesso sem senha (conta criada automaticamente + código de login).
// Server-only. NUNCA lança: falha de e-mail não pode quebrar a navegação/compra.
import { sendTransactionalEmail } from "./transport";

const BRAND = "#0073E6";

function siteUrl(): string {
  return (process.env.SITE_URL ?? "").replace(/\/$/, "") || "https://www.ledmarica.com.br";
}
function storeName(): string {
  return process.env.STORE_NAME ?? "Led Maricá";
}
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:${BRAND};padding:20px 28px;color:#fff;font-size:18px;font-weight:bold;">${esc(storeName())}</td></tr>
        <tr><td style="padding:28px;color:#1f2937;font-size:15px;line-height:1.55;">
          <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">${esc(title)}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f9fafb;color:#6b7280;font-size:12px;line-height:1.5;">
          Rod. Ernani do Amaral Peixoto, 28354 — Lojas 5/6/7, Mumbuca, Maricá/RJ · (21) 3731-2324<br/>
          Se você não fez esta solicitação, pode ignorar este e-mail com segurança.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

/** Código de 6 dígitos para entrar sem senha. */
export async function sendLoginCodeEmail(opts: { to: string; code: string }): Promise<boolean> {
  const code = opts.code.replace(/\D/g, "").slice(0, 10);
  const html = layout(
    "Seu código de acesso",
    `<p style="margin:0 0 16px;">Use o código abaixo para entrar na sua conta e finalizar seu pedido:</p>
     <p style="margin:0 0 16px;text-align:center;">
       <span style="display:inline-block;font-size:32px;letter-spacing:8px;font-weight:bold;color:${BRAND};background:#eef6ff;border-radius:10px;padding:14px 22px;">${esc(code)}</span>
     </p>
     <p style="margin:0;color:#6b7280;font-size:13px;">O código vale por 1 hora e só pode ser usado uma vez. Nunca compartilhe este código.</p>`,
  );
  const text = `Seu código de acesso ${storeName()}: ${code}\nVale por 1 hora. Se não foi você, ignore este e-mail.`;
  const r = await sendTransactionalEmail({
    to: opts.to,
    subject: `${code} é o seu código de acesso — ${storeName()}`,
    html,
    text,
    metadata: { type: "login_code" },
  });
  return r.ok;
}

/** Boas-vindas quando a conta é criada automaticamente na identificação do carrinho. */
export async function sendWelcomeAccountEmail(opts: { to: string; name: string }): Promise<boolean> {
  const loginUrl = `${siteUrl()}/login?modo=codigo&email=${encodeURIComponent(opts.to)}`;
  const first = esc(opts.name.split(" ")[0] || "");
  const html = layout(
    `Olá${first ? `, ${first}` : ""}! Seu carrinho está salvo`,
    `<p style="margin:0 0 14px;">Criamos sua conta na ${esc(storeName())} com este e-mail para guardar seu carrinho e acompanhar seus pedidos.</p>
     <p style="margin:0 0 20px;">Você não precisa de senha: para entrar, é só pedir um código de acesso que chega aqui no seu e-mail.</p>
     <p style="margin:0 0 20px;text-align:center;">
       <a href="${loginUrl}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-weight:bold;border-radius:8px;padding:12px 22px;">Acessar minha conta</a>
     </p>
     <p style="margin:0;color:#6b7280;font-size:13px;">Retirada grátis na loja em Maricá e entrega local a partir de R$ 15. Dúvidas? Responda este e-mail ou chame no WhatsApp (21) 98212-6467.</p>`,
  );
  const text = `Criamos sua conta na ${storeName()} para guardar seu carrinho. Para entrar sem senha, acesse ${loginUrl} e peça um código de acesso.`;
  const r = await sendTransactionalEmail({
    to: opts.to,
    subject: `Seu carrinho está salvo — ${storeName()}`,
    html,
    text,
    metadata: { type: "welcome_auto_account" },
  });
  return r.ok;
}
