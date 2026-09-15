import { supabase } from "@/integrations/supabase/client";

export type HomepageCardType = "benefit" | "promo";

export interface HomepageCard {
  id: string;
  card_type: HomepageCardType;
  title: string;
  description: string | null;
  icon: string | null;
  image_url: string | null;
  link_url: string | null;
  link_label: string | null;
  visual_variant: string | null;
  sort_order: number;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
}

export interface HomepageFeaturedCategory {
  id: string;
  category_id: string;
  custom_title: string | null;
  custom_description: string | null;
  custom_image_url: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  // join
  category?: {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    active: boolean;
  } | null;
}

const CARD_COLS =
  "id, card_type, title, description, icon, image_url, link_url, link_label, visual_variant, sort_order, is_active, start_date, end_date";

export async function fetchHomepageCards(type: HomepageCardType): Promise<HomepageCard[]> {
  const { data, error } = await (supabase as any)
    .from("homepage_cards")
    .select(CARD_COLS)
    .eq("card_type", type)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) {
    console.warn("[homepageBlocks] fetchHomepageCards error", error);
    return [];
  }
  const now = Date.now();
  return ((data ?? []) as HomepageCard[]).filter((c) => {
    if (c.start_date && new Date(c.start_date).getTime() > now) return false;
    if (c.end_date && new Date(c.end_date).getTime() < now) return false;
    return true;
  });
}

export async function fetchHomepageFeaturedCategories(): Promise<HomepageFeaturedCategory[]> {
  const { data, error } = await (supabase as any)
    .from("homepage_featured_categories")
    .select(
      "id, category_id, custom_title, custom_description, custom_image_url, icon, sort_order, is_active, category:categories(id, name, slug, icon, active)",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) {
    console.warn("[homepageBlocks] fetchHomepageFeaturedCategories error", error);
    return [];
  }
  return ((data ?? []) as HomepageFeaturedCategory[]).filter(
    (row) => row.category && row.category.active !== false,
  );
}

// Admin variants (sem filtro de ativo / janela de datas)
export async function adminListHomepageCards(type: HomepageCardType): Promise<HomepageCard[]> {
  const { data, error } = await (supabase as any)
    .from("homepage_cards")
    .select(CARD_COLS)
    .eq("card_type", type)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as HomepageCard[];
}

export async function adminListHomepageFeaturedCategories(): Promise<HomepageFeaturedCategory[]> {
  const { data, error } = await (supabase as any)
    .from("homepage_featured_categories")
    .select(
      "id, category_id, custom_title, custom_description, custom_image_url, icon, sort_order, is_active, category:categories(id, name, slug, icon, active)",
    )
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as HomepageFeaturedCategory[];
}

// =====================================================================
// Vitrines de produtos (Onda Homepage D)
// =====================================================================

export type ShowcaseType =
  | "featured"
  | "offers"
  | "best_sellers"
  | "new_arrivals"
  | "category"
  | "bundles"
  | "custom";
export type ShowcaseMode = "auto" | "manual";
export type ShowcaseVisual = "default" | "premium" | "compact" | "highlighted";
export type ShowcaseItemType = "product" | "combo";

export interface HomepageShowcase {
  id: string;
  title: string;
  subtitle: string | null;
  showcase_type: ShowcaseType;
  mode: ShowcaseMode;
  product_limit: number;
  category_id: string | null;
  is_active: boolean;
  sort_order: number;
  visual_variant: ShowcaseVisual;
  show_view_all_button: boolean;
  view_all_url: string | null;
}

export interface HomepageShowcaseItem {
  id: string;
  showcase_id: string;
  item_type: ShowcaseItemType;
  product_id: string | null;
  combo_id: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ResolvedShowcaseProduct {
  kind: "product";
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  price: number;
  sale_price: number | null;
  stock_qty: number | null;
  images: string[] | null;
  featured: boolean | null;
  free_shipping_eligible: boolean | null;
  category_id: string | null;
  b2b_enabled?: boolean | null;
  b2b_price?: number | null;
  b2b_min_qty?: number | null;
}
export interface ResolvedShowcaseCombo {
  kind: "combo";
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  image_url: string | null;
  discount_type: string;
  discount_value: number;
  items_count: number;
}
export type ResolvedShowcaseItem = ResolvedShowcaseProduct | ResolvedShowcaseCombo;

export interface ResolvedShowcase extends HomepageShowcase {
  items: ResolvedShowcaseItem[];
}

const SHOWCASE_COLS =
  "id, title, subtitle, showcase_type, mode, product_limit, category_id, is_active, sort_order, visual_variant, show_view_all_button, view_all_url";

/** Pública: usa RPC que já filtra por ativo, preço e B2B-safe */
export async function fetchHomepageShowcasesPublic(): Promise<ResolvedShowcase[]> {
  const { data, error } = await (supabase as any).rpc("get_homepage_showcases_public");
  if (error) {
    console.warn("[homepageBlocks] fetchHomepageShowcasesPublic error", error);
    return [];
  }
  return (Array.isArray(data) ? data : []) as ResolvedShowcase[];
}

export async function adminListHomepageShowcases(): Promise<HomepageShowcase[]> {
  const { data, error } = await (supabase as any)
    .from("homepage_product_showcases")
    .select(SHOWCASE_COLS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as HomepageShowcase[];
}

export async function adminCreateHomepageShowcase(
  payload: Partial<HomepageShowcase>,
): Promise<HomepageShowcase> {
  const { data, error } = await (supabase as any)
    .from("homepage_product_showcases")
    .insert(payload)
    .select(SHOWCASE_COLS)
    .single();
  if (error) throw error;
  return data as HomepageShowcase;
}

export async function adminUpdateHomepageShowcase(
  id: string,
  payload: Partial<HomepageShowcase>,
): Promise<void> {
  const { error } = await (supabase as any)
    .from("homepage_product_showcases")
    .update(payload)
    .eq("id", id);
  if (error) throw error;
}

export async function adminDeleteHomepageShowcase(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("homepage_product_showcases")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function adminListShowcaseItems(showcaseId: string): Promise<HomepageShowcaseItem[]> {
  const { data, error } = await (supabase as any)
    .from("homepage_showcase_items")
    .select("id, showcase_id, item_type, product_id, combo_id, sort_order, is_active")
    .eq("showcase_id", showcaseId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as HomepageShowcaseItem[];
}

export async function adminAddShowcaseItem(payload: {
  showcase_id: string;
  item_type: ShowcaseItemType;
  product_id?: string | null;
  combo_id?: string | null;
  sort_order?: number;
}): Promise<void> {
  const { error } = await (supabase as any).from("homepage_showcase_items").insert(payload);
  if (error) throw error;
}

export async function adminUpdateShowcaseItem(
  id: string,
  payload: Partial<HomepageShowcaseItem>,
): Promise<void> {
  const { error } = await (supabase as any)
    .from("homepage_showcase_items")
    .update(payload)
    .eq("id", id);
  if (error) throw error;
}

export async function adminDeleteShowcaseItem(id: string): Promise<void> {
  const { error } = await (supabase as any).from("homepage_showcase_items").delete().eq("id", id);
  if (error) throw error;
}

// =====================================================================
// Ordem e visibilidade das seções (Onda Homepage E)
// =====================================================================

export type HomepageSectionKey =
  | "promo_bar"
  | "hero"
  | "benefits_cards"
  | "promo_cards"
  | "featured_categories"
  | "offers_showcase"
  | "featured_showcase"
  | "dynamic_showcases"
  | "combos_showcase"
  | "institutional_block"
  | "main_cta"
  | "newsletter_signup";

export interface HomepageSection {
  id: string;
  section_key: HomepageSectionKey | string;
  title: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  is_locked: boolean;
}

/** Ordem padrão usada como fallback se a tabela estiver vazia ou falhar. */
export const DEFAULT_HOMEPAGE_SECTION_ORDER: Array<{
  section_key: HomepageSectionKey;
  title: string;
  description: string;
  sort_order: number;
  is_active: boolean;
}> = [
  {
    section_key: "promo_bar",
    title: "Faixa promocional",
    description: "Barra fina no topo com aviso/promoção.",
    sort_order: 10,
    is_active: true,
  },
  {
    section_key: "hero",
    title: "Hero principal",
    description: "Carrossel/imagem de destaque do topo.",
    sort_order: 20,
    is_active: true,
  },
  {
    section_key: "benefits_cards",
    title: "Cards de benefícios",
    description: "Diferenciais (entrega, garantia, atendimento etc.).",
    sort_order: 30,
    is_active: true,
  },
  {
    section_key: "promo_cards",
    title: "Cards promocionais",
    description: "Cards de campanhas e promoções rápidas.",
    sort_order: 40,
    is_active: true,
  },
  {
    section_key: "featured_categories",
    title: "Categorias em destaque",
    description: "Atalhos para categorias principais.",
    sort_order: 50,
    is_active: true,
  },
  {
    section_key: "offers_showcase",
    title: "Ofertas da semana",
    description: "Vitrine de produtos em oferta (configurável ou fallback).",
    sort_order: 60,
    is_active: true,
  },
  {
    section_key: "featured_showcase",
    title: "Produtos em destaque",
    description: "Vitrine principal de destaques (configurável ou fallback).",
    sort_order: 70,
    is_active: true,
  },
  {
    section_key: "dynamic_showcases",
    title: "Vitrines configuráveis",
    description: "Demais vitrines criadas no admin (bundles, categoria, etc.).",
    sort_order: 80,
    is_active: true,
  },
  {
    section_key: "combos_showcase",
    title: "Kits e combos",
    description: "Bloco de combos/kits (em breve).",
    sort_order: 90,
    is_active: false,
  },
  {
    section_key: "institutional_block",
    title: "Bloco institucional",
    description: "Selo de avaliação no Google e dados da loja física (endereço, mapa, telefone, horário).",
    sort_order: 100,
    is_active: true,
  },
  {
    section_key: "main_cta",
    title: "CTA principal",
    description: "Chamada final administrável da home.",
    sort_order: 110,
    is_active: true,
  },
  {
    section_key: "newsletter_signup",
    title: "Cadastro de e-mail (newsletter)",
    description: "Captura de e-mail com cupom de boas-vindas, no rodapé da home.",
    sort_order: 120,
    is_active: true,
  },
];

const SECTION_COLS = "id, section_key, title, description, sort_order, is_active, is_locked";

/** Pública: usada pela home para decidir ordem/visibilidade. Fallback seguro. */
export async function fetchHomepageSections(): Promise<HomepageSection[]> {
  const { data, error } = await (supabase as any)
    .from("homepage_sections")
    .select(SECTION_COLS)
    .order("sort_order", { ascending: true });
  if (error) {
    console.warn("[homepageBlocks] fetchHomepageSections error", error);
    return [];
  }
  return (data ?? []) as HomepageSection[];
}

export async function adminListHomepageSections(): Promise<HomepageSection[]> {
  const { data, error } = await (supabase as any)
    .from("homepage_sections")
    .select(SECTION_COLS)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as HomepageSection[];
}

export async function adminUpdateHomepageSection(
  id: string,
  payload: Partial<Pick<HomepageSection, "is_active" | "sort_order">>,
): Promise<void> {
  const { error } = await (supabase as any).from("homepage_sections").update(payload).eq("id", id);
  if (error) throw error;
}

/** Restaura a ordem padrão (sort_order + is_active dos defaults). Mantém section_key/título. */
export async function adminResetHomepageSections(): Promise<void> {
  for (const def of DEFAULT_HOMEPAGE_SECTION_ORDER) {
    const { error } = await (supabase as any)
      .from("homepage_sections")
      .update({ sort_order: def.sort_order, is_active: def.is_active })
      .eq("section_key", def.section_key);
    if (error) throw error;
  }
}
