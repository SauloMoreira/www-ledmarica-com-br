import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ShoppingCart,
  Search,
  RefreshCw,
  MessageSquareText,
  Copy,
  ExternalLink,
  Building2,
  Phone,
  Mail,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  detectAbandonedCarts,
  listAbandonedCarts,
  getAbandonedCart,
  updateAbandonedCart,
  logContactAttempt,
  CART_STATUSES,
  type CartStatus,
} from "@/server/abandonedCarts.functions";
import { supabase } from "@/integrations/supabase/client";
import { renderTemplate, buildWhatsappUrl, type WhatsappTemplate } from "@/lib/whatsappTemplates";
import { toast } from "sonner";
import { LOSS_REASONS, lossReasonLabel, type LossReason } from "@/lib/lossReasons";

export const Route = createFileRoute("/admin/carrinhos-abandonados")({
  component: AbandonedCartsPage,
});

function brl(n: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(n ?? 0),
  );
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}
function elapsed(d: string | null | undefined): string {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
function statusInfo(s: string) {
  return CART_STATUSES.find((x) => x.value === s) ?? CART_STATUSES[0];
}

function AbandonedCartsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAbandonedCarts);
  const detect = useServerFn(detectAbandonedCarts);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>(["novo", "contato_enviado"]);
  const [minVal, setMinVal] = useState("");
  const [hasPhone, setHasPhone] = useState<"all" | "yes" | "no">("all");
  const [b2b, setB2b] = useState<"all" | "yes" | "no">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [waCartId, setWaCartId] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      minValue: minVal ? Number(minVal) : null,
      hasPhone: hasPhone === "all" ? null : hasPhone === "yes",
      isB2B: b2b === "all" ? null : b2b === "yes",
      limit: 100,
      offset: 0,
    }),
    [search, statusFilter, minVal, hasPhone, b2b],
  );

  const query = useQuery({
    queryKey: ["abandoned-carts", filters],
    queryFn: () => list({ data: filters }),
  });

  const detectMut = useMutation({
    mutationFn: () => detect({ data: { minutes: 60 } }),
    onSuccess: (r) => {
      toast.success(
        r.created > 0
          ? `${r.created} carrinho(s) abandonado(s) identificado(s).`
          : "Nenhum carrinho novo. Já estamos em dia!",
      );
      qc.invalidateQueries({ queryKey: ["abandoned-carts"] });
      qc.invalidateQueries({ queryKey: ["admin-operations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleStatus = (s: string) => {
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const rows = query.data?.rows ?? [];

  return (
    <AdminLayout
      title="Carrinhos abandonados"
      action={
        <Button size="sm" onClick={() => detectMut.mutate()} disabled={detectMut.isPending}>
          <RefreshCw className={`w-4 h-4 mr-1 ${detectMut.isPending ? "animate-spin" : ""}`} />
          Verificar carrinhos
        </Button>
      }
    >
      {/* Filtros */}
      <div className="rounded-xl border border-border bg-card p-4 mb-4 space-y-3">
        <div className="grid md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs">Buscar</Label>
            <div className="relative mt-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome, telefone, e-mail, empresa..."
                className="pl-9"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Valor mínimo</Label>
            <Input
              type="number"
              min="0"
              value={minVal}
              onChange={(e) => setMinVal(e.target.value)}
              placeholder="Ex.: 500"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Telefone</Label>
              <select
                value={hasPhone}
                onChange={(e) => setHasPhone(e.target.value as "all" | "yes" | "no")}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="all">Todos</option>
                <option value="yes">Com telefone</option>
                <option value="no">Sem telefone</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <select
                value={b2b}
                onChange={(e) => setB2b(e.target.value as "all" | "yes" | "no")}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="all">Todos</option>
                <option value="yes">B2B</option>
                <option value="no">B2C</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CART_STATUSES.map((s) => {
            const active = statusFilter.includes(s.value);
            return (
              <button
                key={s.value}
                onClick={() => toggleStatus(s.value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? s.color
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Contato</th>
                <th className="px-4 py-3 font-medium">Itens</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Abandonado há</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
              {!query.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhum carrinho abandonado por enquanto.
                    <div className="text-xs mt-1">
                      Clique em <strong>Verificar carrinhos</strong> para procurar agora.
                    </div>
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const si = statusInfo(r.status);
                const isHighValue = Number(r.subtotal_amount) >= 1000;
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="font-medium flex items-center gap-1.5">
                        {r.customer_name ?? (
                          <span className="text-muted-foreground italic">Visitante</span>
                        )}
                        {r.company_id && <Building2 className="w-3.5 h-3.5 text-amber-600" />}
                      </div>
                      {r.company_name && (
                        <div className="text-xs text-muted-foreground">{r.company_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.customer_phone && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="w-3 h-3" />
                          {r.customer_phone}
                        </div>
                      )}
                      {r.customer_email && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Mail className="w-3 h-3" />
                          {r.customer_email}
                        </div>
                      )}
                      {!r.customer_phone && !r.customer_email && (
                        <span className="text-muted-foreground italic">Sem contato</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{r.items_count}</td>
                    <td className="px-4 py-3 font-medium">
                      <span className={isHighValue ? "text-emerald-600" : ""}>
                        {brl(r.subtotal_amount)}
                      </span>
                      {isHighValue && (
                        <Badge
                          variant="outline"
                          className="ml-1 border-emerald-500/40 text-emerald-700 text-[9px]"
                        >
                          Alto valor
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${si.color}`}>
                        {si.label}
                      </span>
                      {lossReasonLabel((r as { loss_reason?: string | null }).loss_reason) && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          Motivo: {lossReasonLabel((r as { loss_reason?: string | null }).loss_reason)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {elapsed(r.abandoned_at)}
                      {r.last_contacted_at && (
                        <div className="text-[10px]">contato {elapsed(r.last_contacted_at)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {r.customer_phone && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => setWaCartId(r.id)}
                          >
                            <MessageSquareText className="w-3.5 h-3.5 mr-1" /> WhatsApp
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs"
                          onClick={() => setOpenId(r.id)}
                        >
                          Ver
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dica para iniciantes */}
      <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground flex gap-2">
        <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div>
          Estes clientes colocaram produtos no carrinho mas não finalizaram. Vale chamar pelo
          WhatsApp, principalmente os de <strong>alto valor</strong>. As mensagens são{" "}
          <strong>manuais</strong> — nada é enviado automaticamente.
        </div>
      </div>

      {openId && (
        <CartDetailDialog
          id={openId}
          onClose={() => setOpenId(null)}
          onWhatsapp={(id) => {
            setOpenId(null);
            setWaCartId(id);
          }}
        />
      )}
      {waCartId && <WhatsappDialog id={waCartId} onClose={() => setWaCartId(null)} />}
    </AdminLayout>
  );
}

// =====================================================================
// Detalhe
// =====================================================================
function CartDetailDialog({
  id,
  onClose,
  onWhatsapp,
}: {
  id: string;
  onClose: () => void;
  onWhatsapp: (id: string) => void;
}) {
  const qc = useQueryClient();
  const get = useServerFn(getAbandonedCart);
  const upd = useServerFn(updateAbandonedCart);
  const { data, isLoading } = useQuery({
    queryKey: ["abandoned-cart", id],
    queryFn: () => get({ data: { id } }),
  });
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (data?.cart?.notes) setNotes(data.cart.notes);
  }, [data]);

  const updMut = useMutation({
    mutationFn: (patch: { status?: CartStatus; notes?: string; loss_reason?: LossReason | null }) =>
      upd({ data: { id, ...patch } }),
    onSuccess: () => {
      toast.success("Atualizado");
      qc.invalidateQueries({ queryKey: ["abandoned-carts"] });
      qc.invalidateQueries({ queryKey: ["abandoned-cart", id] });
      qc.invalidateQueries({ queryKey: ["admin-operations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cart = data?.cart;
  const items = (cart?.cart_snapshot as Array<Record<string, unknown>> | null) ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Carrinho abandonado</DialogTitle>
          <DialogDescription>Detalhes, produtos e ações de recuperação.</DialogDescription>
        </DialogHeader>
        {isLoading || !cart ? (
          <div className="py-8 text-center text-muted-foreground">Carregando…</div>
        ) : (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground mb-1">Cliente</div>
                <div className="font-medium">
                  {data.profile?.name ?? data.lead?.name ?? cart.customer_name ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {data.profile?.email ?? data.lead?.email ?? cart.customer_email ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {data.profile?.phone ?? data.lead?.phone ?? cart.customer_phone ?? "—"}
                </div>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground mb-1">Resumo</div>
                <div>
                  Subtotal: <strong>{brl(cart.subtotal_amount)}</strong>
                </div>
                <div className="text-xs text-muted-foreground">
                  Abandonado em {fmtDate(cart.abandoned_at)} · {elapsed(cart.abandoned_at)} atrás
                </div>
                <div className="text-xs text-muted-foreground">
                  Tentativas: {cart.recovery_attempts ?? 0}
                </div>
              </div>
            </div>

            {data.company && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <div className="text-xs text-amber-700 font-medium mb-1 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" /> Empresa B2B
                </div>
                <div>{data.company.trade_name ?? data.company.legal_name}</div>
                <div className="text-xs text-muted-foreground">CNPJ {data.company.cnpj}</div>
              </div>
            )}

            <div>
              <div className="text-xs text-muted-foreground mb-2">Produtos no carrinho</div>
              <div className="rounded-md border border-border divide-y divide-border">
                {items.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">Snapshot vazio.</div>
                )}
                {items.map((it, i) => (
                  <div key={i} className="p-3 flex items-center gap-3">
                    {it.product_image ? (
                      <img
                        src={String(it.product_image)}
                        alt=""
                        className="w-12 h-12 rounded object-cover bg-muted"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-muted" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {String(it.product_name ?? "—")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {it.product_sku ? `SKU ${String(it.product_sku)} · ` : ""}
                        {Number(it.qty)}× {brl(Number(it.unit_price))}
                      </div>
                    </div>
                    <div className="text-sm font-medium">{brl(Number(it.subtotal))}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs" htmlFor="loss-reason">
                Motivo da não conversão
              </Label>
              <select
                id="loss-reason"
                className="mt-1 w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={(cart as { loss_reason?: string | null }).loss_reason ?? ""}
                onChange={(e) =>
                  updMut.mutate({ loss_reason: (e.target.value || null) as LossReason | null })
                }
              >
                <option value="">Ainda não sabemos — pergunte no contato</option>
                {LOSS_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Registre o que o cliente respondeu. Isso mostra onde estamos perdendo vendas.
              </p>
            </div>

            <div>
              <Label className="text-xs">Observações internas</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => {
                  if (notes !== (cart.notes ?? "")) updMut.mutate({ notes });
                }}
                placeholder="Anotações sobre este cliente..."
                className="mt-1"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {cart.customer_phone || data.profile?.phone || data.lead?.phone ? (
                <Button size="sm" onClick={() => onWhatsapp(id)}>
                  <MessageSquareText className="w-4 h-4 mr-1" /> Chamar no WhatsApp
                </Button>
              ) : (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Sem telefone para WhatsApp
                </div>
              )}
              <div className="flex-1" />
              {(["recuperado", "perdido", "ignorado"] as CartStatus[]).map((s) => {
                const si = statusInfo(s);
                return (
                  <Button
                    key={s}
                    size="sm"
                    variant="outline"
                    onClick={() => updMut.mutate({ status: s })}
                    disabled={cart.status === s}
                  >
                    Marcar como {si.label.toLowerCase()}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// WhatsApp dialog
// =====================================================================
function WhatsappDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const get = useServerFn(getAbandonedCart);
  const log = useServerFn(logContactAttempt);
  const { data } = useQuery({
    queryKey: ["abandoned-cart", id],
    queryFn: () => get({ data: { id } }),
  });

  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const { data: t } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("active", true)
        .or("category.eq.carrinho,category.eq.geral,category.eq.relacionamento")
        .order("sort_order");
      const arr = (t ?? []) as WhatsappTemplate[];
      setTemplates(arr);
      const carrinho = arr.find((x) => x.category === "carrinho") ?? arr[0];
      if (carrinho) setTemplateId(carrinho.id);
    })();
  }, []);

  // Render do template com contexto do carrinho
  useEffect(() => {
    const t = templates.find((x) => x.id === templateId);
    if (!t || !data) return;
    const cart = data.cart;
    const items = (cart.cart_snapshot as Array<Record<string, unknown>> | null) ?? [];
    const lista = items.map((i) => `• ${i.product_name} (${i.qty}x)`).join("\n");
    const ctx = {
      nome_cliente: data.profile?.name ?? data.lead?.name ?? cart.customer_name ?? "cliente",
      nome_loja: "Led Maricá",
      lista_produtos: lista,
      valor_carrinho: brl(cart.subtotal_amount),
      whatsapp_loja: "21 98212-6467",
    };
    setMessage(renderTemplate(t.body, ctx));
  }, [templateId, templates, data]);

  const phone = data?.profile?.phone ?? data?.lead?.phone ?? data?.cart?.customer_phone ?? null;
  const waUrl = buildWhatsappUrl(phone, message);

  const onOpen = async () => {
    if (!waUrl) {
      toast.error("Sem telefone válido");
      return;
    }
    window.open(waUrl, "_blank");
    await log({ data: { id, kind: "whatsapp_opened", message, markAsContacted: true } });
    qc.invalidateQueries({ queryKey: ["abandoned-carts"] });
    qc.invalidateQueries({ queryKey: ["abandoned-cart", id] });
    qc.invalidateQueries({ queryKey: ["admin-operations"] });
    toast.success("Tentativa registrada no histórico.");
    onClose();
  };

  const onCopy = async () => {
    await navigator.clipboard.writeText(message);
    await log({ data: { id, kind: "message_copied", message, markAsContacted: false } });
    qc.invalidateQueries({ queryKey: ["abandoned-cart", id] });
    toast.success("Mensagem copiada");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Chamar no WhatsApp</DialogTitle>
          <DialogDescription>
            Escolha um modelo, revise a mensagem e abra o WhatsApp. Nenhum envio automático.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Modelo</Label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Mensagem (editável)</Label>
            <Textarea
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1 text-sm"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Telefone: <strong>{phone ?? "—"}</strong>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCopy}>
            <Copy className="w-4 h-4 mr-1" /> Copiar
          </Button>
          <Button onClick={onOpen} disabled={!waUrl}>
            <ExternalLink className="w-4 h-4 mr-1" /> Abrir WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
