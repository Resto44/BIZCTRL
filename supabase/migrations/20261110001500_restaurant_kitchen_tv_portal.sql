-- Kitchen TV / Kitchen Display System: secure read-only branch board.
-- The existing cashier send_kitchen, kitchen revision state machine, recipe deduction,
-- payment posting and events remain the sole source of truth.
-- No data backfill, deletion, financial writes, or public/anonymous access.
create or replace function restaurant_pos_private.kitchen_board(
  p_restaurant_id uuid, p_branch_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_branch_name text;
  v_count integer;
  v_orders jsonb;
begin
  if p_restaurant_id is null or p_branch_id is null then
    raise exception 'Choose an authorized kitchen branch.' using errcode='42501';
  end if;
  -- Existing guard validates authenticated approved ERP membership, active
  -- restaurant subscription, enabled branch and effective viewOrders permission.
  perform restaurant_pos_private.guard(p_restaurant_id,p_branch_id,'viewOrders');

  select b.name into v_branch_name from public.branches b
    where b.id=p_branch_id and b.restaurant_id=p_restaurant_id and coalesce(b.is_active,true);
  if v_branch_name is null then
    raise exception 'Kitchen branch unavailable.' using errcode='42501';
  end if;

  select count(*) into v_count
  from restaurant_pos_private.orders o
  join restaurant_pos_private.terminals d on d.id=o.device_id
  where d.restaurant_id=p_restaurant_id and d.branch_id=p_branch_id
    and o.kitchen_status in ('queued','preparing','ready') and o.status<>'cancelled';

  -- Return only preparation fields, no menu recipes, stock, payment amounts,
  -- cashier identities, receipt details or financial totals.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',v.id,
      'number',v.number,
      'revision',v.revision,
      'status',v.status,
      'kitchen_status',v.kitchen_status,
      'order_type',v.order_type,
      'table_label',v.table_label,
      'notes',v.notes,
      'submitted_at',v.submitted_at,
      'device_code',v.device_code,
      'lines',v.safe_lines
    ) order by v.submitted_at,v.id),'[]'::jsonb)
  into v_orders from (
    select o.id,o.number,o.revision,o.status,o.kitchen_status,o.order_type,
           o.table_label,o.notes,o.submitted_at,d.code as device_code,
           coalesce((select jsonb_agg(jsonb_build_object(
             'name',line.value->>'name',
             'name_ar',line.value->>'name_ar',
             'name_fa',line.value->>'name_fa',
             'quantity',line.value->'quantity',
             'station',line.value->>'station',
             'option_key',line.value->>'option_key'
           )) from jsonb_array_elements(o.lines) as line(value)),'[]'::jsonb) as safe_lines
    from restaurant_pos_private.orders o
    join restaurant_pos_private.terminals d on d.id=o.device_id
    where d.restaurant_id=p_restaurant_id and d.branch_id=p_branch_id
      and o.kitchen_status in ('queued','preparing','ready') and o.status<>'cancelled'
    order by o.submitted_at asc,o.id asc limit 200
  ) v;

  return jsonb_build_object(
    'branch_id',p_branch_id,
    'branch_name',v_branch_name,
    'orders',v_orders,
    'total_active',v_count,
    'overflow',greatest(0,v_count-200),
    'server_time',now()
  );
end
$$;

create or replace function public.erp_restaurant_pos_kitchen_board(
  p_restaurant_id uuid,p_branch_id uuid
) returns jsonb language sql security invoker set search_path='' as $$
  select restaurant_pos_private.kitchen_board(p_restaurant_id,p_branch_id)
$$;

-- Narrow RPC execute only, keep private tables and routines non-public.
revoke all on function restaurant_pos_private.kitchen_board(uuid,uuid) from public,anon,authenticated;
revoke all on function public.erp_restaurant_pos_kitchen_board(uuid,uuid) from public,anon,authenticated;
grant execute on function restaurant_pos_private.kitchen_board(uuid,uuid) to authenticated;
grant execute on function public.erp_restaurant_pos_kitchen_board(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
