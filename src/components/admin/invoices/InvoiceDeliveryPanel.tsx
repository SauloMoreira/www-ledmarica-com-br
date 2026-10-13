import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Eye,
  FileCode2,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  getInvoiceFileUrl,
  removeInvoiceFile,
  sendInvoiceEmail,
  uploadInvoiceFile,
} from "@/server/invoiceFiles.functions";

type Kind = "pdf" | "xml";

const MAX_BYTES = 5 * 1024 * 1024;

const KIND_META: Record<
  Kind,
  { label: string; hint: string; accept: string; Icon: typeof FileText; required: boolean }
> = {
  pdf: {
    label: "PDF da nota (DANFE)",
    hint: "Obrigatório para enviar ao cliente",
    accept: "application/pdf,.pdf",
    Icon: FileText,
    required: true,
  },
  xml: {
    label: "XML da NF-e",
    hint: "Opcional — empresas costumam pedir para a contabilidade",
    accept: ".xml,application/xml,text/xml",
    Icon: FileCode2,
    required: false,
  },
};

export type InvoiceDeliveryState = {
  pdfPath: string | null;
  xmlPath: string | null;
  sentAt: string | null;
  sentTo: string | null;
  suggestedEmail: string | null;
  cancelled: boolean;
};

function fmtDateTime(d: string) {
  try {
    return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return d;
  }
}

function fileName(path: string) {
  return path.split("/").pop() ?? path;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o arquivo"));
    reader.readAsDataURL(file);
  });
}

/**
 * Anexa o PDF/XML da NF ao pedido e envia ao cliente por e-mail com os
 * arquivos anexados. Usado no detalhe do pedido e no diálogo de NF.
 */
export function InvoiceDeliveryPanel({
  orderId,
  state,
  onChanged,
  beforeSend,
  className,
}: {
  orderId: string;
  state: InvoiceDeliveryState;
  onChanged: () => void | Promise<void>;
  /** Ex.: salvar os dados da NF antes de enviar. Retornar false cancela o envio. */
  beforeSend?: () => Promise<boolean>;
  className?: string;
}) {
  const sendFn = useServerFn(sendInvoiceEmail);
  const [email, setEmail] = useState(state.sentTo ?? state.suggestedEmail ?? "");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSend = !!state.pdfPath && emailValid && !state.cancelled && !sending;

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    try {
      if (beforeSend) {
        const okToSend = await beforeSend();
        if (!okToSend) return;
      }
      const r = await sendFn({
        data: { orderId, to: email.trim(), message: message.trim() || null },
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Nota enviada para ${r.to}`);
      setMessage("");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar a nota");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <p className="text-sm font-semibold">Arquivos da nota</p>
        <FileSlot kind="pdf" orderId={orderId} path={state.pdfPath} onChanged={onChanged} />
        <FileSlot kind="xml" orderId={orderId} path={state.xmlPath} onChanged={onChanged} />
      </div>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Mail className="w-4 h-4" aria-hidden /> Enviar ao cliente
          </p>
          {state.sentAt && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
              Enviada em {fmtDateTime(state.sentAt)}
              {state.sentTo ? ` para ${state.sentTo}` : ""}
            </span>
          )}
        </div>
        <div>
          <Label htmlFor={`${orderId}-nf-email`} className="text-xs">
            E-mail do cliente
          </Label>
          <Input
            id={`${orderId}-nf-email`}
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cliente@exemplo.com"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor={`${orderId}-nf-msg`} className="text-xs">
            Mensagem adicional (opcional)
          </Label>
          <Textarea
            id={`${orderId}-nf-msg`}
            rows={2}
            maxLength={1000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ex.: Qualquer dúvida sobre a nota, é só responder este e-mail."
            className="mt-1"
          />
        </div>
        {!state.pdfPath && (
          <p className="text-xs text-muted-foreground">Anexe o PDF da nota para liberar o envio.</p>
        )}
        {state.cancelled && (
          <p className="text-xs text-destructive">A nota deste pedido está cancelada.</p>
        )}
        <Button onClick={handleSend} disabled={!canSend} className="w-full sm:w-auto">
          {sending ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden />
          ) : (
            <Mail className="w-4 h-4 mr-1.5" aria-hidden />
          )}
          {sending
            ? "Enviando…"
            : state.sentAt
              ? "Reenviar nota por e-mail"
              : "Enviar nota por e-mail"}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          O cliente recebe um e-mail com o PDF{state.xmlPath ? " e o XML" : ""} anexado
          {state.xmlPath ? "s" : ""}, o número do pedido e a chave de acesso.
        </p>
      </div>
    </div>
  );
}

function FileSlot({
  kind,
  orderId,
  path,
  onChanged,
}: {
  kind: Kind;
  orderId: string;
  path: string | null;
  onChanged: () => void | Promise<void>;
}) {
  const meta = KIND_META[kind];
  const uploadFn = useServerFn(uploadInvoiceFile);
  const removeFn = useServerFn(removeInvoiceFile);
  const urlFn = useServerFn(getInvoiceFileUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "upload" | "remove" | "view">(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== kind) {
      toast.error(kind === "pdf" ? "Escolha um arquivo .pdf" : "Escolha um arquivo .xml");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("O arquivo passa de 5 MB.");
      return;
    }
    setBusy("upload");
    try {
      const base64 = await readAsDataUrl(file);
      const r = await uploadFn({ data: { orderId, kind, base64 } });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${kind.toUpperCase()} anexado`);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao anexar o arquivo");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleView() {
    // Abre a aba antes do await para não ser bloqueada como pop-up.
    const win = window.open("about:blank", "_blank");
    setBusy("view");
    try {
      const r = await urlFn({ data: { orderId, kind } });
      if (!r.ok) {
        win?.close();
        toast.error(r.error);
        return;
      }
      if (win) win.location.href = r.url;
      else window.location.assign(r.url);
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove() {
    setBusy("remove");
    try {
      const r = await removeFn({ data: { orderId, kind } });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${kind.toUpperCase()} removido`);
      await onChanged();
    } finally {
      setBusy(null);
    }
  }

  const inputId = `${orderId}-nf-${kind}`;

  return (
    <div
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        void handleFile(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        dragOver ? "border-primary bg-primary/5" : "border-border",
        !path && "border-dashed",
      )}
    >
      <meta.Icon
        className={cn("w-5 h-5 shrink-0", path ? "text-primary" : "text-muted-foreground")}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{meta.label}</p>
        <p className="text-xs text-muted-foreground truncate">
          {busy === "upload"
            ? "Enviando arquivo…"
            : path
              ? fileName(path)
              : `${meta.hint} · arraste aqui ou escolha`}
        </p>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={meta.accept}
        className="sr-only"
        onChange={(e: ChangeEvent<HTMLInputElement>) => void handleFile(e.target.files?.[0])}
      />
      <div className="flex items-center gap-1 shrink-0">
        {path && (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              onClick={handleView}
              disabled={busy !== null}
              aria-label={`Ver ${kind.toUpperCase()}`}
            >
              {busy === "view" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-destructive hover:text-destructive"
              onClick={handleRemove}
              disabled={busy !== null}
              aria-label={`Remover ${kind.toUpperCase()}`}
            >
              {busy === "remove" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          </>
        )}
        <Button
          type="button"
          size="sm"
          variant={path ? "outline" : "default"}
          className="h-8"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
        >
          {busy === "upload" ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : path ? (
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
          ) : (
            <Upload className="w-3.5 h-3.5 mr-1" />
          )}
          {path ? "Trocar" : "Anexar"}
        </Button>
      </div>
    </div>
  );
}

/** Converte o retorno de getInvoiceDetail no estado do painel. */
export function toDeliveryState(
  order: {
    invoice_pdf_path?: string | null;
    invoice_xml_path?: string | null;
    invoice_email_sent_at?: string | null;
    invoice_email_sent_to?: string | null;
    invoice_status?: string | null;
  },
  customerEmail: string | null | undefined,
): InvoiceDeliveryState {
  return {
    pdfPath: order.invoice_pdf_path ?? null,
    xmlPath: order.invoice_xml_path ?? null,
    sentAt: order.invoice_email_sent_at ?? null,
    sentTo: order.invoice_email_sent_to ?? null,
    suggestedEmail: customerEmail ?? null,
    cancelled: order.invoice_status === "cancelada",
  };
}
