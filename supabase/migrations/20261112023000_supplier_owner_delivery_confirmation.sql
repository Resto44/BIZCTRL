-- Supplier-order delivery verification. No stock, supplier invoice or payment postings.
-- Supplier may mark approved orders as shipped; only an approved Owner can verify all
-- product quantities and complete the order. Rows are immutable audit snapshots.
CREATE TABLE IF NOT EXISTS public.supplier_order_delivery_confirmations (
  order_id uuid PRIMARY KEY REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  confirmed_by uuid NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  verified_items jsonb NOT NULL CHECK (jsonb_typeof(verified_items)='array' AND jsonb_array_length(verified_items) BETWEEN 1 AND 100)
);
CREATE INDEX IF NOT EXISTS supplier_delivery_confirmations_scoped
 ON public.supplier_order_delivery_confirmations(restaurant_id,branch_id,supplier_id,confirmed_at DESC);
ALTER TABLE public.supplier_order_delivery_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_order_delivery_confirmations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.supplier_order_delivery_confirmations TO service_role;

-- From legacy Owner Purchase Orders a draft/sent order must be explicitly approved
-- before the Supplier can mark it shipped. This does not post inventory or invoices.
CREATE OR REPLACE FUNCTION public.erp_owner_approve_supplier_order(p_order_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE po public.purchase_orders; items jsonb;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR p_order_id IS NULL THEN
  RAISE EXCEPTION 'SUPPLIER_ORDER_OWNER_APPROVAL_REQUIRED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO po FROM public.purchase_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR po.restaurant_id IS NULL OR po.branch_id IS NULL OR po.supplier_id IS NULL
   OR NOT public.erp_subscription_has_erp_access(po.restaurant_id)
   OR NOT EXISTS(SELECT 1 FROM public.erp_memberships m WHERE m.user_id=(SELECT auth.uid())
     AND m.restaurant_id=po.restaurant_id AND m.status='approved' AND m.role='owner') THEN
  RAISE EXCEPTION 'SUPPLIER_ORDER_OWNER_APPROVAL_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF po.status='approved' THEN
  RETURN jsonb_build_object('id',po.id,'status','approved','already_approved',true);
 END IF;
 IF po.status NOT IN ('draft','sent','pending') THEN
  RAISE EXCEPTION 'SUPPLIER_ORDER_APPROVAL_BAD_STATE' USING ERRCODE='23514';
 END IF;
 BEGIN
  items:=CASE WHEN jsonb_typeof(po.items)='array' THEN po.items
   WHEN jsonb_typeof(po.items)='string' THEN (po.items#>>'{}')::jsonb
   ELSE '[]'::jsonb END;
 EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'SUPPLIER_ORDER_ITEMS_REQUIRED' USING ERRCODE='23514';
 END;
 IF jsonb_typeof(items)<>'array' OR jsonb_array_length(items) NOT BETWEEN 1 AND 100
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(items) x WHERE
    jsonb_typeof(x)<>'object'
    OR coalesce(nullif(x->>'product_name',''),nullif(x->>'name','')) IS NULL) THEN
  RAISE EXCEPTION 'SUPPLIER_ORDER_ITEMS_REQUIRED' USING ERRCODE='23514';
 END IF;
 UPDATE public.purchase_orders SET status='approved',approval_status='approved',updated_date=now()
 WHERE id=po.id AND status IN ('draft','sent','pending');
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLIER_ORDER_APPROVAL_CONCURRENT_CHANGE' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('id',po.id,'status','approved','already_approved',false);
END $fn$;
REVOKE ALL ON FUNCTION public.erp_owner_approve_supplier_order(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_owner_approve_supplier_order(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.erp_supplier_mark_order_shipped(p_order_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE po public.purchase_orders; supplier_id uuid;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR p_order_id IS NULL THEN
  RAISE EXCEPTION 'SUPPLIER_ORDER_SCOPE_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO po FROM public.purchase_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR po.supplier_id IS NULL OR po.branch_id IS NULL OR po.restaurant_id IS NULL
   OR NOT public.erp_subscription_has_erp_access(po.restaurant_id) THEN
   RAISE EXCEPTION 'SUPPLIER_ORDER_NOT_FOUND' USING ERRCODE='42501';
 END IF;
 SELECT m.linked_entity_id INTO supplier_id FROM public.erp_memberships m
 JOIN public.suppliers s ON s.id=m.linked_entity_id AND s.restaurant_id=m.restaurant_id
  AND (s.branch_id IS NULL OR s.branch_id=m.branch_id) AND coalesce(s.status,true)
 WHERE m.user_id=(SELECT auth.uid()) AND m.role='supplier' AND m.status='approved'
  AND m.restaurant_id=po.restaurant_id AND m.branch_id=po.branch_id
  AND m.linked_entity_id=po.supplier_id
 LIMIT 1;
 IF supplier_id IS NULL THEN
  RAISE EXCEPTION 'SUPPLIER_ORDER_SCOPE_DENIED' USING ERRCODE='42501';
 END IF;
 IF po.status='shipped' THEN
  RETURN jsonb_build_object('id',po.id,'status','shipped','awaiting_owner_confirmation',true);
 END IF;
 IF po.status<>'approved' THEN
  RAISE EXCEPTION 'SUPPLIER_ORDER_INVALID_SHIPMENT_STATE' USING ERRCODE='23514';
 END IF;
 UPDATE public.purchase_orders SET status='shipped',updated_date=now()
 WHERE id=po.id AND status='approved';
 RETURN jsonb_build_object('id',po.id,'status','shipped','awaiting_owner_confirmation',true);
END $fn$;
REVOKE ALL ON FUNCTION public.erp_supplier_mark_order_shipped(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_supplier_mark_order_shipped(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.erp_owner_confirm_supplier_delivery(
 p_order_id uuid,p_received_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE po public.purchase_orders; original jsonb; verified jsonb:='[]'::jsonb;
 v_item jsonb; v_entry jsonb; n int; i int; ordered_qty numeric; received_qty numeric;
 v_owner uuid; recorded public.supplier_order_delivery_confirmations;
BEGIN
 v_owner:=(SELECT auth.uid());
 IF v_owner IS NULL OR p_order_id IS NULL THEN
  RAISE EXCEPTION 'SUPPLIER_RECEIPT_OWNER_ONLY' USING ERRCODE='42501';
 END IF;
 SELECT * INTO po FROM public.purchase_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR po.supplier_id IS NULL OR po.branch_id IS NULL OR po.restaurant_id IS NULL
  OR NOT public.erp_subscription_has_erp_access(po.restaurant_id)
  OR NOT EXISTS(SELECT 1 FROM public.erp_memberships m WHERE m.user_id=v_owner
   AND m.status='approved' AND m.role='owner' AND m.restaurant_id=po.restaurant_id) THEN
   RAISE EXCEPTION 'SUPPLIER_RECEIPT_OWNER_ONLY' USING ERRCODE='42501';
 END IF;
 IF po.status='received' THEN
  SELECT * INTO recorded FROM public.supplier_order_delivery_confirmations WHERE order_id=po.id;
  IF FOUND THEN RETURN jsonb_build_object('id',po.id,'status','received',
    'confirmed_at',recorded.confirmed_at,'items',recorded.verified_items,'already_confirmed',true); END IF;
  RAISE EXCEPTION 'SUPPLIER_RECEIPT_MISSING_AUDIT' USING ERRCODE='23514';
 END IF;
 IF po.status<>'shipped' THEN
  RAISE EXCEPTION 'SUPPLIER_RECEIPT_REQUIRES_SHIPMENT' USING ERRCODE='23514';
 END IF;
 original:=CASE WHEN jsonb_typeof(po.items)='array' THEN po.items
  WHEN jsonb_typeof(po.items)='string' THEN (po.items#>>'{}')::jsonb
  ELSE '[]'::jsonb END;
 IF jsonb_typeof(original)<>'array' OR jsonb_array_length(original) NOT BETWEEN 1 AND 100
 OR p_received_items IS NULL OR jsonb_typeof(p_received_items)<>'array'
 OR jsonb_array_length(p_received_items)<>jsonb_array_length(original) THEN
  RAISE EXCEPTION 'SUPPLIER_RECEIPT_ITEMS_REQUIRED' USING ERRCODE='23514';
 END IF;
 n:=jsonb_array_length(original);
 FOR i IN 0..n-1 LOOP
  v_item:=original->i;
  IF jsonb_typeof(v_item)<>'object' OR length(coalesce(v_item->>'product_name',v_item->>'name',''))=0 THEN
   RAISE EXCEPTION 'SUPPLIER_RECEIPT_ITEM_INVALID' USING ERRCODE='23514';
  END IF;
  BEGIN
   ordered_qty:=coalesce(nullif(v_item->>'quantity',''),nullif(v_item->>'qty',''))::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   RAISE EXCEPTION 'SUPPLIER_RECEIPT_ITEM_INVALID' USING ERRCODE='23514';
  END;
  IF ordered_qty IS NULL OR ordered_qty<=0 OR ordered_qty>100000 THEN
   RAISE EXCEPTION 'SUPPLIER_RECEIPT_ITEM_INVALID' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_received_items) x
   WHERE jsonb_typeof(x)='object' AND x->>'line_index'=i::text)<>1 THEN
   RAISE EXCEPTION 'SUPPLIER_RECEIPT_ITEMS_REQUIRED' USING ERRCODE='23514';
  END IF;
  SELECT x INTO v_entry FROM jsonb_array_elements(p_received_items) x
   WHERE x->>'line_index'=i::text LIMIT 1;
  BEGIN
   received_qty:=(v_entry->>'received_qty')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   RAISE EXCEPTION 'SUPPLIER_RECEIPT_QUANTITY_MISMATCH' USING ERRCODE='23514';
  END;
  IF received_qty IS DISTINCT FROM ordered_qty THEN
   RAISE EXCEPTION 'SUPPLIER_RECEIPT_QUANTITY_MISMATCH' USING ERRCODE='23514';
  END IF;
  verified:=verified||jsonb_build_array(v_item||jsonb_build_object(
   'line_index',i,'ordered_quantity',ordered_qty,'received_quantity',received_qty,
   'owner_verified',true));
 END LOOP;
 INSERT INTO public.supplier_order_delivery_confirmations
 (order_id,restaurant_id,branch_id,supplier_id,confirmed_by,verified_items)
 VALUES(po.id,po.restaurant_id,po.branch_id,po.supplier_id,v_owner,verified)
 RETURNING * INTO recorded;
 UPDATE public.purchase_orders SET status='received',received_date=(now() AT TIME ZONE 'Asia/Riyadh')::date,
  updated_date=now() WHERE id=po.id AND status='shipped';
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLIER_RECEIPT_CONCURRENT_CHANGE' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('id',po.id,'status','received','confirmed_at',recorded.confirmed_at,
  'items',recorded.verified_items,'already_confirmed',false);
END $fn$;
REVOKE ALL ON FUNCTION public.erp_owner_confirm_supplier_delivery(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_owner_confirm_supplier_delivery(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.erp_supplier_verified_deliveries()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'order_id',r.order_id,'branch_id',r.branch_id,'confirmed_at',r.confirmed_at,
   'verified_items',r.verified_items) ORDER BY r.confirmed_at DESC),'[]'::jsonb)
  FROM public.supplier_order_delivery_confirmations r
  JOIN public.purchase_orders po ON po.id=r.order_id AND po.status='received'
   AND po.restaurant_id=r.restaurant_id AND po.branch_id=r.branch_id
   AND po.supplier_id=r.supplier_id
  WHERE EXISTS(SELECT 1 FROM public.erp_memberships m WHERE m.user_id=(SELECT auth.uid())
   AND m.status='approved' AND m.role='supplier' AND m.linked_entity_id=r.supplier_id
   AND m.restaurant_id=r.restaurant_id AND m.branch_id=r.branch_id
   AND public.erp_subscription_has_erp_access(m.restaurant_id));
$fn$;
REVOKE ALL ON FUNCTION public.erp_supplier_verified_deliveries() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_supplier_verified_deliveries() TO authenticated;

-- Enforce at the database boundary even if a client bypasses the supplier UI.
CREATE OR REPLACE FUNCTION public.erp_supplier_order_status_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF (SELECT auth.uid()) IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.erp_memberships m WHERE m.user_id=(SELECT auth.uid())
   AND m.role='supplier' AND m.status='approved' AND m.restaurant_id=OLD.restaurant_id
   AND m.branch_id=OLD.branch_id AND m.linked_entity_id=OLD.supplier_id
 ) THEN
  IF OLD.status IS DISTINCT FROM 'approved' OR NEW.status IS DISTINCT FROM 'shipped'
   OR (to_jsonb(OLD)-'status'-'updated_date')<>(to_jsonb(NEW)-'status'-'updated_date') THEN
    RAISE EXCEPTION 'SUPPLIER_CAN_ONLY_MARK_APPROVED_ORDER_SHIPPED' USING ERRCODE='42501';
  END IF;
 END IF;
 IF OLD.status='shipped' AND NEW.status='received' AND NEW.supplier_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.supplier_order_delivery_confirmations a
   WHERE a.order_id=OLD.id AND a.restaurant_id=OLD.restaurant_id
    AND a.branch_id=OLD.branch_id AND a.supplier_id=OLD.supplier_id) THEN
   RAISE EXCEPTION 'SUPPLIER_RECEIPT_OWNER_CONFIRMATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS erp_supplier_order_status_guard ON public.purchase_orders;
CREATE TRIGGER erp_supplier_order_status_guard BEFORE UPDATE ON public.purchase_orders
 FOR EACH ROW EXECUTE FUNCTION public.erp_supplier_order_status_guard();
REVOKE ALL ON FUNCTION public.erp_supplier_order_status_guard() FROM PUBLIC,anon,authenticated;
