import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, ExternalLink, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  getInvoiceDetail,
  registerInvoice,
  setInvoiceStatus,
  INVOICE_STATUS_LABEL,
  type InvoiceStatus,
} from "@/server/invoices.functions";
import {
  InvoiceDeliveryPanel,
  toDeliveryState,
} from "@/components/admin/invoices/InvoiceDeliveryPanel";

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  nao_necessaria: "bg-muted text-muted-foreground",
  pendente_emissao: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  emitida: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  erro_emissao: "bg-red-500/10 text-red-700 dark:text-red-400",
  cancelada: "bg-muted text-muted-foreground line-through",
};

type DetailType = Awaited<ReturnType<typeof getInvoiceDetail>>;

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("pt-BR");
  } catch {
    return "—";
  }
}

export function InvoiceBlock({
  orderId,
  paymentStatus,
}: {
  orderId: string;
  paymentStatus: string;
}) {
  const fetchDetail = useServerFn(getInvoiceDetail);
  const registerFn = useServerFn(registerInvoice);
  const setStatusFn = useServerFn(setInvoiceStatus);

  const [data, setData] = useState<DetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  const [form, setForm] = useState({
    invoice_number: "",
    invoice_series: "",
    invoice_access_key: "",
    invoice_danfe_url: "",
    invoice_xml_url: "",
    invoice_issued_at: "",
    invoice_notes: "",
  });

  const reload = async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const r = await fetchDetail({ data: { orderId } });
      setData(r);
      if (r.ok) {
        setForm({
          invoice_number: r.order.invoice_number ?? "",
          invoice_series: r.order.invoice_series ?? "",
          invoice_access_key: r.order.invoice_access_key ?? "",
          invoice_danfe_url: r.order.invoice_danfe_url ?? "",
          invoice_xml_url: r.order.invoice_xml_url ?? "",
          invoice_issued_at: r.order.invoice_issued_at
            ? new Date(r.order.invoice_issued_at).toISOString().slice(0, 16)
            : "",
          invoice_notes: r.order.invoice_notes ?? "",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando dados fiscais…
      </div>
    );
  }
  if (!data?.ok) {
    return null;
  }

  const o = data.order;
  const status = (o.invoice_status ?? "pendente_emissao") as InvoiceStatus;
  // Mercado Pago grava "approved"; pedidos antigos/manuais podem ter "paid".
  const isPaid = paymentStatus === "paid" || paymentStatus === "approved";

  async function handleSave() {
    setSaving(true);
    try {
      const r = await registerFn({
        data: {
          orderId,
          invoice_number: form.invoice_number || null,
          invoice_series: form.invoice_series || null,
          invoice_access_key: form.invoice_access_key || null,
          invoice_danfe_url: form.invoice_danfe_url || null,
          invoice_xml_url: form.invoice_xml_url || null,
          invoice_issued_at: form.invoice_issued_at
            ? new Date(form.invoice_issued_at).toISOString()
            : null,
          invoice_notes: form.invoice_notes || null,
        },
      });
      if (!r.ok) {
        toast.error(r.error ?? "Erro ao salvar nota");
      } else {
        toast.success("Nota fiscal registrada");
        setOpen(false);
        await reload({ silent: true });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(next: InvoiceStatus) {
    setStatusSaving(true);
    try {
      const r = await setStatusFn({ data: { orderId, status: next } });
      if (!r.ok) toast.error(r.error ?? "Erro ao atualizar status");
      else {
        toast.success("Status fiscal atualizado");
        await reload({ silent: true });
      }
    } finally {
      setStatusSaving(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4" />
          <h3 className="font-semibold">Nota fiscal</h3>
        </div>
        <Badge className={`${STATUS_BADGE[status]} border-0`}>{INVOICE_STATUS_LABEL[status]}</Badge>
      </div>

      {!isPaid && (
        <p className="text-xs text-muted-foreground mb-3">
          A nota só fica pendente automaticamente após o pagamento ser confirmado.
        </p>
      )}

      <div className="space-y-1 text-sm">
        <Row label="Número" value={o.invoice_number ?? "—"} />
        <Row label="Série" value={o.invoice_series ?? "—"} />
        <Row label="Chave de acesso" value={o.invoice_access_key ?? "—"} mono />
        <Row label="Emitida em" value={fmt(o.invoice_issued_at)} />
        <Row label="Registrada em" value={fmt(o.invoice_registered_at)} />
        {data.registeredByEmail && <Row label="Registrada por" value={data.registeredByEmail} />}
        <div className="flex flex-wrap gap-2 pt-2">
          {o.invoice_danfe_url && (
            <a
              href={o.invoice_danfe_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" /> DANFE
            </a>
          )}
          {o.invoice_xml_url && (
            <a
              href={o.invoice_xml_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" /> XML
            </a>
          )}
        </div>
        {o.invoice_notes && (
          <p className="text-xs text-muted-foreground pt-2 whitespace-pre-wrap">
            {o.invoice_notes}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Pencil className="w-4 h-4 mr-1" />
          {status === "emitida" ? "Editar nota" : "Registrar nota"}
        </Button>
        <Select
          value={status}
          onValueChange={(v) => handleStatus(v as InvoiceStatus)}
          disabled={statusSaving}
        >
          <SelectTrigger className="h-9 w-[200px] text-xs">
            <SelectValue placeholder="Status fiscal" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(INVOICE_STATUS_LABEL) as InvoiceStatus[]).map((k) => (
              <SelectItem key={k} value={k}>
                {INVOICE_STATUS_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <InvoiceDeliveryPanel
          orderId={orderId}
          state={toDeliveryState(o, data.customerEmail)}
          onChanged={() => reload({ silent: true })}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Registrar nota fiscal</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Número</Label>
              <Input
                value={form.invoice_number}
                onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
              />
            </div>
            <div>
              <Label>Série</Label>
              <Input
                value={form.invoice_series}
                onChange={(e) => setForm({ ...form, invoice_series: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>Chave de acesso (44 dígitos)</Label>
              <Input
                value={form.invoice_access_key}
                onChange={(e) =>
                  setForm({
                    ...form,
                    invoice_access_key: e.target.value.replace(/\D/g, "").slice(0, 44),
                  })
                }
              />
            </div>
            <div className="col-span-2">
              <Label>Link DANFE</Label>
              <Input
                value={form.invoice_danfe_url}
                onChange={(e) => setForm({ ...form, invoice_danfe_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="col-span-2">
              <Label>Link XML</Label>
              <Input
                value={form.invoice_xml_url}
                onChange={(e) => setForm({ ...form, invoice_xml_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="col-span-2">
              <Label>Emitida em</Label>
              <Input
                type="datetime-local"
                value={form.invoice_issued_at}
                onChange={(e) => setForm({ ...form, invoice_issued_at: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea
                rows={3}
                value={form.invoice_notes}
                onChange={(e) => setForm({ ...form, invoice_notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`text-xs text-right ${mono ? "font-mono break-all" : ""}`}>{value}</span>
    </div>
  );
}
