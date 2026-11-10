-- Customer Screen defaults to live KDS tickets, not the draft cart.
-- Language is owned by the kitchen branch screen and read through existing
-- hashed/expiring display tokens. No financial tables or stock mutations.
alter table restaurant_pos_private.displays
 add column if not exists display_mode text not null default 'kitchen'
 check (display_mode in ('kitchen','cart','pin'));
-- Preserve any explicitly selected pinned orders from the previous release.
update restaurant_pos_private.displays set display_mode='pin'
 where pinned_order_id is not null and display_mode='kitchen';

create table if not exists restaurant_pos_private.kitchen_screen_preferences (
 branch_id uuid primary key references public.branches(id),
 restaurant_id uuid not null references public.restaurants(id),
 language text not null default 'en' check (language in ('en','ar','fa')),
 changed_by uuid,
 updated_at timestamptz not null default now()
);
revoke all on restaurant_pos_private.kitchen_screen_preferences from public,anon,authenticated;
alter table restaurant_pos_private.kitchen_screen_preferences enable row level security;

-- Pairing a new customer device token cannot retain the previous customer order.
create or replace function restaurant_pos_private.reset_display_pin_on_repair()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.token_hash is distinct from old.token_hash then
   new.pinned_order_id:=null;
   new.display_mode:='kitchen';
 end if;
 return new;
end $$;

create or replace function restaurant_pos_private.kitchen_screen_language(
 p_restaurant_id uuid,p_branch_id uuid,p_language text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_changed boolean:=false;
 v_rows bigint:=0;
 signal_row record;
begin
 perform restaurant_pos_private.guard(p_restaurant_id,p_branch_id,'viewOrders');
 if p_language not in ('en','ar','fa') or p_language is null then
   raise exception 'Unsupported kitchen display language' using errcode='22023';
 end if;
 if not exists(select 1 from public.branches b
  where b.id=p_branch_id and b.restaurant_id=p_restaurant_id
    and coalesce(b.is_active,true)) then
   raise exception 'Branch not available' using errcode='42501';
 end if;
 insert into restaurant_pos_private.kitchen_screen_preferences(
   restaurant_id,branch_id,language,changed_by,updated_at
 ) values(p_restaurant_id,p_branch_id,p_language,auth.uid(),now())
 on conflict(branch_id) do update set
   language=excluded.language,changed_by=excluded.changed_by,
   updated_at=excluded.updated_at
 where restaurant_pos_private.kitchen_screen_preferences.language is distinct from excluded.language;
 get diagnostics v_rows=row_count;
 v_changed:=v_rows>0;
 if v_changed then
   -- Content-free signal; every viewer independently fetches its own scoped data.
   for signal_row in
     select ds.topic
     from restaurant_pos_private.displays ds
     join restaurant_pos_private.terminals d on d.id=ds.device_id
     where d.restaurant_id=p_restaurant_id and d.branch_id=p_branch_id
       and ds.expires_at>now()
   loop
     begin
       perform realtime.send('{}'::jsonb,'changed','customer-display:'||signal_row.topic,false);
     exception when others then null;
     end;
   end loop;
   for signal_row in
     select x.topic from restaurant_pos_private.customer_tracking_displays x
     where x.restaurant_id=p_restaurant_id and x.branch_id=p_branch_id and x.expires_at>now()
   loop
     begin
       perform realtime.send('{}'::jsonb,'changed','customer-tracking:'||signal_row.topic,false);
     exception when others then null;
     end;
   end loop;
 end if;
 return jsonb_build_object('language',p_language,'changed',v_changed);
end $$;
create or replace function public.erp_restaurant_kitchen_screen_language(
 p_restaurant_id uuid,p_branch_id uuid,p_language text
) returns jsonb language sql security invoker set search_path='' as $$
 select restaurant_pos_private.kitchen_screen_language(p_restaurant_id,p_branch_id,p_language)
$$;

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
 if p_action not in ('list','pin','cart','auto') then
   raise exception 'Unsupported screen selection.' using errcode='22023';
 end if;
 select * into ds from restaurant_pos_private.displays
  where device_id=d.id;
 if p_action in ('pin','cart','auto') then
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
      set pinned_order_id=case when p_action='pin' then o.id else null end,
          display_mode=case when p_action='pin' then 'pin'
                            when p_action='cart' then 'cart' else 'kitchen' end
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
   'display_mode',coalesce(ds.display_mode,'kitchen'),
   'effective_order_number',case when ds.expires_at>now() then
      (select x.number from restaurant_pos_private.orders x where x.id=
         case when ds.display_mode='pin' then ds.pinned_order_id
              when ds.display_mode='cart' then ds.order_id
              else (select k.id from restaurant_pos_private.orders k
                    where k.device_id=d.id and k.shift_id=s.id
                      and k.submitted_at is not null
                      and k.kitchen_status in ('queued','preparing','ready')
                      and k.status in ('open','held','paid')
                    order by k.submitted_at asc,k.id asc limit 1) end
         and x.device_id=d.id) else null end,
   'current_order_id',case when ds.expires_at>now() then ds.order_id else null end,
   'orders',candidates
 );
end $$;

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

  if ds.display_mode='pin' and ds.pinned_order_id is not null then
    select * into o from restaurant_pos_private.orders x
      where x.id=ds.pinned_order_id and x.device_id=d.id
        and x.status in ('open','held','paid');
  elsif ds.display_mode='cart' then
    select * into o from restaurant_pos_private.orders x
      where x.id=ds.order_id and x.device_id=d.id
        and x.status in ('open','held','paid');
  else
    -- Default: follow the oldest active kitchen ticket on this paired
    -- device AND the current open shift. Do not expose a new empty POS cart.
    select * into o from restaurant_pos_private.orders x
      join restaurant_pos_private.shifts s on s.id=x.shift_id
      where x.device_id=d.id and s.device_id=d.id and s.closed_at is null
        and x.submitted_at is not null
        and x.kitchen_status in ('queued','preparing','ready')
        and x.status in ('open','held','paid')
      order by x.submitted_at asc,x.id asc limit 1;
  end if;

  select jsonb_build_object(
     'business_name',r.name,'branch_name',b.name,
     'currency',coalesce(nullif(r.currency,''),'SAR'),
     'device_code',d.code,'topic',ds.topic,
     'display_mode',coalesce(ds.display_mode,'kitchen'),
     'kitchen_language',coalesce(
       (select p.language from restaurant_pos_private.kitchen_screen_preferences p
          where p.branch_id=d.branch_id and p.restaurant_id=d.restaurant_id),'en'),
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
     and (ds.order_id=new.id or ds.pinned_order_id=new.id or ds.display_mode='kitchen')
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

create or replace function restaurant_pos_private.customer_tracking_display(p_token text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  display_row restaurant_pos_private.customer_tracking_displays;
  brand text; location_name text;
  cnt_new int;cnt_preparing int;cnt_ready int;
  tickets jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    raise exception 'Customer tracking link invalid.' using errcode='42501';
  end if;
  select * into display_row
    from restaurant_pos_private.customer_tracking_displays x
    where x.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
      and x.expires_at>now();
  if display_row.branch_id is null then
    raise exception 'Customer tracking link expired or rotated.' using errcode='42501';
  end if;
  select r.name,b.name into brand,location_name
    from public.restaurants r join public.branches b on b.restaurant_id=r.id
    where r.id=display_row.restaurant_id and b.id=display_row.branch_id
      and coalesce(b.is_active,true)
      and lower(btrim(coalesce(nullif(r.business_type,''),r.business_mode::text,''))) in ('restaurant','cafe');
  if brand is null then
    raise exception 'Customer tracking display unavailable.' using errcode='42501';
  end if;
  -- Counts are exact; list is bounded (max 36 per lane) and never reveals
  -- customer identity, items, cashier device, receipt, payments or notes.
  select count(*) filter(where o.kitchen_status='queued')::int,
         count(*) filter(where o.kitchen_status='preparing')::int,
         count(*) filter(where o.kitchen_status='ready')::int
    into cnt_new,cnt_preparing,cnt_ready
    from restaurant_pos_private.orders o
    join restaurant_pos_private.terminals t on t.id=o.device_id
   where t.restaurant_id=display_row.restaurant_id
     and t.branch_id=display_row.branch_id
     and o.status<>'cancelled'
     and o.submitted_at is not null
     and o.kitchen_status in ('queued','preparing','ready');

  select coalesce(jsonb_agg(jsonb_build_object(
    'number',q.number,'stage',q.kitchen_status,'submitted_at',q.submitted_at)
    order by q.submitted_at,q.number),'[]'::jsonb)
    into tickets
  from (
    select o.number,o.kitchen_status,o.submitted_at,
       row_number() over(partition by o.kitchen_status order by o.submitted_at,o.id) as position
    from restaurant_pos_private.orders o
    join restaurant_pos_private.terminals t on t.id=o.device_id
    where t.restaurant_id=display_row.restaurant_id
      and t.branch_id=display_row.branch_id
      and o.status<>'cancelled'
      and o.submitted_at is not null
      and o.kitchen_status in ('queued','preparing','ready')
  ) q where q.position<=36;

  return jsonb_build_object(
    'business_name',brand,'branch_name',location_name,
    'kitchen_language',coalesce((select p.language from restaurant_pos_private.kitchen_screen_preferences p
      where p.restaurant_id=display_row.restaurant_id and p.branch_id=display_row.branch_id),'en'),
    'topic',display_row.topic,'expires_at',display_row.expires_at,
    'server_time',now(),
    'orders',tickets,
    'counts',jsonb_build_object('queued',cnt_new,'preparing',cnt_preparing,'ready',cnt_ready),
    'overflow',greatest(0,cnt_new+cnt_preparing+cnt_ready-jsonb_array_length(tickets))
  );
end $$;


revoke all on function restaurant_pos_private.kitchen_screen_language(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.erp_restaurant_kitchen_screen_language(uuid,uuid,text) from public,anon,authenticated;
grant execute on function restaurant_pos_private.kitchen_screen_language(uuid,uuid,text) to authenticated;
grant execute on function public.erp_restaurant_kitchen_screen_language(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
