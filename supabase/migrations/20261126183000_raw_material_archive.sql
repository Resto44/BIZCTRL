-- Reversible removal from the active material catalog. Never delete product or history.
create or replace function public.erp_set_raw_material_archived(p_restaurant_id uuid,p_ids uuid[],p_archived boolean)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare wanted integer; changed integer;
begin
 if auth.uid() is null or public.erp_current_role() is distinct from 'owner' or not coalesce(public.erp_can_write_module_scope_text(p_restaurant_id::text,null,'updateInventory'),false) then raise exception 'Access denied' using errcode='42501';end if;
 if p_archived is null or coalesce(cardinality(p_ids),0) not between 1 and 5000 then raise exception 'Select 1 to 5000 products';end if;
 select count(distinct id) into wanted from unnest(p_ids) t(id);
 if wanted<>cardinality(p_ids) then raise exception 'Invalid or duplicate product IDs';end if;
 update public.products set is_active=not p_archived,status=case when p_archived then 'inactive' else 'active' end
 where restaurant_id=p_restaurant_id and restaurant_product_type='raw_material' and id=any(p_ids)
 and (case when p_archived then coalesce(is_active,true) and coalesce(status,'active') not in ('inactive','discontinued') else status='inactive' and is_active=false end);
 get diagnostics changed=row_count;
 if changed<>wanted then raise exception 'Selection changed or is not authorized. Refresh and try again';end if;
 return changed;
end $$;
revoke all on function public.erp_set_raw_material_archived(uuid,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.erp_set_raw_material_archived(uuid,uuid[],boolean) to authenticated;
