/**
 * Helpers para construir variantes de imagem do Supabase Storage usando
 * transformações on-the-fly (?width=...&format=webp&quality=...).
 *
 * Tamanhos:
 *  - full:  1200px (galeria/zoom)
 *  - card:  600px  (catálogo)
 *  - thumb: 300px  (thumbnails / mini)
 *  - og:    1200x630 (Open Graph)
 */

export type ImageVariant = "full" | "card" | "thumb" | "og";

const SIZE_MAP: Record<ImageVariant, { width: number; height?: number; quality: number }> = {
  full: { width: 1200, quality: 82 },
  card: { width: 600, quality: 80 },
  thumb: { width: 300, quality: 78 },
  og: { width: 1200, height: 630, quality: 85 },
};

/**
 * Recebe a URL pública original (Supabase Storage) e devolve a versão
 * transformada. Se a URL não for de Storage, devolve a original.
 */
export function variantUrl(
  originalUrl: string | null | undefined,
  variant: ImageVariant,
): string | null {
  if (!originalUrl) return null;
  // O endpoint público é /storage/v1/object/public/<bucket>/<path>
  // O endpoint de transformação é /storage/v1/render/image/public/<bucket>/<path>?width=&format=webp
  const transformed = originalUrl.replace(
    "/storage/v1/object/public/",
    "/storage/v1/render/image/public/",
  );
  if (transformed === originalUrl) return originalUrl; // não é storage
  const cfg = SIZE_MAP[variant];
  const params = new URLSearchParams();
  params.set("width", String(cfg.width));
  if (cfg.height) params.set("height", String(cfg.height));
  params.set("quality", String(cfg.quality));
  params.set("format", "webp");
  params.set("resize", "cover");
  return `${transformed}?${params.toString()}`;
}

export interface ProductImageRow {
  id: string;
  product_id: string;
  sort_order: number;
  is_primary: boolean;
  original_url: string;
  url_full: string | null;
  url_card: string | null;
  url_thumb: string | null;
  url_og: string | null;
  optimized: boolean;
  alt_text: string | null;
  title_text: string | null;
  caption: string | null;
  seo_filename: string | null;
}

export function pickUrl(
  img: Partial<ProductImageRow> | null | undefined,
  variant: ImageVariant,
): string | null {
  if (!img) return null;
  const stored = (() => {
    switch (variant) {
      case "full":
        return img.url_full;
      case "card":
        return img.url_card;
      case "thumb":
        return img.url_thumb;
      case "og":
        return img.url_og;
    }
  })();
  if (stored) return stored;
  return variantUrl(img.original_url ?? null, variant);
}

export type ProductImagePreviewRow = Pick<
  ProductImageRow,
  "original_url" | "url_card" | "url_thumb" | "is_primary" | "sort_order"
>;

/**
 * Garante que uma URL do Supabase Storage seja entregue via /render/image
 * (WebP + resize + cache CDN). Se já estiver no render endpoint ou não for
 * Supabase Storage, devolve como está.
 */
function ensureOptimized(
  url: string | null | undefined,
  variant: ImageVariant = "card",
): string | null {
  if (!url) return null;
  if (url.includes("/storage/v1/render/image/")) return url;
  if (!url.includes("/storage/v1/object/public/")) return url;
  return variantUrl(url, variant);
}

/**
 * Gera um srcset (300w/600w) para URLs já otimizadas pelo endpoint /render/image.
 * Permite que o grid mobile de 2 colunas baixe a imagem de 300px em vez de 600px.
 * Devolve null quando a URL não é transformável (ex.: imagem externa).
 */
export function responsiveSrcSet(url: string | null | undefined): string | null {
  if (!url || !url.includes("/storage/v1/render/image/")) return null;
  const [base, query] = url.split("?");
  const build = (w: number) => {
    const params = new URLSearchParams(query ?? "");
    params.set("width", String(w));
    return `${base}?${params.toString()} ${w}w`;
  };
  return [build(300), build(600)].join(", ");
}

export function imageUrlsFromProductImages(
  images: ProductImagePreviewRow[] | null | undefined,
  fallback: string[] | null | undefined = [],
): string[] {
  const sorted = [...(images ?? [])].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
  const urls = sorted
    .map((img) => ensureOptimized(img.url_card ?? img.url_thumb ?? img.original_url, "card"))
    .filter((url): url is string => !!url);
  if (urls.length) return urls;
  return (fallback ?? [])
    .map((u) => ensureOptimized(u, "card"))
    .filter((url): url is string => !!url);
}
