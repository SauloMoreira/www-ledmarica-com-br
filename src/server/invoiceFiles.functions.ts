// Nota fiscal: arquivos (PDF/XML) e envio ao cliente por e-mail.
// Wrappers finos — helpers de runtime ficam em invoiceFiles.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

type AdminCtx = { adminUserId?: string };

const KindSchema = z.enum(["pdf", "xml"]);

// ============================================================
// uploadInvoiceFile — anexa o DANFE (PDF) ou o XML ao pedido
// ============================================================
export const uploadInvoiceFile = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        kind: KindSchema,
        // ~5 MB em base64 ≈ 7 MB de texto; folga para o prefixo data URL.
        base64: z.string().min(10).max(7_500_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAdminAction } = await import("./security/auditLog");
    const { INVOICE_BUCKET, decodeBase64, invoiceObjectPath, validateInvoiceFile } = await import(
      "./invoiceFiles.server"
    );
    const adminId = (context as AdminCtx).adminUserId ?? null;

    const bytes = decodeBase64(data.base64);
    const invalid = validateInvoiceFile(data.kind, bytes);
    if (invalid) return { ok: false as const, error: invalid };

    const column = data.kind === "pdf" ? "invoice_pdf_path" : "invoice_xml_path";
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, invoice_pdf_path, invoice_xml_path")
      .eq("id", data.orderId)
      .single();
    if (orderErr || !order) return { ok: false as const, error: "Pedido não encontrado" };
    const previousPath = (data.kind === "pdf" ? order.invoice_pdf_path : order.invoice_xml_path) ?? null;

    const path = invoiceObjectPath(data.orderId, data.kind);
    const { error: upErr } = await supabaseAdmin.storage.from(INVOICE_BUCKET).upload(path, bytes, {
      contentType: data.kind === "pdf" ? "application/pdf" : "application/xml",
      upsert: false,
    });
    if (upErr) return { ok: false as const, error: `Falha ao salvar o arquivo: ${upErr.message}` };

    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update({ [column]: path, invoice_updated_at: new Date().toISOString() } as never)
      .eq("id", data.orderId);
    if (updErr) {
      // Não deixa arquivo órfão se o pedido não foi atualizado.
      await supabaseAdmin.storage.from(INVOICE_BUCKET).remove([path]);
      return { ok: false as const, error: updErr.message };
    }

    // Arquivo anterior só é apagado depois que o novo está gravado no pedido.
    if (previousPath && previousPath !== path) {
      await supabaseAdmin.storage.from(INVOICE_BUCKET).remove([previousPath]);
    }

    await supabaseAdmin.from("order_invoice_audit").insert({
      order_id: data.orderId,
      event_type: previousPath ? "invoice_file_replaced" : "invoice_file_uploaded",
      new_data: { kind: data.kind, path, size: bytes.byteLength } as never,
      previous_data: previousPath ? ({ path: previousPath } as never) : null,
      changed_by: adminId,
    } as never);

    await logAdminAction({
      adminId: adminId ?? "00000000-0000-0000-0000-000000000000",
      action: "update",
      resourceType: "order_invoice",
      resourceId: data.orderId,
      description: `Arquivo ${data.kind.toUpperCase()} da NF anexado ao pedido #${order.order_number}`,
      before: { [column]: previousPath },
      after: { [column]: path },
    });

    return { ok: true as const, path, size: bytes.byteLength };
  });

// ============================================================
// removeInvoiceFile
// ============================================================
export const removeInvoiceFile = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z.object({ orderId: z.string().uuid(), kind: KindSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { INVOICE_BUCKET } = await import("./invoiceFiles.server");
    const adminId = (context as AdminCtx).adminUserId ?? null;
    const column = data.kind === "pdf" ? "invoice_pdf_path" : "invoice_xml_path";

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("invoice_pdf_path, invoice_xml_path")
      .eq("id", data.orderId)
      .single();
    const path = (order as Record<string, string | null> | null)?.[column] ?? null;
    if (!path) return { ok: true as const };

    const { error } = await supabaseAdmin
      .from("orders")
      .update({ [column]: null, invoice_updated_at: new Date().toISOString() } as never)
      .eq("id", data.orderId);
    if (error) return { ok: false as const, error: error.message };
    await supabaseAdmin.storage.from(INVOICE_BUCKET).remove([path]);

    await supabaseAdmin.from("order_invoice_audit").insert({
      order_id: data.orderId,
      event_type: "invoice_file_removed",
      previous_data: { kind: data.kind, path } as never,
      changed_by: adminId,
    } as never);

    return { ok: true as const };
  });

// ============================================================
// getInvoiceFileUrl — URL assinada curta, só para o admin visualizar
// ============================================================
export const getInvoiceFileUrl = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z.object({ orderId: z.string().uuid(), kind: KindSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { INVOICE_BUCKET } = await import("./invoiceFiles.server");
    const column = data.kind === "pdf" ? "invoice_pdf_path" : "invoice_xml_path";
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("invoice_pdf_path, invoice_xml_path")
      .eq("id", data.orderId)
      .single();
    const path = (order as Record<string, string | null> | null)?.[column] ?? null;
    if (!path) return { ok: false as const, error: "Nenhum arquivo anexado." };
    const { data: signed, error } = await supabaseAdmin.storage
      .from(INVOICE_BUCKET)
      .createSignedUrl(path, 300);
    if (error || !signed) return { ok: false as const, error: error?.message ?? "Falha no link" };
    return { ok: true as const, url: signed.signedUrl };
  });

// ============================================================
// sendInvoiceEmail — envia a NF ao cliente com PDF (e XML) anexados
// ============================================================
export const sendInvoiceEmail = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        to: z.string().trim().toLowerCase().email("E-mail inválido").max(254),
        message: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAdminAction } = await import("./security/auditLog");
    const { sendTransactionalEmail } = await import("./email/transport");
    const {
      buildInvoiceEmail,
      downloadInvoiceObject,
      encodeBase64,
      invoiceAttachmentName,
    } = await import("./invoiceFiles.server");
    const adminId = (context as AdminCtx).adminUserId ?? null;

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, user_id, address_snapshot, invoice_status, invoice_number, invoice_series, invoice_access_key, invoice_pdf_path, invoice_xml_path",
      )
      .eq("id", data.orderId)
      .single();
    if (error || !order) return { ok: false as const, error: "Pedido não encontrado" };
    if (!order.invoice_pdf_path) {
      return { ok: false as const, error: "Anexe o PDF da nota antes de enviar." };
    }
    if (order.invoice_status === "cancelada") {
      return { ok: false as const, error: "A nota deste pedido está cancelada." };
    }

    const pdf = await downloadInvoiceObject(order.invoice_pdf_path);
    if (!pdf) return { ok: false as const, error: "Não foi possível ler o PDF anexado." };
    const xml = order.invoice_xml_path ? await downloadInvoiceObject(order.invoice_xml_path) : null;

    let customerName =
      (order.address_snapshot as { recipient?: string } | null)?.recipient ?? null;
    if (order.user_id) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("name")
        .eq("id", order.user_id)
        .maybeSingle();
      customerName = prof?.name ?? customerName;
    }

    const content = buildInvoiceEmail({
      customerName,
      orderNumber: order.order_number,
      invoiceNumber: order.invoice_number,
      invoiceSeries: order.invoice_series,
      accessKey: order.invoice_access_key,
      hasXml: !!xml,
      message: data.message ?? null,
    });

    const attachments = [
      {
        filename: invoiceAttachmentName(order.order_number, order.invoice_number, "pdf"),
        content: encodeBase64(pdf),
        contentType: "application/pdf",
      },
      ...(xml
        ? [
            {
              filename: invoiceAttachmentName(order.order_number, order.invoice_number, "xml"),
              content: encodeBase64(xml),
              contentType: "application/xml",
            },
          ]
        : []),
    ];

    const result = await sendTransactionalEmail({
      to: data.to,
      subject: content.subject,
      html: content.html,
      text: content.text,
      attachments,
      metadata: { type: "invoice_sent", orderId: order.id },
    });

    const status = result.ok ? (result.skipped ? "skipped" : "sent") : "failed";
    await supabaseAdmin.from("email_events").insert({
      order_id: order.id,
      customer_email: data.to,
      type: "invoice_sent",
      subject: content.subject,
      provider: result.provider,
      provider_message_id: result.messageId ?? null,
      status,
      error_message: result.error ?? null,
      sent_at: result.ok ? new Date().toISOString() : null,
      payload: { attachments: attachments.map((a) => a.filename) } as never,
    } as never);

    if (!result.ok) {
      return { ok: false as const, error: "O e-mail não pôde ser enviado. Tente de novo em instantes." };
    }
    if (result.skipped) {
      return { ok: false as const, error: "Envio de e-mail não está configurado no servidor." };
    }

    const sentAt = new Date().toISOString();
    await supabaseAdmin
      .from("orders")
      .update({ invoice_email_sent_at: sentAt, invoice_email_sent_to: data.to } as never)
      .eq("id", order.id);

    await supabaseAdmin.from("order_invoice_audit").insert({
      order_id: order.id,
      event_type: "invoice_email_sent",
      new_data: { to: data.to, attachments: attachments.map((a) => a.filename) } as never,
      changed_by: adminId,
    } as never);

    await logAdminAction({
      adminId: adminId ?? "00000000-0000-0000-0000-000000000000",
      action: "update",
      resourceType: "order_invoice",
      resourceId: order.id,
      description: `NF do pedido #${order.order_number} enviada por e-mail`,
      after: { to: data.to },
    });

    return { ok: true as const, sentAt, to: data.to };
  });
