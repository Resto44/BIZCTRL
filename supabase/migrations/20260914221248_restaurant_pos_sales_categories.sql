-- Restaurant POS sales categories are independent of supplier/purchase categories.
create table restaurant_pos_private.categories (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 branch_id uuid not null references public.branches(id) on delete cascade,
 name text not null check (btrim(name)<>''), name_ar text, name_fa text,
 is_active boolean not null default true, sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index restaurant_pos_category_name_unique on restaurant_pos_private.categories(restaurant_id,branch_id,lower(btrim(name)));
alter table restaurant_pos_private.categories enable row level security;
revoke all on restaurant_pos_private.categories from public,anon,authenticated;

-- Preserve only categories already used by actual dishes, with new POS identities.
-- Unused purchasing categories never enter the POS catalog.
insert into restaurant_pos_private.categories(restaurant_id,branch_id,name,name_ar,name_fa)
select distinct on (m.restaurant_id,m.branch_id,lower(btrim(coalesce(c.name,nullif(m.category,''),'Food'))))
 m.restaurant_id,m.branch_id,btrim(coalesce(c.name,nullif(m.category,''),'Food')),c.name_ar,c.name_fa
from restaurant_pos_private.menu m
join public.products p on p.id=m.product_id and p.restaurant_product_type='menu_item'
left join public.product_categories c on c.id=m.category_id and c.restaurant_id=m.restaurant_id and (c.branch_id is null or c.branch_id=m.branch_id)
order by m.restaurant_id,m.branch_id,lower(btrim(coalesce(c.name,nullif(m.category,''),'Food'))),m.id;

alter table restaurant_pos_private.menu drop constraint menu_category_id_fkey;
-- Capture the category name before switching its foreign key.
update restaurant_pos_private.menu m set category=c.name from public.product_categories c
where c.id=m.category_id and c.restaurant_id=m.restaurant_id and (c.branch_id is null or c.branch_id=m.branch_id);
update restaurant_pos_private.menu m set category_id=(select c.id from restaurant_pos_private.categories c
 where c.restaurant_id=m.restaurant_id and c.branch_id=m.branch_id and lower(btrim(c.name))=lower(btrim(coalesce(nullif(m.category,''),'Food'))));
alter table restaurant_pos_private.menu add constraint menu_category_id_fkey foreign key(category_id) references restaurant_pos_private.categories(id) on delete set null;
-- Menu dishes no longer share category references with material purchasing.
update public.products p set category_id=null where p.restaurant_product_type='menu_item'
and p.category_id is not null and exists(select 1 from restaurant_pos_private.menu m where m.product_id=p.id and m.restaurant_id=p.restaurant_id);

create or replace function restaurant_pos_private.setup(p_restaurant_id uuid,p_branch_id uuid,p_command text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare i integer; x jsonb; stock public.inventory; m restaurant_pos_private.menu; p public.products; recipe jsonb:='[]'; cat restaurant_pos_private.categories; category_id uuid;
begin
 perform restaurant_pos_private.guard(p_restaurant_id,p_branch_id,'uploadSales',true);
 if p_branch_id is null then raise exception 'Select one branch.' using errcode='23514'; end if;
 if p_command='category_list' then
  return jsonb_build_object('categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order,c.name) from restaurant_pos_private.categories c where c.restaurant_id=p_restaurant_id and c.branch_id=p_branch_id),'[]'::jsonb));
 elsif p_command='category_save' then
  if nullif(p_payload->>'id','') is null or nullif(btrim(p_payload->>'name'),'') is null or char_length(btrim(p_payload->>'name'))>160 then raise exception 'Enter the POS sales category name (1–160 characters).' using errcode='23514'; end if;
  insert into restaurant_pos_private.categories as target(id,restaurant_id,branch_id,name,name_ar,name_fa,is_active,sort_order)
  values((p_payload->>'id')::uuid,p_restaurant_id,p_branch_id,btrim(p_payload->>'name'),nullif(btrim(p_payload->>'name_ar'),''),nullif(btrim(p_payload->>'name_fa'),''),coalesce((p_payload->>'is_active')::boolean,true),coalesce((p_payload->>'sort_order')::integer,0))
  on conflict(id) do update set name=excluded.name,name_ar=excluded.name_ar,name_fa=excluded.name_fa,is_active=excluded.is_active,sort_order=excluded.sort_order,updated_at=now()
  where target.restaurant_id=excluded.restaurant_id and target.branch_id=excluded.branch_id
  returning id into category_id;
  if category_id is null then raise exception 'POS category scope mismatch.' using errcode='42501'; end if;
 elsif p_command='devices' then
  if (p_payload->>'count')::integer not between 1 and 100 then raise exception 'Choose 1–100 devices.' using errcode='23514'; end if;
  for i in 1..(p_payload->>'count')::integer loop
   insert into restaurant_pos_private.terminals(restaurant_id,branch_id,code) values(p_restaurant_id,p_branch_id,'POS-'||lpad(i::text,2,'0')) on conflict(branch_id,code) do nothing;
  end loop;
 elsif p_command='lock' then
  update restaurant_pos_private.terminals set locked=(p_payload->>'locked')::boolean where id=(p_payload->>'device_id')::uuid and restaurant_id=p_restaurant_id and branch_id=p_branch_id;
 elsif p_command='menu_batch' then
  if nullif(btrim(p_payload->>'option_group'),'') is null or char_length(btrim(p_payload->>'option_group'))>80 then raise exception 'Enter the food group name.' using errcode='23514'; end if;
  if jsonb_typeof(p_payload->'items') is distinct from 'array' then raise exception 'Choose 1–6 servings.' using errcode='23514'; end if;
  if jsonb_array_length(p_payload->'items') not between 1 and 6 or
     (select count(distinct value->>'option_key') from jsonb_array_elements(p_payload->'items'))<>jsonb_array_length(p_payload->'items') or
     (select count(distinct value->>'id') from jsonb_array_elements(p_payload->'items'))<>jsonb_array_length(p_payload->'items') then
   raise exception 'Each serving needs a unique ID and size/style combination.' using errcode='23514'; end if;
  if nullif(p_payload->>'category_id','') is null then raise exception 'Select a POS sales category.' using errcode='23514'; end if;
  -- Nested calls share this transaction: any invalid row rolls back the whole group.
  -- Lock order is stable across concurrent group edits.
  for x in select value from jsonb_array_elements(p_payload->'items') order by value->>'id' loop
   perform restaurant_pos_private.setup(p_restaurant_id,p_branch_id,'menu',x||jsonb_build_object('option_group',btrim(p_payload->>'option_group'),'category_id',p_payload->>'category_id'));
  end loop;
 elsif p_command='menu' then
  if nullif(btrim(p_payload->>'name'),'') is null then raise exception 'Enter the dish name.' using errcode='23514'; end if;
  if coalesce(p_payload->>'image_url','')<>'' and p_payload->>'image_url' !~ '^https://' then raise exception 'Use an HTTPS image URL.' using errcode='23514'; end if;
  if nullif(p_payload->>'id','') is null then raise exception 'Menu ID is required.' using errcode='23514'; end if;
  -- Serialize retries and updates to avoid duplicate product records.
  perform pg_advisory_xact_lock(hashtextextended(p_payload->>'id',0));
  select * into m from restaurant_pos_private.menu where id=(p_payload->>'id')::uuid for update;
  if m.id is not null and (m.restaurant_id<>p_restaurant_id or m.branch_id<>p_branch_id) then raise exception 'Menu scope mismatch.' using errcode='42501'; end if;
  category_id:=case when p_payload ? 'category_id' then nullif(p_payload->>'category_id','')::uuid else m.category_id end;
  if category_id is not null then
   select * into cat from restaurant_pos_private.categories c where c.id=category_id and c.restaurant_id=p_restaurant_id and (c.branch_id is null or c.branch_id=p_branch_id) and coalesce(c.is_active,true);
   if cat.id is null then raise exception 'Select an active POS sales category from this restaurant and branch.' using errcode='23514'; end if;
  elsif p_payload ? 'category_id' then
   raise exception 'Select a POS sales category.' using errcode='23514';
  end if;
  if coalesce((p_payload->>'price')::numeric,0) not between 0.01 and 1000000 or coalesce((p_payload->>'tax_rate')::numeric,-1) not between 0 and 100 then raise exception 'Enter a valid price and tax rate.' using errcode='23514'; end if;
  if coalesce(p_payload->>'stock_mode','') not in ('recipe','untracked') then raise exception 'Choose a stock mode.' using errcode='23514'; end if;
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
   if jsonb_typeof(p_payload->'recipe') is distinct from 'array' or jsonb_array_length(p_payload->'recipe') not between 1 and 100 then raise exception 'Add the ingredients per portion.' using errcode='23514'; end if;
   for x in select value from jsonb_array_elements(p_payload->'recipe') loop
    select * into stock from public.inventory where id=(x->>'inventory_id')::uuid and restaurant_id=p_restaurant_id and branch_id=p_branch_id;
    if stock.id is null or not exists(select 1 from public.products ip where ip.restaurant_id=p_restaurant_id and ip.restaurant_product_type='raw_material' and stock.product_id in(ip.id::text,ip.product_id)) or (x->>'quantity')::numeric not between 0.000001 and 1000000 or x->>'quantity' is null then raise exception 'Invalid branch ingredient or quantity.' using errcode='23514'; end if;
    recipe:=recipe||jsonb_build_array(jsonb_build_object('inventory_id',stock.id,'quantity',(x->>'quantity')::numeric,'unit',stock.unit));
   end loop;
  end if;
  if exists(select 1 from restaurant_pos_private.menu where id=(p_payload->>'id')::uuid and (restaurant_id<>p_restaurant_id or branch_id<>p_branch_id)) then raise exception 'Menu scope mismatch.' using errcode='42501'; end if;
  insert into restaurant_pos_private.menu(id,restaurant_id,branch_id,product_id,name,name_ar,name_fa,category,station,image_url,price,tax_rate,stock_mode,recipe,active,option_group,option_key,category_id)
  values((p_payload->>'id')::uuid,p_restaurant_id,p_branch_id,p.id,coalesce(nullif(p_payload->>'name',''),p.name),coalesce(p_payload->>'name_ar',p.name_ar),coalesce(p_payload->>'name_fa',p.name_fa),
   coalesce(cat.name,m.category,nullif(p_payload->>'category',''),'Food'),coalesce(nullif(p_payload->>'station',''),'Kitchen'),coalesce(nullif(p_payload->>'image_url',''),p.image_url),(p_payload->>'price')::numeric,(p_payload->>'tax_rate')::numeric,p_payload->>'stock_mode',recipe,coalesce((p_payload->>'active')::boolean,true),
   case when p_payload ? 'option_group' then nullif(btrim(p_payload->>'option_group'),'') else m.option_group end,
   case when p_payload ? 'option_key' then nullif(p_payload->>'option_key','') else m.option_key end,category_id)
  on conflict(id) do update set name=excluded.name,name_ar=excluded.name_ar,name_fa=excluded.name_fa,image_url=excluded.image_url,category=excluded.category,category_id=excluded.category_id,station=excluded.station,price=excluded.price,tax_rate=excluded.tax_rate,stock_mode=excluded.stock_mode,recipe=excluded.recipe,active=excluded.active,option_group=excluded.option_group,option_key=excluded.option_key,updated_at=now();
 else raise exception 'Unknown setup action.' using errcode='22023'; end if;
 perform realtime.send('{}'::jsonb,'changed','restaurant-pos:'||p_restaurant_id,false);
 return jsonb_build_object('ok',true);
end $$;
create or replace function restaurant_pos_private.catalog(p_restaurant_id uuid,p_branch_id uuid,p_search text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform restaurant_pos_private.guard(p_restaurant_id,p_branch_id,'uploadSales',true);
 return jsonb_build_object('categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order,c.name) from restaurant_pos_private.categories c where c.restaurant_id=p_restaurant_id and (c.branch_id is null or c.branch_id=p_branch_id) and coalesce(c.is_active,true)),'[]'::jsonb),'products',coalesce((select jsonb_agg(to_jsonb(p)) from (select id,name,name_ar,default_price,selling_price,tax_rate from public.products where restaurant_id=p_restaurant_id and (branch_id is null or branch_id=p_branch_id) and restaurant_product_type='menu_item' and coalesce(is_active,true) and (coalesce(name,'')||' '||coalesce(name_ar,'')) ilike '%'||coalesce(p_search,'')||'%' order by name limit 100) p),'[]'::jsonb),
 'inventory',coalesce((select jsonb_agg(to_jsonb(i)) from (select id,product_name,quantity,unit from public.inventory i where restaurant_id=p_restaurant_id and branch_id=p_branch_id and exists(select 1 from public.products p where p.restaurant_id=i.restaurant_id and p.restaurant_product_type='raw_material' and i.product_id in(p.id::text,p.product_id)) order by product_name limit 1000) i),'[]'::jsonb),
 'menu',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('category',coalesce(c.name,m.category),'category_ar',c.name_ar,'category_fa',c.name_fa) order by m.name) from restaurant_pos_private.menu m left join restaurant_pos_private.categories c on c.id=m.category_id and c.restaurant_id=m.restaurant_id and (c.branch_id is null or c.branch_id=m.branch_id) join public.products p on p.id=m.product_id and p.restaurant_product_type='menu_item' where m.restaurant_id=p_restaurant_id and m.branch_id=p_branch_id and (coalesce(m.name,'')||' '||coalesce(m.name_ar,'')||' '||coalesce(m.name_fa,'')) ilike '%'||coalesce(p_search,'')||'%'),'[]'::jsonb));
end $$;

create or replace function restaurant_pos_private.workspace(p_restaurant_id uuid,p_branch_id uuid,p_date date) returns jsonb language plpgsql security definer set search_path='' as $$
declare can_manage boolean; result jsonb;
begin
 perform restaurant_pos_private.guard(p_restaurant_id,p_branch_id);
 can_manage:=public.erp_can_write_scope(p_restaurant_id,p_branch_id);
 select jsonb_build_object(
 'devices',coalesce((select jsonb_agg(to_jsonb(d)) from restaurant_pos_private.terminals d where d.restaurant_id=p_restaurant_id and (p_branch_id is null or d.branch_id=p_branch_id)),'[]'::jsonb),
 'menu',coalesce((select jsonb_agg((to_jsonb(m)-'recipe')||jsonb_build_object('category',coalesce(c.name,m.category),'category_ar',c.name_ar,'category_fa',c.name_fa)) from restaurant_pos_private.menu m left join restaurant_pos_private.categories c on c.id=m.category_id and c.restaurant_id=m.restaurant_id and (c.branch_id is null or c.branch_id=m.branch_id) where m.restaurant_id=p_restaurant_id and m.branch_id=p_branch_id and (m.active or can_manage) and exists(select 1 from public.products p where p.id=m.product_id and p.restaurant_product_type='menu_item')),'[]'::jsonb),
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
