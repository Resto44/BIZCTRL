-- Checkout extension for authorized Restaurant POS: one full customer-credit tender.
-- Existing cash/card branches, kitchen consumption, request-id replay, and POS sales source remain unchanged.
-- A successful credit checkout posts one daily_sales credit and one receivable transactionally.
CREATE OR REPLACE FUNCTION restaurant_pos_private.command(p_device_id uuid, p_command text, p_payload jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d restaurant_pos_private.terminals; s restaurant_pos_private.shifts; o restaurant_pos_private.orders; m restaurant_pos_private.menu;
 req restaurant_pos_private.requests; q numeric; line jsonb; v_lines jsonb; result jsonb:='{}'; total numeric; tax numeric; cash numeric:=0; card numeric:=0;
 pay jsonb; change_due numeric; tok text; b public.branches; r public.restaurants; v_receipt jsonb; sale_id uuid; actor_name text; v_credit_mode boolean:=false; v_credit_customer public.customers; v_credit_result jsonb; v_invoice_items jsonb;
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
 if not d.active then raise exception 'This POS is archived. Ask the owner to restore it.' using errcode='42501'; end if;
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
   v_credit_mode:=p_payload->>'payment_method'='credit';
   IF v_credit_mode THEN
    IF NOT coalesce((p_payload->>'credit_confirmed')::boolean,false) THEN
     RAISE EXCEPTION 'CUSTOMER_CREDIT_POS_CONFIRMATION_REQUIRED' USING ERRCODE='23514';
    END IF;
    IF p_payload ? 'payments' AND coalesce(jsonb_array_length(p_payload->'payments'),0)<>0 THEN
     RAISE EXCEPTION 'CUSTOMER_CREDIT_POS_MIXED_NOT_SUPPORTED' USING ERRCODE='23514';
    END IF;
    IF p_payload->>'customer_id' IS NULL OR o.net_total<=0 OR round(o.net_total,2)<>o.net_total THEN
     RAISE EXCEPTION 'CUSTOMER_CREDIT_POS_CUSTOMER_REQUIRED' USING ERRCODE='23514';
    END IF;
    SELECT * INTO v_credit_customer FROM public.customers
     WHERE id=(p_payload->>'customer_id')::uuid AND restaurant_id=d.restaurant_id
       AND is_active IS TRUE AND (branch_id IS NULL OR branch_id=d.branch_id)
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_CREDIT_POS_CUSTOMER_INVALID' USING ERRCODE='42501'; END IF;
    cash:=0; card:=0; change_due:=0;
   ELSE
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
   END IF;
   perform restaurant_pos_private.consume(o,d);
   select * into b from public.branches where id=d.branch_id; select * into r from public.restaurants where id=d.restaurant_id;
   select email into actor_name from auth.users where id=auth.uid();
   insert into public.daily_sales(restaurant_id,tenant_id,branch_id,branch,date,business_date,restaurant_cash,restaurant_network,cash,network,credit,customer_id,
    created_by,cashier_name,shift,reference_id,auto_generated,closing_state,notes)
   values(d.restaurant_id::text,d.restaurant_id::text,d.branch_id,b.branch_key,(now() at time zone 'Asia/Riyadh')::date,(now() at time zone 'Asia/Riyadh')::date,cash,card,cash,card,CASE WHEN v_credit_mode THEN o.net_total ELSE 0 END,CASE WHEN v_credit_mode THEN v_credit_customer.id ELSE NULL END,
    actor_name,s.cashier_name,'POS:'||s.id,'restaurant-pos:'||o.id,true,'finalized','Restaurant POS #'||o.number||' · '||d.code) returning id into sale_id;
   IF v_credit_mode THEN
    v_credit_result:=public.erp_create_customer_receivable(jsonb_build_object(
     'customer_id',v_credit_customer.id,'branch_id',d.branch_id,'branch',b.branch_key,
     'total_amount',o.net_total,'paid_amount',0,'date',(now() at time zone 'Asia/Riyadh')::date,
     'invoice_number','R-'||o.number,'description','Restaurant POS customer credit order #'||o.number,
     'request_id',o.id
    ));
    IF v_credit_result->'debt'->>'id' IS NULL THEN
     RAISE EXCEPTION 'CUSTOMER_CREDIT_POS_RECEIVABLE_MISSING';
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
     'product_id',line->>'product_id','name',line->>'name','name_ar',line->>'name_ar',
     'name_fa',line->>'name_fa','quantity',(line->>'quantity')::numeric,
     'unit_price',(line->>'unit_price')::numeric,'total_price',(line->>'line_total')::numeric
    )),'[]'::jsonb) INTO v_invoice_items FROM jsonb_array_elements(o.lines) line;
    PERFORM customer_portal_private.store_credit_invoice_lines(
     (v_credit_result->'debt'->>'id')::uuid,d.restaurant_id,d.branch_id,
     v_credit_customer.id,'restaurant_pos',o.id,v_invoice_items);
   END IF;
   v_receipt:=restaurant_pos_private.order_json(o)||jsonb_build_object('cart_id',o.id,'id',sale_id,'receipt_number','R-'||o.number,
    'transaction_type','sale','occurred_at',now(),'device_code',d.code,'cashier_name',s.cashier_name,'change',change_due,'payment_status',CASE WHEN v_credit_mode THEN 'credit_outstanding' ELSE 'settled' END,
    'customer_id',CASE WHEN v_credit_mode THEN v_credit_customer.id ELSE NULL END,
    'customer_name',CASE WHEN v_credit_mode THEN v_credit_customer.name ELSE NULL END,
    'debt_id',CASE WHEN v_credit_mode THEN v_credit_result->'debt'->>'id' ELSE NULL END,
    'payments',CASE WHEN v_credit_mode THEN jsonb_build_array(jsonb_build_object('payment_method','credit','amount',o.net_total)) ELSE jsonb_build_array(jsonb_build_object('payment_method','cash','amount',cash),jsonb_build_object('payment_method','card','amount',card)) END,
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
end $function$;
