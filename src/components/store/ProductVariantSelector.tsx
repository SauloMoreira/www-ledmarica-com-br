import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getProductFamily } from "@/server/productVariants.functions";

const COLOR_HEX: Record<string, string> = {
  branco: "#ffffff",
  preto: "#111111",
  cinza: "#9ca3af",
  prata: "#c0c0c0",
  dourado: "#d4af37",
  amarelo: "#facc15",
  vermelho: "#dc2626",
  azul: "#2563eb",
  verde: "#16a34a",
  laranja: "#f97316",
  rosa: "#ec4899",
  roxo: "#7c3aed",
  marrom: "#78350f",
  bege: "#e7d8c1",
};

function colorHex(value: string): string | null {
  const key = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  return COLOR_HEX[key] ?? null;
}

type Props = { productId: string; currentSlug: string; onChange?: () => void };

export function ProductVariantSelector({ productId, currentSlug, onChange }: Props) {
  const { data } = useQuery({
    queryKey: ["product-family", productId],
    queryFn: () => getProductFamily({ data: { productId } }),
    staleTime: 60_000,
  });

  const members = data?.members ?? [];
  const option = data?.option;
  if (!option || members.length < 2) return null;

  const title = option.option_title;

  // O produto-pai normalmente não tem valor gravado em variant_attributes:
  // nesse caso mostramos um rótulo curto ("Padrão") em vez do nome completo.
  const labelOf = (m: (typeof members)[number]) =>
    m.variant_attributes?.[title]?.trim() || (m.is_parent ? "Padrão" : m.name);

  const current = members.find((m) => m.slug === currentSlug);

  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">
        {title}: <strong className="text-foreground">{current ? labelOf(current) : "—"}</strong>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={`Escolher ${title}`}>
        {members.map((m) => {
          const value = labelOf(m);
          const selected = m.slug === currentSlug;
          const soldOut = m.stock_qty <= 0;
          const hex = option.display_type === "swatch_color" ? colorHex(value) : null;
          return (
            <Link
              key={m.id}
              to="/produto/$slug"
              params={{ slug: m.slug }}
              preload="intent"
              onClick={onChange}
              aria-pressed={selected}
              aria-label={`${title}: ${value}${soldOut ? ", esgotado" : ""}`}
              title={soldOut ? "Esgotado nesta opção" : value}
              className={[
                "min-h-10 px-3 inline-flex items-center gap-2 rounded-pill border text-sm font-medium transition",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                selected
                  ? "border-accent bg-accent/10 text-foreground"
                  : "border-border bg-surface text-muted-foreground hover:border-accent",
                soldOut ? "opacity-50 line-through" : "",
              ].join(" ")}
            >
              {hex && (
                <span
                  aria-hidden="true"
                  className="w-4 h-4 rounded-full border border-border"
                  style={{ backgroundColor: hex }}
                />
              )}
              {value}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
