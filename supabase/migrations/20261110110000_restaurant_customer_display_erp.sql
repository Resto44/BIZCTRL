-- ERP restaurant cashier customer screen: do not reuse retail "shopping/scan" copy.
-- Existing 8-hour kiosk token and active shift checks remain unchanged.
-- Only the paired device's current order can be displayed.
create or replace function restaurant_pos_private.display(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  ds restaurant_pos_private.displays;
  d restaurant_pos_private.terminals;
  o restaurant_pos_private.orders;
  result jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid display link.' using errcode='42501';
  end if;
  select * into ds from restaurant_pos_private.displays x
  where x.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and x.expires_at>now();

  if ds.device_id is null or not exists(
    select 1 from restaurant_pos_private.shifts s
    where s.device_id=ds.device_id and s.closed_at is null
  ) then
    raise exception 'Display expired or disconnected.' using errcode='42501';
  end if;

  select * into d from restaurant_pos_private.terminals where id=ds.device_id;
  if d.id is null or not exists(
    select 1 from public.restaurants r
    where r.id=d.restaurant_id
      and lower(btrim(coalesce(nullif(r.business_type,''),r.business_mode::text,'')))
        in ('restaurant','cafe')
  ) then
    raise exception 'Restaurant display unavailable.' using errcode='42501';
  end if;

  select * into o from restaurant_pos_private.orders x
    where x.id=ds.order_id and x.device_id=d.id
      and x.status in ('open','held','paid');

  select jsonb_build_object(
     'business_name',r.name,'branch_name',b.name,
     'currency',coalesce(nullif(r.currency,''),'SAR'),
     'device_code',d.code,'topic',ds.topic,
     'status',o.status,'number',o.number,
     'kitchen_status',case when o.submitted_at is null then 'draft' else o.kitchen_status end,
     'order_type',o.order_type,'table_label',o.table_label,
     'submitted_at',o.submitted_at,'paid_at',o.paid_at,
     'lines',coalesce((select jsonb_agg(jsonb_build_object(
       'name',v.value->>'name',
       'name_en',v.value->>'name_en',
       'name_ar',v.value->>'name_ar',
       'name_fa',v.value->>'name_fa',
       'quantity',v.value->'quantity',
       'unit_price',v.value->'unit_price',
       'line_total',v.value->'line_total'
     )) from jsonb_array_elements(coalesce(o.lines,'[]'::jsonb)) as v(value)),'[]'::jsonb),
     'net_total',case when o.id is null then null else o.net_total end,
     'tax_total',case when o.id is null then null else o.tax_total end,
     'subtotal',case when o.id is null then null else o.subtotal end,
     'units',coalesce((select sum((v.value->>'quantity')::numeric)
       from jsonb_array_elements(coalesce(o.lines,'[]'::jsonb)) as v(value)),0),
     'server_time',now()
   ) into result
   from public.restaurants r join public.branches b on b.restaurant_id=r.id
   where r.id=d.restaurant_id and b.id=d.branch_id;
  return result;
end $$;

-- Notification only: never updates an order, invoices, or inventory.
-- Existing POS command already signals the customer screen for cashier actions;
-- this trigger closes the gap for kitchen-only stage transitions.
create or replace function restaurant_pos_private.notify_order_customer_display()
returns trigger language plpgsql security definer set search_path='' as $$
declare topic_record record;
begin
  if old.kitchen_status is not distinct from new.kitchen_status
     and old.status is not distinct from new.status then
    return new;
  end if;
  for topic_record in
    select ds.topic from restaurant_pos_private.displays ds
    where ds.device_id=new.device_id and ds.order_id=new.id and ds.expires_at>now()
  loop
    begin
      perform realtime.send('{}'::jsonb,'changed',
        'customer-display:'||topic_record.topic,false);
    exception when others then
      -- An optional kiosk refresh must never block a legitimate kitchen action.
      null;
    end;
  end loop;
  return new;
end $$;

drop trigger if exists restaurant_pos_customer_display_kitchen_changed
  on restaurant_pos_private.orders;
create trigger restaurant_pos_customer_display_kitchen_changed
 after update of kitchen_status,status on restaurant_pos_private.orders
 for each row execute function restaurant_pos_private.notify_order_customer_display();

revoke all on function restaurant_pos_private.notify_order_customer_display()
  from public,anon,authenticated;
-- Preserve original anonymous read allowlist of the hashed and expiring paired token.
revoke all on function restaurant_pos_private.display(text) from public,anon,authenticated;
grant execute on function restaurant_pos_private.display(text) to anon,authenticated;
notify pgrst,'reload schema';
