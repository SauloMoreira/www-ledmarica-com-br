import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  MessageSquareText,
  Package,
  ShoppingCart,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { StoreLayout } from "@/components/layout/StoreLayout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buildSeo } from "@/lib/seo";
import { formatBRL, STORE_WHATSAPP } from "@/lib/domain";
import { useCart } from "@/stores/cartStore";
import { cartSnapshot, trackAddedSince, type CartAdditionInput } from "@/lib/cartTracking";
import { supabase } from "@/integrations/supabase/client";
import { resolveQuickBuyCodes, type QuickBuyResolvedLine } from "@/server/quickBuy.functions";
import { autocompleteSearch } from "@/server/productSearch.functions";
import { getPublicCompanySettings } from "@/server/institutional.functions";
import { ProductImagePlaceholder } from "@/components/store/ProductImagePlaceholder";
import { CsvImportButton } from "@/components/quickbuy/CsvImportButton";
import type { CsvParsedRow } from "@/lib/quickBuyCsv";

export const Route = createFileRoute("/compra-rapida")({
  head: () =>
    buildSeo({
      title: "Compra rápida por SKU ou código de barras | Led Maricá",
      description:
        "Adicione vários produtos ao carrinho informando SKU, EAN/GTIN ou nome. Ideal para compras empresariais.",
      url: "/compra-rapida",
    }),
  component: CompraRapidaPage,
});

function onlyDigits(s: string | null | undefined) {
  return (s ?? "").replace(/\D+/g, "");
}

type ParsedLine = { code: string; qty: number; raw: string };

function parseInputLines(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // Aceita SKU;qtd | SKU,qtd | SKU<espaços>qtd
    const m = trimmed.match(/^(.+?)[\s;,]+(\d+)\s*$/);
    if (m) {
      out.push({ code: m[1].trim(), qty: parseInt(m[2], 10), raw: trimmed });
    } else {
      // Sem qty -> assume 1
      out.push({ code: trimmed, qty: 1, raw: trimmed });
    }
  }
  return out.slice(0, 100);
}

type CompanyStatus = "guest" | "pf" | "pending" | "approved" | "blocked" | "rejected";

function CompraRapidaPage() {
  const cart = useCart();
  const router = useRouter();
  const [text, setText] = useState("");
  const [resolved, setResolved] = useState<QuickBuyResolvedLine[]>([]);
  const [companyStatus, setCompanyStatus] = useState<CompanyStatus>("guest");
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyCnpj, setCompanyCnpj] = useState<string | null>(null);

  // Busca rápida individual
  const [searchQ, setSearchQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(searchQ), 280);
    return () => clearTimeout(id);
  }, [searchQ]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user?.id;
      if (!userId) {
        if (mounted) setCompanyStatus("guest");
        return;
      }
      const { data: link } = await supabase
        .from("company_users")
        .select("company_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (!link) {
        if (mounted) setCompanyStatus("pf");
        return;
      }
      const { data: company } = await supabase
        .from("companies")
        .select("status, legal_name, trade_name, cnpj")
        .eq("id", link.company_id)
        .maybeSingle();
      if (!mounted || !company) return;
      setCompanyStatus(company.status as CompanyStatus);
      setCompanyName(company.trade_name || company.legal_name);
      setCompanyCnpj(company.cnpj ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const isApproved = companyStatus === "approved";

  const { data: companyData } = useQuery({
    queryKey: ["public-company-settings"],
    staleTime: 1000 * 60 * 30,
    queryFn: () => getPublicCompanySettings(),
  });
  const supportWhats = onlyDigits(companyData?.company?.support_whatsapp) || STORE_WHATSAPP;

  // Autocomplete (busca rápida individual)
  const { data: suggestions } = useQuery({
    queryKey: ["quickbuy-autocomplete", debouncedQ],
    enabled: debouncedQ.trim().length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await autocompleteSearch({ data: { q: debouncedQ.trim() } });
      return res.suggestions.filter((s: any) => s.kind === "product");
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (lines: ParsedLine[]) => {
      const res = await resolveQuickBuyCodes({
        data: { items: lines.map((l) => ({ code: l.code, qty: l.qty })) },
      });
      return res;
    },
    onSuccess: (res) => {
      setResolved((prev) => {
        // anexa, mantendo dedupe por product_id quando existir
        const merged = [...prev];
        for (const ln of res.lines) {
          const idx = ln.product_id ? merged.findIndex((x) => x.product_id === ln.product_id) : -1;
          if (idx >= 0) {
            merged[idx] = { ...ln, requested_quantity: ln.requested_quantity };
          } else {
            merged.push(ln);
          }
        }
        return merged;
      });
      setText("");
    },
    onError: (err: any) => {
      toast.error(err?.message || "Erro ao resolver códigos");
    },
  });

  const parsedLines = useMemo(() => parseInputLines(text), [text]);

  const handleResolve = () => {
    if (parsedLines.length === 0) {
      toast.error("Adicione pelo menos uma linha de código.");
      return;
    }
    resolveMutation.mutate(parsedLines);
  };

  const removeLine = (idx: number) => {
    setResolved((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateQty = (idx: number, qty: number) => {
    if (qty < 1) return;
    setResolved((prev) => {
      const next = [...prev];
      const ln = next[idx];
      // Recalcula preview B2B local: se min/mult atendidos -> b2b_price; senão -> retail
      const retail = ln.sale_price ?? ln.retail_price ?? 0;
      let applied = retail;
      let source: QuickBuyResolvedLine["pricing_source_preview"] = "retail";
      const warnings: string[] = (ln.warnings ?? []).filter(
        (w) => !w.startsWith("Para acessar o preço empresa"),
      );
      if (ln.b2b_price != null && ln.b2b_min_quantity != null && ln.b2b_price > 0) {
        const min = ln.b2b_min_quantity;
        const mult = ln.b2b_qty_multiple ?? 1;
        if (qty >= min && (mult <= 1 || (qty - min) % mult === 0)) {
          applied = ln.b2b_price;
          source = "b2b";
        } else if (qty < min) {
          warnings.push(
            `Para acessar o preço empresa deste produto, compre a partir de ${min} unidades. Com a quantidade atual, será aplicado o preço de varejo.`,
          );
        }
      }
      next[idx] = {
        ...ln,
        requested_quantity: qty,
        applied_preview_price: applied,
        pricing_source_preview: source,
        warnings,
      };
      return next;
    });
  };

  const addQuickPick = (s: any) => {
    // chama RPC para garantir match completo (pode ter B2B etc)
    resolveMutation.mutate([{ code: s.slug || s.name, qty: 1, raw: s.name }]);
  };

  const handleCsvParsed = (rows: CsvParsedRow[]) => {
    if (rows.length === 0) return;
    resolveMutation.mutate(rows.map((r) => ({ code: r.code, qty: r.qty, raw: r.raw })));
  };

  const handleAddAllToCart = () => {
    const valid = resolved.filter(
      (ln) => ln.match_status === "found" && ln.product_id && ln.applied_preview_price != null,
    );
    if (valid.length === 0) {
      toast.error("Nenhum item válido para adicionar.");
      return;
    }
    let added = 0;
    // Um único AddToCart com as linhas que de fato entraram no carrinho.
    const tracked: CartAdditionInput[] = valid.map((ln) => ({
      productId: ln.product_id!,
      name: ln.product_name || "",
      unitPrice: ln.applied_preview_price!,
    }));
    const snap = cartSnapshot(tracked.map((t) => t.productId));
    for (const ln of valid) {
      const useB2b = ln.pricing_source_preview === "b2b";
      cart.addItem(
        {
          productId: ln.product_id!,
          name: ln.product_name || "",
          slug: ln.product_slug || "",
          price: ln.applied_preview_price!,
          image: ln.image_url ?? null,
          stock: ln.available_stock,
          freeShippingEligible: false,
          minQty: useB2b ? (ln.b2b_min_quantity ?? 1) : 1,
          qtyMultiple: useB2b ? (ln.b2b_qty_multiple ?? 1) : 1,
          source: useB2b ? "b2b" : "b2c",
        },
        ln.requested_quantity,
        { openDrawer: false },
      );
      added += 1;
    }
    trackAddedSince(snap, tracked);
    const hasErrors = resolved.length > valid.length;
    toast.success(
      hasErrors
        ? `${added} item(ns) adicionado(s). Revise os itens com pendência.`
        : `${added} item(ns) adicionado(s) ao carrinho.`,
      {
        duration: 6000,
        position: "top-center",
        action: {
          label: "Ver carrinho",
          onClick: () => router.navigate({ to: "/carrinho" }),
        },
      },
    );
  };

  // Totais
  const totals = useMemo(() => {
    let retail = 0;
    let applied = 0;
    let count = 0;
    for (const ln of resolved) {
      if (ln.match_status !== "found" || ln.applied_preview_price == null) continue;
      const r = ln.sale_price ?? ln.retail_price ?? ln.applied_preview_price;
      retail += r * ln.requested_quantity;
      applied += ln.applied_preview_price * ln.requested_quantity;
      count += ln.requested_quantity;
    }
    return {
      retail,
      applied,
      savings: Math.max(0, retail - applied),
      count,
    };
  }, [resolved]);

  // CTA de negociação WhatsApp
  const whatsappLink = useMemo(() => {
    const itensTxt = resolved
      .filter((ln) => ln.match_status === "found")
      .map((ln) => `- ${ln.product_name} (${ln.sku ?? "-"}) x ${ln.requested_quantity}`)
      .join("\n");
    const lines = [
      "Olá! Gostaria de negociar uma compra B2B com os seguintes itens:",
      "",
      itensTxt || "(nenhum item ainda)",
    ];
    if (companyName) lines.push("", `Empresa: ${companyName}`);
    if (companyCnpj) lines.push(`CNPJ: ${companyCnpj}`);
    lines.push("", "Pode me ajudar com uma condição comercial?");
    return `https://wa.me/${supportWhats}?text=${encodeURIComponent(lines.join("\n"))}`;
  }, [resolved, companyName, companyCnpj, supportWhats]);

  return (
    <StoreLayout>
      <section className="bg-gradient-to-br from-primary/5 via-background to-background border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-xs font-semibold mb-3">
            <Zap className="w-4 h-4" /> Compra rápida
          </div>
          <h1 className="text-2xl md:text-4xl font-display font-bold text-foreground">
            Monte sua compra por SKU, código de barras ou nome
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-2 max-w-2xl">
            Cole vários códigos e quantidades de uma vez ou use a busca rápida abaixo. Os preços
            finais e o estoque são confirmados no carrinho e no checkout.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-6">
        <ClientStatusBanner status={companyStatus} companyName={companyName} />
      </section>

      <section className="max-w-6xl mx-auto px-4 pb-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna 1: entrada em lote */}
        <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
          <h2 className="font-display font-bold text-foreground text-lg">Adicionar por código</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Uma linha por item. Aceita SKU, EAN/GTIN ou nome. Separe a quantidade com{" "}
            <code className="px-1 rounded bg-muted">;</code>,{" "}
            <code className="px-1 rounded bg-muted">,</code> ou espaço.
          </p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`REF50W;10\n7891234567890;5\nPAINEL18W 20`}
            rows={8}
            className="mt-3 font-mono text-sm"
            aria-label="Códigos e quantidades"
          />
          <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {parsedLines.length} linha{parsedLines.length === 1 ? "" : "s"} identificada
              {parsedLines.length === 1 ? "" : "s"} (máx. 100)
            </span>
            <button
              type="button"
              onClick={handleResolve}
              disabled={resolveMutation.isPending || parsedLines.length === 0}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-primary text-primary-foreground font-semibold hover:brightness-110 transition shadow-primary disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              <Package className="w-4 h-4" />
              {resolveMutation.isPending ? "Buscando..." : "Buscar produtos"}
            </button>
          </div>

          {/* Busca rápida individual */}
          <div className="mt-6 pt-5 border-t border-border">
            <h3 className="font-semibold text-foreground text-sm">Buscar item por nome / SKU</h3>
            <div className="relative mt-2">
              <Input
                type="search"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Ex: refletor 50w, 7891234567890, REF50W"
                className="h-10"
              />
              {searchQ && (
                <button
                  type="button"
                  onClick={() => setSearchQ("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                  aria-label="Limpar busca"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {suggestions && suggestions.length > 0 && (
              <ul className="mt-2 max-h-72 overflow-auto border border-border rounded-md divide-y divide-border bg-background">
                {suggestions.map((s: any) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        addQuickPick(s);
                        setSearchQ("");
                      }}
                      className="w-full flex items-center gap-3 p-2 text-left hover:bg-muted transition"
                    >
                      {s.image ? (
                        <img
                          src={s.image}
                          alt=""
                          className="w-10 h-10 rounded object-cover bg-muted"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                          <ProductImagePlaceholder iconSize={20} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{s.name}</div>
                        {s.brand && (
                          <div className="text-[11px] text-muted-foreground">{s.brand}</div>
                        )}
                      </div>
                      <div className="text-xs font-semibold text-primary">
                        {s.sale_price != null
                          ? formatBRL(Number(s.sale_price))
                          : s.price != null
                            ? formatBRL(Number(s.price))
                            : "—"}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Importação CSV */}
          <CsvImportButton onParsed={handleCsvParsed} isProcessing={resolveMutation.isPending} />
        </div>

        {/* Coluna 2: lista resolvida */}
        <div className="bg-card border border-border rounded-xl p-4 sm:p-5 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-bold text-foreground text-lg">Itens da compra</h2>
            {resolved.length > 0 && (
              <button
                type="button"
                onClick={() => setResolved([])}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> Limpar lista
              </button>
            )}
          </div>

          {resolved.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Package className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground max-w-xs">
                Cole seus códigos ao lado e clique em <strong>Buscar produtos</strong>. Os itens
                aparecerão aqui para revisão antes de ir para o carrinho.
              </p>
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-2 max-h-[520px] overflow-auto pr-1">
              {resolved.map((ln, idx) => (
                <ResolvedLineCard
                  key={`${ln.product_id ?? "x"}-${idx}`}
                  line={ln}
                  onRemove={() => removeLine(idx)}
                  onChangeQty={(q) => updateQty(idx, q)}
                />
              ))}
            </ul>
          )}

          {resolved.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Itens válidos</span>
                <span className="font-medium text-foreground">{totals.count}</span>
              </div>
              {totals.savings > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground line-through">
                    {formatBRL(totals.retail)}
                  </span>
                  <span className="text-success font-semibold">
                    -{formatBRL(totals.savings)} (preço empresa)
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Subtotal estimado</span>
                <span className="text-xl font-display font-extrabold text-primary">
                  {formatBRL(totals.applied)}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                * O preço final, o estoque e as condições B2B são reconfirmados no carrinho e no
                checkout.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleAddAllToCart}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-11 px-4 rounded-md bg-primary text-primary-foreground font-semibold hover:brightness-110 transition shadow-primary"
                >
                  <ShoppingCart className="w-4 h-4" /> Adicionar ao carrinho
                </button>
                {(isApproved || companyStatus === "pending") && (
                  <a
                    data-wa-origin="compra_rapida"
                    href={whatsappLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-md border border-border bg-background text-foreground font-semibold hover:bg-muted transition text-sm"
                  >
                    <MessageSquareText className="w-4 h-4" /> Negociar B2B
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </StoreLayout>
  );
}

/* --------------------------- Linha resolvida --------------------------- */

function ResolvedLineCard({
  line,
  onRemove,
  onChangeQty,
}: {
  line: QuickBuyResolvedLine;
  onRemove: () => void;
  onChangeQty: (q: number) => void;
}) {
  const isFound = line.match_status === "found";
  const isMultiple = line.match_status === "multiple_matches";
  const tone =
    line.match_status === "found"
      ? "border-border"
      : line.match_status === "out_of_stock"
        ? "border-warning/40 bg-warning/5"
        : "border-destructive/40 bg-destructive/5";

  return (
    <li className={`border rounded-lg p-3 flex gap-3 ${tone}`}>
      {line.image_url ? (
        <img
          src={line.image_url}
          alt=""
          className="w-16 h-16 rounded object-cover bg-muted shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-16 h-16 rounded bg-muted flex items-center justify-center shrink-0">
          <ProductImagePlaceholder iconSize={28} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground">
              Código: <span className="font-mono">{line.original_code}</span>
            </div>
            <div className="text-sm font-medium text-foreground truncate">
              {line.product_name ?? (
                <span className="text-destructive">Produto não encontrado</span>
              )}
            </div>
            {line.sku && <div className="text-[11px] text-muted-foreground">SKU: {line.sku}</div>}
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            aria-label="Remover linha"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {isFound && (
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-muted-foreground">Qtd</label>
              <Input
                type="number"
                min={1}
                value={line.requested_quantity}
                onChange={(e) => onChangeQty(parseInt(e.target.value, 10) || 1)}
                className="h-8 w-20 text-sm"
              />
            </div>
            <div className="ml-auto text-right">
              {line.pricing_source_preview === "b2b" && line.sale_price != null && (
                <div className="text-[11px] text-muted-foreground line-through">
                  {formatBRL(line.sale_price ?? line.retail_price ?? 0)}
                </div>
              )}
              <div className="text-base font-display font-extrabold text-primary">
                {line.applied_preview_price != null
                  ? formatBRL(line.applied_preview_price * line.requested_quantity)
                  : "—"}
              </div>
              {line.pricing_source_preview === "b2b" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-primary text-primary-foreground px-1.5 py-0.5 rounded mt-0.5">
                  Preço empresa
                </span>
              )}
            </div>
          </div>
        )}

        {isMultiple && line.multiple_options && line.multiple_options.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            Vários produtos correspondem. Refine o código:
            <ul className="mt-1 space-y-1">
              {line.multiple_options.slice(0, 5).map((o) => (
                <li key={o.product_id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {o.name} {o.sku ? <span className="text-[10px]">({o.sku})</span> : null}
                  </span>
                  <Link
                    to="/produto/$slug"
                    params={{ slug: o.slug }}
                    className="text-primary text-[11px] font-semibold underline shrink-0"
                  >
                    ver
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {line.warnings && line.warnings.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {line.warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 text-[11px] text-foreground/80 bg-warning/10 border border-warning/30 rounded px-2 py-1"
              >
                <AlertTriangle className="w-3 h-3 mt-0.5 text-warning shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {!isFound && !isMultiple && line.match_status !== "invalid_quantity" && (
          <p className="text-[11px] text-destructive mt-1">
            {line.match_status === "not_found" && "Produto não encontrado."}
            {line.match_status === "inactive_product" && "Produto indisponível."}
            {line.match_status === "no_price" && "Produto sem preço cadastrado."}
            {line.match_status === "out_of_stock" && "Sem estoque no momento."}
          </p>
        )}
        {line.match_status === "invalid_quantity" && (
          <p className="text-[11px] text-destructive mt-1">Informe uma quantidade válida.</p>
        )}
      </div>
    </li>
  );
}

/* --------------------------- Banner por perfil --------------------------- */

function ClientStatusBanner({
  status,
  companyName,
}: {
  status: CompanyStatus;
  companyName: string | null;
}) {
  const base = "flex items-start gap-3 p-4 rounded-lg border text-sm";
  if (status === "guest") {
    return (
      <div className={`${base} bg-primary/5 border-primary/30`}>
        <Info className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
        <div>
          <div className="font-semibold text-foreground">Você está navegando como visitante</div>
          <div className="text-muted-foreground mt-0.5">
            Para condições B2B,{" "}
            <Link to={"/cadastro-empresa" as never} className="font-semibold underline">
              cadastre sua empresa
            </Link>{" "}
            ou{" "}
            <Link to="/login" className="font-semibold underline">
              faça login
            </Link>
            .
          </div>
        </div>
      </div>
    );
  }
  if (status === "pf") {
    return (
      <div className={`${base} bg-primary/5 border-primary/30`}>
        <Info className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
        <div>
          <div className="font-semibold text-foreground">Conta pessoa física</div>
          <div className="text-muted-foreground mt-0.5">
            Para acessar preços B2B,{" "}
            <Link to={"/cadastro-empresa" as never} className="font-semibold underline">
              cadastre sua empresa
            </Link>
            .
          </div>
        </div>
      </div>
    );
  }
  if (status === "pending") {
    return (
      <div className={`${base} bg-warning/10 border-warning/40`}>
        <Info className="w-5 h-5 mt-0.5 shrink-0 text-warning" />
        <div>
          <div className="font-semibold text-foreground">
            Cadastro empresarial em análise{companyName ? ` — ${companyName}` : ""}
          </div>
          <div className="text-muted-foreground mt-0.5">
            Enquanto isso, você pode comprar com preço normal de varejo.
          </div>
        </div>
      </div>
    );
  }
  if (status === "blocked" || status === "rejected") {
    return (
      <div className={`${base} bg-destructive/10 border-destructive/40`}>
        <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-destructive" />
        <div>
          <div className="font-semibold text-foreground">Acesso B2B indisponível</div>
          <div className="text-muted-foreground mt-0.5">
            Entre em contato com a loja para mais informações.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`${base} bg-success/10 border-success/40`}>
      <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-success" />
      <div>
        <div className="font-semibold text-foreground">
          Empresa aprovada{companyName ? ` — ${companyName}` : ""}
        </div>
        <div className="text-muted-foreground mt-0.5">
          Os preços empresa são exibidos quando aplicável e validados no checkout.
        </div>
      </div>
    </div>
  );
}
