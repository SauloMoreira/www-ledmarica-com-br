import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { ArrowLeft, Upload, Loader2, Sparkles, Download, FileSpreadsheet, PlayCircle, CheckCircle2, XCircle, AlertTriangle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  parseImportSheet,
  validateImportRows,
  enrichImportRows,
  simulateImport,
  commitImport,
  downloadRevisedSheet,
} from "@/server/productImport.functions";
import type { ImportRow, ImportAction } from "@/lib/productImport";
import { countRows, parseTags } from "@/lib/productImport";
import { neutralizeCsvFormula } from "@/lib/csvSafe";

type SimResult = {
  plan: Array<{
    rowIndex: number;
    sku: string;
    nome: string;
    simAction: "create" | "update" | "skip" | "error";
    reasons: string[];
  }>;
  summary: { total: number; toCreate: number; toUpdate: number; toSkip: number; errors: number };
};

type CommitResult = {
  summary: {
    importId: string;
    fileName: string;
    total: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  log: Array<{
    rowIndex: number;
    sku: string;
    result: "created" | "updated" | "skipped" | "error";
    productId?: string;
    message?: string;
  }>;
};

export const Route = createFileRoute("/admin/produtos/importacao-ia")({
  component: ImportacaoIaPage,
});

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.replace(/^data:[^;]+;base64,/, ""));
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}

function statusBadge(status: ImportRow["status"]) {
  if (status === "ready")
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Pronto</Badge>;
  if (status === "needs_review")
    return <Badge variant="secondary">Aguarda revisão</Badge>;
  if (status === "invalid") return <Badge variant="destructive">Erro</Badge>;
  return <Badge variant="outline">Ignorada</Badge>;
}

function ImportacaoIaPage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [detailRow, setDetailRow] = useState<ImportRow | null>(null);
  const [editingRow, setEditingRow] = useState<ImportRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  function updateRowField<K extends keyof ImportRow>(rowIndex: number, key: K, value: ImportRow[K]) {
    setRows((prev) => prev.map((r) => (r.rowIndex === rowIndex ? { ...r, [key]: value } : r)));
    setSim(null);
  }

  async function handleSaveEdit() {
    if (!editingRow) return;
    setSavingEdit(true);
    try {
      const next = rows.map((r) => (r.rowIndex === editingRow.rowIndex ? editingRow : r));
      const res = await validateImportRows({ data: { rows: next } });
      if (!res.ok) {
        setRows(next);
        toast.warning("Alterações salvas, mas a revalidação falhou.");
      } else {
        setRows(res.rows);
        const updated = res.rows.find((r) => r.rowIndex === editingRow.rowIndex);
        if (updated) {
          if (updated.errors.length > 0) {
            toast.warning(`Salvo com ${updated.errors.length} erro(s).`);
          } else {
            toast.success("Linha atualizada e revalidada.");
          }
        }
      }
      setSim(null);
      setEditingRow(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSavingEdit(false);
    }
  }

  const counts = useMemo(() => countRows(rows), [rows]);
  const canImport = sim !== null && counts.ready > 0;

  async function handleParseFile(picked: File) {
    setFile(picked);
    setLoading("parse");
    setSim(null);
    setCommitResult(null);
    try {
      const b64 = await fileToBase64(picked);
      const res = await parseImportSheet({ data: { fileBase64: b64, fileName: picked.name } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRows(res.rows);
      setFileName(picked.name);
      toast.success(`Planilha lida: ${res.rows.length} linhas.`);
      await handleValidate(res.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao ler planilha");
    } finally {
      setLoading(null);
    }
  }


  async function handleValidate(seed?: ImportRow[]) {
    const input = seed ?? rows;
    if (!input.length) return;
    setLoading("validate");
    setSim(null);
    try {
      const res = await validateImportRows({ data: { rows: input } });
      if (!res.ok) return;
      setRows(res.rows);
      toast.success(
        `Validação: ${res.counts.ready} prontos, ${res.counts.needsReview} aguardando revisão, ${res.counts.invalid} com erro.`,
      );
    } finally {
      setLoading(null);
    }
  }

  async function handleEnrich() {
    if (!rows.length) return;
    setLoading("enrich");
    try {
      const res = await enrichImportRows({ data: { rows, onlyEmpty: true } });
      if (!res.ok) return;
      setRows(res.rows);
      if (res.succeeded === 0 && res.failed > 0) {
        const firstErr = res.rows.find((r) => r.observacoes_ia?.includes("[IA]"))?.observacoes_ia ?? "";
        toast.error(`IA falhou em todas as ${res.failed} linhas. ${firstErr.slice(0, 200)}`);
      } else {
        toast.success(`IA preencheu ${res.succeeded} linhas (${res.failed} falhas).`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro IA");
    } finally {
      setLoading(null);
    }
  }

  async function handleSimulate() {
    if (!rows.length) return;
    setLoading("sim");
    setCommitResult(null);
    try {
      const res = await simulateImport({ data: { rows } });
      if (!res.ok) return;
      setSim({ plan: res.plan, summary: res.summary });
      toast.success(
        `Simulação: ${res.summary.toCreate} criar, ${res.summary.toUpdate} atualizar, ${res.summary.toSkip} ignorar, ${res.summary.errors} erro.`,
      );
    } finally {
      setLoading(null);
    }
  }

  async function handleCommit() {
    if (!sim) {
      toast.error("Execute a simulação antes de importar.");
      return;
    }
    if (
      !window.confirm(
        `Confirma a importação?\n\n${sim.summary.toCreate} criar · ${sim.summary.toUpdate} atualizar · ${sim.summary.toSkip} ignorar.`,
      )
    )
      return;
    setLoading("commit");
    try {
      const res = await commitImport({ data: { rows, fileName } });
      if (!res.ok) return;
      setCommitResult({ summary: res.summary, log: res.log });
      toast.success(
        `Importação concluída: ${res.summary.created} criados, ${res.summary.updated} atualizados.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na importação");
    } finally {
      setLoading(null);
    }
  }

  async function handleDownload() {
    if (!rows.length) return;
    setLoading("download");
    try {
      const res = await downloadRevisedSheet({ data: { rows } });
      if (!res.ok) return;
      const bin = atob(res.fileBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Planilha revisada baixada.");
    } finally {
      setLoading(null);
    }
  }

  function handleCancel() {
    setRows([]);
    setFile(null);
    setFileName("");
    setSim(null);
    setCommitResult(null);
  }

  function downloadCommitLog() {
    if (!commitResult) return;
    const header = "rowIndex,sku,result,productId,message\n";
    const body = commitResult.log
      .map(
        (l) =>
          `${l.rowIndex},"${neutralizeCsvFormula(l.sku).replace(/"/g, '""')}",${l.result},${l.productId ?? ""},"${neutralizeCsvFormula(l.message).replace(/"/g, '""')}"`,
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `importacao_${commitResult.summary.importId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminLayout
      title="Importação de Produtos (IA)"
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/produtos">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar para Produtos
          </Link>
        </Button>
      }
    >
      <div className="space-y-6 max-w-7xl">
        {/* Introdução */}
        <div>
          <h1 className="font-display text-xl font-semibold mb-1">
            Importação de produtos por planilha
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Baixe o modelo oficial, preencha os campos mínimos e envie a planilha para validação.
            A IA poderá sugerir descrições, slug, SEO e tags, mas a importação só será realizada
            após revisão e aprovação humana.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Card 1 — Modelo oficial */}
          <Card className="p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              <h2 className="font-display text-base font-semibold">Modelo oficial da planilha</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4 flex-1">
              Use sempre o arquivo modelo para garantir compatibilidade com o importador.
              Não altere os nomes das colunas.
            </p>
            <div className="space-y-3">
              <Button asChild variant="default" className="w-full">
                <a
                  href="/templates/Cadastro_Minimo_Produtos_Led_Marica_IA.xlsx?v=20260623-texto-real-xlsxwriter"
                  download="Cadastro_Minimo_Produtos_Led_Marica_IA.xlsx"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Baixar modelo da planilha
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">
                O arquivo deve ser mantido no formato original. As colunas SKU, EAN/GTIN,
                código de barras, NCM, CEST, CFOP, código fornecedor, modelo e marca já vêm como Texto nativo do Excel, inclusive para novas digitações.
              </p>
            </div>
          </Card>

          {/* Card 2 — Enviar planilha */}
          <Card className="p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <Upload className="h-5 w-5 text-primary" />
              <h2 className="font-display text-base font-semibold">Enviar planilha</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4 flex-1">
              A aba lida é <code>PRODUTOS_MÍNIMO</code> (ou a primeira aba disponível). Limite: 5 MB
              e 500 linhas.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild disabled={loading !== null} size="sm">
                <label className="cursor-pointer">
                  {loading === "parse" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {file ? "Trocar planilha" : "Escolher e enviar planilha"}
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleParseFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </Button>
              {file && (
                <span className="text-xs text-muted-foreground truncate max-w-[220px]">
                  {file.name}
                </span>
              )}
              {rows.length > 0 && (
                <Button onClick={handleCancel} variant="ghost" size="sm">
                  Cancelar
                </Button>
              )}
            </div>
          </Card>

          {/* Card 3 — Como usar */}
          <Card className="p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <PlayCircle className="h-5 w-5 text-amber-600" />
              <h2 className="font-display text-base font-semibold">Como usar</h2>
            </div>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-4 flex-1">
              <li>Baixe o modelo oficial.</li>
              <li>Preencha os campos mínimos do produto.</li>
              <li>Salve a planilha em .xlsx.</li>
              <li>Envie a planilha nesta página.</li>
              <li>Aguarde a validação.</li>
              <li>Revise as sugestões da IA.</li>
              <li>Aprove apenas os produtos corretos.</li>
              <li>Execute a importação.</li>
            </ol>
          </Card>
        </div>

        {/* Destaque de segurança */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-800/40 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-sm text-emerald-800 dark:text-emerald-200">
            <span className="font-semibold">Segurança:</span> A IA auxilia no preenchimento, mas não
            publica produtos automaticamente. Todo produto precisa de revisão e aprovação humana.
          </p>
        </div>


        {/* Resumo */}
        {rows.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryCard label="Total" value={counts.total} />
            <SummaryCard label="Prontos" value={counts.ready} tone="ok" />
            <SummaryCard label="Aguarda revisão" value={counts.needsReview} tone="warn" />
            <SummaryCard label="Com erro" value={counts.invalid} tone="bad" />
            <SummaryCard label="Ignoradas" value={counts.ignored} tone="muted" />
          </div>
        )}

        {/* Ações */}
        {rows.length > 0 && (
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => handleValidate()} variant="outline" disabled={loading !== null}>
                {loading === "validate" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Validar
              </Button>
              <Button onClick={handleEnrich} variant="outline" disabled={loading !== null}>
                {loading === "enrich" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Completar com IA
              </Button>
              <Button onClick={handleDownload} variant="outline" disabled={loading !== null}>
                <Download className="h-4 w-4 mr-2" />
                Baixar revisada
              </Button>
              <Button onClick={handleSimulate} variant="secondary" disabled={loading !== null}>
                {loading === "sim" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4 mr-2" />
                )}
                Simular
              </Button>
              <Button onClick={handleCommit} disabled={!canImport || loading !== null}>
                {loading === "commit" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Importar aprovados
              </Button>
            </div>
            {!canImport && rows.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Execute a simulação e tenha pelo menos 1 produto pronto para liberar a importação.
              </p>
            )}
          </Card>
        )}

        {/* Resultado simulação */}
        {sim && !commitResult && (
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Simulação (nada foi gravado)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <SummaryCard label="Criar" value={sim.summary.toCreate} tone="ok" />
              <SummaryCard label="Atualizar" value={sim.summary.toUpdate} tone="warn" />
              <SummaryCard label="Ignorar" value={sim.summary.toSkip} tone="muted" />
              <SummaryCard label="Erros" value={sim.summary.errors} tone="bad" />
            </div>
          </Card>
        )}

        {/* Resultado commit */}
        {commitResult && (
          <Card className="p-4 border-emerald-500/40">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Importação concluída
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              ID: <code>{commitResult.summary.importId}</code>
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
              <SummaryCard label="Criados" value={commitResult.summary.created} tone="ok" />
              <SummaryCard label="Atualizados" value={commitResult.summary.updated} tone="warn" />
              <SummaryCard label="Ignorados" value={commitResult.summary.skipped} tone="muted" />
              <SummaryCard label="Erros" value={commitResult.summary.errors} tone="bad" />
            </div>
            <Button onClick={downloadCommitLog} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" /> Baixar log CSV
            </Button>
          </Card>
        )}

        {/* Tabela */}
        {rows.length > 0 && (
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="text-right">Estoque</TableHead>
                    <TableHead>Ativo</TableHead>
                    <TableHead>Rev.</TableHead>
                    <TableHead>Aprov.</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.rowIndex}>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="font-mono text-xs">{r.sku || "—"}</TableCell>
                      <TableCell className="max-w-[260px] truncate">{r.nome_produto}</TableCell>
                      <TableCell>{r.categoria || "—"}</TableCell>
                      <TableCell className="text-right">
                        {r.preco_venda !== null
                          ? r.preco_venda.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.estoque_inicial ?? "—"}
                      </TableCell>
                      <TableCell>{r.ativo ? "Sim" : "Não"}</TableCell>
                      <TableCell>
                        <Checkbox
                          checked={r.revisado_humano}
                          onCheckedChange={(v) =>
                            updateRowField(r.rowIndex, "revisado_humano", v === true)
                          }
                          aria-label="Revisado por humano"
                        />
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={r.aprovado_importar}
                          onCheckedChange={(v) =>
                            updateRowField(r.rowIndex, "aprovado_importar", v === true)
                          }
                          aria-label="Aprovado para importar"
                        />
                      </TableCell>
                      <TableCell className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingRow({ ...r })}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDetailRow(r)}
                        >
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}

        {rows.length === 0 && !loading && (
          <Card className="p-8 text-center text-muted-foreground">
            <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>Envie uma planilha para começar.</p>
          </Card>
        )}
      </div>

      {/* Modal de edição */}
      <EditRowDialog
        row={editingRow}
        onChange={setEditingRow}
        onSave={handleSaveEdit}
        saving={savingEdit}
      />

      {/* Modal de detalhes */}
      <Dialog open={!!detailRow} onOpenChange={(o) => !o && setDetailRow(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailRow && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Linha {detailRow.rowIndex} · {detailRow.sku || "(sem SKU)"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                {detailRow.errors.length > 0 && (
                  <div className="rounded border border-destructive/30 bg-destructive/5 p-3">
                    <div className="flex items-center gap-2 font-semibold text-destructive mb-1">
                      <XCircle className="h-4 w-4" /> Erros
                    </div>
                    <ul className="list-disc pl-5 space-y-1">
                      {detailRow.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {detailRow.warnings.length > 0 && (
                  <div className="rounded border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 p-3">
                    <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300 mb-1">
                      <AlertTriangle className="h-4 w-4" /> Avisos
                    </div>
                    <ul className="list-disc pl-5 space-y-1">
                      {detailRow.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <Section title="Dados originais">
                  <KV label="Ação" value={detailRow.action || "(criar)"} />
                  <KV label="Nome" value={detailRow.nome_produto} />
                  <KV label="Categoria" value={detailRow.categoria} />
                  <KV
                    label="Preço de custo"
                    value={
                      detailRow.preco_custo !== null
                        ? detailRow.preco_custo.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })
                        : "—"
                    }
                  />
                  <KV
                    label="Preço de venda"
                    value={
                      detailRow.preco_venda !== null
                        ? detailRow.preco_venda.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })
                        : "—"
                    }
                  />
                  <KV label="Estoque inicial" value={String(detailRow.estoque_inicial ?? "—")} />
                  <KV label="Ativo" value={detailRow.ativo ? "Sim" : "Não"} />
                  <KV label="Revisado humano" value={detailRow.revisado_humano ? "Sim" : "Não"} />
                  <KV
                    label="Aprovado importar"
                    value={detailRow.aprovado_importar ? "Sim" : "Não"}
                  />
                  {detailRow.observacoes_usuario && (
                    <KV label="Obs. usuário" value={detailRow.observacoes_usuario} />
                  )}
                </Section>
                <Section title="Sugestões da IA">
                  <KV label="Slug" value={detailRow.slug_sugerido || "—"} />
                  <KV
                    label="Confiança IA"
                    value={detailRow.nivel_confianca_ia || "—"}
                  />
                  <KV label="Título SEO" value={detailRow.titulo_seo || "—"} />
                  <KV label="Meta description" value={detailRow.meta_description || "—"} />
                  <KV label="Tags" value={detailRow.tags.join(", ") || "—"} />
                  <KV
                    label="Descrição curta"
                    value={detailRow.descricao_curta || "—"}
                    multi
                  />
                  <KV
                    label="Descrição longa"
                    value={detailRow.descricao_longa || "—"}
                    multi
                  />
                  {detailRow.observacoes_ia && (
                    <KV label="Obs. IA" value={detailRow.observacoes_ia} multi />
                  )}
                </Section>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "bad" | "muted" | "neutral";
}) {
  const color =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-destructive"
          : tone === "muted"
            ? "text-muted-foreground"
            : "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="font-semibold text-sm mb-2">{title}</h4>
      <div className="rounded border bg-muted/30 divide-y">{children}</div>
    </div>
  );
}

function KV({ label, value, multi = false }: { label: string; value: string; multi?: boolean }) {
  return (
    <div className="px-3 py-2 grid grid-cols-3 gap-3 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className={multi ? "col-span-2 whitespace-pre-wrap" : "col-span-2 truncate"}>
        {value}
      </div>
    </div>
  );
}

const ACTION_AUTO = "__auto__";
const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: ACTION_AUTO, label: "(automático)" },
  { value: "criar", label: "Criar" },
  { value: "atualizar", label: "Atualizar" },
  { value: "ignorar", label: "Ignorar" },
];

function EditRowDialog({
  row,
  onChange,
  onSave,
  saving,
}: {
  row: ImportRow | null;
  onChange: (r: ImportRow | null) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [tagsText, setTagsText] = useState("");
  useEffect(() => {
    setTagsText(row ? row.tags.join(", ") : "");
  }, [row?.rowIndex]);

  if (!row) return null;
  const set = <K extends keyof ImportRow>(key: K, value: ImportRow[K]) =>
    onChange({ ...row, [key]: value });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onChange(null)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Editar linha {row.rowIndex} {row.sku ? `· ${row.sku}` : ""}
          </DialogTitle>
        </DialogHeader>

        {(row.errors.length > 0 || row.warnings.length > 0) && (
          <div className="space-y-2 text-xs">
            {row.errors.length > 0 && (
              <div className="rounded border border-destructive/30 bg-destructive/5 p-2">
                <div className="flex items-center gap-1 font-semibold text-destructive">
                  <XCircle className="h-3.5 w-3.5" /> Erros
                </div>
                <ul className="list-disc pl-5">
                  {row.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            {row.warnings.length > 0 && (
              <div className="rounded border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 p-2">
                <div className="flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" /> Avisos
                </div>
                <ul className="list-disc pl-5">
                  {row.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="space-y-5 py-2 text-sm">
          <fieldset className="space-y-3">
            <legend className="font-semibold text-sm mb-1">Dados básicos</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>SKU *</Label>
                <Input value={row.sku} onChange={(e) => set("sku", e.target.value)} />
              </div>
              <div>
                <Label>Ação</Label>
                <Select
                  value={row.action ? row.action : ACTION_AUTO}
                  onValueChange={(v) => set("action", (v === ACTION_AUTO ? "" : v) as ImportAction)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Nome do produto *</Label>
                <Input value={row.nome_produto} onChange={(e) => set("nome_produto", e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Categoria *</Label>
                <Input value={row.categoria} onChange={(e) => set("categoria", e.target.value)} />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Switch checked={row.ativo} onCheckedChange={(v) => set("ativo", v)} />
                <Label className="mb-0">Ativo</Label>
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="font-semibold text-sm mb-1">
              Identificadores fiscais e códigos (texto)
            </legend>
            <p className="text-[11px] text-muted-foreground">
              Todos os campos são tratados como TEXTO. Preserve zeros à esquerda e nunca
              digite em notação científica. Vazio = não enviado.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>EAN / GTIN</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={row.gtin_ean}
                  onChange={(e) => set("gtin_ean", e.target.value)}
                  placeholder="Ex.: 7891234567890"
                />
              </div>
              <div>
                <Label>Código de barras</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={row.codigo_barras}
                  onChange={(e) => set("codigo_barras", e.target.value)}
                  placeholder="Mesmo que EAN/GTIN (será fundido)"
                />
              </div>
              <div>
                <Label>NCM (8 dígitos)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={row.ncm}
                  onChange={(e) => set("ncm", e.target.value)}
                  placeholder="Ex.: 8539.50.00 ou 85395000"
                />
              </div>
              <div>
                <Label>CEST (7 dígitos)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={row.cest}
                  onChange={(e) => set("cest", e.target.value)}
                  placeholder="Opcional"
                />
              </div>
              <div>
                <Label>CFOP padrão (4 dígitos)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={row.cfop_default}
                  onChange={(e) => set("cfop_default", e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="font-semibold text-sm mb-1">
              Atributos técnicos (texto)
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Marca</Label>
                <Input
                  type="text"
                  value={row.tech?.marca ?? ""}
                  onChange={(e) => set("tech", { ...(row.tech ?? {}), marca: e.target.value })}
                />
              </div>
              <div>
                <Label>Modelo</Label>
                <Input
                  type="text"
                  value={row.tech?.modelo ?? ""}
                  onChange={(e) => set("tech", { ...(row.tech ?? {}), modelo: e.target.value })}
                />
              </div>
              <div>
                <Label>Código do fornecedor</Label>
                <Input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  value={row.tech?.codigo_fornecedor ?? ""}
                  onChange={(e) =>
                    set("tech", { ...(row.tech ?? {}), codigo_fornecedor: e.target.value })
                  }
                  placeholder="Preserva zeros à esquerda"
                />
              </div>
            </div>
          </fieldset>


          <fieldset className="space-y-3">
            <legend className="font-semibold text-sm mb-1">Comercial</legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Preço de custo (R$)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={row.preco_custo ?? ""}
                  onChange={(e) =>
                    set("preco_custo", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </div>
              <div>
                <Label>Preço de venda (R$) *</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={row.preco_venda ?? ""}
                  onChange={(e) =>
                    set("preco_venda", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </div>
              <div>
                <Label>Estoque inicial</Label>
                <Input
                  type="number" step="1" min="0"
                  value={row.estoque_inicial ?? ""}
                  onChange={(e) =>
                    set("estoque_inicial", e.target.value === "" ? null : Math.trunc(Number(e.target.value)))
                  }
                />
              </div>
            </div>
            <div>
              <Label>Observações do usuário</Label>
              <Textarea
                rows={2}
                value={row.observacoes_usuario}
                onChange={(e) => set("observacoes_usuario", e.target.value)}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="font-semibold text-sm mb-1">Conteúdo / IA</legend>
            <div>
              <Label>Slug sugerido</Label>
              <Input
                value={row.slug_sugerido ?? ""}
                onChange={(e) => set("slug_sugerido", e.target.value || null)}
              />
            </div>
            <div>
              <Label>Descrição curta</Label>
              <Textarea
                rows={2}
                value={row.descricao_curta ?? ""}
                onChange={(e) => set("descricao_curta", e.target.value || null)}
              />
            </div>
            <div>
              <Label>Descrição longa</Label>
              <Textarea
                rows={5}
                value={row.descricao_longa ?? ""}
                onChange={(e) => set("descricao_longa", e.target.value || null)}
              />
            </div>
            <div>
              <Label>Tags (separadas por vírgula)</Label>
              <Input
                value={tagsText}
                onChange={(e) => {
                  setTagsText(e.target.value);
                  set("tags", parseTags(e.target.value));
                }}
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="font-semibold text-sm mb-1">SEO</legend>
            <div>
              <Label>Título SEO</Label>
              <Input
                value={row.titulo_seo ?? ""}
                onChange={(e) => set("titulo_seo", e.target.value || null)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {(row.titulo_seo ?? "").length} caracteres (ideal 30–60)
              </p>
            </div>
            <div>
              <Label>Meta description</Label>
              <Textarea
                rows={2}
                value={row.meta_description ?? ""}
                onChange={(e) => set("meta_description", e.target.value || null)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {(row.meta_description ?? "").length} caracteres (ideal 70–160)
              </p>
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded border bg-muted/30 p-3">
            <legend className="font-semibold text-sm px-1">Revisão</legend>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`rev-${row.rowIndex}`}
                checked={row.revisado_humano}
                onCheckedChange={(v) => set("revisado_humano", v === true)}
              />
              <Label htmlFor={`rev-${row.rowIndex}`} className="mb-0">
                Revisado por humano
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`apr-${row.rowIndex}`}
                checked={row.aprovado_importar}
                onCheckedChange={(v) => set("aprovado_importar", v === true)}
              />
              <Label htmlFor={`apr-${row.rowIndex}`} className="mb-0">
                Aprovado para importar
              </Label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              A importação só ocorre quando ambos estão marcados e a linha está sem erros.
            </p>
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onChange(null)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Salvar e revalidar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
