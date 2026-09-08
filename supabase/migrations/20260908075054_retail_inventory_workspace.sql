-- Retail inventory: one physical ledger, tenant-scoped warehouses and reviewed documents.
-- Existing restaurant inventory remains unchanged. Retail currently has no legacy stock rows.
create schema if not exists retail_inventory_private;
revoke all on schema retail_inventory_private from public, anon;
grant usage on schema retail_inventory_private to authenticated;

create function retail_inventory_private.allowed(p_restaurant uuid, p_branch uuid, p_permission text default 'viewInventory', p_owner boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and public.erp_retail_pos_portal_allowed(p_restaurant)
    and public.erp_subscription_has_erp_access(p_restaurant)
    and exists (
      select 1 from public.erp_memberships m
      left join public.erp_role_permissions rp on rp.restaurant_id=m.restaurant_id and rp.role=m.role
      where m.restaurant_id=p_restaurant and m.user_id=auth.uid() and m.status='approved'
        and (m.role='owner' or (not p_owner and (p_branch is null or m.branch_id=p_branch)
          and coalesce((public.erp_effective_permissions(m.role,m.permissions,rp.permissions)->>p_permission)::boolean,false)))
    );
$$;
revoke all on function retail_inventory_private.allowed(uuid,uuid,text,boolean) from public,anon;
grant execute on function retail_inventory_private.allowed(uuid,uuid,text,boolean) to authenticated;

create function retail_inventory_private.resolve_product(p_restaurant uuid,p_identity text) returns uuid
language sql stable security definer set search_path='' as $$
  select id from public.products where restaurant_id=p_restaurant
    and (id::text=p_identity or product_id=p_identity or sku=p_identity)
  order by (id::text=p_identity) desc,id limit 1;
$$;

create table public.retail_inventory_warehouses (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
  branch_id uuid not null references public.branches(id), name text not null check (length(btrim(name)) between 1 and 100),
  is_default boolean not null default false, is_active boolean not null default true, created_at timestamptz not null default now(),
  unique(branch_id,name), unique(id,restaurant_id,branch_id)
);
create unique index retail_inventory_default_warehouse on public.retail_inventory_warehouses(branch_id) where is_default;
create index retail_inventory_warehouses_scope on public.retail_inventory_warehouses(restaurant_id,branch_id);

create table public.retail_inventory_balances (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null, branch_id uuid not null,
  warehouse_id uuid not null, product_id uuid not null references public.products(id),
  quantity numeric(18,3) not null default 0, reserved numeric(18,3) not null default 0 check(reserved>=0),
  average_cost numeric(18,6) not null default 0 check(average_cost>=0), version bigint not null default 0,
  min_stock numeric(18,3), max_stock numeric(18,3), pack_size numeric(12,3) not null default 1 check(pack_size>0), bin_location text,
  updated_at timestamptz not null default now(), unique(warehouse_id,product_id),
  foreign key(warehouse_id,restaurant_id,branch_id) references public.retail_inventory_warehouses(id,restaurant_id,branch_id),
  unique(id,restaurant_id,branch_id)
);
create index retail_inventory_balances_scope on public.retail_inventory_balances(restaurant_id,branch_id,product_id);
create index retail_inventory_balances_product on public.retail_inventory_balances(product_id);

create table public.retail_inventory_lots (
  id uuid primary key default gen_random_uuid(), balance_id uuid not null, restaurant_id uuid not null, branch_id uuid not null,
  batch_number text not null default '', expiry_date date, quantity numeric(18,3) not null default 0,
  unit_cost numeric(18,6) not null default 0 check(unit_cost>=0), quarantined boolean not null default false,
  updated_at timestamptz not null default now(),
  foreign key(balance_id,restaurant_id,branch_id) references public.retail_inventory_balances(id,restaurant_id,branch_id),
  unique nulls not distinct(balance_id,batch_number,expiry_date,quarantined)
);
create index retail_inventory_lots_fefo on public.retail_inventory_lots(balance_id,expiry_date) where quantity>0;
create index retail_inventory_lots_expiry on public.retail_inventory_lots(restaurant_id,expiry_date) where quantity>0;

create table public.retail_inventory_documents (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
  branch_id uuid not null references public.branches(id), warehouse_id uuid not null references public.retail_inventory_warehouses(id),
  destination_warehouse_id uuid references public.retail_inventory_warehouses(id),
  document_number text not null, kind text not null check(kind in ('receipt','transfer','adjustment','return','count','reorder')),
  status text not null default 'requested' check(status in ('draft','requested','approved','in_transit','received','posted','rejected','cancelled')),
  notes text, source_purchase_order_id uuid references public.purchase_orders(id), supplier_id uuid references public.suppliers(id),
  created_by uuid not null references auth.users(id), reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  request_key text not null check(length(request_key) between 8 and 120),
  unique(restaurant_id,request_key), unique(restaurant_id,document_number), unique(id,restaurant_id,branch_id)
);
create index retail_inventory_documents_scope on public.retail_inventory_documents(restaurant_id,branch_id,status,created_at desc);
create index retail_inventory_documents_warehouse on public.retail_inventory_documents(warehouse_id);
create index retail_inventory_documents_destination on public.retail_inventory_documents(destination_warehouse_id);
create index retail_inventory_documents_po on public.retail_inventory_documents(source_purchase_order_id);
create index retail_inventory_documents_supplier on public.retail_inventory_documents(supplier_id);
create index retail_inventory_documents_creator on public.retail_inventory_documents(created_by);
create index retail_inventory_documents_reviewer on public.retail_inventory_documents(reviewed_by);

create table public.retail_inventory_lines (
  id uuid primary key default gen_random_uuid(), document_id uuid not null, restaurant_id uuid not null, branch_id uuid not null,
  product_id uuid not null references public.products(id), quantity numeric(18,3) not null default 0,
  unit_cost numeric(18,6) not null default 0 check(unit_cost>=0), batch_number text not null default '', expiry_date date,
  lot_id uuid references public.retail_inventory_lots(id), expected_quantity numeric(18,3), counted_quantity numeric(18,3) check(counted_quantity>=0),
  snapshot_version bigint, allocations jsonb not null default '[]',
  foreign key(document_id,restaurant_id,branch_id) references public.retail_inventory_documents(id,restaurant_id,branch_id)
);
create index retail_inventory_lines_document on public.retail_inventory_lines(document_id);
create index retail_inventory_lines_product on public.retail_inventory_lines(product_id);
create index retail_inventory_lines_lot on public.retail_inventory_lines(lot_id);
create index retail_inventory_lines_scope on public.retail_inventory_lines(restaurant_id,branch_id);

create table public.retail_inventory_ledger (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null, branch_id uuid not null,
  balance_id uuid not null, product_id uuid not null references public.products(id), quantity numeric(18,3) not null,
  unit_cost numeric(18,6) not null, balance_after numeric(18,3) not null,
  kind text not null, reference_id uuid, reference_label text, document_id uuid references public.retail_inventory_documents(id),
  event_key text not null unique, actor_id uuid references auth.users(id), created_at timestamptz not null default now(),
  foreign key(balance_id,restaurant_id,branch_id) references public.retail_inventory_balances(id,restaurant_id,branch_id)
);
create index retail_inventory_ledger_scope on public.retail_inventory_ledger(restaurant_id,branch_id,created_at desc);
create index retail_inventory_ledger_balance on public.retail_inventory_ledger(balance_id,created_at desc);
create index retail_inventory_ledger_product on public.retail_inventory_ledger(product_id);
create index retail_inventory_ledger_document on public.retail_inventory_ledger(document_id);
create index retail_inventory_ledger_actor on public.retail_inventory_ledger(actor_id);

create table public.retail_inventory_audit (
  id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id),
  branch_id uuid not null references public.branches(id), document_id uuid references public.retail_inventory_documents(id),
  action text not null, detail text, actor_id uuid references auth.users(id), created_at timestamptz not null default now()
);
create index retail_inventory_audit_scope on public.retail_inventory_audit(restaurant_id,branch_id,created_at desc);
create index retail_inventory_audit_document on public.retail_inventory_audit(document_id);
create index retail_inventory_audit_actor on public.retail_inventory_audit(actor_id);

do $$ declare t text; begin
  foreach t in array array['retail_inventory_warehouses','retail_inventory_balances','retail_inventory_lots','retail_inventory_documents','retail_inventory_lines','retail_inventory_ledger','retail_inventory_audit'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy retail_inventory_read on public.%I for select to authenticated using (retail_inventory_private.allowed(restaurant_id,branch_id))',t);
  end loop;
end $$;

create function retail_inventory_private.default_warehouse(p_restaurant uuid,p_branch uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.branches where id=p_branch and restaurant_id=p_restaurant) then raise exception 'Invalid branch' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_branch::text,17));
  select id into v_id from public.retail_inventory_warehouses where branch_id=p_branch and is_default;
  if v_id is null then insert into public.retail_inventory_warehouses(restaurant_id,branch_id,name,is_default) values(p_restaurant,p_branch,'Main store',true) returning id into v_id; end if;
  return v_id;
end $$;

-- All stock writes lock one balance. Outgoing lots use FEFO; sales shortages stay visible.
create function retail_inventory_private.post(
  p_restaurant uuid,p_warehouse uuid,p_product uuid,p_quantity numeric,p_cost numeric,p_kind text,
  p_reference uuid,p_label text,p_key text,p_document uuid default null,p_batch text default '',p_expiry date default null,
  p_allow_shortage boolean default false,p_quarantine boolean default false,p_lot uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.retail_inventory_warehouses; b public.retail_inventory_balances; l public.retail_inventory_lots;
  v_cost numeric; v_remaining numeric; v_take numeric; v_alloc jsonb:='[]'; v_blocked numeric;
begin
  if exists(select 1 from public.retail_inventory_ledger where event_key=p_key) then return '[]'; end if;
  if p_cost is null or p_cost<0 or p_cost='NaN'::numeric or p_cost>1000000000 then raise exception 'Invalid stock cost'; end if;
  if p_quantity is null or p_quantity='NaN'::numeric or p_quantity=0 or abs(p_quantity)>1000000000 then raise exception 'Invalid stock quantity' using errcode='22023'; end if;
  select * into w from public.retail_inventory_warehouses where id=p_warehouse and restaurant_id=p_restaurant and is_active;
  if w.id is null or not exists(select 1 from public.products where id=p_product and restaurant_id=p_restaurant) then raise exception 'Product and warehouse must belong to this business' using errcode='42501'; end if;
  insert into public.retail_inventory_balances(restaurant_id,branch_id,warehouse_id,product_id) values(p_restaurant,w.branch_id,w.id,p_product) on conflict(warehouse_id,product_id) do nothing;
  select * into b from public.retail_inventory_balances where warehouse_id=w.id and product_id=p_product for update;
  if exists(select 1 from public.retail_inventory_ledger where event_key=p_key) then return '[]'; end if;
  v_cost:=case when p_quantity>0 then greatest(coalesce(p_cost,b.average_cost,0),0) else b.average_cost end;
  if p_quantity<0 then
    select coalesce(sum(greatest(quantity,0)),0) into v_blocked from public.retail_inventory_lots where balance_id=b.id and (quarantined or expiry_date < (now() at time zone 'Asia/Riyadh')::date);
    if not p_allow_shortage and p_lot is null and b.quantity-b.reserved-v_blocked < -p_quantity then raise exception 'Insufficient available stock' using errcode='23514'; end if;
    v_remaining:=-p_quantity;
    for l in select * from public.retail_inventory_lots where balance_id=b.id and quantity>0
      and (p_lot is null or id=p_lot) and (p_lot is not null or (not quarantined and (expiry_date is null or expiry_date >= (now() at time zone 'Asia/Riyadh')::date)))
      order by expiry_date nulls last,id for update loop
      v_take:=least(v_remaining,l.quantity);
      update public.retail_inventory_lots set quantity=quantity-v_take,updated_at=now() where id=l.id;
      v_alloc:=v_alloc||jsonb_build_array(jsonb_build_object('quantity',v_take,'batch_number',l.batch_number,'expiry_date',l.expiry_date,'unit_cost',v_cost,'quarantined',l.quarantined));
      v_remaining:=v_remaining-v_take; exit when v_remaining=0;
    end loop;
    if v_remaining>0 then
      if not p_allow_shortage then raise exception 'Insufficient stock in the selected batch' using errcode='23514'; end if;
      insert into public.retail_inventory_lots(balance_id,restaurant_id,branch_id,quantity,unit_cost) values(b.id,p_restaurant,w.branch_id,-v_remaining,v_cost)
        on conflict(balance_id,batch_number,expiry_date,quarantined) do update set quantity=public.retail_inventory_lots.quantity+excluded.quantity,updated_at=now();
    end if;
  else
    insert into public.retail_inventory_lots(balance_id,restaurant_id,branch_id,batch_number,expiry_date,quantity,unit_cost,quarantined)
      values(b.id,p_restaurant,w.branch_id,coalesce(p_batch,''),p_expiry,p_quantity,v_cost,p_quarantine)
      on conflict(balance_id,batch_number,expiry_date,quarantined) do update set quantity=public.retail_inventory_lots.quantity+excluded.quantity,unit_cost=excluded.unit_cost,updated_at=now();
  end if;
  update public.retail_inventory_balances set quantity=quantity+p_quantity,
    average_cost=case when p_quantity>0 then (greatest(quantity,0)*average_cost+p_quantity*v_cost)/(greatest(quantity,0)+p_quantity) else average_cost end,
    version=version+1,updated_at=now() where id=b.id;
  insert into public.retail_inventory_ledger(restaurant_id,branch_id,balance_id,product_id,quantity,unit_cost,balance_after,kind,reference_id,reference_label,event_key,document_id,actor_id)
    values(p_restaurant,w.branch_id,b.id,p_product,p_quantity,v_cost,b.quantity+p_quantity,p_kind,p_reference,p_label,p_key,p_document,auth.uid());
  return v_alloc;
end $$;

create function retail_inventory_private.immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Posted inventory history is immutable; use a reviewed reversal' using errcode='55000'; end $$;
create trigger retail_inventory_ledger_immutable before update or delete on public.retail_inventory_ledger for each row execute function retail_inventory_private.immutable();
create trigger retail_inventory_audit_immutable before update or delete on public.retail_inventory_audit for each row execute function retail_inventory_private.immutable();

-- Private posting helpers are never callable by clients.
revoke all on all functions in schema retail_inventory_private from public,anon,authenticated;
grant execute on function retail_inventory_private.allowed(uuid,uuid,text,boolean) to authenticated;

alter table public.purchases add column inventory_receipt_line_id uuid references public.retail_inventory_lines(id);
create unique index purchases_inventory_receipt_line on public.purchases(inventory_receipt_line_id) where inventory_receipt_line_id is not null;

create function retail_inventory_private.assortment_added() returns trigger language plpgsql security definer set search_path='' as $$
declare w uuid;
begin
  if new.is_active and public.erp_retail_pos_portal_allowed(new.restaurant_id) then
    if not exists(select 1 from public.products where id=new.product_id and restaurant_id=new.restaurant_id) then raise exception 'Invalid product scope' using errcode='42501'; end if;
    w:=retail_inventory_private.default_warehouse(new.restaurant_id,new.branch_id);
    insert into public.retail_inventory_balances(restaurant_id,branch_id,warehouse_id,product_id)
      values(new.restaurant_id,new.branch_id,w,new.product_id) on conflict(warehouse_id,product_id) do nothing;
  end if;
  return new;
end $$;
create trigger retail_inventory_assortment_added after insert or update of is_active on public.branch_product_assortments for each row execute function retail_inventory_private.assortment_added();

create function retail_inventory_private.source_delta(p_type text,p_quantity numeric) returns numeric
language sql immutable set search_path='' as $$
  select case when p_type in ('stock_out','recipe_consumption','transfer_out','waste','sale') then -abs(p_quantity)
    when p_type in ('stock_in','purchase','transfer_in','opening') then abs(p_quantity)
    when p_type='adjustment' then p_quantity else 0 end;
$$;

create function retail_inventory_private.legacy_stock() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb; oldj jsonb; v_restaurant uuid; v_branch uuid; v_product uuid; v_warehouse uuid; v_delta numeric; v_cost numeric;
  v_event text; v_doc uuid; v_batch text:=''; v_expiry date; v_line public.retail_inventory_lines; v_id uuid; v_step text;
begin
  j:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_restaurant:=(j->>'restaurant_id')::uuid;
  if not public.erp_retail_pos_portal_allowed(v_restaurant) then return coalesce(new,old); end if;
  if tg_table_name='purchases' and tg_op<>'INSERT' and nullif(to_jsonb(old)->>'inventory_receipt_line_id','') is not null then
    raise exception 'Posted receipts are locked; create a return or reviewed adjustment' using errcode='55000';
  end if;
  if tg_op='UPDATE' and (to_jsonb(old)->>'restaurant_id') is distinct from j->>'restaurant_id' then raise exception 'Cannot move stock history to another business'; end if;
  v_id:=(j->>'id')::uuid;
  v_event:=tg_table_name||':'||v_id||':'||case when tg_op='INSERT' then 'insert' else gen_random_uuid()::text end;
  for v_step in select unnest(case when tg_op='UPDATE' then array['reverse','apply'] when tg_op='DELETE' then array['reverse'] else array['apply'] end) loop
    oldj:=case when v_step='reverse' then to_jsonb(old) else j end;
    v_branch:=nullif(oldj->>'branch_id','')::uuid;
    if v_branch is null then select id into v_branch from public.branches where restaurant_id=v_restaurant and branch_key=oldj->>'branch'; end if;
    v_product:=retail_inventory_private.resolve_product(v_restaurant,oldj->>'product_id');
    if v_branch is null or v_product is null then raise exception 'Select a valid branch and master product for inventory' using errcode='22023'; end if;
    v_warehouse:=retail_inventory_private.default_warehouse(v_restaurant,v_branch);
    v_doc:=null; v_batch:=''; v_expiry:=null;
    select coalesce(purchase_cost,default_cost,0) into v_cost from public.products where id=v_product;
    if tg_table_name='purchases' then
      v_delta:=coalesce((oldj->>'qty')::numeric,0); v_cost:=coalesce((oldj->>'used_price')::numeric,(oldj->>'current_price')::numeric,0);
      if nullif(oldj->>'inventory_receipt_line_id','') is not null then
        select * into v_line from public.retail_inventory_lines where id=(oldj->>'inventory_receipt_line_id')::uuid and restaurant_id=v_restaurant and branch_id=v_branch and product_id=v_product;
        if v_line.id is null or v_line.quantity<>v_delta then raise exception 'Invalid receipt line' using errcode='42501'; end if;
        select warehouse_id into v_warehouse from public.retail_inventory_documents where id=v_line.document_id and kind='receipt';
        v_doc:=v_line.document_id; v_batch:=v_line.batch_number; v_expiry:=v_line.expiry_date;
      end if;
    elsif tg_table_name='inventory' then
      v_delta:=coalesce((oldj->>'opening_stock')::numeric,0); v_batch:=coalesce(oldj->>'batch_number',''); v_expiry:=nullif(oldj->>'expiry_date','')::date;
    elsif tg_table_name='inventory_waste' then v_delta:=-abs(coalesce((oldj->>'quantity')::numeric,0));
    else v_delta:=retail_inventory_private.source_delta(oldj->>'transaction_type',coalesce((oldj->>'quantity')::numeric,0)); v_cost:=coalesce((oldj->>'unit_cost')::numeric,v_cost); end if;
    if v_step='reverse' then v_delta:=-v_delta; end if;
    if v_delta<>0 then perform retail_inventory_private.post(v_restaurant,v_warehouse,v_product,v_delta,v_cost,
      case when v_step='reverse' then 'reversal' else tg_table_name end,v_id,coalesce(oldj->>'product_name',tg_table_name),v_event||':'||v_step,v_doc,v_batch,v_expiry,true); end if;
  end loop;
  return coalesce(new,old);
end $$;
create trigger retail_inventory_purchase_stock after insert or update or delete on public.purchases for each row execute function retail_inventory_private.legacy_stock();
create trigger retail_inventory_opening_stock after insert or update or delete on public.inventory for each row execute function retail_inventory_private.legacy_stock();
create trigger retail_inventory_legacy_transactions after insert or update or delete on public.inventory_transactions for each row execute function retail_inventory_private.legacy_stock();
create trigger retail_inventory_waste_stock after insert or update or delete on public.inventory_waste for each row execute function retail_inventory_private.legacy_stock();

create function retail_inventory_private.pos_stock() returns trigger language plpgsql security definer set search_path='' as $$
declare t public.retail_pos_transactions; p uuid; w uuid; q numeric;
begin
  select * into t from public.retail_pos_transactions where id=new.transaction_id;
  if t.status not in ('posted','approved') or not public.erp_retail_pos_portal_allowed(t.restaurant_id) then return new; end if;
  p:=coalesce(new.product_id,retail_inventory_private.resolve_product(t.restaurant_id,new.sku));
  -- Unmapped receipt lines remain visible as exceptions; never invent a product match.
  if p is null then return new; end if;
  if not exists(select 1 from public.products where id=p and restaurant_id=t.restaurant_id) then raise exception 'POS product belongs to another business' using errcode='42501'; end if;
  w:=retail_inventory_private.default_warehouse(t.restaurant_id,t.branch_id);
  q:=case when t.transaction_type='sale' then -new.quantity else new.quantity end;
  perform retail_inventory_private.post(t.restaurant_id,w,p,q,null,'pos_'||t.transaction_type,new.id,
    coalesce(t.receipt_number,'POS')||' · '||new.product_name,'pos-item:'||new.id,null,'',null,true,t.transaction_type='refund');
  return new;
end $$;
create trigger retail_inventory_pos_stock after insert on public.retail_pos_transaction_items for each row execute function retail_inventory_private.pos_stock();

-- Legacy direct adjustments in retail are owner-only. Staff use reviewed documents.
do $$ declare t text; begin
  foreach t in array array['inventory','inventory_transactions','inventory_waste','inventory_batches'] loop
    execute format('create policy retail_inventory_owner_insert on public.%I as restrictive for insert to authenticated with check (not public.erp_retail_pos_portal_allowed(restaurant_id) or retail_inventory_private.allowed(restaurant_id,branch_id,''updateInventory'',true))',t);
    execute format('create policy retail_inventory_owner_update on public.%I as restrictive for update to authenticated using (not public.erp_retail_pos_portal_allowed(restaurant_id) or retail_inventory_private.allowed(restaurant_id,branch_id,''updateInventory'',true)) with check (not public.erp_retail_pos_portal_allowed(restaurant_id) or retail_inventory_private.allowed(restaurant_id,branch_id,''updateInventory'',true))',t);
    execute format('create policy retail_inventory_owner_delete on public.%I as restrictive for delete to authenticated using (not public.erp_retail_pos_portal_allowed(restaurant_id) or retail_inventory_private.allowed(restaurant_id,branch_id,''updateInventory'',true))',t);
  end loop;
end $$;

create function retail_inventory_private.order_items(p_items jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(p_items)='string' then return (p_items#>>'{}')::jsonb; end if;
  return coalesce(p_items,'[]'::jsonb);
end $$;

create function retail_inventory_private.command(p_restaurant uuid,p_command text,p_payload jsonb,p_request_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.retail_inventory_documents; w public.retail_inventory_warehouses; dest public.retail_inventory_warehouses;
  l public.retail_inventory_lines; b public.retail_inventory_balances; prod public.products; po public.purchase_orders;
  v_id uuid; v_branch uuid; v_kind text; v_lines jsonb; j jsonb; alloc jsonb; v_qty numeric; v_cost numeric; v_expiry date;
  v_available numeric; v_ordered numeric; v_received numeric; v_line_cost numeric; v_po_id uuid; v_batch text; v_check record;
begin
  if not retail_inventory_private.allowed(p_restaurant,null) then raise exception 'Inventory access denied' using errcode='42501'; end if;
  if p_command='warehouse' then
    v_branch:=nullif(p_payload->>'branch_id','')::uuid;
    if not retail_inventory_private.allowed(p_restaurant,v_branch,'updateInventory',true) then raise exception 'Only the owner can configure warehouses' using errcode='42501'; end if;
    if not exists(select 1 from public.branches where id=v_branch and restaurant_id=p_restaurant) then raise exception 'Invalid branch'; end if;
    perform retail_inventory_private.default_warehouse(p_restaurant,v_branch);
    insert into public.retail_inventory_warehouses(restaurant_id,branch_id,name) values(p_restaurant,v_branch,btrim(p_payload->>'name')) returning id into v_id;
    return jsonb_build_object('id',v_id);
  end if;

  if p_command='release' then
    select bal.* into b from public.retail_inventory_balances bal join public.retail_inventory_lots lot on lot.balance_id=bal.id where lot.id=(p_payload->>'lot_id')::uuid and bal.restaurant_id=p_restaurant for update of bal;
    if b.id is null or not retail_inventory_private.allowed(p_restaurant,b.branch_id,'updateInventory',true) then raise exception 'Owner inspection required' using errcode='42501'; end if;
    select to_jsonb(lot) into j from public.retail_inventory_lots lot where lot.id=(p_payload->>'lot_id')::uuid for update;
    if not (j->>'quarantined')::boolean or (j->>'quantity')::numeric<=0 then return jsonb_build_object('released',false); end if;
    if nullif(j->>'expiry_date','')::date<(now() at time zone 'Asia/Riyadh')::date then raise exception 'Expired stock cannot be released'; end if;
    if length(btrim(coalesce(p_payload->>'notes','')))<3 then raise exception 'Enter inspection notes'; end if;
    perform retail_inventory_private.post(p_restaurant,b.warehouse_id,b.product_id,-(j->>'quantity')::numeric,(j->>'unit_cost')::numeric,'inspection_out',(j->>'id')::uuid,p_payload->>'notes','release-out:'||(j->>'id')||':'||b.version,null,j->>'batch_number',nullif(j->>'expiry_date','')::date,false,true,(j->>'id')::uuid);
    perform retail_inventory_private.post(p_restaurant,b.warehouse_id,b.product_id,(j->>'quantity')::numeric,(j->>'unit_cost')::numeric,'inspection_in',(j->>'id')::uuid,p_payload->>'notes','release-in:'||(j->>'id')||':'||b.version,null,j->>'batch_number',nullif(j->>'expiry_date','')::date);
    insert into public.retail_inventory_audit(restaurant_id,branch_id,action,detail,actor_id) values(p_restaurant,b.branch_id,'release',p_payload->>'notes',auth.uid());
    return jsonb_build_object('released',true);
  end if;

  if p_command in ('create','assign','settings') then
    select * into w from public.retail_inventory_warehouses where id=nullif(p_payload->>'warehouse_id','')::uuid and restaurant_id=p_restaurant and is_active;
    if w.id is null and nullif(p_payload->>'branch_id','') is not null then
      v_branch:=(p_payload->>'branch_id')::uuid;
      if not retail_inventory_private.allowed(p_restaurant,v_branch,'updateInventory') then raise exception 'Branch inventory access denied' using errcode='42501'; end if;
      select * into w from public.retail_inventory_warehouses where id=retail_inventory_private.default_warehouse(p_restaurant,v_branch);
    end if;
    if w.id is null or not retail_inventory_private.allowed(p_restaurant,w.branch_id,'updateInventory') then raise exception 'Select an authorized warehouse' using errcode='42501'; end if;
    if p_command='assign' then
      if jsonb_array_length(coalesce(p_payload->'product_ids','[]')) not between 1 and 1000 then raise exception 'Select 1 to 1000 products'; end if;
      for j in select value from jsonb_array_elements(p_payload->'product_ids') loop
        v_id:=(j#>>'{}')::uuid;
        if not exists(select 1 from public.products where id=v_id and restaurant_id=p_restaurant and coalesce(is_active,true)) then raise exception 'Invalid product scope' using errcode='42501'; end if;
        insert into public.branch_product_assortments(restaurant_id,branch_id,product_id,is_active,created_by)
          values(p_restaurant,w.branch_id,v_id,true,auth.uid()::text)
          on conflict(restaurant_id,branch_id,product_id) do update set is_active=true,updated_at=now();
        insert into public.retail_inventory_balances(restaurant_id,branch_id,warehouse_id,product_id)
          values(p_restaurant,w.branch_id,w.id,v_id) on conflict(warehouse_id,product_id) do nothing;
      end loop;
      return jsonb_build_object('assigned',jsonb_array_length(p_payload->'product_ids'));
    end if;
    if p_command='settings' then
      v_qty:=coalesce(nullif(p_payload->>'min_stock','')::numeric,0); v_cost:=coalesce(nullif(p_payload->>'max_stock','')::numeric,0);
      v_available:=coalesce(nullif(p_payload->>'pack_size','')::numeric,1);
      if v_qty<0 or v_cost<v_qty or v_available<=0 or v_available>100000 or v_available='NaN'::numeric or v_qty='NaN'::numeric or v_cost='NaN'::numeric then raise exception 'Check minimum, target and pack size'; end if;
      update public.retail_inventory_balances set min_stock=v_qty,max_stock=v_cost,pack_size=v_available,
        bin_location=nullif(btrim(p_payload->>'bin_location'),''),updated_at=now()
        where warehouse_id=w.id and product_id=(p_payload->>'product_id')::uuid returning id into v_id;
      if v_id is null then raise exception 'Add this product to the warehouse first'; end if;
      return jsonb_build_object('id',v_id);
    end if;
    if length(coalesce(p_request_key,'')) not between 8 and 120 then raise exception 'Request key is required'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_restaurant::text||p_request_key,27));
    select * into d from public.retail_inventory_documents where restaurant_id=p_restaurant and request_key=p_request_key;
    if d.id is not null then return to_jsonb(d); end if;
    v_kind:=p_payload->>'kind';
    if v_kind not in ('receipt','transfer','adjustment','return','count','reorder') then raise exception 'Unsupported inventory document'; end if;
    if v_kind='receipt' and not retail_inventory_private.allowed(p_restaurant,w.branch_id,'createPurchases') then raise exception 'Purchase creation permission required' using errcode='42501'; end if;
    if v_kind in ('adjustment','return') and length(btrim(coalesce(p_payload->>'notes','')))<3 then raise exception 'Enter the reason for this adjustment'; end if;
    if v_kind='transfer' then
      select * into dest from public.retail_inventory_warehouses where id=nullif(p_payload->>'destination_warehouse_id','')::uuid and restaurant_id=p_restaurant and is_active;
      if dest.id is null or dest.id=w.id then raise exception 'Choose a different destination warehouse'; end if;
    end if;
    if nullif(p_payload->>'supplier_id','') is not null and not exists(select 1 from public.suppliers where id=(p_payload->>'supplier_id')::uuid and restaurant_id=p_restaurant) then raise exception 'Invalid supplier'; end if;
    v_po_id:=nullif(p_payload->>'purchase_order_id','')::uuid;
    if v_po_id is not null then
      select * into po from public.purchase_orders where id=v_po_id and restaurant_id=p_restaurant and (branch_id=w.branch_id or (branch_id is null and branch=(select branch_key from public.branches where id=w.branch_id)));
      if po.id is null or po.status not in ('sent','partial','approved') then raise exception 'This purchase order is not open for receiving'; end if;
    end if;
    v_id:=gen_random_uuid();
    insert into public.retail_inventory_documents(id,restaurant_id,branch_id,warehouse_id,destination_warehouse_id,document_number,kind,status,notes,source_purchase_order_id,supplier_id,created_by,request_key)
      values(v_id,p_restaurant,w.branch_id,w.id,dest.id,upper(case v_kind when 'receipt' then 'GRN' when 'transfer' then 'TR' when 'count' then 'CNT' when 'reorder' then 'PR' else 'ADJ' end)||'-'||upper(left(v_id::text,8)),
      v_kind,case when v_kind='count' then 'draft' else 'requested' end,nullif(btrim(p_payload->>'notes'),''),v_po_id,
      coalesce(po.supplier_id,nullif(p_payload->>'supplier_id','')::uuid),auth.uid(),p_request_key) returning * into d;
    if v_kind='count' then
      if (select count(*) from public.retail_inventory_balances bal where warehouse_id=w.id and (coalesce(jsonb_array_length(p_payload->'product_ids'),0)=0 or bal.product_id in (select value::uuid from jsonb_array_elements_text(p_payload->'product_ids'))))>500 then raise exception 'Choose up to 500 products for a cycle count'; end if;
      insert into public.retail_inventory_lines(document_id,restaurant_id,branch_id,product_id,unit_cost,lot_id,batch_number,expiry_date,expected_quantity,snapshot_version)
        select d.id,p_restaurant,w.branch_id,bal.product_id,bal.average_cost,lot.id,coalesce(lot.batch_number,''),lot.expiry_date,coalesce(lot.quantity,bal.quantity),bal.version
        from public.retail_inventory_balances bal left join public.retail_inventory_lots lot on lot.balance_id=bal.id and lot.quantity<>0
        where bal.warehouse_id=w.id and (coalesce(jsonb_array_length(p_payload->'product_ids'),0)=0 or bal.product_id in (select value::uuid from jsonb_array_elements_text(p_payload->'product_ids')));
      if not found then raise exception 'Add products to this warehouse before starting a count'; end if;
      if (select count(*) from public.retail_inventory_lines where document_id=d.id)>1000 then raise exception 'Select fewer products; a count supports up to 1000 batches'; end if;
    else
      v_lines:=coalesce(p_payload->'lines','[]');
      if jsonb_array_length(v_lines) not between 1 and 100 then raise exception 'Use 1 to 100 lines per document'; end if;
      for j in select value from jsonb_array_elements(v_lines) loop
        select * into prod from public.products where id=(j->>'product_id')::uuid and restaurant_id=p_restaurant and coalesce(is_active,true);
        if prod.id is null then raise exception 'Invalid product scope' using errcode='42501'; end if;
        v_qty:=(j->>'quantity')::numeric; v_cost:=coalesce(nullif(j->>'unit_cost','')::numeric,prod.purchase_cost,prod.default_cost,0);
        if j->>'unit_mode'='pack' then select v_qty*pack_size into v_qty from public.retail_inventory_balances where warehouse_id=w.id and product_id=prod.id; end if;
        if v_qty is null or v_qty='NaN'::numeric or v_cost='NaN'::numeric or v_qty=0 or abs(v_qty)>1000000000 or v_cost<0 or v_cost>1000000000 then raise exception 'Enter a valid quantity and cost'; end if;
        if v_kind<>'adjustment' and v_qty<=0 then raise exception 'Quantity must be greater than zero'; end if;
        if v_kind='return' then v_qty:=-v_qty; end if;
        v_batch:=coalesce(btrim(j->>'batch_number'),''); v_expiry:=nullif(j->>'expiry_date','')::date;
        if v_kind='receipt' and ((prod.batch_tracked and v_batch='') or (prod.expiry_tracked and v_expiry is null)) then raise exception 'Batch number and expiry are required for tracked products'; end if;
        if v_kind='receipt' and v_expiry<(now() at time zone 'Asia/Riyadh')::date then raise exception 'Do not receive expired stock'; end if;
        if nullif(j->>'lot_id','') is not null and not exists(select 1 from public.retail_inventory_lots lot join public.retail_inventory_balances bal on bal.id=lot.balance_id where lot.id=(j->>'lot_id')::uuid and bal.warehouse_id=w.id and bal.product_id=prod.id) then raise exception 'Invalid stock batch'; end if;
        insert into public.retail_inventory_lines(document_id,restaurant_id,branch_id,product_id,quantity,unit_cost,batch_number,expiry_date,lot_id)
          values(d.id,p_restaurant,w.branch_id,prod.id,v_qty,v_cost,v_batch,v_expiry,nullif(j->>'lot_id','')::uuid);
      end loop;
    end if;
    insert into public.retail_inventory_audit(restaurant_id,branch_id,document_id,action,detail,actor_id) values(p_restaurant,w.branch_id,d.id,'created',d.document_number,auth.uid());
    return to_jsonb(d);
  end if;

  select * into d from public.retail_inventory_documents where id=nullif(p_payload->>'document_id','')::uuid and restaurant_id=p_restaurant for update;
  if d.id is null then raise exception 'Inventory document not found' using errcode='42501'; end if;
  select * into w from public.retail_inventory_warehouses where id=d.warehouse_id;
  select * into dest from public.retail_inventory_warehouses where id=d.destination_warehouse_id;
  v_branch:=case when d.kind='transfer' and p_command='receive' then dest.branch_id else d.branch_id end;
  if not retail_inventory_private.allowed(p_restaurant,v_branch,'updateInventory') then raise exception 'Inventory operation denied' using errcode='42501'; end if;
  if p_command in ('approve','reject') and not retail_inventory_private.allowed(p_restaurant,d.branch_id,'updateInventory',true) then raise exception 'Owner approval is required' using errcode='42501'; end if;

  if p_command='save_count' then
    if d.kind<>'count' or d.status<>'draft' then raise exception 'Only an open count can be edited'; end if;
    for j in select value from jsonb_array_elements(coalesce(p_payload->'lines','[]')) loop
      v_qty:=(j->>'counted_quantity')::numeric;
      if v_qty<0 or v_qty='NaN'::numeric or v_qty>1000000000 then raise exception 'Count must be zero or greater'; end if;
      update public.retail_inventory_lines set counted_quantity=v_qty where id=(j->>'id')::uuid and document_id=d.id;
      if not found then raise exception 'Count line not found'; end if;
    end loop;
  elsif p_command='submit' then
    if d.kind<>'count' or d.status not in ('draft','requested') then raise exception 'This count cannot be submitted'; end if;
    if exists(select 1 from public.retail_inventory_lines where document_id=d.id and counted_quantity is null) then raise exception 'Count every item before submitting'; end if;
    update public.retail_inventory_documents set status='requested' where id=d.id;
  elsif p_command='approve' then
    if d.status in ('approved','posted') then return to_jsonb(d); end if;
    if d.status<>'requested' or d.kind='receipt' then raise exception 'Document is not awaiting approval'; end if;
    -- Lock in deterministic order; count snapshots must still match every physical balance.
    perform bal.id from public.retail_inventory_balances bal where warehouse_id=w.id and exists(select 1 from public.retail_inventory_lines ln where ln.document_id=d.id and ln.product_id=bal.product_id) order by bal.id for update;
    if d.kind='count' and exists(select 1 from public.retail_inventory_lines ln join public.retail_inventory_balances bal on bal.warehouse_id=w.id and bal.product_id=ln.product_id where ln.document_id=d.id and (ln.counted_quantity is null or ln.snapshot_version<>bal.version)) then raise exception 'Stock moved during this count. Start a fresh count before approval' using errcode='40001'; end if;
    for l in select * from public.retail_inventory_lines where document_id=d.id order by product_id,id loop
      select * into b from public.retail_inventory_balances where warehouse_id=w.id and product_id=l.product_id;
      if d.kind='transfer' then
        select b.quantity-b.reserved-coalesce(sum(greatest(quantity,0)) filter(where quarantined or expiry_date<(now() at time zone 'Asia/Riyadh')::date),0) into v_available from public.retail_inventory_lots where balance_id=b.id;
        if b.id is null or v_available<l.quantity then raise exception 'Insufficient available stock for transfer'; end if;
        update public.retail_inventory_balances set reserved=reserved+l.quantity,updated_at=now() where id=b.id;
      elsif d.kind in ('adjustment','return','count') then
        v_qty:=case when d.kind='count' then l.counted_quantity-l.expected_quantity else l.quantity end;
        if v_qty<>0 then
          if b.quantity+v_qty<b.reserved then raise exception 'Cancel reserved transfers before reducing this stock'; end if;
          perform retail_inventory_private.post(p_restaurant,w.id,l.product_id,v_qty,l.unit_cost,d.kind,l.id,d.document_number,'doc:'||d.id||':'||l.id,d.id,l.batch_number,l.expiry_date,false,
            coalesce((select quarantined from public.retail_inventory_lots where id=l.lot_id),false),l.lot_id);
        end if;
      end if;
    end loop;
    if d.kind='reorder' then
      if d.supplier_id is null then raise exception 'Select a supplier before approving the purchase request'; end if;
      insert into public.purchase_orders(restaurant_id,branch_id,branch,order_number,supplier_id,supplier_name,items,total_amount,status,approval_status,created_by)
      select p_restaurant,d.branch_id,br.branch_key,d.document_number,d.supplier_id,s.name,
        (select jsonb_agg(jsonb_build_object('product_id',ln.product_id,'product_name',p.name,'qty',ln.quantity,'unit',p.unit,'unit_price',ln.unit_cost)) from public.retail_inventory_lines ln join public.products p on p.id=ln.product_id where ln.document_id=d.id),
        (select sum(quantity*unit_cost) from public.retail_inventory_lines where document_id=d.id),'draft','approved',auth.uid()::text
        from public.branches br join public.suppliers s on s.id=d.supplier_id and s.restaurant_id=p_restaurant where br.id=d.branch_id returning id into v_po_id;
      update public.retail_inventory_documents set source_purchase_order_id=v_po_id where id=d.id;
    end if;
    update public.retail_inventory_documents set status=case when kind in ('transfer','reorder') then 'approved' else 'posted' end,reviewed_by=auth.uid() where id=d.id;
  elsif p_command='dispatch' then
    if d.kind<>'transfer' or d.status not in ('approved','in_transit') then raise exception 'Approve this transfer before dispatch'; end if;
    if d.status='in_transit' then return to_jsonb(d); end if;
    for l in select * from public.retail_inventory_lines where document_id=d.id order by product_id,id loop
      update public.retail_inventory_balances set reserved=reserved-l.quantity where warehouse_id=w.id and product_id=l.product_id;
      alloc:=retail_inventory_private.post(p_restaurant,w.id,l.product_id,-l.quantity,l.unit_cost,'transfer_out',l.id,d.document_number,'dispatch:'||l.id,d.id);
      update public.retail_inventory_lines set allocations=alloc where id=l.id;
    end loop;
    update public.retail_inventory_documents set status='in_transit' where id=d.id;
  elsif p_command='receive' then
    if d.status='received' then return to_jsonb(d); end if;
    if d.kind='transfer' then
      if d.status<>'in_transit' then raise exception 'Transfer is not in transit'; end if;
      for l in select * from public.retail_inventory_lines where document_id=d.id order by product_id,id loop
        for j in select value from jsonb_array_elements(l.allocations) loop
          perform retail_inventory_private.post(p_restaurant,dest.id,l.product_id,(j->>'quantity')::numeric,(j->>'unit_cost')::numeric,
            'transfer_in',l.id,d.document_number,'receive:'||l.id||':'||coalesce(j->>'batch_number','')||':'||coalesce(j->>'expiry_date',''),d.id,j->>'batch_number',nullif(j->>'expiry_date','')::date,false,coalesce((j->>'quarantined')::boolean,false));
        end loop;
      end loop;
    elsif d.kind='receipt' then
      if d.status<>'requested' or not retail_inventory_private.allowed(p_restaurant,d.branch_id,'createPurchases') then raise exception 'Purchase receipt denied' using errcode='42501'; end if;
      if d.source_purchase_order_id is not null then
        select * into po from public.purchase_orders where id=d.source_purchase_order_id for update;
        if po.status not in ('sent','partial','approved') then raise exception 'Purchase order is already closed'; end if;
        for v_check in select product_id,sum(quantity) as quantity from public.retail_inventory_lines where document_id=d.id group by product_id loop
          select coalesce(sum((item->>'qty')::numeric),0) into v_ordered from jsonb_array_elements(retail_inventory_private.order_items(po.items)) item where retail_inventory_private.resolve_product(p_restaurant,item->>'product_id')=v_check.product_id;
          select coalesce(sum(ln.quantity),0) into v_received from public.retail_inventory_lines ln join public.retail_inventory_documents doc on doc.id=ln.document_id where doc.source_purchase_order_id=po.id and doc.kind='receipt' and doc.status='received' and ln.product_id=v_check.product_id;
          if v_check.quantity>v_ordered-v_received then raise exception 'Receipt exceeds the outstanding purchase order quantity'; end if;
        end loop;
      end if;
      for l in select * from public.retail_inventory_lines where document_id=d.id order by product_id,id loop
        insert into public.purchases(restaurant_id,branch_id,branch,product_id,product_name,qty,used_price,current_price,date,created_by,inventory_receipt_line_id)
          select p_restaurant,d.branch_id,br.branch_key,l.product_id::text,p.name,l.quantity,l.unit_cost,l.unit_cost,(now() at time zone 'Asia/Riyadh')::date,coalesce(auth.jwt()->>'email',auth.uid()::text),l.id
          from public.products p join public.branches br on br.id=d.branch_id where p.id=l.product_id;
      end loop;
    else raise exception 'This document cannot be received'; end if;
    update public.retail_inventory_documents set status='received' where id=d.id;
    if d.kind='receipt' and po.id is not null then
      update public.purchase_orders set status=case when exists(
        select 1 from jsonb_array_elements(retail_inventory_private.order_items(po.items)) item
        where (item->>'qty')::numeric > coalesce((select sum(ln.quantity) from public.retail_inventory_lines ln join public.retail_inventory_documents doc on doc.id=ln.document_id where doc.source_purchase_order_id=po.id and doc.kind='receipt' and doc.status='received' and ln.product_id=retail_inventory_private.resolve_product(p_restaurant,item->>'product_id')),0)
      ) then 'partial' else 'received' end,received_date=(now() at time zone 'Asia/Riyadh')::date where id=po.id;
    end if;
  elsif p_command in ('reject','cancel') then
    if d.status in ('rejected','cancelled') then return to_jsonb(d); end if;
    if d.status not in ('draft','requested','approved') then raise exception 'Posted or dispatched documents cannot be cancelled'; end if;
    if p_command='cancel' and d.created_by<>auth.uid() and not retail_inventory_private.allowed(p_restaurant,d.branch_id,'updateInventory',true) then raise exception 'Only creator or owner may cancel' using errcode='42501'; end if;
    if d.kind='reorder' and d.status='approved' then raise exception 'Manage the generated purchase order in Purchasing'; end if;
    if d.kind='transfer' and d.status='approved' then
      for l in select * from public.retail_inventory_lines where document_id=d.id order by product_id,id loop update public.retail_inventory_balances set reserved=reserved-l.quantity,updated_at=now() where warehouse_id=w.id and product_id=l.product_id; end loop;
    end if;
    update public.retail_inventory_documents set status=case p_command when 'reject' then 'rejected' else 'cancelled' end,reviewed_by=auth.uid() where id=d.id;
  else raise exception 'Unsupported inventory action'; end if;
  update public.retail_inventory_documents set updated_at=now() where id=d.id returning * into d;
  insert into public.retail_inventory_audit(restaurant_id,branch_id,document_id,action,detail,actor_id) values(p_restaurant,v_branch,d.id,p_command,d.document_number,auth.uid());
  return to_jsonb(d);
end $$;

create function public.erp_retail_inventory_command(p_restaurant_id uuid,p_command text,p_payload jsonb default '{}',p_request_key text default null)
returns jsonb language sql security invoker set search_path='' as $$
  select retail_inventory_private.command(p_restaurant_id,p_command,p_payload,p_request_key);
$$;

-- Destination staff may read their incoming transfer without gaining source-stock access.
drop policy retail_inventory_read on public.retail_inventory_documents;
create policy retail_inventory_read on public.retail_inventory_documents for select to authenticated using (
  retail_inventory_private.allowed(restaurant_id,branch_id) or exists(select 1 from public.retail_inventory_warehouses w where w.id=destination_warehouse_id and retail_inventory_private.allowed(w.restaurant_id,w.branch_id))
);
drop policy retail_inventory_read on public.retail_inventory_lines;
create policy retail_inventory_read on public.retail_inventory_lines for select to authenticated using (
  retail_inventory_private.allowed(restaurant_id,branch_id) or exists(select 1 from public.retail_inventory_documents d join public.retail_inventory_warehouses w on w.id=d.destination_warehouse_id where d.id=document_id and retail_inventory_private.allowed(w.restaurant_id,w.branch_id))
);

create view public.retail_inventory_stock with (security_invoker=true) as
select b.id,b.restaurant_id,b.branch_id,b.warehouse_id,b.product_id,b.quantity as on_hand,b.reserved,
  greatest(b.quantity-b.reserved-coalesce(lots.blocked,0),0) as available,
  coalesce(lots.blocked,0) as blocked,coalesce(lots.batch_count,0) as batch_count,coalesce(lots.expiring_count,0) as expiring_count,
  b.average_cost,b.quantity*b.average_cost as stock_value,b.version,b.updated_at,b.pack_size,
  coalesce(b.min_stock,a.reorder_point,a.min_stock,p.reorder_point,p.min_stock,0) as min_stock,
  greatest(coalesce(b.max_stock,a.max_stock,p.max_stock,0),coalesce(b.min_stock,a.reorder_point,a.min_stock,p.reorder_point,p.min_stock,0)) as max_stock,
  coalesce(a.reorder_quantity,p.reorder_quantity,0) as reorder_quantity,
  coalesce(b.bin_location,nullif(concat_ws(' · ',a.aisle,a.shelf,a.bin_location),'')) as bin_location,
  p.name,p.name_ar,p.name_fa,p.name_en,p.sku,p.barcode,p.image_url,p.unit,p.category,p.batch_tracked,p.expiry_tracked,
  coalesce(a.preferred_supplier_id,p.supplier_id) as supplier_id,coalesce(p.purchase_cost,p.default_cost,0) as purchase_cost,
  coalesce(a.is_active,true) and coalesce(p.is_active,true) as is_active,w.name as warehouse_name,br.name as branch_name
from public.retail_inventory_balances b
join public.products p on p.id=b.product_id and p.restaurant_id=b.restaurant_id
join public.retail_inventory_warehouses w on w.id=b.warehouse_id
join public.branches br on br.id=b.branch_id
left join public.branch_product_assortments a on a.branch_id=b.branch_id and a.product_id=b.product_id
left join lateral (
  select sum(greatest(quantity,0)) filter(where quarantined or expiry_date<(now() at time zone 'Asia/Riyadh')::date) as blocked,
    count(*) filter(where quantity>0) as batch_count,
    count(*) filter(where quantity>0 and expiry_date between (now() at time zone 'Asia/Riyadh')::date and (now() at time zone 'Asia/Riyadh')::date+30) as expiring_count
  from public.retail_inventory_lots where balance_id=b.id
) lots on true;
revoke all on public.retail_inventory_stock from public,anon;
grant select on public.retail_inventory_stock to authenticated;

create function public.erp_retail_inventory_stock(p_restaurant_id uuid,p_branch_id uuid default null,p_warehouse_id uuid default null,p_query text default '',p_filter text default 'all',p_page integer default 1,p_page_size integer default 30)
returns jsonb language sql stable security invoker set search_path='' as $$
  with filtered as materialized (
    select * from public.retail_inventory_stock s where restaurant_id=p_restaurant_id
      and (p_branch_id is null or branch_id=p_branch_id) and (p_warehouse_id is null or warehouse_id=p_warehouse_id)
      and (coalesce(btrim(p_query),'')='' or name ilike '%'||p_query||'%' or name_ar ilike '%'||p_query||'%' or name_fa ilike '%'||p_query||'%' or sku ilike '%'||p_query||'%' or barcode ilike '%'||p_query||'%')
      and (p_filter='all' or (p_filter='low' and is_active and available<=min_stock) or (p_filter='expiry' and expiring_count>0) or (p_filter='blocked' and (blocked>0 or on_hand<0)))
  ), page as (select * from filtered order by name,branch_name,warehouse_name,id limit greatest(1,least(coalesce(p_page_size,30),100)) offset (greatest(coalesce(p_page,1),1)-1)*greatest(1,least(coalesce(p_page_size,30),100)))
  select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb));
$$;

create function public.erp_retail_inventory_documents(p_restaurant_id uuid,p_branch_id uuid default null,p_warehouse_id uuid default null,p_kind text default 'all',p_status text default 'all',p_page integer default 1)
returns jsonb language sql stable security invoker set search_path='' as $$
  with filtered as materialized (
    select d.*,w.name as warehouse_name,dw.name as destination_name,dw.branch_id as destination_branch_id,br.name as branch_name,
      summary.line_count,summary.counted_count,summary.variance_count,summary.total_cost,
      supplier.name as supplier_name
    from public.retail_inventory_documents d left join public.retail_inventory_warehouses w on w.id=d.warehouse_id
    left join public.retail_inventory_warehouses dw on dw.id=d.destination_warehouse_id
    left join public.branches br on br.id=d.branch_id left join public.suppliers supplier on supplier.id=d.supplier_id
    left join lateral (select count(*) as line_count,count(counted_quantity) as counted_count,
      count(*) filter(where counted_quantity is not null and counted_quantity<>expected_quantity) as variance_count,
      coalesce(sum(abs(quantity)*unit_cost),0) as total_cost from public.retail_inventory_lines where document_id=d.id) summary on true
    where d.restaurant_id=p_restaurant_id and (p_branch_id is null or d.branch_id=p_branch_id or dw.branch_id=p_branch_id)
      and (p_warehouse_id is null or d.warehouse_id=p_warehouse_id or d.destination_warehouse_id=p_warehouse_id)
      and (p_kind='all' or d.kind=p_kind) and (p_status='all' or d.status=p_status)
  ), page as (select * from filtered order by created_at desc,id limit 20 offset (greatest(coalesce(p_page,1),1)-1)*20)
  select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb));
$$;

create function public.erp_retail_inventory_document(p_document_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
  select to_jsonb(d)||jsonb_build_object('lines',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('name',p.name,'name_ar',p.name_ar,'sku',p.sku,'barcode',p.barcode,'unit',p.unit,'image_url',p.image_url) order by p.name,l.id) from public.retail_inventory_lines l join public.products p on p.id=l.product_id where l.document_id=d.id),'[]'::jsonb))
  from public.retail_inventory_documents d where d.id=p_document_id;
$$;

create function public.erp_retail_inventory_snapshot(p_restaurant_id uuid,p_branch_id uuid default null,p_warehouse_id uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if not retail_inventory_private.allowed(p_restaurant_id,p_branch_id) then raise exception 'Inventory access denied' using errcode='42501'; end if;
  with stock as materialized (select * from public.retail_inventory_stock where restaurant_id=p_restaurant_id and (p_branch_id is null or branch_id=p_branch_id) and (p_warehouse_id is null or warehouse_id=p_warehouse_id)),
  branch_list as (select br.id,br.name,count(s.id) as item_count,coalesce(sum(s.stock_value),0) as stock_value,
    count(s.id) filter(where s.available<=s.min_stock and s.is_active) as low_count
    from public.branches br left join stock s on s.branch_id=br.id where br.restaurant_id=p_restaurant_id and retail_inventory_private.allowed(p_restaurant_id,br.id) and (p_branch_id is null or br.id=p_branch_id) group by br.id,br.name),
  expiry as (select l.*,s.name,s.name_ar,s.unit,s.product_id,s.warehouse_id,s.warehouse_name,s.branch_name from public.retail_inventory_lots l join stock s on s.id=l.balance_id where l.quantity>0 and (l.quarantined or l.expiry_date<=(now() at time zone 'Asia/Riyadh')::date+30) order by l.expiry_date nulls last,l.id limit 30),
  movements as (select m.*,s.name,s.unit,s.warehouse_name,s.branch_name from public.retail_inventory_ledger m join stock s on s.id=m.balance_id order by m.created_at desc,m.id limit 15),
  replenishment as (select *,greatest(max_stock-available,reorder_quantity,min_stock-available,0) as suggested_quantity from stock where is_active and available<=min_stock order by available-min_stock,id limit 20),
  orders as (select po.id,po.order_number,po.supplier_name,po.branch_id,po.branch,po.status,po.expected_date,po.items
    from public.purchase_orders po where po.restaurant_id=p_restaurant_id and po.status in ('sent','partial','approved') and (p_branch_id is null or po.branch_id=p_branch_id) order by po.created_date desc limit 20)
  select jsonb_build_object(
    'summary',jsonb_build_object('stock_value',coalesce((select sum(stock_value) from stock),0),'tracked_skus',(select count(distinct product_id) from stock),
      'stock_rows',(select count(*) from stock),'master_skus',(select count(*) from public.products where restaurant_id=p_restaurant_id and coalesce(is_active,true)),
      'low_count',(select count(*) from stock where available<=min_stock and is_active),'near_expiry',(select count(*) from public.retail_inventory_lots l join stock s on s.id=l.balance_id where l.quantity>0 and l.expiry_date between (now() at time zone 'Asia/Riyadh')::date and (now() at time zone 'Asia/Riyadh')::date+30),
      'blocked_count',(select count(*) from stock where blocked>0 or on_hand<0),'branch_count',(select count(*) from branch_list),
      'warehouse_count',(select count(*) from public.retail_inventory_warehouses where restaurant_id=p_restaurant_id and is_active and (p_branch_id is null or branch_id=p_branch_id)),
      'device_count',(select count(*) from public.retail_pos_devices where restaurant_id=p_restaurant_id and (p_branch_id is null or branch_id=p_branch_id)),
      'pending_approvals',(select count(*) from public.retail_inventory_documents where restaurant_id=p_restaurant_id and status='requested' and kind in ('transfer','adjustment','return','count','reorder') and (p_branch_id is null or branch_id=p_branch_id)),
      'unmapped_pos_items',(select count(*) from public.retail_pos_transaction_items i where i.restaurant_id=p_restaurant_id and (p_branch_id is null or i.branch_id=p_branch_id) and i.product_id is null and not exists(select 1 from public.products p where p.restaurant_id=i.restaurant_id and p.sku=i.sku))),
    'branches',coalesce((select jsonb_agg(to_jsonb(branch_list) order by name) from branch_list),'[]'::jsonb),
    'warehouses',coalesce((select jsonb_agg(to_jsonb(w) order by w.name) from public.retail_inventory_warehouses w where w.restaurant_id=p_restaurant_id and w.is_active),'[]'::jsonb),
    'expiry',coalesce((select jsonb_agg(to_jsonb(expiry)) from expiry),'[]'::jsonb),
    'movements',coalesce((select jsonb_agg(to_jsonb(movements)) from movements),'[]'::jsonb),
    'replenishment',coalesce((select jsonb_agg(to_jsonb(replenishment)) from replenishment),'[]'::jsonb),
    'purchase_orders',coalesce((select jsonb_agg(to_jsonb(orders)) from orders),'[]'::jsonb),
    'documents',public.erp_retail_inventory_documents(p_restaurant_id,p_branch_id,p_warehouse_id),
    'updated_at',now()) into result;
  return result;
end $$;

revoke all on all functions in schema retail_inventory_private from public,anon,authenticated;
grant execute on function retail_inventory_private.allowed(uuid,uuid,text,boolean) to authenticated;
grant execute on function retail_inventory_private.command(uuid,text,jsonb,text) to authenticated;
do $$ declare f record; t text; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'erp_retail_inventory_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
  foreach t in array array['retail_inventory_balances','retail_inventory_lots','retail_inventory_documents','retail_inventory_lines','retail_inventory_ledger','retail_inventory_audit','retail_inventory_warehouses'] loop
    if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
  end loop;
end $$;
notify pgrst,'reload schema';
