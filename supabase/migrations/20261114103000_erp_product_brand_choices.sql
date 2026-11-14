-- Product Master brand dropdown: read-only, tenant-scoped choices.
-- Derive brand vocabulary from the user's existing products, not company Brand Settings.
-- SECURITY INVOKER preserves products RLS (branch/tenant permissions); no changes to rows.
create or replace function public.erp_product_brand_choices(p_restaurant_id uuid)
returns table(brand text)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select min(btrim(p.brand)) as brand
  from public.products as p
  where p.restaurant_id = p_restaurant_id
    and p.brand is not null
    and btrim(p.brand) <> ''
    and char_length(btrim(p.brand)) <= 120
  group by lower(btrim(p.brand))
  order by lower(min(btrim(p.brand))), min(btrim(p.brand))
  limit 5000
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default on newly created functions.
revoke all on function public.erp_product_brand_choices(uuid) from public, anon;
grant execute on function public.erp_product_brand_choices(uuid) to authenticated;

comment on function public.erp_product_brand_choices(uuid)
  is 'Read-only distinct product brands scoped by restaurant ID and caller products RLS; used by Product Master mobile selector.';
