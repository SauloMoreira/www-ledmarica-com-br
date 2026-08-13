ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS auto_apply boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS condition_type text,
  ADD COLUMN IF NOT EXISTS condition_value text;

ALTER TABLE public.coupons
  DROP CONSTRAINT IF EXISTS coupons_condition_type_chk;
ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_condition_type_chk
  CHECK (condition_type IS NULL OR condition_type IN ('payment_method'));

ALTER TABLE public.coupons
  DROP CONSTRAINT IF EXISTS coupons_auto_apply_condition_chk;
ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_auto_apply_condition_chk
  CHECK (auto_apply = false OR (condition_type IS NOT NULL AND condition_value IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS coupons_unique_active_auto_condition
  ON public.coupons (condition_type, condition_value)
  WHERE active = true AND auto_apply = true;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS intended_payment_method text;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_intended_payment_method_chk;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_intended_payment_method_chk
  CHECK (intended_payment_method IS NULL OR intended_payment_method IN ('pix','other'));

CREATE OR REPLACE FUNCTION public.get_active_auto_coupon_code(
  _condition_type text,
  _condition_value text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.code
  FROM public.coupons c
  WHERE c.active = true
    AND c.auto_apply = true
    AND c.condition_type = _condition_type
    AND c.condition_value = _condition_value
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_active_auto_coupon_code(text, text) TO anon, authenticated, service_role;