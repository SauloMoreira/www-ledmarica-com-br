// Helpers server-only da nota fiscal anexada: validação de arquivo, storage
// privado e e-mail com a NF em anexo. Nunca importar no client.

export const INVOICE_BUCKET = "invoices";
export const INVOICE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB (igual ao limite do bucket)

export type InvoiceFileKind = "pdf" | "xml";

const STORE_NAME = process.env.STORE_NAME ?? "Led Maricá";
const BRAND = "#0073E6";

export function decodeBase64(base64: string): Uint8Array {
  // Aceita data URL ("data:application/pdf;base64,....") ou base64 puro.
  const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  return new Uint8Array(Buffer.from(clean, "base64"));
}

export function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Confere o conteúdo real do arquivo (não confia em extensão/MIME do navegador). */
export function validateInvoiceFile(kind: InvoiceFileKind, bytes: Uint8Array): string | null {
  if (bytes.byteLength === 0) return "Arquivo vazio.";
  if (bytes.byteLength > INVOICE_MAX_BYTES) return "Arquivo maior que 5 MB.";
  if (kind === "pdf") {
    const head = new TextDecoder().decode(bytes.slice(0, 5));
    if (head !== "%PDF-") return "O arquivo não é um PDF válido.";
    return null;
  }
  // XML: precisa começar com '<' (após BOM/espaços) e parecer uma NF-e.
  let text = new TextDecoder().decode(bytes.slice(0, 4096));
  text = text.replace(/^﻿/, "").trimStart();
  if (!text.startsWith("<")) return "O arquivo não é um XML válido.";
  if (!/<(nfeProc|NFe|nfe:)/i.test(text) && !/<\?xml/i.test(text)) {
    return "O XML não parece ser de uma NF-e.";
  }
  return null;
}

export function invoiceObjectPath(orderId: string, kind: InvoiceFileKind): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return kind === "pdf"
    ? `${orderId}/danfe-${stamp}.pdf`
    : `${orderId}/nfe-${stamp}.xml`;
}

export async function downloadInvoiceObject(path: string): Promise<Uint8Array | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage.from(INVOICE_BUCKET).download(path);
  if (error || !data) {
    console.error("[invoice] falha ao baixar arquivo", path, error?.message);
    return null;
  }
  return new Uint8Array(await data.arrayBuffer());
}

function esc(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface InvoiceEmailContent {
  customerName: string | null;
  orderNumber: number | string;
  invoiceNumber: string | null;
  invoiceSeries: string | null;
  accessKey: string | null;
  hasXml: boolean;
  message: string | null;
}

export function buildInvoiceEmail(c: InvoiceEmailContent): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = (c.customerName ?? "").trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `Olá, ${firstName}!` : "Olá!";
  const nfLabel = c.invoiceNumber
    ? `NF-e nº ${c.invoiceNumber}${c.invoiceSeries ? ` (série ${c.invoiceSeries})` : ""}`
    : "nota fiscal";
  const subject = `Nota fiscal do seu pedido #${c.orderNumber} — ${STORE_NAME}`;
  const attachedLine = c.hasXml
    ? "Seguem em anexo o PDF (DANFE) e o arquivo XML da nota."
    : "Segue em anexo o PDF (DANFE) da nota.";
  const keyFormatted = c.accessKey ? c.accessKey.replace(/(\d{4})(?=\d)/g, "$1 ") : null;
  const customMessage = c.message?.trim() || null;

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:${BRAND};padding:20px 28px;color:#fff;font-size:18px;font-weight:bold;">${esc(STORE_NAME)}</td></tr>
        <tr><td style="padding:28px;color:#1f2937;font-size:15px;line-height:1.55;">
          <p style="margin:0 0 14px;">${esc(greeting)}</p>
          <p style="margin:0 0 14px;">A ${esc(nfLabel)} do seu pedido <strong>#${esc(c.orderNumber)}</strong> foi emitida. ${esc(attachedLine)}</p>
          ${customMessage ? `<p style="margin:0 0 14px;">${esc(customMessage).replace(/\n/g, "<br/>")}</p>` : ""}
          ${
            keyFormatted
              ? `<div style="margin:18px 0;padding:14px 16px;background:#f3f6fb;border-radius:8px;font-size:13px;color:#374151;">
                  <div style="font-weight:bold;margin-bottom:4px;">Chave de acesso</div>
                  <div style="font-family:Consolas,Menlo,monospace;letter-spacing:0.5px;word-break:break-all;">${esc(keyFormatted)}</div>
                  <div style="margin-top:6px;color:#6b7280;">Consulte a autenticidade no portal da NF-e da Receita Federal.</div>
                </div>`
              : ""
          }
          <p style="margin:0;">Obrigado pela compra!</p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f9fafb;color:#6b7280;font-size:12px;line-height:1.5;">
          Rod. Ernani do Amaral Peixoto, 28354 — Lojas 5/6/7, Mumbuca, Maricá/RJ · (21) 3731-2324<br/>
          Responda este e-mail se precisar de algo sobre a nota.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

  const text = [
    greeting,
    `A ${nfLabel} do seu pedido #${c.orderNumber} foi emitida. ${attachedLine}`,
    customMessage,
    keyFormatted ? `Chave de acesso: ${keyFormatted}` : null,
    `Obrigado pela compra!\n— ${STORE_NAME}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject, html, text };
}

export function invoiceAttachmentName(
  orderNumber: number | string,
  invoiceNumber: string | null,
  kind: InvoiceFileKind,
): string {
  const base = invoiceNumber
    ? `NF-${invoiceNumber.replace(/[^\w-]/g, "")}`
    : `NF-pedido-${orderNumber}`;
  return `${base}.${kind}`;
}
