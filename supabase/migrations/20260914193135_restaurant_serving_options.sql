-- Each serving choice remains an independent priced menu item and recipe.
-- Grouping affects presentation only; the cashier still sends the selected menu ID.
alter table restaurant_pos_private.menu
 add column option_group text,
 add column option_key text,
 add constraint restaurant_menu_serving_choice check (
  (option_group is null and option_key is null) or
  (option_group is not null and option_key is not null and
   char_length(btrim(option_group)) between 1 and 80 and
   option_key in ('half_plain','half_rice','whole_plain','whole_rice','quarter_plain','quarter_rice'))
 );
create unique index restaurant_menu_serving_choice_unique
 on restaurant_pos_private.menu(restaurant_id,branch_id,option_group,option_key)
 where option_group is not null;

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
  insert into restaurant_pos_private.menu(id,restaurant_id,branch_id,product_id,name,name_ar,name_fa,category,station,image_url,price,tax_rate,stock_mode,recipe,active,option_group,option_key)
  values((p_payload->>'id')::uuid,p_restaurant_id,p_branch_id,p.id,coalesce(nullif(p_payload->>'name',''),p.name),coalesce(p_payload->>'name_ar',p.name_ar),coalesce(p_payload->>'name_fa',p.name_fa),
   coalesce(nullif(p_payload->>'category',''),'Food'),coalesce(nullif(p_payload->>'station',''),'Kitchen'),coalesce(nullif(p_payload->>'image_url',''),p.image_url),(p_payload->>'price')::numeric,(p_payload->>'tax_rate')::numeric,p_payload->>'stock_mode',recipe,coalesce((p_payload->>'active')::boolean,true),
   case when p_payload ? 'option_group' then nullif(btrim(p_payload->>'option_group'),'') else m.option_group end,
   case when p_payload ? 'option_key' then nullif(p_payload->>'option_key','') else m.option_key end)
  on conflict(id) do update set name=excluded.name,name_ar=excluded.name_ar,name_fa=excluded.name_fa,image_url=excluded.image_url,category=excluded.category,station=excluded.station,price=excluded.price,tax_rate=excluded.tax_rate,stock_mode=excluded.stock_mode,recipe=excluded.recipe,active=excluded.active,option_group=excluded.option_group,option_key=excluded.option_key,updated_at=now();
 else raise exception 'Unknown setup action.' using errcode='22023'; end if;
 perform realtime.send('{}'::jsonb,'changed','restaurant-pos:'||p_restaurant_id,false);
 return jsonb_build_object('ok',true);
end $$;
notify pgrst, 'reload schema';
