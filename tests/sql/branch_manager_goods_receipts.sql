-- Integration regression using existing approved data, with ALL receipt writes rolled back.
BEGIN;
DO $test$
DECLARE
 inv public.supplier_invoices;
 manager_id uuid;
 actor record;
 payload jsonb;
 result jsonb;
 before_invoice jsonb;
 denied integer:=0;
BEGIN
 SELECT i.* INTO STRICT inv FROM public.supplier_invoices i
 JOIN public.erp_memberships m ON m.restaurant_id=i.restaurant_id AND m.branch_id=i.branch_id
  AND m.role='manager' AND m.status='approved'
 WHERE i.approval_status IN ('approved','auto_approved') AND i.status IN ('approved','paid','partial','unpaid')
  AND public.erp_subscription_has_erp_access(i.restaurant_id)
  AND jsonb_typeof(i.items)='array' AND jsonb_array_length(i.items)>0
  AND NOT EXISTS(SELECT 1 FROM public.supplier_invoice_delivery_receipts r WHERE r.invoice_id=i.id)
 ORDER BY i.date DESC LIMIT 1;
 SELECT m.user_id INTO STRICT manager_id FROM public.erp_memberships m
 WHERE m.restaurant_id=inv.restaurant_id AND m.branch_id=inv.branch_id
  AND m.role='manager' AND m.status='approved' LIMIT 1;
 before_invoice:=to_jsonb(inv);
 SELECT jsonb_agg(jsonb_build_object('line_index',ord-1,'received_qty',coalesce(x->>'quantity',x->>'qty')::numeric))
 INTO payload FROM jsonb_array_elements(inv.items) WITH ORDINALITY AS a(x,ord);
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claims','{}',true);
 BEGIN
  PERFORM public.erp_owner_confirm_supplier_invoice_delivery(inv.id,payload);
  RAISE EXCEPTION 'Anonymous receipt write unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- Exercise all existing unauthorized memberships: other branch/tenant, suppliers, staff, suspended.
 FOR actor IN SELECT DISTINCT m.user_id FROM public.erp_memberships m WHERE m.user_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.erp_memberships ok WHERE ok.user_id=m.user_id
  AND ok.restaurant_id=inv.restaurant_id AND ok.status='approved'
  AND (ok.role='owner' OR (ok.role='manager' AND ok.branch_id=inv.branch_id))) LOOP
  PERFORM set_config('request.jwt.claim.sub',actor.user_id::text,true);
  BEGIN
   PERFORM public.erp_owner_confirm_supplier_invoice_delivery(inv.id,payload);
   RAISE EXCEPTION 'Unauthorized receipt write unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
 END LOOP;
 IF denied=0 THEN RAISE EXCEPTION 'No negative access cases exercised'; END IF;
 PERFORM set_config('request.jwt.claim.sub',manager_id::text,true);
 BEGIN
  PERFORM public.erp_owner_confirm_supplier_invoice_delivery(inv.id,'[]'::jsonb);
  RAISE EXCEPTION 'Empty delivery unexpectedly allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 result:=public.erp_owner_confirm_supplier_invoice_delivery(inv.id,payload);
 IF result->>'status'<>'received' OR result->>'already_confirmed'<>'false' THEN
  RAISE EXCEPTION 'Manager delivery failed'; END IF;
 IF result#>>'{verified_items,0,confirmed_by_role}'<>'manager'
  OR result#>>'{verified_items,0,owner_verified}'<>'false' THEN
  RAISE EXCEPTION 'Wrong confirmer audit role'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.supplier_invoice_delivery_receipts r
  WHERE r.invoice_id=inv.id AND r.confirmed_by=manager_id) THEN
  RAISE EXCEPTION 'Wrong audit user'; END IF;
 result:=public.erp_owner_confirm_supplier_invoice_delivery(inv.id,payload);
 IF result->>'already_confirmed'<>'true' THEN RAISE EXCEPTION 'Duplicate receipt not idempotent'; END IF;
 result:=public.erp_supplier_invoice_delivery_receipts(inv.restaurant_id);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result) r WHERE r->>'invoice_id'=inv.id::text)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(result) r WHERE r->>'branch_id'<>inv.branch_id::text) THEN
  RAISE EXCEPTION 'Manager receipt reads not branch scoped'; END IF;
 FOR actor IN SELECT DISTINCT m.user_id FROM public.erp_memberships m WHERE m.user_id IS NOT NULL LOOP
  PERFORM set_config('request.jwt.claim.sub',actor.user_id::text,true);
  result:=public.erp_supplier_invoice_delivery_receipts(inv.restaurant_id);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(result) r
   WHERE NOT EXISTS(SELECT 1 FROM public.erp_memberships m WHERE m.user_id=actor.user_id
    AND m.restaurant_id=inv.restaurant_id AND m.status='approved'
    AND (m.role='owner' OR (m.role='manager' AND m.branch_id::text=r->>'branch_id')
     OR (m.role='supplier' AND m.branch_id::text=r->>'branch_id' AND m.linked_entity_id::text=r->>'supplier_id')))) THEN
   RAISE EXCEPTION 'Receipt read leaked outside authorized membership'; END IF;
 END LOOP;
 IF (SELECT to_jsonb(i) FROM public.supplier_invoices i WHERE i.id=inv.id) IS DISTINCT FROM before_invoice THEN
  RAISE EXCEPTION 'Receipt changed invoice or payment state'; END IF;
END $test$;
SELECT 'PASS: manager receipt, audit, idempotence, scoped reads, unauthorized writes and unchanged invoice; all writes rolled back' AS regression;
ROLLBACK;
