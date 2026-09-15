// Helpers para gerar metadados SEO consistentes em todas as rotas (head() do TanStack Start).
// Sem react-helmet — usamos a API nativa do TanStack Router/Start, que é SSR-safe.

export const SITE_NAME = "Led Maricá";
export const SITE_URL = "https://www.ledmarica.com.br";
export const SITE_DESCRIPTION =
  "Material elétrico e iluminação LED com qualidade e preço justo em Maricá/RJ. Lâmpadas, disjuntores, cabos, refletores e muito mais. Retirada grátis na loja em Maricá.";

export interface SeoInput {
  title?: string;
  description?: string;
  url?: string; // path absoluto (/catalogo, /produto/lampada-led-9w...)
  image?: string;
  type?: "website" | "product" | "article";
  noindex?: boolean;
  product?: {
    price: number;
    availability: "InStock" | "OutOfStock";
    sku?: string | null;
    brand?: string | null;
  };
}

type Meta = {
  title?: string;
  name?: string;
  property?: string;
  content?: string;
  charSet?: string;
};

/**
 * Constrói os arrays `meta` e `links` para passar a `head()` de uma rota TanStack.
 */
export function buildSeo(input: SeoInput = {}): {
  meta: Meta[];
  links: { rel: string; href: string }[];
} {
  const fullTitle = input.title
    ? `${input.title} | ${SITE_NAME}`
    : `${SITE_NAME} — Material Elétrico & Iluminação LED em Maricá/RJ`;
  const description = input.description ?? SITE_DESCRIPTION;
  const canonical = input.url ? `${SITE_URL}${input.url}` : SITE_URL;
  const image = input.image ?? `${SITE_URL}/og-default.png`;
  const type = input.type ?? "website";

  const meta: Meta[] = [
    { title: fullTitle },
    { name: "description", content: description },
    { name: "robots", content: input.noindex ? "noindex, nofollow" : "index, follow" },
    { name: "author", content: SITE_NAME },
    { name: "geo.region", content: "BR-RJ" },
    { name: "geo.placename", content: "Maricá" },

    // Open Graph
    { property: "og:type", content: type },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:image", content: image },
    { property: "og:url", content: canonical },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "pt_BR" },

    // Twitter
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];

  if (type === "product" && input.product) {
    meta.push(
      { property: "product:price:amount", content: String(input.product.price) },
      { property: "product:price:currency", content: "BRL" },
      { property: "product:availability", content: input.product.availability },
    );
    if (input.product.brand) meta.push({ property: "product:brand", content: input.product.brand });
    if (input.product.sku)
      meta.push({ property: "product:retailer_item_id", content: input.product.sku });
  }

  return { meta, links: [{ rel: "canonical", href: canonical }] };
}

/** Trunca preservando palavras inteiras. */
export function clamp(text: string, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}
