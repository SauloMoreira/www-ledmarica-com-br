alter table public.coupons drop constraint coupons_condition_type_chk;
alter table public.coupons add constraint coupons_condition_type_chk
  check (condition_type is null or condition_type in ('payment_method','delivery_scope'));

alter table public.coupons drop constraint coupons_auto_apply_condition_chk;
alter table public.coupons add constraint coupons_auto_apply_condition_chk
  check (
    auto_apply = false
    or (condition_type is null and condition_value is null)
    or (condition_type is not null and condition_value is not null)
  );