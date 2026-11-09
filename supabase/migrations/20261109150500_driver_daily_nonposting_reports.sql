-- ERP Driver declarations are NON-POSTING: no double recognition of revenue,
-- no wallet transfers, no cash counts and no Sales Closing writes here.
CREATE TABLE IF NOT EXISTS public.driver_daily_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 driver_id uuid NOT NULL REFERENCES public.drivers(id),
 work_date date NOT NULL,
 cash_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
 network_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (network_amount >= 0),
 notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','matched','rejected')),
 review_notes text NOT NULL DEFAULT '',
 reviewed_by uuid,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT driver_daily_reports_once_per_day UNIQUE (driver_id,work_date)
);
CREATE INDEX IF NOT EXISTS idx_driver_daily_reports_branch_date
 ON public.driver_daily_reports(restaurant_id,branch_id,work_date DESC);
ALTER TABLE public.driver_daily_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.driver_daily_reports FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.driver_daily_reports TO authenticated;

DROP POLICY IF EXISTS driver_daily_reports_scoped_select ON public.driver_daily_reports;
CREATE POLICY driver_daily_reports_scoped_select ON public.driver_daily_reports
 FOR SELECT TO authenticated
 USING (
   public.erp_can_access_scope_text(restaurant_id::text,branch_id::text)
   AND (
     (public.erp_current_role()='driver'
       AND driver_id=public.erp_current_linked_entity_id())
     OR (public.erp_current_role() IN ('owner','manager')
       AND public.erp_has_any_permission(ARRAY['viewSales','viewDelivery']))
   )
 );

CREATE OR REPLACE FUNCTION public.erp_driver_save_daily_report(
 p_date date,p_cash numeric,p_network numeric,p_notes text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET row_security = off AS $function$
DECLARE
 m public.erp_memberships%ROWTYPE;
 d public.drivers%ROWTYPE;
 v_date date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
 v_row public.driver_daily_reports%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.erp_memberships
 WHERE user_id=auth.uid() AND role='driver' AND status='approved'
 ORDER BY updated_at DESC LIMIT 1;
 IF m.id IS NULL OR m.linked_entity_id IS NULL OR m.restaurant_id IS NULL OR m.branch_id IS NULL
  OR NOT public.erp_subscription_has_erp_access(m.restaurant_id) THEN
   RAISE EXCEPTION 'DRIVER_MEMBERSHIP_OR_SUBSCRIPTION_REQUIRED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO d FROM public.drivers
 WHERE id=m.linked_entity_id AND restaurant_id=m.restaurant_id
  AND branch_id=m.branch_id AND coalesce(is_active,true)
 LIMIT 1;
 IF d.id IS NULL THEN RAISE EXCEPTION 'DRIVER_LINK_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_date IS NULL OR p_date < v_date-30 OR p_date > v_date+1
   OR p_cash IS NULL OR p_network IS NULL
   OR p_cash::text IN ('NaN','Infinity','-Infinity')
   OR p_network::text IN ('NaN','Infinity','-Infinity')
   OR p_cash < 0 OR p_network < 0 OR (p_cash+p_network)<=0
   OR p_cash>1000000 OR p_network>1000000
   OR p_cash <> round(p_cash,2) OR p_network <> round(p_network,2)
   OR length(coalesce(p_notes,''))>500 THEN
   RAISE EXCEPTION 'INVALID_DRIVER_SALES_DECLARATION';
 END IF;
 INSERT INTO public.driver_daily_reports
  (restaurant_id,branch_id,driver_id,work_date,cash_amount,network_amount,notes)
 VALUES(m.restaurant_id,m.branch_id,d.id,p_date,p_cash,p_network,coalesce(p_notes,''))
 ON CONFLICT (driver_id,work_date) DO UPDATE SET
  cash_amount=EXCLUDED.cash_amount,network_amount=EXCLUDED.network_amount,
  notes=EXCLUDED.notes,updated_at=now(),
  status='pending',reviewed_at=NULL,reviewed_by=NULL,review_notes=''
 WHERE public.driver_daily_reports.status IN ('pending','rejected')
 RETURNING * INTO v_row;
 IF v_row.id IS NULL THEN
   RAISE EXCEPTION 'REVIEWED_OR_MATCHED_REPORT_CANNOT_BE_EDITED';
 END IF;
 RETURN jsonb_build_object('id',v_row.id,'status',v_row.status,'date',v_row.work_date,
  'cash',v_row.cash_amount,'network',v_row.network_amount,'total',v_row.cash_amount+v_row.network_amount,
  'posted_to_revenue',false);
END;$function$;
REVOKE ALL ON FUNCTION public.erp_driver_save_daily_report(date,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_driver_save_daily_report(date,numeric,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.erp_driver_review_daily_report(
 p_report_id uuid,p_action text,p_notes text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' SET row_security = off AS $function$
DECLARE
 actor public.erp_memberships%ROWTYPE;
 report public.driver_daily_reports%ROWTYPE;
 v_cash numeric;
 v_network numeric;
 v_closing_count integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO report FROM public.driver_daily_reports WHERE id=p_report_id FOR UPDATE;
 IF report.id IS NULL THEN RAISE EXCEPTION 'REPORT_NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.erp_memberships
 WHERE user_id=auth.uid() AND status='approved' AND role IN ('manager','owner')
  AND restaurant_id=report.restaurant_id
  AND (role='owner' OR branch_id=report.branch_id)
 ORDER BY updated_at DESC LIMIT 1;
 IF actor.id IS NULL OR NOT public.erp_has_any_permission(ARRAY['viewSales','uploadSales','viewDelivery'])
 OR NOT public.erp_subscription_has_erp_access(report.restaurant_id) THEN
   RAISE EXCEPTION 'MANAGER_REVIEW_PERMISSION_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_action NOT IN ('reviewed','matched','rejected') OR length(coalesce(p_notes,''))>500 THEN
   RAISE EXCEPTION 'INVALID_REVIEW_ACTION';
 END IF;
 IF report.status='matched' THEN RAISE EXCEPTION 'MATCHED_REPORT_IS_IMMUTABLE'; END IF;
 IF p_action='matched' THEN
   SELECT coalesce(sum(e.cash_amount),0),coalesce(sum(e.network_amount),0),count(*)
    INTO v_cash,v_network,v_closing_count
   FROM public.driver_sales_entries e
   JOIN public.daily_sales s ON s.id=e.closing_id
   WHERE e.driver_id=report.driver_id AND e.restaurant_id=report.restaurant_id
     AND e.branch_id=report.branch_id AND e.date=report.work_date
     AND e.status='finalized' AND s.closing_state IN ('finalized','locked')
     AND s.restaurant_id::text=report.restaurant_id::text AND s.branch_id=report.branch_id;
   IF v_closing_count=0 OR round(v_cash,2)<>report.cash_amount
      OR round(v_network,2)<>report.network_amount THEN
     RAISE EXCEPTION 'DRIVER_REPORT_REQUIRES_MATCHING_FINALIZED_CLOSING';
   END IF;
 END IF;
 UPDATE public.driver_daily_reports SET
  status=p_action,review_notes=coalesce(p_notes,''),
  reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
 WHERE id=report.id;
 RETURN jsonb_build_object('id',report.id,'status',p_action,
   'posted_to_revenue',false,'matched_to_existing_closing',(p_action='matched'));
END;$function$;
REVOKE ALL ON FUNCTION public.erp_driver_review_daily_report(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_driver_review_daily_report(uuid,text,text) TO authenticated;
