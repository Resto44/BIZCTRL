-- Read-only authorized language preference for a specific Kitchen Display branch.
-- Crucially, opening a second Kitchen TV must never overwrite the branch
-- language with that device's saved browser UI language.
create or replace function restaurant_pos_private.kitchen_screen_language_get(
  p_restaurant_id uuid, p_branch_id uuid
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_lang text;
begin
  perform restaurant_pos_private.guard(p_restaurant_id,p_branch_id,'viewOrders');
  if not exists(select 1 from public.branches b
    where b.id=p_branch_id and b.restaurant_id=p_restaurant_id
      and coalesce(b.is_active,true)) then
    raise exception 'Branch not available' using errcode='42501';
  end if;
  select x.language into v_lang
    from restaurant_pos_private.kitchen_screen_preferences x
    where x.branch_id=p_branch_id and x.restaurant_id=p_restaurant_id;
  return jsonb_build_object('language',v_lang,'configured',v_lang is not null);
end $$;

create or replace function public.erp_restaurant_kitchen_screen_language_get(
  p_restaurant_id uuid, p_branch_id uuid
) returns jsonb language sql stable security invoker set search_path='' as $$
  select restaurant_pos_private.kitchen_screen_language_get(
    p_restaurant_id,p_branch_id)
$$;

revoke all on function restaurant_pos_private.kitchen_screen_language_get(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.erp_restaurant_kitchen_screen_language_get(uuid,uuid)
  from public,anon,authenticated;
grant execute on function restaurant_pos_private.kitchen_screen_language_get(uuid,uuid)
  to authenticated;
grant execute on function public.erp_restaurant_kitchen_screen_language_get(uuid,uuid)
  to authenticated;
notify pgrst,'reload schema';
