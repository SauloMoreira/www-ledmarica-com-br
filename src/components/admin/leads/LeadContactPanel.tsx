import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  MessageCircle,
  Mail,
  PhoneCall,
  StickyNote,
  Copy,
  ExternalLink,
  Send,
  Loader2,
  CalendarClock,
  ArrowRightLeft,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  buildWhatsappUrl,
  extractVariables,
  renderTemplate,
  type TemplateContext,
  type WhatsappTemplate,
} from "@/lib/whatsappTemplates";
import { logLeadContact, sendLeadEmail, setLeadFollowUp } from "@/server/leadContact.functions";
import { cn } from "@/lib/utils";

const SITE = "https://www.ledmarica.com.br";
const STORE_WHATSAPP_LABEL = "21 98212-6467";

export type ContactableLead = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  interest?: string | null;
  product_name?: string | null;
  origin_product_name?: string | null;
  next_action?: string | null;
  next_action_at?: string | null;
};

export type LeadPatch = Partial<
  Pick<ContactableLead, "status" | "next_action" | "next_action_at"> & {
    last_interaction_at: string;
  }
>;

type Interaction = {
  id: string;
  type: string | null;
  content: string;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
};

type CartInfo = { value: number; firstSlug: string | null; items: string[] } | null;

const OUTCOMES = [
  { value: "respondeu", label: "Respondeu" },
  { value: "sem_resposta", label: "Não respondeu" },
  { value: "vai_comprar", label: "Vai comprar" },
  { value: "sem_interesse", label: "Sem interesse" },
] as const;
type Outcome = (typeof OUTCOMES)[number]["value"];

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ---------------------------------------------------------------------------
// Próximo retorno
// ---------------------------------------------------------------------------
type FollowUpChoice = "keep" | "none" | "tomorrow" | "3d" | "7d" | "custom";

function atTen(daysAhead: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(10, 0, 0, 0);
  return d;
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function resolveFollowUp(
  choice: FollowUpChoice,
  custom: string,
): { at: string | null } | undefined {
  switch (choice) {
    case "keep":
      return undefined;
    case "none":
      return { at: null };
    case "tomorrow":
      return { at: atTen(1).toISOString() };
    case "3d":
      return { at: atTen(3).toISOString() };
    case "7d":
      return { at: atTen(7).toISOString() };
    case "custom": {
      const d = custom ? new Date(custom) : null;
      return d && !Number.isNaN(d.getTime()) ? { at: d.toISOString() } : undefined;
    }
  }
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isFollowUpDue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return new Date(iso).getTime() <= end.getTime();
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------
export function LeadContactPanel({
  lead,
  onChanged,
}: {
  lead: ContactableLead;
  onChanged: (patch: LeadPatch) => void;
}) {
  const logContact = useServerFn(logLeadContact);
  const sendEmail = useServerFn(sendLeadEmail);
  const saveFollowUp = useServerFn(setLeadFollowUp);

  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [cart, setCart] = useState<CartInfo>(null);
  const [history, setHistory] = useState<Interaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [tab, setTab] = useState<"whatsapp" | "email" | "registro">(
    lead.phone ? "whatsapp" : "email",
  );
  const [templateId, setTemplateId] = useState("");
  const [waMessage, setWaMessage] = useState("");
  const [subject, setSubject] = useState("Led Maricá — posso te ajudar?");
  const [emailBody, setEmailBody] = useState("");
  const [recordType, setRecordType] = useState<"call" | "note">("call");
  const [recordText, setRecordText] = useState("");
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [followChoice, setFollowChoice] = useState<FollowUpChoice>("keep");
  const [followCustom, setFollowCustom] = useState(toLocalInput(atTen(1)));
  const [busy, setBusy] = useState<null | "wa" | "email" | "record" | "follow">(null);

  // --- dados de apoio -----------------------------------------------------
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const { data } = await supabase
      .from("lead_interactions")
      .select("id, type, content, created_at, metadata")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setHistory((data as Interaction[] | null) ?? []);
    setHistoryLoading(false);
  }, [lead.id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: t } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("active", true)
        .in("category", ["lead", "carrinho", "produto", "relacionamento", "geral"])
        .order("sort_order");
      if (!alive) return;
      const list = (t ?? []) as WhatsappTemplate[];
      setTemplates(list);

      // Carrinho mais recente do lead (pelo vínculo ou pelo e-mail).
      const filters = [`lead_id.eq.${lead.id}`];
      if (lead.email) filters.push(`customer_email.eq.${JSON.stringify(lead.email)}`);
      const { data: carts } = await supabase
        .from("abandoned_carts")
        .select("subtotal_amount, cart_snapshot, converted_order_id")
        .or(filters.join(","))
        .is("converted_order_id", null)
        .order("last_activity_at", { ascending: false })
        .limit(1);
      if (!alive) return;
      const c = carts?.[0];
      const snapshot = (c?.cart_snapshot as Array<Record<string, unknown>> | null) ?? [];
      const cartInfo: CartInfo = c
        ? {
            value: Number(c.subtotal_amount ?? 0),
            firstSlug: (snapshot[0]?.product_slug as string | undefined) ?? null,
            items: snapshot.map((i) => `${String(i.product_name ?? "")} (${Number(i.qty ?? 1)}x)`),
          }
        : null;
      setCart(cartInfo);

      const preferred = cartInfo
        ? list.find((x) => x.category === "carrinho")
        : (list.find((x) => x.name === "Cadastro no site") ??
          list.find((x) => x.category === "lead"));
      setTemplateId((preferred ?? list[0])?.id ?? "");
    })();
    return () => {
      alive = false;
    };
  }, [lead.id, lead.email]);

  const ctx: TemplateContext = useMemo(() => {
    const first = (lead.name ?? "").trim().split(/\s+/)[0] || null;
    const produto =
      lead.product_name ??
      lead.origin_product_name ??
      (cart?.items.length ? cart.items.map((i) => i.replace(/ \(\d+x\)$/, "")).join(", ") : null) ??
      (lead.interest && !/^cadastro no site$/i.test(lead.interest)
        ? lead.interest.replace(/^Carrinho:\s*/i, "")
        : null);
    return {
      nome_cliente: first,
      nome_loja: "Led Maricá",
      whatsapp_loja: STORE_WHATSAPP_LABEL,
      produto,
      valor_carrinho: cart ? brl(cart.value) : null,
      link_carrinho: cart?.firstSlug ? `${SITE}/produto/${cart.firstSlug}` : SITE,
    };
  }, [lead, cart]);

  const selectedTemplate = templates.find((t) => t.id === templateId);

  // Aplica o modelo nos dois canais (mesma base de texto, DRY).
  useEffect(() => {
    if (!selectedTemplate) return;
    const text = renderTemplate(selectedTemplate.body, ctx);
    setWaMessage(text);
    setEmailBody(`${text}\n\nAbraço,\nEquipe Led Maricá`);
  }, [selectedTemplate, ctx]);

  const pendingVars = (text: string) => extractVariables(text);
  const waUrl = buildWhatsappUrl(lead.phone, waMessage);
  const followUp = resolveFollowUp(followChoice, followCustom);

  const afterContact = (contacted: boolean) => {
    const now = new Date().toISOString();
    const patch: LeadPatch = { last_interaction_at: now };
    if (contacted && (!lead.status || lead.status === "novo" || lead.status === "new")) {
      patch.status = "primeiro_contato";
    }
    if (followUp) {
      patch.next_action_at = followUp.at;
      patch.next_action = followUp.at ? "Retornar contato" : null;
    }
    onChanged(patch);
    setFollowChoice("keep");
    void loadHistory();
  };

  // --- ações --------------------------------------------------------------
  const openWhatsapp = async () => {
    if (!waUrl) return toast.error("Este lead não tem WhatsApp válido.");
    const missing = pendingVars(waMessage);
    if (missing.length)
      return toast.error(`Complete antes de enviar: ${missing.map((v) => `{{${v}}}`).join(", ")}`);
    // Abre primeiro (gesto do usuário, evita bloqueio de pop-up) e registra depois.
    window.open(waUrl, "_blank", "noopener");
    setBusy("wa");
    try {
      await logContact({
        data: {
          leadId: lead.id,
          channel: "whatsapp",
          content: waMessage,
          templateName: selectedTemplate?.name,
          followUp,
        },
      });
      toast.success("WhatsApp aberto e registrado no histórico.");
      afterContact(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar o contato.");
    } finally {
      setBusy(null);
    }
  };

  const copyWhatsapp = async () => {
    await navigator.clipboard.writeText(waMessage);
    toast.success("Mensagem copiada.");
  };

  const submitEmail = async () => {
    const missing = [...pendingVars(subject), ...pendingVars(emailBody)];
    if (missing.length)
      return toast.error(`Complete antes de enviar: ${missing.map((v) => `{{${v}}}`).join(", ")}`);
    setBusy("email");
    try {
      const r = await sendEmail({
        data: {
          leadId: lead.id,
          subject,
          body: emailBody,
          templateName: selectedTemplate?.name,
          followUp,
        },
      });
      toast.success(
        r.skipped ? "E-mail registrado (envio desativado neste ambiente)." : "E-mail enviado.",
      );
      afterContact(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar o e-mail.");
    } finally {
      setBusy(null);
    }
  };

  const submitRecord = async () => {
    const outcomeLabel = OUTCOMES.find((o) => o.value === outcome)?.label;
    const content = [outcomeLabel ? `Resultado: ${outcomeLabel}` : null, recordText.trim() || null]
      .filter(Boolean)
      .join("\n");
    if (!content) return toast.error("Escreva o que foi conversado ou escolha o resultado.");
    setBusy("record");
    try {
      await logContact({
        data: {
          leadId: lead.id,
          channel: recordType,
          content,
          outcome: outcome || undefined,
          followUp,
        },
      });
      toast.success("Registrado no histórico.");
      setRecordText("");
      setOutcome("");
      afterContact(recordType === "call");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar.");
    } finally {
      setBusy(null);
    }
  };

  const submitFollowUpOnly = async () => {
    if (!followUp) return;
    setBusy("follow");
    try {
      await saveFollowUp({ data: { leadId: lead.id, at: followUp.at } });
      onChanged({
        next_action_at: followUp.at,
        next_action: followUp.at ? "Retornar contato" : null,
      });
      toast.success(
        followUp.at ? `Retorno marcado para ${formatWhen(followUp.at)}.` : "Retorno removido.",
      );
      setFollowChoice("keep");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar o retorno.");
    } finally {
      setBusy(null);
    }
  };

  // --- render -------------------------------------------------------------
  const due = isFollowUpDue(lead.next_action_at);

  return (
    <section aria-label="Comunicação com o lead" className="space-y-3 pt-2 border-t border-border">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="text-xs">Falar com o cliente</Label>
        {lead.next_action_at && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
              due
                ? "border-amber-500/40 bg-amber-500/10 text-amber-800"
                : "border-border bg-muted text-muted-foreground",
            )}
          >
            <CalendarClock className="h-3 w-3" aria-hidden />
            {due ? "Retornar hoje" : "Retorno"} · {formatWhen(lead.next_action_at)}
          </span>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="whatsapp" disabled={!lead.phone} className="gap-1.5">
            <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
          </TabsTrigger>
          <TabsTrigger value="email" disabled={!lead.email} className="gap-1.5">
            <Mail className="h-4 w-4" aria-hidden /> E-mail
          </TabsTrigger>
          <TabsTrigger value="registro" className="gap-1.5">
            <StickyNote className="h-4 w-4" aria-hidden /> Registrar
          </TabsTrigger>
        </TabsList>

        {(tab === "whatsapp" || tab === "email") && (
          <div className="mt-3">
            <Label htmlFor="lead-template" className="text-xs">
              Modelo
            </Label>
            <select
              id="lead-template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {cart && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Carrinho em aberto: {brl(cart.value)} — {cart.items.join(", ")}
              </p>
            )}
          </div>
        )}

        <TabsContent value="whatsapp" className="space-y-2">
          <Textarea
            aria-label="Mensagem do WhatsApp"
            rows={5}
            value={waMessage}
            onChange={(e) => setWaMessage(e.target.value)}
            className="text-sm"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Para: {lead.phone ?? "—"}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={copyWhatsapp}>
                <Copy className="mr-1 h-4 w-4" aria-hidden /> Copiar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={openWhatsapp}
                disabled={!waUrl || busy !== null}
              >
                {busy === "wa" ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <ExternalLink className="mr-1 h-4 w-4" aria-hidden />
                )}
                Abrir WhatsApp
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="email" className="space-y-2">
          <Input
            aria-label="Assunto"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={150}
            placeholder="Assunto"
          />
          <Textarea
            aria-label="Texto do e-mail"
            rows={7}
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            className="text-sm"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Para: {lead.email ?? "—"}</span>
            <Button
              type="button"
              size="sm"
              onClick={submitEmail}
              disabled={!lead.email || busy !== null}
            >
              {busy === "email" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="mr-1 h-4 w-4" aria-hidden />
              )}
              Enviar e-mail
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="registro" className="space-y-2">
          <div className="flex gap-2" role="radiogroup" aria-label="Tipo de registro">
            {(
              [
                { v: "call", label: "Ligação", Icon: PhoneCall },
                { v: "note", label: "Anotação", Icon: StickyNote },
              ] as const
            ).map(({ v, label, Icon }) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={recordType === v}
                onClick={() => setRecordType(v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  recordType === v
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
              </button>
            ))}
          </div>
          <div
            className="flex flex-wrap gap-1.5"
            role="radiogroup"
            aria-label="Resultado do contato"
          >
            {OUTCOMES.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={outcome === o.value}
                onClick={() => setOutcome(outcome === o.value ? "" : o.value)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  outcome === o.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <Textarea
            aria-label="O que foi conversado"
            rows={3}
            value={recordText}
            onChange={(e) => setRecordText(e.target.value)}
            placeholder="O que o cliente disse? Ex.: achou o frete caro, vai passar na loja sábado…"
            className="text-sm"
          />
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={submitRecord} disabled={busy !== null}>
              {busy === "record" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden />
              )}
              Registrar
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Próximo retorno — vale para a próxima ação acima ou pode ser salvo sozinho */}
      <fieldset className="rounded-md border border-border p-2.5">
        <legend className="px-1 text-[11px] font-medium text-muted-foreground">
          Próximo retorno
        </legend>
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["keep", "Manter"],
              ["tomorrow", "Amanhã 10h"],
              ["3d", "Em 3 dias"],
              ["7d", "Em 1 semana"],
              ["custom", "Escolher"],
              ["none", "Sem retorno"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={followChoice === v}
              onClick={() => setFollowChoice(v)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                followChoice === v
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
          {followChoice === "custom" && (
            <input
              type="datetime-local"
              aria-label="Data e hora do retorno"
              value={followCustom}
              onChange={(e) => setFollowCustom(e.target.value)}
              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
            />
          )}
          {followChoice !== "keep" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={submitFollowUpOnly}
              disabled={busy !== null || !followUp}
            >
              {busy === "follow" && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />}
              Salvar só o retorno
            </Button>
          )}
        </div>
        {followChoice !== "keep" && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Também é aplicado automaticamente ao enviar WhatsApp, e-mail ou registrar.
          </p>
        )}
      </fieldset>

      {/* Histórico */}
      <div>
        <Label className="text-xs">Histórico de contatos</Label>
        {historyLoading ? (
          <p className="mt-1 text-xs text-muted-foreground">Carregando…</p>
        ) : history.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">Nenhum contato registrado ainda.</p>
        ) : (
          <ol className="mt-1 max-h-56 space-y-1.5 overflow-y-auto rounded-md border border-border bg-muted/30 p-2">
            {history.map((h) => (
              <HistoryItem key={h.id} item={h} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

const TYPE_META: Record<string, { label: string; Icon: typeof MessageCircle; tone: string }> = {
  whatsapp: { label: "WhatsApp", Icon: MessageCircle, tone: "text-emerald-700" },
  email: { label: "E-mail", Icon: Mail, tone: "text-sky-700" },
  call: { label: "Ligação", Icon: PhoneCall, tone: "text-violet-700" },
  note: { label: "Anotação", Icon: StickyNote, tone: "text-muted-foreground" },
  status_change: { label: "Sistema", Icon: ArrowRightLeft, tone: "text-muted-foreground" },
};

function HistoryItem({ item }: { item: Interaction }) {
  const meta = TYPE_META[item.type ?? "note"] ?? TYPE_META.note;
  const template = typeof item.metadata?.template === "string" ? item.metadata.template : null;
  return (
    <li className="rounded-md border border-border bg-card px-2 py-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1 font-medium", meta.tone)}>
          <meta.Icon className="h-3.5 w-3.5" aria-hidden /> {meta.label}
          {template && <span className="font-normal text-muted-foreground">· {template}</span>}
        </span>
        <time className="text-[10px] text-muted-foreground" dateTime={item.created_at ?? undefined}>
          {formatWhen(item.created_at)}
        </time>
      </div>
      <p className="mt-1 line-clamp-3 whitespace-pre-line text-muted-foreground">{item.content}</p>
    </li>
  );
}
