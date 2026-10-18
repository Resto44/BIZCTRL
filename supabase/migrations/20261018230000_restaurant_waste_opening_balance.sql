-- Repair restaurant-only waste posting on legacy opening-stock snapshots.
-- Retail inventory has its own canonical movement ledger: never touch retail rows.
-- The waste table's existing integrity trigger atomically deducts quantity; do not add another deduction.

create or replace function public.erp_restaurant_inventory_opening_sync()
returns trigger language plpgsql set search_path = '' as $$
declare delta numeric;
begin
  if new.restaurant_id is null or public.erp_retail_pos_portal_allowed(new.restaurant_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- The legacy form inserts opening_stock while quantity defaults to zero.
    if coalesce(new.quantity, 0) = 0 and coalesce(new.opening_stock, 0) > 0 then
      new.quantity := new.opening_stock;
      new.total_value := new.quantity * coalesce(new.average_cost, 0);
    end if;
  elsif new.opening_stock is distinct from old.opening_stock
    and new.quantity is not distinct from old.quantity then
    -- Edits to opening stock adjust rather than reset later waste deductions.
    delta := coalesce(new.opening_stock, 0) - coalesce(old.opening_stock, 0);
    if coalesce(old.quantity, 0) + delta < 0 then
      raise exception 'Opening stock adjustment exceeds remaining inventory' using errcode = '23514';
    end if;
    new.quantity := coalesce(old.quantity, 0) + delta;
    new.total_value := new.quantity * coalesce(new.average_cost, 0);
  end if;
  return new;
end;
$$;

drop trigger if exists erp_restaurant_inventory_opening_sync on public.inventory;
create trigger erp_restaurant_inventory_opening_sync
before insert or update of opening_stock on public.inventory
for each row execute function public.erp_restaurant_inventory_opening_sync();

-- The old UI never set quantity, so some UNTOUCHED restaurant snapshots have
-- opening_stock > 0 but canonical quantity = 0. Backfill only the most recent
-- snapshot for each branch+product. Avoid any product with recorded movement.
-- Do not change older snapshots, retail inventory, or anything with history.
with ranked as (
  select i.id, i.restaurant_id, i.branch_id, i.branch, i.product_id,
         i.quantity, i.opening_stock, i.average_cost, i.created_date,
         row_number() over (
           partition by i.restaurant_id, i.branch_id, i.product_id
           order by i.date desc nulls last, i.created_date desc, i.id
         ) as row_rank
  from public.inventory i
  join public.branches b on b.id = i.branch_id
    and b.restaurant_id = i.restaurant_id and b.branch_key = i.branch
  where not public.erp_retail_pos_portal_allowed(i.restaurant_id)
), safe as (
  select i.*
  from ranked i
  where i.row_rank = 1 and coalesce(i.quantity, 0) = 0 and i.opening_stock > 0
    and not exists (
      select 1 from public.inventory_waste w
      where w.restaurant_id = i.restaurant_id and w.branch_id = i.branch_id
        and w.product_id = i.product_id
    )
    and not exists (
      select 1 from public.inventory_transactions t
      where t.restaurant_id = i.restaurant_id and t.branch_id = i.branch_id
        and t.product_id::text = i.product_id
    )
    and not exists (
      select 1 from public.inventory_consumption_log l
      where l.restaurant_id = i.restaurant_id and l.branch_id = i.branch_id
        and (l.product_id::text = i.product_id or l.ingredient_id::text = i.product_id)
    )
    and not exists (
      select 1 from public.purchases p
      where p.restaurant_id = i.restaurant_id and p.branch_id = i.branch_id
        and p.product_id = i.product_id and p.created_date >= i.created_date
    )
)
update public.inventory i
set quantity = s.opening_stock,
    total_value = s.opening_stock * coalesce(i.average_cost, 0),
    last_updated = now()
from safe s
where i.id = s.id;
