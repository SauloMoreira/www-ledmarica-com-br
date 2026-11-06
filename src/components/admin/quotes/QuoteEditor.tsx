import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Building2,
  CheckCircle2,
  Copy,
  Loader2,
  MessageCircle,
  Plus,
  Printer,
  Save,
  Search,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCNPJ, isValidCNPJ, onlyDigits } from "@/lib/cnpj";
import {
  computeQuoteTotals,
  defaultQuoteTerms,
  formatDateTimeBR,
  formatMoney,
  formatPct,
  formatQty,
  marginAlert,
  parseBRNumber,
  paymentText,
  QUOTE_STATUS_CLASS,
  QUOTE_STATUS_LABEL,
  round2,
  suggestedUnitPrice,
  validityText,
  type QuoteStatus,
  type QuoteTerm,
} from "@/lib/quotes";
import { renderTemplate } from "@/lib/whatsappTemplates";
import {
  createQuote,
  duplicateQuote,
  getQuoteProductCosts,
  listQuoteNegotiations,
  lookupQuoteCnpj,
  searchQuoteCompanies,
  searchQuoteProducts,
  setQuoteStatus,
  updateQuote,
  type QuoteBodyInput,
  type QuoteProductOption,
  type QuoteWithItems,
} from "@/server/quotes.functions";

type ItemDraft = {
  key: string;
  product_id: string | null;
  sku: string;
  name: string;
  specs: string;
  ncm: string;
  unit: string;
  qty: string;
  price: string;
  disc: string;
  cost: number | null;
  minMargin: number | null;
  b2bMin: number | null;
};

type Client = {
  company_id: string | null;
  negotiation_id: string | null;
  client_legal_name: string;
  client_trade_name: string;
  client_cnpj: string;
  client_state_registration: string;
  client_contact_name: string;
  client_phone: string;
  client_email: string;
  client_address: string;
  client_reference: string;
};

const EMPTY_CLIENT: Client = {
  company_id: null,
  negotiation_id: null,
  client_legal_name: "",
  client_trade_name: "",
  client_cnpj: "",
  client_state_registration: "",
  client_contact_name: "",
  client_phone: "",
  client_email: "",
  client_address: "",
  client_reference: "",
};

const WHATSAPP_BODY =
  "Olá, {{nome_cliente}}! Segue o orçamento *{{numero}}* da Led Maricá para {{nome_empresa}}.\n" +
  "Total: *{{total}}*\nNo PIX: *{{total_pix}}*\nVálido até {{validade}}.\n" +
  "Qualquer dúvida, estamos à disposição!";

const newKey = () => Math.random().toString(36).slice(2, 10);
const numStr = (n: number, digits = 2) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: digits, useGrouping: false });
const num = (s: string, fallback = 0) => {
  const v = parseBRNumber(s);
  return Number.isFinite(v) ? v : fallback;
};

function fromQuote(q: QuoteWithItems) {
  const client: Client = {
    company_id: q.company_id,
    negotiation_id: q.negotiation_id,
    client_legal_name: q.client_legal_name,
    client_trade_name: q.client_trade_name ?? "",
    client_cnpj: formatCNPJ(q.client_cnpj),
    client_state_registration: q.client_state_registration ?? "",
    client_contact_name: q.client_contact_name ?? "",
    client_phone: q.client_phone ?? "",
    client_email: q.client_email ?? "",
    client_address: q.client_address ?? "",
    client_reference: q.client_reference ?? "",
  };
  const items: ItemDraft[] = q.items.map((i) => ({
    key: i.id,
    product_id: i.product_id,
    sku: i.sku ?? "",
    name: i.name,
    specs: i.specs ?? "",
    ncm: i.ncm ?? "",
    unit: i.unit,
    qty: numStr(i.quantity, 3),
    price: numStr(i.unit_price),
    disc: numStr(i.discount_pct),
    cost: null,
    minMargin: null,
    b2bMin: null,
  }));
  return { client, items };
}

export function QuoteEditor({ initial }: { initial: QuoteWithItems | null }) {
  const navigate = useNavigate();
  const init = useMemo(() => (initial ? fromQuote(initial) : null), [initial]);

  const [quoteId, setQuoteId] = useState<string | null>(initial?.id ?? null);
  const [number, setNumber] = useState<string | null>(initial?.number ?? null);
  const [status, setStatus] = useState<QuoteStatus>(initial?.status ?? "rascunho");
  const [issuedAt, setIssuedAt] = useState<string | null>(initial?.issued_at ?? null);
  const [expiresAt, setExpiresAt] = useState<string | null>(initial?.expires_at ?? null);
  const [client, setClient] = useState<Client>(init?.client ?? EMPTY_CLIENT);
  const [items, setItems] = useState<ItemDraft[]>(init?.items ?? []);
  const [validity, setValidity] = useState(String(initial?.validity_hours ?? 24));
  const [commercialDisc, setCommercialDisc] = useState(numStr(initial?.commercial_discount_pct ?? 0));
  const [freight, setFreight] = useState(numStr(initial?.freight_amount ?? 0));
  const [pix, setPix] = useState(numStr(initial?.pix_discount_pct ?? 5));
  const [terms, setTerms] = useState<QuoteTerm[]>(
    initial?.terms?.length ? initial.terms : defaultQuoteTerms(24, 5),
  );
  const [internalNotes, setInternalNotes] = useState(initial?.internal_notes ?? "");
  const [seller, setSeller] = useState(initial?.seller_name ?? "");
  const [serverTotals, setServerTotals] = useState<{ total: number; total_pix: number } | null>(
    initial ? { total: initial.total, total_pix: initial.total_pix } : null,
  );

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(initial ? new Date() : null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const hydrated = useRef(false);

  // Marca como sujo a cada alteração após a hidratação.
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    setDirty(true);
    dirtyRef.current = true;
  }, [client, items, validity, commercialDisc, freight, pix, terms, internalNotes, seller]);

  // Carrega custos/margens dos produtos já salvos (só no editor).
  useEffect(() => {
    const ids = Array.from(new Set(items.map((i) => i.product_id).filter((x): x is string => !!x)));
    const missing = items.some((i) => i.product_id && i.cost === null && i.b2bMin === null);
    if (!ids.length || !missing) return;
    getQuoteProductCosts({ data: { ids } })
      .then((map) => {
        hydrated.current = false; // não marcar como sujo
        setItems((prev) =>
          prev.map((i) =>
            i.product_id && map[i.product_id]
              ? {
                  ...i,
                  cost: map[i.product_id].cost_price,
                  minMargin: map[i.product_id].min_margin_percent,
                  b2bMin: map[i.product_id].b2b_min_qty,
                }
              : i,
          ),
        );
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id]);

  // Atualiza textos automáticos de validade/pagamento.
  const prevValidity = useRef(Number(validity));
  const prevPix = useRef(num(pix, 5));
  useEffect(() => {
    const vh = Math.round(num(validity, 24));
    const px = num(pix, 5);
    setTerms((ts) =>
      ts.map((t) => {
        if (t.label === "Validade" && t.text === validityText(prevValidity.current)) {
          return { ...t, text: validityText(vh) };
        }
        if (t.label === "Pagamento" && t.text === paymentText(prevPix.current)) {
          return { ...t, text: paymentText(px) };
        }
        return t;
      }),
    );
    prevValidity.current = vh;
    prevPix.current = px;
  }, [validity, pix]);

  const parsedItems = useMemo(
    () =>
      items.map((i) => ({
        quantity: num(i.qty, 0),
        unit_price: num(i.price, 0),
        discount_pct: Math.min(100, Math.max(0, num(i.disc, 0))),
      })),
    [items],
  );

  const totals = useMemo(
    () =>
      computeQuoteTotals({
        items: parsedItems,
        commercial_discount_pct: Math.min(100, Math.max(0, num(commercialDisc, 0))),
        freight_amount: Math.max(0, num(freight, 0)),
        pix_discount_pct: Math.min(100, Math.max(0, num(pix, 5))),
      }),
    [parsedItems, commercialDisc, freight, pix],
  );

  // Margem estimada (interna).
  const margin = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    let known = true;
    const cd = num(commercialDisc, 0) / 100;
    items.forEach((it, idx) => {
      const line = totals.line_totals[idx] * (1 - cd);
      revenue += line;
      if (it.cost == null) known = it.product_id ? false : known;
      else cost += it.cost * parsedItems[idx].quantity;
    });
    if (revenue <= 0 || cost <= 0) return null;
    return { pct: ((revenue - cost) / revenue) * 100, amount: revenue - cost, partial: !known };
  }, [items, totals, parsedItems, commercialDisc]);

  const buildBody = useCallback((): QuoteBodyInput => {
    return {
      company_id: client.company_id,
      negotiation_id: client.negotiation_id,
      client_legal_name: client.client_legal_name,
      client_trade_name: client.client_trade_name,
      client_cnpj: client.client_cnpj,
      client_state_registration: client.client_state_registration,
      client_contact_name: client.client_contact_name,
      client_phone: client.client_phone,
      client_email: client.client_email,
      client_address: client.client_address,
      client_reference: client.client_reference,
      validity_hours: Math.min(720, Math.max(1, Math.round(num(validity, 24)))),
      commercial_discount_pct: Math.min(100, Math.max(0, num(commercialDisc, 0))),
      freight_amount: Math.max(0, num(freight, 0)),
      pix_discount_pct: Math.min(100, Math.max(0, num(pix, 5))),
      terms,
      internal_notes: internalNotes,
      seller_name: seller,
      items: items.map((i, idx) => ({
        product_id: i.product_id,
        sku: i.sku,
        name: i.name.trim(),
        specs: i.specs,
        ncm: i.ncm,
        unit: i.unit || "pç",
        quantity: parsedItems[idx].quantity,
        unit_price: round2(parsedItems[idx].unit_price),
        discount_pct: parsedItems[idx].discount_pct,
      })),
    };
  }, [client, validity, commercialDisc, freight, pix, terms, internalNotes, seller, items, parsedItems]);

  const validationError = useMemo(() => {
    if (client.client_legal_name.trim().length < 2) return "Informe a razão social do cliente";
    if (!isValidCNPJ(client.client_cnpj)) return "CNPJ do cliente inválido";
    for (const [idx, it] of items.entries()) {
      if (!it.name.trim()) return `Item ${idx + 1}: informe o nome`;
      if (!(parsedItems[idx].quantity > 0)) return `Item ${idx + 1}: quantidade inválida`;
      if (!(parsedItems[idx].unit_price >= 0)) return `Item ${idx + 1}: valor inválido`;
    }
    return null;
  }, [client, items, parsedItems]);

  const save = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (savingRef.current) return null;
      if (validationError) {
        if (!opts.silent) toast.error(validationError);
        return null;
      }
      savingRef.current = true;
      setSaving(true);
      try {
        const body = buildBody();
        if (!quoteId) {
          const r = await createQuote({ data: body });
          dirtyRef.current = false;
          setDirty(false);
          setSavedAt(new Date());
          if (!opts.silent) toast.success(`Orçamento ${r.number} criado`);
          navigate({ to: "/admin/orcamentos/$id", params: { id: r.id }, replace: true });
          return r.id;
        }
        const q = await updateQuote({ data: { id: quoteId, body } });
        dirtyRef.current = false;
        setDirty(false);
        setSavedAt(new Date());
        setServerTotals({ total: q.total, total_pix: q.total_pix });
        setExpiresAt(q.expires_at);
        setStatus(q.status);
        if (!opts.silent) toast.success("Orçamento salvo");
        return quoteId;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar");
        return null;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [validationError, buildBody, quoteId, navigate],
  );

  // Autosave de rascunho (debounce 2,5s).
  useEffect(() => {
    if (!dirty || status !== "rascunho" || validationError) return;
    const t = setTimeout(() => {
      void save({ silent: true });
    }, 2500);
    return () => clearTimeout(t);
  }, [dirty, status, validationError, save]);

  useBlocker({
    shouldBlockFn: () =>
      dirtyRef.current && !window.confirm("Há alterações não salvas. Deseja sair mesmo assim?"),
    enableBeforeUnload: () => dirtyRef.current,
  });

  // ---------- Itens ----------
  const updateItem = (key: string, patch: Partial<ItemDraft>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));
  const moveItem = (idx: number, dir: -1 | 1) =>
    setItems((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[j]] = [arr[j], arr[idx]];
      return arr;
    });
  const addBlank = () =>
    setItems((prev) => [
      ...prev,
      {
        key: newKey(),
        product_id: null,
        sku: "",
        name: "",
        specs: "",
        ncm: "",
        unit: "pç",
        qty: "1",
        price: "0",
        disc: "0",
        cost: null,
        minMargin: null,
        b2bMin: null,
      },
    ]);
  const addProduct = (p: QuoteProductOption) =>
    setItems((prev) => [
      ...prev,
      {
        key: newKey(),
        product_id: p.id,
        sku: p.sku ?? "",
        name: p.name,
        specs: p.specs ?? "",
        ncm: p.ncm ?? "",
        unit: p.commercial_unit || "pç",
        qty: String(p.b2b_enabled && p.b2b_min_qty ? p.b2b_min_qty : 1),
        price: numStr(suggestedUnitPrice(p)),
        disc: "0",
        cost: p.cost_price,
        minMargin: p.min_margin_percent,
        b2bMin: p.b2b_enabled ? p.b2b_min_qty : null,
      },
    ]);

  // ---------- Status / ações ----------
  const changeStatus = async (next: "enviado" | "aprovado" | "recusado") => {
    const id = dirtyRef.current || !quoteId ? await save({ silent: true }) : quoteId;
    if (!id) return;
    try {
      await setQuoteStatus({ data: { id, status: next } });
      setStatus(next);
      toast.success(`Orçamento marcado como ${QUOTE_STATUS_LABEL[next].toLowerCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao alterar status");
    }
  };

  const doDuplicate = async () => {
    if (!quoteId) return;
    try {
      const r = await duplicateQuote({ data: { id: quoteId } });
      toast.success(`Orçamento ${r.number} criado`);
      dirtyRef.current = false;
      navigate({ to: "/admin/orcamentos/$id", params: { id: r.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao duplicar");
    }
  };

  const doPrint = async () => {
    const id = dirtyRef.current || !quoteId ? await save({ silent: true }) : quoteId;
    if (!id) return;
    window.open(`/admin/orcamentos/${id}/imprimir`, "_blank", "noopener");
  };

  const copyWhatsapp = async () => {
    const msg = renderTemplate(WHATSAPP_BODY, {
      nome_cliente: client.client_contact_name || client.client_trade_name || client.client_legal_name,
      nome_empresa: client.client_trade_name || client.client_legal_name,
      numero: number ?? "(novo)",
      total: formatMoney(serverTotals?.total ?? totals.total),
      total_pix: formatMoney(serverTotals?.total_pix ?? totals.total_pix),
      validade: expiresAt ? formatDateTimeBR(expiresAt) : `${validity} horas`,
    });
    try {
      await navigator.clipboard.writeText(msg);
      toast.success("Mensagem copiada");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const savedLabel = saving
    ? "Salvando…"
    : dirty
      ? "Alterações não salvas"
      : savedAt
        ? "Salvo"
        : "Novo orçamento";

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/admin/orcamentos"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> Orçamentos
          </Link>
          <h2 className="text-xl font-display font-bold text-foreground font-mono truncate">
            {number ?? "Novo orçamento"}
          </h2>
          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${QUOTE_STATUS_CLASS[status]}`}>
            {QUOTE_STATUS_LABEL[status]}
          </span>
          <span
            className={`text-xs inline-flex items-center gap-1 ${dirty ? "text-warning" : "text-muted-foreground"}`}
            aria-live="polite"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : !dirty && savedAt ? <CheckCircle2 className="w-3 h-3" /> : null}
            {savedLabel}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => save()} disabled={saving}>
            <Save className="w-4 h-4" /> Salvar
          </Button>
          <Button size="sm" variant="outline" onClick={doPrint} disabled={saving}>
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </Button>
          <Button size="sm" variant="outline" onClick={copyWhatsapp}>
            <MessageCircle className="w-4 h-4" /> Copiar WhatsApp
          </Button>
          {quoteId && (
            <Button size="sm" variant="outline" onClick={doDuplicate}>
              <Copy className="w-4 h-4" /> Duplicar
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => changeStatus("enviado")}>
            <Send className="w-4 h-4" /> Enviado
          </Button>
          <Button size="sm" variant="secondary" onClick={() => changeStatus("aprovado")}>
            <CheckCircle2 className="w-4 h-4" /> Aprovado
          </Button>
          <Button size="sm" variant="secondary" onClick={() => changeStatus("recusado")}>
            <XCircle className="w-4 h-4" /> Recusado
          </Button>
        </div>
      </div>
      {validationError && (dirty || quoteId) && (
        <p className="text-xs text-warning" role="status">
          {validationError}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4 min-w-0">
          <ClientSection client={client} onChange={setClient} />

          <section className="bg-card border border-border rounded-lg p-4 space-y-3" aria-labelledby="items-h">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="items-h" className="font-semibold text-foreground">
                Itens
              </h3>
              <div className="flex gap-2">
                <ProductPicker onPick={addProduct} />
                <Button size="sm" variant="outline" onClick={addBlank}>
                  <Plus className="w-4 h-4" /> Item avulso
                </Button>
              </div>
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhum item ainda. Busque um produto do catálogo ou adicione um item avulso.
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <ItemRow
                    key={it.key}
                    idx={idx}
                    item={it}
                    count={items.length}
                    lineTotal={totals.line_totals[idx]}
                    parsed={parsedItems[idx]}
                    commercialDiscPct={num(commercialDisc, 0)}
                    onChange={(p) => updateItem(it.key, p)}
                    onRemove={() => removeItem(it.key)}
                    onMove={(d) => moveItem(idx, d)}
                    onEnter={addBlank}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="bg-card border border-border rounded-lg p-4 space-y-3" aria-labelledby="terms-h">
            <h3 id="terms-h" className="font-semibold text-foreground">
              Condições comerciais
            </h3>
            {terms.map((t, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[140px_1fr_auto] items-start">
                <Input
                  aria-label={`Rótulo da condição ${i + 1}`}
                  value={t.label}
                  onChange={(e) => setTerms((ts) => ts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
                <Textarea
                  aria-label={`Texto da condição ${t.label}`}
                  rows={2}
                  value={t.text}
                  onChange={(e) => setTerms((ts) => ts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remover condição ${t.label}`}
                  onClick={() => setTerms((ts) => ts.filter((_, j) => j !== i))}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setTerms((ts) => [...ts, { label: "", text: "" }])}>
                <Plus className="w-4 h-4" /> Condição
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setTerms(defaultQuoteTerms(Math.round(num(validity, 24)), num(pix, 5)))}
              >
                Restaurar padrão
              </Button>
            </div>
          </section>

          <section className="bg-card border border-border rounded-lg p-4 grid gap-3 sm:grid-cols-2" aria-label="Dados internos">
            <div className="space-y-1">
              <Label htmlFor="q-seller">Vendedor</Label>
              <Input id="q-seller" value={seller} onChange={(e) => setSeller(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="q-validity">Validade (horas)</Label>
              <Input
                id="q-validity"
                inputMode="numeric"
                value={validity}
                onChange={(e) => setValidity(e.target.value.replace(/\D/g, "").slice(0, 3))}
              />
              {issuedAt && expiresAt && (
                <p className="text-xs text-muted-foreground">
                  Emitido em {formatDateTimeBR(issuedAt)} · expira em {formatDateTimeBR(expiresAt)}
                </p>
              )}
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="q-notes">Observações internas (não impressas)</Label>
              <Textarea id="q-notes" rows={3} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-4 self-start bg-card border border-border rounded-lg p-4 space-y-3" aria-label="Resumo">
          <h3 className="font-semibold text-foreground">Resumo</h3>
          <dl className="space-y-1.5 text-sm tabular-nums">
            <Row label={`Subtotal (${items.length} ${items.length === 1 ? "item" : "itens"})`} value={formatMoney(totals.subtotal_gross)} />
            <Row label="Descontos nos itens" value={`− ${formatMoney(totals.items_discount_total)}`} className="text-success" />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <Label htmlFor="q-cdisc" className="text-xs">Desconto comercial %</Label>
                <Input id="q-cdisc" inputMode="decimal" value={commercialDisc} onChange={(e) => setCommercialDisc(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="q-freight" className="text-xs">Frete (R$)</Label>
                <Input id="q-freight" inputMode="decimal" value={freight} onChange={(e) => setFreight(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="q-pix" className="text-xs">Desconto PIX %</Label>
                <Input id="q-pix" inputMode="decimal" value={pix} onChange={(e) => setPix(e.target.value)} />
              </div>
            </div>
            {totals.commercial_discount_amount > 0 && (
              <Row label="Desconto comercial" value={`− ${formatMoney(totals.commercial_discount_amount)}`} className="text-success" />
            )}
            <Row label="Frete" value={num(freight, 0) > 0 ? formatMoney(num(freight, 0)) : "Grátis"} />
            <div className="border-t border-border pt-2 flex justify-between items-baseline">
              <dt className="font-semibold">TOTAL</dt>
              <dd className="text-xl font-bold">{formatMoney(totals.total)}</dd>
            </div>
            <Row label={`No PIX (−${formatPct(num(pix, 5))}%)`} value={formatMoney(totals.total_pix)} className="font-semibold" />
            {totals.savings > 0 && (
              <p className="text-xs text-success">Economia de {formatMoney(totals.savings)} neste orçamento</p>
            )}
            {serverTotals && !dirty && Math.abs(serverTotals.total - totals.total) > 0.009 && (
              <p className="text-xs text-warning">Total salvo no servidor: {formatMoney(serverTotals.total)}</p>
            )}
          </dl>
          <div className="rounded-md border border-dashed border-border p-3 text-xs space-y-1" aria-label="Margem interna">
            <p className="font-semibold text-muted-foreground uppercase tracking-wide">Interno · não impresso</p>
            {margin ? (
              <p className={margin.pct < 0 ? "text-destructive" : margin.pct < 15 ? "text-warning" : "text-foreground"}>
                Margem estimada: <strong>{formatPct(Math.round(margin.pct * 10) / 10)}%</strong> ({formatMoney(margin.amount)})
                {margin.partial && " · parcial (itens sem custo)"}
              </p>
            ) : (
              <p className="text-muted-foreground">Margem indisponível (sem custo cadastrado).</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex justify-between gap-2 ${className ?? ""}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ItemRow({
  idx,
  item,
  count,
  lineTotal,
  parsed,
  commercialDiscPct,
  onChange,
  onRemove,
  onMove,
  onEnter,
}: {
  idx: number;
  item: ItemDraft;
  count: number;
  lineTotal: number;
  parsed: { quantity: number; unit_price: number; discount_pct: number };
  commercialDiscPct: number;
  onChange: (p: Partial<ItemDraft>) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
  onEnter: () => void;
}) {
  const netUnit = parsed.unit_price * (1 - parsed.discount_pct / 100) * (1 - commercialDiscPct / 100);
  const alert = marginAlert(netUnit, item.cost, item.minMargin);
  const belowMinQty = item.b2bMin != null && parsed.quantity < item.b2bMin;
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onEnter();
    }
  };
  const id = `it-${item.key}`;
  return (
    <div
      className={`rounded-md border p-3 space-y-2 ${
        alert === "below_cost" ? "border-destructive/60 bg-destructive/5" : alert ? "border-warning/60 bg-warning/5" : "border-border"
      }`}
    >
      <div className="flex gap-2 items-start">
        <span className="font-mono text-xs text-muted-foreground pt-2.5 w-6">{String(idx + 1).padStart(2, "0")}</span>
        <div className="flex-1 grid gap-2 sm:grid-cols-[1fr_120px_110px]">
          <Input aria-label={`Nome do item ${idx + 1}`} placeholder="Produto / descrição" value={item.name} onChange={(e) => onChange({ name: e.target.value })} onKeyDown={onKey} />
          <Input aria-label={`SKU do item ${idx + 1}`} placeholder="SKU" value={item.sku} onChange={(e) => onChange({ sku: e.target.value })} onKeyDown={onKey} />
          <Input aria-label={`NCM do item ${idx + 1}`} placeholder="NCM" value={item.ncm} onChange={(e) => onChange({ ncm: e.target.value })} onKeyDown={onKey} />
        </div>
        <div className="flex flex-col sm:flex-row">
          <Button size="icon" variant="ghost" aria-label="Mover para cima" disabled={idx === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Mover para baixo" disabled={idx === count - 1} onClick={() => onMove(1)}>
            <ArrowDown className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" aria-label={`Remover item ${idx + 1}`} onClick={onRemove}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="pl-8 grid gap-2 grid-cols-2 sm:grid-cols-[1fr_70px_90px_110px_80px_110px] items-end">
        <div className="col-span-2 sm:col-span-1">
          <Label htmlFor={`${id}-specs`} className="text-xs text-muted-foreground">Especificações</Label>
          <Input id={`${id}-specs`} value={item.specs} onChange={(e) => onChange({ specs: e.target.value })} onKeyDown={onKey} />
        </div>
        <div>
          <Label htmlFor={`${id}-unit`} className="text-xs text-muted-foreground">Un.</Label>
          <Input id={`${id}-unit`} value={item.unit} maxLength={10} onChange={(e) => onChange({ unit: e.target.value })} onKeyDown={onKey} />
        </div>
        <div>
          <Label htmlFor={`${id}-qty`} className="text-xs text-muted-foreground">Qtd.</Label>
          <Input id={`${id}-qty`} inputMode="decimal" value={item.qty} onChange={(e) => onChange({ qty: e.target.value })} onKeyDown={onKey} aria-invalid={!(parsed.quantity > 0)} />
        </div>
        <div>
          <Label htmlFor={`${id}-price`} className="text-xs text-muted-foreground">Unitário (R$)</Label>
          <Input id={`${id}-price`} inputMode="decimal" value={item.price} onChange={(e) => onChange({ price: e.target.value })} onKeyDown={onKey} />
        </div>
        <div>
          <Label htmlFor={`${id}-disc`} className="text-xs text-muted-foreground">Desc. %</Label>
          <Input id={`${id}-disc`} inputMode="decimal" value={item.disc} onChange={(e) => onChange({ disc: e.target.value })} onKeyDown={onKey} />
        </div>
        <div className="text-right">
          <span className="text-xs text-muted-foreground block">Total</span>
          <span className="font-semibold tabular-nums">{formatMoney(lineTotal)}</span>
        </div>
      </div>
      {(alert || belowMinQty) && (
        <div className="pl-8 space-y-1 text-xs" role="alert">
          {alert === "below_cost" && (
            <p className="text-destructive inline-flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Preço líquido {formatMoney(netUnit)} abaixo do custo ({formatMoney(item.cost ?? 0)}).
            </p>
          )}
          {alert === "below_min_margin" && (
            <p className="text-warning inline-flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Abaixo da margem mínima de {formatPct(item.minMargin ?? 0)}% (piso{" "}
              {formatMoney((item.cost ?? 0) * (1 + (item.minMargin ?? 0) / 100))}).
            </p>
          )}
          {belowMinQty && (
            <p className="text-warning inline-flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Quantidade abaixo do mínimo atacado ({formatQty(item.b2bMin ?? 0)}).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function ProductPicker({ onPick }: { onPick: (p: QuoteProductOption) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [rows, setRows] = useState<QuoteProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    searchQuoteProducts({ data: { q: dq } })
      .then((r) => alive && setRows(r))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro na busca"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [dq, open]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm">
          <Search className="w-4 h-4" /> Produto do catálogo
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,460px)] p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Nome, SKU ou EAN…" value={q} onValueChange={setQ} />
          <CommandList>
            {loading && <div className="p-3 text-xs text-muted-foreground">Buscando…</div>}
            <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
            <CommandGroup>
              {rows.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => {
                    onPick(p);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {p.sku ?? "sem SKU"} · {formatMoney(suggestedUnitPrice(p))}
                      {p.b2b_enabled && p.b2b_price ? " · atacado" : ""}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type CompanyOption = Awaited<ReturnType<typeof searchQuoteCompanies>>[number];
type NegotiationOption = Awaited<ReturnType<typeof listQuoteNegotiations>>[number];

function ClientSection({ client, onChange }: { client: Client; onChange: (c: Client) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [negs, setNegs] = useState<NegotiationOption[]>([]);
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    if (!open) return;
    searchQuoteCompanies({ data: { q: dq } })
      .then(setCompanies)
      .catch(() => setCompanies([]));
  }, [dq, open]);

  useEffect(() => {
    listQuoteNegotiations({ data: { company_id: client.company_id } })
      .then(setNegs)
      .catch(() => setNegs([]));
  }, [client.company_id]);

  const set = (k: keyof Client, v: string | null) => onChange({ ...client, [k]: v });
  const cnpjDigits = onlyDigits(client.client_cnpj);
  const cnpjInvalid = cnpjDigits.length === 14 && !isValidCNPJ(cnpjDigits);

  const pickCompany = (c: CompanyOption) => {
    const address = [
      [c.address_street, c.address_number].filter(Boolean).join(", "),
      c.address_neighborhood,
      [c.address_city, c.address_state].filter(Boolean).join("/"),
      c.address_zipcode,
    ]
      .filter(Boolean)
      .join(" · ");
    onChange({
      ...client,
      company_id: c.id,
      negotiation_id: null,
      client_legal_name: c.legal_name,
      client_trade_name: c.trade_name ?? "",
      client_cnpj: formatCNPJ(c.cnpj),
      client_state_registration: c.state_registration ?? "",
      client_contact_name: c.contact_name ?? "",
      client_phone: c.contact_phone ?? "",
      client_email: c.contact_email ?? "",
      client_address: address,
    });
    setOpen(false);
  };

  const lookup = async () => {
    if (!isValidCNPJ(client.client_cnpj)) {
      toast.error("CNPJ inválido");
      return;
    }
    setLooking(true);
    try {
      const r = await lookupQuoteCnpj({ data: { cnpj: client.client_cnpj } });
      if (!r.ok) {
        toast.error(r.reason);
        return;
      }
      onChange({
        ...client,
        client_legal_name: r.legalName || client.client_legal_name,
        client_trade_name: r.tradeName ?? client.client_trade_name,
        client_phone: client.client_phone || (r.phone ?? ""),
        client_email: client.client_email || (r.email ?? ""),
        client_address: client.client_address || (r.address ?? ""),
      });
      toast.success(`CNPJ ${r.situation || "consultado"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na consulta");
    } finally {
      setLooking(false);
    }
  };

  const field = (k: keyof Client, label: string, cls = "", extra: Partial<React.ComponentProps<typeof Input>> = {}) => (
    <div className={`space-y-1 ${cls}`}>
      <Label htmlFor={`c-${k}`} className="text-xs">{label}</Label>
      <Input id={`c-${k}`} value={(client[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} {...extra} />
    </div>
  );

  return (
    <section className="bg-card border border-border rounded-lg p-4 space-y-3" aria-labelledby="client-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="client-h" className="font-semibold text-foreground">Cliente</h3>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              <Building2 className="w-4 h-4" /> {client.company_id ? "Trocar empresa" : "Buscar empresa cadastrada"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(92vw,420px)] p-0" align="end">
            <Command shouldFilter={false}>
              <CommandInput placeholder="Razão social ou CNPJ…" value={q} onValueChange={setQ} />
              <CommandList>
                <CommandEmpty>Nenhuma empresa encontrada.</CommandEmpty>
                <CommandGroup>
                  {companies.map((c) => (
                    <CommandItem key={c.id} value={c.id} onSelect={() => pickCompany(c)}>
                      <div className="min-w-0">
                        <div className="truncate text-sm">{c.trade_name || c.legal_name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{formatCNPJ(c.cnpj)}</div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {client.company_id && (
        <p className="text-xs text-muted-foreground">
          Vinculado a empresa cadastrada.{" "}
          <button type="button" className="underline" onClick={() => onChange({ ...client, company_id: null, negotiation_id: null })}>
            Desvincular
          </button>
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        {field("client_legal_name", "Razão social *", "sm:col-span-2")}
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="c-client_cnpj" className="text-xs">CNPJ *</Label>
          <div className="flex gap-2">
            <Input
              id="c-client_cnpj"
              value={client.client_cnpj}
              inputMode="numeric"
              aria-invalid={cnpjInvalid}
              aria-describedby={cnpjInvalid ? "cnpj-err" : undefined}
              onChange={(e) => set("client_cnpj", formatCNPJ(e.target.value))}
            />
            <Button type="button" size="sm" variant="outline" onClick={lookup} disabled={looking || cnpjDigits.length !== 14}>
              {looking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Consultar
            </Button>
          </div>
          {cnpjInvalid && <p id="cnpj-err" className="text-xs text-destructive">CNPJ inválido</p>}
        </div>
        {field("client_trade_name", "Nome fantasia", "sm:col-span-2")}
        {field("client_state_registration", "Inscrição estadual")}
        {field("client_contact_name", "Contato")}
        {field("client_phone", "Telefone", "", { inputMode: "tel" })}
        {field("client_email", "E-mail", "", { type: "email" })}
        {field("client_reference", "Obra / referência", "sm:col-span-2")}
        {field("client_address", "Endereço", "sm:col-span-4")}
        <div className="space-y-1 sm:col-span-4">
          <Label htmlFor="c-neg" className="text-xs">Negociação B2B vinculada (opcional)</Label>
          <Select
            value={client.negotiation_id ?? "none"}
            onValueChange={(v) => set("negotiation_id", v === "none" ? null : v)}
          >
            <SelectTrigger id="c-neg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhuma</SelectItem>
              {negs.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.company_name ?? "Sem nome"} · {n.cnpj ? formatCNPJ(n.cnpj) : "—"} · {new Date(n.created_at).toLocaleDateString("pt-BR")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}
