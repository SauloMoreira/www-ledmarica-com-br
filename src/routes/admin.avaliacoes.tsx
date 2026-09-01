import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, MessageCircle, EyeOff, Eye } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/avaliacoes")({
  component: AdminReviewsPage,
});

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`w-3.5 h-3.5 ${n <= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`}
        />
      ))}
    </div>
  );
}

function AdminReviewsPage() {
  const queryClient = useQueryClient();
  const [openReplyFor, setOpenReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data: reviews, isLoading } = useQuery({
    queryKey: ["admin-product-reviews"],
    queryFn: async () => {
      return await fetchAllRows<any>((from, to) =>
        supabase
          .from("product_reviews")
          .select(
            "id, rating, title, comment, is_hidden, created_at, profiles(name), products(name, slug), product_review_messages(id, author_type, message, created_at, profiles(name))",
          )
          .order("created_at", { ascending: false })
          .range(from, to),
      );
    },
  });

  const handleToggleHidden = async (reviewId: string, current: boolean) => {
    const { error } = await supabase
      .from("product_reviews")
      .update({ is_hidden: !current })
      .eq("id", reviewId);
    if (error) {
      toast.error("Não foi possível atualizar a avaliação.");
      return;
    }
    toast.success(!current ? "Avaliação ocultada." : "Avaliação visível novamente.");
    queryClient.invalidateQueries({ queryKey: ["admin-product-reviews"] });
  };

  const handleReply = async (reviewId: string) => {
    if (!replyText.trim()) return;
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    const { error } = await supabase.from("product_review_messages").insert({
      review_id: reviewId,
      author_type: "store",
      author_user_id: uid,
      message: replyText.trim(),
    });
    if (error) {
      toast.error("Não foi possível enviar a resposta.");
      return;
    }
    setReplyText("");
    setOpenReplyFor(null);
    toast.success("Resposta publicada.");
    queryClient.invalidateQueries({ queryKey: ["admin-product-reviews"] });
  };

  return (
    <AdminLayout title="Avaliações de produtos">
      <div className="space-y-4 max-w-4xl">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!isLoading && (reviews ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma avaliação recebida ainda.</p>
        )}
        {(reviews ?? []).map((r: any) => (
          <div
            key={r.id}
            className={`rounded-lg border p-4 space-y-3 ${r.is_hidden ? "opacity-60 bg-muted/30" : "bg-card"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">
                  {r.products?.name ?? "Produto removido"}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <Stars value={r.rating} />
                  <span>{r.profiles?.name ?? "Cliente"}</span>
                  {r.is_hidden && (
                    <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] uppercase tracking-wider">
                      Oculta
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleToggleHidden(r.id, r.is_hidden)}
                className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground shrink-0"
              >
                {r.is_hidden ? (
                  <>
                    <Eye className="w-3.5 h-3.5" /> Reexibir
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5" /> Ocultar
                  </>
                )}
              </button>
            </div>

            {r.title && <p className="text-sm font-medium">{r.title}</p>}
            <p className="text-sm whitespace-pre-wrap">{r.comment}</p>

            {(r.product_review_messages ?? []).length > 0 && (
              <div className="space-y-1.5 border-l-2 border-muted pl-3 text-sm">
                {r.product_review_messages.map((m: any) => (
                  <div key={m.id}>
                    <span className="font-semibold">
                      {m.author_type === "store" ? "Você (loja)" : (m.profiles?.name ?? "Cliente")}:
                    </span>{" "}
                    <span className="whitespace-pre-wrap">{m.message}</span>
                  </div>
                ))}
              </div>
            )}

            <div>
              {openReplyFor === r.id ? (
                <div className="flex items-center gap-2">
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Responder como Led Maricá..."
                    className="flex-1 rounded-md border px-3 py-1.5 text-sm bg-background"
                  />
                  <button
                    type="button"
                    onClick={() => handleReply(r.id)}
                    className="text-sm font-medium text-accent"
                  >
                    Enviar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenReplyFor(null);
                      setReplyText("");
                    }}
                    className="text-xs text-muted-foreground"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenReplyFor(r.id)}
                  className="text-xs text-muted-foreground hover:text-accent flex items-center gap-1"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> Responder como loja
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
