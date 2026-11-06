import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, ExternalLink, Eye, Archive, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  adminListInstitutionalPages,
  adminDeleteInstitutionalPage,
  adminSaveInstitutionalPage,
} from "@/server/institutional.functions";
import { formatDateTimeBR } from "@/lib/dateBR";

export const Route = createFileRoute("/admin/institutional-pages/")({
  component: AdminPagesList,
});

function statusLabel(s: string) {
  return s === "published" ? "Publicada" : s === "draft" ? "Rascunho" : "Arquivada";
}
function statusColor(s: string): "default" | "secondary" | "outline" {
  return s === "published" ? "default" : s === "draft" ? "secondary" : "outline";
}

function AdminPagesList() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-pages"],
    queryFn: () => adminListInstitutionalPages({ data: undefined as never }),
  });

  const del = useMutation({
    mutationFn: (id: string) => adminDeleteInstitutionalPage({ data: { id } }),
    onSuccess: () => {
      toast.success("Página excluída");
      qc.invalidateQueries({ queryKey: ["admin-pages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: async (page: {
      id: string;
      title: string;
      slug: string;
      status: string;
      sort_order: number;
      show_in_footer: boolean;
      show_in_header: boolean;
    }) => {
      const next = page.status === "published" ? "archived" : "published";
      // need full page; reload then save
      const { adminGetInstitutionalPage } = await import("@/server/institutional.functions");
      const { page: full } = await adminGetInstitutionalPage({ data: { id: page.id } });
      return adminSaveInstitutionalPage({
        data: {
          id: full.id,
          title: full.title,
          slug: full.slug,
          content: full.content,
          excerpt: full.excerpt,
          seo_title: full.seo_title,
          seo_description: full.seo_description,
          status: next as "published" | "archived",
          sort_order: full.sort_order,
          show_in_footer: full.show_in_footer,
          show_in_header: full.show_in_header,
        },
      });
    },
    onSuccess: () => {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["admin-pages"] });
      qc.invalidateQueries({ queryKey: ["footer-pages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminLayout
      title="Páginas Institucionais"
      action={
        <Button asChild>
          <Link to="/admin/institutional-pages/$id" params={{ id: "new" }}>
            <Plus className="w-4 h-4" /> Nova página
          </Link>
        </Button>
      }
    >
      {isLoading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-3 font-medium">Título</th>
                <th className="p-3 font-medium">Slug</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium text-center">Rodapé</th>
                <th className="p-3 font-medium text-center">Ordem</th>
                <th className="p-3 font-medium">Atualizada</th>
                <th className="p-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data?.pages.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="p-3">
                    <div className="font-medium">{p.title}</div>
                    {p.is_required && (
                      <div className="text-xs text-muted-foreground">obrigatória</div>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground font-mono text-xs">{p.slug}</td>
                  <td className="p-3">
                    <Badge variant={statusColor(p.status)}>{statusLabel(p.status)}</Badge>
                  </td>
                  <td className="p-3 text-center">{p.show_in_footer ? "✓" : "—"}</td>
                  <td className="p-3 text-center">{p.sort_order}</td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {formatDateTimeBR(p.updated_at)}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button asChild size="sm" variant="ghost" title="Ver na loja">
                        <a
                          href={`/institucional/${p.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title={p.status === "published" ? "Arquivar" : "Publicar"}
                        onClick={() => toggleStatus.mutate(p)}
                      >
                        {p.status === "published" ? (
                          <Archive className="w-4 h-4" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                      </Button>
                      <Button asChild size="sm" variant="ghost" title="Editar">
                        <Link to="/admin/institutional-pages/$id" params={{ id: p.id }}>
                          <Edit className="w-4 h-4" />
                        </Link>
                      </Button>
                      {!p.is_required && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Excluir"
                          onClick={() => {
                            if (confirm("Excluir esta página?")) del.mutate(p.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!data?.pages.length && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    Nenhuma página criada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </AdminLayout>
  );
}
