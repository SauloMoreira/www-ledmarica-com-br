import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fetchHomepageSettings, type HomepageSettings } from "@/lib/homepageContent";
import { supabase } from "@/integrations/supabase/client";
import { IconPicker } from "@/components/admin/IconPicker";
import { HomepageCardsManager } from "@/components/admin/homepage/HomepageCardsManager";
import { HomepageFeaturedCategoriesManager } from "@/components/admin/homepage/HomepageFeaturedCategoriesManager";
import { HomepageShowcasesManager } from "@/components/admin/homepage/HomepageShowcasesManager";
import { HomepageSectionsManager } from "@/components/admin/homepage/HomepageSectionsManager";

export const Route = createFileRoute("/admin/conteudo/homepage")({
  component: AdminHomepageContentPage,
});

type FormState = Partial<HomepageSettings>;

function Field({
  label,
  children,
  hint,
  full,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "space-y-1.5 md:col-span-2" : "space-y-1.5"}>
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const NO_CHANGES_ERROR = "NO_CHANGES";

function AdminHomepageContentPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["homepage_settings"],
    queryFn: fetchHomepageSettings,
  });
  const [form, setForm] = useState<FormState>({});
  // Rastreia apenas os campos que o usuário efetivamente editou nesta aba.
  // Isso evita que um salvamento sobrescreva, com dados desatualizados,
  // campos que outra aba/usuário/SQL alterou enquanto esta tela ficou aberta.
  const [dirtyFields, setDirtyFields] = useState<Set<keyof HomepageSettings>>(new Set());

  useEffect(() => {
    if (data) {
      setForm(data);
      setDirtyFields(new Set());
    }
  }, [data]);

  const set = <K extends keyof HomepageSettings>(k: K, v: HomepageSettings[K] | null) => {
    setForm((f) => ({ ...f, [k]: v as any }));
    setDirtyFields((prev) => {
      const next = new Set(prev);
      next.add(k);
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!data?.id) throw new Error("ID ausente");
      if (dirtyFields.size === 0) throw new Error(NO_CHANGES_ERROR);

      // Envia somente os campos alterados nesta aba, nunca a linha inteira.
      // Assim, valores atualizados por outra aba/SQL nos campos não tocados
      // aqui são preservados no banco.
      const payload: Record<string, any> = {};
      for (const key of dirtyFields) {
        payload[key] = (form as any)[key];
      }

      const { error } = await (supabase as any)
        .from("homepage_settings")
        .update(payload)
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conteúdo da homepage atualizado");
      setDirtyFields(new Set());
      qc.invalidateQueries({ queryKey: ["homepage_settings"] });
    },
    onError: (e: any) => {
      if (e?.message === NO_CHANGES_ERROR) {
        toast.info("Nenhuma alteração para salvar");
        return;
      }
      toast.error(e?.message ?? "Erro ao salvar");
    },
  });

  const saveButton = (
    <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-2">
      {mutation.isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Save className="w-4 h-4" />
      )}
      Salvar alterações
    </Button>
  );

  if (isLoading) {
    return (
      <AdminLayout title="Conteúdo da Homepage">
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Conteúdo da Homepage" action={saveButton}>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <p className="text-sm text-muted-foreground">
          Edite textos, botões, barra promocional e CTA principal sem mexer no código.
        </p>

        <Tabs defaultValue="hero">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="hero">Hero</TabsTrigger>
            <TabsTrigger value="promo">Barra promocional</TabsTrigger>
            <TabsTrigger value="cta">CTA principal</TabsTrigger>
            <TabsTrigger value="benefits">Benefícios</TabsTrigger>
            <TabsTrigger value="promo-cards">Cards promocionais</TabsTrigger>
            <TabsTrigger value="categories">Categorias destaque</TabsTrigger>
            <TabsTrigger value="showcases">Vitrines de produtos</TabsTrigger>
            <TabsTrigger value="sections">Ordem das seções</TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
          </TabsList>

          <TabsContent value="showcases" className="mt-4">
            <Card>
              <CardContent className="p-6">
                <HomepageShowcasesManager />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sections" className="mt-4">
            <Card>
              <CardContent className="p-6">
                <HomepageSectionsManager />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="benefits" className="mt-4">
            <Card>
              <CardContent className="p-6">
                <HomepageCardsManager
                  cardType="benefit"
                  title="Cards de benefícios"
                  description="Aparecem na seção de diferenciais (IA 24h, Entrega rápida, NF garantida...)."
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="promo-cards" className="mt-4">
            <Card>
              <CardContent className="p-6">
                <HomepageCardsManager
                  cardType="promo"
                  title="Cards promocionais"
                  description="Aparecem logo abaixo do carrossel hero (Ofertas, Frete grátis, Atendimento IA...)."
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories" className="mt-4">
            <Card>
              <CardContent className="p-6">
                <HomepageFeaturedCategoriesManager />
              </CardContent>
            </Card>
          </TabsContent>

          {/* HERO */}
          <TabsContent value="hero" className="mt-4">
            <Card>
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">Seção Hero (institucional)</h2>
                    <p className="text-xs text-muted-foreground">
                      Bloco abaixo do carrossel com logo, badge, título e botões.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Ativa</Label>
                    <Switch
                      checked={!!form.hero_is_active}
                      onCheckedChange={(v) => set("hero_is_active", v)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="URL da logo (deixe vazio para usar a logo padrão)" full>
                    <Input
                      value={form.hero_logo_url ?? ""}
                      onChange={(e) => set("hero_logo_url", e.target.value || null)}
                      placeholder="https://..."
                    />
                  </Field>
                  <Field label="Texto alternativo da logo">
                    <Input
                      value={form.hero_logo_alt ?? ""}
                      onChange={(e) => set("hero_logo_alt", e.target.value)}
                    />
                  </Field>
                  <Field label="Ícone do badge">
                    <IconPicker
                      value={form.hero_badge_icon}
                      onChange={(v) => set("hero_badge_icon", v)}
                    />
                  </Field>
                  <Field label="Texto do badge superior" full>
                    <Input
                      value={form.hero_badge_text ?? ""}
                      onChange={(e) => set("hero_badge_text", e.target.value)}
                    />
                  </Field>
                  <Field label="Título principal">
                    <Input
                      value={form.hero_title ?? ""}
                      onChange={(e) => set("hero_title", e.target.value)}
                    />
                  </Field>
                  <Field label="Destaque colorido do título">
                    <Input
                      value={form.hero_highlight_text ?? ""}
                      onChange={(e) => set("hero_highlight_text", e.target.value)}
                    />
                  </Field>
                  <Field label="Descrição" full>
                    <Textarea
                      rows={2}
                      value={form.hero_description ?? ""}
                      onChange={(e) => set("hero_description", e.target.value)}
                    />
                  </Field>
                  <Field label="Texto complementar (opcional)" full>
                    <Textarea
                      rows={2}
                      value={form.hero_subdescription ?? ""}
                      onChange={(e) => set("hero_subdescription", e.target.value)}
                    />
                  </Field>
                </div>

                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Botão primário</h3>
                    <Switch
                      checked={!!form.hero_primary_button_active}
                      onCheckedChange={(v) => set("hero_primary_button_active", v)}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Texto">
                      <Input
                        value={form.hero_primary_button_text ?? ""}
                        onChange={(e) => set("hero_primary_button_text", e.target.value)}
                      />
                    </Field>
                    <Field label="Link (use #chat para abrir o chat)">
                      <Input
                        value={form.hero_primary_button_url ?? ""}
                        onChange={(e) => set("hero_primary_button_url", e.target.value)}
                      />
                    </Field>
                    <Field label="Ícone">
                      <IconPicker
                        value={form.hero_primary_button_icon}
                        onChange={(v) => set("hero_primary_button_icon", v)}
                      />
                    </Field>
                    <Field label="Abrir em nova aba">
                      <div className="h-9 flex items-center">
                        <Switch
                          checked={!!form.hero_primary_button_new_tab}
                          onCheckedChange={(v) => set("hero_primary_button_new_tab", v)}
                        />
                      </div>
                    </Field>
                  </div>
                </div>

                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Botão secundário</h3>
                    <Switch
                      checked={!!form.hero_secondary_button_active}
                      onCheckedChange={(v) => set("hero_secondary_button_active", v)}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Texto">
                      <Input
                        value={form.hero_secondary_button_text ?? ""}
                        onChange={(e) => set("hero_secondary_button_text", e.target.value)}
                      />
                    </Field>
                    <Field label="Link (use #chat para abrir o chat)">
                      <Input
                        value={form.hero_secondary_button_url ?? ""}
                        onChange={(e) => set("hero_secondary_button_url", e.target.value)}
                      />
                    </Field>
                    <Field label="Ícone">
                      <IconPicker
                        value={form.hero_secondary_button_icon}
                        onChange={(v) => set("hero_secondary_button_icon", v)}
                      />
                    </Field>
                    <Field label="Abrir em nova aba">
                      <div className="h-9 flex items-center">
                        <Switch
                          checked={!!form.hero_secondary_button_new_tab}
                          onCheckedChange={(v) => set("hero_secondary_button_new_tab", v)}
                        />
                      </div>
                    </Field>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PROMO BAR */}
          <TabsContent value="promo" className="mt-4">
            <Card>
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">Barra promocional</h2>
                    <p className="text-xs text-muted-foreground">
                      Faixa abaixo do hero (frete grátis, promoções, etc).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Ativa</Label>
                    <Switch
                      checked={!!form.promo_bar_is_active}
                      onCheckedChange={(v) => set("promo_bar_is_active", v)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field
                    label="Ícone / emoji"
                    hint="Escolha um ícone ou cole um emoji no campo do popover"
                  >
                    <IconPicker
                      value={form.promo_bar_icon}
                      onChange={(v) => set("promo_bar_icon", v)}
                      allowEmoji
                      placeholder="Escolher ícone ou emoji"
                    />
                  </Field>
                  <Field label="Link (opcional)">
                    <Input
                      value={form.promo_bar_url ?? ""}
                      onChange={(e) => set("promo_bar_url", e.target.value)}
                      placeholder="/catalogo"
                    />
                  </Field>
                  <Field label="Texto" full>
                    <Input
                      value={form.promo_bar_text ?? ""}
                      onChange={(e) => set("promo_bar_text", e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Cor de fundo (CSS, opcional)"
                    hint="Ex: #f97316 ou hsl(var(--accent))"
                  >
                    <Input
                      value={form.promo_bar_background_color ?? ""}
                      onChange={(e) => set("promo_bar_background_color", e.target.value || null)}
                    />
                  </Field>
                  <Field label="Cor do texto (CSS, opcional)">
                    <Input
                      value={form.promo_bar_text_color ?? ""}
                      onChange={(e) => set("promo_bar_text_color", e.target.value || null)}
                    />
                  </Field>
                  <Field label="Início (opcional)">
                    <Input
                      type="datetime-local"
                      value={form.promo_bar_starts_at ? form.promo_bar_starts_at.slice(0, 16) : ""}
                      onChange={(e) =>
                        set(
                          "promo_bar_starts_at",
                          e.target.value ? new Date(e.target.value).toISOString() : null,
                        )
                      }
                    />
                  </Field>
                  <Field label="Término (opcional)">
                    <Input
                      type="datetime-local"
                      value={form.promo_bar_ends_at ? form.promo_bar_ends_at.slice(0, 16) : ""}
                      onChange={(e) =>
                        set(
                          "promo_bar_ends_at",
                          e.target.value ? new Date(e.target.value).toISOString() : null,
                        )
                      }
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CTA PRINCIPAL */}
          <TabsContent value="cta" className="mt-4">
            <Card>
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">CTA principal (banner azul)</h2>
                    <p className="text-xs text-muted-foreground">
                      Bloco de marketing/confiança no rodapé da home.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Ativa</Label>
                    <Switch
                      checked={!!form.main_cta_is_active}
                      onCheckedChange={(v) => set("main_cta_is_active", v)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Ícone superior">
                    <IconPicker
                      value={form.main_cta_icon}
                      onChange={(v) => set("main_cta_icon", v)}
                    />
                  </Field>
                  <Field label="Imagem de fundo (URL, opcional)">
                    <Input
                      value={form.main_cta_image_url ?? ""}
                      onChange={(e) => set("main_cta_image_url", e.target.value || null)}
                    />
                  </Field>
                  <Field label="Título" full>
                    <Input
                      value={form.main_cta_title ?? ""}
                      onChange={(e) => set("main_cta_title", e.target.value)}
                    />
                  </Field>
                  <Field label="Descrição" full>
                    <Textarea
                      rows={2}
                      value={form.main_cta_description ?? ""}
                      onChange={(e) => set("main_cta_description", e.target.value)}
                    />
                  </Field>
                  <Field label="Cor de fundo (CSS, opcional)">
                    <Input
                      value={form.main_cta_background_color ?? ""}
                      onChange={(e) => set("main_cta_background_color", e.target.value || null)}
                    />
                  </Field>
                  <Field label="Cor do texto (CSS, opcional)">
                    <Input
                      value={form.main_cta_text_color ?? ""}
                      onChange={(e) => set("main_cta_text_color", e.target.value || null)}
                    />
                  </Field>
                </div>

                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Botão</h3>
                    <Switch
                      checked={!!form.main_cta_button_active}
                      onCheckedChange={(v) => set("main_cta_button_active", v)}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Texto">
                      <Input
                        value={form.main_cta_button_text ?? ""}
                        onChange={(e) => set("main_cta_button_text", e.target.value)}
                      />
                    </Field>
                    <Field label="Link">
                      <Input
                        value={form.main_cta_button_url ?? ""}
                        onChange={(e) => set("main_cta_button_url", e.target.value)}
                      />
                    </Field>
                    <Field label="Cor do botão (CSS, opcional)">
                      <Input
                        value={form.main_cta_button_color ?? ""}
                        onChange={(e) => set("main_cta_button_color", e.target.value || null)}
                      />
                    </Field>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SEO */}
          <TabsContent value="seo" className="mt-4">
            <Card>
              <CardContent className="p-6 space-y-4">
                <h2 className="font-semibold">SEO da homepage</h2>
                <Field label="Title (até ~60 caracteres)" full>
                  <Input
                    value={form.seo_title ?? ""}
                    onChange={(e) => set("seo_title", e.target.value)}
                  />
                </Field>
                <Field label="Meta description (até ~160 caracteres)" full>
                  <Textarea
                    rows={3}
                    value={form.seo_description ?? ""}
                    onChange={(e) => set("seo_description", e.target.value)}
                  />
                </Field>
                <Field label="Imagem Open Graph (URL)" full>
                  <Input
                    value={form.og_image_url ?? ""}
                    onChange={(e) => set("og_image_url", e.target.value || null)}
                  />
                </Field>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-2">
            {mutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Salvar alterações
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
