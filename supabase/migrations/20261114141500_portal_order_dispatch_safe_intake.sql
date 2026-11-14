-- ERP portal order intake (driver, employee, manager, supplier, customer, owner).
-- Non-posting requests only. The existing POS alone posts sales, taxes, stock and payments.
-- Defaults OFF for every portal; an approved Owner chooses recipients per role.
create schema if not exists portal_order_private;
revoke all on schema portal_order_private from public, anon, authenticated;

create table if not exists portal_order_private.route_settings (
 restaurant_id uuid not null references public.restaurants(id),
 role text not null check(role in ('driver','employee','manager','supplier','customer','owner')),
 allow_manager boolean not null default false,
 allow_kitchen boolean not null default false,
 updated_by uuid,
 updated_at timestamptz not null default now(),
 primary key(restaurant_id,role)
);
create table if not exists portal_order_private.intake (
 id uuid primary key,
 restaurant_id uuid not null references public.restaurants(id),
 branch_id uuid not null references public.branches(id),
 actor_id uuid not null,
 actor_role text not null check(actor_role in ('driver','employee','manager','supplier','customer','owner')),
 driver_id uuid references public.drivers(id),
 recipient text not null check(recipient in ('manager','kitchen')),
 status text not null check(status in ('awaiting_manager','queued','preparing','ready','accepted','completed','rejected','cancelled')),
 order_kind text not null check(order_kind in ('restaurant','other')),
 customer_reference text not null default '' check(length(customer_reference)<=100),
 notes text not null default '' check(length(notes)<=500),
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 25),
 total_quote numeric(16,2) not null check(total_quote between 0 and 1000000),
 request_hash text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 reviewed_by uuid,
 reviewed_at timestamptz
);
create index if not exists portal_order_intake_branch_status
 on portal_order_private.intake(restaurant_id,branch_id,status,created_at desc);
create index if not exists portal_order_intake_actor
 on portal_order_private.intake(actor_id,created_at desc);
alter table portal_order_private.route_settings enable row level security;
alter table portal_order_private.intake enable row level security;
revoke all on all tables in schema portal_order_private from public,anon,authenticated;
-- No direct table or schema access for browser roles. Narrow public RPCs authorize every call.

create or replace function portal_order_private.membership(p_restaurant_id uuid default null)
returns public.erp_memberships language plpgsql stable security definer
set search_path='' as $$
declare m public.erp_memberships;
begin
 if auth.uid() is null then raise exception 'LOGIN_REQUIRED' using errcode='42501'; end if;
 select * into m from public.erp_memberships x
 where x.user_id=auth.uid() and x.status='approved'
   and (p_restaurant_id is null or x.restaurant_id=p_restaurant_id)
 order by x.updated_at desc nulls last limit 1;
 if m.id is null or m.restaurant_id is null or
    not public.erp_subscription_has_erp_access(m.restaurant_id) then
   raise exception 'APPROVED_PORTAL_MEMBERSHIP_REQUIRED' using errcode='42501';
 end if;
 if m.role not in ('driver','employee','manager','supplier','customer','owner') then
   raise exception 'PORTAL_ROLE_UNSUPPORTED' using errcode='42501';
 end if;
 if m.role='driver' and (m.linked_entity_id is null or
    not exists(select 1 from public.drivers d where d.id=m.linked_entity_id
       and d.restaurant_id=m.restaurant_id and d.branch_id=m.branch_id
       and coalesce(d.is_active,true))) then
   raise exception 'ACTIVE_LINKED_DRIVER_REQUIRED' using errcode='42501';
 end if;
 return m;
end $$;

create or replace function portal_order_private.branch_for(m public.erp_memberships,p_branch_id uuid default null)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare b uuid;
begin
 b:=case when m.role='owner' or (m.role in ('supplier','customer') and m.branch_id is null) then
    coalesce(p_branch_id,m.branch_id,
      (select id from public.branches where restaurant_id=m.restaurant_id and coalesce(is_active,true) order by name,id limit 1))
   else m.branch_id end;
 if b is null or (p_branch_id is not null and b<>p_branch_id) or
  not exists(select 1 from public.branches where id=b and restaurant_id=m.restaurant_id and coalesce(is_active,true)) then
   raise exception 'AUTHORIZED_ACTIVE_BRANCH_REQUIRED' using errcode='42501';
 end if;
 return b;
end $$;

create or replace function portal_order_private.restaurant_kind(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.restaurants r where r.id=p_restaurant_id
  and lower(btrim(coalesce(nullif(r.business_type,''),r.business_mode::text,''))) in ('restaurant','cafe'))
$$;

create or replace function public.erp_portal_order_context(
 p_restaurant_id uuid default null,p_branch_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.erp_memberships; b uuid; kitchen boolean; config portal_order_private.route_settings;
 v_catalog jsonb := '[]'::jsonb; v_requests jsonb := '[]'::jsonb; v_roles jsonb := '[]'::jsonb;
begin
 m:=portal_order_private.membership(p_restaurant_id);
 b:=portal_order_private.branch_for(m,p_branch_id);
 kitchen:=portal_order_private.restaurant_kind(m.restaurant_id);
 select * into config from portal_order_private.route_settings where restaurant_id=m.restaurant_id and role=m.role;
 if coalesce(config.allow_manager,false) or (kitchen and coalesce(config.allow_kitchen,false)) then
  if kitchen then
   select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'name_ar',v.name_ar,
     'name_fa',v.name_fa,'station',v.station,'price',v.price) order by v.name),'[]'::jsonb)
   into v_catalog
   from (select q.id,q.name,q.name_ar,q.name_fa,q.station,q.price
     from restaurant_pos_private.menu q where q.restaurant_id=m.restaurant_id and q.branch_id=b
       and q.active order by q.name,q.id limit 250) v;
  else
   select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'name_ar',v.name_ar,
     'name_fa',v.name_fa,'price',v.price) order by v.name),'[]'::jsonb)
   into v_catalog
   from (select p.id,p.name,p.name_ar,p.name_fa,
    greatest(0,coalesce(p.selling_price,p.default_price,0))::numeric(16,2) as price
    from public.products p where p.restaurant_id=m.restaurant_id
      and (p.branch_id=b or p.branch_id is null) and coalesce(p.is_active,true)
    order by p.name,p.id limit 250) v;
  end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'recipient',v.recipient,'status',v.status,
   'items',v.items,'total_quote',v.total_quote,'customer_reference',v.customer_reference,
   'created_at',v.created_at,'notes',v.notes) order by v.created_at desc),'[]'::jsonb)
 into v_requests from (select id,recipient,status,items,total_quote,customer_reference,created_at,notes
   from portal_order_private.intake where actor_id=auth.uid()
   and restaurant_id=m.restaurant_id and branch_id=b
   order by created_at desc limit 40) v;
 if m.role='owner' then
   select coalesce(jsonb_agg(jsonb_build_object('role',roles.role,
     'allow_manager',coalesce(s.allow_manager,false),
     'allow_kitchen',coalesce(s.allow_kitchen,false)) order by roles.role),'[]'::jsonb)
   into v_roles from (select unnest(array['driver','employee','manager','supplier','customer','owner']) role) roles
   left join portal_order_private.route_settings s on s.restaurant_id=m.restaurant_id and s.role=roles.role;
 end if;
 return jsonb_build_object('role',m.role,'restaurant_id',m.restaurant_id,'branch_id',b,
  'branch_name',(select name from public.branches where id=b),'restaurant_mode',kitchen,
  'allow_manager',coalesce(config.allow_manager,false),
  'allow_kitchen',kitchen and coalesce(config.allow_kitchen,false),
  'catalog',v_catalog,'my_requests',v_requests,'role_settings',v_roles,
  'posting_mode','NON_POSTING_REQUEST_ONLY');
end $$;

create or replace function public.erp_portal_order_configure(
 p_restaurant_id uuid,p_role text,p_allow_manager boolean,p_allow_kitchen boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.erp_memberships; k boolean;
begin
 m:=portal_order_private.membership(p_restaurant_id);
 if m.role<>'owner' then raise exception 'OWNER_ONLY_SETTING' using errcode='42501'; end if;
 if p_role not in ('driver','employee','manager','supplier','customer','owner')
    or p_allow_manager is null or p_allow_kitchen is null then
    raise exception 'INVALID_ROUTE_SETTING' using errcode='22023';
 end if;
 k:=portal_order_private.restaurant_kind(m.restaurant_id);
 if p_allow_kitchen and not k then raise exception 'KITCHEN_ONLY_FOR_RESTAURANT' using errcode='22023'; end if;
 insert into portal_order_private.route_settings(restaurant_id,role,allow_manager,allow_kitchen,updated_by)
 values(m.restaurant_id,p_role,p_allow_manager,p_allow_kitchen,auth.uid())
 on conflict(restaurant_id,role) do update set allow_manager=excluded.allow_manager,
  allow_kitchen=excluded.allow_kitchen,updated_by=auth.uid(),updated_at=now();
 return jsonb_build_object('role',p_role,'allow_manager',p_allow_manager,'allow_kitchen',p_allow_kitchen);
end $$;

create or replace function public.erp_portal_order_submit(
 p_restaurant_id uuid,p_branch_id uuid,p_request_id uuid,p_recipient text,
 p_items jsonb,p_customer_reference text default '',p_notes text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.erp_memberships; b uuid; c portal_order_private.route_settings;
 k boolean; item jsonb; menu restaurant_pos_private.menu; product public.products;
 valid_items jsonb := '[]'::jsonb; n integer:=0; qty integer; total numeric(16,2):=0;
 line_total numeric(16,2); unit_price numeric(16,2); label text; item_id uuid;
 request_digest text; prev portal_order_private.intake;
begin
 m:=portal_order_private.membership(p_restaurant_id);
 b:=portal_order_private.branch_for(m,p_branch_id);
 k:=portal_order_private.restaurant_kind(m.restaurant_id);
 select * into c from portal_order_private.route_settings where restaurant_id=m.restaurant_id and role=m.role;
 if p_request_id is null or p_recipient not in ('manager','kitchen')
    or (p_recipient='manager' and not coalesce(c.allow_manager,false))
    or (p_recipient='kitchen' and (not k or not coalesce(c.allow_kitchen,false))) then
  raise exception 'ORDER_ROUTING_DISABLED' using errcode='42501';
 end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 25
  or length(coalesce(p_customer_reference,''))>100 or length(coalesce(p_notes,''))>500 then
  raise exception 'INVALID_REQUEST_INPUT' using errcode='22023';
 end if;
 -- Stable client request id is retained across network retries. Reject id reuse with modified payload.
 request_digest:=md5(m.restaurant_id::text||':'||b::text||':'||p_recipient||':'||p_items::text||':'||
  coalesce(p_customer_reference,'')||':'||coalesce(p_notes,''));
 select * into prev from portal_order_private.intake where id=p_request_id;
 if found then
  if prev.actor_id<>auth.uid() or prev.restaurant_id<>m.restaurant_id or prev.request_hash<>request_digest then
   raise exception 'REQUEST_ID_REUSED' using errcode='23505';
  end if;
  return jsonb_build_object('id',prev.id,'status',prev.status,'replayed',true);
 end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item)<>'object' or coalesce(item->>'id','') !~* '^[a-f0-9-]{36}$'
    or coalesce(item->>'quantity','') !~ '^[0-9]{1,3}$' then
   raise exception 'INVALID_ORDER_LINE' using errcode='22023';
  end if;
  item_id:=(item->>'id')::uuid;
  qty:=(item->>'quantity')::integer;
  if qty<1 or qty>20 then raise exception 'QUANTITY_OUT_OF_RANGE' using errcode='22023'; end if;
  n:=n+qty;
  if n>100 then raise exception 'ORDER_EXCEEDS_100_UNITS' using errcode='22023'; end if;
  if k then
   select * into menu from restaurant_pos_private.menu
    where id=item_id and restaurant_id=m.restaurant_id and branch_id=b and active;
   if menu.id is null then raise exception 'PRODUCT_NOT_IN_AUTHORIZED_BRANCH' using errcode='42501'; end if;
   unit_price:=menu.price;label:=menu.name;
   valid_items:=valid_items||jsonb_build_array(jsonb_build_object('id',menu.id,'name',label,
     'name_ar',menu.name_ar,'name_fa',menu.name_fa,'station',menu.station,
     'quantity',qty,'unit_price',unit_price,'line_total',round(unit_price*qty,2)));
  else
   select * into product from public.products where id=item_id and restaurant_id=m.restaurant_id
    and (branch_id=b or branch_id is null) and coalesce(is_active,true);
   if product.id is null then raise exception 'PRODUCT_NOT_IN_AUTHORIZED_BRANCH' using errcode='42501'; end if;
   unit_price:=greatest(0,coalesce(product.selling_price,product.default_price,0));
   label:=product.name;
   valid_items:=valid_items||jsonb_build_array(jsonb_build_object('id',product.id,'name',label,
     'name_ar',product.name_ar,'name_fa',product.name_fa,
     'quantity',qty,'unit_price',unit_price,'line_total',round(unit_price*qty,2)));
  end if;
  total:=total+round(unit_price*qty,2);
 end loop;
 if total>1000000 then raise exception 'REQUEST_AMOUNT_EXCEEDS_LIMIT' using errcode='22023'; end if;
 insert into portal_order_private.intake(id,restaurant_id,branch_id,actor_id,actor_role,driver_id,
  recipient,status,order_kind,customer_reference,notes,items,total_quote,request_hash)
 values(p_request_id,m.restaurant_id,b,auth.uid(),m.role,
   case when m.role='driver' then m.linked_entity_id else null end,
   p_recipient,case when p_recipient='kitchen' then 'queued' else 'awaiting_manager' end,
   case when k then 'restaurant' else 'other' end,
   coalesce(p_customer_reference,''),coalesce(p_notes,''),valid_items,total,request_digest);
 perform realtime.send('{}'::jsonb,'changed','portal-orders:'||m.restaurant_id||':'||b,false);
 return jsonb_build_object('id',p_request_id,'status',case when p_recipient='kitchen' then 'queued' else 'awaiting_manager' end,
   'total_quote',total,'posted_to_sales',false,'inventory_debited',false,'replayed',false);
end $$;

create or replace function public.erp_portal_order_inbox(
 p_restaurant_id uuid,p_branch_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.erp_memberships; b uuid; privileged boolean; records jsonb;
begin
 m:=portal_order_private.membership(p_restaurant_id);
 b:=portal_order_private.branch_for(m,p_branch_id);
 privileged:=m.role in ('owner','manager') and
  (m.role='owner' or public.erp_has_any_permission(array['viewOrders','manageSettings']));
 if not privileged and not (m.role='employee' and public.erp_has_any_permission(array['viewOrders'])) then
  raise exception 'ORDER_INBOX_PERMISSION_REQUIRED' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at),'[]'::jsonb) into records
 from (select id,restaurant_id,branch_id,actor_role,recipient,status,order_kind,
     case when privileged then customer_reference else '' end as customer_reference,
     notes,
     case when privileged then items else
       (select coalesce(jsonb_agg(x.value-'unit_price'-'line_total'),'[]'::jsonb)
        from jsonb_array_elements(items) as x(value)) end as items,
     case when privileged then total_quote else null::numeric end as total_quote,
     created_at,updated_at
   from portal_order_private.intake
   where restaurant_id=m.restaurant_id and branch_id=b
     and (privileged or status in ('queued','preparing','ready'))
     and status not in ('completed','cancelled','rejected')
   order by created_at asc limit 120) v;
 return jsonb_build_object('orders',records,'manager',privileged,'branch_id',b);
end $$;

create or replace function public.erp_portal_order_action(
 p_order_id uuid,p_action text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare o portal_order_private.intake; m public.erp_memberships; privileged boolean; next_status text;
begin
 if p_order_id is null or p_action not in ('approve','reject','preparing','ready','complete','cancel') then
   raise exception 'INVALID_ORDER_ACTION' using errcode='22023';
 end if;
 select * into o from portal_order_private.intake where id=p_order_id for update;
 if o.id is null then raise exception 'ORDER_NOT_FOUND' using errcode='42501'; end if;
 m:=portal_order_private.membership(o.restaurant_id);
 if portal_order_private.branch_for(m,o.branch_id)<>o.branch_id then
   raise exception 'OTHER_BRANCH_DENIED' using errcode='42501';
 end if;
 privileged:=m.role in ('owner','manager') and
   (m.role='owner' or public.erp_has_any_permission(array['viewOrders','manageSettings']));
 if p_action='cancel' and auth.uid()=o.actor_id and o.status in ('awaiting_manager','queued') then
   next_status:='cancelled';
 elsif privileged and p_action='reject' and o.status='awaiting_manager' then
   next_status:='rejected';
 elsif privileged and p_action='approve' and o.status='awaiting_manager' then
   next_status:=case when o.order_kind='restaurant' then 'queued' else 'accepted' end;
 elsif (privileged or (m.role='employee' and public.erp_has_any_permission(array['viewOrders'])))
   and o.order_kind='restaurant' and
  ((p_action='preparing' and o.status='queued') or (p_action='ready' and o.status='preparing')) then
   next_status:=p_action;
 elsif privileged and p_action='complete' and o.status in ('ready','accepted') then
   next_status:='completed';
 else
   raise exception 'ORDER_ACTION_NOT_PERMITTED_OR_STALE' using errcode='42501';
 end if;
 update portal_order_private.intake
  set status=next_status,updated_at=now(),reviewed_by=auth.uid(),reviewed_at=now()
  where id=o.id;
 perform realtime.send('{}'::jsonb,'changed','portal-orders:'||o.restaurant_id||':'||o.branch_id,false);
 return jsonb_build_object('id',o.id,'status',next_status,'posted_to_sales',false);
end $$;

-- Only these narrow RPCs are available to signed-in accounts.
revoke all on function portal_order_private.membership(uuid),
 portal_order_private.branch_for(public.erp_memberships,uuid),
 portal_order_private.restaurant_kind(uuid) from public,anon,authenticated;
revoke all on function public.erp_portal_order_context(uuid,uuid),
 public.erp_portal_order_configure(uuid,text,boolean,boolean),
 public.erp_portal_order_submit(uuid,uuid,uuid,text,jsonb,text,text),
 public.erp_portal_order_inbox(uuid,uuid),
 public.erp_portal_order_action(uuid,text) from public,anon,authenticated;
grant execute on function public.erp_portal_order_context(uuid,uuid),
 public.erp_portal_order_configure(uuid,text,boolean,boolean),
 public.erp_portal_order_submit(uuid,uuid,uuid,text,jsonb,text,text),
 public.erp_portal_order_inbox(uuid,uuid),
 public.erp_portal_order_action(uuid,text) to authenticated;
