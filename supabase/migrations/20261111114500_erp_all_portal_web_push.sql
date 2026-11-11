-- Additive per-user Web Push for Owner, Manager, Employee, Supplier, Driver and Customer.
-- Existing owner/wallet channels, VAPID Vault secret and financial records stay unchanged.
CREATE TABLE IF NOT EXISTS public.erp_portal_push_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('owner','manager','employee','supplier','driver','customer')),
 customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
 branch_id uuid,
 endpoint text NOT NULL UNIQUE CHECK(length(endpoint) BETWEEN 20 AND 4096),
 p256dh text NOT NULL, auth_key text NOT NULL,
 language text NOT NULL DEFAULT 'en' CHECK(language IN ('en','ar','fa')),
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((role = 'customer') = (customer_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS erp_portal_push_device_target ON public.erp_portal_push_devices(user_id,restaurant_id,role) WHERE enabled;
ALTER TABLE public.erp_portal_push_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_portal_push_devices FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.erp_portal_push_devices TO service_role;

CREATE TABLE IF NOT EXISTS public.erp_portal_push_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL,
 branch_id uuid,
 category text NOT NULL CHECK (category IN ('notice','order','invoice','payment','shift','delivery')),
 source_table text NOT NULL,
 source_id uuid NOT NULL,
 source_state text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(recipient_id,source_table,source_id,source_state)
);
CREATE INDEX IF NOT EXISTS erp_portal_push_event_recipient ON public.erp_portal_push_events(recipient_id,created_at DESC);
ALTER TABLE public.erp_portal_push_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_portal_push_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.erp_portal_push_events TO service_role;

CREATE TABLE IF NOT EXISTS public.erp_portal_push_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES public.erp_portal_push_events(id) ON DELETE CASCADE,
 device_id uuid NOT NULL REFERENCES public.erp_portal_push_devices(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 last_error text,
 UNIQUE(event_id,device_id)
);
CREATE INDEX IF NOT EXISTS erp_portal_push_delivery_due ON public.erp_portal_push_deliveries(available_at)
 WHERE state IN ('pending','sending');
ALTER TABLE public.erp_portal_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_portal_push_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.erp_portal_push_deliveries TO service_role;

-- Never trust role/tenant/customer from the browser. This API is service-role-only.
CREATE OR REPLACE FUNCTION public.erp_portal_push_can_access(
 p_user uuid,p_restaurant uuid,p_role text,p_customer uuid DEFAULT NULL
) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT CASE
 WHEN p_user IS NULL OR p_restaurant IS NULL THEN false
 WHEN p_role='customer' THEN p_customer IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.customer_portal_access a
   JOIN public.customers c ON c.id=a.customer_id
   WHERE a.user_id=p_user AND a.active AND a.customer_id=p_customer
     AND c.restaurant_id=p_restaurant AND c.is_active)
 WHEN p_role IN ('owner','manager','employee','supplier','driver') THEN
   p_customer IS NULL AND EXISTS (
    SELECT 1 FROM public.erp_memberships m WHERE m.user_id=p_user
    AND m.restaurant_id=p_restaurant AND m.role=p_role AND m.status='approved')
 ELSE false END;
$$;
REVOKE ALL ON FUNCTION public.erp_portal_push_can_access(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_portal_push_can_access(uuid,uuid,text,uuid) TO service_role;

-- Rechecked at the moment the business record is written; no arbitrary client can send a push.
CREATE OR REPLACE FUNCTION push_private.portal_enqueue(
 p_restaurant uuid,p_user uuid,p_role text,p_customer uuid,p_branch uuid,
 p_category text,p_source text,p_source_id uuid,p_source_state text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE event_id uuid;
BEGIN
 IF NOT public.erp_portal_push_can_access(p_user,p_restaurant,p_role,p_customer) THEN RETURN; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.erp_portal_push_devices d WHERE d.user_id=p_user
    AND d.restaurant_id=p_restaurant AND d.role=p_role AND d.enabled
    AND (p_role<>'customer' OR d.customer_id=p_customer)
    AND (p_branch IS NULL OR d.branch_id IS NULL OR d.branch_id=p_branch)
 ) THEN RETURN; END IF;
 INSERT INTO public.erp_portal_push_events
 (restaurant_id,recipient_id,role,branch_id,category,source_table,source_id,source_state)
 VALUES (p_restaurant,p_user,p_role,p_branch,p_category,p_source,p_source_id,left(p_source_state,128))
 ON CONFLICT (recipient_id,source_table,source_id,source_state) DO NOTHING
 RETURNING id INTO event_id;
 IF event_id IS NULL THEN RETURN; END IF;
 INSERT INTO public.erp_portal_push_deliveries(event_id,device_id)
 SELECT event_id,d.id FROM public.erp_portal_push_devices d
 WHERE d.user_id=p_user AND d.restaurant_id=p_restaurant AND d.role=p_role
   AND d.enabled AND (p_role<>'customer' OR d.customer_id=p_customer)
   AND (p_branch IS NULL OR d.branch_id IS NULL OR d.branch_id=p_branch)
 ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION push_private.portal_enqueue(uuid,uuid,text,uuid,uuid,text,text,uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION push_private.portal_capture()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rowdata jsonb; tenant uuid; branch uuid; role_target text; target_user record;
  source_state text; category text; target_customer uuid;
BEGIN
 rowdata:=to_jsonb(NEW);
 SELECT r.id INTO tenant FROM public.restaurants r
 WHERE r.id::text=rowdata->>'restaurant_id' LIMIT 1;
 IF tenant IS NULL THEN RETURN NEW; END IF;
 SELECT b.id INTO branch FROM public.branches b
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
     AND (branch IS NULL OR m.role='owner' OR m.branch_id=branch
       OR branch=ANY(coalesce(m.selected_branch_ids,ARRAY[]::uuid[]))
       OR (m.branch_id IS NULL AND cardinality(coalesce(m.selected_branch_ids,ARRAY[]::uuid[]))=0))
  LOOP
   PERFORM push_private.portal_enqueue(tenant,target_user.user_id,target_user.role,NULL,branch,
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
      AND c.id=NEW.customer_id AND (c.branch_id IS NULL OR c.branch_id=branch)
   LOOP
    PERFORM push_private.portal_enqueue(tenant,target_user.user_id,'customer',target_user.customer_id,branch,
      'order',TG_TABLE_NAME,NEW.id,source_state);
   END LOOP;
  END IF;
  IF NEW.driver_id IS NOT NULL THEN
   FOR target_user IN SELECT m.user_id FROM public.erp_memberships m
    WHERE m.restaurant_id=tenant AND m.status='approved' AND m.role='driver' AND m.linked_entity_id=NEW.driver_id
   LOOP PERFORM push_private.portal_enqueue(tenant,target_user.user_id,'driver',NULL,branch,
       'delivery',TG_TABLE_NAME,NEW.id,source_state); END LOOP;
  END IF;
  FOR target_user IN SELECT m.user_id FROM public.erp_memberships m
   WHERE m.restaurant_id=tenant AND m.status='approved' AND m.role='manager'
    AND (branch IS NULL OR m.branch_id=branch
      OR branch=ANY(coalesce(m.selected_branch_ids,ARRAY[]::uuid[]))
      OR (m.branch_id IS NULL AND cardinality(coalesce(m.selected_branch_ids,ARRAY[]::uuid[]))=0))
  LOOP PERFORM push_private.portal_enqueue(tenant,target_user.user_id,'manager',NULL,branch,
      'order',TG_TABLE_NAME,NEW.id,source_state); END LOOP;

 ELSIF TG_TABLE_NAME='supplier_invoices' THEN
  IF TG_OP='UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
   END IF;
  FOR target_user IN SELECT m.user_id FROM public.erp_memberships m
   WHERE m.restaurant_id=tenant AND m.status='approved' AND m.role='supplier'
     AND m.linked_entity_id=NEW.supplier_id
  LOOP PERFORM push_private.portal_enqueue(tenant,target_user.user_id,'supplier',NULL,branch,
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
  LOOP PERFORM push_private.portal_enqueue(tenant,target_user.user_id,'employee',NULL,branch,
     'shift',TG_TABLE_NAME,NEW.id,source_state); END LOOP;

 ELSIF TG_TABLE_NAME='driver_requests' THEN
  IF TG_OP='UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
   END IF;
  FOR target_user IN SELECT m.user_id FROM public.erp_memberships m
   WHERE m.restaurant_id=tenant AND m.status='approved' AND m.role='driver'
    AND m.linked_entity_id=NEW.driver_id
  LOOP PERFORM push_private.portal_enqueue(tenant,target_user.user_id,'driver',NULL,branch,
     'delivery',TG_TABLE_NAME,NEW.id,source_state); END LOOP;

 ELSIF TG_TABLE_NAME='debt_records' THEN
  IF NEW.customer_id IS NULL OR NEW.type<>'receivable' OR NEW.party_type<>'customer' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
   END IF;
  FOR target_user IN SELECT a.user_id,a.customer_id FROM public.customer_portal_access a
   JOIN public.customers c ON c.id=a.customer_id
   WHERE a.active AND a.user_id IS NOT NULL AND c.is_active AND c.id=NEW.customer_id
    AND c.restaurant_id=tenant AND (c.branch_id IS NULL OR c.branch_id=branch)
  LOOP PERFORM push_private.portal_enqueue(tenant,target_user.user_id,'customer',target_user.customer_id,branch,
    'invoice',TG_TABLE_NAME,NEW.id,source_state); END LOOP;

 ELSIF TG_TABLE_NAME='debt_payments' THEN
  IF TG_OP<>'INSERT' THEN RETURN NEW; END IF;
  SELECT d.customer_id INTO target_customer FROM public.debt_records d WHERE d.id=NEW.debt_id
   AND d.restaurant_id=tenant AND d.type='receivable' AND d.party_type='customer';
  IF target_customer IS NULL THEN RETURN NEW; END IF;
  FOR target_user IN SELECT a.user_id,a.customer_id FROM public.customer_portal_access a
   JOIN public.customers c ON c.id=a.customer_id
   WHERE a.active AND a.user_id IS NOT NULL AND c.is_active AND c.id=target_customer
    AND c.restaurant_id=tenant AND (c.branch_id IS NULL OR c.branch_id=branch)
  LOOP PERFORM push_private.portal_enqueue(tenant,target_user.user_id,'customer',target_user.customer_id,branch,
    'payment',TG_TABLE_NAME,NEW.id,'received'); END LOOP;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION push_private.portal_capture() FROM PUBLIC,anon,authenticated;

-- Only explicit, scoped business events: no broad capture of private financial tables.
CREATE TRIGGER erp_portal_push_notice AFTER INSERT ON public.notifications
 FOR EACH ROW EXECUTE FUNCTION push_private.portal_capture();
CREATE TRIGGER erp_portal_push_order AFTER INSERT OR UPDATE OF status ON public.orders
 FOR EACH ROW EXECUTE FUNCTION push_private.portal_capture();
CREATE TRIGGER erp_portal_push_supplier AFTER INSERT OR UPDATE OF status ON public.supplier_invoices
 FOR EACH ROW EXECUTE FUNCTION push_private.portal_capture();
CREATE TRIGGER erp_portal_push_shift AFTER INSERT OR UPDATE OF checked_in_at,checked_out_at,shift_start ON public.attendance_shift_sessions
 FOR EACH ROW EXECUTE FUNCTION push_private.portal_capture();
CREATE TRIGGER erp_portal_push_driver AFTER INSERT OR UPDATE OF status ON public.driver_requests
 FOR EACH ROW EXECUTE FUNCTION push_private.portal_capture();
CREATE TRIGGER erp_portal_push_debt AFTER INSERT OR UPDATE OF status ON public.debt_records
 FOR EACH ROW EXECUTE FUNCTION push_private.portal_capture();
CREATE TRIGGER erp_portal_push_receipt AFTER INSERT ON public.debt_payments
 FOR EACH ROW EXECUTE FUNCTION push_private.portal_capture();

CREATE OR REPLACE FUNCTION public.erp_portal_push_claim()
RETURNS SETOF public.erp_portal_push_deliveries LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
 WITH picked AS (
  SELECT id FROM public.erp_portal_push_deliveries WHERE state IN ('pending','sending')
    AND available_at<=now() AND attempts<8 AND created_at>now()-interval '24 hours'
  ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 40
 )
 UPDATE public.erp_portal_push_deliveries d SET state='sending',
  attempts=d.attempts+1,available_at=now()+interval '5 minutes'
 FROM picked WHERE d.id=picked.id RETURNING d.*;
$$;
REVOKE ALL ON FUNCTION public.erp_portal_push_claim() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_portal_push_claim() TO service_role;

-- Uses the existing Vault-only dispatch secret; never expose VAPID private key to clients.
CREATE OR REPLACE FUNCTION push_private.portal_dispatch()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE secret text;
BEGIN
 UPDATE public.erp_portal_push_deliveries SET state='failed',last_error='Retry or expiry limit'
 WHERE state IN ('pending','sending') AND available_at<=now()
  AND (attempts>=8 OR created_at<now()-interval '24 hours');
 IF NOT EXISTS(SELECT 1 FROM public.erp_portal_push_deliveries
   WHERE state IN ('pending','sending') AND available_at<=now()) THEN RETURN; END IF;
 SELECT decrypted_secret::jsonb->>'dispatchSecret' INTO secret
   FROM vault.decrypted_secrets WHERE name='owner_push_config';
 IF secret IS NULL THEN RETURN; END IF;
 PERFORM net.http_post(
  url:='https://mqubwgbppncldyiicbtu.supabase.co/functions/v1/erp-portal-push/dispatch',
  headers:=jsonb_build_object('Content-Type','application/json','x-dispatch-secret',secret),
  body:='{}'::jsonb,timeout_milliseconds:=25000);
END $$;
REVOKE ALL ON FUNCTION push_private.portal_dispatch() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('erp-portal-push-dispatch','30 seconds','select push_private.portal_dispatch()');
