import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Sparkles, Boxes, ImageOff } from "lucide-react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  computeProductQuality,
  qualityClassColor,
  qualityClassLabel,
} from "@/lib/productQuality";
import { normalizeSearch } from "@/lib/searchNormalize";
import {
  DataTable,
  DataTablePagination,
  DataTableToolbar,
  type DataTableColumn,
} from "@/components/admin/datatable";
import { useTableState } from "@/hooks/useTableState";
import { fetchAllRows } from "@/lib/fetchAllRows";

const QUICK_FILTERS = [
  "all",
  "no_image",
  "no_cost",
  "no_ncm",
  "b2b_incomplete",
  "low_stock",
  "zero_stock",
  "no_min_stock",
  "allow_oos",
  "block_oos",
  "bad_quality",
  "no_tech_attrs",
  "no_power",
  "no_color_temp",
  "no_voltage",
  "no_ip_rating",
] as const;
type QuickFilter = (typeof QUICK_FILTERS)[number];

const FILTER_LABELS: Record<QuickFilter, string> = {
  all: "Todos",
  no_image: "Sem imagem",
  no_cost: "Sem custo",
  no_ncm: "Sem NCM",
  b2b_incomplete: "B2B incompleto",
  low_stock: "Estoque baixo",
  zero_stock: "Estoque zerado",
  no_min_stock: "Sem estoque mínimo",
  allow_oos: "Permite venda sem estoque",
  block_oos: "Não permite venda sem estoque",
  bad_quality: "Qualidade ruim",
  no_tech_attrs: "Sem atributos técnicos",
  no_power: "Sem potência",
  no_color_temp: "Sem temperatura",
  no_voltage: "Sem voltagem",
  no_ip_rating: "Sem IP",
};

const SORTABLE = ["name", "sku", "price", "stock_qty", "quality", "active"] as const;

const searchSchema = z.object({
  page: fallback(z.number().int().min(1), 1).default(1),
  pageSize: fallback(z.number().int().min(1).max(100), 25).default(25),
  q: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "name.asc").default("name.asc"),
  filter: fallback(z.enum(QUICK_FILTERS), "all").default("all"),
  status: fallback(z.enum(["all", "active", "inactive"]), "all").default("all"),
});

export const Route = createFileRoute("/admin/produtos/")({
  validateSearch: zodValidator(searchSchema),
  component: ProdutosList,
});

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  sale_price: number | null;
  stock_qty: number;
  stock_min_alert: number | null;
  stock_alert_enabled?: boolean;
  allow_out_of_stock_sales?: boolean;
  active: boolean;
  brand: string | null;
  sku: string | null;
  ncm: string | null;
  gtin_ean: string | null;
  cost_price: number | null;
  images: string[] | null;
  b2b_enabled: boolean;
  b2b_price: number | null;
  b2b_min_qty: number | null;
  tech_attr_keys?: Set<string>;
  quality?: ReturnType<typeof computeProductQuality>;
}

function ProdutosList() {
  const search = Route.useSearch();
  const t = useTableState({
    page: 1,
    pageSize: 25,
    sort: { column: "name", direction: "asc" },
  });
  const filter = search.filter;
  const status = search.status;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [productsData, imagesData, attrs] = await Promise.all([
      fetchAllRows<any>((from, to) => supabase.rpc("admin_list_products").range(from, to)),
      fetchAllRows<any>((from, to) =>
        supabase
          .from("product_images")
          .select("product_id, url_thumb, url_card, original_url, is_primary, sort_order, alt_text")
          .range(from, to),
      ),
      fetchAllRows<any>((from, to) =>
        supabase
          .from("product_attributes")
          .select(
            "product_id, attribute_key, attribute_label, attribute_value, attribute_unit, is_visible, is_filterable",
          )
          .range(from, to),
      ),
    ]);
    const imagesByProduct = new Map<string, any[]>();
    imagesData.forEach((img: any) => {
      if (!imagesByProduct.has(img.product_id)) imagesByProduct.set(img.product_id, []);
      imagesByProduct.get(img.product_id)!.push(img);
    });
    const data = productsData.map((p: any) => ({
      ...p,
      product_images: imagesByProduct.get(p.id) ?? [],
    }));


    // Mapa de aliases: a tabela product_attributes pode ter chaves em pt-BR
    // (potencia_w, tensao_v, etc.) ou na forma canônica em inglês (power, voltage).
    // Normalizamos para a chave canônica usada pelos filtros.
    const KEY_ALIASES: Record<string, string> = {
      power: "power",
      potencia: "power",
      potencia_w: "power",
      voltage: "voltage",
      voltagem: "voltage",
      tensao: "voltage",
      tensao_v: "voltage",
      color_temperature: "color_temperature",
      temperatura: "color_temperature",
      temperatura_cor: "color_temperature",
      temperatura_cor_k: "color_temperature",
      ip_rating: "ip_rating",
      grau_protecao: "ip_rating",
      grau_protecao_ip: "ip_rating",
      protecao_ip: "ip_rating",
      ncm: "ncm",
    };
    const attrKeyMap = new Map<string, Set<string>>();
    const attrListMap = new Map<string, any[]>();
    attrs.forEach((a: any) => {
      const v = (a.attribute_value ?? "").toString().trim();
      if (!v) return;
      const rawKey = (a.attribute_key ?? "").toString().toLowerCase();
      if (!rawKey) return;
      if (!attrKeyMap.has(a.product_id)) attrKeyMap.set(a.product_id, new Set());
      const set = attrKeyMap.get(a.product_id)!;
      set.add(rawKey);
      const canonical = KEY_ALIASES[rawKey];
      if (canonical) set.add(canonical);
      if (!attrListMap.has(a.product_id)) attrListMap.set(a.product_id, []);
      attrListMap.get(a.product_id)!.push(a);
    });
    // Oculta produtos de teste/arquivados da visão do admin (permanecem no BD
    // para preservar histórico fiscal/financeiro de pedidos antigos).
    const isHiddenTestProduct = (p: any) => {
      const name = (p.name ?? "").toLowerCase().trim();
      const slug = (p.slug ?? "").toLowerCase();
      const sku = (p.sku ?? "").toLowerCase();
      if (name === "produto teste excluir") return true;
      if (name.startsWith("produto teste")) return true;
      if (slug.includes("-arq-") || sku.includes("-arq-")) return true;
      return false;
    };
    const mapped = (data ?? []).filter((p: any) => !isHiddenTestProduct(p)).map((p: any) => {
      const imgs = (p.product_images ?? []).slice().sort((a: any, b: any) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
      const fromTable = imgs
        .map((i: any) => i.url_thumb ?? i.url_card ?? i.original_url)
        .filter(Boolean);
      const merged = fromTable.length ? fromTable : (p.images ?? []);
      const productAttrs = attrListMap.get(p.id) ?? [];
      const quality = computeProductQuality({ ...p, product_attributes: productAttrs });
      const tech_attr_keys = attrKeyMap.get(p.id) ?? new Set<string>();
      return { ...p, images: merged, quality, tech_attr_keys };
    });
    setProducts(mapped as any);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: string) => {
    // Verifica se há pedidos vinculados — produtos com vendas não podem ser
    // excluídos fisicamente (FK order_items_product_id_fkey), apenas arquivados.
    const { count: orderCount } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", id);

    if ((orderCount ?? 0) > 0) {
      if (
        !confirm(
          `Este produto possui ${orderCount} item(ns) em pedidos e não pode ser excluído permanentemente (histórico fiscal/financeiro).\n\nDeseja ARQUIVAR? O produto ficará inativo, oculto da loja e o SKU/slug serão liberados para reuso.`,
        )
      )
        return;
      const stamp = Date.now().toString(36);
      const { data: cur } = await supabase
        .from("products")
        .select("sku, slug")
        .eq("id", id)
        .maybeSingle();
      const updatePayload: { active: boolean; sku?: string; slug?: string } = {
        active: false,
      };
      if (cur?.sku) updatePayload.sku = `${cur.sku}-arq-${stamp}`.slice(0, 64);
      if (cur?.slug) updatePayload.slug = `${cur.slug}-arq-${stamp}`;
      const { error } = await supabase
        .from("products")
        .update(updatePayload)
        .eq("id", id);
      if (error) return toast.error(error.message);
      toast.success("Produto arquivado (mantido no histórico de pedidos)");
      load();
      return;
    }

    if (!confirm("Excluir este produto permanentemente?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        return toast.error(
          "Produto possui registros vinculados (pedidos, combos ou estoque) e não pode ser excluído.",
        );
      }
      return toast.error(error.message);
    }
    toast.success("Produto excluído");
    load();
  };

  const matchesQuick = (p: Product, f: QuickFilter): boolean => {
    switch (f) {
      case "no_image":
        return !p.images || p.images.length === 0;
      case "no_cost":
        return p.cost_price == null || Number(p.cost_price) <= 0;
      case "no_ncm":
        return (!p.ncm || p.ncm.trim().length === 0) && !p.tech_attr_keys?.has("ncm");
      case "b2b_incomplete":
        return (
          p.b2b_enabled &&
          (p.b2b_price == null || Number(p.b2b_price) <= 0 || (p.b2b_min_qty ?? 0) <= 0)
        );
      case "low_stock": {
        const min = p.stock_min_alert ?? 5;
        return p.stock_qty > 0 && p.stock_qty <= min;
      }
      case "zero_stock":
        return p.stock_qty <= 0;
      case "no_min_stock":
        return p.stock_min_alert == null;
      case "allow_oos":
        return p.allow_out_of_stock_sales === true;
      case "block_oos":
        return p.allow_out_of_stock_sales !== true;
      case "bad_quality":
        return p.quality?.classification === "ruim";
      case "no_tech_attrs":
        return !p.tech_attr_keys || p.tech_attr_keys.size === 0;
      case "no_power":
        return !p.tech_attr_keys?.has("power");
      case "no_color_temp":
        return !p.tech_attr_keys?.has("color_temperature");
      case "no_voltage":
        return !p.tech_attr_keys?.has("voltage");
      case "no_ip_rating":
        return !p.tech_attr_keys?.has("ip_rating");
      case "all":
      default:
        return true;
    }
  };

  const filtered = useMemo(() => {
    const term = normalizeSearch(t.q);
    return products.filter((p) => {
      if (term) {
        const haystack = normalizeSearch(
          [p.name, p.sku, p.gtin_ean, p.ncm, p.brand].filter(Boolean).join(" "),
        );
        if (!haystack.includes(term)) return false;
      }
      if (status === "active" && !p.active) return false;
      if (status === "inactive" && p.active) return false;
      return matchesQuick(p, filter);
    });
  }, [products, t.q, filter, status]);

  const sorted = useMemo(() => {
    const col = (SORTABLE as readonly string[]).includes(t.sort.column)
      ? t.sort.column
      : "name";
    const dir = t.sort.direction === "asc" ? 1 : -1;
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: any;
      let bv: any;
      switch (col) {
        case "price":
          av = Number(a.sale_price ?? a.price);
          bv = Number(b.sale_price ?? b.price);
          break;
        case "stock_qty":
          av = a.stock_qty;
          bv = b.stock_qty;
          break;
        case "quality":
          av = a.quality?.score ?? -1;
          bv = b.quality?.score ?? -1;
          break;
        case "active":
          av = a.active ? 1 : 0;
          bv = b.active ? 1 : 0;
          break;
        case "sku":
          av = (a.sku ?? "").toLowerCase();
          bv = (b.sku ?? "").toLowerCase();
          break;
        case "name":
        default:
          av = a.name.toLowerCase();
          bv = b.name.toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [filtered, t.sort.column, t.sort.direction]);

  const total = sorted.length;
  const offset = (t.page - 1) * t.pageSize;
  const pageRows = sorted.slice(offset, offset + t.pageSize);

  const counts = useMemo(() => {
    const c = Object.fromEntries(QUICK_FILTERS.map((k) => [k, 0])) as Record<
      QuickFilter,
      number
    >;
    c.all = products.length;
    for (const p of products) {
      for (const f of QUICK_FILTERS) {
        if (f === "all") continue;
        if (matchesQuick(p, f)) c[f] += 1;
      }
    }
    return c;
  }, [products]);

  const hasActive = !!(t.q || filter !== "all" || status !== "all");

  const columns: DataTableColumn<Product>[] = [
    {
      id: "name",
      header: "Produto",
      sortable: true,
      cell: (p) => (
        <div className="flex items-center gap-3">
          {p.images?.[0] ? (
            <img
              src={p.images[0]}
              alt={p.name}
              className="w-10 h-10 object-cover rounded border border-border"
            />
          ) : (
            <div
              title="Produto sem imagem cadastrada"
              className="w-10 h-10 rounded bg-muted border border-dashed border-border flex items-center justify-center flex-shrink-0"
            >
              <ImageOff className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-medium truncate">{p.name}</p>
            {p.brand && <p className="text-xs text-muted-foreground">{p.brand}</p>}
          </div>
        </div>
      ),
    },
    {
      id: "sku",
      header: "SKU",
      sortable: true,
      hideOnMobile: true,
      cell: (p) => <span className="font-mono text-xs">{p.sku ?? "—"}</span>,
    },
    {
      id: "price",
      header: "Preço",
      sortable: true,
      cell: (p) =>
        p.sale_price ? (
          <div>
            <span className="text-primary font-semibold">
              R$ {Number(p.sale_price).toFixed(2)}
            </span>
            <span className="text-xs text-muted-foreground line-through ml-2">
              R$ {Number(p.price).toFixed(2)}
            </span>
          </div>
        ) : (
          <span>R$ {Number(p.price).toFixed(2)}</span>
        ),
    },
    {
      id: "b2b",
      header: "Atacado",
      hideOnMobile: true,
      cell: (p) =>
        p.b2b_enabled && p.b2b_price ? (
          <div>
            <span className="font-semibold text-foreground">
              R$ {Number(p.b2b_price).toFixed(2)}
            </span>
            {p.b2b_min_qty ? (
              <span className="text-xs text-muted-foreground block">
                a partir de {p.b2b_min_qty} un
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "stock_qty",
      header: "Estoque",
      sortable: true,
      cell: (p) => (
        <span className={p.stock_qty < 10 ? "text-destructive font-medium" : ""}>
          {p.stock_qty}
        </span>
      ),
    },
    {
      id: "quality",
      header: "Qualidade",
      sortable: true,
      hideOnMobile: true,
      cell: (p) =>
        p.quality ? (
          (() => {
            const c = qualityClassColor(p.quality.classification);
            return (
              <Link
                to={"/admin/produtos/$id" as any}
                params={{ id: p.id } as any}
                className="inline-flex items-center gap-1.5 group"
              >
                <span className="font-semibold text-xs tabular-nums">
                  {p.quality.score}
                </span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${c.bg} ${c.text} group-hover:opacity-80`}
                >
                  {qualityClassLabel(p.quality.classification)}
                </span>
              </Link>
            );
          })()
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "active",
      header: "Status",
      sortable: true,
      cell: (p) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            p.active
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {p.active ? "Ativo" : "Inativo"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      headerClassName: "w-[1%]",
      cell: (p) => (
        <div className="flex justify-end gap-1">
          <Link to={"/admin/produtos/$id" as any} params={{ id: p.id } as any}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Pencil className="w-4 h-4" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={() => handleDelete(p.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AdminLayout
      title="Produtos"
      action={
        <div className="flex items-center gap-2">
          <Link to={"/admin/produtos/estoque" as any}>
            <Button variant="outline" size="sm">
              <Boxes className="w-4 h-4 mr-1" /> Estoque
            </Button>
          </Link>
          <Link to={"/admin/produtos/qualidade" as any}>
            <Button variant="outline" size="sm">
              <Sparkles className="w-4 h-4 mr-1" /> Qualidade
            </Button>
          </Link>
          <Link to={"/admin/produtos/novo" as any}>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" /> Novo produto
            </Button>
          </Link>
        </div>
      }
    >
      <div className="bg-card border border-border rounded-xl">
        <DataTableToolbar
          q={t.q}
          onQChange={t.setQ}
          searchPlaceholder="Buscar por nome, SKU, EAN, NCM ou marca…"
          hasActiveFilters={hasActive}
          onClearFilters={t.clearAll}
          filters={
            <Select
              value={status}
              onValueChange={(v) => t.setFilter("status", v)}
            >
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
          }
        />

        <div className="px-4 pb-3 flex flex-wrap gap-2 border-b border-border">
          {QUICK_FILTERS.map((id) => {
            const active = filter === id;
            const count = counts[id];
            return (
              <button
                key={id}
                onClick={() => t.setFilter("filter", id)}
                className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-surface"
                }`}
              >
                {FILTER_LABELS[id]}
                <span
                  className={`tabular-nums ${active ? "opacity-90" : "text-muted-foreground/70"}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <DataTable
          columns={columns}
          rows={pageRows}
          loading={loading}
          sort={t.sort}
          onSort={t.setSort}
          rowKey={(p) => p.id}
          emptyTitle="Nenhum produto encontrado"
          emptyDescription={
            hasActive
              ? "Tente ajustar os filtros ou limpar a busca."
              : "Cadastre seu primeiro produto."
          }
        />

        <DataTablePagination
          page={t.page}
          pageSize={t.pageSize}
          total={total}
          onPageChange={t.setPage}
          onPageSizeChange={t.setPageSize}
        />
      </div>
    </AdminLayout>
  );
}
