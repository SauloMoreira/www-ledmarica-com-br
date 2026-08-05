import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { adminListProductAttributes } from "@/server/productAttributes.functions";
import {
  ArrowLeft,
  Loader2,
  ScanBarcode,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ProductSEOSection } from "@/components/admin/ProductSEOSection";
import {
  ProductImageManager,
  type ProductImageManagerHandle,
} from "@/components/admin/ProductImageManager";
import { ProductVariantsSection } from "@/components/admin/ProductVariantsSection";
import { ProductRelationsSection } from "@/components/admin/ProductRelationsSection";
import { ProductAttributesSection } from "@/components/admin/ProductAttributesSection";
import { ProductAiAssistantDialog, type ProductCopyApply } from "@/components/admin/ProductAiAssistantDialog";
import { boostProductSeoAuto } from "@/server/seo.functions";
import {
  BarcodeLookupDialog,
  type BarcodeApplyChoice,
} from "@/components/admin/BarcodeLookupDialog";
import type { BarcodeLookupResult } from "@/server/barcodeLookup.functions";
import {
  computeProductQuality,
  qualityClassColor,
  qualityClassLabel,
  QUALITY_FEATURED_MIN,
  QUALITY_FEATURED_BLOCK_MESSAGE,
} from "@/lib/productQuality";

export const Route = createFileRoute("/admin/produtos/$id")({ component: ProductForm });

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

interface Cat {
  id: string;
  name: string;
}

function ProductForm() {
  const { id } = useParams({ strict: false }) as { id: string };
  const isNew = id === "novo";
  const nav = useNavigate();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [cats, setCats] = useState<Cat[]>([]);
  const imageManagerRef = useRef<ProductImageManagerHandle>(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [extra, setExtra] = useState<{
    specs: Record<string, unknown>;
    ncm: string | null;
    product_images: Array<{ alt_text: string | null; original_url: string | null }>;
  }>({ specs: {}, ncm: null, product_images: [] });

  const [form, setForm] = useState({
    name: "",
    slug: "",
    sku: "",
    brand: "",
    description: "",
    price: "",
    sale_price: "",
    cost_price: "",
    stock_qty: "0",
    stock_min_alert: "10",
    stock_alert_enabled: true,
    allow_out_of_stock_sales: false,
    weight_kg: "0.3",
    length_cm: "10",
    width_cm: "10",
    height_cm: "10",
    category_id: "",
    active: true,
    featured: false,
    free_shipping_eligible: false,
    images: [] as string[],
    tags: "",
    seo_title: "",
    seo_description: "",
    seo_keywords: "",
    b2b_enabled: false,
    b2b_price: "",
    b2b_min_qty: "",
    b2b_qty_multiple: "",
    b2b_commercial_note: "",
    b2b_valid_until: "",
    b2b_show_in_vitrine: true,
  });

  useEffect(() => {
    supabase
      .from("categories")
      .select("id,name")
      .order("name")
      .then(({ data }) => setCats((data as any) ?? []));
    if (!isNew) {
      (async () => {
        const [{ data: prod, error }, { data: imgs }] = await Promise.all([
          supabase.rpc("admin_get_product", { p_id: id }),
          supabase
            .from("product_images")
            .select("alt_text, original_url")
            .eq("product_id", id),
        ]);
        if (error || !prod) {
          toast.error("Produto não encontrado");
          nav({ to: "/admin/produtos" as any });
          return;
        }
        const data: any = { ...(prod as any), product_images: imgs ?? [] };


          setForm({
            name: data.name,
            slug: data.slug,
            sku: data.sku ?? "",
            brand: data.brand ?? "",
            description: data.description ?? "",
            price: String(data.price),
            sale_price: data.sale_price ? String(data.sale_price) : "",
            cost_price: data.cost_price ? String(data.cost_price) : "",
            stock_qty: String(data.stock_qty),
            stock_min_alert: String(data.stock_min_alert ?? 10),
            stock_alert_enabled: (data as any).stock_alert_enabled !== false,
            allow_out_of_stock_sales: !!(data as any).allow_out_of_stock_sales,
            weight_kg: String(data.weight_kg ?? 0.3),
            length_cm: String(data.length_cm ?? 10),
            width_cm: String(data.width_cm ?? 10),
            height_cm: String(data.height_cm ?? 10),
            category_id: data.category_id ?? "",
            active: !!data.active,
            featured: !!data.featured,
            free_shipping_eligible: !!(data as any).free_shipping_eligible,
            images: data.images ?? [],
            tags: (data.tags ?? []).join(", "),
            seo_title: (data as any).seo_title ?? "",
            seo_description: (data as any).seo_description ?? "",
            seo_keywords: (data as any).seo_keywords ?? "",
            b2b_enabled: !!(data as any).b2b_enabled,
            b2b_price: (data as any).b2b_price != null ? String((data as any).b2b_price) : "",
            b2b_min_qty: (data as any).b2b_min_qty != null ? String((data as any).b2b_min_qty) : "",
            b2b_qty_multiple:
              (data as any).b2b_qty_multiple != null ? String((data as any).b2b_qty_multiple) : "",
            b2b_commercial_note: (data as any).b2b_commercial_note ?? "",
            b2b_valid_until: (data as any).b2b_valid_until
              ? String((data as any).b2b_valid_until).slice(0, 10)
              : "",
            b2b_show_in_vitrine: (data as any).b2b_show_in_vitrine !== false,
          });
          setExtra({
            specs: ((data as any).specs ?? {}) as Record<string, unknown>,
            ncm: (data as any).ncm ?? null,
            product_images: ((data as any).product_images ?? []) as Array<{
              alt_text: string | null;
              original_url: string | null;
            }>,
          });
          setLoading(false);
      })();

    }
  }, [id, isNew, nav]);

  // Reaproveita o mesmo queryKey de ProductAttributesSection para deduplicar
  // a chamada. Quando o produto é novo, fica desabilitado.
  const attrsQuery = useQuery({
    queryKey: ["admin-product-attributes", id],
    queryFn: () => adminListProductAttributes({ data: { productId: id } }),
    enabled: !isNew,
  });

  const quality = useMemo(
    () =>
      computeProductQuality({
        name: form.name,
        tags: form.tags
          ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : [],
        description: form.description,
        specs: extra.specs,
        seo_title: form.seo_title,
        seo_description: form.seo_description,
        seo_keywords: form.seo_keywords,
        slug: form.slug,
        ncm: extra.ncm,
        weight_kg: Number(form.weight_kg) || 0,
        height_cm: Number(form.height_cm) || 0,
        width_cm: Number(form.width_cm) || 0,
        length_cm: Number(form.length_cm) || 0,
        cost_price: form.cost_price ? Number(form.cost_price) : null,
        category_id: form.category_id || null,
        images: form.images,
        product_images: extra.product_images,
        product_attributes: attrsQuery.data ?? [],
      }),
    [form, extra, attrsQuery.data],
  );


  async function applyBarcodeData(
    choice: BarcodeApplyChoice,
    suggested: BarcodeLookupResult["suggested"],
  ) {
    setForm((f) => {
      const next = { ...f };
      if (choice.fields.name && suggested.name) {
        next.name = suggested.name;
        if (!f.slug.trim()) next.slug = slugify(suggested.name);
      }
      if (choice.fields.brand && suggested.brand) next.brand = suggested.brand;
      if (choice.fields.description && suggested.description)
        next.description = suggested.description;
      if (choice.fields.tags && suggested.tags.length) next.tags = suggested.tags.join(", ");
      if (choice.fields.seo_title && suggested.seo_title) next.seo_title = suggested.seo_title;
      if (choice.fields.seo_description && suggested.seo_description)
        next.seo_description = suggested.seo_description;
      if (choice.fields.seo_keywords && suggested.seo_keywords)
        next.seo_keywords = suggested.seo_keywords;
      if (choice.fields.category_id) next.category_id = choice.fields.category_id;
      return next;
    });

    if (choice.images.length && !isNew) {
      toast.info(`Importando ${choice.images.length} imagem(ns)…`);
      try {
        const r = await imageManagerRef.current?.addExternalImages(choice.images);
        if (r) {
          if (r.added > 0) toast.success(`${r.added} imagem(ns) adicionada(s) como pendentes`);
          if (r.failed > 0) toast.warning(`${r.failed} imagem(ns) não puderam ser baixadas`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao importar imagens");
      }
    } else if (choice.images.length && isNew) {
      toast.info("Salve o produto primeiro para importar as imagens.");
    }

    toast.success("Dados aplicados. Revise e salve.");
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.featured && !quality.canBeFeatured) {
      toast.error(QUALITY_FEATURED_BLOCK_MESSAGE);
      return;
    }
    // Validação client-side: campos obrigatórios pelo schema (name, slug, price)
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      toast.error("Informe o nome do produto.");
      return;
    }
    const priceNum = Number(form.price);
    if (!form.price || Number.isNaN(priceNum) || priceNum < 0) {
      toast.error("Informe um preço válido (maior ou igual a zero).");
      return;
    }
    const slugCandidate = (form.slug || slugify(trimmedName)).trim();
    if (!slugCandidate) {
      toast.error("Slug inválido. Informe um nome com letras/números.");
      return;
    }
    setSaving(true);

    try {
      let imagesArray: string[] = form.images;
      if (!isNew) {
        const savedImages = await imageManagerRef.current?.savePending();
        const imgs = savedImages?.length
          ? savedImages
          : await supabase
              .from("product_images")
              .select("url_card, url_thumb, original_url, is_primary, sort_order")
              .eq("product_id", id)
              .order("is_primary", { ascending: false })
              .order("sort_order", { ascending: true })
              .then(({ data, error }) => {
                if (error) throw error;
                return data ?? [];
              });
        imagesArray = imgs.map((i) => i.url_card ?? i.url_thumb ?? i.original_url).filter(Boolean);
      }

      const payload = {
        name: form.name,
        slug: form.slug || slugify(form.name),
        sku: form.sku || null,
        brand: form.brand || null,
        description: form.description || null,
        price: Number(form.price),
        sale_price: form.sale_price ? Number(form.sale_price) : null,
        cost_price: form.cost_price ? Number(form.cost_price) : null,
        stock_qty: Number(form.stock_qty),
        stock_min_alert: form.stock_min_alert === "" ? null : Number(form.stock_min_alert),
        stock_alert_enabled: form.stock_alert_enabled,
        allow_out_of_stock_sales: form.allow_out_of_stock_sales,
        weight_kg: Number(form.weight_kg) || 0,
        length_cm: Math.round(Number(form.length_cm) || 0),
        width_cm: Math.round(Number(form.width_cm) || 0),
        height_cm: Math.round(Number(form.height_cm) || 0),
        category_id: form.category_id || null,
        active: form.active,
        featured: form.featured,
        free_shipping_eligible: form.free_shipping_eligible,
        images: imagesArray,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        seo_title: form.seo_title.trim() || null,
        seo_description: form.seo_description.trim() || null,
        seo_keywords: form.seo_keywords.trim() || null,
        b2b_enabled: form.b2b_enabled,
        b2b_price: form.b2b_enabled && form.b2b_price ? Number(form.b2b_price) : null,
        b2b_min_qty: form.b2b_enabled && form.b2b_min_qty ? Number(form.b2b_min_qty) : null,
        b2b_qty_multiple:
          form.b2b_enabled && form.b2b_qty_multiple ? Number(form.b2b_qty_multiple) : null,
        b2b_commercial_note:
          form.b2b_enabled && form.b2b_commercial_note.trim()
            ? form.b2b_commercial_note.trim()
            : null,
        b2b_valid_until: form.b2b_enabled && form.b2b_valid_until ? form.b2b_valid_until : null,
        b2b_show_in_vitrine: form.b2b_show_in_vitrine,
      } as any;

      const res = isNew
        ? await supabase.from("products").insert(payload).select("id").single()
        : await supabase.from("products").update(payload).eq("id", id);
      if (res.error) throw res.error;

      if (!isNew) await imageManagerRef.current?.refetchImages();
      // Invalida caches que dependem dos dados do produto (qualidade, listagens, contadores do menu / Painel do Dia)
      qc.invalidateQueries({ queryKey: ["admin-product-quality"] });
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["admin-operations"] });
      toast.success(isNew ? "Produto criado" : "Produto e imagens atualizados");

      const newId = isNew ? (res.data as { id?: string } | null)?.id : id;
      const seoEmpty = !payload.seo_title && !payload.seo_description && !payload.seo_keywords;
      if (isNew && newId && seoEmpty) {
        toast.info("🚀 Otimizando SEO com IA em segundo plano…");
        boostProductSeoAuto({ data: { productId: newId } })
          .then((r) => {
            if (r.ok)
              toast.success(`SEO turbinado: título, descrição e ${r.faqCount} FAQs gerados`);
            else toast.error(`SEO booster: ${r.error}`);
          })
          .catch((e: unknown) =>
            toast.error(`SEO booster falhou: ${e instanceof Error ? e.message : "erro"}`),
          );
      }

      if (isNew && newId) {
        nav({ to: "/admin/produtos/$id" as any, params: { id: newId } as any });
      } else {
        nav({ to: "/admin/produtos" as any });
      }
    } catch (error) {
      // Supabase retorna objetos planos com message/details/hint, não instâncias de Error.
      const err = error as { message?: string; details?: string; hint?: string; code?: string } | null;
      const parts = [err?.message, err?.details, err?.hint, err?.code ? `(${err.code})` : null]
        .filter(Boolean)
        .join(" — ");
      const msg = parts || (error instanceof Error ? error.message : "Erro ao salvar produto ou imagens");
      console.error("[admin.produtos.salvar] falha:", error);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <AdminLayout title="Carregando…">
        <div />
      </AdminLayout>
    );

  return (
    <AdminLayout
      title={isNew ? "Novo produto" : "Editar produto"}
      action={
        <Link to={"/admin/produtos" as any}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
        </Link>
      }
    >
      <form onSubmit={submit} className="grid lg:grid-cols-3 gap-6 max-w-6xl">
        <div className="lg:col-span-2 space-y-4">
          <Section title="Informações básicas">
            <div className="flex justify-end -mt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBarcodeOpen(true)}
              >
                <ScanBarcode className="w-4 h-4 mr-1.5" />
                Buscar por código de barras
              </Button>
            </div>
            <Field label="Nome *">
              <Input
                required
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                    slug: form.slug || slugify(e.target.value),
                  })
                }
              />
            </Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Slug">
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                />
              </Field>
              <Field label="SKU">
                <Input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Marca">
                <Input
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                />
              </Field>
              <Field label="Categoria">
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Sem categoria</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Descrição</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAiOpen(true)}
                  className="border-primary/40 text-primary hover:bg-primary-tint hover:text-primary"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Otimizar com IA
                </Button>
              </div>
              <Textarea
                rows={5}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <Field label="Tags (separadas por vírgula)">
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="led, casa, sala"
              />
            </Field>
          </Section>

          <Section title="Preços e estoque">
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Preço (R$) *">
                <Input
                  required
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </Field>
              <Field label="Preço promocional">
                <Input
                  type="number"
                  step="0.01"
                  value={form.sale_price}
                  onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                />
              </Field>
              <Field label="Custo (interno)">
                <Input
                  type="number"
                  step="0.01"
                  value={form.cost_price}
                  onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Quantidade em estoque">
                <Input
                  type="number"
                  value={form.stock_qty}
                  onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Quantidade disponível para venda hoje.
                </p>
              </Field>
              <Field label="Estoque mínimo (alerta)">
                <Input
                  type="number"
                  value={form.stock_min_alert}
                  onChange={(e) => setForm({ ...form, stock_min_alert: e.target.value })}
                  placeholder="Ex.: 3"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Ponto em que o sistema marca o produto como estoque baixo. Em branco usa o padrão
                  da loja.
                </p>
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="flex items-start gap-2 text-sm border border-border rounded-md px-3 py-2 cursor-pointer hover:bg-muted/30">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.stock_alert_enabled}
                  onChange={(e) => setForm({ ...form, stock_alert_enabled: e.target.checked })}
                />
                <span>
                  <span className="font-medium">Alertar sobre estoque baixo/zerado</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Quando desativado, este produto não entra nos contadores do Painel do Dia.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm border border-border rounded-md px-3 py-2 cursor-pointer hover:bg-muted/30">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.allow_out_of_stock_sales}
                  onChange={(e) => setForm({ ...form, allow_out_of_stock_sales: e.target.checked })}
                />
                <span>
                  <span className="font-medium">Permitir venda sem estoque</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Marca a intenção de aceitar pedidos mesmo zerado. A regra atual de checkout não
                    é alterada nesta fase.
                  </span>
                </span>
              </label>
            </div>
          </Section>

          <Section title="Atacado / B2B">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <Label>Habilitar venda no atacado</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Quando ativo, empresas aprovadas verão o preço de atacado e este produto pode
                  aparecer na vitrine /atacado.
                </p>
              </div>
              <Switch
                checked={form.b2b_enabled}
                onCheckedChange={(v) => setForm({ ...form, b2b_enabled: v })}
              />
            </div>

            {form.b2b_enabled && (
              <>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="Preço atacado (R$) *">
                    <Input
                      type="number"
                      step="0.01"
                      value={form.b2b_price}
                      onChange={(e) => setForm({ ...form, b2b_price: e.target.value })}
                      placeholder="Ex.: 19.90"
                    />
                  </Field>
                  <Field label="Quantidade mínima">
                    <Input
                      type="number"
                      min="1"
                      value={form.b2b_min_qty}
                      onChange={(e) => setForm({ ...form, b2b_min_qty: e.target.value })}
                      placeholder="Ex.: 10"
                    />
                  </Field>
                  <Field label="Múltiplo de compra">
                    <Input
                      type="number"
                      min="1"
                      value={form.b2b_qty_multiple}
                      onChange={(e) => setForm({ ...form, b2b_qty_multiple: e.target.value })}
                      placeholder="Ex.: 5 (vende de 5 em 5)"
                    />
                  </Field>
                </div>
                <Field label="Observação comercial">
                  <Textarea
                    rows={2}
                    value={form.b2b_commercial_note}
                    onChange={(e) => setForm({ ...form, b2b_commercial_note: e.target.value })}
                    placeholder="Ex.: Pronta entrega. Faturamento em até 30 dias para clientes aprovados."
                  />
                </Field>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Preço válido até">
                    <Input
                      type="date"
                      value={form.b2b_valid_until}
                      onChange={(e) => setForm({ ...form, b2b_valid_until: e.target.value })}
                    />
                  </Field>
                  <div className="flex items-end justify-between gap-2 pb-1">
                    <div>
                      <Label>Mostrar na vitrine /atacado</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Exibe este produto na lista pública de atacado.
                      </p>
                    </div>
                    <Switch
                      checked={form.b2b_show_in_vitrine}
                      onCheckedChange={(v) => setForm({ ...form, b2b_show_in_vitrine: v })}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  O preço de atacado nunca aparece para visitantes — só para empresas com cadastro
                  aprovado.
                </p>
              </>
            )}
          </Section>

          <Section title="Dimensões (para frete)">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Peso (kg)">
                <Input
                  type="number"
                  step="0.001"
                  value={form.weight_kg}
                  onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                />
              </Field>
              <Field label="Compr. (cm)">
                <Input
                  type="number"
                  value={form.length_cm}
                  onChange={(e) => setForm({ ...form, length_cm: e.target.value })}
                />
              </Field>
              <Field label="Larg. (cm)">
                <Input
                  type="number"
                  value={form.width_cm}
                  onChange={(e) => setForm({ ...form, width_cm: e.target.value })}
                />
              </Field>
              <Field label="Alt. (cm)">
                <Input
                  type="number"
                  value={form.height_cm}
                  onChange={(e) => setForm({ ...form, height_cm: e.target.value })}
                />
              </Field>
            </div>
          </Section>

          <ProductSEOSection
            productId={isNew ? undefined : id}
            productCtx={{
              name: form.name,
              description: form.description,
              brand: form.brand,
              category: cats.find((c) => c.id === form.category_id)?.name,
              price: Number(form.price) || 0,
              ncm: extra.ncm,
              tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
              attributes: (attrsQuery.data ?? [])
                .filter((a) => (a.attribute_value ?? "").trim().length > 0)
                .map((a) => ({
                  key: a.attribute_key,
                  label: a.attribute_label,
                  value: a.attribute_value,
                  unit: a.attribute_unit,
                })),
            }}
            slug={form.slug || slugify(form.name)}
            seoTitle={form.seo_title}
            seoDescription={form.seo_description}
            seoKeywords={form.seo_keywords}
            onChange={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
          />

          {!isNew && <ProductAttributesSection productId={id} />}

          {!isNew && <ProductVariantsSection productId={id} />}

          {!isNew && <ProductRelationsSection productId={id} />}
        </div>

        <div className="space-y-4">
          {!isNew && <QualityPanel quality={quality} />}

          <Section title="Imagens">
            {isNew ? (
              <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded p-3">
                💡 Salve o produto primeiro para poder adicionar imagens.
              </p>
            ) : (
              <ProductImageManager
                ref={imageManagerRef}
                productId={id}
                productName={form.name}
                brand={form.brand}
                category={cats.find((c) => c.id === form.category_id)?.name}
              />
            )}
          </Section>

          <Section title="Visibilidade">
            <div className="flex items-center justify-between">
              <Label>Ativo</Label>
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label
                  className={
                    !quality.canBeFeatured && !form.featured ? "text-muted-foreground" : ""
                  }
                >
                  Destaque na home
                </Label>
                <Switch
                  checked={form.featured}
                  disabled={!quality.canBeFeatured && !form.featured}
                  onCheckedChange={(v) => {
                    if (v && !quality.canBeFeatured) {
                      toast.error(QUALITY_FEATURED_BLOCK_MESSAGE);
                      return;
                    }
                    setForm({ ...form, featured: v });
                  }}
                />
              </div>
              {!quality.canBeFeatured && (
                <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 mt-0.5 text-amber-600 shrink-0" />
                  Produtos com score abaixo de {QUALITY_FEATURED_MIN} não podem ser destacados.
                </p>
              )}
              {form.featured && !quality.canBeFeatured && (
                <p className="text-[11px] text-red-600 dark:text-red-400">
                  Este produto está destacado mas o score atual é {quality.score}. Corrija as
                  pendências ou remova o destaque.
                </p>
              )}
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <Label>Elegível a frete grátis</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Quando ativo, este produto participa da campanha de frete grátis para compras
                  acima de R$ 199,00.
                </p>
              </div>
              <Switch
                checked={form.free_shipping_eligible}
                onCheckedChange={(v) => setForm({ ...form, free_shipping_eligible: v })}
              />
            </div>
          </Section>

          <Button type="submit" disabled={saving} className="w-full">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isNew ? "Criar produto" : "Salvar alterações"}
          </Button>
        </div>
      </form>
      <BarcodeLookupDialog
        open={barcodeOpen}
        onOpenChange={setBarcodeOpen}
        categories={cats}
        currentForm={{
          name: form.name,
          brand: form.brand,
          description: form.description,
          tags: form.tags,
          category_id: form.category_id,
          seo_title: form.seo_title,
          seo_description: form.seo_description,
          seo_keywords: form.seo_keywords,
        }}
        onApply={applyBarcodeData}
      />
      <ProductAiAssistantDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        product={{
          name: form.name,
          brand: form.brand || null,
          category: cats.find((c) => c.id === form.category_id)?.name ?? null,
          sku: form.sku || null,
          description: form.description || null,
          tags: form.tags
            ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
            : null,
          ncm: extra.ncm,
          attributes: {
            ...(extra.specs ?? {}),
            ...Object.fromEntries(
              (attrsQuery.data ?? [])
                .filter((a) => (a.attribute_value ?? "").trim().length > 0)
                .map((a) => [
                  a.attribute_label || a.attribute_key,
                  a.attribute_unit
                    ? `${a.attribute_value} ${a.attribute_unit}`
                    : a.attribute_value,
                ]),
            ),
          },
          price: form.price ? Number(form.price) : null,
          stock: form.stock_qty ? Number(form.stock_qty) : null,
          imageAlts: extra.product_images
            .map((p) => p.alt_text)
            .filter((a): a is string => !!a && a.trim().length > 0),
        }}
        onApply={(patch: ProductCopyApply) => {
          setForm((f) => ({
            ...f,
            ...(patch.description !== undefined ? { description: patch.description } : {}),
            ...(patch.seoTitle !== undefined ? { seo_title: patch.seoTitle } : {}),
            ...(patch.seoDescription !== undefined ? { seo_description: patch.seoDescription } : {}),
            ...(patch.seoKeywords !== undefined ? { seo_keywords: patch.seoKeywords } : {}),
            ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
          }));
        }}
      />
    </AdminLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3">
      <h2 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function QualityPanel({ quality }: { quality: ReturnType<typeof computeProductQuality> }) {
  const c = qualityClassColor(quality.classification);
  const top = quality.issues.slice(0, 5);
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> Qualidade do cadastro
        </h2>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}
        >
          {qualityClassLabel(quality.classification)}
        </span>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-semibold tabular-nums">{quality.score}</span>
          <span className="text-xs text-muted-foreground">de 100</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              quality.score >= 91
                ? "bg-emerald-500"
                : quality.score >= 71
                  ? "bg-sky-500"
                  : quality.score >= 41
                    ? "bg-amber-500"
                    : "bg-red-500"
            }`}
            style={{ width: `${quality.score}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
        <GroupBar label="Mídia" g={quality.groups.media} />
        <GroupBar label="Conteúdo" g={quality.groups.content} />
        <GroupBar label="SEO" g={quality.groups.seo} />
        <GroupBar label="Fiscal/Custo" g={quality.groups.fiscal} />
      </div>

      <div className="border-t border-border pt-2 text-[11px] text-muted-foreground space-y-0.5">
        <div>
          <span className="text-foreground font-medium">{quality.techSummary.total}</span>{" "}
          atributo(s) técnico(s) cadastrado(s)
          {quality.techSummary.visible !== quality.techSummary.total && (
            <> · {quality.techSummary.visible} visível(is) na loja</>
          )}
          {" · "}
          {quality.techSummary.filterable} usado(s) como filtro
        </div>
        <div>
          NCM:{" "}
          {quality.techSummary.ncm ? (
            <>
              <span className="text-foreground font-medium tabular-nums">
                {quality.techSummary.ncm.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3")}
              </span>{" "}
              {quality.techSummary.ncmSource === "attribute" && (
                <span className="text-muted-foreground/70">(detectado nos atributos)</span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground/70">não informado (opcional)</span>
          )}
        </div>
      </div>


      {top.length > 0 ? (
        <div className="space-y-1.5 pt-1">
          <p className="text-xs font-medium text-muted-foreground">Para melhorar:</p>
          <ul className="space-y-1">
            {top.map((i) => (
              <li key={i.code} className="text-xs flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 text-amber-600 mt-0.5 shrink-0" />
                <span>
                  <strong className="text-foreground">{i.label}.</strong>{" "}
                  <span className="text-muted-foreground">{i.hint}</span>
                </span>
              </li>
            ))}
            {quality.issues.length > top.length && (
              <li className="text-[11px] text-muted-foreground/70">
                + {quality.issues.length - top.length} outras pendências.
              </li>
            )}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 pt-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> Cadastro completo. Pronto para destaque.
        </p>
      )}

      <p className="text-[11px] text-muted-foreground border-t border-border pt-2">
        Os avisos são informativos. Produtos com score abaixo de {QUALITY_FEATURED_MIN} não podem
        ser destacados em vitrines premium.
      </p>
    </div>
  );
}

function GroupBar({ label, g }: { label: string; g: { score: number; max: number } }) {
  const pct = g.max ? Math.round((g.score / g.max) * 100) : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground">
          {g.score}/{g.max}
        </span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-sky-500" : pct > 0 ? "bg-amber-500" : "bg-red-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
