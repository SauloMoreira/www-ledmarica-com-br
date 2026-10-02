import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  FlaskConical,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  listIntegrations,
  upsertIntegration,
  deleteIntegration,
  testIntegration,
  type MarketingIntegration,
  type IntegrationProvider,
  type ConsentCategory,
} from "@/server/marketingIntegrations.functions";
import {
  INTEGRATION_ID_PATTERNS,
  MARKETING_ONLY_PROVIDERS,
  isEffectiveIntegration,
  looksLikeScript,
} from "@/lib/integrationIds";

export const Route = createFileRoute("/admin/integracoes")({
  component: IntegrationsPage,
  head: () => ({ meta: [{ title: "Integrações | Admin" }] }),
});

const PROVIDER_INFO: Record<
  IntegrationProvider,
  {
    label: string;
    placeholder: string;
    example: string;
    defaultConsent: ConsentCategory;
    help: string;
  }
> = {
  ga4: {
    label: "Google Analytics 4 (GA4)",
    placeholder: "G-XXXXXXXXXX",
    example: "G-ABCDEF1234",
    defaultConsent: "analytics",
    help: 'Encontre em GA4 → Admin → Fluxos de dados → Web → "ID de medição".',
  },
  gtm: {
    label: "Google Tag Manager (GTM)",
    placeholder: "GTM-XXXXXXX",
    example: "GTM-ABCD123",
    defaultConsent: "analytics",
    help: "Encontre em tagmanager.google.com → seu container → ID no topo.",
  },
  meta_pixel: {
    label: "Meta Pixel (Facebook/Instagram)",
    placeholder: "Somente os números do Pixel ID",
    example: "123456789012345",
    defaultConsent: "marketing",
    help: "Gerenciador de Eventos do Meta → Fontes de dados → seu Pixel → ID (15 ou 16 dígitos). O código do Pixel é gerado pelo site — não cole scripts.",
  },
  tiktok_pixel: {
    label: "TikTok Pixel",
    placeholder: "CXXXXXXXXXXXXXXXXX",
    example: "C12ABCDEFGHIJKLMNOP",
    defaultConsent: "marketing",
    help: "TikTok Ads → Assets → Events → Pixel ID.",
  },
  clarity: {
    label: "Microsoft Clarity",
    placeholder: "xxxxxxxxxx",
    example: "abcd123456",
    defaultConsent: "analytics",
    help: "clarity.microsoft.com → Settings → Project ID.",
  },
  google_ads: {
    label: "Google Ads",
    placeholder: "AW-XXXXXXXXX",
    example: "AW-123456789",
    defaultConsent: "marketing",
    help: "Google Ads → Tools → Conversions → Tag setup → Conversion ID.",
  },
};

const PROVIDERS = Object.keys(PROVIDER_INFO) as IntegrationProvider[];

const ID_PATTERNS = INTEGRATION_ID_PATTERNS;

function isValidId(provider: IntegrationProvider, accountId: string): boolean {
  return ID_PATTERNS[provider].test(accountId.trim());
}

/** Extrai uma mensagem curta e legível de um erro de server function. */
async function describeLoadError(e: unknown): Promise<string> {
  if (e instanceof Response) {
    const body = await e.text().catch(() => "");
    return `HTTP ${e.status}${body ? ` — ${body.slice(0, 160)}` : ""}`;
  }
  if (e && typeof e === "object") {
    const err = e as { code?: unknown; message?: unknown };
    const msg = typeof err.message === "string" ? err.message : "";
    const code = typeof err.code === "string" ? err.code : "";
    if (msg || code) return [code, msg].filter(Boolean).join(": ").slice(0, 200);
  }
  return "erro desconhecido";
}

function IntegrationsPage() {
  const [items, setItems] = useState<MarketingIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  // Erro de carregamento é estado próprio: nunca deve ser exibido como
  // "nenhuma integração" / "não configurado".
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    provider: IntegrationProvider;
    account_id: string;
    enabled: boolean;
    consent_category: ConsentCategory;
    notes: string;
  }>({
    provider: "ga4",
    account_id: "",
    enabled: true,
    consent_category: "analytics",
    notes: "",
  });

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await listIntegrations();
      setItems(list);
    } catch (e) {
      const message = await describeLoadError(e);
      setLoadError(message);
      toast.error("Falha ao carregar integrações");
      console.error("[integracoes] load failed", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function pickProvider(p: IntegrationProvider) {
    setForm((f) => ({ ...f, provider: p, consent_category: PROVIDER_INFO[p].defaultConsent }));
  }

  async function handleAdd() {
    const rawId = form.account_id.trim();
    if (!rawId) {
      toast.error("Informe o ID da conta");
      return;
    }
    if (looksLikeScript(rawId)) {
      toast.error("Cole apenas o ID público. Scripts e códigos completos não são aceitos.");
      return;
    }
    if (!isValidId(form.provider, rawId)) {
      toast.error(
        form.provider === "meta_pixel"
          ? "Pixel ID inválido: informe apenas os 15 ou 16 dígitos do Pixel do Meta."
          : "ID em formato inválido para esta plataforma.",
      );
      return;
    }
    setSaving(true);
    try {
      await upsertIntegration({
        data: {
          provider: form.provider,
          account_id: form.account_id.trim(),
          enabled: form.enabled,
          consent_category: form.consent_category,
          notes: form.notes.trim() || null,
        },
      });
      toast.success("Integração salva");
      setForm((f) => ({ ...f, account_id: "", notes: "" }));
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(item: MarketingIntegration) {
    try {
      await upsertIntegration({
        data: {
          id: item.id,
          provider: item.provider,
          account_id: item.account_id,
          enabled: !item.enabled,
          consent_category: item.consent_category,
          notes: item.notes,
        },
      });
      toast.success(item.enabled ? "Integração desativada" : "Integração ativada");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao alterar");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta integração?")) return;
    try {
      await deleteIntegration({ data: { id } });
      toast.success("Integração excluída");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao excluir");
    }
  }

  async function handleTest(item: MarketingIntegration) {
    setTestingId(item.id);
    try {
      const r = await testIntegration({ data: { id: item.id } });
      if (item.provider === "meta_pixel") {
        if (!r.formatOk) {
          toast.error("Pixel ID inválido: são esperados apenas 15 ou 16 dígitos.");
        } else if (!r.consentOk) {
          toast.error("Categoria incorreta: o Meta Pixel precisa usar consentimento Marketing.");
        } else if (r.reachable === "ok") {
          toast.success(
            "Meta Pixel OK: Pixel ID válido e biblioteca oficial do Meta disponível — o Pixel será inicializado (PageView) para visitantes que aceitarem Marketing. Confirme no Gerenciador de Eventos → Testar eventos.",
            { duration: 9000 },
          );
        } else if (r.reachable === "failed") {
          toast.error(
            `Pixel ID válido, mas a biblioteca do Meta não respondeu (${r.detail || "erro"}). Tente novamente em instantes.`,
          );
        } else {
          toast.warning(
            `Pixel ID válido, mas não foi possível contatar o Meta agora (${r.detail || "sem resposta"}). Tente novamente.`,
          );
        }
        return;
      }
      if (!r.formatOk) {
        toast.error("ID com formato inválido. Verifique o valor informado.");
      } else if (r.reachable === "ok") {
        toast.success("Configuração válida — endpoint do provedor respondeu OK.");
      } else if (r.reachable === "failed") {
        toast.warning(`Formato OK, mas o provedor recusou (${r.detail || "erro"}). Confirme o ID.`);
      } else {
        toast.success(
          "Formato do ID válido. Este provedor não permite teste de alcance — verifique o pixel no painel oficial.",
        );
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao testar");
    } finally {
      setTestingId(null);
    }
  }

  // Pendências para o card de status
  const configuredProviders = new Set(items.map((i) => i.provider));
  const activeWithBadFormat = items.filter(
    (i) => i.enabled && !isValidId(i.provider, i.account_id),
  );
  // Pendência só some com integração ATIVA e com ID VÁLIDO.
  const hasEffective = (p: IntegrationProvider) =>
    items.some((i) => i.provider === p && isEffectiveIntegration(i));
  const missingGa4 = !hasEffective("ga4");
  const missingMetaPixel = !hasEffective("meta_pixel");

  const info = PROVIDER_INFO[form.provider];

  return (
    <AdminLayout title="Pixels & Analytics">
      <div className="space-y-6 p-4 md:p-6 max-w-5xl">
        <p className="text-sm text-muted-foreground">
          Configure GA4, GTM, Meta, TikTok, Clarity e Google Ads. Os scripts só carregam após o
          consentimento LGPD do visitante.
        </p>

        {!loading &&
          !loadError &&
          (missingGa4 || missingMetaPixel || activeWithBadFormat.length > 0) && (
            <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20">
              <CardContent className="pt-6 space-y-2 text-sm">
                <p className="font-medium flex items-center gap-2 text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4" /> Pendências de medição
                </p>
                <ul className="space-y-1 text-muted-foreground list-disc pl-5">
                  {missingGa4 && <li>Google Analytics 4 ainda não foi configurado.</li>}
                  {missingMetaPixel && (
                    <li>
                      Meta Pixel ainda não foi configurado — recomendado para campanhas no
                      Facebook/Instagram.
                    </li>
                  )}
                  {activeWithBadFormat.map((i) => (
                    <li key={i.id} className="text-destructive">
                      {PROVIDER_INFO[i.provider]?.label ?? i.provider}: integração ativa com ID em
                      formato inválido.
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

        {items.length > 0 &&
          !missingGa4 &&
          !missingMetaPixel &&
          activeWithBadFormat.length === 0 && (
            <Card className="border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20">
              <CardContent className="pt-6 text-sm flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
                <CheckCircle2 className="w-4 h-4" />
                Tudo certo! As principais ferramentas de medição estão configuradas.
              </CardContent>
            </Card>
          )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" /> Adicionar integração
            </CardTitle>
            <CardDescription>
              Informe apenas o <strong>ID público</strong> da plataforma. Não cole scripts inteiros.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Plataforma</Label>
                <Select
                  value={form.provider}
                  onValueChange={(v) => pickProvider(v as IntegrationProvider)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PROVIDER_INFO[p].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">{info.help}</p>
              </div>

              <div>
                <Label>ID da conta</Label>
                <Input
                  placeholder={info.placeholder}
                  value={form.account_id}
                  inputMode={form.provider === "meta_pixel" ? "numeric" : undefined}
                  maxLength={form.provider === "meta_pixel" ? 16 : 80}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={
                    form.account_id.trim() !== "" && !isValidId(form.provider, form.account_id)
                  }
                  onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))}
                  onPaste={(e) => {
                    if (form.provider !== "meta_pixel") return;
                    const pasted = e.clipboardData.getData("text");
                    const digits = pasted.replace(/\D/g, "");
                    if (looksLikeScript(pasted)) {
                      e.preventDefault();
                      toast.error(
                        "Cole apenas o Pixel ID (números). O código do Meta Pixel é gerado automaticamente pelo site.",
                      );
                    } else if (digits !== pasted.trim()) {
                      e.preventDefault();
                      setForm((f) => ({ ...f, account_id: digits.slice(0, 16) }));
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Exemplo: <code>{info.example}</code>
                </p>
              </div>

              <div>
                <Label>Categoria de consentimento</Label>
                <Select
                  value={form.consent_category}
                  disabled={MARKETING_ONLY_PROVIDERS.has(form.provider)}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, consent_category: v as ConsentCategory }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="analytics">Analytics</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {MARKETING_ONLY_PROVIDERS.has(form.provider)
                    ? "Fixo em Marketing: o Pixel só carrega após o visitante aceitar cookies de Marketing."
                    : "Define qual switch da LGPD libera o carregamento."}
                </p>
              </div>

              <div>
                <Label>Notas (interno)</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="ex.: conta principal da loja"
                  maxLength={500}
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, enabled: c }))}
                />
                <span className="text-sm">{form.enabled ? "Ativada" : "Desativada"}</span>
              </div>
              <Button onClick={handleAdd} disabled={saving}>
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Salvar integração
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integrações configuradas</CardTitle>
            <CardDescription>
              <ShieldCheck className="w-3.5 h-3.5 inline mr-1 text-primary" />
              Todos os scripts respeitam o consentimento de cookies do visitante.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : loadError ? (
              <div
                role="alert"
                className="flex flex-col items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-8 text-center"
              >
                <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                  Não foi possível carregar as integrações.
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  As integrações cadastradas continuam ativas na loja. Detalhe técnico:{" "}
                  <span className="font-mono">{loadError}</span>
                </p>
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
                  Tentar novamente
                </Button>
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma integração cadastrada ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => {
                  const formatOk = isValidId(item.provider, item.account_id);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            {PROVIDER_INFO[item.provider]?.label ?? item.provider}
                          </span>
                          <Badge
                            variant={item.enabled ? "default" : "secondary"}
                            className="text-[10px]"
                          >
                            {item.enabled ? "Ativa" : "Inativa"}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {item.consent_category === "analytics" ? "Analytics" : "Marketing"}
                          </Badge>
                          {!formatOk && (
                            <Badge variant="destructive" className="text-[10px]">
                              <AlertTriangle className="w-2.5 h-2.5 mr-1" /> ID inválido
                            </Badge>
                          )}
                        </div>
                        <code className="text-xs text-muted-foreground">{item.account_id}</code>
                        {item.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTest(item)}
                          disabled={testingId === item.id}
                          title="Testar configuração"
                        >
                          {testingId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FlaskConical className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline ml-1">Testar</span>
                        </Button>
                        <Switch
                          checked={item.enabled}
                          onCheckedChange={() => toggleEnabled(item)}
                        />
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-6 text-sm text-muted-foreground space-y-2">
            <p className="flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />
              <strong>Como funciona:</strong> ao salvar uma integração ativa, o script é injetado
              automaticamente no front da loja para visitantes que aceitaram a categoria
              correspondente.
            </p>
            <p>
              Se o visitante recusar ou revogar consentimento, nenhum script de analytics ou
              marketing é carregado.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
