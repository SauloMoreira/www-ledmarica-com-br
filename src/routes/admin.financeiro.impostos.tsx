import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Receipt,
  AlertTriangle,
  CheckCircle2,
  Search,
  Pencil,
  Download,
  Building2,
  RefreshCw,
  ExternalLink,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getFiscalQuickCounts,
  listFiscalProducts,
  updateProductFiscal,
  getFiscalCompanyData,
  exportFiscalCsv,
  FISCAL_ORIGIN_OPTIONS,
  FISCAL_UNIT_SUGGESTIONS,
  FISCAL_STATUS_LABEL,
  type FiscalProductRow,
  type FiscalListFilter,
} from "@/server/fiscal.functions";
import { todayISODateBR } from "@/lib/dateBR";

export const Route = createFileRoute("/admin/financeiro/impostos")({
  component: ImpostosPage,
});

function originLabelShort(o: number | null) {
  if (o == null) return "—";
  const m = FISCAL_ORIGIN_OPTIONS.find((x) => x.value === o);
  return m ? m.label.split(" — ")[0] : String(o);
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    completo: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    incompleto: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    revisar: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    nao_aplicavel: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${map[s] ?? "bg-muted"}`}
    >
      {FISCAL_STATUS_LABEL[s] ?? s}
    </span>
  );
}

function scoreBadge(score: number) {
  let cls = "bg-red-500/10 text-red-700 dark:text-red-400";
  let label = "ruim";
  if (score >= 71) {
    cls = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    label = "bom";
  } else if (score >= 41) {
    cls = "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    label = "atenção";
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${cls}`}>
      {score} • {label}
    </span>
  );
}

function ImpostosPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FiscalListFilter>("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<FiscalProductRow | null>(null);

  const counts = useQuery({
    queryKey: ["fiscal-counts"],
    queryFn: () => getFiscalQuickCounts(),
  });
  const company = useQuery({
    queryKey: ["fiscal-company"],
    queryFn: () => getFiscalCompanyData(),
  });
  const list = useQuery({
    queryKey: ["fiscal-list", filter, activeFilter, search, page],
    queryFn: () =>
      listFiscalProducts({
        data: { filter, active: activeFilter, search, page, pageSize: 25 },
      }),
  });

  const exportFn = useServerFn(exportFiscalCsv);
  const [exporting, setExporting] = useState(false);
  async function handleExport() {
    setExporting(true);
    try {
      const res = await exportFn({ data: { filter, active: activeFilter, search } });
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pendencias-fiscais-${todayISODateBR()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`CSV gerado com ${res.count} linhas`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar CSV");
    } finally {
      setExporting(false);
    }
  }

  const cards = useMemo(() => {
    const c = counts.data;
    if (!c) return [];
    return [
      {
        title: "Produtos analisados",
        value: c.productsActive,
        sub: "Ativos com fiscal aplicável",
        tone: "neutral" as const,
      },
      {
        title: "Fiscal completo",
        value: c.productsFiscalComplete,
        sub: "Prontos para emissão",
        tone: "good" as const,
      },
      {
        title: "Fiscal incompleto",
        value: c.productsFiscalIncomplete,
        sub: "Falta dado essencial",
        tone: "warn" as const,
        filter: "incomplete" as FiscalListFilter,
      },
      {
        title: "Para revisar",
        value: c.productsNeedReview,
        sub: "Conferir antes de emitir",
        tone: "warn" as const,
        filter: "review" as FiscalListFilter,
      },
      {
        title: "Sem NCM",
        value: c.productsNoNcm,
        sub: "Classificação fiscal ausente",
        tone: "bad" as const,
        filter: "no_ncm" as FiscalListFilter,
      },
      {
        title: "Sem unidade comercial",
        value: c.productsNoUnit,
        sub: "UN, CX, KG, M…",
        tone: "bad" as const,
        filter: "no_unit" as FiscalListFilter,
      },
      {
        title: "Sem origem",
        value: c.productsNoOrigin,
        sub: "Nacional / importado",
        tone: "bad" as const,
        filter: "no_origin" as FiscalListFilter,
      },
      {
        title: "Sem peso/dimensão",
        value: c.productsNoWeightOrDims,
        sub: "Útil p/ frete e fiscal",
        tone: "warn" as const,
        filter: "no_weight" as FiscalListFilter,
      },
      {
        title: "Sem EAN/GTIN",
        value: c.productsNoEan,
        sub: "Código de barras",
        tone: "warn" as const,
        filter: "no_ean" as FiscalListFilter,
      },
    ];
  }, [counts.data]);

  return (
    <AdminLayout title="Impostos e dados fiscais">
      <div className="space-y-6">
        <div>
          <p className="text-muted-foreground text-sm">
            Revise os dados fiscais dos produtos e prepare a loja para emissão de nota fiscal e
            futura integração com ERP ou emissor fiscal.
          </p>
        </div>

        {/* CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {cards.map((c) => (
            <button
              key={c.title}
              onClick={() => {
                if (c.filter) {
                  setFilter(c.filter);
                  setPage(1);
                }
              }}
              className={`text-left bg-card border border-border rounded-xl p-4 transition hover:border-primary/40 ${
                c.filter ? "cursor-pointer" : "cursor-default"
              }`}
            >
              <div className="text-xs text-muted-foreground">{c.title}</div>
              <div
                className={`text-2xl font-bold ${
                  c.tone === "good"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : c.tone === "warn"
                      ? "text-amber-600 dark:text-amber-400"
                      : c.tone === "bad"
                        ? "text-red-600 dark:text-red-400"
                        : ""
                }`}
              >
                {c.value}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">{c.sub}</div>
            </button>
          ))}
        </div>

        {/* DADOS FISCAIS DA EMPRESA */}
        <CompanyFiscalBlock data={company.data} loading={company.isLoading} />

        {/* FILTROS + BUSCA + EXPORT */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar produto, SKU, NCM ou EAN…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  qc.invalidateQueries({ queryKey: ["fiscal-list"] });
                  qc.invalidateQueries({ queryKey: ["fiscal-counts"] });
                }}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={activeFilter}
                onValueChange={(v: any) => {
                  setActiveFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="inactive">Inativos</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
                <Download className="w-4 h-4 mr-2" />
                {exporting ? "Exportando…" : "Exportar pendências"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["all", "Todos"],
                ["complete", "Fiscal completo"],
                ["incomplete", "Incompleto"],
                ["review", "Revisar"],
                ["na", "Não aplicável"],
                ["no_ncm", "Sem NCM"],
                ["no_unit", "Sem unidade"],
                ["no_origin", "Sem origem"],
                ["no_weight", "Sem peso/dim."],
                ["no_ean", "Sem EAN"],
              ] as Array<[FiscalListFilter, string]>
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => {
                  setFilter(k);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-full text-xs border transition ${
                  filter === k
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:border-primary/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* TABELA */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="hidden md:table-cell">SKU</TableHead>
                  <TableHead className="hidden lg:table-cell">Categoria</TableHead>
                  <TableHead>NCM</TableHead>
                  <TableHead className="hidden xl:table-cell">CEST</TableHead>
                  <TableHead className="hidden lg:table-cell">Origem</TableHead>
                  <TableHead className="hidden md:table-cell">Unidade</TableHead>
                  <TableHead className="hidden xl:table-cell">CFOP</TableHead>
                  <TableHead className="hidden xl:table-cell">EAN</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.isLoading && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                )}
                {!list.isLoading && (list.data?.rows.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                      Nenhum produto encontrado para os filtros atuais.
                    </TableCell>
                  </TableRow>
                )}
                {list.data?.rows.map((p) => (
                  <TableRow key={p.id} className={!p.active ? "opacity-60" : ""}>
                    <TableCell>
                      <div className="font-medium text-sm">{p.name}</div>
                      {p.problems.length > 0 && (
                        <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                          {p.problems.slice(0, 2).join(" • ")}
                          {p.problems.length > 2 && ` +${p.problems.length - 2}`}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs">{p.sku ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">
                      {p.category_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{p.ncm ?? "—"}</TableCell>
                    <TableCell className="hidden xl:table-cell text-xs font-mono">
                      {p.cest ?? "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">
                      {originLabelShort(p.product_origin)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs">
                      {p.commercial_unit ?? "—"}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-xs font-mono">
                      {p.cfop_default ?? "—"}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-xs font-mono">
                      {p.gtin_ean ?? "—"}
                    </TableCell>
                    <TableCell>{scoreBadge(p.fiscal_score)}</TableCell>
                    <TableCell>{statusBadge(p.fiscal_status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                          <Pencil className="w-3 h-3 mr-1" /> Fiscal
                        </Button>
                        <Link
                          to="/admin/produtos/$id"
                          params={{ id: p.id }}
                          className="inline-flex items-center justify-center h-8 px-2 rounded-md border border-border text-xs hover:bg-muted"
                          title="Abrir produto"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {list.data && list.data.total > list.data.pageSize && (
            <div className="flex items-center justify-between p-3 border-t border-border text-sm">
              <div className="text-muted-foreground">
                Página {list.data.page} • {list.data.total} produtos
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={list.data.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={list.data.page * list.data.pageSize >= list.data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-muted/40 border border-border rounded-xl p-4 text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Info className="w-4 h-4" /> Para administrador iniciante
          </div>
          <p>NCM é o código fiscal que classifica o produto na nota fiscal (8 dígitos).</p>
          <p>Unidade comercial é como o produto é vendido: unidade, caixa, metro, quilo etc.</p>
          <p>
            Origem da mercadoria indica se o produto é nacional, importado ou possui conteúdo de
            importação.
          </p>
        </div>
      </div>

      {editing && (
        <FiscalEditDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["fiscal-list"] });
            qc.invalidateQueries({ queryKey: ["fiscal-counts"] });
            qc.invalidateQueries({ queryKey: ["admin-alerts"] });
          }}
        />
      )}
    </AdminLayout>
  );
}

function CompanyFiscalBlock({
  data,
  loading,
}: {
  data: Awaited<ReturnType<typeof getFiscalCompanyData>> | undefined;
  loading: boolean;
}) {
  if (loading || !data) return null;
  const incomplete = data.missing_fields.length > 0;
  return (
    <div
      className={`border rounded-xl p-4 ${
        incomplete ? "bg-amber-500/5 border-amber-500/30" : "bg-emerald-500/5 border-emerald-500/30"
      }`}
    >
      <div className="flex items-start gap-3">
        {incomplete ? (
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5" />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-medium">Dados fiscais da empresa</h3>
            {!incomplete && (
              <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400">
                Completo
              </Badge>
            )}
          </div>
          {incomplete ? (
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
              Faltam: {data.missing_fields.join(", ")}.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              CNPJ {data.cnpj} • Regime {data.fiscal_tax_regime} • Série{" "}
              {data.fiscal_default_nf_series} • Ambiente {data.fiscal_environment}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/admin/financeiro/configuracoes"
              className="inline-flex items-center text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted"
            >
              Completar dados fiscais
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function FiscalEditDialog({
  row,
  onClose,
  onSaved,
}: {
  row: FiscalProductRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    ncm: row.ncm ?? "",
    cest: row.cest ?? "",
    cfop_default: row.cfop_default ?? "",
    product_origin: row.product_origin,
    commercial_unit: row.commercial_unit ?? "",
    tributary_unit: row.tributary_unit ?? "",
    gtin_ean: row.gtin_ean ?? "",
    gtin_tax: row.gtin_tax ?? "",
    fiscal_description: row.fiscal_description ?? "",
    fiscal_notes: row.fiscal_notes ?? "",
    fiscal_status: row.fiscal_status as "completo" | "incompleto" | "revisar" | "nao_aplicavel",
  });

  const updateFn = useServerFn(updateProductFiscal);
  const mutation = useMutation({
    mutationFn: async () =>
      updateFn({
        data: {
          id: row.id,
          ncm: form.ncm || null,
          cest: form.cest || null,
          cfop_default: form.cfop_default || null,
          product_origin: form.product_origin,
          commercial_unit: form.commercial_unit || null,
          tributary_unit: form.tributary_unit || null,
          gtin_ean: form.gtin_ean || null,
          gtin_tax: form.gtin_tax || null,
          fiscal_description: form.fiscal_description || null,
          fiscal_notes: form.fiscal_notes || null,
          fiscal_status: form.fiscal_status,
        },
      }),
    onSuccess: () => {
      toast.success("Dados fiscais atualizados");
      onSaved();
      onClose();
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Falha ao salvar");
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar dados fiscais</DialogTitle>
          <DialogDescription>{row.name}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">NCM (8 dígitos)</Label>
            <Input
              value={form.ncm}
              onChange={(e) =>
                setForm({ ...form, ncm: e.target.value.replace(/\D/g, "").slice(0, 8) })
              }
              placeholder="00000000"
            />
          </div>
          <div>
            <Label className="text-xs">CEST (7 dígitos)</Label>
            <Input
              value={form.cest}
              onChange={(e) =>
                setForm({ ...form, cest: e.target.value.replace(/\D/g, "").slice(0, 7) })
              }
              placeholder="0000000"
            />
          </div>
          <div>
            <Label className="text-xs">CFOP padrão (4 dígitos)</Label>
            <Input
              value={form.cfop_default}
              onChange={(e) =>
                setForm({ ...form, cfop_default: e.target.value.replace(/\D/g, "").slice(0, 4) })
              }
              placeholder="5102"
            />
          </div>
          <div>
            <Label className="text-xs">Origem da mercadoria</Label>
            <Select
              value={form.product_origin == null ? "" : String(form.product_origin)}
              onValueChange={(v) =>
                setForm({ ...form, product_origin: v === "" ? null : Number(v) })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {FISCAL_ORIGIN_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Unidade comercial</Label>
            <Input
              value={form.commercial_unit}
              onChange={(e) =>
                setForm({ ...form, commercial_unit: e.target.value.toUpperCase().slice(0, 10) })
              }
              list="unit-suggestions"
              placeholder="UN, CX, KG…"
            />
            <datalist id="unit-suggestions">
              {FISCAL_UNIT_SUGGESTIONS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
          <div>
            <Label className="text-xs">Unidade tributável</Label>
            <Input
              value={form.tributary_unit}
              onChange={(e) =>
                setForm({ ...form, tributary_unit: e.target.value.toUpperCase().slice(0, 10) })
              }
              placeholder="UN"
            />
          </div>
          <div>
            <Label className="text-xs">EAN/GTIN</Label>
            <Input
              value={form.gtin_ean}
              onChange={(e) =>
                setForm({ ...form, gtin_ean: e.target.value.replace(/\D/g, "").slice(0, 14) })
              }
              placeholder="7891234567890"
            />
          </div>
          <div>
            <Label className="text-xs">GTIN tributável</Label>
            <Input
              value={form.gtin_tax}
              onChange={(e) =>
                setForm({ ...form, gtin_tax: e.target.value.replace(/\D/g, "").slice(0, 14) })
              }
              placeholder="Geralmente igual ao EAN"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Descrição fiscal</Label>
            <Input
              value={form.fiscal_description}
              onChange={(e) =>
                setForm({ ...form, fiscal_description: e.target.value.slice(0, 500) })
              }
              placeholder="Descrição detalhada para a NF-e (opcional)"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Observações fiscais</Label>
            <Textarea
              rows={2}
              value={form.fiscal_notes}
              onChange={(e) => setForm({ ...form, fiscal_notes: e.target.value.slice(0, 2000) })}
            />
          </div>
          <div>
            <Label className="text-xs">Status fiscal</Label>
            <Select
              value={form.fiscal_status}
              onValueChange={(v: any) => setForm({ ...form, fiscal_status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="completo">Completo</SelectItem>
                <SelectItem value="incompleto">Incompleto</SelectItem>
                <SelectItem value="revisar">Revisar</SelectItem>
                <SelectItem value="nao_aplicavel">Não aplicável</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              O sistema recalcula automaticamente o status com base nos campos preenchidos.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando…" : "Salvar dados fiscais"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
