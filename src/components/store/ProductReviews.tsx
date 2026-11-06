import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDateBR } from "@/lib/dateBR";

interface ProductReviewsProps {
  productId: string;
  avgRating: number;
  reviewCount: number;
}

function Stars({ value, size = "w-4 h-4" }: { value: number; size?: string }) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${size} ${n <= Math.round(value) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`}
        />
      ))}
    </div>
  );
}

export function ProductReviews({ productId, avgRating, reviewCount }: ProductReviewsProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: reviews } = useQuery({
    queryKey: ["product-reviews", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_reviews")
        .select(
          "id, user_id, rating, title, comment, created_at, profiles(name), product_review_messages(id, author_type, author_user_id, message, created_at, profiles(name))",
        )
        .eq("product_id", productId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: canReview } = useQuery({
    queryKey: ["can-review-product", productId, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("user_purchased_product" as never, {
        _user_id: user!.id,
        _product_id: productId,
      } as never);
      if (error) return false;
      return Boolean(data);
    },
  });

  const myReview = (reviews ?? []).find((r: any) => r.user_id === user?.id);

  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !comment.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("product_reviews").insert({
      product_id: productId,
      user_id: user.id,
      rating,
      title: title.trim() || null,
      comment: comment.trim(),
    });
    setSubmitting(false);
    if (!error) {
      setTitle("");
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["product-reviews", productId] });
    }
  };

  return (
    <section className="mt-12 max-w-3xl">
      <h2 className="font-display font-bold text-2xl mb-4">Avaliações</h2>
      <div className="flex items-center gap-3 mb-8">
        <Stars value={avgRating} size="w-5 h-5" />
        <span className="font-semibold text-lg">{avgRating.toFixed(1)}</span>
        <span className="text-sm text-muted-foreground">
          ({reviewCount} avaliaç{reviewCount === 1 ? "ão" : "ões"})
        </span>
      </div>

      {user && canReview && !myReview && (
        <form onSubmit={handleSubmitReview} className="border border-border rounded-xl p-4 mb-8 bg-card space-y-3">
          <h3 className="font-semibold text-sm">Avalie este produto</h3>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)}>
                <Star
                  className={`w-6 h-6 ${n <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`}
                />
              </button>
            ))}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título (opcional)"
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            required
            placeholder="Conte sua experiência com o produto"
            rows={3}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-pill px-5 py-2 text-sm font-semibold bg-accent text-accent-foreground disabled:opacity-60"
          >
            {submitting ? "Enviando..." : "Publicar avaliação"}
          </button>
        </form>
      )}

      {user && !canReview && !myReview && (
        <p className="text-sm text-muted-foreground mb-8">
          Só é possível avaliar produtos que você já comprou.
        </p>
      )}

      <div className="space-y-6">
        {(reviews ?? []).map((r: any) => (
          <ReviewCard key={r.id} review={r} productId={productId} currentUserId={user?.id} />
        ))}
        {(reviews ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma avaliação ainda. Seja o primeiro a avaliar!
          </p>
        )}
      </div>
    </section>
  );
}

function ReviewCard({
  review,
  productId,
  currentUserId,
}: {
  review: any;
  productId: string;
  currentUserId?: string;
}) {
  const queryClient = useQueryClient();
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState("");
  const isOwn = review.user_id === currentUserId;

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || !currentUserId) return;
    await supabase.from("product_review_messages").insert({
      review_id: review.id,
      author_type: "customer",
      author_user_id: currentUserId,
      message: reply.trim(),
    });
    setReply("");
    setReplyOpen(false);
    queryClient.invalidateQueries({ queryKey: ["product-reviews", productId] });
  };

  return (
    <div className="border-b border-border pb-6">
      <div className="flex items-center gap-2 mb-1">
        <Stars value={review.rating} />
        <span className="text-sm font-medium">{review.profiles?.name ?? "Cliente"}</span>
        <span className="text-xs text-muted-foreground">
          {formatDateBR(review.created_at)}
        </span>
      </div>
      {review.title && <p className="font-semibold text-sm mb-1">{review.title}</p>}
      <p className="text-sm text-foreground/90">{review.comment}</p>

      {(review.product_review_messages ?? []).length > 0 && (
        <div className="mt-3 ml-4 pl-3 border-l-2 border-border space-y-2">
          {review.product_review_messages.map((m: any) => (
            <div key={m.id} className="text-sm">
              <span className={`font-semibold ${m.author_type === "store" ? "text-accent" : ""}`}>
                {m.author_type === "store" ? "Led Maricá" : (m.profiles?.name ?? "Cliente")}:
              </span>{" "}
              {m.message}
            </div>
          ))}
        </div>
      )}

      {isOwn && (
        <div className="mt-2 ml-4">
          {replyOpen ? (
            <form onSubmit={handleReply} className="flex gap-2">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Adicionar comentário..."
                className="flex-1 rounded-md border border-border px-2 py-1 text-xs"
              />
              <button type="submit" className="text-xs font-medium text-accent">
                Enviar
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setReplyOpen(true)}
              className="text-xs text-muted-foreground hover:text-accent flex items-center gap-1"
            >
              <MessageCircle className="w-3 h-3" /> Adicionar comentário
            </button>
          )}
        </div>
      )}
    </div>
  );
}
