-- Cashier carts are drafts. The existing POS ledger remains the financial source.
create schema retail_checkout_private;
revoke all on schema retail_checkout_private from public, anon, authenticated;
grant usage on schema retail_checkout_private to authenticated, anon;

create table retail_checkout_private.carts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null, branch_id uuid not null, device_id uuid not null,
  shift_id uuid not null references public.retail_pos_shifts(id),
  cashier_id uuid not null, status text not null default 'open'
    check(status in ('open','held','paid','cancelled','expired')),
  revision integer not null default 0,
  discount_percent numeric(5,2) not null default 0 check(discount_percent between 0 and 100),
  discount_by uuid, discount_reason text,
  transaction_id uuid unique references public.retail_pos_transactions(id),
  refund_id uuid unique references public.retail_pos_transactions(id),
  receipt jsonb, refund_receipt jsonb, expires_at timestamptz not null default now()+interval '15 minutes',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(device_id,restaurant_id,branch_id) references public.retail_pos_devices(id,restaurant_id,branch_id)
);
create unique index cashier_one_open_cart on retail_checkout_private.carts(device_id) where status='open';
create index cashier_carts_expiry on retail_checkout_private.carts(expires_at) where status in ('open','held');
create index cashier_carts_shift on retail_checkout_private.carts(shift_id,status);
create index cashier_carts_scope on retail_checkout_private.carts(restaurant_id,branch_id,device_id,created_at desc);
create table retail_checkout_private.lines (
  cart_id uuid not null references retail_checkout_private.carts(id) on delete cascade,
  product_id uuid not null references public.products(id),
  balance_id uuid not null references public.retail_inventory_balances(id),
  quantity numeric(14,3) not null check(quantity>0 and quantity<=99999),
  price numeric(16,2) not null check(price>=0), tax_rate numeric(6,3) not null check(tax_rate between 0 and 100),
  includes_tax boolean not null, name text not null, name_ar text, name_en text, sku text, barcode text, image_url text, unit text,
  created_at timestamptz not null default clock_timestamp(), primary key(cart_id,product_id)
);
create index cashier_lines_balance on retail_checkout_private.lines(balance_id);
create index cashier_lines_product on retail_checkout_private.lines(product_id);
create table retail_checkout_private.requests (
  id uuid primary key, device_id uuid not null references public.retail_pos_devices(id),
  fingerprint text not null, result jsonb not null, created_at timestamptz not null default now()
);
create index cashier_requests_device on retail_checkout_private.requests(device_id,created_at);
create table retail_checkout_private.displays (
  device_id uuid primary key references public.retail_pos_devices(id),
  token_hash text not null unique, topic uuid not null default gen_random_uuid(),
  expires_at timestamptz not null, last_seen_at timestamptz, created_by uuid not null
);
alter table retail_checkout_private.carts enable row level security;
alter table retail_checkout_private.lines enable row level security;
alter table retail_checkout_private.requests enable row level security;
alter table retail_checkout_private.displays enable row level security;
revoke all on all tables in schema retail_checkout_private from public,anon,authenticated;

create function retail_checkout_private.guard(p_device uuid,p_write boolean default false)
returns public.retail_pos_devices language plpgsql stable security definer set search_path='' as $$
declare d public.retail_pos_devices;
begin
  select * into d from public.retail_pos_devices where id=p_device;
  if auth.uid() is null or d.id is null or not public.erp_retail_pos_portal_allowed(d.restaurant_id)
    or not public.erp_can_access_scope(d.restaurant_id,d.branch_id)
    or not public.erp_has_permission(case when p_write then 'uploadSales' else 'viewSales' end) then
    raise exception 'Cashier access denied for this business or branch.' using errcode='42501';
  end if;
  if not public.erp_can_write_scope(d.restaurant_id,d.branch_id) and exists (
    select 1 from public.retail_pos_shifts where device_id=d.id and status in ('open','closing','suspended')
      and cashier_user_id is distinct from auth.uid()
  ) then raise exception 'This lane belongs to another cashier shift.' using errcode='42501'; end if;
  return d;
end $$;

create function retail_checkout_private.cart_json(p_cart uuid) returns jsonb
language sql stable set search_path='' as $$
  with priced as (
    select l.*,c.discount_percent,
      round(l.quantity*l.price*(1-c.discount_percent/100),2) as amount,
      round(l.quantity*l.price,2) as before_discount
    from retail_checkout_private.lines l join retail_checkout_private.carts c on c.id=l.cart_id where c.id=p_cart
  ), calculated as (
    select *,case when includes_tax then amount-round(amount/(1+tax_rate/100),2) else round(amount*tax_rate/100,2) end as tax,
      case when includes_tax then amount else amount+round(amount*tax_rate/100,2) end as total
    from priced
  ) select to_jsonb(c)-'receipt'||jsonb_build_object(
    'lines',coalesce((select jsonb_agg(jsonb_build_object('product_id',product_id,'name',name,'name_ar',name_ar,'name_en',name_en,
      'sku',sku,'barcode',barcode,'image_url',image_url,'unit',unit,'quantity',quantity,'unit_price',price,'tax_rate',tax_rate,
      'includes_tax',includes_tax,'tax_total',tax,'line_total',total,'subtotal',total-tax,
      'discount_total',before_discount-amount) order by created_at,product_id) from calculated),'[]'::jsonb),
    'subtotal',coalesce((select sum(total-tax) from calculated),0), 'tax_total',coalesce((select sum(tax) from calculated),0),
    'net_total',coalesce((select sum(total) from calculated),0), 'discount_total',coalesce((select sum(before_discount-amount) from calculated),0),
    'units',coalesce((select sum(quantity) from calculated),0),'receipt',c.receipt)
  from retail_checkout_private.carts c where c.id=p_cart;
$$;

create function retail_checkout_private.notify(p_device uuid) returns void
language plpgsql set search_path='' as $$
declare topic_id uuid;
begin
  -- Notifications contain no sale data. Receivers must fetch an authorized snapshot.
  perform realtime.send('{"changed":true}'::jsonb,'changed','cashier:'||p_device,false);
  select topic into topic_id from retail_checkout_private.displays where device_id=p_device and expires_at>now();
  if topic_id is not null then perform realtime.send('{"changed":true}'::jsonb,'changed','customer-display:'||topic_id,false); end if;
exception when others then
  -- A websocket outage must never roll back an otherwise valid financial posting.
  raise warning 'Cashier realtime notification unavailable';
end $$;

create function retail_checkout_private.release(p_cart uuid,p_status text) returns void
language plpgsql set search_path='' as $$
declare c retail_checkout_private.carts; l record;
begin
  select * into c from retail_checkout_private.carts where id=p_cart for update;
  if c.status not in ('open','held') then return; end if;
  for l in select * from retail_checkout_private.lines where cart_id=c.id order by product_id loop
    update public.retail_inventory_balances set reserved=reserved-l.quantity,updated_at=now() where id=l.balance_id;
  end loop;
  update retail_checkout_private.carts set status=p_status,revision=revision+1,updated_at=now() where id=c.id;
  perform retail_checkout_private.notify(c.device_id);
end $$;

create function retail_checkout_private.expire_carts() returns void
language plpgsql security definer set search_path='' as $$
declare c record;
begin
  for c in select id from retail_checkout_private.carts where status in ('open','held') and expires_at<now()
    order by expires_at,id for update skip locked limit 100 loop
    perform retail_checkout_private.release(c.id,'expired');
  end loop;
end $$;

create function retail_checkout_private.shift_closed() returns trigger
language plpgsql security definer set search_path='' as $$
declare c record;
begin
  if new.status='closed' and old.status<>'closed' then
    for c in select id from retail_checkout_private.carts where shift_id=new.id and status in ('open','held') order by id for update loop
      perform retail_checkout_private.release(c.id,'cancelled');
    end loop;
    delete from retail_checkout_private.displays where device_id=new.device_id;
  end if;
  return new;
end $$;
create trigger cashier_shift_close after update of status on public.retail_pos_shifts
for each row execute function retail_checkout_private.shift_closed();

create function retail_checkout_private.product(p_device uuid,p_product uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',p.id,'name',p.name,'name_ar',p.name_ar,'name_en',p.name_en,'sku',p.sku,'barcode',p.barcode,
    'unit',p.unit,'image_url',p.image_url,'category',p.category,
    'price',coalesce(a.selling_price_override,p.selling_price,p.default_price,0),'tax_rate',coalesce(p.tax_rate,0),
    'includes_tax',coalesce((p.custom_attributes->'__erp_master'->>'price_includes_tax')::boolean,false),
    'balance_id',b.id,'on_hand',b.quantity,'reserved',b.reserved,'available',greatest(b.quantity-b.reserved-coalesce(l.blocked,0),0),
    'serial_tracked',coalesce(p.serial_tracked,false))
  from public.retail_pos_devices d
  join public.branch_product_assortments a on a.restaurant_id=d.restaurant_id and a.branch_id=d.branch_id and a.is_active and a.sellable
  join public.products p on p.id=a.product_id and p.restaurant_id=d.restaurant_id and p.branch_id is null and coalesce(p.is_active,true) and coalesce(p.status,'active')='active'
  join public.retail_inventory_warehouses w on w.restaurant_id=d.restaurant_id and w.branch_id=d.branch_id and w.is_default and w.is_active
  join public.retail_inventory_balances b on b.warehouse_id=w.id and b.product_id=p.id
  left join lateral (select sum(greatest(quantity,0)) as blocked from public.retail_inventory_lots where balance_id=b.id
    and (quarantined or expiry_date<(now() at time zone 'Asia/Riyadh')::date)) l on true
  where d.id=p_device and p.id=p_product;
$$;

create function retail_checkout_private.snapshot(p_device uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d public.retail_pos_devices; s public.retail_pos_shifts; c uuid; v jsonb;
begin
  d:=retail_checkout_private.guard(p_device);
  select * into s from public.retail_pos_shifts where device_id=d.id and status in ('open','closing','suspended') limit 1;
  select id into c from retail_checkout_private.carts where device_id=d.id and status='open';
  select jsonb_build_object('name',r.name,'address',r.address,'currency',coalesce(r.currency,'SAR'),'branch_name',b.name,'branch_phone',b.phone)
    into v from public.restaurants r join public.branches b on b.restaurant_id=r.id and b.id=d.branch_id where r.id=d.restaurant_id;
  return jsonb_build_object('device',to_jsonb(d),'business',v,'shift',case when s.id is null then null else to_jsonb(s) end,
    'can_manage',public.erp_can_write_scope(d.restaurant_id,d.branch_id),'cart',retail_checkout_private.cart_json(c),
    'display_connected',exists(select 1 from retail_checkout_private.displays where device_id=d.id and expires_at>now() and last_seen_at>now()-interval '90 seconds'),
    'held',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'created_at',h.created_at,'expires_at',h.expires_at,'cart',retail_checkout_private.cart_json(h.id)) order by h.created_at) from retail_checkout_private.carts h where device_id=d.id and h.status='held'),'[]'),
    'receipts',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select id,receipt_number,net_total,transaction_type,created_at from public.retail_pos_transactions
      where device_id=d.id order by created_at desc limit 30) t),'[]'),
    'expected_cash',coalesce(s.opening_cash,0)+coalesce((select sum(case when t.transaction_type='sale' then p.amount else -p.amount end)
      from public.retail_pos_transaction_payments p join public.retail_pos_transactions t on t.id=p.transaction_id
      where p.shift_id=s.id and p.payment_method='cash' and t.status in ('posted','approved')),0));
end $$;

create function retail_checkout_private.catalog(p_device uuid,p_query text,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d public.retail_pos_devices; v jsonb; q text:=left(btrim(coalesce(p_query,'')),120);
begin
  d:=retail_checkout_private.guard(p_device);
  if p_page<1 or p_page>10000 then raise exception 'Invalid catalog page'; end if;
  select jsonb_build_object('rows',coalesce(jsonb_agg(x.product order by x.name,x.id),'[]'),'has_more',coalesce(bool_or(x.has_more),false)) into v from (
    select p.id,p.name,retail_checkout_private.product(d.id,p.id) as product,count(*) over()>p_page*24 as has_more
    from public.branch_product_assortments a join public.products p on p.id=a.product_id and p.restaurant_id=d.restaurant_id
    where a.restaurant_id=d.restaurant_id and a.branch_id=d.branch_id and a.is_active and a.sellable and p.branch_id is null
      and coalesce(p.is_active,true) and coalesce(p.status,'active')='active'
      and (q='' or p.name ilike '%'||q||'%' or p.name_ar ilike '%'||q||'%' or p.name_en ilike '%'||q||'%' or p.barcode_normalized like q||'%' or p.sku_normalized like upper(q)||'%')
    order by p.name,p.id limit 24 offset (p_page-1)*24
  ) x where x.product is not null;
  return v;
end $$;

create function retail_checkout_private.command(p_device uuid,p_command text,p_payload jsonb,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  d public.retail_pos_devices; s public.retail_pos_shifts; c retail_checkout_private.carts; old_line retail_checkout_private.lines;
  b public.retail_inventory_balances; tx public.retail_pos_transactions; original public.retail_pos_transactions;
  approved public.retail_pos_approval_requests; req retail_checkout_private.requests;
  v_product uuid; v_qty numeric; v_product_data jsonb; v_cart jsonb; v_result jsonb; v_receipt jsonb; v_items jsonb; v_payments jsonb;
  v_fingerprint text; v_total numeric; v_cash numeric; v_paid numeric; v_change numeric; v_count integer; v_token text; v_topic uuid; item record;
begin
  d:=retail_checkout_private.guard(p_device,true);
  if p_payload is null or p_command is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>100000 then raise exception 'Invalid cashier request'; end if;
  -- Serialize new commands per lane; active shifts precede device/cart/stock locks,
  -- matching the existing ledger writer and shift-closing endpoints.
  perform pg_advisory_xact_lock(hashtextextended('retail-cashier:'||d.id,0));
  select * into s from public.retail_pos_shifts where device_id=d.id and status in ('open','closing','suspended') for update;
  select * into d from public.retail_pos_devices where id=d.id for update;
  if s.id is not null and s.cashier_user_id is distinct from auth.uid() and not public.erp_can_write_scope(d.restaurant_id,d.branch_id) then
    raise exception 'This lane belongs to another cashier.' using errcode='42501';
  end if;
  if p_request is null then raise exception 'Request ID is required'; end if;
  v_fingerprint:=md5(p_device::text||p_command||p_payload::text);
  select * into req from retail_checkout_private.requests where id=p_request;
  if req.id is not null then
    if req.device_id<>d.id or req.fingerprint<>v_fingerprint then raise exception 'Request ID was reused for a different action' using errcode='22023'; end if;
    return req.result;
  end if;
  -- Never treat a queued hardware command as already applied.
  if p_command='heartbeat' then
    for item in select * from public.retail_pos_device_commands where device_id=d.id and status='queued' and expires_at>now() order by created_at,id limit 20 for update loop
      if item.command_type in ('lock','unlock','sync') then
        if item.command_type in ('lock','unlock') then update public.retail_pos_devices set status=case when item.command_type='lock' then 'locked' else 'online' end where id=d.id; end if;
        perform public.erp_retail_pos_acknowledge_command(item.id,'completed','{"client":"web-cashier"}');
      else perform public.erp_retail_pos_acknowledge_command(item.id,'failed','{"reason":"Requires a supported hardware agent"}'); end if;
    end loop;
    update public.retail_pos_devices set last_seen_at=now(),status=case when status in ('locked','retired','maintenance') then status else 'online' end where id=d.id;
    update retail_checkout_private.carts set expires_at=now()+interval '15 minutes' where device_id=d.id and status='open' and expires_at>now();
    return retail_checkout_private.snapshot(d.id);
  end if;
  if p_command='revoke_display' then
    delete from retail_checkout_private.displays where device_id=d.id;
    return retail_checkout_private.snapshot(d.id);
  end if;
  if d.status in ('locked','retired','maintenance') or exists(select 1 from public.retail_pos_device_commands where device_id=d.id and command_type='lock' and status='queued' and expires_at>now()) then
    raise exception 'This POS is locked or unavailable.' using errcode='55000';
  end if;
  if p_command='open_shift' then
    if coalesce((p_payload->>'opening_cash')::numeric,0) not between 0 and 1000000000 then raise exception 'Invalid opening cash'; end if;
    s:=public.erp_retail_pos_open_shift(d.id,left(btrim(p_payload->>'cashier_name'),100),coalesce((p_payload->>'opening_cash')::numeric,0));
  elsif s.id is null or s.status<>'open' then raise exception 'Open a cashier shift first.' using errcode='55000'; end if;

  if p_command='pair_display' then
    v_token:=encode(extensions.gen_random_bytes(32),'hex');
    insert into retail_checkout_private.displays(device_id,token_hash,expires_at,created_by)
      values(d.id,encode(extensions.digest(v_token,'sha256'),'hex'),now()+interval '8 hours',auth.uid())
      on conflict(device_id) do update set token_hash=excluded.token_hash,topic=gen_random_uuid(),expires_at=excluded.expires_at,last_seen_at=null,created_by=auth.uid()
      returning topic into v_topic;
    return jsonb_build_object('token',v_token,'topic',v_topic,'expires_at',now()+interval '8 hours');
  end if;

  if p_command='close_shift' then
    if (p_payload->>'counted_cash') is null or (p_payload->>'counted_cash')::numeric not between 0 and 1000000000 then raise exception 'Enter the actual counted cash'; end if;
    perform public.erp_retail_pos_close_shift(s.id,(p_payload->>'counted_cash')::numeric,left(p_payload->>'notes',1000));
    v_result:=retail_checkout_private.snapshot(d.id);
  elsif p_command in ('new_sale','open_shift') then
    select * into c from retail_checkout_private.carts where device_id=d.id and status='open' for update;
    if c.id is not null and c.expires_at<now() then perform retail_checkout_private.release(c.id,'expired'); c.id:=null; end if;
    if c.id is null then insert into retail_checkout_private.carts(restaurant_id,branch_id,device_id,shift_id,cashier_id)
      values(d.restaurant_id,d.branch_id,d.id,s.id,coalesce(s.cashier_user_id,auth.uid())) returning * into c; end if;
    v_result:=retail_checkout_private.snapshot(d.id);
  else
    select * into c from retail_checkout_private.carts where id=(p_payload->>'cart_id')::uuid and device_id=d.id for update;
    if c.id is null then raise exception 'Cart not found in this POS.' using errcode='42501'; end if;
    if p_command='checkout' and c.status='paid' then return retail_checkout_private.snapshot(d.id)||jsonb_build_object('receipt',c.receipt); end if;
    if p_command='refund' then
      if not public.erp_can_write_scope(d.restaurant_id,d.branch_id) then raise exception 'Manager approval is required for a refund.' using errcode='42501'; end if;
      if c.status<>'paid' or c.transaction_id is null or c.refund_id is not null or nullif(btrim(p_payload->>'reason'),'') is null or not coalesce((p_payload->>'payment_confirmed')::boolean,false) then raise exception 'Select a paid receipt, enter a reason and confirm money was returned.'; end if;
      select * into original from public.retail_pos_transactions where id=c.transaction_id for update;
      if exists(select 1 from public.retail_pos_transactions where original_transaction_id=original.id and status in ('posted','approved')) then raise exception 'This receipt already has a refund or reversal.'; end if;
      insert into public.retail_pos_approval_requests(restaurant_id,branch_id,device_id,shift_id,transaction_id,request_type,amount,reason,status,requested_by,reviewed_by,reviewed_at)
        values(d.restaurant_id,d.branch_id,d.id,original.shift_id,original.id,'refund',original.net_total,left(p_payload->>'reason',1000),'approved',auth.uid(),auth.uid(),now()) returning * into approved;
      select jsonb_agg(jsonb_build_object('product_id',product_id,'sku',sku,'product_name',product_name,'quantity',quantity,'unit_price',unit_price,'tax_total',tax_total,'discount_total',discount_total,'line_total',line_total) order by product_id)
        into v_items from public.retail_pos_transaction_items where transaction_id=original.id;
      select jsonb_agg(jsonb_build_object('payment_method',payment_method,'amount',amount,'reference','Refund confirmed externally')) into v_payments from public.retail_pos_transaction_payments where transaction_id=original.id;
      tx:=public.erp_retail_pos_record_transaction(jsonb_build_object('shift_id',s.id,'transaction_type','refund','original_transaction_id',original.id,'approval_request_id',approved.id,
        'idempotency_key','cashier-refund:'||c.id,'receipt_number','R-'||original.receipt_number,'subtotal',original.subtotal,'tax_total',original.tax_total,'discount_total',original.discount_total,'net_total',original.net_total,'items',v_items,'payments',v_payments,'notes',left(p_payload->>'reason',1000)));
      v_receipt:=c.receipt||jsonb_build_object('id',tx.id,'receipt_number',tx.receipt_number,'transaction_type','refund','occurred_at',tx.occurred_at,'original_receipt',original.receipt_number,'cashier_name',s.cashier_name,'tendered',original.net_total,'change',0,'payments',v_payments);
      update retail_checkout_private.carts set refund_id=tx.id,refund_receipt=v_receipt,updated_at=now() where id=c.id;
      v_result:=retail_checkout_private.snapshot(d.id)||jsonb_build_object('receipt',v_receipt);
    else
      if c.shift_id<>s.id or c.status not in ('open','held') then raise exception 'This cart is not editable.'; end if;
      if c.expires_at<now() then raise exception 'Cart reservation expired. Start a new sale.' using errcode='55000'; end if;
      if (p_payload->>'revision')::integer is distinct from c.revision then raise exception 'Cart changed on another screen. Refresh before retrying.' using errcode='40001'; end if;
      if p_command in ('scan','quantity') then
        if c.status<>'open' then raise exception 'Resume the held sale first'; end if;
        if p_command='scan' then
          select count(*),(array_agg(p.id))[1] into v_count,v_product from public.products p join public.branch_product_assortments a on a.product_id=p.id
            where p.restaurant_id=d.restaurant_id and a.restaurant_id=d.restaurant_id and a.branch_id=d.branch_id and a.is_active and a.sellable
              and (p.barcode_normalized=btrim(p_payload->>'code') or p.sku_normalized=upper(btrim(p_payload->>'code')) or a.branch_sku=btrim(p_payload->>'code'));
          if v_count<>1 then raise exception 'Barcode not found or ambiguous in this branch. Search and select the product.' using errcode='22023'; end if;
          select * into old_line from retail_checkout_private.lines where cart_id=c.id and product_id=v_product;
          v_qty:=coalesce(old_line.quantity,0)+1;
        else v_product:=(p_payload->>'product_id')::uuid; v_qty:=(p_payload->>'quantity')::numeric;
          select * into old_line from retail_checkout_private.lines where cart_id=c.id and product_id=v_product;
        end if;
        if v_qty is null or v_qty not between 0 and 99999 or v_qty<>round(v_qty,3) then raise exception 'Quantity must be between 0 and 99,999, with up to 3 decimals.'; end if;
        v_product_data:=retail_checkout_private.product(d.id,v_product);
        if v_product_data is null and v_qty>0 then raise exception 'Product is not sellable or has no stock location in this branch.'; end if;
        if coalesce((v_product_data->>'serial_tracked')::boolean,false) then raise exception 'Serial-tracked products require serial capture before sale.'; end if;
        select * into b from public.retail_inventory_balances where id=coalesce((v_product_data->>'balance_id')::uuid,old_line.balance_id) for update;
        v_product_data:=retail_checkout_private.product(d.id,v_product);
        if v_qty>coalesce(old_line.quantity,0)+(v_product_data->>'available')::numeric then raise exception 'Insufficient available stock in this branch.' using errcode='23514'; end if;
        if v_qty>0 and old_line.cart_id is null and (select count(*) from retail_checkout_private.lines where cart_id=c.id)>=200 then raise exception 'Maximum 200 product lines per sale'; end if;
        update public.retail_inventory_balances set reserved=reserved+v_qty-coalesce(old_line.quantity,0),updated_at=now() where id=b.id;
        if v_qty=0 then delete from retail_checkout_private.lines where cart_id=c.id and product_id=v_product;
        else insert into retail_checkout_private.lines(cart_id,product_id,balance_id,quantity,price,tax_rate,includes_tax,name,name_ar,name_en,sku,barcode,image_url,unit)
          values(c.id,v_product,b.id,v_qty,(v_product_data->>'price')::numeric,(v_product_data->>'tax_rate')::numeric,(v_product_data->>'includes_tax')::boolean,
            v_product_data->>'name',v_product_data->>'name_ar',v_product_data->>'name_en',v_product_data->>'sku',v_product_data->>'barcode',v_product_data->>'image_url',v_product_data->>'unit')
          on conflict(cart_id,product_id) do update set quantity=excluded.quantity,price=excluded.price,tax_rate=excluded.tax_rate,includes_tax=excluded.includes_tax;
        end if;
      elsif p_command='discount' then
        if c.status<>'open' or not public.erp_can_write_scope(d.restaurant_id,d.branch_id) then raise exception 'Only an authorized owner or manager can discount this sale.' using errcode='42501'; end if;
        if (p_payload->>'percent') is null or (p_payload->>'percent')::numeric not between 0 and 100 or nullif(btrim(p_payload->>'reason'),'') is null then raise exception 'Enter a discount from 0 to 100 and a reason'; end if;
        update retail_checkout_private.carts set discount_percent=(p_payload->>'percent')::numeric,discount_by=auth.uid(),discount_reason=left(p_payload->>'reason',500) where id=c.id;
        insert into public.retail_pos_device_events(restaurant_id,branch_id,device_id,shift_id,event_type,title,details) values(d.restaurant_id,d.branch_id,d.id,s.id,'discount_authorized','Cashier discount authorized',jsonb_build_object('cart_id',c.id,'percent',p_payload->>'percent','reason',left(p_payload->>'reason',500)));
      elsif p_command='hold' then
        if c.status<>'open' then raise exception 'Only an open cart can be held'; end if;
        update retail_checkout_private.carts set status='held',expires_at=now()+interval '30 minutes' where id=c.id;
      elsif p_command='resume' then
        if c.status<>'held' then raise exception 'Only a held cart can be resumed'; end if;
        if exists(select 1 from retail_checkout_private.lines l join retail_checkout_private.carts active on active.id=l.cart_id where active.device_id=d.id and active.status='open') then raise exception 'Hold or cancel the current sale first'; end if;
        for item in select id from retail_checkout_private.carts where device_id=d.id and status='open' for update loop perform retail_checkout_private.release(item.id,'cancelled'); end loop;
        update retail_checkout_private.carts set status='open' where id=c.id;
      elsif p_command='cancel' then perform retail_checkout_private.release(c.id,'cancelled');
      elsif p_command='checkout' then
        if c.status<>'open' then raise exception 'Resume this cart before payment'; end if;
        v_cart:=retail_checkout_private.cart_json(c.id); v_total:=(v_cart->>'net_total')::numeric;
        if jsonb_array_length(v_cart->'lines')=0 then raise exception 'Scan at least one product'; end if;
        if not coalesce((p_payload->>'payment_confirmed')::boolean,false) then raise exception 'Confirm that payment was received'; end if;
        if p_payload->'payments' is null or jsonb_typeof(p_payload->'payments')<>'array' or jsonb_array_length(p_payload->'payments') not between 1 and 4 then raise exception 'Choose a valid payment method'; end if;
        if exists(select 1 from jsonb_array_elements(p_payload->'payments') payment where payment->>'payment_method' is null or payment->>'payment_method' not in ('cash','mada','card','apple_pay') or (payment->>'amount') is null or (payment->>'amount')::numeric not between 0 and 1000000000 or (payment->>'amount')::numeric<>round((payment->>'amount')::numeric,2)) then raise exception 'Invalid payment amount or method'; end if;
        select sum((payment->>'amount')::numeric),coalesce(sum((payment->>'amount')::numeric) filter(where payment->>'payment_method'='cash'),0) into v_paid,v_cash from jsonb_array_elements(p_payload->'payments') payment;
        if v_paid<v_total or v_paid-v_cash>v_total then raise exception 'Payment must cover the total; change can only come from cash.'; end if;
        v_change:=v_paid-v_total;
        if (select count(*) from jsonb_array_elements(p_payload->'payments') payment where payment->>'payment_method'='cash')>1 then raise exception 'Use one cash payment line'; end if;
        select jsonb_agg(jsonb_build_object('payment_method',payment->>'payment_method','amount',(payment->>'amount')::numeric-case when payment->>'payment_method'='cash' then v_change else 0 end,'reference',left(payment->>'reference',120))) into v_payments from jsonb_array_elements(p_payload->'payments') payment;
        for item in select * from retail_checkout_private.lines where cart_id=c.id order by product_id loop
          select * into b from public.retail_inventory_balances where id=item.balance_id for update;
          v_product_data:=retail_checkout_private.product(d.id,item.product_id);
          if v_product_data is null or (v_product_data->>'on_hand')::numeric<item.quantity then raise exception 'A product is unavailable. Refresh the cart.'; end if;
          if (v_product_data->>'price')::numeric<>item.price or (v_product_data->>'tax_rate')::numeric<>item.tax_rate or (v_product_data->>'includes_tax')::boolean<>item.includes_tax then raise exception 'A price changed. Update that product quantity to refresh its price before payment.'; end if;
          if b.quantity-b.reserved-coalesce((select sum(greatest(quantity,0)) from public.retail_inventory_lots where balance_id=b.id and (quarantined or expiry_date<(now() at time zone 'Asia/Riyadh')::date)),0)<0 then raise exception 'Reserved stock is no longer available; review the cart.'; end if;
          update public.retail_inventory_balances set reserved=reserved-item.quantity,updated_at=now() where id=b.id;
        end loop;
        select jsonb_agg(line||jsonb_build_object('product_name',line->>'name') order by line->>'product_id') into v_items from jsonb_array_elements(v_cart->'lines') line;
        tx:=public.erp_retail_pos_record_transaction(jsonb_build_object('shift_id',s.id,'idempotency_key','cashier-cart:'||c.id,
          'receipt_number',d.code||'-'||upper(replace(c.id::text,'-','')),'subtotal',v_cart->'subtotal','tax_total',v_cart->'tax_total','discount_total',v_cart->'discount_total','net_total',v_total,'items',v_items,'payments',v_payments));
        v_receipt:=v_cart-'receipt'||jsonb_build_object('id',tx.id,'cart_id',c.id,'receipt_number',tx.receipt_number,'transaction_type','sale','occurred_at',tx.occurred_at,
          'cashier_name',s.cashier_name,'device_code',d.code,'shift_id',s.id,'business',retail_checkout_private.snapshot(d.id)->'business','payments',v_payments,'tendered',v_paid,'change',v_change);
        update retail_checkout_private.carts set status='paid',transaction_id=tx.id,receipt=v_receipt where id=c.id;
      else raise exception 'Unsupported cashier command'; end if;
      update retail_checkout_private.carts set revision=revision+1,updated_at=now(),expires_at=case when status='held' then expires_at else now()+interval '15 minutes' end where id=c.id;
      v_result:=retail_checkout_private.snapshot(d.id)||case when v_receipt is null then '{}'::jsonb else jsonb_build_object('receipt',v_receipt) end;
    end if;
  end if;
  insert into retail_checkout_private.requests(id,device_id,fingerprint,result) values(p_request,d.id,v_fingerprint,v_result);
  perform retail_checkout_private.notify(d.id);
  return v_result;
end $$;

create function retail_checkout_private.receipt(p_device uuid,p_transaction uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d public.retail_pos_devices; c retail_checkout_private.carts;
begin
  d:=retail_checkout_private.guard(p_device);
  select * into c from retail_checkout_private.carts where device_id=d.id and (transaction_id=p_transaction or refund_id=p_transaction);
  if c.id is null then raise exception 'Detailed receipt is available for sales made in this cashier workspace.'; end if;
  if c.refund_id=p_transaction then return c.refund_receipt; end if;
  return c.receipt||jsonb_build_object('refunded',c.refund_id is not null);
end $$;

create function retail_checkout_private.customer_display(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare link retail_checkout_private.displays; d public.retail_pos_devices; c retail_checkout_private.carts; v jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Display link is invalid or expired.' using errcode='42501'; end if;
  select * into link from retail_checkout_private.displays where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>now();
  if link.device_id is null then raise exception 'Display link is invalid or expired.' using errcode='42501'; end if;
  select * into d from public.retail_pos_devices where id=link.device_id;
  if not public.erp_retail_pos_portal_allowed(d.restaurant_id) or not exists(select 1 from public.retail_pos_shifts where device_id=d.id and status='open') then raise exception 'Cashier display is closed.' using errcode='42501'; end if;
  update retail_checkout_private.displays set last_seen_at=now() where device_id=d.id and (last_seen_at is null or last_seen_at<now()-interval '30 seconds');
  select * into c from retail_checkout_private.carts where device_id=d.id and ((status='open' and expires_at>now()) or (status='paid' and updated_at>now()-interval '90 seconds')) order by (status='open') desc,updated_at desc limit 1;
  v:=retail_checkout_private.cart_json(c.id);
  -- Deliberate allowlist: no auth user IDs, inventory, cost, profit, payment references or customer identity.
  return jsonb_build_object('topic',link.topic,'expires_at',link.expires_at,'device_code',d.code,'branch_name',(select name from public.branches where id=d.branch_id),
    'business_name',(select name from public.restaurants where id=d.restaurant_id),'currency',(select coalesce(currency,'SAR') from public.restaurants where id=d.restaurant_id),
    'status',coalesce(c.status,'idle'),'revision',c.revision,'updated_at',c.updated_at,'subtotal',coalesce(v->'subtotal','0'),'tax_total',coalesce(v->'tax_total','0'),
    'net_total',coalesce(v->'net_total','0'),'units',coalesce(v->'units','0'),'lines',coalesce(v->'lines','[]'));
end $$;

-- Public API wrappers remain invoker functions; privileged implementation is private.
create function public.erp_retail_cashier_snapshot(p_device_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select retail_checkout_private.snapshot(p_device_id); $$;
create function public.erp_retail_cashier_catalog(p_device_id uuid,p_query text default '',p_page integer default 1) returns jsonb language sql security invoker set search_path='' as $$ select retail_checkout_private.catalog(p_device_id,p_query,p_page); $$;
create function public.erp_retail_cashier_command(p_device_id uuid,p_command text,p_payload jsonb,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select retail_checkout_private.command(p_device_id,p_command,p_payload,p_request_id); $$;
create function public.erp_retail_cashier_receipt(p_device_id uuid,p_transaction_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select retail_checkout_private.receipt(p_device_id,p_transaction_id); $$;
create function public.erp_retail_customer_display(p_token text) returns jsonb language sql security invoker set search_path='' as $$ select retail_checkout_private.customer_display(p_token); $$;
revoke all on all functions in schema retail_checkout_private from public,anon,authenticated;
grant execute on function retail_checkout_private.snapshot(uuid),retail_checkout_private.catalog(uuid,text,integer),retail_checkout_private.command(uuid,text,jsonb,uuid),retail_checkout_private.receipt(uuid,uuid) to authenticated;
grant execute on function retail_checkout_private.customer_display(text) to anon,authenticated;
revoke all on function public.erp_retail_cashier_snapshot(uuid),public.erp_retail_cashier_catalog(uuid,text,integer),public.erp_retail_cashier_command(uuid,text,jsonb,uuid),public.erp_retail_cashier_receipt(uuid,uuid),public.erp_retail_customer_display(text) from public,anon,authenticated;
grant execute on function public.erp_retail_cashier_snapshot(uuid),public.erp_retail_cashier_catalog(uuid,text,integer),public.erp_retail_cashier_command(uuid,text,jsonb,uuid),public.erp_retail_cashier_receipt(uuid,uuid) to authenticated;
grant execute on function public.erp_retail_customer_display(text) to anon,authenticated;

-- Browser sales must use server-priced, stock-checked checkout, not the legacy
-- trusted-payload writer. Internal definer code and backend service retain access.
revoke execute on function public.erp_retail_pos_record_transaction(jsonb) from authenticated;

create extension if not exists pg_cron;
select cron.schedule('retail-cashier-reservation-expiry','* * * * *','select retail_checkout_private.expire_carts()');
