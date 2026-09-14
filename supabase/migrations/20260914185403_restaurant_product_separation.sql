-- Restaurant dishes and supplier materials have separate identities.
alter table public.products add column restaurant_product_type text
 check (restaurant_product_type in ('raw_material','menu_item'));
create index products_restaurant_kind_idx on public.products(restaurant_id,restaurant_product_type,name);

create function restaurant_pos_private.purchase_items(v jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(v)='string' then v:=(v#>>'{}')::jsonb; end if;
 if jsonb_typeof(v)='array' then return v; end if;
 return '[]'::jsonb;
end $$;
revoke all on function restaurant_pos_private.purchase_items(jsonb) from public,anon,authenticated;

update public.products p set restaurant_product_type='raw_material'
from public.restaurants r where r.id=p.restaurant_id
and lower(btrim(coalesce(nullif(r.business_type,''),r.business_mode::text,''))) in ('restaurant','cafe');

-- A product referenced by stock or purchasing remains a material.
update public.products p set restaurant_product_type='menu_item'
where p.restaurant_product_type='raw_material'
and exists(select 1 from restaurant_pos_private.menu m where m.product_id=p.id)
and not exists(select 1 from public.inventory i where i.restaurant_id=p.restaurant_id and i.product_id in(p.id::text,p.product_id))
and not exists(select 1 from public.purchases i where i.restaurant_id=p.restaurant_id and i.product_id in(p.id::text,p.product_id))
and not exists(select 1 from public.purchase_orders o cross join lateral jsonb_array_elements(restaurant_pos_private.purchase_items(o.items)) i where o.restaurant_id=p.restaurant_id and i->>'product_id' in(p.id::text,p.product_id))
and not exists(select 1 from public.supplier_invoices o cross join lateral jsonb_array_elements(restaurant_pos_private.purchase_items(o.items)) i where o.restaurant_id=p.restaurant_id and i->>'product_id' in(p.id::text,p.product_id));

-- Keep historical menu IDs/orders, but stop selling supplier stock as a dish.
update restaurant_pos_private.menu m set active=false,updated_at=now()
from public.products p where p.id=m.product_id and p.restaurant_product_type='raw_material' and m.active;

create function restaurant_pos_private.product_kind_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare restaurant boolean;
begin
 select lower(btrim(coalesce(nullif(business_type,''),business_mode::text,''))) in ('restaurant','cafe')
 into restaurant from public.restaurants where id=new.restaurant_id;
 if restaurant then
  if tg_op='UPDATE' and old.restaurant_product_type is not null and new.restaurant_product_type is distinct from old.restaurant_product_type then
   raise exception 'Product type cannot be changed. Create a separate dish or raw material.' using errcode='23514';
  end if;
  new.restaurant_product_type:=coalesce(new.restaurant_product_type,'raw_material');
 elsif new.restaurant_product_type is not null then
  raise exception 'Restaurant product types are restricted to restaurant and cafe portals.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function restaurant_pos_private.product_kind_guard() from public,anon,authenticated;
create trigger restaurant_product_kind before insert or update on public.products
for each row execute function restaurant_pos_private.product_kind_guard();

create function restaurant_pos_private.raw_reference_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare refs jsonb; item jsonb; ref text;
begin
 if not exists(select 1 from public.restaurants r where r.id=new.restaurant_id and lower(btrim(coalesce(nullif(r.business_type,''),r.business_mode::text,''))) in ('restaurant','cafe')) then return new; end if;
 if tg_table_name in ('purchases','inventory') then
  refs:=jsonb_build_array(jsonb_build_object('product_id',new.product_id));
 else refs:=restaurant_pos_private.purchase_items(new.items); end if;
 for item in select value from jsonb_array_elements(refs) loop
  ref:=nullif(item->>'product_id','');
  -- Amount-only purchases remain valid; any product reference must be a material in this tenant.
  if ref is not null and not exists(select 1 from public.products p where p.restaurant_id=new.restaurant_id and p.restaurant_product_type='raw_material' and ref in(p.id::text,p.product_id)) then
   raise exception 'Purchasing and inventory require a raw material from this restaurant, not a menu dish.' using errcode='23514';
  end if;
 end loop;
 return new;
end $$;
revoke all on function restaurant_pos_private.raw_reference_guard() from public,anon,authenticated;
create trigger restaurant_raw_product before insert or update of product_id,restaurant_id on public.inventory for each row execute function restaurant_pos_private.raw_reference_guard();
create trigger restaurant_raw_product before insert or update of product_id,restaurant_id on public.purchases for each row execute function restaurant_pos_private.raw_reference_guard();
create trigger restaurant_raw_product before insert or update of items,restaurant_id on public.purchase_orders for each row execute function restaurant_pos_private.raw_reference_guard();
create trigger restaurant_raw_product before insert or update of items,restaurant_id on public.supplier_invoices for each row execute function restaurant_pos_private.raw_reference_guard();

create function restaurant_pos_private.menu_kind_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.active and not exists(select 1 from public.products p where p.id=new.product_id and p.restaurant_id=new.restaurant_id and (p.branch_id is null or p.branch_id=new.branch_id) and p.restaurant_product_type='menu_item') then
  raise exception 'Only menu dishes can be enabled in the restaurant POS.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function restaurant_pos_private.menu_kind_guard() from public,anon,authenticated;
create trigger restaurant_menu_kind before insert or update of active,product_id,restaurant_id,branch_id on restaurant_pos_private.menu for each row execute function restaurant_pos_private.menu_kind_guard();

create or replace function restaurant_pos_private.setup(p_restaurant_id uuid,p_branch_id uuid,p_command text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare i integer; x jsonb; stock public.inventory; m restaurant_pos_private.menu; p public.products; recipe jsonb:='[]';
begin
 perform restaurant_pos_private.guard(p_restaurant_id,p_branch_id,'uploadSales',true);
 if p_branch_id is null then raise exception 'Select one branch.' using errcode='23514'; end if;
 if p_command='devices' then
  if (p_payload->>'count')::integer not between 1 and 100 then raise exception 'Choose 1–100 devices.' using errcode='23514'; end if;
  for i in 1..(p_payload->>'count')::integer loop
   insert into restaurant_pos_private.terminals(restaurant_id,branch_id,code) values(p_restaurant_id,p_branch_id,'POS-'||lpad(i::text,2,'0')) on conflict(branch_id,code) do nothing;
  end loop;
 elsif p_command='lock' then
  update restaurant_pos_private.terminals set locked=(p_payload->>'locked')::boolean where id=(p_payload->>'device_id')::uuid and restaurant_id=p_restaurant_id and branch_id=p_branch_id;
 elsif p_command='menu' then
  if nullif(btrim(p_payload->>'name'),'') is null then raise exception 'Enter the dish name.' using errcode='23514'; end if;
  if coalesce(p_payload->>'image_url','')<>'' and p_payload->>'image_url' !~ '^https://' then raise exception 'Use an HTTPS image URL.' using errcode='23514'; end if;
  if nullif(p_payload->>'id','') is null then raise exception 'Menu ID is required.' using errcode='23514'; end if;
  -- Serialize retries and updates to avoid duplicate product records.
  perform pg_advisory_xact_lock(hashtextextended(p_payload->>'id',0));
  select * into m from restaurant_pos_private.menu where id=(p_payload->>'id')::uuid for update;
  if m.id is not null and (m.restaurant_id<>p_restaurant_id or m.branch_id<>p_branch_id) then raise exception 'Menu scope mismatch.' using errcode='42501'; end if;
  if m.id is not null then
   select * into p from public.products where id=m.product_id and restaurant_id=p_restaurant_id and restaurant_product_type='menu_item';
   if p.id is null then raise exception 'This is a raw material. Create a separate dish.' using errcode='23514'; end if;
  elsif nullif(p_payload->>'product_id','') is not null then
   select * into p from public.products where id=(p_payload->>'product_id')::uuid and restaurant_id=p_restaurant_id and (branch_id is null or branch_id=p_branch_id) and restaurant_product_type='menu_item' and coalesce(is_active,true);
   if p.id is null then raise exception 'Raw materials cannot be sold as menu dishes. Create a separate dish.' using errcode='23514'; end if;
  else
   insert into public.products(restaurant_id,branch_id,tenant_id,product_id,sku,name,name_en,name_ar,name_fa,image_url,unit,default_price,selling_price,tax_rate,restaurant_product_type,custom_attributes)
   values(p_restaurant_id,p_branch_id,(select tenant_id from public.restaurants where id=p_restaurant_id),'DISH-'||(p_payload->>'id'),'DISH-'||(p_payload->>'id'),btrim(p_payload->>'name'),btrim(p_payload->>'name'),p_payload->>'name_ar',p_payload->>'name_fa',nullif(p_payload->>'image_url',''),'portion',(p_payload->>'price')::numeric,(p_payload->>'price')::numeric,(p_payload->>'tax_rate')::numeric,'menu_item','{"__erp_master":{"purchasable":false,"sellable":true,"track_inventory":false}}')
   returning * into p;
  end if;
  if p_payload->>'stock_mode'='untracked' and not coalesce((p_payload->>'confirm_untracked')::boolean,false) then raise exception 'Explicitly confirm that this item has no automatic stock deduction.' using errcode='23514'; end if;
  if p_payload->>'stock_mode'='recipe' then
   if jsonb_typeof(p_payload->'recipe')<>'array' or jsonb_array_length(p_payload->'recipe') not between 1 and 100 then raise exception 'Add the ingredients per portion.' using errcode='23514'; end if;
   for x in select value from jsonb_array_elements(p_payload->'recipe') loop
    select * into stock from public.inventory where id=(x->>'inventory_id')::uuid and restaurant_id=p_restaurant_id and branch_id=p_branch_id;
    if stock.id is null or not exists(select 1 from public.products ip where ip.restaurant_id=p_restaurant_id and ip.restaurant_product_type='raw_material' and stock.product_id in(ip.id::text,ip.product_id)) or (x->>'quantity')::numeric not between 0.000001 and 1000000 or x->>'quantity' is null then raise exception 'Invalid branch ingredient or quantity.' using errcode='23514'; end if;
    recipe:=recipe||jsonb_build_array(jsonb_build_object('inventory_id',stock.id,'quantity',(x->>'quantity')::numeric,'unit',stock.unit));
   end loop;
  end if;
  if exists(select 1 from restaurant_pos_private.menu where id=(p_payload->>'id')::uuid and (restaurant_id<>p_restaurant_id or branch_id<>p_branch_id)) then raise exception 'Menu scope mismatch.' using errcode='42501'; end if;
  insert into restaurant_pos_private.menu(id,restaurant_id,branch_id,product_id,name,name_ar,name_fa,category,station,image_url,price,tax_rate,stock_mode,recipe,active)
  values((p_payload->>'id')::uuid,p_restaurant_id,p_branch_id,p.id,coalesce(nullif(p_payload->>'name',''),p.name),coalesce(p_payload->>'name_ar',p.name_ar),coalesce(p_payload->>'name_fa',p.name_fa),
   coalesce(nullif(p_payload->>'category',''),'Food'),coalesce(nullif(p_payload->>'station',''),'Kitchen'),coalesce(nullif(p_payload->>'image_url',''),p.image_url),(p_payload->>'price')::numeric,(p_payload->>'tax_rate')::numeric,p_payload->>'stock_mode',recipe,coalesce((p_payload->>'active')::boolean,true))
  on conflict(id) do update set name=excluded.name,name_ar=excluded.name_ar,name_fa=excluded.name_fa,image_url=excluded.image_url,category=excluded.category,station=excluded.station,price=excluded.price,tax_rate=excluded.tax_rate,stock_mode=excluded.stock_mode,recipe=excluded.recipe,active=excluded.active,updated_at=now();
 else raise exception 'Unknown setup action.' using errcode='22023'; end if;
 perform realtime.send('{}'::jsonb,'changed','restaurant-pos:'||p_restaurant_id,false);
 return jsonb_build_object('ok',true);
end $$;

create or replace function restaurant_pos_private.catalog(p_restaurant_id uuid,p_branch_id uuid,p_search text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform restaurant_pos_private.guard(p_restaurant_id,p_branch_id,'uploadSales',true);
 return jsonb_build_object('products',coalesce((select jsonb_agg(to_jsonb(p)) from (select id,name,name_ar,default_price,selling_price,tax_rate from public.products where restaurant_id=p_restaurant_id and (branch_id is null or branch_id=p_branch_id) and restaurant_product_type='menu_item' and coalesce(is_active,true) and (coalesce(name,'')||' '||coalesce(name_ar,'')) ilike '%'||coalesce(p_search,'')||'%' order by name limit 100) p),'[]'::jsonb),
 'inventory',coalesce((select jsonb_agg(to_jsonb(i)) from (select id,product_name,quantity,unit from public.inventory i where restaurant_id=p_restaurant_id and branch_id=p_branch_id and exists(select 1 from public.products p where p.restaurant_id=i.restaurant_id and p.restaurant_product_type='raw_material' and i.product_id in(p.id::text,p.product_id)) order by product_name limit 1000) i),'[]'::jsonb),
 'menu',coalesce((select jsonb_agg(to_jsonb(m) order by m.name) from restaurant_pos_private.menu m join public.products p on p.id=m.product_id and p.restaurant_product_type='menu_item' where m.restaurant_id=p_restaurant_id and m.branch_id=p_branch_id and (coalesce(m.name,'')||' '||coalesce(m.name_ar,'')||' '||coalesce(m.name_fa,'')) ilike '%'||coalesce(p_search,'')||'%'),'[]'::jsonb));
end $$;

create or replace function restaurant_pos_private.workspace(p_restaurant_id uuid,p_branch_id uuid,p_date date) returns jsonb language plpgsql security definer set search_path='' as $$
declare can_manage boolean; result jsonb;
begin
 perform restaurant_pos_private.guard(p_restaurant_id,p_branch_id);
 can_manage:=public.erp_can_write_scope(p_restaurant_id,p_branch_id);
 select jsonb_build_object(
 'devices',coalesce((select jsonb_agg(to_jsonb(d)) from restaurant_pos_private.terminals d where d.restaurant_id=p_restaurant_id and (p_branch_id is null or d.branch_id=p_branch_id)),'[]'::jsonb),
 'menu',coalesce((select jsonb_agg(to_jsonb(m)-'recipe') from restaurant_pos_private.menu m where m.restaurant_id=p_restaurant_id and m.branch_id=p_branch_id and (m.active or can_manage) and exists(select 1 from public.products p where p.id=m.product_id and p.restaurant_product_type='menu_item')),'[]'::jsonb),
 'orders',coalesce((select jsonb_agg(restaurant_pos_private.order_json(o)) from (select o.* from restaurant_pos_private.orders o join restaurant_pos_private.terminals d on d.id=o.device_id where d.restaurant_id=p_restaurant_id and (p_branch_id is null or d.branch_id=p_branch_id) and o.kitchen_status in ('queued','preparing','ready') order by o.submitted_at limit 100) o),'[]'::jsonb),
 'can_manage',can_manage,'server_time',now(),
 'paid_sales',case when can_manage then (select coalesce(sum(o.net_total),0) from restaurant_pos_private.orders o join restaurant_pos_private.terminals d on d.id=o.device_id where d.restaurant_id=p_restaurant_id and (p_branch_id is null or d.branch_id=p_branch_id) and o.status='paid' and (o.paid_at at time zone 'Asia/Riyadh')::date=p_date) end,
 'unpaid_orders',case when can_manage then (select coalesce(sum(o.net_total),0) from restaurant_pos_private.orders o join restaurant_pos_private.terminals d on d.id=o.device_id where d.restaurant_id=p_restaurant_id and (p_branch_id is null or d.branch_id=p_branch_id) and o.status in ('open','held')) end,
 'expenses',case when can_manage and public.erp_has_permission('viewExpenses') then (select coalesce(sum(amount),0) from public.expenses where restaurant_id=p_restaurant_id and (p_branch_id is null or branch_id=p_branch_id) and date=p_date and lower(coalesce(status,'')) not in ('rejected','cancelled')) end,
 'purchases',case when can_manage and public.erp_has_permission('viewPurchases') then (select coalesce(sum(qty*coalesce(used_price,current_price,0)),0) from public.purchases where restaurant_id=p_restaurant_id and (p_branch_id is null or branch_id=p_branch_id) and date=p_date) end,
 'events',case when can_manage then coalesce((select jsonb_agg(to_jsonb(e)) from (select e.action,e.reason,e.occurred_at,d.code from restaurant_pos_private.events e join restaurant_pos_private.terminals d on d.id=e.device_id where d.restaurant_id=p_restaurant_id and (p_branch_id is null or d.branch_id=p_branch_id) order by e.occurred_at desc limit 30) e),'[]'::jsonb) else '[]'::jsonb end
 ) into result;
 return result;
end $$;

notify pgrst, 'reload schema';
