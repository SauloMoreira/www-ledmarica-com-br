import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { computeProductQuality, type QualityResult } from "@/lib/productQuality";
import { fetchAllRows } from "@/lib/fetchAllRows";

const PRODUCT_QUALITY_SELECT = `
  id, name, slug, sku, brand, active, featured, tags,
  description, specs, seo_title, seo_description, seo_keywords,
  ncm, weight_kg, height_cm, width_cm, length_cm,
  cost_price, category_id, images,
  product_images(alt_text, original_url),
  product_attributes(attribute_key, attribute_value, attribute_unit, is_visible)
`;

export type ProductQualityRow = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  brand: string | null;
  active: boolean;
  featured: boolean;
  quality: QualityResult;
};

/**
 * Lista produtos com seu score de qualidade.
 * Apenas admin. Sem efeitos colaterais.
 */
export const listProductQuality = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(
    async (): Promise<{
      rows: ProductQualityRow[];
      counts: {
        total: number;
        ruim: number;
        atencao: number;
        bom: number;
        excelente: number;
        activeBelow70: number;
        featuredBelow70: number;
        missingImage: number;
        missingCost: number;
        missingSeo: number;
        missingFiscal: number;
        missingTech: number;
      };
    }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      let data: any[];
      try {
        data = await fetchAllRows<any>((from, to) =>
          supabaseAdmin
            .from("products")
            .select(PRODUCT_QUALITY_SELECT)
            .order("active", { ascending: false })
            .order("updated_at", { ascending: false })
            .range(from, to),
        );
      } catch (error) {
        console.error("listProductQuality error", error);
        return {
          rows: [],
          counts: {
            total: 0,
            ruim: 0,
            atencao: 0,
            bom: 0,
            excelente: 0,
            activeBelow70: 0,
            featuredBelow70: 0,
            missingImage: 0,
            missingCost: 0,
            missingSeo: 0,
            missingFiscal: 0,
            missingTech: 0,
          },
        };
      }


      const isHiddenTest = (p: any) => {
        const n = (p.name ?? "").toLowerCase().trim();
        const s = (p.slug ?? "").toLowerCase();
        return n === "produto teste excluir" || n.startsWith("produto teste") || s.includes("-arq-");
      };
      const rows: ProductQualityRow[] = (data ?? []).filter((p: any) => !isHiddenTest(p)).map((p: any) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        sku: p.sku,
        brand: p.brand,
        active: !!p.active,
        featured: !!p.featured,
        quality: computeProductQuality(p),
      }));

      const counts = {
        total: rows.length,
        ruim: rows.filter((r) => r.quality.classification === "ruim").length,
        atencao: rows.filter((r) => r.quality.classification === "atencao").length,
        bom: rows.filter((r) => r.quality.classification === "bom").length,
        excelente: rows.filter((r) => r.quality.classification === "excelente").length,
        activeBelow70: rows.filter((r) => r.active && r.quality.score < 70).length,
        featuredBelow70: rows.filter((r) => r.featured && r.quality.score < 70).length,
        missingImage: rows.filter((r) => r.quality.issues.some((i) => i.code === "no_image"))
          .length,
        missingCost: rows.filter((r) => r.quality.issues.some((i) => i.code === "no_cost")).length,
        missingSeo: rows.filter((r) =>
          r.quality.issues.some(
            (i) => i.code === "no_seo_title" || i.code === "no_seo_description",
          ),
        ).length,
        missingFiscal: rows.filter((r) =>
          r.quality.issues.some(
            (i) => i.code === "no_ncm" || i.code === "no_weight" || i.code === "no_dimensions",
          ),
        ).length,
        missingTech: rows.filter(
          (r) => r.active && r.quality.issues.some((i) => i.code === "no_tech_attrs"),
        ).length,
      };

      return { rows, counts };
    },
  );

/**
 * Contadores leves para o Painel do Dia.
 * Pagina via fetchAllRows — não depende mais do teto de 1000 do Supabase.
 */
export const getProductQualityQuickCounts = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let data: any[];
    try {
      data = await fetchAllRows<any>((from, to) =>
        supabaseAdmin
          .from("products")
          .select(PRODUCT_QUALITY_SELECT)
          .eq("active", true)
          .range(from, to),
      );
    } catch {
      return { activeBelow70: 0, featuredBelow70: 0, ruim: 0 };
    }

    let activeBelow70 = 0;
    let featuredBelow70 = 0;
    let ruim = 0;
    for (const p of (data ?? []) as any[]) {
      const q = computeProductQuality(p);
      if (q.score < 70) activeBelow70++;
      if (p.featured && q.score < 70) featuredBelow70++;
      if (q.classification === "ruim") ruim++;
    }
    return { activeBelow70, featuredBelow70, ruim };
  });
