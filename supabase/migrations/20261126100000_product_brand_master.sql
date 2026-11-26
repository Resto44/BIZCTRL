-- Independent tenant brand vocabulary. Preserve products.brand as the immutable
-- compatibility reference; translated labels can change without rewriting products.
create table public.product_brand_master (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  brand text not null check (char_length(brand) between 1 and 120 and brand = btrim(regexp_replace(brand, '[[:space:]]+', ' ', 'g'))),
  brand_key text generated always as (lower(btrim(regexp_replace(brand, '[[:space:]]+', ' ', 'g')))) stored,
  name_en text not null check (char_length(btrim(name_en)) between 1 and 120),
  name_ar text check (name_ar is null or char_length(btrim(name_ar)) between 1 and 120),
  name_fa text check (name_fa is null or char_length(btrim(name_fa)) between 1 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id,brand_key)
);
create unique index product_brand_master_en_unique on public.product_brand_master (restaurant_id, lower(btrim(regexp_replace(name_en, '[[:space:]]+', ' ', 'g'))));
create unique index product_brand_master_ar_unique on public.product_brand_master (restaurant_id, lower(btrim(regexp_replace(name_ar, '[[:space:]]+', ' ', 'g')))) where name_ar is not null;
create unique index product_brand_master_fa_unique on public.product_brand_master (restaurant_id, lower(btrim(regexp_replace(name_fa, '[[:space:]]+', ' ', 'g')))) where name_fa is not null;
alter table public.product_brand_master enable row level security;
revoke all on public.product_brand_master from public, anon, authenticated;
grant select, insert (restaurant_id,brand,name_en,name_ar,name_fa,is_active), update (name_en,name_ar,name_fa,is_active) on public.product_brand_master to authenticated;
create policy product_brand_master_read on public.product_brand_master for select to authenticated
using (
  public.erp_can_write_scope_text(restaurant_id::text,null)
  or (public.erp_has_any_permission(array['viewProducts','viewInventory']) and exists (
    select 1 from public.erp_memberships m
    where m.user_id=(select auth.uid()) and m.status='approved' and m.role='manager'
      and m.restaurant_id=product_brand_master.restaurant_id
      and public.erp_can_access_scope_text(m.restaurant_id::text,m.branch_id::text)
  ))
);
create policy product_brand_master_insert on public.product_brand_master for insert to authenticated
with check (public.erp_can_write_module_scope_text(restaurant_id::text,null,'updateInventory') and public.erp_current_role()='owner');
create policy product_brand_master_update on public.product_brand_master for update to authenticated
using (public.erp_can_write_module_scope_text(restaurant_id::text,null,'updateInventory') and public.erp_current_role()='owner')
with check (public.erp_can_write_module_scope_text(restaurant_id::text,null,'updateInventory') and public.erp_current_role()='owner');
comment on table public.product_brand_master is 'Tenant-wide reusable product brands. Immutable compatibility key; localized labels and archive status are editable. No financial or stock mutation.';
