import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

export type SeoSeverity = "ok" | "warn" | "danger";

export interface SeoIssue {
  code: string;
  label: string;
  severity: SeoSeverity;
  recommendation?: string;
}

export interface SeoProductRow {
  id: string;
  name: string;
  slug: string;
  score: number;
  severity: SeoSeverity;
  issues: SeoIssue[];
  hasImage: boolean;
  categoryId: string | null;
  categoryName: string | null;
  active: boolean;
  sku: string | null;
}

export interface SeoCategoryRow {
  id: string;
  name: string;
  slug: string;
  score: number;
  severity: SeoSeverity;
  issues: SeoIssue[];
  productsActive: number;
}

export interface SeoPageRow {
  id: string;
  title: string;
  slug: string;
  score: number;
  severity: SeoSeverity;
  issues: SeoIssue[];
}

export interface SeoLocalCheck {
  hasMaricaInTitle: boolean;
  hasMaricaInDescription: boolean;
  hasLocalDeliveryZones: boolean;
  hasCompanyAddress: boolean;
  hasGeoStructuredData: boolean;
  notes: string[];
  suggestions: string[];
}

export interface SeoSummary {
  productsTotal: number;
  productsWithIssues: number;
  productsCritical: number;
  productsNoSeoTitle: number;
  productsNoSeoDescription: number;
  productsNoDescription: number;
  productsNoImage: number;
  productsNoCategory: number;
  categoriesTotal: number;
  categoriesWithIssues: number;
  categoriesNoDescription: number;
  pagesTotal: number;
  pagesWithIssues: number;
  pagesIncomplete: number;
  homepageScore: number;
  homepageIssues: SeoIssue[];
  b2bSeoConfigured: boolean;
  averageProductScore: number;
}

export interface SeoInsights {
  summary: SeoSummary;
  products: SeoProductRow[];
  categories: SeoCategoryRow[];
  pages: SeoPageRow[];
  local: SeoLocalCheck;
  generatedAt: string;
}

// =====================================================================
// Recomendações amigáveis por problema
// =====================================================================
const RECOMMENDATIONS: Record<string, string> = {
  no_seo_title:
    "Adicione um título SEO com o nome do produto, marca ou aplicação principal (até 65 caracteres).",
  short_seo_title:
    "O título SEO está curto — inclua a marca, modelo ou benefício para atingir 30–65 caracteres.",
  long_seo_title: "O título SEO está longo — o Google corta acima de 65 caracteres.",
  no_seo_description:
    "Adicione uma meta description curta (70–160 caracteres) explicando o produto e seu benefício.",
  short_seo_description:
    "A meta description está curta. Resuma o produto, o uso e a vantagem em 1–2 frases.",
  long_seo_description:
    "A meta description está longa — mantenha entre 70 e 165 caracteres para não ser cortada.",
  short_description:
    "Inclua detalhes como potência, voltagem, temperatura de cor, aplicação, garantia e diferenciais.",
  no_image: "Produtos com imagem geram mais confiança e conversão. Adicione pelo menos 1 foto.",
  no_slug: "Defina um slug amigável (ex.: lampada-led-9w-branca) para a URL ser indexável.",
  no_keywords: 'Adicione palavras-chave que clientes pesquisariam (ex.: "lâmpada LED Maricá").',
  no_category: "Vincule o produto a uma categoria — ajuda na navegação e na indexação.",
  short_name: "Nome muito curto — clientes e o Google entendem melhor com nomes descritivos.",
  long_name: "Nome muito longo — encurte para até 80 caracteres mantendo a clareza.",
  no_price: "Produtos ativos sem preço não convertem. Defina o preço ou desative temporariamente.",
  no_homepage: "Configure as informações da homepage em Conteúdo > Homepage.",
  no_hero: "Defina o título principal do Hero da home.",
  no_hero_desc: "Adicione uma descrição ao Hero da home.",
  no_og_image:
    "Adicione uma imagem de compartilhamento (Open Graph) — usada quando a página é compartilhada.",
  short_content:
    "Conteúdo curto — adicione mais texto explicativo (mínimo recomendado: 200 caracteres).",
  unpublished: "Página não publicada não aparece no Google. Publique se for de uso público.",
};

function withRecommendation(issue: Omit<SeoIssue, "recommendation">): SeoIssue {
  return { ...issue, recommendation: RECOMMENDATIONS[issue.code] };
}

// =====================================================================
// Helpers de score
// =====================================================================

function scoreSeverity(issues: SeoIssue[]): { score: number; severity: SeoSeverity } {
  let deduction = 0;
  for (const i of issues) {
    if (i.severity === "danger") deduction += 25;
    else if (i.severity === "warn") deduction += 10;
  }
  const score = Math.max(0, 100 - deduction);
  let severity: SeoSeverity = "ok";
  if (issues.some((i) => i.severity === "danger")) severity = "danger";
  else if (issues.some((i) => i.severity === "warn")) severity = "warn";
  return { score, severity };
}

function checkProduct(
  p: {
    id: string;
    name: string;
    slug: string | null;
    description: string | null;
    seo_title: string | null;
    seo_description: string | null;
    seo_keywords: string | null;
    images: string[] | null;
    active: boolean;
    category_id: string | null;
    sku: string | null;
    price: number | null;
  },
  categoryName: string | null,
): SeoProductRow {
  const issues: SeoIssue[] = [];
  const hasImage = (p.images?.length ?? 0) > 0;

  if (!p.seo_title || p.seo_title.trim().length === 0) {
    issues.push(
      withRecommendation({ code: "no_seo_title", label: "Sem título SEO", severity: "danger" }),
    );
  } else if (p.seo_title.length < 30) {
    issues.push(
      withRecommendation({
        code: "short_seo_title",
        label: "Título SEO curto (< 30)",
        severity: "warn",
      }),
    );
  } else if (p.seo_title.length > 65) {
    issues.push(
      withRecommendation({
        code: "long_seo_title",
        label: "Título SEO longo (> 65)",
        severity: "warn",
      }),
    );
  }

  if (!p.seo_description || p.seo_description.trim().length === 0) {
    issues.push(
      withRecommendation({
        code: "no_seo_description",
        label: "Sem meta description",
        severity: "danger",
      }),
    );
  } else if (p.seo_description.length < 70) {
    issues.push(
      withRecommendation({
        code: "short_seo_description",
        label: "Meta description curta (< 70)",
        severity: "warn",
      }),
    );
  } else if (p.seo_description.length > 165) {
    issues.push(
      withRecommendation({
        code: "long_seo_description",
        label: "Meta description longa (> 165)",
        severity: "warn",
      }),
    );
  }

  if (!p.description || p.description.trim().length < 80) {
    issues.push(
      withRecommendation({
        code: "short_description",
        label: "Descrição do produto curta",
        severity: "warn",
      }),
    );
  }

  if (!hasImage) {
    issues.push(
      withRecommendation({ code: "no_image", label: "Sem imagem principal", severity: "danger" }),
    );
  }

  if (!p.slug || p.slug.trim().length === 0) {
    issues.push(
      withRecommendation({ code: "no_slug", label: "Sem slug (URL)", severity: "danger" }),
    );
  }

  if (!p.seo_keywords || p.seo_keywords.trim().length === 0) {
    issues.push(
      withRecommendation({ code: "no_keywords", label: "Sem palavras-chave", severity: "warn" }),
    );
  }

  if (!p.category_id) {
    issues.push(
      withRecommendation({ code: "no_category", label: "Sem categoria", severity: "warn" }),
    );
  }

  if (p.name && p.name.trim().length < 6) {
    issues.push(
      withRecommendation({ code: "short_name", label: "Nome muito curto", severity: "warn" }),
    );
  } else if (p.name && p.name.length > 120) {
    issues.push(
      withRecommendation({ code: "long_name", label: "Nome muito longo", severity: "warn" }),
    );
  }

  if (p.active && (p.price == null || Number(p.price) <= 0)) {
    issues.push(
      withRecommendation({
        code: "no_price",
        label: "Produto ativo sem preço",
        severity: "danger",
      }),
    );
  }

  const { score, severity } = scoreSeverity(issues);
  return {
    id: p.id,
    name: p.name,
    slug: p.slug ?? "",
    score,
    severity,
    issues,
    hasImage,
    categoryId: p.category_id,
    categoryName,
    active: p.active,
    sku: p.sku,
  };
}

function checkCategory(
  c: {
    id: string;
    name: string;
    slug: string | null;
    description: string | null;
  },
  productsActive: number,
): SeoCategoryRow {
  const issues: SeoIssue[] = [];

  if (!c.slug || c.slug.trim().length === 0) {
    issues.push(
      withRecommendation({ code: "no_slug", label: "Sem slug (URL)", severity: "danger" }),
    );
  }
  if (!c.description || c.description.trim().length < 50) {
    issues.push(
      withRecommendation({ code: "short_description", label: "Descrição curta", severity: "warn" }),
    );
  }
  if (!c.name || c.name.trim().length < 3) {
    issues.push(
      withRecommendation({ code: "short_name", label: "Nome muito curto", severity: "warn" }),
    );
  }

  const { score, severity } = scoreSeverity(issues);
  return { id: c.id, name: c.name, slug: c.slug ?? "", score, severity, issues, productsActive };
}

function checkPage(p: {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  seo_title: string | null;
  seo_description: string | null;
  status: string;
}): SeoPageRow {
  const issues: SeoIssue[] = [];

  if (!p.seo_title || p.seo_title.trim().length === 0) {
    issues.push(
      withRecommendation({ code: "no_seo_title", label: "Sem título SEO", severity: "warn" }),
    );
  }
  if (!p.seo_description || p.seo_description.trim().length === 0) {
    issues.push(
      withRecommendation({
        code: "no_seo_description",
        label: "Sem meta description",
        severity: "warn",
      }),
    );
  } else if (p.seo_description.length > 165) {
    issues.push(
      withRecommendation({
        code: "long_seo_description",
        label: "Meta description longa",
        severity: "warn",
      }),
    );
  }
  if (!p.content || p.content.trim().length < 200) {
    issues.push(
      withRecommendation({ code: "short_content", label: "Conteúdo curto", severity: "warn" }),
    );
  }
  if (p.status !== "published") {
    issues.push(
      withRecommendation({ code: "unpublished", label: "Não publicada", severity: "danger" }),
    );
  }

  const { score, severity } = scoreSeverity(issues);
  return { id: p.id, title: p.title, slug: p.slug, score, severity, issues };
}

function checkHomepage(
  h: {
    hero_title: string | null;
    hero_description: string | null;
    seo_title: string | null;
    seo_description: string | null;
    og_image_url: string | null;
  } | null,
): { score: number; severity: SeoSeverity; issues: SeoIssue[] } {
  const issues: SeoIssue[] = [];
  if (!h) {
    issues.push(
      withRecommendation({
        code: "no_homepage",
        label: "Configurações da home não criadas",
        severity: "danger",
      }),
    );
    return { score: 0, severity: "danger", issues };
  }
  if (!h.seo_title)
    issues.push(
      withRecommendation({
        code: "no_seo_title",
        label: "Homepage sem título SEO",
        severity: "danger",
      }),
    );
  else if (h.seo_title.length > 65)
    issues.push(
      withRecommendation({
        code: "long_seo_title",
        label: "Título SEO da home longo",
        severity: "warn",
      }),
    );

  if (!h.seo_description)
    issues.push(
      withRecommendation({
        code: "no_seo_description",
        label: "Homepage sem meta description",
        severity: "danger",
      }),
    );
  else if (h.seo_description.length > 165)
    issues.push(
      withRecommendation({
        code: "long_seo_description",
        label: "Meta description da home longa",
        severity: "warn",
      }),
    );

  if (!h.og_image_url)
    issues.push(
      withRecommendation({ code: "no_og_image", label: "Sem imagem Open Graph", severity: "warn" }),
    );
  if (!h.hero_title)
    issues.push(
      withRecommendation({ code: "no_hero", label: "Hero sem título", severity: "warn" }),
    );
  if (!h.hero_description)
    issues.push(
      withRecommendation({ code: "no_hero_desc", label: "Hero sem descrição", severity: "warn" }),
    );

  const scored = scoreSeverity(issues);
  return { score: scored.score, severity: scored.severity, issues };
}

// =====================================================================
// Endpoint principal — análise completa (paginada para produtos)
// =====================================================================

export const getSeoInsights = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((input) =>
    z
      .object({
        productLimit: z.number().int().min(1).max(1000).optional(),
      })
      .optional()
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<SeoInsights> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const productLimit = data?.productLimit ?? 500;

    // Categorias (mapa nome)
    const { data: catData } = await supabaseAdmin
      .from("categories")
      .select("id, name, slug, description, active")
      .order("sort_order", { ascending: true })
      .limit(300);

    const catMap = new Map<string, string>();
    (catData ?? []).forEach((c: any) => catMap.set(c.id, c.name));

    // Contagem de produtos ativos por categoria
    const productsActiveByCat = new Map<string, number>();
    {
      const { data: rows } = await supabaseAdmin
        .from("products")
        .select("category_id")
        .eq("active", true)
        .not("category_id", "is", null)
        .limit(5000);
      (rows ?? []).forEach((r: any) => {
        const id = r.category_id as string;
        productsActiveByCat.set(id, (productsActiveByCat.get(id) ?? 0) + 1);
      });
    }

    const categories = (catData ?? [])
      .filter((c: any) => c.active !== false)
      .map((c: any) => checkCategory(c, productsActiveByCat.get(c.id) ?? 0));

    // Produtos ativos
    const prodData = await fetchAllRows<any>((fromIdx, toIdx) =>
      supabaseAdmin
        .from("products")
        .select(
          "id, name, slug, sku, price, description, seo_title, seo_description, seo_keywords, images, active, category_id",
        )
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .range(fromIdx, toIdx),
    );

    const products = (prodData ?? []).map((p: any) =>
      checkProduct(p, p.category_id ? (catMap.get(p.category_id) ?? null) : null),
    );

    // Páginas institucionais
    const { data: pagesData } = await supabaseAdmin
      .from("institutional_pages")
      .select("id, title, slug, content, seo_title, seo_description, status")
      .order("sort_order", { ascending: true })
      .limit(100);

    const pages = (pagesData ?? []).map((p: any) => checkPage(p));

    // Homepage
    const { data: homeData } = await supabaseAdmin
      .from("homepage_settings")
      .select("hero_title, hero_description, seo_title, seo_description, og_image_url")
      .limit(1)
      .maybeSingle();

    const home = checkHomepage(homeData as any);

    // B2B settings
    const { data: b2bData } = await supabaseAdmin
      .from("b2b_settings")
      .select("seo_title, seo_description")
      .limit(1)
      .maybeSingle();
    const b2bSeoConfigured = !!(b2bData?.seo_title && b2bData?.seo_description);

    // SEO local
    const { count: zonesCount } = await supabaseAdmin
      .from("local_delivery_zones")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    const { data: company } = await supabaseAdmin
      .from("company_settings")
      .select("address_street, address_city, address_state")
      .limit(1)
      .maybeSingle();

    const homeTxt =
      `${homeData?.seo_title ?? ""} ${homeData?.seo_description ?? ""} ${homeData?.hero_title ?? ""} ${homeData?.hero_description ?? ""}`.toLowerCase();
    const local: SeoLocalCheck = {
      hasMaricaInTitle: (homeData?.seo_title ?? "").toLowerCase().includes("maric"),
      hasMaricaInDescription: (homeData?.seo_description ?? "").toLowerCase().includes("maric"),
      hasLocalDeliveryZones: (zonesCount ?? 0) > 0,
      hasCompanyAddress: !!(company?.address_street && company?.address_city),
      hasGeoStructuredData: true,
      notes: [],
      suggestions: [
        'Destaque "entrega em Maricá/RJ" na home e nas páginas de produto.',
        "Cite bairros atendidos: Itaipuaçu, Inoã, Centro de Maricá, Ponta Negra.",
        'Crie conteúdo focado em "material elétrico em Maricá" e "iluminação LED em Maricá".',
        'Reforce "retirada na loja" e "frete local" para clientes próximos.',
        "Considere criar páginas/blocos comerciais por região no futuro.",
      ],
    };

    if (!local.hasMaricaInTitle) local.notes.push('Inclua "Maricá" no título SEO da home.');
    if (!local.hasMaricaInDescription)
      local.notes.push('Mencione "Maricá" e "RJ" na meta description.');
    if (!local.hasLocalDeliveryZones) local.notes.push("Cadastre bairros/zonas de entrega local.");
    if (!local.hasCompanyAddress)
      local.notes.push("Preencha o endereço da loja em Configurações da empresa.");
    if (!homeTxt.includes("material elétrico") && !homeTxt.includes("iluminação"))
      local.notes.push('Reforce termos do nicho ("material elétrico", "iluminação LED").');

    // Sumário
    const productsWithIssues = products.filter((p) => p.severity !== "ok").length;
    const productsCritical = products.filter((p) => p.severity === "danger").length;
    const productsNoSeoTitle = products.filter((p) =>
      p.issues.some((i) => i.code === "no_seo_title"),
    ).length;
    const productsNoSeoDescription = products.filter((p) =>
      p.issues.some((i) => i.code === "no_seo_description"),
    ).length;
    const productsNoDescription = products.filter((p) =>
      p.issues.some((i) => i.code === "short_description"),
    ).length;
    const productsNoImage = products.filter((p) =>
      p.issues.some((i) => i.code === "no_image"),
    ).length;
    const productsNoCategory = products.filter((p) =>
      p.issues.some((i) => i.code === "no_category"),
    ).length;
    const categoriesNoDescription = categories.filter((c) =>
      c.issues.some((i) => i.code === "short_description"),
    ).length;
    const pagesIncomplete = pages.filter((p) => p.severity !== "ok").length;

    const avgScore = products.length
      ? Math.round(products.reduce((s, p) => s + p.score, 0) / products.length)
      : 100;

    const summary: SeoSummary = {
      productsTotal: products.length,
      productsWithIssues,
      productsCritical,
      productsNoSeoTitle,
      productsNoSeoDescription,
      productsNoDescription,
      productsNoImage,
      productsNoCategory,
      categoriesTotal: categories.length,
      categoriesWithIssues: categories.filter((c) => c.severity !== "ok").length,
      categoriesNoDescription,
      pagesTotal: pages.length,
      pagesWithIssues: pages.filter((p) => p.severity !== "ok").length,
      pagesIncomplete,
      homepageScore: home.score,
      homepageIssues: home.issues,
      b2bSeoConfigured,
      averageProductScore: avgScore,
    };

    return {
      summary,
      products: products.sort((a, b) => a.score - b.score),
      categories: categories.sort((a, b) => a.score - b.score),
      pages: pages.sort((a, b) => a.score - b.score),
      local,
      generatedAt: new Date().toISOString(),
    };
  });

// =====================================================================
// Counts leves para o Painel do Dia (sem carregar listas)
// fetchSeoQuickCounts moved to ./seoInsights.server (server-only)
