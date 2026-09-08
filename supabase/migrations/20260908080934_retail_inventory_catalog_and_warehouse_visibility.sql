create or replace function retail_inventory_private.command(p_restaurant uuid,p_command text,p_payload jsonb,p_request_key text)
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
      v_id:=retail_inventory_private.default_warehouse(p_restaurant,v_branch);
      select * into w from public.retail_inventory_warehouses where id=v_id;
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
CREATE OR REPLACE FUNCTION public.erp_search_master_products(p_restaurant_id uuid, p_branch_id uuid DEFAULT NULL::uuid, p_query text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_scope text DEFAULT 'all'::text, p_status text DEFAULT 'all'::text, p_sort text DEFAULT 'name_asc'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS TABLE(id uuid, product_id text, name text, name_ar text, name_en text, name_fa text, sku text, barcode text, category_id uuid, category text, unit text, brand text, purchase_cost numeric, selling_price numeric, current_stock numeric, min_stock numeric, status text, is_active boolean, image_url text, custom_attributes jsonb, assigned_to_branch boolean, branch_assortment_id uuid, branch_selling_price numeric, branch_purchase_cost numeric, branch_min_stock numeric, branch_reorder_point numeric, branch_count bigint, product_data jsonb, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_query text := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100);
BEGIN
  IF auth.uid() IS NULL OR NOT public.erp_can_access_scope(p_restaurant_id, p_branch_id) THEN
    RAISE EXCEPTION 'Product catalog access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.product_id,
    p.name,
    p.name_ar,
    p.name_en,
    p.name_fa,
    p.sku,
    p.barcode,
    p.category_id,
    p.category,
    p.unit,
    p.brand,
    COALESCE(p.purchase_cost, p.default_cost, 0),
    COALESCE(p.selling_price, p.default_price, 0),
    CASE WHEN public.erp_retail_pos_portal_allowed(p_restaurant_id) THEN coalesce((select sum(s.on_hand) from public.retail_inventory_stock s where s.product_id=p.id and (p_branch_id is null or s.branch_id=p_branch_id)),0) ELSE COALESCE(p.current_stock, 0) END,
    COALESCE(p.min_stock, 0),
    COALESCE(p.status, CASE WHEN p.is_active = false THEN 'inactive' ELSE 'active' END),
    COALESCE(p.is_active, true),
    p.image_url,
    COALESCE(p.custom_attributes, '{}'::jsonb),
    CASE
      WHEN p_branch_id IS NULL THEN assortment_totals.branch_count > 0
      ELSE branch_assortment.id IS NOT NULL AND branch_assortment.is_active
    END,
    branch_assortment.id,
    branch_assortment.selling_price_override,
    branch_assortment.purchase_cost_override,
    branch_assortment.min_stock,
    branch_assortment.reorder_point,
    assortment_totals.branch_count,
    to_jsonb(p),
    count(*) OVER ()
  FROM public.products p
  LEFT JOIN public.branch_product_assortments branch_assortment
    ON branch_assortment.restaurant_id = p.restaurant_id
   AND branch_assortment.product_id = p.id
   AND branch_assortment.branch_id = p_branch_id
   AND branch_assortment.is_active = true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS branch_count
    FROM public.branch_product_assortments assortment
    WHERE assortment.restaurant_id = p.restaurant_id
      AND assortment.product_id = p.id
      AND assortment.is_active = true
  ) assortment_totals ON true
  WHERE p.restaurant_id = p_restaurant_id
    AND p.branch_id IS NULL
    AND (
      v_query IS NULL
      OR lower(p.name) LIKE '%' || lower(v_query) || '%'
      OR lower(coalesce(p.name_ar,'')) LIKE '%' || lower(v_query) || '%'
      OR lower(coalesce(p.name_fa,'')) LIKE '%' || lower(v_query) || '%'
      OR p.sku_normalized LIKE upper(v_query) || '%'
      OR p.barcode_normalized LIKE v_query || '%'
      OR lower(COALESCE(p.brand, '')) LIKE '%' || lower(v_query) || '%'
    )
    AND (
      NULLIF(p_category, '') IS NULL
      OR p_category = 'all'
      OR p.category_id::text = p_category
      OR lower(COALESCE(p.category, '')) = lower(p_category)
    )
    AND (
      p_status = 'all'
      OR (p_status = 'active' AND COALESCE(p.status, 'active') = 'active' AND COALESCE(p.is_active, true))
      OR (p_status = 'inactive' AND (COALESCE(p.status, 'active') <> 'active' OR NOT COALESCE(p.is_active, true)))
    )
    AND (
      p_scope = 'all'
      OR p_branch_id IS NULL
      OR (p_scope = 'in_branch' AND branch_assortment.id IS NOT NULL)
      OR (p_scope = 'not_in_branch' AND branch_assortment.id IS NULL)
    )
  ORDER BY
    CASE WHEN p_sort = 'name_asc' THEN lower(p.name) END ASC,
    CASE WHEN p_sort = 'name_desc' THEN lower(p.name) END DESC,
    CASE WHEN p_sort = 'price_desc' THEN COALESCE(branch_assortment.selling_price_override, p.selling_price, p.default_price, 0) END DESC,
    CASE WHEN p_sort = 'price_asc' THEN COALESCE(branch_assortment.selling_price_override, p.selling_price, p.default_price, 0) END ASC,
    CASE WHEN p_sort = 'newest' THEN p.created_date END DESC,
    p.id ASC
  OFFSET (v_page - 1) * v_page_size
  LIMIT v_page_size;
END;
$function$;

CREATE OR REPLACE FUNCTION public.erp_product_catalog_counts(p_restaurant_id uuid, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.erp_can_access_scope(p_restaurant_id, p_branch_id) THEN
    RAISE EXCEPTION 'Product catalog access denied' USING ERRCODE = '42501';
  END IF;

  IF public.erp_retail_pos_portal_allowed(p_restaurant_id) THEN
    WITH stock AS (select * from public.retail_inventory_stock where restaurant_id=p_restaurant_id and (p_branch_id is null or branch_id=p_branch_id)),
    master AS (select * from public.products where restaurant_id=p_restaurant_id and branch_id is null),
    assortment AS (select distinct product_id from public.branch_product_assortments where restaurant_id=p_restaurant_id and is_active and (p_branch_id is null or branch_id=p_branch_id))
    SELECT jsonb_build_object('master_total',(select count(*) from master),'active_total',(select count(*) from master where coalesce(is_active,true)),
    'branch_assigned',(select count(*) from assortment),'branch_unassigned',greatest((select count(*) from master)-(select count(*) from assortment),0),
    'low_stock',(select count(*) from stock where available>0 and available<=min_stock),'out_of_stock',(select count(*) from stock where available<=0),
    'inventory_value',coalesce((select sum(stock_value) from stock),0)) INTO v_result;
    RETURN v_result;
  END IF;
  WITH master AS (
    SELECT p.id, p.product_id, p.is_active, p.status
    FROM public.products p
    WHERE p.restaurant_id = p_restaurant_id
      AND p.branch_id IS NULL
  ), assortment AS (
    SELECT DISTINCT a.product_id
    FROM public.branch_product_assortments a
    WHERE a.restaurant_id = p_restaurant_id
      AND a.is_active = true
      AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
  ), inventory_rollup AS (
    SELECT
      i.product_id,
      sum(COALESCE(i.opening_stock, i.quantity, 0)) AS quantity,
      max(COALESCE(i.low_stock_threshold, 0)) AS low_stock_threshold,
      sum(COALESCE(i.total_value, COALESCE(i.opening_stock, i.quantity, 0) * COALESCE(i.average_cost, i.last_purchase_price, 0))) AS inventory_value
    FROM public.inventory i
    WHERE i.restaurant_id = p_restaurant_id
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    GROUP BY i.product_id
  ), branch_inventory AS (
    SELECT
      count(*) FILTER (WHERE quantity <= 0) AS out_of_stock,
      count(*) FILTER (
        WHERE quantity > 0
          AND low_stock_threshold > 0
          AND quantity <= low_stock_threshold
      ) AS low_stock,
      COALESCE(sum(inventory_value), 0) AS inventory_value
    FROM inventory_rollup
  )
  SELECT jsonb_build_object(
    'master_total', (SELECT count(*) FROM master),
    'active_total', (SELECT count(*) FROM master WHERE COALESCE(status, 'active') = 'active' AND COALESCE(is_active, true)),
    'branch_assigned', (SELECT count(*) FROM assortment),
    'branch_unassigned', GREATEST((SELECT count(*) FROM master) - (SELECT count(*) FROM assortment), 0),
    'low_stock', COALESCE((SELECT low_stock FROM branch_inventory), 0),
    'out_of_stock', COALESCE((SELECT out_of_stock FROM branch_inventory), 0),
    'inventory_value', COALESCE((SELECT inventory_value FROM branch_inventory), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
