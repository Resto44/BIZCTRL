CREATE OR REPLACE FUNCTION public.erp_purchase_order_supplier_product_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_items jsonb; v_item jsonb; v_product text; v_resolved_product uuid; v_old_items jsonb; v_old_count integer; v_new_count integer;
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
  -- Both ERP inventory UUIDs and legacy catalog codes are supported.
  -- Canonical identity wins if a legacy code happens to match a UUID.
  SELECT p.id INTO v_resolved_product FROM public.products p
   WHERE p.restaurant_id=NEW.restaurant_id
     AND (p.id::text=v_product OR p.product_id=v_product)
   ORDER BY (p.id::text=v_product) DESC, p.id LIMIT 1;
  IF v_product IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.products p WHERE p.restaurant_id=NEW.restaurant_id
      AND p.supplier_id=NEW.supplier_id AND p.id=v_resolved_product
      AND coalesce(p.is_active,true)
  ) THEN
   -- Historical orders may contain products that were entered before
   -- supplier assignments existed. Preserve their existing lines during
   -- quantity/price corrections, but NEVER permit adding new unmatched
   -- product lines or moving them to a different supplier/branch/tenant.
   IF TG_OP='UPDATE' AND NEW.restaurant_id IS NOT DISTINCT FROM OLD.restaurant_id
     AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
     AND NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id THEN
     BEGIN
      v_old_items:=CASE WHEN jsonb_typeof(OLD.items)='array' THEN OLD.items
       WHEN jsonb_typeof(OLD.items)='string' THEN (OLD.items#>>'{}')::jsonb
       ELSE '[]'::jsonb END;
     EXCEPTION WHEN others THEN v_old_items:='[]'::jsonb;
     END;
     SELECT count(*) INTO v_old_count FROM jsonb_array_elements(v_old_items) x
        WHERE x->>'product_id'=v_product;
     SELECT count(*) INTO v_new_count FROM jsonb_array_elements(v_items) x
        WHERE x->>'product_id'=v_product;
     IF v_old_count>=v_new_count AND v_old_count>0 THEN CONTINUE; END IF;
   END IF;
   RAISE EXCEPTION 'PURCHASE_ORDER_PRODUCT_NOT_ASSIGNED_TO_SUPPLIER' USING ERRCODE='23514';
  END IF;
 END LOOP;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.erp_purchase_order_supplier_product_guard() FROM PUBLIC,anon,authenticated;
