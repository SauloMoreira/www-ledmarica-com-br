import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { InstitutionalSEOSection } from "@/components/admin/InstitutionalSEOSection";

import {
  adminGetInstitutionalPage,
  adminSaveInstitutionalPage,
} from "@/server/institutional.functions";

export const Route = createFileRoute("/admin/institutional-pages/$id")({
  component: EditPage,
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 120);
}

function EditPage() {
  const { id } = useParams({ from: "/admin/institutional-pages/$id" });
  const isNew = id === "new";
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-page", id],
    queryFn: () => adminGetInstitutionalPage({ data: { id } }),
    enabled: !isNew,
  });

  const [form, setForm] = useState({
    title: "",
    slug: "",
    content: "",
    excerpt: "",
    seo_title: "",
    seo_description: "",
    status: "draft" as "draft" | "published" | "archived",
    sort_order: 0,
    show_in_footer: true,
    show_in_header: false,
    is_required: false,
  });
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (data?.page) {
      const p = data.page;
      setForm({
        title: p.title,
        slug: p.slug,
        content: p.content || "",
        excerpt: p.excerpt ?? "",
        seo_title: p.seo_title ?? "",
        seo_description: p.seo_description ?? "",
        status: p.status as "draft" | "published" | "archived",
        sort_order: p.sort_order,
        show_in_footer: p.show_in_footer,
        show_in_header: p.show_in_header,
        is_required: p.is_required,
      });
      setSlugTouched(true);
    }
  }, [data?.page]);

  const save = useMutation({
    mutationFn: () =>
      adminSaveInstitutionalPage({
        data: {
          id: isNew ? undefined : id,
          title: form.title,
          slug: form.slug || slugify(form.title),
          content: form.content,
          excerpt: form.excerpt || null,
          seo_title: form.seo_title || null,
          seo_description: form.seo_description || null,
          status: form.status,
          sort_order: form.sort_order,
          show_in_footer: form.show_in_footer,
          show_in_header: form.show_in_header,
        },
      }),
    onSuccess: (r) => {
      toast.success("Página salva");
      qc.invalidateQueries({ queryKey: ["admin-pages"] });
      qc.invalidateQueries({ queryKey: ["footer-pages"] });
      if (isNew && r.id) nav({ to: "/admin/institutional-pages/$id", params: { id: r.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminLayout
      title={isNew ? "Nova Página" : `Editar: ${form.title || "..."}`}
      action={
        <Button onClick={() => save.mutate()} disabled={save.isPending || !form.title.trim()}>
          {save.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Salvar
        </Button>
      }
    >
      {isLoading && !isNew ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6 max-w-6xl">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="title">Título *</Label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({ ...f, title: v, slug: slugTouched ? f.slug : slugify(v) }));
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    value={form.slug}
                    disabled={form.is_required}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setForm({ ...form, slug: slugify(e.target.value) });
                    }}
                  />
                  {form.is_required && (
                    <p className="text-xs text-muted-foreground">
                      Slug bloqueado em página obrigatória.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="excerpt">Resumo</Label>
                  <Textarea
                    id="excerpt"
                    rows={2}
                    maxLength={500}
                    value={form.excerpt}
                    onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Conteúdo</Label>
                  <RichTextEditor
                    value={form.content}
                    onChange={(html) => setForm({ ...form, content: html })}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="space-y-4">
            <Card>
              <CardContent className="p-6 space-y-4">
                <h3 className="font-semibold">Publicação</h3>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={form.status}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        status: e.target.value as "draft" | "published" | "archived",
                      })
                    }
                  >
                    <option value="draft">Rascunho</option>
                    <option value="published">Publicada</option>
                    <option value="archived">Arquivada</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="order">Ordem no rodapé</Label>
                  <Input
                    id="order"
                    type="number"
                    min={0}
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.show_in_footer}
                    onChange={(e) => setForm({ ...form, show_in_footer: e.target.checked })}
                  />
                  Mostrar no rodapé
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.show_in_header}
                    onChange={(e) => setForm({ ...form, show_in_header: e.target.checked })}
                  />
                  Mostrar no menu
                </label>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <InstitutionalSEOSection
                  pageId={isNew ? undefined : id}
                  pageCtx={{
                    title: form.title,
                    excerpt: form.excerpt,
                    content: form.content,
                  }}
                  seoTitle={form.seo_title}
                  seoDescription={form.seo_description}
                  slug={form.slug}
                  onChange={(field, value) => setForm((f) => ({ ...f, [field]: value }))}
                  onBoosted={() => {
                    qc.invalidateQueries({ queryKey: ["admin-pages"] });
                  }}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
