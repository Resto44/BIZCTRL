-- Restaurant POS-only credit posting. Never grants Employee a general debt-write capability.
-- Called only from the existing authorized restaurant_pos_private.command checkout.
CREATE OR REPLACE FUNCTION restaurant_pos_private.post_customer_credit_receivable(
 p_device_id uuid,p_order_id uuid,p_customer_id uuid,p_amount numeric
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $post$
DECLARE v_device restaurant_pos_private.terminals;
 v_order restaurant_pos_private.orders;
 v_customer public.customers;
 v_branch public.branches;
 v_debt public.debt_records;
 v_outstanding numeric:=0;
 v_limit numeric:=0;
BEGIN
 IF auth.uid() IS NULL OR p_order_id IS NULL OR p_customer_id IS NULL OR p_amount IS NULL
    OR p_amount<=0 OR round(p_amount,2)<>p_amount THEN
   RAISE EXCEPTION 'CUSTOMER_CREDIT_POS_INVALID' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_device FROM restaurant_pos_private.terminals WHERE id=p_device_id;
 IF NOT FOUND OR v_device.active IS NOT TRUE OR v_device.locked THEN
   RAISE EXCEPTION 'CUSTOMER_CREDIT_POS_DEVICE_INVALID' USING ERRCODE='42501';
 END IF;
 PERFORM restaurant_pos_private.guard(v_device.restaurant_id,v_device.branch_id,'uploadSales');
 PERFORM restaurant_pos_private.guard(v_device.restaurant_id,v_device.branch_id,'viewSales');
 SELECT * INTO v_order FROM restaurant_pos_private.orders
  WHERE id=p_order_id AND device_id=p_device_id AND status IN ('open','held') FOR SHARE;
 IF NOT FOUND OR v_order.net_total<>p_amount OR NOT EXISTS(
  SELECT 1 FROM restaurant_pos_private.shifts s
   WHERE s.id=v_order.shift_id AND s.device_id=p_device_id AND s.closed_at IS NULL
 ) THEN RAISE EXCEPTION 'CUSTOMER_CREDIT_POS_ORDER_INVALID' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_customer FROM public.customers
  WHERE id=p_customer_id AND restaurant_id=v_device.restaurant_id
    AND is_active IS TRUE AND (branch_id IS NULL OR branch_id=v_device.branch_id)
  FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_CREDIT_POS_CUSTOMER_INVALID' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_branch FROM public.branches WHERE id=v_device.branch_id AND restaurant_id=v_device.restaurant_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_CREDIT_POS_BRANCH_INVALID' USING ERRCODE='42501'; END IF;
 SELECT coalesce(sum(greatest(coalesce(remaining_amount,0),0)) FILTER
  (WHERE status IS DISTINCT FROM 'written_off'),0)
  INTO v_outstanding FROM public.debt_records
  WHERE customer_id=v_customer.id AND restaurant_id=v_device.restaurant_id
   AND party_type='customer' AND type='receivable';
 v_limit:=greatest(coalesce(v_customer.credit_limit,0),0);
 IF p_amount>greatest(v_limit-v_outstanding,0) THEN
   RAISE EXCEPTION 'SALES_CLOSING_CREDIT_LIMIT_EXCEEDED' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.debt_records(
  restaurant_id,tenant_id,branch,branch_id,type,party_type,party_name,party_phone,
  customer_id,settlement_request_id,invoice_number,date,total_amount,paid_amount,
  remaining_amount,status,description,created_by,created_date,updated_date
 ) VALUES(
  v_device.restaurant_id,coalesce(v_customer.tenant_id,v_device.restaurant_id::text),
  v_branch.branch_key,v_device.branch_id,'receivable','customer',v_customer.name,
  v_customer.phone,v_customer.id,v_order.id,'R-'||v_order.number,
  (now() at time zone 'Asia/Riyadh')::date,p_amount,0,p_amount,'open',
  'Restaurant POS customer credit order #'||v_order.number,auth.uid()::text,now(),now()
 )
 ON CONFLICT (settlement_request_id) WHERE settlement_request_id IS NOT NULL DO NOTHING
 RETURNING * INTO v_debt;
 IF NOT FOUND THEN
   SELECT * INTO v_debt FROM public.debt_records WHERE settlement_request_id=v_order.id;
   IF NOT FOUND OR v_debt.customer_id IS DISTINCT FROM v_customer.id
     OR v_debt.restaurant_id IS DISTINCT FROM v_device.restaurant_id
     OR v_debt.branch_id IS DISTINCT FROM v_device.branch_id
     OR v_debt.total_amount IS DISTINCT FROM p_amount OR v_debt.type<>'receivable' THEN
     RAISE EXCEPTION 'CUSTOMER_CREDIT_POS_DUPLICATE_CONFLICT' USING ERRCODE='23505';
   END IF;
 END IF;
 PERFORM public.erp_refresh_customer_receivable_cache(v_customer.id);
 RETURN v_debt.id;
END $post$;
REVOKE ALL ON FUNCTION restaurant_pos_private.post_customer_credit_receivable(uuid,uuid,uuid,numeric) FROM PUBLIC,anon,authenticated;
