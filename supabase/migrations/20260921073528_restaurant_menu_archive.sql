-- Preserve invoice history and recipe/price fields when removing menu foods.
do $migration$
declare definition text; marker text := ' if p_command=''category_list'' then';
begin
 select pg_get_functiondef('restaurant_pos_private.setup(uuid,uuid,text,jsonb)'::regprocedure) into definition;
 if position(marker in definition)=0 or position('p_command=''menu_archive''' in definition)>0 then raise exception 'Unexpected setup definition; review archive migration.'; end if;
 definition:=replace(definition,marker,$block$
 if p_command='menu_archive' then
  if jsonb_typeof(p_payload->'ids') is distinct from 'array' or jsonb_array_length(p_payload->'ids') not between 1 and 5000 then raise exception 'Select 1–5000 foods.' using errcode='23514'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_payload->'ids') ids(id) where not exists(select 1 from restaurant_pos_private.menu archive_food where archive_food.id=ids.id::uuid and archive_food.restaurant_id=p_restaurant_id and archive_food.branch_id=p_branch_id)) then raise exception 'Food scope mismatch.' using errcode='42501'; end if;
  update restaurant_pos_private.menu set active=false,updated_at=now() where restaurant_id=p_restaurant_id and branch_id=p_branch_id and id in(select value::uuid from jsonb_array_elements_text(p_payload->'ids'));
  perform realtime.send('{}'::jsonb,'changed','restaurant-pos:'||p_restaurant_id,false);
  return jsonb_build_object('ok',true);
 end if;
 if p_command='category_list' then
$block$);
 execute definition;
end $migration$;
