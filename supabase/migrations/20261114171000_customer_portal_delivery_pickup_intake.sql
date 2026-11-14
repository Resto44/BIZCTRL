-- Customer Portal independent ordering: verified customer invitation, NOT ERP staff membership.
-- Existing requests/finance unchanged; no charge, delivery fee, stock or POS posting.
alter table portal_order_private.intake
 add column if not exists customer_id uuid references public.customers(id),
 add column if not exists fulfillment_mode text check(fulfillment_mode in ('delivery','pickup')),
 add column if not exists delivery_address text check(delivery_address is null or length(delivery_address)<=400),
 add column if not exists contact_phone text check(contact_phone is null or length(contact_phone)<=24),
 add column if not exists delivery_fee_quote numeric(12,2) check(delivery_fee_quote is null or delivery_fee_quote>=0);
create index if not exists portal_order_customer_history_idx
 on portal_order_private.intake(customer_id,created_at desc) where customer_id is not null;

-- This customer has NO erp_memberships row; only the activated customer invitation grants scope.
create or replace function customer_portal_private.order_customer(p_customer_id uuid)
returns public.customers language plpgsql stable security definer set search_path='' as $$
declare c public.customers;
begin
 if auth.uid() is null then raise exception 'CUSTOMER_ORDER_SIGNIN_REQUIRED' using errcode='42501'; end if;
 select customer.* into c from public.customers customer
 join public.customer_portal_access a on a.customer_id=customer.id
 join auth.users u on u.id=a.user_id and u.email_confirmed_at is not null
 where customer.id=p_customer_id and customer.is_active is true
   and a.user_id=auth.uid() and a.active is true;
 if c.id is null then raise exception 'CUSTOMER_ORDER_ACCOUNT_FORBIDDEN' using errcode='42501'; end if;
 return c;
end $$;

create or replace function customer_portal_private.order_branch(c public.customers,p_branch_id uuid default null)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare b uuid;
begin
 b:=coalesce(p_branch_id,c.branch_id,
    (select id from public.branches where restaurant_id=c.restaurant_id and is_active is true order by name,id limit 1));
 if b is null or (c.branch_id is not null and b <> c.branch_id) or not exists(
    select 1 from public.branches where id=b and restaurant_id=c.restaurant_id and is_active is true
 ) then raise exception 'CUSTOMER_ORDER_BRANCH_FORBIDDEN' using errcode='42501'; end if;
 return b;
end $$;

create or replace function public.erp_customer_portal_order_context(
 p_customer_id uuid,p_branch_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.customers; b uuid; is_restaurant boolean;
 routes portal_order_private.route_settings; catalog jsonb:='[]'::jsonb;
 history jsonb:='[]'::jsonb; branch_list jsonb:='[]'::jsonb;
begin
 c:=customer_portal_private.order_customer(p_customer_id);
 b:=customer_portal_private.order_branch(c,p_branch_id);
 is_restaurant:=portal_order_private.restaurant_kind(c.restaurant_id);
 select * into routes from portal_order_private.route_settings
 where restaurant_id=c.restaurant_id and role='customer';
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name) order by x.name),'[]'::jsonb)
 into branch_list from (select id,name from public.branches where restaurant_id=c.restaurant_id
  and is_active is true and (c.branch_id is null or id=c.branch_id)) x;
 if coalesce(routes.allow_manager,false) or (is_restaurant and coalesce(routes.allow_kitchen,false)) then
  if is_restaurant then
   select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'name_ar',x.name_ar,
      'name_fa',x.name_fa,'price',x.price,
      'category_key',coalesce('id:'||x.category_id::text,'legacy:'||lower(btrim(coalesce(nullif(x.category,''),'Other')))),
      'category',coalesce(nullif(x.category_name,''),nullif(x.category,''),'Other'),
      'category_ar',coalesce(nullif(x.category_ar,''),nullif(x.category_name,''),nullif(x.category,''),'Other'),
      'category_fa',coalesce(nullif(x.category_fa,''),nullif(x.category_name,''),nullif(x.category,''),'Other'))
      order by x.sort_order,x.name,x.id),'[]'::jsonb)
   into catalog from (
    select q.id,q.name,q.name_ar,q.name_fa,q.price,q.category_id,q.category,
      pc.name as category_name,pc.name_ar as category_ar,pc.name_fa as category_fa,
      coalesce(pc.sort_order,999999) as sort_order
    from restaurant_pos_private.menu q
    left join public.product_categories pc on pc.id=q.category_id
     and pc.restaurant_id=q.restaurant_id and (pc.branch_id is null or pc.branch_id=b)
     and coalesce(pc.is_active,true)
    where q.restaurant_id=c.restaurant_id and q.branch_id=b and q.active is true
    order by coalesce(pc.sort_order,999999),q.name,q.id limit 250
   ) x;
  else
   select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'name_ar',x.name_ar,
     'name_fa',x.name_fa,'price',x.price,
     'category_key',coalesce('id:'||x.category_id::text,'uncategorized'),
     'category',coalesce(nullif(x.category_name,''),'Other'),
     'category_ar',coalesce(nullif(x.category_ar,''),nullif(x.category_name,''),'Other'),
     'category_fa',coalesce(nullif(x.category_fa,''),nullif(x.category_name,''),'Other'))
     order by x.sort_order,x.name,x.id),'[]'::jsonb)
   into catalog from (
    select p.id,p.name,p.name_ar,p.name_fa,p.category_id,
      coalesce(pc.sort_order,999999) as sort_order,
      pc.name as category_name,pc.name_ar as category_ar,pc.name_fa as category_fa,
      greatest(0,coalesce(p.selling_price,p.default_price,0))::numeric(16,2) as price
    from public.products p left join public.product_categories pc on pc.id=p.category_id
      and pc.restaurant_id=p.restaurant_id and (pc.branch_id is null or pc.branch_id=b)
      and coalesce(pc.is_active,true)
    where p.restaurant_id=c.restaurant_id and (p.branch_id=b or p.branch_id is null)
      and coalesce(p.is_active,true)
    order by coalesce(pc.sort_order,999999),p.name,p.id limit 250
   ) x;
  end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',x.id,'recipient',x.recipient,'status',x.status,'fulfillment',x.fulfillment_mode,
   'total_quote',x.total_quote,'delivery_fee_quote',x.delivery_fee_quote,
   'items',x.items,'created_at',x.created_at) order by x.created_at desc),'[]'::jsonb)
 into history from (
  select id,recipient,status,fulfillment_mode,total_quote,delivery_fee_quote,items,created_at
  from portal_order_private.intake where customer_id=c.id and actor_id=auth.uid()
    and restaurant_id=c.restaurant_id and branch_id=b
  order by created_at desc limit 40
 ) x;
 return jsonb_build_object(
   'customer_id',c.id,'restaurant_id',c.restaurant_id,'branch_id',b,
   'branch_name',(select name from public.branches where id=b),
   'currency',(select currency from public.restaurants where id=c.restaurant_id),
   'restaurant_mode',is_restaurant,'branches',branch_list,
   'can_manager',coalesce(routes.allow_manager,false),
   'can_kitchen',is_restaurant and coalesce(routes.allow_kitchen,false),
   'catalog',catalog,'orders',history,
   'delivery_fee_status','CONFIRM_WITH_RESTAURANT',
   'payment_status','NOT_PAID','financial_posting',false);
end $$;

create or replace function public.erp_customer_portal_order_submit(
 p_customer_id uuid,p_branch_id uuid,p_request_id uuid,p_fulfillment text,
 p_delivery_address text,p_contact_phone text,p_items jsonb,p_notes text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.customers; b uuid; is_restaurant boolean;
 routes portal_order_private.route_settings; recipient text;
 item jsonb; menu restaurant_pos_private.menu; product public.products;
 qty integer; units integer:=0; quote numeric(16,2):=0; price numeric(16,2);
 lines jsonb:='[]'::jsonb; address_text text; phone_text text;
 digest text; existing portal_order_private.intake; new_id uuid;
begin
 c:=customer_portal_private.order_customer(p_customer_id);
 b:=customer_portal_private.order_branch(c,p_branch_id);
 is_restaurant:=portal_order_private.restaurant_kind(c.restaurant_id);
 select * into routes from portal_order_private.route_settings
   where restaurant_id=c.restaurant_id and role='customer';
 if not coalesce(routes.allow_manager,false) and
    not (is_restaurant and coalesce(routes.allow_kitchen,false)) then
   raise exception 'CUSTOMER_ORDER_NOT_ENABLED' using errcode='42501';
 end if;
 if p_request_id is null or p_fulfillment not in ('delivery','pickup') or
   p_fulfillment is null or p_items is null or jsonb_typeof(p_items)<>'array' or
   jsonb_array_length(p_items) not between 1 and 25 or
   char_length(coalesce(p_notes,''))>500 then
   raise exception 'CUSTOMER_ORDER_INVALID' using errcode='22023';
 end if;
 address_text:=nullif(btrim(coalesce(p_delivery_address,'')),'');
 phone_text:=nullif(btrim(coalesce(p_contact_phone,'')),'');
 if p_fulfillment='delivery' and
   (address_text is null or char_length(address_text) not between 10 and 400 or
    phone_text is null or phone_text !~ '^[+0-9 ()-]{7,24}$') then
   raise exception 'DELIVERY_ADDRESS_AND_PHONE_REQUIRED' using errcode='22023';
 end if;
 if p_fulfillment='pickup' then address_text:=null;phone_text:=null;end if;
 -- A delivery address must first go to an authorized manager for confirmation.
 if p_fulfillment='delivery' and not coalesce(routes.allow_manager,false) then
   raise exception 'DELIVERY_NEEDS_MANAGER_ROUTE' using errcode='42501';
 end if;
 recipient:=case when coalesce(routes.allow_manager,false) then 'manager' else 'kitchen' end;
 digest:=md5(c.id::text||':'||b::text||':'||p_fulfillment||':'||
   coalesce(address_text,'')||':'||coalesce(phone_text,'')||':'||p_items::text||':'||
   coalesce(p_notes,''));
 -- This check precedes price lookup so identical retries are safely idempotent.
 select * into existing from portal_order_private.intake where id=p_request_id;
 if found then
  if existing.customer_id is distinct from c.id or existing.actor_id <> auth.uid()
    or existing.request_hash <> digest then raise exception 'CUSTOMER_ORDER_ID_REUSED' using errcode='23505';end if;
  return jsonb_build_object('id',existing.id,'status',existing.status,'replayed',true);
 end if;
 -- The initial request is never charged, but a compromised session must not
 -- generate an unbounded workload for the restaurant.
 if (select count(*) from portal_order_private.intake
     where customer_id=c.id and actor_id=auth.uid()
       and created_at > now()-interval '1 hour') >= 20 then
   raise exception 'CUSTOMER_ORDER_RATE_LIMIT' using errcode='22023';
 end if;
 if (select count(distinct line.value->>'id') from jsonb_array_elements(p_items) as line(value))
    <> jsonb_array_length(p_items) then
   raise exception 'CUSTOMER_ORDER_DUPLICATE_LINE' using errcode='22023';
 end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item)<>'object' or coalesce(item->>'id','') !~* '^[a-f0-9-]{36}$'
    or coalesce(item->>'quantity','') !~ '^[0-9]{1,3}$' then
   raise exception 'CUSTOMER_ORDER_INVALID_ITEM' using errcode='22023';
  end if;
  qty:=(item->>'quantity')::integer;
  if qty<1 or qty>20 then raise exception 'CUSTOMER_ORDER_QUANTITY_INVALID' using errcode='22023';end if;
  units:=units+qty;
  if units>100 then raise exception 'CUSTOMER_ORDER_TOO_LARGE' using errcode='22023';end if;
  if is_restaurant then
   select * into menu from restaurant_pos_private.menu where id=(item->>'id')::uuid
     and restaurant_id=c.restaurant_id and branch_id=b and active is true;
   if menu.id is null then raise exception 'CUSTOMER_ORDER_PRODUCT_FORBIDDEN' using errcode='42501';end if;
   price:=menu.price;
   lines:=lines||jsonb_build_array(jsonb_build_object(
     'id',menu.id,'name',menu.name,'name_ar',menu.name_ar,'name_fa',menu.name_fa,
     'quantity',qty,'unit_price',price,'line_total',round(qty*price,2)));
  else
   select * into product from public.products where id=(item->>'id')::uuid
     and restaurant_id=c.restaurant_id and (branch_id=b or branch_id is null)
     and coalesce(is_active,true);
   if product.id is null then raise exception 'CUSTOMER_ORDER_PRODUCT_FORBIDDEN' using errcode='42501';end if;
   price:=greatest(0,coalesce(product.selling_price,product.default_price,0));
   lines:=lines||jsonb_build_array(jsonb_build_object(
     'id',product.id,'name',product.name,'name_ar',product.name_ar,'name_fa',product.name_fa,
     'quantity',qty,'unit_price',price,'line_total',round(qty*price,2)));
  end if;
  quote:=quote+round(qty*price,2);
 end loop;
 if quote>1000000 then raise exception 'CUSTOMER_ORDER_QUOTE_TOO_HIGH' using errcode='22023';end if;
 insert into portal_order_private.intake
   (id,restaurant_id,branch_id,actor_id,actor_role,customer_id,recipient,status,order_kind,
    customer_reference,notes,items,total_quote,request_hash,
    fulfillment_mode,delivery_address,contact_phone,delivery_fee_quote)
 values(p_request_id,c.restaurant_id,b,auth.uid(),'customer',c.id,recipient,
   case when recipient='manager' then 'awaiting_manager' else 'queued' end,
   case when is_restaurant then 'restaurant' else 'other' end,
   left(c.name,100),coalesce(p_notes,''),lines,quote,digest,
   p_fulfillment,address_text,phone_text,null)
 on conflict(id) do nothing returning id into new_id;
 if new_id is null then
  select * into existing from portal_order_private.intake where id=p_request_id;
  if existing.customer_id is distinct from c.id or existing.actor_id <> auth.uid()
    or existing.request_hash <> digest then raise exception 'CUSTOMER_ORDER_ID_REUSED' using errcode='23505';end if;
  return jsonb_build_object('id',existing.id,'status',existing.status,'replayed',true);
 end if;
 perform realtime.send('{}'::jsonb,'changed','portal-orders:'||c.restaurant_id||':'||b,false);
 return jsonb_build_object('id',p_request_id,'status',
   case when recipient='manager' then 'awaiting_manager' else 'queued' end,
   'fulfillment',p_fulfillment,'total_quote',quote,
   'delivery_fee_quote',null,'payment_status','NOT_PAID',
   'posted_to_sales',false,'inventory_debited',false,'replayed',false);
end $$;

-- The manager can access delivery instructions; kitchen staff never receive the
-- customer's address or phone. Older driver tickets keep their prior fields.
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
     case when privileged or actor_role <> 'customer' then notes else '' end as notes,
     fulfillment_mode,
     case when privileged then delivery_address else null::text end as delivery_address,
     case when privileged then contact_phone else null::text end as contact_phone,
     case when privileged then delivery_fee_quote else null::numeric end as delivery_fee_quote,
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


-- Explicit allowlist: independent customer uses only customer_portal_access.
revoke all on function customer_portal_private.order_customer(uuid),
 customer_portal_private.order_branch(public.customers,uuid)
 from public,anon,authenticated;
revoke all on function public.erp_customer_portal_order_context(uuid,uuid),
 public.erp_customer_portal_order_submit(uuid,uuid,uuid,text,text,text,jsonb,text)
 from public,anon,authenticated;
grant execute on function public.erp_customer_portal_order_context(uuid,uuid),
 public.erp_customer_portal_order_submit(uuid,uuid,uuid,text,text,text,jsonb,text)
 to authenticated;
