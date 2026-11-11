-- Safe, additive hotfix for live SQLSTATE 42702 when finalizing a credit Sales Closing.
-- The customer-credit INSERT fires erp_portal_push_debt; portal_capture() used a PL/pgSQL
-- variable called 'branch', which conflicts with the customers.branch database column.
-- Rename only this local variable; keep all access, event routing and financial guards.
-- No tables, records, subscriptions, closing states or ledger amounts are changed.
CREATE OR REPLACE FUNCTION push_private.portal_capture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE rowdata jsonb; tenant uuid; v_branch_id uuid; role_target text; target_user record;
  source_state text; category text; target_customer uuid;
BEGIN
 rowdata:=to_jsonb(NEW);
 SELECT r.id INTO tenant FROM public.restaurants r
 WHERE r.id::text=rowdata->>'restaurant_id' LIMIT 1;
 IF tenant IS NULL THEN RETURN NEW; END IF;
 SELECT b.id INTO v_branch_id FROM public.branches b
 WHERE b.restaurant_id=tenant AND b.id::text=rowdata->>'branch_id' LIMIT 1;
 source_state:=CASE WHEN TG_OP='INSERT' THEN 'created' ELSE 'changed-'||coalesce(rowdata->>'status','') END;

 IF TG_TABLE_NAME='notifications' THEN
  IF TG_OP<>'INSERT' THEN RETURN NEW; END IF;
  role_target:=lower(coalesce(rowdata->>'target_role',''));
  IF role_target NOT IN ('all','owner','manager','employee','supplier','driver') THEN RETURN NEW; END IF;
  FOR target_user IN
   SELECT DISTINCT m.user_id,m.role FROM public.erp_memberships m
   WHERE m.restaurant_id=tenant AND m.status='approved'
     AND m.role IN ('owner','manager','employee','supplier','driver')
     AND (role_target='all' OR m.role=role_target)
     AND (v_branch_id IS NULL OR m.role='owner' OR m.branch_id=v_branch_id
       OR v_branch_id=ANY(coalesce(m.selected_branch_ids,ARRAY[]::uuid[]))
       OR (m.branch_id IS NULL AND cardinality(coalesce(m.selected_branch_ids,ARRAY[]::uuid[]))=0))
  LOOP
   PERFORM push_private.portal_enqueue(tenant,target_user.user_id,target_user.role,NULL,v_branch_id,
      'notice',TG_TABLE_NAME,NEW.id,'created');
  END LOOP;

 ELSIF TG_TABLE_NAME='orders' THEN
  IF TG_OP='UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
   END IF;
  IF NEW.customer_id IS NOT NULL THEN
   FOR target_user IN SELECT a.user_id,a.customer_id FROM public.customer_portal_access a
    JOIN public.customers c ON c.id=a.customer_id
    WHERE a.active AND a.user_id IS NOT NULL AND c.is_active AND c.restaurant_id=tenant
      AND c.id=NEW.customer_id AND (c.branch_id IS NULL OR c.branch_id=v_branch_id)
   LOOP
    PERFORM push_private.portal_enqueue(tenant,target_user.user_id,'customer',target_user.customer_id,v_branch_id,
      'order',TG_TABLE_NAME,NEW.id,source_state);
   END LOOP;
  END IF;
  IF NEW.driver_id IS NOT NULL THEN
   FOR target_user IN SELECT m.user_id FROM public.erp_memberships m
    WHERE m.restaurant_id=tenant AND m.status='approved' AND m.role='driver' AND m.linked_entity_id=NEW.driver_id
   LOOP PERFORM push_private.portal_enqueue(tenant,target_user.user_id,'driver',NULL,v_branch_id,
       'delivery',TG_TABLE_NAME,NEW.id,source_state); END LOOP;
  END IF;
  FOR target_user IN SELECT m.user_id FROM public.erp_memberships m
   WHERE m.restaurant_id=tenant AND m.status='approved' AND m.role='manager'
    AND (v_branch_id IS NULL OR m.branch_id=v_branch_id
      OR v_branch_id=ANY(coalesce(m.selected_branch_ids,ARRAY[]::uuid[]))
      OR (m.branch_id IS NULL AND cardinality(coalesce(m.selected_branch_ids,ARRAY[]::uuid[]))=0))
  LOOP PERFORM push_private.portal_enqueue(tenant,target_user.user_id,'manager',NULL,v_branch_id,
      'order',TG_TABLE_NAME,NEW.id,source_state); END LOOP;

 ELSIF TG_TABLE_NAME='supplier_invoices' THEN
  IF TG_OP='UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
   END IF;
  FOR target_user IN SELECT m.user_id FROM public.erp_memberships m
   WHERE m.restaurant_id=tenant AND m.status='approved' AND m.role='supplier'
     AND m.linked_entity_id=NEW.supplier_id
  LOOP PERFORM push_private.portal_enqueue(tenant,target_user.user_id,'supplier',NULL,v_branch_id,
     'invoice',TG_TABLE_NAME,NEW.id,source_state); END LOOP;

 ELSIF TG_TABLE_NAME='attendance_shift_sessions' THEN
  IF TG_OP='UPDATE' THEN
   IF OLD.checked_in_at IS NOT DISTINCT FROM NEW.checked_in_at
    AND OLD.checked_out_at IS NOT DISTINCT FROM NEW.checked_out_at
    AND OLD.shift_start IS NOT DISTINCT FROM NEW.shift_start THEN RETURN NEW; END IF;
  END IF;
  source_state:=CASE WHEN NEW.checked_out_at IS NOT NULL THEN 'checkout'
    WHEN NEW.checked_in_at IS NOT NULL THEN 'checkin' ELSE 'assigned' END;
  FOR target_user IN SELECT m.user_id FROM public.erp_memberships m
   WHERE m.restaurant_id=tenant AND m.status='approved' AND m.role='employee'
    AND m.linked_entity_id=NEW.employee_id
  LOOP PERFORM push_private.portal_enqueue(tenant,target_user.user_id,'employee',NULL,v_branch_id,
     'shift',TG_TABLE_NAME,NEW.id,source_state); END LOOP;

 ELSIF TG_TABLE_NAME='driver_requests' THEN
  IF TG_OP='UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
   END IF;
  FOR target_user IN SELECT m.user_id FROM public.erp_memberships m
   WHERE m.restaurant_id=tenant AND m.status='approved' AND m.role='driver'
    AND m.linked_entity_id=NEW.driver_id
  LOOP PERFORM push_private.portal_enqueue(tenant,target_user.user_id,'driver',NULL,v_branch_id,
     'delivery',TG_TABLE_NAME,NEW.id,source_state); END LOOP;

 ELSIF TG_TABLE_NAME='debt_records' THEN
  IF NEW.customer_id IS NULL OR NEW.type<>'receivable' OR NEW.party_type<>'customer' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
   END IF;
  FOR target_user IN SELECT a.user_id,a.customer_id FROM public.customer_portal_access a
   JOIN public.customers c ON c.id=a.customer_id
   WHERE a.active AND a.user_id IS NOT NULL AND c.is_active AND c.id=NEW.customer_id
    AND c.restaurant_id=tenant AND (c.branch_id IS NULL OR c.branch_id=v_branch_id)
  LOOP PERFORM push_private.portal_enqueue(tenant,target_user.user_id,'customer',target_user.customer_id,v_branch_id,
    'invoice',TG_TABLE_NAME,NEW.id,source_state); END LOOP;

 ELSIF TG_TABLE_NAME='debt_payments' THEN
  IF TG_OP<>'INSERT' THEN RETURN NEW; END IF;
  SELECT d.customer_id INTO target_customer FROM public.debt_records d WHERE d.id=NEW.debt_id
   AND d.restaurant_id=tenant AND d.type='receivable' AND d.party_type='customer';
  IF target_customer IS NULL THEN RETURN NEW; END IF;
  FOR target_user IN SELECT a.user_id,a.customer_id FROM public.customer_portal_access a
   JOIN public.customers c ON c.id=a.customer_id
   WHERE a.active AND a.user_id IS NOT NULL AND c.is_active AND c.id=target_customer
    AND c.restaurant_id=tenant AND (c.branch_id IS NULL OR c.branch_id=v_branch_id)
  LOOP PERFORM push_private.portal_enqueue(tenant,target_user.user_id,'customer',target_user.customer_id,v_branch_id,
    'payment',TG_TABLE_NAME,NEW.id,'received'); END LOOP;
 END IF;
 RETURN NEW;
END $function$;
