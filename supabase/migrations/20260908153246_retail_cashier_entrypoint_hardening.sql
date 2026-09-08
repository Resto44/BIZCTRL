-- Route all browser shift opening through the locked-device / permission guard.
revoke execute on function public.erp_retail_pos_open_shift(uuid,text,numeric,text) from authenticated;

-- Store only replay evidence, not repeated copies of the entire live workspace.
-- A replay returns a fresh authorized snapshot and the original immutable receipt.
create or replace function retail_checkout_private.command(p_device uuid,p_command text,p_payload jsonb,p_request uuid) returns jsonb
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
    return retail_checkout_private.snapshot(d.id)||req.result;
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
  insert into retail_checkout_private.requests(id,device_id,fingerprint,result) values(p_request,d.id,v_fingerprint,case when v_result ? 'receipt' then jsonb_build_object('receipt',v_result->'receipt') else '{}'::jsonb end);
  perform retail_checkout_private.notify(d.id);
  return v_result;
end $$;
