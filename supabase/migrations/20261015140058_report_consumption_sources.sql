-- Read-only normalized report source; private POS tables remain unexposed.
create schema if not exists erp_report_private;
revoke all on schema erp_report_private from public, anon;
grant usage on schema erp_report_private to authenticated;
create or replace function erp_report_private.stock_consumption(p_restaurant_id uuid,p_branch_id uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; zone text;
begin
 if auth.uid() is null or not public.erp_can_access_scope_text(p_restaurant_id::text,p_branch_id::text)
 or not exists(select 1 from public.erp_memberships m where m.user_id=auth.uid() and m.restaurant_id=p_restaurant_id and m.status='approved' and m.role in ('owner','manager'))
 or (p_branch_id is not null and not exists(select 1 from public.branches where id=p_branch_id and restaurant_id=p_restaurant_id)) then
  raise exception 'REPORT_SCOPE_DENIED' using errcode='42501';
 end if;
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>3660 then raise exception 'INVALID_REPORT_PERIOD'; end if;
 select case when exists(select 1 from pg_timezone_names z where z.name=r.timezone) then r.timezone else 'Asia/Riyadh' end into zone from public.restaurants r where r.id=p_restaurant_id;
 with pos as (
  select 'pos:'||c.order_id||':'||c.inventory_id id,i.product_id::text product_id,i.product_name,
   c.quantity,c.unit_cost,c.unit,case when c.wasted then 'waste' else 'recipe_consumption' end transaction_type,
   (c.created_at at time zone zone)::date::text created_date,t.branch_id,c.order_id reference_id
  from restaurant_pos_private.consumption c join restaurant_pos_private.orders o on o.id=c.order_id
  join restaurant_pos_private.terminals t on t.id=o.device_id join public.inventory i on i.id=c.inventory_id and i.restaurant_id=p_restaurant_id
  where t.restaurant_id=p_restaurant_id and (p_branch_id is null or t.branch_id=p_branch_id)
  and (c.created_at at time zone zone)::date between p_from and p_to
 ), retail as (
  select 'retail:'||l.id id,l.product_id::text product_id,p.name product_name,-l.quantity quantity,l.unit_cost,p.unit,
   case when l.quantity>0 then 'consumption_return' else 'sale' end transaction_type,
   (l.created_at at time zone zone)::date::text created_date,l.branch_id,l.reference_id
  from public.retail_inventory_ledger l left join public.products p on p.id=l.product_id and p.restaurant_id=p_restaurant_id
  where l.restaurant_id=p_restaurant_id and (p_branch_id is null or l.branch_id=p_branch_id)
   and l.kind in ('pos_sale','pos_return','pos_refund','pos_void') and (l.created_at at time zone zone)::date between p_from and p_to
 ), logs as (
  select 'log:'||l.id id,coalesce(l.ingredient_id,l.product_id)::text product_id,p.name product_name,
   l.quantity_consumed quantity,null::numeric unit_cost,coalesce(nullif(l.unit,''),p.unit) unit,
   case when l.consumption_type='waste' then 'waste'
     when l.business_mode::text='retail' and l.consumption_type='sale' then 'sale'
     else 'consumption' end transaction_type,(l.created_date at time zone zone)::date::text created_date,l.branch_id,l.sale_id reference_id
  from public.inventory_consumption_log l left join public.products p on p.id=coalesce(l.ingredient_id,l.product_id) and p.restaurant_id=p_restaurant_id
  where l.restaurant_id=p_restaurant_id and (p_branch_id is null or l.branch_id=p_branch_id)
   and l.consumption_type in ('sale','waste','production')
   and (l.created_date at time zone zone)::date between p_from and p_to
   and not exists(select 1 from retail where reference_id in (l.sale_id,l.sale_line_id) and product_id=coalesce(l.ingredient_id,l.product_id)::text)
   and not exists(select 1 from pos where reference_id=l.sale_id and product_id=coalesce(l.ingredient_id,l.product_id)::text)
 ), legacy as (
  select 'legacy:'||t.id id,t.product_id::text product_id,p.name product_name,t.quantity,t.unit_cost,p.unit,t.transaction_type,
   (t.created_date at time zone zone)::date::text created_date,t.branch_id,t.reference_id
  from public.inventory_transactions t left join public.products p on p.id=t.product_id and p.restaurant_id=p_restaurant_id
  where t.restaurant_id=p_restaurant_id and (p_branch_id is null or t.branch_id=p_branch_id)
   and (t.created_date at time zone zone)::date between p_from and p_to
   and t.transaction_type in ('recipe_consumption','consumption','sale','usage','ingredient_usage','production_consumption','stock_out','waste')
   and not exists(select 1 from pos where reference_id=t.reference_id and product_id=t.product_id::text)
   and not exists(select 1 from logs where reference_id=t.reference_id and product_id=t.product_id::text)
   and not exists(select 1 from retail where reference_id=t.reference_id and product_id=t.product_id::text)
 ), combined as (select * from pos union all select * from logs union all select * from retail union all select * from legacy)
 select coalesce(jsonb_agg(to_jsonb(c) order by created_date,id),'[]'::jsonb) into result from (select * from combined limit 50001)c;
 if jsonb_array_length(result)>50000 then raise exception 'REPORT_ROW_LIMIT'; end if;
 return result;
end $$;
revoke all on function erp_report_private.stock_consumption(uuid,uuid,date,date) from public,anon;
grant execute on function erp_report_private.stock_consumption(uuid,uuid,date,date) to authenticated;
create or replace function public.erp_report_stock_consumption(p_restaurant_id uuid,p_branch_id uuid,p_from date,p_to date)
returns jsonb language sql stable security invoker set search_path='' as $$
 select erp_report_private.stock_consumption(p_restaurant_id,p_branch_id,p_from,p_to)
$$;
revoke all on function public.erp_report_stock_consumption(uuid,uuid,date,date) from public,anon;
grant execute on function public.erp_report_stock_consumption(uuid,uuid,date,date) to authenticated;
