import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { RequireAdminMfa } from "@/components/auth/RequireAdminMfa";
import logo from "@/assets/logo-hero.png";
import { formatCNPJ } from "@/lib/cnpj";
import { formatMoney, formatPct, formatQty } from "@/lib/quotes";
import { getQuoteForPrint } from "@/server/quotes.functions";
import { formatDateTimeBR } from "@/lib/dateBR";

type PrintData = Awaited<ReturnType<typeof getQuoteForPrint>>;

export const Route = createFileRoute("/admin/orcamentos/$id/imprimir")({
  head: () => ({
    meta: [
      { title: "Orçamento PJ — impressão" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: PrintPage,
});

const FALLBACK = {
  legal: "LED G MATERIAL ELETRICO LTDA",
  cnpj: "43.530.645/0001-49",
  address: "Rod. Ernani do Amaral Peixoto, 28354, Loja 5/6/7 · Mumbuca · Maricá/RJ · 24913-700",
  contact: "(21) 3731-2324 · WhatsApp (21) 98212-6467 · ledmarica.com.br",
  hours: "Seg a sex, 8h às 18h · Sáb, 8h às 12h",
};

function PrintPage() {
  return (
    <RequireAdminMfa>
      <PrintInner />
    </RequireAdminMfa>
  );
}

function PrintInner() {
  const { id } = Route.useParams();
  const [data, setData] = useState<PrintData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getQuoteForPrint({ data: { id } })
      .then((d) => {
        setData(d);
        document.title = `Orcamento-LedMarica-${d.quote.number}`;
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar"));
  }, [id]);

  if (error) return <p className="p-8 text-destructive">{error}</p>;
  if (!data)
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
      </div>
    );

  const { quote: q, issuer } = data;
  const legal = issuer?.legal_name || FALLBACK.legal;
  const cnpj = issuer?.cnpj ? formatCNPJ(issuer.cnpj) : FALLBACK.cnpj;
  const addrParts = issuer
    ? [
        [issuer.address_street, issuer.address_number, issuer.address_complement].filter(Boolean).join(", "),
        issuer.address_neighborhood,
        [issuer.address_city, issuer.address_state].filter(Boolean).join("/"),
        issuer.address_zipcode,
      ].filter(Boolean)
    : [];
  const address = addrParts.length ? addrParts.join(" · ") : FALLBACK.address;
  const contactParts = issuer
    ? [
        issuer.support_phone,
        issuer.support_whatsapp ? `WhatsApp ${issuer.support_whatsapp}` : null,
        issuer.website_url?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""),
      ].filter(Boolean)
    : [];
  const contact = contactParts.length ? contactParts.join(" · ") : FALLBACK.contact;
  const hours = issuer?.business_hours || FALLBACK.hours;
  const savings = q.items_discount_total + q.commercial_discount_amount;
  const v = (s: string | null | undefined) => (s && s.trim() ? s : "—");

  return (
    <div className="qdoc-root">
      <style>{CSS}</style>
      <div className="qdoc-toolbar">
        <button type="button" onClick={() => window.print()} className="qdoc-btn">
          <Printer width={16} height={16} aria-hidden /> Imprimir / Salvar PDF
        </button>
      </div>
      <article className="qdoc" aria-label={`Orçamento ${q.number}`}>
        <div className="qdoc-spectrum" />
        <header className="qdoc-head">
          <div>
            <img src={logo} alt="Led Maricá" className="qdoc-logo" />
            <p className="qdoc-tag">Material elétrico e iluminação LED</p>
            <p className="qdoc-issuer">
              <strong>{legal} · CNPJ {cnpj}</strong>
              <br />
              {address}
              <br />
              {contact}
            </p>
          </div>
          <div className="qdoc-head-r">
            <p className="qdoc-kicker">ORÇAMENTO · PESSOA JURÍDICA</p>
            <p className="qdoc-number">{q.number}</p>
            <dl className="qdoc-meta">
              <div><dt>Emissão</dt><dd>{formatDateTimeBR(q.issued_at)}</dd></div>
              <div><dt>Validade</dt><dd>{q.validity_hours} horas · até {formatDateTimeBR(q.expires_at)}</dd></div>
              <div><dt>Vendedor</dt><dd>{v(q.seller_name)}</dd></div>
            </dl>
          </div>
        </header>

        <section className="qdoc-sec">
          <h2 className="qdoc-label">CLIENTE</h2>
          <div className="qdoc-grid">
            <Field label="Razão social" value={q.client_legal_name} span={2} />
            <Field label="CNPJ" value={formatCNPJ(q.client_cnpj)} mono />
            <Field label="Inscrição estadual" value={v(q.client_state_registration)} />
            <Field label="Nome fantasia" value={v(q.client_trade_name)} />
            <Field label="Contato" value={v(q.client_contact_name)} />
            <Field label="Telefone" value={v(q.client_phone)} />
            <Field label="E-mail" value={v(q.client_email)} />
            <Field label="Endereço" value={v(q.client_address)} span={2} />
            <Field label="Obra/referência" value={v(q.client_reference)} span={2} />
          </div>
        </section>

        <section className="qdoc-sec">
          <h2 className="qdoc-label">ITENS DO ORÇAMENTO</h2>
          <table className="qdoc-table">
            <colgroup>
              <col style={{ width: "5%" }} />
              <col style={{ width: "37%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "13%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>#</th><th>Produto</th><th>NCM</th><th>Un.</th>
                <th className="r">Qtd.</th><th className="r">Unitário</th><th className="r">Desc.</th><th className="r">Total</th>
              </tr>
            </thead>
            <tbody>
              {q.items.map((it, i) => {
                const net = it.unit_price * (1 - it.discount_pct / 100);
                return (
                  <tr key={it.id}>
                    <td className="mono muted">{String(i + 1).padStart(2, "0")}</td>
                    <td>
                      <div className="qdoc-pname">{it.name}</div>
                      {it.specs && <div className="qdoc-specs">{it.specs}</div>}
                      {it.sku && <div className="qdoc-sku">Cód. {it.sku}</div>}
                    </td>
                    <td className="mono ncm">{it.ncm ?? "—"}</td>
                    <td>{it.unit}</td>
                    <td className="r num">{formatQty(it.quantity)}</td>
                    <td className="r num">
                      {it.discount_pct > 0 && <div className="qdoc-strike">{formatMoney(it.unit_price)}</div>}
                      {formatMoney(net)}
                    </td>
                    <td className="r num green">{it.discount_pct > 0 ? `${formatPct(it.discount_pct)}%` : "—"}</td>
                    <td className="r num bold">{formatMoney(it.line_total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="qdoc-foot">
          <div>
            <h2 className="qdoc-label">CONDIÇÕES COMERCIAIS</h2>
            <dl className="qdoc-terms">
              {q.terms.filter((t) => t.text.trim()).map((t, i) => (
                <div key={i}><dt>{t.label}</dt><dd>{t.text}</dd></div>
              ))}
            </dl>
          </div>
          <div>
            <h2 className="qdoc-label">RESUMO</h2>
            <dl className="qdoc-sum">
              <div><dt>Subtotal ({q.items.length} {q.items.length === 1 ? "item" : "itens"})</dt><dd>{formatMoney(q.subtotal_gross)}</dd></div>
              <div className="green"><dt>Descontos nos itens</dt><dd>− {formatMoney(q.items_discount_total)}</dd></div>
              {q.commercial_discount_amount > 0 && (
                <div className="green"><dt>Desconto comercial ({formatPct(q.commercial_discount_pct)}%)</dt><dd>− {formatMoney(q.commercial_discount_amount)}</dd></div>
              )}
              <div><dt>Frete</dt><dd>{q.freight_amount > 0 ? formatMoney(q.freight_amount) : "Grátis"}</dd></div>
            </dl>
            <div className="qdoc-total">
              <div className="qdoc-total-l">TOTAL DO ORÇAMENTO</div>
              <div className="qdoc-total-v">{formatMoney(q.total)}</div>
              <div className="qdoc-pix">
                <span>No PIX (−{formatPct(q.pix_discount_pct)}%)</span>
                <strong>{formatMoney(q.total_pix)}</strong>
              </div>
            </div>
            {savings > 0 && <p className="qdoc-save">Economia de {formatMoney(savings)} neste orçamento</p>}
          </div>
        </section>

        <footer className="qdoc-band">
          <span>• Nota fiscal em todos os pedidos • Produtos certificados • Suporte técnico</span>
          <span>{hours}</span>
        </footer>
      </article>
    </div>
  );
}

function Field({ label, value, span = 1, mono }: { label: string; value: string; span?: number; mono?: boolean }) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <div className="qdoc-flabel">{label}</div>
      <div className={`qdoc-fval${mono ? " mono" : ""}`}>{value}</div>
    </div>
  );
}

// Estilos do documento aprovado pelo cliente (cores fixas de impressão, isoladas nesta página).
const CSS = `
@page { size: A4 portrait; margin: 10mm; }
.qdoc-root { background:#E9ECF4; min-height:100vh; padding:24px 12px; font-family:'IBM Plex Sans', system-ui, sans-serif; color:#141A33; }
.qdoc-toolbar { max-width:190mm; margin:0 auto 12px; display:flex; justify-content:flex-end; }
.qdoc-btn { display:inline-flex; gap:8px; align-items:center; background:#141A33; color:#fff; border:0; border-radius:8px; padding:10px 16px; font-weight:600; cursor:pointer; font-family:'Archivo',sans-serif; }
.qdoc-btn:focus-visible { outline:3px solid #3F5AE0; outline-offset:2px; }
.qdoc { max-width:190mm; margin:0 auto; background:#fff; box-shadow:0 4px 24px rgba(20,26,51,.12); font-size:11.5px; line-height:1.45; }
.qdoc * { box-sizing:border-box; }
.qdoc-spectrum { height:6px; background:linear-gradient(90deg,#E3262B,#F28C1E,#F5D80F,#2DBE3A,#14C4D9,#2433D6,#8E2BD9,#E0208F,#D7192F); -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.qdoc-head { display:grid; grid-template-columns:1fr auto; gap:24px; padding:20px 24px 16px; border-bottom:1px solid #DCE0EC; }
.qdoc-logo { width:180px; height:auto; display:block; }
.qdoc-tag { margin:6px 0 8px; font-family:'Archivo',sans-serif; font-weight:600; color:#5A6280; font-size:11px; }
.qdoc-issuer { margin:0; color:#3A4160; font-size:10.5px; }
.qdoc-issuer strong { color:#141A33; }
.qdoc-head-r { text-align:right; }
.qdoc-kicker { margin:0; font-family:'Archivo',sans-serif; font-weight:700; letter-spacing:.18em; color:#3F5AE0; font-size:10.5px; }
.qdoc-number { margin:4px 0 10px; font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:24px; letter-spacing:-.01em; }
.qdoc-meta { margin:0; display:grid; gap:2px; font-size:10.5px; }
.qdoc-meta div { display:flex; justify-content:flex-end; gap:10px; }
.qdoc-meta dt { color:#7A819C; } .qdoc-meta dd { margin:0; font-weight:500; font-variant-numeric:tabular-nums; }
.qdoc-sec { padding:14px 24px 4px; }
.qdoc-label { margin:0 0 8px; font-family:'Archivo',sans-serif; font-size:9.5px; font-weight:700; letter-spacing:.14em; color:#7A819C; }
.qdoc-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px 16px; }
.qdoc-flabel { font-size:9px; color:#7A819C; text-transform:uppercase; letter-spacing:.06em; }
.qdoc-fval { font-weight:500; word-break:break-word; }
.mono { font-family:'IBM Plex Mono',monospace; }
.qdoc-table { width:100%; table-layout:fixed; border-collapse:collapse; }
.qdoc-table th { background:#F3F5FC; text-align:left; font-family:'Archivo',sans-serif; font-size:9.5px; font-weight:700; color:#5A6280; padding:7px 6px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.qdoc-table td { padding:8px 6px; border-bottom:1px solid #DCE0EC; vertical-align:top; }
.qdoc-table tr { break-inside:avoid; page-break-inside:avoid; }
.qdoc-table .r { text-align:right; }
.qdoc-table .num { font-variant-numeric:tabular-nums; }
.qdoc-table .muted { color:#9AA0B8; }
.qdoc-table .ncm { font-size:10.5px; }
.qdoc-table .green, .qdoc-sum .green { color:#137A4B; }
.qdoc-table .bold { font-weight:700; }
.qdoc-pname { font-weight:700; }
.qdoc-specs { font-family:'IBM Plex Mono',monospace; font-size:9.5px; color:#3A4160; margin-top:2px; }
.qdoc-sku { font-family:'IBM Plex Mono',monospace; font-size:9.5px; color:#9AA0B8; margin-top:2px; }
.qdoc-strike { text-decoration:line-through; color:#9AA0B8; font-size:10px; }
.qdoc-foot { display:grid; grid-template-columns:1.3fr 1fr; gap:24px; padding:16px 24px 18px; break-inside:avoid; page-break-inside:avoid; }
.qdoc-terms { margin:0; display:grid; gap:6px; }
.qdoc-terms div { display:grid; grid-template-columns:100px 1fr; gap:8px; }
.qdoc-terms dt { color:#7A819C; font-weight:500; } .qdoc-terms dd { margin:0; }
.qdoc-sum { margin:0 0 10px; display:grid; gap:4px; font-variant-numeric:tabular-nums; }
.qdoc-sum div { display:flex; justify-content:space-between; gap:8px; }
.qdoc-sum dt { color:#5A6280; } .qdoc-sum .green dt { color:#137A4B; } .qdoc-sum dd { margin:0; font-weight:500; }
.qdoc-total { background:#141A33; color:#fff; border-radius:8px; padding:12px 14px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.qdoc-total-l { font-family:'Archivo',sans-serif; font-size:9.5px; letter-spacing:.14em; font-weight:700; opacity:.75; }
.qdoc-total-v { font-family:'Archivo',sans-serif; font-size:24px; font-weight:800; font-variant-numeric:tabular-nums; margin-top:2px; }
.qdoc-pix { display:flex; justify-content:space-between; align-items:baseline; border-top:1px solid rgba(255,255,255,.15); margin-top:8px; padding-top:8px; font-size:11px; }
.qdoc-pix strong { color:#FFC83D; font-size:15px; font-variant-numeric:tabular-nums; }
.qdoc-save { color:#137A4B; font-weight:600; margin:8px 0 0; text-align:right; }
.qdoc-band { display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; background:#F3F5FC; padding:10px 24px; font-size:10px; color:#3A4160; font-weight:500; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
@media (max-width:640px) {
  .qdoc-head, .qdoc-foot { grid-template-columns:1fr; }
  .qdoc-head-r { text-align:left; } .qdoc-meta div { justify-content:flex-start; }
  .qdoc-grid { grid-template-columns:repeat(2,1fr); }
}
@media print {
  .qdoc-root { background:#fff; padding:0; }
  .qdoc-toolbar { display:none !important; }
  .qdoc { box-shadow:none; max-width:none; }
}
`;
