-- Restaurant Customer Screen follow mode for the specifically selected kitchen order.
-- New cart creation may change displays.order_id, but NEVER overrides the
-- explicitly followed kitchen order. This is a UI-only choice (no sales or stock changes).
alter table restaurant_pos_private.displays
  add column if not exists pinned_order_id uuid null;

-- Re-pairing must always clear any prior/customer's pinned order.
create or replace function restaurant_pos_private.reset_display_pin_on_repair()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.token_hash is distinct from old.token_hash then
    new.pinned_order_id:=null;
  end if;
  return new;
end $$;
drop trigger if exists restaurant_display_reset_pin_on_repair
  on restaurant_pos_private.displays;
create trigger restaurant_display_reset_pin_on_repair
  before update of token_hash on restaurant_pos_private.displays
  for each row execute function restaurant_pos_private.reset_display_pin_on_repair();

create or replace function restaurant_pos_private.display_focus(
  p_device_id uuid, p_action text, p_order_id uuid default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 d restaurant_pos_private.terminals;
 s restaurant_pos_private.shifts;
 ds restaurant_pos_private.displays;
 o restaurant_pos_private.orders;
 candidates jsonb:='[]'::jsonb;
begin
 if p_device_id is null then
   raise exception 'Choose an authorized cashier device.' using errcode='42501';
 end if;
 select * into d from restaurant_pos_private.terminals where id=p_device_id;
 if d.id is null then raise exception 'Device unavailable.' using errcode='42501';end if;
 perform restaurant_pos_private.guard(d.restaurant_id,d.branch_id,'viewSales');
 perform restaurant_pos_private.guard(d.restaurant_id,d.branch_id,'uploadSales');
 select * into s from restaurant_pos_private.shifts
  where device_id=d.id and closed_at is null;
 if s.id is null then raise exception 'Open a cashier shift first.' using errcode='23514';end if;
 if s.cashier_id is distinct from auth.uid()
    and not public.erp_can_write_scope(d.restaurant_id,d.branch_id) then
   raise exception 'This POS has another cashier on duty.' using errcode='42501';
 end if;
 if p_action not in ('list','pin','cart') then
   raise exception 'Unsupported screen selection.' using errcode='22023';
 end if;
 select * into ds from restaurant_pos_private.displays
  where device_id=d.id;
 if p_action in ('pin','cart') then
   if ds.device_id is null or ds.expires_at<=now() then
     raise exception 'Pair an active customer screen first.' using errcode='23514';
   end if;
   if p_action='pin' then
     if p_order_id is null then
       raise exception 'Choose one active kitchen order.' using errcode='22023';
     end if;
     select * into o from restaurant_pos_private.orders x
     where x.id=p_order_id and x.device_id=d.id and x.shift_id=s.id
       and x.submitted_at is not null
       and x.kitchen_status in ('queued','preparing','ready')
       and x.status in ('held','open','paid');
     if o.id is null then
       raise exception 'Kitchen order is not available on this cashier device and shift.' using errcode='42501';
     end if;
   end if;
   update restaurant_pos_private.displays
      set pinned_order_id=case when p_action='pin' then o.id else null end
    where device_id=d.id
    returning * into ds;
   begin
     perform realtime.send('{}'::jsonb,'changed','customer-display:'||ds.topic,false);
   exception when others then null;
   end;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',a.id,'number',a.number,'kitchen_status',a.kitchen_status,
   'order_type',a.order_type,'status',a.status) order by a.submitted_at desc,a.id desc),
   '[]'::jsonb)
 into candidates
 from (select x.id,x.number,x.kitchen_status,x.order_type,x.status,x.submitted_at
   from restaurant_pos_private.orders x
   where x.device_id=d.id and x.shift_id=s.id
     and x.submitted_at is not null
     and x.kitchen_status in ('queued','preparing','ready')
     and x.status in ('held','open','paid')
   order by x.submitted_at desc,x.id desc limit 30) a;
 return jsonb_build_object(
   'paired',ds.device_id is not null and ds.expires_at>now(),
   'pinned_order_id',case when ds.expires_at>now() then ds.pinned_order_id else null end,
   'pinned_order_number',case when ds.expires_at>now() then (select x.number from restaurant_pos_private.orders x where x.id=ds.pinned_order_id and x.device_id=d.id) else null end,
   'current_order_id',case when ds.expires_at>now() then ds.order_id else null end,
   'orders',candidates
 );
end $$;
create or replace function public.erp_restaurant_pos_display_focus(
  p_device_id uuid,p_action text,p_order_id uuid default null
) returns jsonb language sql security invoker set search_path='' as $$
  select restaurant_pos_private.display_focus(p_device_id,p_action,p_order_id)
$$;

-- Keep pairing as a per-device, hashed, expiring token. Screen reads only
-- its explicitly pinned order when set, otherwise the current cashier cart.
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
    where x.id=coalesce(ds.pinned_order_id,ds.order_id) and x.device_id=d.id
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

-- Kitchen-only state changes should also notify screens following a pin.
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
   where ds.device_id=new.device_id
     and (ds.order_id=new.id or ds.pinned_order_id=new.id)
     and ds.expires_at>now()
 loop
   begin
     perform realtime.send('{}'::jsonb,'changed',
       'customer-display:'||topic_record.topic,false);
   exception when others then null;
   end;
 end loop;
 return new;
end $$;

revoke all on function restaurant_pos_private.display_focus(uuid,text,uuid)
  from public,anon,authenticated;
revoke all on function public.erp_restaurant_pos_display_focus(uuid,text,uuid)
  from public,anon,authenticated;
revoke all on function restaurant_pos_private.reset_display_pin_on_repair()
  from public,anon,authenticated;
grant execute on function restaurant_pos_private.display_focus(uuid,text,uuid)
  to authenticated;
grant execute on function public.erp_restaurant_pos_display_focus(uuid,text,uuid)
  to authenticated;
notify pgrst,'reload schema';
