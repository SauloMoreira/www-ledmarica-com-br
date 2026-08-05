GRANT SELECT (parent_product_id, variant_attributes) ON public.products TO anon;
GRANT SELECT (parent_product_id, variant_attributes) ON public.products TO authenticated;
GRANT SELECT ON public.product_variant_options TO anon, authenticated;
GRANT ALL ON public.product_variant_options TO service_role;