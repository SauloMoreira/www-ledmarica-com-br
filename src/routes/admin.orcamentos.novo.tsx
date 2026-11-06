import { createFileRoute } from "@tanstack/react-router";
import { buildSeo } from "@/lib/seo";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { QuoteEditor } from "@/components/admin/quotes/QuoteEditor";

export const Route = createFileRoute("/admin/orcamentos/novo")({
  head: () => buildSeo({ title: "Novo orçamento PJ", url: "/admin/orcamentos/novo", noindex: true }),
  component: NewQuotePage,
});

function NewQuotePage() {
  return (
    <AdminLayout title="Novo orçamento">
      <QuoteEditor initial={null} />
    </AdminLayout>
  );
}
