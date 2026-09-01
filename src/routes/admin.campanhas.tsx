import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  ExternalLink,
  BarChart3,
  Info,
  Tag,
  Image as ImageIcon,
  QrCode,
  MessageCircle,
  Target,
  Users,
  Sparkles,
} from "lucide-react";
import {
  MarketingCampaignAiDialog,
  type AiApplyPatch,
  type AiCampaignReference,
} from "@/components/admin/MarketingCampaignAiDialog";
import { linkCreativesToCampaign } from "@/server/marketingCreatives.functions";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/campanhas")({ component: CampanhasPage });

const STATUSES = [
  { value: "draft", label: "Rascunho" },
  { value: "scheduled", label: "Agendada" },
  { value: "active", label: "Ativa" },
  { value: "paused", label: "Pausada" },
  { value: "ended", label: "Encerrada" },
];
const CHANNELS = [
  "site",
  "instagram",
  "facebook",
  "google_ads",
  "whatsapp",
  "email",
  "b2b",
  "loja_fisica",
  "tiktok",
  "outro",
];
const OBJECTIVES = [
  "vender produto",
  "vender kit",
  "captar lead",
  "recuperar carrinho",
  "divulgar promocao",
  "b2b",
  "divulgar categoria",
  "lancamento",
  "aumentar recompra",
];
const PRIORITIES = [
  { value: "baixa", label: "Baixa" },
  { value: "normal", label: "Normal" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];

type Campaign = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  channel?: string | null;
  objective?: string | null;
  audience?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  base_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  final_url?: string | null;
  budget_planned?: number | null;
  budget_spent?: number | null;
  notes?: string | null;
  coupon_id?: string | null;
  banner_id?: string | null;
  product_ids?: string[] | null;
  category_ids?: string[] | null;
  combo_ids?: string[] | null;
  whatsapp_template_id?: string | null;
  email_template_id?: string | null;
  landing_page_url?: string | null;
  owner_name?: string | null;
  target_sales?: number | null;
  target_leads?: number | null;
  tags?: string[] | null;
  priority?: string | null;
  show_on_home?: boolean | null;
  show_on_catalog?: boolean | null;
  show_on_b2b?: boolean | null;
  created_at: string;
  updated_at?: string | null;
};

type Metrics = {
  leads: number;
  carts: number;
  orders: number;
  paid_orders: number;
  revenue: number;
  coupon_uses: number;
};

const emptyForm = {
  name: "",
  description: "",
  status: "draft",
  channel: "site",
  objective: "vender produto",
  audience: "",
  starts_at: "",
  ends_at: "",
  base_url: "",
  utm_source: "",
  utm_medium: "",
  utm_campaign: "",
  utm_term: "",
  utm_content: "",
  budget_planned: "",
  budget_spent: "",
  notes: "",
  coupon_id: "",
  banner_id: "",
  product_ids: [] as string[],
  category_ids: [] as string[],
  combo_ids: [] as string[],
  whatsapp_template_id: "",
  email_template_id: "",
  landing_page_url: "",
  owner_name: "",
  target_sales: "",
  target_leads: "",
  tags: "",
  priority: "normal",
  show_on_home: false,
  show_on_catalog: false,
  show_on_b2b: false,
};

function normalizeUtm(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_\-\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

function buildFinalUrl(form: typeof emptyForm): string {
  if (!form.base_url) return "";
  try {
    const url = new URL(form.base_url);
    const pairs: [string, string][] = [
      ["utm_source", form.utm_source],
      ["utm_medium", form.utm_medium],
      ["utm_campaign", form.utm_campaign],
      ["utm_term", form.utm_term],
      ["utm_content", form.utm_content],
    ];
    pairs.forEach(([k, v]) => {
      if (v && v.trim()) url.searchParams.set(k, v.trim());
    });
    return url.toString();
  } catch {
    return "";
  }
}

function qrCodeUrl(target: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(target)}`;
}

function CampanhasPage() {
  const [list, setList] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiGenerationId, setAiGenerationId] = useState<string | null>(null);

  const [coupons, setCoupons] = useState<Array<{ id: string; code: string }>>([]);
  const [banners, setBanners] = useState<Array<{ id: string; title: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [combos, setCombos] = useState<Array<{ id: string; name: string }>>([]);
  const [waTemplates, setWaTemplates] = useState<Array<{ id: string; name: string; body: string }>>([]);
  const [emailTemplates, setEmailTemplates] = useState<Array<{ id: string; display_name: string }>>([]);

  const finalUrl = useMemo(() => buildFinalUrl(form), [form]);

  const load = async () => {
    setLoading(true);
    const [c, cup, ban, prod, cat, com, wa, em] = await Promise.all([
      supabase.from("marketing_campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("coupons").select("id, code").order("code"),
      supabase.from("home_banners").select("id, title").order("sort_order"),
      fetchAllRows<any>((fromIdx, toIdx) =>
        supabase.from("products").select("id, name").order("name").range(fromIdx, toIdx),
      ).then((data) => ({ data })),
      supabase.from("categories").select("id, name").order("name"),
      supabase.from("product_bundles").select("id, name").eq("is_active", true).order("name"),
      supabase.from("whatsapp_templates").select("id, name, body").eq("active", true).order("name"),
      supabase.from("email_templates").select("id, display_name").eq("is_active", true).order("display_name"),
    ]);
    setList((c.data as any) ?? []);
    setCoupons((cup.data as any) ?? []);
    setBanners((ban.data as any) ?? []);
    setProducts((prod.data as any) ?? []);
    setCategories((cat.data as any) ?? []);
    setCombos((com.data as any) ?? []);
    setWaTemplates((wa.data as any) ?? []);
    setEmailTemplates((em.data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const loadMetrics = async (utmCampaign: string | null | undefined, couponId: string | null | undefined) => {
    if (!utmCampaign) {
      setMetrics(null);
      return;
    }
    setMetricsLoading(true);
    try {
      const [leads, carts, orders] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("utm_campaign", utmCampaign),
        supabase.from("abandoned_carts").select("id", { count: "exact", head: true }).eq("utm_campaign", utmCampaign),
        fetchAllRows<any>((fromIdx, toIdx) =>
          supabase
            .from("orders")
            .select("id, status, payment_status, total")
            .eq("utm_campaign", utmCampaign)
            .range(fromIdx, toIdx),
        ),
      ]);
      const ordersData = (orders as any[]) ?? [];
      const paid = ordersData.filter((o) =>
        ["paid", "approved"].includes(String(o.payment_status ?? "").toLowerCase()),
      );
      const revenue = paid.reduce((s, o) => s + Number(o.total ?? 0), 0);

      let couponUses = 0;
      if (couponId) {
        const cu = await supabase
          .from("coupons")
          .select("used_count")
          .eq("id", couponId)
          .maybeSingle();
        couponUses = Number((cu.data as any)?.used_count ?? 0);
      }

      setMetrics({
        leads: leads.count ?? 0,
        carts: carts.count ?? 0,
        orders: ordersData.length,
        paid_orders: paid.length,
        revenue,
        coupon_uses: couponUses,
      });
    } catch (e) {
      console.error(e);
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setMetrics(null);
    setOpen(true);
  };

  const aiReferences: AiCampaignReference = useMemo(
    () => ({
      products: products.map((p) => ({ id: p.id, name: p.name })),
      combos: combos.map((c) => ({ id: c.id, name: c.name })),
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      coupons: coupons.map((c) => ({ id: c.id, code: c.code })),
    }),
    [products, combos, categories, coupons],
  );

  const openFromAi = (patch: AiApplyPatch, generationId: string | null) => {
    setAiGenerationId(generationId);
    setEditing(null);
    setMetrics(null);
    const next = { ...emptyForm };
    if (patch.campaign) {
      Object.assign(next, {
        name: patch.campaign.name ?? next.name,
        description: patch.campaign.description ?? next.description,
        objective: patch.campaign.objective ?? next.objective,
        audience: patch.campaign.audience ?? next.audience,
        channel: patch.campaign.channel ?? next.channel,
        starts_at: patch.campaign.starts_at
          ? `${patch.campaign.starts_at}T09:00`
          : next.starts_at,
        ends_at: patch.campaign.ends_at ? `${patch.campaign.ends_at}T23:59` : next.ends_at,
        notes: patch.campaign.notes ?? next.notes,
        status: patch.campaign.status ?? "draft",
      });
    }
    if (patch.utm) {
      Object.assign(next, {
        utm_source: patch.utm.utm_source ?? next.utm_source,
        utm_medium: patch.utm.utm_medium ?? next.utm_medium,
        utm_campaign: patch.utm.utm_campaign ?? next.utm_campaign,
        utm_content: patch.utm.utm_content ?? next.utm_content,
        utm_term: patch.utm.utm_term ?? next.utm_term,
        base_url: patch.utm.base_url ?? next.base_url,
      });
    }
    if (patch.links) {
      Object.assign(next, {
        product_ids: patch.links.product_ids ?? [],
        combo_ids: patch.links.combo_ids ?? [],
        category_ids: patch.links.category_ids ?? [],
        coupon_id: patch.links.coupon_id ?? "",
      });
    }
    setForm(next);
    setAiOpen(false);
    setOpen(true);
    toast.success("Rascunho aplicado. Revise e salve.");
  };

  const openEdit = (c: Campaign) => {
    setEditing(c);
    setForm({
      name: c.name ?? "",
      description: c.description ?? "",
      status: c.status ?? "draft",
      channel: c.channel ?? "site",
      objective: c.objective ?? "vender produto",
      audience: c.audience ?? "",
      starts_at: c.starts_at ? c.starts_at.slice(0, 16) : "",
      ends_at: c.ends_at ? c.ends_at.slice(0, 16) : "",
      base_url: c.base_url ?? "",
      utm_source: c.utm_source ?? "",
      utm_medium: c.utm_medium ?? "",
      utm_campaign: c.utm_campaign ?? "",
      utm_term: c.utm_term ?? "",
      utm_content: c.utm_content ?? "",
      budget_planned: c.budget_planned != null ? String(c.budget_planned) : "",
      budget_spent: c.budget_spent != null ? String(c.budget_spent) : "",
      notes: c.notes ?? "",
      coupon_id: c.coupon_id ?? "",
      banner_id: c.banner_id ?? "",
      product_ids: c.product_ids ?? [],
      category_ids: c.category_ids ?? [],
      combo_ids: c.combo_ids ?? [],
      whatsapp_template_id: c.whatsapp_template_id ?? "",
      email_template_id: c.email_template_id ?? "",
      landing_page_url: c.landing_page_url ?? "",
      owner_name: c.owner_name ?? "",
      target_sales: c.target_sales != null ? String(c.target_sales) : "",
      target_leads: c.target_leads != null ? String(c.target_leads) : "",
      tags: (c.tags ?? []).join(", "),
      priority: c.priority ?? "normal",
      show_on_home: !!c.show_on_home,
      show_on_catalog: !!c.show_on_catalog,
      show_on_b2b: !!c.show_on_b2b,
    });
    loadMetrics(c.utm_campaign, c.coupon_id);
    setOpen(true);
  };

  // Sugere utm_campaign a partir do nome
  useEffect(() => {
    if (!editing && form.name && !form.utm_campaign) {
      setForm((f) => ({ ...f, utm_campaign: normalizeUtm(form.name) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Informe o nome da campanha");

    const tagsArr = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      description: form.description || null,
      status: form.status,
      channel: form.channel || null,
      objective: form.objective || null,
      audience: form.audience || null,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      base_url: form.base_url || null,
      utm_source: form.utm_source ? normalizeUtm(form.utm_source) : null,
      utm_medium: form.utm_medium ? normalizeUtm(form.utm_medium) : null,
      utm_campaign: form.utm_campaign ? normalizeUtm(form.utm_campaign) : null,
      utm_term: form.utm_term ? normalizeUtm(form.utm_term) : null,
      utm_content: form.utm_content ? normalizeUtm(form.utm_content) : null,
      final_url: finalUrl || null,
      budget_planned: form.budget_planned ? Number(form.budget_planned) : null,
      budget_spent: form.budget_spent ? Number(form.budget_spent) : null,
      notes: form.notes || null,
      coupon_id: form.coupon_id || null,
      banner_id: form.banner_id || null,
      product_ids: form.product_ids,
      category_ids: form.category_ids,
      combo_ids: form.combo_ids,
      whatsapp_template_id: form.whatsapp_template_id || null,
      email_template_id: form.email_template_id || null,
      landing_page_url: form.landing_page_url || null,
      owner_name: form.owner_name || null,
      target_sales: form.target_sales ? Number(form.target_sales) : null,
      target_leads: form.target_leads ? Number(form.target_leads) : null,
      tags: tagsArr,
      priority: form.priority,
      show_on_home: form.show_on_home,
      show_on_catalog: form.show_on_catalog,
      show_on_b2b: form.show_on_b2b,
    };

    const res = editing
      ? await supabase
          .from("marketing_campaigns")
          .update(payload as never)
          .eq("id", editing.id)
          .select("id")
          .single()
      : await supabase
          .from("marketing_campaigns")
          .insert(payload as never)
          .select("id")
          .single();
    if (res.error) return toast.error(res.error.message);
    const savedId = (res.data as { id?: string } | null)?.id ?? editing?.id ?? null;
    if (aiGenerationId && savedId) {
      try {
        await linkCreativesToCampaign({ data: { generation_id: aiGenerationId, campaign_id: savedId } });
      } catch {
        /* não bloqueia */
      }
    }
    toast.success(editing ? "Campanha atualizada" : "Campanha criada");
    setOpen(false);
    setAiGenerationId(null);
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Excluir campanha?")) return;
    const { error } = await supabase.from("marketing_campaigns").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Excluída");
    load();
  };

  const copyUrl = async () => {
    if (!finalUrl) return toast.error("Preencha a URL base e as UTMs");
    try {
      await navigator.clipboard.writeText(finalUrl);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const buildWhatsAppMessage = () => {
    const tpl = waTemplates.find((t) => t.id === form.whatsapp_template_id);
    const base = tpl?.body ?? `Olá! Conheça nossa campanha ${form.name}.`;
    const link = finalUrl || form.base_url || "";
    return `${base}${link ? `\n\n${link}` : ""}`;
  };

  const copyWhatsApp = async () => {
    try {
      await navigator.clipboard.writeText(buildWhatsAppMessage());
      toast.success("Mensagem WhatsApp copiada");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const filtered = list.filter((c) => filterStatus === "all" || c.status === filterStatus);

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      draft: "bg-muted text-muted-foreground",
      scheduled: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
      active: "bg-green-500/15 text-green-700 dark:text-green-400",
      paused: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      ended: "bg-muted text-muted-foreground",
    };
    const label = STATUSES.find((x) => x.value === s)?.label ?? s;
    return (
      <span
        className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[s] ?? "bg-muted"}`}
      >
        {label}
      </span>
    );
  };

  const isExpired = (c: Campaign) =>
    c.status === "active" && c.ends_at && new Date(c.ends_at) < new Date();

  return (
    <AdminLayout title="Campanhas de Marketing">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Campanhas de Marketing</h1>
            <p className="text-sm text-muted-foreground">
              Centro de controle das suas ações comerciais: gere links com UTM, vincule produtos,
              kits e cupons, e acompanhe leads, carrinhos e vendas.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/admin/campanhas-performance">
                <BarChart3 className="mr-2 h-4 w-4" /> Performance
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setAiOpen(true)}>
              <Sparkles className="mr-2 h-4 w-4" /> Criar com IA
            </Button>
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Nova campanha
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
          <Info className="mr-1 inline h-3 w-3" />
          Esta fase não dispara mensagens automáticas. Use as campanhas para gerar links rastreáveis,
          organizar vínculos comerciais e medir resultados. Disparos em massa exigem regra de
          consentimento/LGPD e ficam para fase futura.
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterStatus("all")}
              className={`rounded px-3 py-1 text-sm ${filterStatus === "all" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
            >
              Todas ({list.length})
            </button>
            {STATUSES.map((s) => {
              const n = list.filter((c) => c.status === s.value).length;
              return (
                <button
                  key={s.value}
                  onClick={() => setFilterStatus(s.value)}
                  className={`rounded px-3 py-1 text-sm ${filterStatus === s.value ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
                >
                  {s.label} ({n})
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          {loading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-muted-foreground">Nenhuma campanha por aqui ainda.</p>
              <Button onClick={openNew} className="mt-4">
                <Plus className="mr-2 h-4 w-4" /> Criar primeira campanha
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{c.name}</h3>
                      {statusBadge(c.status)}
                      {c.channel && <Badge variant="outline">{c.channel}</Badge>}
                      {c.priority && c.priority !== "normal" && (
                        <Badge variant="secondary">{c.priority}</Badge>
                      )}
                      {isExpired(c) && <Badge variant="destructive">Vencida ainda ativa</Badge>}
                      {c.show_on_home && <Badge variant="outline">Home</Badge>}
                      {c.show_on_catalog && <Badge variant="outline">Catálogo</Badge>}
                      {c.show_on_b2b && <Badge variant="outline">B2B</Badge>}
                    </div>
                    {c.description && (
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                        {c.description}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {c.utm_campaign && (
                        <span>
                          utm: <code className="font-mono">{c.utm_campaign}</code>
                        </span>
                      )}
                      {c.starts_at && (
                        <span>Início: {new Date(c.starts_at).toLocaleDateString("pt-BR")}</span>
                      )}
                      {c.ends_at && (
                        <span>Fim: {new Date(c.ends_at).toLocaleDateString("pt-BR")}</span>
                      )}
                      {c.coupon_id && (
                        <span>
                          <Tag className="mr-1 inline h-3 w-3" />
                          Cupom
                        </span>
                      )}
                      {c.banner_id && (
                        <span>
                          <ImageIcon className="mr-1 inline h-3 w-3" />
                          Banner
                        </span>
                      )}
                      {c.owner_name && (
                        <span>
                          <Users className="mr-1 inline h-3 w-3" />
                          {c.owner_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {c.final_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(c.final_url!);
                            toast.success("Link copiado");
                          } catch {}
                        }}
                        title="Copiar link"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => del(c.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar campanha" : "Nova campanha"}</DialogTitle>
            <DialogDescription>
              Use UTMs para identificar de onde vem cada visitante e medir suas campanhas.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={save} className="space-y-4">
            <Tabs defaultValue="basico" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="basico">Básico</TabsTrigger>
                <TabsTrigger value="utm">UTM Builder</TabsTrigger>
                <TabsTrigger value="vinculos">Vínculos</TabsTrigger>
                <TabsTrigger value="extra">Extras</TabsTrigger>
                <TabsTrigger value="metricas" disabled={!editing}>
                  Métricas
                </TabsTrigger>
              </TabsList>

              <TabsContent value="basico" className="space-y-3 pt-3">
                <div>
                  <Label>Nome da campanha *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex.: Semana do LED"
                    required
                  />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Status</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                    >
                      {STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Canal</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={form.channel}
                      onChange={(e) => setForm({ ...form, channel: e.target.value })}
                    >
                      {CHANNELS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Objetivo</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={form.objective}
                      onChange={(e) => setForm({ ...form, objective: e.target.value })}
                    >
                      {OBJECTIVES.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Início</Label>
                    <Input
                      type="datetime-local"
                      value={form.starts_at}
                      onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Término</Label>
                    <Input
                      type="datetime-local"
                      value={form.ends_at}
                      onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Público-alvo</Label>
                  <Input
                    value={form.audience}
                    onChange={(e) => setForm({ ...form, audience: e.target.value })}
                    placeholder="Ex.: clientes de Maricá interessados em LED"
                  />
                </div>
              </TabsContent>

              <TabsContent value="utm" className="space-y-3 pt-3">
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                  <Info className="mr-1 inline h-3 w-3" />
                  UTM é uma identificação no link que ajuda a saber de onde veio o cliente.
                  Preencha a URL base e as UTMs — o link final é gerado automaticamente.
                </div>
                <div>
                  <Label>URL base *</Label>
                  <Input
                    value={form.base_url}
                    onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                    placeholder="https://www.ledmarica.com.br/produtos/refletor-led"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>utm_source</Label>
                    <Input
                      value={form.utm_source}
                      onChange={(e) => setForm({ ...form, utm_source: e.target.value })}
                      placeholder="instagram"
                    />
                  </div>
                  <div>
                    <Label>utm_medium</Label>
                    <Input
                      value={form.utm_medium}
                      onChange={(e) => setForm({ ...form, utm_medium: e.target.value })}
                      placeholder="social"
                    />
                  </div>
                  <div>
                    <Label>utm_campaign</Label>
                    <Input
                      value={form.utm_campaign}
                      onChange={(e) => setForm({ ...form, utm_campaign: e.target.value })}
                      placeholder="semana_do_led"
                    />
                  </div>
                  <div>
                    <Label>utm_content (opcional)</Label>
                    <Input
                      value={form.utm_content}
                      onChange={(e) => setForm({ ...form, utm_content: e.target.value })}
                      placeholder="story_01"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>utm_term (opcional)</Label>
                    <Input
                      value={form.utm_term}
                      onChange={(e) => setForm({ ...form, utm_term: e.target.value })}
                      placeholder="led_50w"
                    />
                  </div>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Link final gerado
                  </Label>
                  <p className="mt-1 break-all font-mono text-xs">
                    {finalUrl || "— preencha a URL base —"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={copyUrl}
                      disabled={!finalUrl}
                    >
                      <Copy className="mr-1 h-3 w-3" /> Copiar link
                    </Button>
                    {finalUrl && (
                      <Button type="button" size="sm" variant="outline" asChild>
                        <a href={finalUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-1 h-3 w-3" /> Abrir
                        </a>
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={copyWhatsApp}
                      disabled={!finalUrl && !form.base_url}
                    >
                      <MessageCircle className="mr-1 h-3 w-3" /> Copiar mensagem WhatsApp
                    </Button>
                  </div>
                </div>
                {finalUrl && (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <Label className="mb-2 flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                      <QrCode className="h-3 w-3" /> QR Code
                    </Label>
                    <img
                      src={qrCodeUrl(finalUrl)}
                      alt="QR Code da campanha"
                      width={180}
                      height={180}
                      className="rounded border bg-white p-2"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Clique com o botão direito para salvar a imagem.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="vinculos" className="space-y-3 pt-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Cupom vinculado</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={form.coupon_id}
                      onChange={(e) => setForm({ ...form, coupon_id: e.target.value })}
                    >
                      <option value="">— nenhum —</option>
                      {coupons.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Banner da home</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={form.banner_id}
                      onChange={(e) => setForm({ ...form, banner_id: e.target.value })}
                    >
                      <option value="">— nenhum —</option>
                      {banners.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Modelo de WhatsApp</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={form.whatsapp_template_id}
                      onChange={(e) => setForm({ ...form, whatsapp_template_id: e.target.value })}
                    >
                      <option value="">— nenhum —</option>
                      {waTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Modelo de e-mail</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={form.email_template_id}
                      onChange={(e) => setForm({ ...form, email_template_id: e.target.value })}
                    >
                      <option value="">— nenhum —</option>
                      {emailTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Landing page</Label>
                    <Input
                      value={form.landing_page_url}
                      onChange={(e) => setForm({ ...form, landing_page_url: e.target.value })}
                      placeholder="https://www.ledmarica.com.br/promocao/semana-do-led"
                    />
                  </div>
                </div>
                <div>
                  <Label>Categorias relacionadas</Label>
                  <div className="mt-1 max-h-40 overflow-y-auto rounded-md border p-2">
                    {categories.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 py-1 text-sm">
                        <input
                          type="checkbox"
                          checked={form.category_ids.includes(c.id)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...form.category_ids, c.id]
                              : form.category_ids.filter((x) => x !== c.id);
                            setForm({ ...form, category_ids: next });
                          }}
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Combos / Kits ({form.combo_ids.length} selecionados)</Label>
                  <div className="mt-1 max-h-40 overflow-y-auto rounded-md border p-2">
                    {combos.length === 0 ? (
                      <p className="py-2 text-xs text-muted-foreground">Nenhum combo ativo.</p>
                    ) : (
                      combos.map((b) => (
                        <label key={b.id} className="flex items-center gap-2 py-1 text-sm">
                          <input
                            type="checkbox"
                            checked={form.combo_ids.includes(b.id)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...form.combo_ids, b.id]
                                : form.combo_ids.filter((x) => x !== b.id);
                              setForm({ ...form, combo_ids: next });
                            }}
                          />
                          {b.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <Label>Produtos relacionados ({form.product_ids.length} selecionados)</Label>
                  <div className="mt-1 max-h-48 overflow-y-auto rounded-md border p-2">
                    {products.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 py-1 text-sm">
                        <input
                          type="checkbox"
                          checked={form.product_ids.includes(p.id)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...form.product_ids, p.id]
                              : form.product_ids.filter((x) => x !== p.id);
                            setForm({ ...form, product_ids: next });
                          }}
                        />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="extra" className="space-y-3 pt-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Responsável</Label>
                    <Input
                      value={form.owner_name}
                      onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                      placeholder="Nome do responsável"
                    />
                  </div>
                  <div>
                    <Label>Prioridade</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Investimento previsto (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.budget_planned}
                      onChange={(e) => setForm({ ...form, budget_planned: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Investimento realizado (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.budget_spent}
                      onChange={(e) => setForm({ ...form, budget_spent: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Meta de vendas (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.target_sales}
                      onChange={(e) => setForm({ ...form, target_sales: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Meta de leads</Label>
                    <Input
                      type="number"
                      value={form.target_leads}
                      onChange={(e) => setForm({ ...form, target_leads: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Tags (separadas por vírgula)</Label>
                  <Input
                    value={form.tags}
                    onChange={(e) => setForm({ ...form, tags: e.target.value })}
                    placeholder="black-friday, led, varejo"
                  />
                </div>
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Exibição no site
                  </p>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="show_home" className="cursor-pointer">
                      Aparecer na home
                    </Label>
                    <Switch
                      id="show_home"
                      checked={form.show_on_home}
                      onCheckedChange={(v) => setForm({ ...form, show_on_home: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="show_cat" className="cursor-pointer">
                      Aparecer no catálogo
                    </Label>
                    <Switch
                      id="show_cat"
                      checked={form.show_on_catalog}
                      onCheckedChange={(v) => setForm({ ...form, show_on_catalog: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="show_b2b" className="cursor-pointer">
                      Aparecer no B2B
                    </Label>
                    <Switch
                      id="show_b2b"
                      checked={form.show_on_b2b}
                      onCheckedChange={(v) => setForm({ ...form, show_on_b2b: v })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Observações internas</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </TabsContent>

              <TabsContent value="metricas" className="space-y-3 pt-3">
                {!editing ? (
                  <p className="text-sm text-muted-foreground">
                    Salve a campanha para acompanhar métricas.
                  </p>
                ) : !form.utm_campaign ? (
                  <p className="text-sm text-muted-foreground">
                    Defina o utm_campaign para começar a medir.
                  </p>
                ) : metricsLoading ? (
                  <p className="text-sm text-muted-foreground">Carregando…</p>
                ) : metrics ? (
                  <>
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                      <Target className="mr-1 inline h-3 w-3" />
                      Métricas atribuídas pelo utm_campaign{" "}
                      <code className="font-mono">{form.utm_campaign}</code>.
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <MetricCard label="Leads" value={metrics.leads} target={form.target_leads ? Number(form.target_leads) : undefined} />
                      <MetricCard label="Carrinhos" value={metrics.carts} />
                      <MetricCard label="Pedidos" value={metrics.orders} />
                      <MetricCard label="Pedidos pagos" value={metrics.paid_orders} />
                      <MetricCard
                        label="Receita"
                        value={metrics.revenue.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                        target={
                          form.target_sales
                            ? Number(form.target_sales).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })
                            : undefined
                        }
                      />
                      <MetricCard label="Usos do cupom" value={metrics.coupon_uses} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Conversão: {metrics.leads > 0
                        ? `${((metrics.paid_orders / metrics.leads) * 100).toFixed(1)}% (pagos/leads)`
                        : "—"}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem dados.</p>
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">{editing ? "Salvar alterações" : "Criar campanha"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <MarketingCampaignAiDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        references={aiReferences}
        onApply={(patch, _s, genId) => openFromAi(patch, genId)}
      />
    </AdminLayout>
  );
}

function MetricCard({
  label,
  value,
  target,
}: {
  label: string;
  value: number | string;
  target?: number | string;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {target !== undefined && (
        <p className="text-xs text-muted-foreground">Meta: {target}</p>
      )}
    </div>
  );
}
