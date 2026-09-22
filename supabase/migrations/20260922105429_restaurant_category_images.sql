-- Optional category artwork, retaining existing tenant/branch guards and grants.
alter table restaurant_pos_private.categories add column image_url text;
alter table restaurant_pos_private.categories add constraint restaurant_category_image_url check (
 image_url is null or (char_length(image_url)<=2048 and image_url ~ '^https://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$')
);

-- Change only the category save branch of the current setup function, preserving
-- subsequent device, archive, recipe and custom-option fixes. Fail on schema drift.
do $migration$
declare definition text; old_block text; new_block text; signature text;
begin
 select pg_get_functiondef('restaurant_pos_private.setup(uuid,uuid,text,jsonb)'::regprocedure) into definition;
 old_block:=$old$  insert into restaurant_pos_private.categories as target(id,restaurant_id,branch_id,name,name_ar,name_fa,is_active,sort_order)
  values((p_payload->>'id')::uuid,p_restaurant_id,p_branch_id,btrim(p_payload->>'name'),nullif(btrim(p_payload->>'name_ar'),''),nullif(btrim(p_payload->>'name_fa'),''),coalesce((p_payload->>'is_active')::boolean,true),coalesce((p_payload->>'sort_order')::integer,0))
  on conflict(id) do update set name=excluded.name,name_ar=excluded.name_ar,name_fa=excluded.name_fa,is_active=excluded.is_active,sort_order=excluded.sort_order,updated_at=now()$old$;
 new_block:=$new$  if nullif(btrim(p_payload->>'image_url'),'') is not null and
     (char_length(btrim(p_payload->>'image_url'))>2048 or btrim(p_payload->>'image_url') !~ '^https://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$') then
   raise exception 'Enter a valid HTTPS category image URL (up to 2048 characters).' using errcode='23514';
  end if;
  insert into restaurant_pos_private.categories as target(id,restaurant_id,branch_id,name,name_ar,name_fa,is_active,sort_order,image_url)
  values((p_payload->>'id')::uuid,p_restaurant_id,p_branch_id,btrim(p_payload->>'name'),nullif(btrim(p_payload->>'name_ar'),''),nullif(btrim(p_payload->>'name_fa'),''),coalesce((p_payload->>'is_active')::boolean,true),coalesce((p_payload->>'sort_order')::integer,0),nullif(btrim(p_payload->>'image_url'),''))
  on conflict(id) do update set name=excluded.name,name_ar=excluded.name_ar,name_fa=excluded.name_fa,is_active=excluded.is_active,sort_order=excluded.sort_order,image_url=case when p_payload ? 'image_url' then excluded.image_url else target.image_url end,updated_at=now()$new$;
 if strpos(definition,old_block)=0 then raise exception 'Category save function changed; inspect before applying.'; end if;
 execute replace(definition,old_block,new_block);
 foreach signature in array array['restaurant_pos_private.catalog(uuid,uuid,text)','restaurant_pos_private.workspace(uuid,uuid,date)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  old_block:=$old$'category_fa',c.name_fa$old$;
  new_block:=$new$'category_fa',c.name_fa,'category_image_url',c.image_url$new$;
  if strpos(definition,old_block)=0 then raise exception 'Category projection changed: %',signature;end if;
  execute replace(definition,old_block,new_block);
 end loop;
end $migration$;
notify pgrst, 'reload schema';
