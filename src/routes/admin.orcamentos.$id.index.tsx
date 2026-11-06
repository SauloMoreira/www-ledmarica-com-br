import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { buildSeo } from "@/lib/seo";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { QuoteEditor } from "@/components/admin/quotes/QuoteEditor";
import { getQuote, type QuoteWithItems } from "@/server/quotes.functions";

export const Route = createFileRoute("/admin/orcamentos/$id/")({
  head: () => buildSeo({ title: "Orçamento PJ", url: "/admin/orcamentos", noindex: true }),
  component: EditQuotePage,
});

function EditQuotePage() {
  const { id } = Route.useParams();
  const [quote, setQuote] = useState<QuoteWithItems | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setQuote(null);
    setError(null);
    getQuote({ data: { id } })
      .then((q) => alive && setQuote(q))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Erro ao carregar"));
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <AdminLayout title="Orçamento">
      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : !quote ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando orçamento…
        </div>
      ) : (
        <QuoteEditor key={quote.id} initial={quote} />
      )}
    </AdminLayout>
  );
}
