import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, History, Play } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDateTimeBR } from "@/lib/dateBR";

export const Route = createFileRoute("/admin/automacoes")({
  component: AutomacoesPage,
});

const TRIGGER_LABELS: Record<string, string> = {
  cart_abandoned: "Carrinho abandonado",
  lead_no_response: "Lead sem resposta",
  lead_hot: "Lead quente",
  order_pending_payment: "Pedido aguardando pagamento",
  order_paid: "Pedido aprovado",
  order_ready_pickup: "Pedido pronto para retirada",
  post_sale: "Pós-venda",
  recompra: "Recompra",
  b2b_negotiation_open: "Negociação B2B aberta",
  custom: "Personalizada",
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  both: "WhatsApp + E-mail",
};

type Rule = {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  channel: string;
  wait_minutes: number;
  template_id: string | null;
  active: boolean;
  max_sends_per_entity: number;
  respect_consent: boolean;
};

type Form = Omit<Rule, "id"> & { id?: string };
const EMPTY: Form = {
  name: "",
  description: "",
  trigger_type: "cart_abandoned",
  channel: "whatsapp",
  wait_minutes: 60,
  template_id: null,
  active: false,
  max_sends_per_entity: 1,
  respect_consent: true,
};

function AutomacoesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    const [r1, r2] = await Promise.all([
      supabase.from("automation_rules").select("*").order("created_at", { ascending: true }),
      supabase.from("whatsapp_templates").select("id, name").eq("active", true).order("name"),
    ]);
    setRules((r1.data ?? []) as Rule[]);
    setTemplates((r2.data ?? []) as any[]);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const openHistory = async () => {
    const { data } = await supabase
      .from("automation_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setHistory(data ?? []);
    setHistoryOpen(true);
  };

  const openNew = () => {
    setForm(EMPTY);
    setOpen(true);
  };
  const openEdit = (r: Rule) => {
    setForm({ ...r });
    setOpen(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      description: form.description?.trim() || null,
      trigger_type: form.trigger_type,
      channel: form.channel,
      wait_minutes: Math.max(0, Number(form.wait_minutes) || 0),
      template_id: form.template_id || null,
      active: form.active,
      max_sends_per_entity: Math.max(1, Number(form.max_sends_per_entity) || 1),
      respect_consent: form.respect_consent,
    };
    const res = form.id
      ? await supabase.from("automation_rules").update(payload).eq("id", form.id)
      : await supabase.from("automation_rules").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Automação salva");
    setOpen(false);
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Excluir automação?")) return;
    const { error } = await supabase.from("automation_rules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const toggle = async (r: Rule) => {
    const { error } = await supabase
      .from("automation_rules")
      .update({ active: !r.active })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, active: !r.active } : x)));
  };

  const runTest = async (r: Rule) => {
    // Apenas registra um run de teste (manual). Não envia mensagem real.
    const { error } = await supabase.from("automation_runs").insert({
      rule_id: r.id,
      entity_type: "manual_test",
      entity_id: null,
      channel: r.channel,
      status: "preview",
      generated_message:
        "Teste manual — disparo automático real será habilitado após configurar provedor.",
      trigger_kind: "manual_test",
    });
    if (error) return toast.error(error.message);
    toast.success("Teste registrado no histórico");
  };

  const inactiveCount = useMemo(() => rules.filter((r) => !r.active).length, [rules]);

  return (
    <AdminLayout
      title="Automações"
      action={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={openHistory}>
            <History className="w-4 h-4 mr-1" /> Histórico
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> Nova automação
          </Button>
        </div>
      }
    >
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm mb-4">
        <p className="font-medium mb-1">Disparo automático desativado por padrão</p>
        <p className="text-muted-foreground">
          Esta área já está estruturada para automações futuras. Por enquanto, todas as automações
          nascem inativas e só executam quando você usar “Testar manualmente”. O envio automático
          real será habilitado quando integrarmos um provedor oficial de WhatsApp/e-mail.{" "}
          {inactiveCount > 0 && (
            <span className="block mt-1">
              {inactiveCount} automação(ões) inativa(s) prontas para uso.
            </span>
          )}
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground bg-muted/40">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Gatilho</th>
                <th className="px-4 py-3 font-medium">Canal</th>
                <th className="px-4 py-3 font-medium">Espera</th>
                <th className="px-4 py-3 font-medium">Ativa</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
              {!loading && rules.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma automação cadastrada.
                  </td>
                </tr>
              )}
              {!loading &&
                rules.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.name}</div>
                      {r.description && (
                        <div className="text-xs text-muted-foreground">{r.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <Badge variant="secondary">
                        {TRIGGER_LABELS[r.trigger_type] ?? r.trigger_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">{CHANNEL_LABELS[r.channel] ?? r.channel}</td>
                    <td className="px-4 py-3 text-xs">{r.wait_minutes} min</td>
                    <td className="px-4 py-3">
                      <Switch checked={r.active} onCheckedChange={() => toggle(r)} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Testar manualmente"
                        onClick={() => runTest(r)}
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(r)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => del(r.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar automação" : "Nova automação"}</DialogTitle>
            <DialogDescription>
              Toda automação nasce inativa. Ative quando estiver tudo configurado.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Gatilho</Label>
                <select
                  value={form.trigger_type}
                  onChange={(e) => setForm({ ...form, trigger_type: e.target.value })}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {Object.entries(TRIGGER_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Canal</Label>
                <select
                  value={form.channel}
                  onChange={(e) => setForm({ ...form, channel: e.target.value })}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {Object.entries(CHANNEL_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Tempo de espera (min)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.wait_minutes}
                  onChange={(e) => setForm({ ...form, wait_minutes: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Limite por entidade</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.max_sends_per_entity}
                  onChange={(e) =>
                    setForm({ ...form, max_sends_per_entity: Number(e.target.value) || 1 })
                  }
                />
              </div>
            </div>
            <div>
              <Label>Modelo de mensagem</Label>
              <select
                value={form.template_id ?? ""}
                onChange={(e) => setForm({ ...form, template_id: e.target.value || null })}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— sem modelo —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-4 pt-1">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.active}
                  onCheckedChange={(c) => setForm({ ...form, active: c })}
                />
                <Label className="cursor-pointer">Ativa</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.respect_consent}
                  onCheckedChange={(c) => setForm({ ...form, respect_consent: c })}
                />
                <Label className="cursor-pointer">Respeitar consentimento</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Histórico de execuções</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {history.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhum registro ainda.
              </p>
            )}
            {history.map((h) => (
              <div key={h.id} className="border border-border rounded-md p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    variant={
                      h.status === "sent"
                        ? "default"
                        : h.status === "error"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {h.status}
                  </Badge>
                  <span className="text-muted-foreground">
                    {formatDateTimeBR(h.created_at)}
                  </span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  {h.trigger_kind} · {h.channel} · {h.entity_type}
                </div>
                {h.generated_message && (
                  <div className="mt-1 whitespace-pre-wrap">{h.generated_message}</div>
                )}
                {h.error_message && <div className="mt-1 text-destructive">{h.error_message}</div>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
