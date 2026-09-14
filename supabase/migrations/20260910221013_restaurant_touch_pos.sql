begin;
-- Restaurant-only operating ledger. Public sales remains the financial source.
create schema restaurant_pos_private;
revoke all on schema restaurant_pos_private from public, anon, authenticated;
create table restaurant_pos_private.terminals (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 branch_id uuid not null references public.branches(id), code text not null check(length(code) between 1 and 40),
 locked boolean not null default false, last_seen_at timestamptz, unique(branch_id,code)
);
create index restaurant_terminal_tenant on restaurant_pos_private.terminals(restaurant_id,branch_id);
create table restaurant_pos_private.shifts (
 id uuid primary key default gen_random_uuid(), device_id uuid not null references restaurant_pos_private.terminals(id),
 cashier_id uuid not null, cashier_name text not null, opening_cash numeric(16,2) not null check(opening_cash between 0 and 10000000),
 opened_at timestamptz not null default now(), closed_at timestamptz, counted_cash numeric(16,2), expected_cash numeric(16,2), notes text
);
create unique index restaurant_shift_open on restaurant_pos_private.shifts(device_id) where closed_at is null;
create table restaurant_pos_private.menu (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
 branch_id uuid not null references public.branches(id), product_id uuid not null references public.products(id),
 name text not null check(length(name) between 1 and 160), name_ar text, name_fa text,
 category text not null default 'Food', station text not null default 'Kitchen', image_url text,
 price numeric(16,2) not null check(price between 0.01 and 1000000), tax_rate numeric(7,3) not null default 0 check(tax_rate between 0 and 100),
 stock_mode text not null check(stock_mode in ('recipe','untracked')), recipe jsonb not null default '[]',
 active boolean not null default true, updated_at timestamptz not null default now(),
 check(jsonb_typeof(recipe)='array' and jsonb_array_length(recipe)<=100)
);
create index restaurant_menu_scope on restaurant_pos_private.menu(restaurant_id,branch_id);
create index restaurant_menu_product on restaurant_pos_private.menu(product_id);
create table restaurant_pos_private.orders (
 id uuid primary key default gen_random_uuid(), device_id uuid not null references restaurant_pos_private.terminals(id),
 shift_id uuid not null references restaurant_pos_private.shifts(id), number bigint generated always as identity,
 status text not null default 'open' check(status in ('open','held','paid','cancelled')),
 kitchen_status text not null default 'draft' check(kitchen_status in ('draft','queued','preparing','ready','served','cancelled')),
 order_type text not null default 'takeaway' check(order_type in ('dine_in','takeaway','delivery')),
 table_label text not null default '', notes text not null default '', lines jsonb not null default '[]',
 subtotal numeric(16,2) not null default 0, tax_total numeric(16,2) not null default 0, net_total numeric(16,2) not null default 0,
 revision integer not null default 0, receipt jsonb, submitted_at timestamptz, paid_at timestamptz,
 cash_paid numeric(16,2) not null default 0, card_paid numeric(16,2) not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(jsonb_typeof(lines)='array' and jsonb_array_length(lines)<=100)
);
create index restaurant_orders_shift on restaurant_pos_private.orders(shift_id,created_at desc);
create index restaurant_orders_lane on restaurant_pos_private.orders(device_id,created_at desc);
create index restaurant_orders_kitchen on restaurant_pos_private.orders(kitchen_status,submitted_at) where kitchen_status in ('queued','preparing','ready');
create unique index restaurant_one_cart on restaurant_pos_private.orders(device_id) where status='open';
create table restaurant_pos_private.requests (
 device_id uuid not null references restaurant_pos_private.terminals(id), request_id uuid not null, actor uuid not null,
 command text not null, payload jsonb not null, result jsonb not null default '{}', created_at timestamptz not null default now(), primary key(device_id,request_id)
);
create table restaurant_pos_private.consumption (
 order_id uuid not null references restaurant_pos_private.orders(id), inventory_id uuid not null references public.inventory(id),
 quantity numeric not null check(quantity>0), unit_cost numeric not null default 0, unit text, created_at timestamptz not null default now(),
 wasted boolean not null default false, primary key(order_id,inventory_id)
);
create index restaurant_consumption_inventory on restaurant_pos_private.consumption(inventory_id);
create table restaurant_pos_private.displays (
 device_id uuid primary key references restaurant_pos_private.terminals(id), token_hash text not null unique,
 topic uuid not null default gen_random_uuid(), expires_at timestamptz not null, order_id uuid references restaurant_pos_private.orders(id)
);
create index restaurant_display_order on restaurant_pos_private.displays(order_id);
create table restaurant_pos_private.events (
 id uuid primary key default gen_random_uuid(), device_id uuid not null references restaurant_pos_private.terminals(id),
 order_id uuid references restaurant_pos_private.orders(id), actor uuid not null, action text not null, reason text,
 occurred_at timestamptz not null default now()
);
create index restaurant_events_lane on restaurant_pos_private.events(device_id,occurred_at desc);
create index restaurant_events_order on restaurant_pos_private.events(order_id);
do $$ declare t text; begin
 foreach t in array array['terminals','shifts','menu','orders','requests','consumption','displays','events'] loop
  execute format('alter table restaurant_pos_private.%I enable row level security',t);
 end loop;
end $$;

create function restaurant_pos_private.guard(r uuid,b uuid,permission text default 'viewSales',manager boolean default false)
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.restaurants where id=r and lower(btrim(coalesce(nullif(business_type,''),business_mode::text,''))) in ('restaurant','cafe'))
 or not public.erp_subscription_has_erp_access(r) or not exists(
  select 1 from public.erp_memberships m left join public.erp_role_permissions rp on rp.restaurant_id=m.restaurant_id and rp.role=m.role
  where m.user_id=auth.uid() and m.restaurant_id=r and m.status='approved' and m.role in ('owner','manager','employee')
  and (m.role='owner' or (b is not null and m.branch_id=b))
  and (not manager or m.role in ('owner','manager'))
  and (m.role='owner' or coalesce((public.erp_effective_permissions(m.role,m.permissions,rp.permissions)->>permission)::boolean,false)))
 or (b is not null and not exists(select 1 from public.branches where id=b and restaurant_id=r and coalesce(is_active,true))) then
  raise exception 'Restaurant POS access denied for this branch.' using errcode='42501';
 end if;
end $$;

create function restaurant_pos_private.order_json(o restaurant_pos_private.orders) returns jsonb language sql stable set search_path='' as $$
 select case when o.id is null then null else (to_jsonb(o)-'receipt'-'lines')||jsonb_build_object('lines',coalesce((select jsonb_agg(v-'recipe'-'stock_mode') from jsonb_array_elements(o.lines) v),'[]'::jsonb)) end
$$;

create function restaurant_pos_private.snapshot(p_device_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d restaurant_pos_private.terminals; s restaurant_pos_private.shifts; o restaurant_pos_private.orders; business jsonb;
begin
 select * into d from restaurant_pos_private.terminals where id=p_device_id;
 perform restaurant_pos_private.guard(d.restaurant_id,d.branch_id);
 select * into s from restaurant_pos_private.shifts where device_id=d.id and closed_at is null;
 if s.id is not null and s.cashier_id<>auth.uid() and not public.erp_can_write_scope(d.restaurant_id,d.branch_id) then
  raise exception 'This POS has another cashier on duty.' using errcode='42501'; end if;
 select * into o from restaurant_pos_private.orders where device_id=d.id and status='open';
 select jsonb_build_object('name',r.name,'branch_name',b.name,'currency',coalesce(nullif(r.currency,''),'SAR'),'address',r.address) into business
 from public.restaurants r join public.branches b on b.restaurant_id=r.id where r.id=d.restaurant_id and b.id=d.branch_id;
 return jsonb_build_object('device',to_jsonb(d),'shift',case when s.id is null then null else to_jsonb(s) end,'business',business,
 'cart',restaurant_pos_private.order_json(o),'can_manage',public.erp_can_write_scope(d.restaurant_id,d.branch_id),
 'expected_cash',coalesce(s.opening_cash,0)+coalesce((select sum(cash_paid) from restaurant_pos_private.orders where shift_id=s.id and status='paid'),0),
 'held',coalesce((select jsonb_agg(restaurant_pos_private.order_json(x)) from (select * from restaurant_pos_private.orders where device_id=d.id and shift_id=s.id and status='held' order by created_at limit 100) x),'[]'::jsonb),
 'receipts',coalesce((select jsonb_agg(x.receipt) from (select receipt from restaurant_pos_private.orders where device_id=d.id and status='paid' order by paid_at desc limit 30) x),'[]'::jsonb));
end $$;

create function restaurant_pos_private.consume(o restaurant_pos_private.orders,d restaurant_pos_private.terminals) returns void language plpgsql set search_path='' as $$
declare item record; stock public.inventory;
begin
 if o.submitted_at is not null then return; end if;
 if jsonb_array_length(o.lines)=0 then raise exception 'Add food to the order first.' using errcode='23514'; end if;
 -- Every cashier acquires stock locks in the same UUID order.
 for item in select (ing->>'inventory_id')::uuid id, sum((ing->>'quantity')::numeric*(line->>'quantity')::numeric) qty, array_agg(distinct ing->>'unit') units
 from jsonb_array_elements(o.lines) line cross join lateral jsonb_array_elements(line->'recipe') ing group by 1 order by 1 loop
  select * into stock from public.inventory where id=item.id for update;
  if stock.id is null or stock.restaurant_id<>d.restaurant_id or stock.branch_id is distinct from d.branch_id or stock.expiry_date<current_date then
   raise exception 'Ingredient stock is unavailable in this branch.' using errcode='23514'; end if;
  if item.units is distinct from array[stock.unit::text] then raise exception 'Ingredient unit changed; update the menu recipe before ordering.' using errcode='23514'; end if;
  if item.qty not between 0.000001 and 100000000 or coalesce(stock.quantity,0)<item.qty then raise exception 'Insufficient ingredient stock: %',stock.product_name using errcode='23514'; end if;
  update public.inventory set quantity=quantity-item.qty,total_value=(quantity-item.qty)*coalesce(average_cost,0),last_updated=now() where id=stock.id;
  insert into restaurant_pos_private.consumption(order_id,inventory_id,quantity,unit_cost,unit) values(o.id,stock.id,item.qty,coalesce(stock.average_cost,0),stock.unit);
 end loop;
 update restaurant_pos_private.orders set kitchen_status='queued',submitted_at=now() where id=o.id;
end $$;

create function restaurant_pos_private.command(p_device_id uuid,p_command text,p_payload jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d restaurant_pos_private.terminals; s restaurant_pos_private.shifts; o restaurant_pos_private.orders; m restaurant_pos_private.menu;
 req restaurant_pos_private.requests; q numeric; line jsonb; v_lines jsonb; result jsonb:='{}'; total numeric; tax numeric; cash numeric:=0; card numeric:=0;
 pay jsonb; change_due numeric; tok text; b public.branches; r public.restaurants; v_receipt jsonb; sale_id uuid; actor_name text;
begin
 if p_request_id is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid request.' using errcode='22023'; end if;
 select * into d from restaurant_pos_private.terminals where id=p_device_id for update;
 perform restaurant_pos_private.guard(d.restaurant_id,d.branch_id,'uploadSales');
 perform restaurant_pos_private.guard(d.restaurant_id,d.branch_id,'viewSales');
 select * into req from restaurant_pos_private.requests where device_id=d.id and request_id=p_request_id;
 if found then
  if req.actor<>auth.uid() or req.command<>p_command or req.payload<>p_payload then raise exception 'Request ID already used.' using errcode='22023'; end if;
  return restaurant_pos_private.snapshot(d.id)||req.result;
 end if;
 select * into s from restaurant_pos_private.shifts where device_id=d.id and closed_at is null for update;
 if s.id is not null and s.cashier_id<>auth.uid() and not public.erp_can_write_scope(d.restaurant_id,d.branch_id) then raise exception 'This lane belongs to another cashier.' using errcode='42501'; end if;
 if d.locked and p_command not in ('heartbeat','close_shift','unpair_display') then raise exception 'POS is locked by the manager.' using errcode='42501'; end if;
 if p_command='open_shift' then
  if s.id is not null then raise exception 'Shift is already open.' using errcode='23514'; end if;
  if nullif(btrim(p_payload->>'cashier_name'),'') is null then raise exception 'Cashier name is required.' using errcode='23514'; end if;
  insert into restaurant_pos_private.shifts(device_id,cashier_id,cashier_name,opening_cash) values(d.id,auth.uid(),left(p_payload->>'cashier_name',120),(p_payload->>'opening_cash')::numeric) returning * into s;
 elsif p_command='heartbeat' then null;
 elsif s.id is null then raise exception 'Open a shift first.' using errcode='23514';
 elsif p_command='pair_display' then
  tok:=encode(extensions.gen_random_bytes(32),'hex');
  insert into restaurant_pos_private.displays(device_id,token_hash,expires_at,order_id) values(d.id,encode(extensions.digest(tok,'sha256'),'hex'),now()+interval '8 hours',(select id from restaurant_pos_private.orders where device_id=d.id and status='open'))
  on conflict(device_id) do update set token_hash=excluded.token_hash,topic=gen_random_uuid(),expires_at=excluded.expires_at,order_id=excluded.order_id;
  result:=jsonb_build_object('token',tok);
 elsif p_command='unpair_display' then delete from restaurant_pos_private.displays where device_id=d.id;
 elsif p_command='close_shift' then
  if exists(select 1 from restaurant_pos_private.orders where shift_id=s.id and status in ('open','held') and jsonb_array_length(lines)>0) then
   raise exception 'Pay or cancel every unpaid order before closing.' using errcode='23514'; end if;
  if (p_payload->>'counted_cash')::numeric not between 0 and 10000000 or nullif(p_payload->>'counted_cash','') is null then raise exception 'Enter counted cash.' using errcode='23514'; end if;
  update restaurant_pos_private.orders set status='cancelled' where shift_id=s.id and status in ('open','held');
  update restaurant_pos_private.shifts set closed_at=now(),counted_cash=(p_payload->>'counted_cash')::numeric,
   expected_cash=opening_cash+coalesce((select sum(cash_paid) from restaurant_pos_private.orders where shift_id=s.id and status='paid'),0),notes=left(p_payload->>'notes',1000) where id=s.id;
  delete from restaurant_pos_private.displays where device_id=d.id;
 elsif p_command='new_sale' then
  if exists(select 1 from restaurant_pos_private.orders where device_id=d.id and status='open') then raise exception 'Hold or finish the current order.' using errcode='23514'; end if;
  insert into restaurant_pos_private.orders(device_id,shift_id) values(d.id,s.id) returning * into o;
  update restaurant_pos_private.displays set order_id=o.id where device_id=d.id;
 else
  select * into o from restaurant_pos_private.orders where id=(p_payload->>'cart_id')::uuid and device_id=d.id and shift_id=s.id for update;
  if o.id is null then raise exception 'Order not found in this shift.' using errcode='42501'; end if;
  if p_command='checkout' and o.status='paid' then return restaurant_pos_private.snapshot(d.id)||jsonb_build_object('receipt',o.receipt); end if;
  if o.status not in ('open','held') then raise exception 'Order is closed.' using errcode='23514'; end if;
  if (p_payload->>'revision')::integer is distinct from o.revision then raise exception 'Order changed. Refresh before retrying.' using errcode='40001'; end if;
  if p_command in ('quantity','details') and (o.status<>'open' or o.submitted_at is not null) then raise exception 'Sent kitchen orders cannot be edited. Cancel with a reason or add a new order.' using errcode='23514'; end if;
  if p_command='quantity' then
   q:=(p_payload->>'quantity')::numeric;
   if q is null or q not between 0 and 1000 or trunc(q)<>q then raise exception 'Quantity must be a whole number from 0 to 1000.' using errcode='23514'; end if;
   select value into line from jsonb_array_elements(o.lines) where value->>'menu_id'=p_payload->>'menu_id';
   if line is null then
    select * into m from restaurant_pos_private.menu where id=(p_payload->>'menu_id')::uuid and branch_id=d.branch_id and restaurant_id=d.restaurant_id and active;
    if m.id is null then raise exception 'Food is unavailable in this branch.' using errcode='23514'; end if;
    line:=jsonb_build_object('menu_id',m.id,'product_id',m.product_id,'name',m.name,'name_en',m.name,'name_ar',m.name_ar,'name_fa',m.name_fa,
     'unit_price',m.price,'tax_rate',m.tax_rate,'station',m.station,'recipe',m.recipe,'stock_mode',m.stock_mode,'unit','portion');
   end if;
   select coalesce(jsonb_agg(value),'[]'::jsonb) into v_lines from jsonb_array_elements(o.lines) where value->>'menu_id'<>p_payload->>'menu_id';
   if q>0 then v_lines:=v_lines||jsonb_build_array(line||jsonb_build_object('quantity',q,'line_total',round(q*(line->>'unit_price')::numeric,2))); end if;
   select coalesce(sum((v->>'line_total')::numeric),0),coalesce(sum(round((v->>'line_total')::numeric-(v->>'line_total')::numeric/(1+(v->>'tax_rate')::numeric/100),2)),0) into total,tax from jsonb_array_elements(v_lines) v;
   update restaurant_pos_private.orders set lines=v_lines,net_total=total,tax_total=tax,subtotal=total-tax where id=o.id;
  elsif p_command='details' then
   update restaurant_pos_private.orders set order_type=p_payload->>'order_type',table_label=left(coalesce(p_payload->>'table_label',''),60),notes=left(coalesce(p_payload->>'notes',''),1000) where id=o.id;
  elsif p_command='hold' then update restaurant_pos_private.orders set status='held' where id=o.id;
  elsif p_command='resume' then
   if exists(select 1 from restaurant_pos_private.orders where device_id=d.id and status='open' and id<>o.id) then raise exception 'Hold the current order first.' using errcode='23514'; end if;
   update restaurant_pos_private.orders set status='open' where id=o.id;
   update restaurant_pos_private.displays set order_id=o.id where device_id=d.id;
  elsif p_command='cancel' then
   if nullif(btrim(p_payload->>'reason'),'') is null then raise exception 'Cancellation reason is required.' using errcode='23514'; end if;
   if o.submitted_at is not null then perform restaurant_pos_private.guard(d.restaurant_id,d.branch_id,'uploadSales',true); end if;
   update restaurant_pos_private.orders set status='cancelled',kitchen_status='cancelled',notes=notes||E'\nCancel: '||left(p_payload->>'reason',500) where id=o.id;
   update restaurant_pos_private.consumption set wasted=true where order_id=o.id;
  elsif p_command='send_kitchen' then
   perform restaurant_pos_private.consume(o,d);
  elsif p_command='checkout' then
   if not coalesce((p_payload->>'payment_confirmed')::boolean,false) then raise exception 'Confirm actual payment first.' using errcode='23514'; end if;
   if jsonb_typeof(p_payload->'payments')<>'array' or jsonb_array_length(p_payload->'payments') not between 1 and 2 then raise exception 'Choose cash, card or split payment.' using errcode='23514'; end if;
   for pay in select value from jsonb_array_elements(p_payload->'payments') loop
    q:=(pay->>'amount')::numeric;
    if q is null or q not between 0 and 10000000 or round(q,2)<>q then raise exception 'Invalid payment amount.' using errcode='23514'; end if;
    if pay->>'payment_method'='cash' then cash:=cash+q;
    elsif pay->>'payment_method' in ('mada','card','apple_pay') then card:=card+q;
    else raise exception 'Unsupported payment method.' using errcode='23514'; end if;
   end loop;
   if card>o.net_total or cash+card<o.net_total or o.net_total<=0 then raise exception 'Payment does not cover this order.' using errcode='23514'; end if;
   change_due:=cash+card-o.net_total; cash:=cash-change_due;
   perform restaurant_pos_private.consume(o,d);
   select * into b from public.branches where id=d.branch_id; select * into r from public.restaurants where id=d.restaurant_id;
   select email into actor_name from auth.users where id=auth.uid();
   insert into public.daily_sales(restaurant_id,tenant_id,branch_id,branch,date,business_date,restaurant_cash,restaurant_network,cash,network,credit,
    created_by,cashier_name,shift,reference_id,auto_generated,closing_state,notes)
   values(d.restaurant_id::text,d.restaurant_id::text,d.branch_id,b.branch_key,(now() at time zone 'Asia/Riyadh')::date,(now() at time zone 'Asia/Riyadh')::date,cash,card,cash,card,0,
    actor_name,s.cashier_name,'POS:'||s.id,'restaurant-pos:'||o.id,true,'finalized','Restaurant POS #'||o.number||' · '||d.code) returning id into sale_id;
   v_receipt:=restaurant_pos_private.order_json(o)||jsonb_build_object('cart_id',o.id,'id',sale_id,'receipt_number','R-'||o.number,
    'transaction_type','sale','occurred_at',now(),'device_code',d.code,'cashier_name',s.cashier_name,'change',change_due,'payments',jsonb_build_array(jsonb_build_object('payment_method','cash','amount',cash),jsonb_build_object('payment_method','card','amount',card)),
    'business',jsonb_build_object('name',r.name,'branch_name',b.name,'address',r.address,'currency',r.currency));
   update restaurant_pos_private.orders set status='paid',paid_at=now(),receipt=v_receipt,cash_paid=cash,card_paid=card where id=o.id;
   result:=jsonb_build_object('receipt',v_receipt);
  else raise exception 'Unknown cashier action.' using errcode='22023'; end if;
  update restaurant_pos_private.orders set revision=revision+1,updated_at=now() where id=o.id;
 end if;
 update restaurant_pos_private.terminals set last_seen_at=now() where id=d.id;
 if p_command<>'heartbeat' then
  insert into restaurant_pos_private.events(device_id,order_id,actor,action,reason) values(d.id,o.id,auth.uid(),p_command,left(p_payload->>'reason',500));
  insert into restaurant_pos_private.requests(device_id,request_id,actor,command,payload,result) values(d.id,p_request_id,auth.uid(),p_command,p_payload,result-'token');
 end if;
 perform realtime.send('{}'::jsonb,'changed','cashier:'||d.id,false);
 perform realtime.send('{}'::jsonb,'changed','restaurant-pos:'||d.restaurant_id,false);
 perform realtime.send('{}'::jsonb,'changed','customer-display:'||topic,false) from restaurant_pos_private.displays where device_id=d.id;
 return restaurant_pos_private.snapshot(d.id)||result;
end $$;

create function restaurant_pos_private.setup(p_restaurant_id uuid,p_branch_id uuid,p_command text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare i integer; x jsonb; stock public.inventory; m restaurant_pos_private.menu; p public.products; recipe jsonb:='[]';
begin
 perform restaurant_pos_private.guard(p_restaurant_id,p_branch_id,'uploadSales',true);
 if p_branch_id is null then raise exception 'Select one branch.' using errcode='23514'; end if;
 if p_command='devices' then
  if (p_payload->>'count')::integer not between 1 and 100 then raise exception 'Choose 1–100 devices.' using errcode='23514'; end if;
  for i in 1..(p_payload->>'count')::integer loop
   insert into restaurant_pos_private.terminals(restaurant_id,branch_id,code) values(p_restaurant_id,p_branch_id,'POS-'||lpad(i::text,2,'0')) on conflict(branch_id,code) do nothing;
  end loop;
 elsif p_command='lock' then
  update restaurant_pos_private.terminals set locked=(p_payload->>'locked')::boolean where id=(p_payload->>'device_id')::uuid and restaurant_id=p_restaurant_id and branch_id=p_branch_id;
 elsif p_command='menu' then
  select * into p from public.products where id=(p_payload->>'product_id')::uuid and restaurant_id=p_restaurant_id and (branch_id is null or branch_id=p_branch_id) and coalesce(is_active,true);
  if p.id is null then raise exception 'Select an active product from this restaurant.' using errcode='23514'; end if;
  if p_payload->>'stock_mode'='untracked' and not coalesce((p_payload->>'confirm_untracked')::boolean,false) then raise exception 'Explicitly confirm that this item has no automatic stock deduction.' using errcode='23514'; end if;
  if p_payload->>'stock_mode'='recipe' then
   if jsonb_typeof(p_payload->'recipe')<>'array' or jsonb_array_length(p_payload->'recipe') not between 1 and 100 then raise exception 'Add the ingredients per portion.' using errcode='23514'; end if;
   for x in select value from jsonb_array_elements(p_payload->'recipe') loop
    select * into stock from public.inventory where id=(x->>'inventory_id')::uuid and restaurant_id=p_restaurant_id and branch_id=p_branch_id;
    if stock.id is null or (x->>'quantity')::numeric not between 0.000001 and 1000000 or x->>'quantity' is null then raise exception 'Invalid branch ingredient or quantity.' using errcode='23514'; end if;
    recipe:=recipe||jsonb_build_array(jsonb_build_object('inventory_id',stock.id,'quantity',(x->>'quantity')::numeric,'unit',stock.unit));
   end loop;
  end if;
  if exists(select 1 from restaurant_pos_private.menu where id=(p_payload->>'id')::uuid and (restaurant_id<>p_restaurant_id or branch_id<>p_branch_id)) then raise exception 'Menu scope mismatch.' using errcode='42501'; end if;
  insert into restaurant_pos_private.menu(id,restaurant_id,branch_id,product_id,name,name_ar,name_fa,category,station,image_url,price,tax_rate,stock_mode,recipe,active)
  values((p_payload->>'id')::uuid,p_restaurant_id,p_branch_id,p.id,coalesce(nullif(p_payload->>'name',''),p.name),coalesce(p_payload->>'name_ar',p.name_ar),p.name_fa,
   coalesce(nullif(p_payload->>'category',''),'Food'),coalesce(nullif(p_payload->>'station',''),'Kitchen'),p.image_url,(p_payload->>'price')::numeric,(p_payload->>'tax_rate')::numeric,p_payload->>'stock_mode',recipe,coalesce((p_payload->>'active')::boolean,true))
  on conflict(id) do update set name=excluded.name,name_ar=excluded.name_ar,category=excluded.category,station=excluded.station,price=excluded.price,tax_rate=excluded.tax_rate,stock_mode=excluded.stock_mode,recipe=excluded.recipe,active=excluded.active,updated_at=now();
 else raise exception 'Unknown setup action.' using errcode='22023'; end if;
 perform realtime.send('{}'::jsonb,'changed','restaurant-pos:'||p_restaurant_id,false);
 return jsonb_build_object('ok',true);
end $$;

create function restaurant_pos_private.workspace(p_restaurant_id uuid,p_branch_id uuid,p_date date) returns jsonb language plpgsql security definer set search_path='' as $$
declare can_manage boolean; result jsonb;
begin
 perform restaurant_pos_private.guard(p_restaurant_id,p_branch_id);
 can_manage:=public.erp_can_write_scope(p_restaurant_id,p_branch_id);
 select jsonb_build_object(
 'devices',coalesce((select jsonb_agg(to_jsonb(d)) from restaurant_pos_private.terminals d where d.restaurant_id=p_restaurant_id and (p_branch_id is null or d.branch_id=p_branch_id)),'[]'::jsonb),
 'menu',coalesce((select jsonb_agg(to_jsonb(m)-'recipe') from restaurant_pos_private.menu m where m.restaurant_id=p_restaurant_id and m.branch_id=p_branch_id and (m.active or can_manage)),'[]'::jsonb),
 'orders',coalesce((select jsonb_agg(restaurant_pos_private.order_json(o)) from (select o.* from restaurant_pos_private.orders o join restaurant_pos_private.terminals d on d.id=o.device_id where d.restaurant_id=p_restaurant_id and (p_branch_id is null or d.branch_id=p_branch_id) and o.kitchen_status in ('queued','preparing','ready') order by o.submitted_at limit 100) o),'[]'::jsonb),
 'can_manage',can_manage,'server_time',now(),
 'paid_sales',case when can_manage then (select coalesce(sum(o.net_total),0) from restaurant_pos_private.orders o join restaurant_pos_private.terminals d on d.id=o.device_id where d.restaurant_id=p_restaurant_id and (p_branch_id is null or d.branch_id=p_branch_id) and o.status='paid' and (o.paid_at at time zone 'Asia/Riyadh')::date=p_date) end,
 'unpaid_orders',case when can_manage then (select coalesce(sum(o.net_total),0) from restaurant_pos_private.orders o join restaurant_pos_private.terminals d on d.id=o.device_id where d.restaurant_id=p_restaurant_id and (p_branch_id is null or d.branch_id=p_branch_id) and o.status in ('open','held')) end,
 'expenses',case when can_manage and public.erp_has_permission('viewExpenses') then (select coalesce(sum(amount),0) from public.expenses where restaurant_id=p_restaurant_id and (p_branch_id is null or branch_id=p_branch_id) and date=p_date and lower(coalesce(status,'')) not in ('rejected','cancelled')) end,
 'purchases',case when can_manage and public.erp_has_permission('viewPurchases') then (select coalesce(sum(qty*coalesce(used_price,current_price,0)),0) from public.purchases where restaurant_id=p_restaurant_id and (p_branch_id is null or branch_id=p_branch_id) and date=p_date) end,
 'events',case when can_manage then coalesce((select jsonb_agg(to_jsonb(e)) from (select e.action,e.reason,e.occurred_at,d.code from restaurant_pos_private.events e join restaurant_pos_private.terminals d on d.id=e.device_id where d.restaurant_id=p_restaurant_id and (p_branch_id is null or d.branch_id=p_branch_id) order by e.occurred_at desc limit 30) e),'[]'::jsonb) else '[]'::jsonb end
 ) into result;
 return result;
end $$;

create function restaurant_pos_private.catalog(p_restaurant_id uuid,p_branch_id uuid,p_search text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform restaurant_pos_private.guard(p_restaurant_id,p_branch_id,'uploadSales',true);
 return jsonb_build_object('products',coalesce((select jsonb_agg(to_jsonb(p)) from (select id,name,name_ar,default_price,selling_price,tax_rate from public.products where restaurant_id=p_restaurant_id and (branch_id is null or branch_id=p_branch_id) and coalesce(is_active,true) and (coalesce(name,'')||' '||coalesce(name_ar,'')) ilike '%'||coalesce(p_search,'')||'%' order by name limit 100) p),'[]'::jsonb),
 'inventory',coalesce((select jsonb_agg(to_jsonb(i)) from (select id,product_name,quantity,unit from public.inventory where restaurant_id=p_restaurant_id and branch_id=p_branch_id order by product_name limit 1000) i),'[]'::jsonb));
end $$;

create function restaurant_pos_private.kitchen(p_order_id uuid,p_revision integer,p_status text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o restaurant_pos_private.orders; d restaurant_pos_private.terminals;
begin
 select t.* into d from restaurant_pos_private.terminals t join restaurant_pos_private.orders x on x.device_id=t.id where x.id=p_order_id;
 perform restaurant_pos_private.guard(d.restaurant_id,d.branch_id,'viewOrders');
 select * into o from restaurant_pos_private.orders where id=p_order_id for update;
 if o.revision<>p_revision then raise exception 'Order changed; refresh the kitchen.' using errcode='40001'; end if;
 if o.status='cancelled' or p_status is distinct from (case o.kitchen_status when 'queued' then 'preparing' when 'preparing' then 'ready' when 'ready' then 'served' end) then raise exception 'Invalid kitchen transition.' using errcode='23514'; end if;
 if p_status='served' and o.status<>'paid' then raise exception 'Payment is required before handing over.' using errcode='23514'; end if;
 update restaurant_pos_private.orders set kitchen_status=p_status,revision=revision+1,updated_at=now() where id=o.id;
 insert into restaurant_pos_private.events(device_id,order_id,actor,action) values(d.id,o.id,auth.uid(),'kitchen_'||p_status);
 perform realtime.send('{}'::jsonb,'changed','restaurant-pos:'||d.restaurant_id,false);
 perform realtime.send('{}'::jsonb,'changed','cashier:'||d.id,false);
 return jsonb_build_object('ok',true);
end $$;

create function restaurant_pos_private.display(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare ds restaurant_pos_private.displays; d restaurant_pos_private.terminals; o restaurant_pos_private.orders; result jsonb;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid display link.' using errcode='42501'; end if;
 select * into ds from restaurant_pos_private.displays where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>now();
 if ds.device_id is null or not exists(select 1 from restaurant_pos_private.shifts where device_id=ds.device_id and closed_at is null) then raise exception 'Display expired or disconnected.' using errcode='42501'; end if;
 select * into d from restaurant_pos_private.terminals where id=ds.device_id;
 if not exists(select 1 from public.restaurants where id=d.restaurant_id and lower(btrim(coalesce(nullif(business_type,''),business_mode::text,''))) in ('restaurant','cafe')) then raise exception 'Display unavailable.' using errcode='42501'; end if;
 select * into o from restaurant_pos_private.orders where id=ds.order_id and status in ('open','held','paid');
 select jsonb_build_object('business_name',r.name,'branch_name',b.name,'currency',r.currency,'device_code',d.code,'topic',ds.topic,
  'status',o.status,'number',o.number,'lines',coalesce((select jsonb_agg(jsonb_build_object('product_id',v->>'menu_id','name',v->>'name','name_en',v->>'name','name_ar',v->>'name_ar','quantity',v->'quantity','unit_price',v->'unit_price','line_total',v->'line_total')) from jsonb_array_elements(o.lines) v),'[]'::jsonb),
  'net_total',coalesce(o.net_total,0),'tax_total',coalesce(o.tax_total,0),'subtotal',coalesce(o.subtotal,0),'units',coalesce((select sum((v->>'quantity')::numeric) from jsonb_array_elements(o.lines) v),0)) into result
 from public.restaurants r join public.branches b on b.restaurant_id=r.id where r.id=d.restaurant_id and b.id=d.branch_id;
 return result;
end $$;

-- An immutable bridge into existing ERP reports and treasury; never re-post at shift close.
create unique index restaurant_pos_sales_once on public.daily_sales(reference_id) where reference_id like 'restaurant-pos:%';
create function restaurant_pos_private.protect_sale() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op<>'INSERT' and old.reference_id like 'restaurant-pos:%' then raise exception 'POS receipts are immutable; do not edit or delete them through Sales Closing.' using errcode='42501'; end if;
 if tg_op<>'DELETE' and new.reference_id like 'restaurant-pos:%' and current_user not in ('postgres','service_role') then raise exception 'Use the restaurant checkout endpoint.' using errcode='42501'; end if;
 return coalesce(new,old);
end $$;
create trigger restaurant_pos_protect_sale before insert or update or delete on public.daily_sales for each row execute function restaurant_pos_private.protect_sale();
create function restaurant_pos_private.finance_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare r text; begin
 r:=coalesce(to_jsonb(new)->>'restaurant_id',to_jsonb(old)->>'restaurant_id');
 if exists(select 1 from restaurant_pos_private.terminals where restaurant_id::text=r) then perform realtime.send('{}'::jsonb,'changed','restaurant-pos:'||r,false); end if;
 return coalesce(new,old);
end $$;
create trigger restaurant_pos_expenses_changed after insert or update or delete on public.expenses for each row execute function restaurant_pos_private.finance_changed();
create trigger restaurant_pos_purchases_changed after insert or update or delete on public.purchases for each row execute function restaurant_pos_private.finance_changed();

create function public.erp_restaurant_cashier_snapshot(p_device_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select restaurant_pos_private.snapshot(p_device_id) $$;
create function public.erp_restaurant_cashier_command(p_device_id uuid,p_command text,p_payload jsonb,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select restaurant_pos_private.command(p_device_id,p_command,p_payload,p_request_id) $$;
create function public.erp_restaurant_pos_workspace(p_restaurant_id uuid,p_branch_id uuid,p_date date) returns jsonb language sql security invoker set search_path='' as $$ select restaurant_pos_private.workspace(p_restaurant_id,p_branch_id,p_date) $$;
create function public.erp_restaurant_pos_setup(p_restaurant_id uuid,p_branch_id uuid,p_command text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select restaurant_pos_private.setup(p_restaurant_id,p_branch_id,p_command,p_payload) $$;
create function public.erp_restaurant_pos_catalog(p_restaurant_id uuid,p_branch_id uuid,p_search text) returns jsonb language sql security invoker set search_path='' as $$ select restaurant_pos_private.catalog(p_restaurant_id,p_branch_id,p_search) $$;
create function public.erp_restaurant_pos_kitchen(p_order_id uuid,p_revision integer,p_status text) returns jsonb language sql security invoker set search_path='' as $$ select restaurant_pos_private.kitchen(p_order_id,p_revision,p_status) $$;
create function public.erp_restaurant_customer_display(p_token text) returns jsonb language sql security invoker set search_path='' as $$ select restaurant_pos_private.display(p_token) $$;
revoke all on all tables in schema restaurant_pos_private from public,anon,authenticated;
revoke all on all functions in schema restaurant_pos_private from public,anon,authenticated;
grant usage on schema restaurant_pos_private to authenticated,anon;
grant execute on function restaurant_pos_private.snapshot(uuid),restaurant_pos_private.command(uuid,text,jsonb,uuid),restaurant_pos_private.workspace(uuid,uuid,date),restaurant_pos_private.setup(uuid,uuid,text,jsonb),restaurant_pos_private.catalog(uuid,uuid,text),restaurant_pos_private.kitchen(uuid,integer,text) to authenticated;
grant execute on function restaurant_pos_private.display(text) to anon,authenticated;
do $$ declare f record; begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname like 'erp_restaurant_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  execute format('grant execute on function %s to authenticated',f.sig);
 end loop;
end $$;
grant execute on function public.erp_restaurant_customer_display(text) to anon;
notify pgrst,'reload schema';
commit;
