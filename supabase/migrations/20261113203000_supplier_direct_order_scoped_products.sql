-- Direct supplier purchase orders. This does not create invoices, stock movements or payments.
-- An authorized restaurant employee can submit an order using existing purchase-order RLS.
-- The linked supplier may mark it shipped without a second Owner approval.
CREATE OR REPLACE FUNCTION public.erp_supplier_mark_order_shipped(p_order_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE po public.purchase_orders; v_supplier uuid;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR p_order_id IS NULL THEN
  RAISE EXCEPTION 'SUPPLIER_ORDER_SCOPE_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO po FROM public.purchase_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR po.supplier_id IS NULL OR po.branch_id IS NULL OR po.restaurant_id IS NULL
   OR NOT public.erp_subscription_has_erp_access(po.restaurant_id) THEN
  RAISE EXCEPTION 'SUPPLIER_ORDER_NOT_FOUND' USING ERRCODE='42501';
 END IF;
 SELECT m.linked_entity_id INTO v_supplier FROM public.erp_memberships m
 JOIN public.suppliers s ON s.id=m.linked_entity_id AND s.restaurant_id=m.restaurant_id
  AND (s.branch_id IS NULL OR s.branch_id=m.branch_id) AND coalesce(s.status,true)
 WHERE m.user_id=(SELECT auth.uid()) AND m.role='supplier' AND m.status='approved'
  AND m.restaurant_id=po.restaurant_id AND m.branch_id=po.branch_id
  AND m.linked_entity_id=po.supplier_id LIMIT 1;
 IF v_supplier IS NULL THEN
  RAISE EXCEPTION 'SUPPLIER_ORDER_SCOPE_DENIED' USING ERRCODE='42501';
 END IF;
 IF po.status='shipped' THEN
  RETURN jsonb_build_object('id',po.id,'status','shipped','awaiting_owner_confirmation',true);
 END IF;
 IF po.status NOT IN ('draft','sent','pending','approved') THEN
  RAISE EXCEPTION 'SUPPLIER_ORDER_INVALID_SHIPMENT_STATE' USING ERRCODE='23514';
 END IF;
 UPDATE public.purchase_orders SET status='shipped',updated_date=now()
 WHERE id=po.id AND status IN ('draft','sent','pending','approved');
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLIER_ORDER_CONCURRENT_CHANGE' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('id',po.id,'status','shipped','awaiting_owner_confirmation',true);
END $fn$;
REVOKE ALL ON FUNCTION public.erp_supplier_mark_order_shipped(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_supplier_mark_order_shipped(uuid) TO authenticated;

-- Preserve the shipment-only and owner physical-receipt guards.
CREATE OR REPLACE FUNCTION public.erp_supplier_order_status_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF (SELECT auth.uid()) IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.erp_memberships m WHERE m.user_id=(SELECT auth.uid())
   AND m.role='supplier' AND m.status='approved' AND m.restaurant_id=OLD.restaurant_id
   AND m.branch_id=OLD.branch_id AND m.linked_entity_id=OLD.supplier_id
 ) THEN
  IF OLD.status NOT IN ('draft','sent','pending','approved')
    OR NEW.status IS DISTINCT FROM 'shipped'
    OR (to_jsonb(OLD)-'status'-'updated_date')<>(to_jsonb(NEW)-'status'-'updated_date') THEN
   RAISE EXCEPTION 'SUPPLIER_CAN_ONLY_MARK_ORDER_SHIPPED' USING ERRCODE='42501';
  END IF;
 END IF;
 IF OLD.status='shipped' AND NEW.status='received' AND NEW.supplier_id IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.supplier_order_delivery_confirmations a
   WHERE a.order_id=OLD.id AND a.restaurant_id=OLD.restaurant_id
    AND a.branch_id=OLD.branch_id AND a.supplier_id=OLD.supplier_id) THEN
  RAISE EXCEPTION 'SUPPLIER_RECEIPT_OWNER_CONFIRMATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.erp_supplier_order_status_guard() FROM PUBLIC,anon,authenticated;

-- Enforce supplier product ownership at the database boundary as well as in Add Item.
CREATE OR REPLACE FUNCTION public.erp_purchase_order_supplier_product_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_items jsonb; v_item jsonb; v_product text;
BEGIN
 IF NEW.supplier_id IS NULL THEN RETURN NEW; END IF;
 IF NEW.restaurant_id IS NULL OR NEW.branch_id IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.suppliers s WHERE s.id=NEW.supplier_id
    AND s.restaurant_id=NEW.restaurant_id
    AND (s.branch_id IS NULL OR s.branch_id=NEW.branch_id)
    AND coalesce(s.status,true)) THEN
  RAISE EXCEPTION 'PURCHASE_ORDER_SUPPLIER_SCOPE_INVALID' USING ERRCODE='23514';
 END IF;
 BEGIN
  v_items:=CASE WHEN jsonb_typeof(NEW.items)='array' THEN NEW.items
   WHEN jsonb_typeof(NEW.items)='string' THEN (NEW.items#>>'{}')::jsonb
   ELSE '[]'::jsonb END;
 EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'PURCHASE_ORDER_ITEMS_INVALID' USING ERRCODE='23514';
 END;
 IF jsonb_typeof(v_items)<>'array' OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'PURCHASE_ORDER_ITEMS_INVALID' USING ERRCODE='23514';
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
  v_product:=v_item->>'product_id';
  IF v_product IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.products p WHERE p.restaurant_id=NEW.restaurant_id
      AND p.supplier_id=NEW.supplier_id AND p.product_id=v_product
      AND coalesce(p.is_active,true)
  ) THEN
   RAISE EXCEPTION 'PURCHASE_ORDER_PRODUCT_NOT_ASSIGNED_TO_SUPPLIER' USING ERRCODE='23514';
  END IF;
 END LOOP;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS erp_purchase_order_supplier_product_guard ON public.purchase_orders;
CREATE TRIGGER erp_purchase_order_supplier_product_guard
 BEFORE INSERT OR UPDATE OF supplier_id,items,restaurant_id,branch_id
 ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.erp_purchase_order_supplier_product_guard();
REVOKE ALL ON FUNCTION public.erp_purchase_order_supplier_product_guard() FROM PUBLIC,anon,authenticated;
