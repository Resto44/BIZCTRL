-- Branch-scoped public pickup TV, independent from cashier shifts and employee login.
-- It displays only anonymous ticket numbers/stages that are already in the Kitchen workflow.
-- Every token rotates; it is never stored in plaintext; no sales or inventory data is written.
create table if not exists restaurant_pos_private.customer_tracking_displays (
  branch_id uuid primary key references public.branches(id),
  restaurant_id uuid not null references public.restaurants(id),
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  topic uuid not null default gen_random_uuid(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
revoke all on restaurant_pos_private.customer_tracking_displays from public,anon,authenticated;
create index if not exists restaurant_customer_tracking_expires
  on restaurant_pos_private.customer_tracking_displays(expires_at);

create or replace function restaurant_pos_private.customer_tracking_manage(
  p_restaurant_id uuid,p_branch_id uuid,p_action text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tok text; expiry timestamptz;
begin
  -- Owner / Manager only; no cashier shift and no Owner credential on TV.
  perform restaurant_pos_private.guard(p_restaurant_id,p_branch_id,'viewOrders',true);
  if p_action='revoke' then
    delete from restaurant_pos_private.customer_tracking_displays
      where restaurant_id=p_restaurant_id and branch_id=p_branch_id;
    return jsonb_build_object('revoked',true);
  end if;
  if p_action <> 'pair' then
    raise exception 'Invalid customer TV action' using errcode='22023';
  end if;
  tok:=encode(extensions.gen_random_bytes(32),'hex');
  expiry:=now()+interval '8 hours';
  insert into restaurant_pos_private.customer_tracking_displays(
    branch_id,restaurant_id,token_hash,topic,expires_at,updated_at)
  values(p_branch_id,p_restaurant_id,encode(extensions.digest(tok,'sha256'),'hex'),
    gen_random_uuid(),expiry,now())
  on conflict(branch_id) do update set
    restaurant_id=excluded.restaurant_id,
    token_hash=excluded.token_hash,topic=excluded.topic,
    expires_at=excluded.expires_at,updated_at=now();
  return jsonb_build_object('token',tok,'expires_at',expiry);
end $$;

create or replace function public.erp_restaurant_customer_tracking_manage(
  p_restaurant_id uuid,p_branch_id uuid,p_action text
) returns jsonb language sql security invoker set search_path='' as $$
  select restaurant_pos_private.customer_tracking_manage(p_restaurant_id,p_branch_id,p_action)
$$;

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
    'topic',display_row.topic,'expires_at',display_row.expires_at,
    'server_time',now(),
    'orders',tickets,
    'counts',jsonb_build_object('queued',cnt_new,'preparing',cnt_preparing,'ready',cnt_ready),
    'overflow',greatest(0,cnt_new+cnt_preparing+cnt_ready-jsonb_array_length(tickets))
  );
end $$;

create or replace function public.erp_restaurant_customer_tracking_display(p_token text)
returns jsonb language sql security invoker set search_path='' as $$
  select restaurant_pos_private.customer_tracking_display(p_token)
$$;

-- Realtime is only a content-free change ping. The TV always fetches again
-- through the hashed 8-hour token and independently falls back to polling.
create or replace function restaurant_pos_private.notify_customer_tracking()
returns trigger language plpgsql security definer set search_path='' as $$
declare ticket_branch uuid; rec record;
begin
 if tg_op='UPDATE' and old.kitchen_status is not distinct from new.kitchen_status
     and old.status is not distinct from new.status
     and old.submitted_at is not distinct from new.submitted_at
 then return new; end if;
 select branch_id into ticket_branch from restaurant_pos_private.terminals
   where id=new.device_id;
 for rec in select topic from restaurant_pos_private.customer_tracking_displays
   where branch_id=ticket_branch and expires_at>now()
 loop
   begin
     perform realtime.send('{}'::jsonb,'changed','customer-tracking:'||rec.topic,false);
   exception when others then
     -- Optional notification must never block kitchen status or POS checkout.
     null;
   end;
 end loop;
 return new;
end $$;

drop trigger if exists restaurant_customer_tracking_changed
  on restaurant_pos_private.orders;
create trigger restaurant_customer_tracking_changed
  after insert or update of kitchen_status,status,submitted_at
  on restaurant_pos_private.orders
  for each row execute function restaurant_pos_private.notify_customer_tracking();

revoke all on function restaurant_pos_private.customer_tracking_manage(uuid,uuid,text) from public,anon,authenticated;
revoke all on function restaurant_pos_private.customer_tracking_display(text) from public,anon,authenticated;
revoke all on function restaurant_pos_private.notify_customer_tracking() from public,anon,authenticated;
revoke all on function public.erp_restaurant_customer_tracking_manage(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.erp_restaurant_customer_tracking_display(text) from public,anon,authenticated;
grant execute on function restaurant_pos_private.customer_tracking_manage(uuid,uuid,text) to authenticated;
grant execute on function public.erp_restaurant_customer_tracking_manage(uuid,uuid,text) to authenticated;
grant execute on function restaurant_pos_private.customer_tracking_display(text) to anon,authenticated;
grant execute on function public.erp_restaurant_customer_tracking_display(text) to anon,authenticated;
notify pgrst,'reload schema';
