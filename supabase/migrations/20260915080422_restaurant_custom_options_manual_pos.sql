-- Custom options are real priced menu variants; existing order/recipe semantics are retained.
alter table restaurant_pos_private.menu add column variant_options jsonb not null default '[]'::jsonb;
alter table restaurant_pos_private.menu drop constraint restaurant_menu_serving_choice;
alter table restaurant_pos_private.menu add constraint restaurant_menu_serving_choice check (
 jsonb_typeof(variant_options)='array' and jsonb_array_length(variant_options)<=4 and (
 (option_group is null and option_key is null and variant_options='[]'::jsonb) or
 (option_group is not null and option_key is not null and char_length(btrim(option_group)) between 1 and 80 and (
  (option_key in ('half_plain','half_rice','whole_plain','whole_rice','quarter_plain','quarter_rice') and variant_options='[]'::jsonb) or
  (option_key ~ '^custom_[0-9a-f-]{36}$' and jsonb_array_length(variant_options) between 1 and 4)
 ))));
alter table restaurant_pos_private.terminals add column active boolean not null default true;

create or replace function restaurant_pos_private.setup(p_restaurant_id uuid,p_branch_id uuid,p_command text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d restaurant_pos_private.terminals; choices jsonb; choice jsonb; new_device_id uuid; x jsonb; stock public.inventory; m restaurant_pos_private.menu; p public.products; recipe jsonb:='[]'; cat restaurant_pos_private.categories; category_id uuid;
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
  raise exception 'Use Add POS to create one named device at a time.' using errcode='23514';
 elsif p_command='device_save' then
  if nullif(p_payload->>'id','') is null or char_length(coalesce(btrim(p_payload->>'code'),'')) not between 1 and 40 then raise exception 'Enter a POS name (1–40 characters).' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_branch_id::text||':pos-devices',0));
  select * into d from restaurant_pos_private.terminals where id=(p_payload->>'id')::uuid for update;
  if d.id is not null and (d.restaurant_id<>p_restaurant_id or d.branch_id<>p_branch_id) then raise exception 'POS scope mismatch.' using errcode='42501'; end if;
  if exists(select 1 from restaurant_pos_private.terminals t where t.branch_id=p_branch_id and lower(btrim(t.code))=lower(btrim(p_payload->>'code')) and t.id<>(p_payload->>'id')::uuid) then raise exception 'A POS with this name already exists in this branch.' using errcode='23514'; end if;
  insert into restaurant_pos_private.terminals as target(id,restaurant_id,branch_id,code)
  values((p_payload->>'id')::uuid,p_restaurant_id,p_branch_id,btrim(p_payload->>'code'))
  on conflict(id) do update set code=excluded.code where target.restaurant_id=excluded.restaurant_id and target.branch_id=excluded.branch_id returning id into new_device_id;
  if new_device_id is null then raise exception 'POS scope mismatch.' using errcode='42501'; end if;
  if d.id is null or d.code is distinct from btrim(p_payload->>'code') then
   insert into restaurant_pos_private.events(device_id,actor,action) values(new_device_id,auth.uid(),case when d.id is null then 'device_created' else 'device_renamed' end);
  end if;
 elsif p_command in ('device_archive','lock') then
  select * into d from restaurant_pos_private.terminals where id=coalesce(p_payload->>'id',p_payload->>'device_id')::uuid and restaurant_id=p_restaurant_id and branch_id=p_branch_id for update;
  if d.id is null then raise exception 'POS scope mismatch.' using errcode='42501'; end if;
  if p_command='lock' then
   if not d.active then raise exception 'Restore this POS before unlocking.' using errcode='23514'; end if;
   update restaurant_pos_private.terminals set locked=(p_payload->>'locked')::boolean where id=d.id;
  else
   if jsonb_typeof(p_payload->'active') is distinct from 'boolean' then raise exception 'Choose a POS status.' using errcode='23514'; end if;
   if not (p_payload->>'active')::boolean and (
    exists(select 1 from restaurant_pos_private.shifts where device_id=d.id and closed_at is null) or
    exists(select 1 from restaurant_pos_private.orders where device_id=d.id and (status in ('open','held') or kitchen_status in ('queued','preparing','ready')))
   ) then raise exception 'Close the shift and settle pending orders before archiving this POS.' using errcode='23514'; end if;
   update restaurant_pos_private.terminals set active=(p_payload->>'active')::boolean,locked=not (p_payload->>'active')::boolean where id=d.id;
   if d.active is distinct from (p_payload->>'active')::boolean then
    insert into restaurant_pos_private.events(device_id,actor,action) values(d.id,auth.uid(),case when (p_payload->>'active')::boolean then 'device_restored' else 'device_archived' end);
   end if;
  end if;
 elsif p_command='menu_batch' then
  if nullif(btrim(p_payload->>'option_group'),'') is null or char_length(btrim(p_payload->>'option_group'))>80 then raise exception 'Enter the food group name.' using errcode='23514'; end if;
  if jsonb_typeof(p_payload->'items') is distinct from 'array' then raise exception 'Choose 1–200 servings, including archived choices.' using errcode='23514'; end if;
  if jsonb_array_length(p_payload->'items') not between 1 and 200 or
     (select count(distinct value->>'option_key') from jsonb_array_elements(p_payload->'items'))<>jsonb_array_length(p_payload->'items') or
     (select count(distinct value->>'id') from jsonb_array_elements(p_payload->'items'))<>jsonb_array_length(p_payload->'items') then
   raise exception 'Each serving needs a unique ID and size/style combination.' using errcode='23514'; end if;
  if nullif(p_payload->>'category_id','') is null then raise exception 'Select a POS sales category.' using errcode='23514'; end if;
  if (select count(*) from jsonb_array_elements(p_payload->'items') as entries(entry_item) where coalesce((entries.entry_item->>'active')::boolean,true))>100 then raise exception 'At most 100 active choices per food.' using errcode='23514'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'items') as entries(entry_item) where coalesce((entries.entry_item->>'active')::boolean,true) and entries.entry_item->>'option_key' like 'custom_%') then
   if exists(select 1 from jsonb_array_elements(p_payload->'items') as entries(entry_item) where coalesce((entries.entry_item->>'active')::boolean,true) and coalesce(entries.entry_item->>'option_key','') not like 'custom_%') then raise exception 'Do not mix fixed and custom choices in one food.' using errcode='23514'; end if;
   if (select count(distinct (select jsonb_agg(y->>'label' order by n) from jsonb_array_elements(entries.entry_item->'variant_options') with ordinality a(y,n))) from jsonb_array_elements(p_payload->'items') as entries(entry_item) where coalesce((entries.entry_item->>'active')::boolean,true))<>1 then raise exception 'Use the same option groups for every active choice.' using errcode='23514'; end if;
   if (select count(*) from (select entries.entry_item->'variant_options' from jsonb_array_elements(p_payload->'items') as entries(entry_item) where coalesce((entries.entry_item->>'active')::boolean,true) group by entries.entry_item->'variant_options' having count(*)>1) duplicates)>0 then raise exception 'Each combination must be unique.' using errcode='23514'; end if;
  end if;
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
  choices:=case when p_payload ? 'variant_options' then p_payload->'variant_options' else coalesce(m.variant_options,'[]'::jsonb) end;
  if jsonb_typeof(choices) is distinct from 'array' or jsonb_array_length(choices)>4 then raise exception 'Use up to four option groups.' using errcode='23514'; end if;
  for choice in select value from jsonb_array_elements(choices) loop
   if jsonb_typeof(choice) is distinct from 'object' or jsonb_typeof(choice->'label') is distinct from 'string' or jsonb_typeof(choice->'value') is distinct from 'string' or char_length(btrim(choice->>'label')) not between 1 and 60 or char_length(btrim(choice->>'value')) not between 1 and 60 or choice<>jsonb_build_object('label',btrim(choice->>'label'),'value',btrim(choice->>'value')) then raise exception 'Each option needs a name and value (1–60 characters).' using errcode='23514'; end if;
  end loop;
  if (select count(distinct value->>'label') from jsonb_array_elements(choices))<>jsonb_array_length(choices) then raise exception 'Option group names must be unique.' using errcode='23514'; end if;
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
  insert into restaurant_pos_private.menu(id,restaurant_id,branch_id,product_id,name,name_ar,name_fa,category,station,image_url,price,tax_rate,stock_mode,recipe,active,option_group,option_key,category_id,variant_options)
  values((p_payload->>'id')::uuid,p_restaurant_id,p_branch_id,p.id,coalesce(nullif(p_payload->>'name',''),p.name),coalesce(p_payload->>'name_ar',p.name_ar),coalesce(p_payload->>'name_fa',p.name_fa),
   coalesce(cat.name,m.category,nullif(p_payload->>'category',''),'Food'),coalesce(nullif(p_payload->>'station',''),'Kitchen'),coalesce(nullif(p_payload->>'image_url',''),p.image_url),(p_payload->>'price')::numeric,(p_payload->>'tax_rate')::numeric,p_payload->>'stock_mode',recipe,coalesce((p_payload->>'active')::boolean,true),
   case when p_payload ? 'option_group' then nullif(btrim(p_payload->>'option_group'),'') else m.option_group end,
   case when p_payload ? 'option_key' then nullif(p_payload->>'option_key','') else m.option_key end,category_id,choices)
  on conflict(id) do update set name=excluded.name,name_ar=excluded.name_ar,name_fa=excluded.name_fa,image_url=excluded.image_url,category=excluded.category,category_id=excluded.category_id,station=excluded.station,price=excluded.price,tax_rate=excluded.tax_rate,stock_mode=excluded.stock_mode,recipe=excluded.recipe,active=excluded.active,option_group=excluded.option_group,option_key=excluded.option_key,variant_options=excluded.variant_options,updated_at=now();
 else raise exception 'Unknown setup action.' using errcode='22023'; end if;
 perform realtime.send('{}'::jsonb,'changed','restaurant-pos:'||p_restaurant_id,false);
 return jsonb_build_object('ok',true);
end $$;

do $patch$
declare definition text;
begin
 select pg_get_functiondef('restaurant_pos_private.command(uuid,text,jsonb,uuid)'::regprocedure) into definition;
 if position(' if d.locked and p_command' in definition)=0 then raise exception 'Cashier command changed; review archive guard.'; end if;
 definition:=replace(definition,' if d.locked and p_command', E' if not d.active then raise exception \'This POS is archived. Ask the owner to restore it.\' using errcode=\'42501\'; end if;\n if d.locked and p_command');
 execute definition;
end $patch$;

-- Only the specifically requested, unused generated devices in this restaurant are archived.
-- Retain rows and recheck history after acquiring the same row lock as cashier commands.
do $cleanup$
declare d restaurant_pos_private.terminals;
begin
 for d in select * from restaurant_pos_private.terminals where restaurant_id='095e758e-84e8-4b12-b642-7af72bee0ddf' and branch_id='5c8cd92a-2b2a-4712-8ba6-fe3e8162ad81' and code ~ '^POS-(0[3-9]|10)$' for update loop
  if not exists(select 1 from restaurant_pos_private.orders where device_id=d.id) and not exists(select 1 from restaurant_pos_private.shifts where device_id=d.id) then
   update restaurant_pos_private.terminals set active=false,locked=true where id=d.id;
  end if;
 end loop;
end $cleanup$;
notify pgrst, 'reload schema';
