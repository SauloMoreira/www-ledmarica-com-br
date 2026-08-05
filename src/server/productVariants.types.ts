/** Tipos compartilhados da feature de Variações de Produto. */
export type VariantOption = {
  id: string;
  product_id: string;
  option_title: string;
  display_type: "text_chip" | "swatch_color" | "swatch_image";
  sort_order: number;
};

export type FamilyMember = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  price: number;
  sale_price: number | null;
  stock_qty: number;
  active: boolean;
  variant_attributes: Record<string, string>;
  image: string | null;
  is_parent: boolean;
};

export type ProductFamily = {
  parentId: string;
  option: Pick<VariantOption, "option_title" | "display_type"> | null;
  members: FamilyMember[];
};

const DISPLAY_TYPES = ["text_chip", "swatch_color", "swatch_image"] as const;

