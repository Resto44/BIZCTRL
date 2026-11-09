-- Driver dashboard reads finalized Sales Closing breakdown only.
-- No customer PII, no wallet data, no duplicated delivery revenue.
CREATE OR REPLACE FUNCTION public.erp_driver_self_snapshot(
 p_from date,p_to date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' SET row_security = off AS $function$
DECLARE
 m public.erp_memberships%ROWTYPE;
 d public.drivers%ROWTYPE;
 v_cash numeric := 0;
 v_network numeric := 0;
 v_count integer := 0;
 v_entries jsonb := '[]'::jsonb;
 v_deliveries jsonb := '[]'::jsonb;
 v_reports jsonb := '[]'::jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.erp_memberships
 WHERE user_id=auth.uid() AND status='approved' AND role='driver'
 ORDER BY updated_at DESC LIMIT 1;
 IF m.id IS NULL OR m.restaurant_id IS NULL OR m.branch_id IS NULL OR m.linked_entity_id IS NULL
   OR NOT public.erp_subscription_has_erp_access(m.restaurant_id) THEN
   RAISE EXCEPTION 'DRIVER_ROLE_AND_SCOPE_REQUIRED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO d FROM public.drivers WHERE id=m.linked_entity_id
  AND restaurant_id=m.restaurant_id AND branch_id=m.branch_id
  AND coalesce(is_active,true) LIMIT 1;
 IF d.id IS NULL THEN RAISE EXCEPTION 'ACTIVE_DRIVER_LINK_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_to>current_date+1
  OR p_from<current_date-400 OR p_to-p_from>366 THEN
   RAISE EXCEPTION 'INVALID_DRIVER_REPORT_PERIOD';
 END IF;
 SELECT coalesce(sum(e.cash_amount),0),coalesce(sum(e.network_amount),0),count(*)::integer
 INTO v_cash,v_network,v_count
 FROM public.driver_sales_entries e
 JOIN public.daily_sales s ON s.id=e.closing_id
 WHERE e.driver_id=d.id AND e.restaurant_id=m.restaurant_id
  AND e.branch_id=m.branch_id AND e.date BETWEEN p_from AND p_to
  AND e.status='finalized' AND s.closing_state IN ('finalized','locked')
  AND s.branch_id=m.branch_id AND s.restaurant_id::text=m.restaurant_id::text;

 SELECT coalesce(jsonb_agg(t.row ORDER BY t.day DESC,t.entry_id DESC),'[]'::jsonb)
 INTO v_entries FROM (
   SELECT e.date AS day,e.id AS entry_id,
    jsonb_build_object('id',e.id,'date',e.date,'cash',e.cash_amount,
      'network',e.network_amount,'total',e.cash_amount+e.network_amount,
      'source',e.subcategory,'shift',e.shift,'status','finalized') AS row
   FROM public.driver_sales_entries e
   JOIN public.daily_sales s ON s.id=e.closing_id
   WHERE e.driver_id=d.id AND e.restaurant_id=m.restaurant_id
    AND e.branch_id=m.branch_id AND e.date BETWEEN p_from AND p_to
    AND e.status='finalized' AND s.closing_state IN ('finalized','locked')
    AND s.branch_id=m.branch_id AND s.restaurant_id::text=m.restaurant_id::text
   ORDER BY e.date DESC,e.id DESC LIMIT 150
 ) t;

 SELECT coalesce(jsonb_agg(t.row ORDER BY t.day DESC),'[]'::jsonb)
 INTO v_deliveries FROM (
   SELECT o.created_date AS day,
    jsonb_build_object('id',o.id,'order_number',o.order_number,
      'status',o.status,'date',o.created_date,
      'total',o.total_amount,'payment_method',o.payment_method) AS row
   FROM public.delivery_orders o
   WHERE o.driver_id=d.id AND o.restaurant_id=m.restaurant_id
    AND o.branch_id=m.branch_id AND o.created_date::date BETWEEN p_from AND p_to
   ORDER BY o.created_date DESC LIMIT 80
 ) t;

 SELECT coalesce(jsonb_agg(t.row ORDER BY t.day DESC),'[]'::jsonb)
 INTO v_reports FROM (
  SELECT r.work_date AS day,
    jsonb_build_object('id',r.id,'date',r.work_date,'cash',r.cash_amount,
      'network',r.network_amount,'total',r.cash_amount+r.network_amount,
      'status',r.status,'notes',r.notes,'review_notes',r.review_notes,
      'reviewed_at',r.reviewed_at) AS row
  FROM public.driver_daily_reports r
  WHERE r.driver_id=d.id AND r.restaurant_id=m.restaurant_id
    AND r.branch_id=m.branch_id AND r.work_date BETWEEN p_from AND p_to
  ORDER BY r.work_date DESC LIMIT 150
 ) t;

 RETURN jsonb_build_object(
  'driver',jsonb_build_object('id',d.id,'name',d.full_name,
      'driver_code',d.driver_id,'vehicle',d.vehicle_type,'plate',d.vehicle_plate,
      'branch_id',m.branch_id,'branch_name',coalesce((SELECT name FROM public.branches WHERE id=m.branch_id),'—')),
  'period',jsonb_build_object('from',p_from,'to',p_to),
  'totals',jsonb_build_object('cash',v_cash,'network',v_network,
    'sales',v_cash+v_network,'entries',v_count),
  'finalized_entries',v_entries,'delivery_orders',v_deliveries,
  'daily_reports',v_reports,
  'accounting_note','Only finalized closing amounts count as sales; driver reports and delivery orders are not additional revenue'
 );
END;$function$;
REVOKE ALL ON FUNCTION public.erp_driver_self_snapshot(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_driver_self_snapshot(date,date) TO authenticated;
