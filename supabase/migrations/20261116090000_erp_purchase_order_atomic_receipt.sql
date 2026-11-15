-- Atomic, idempotent, tenant-scoped restaurant purchase-order receiving.
-- Existing purchases and orders are never changed by this migration.
-- A separate immutable receipt journal prevents new retries from double-posting stock/cash.
CREATE TABLE IF NOT EXISTS public.erp_purchase_order_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  request_id uuid NOT NULL UNIQUE,
  receipt_date date NOT NULL,
  input_items jsonb NOT NULL,
  posted_items jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT erp_purchase_order_receipt_items_array CHECK (
    jsonb_typeof(input_items)='array' AND jsonb_typeof(posted_items)='array')
);
CREATE INDEX IF NOT EXISTS erp_po_receipts_order_idx
 ON public.erp_purchase_order_receipts(order_id,created_at);
ALTER TABLE public.erp_purchase_order_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_purchase_order_receipts FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.erp_purchase_order_receipt_progress(p_order_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 po public.purchase_orders;
 v_items jsonb;
 v_original jsonb;
 v_lines jsonb := '[]'::jsonb;
 v_item jsonb;
 v_ordered numeric;
 v_previously numeric;
 v_count integer;
 i integer;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR p_order_id IS NULL THEN
  RAISE EXCEPTION 'PO_RECEIPT_SCOPE_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO po FROM public.purchase_orders WHERE id=p_order_id;
 IF NOT FOUND OR po.restaurant_id IS NULL OR po.branch_id IS NULL
  OR NOT public.erp_can_access_scope_text(po.restaurant_id::text,po.branch_id::text)
  OR NOT public.erp_has_any_permission(ARRAY['viewPurchaseOrders','viewPurchases']) THEN
  RAISE EXCEPTION 'PO_RECEIPT_SCOPE_DENIED' USING ERRCODE='42501';
 END IF;
 BEGIN
  v_items:=CASE WHEN jsonb_typeof(po.items)='array' THEN po.items
    WHEN jsonb_typeof(po.items)='string' THEN (po.items#>>'{}')::jsonb
    ELSE '[]'::jsonb END;
 EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'PO_RECEIPT_ITEMS_INVALID' USING ERRCODE='23514';
 END;
 IF jsonb_typeof(v_items)<>'array' OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'PO_RECEIPT_ITEMS_INVALID' USING ERRCODE='23514';
 END IF;
 v_count:=jsonb_array_length(v_items);
 FOR i IN 0..v_count-1 LOOP
  v_item:=v_items->i;
  BEGIN
   v_ordered:=(v_item->>'qty')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   RAISE EXCEPTION 'PO_RECEIPT_ITEMS_INVALID' USING ERRCODE='23514';
  END;
  IF v_ordered IS NULL OR v_ordered<=0 OR v_ordered>100000 THEN
   RAISE EXCEPTION 'PO_RECEIPT_ITEMS_INVALID' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(sum((e.value->>'received_qty')::numeric),0) INTO v_previously
   FROM public.erp_purchase_order_receipts r
   CROSS JOIN LATERAL jsonb_array_elements(r.posted_items) e(value)
   WHERE r.order_id=po.id AND e.value->>'line_index'=i::text;
  v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
    'line_index',i,'ordered_qty',v_ordered,'received_qty',v_previously,
    'remaining_qty',greatest(0,v_ordered-v_previously)));
 END LOOP;
 RETURN jsonb_build_object('id',po.id,'status',po.status,'lines',v_lines,
  'legacy_partial',po.status='partial' AND NOT EXISTS(
    SELECT 1 FROM public.erp_purchase_order_receipts WHERE order_id=po.id));
END $fn$;
REVOKE ALL ON FUNCTION public.erp_purchase_order_receipt_progress(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_purchase_order_receipt_progress(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.erp_receive_purchase_order(
 p_order_id uuid, p_request_id uuid, p_receipt_date date, p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 po public.purchase_orders;
 prev public.erp_purchase_order_receipts;
 v_actor uuid:=(SELECT auth.uid());
 v_items jsonb;
 v_line jsonb;
 v_request jsonb;
 v_posted jsonb:='[]'::jsonb;
 v_qty numeric;
 v_ordered numeric;
 v_already numeric;
 v_price numeric;
 v_purchase_id uuid;
 v_receipt_id uuid:=gen_random_uuid();
 v_final_status text;
 v_count integer;
 v_total_positive integer:=0;
 v_all_received boolean:=true;
 i integer;
BEGIN
 IF v_actor IS NULL OR p_order_id IS NULL OR p_request_id IS NULL
   OR p_receipt_date IS NULL OR p_items IS NULL THEN
  RAISE EXCEPTION 'PO_RECEIPT_ARGUMENTS_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- Serialize all receipt submissions for one order, including concurrent retries.
 SELECT * INTO po FROM public.purchase_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR po.restaurant_id IS NULL OR po.branch_id IS NULL
  OR NOT public.erp_subscription_has_erp_access(po.restaurant_id)
  OR NOT public.erp_can_write_module_scope_text(po.restaurant_id::text,po.branch_id::text,'createPurchases')
  OR public.erp_current_role() NOT IN ('owner','manager','employee') THEN
  RAISE EXCEPTION 'PO_RECEIPT_SCOPE_DENIED' USING ERRCODE='42501';
 END IF;
 -- Idempotent replay: returns previous receipt without inserting purchases again.
 SELECT * INTO prev FROM public.erp_purchase_order_receipts
  WHERE request_id=p_request_id;
 IF FOUND THEN
  IF prev.order_id<>po.id OR prev.receipt_date<>p_receipt_date OR prev.input_items<>p_items THEN
   RAISE EXCEPTION 'PO_RECEIPT_REQUEST_ID_REUSED' USING ERRCODE='23514';
  END IF;
  RETURN jsonb_build_object('id',po.id,'receipt_id',prev.id,'status',po.status,
   'posted_items',prev.posted_items,'already_processed',true);
 END IF;
 -- Shipped supplier orders use the separate Owner physical-verification workflow.
 IF po.status NOT IN ('sent','partial') THEN
  RAISE EXCEPTION 'PO_RECEIPT_INVALID_ORDER_STATUS' USING ERRCODE='23514';
 END IF;
 -- Historic partial orders have no safe posting ledger; require manual reconciliation.
 IF po.status='partial' AND NOT EXISTS(
  SELECT 1 FROM public.erp_purchase_order_receipts r WHERE r.order_id=po.id) THEN
  RAISE EXCEPTION 'PO_RECEIPT_LEGACY_PARTIAL_RECONCILIATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 BEGIN
  v_items:=CASE WHEN jsonb_typeof(po.items)='array' THEN po.items
    WHEN jsonb_typeof(po.items)='string' THEN (po.items#>>'{}')::jsonb
    ELSE '[]'::jsonb END;
 EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'PO_RECEIPT_ITEMS_INVALID' USING ERRCODE='23514';
 END;
 IF jsonb_typeof(v_items)<>'array' OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 100
 OR jsonb_typeof(p_items)<>'array'
 OR jsonb_array_length(p_items)<>jsonb_array_length(v_items) THEN
  RAISE EXCEPTION 'PO_RECEIPT_ITEMS_INVALID' USING ERRCODE='23514';
 END IF;
 v_count:=jsonb_array_length(v_items);
 FOR i IN 0..v_count-1 LOOP
  v_line:=v_items->i;
  IF jsonb_typeof(v_line)<>'object' OR
   nullif(btrim(coalesce(v_line->>'product_id','')),'') IS NULL THEN
   RAISE EXCEPTION 'PO_RECEIPT_PRODUCT_INVALID' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_items) e(value)
     WHERE jsonb_typeof(e.value)='object' AND e.value->>'line_index'=i::text)<>1 THEN
   RAISE EXCEPTION 'PO_RECEIPT_LINE_INDEX_INVALID' USING ERRCODE='23514';
  END IF;
  SELECT e.value INTO v_request FROM jsonb_array_elements(p_items) e(value)
   WHERE e.value->>'line_index'=i::text LIMIT 1;
  BEGIN
   v_ordered:=(v_line->>'qty')::numeric;
   v_qty:=(v_request->>'received_qty')::numeric;
   v_price:=coalesce((v_line->>'unit_price')::numeric,0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   RAISE EXCEPTION 'PO_RECEIPT_QUANTITY_INVALID' USING ERRCODE='23514';
  END;
  IF v_ordered IS NULL OR v_ordered<=0 OR v_ordered>100000
  OR v_qty IS NULL OR v_qty<0 OR v_qty>100000 OR v_price<0 OR v_price>100000000 THEN
   RAISE EXCEPTION 'PO_RECEIPT_QUANTITY_INVALID' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(sum((e.value->>'received_qty')::numeric),0) INTO v_already
   FROM public.erp_purchase_order_receipts r
   CROSS JOIN LATERAL jsonb_array_elements(r.posted_items) e(value)
   WHERE r.order_id=po.id AND e.value->>'line_index'=i::text;
  IF v_qty>v_ordered-v_already THEN
   RAISE EXCEPTION 'PO_RECEIPT_EXCEEDS_REMAINING_QUANTITY' USING ERRCODE='23514';
  END IF;
  IF v_qty>0 THEN
   v_total_positive:=v_total_positive+1;
   INSERT INTO public.purchases
    (restaurant_id,branch_id,branch,date,product_id,product_name,qty,
     current_price,used_price,notes,created_by,created_date,updated_date)
   VALUES (po.restaurant_id,po.branch_id,po.branch,p_receipt_date,
     v_line->>'product_id',coalesce(v_line->>'product_name',''),
     v_qty,v_price,v_price,concat('PO receipt ',po.id::text,' / ',v_receipt_id::text),
     (SELECT email FROM auth.users WHERE id=v_actor),now(),now())
   RETURNING id INTO v_purchase_id;
  ELSE
   v_purchase_id:=NULL;
  END IF;
  v_posted:=v_posted||jsonb_build_array(jsonb_build_object(
   'line_index',i,'received_qty',v_qty,'purchase_id',v_purchase_id,
   'product_id',v_line->>'product_id'));
  IF v_already+v_qty<v_ordered THEN v_all_received:=false; END IF;
 END LOOP;
 IF v_total_positive=0 THEN
  RAISE EXCEPTION 'PO_RECEIPT_AT_LEAST_ONE_ITEM_REQUIRED' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.erp_purchase_order_receipts
  (id,order_id,restaurant_id,branch_id,request_id,receipt_date,input_items,
   posted_items,created_by)
 VALUES (v_receipt_id,po.id,po.restaurant_id,po.branch_id,p_request_id,
   p_receipt_date,p_items,v_posted,v_actor);
 v_final_status:=CASE WHEN v_all_received THEN 'received' ELSE 'partial' END;
 UPDATE public.purchase_orders SET status=v_final_status,
   received_date=CASE WHEN v_all_received THEN p_receipt_date ELSE received_date END,
   updated_date=now() WHERE id=po.id;
 RETURN jsonb_build_object('id',po.id,'receipt_id',v_receipt_id,
   'status',v_final_status,'posted_items',v_posted,'already_processed',false);
END $fn$;
REVOKE ALL ON FUNCTION public.erp_receive_purchase_order(uuid,uuid,date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_receive_purchase_order(uuid,uuid,date,jsonb) TO authenticated;
