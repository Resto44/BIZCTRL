-- Owner cash position must follow the latest real physical Closing session.
-- A succession of Closing sessions by the same cashier is not multiple drawers.
-- POS sales are revenue events, never counted physical drawer closings.
-- If different cashiers share the latest shift and physical drawer ownership
-- cannot be verified, keep the branch unknown rather than sum or guess cash.
-- The all-branches total remains NULL until every active authorized branch is counted.
CREATE OR REPLACE FUNCTION public.erp_owner_drawer_cash_asof(
 p_restaurant_id uuid,p_as_of_date date,p_branch_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
WITH permitted AS (
 SELECT b.id,b.branch_key,b.name
 FROM public.branches b
 WHERE auth.uid() IS NOT NULL
   AND p_restaurant_id IS NOT NULL AND p_as_of_date IS NOT NULL
   AND b.restaurant_id=p_restaurant_id
   AND b.is_active IS DISTINCT FROM false
   AND (p_branch_id IS NULL OR b.id=p_branch_id)
   AND public.erp_can_access_scope_text(p_restaurant_id::text,b.id::text)
), latest AS (
 SELECT b.id AS branch_id,b.branch_key,b.name AS branch_name,
   c.id AS closing_id,c.date AS closing_date,c.shift,
   c.actual_cash,c.closing_session_no,
   coalesce(c.finalized_at,c.session_closed_at,c.created_date) AS counted_at
 FROM permitted b LEFT JOIN LATERAL (
   SELECT s.id,s.date,s.shift,s.actual_cash,s.closing_session_no,
     s.finalized_at,s.session_closed_at,s.created_date
   FROM public.daily_sales s
   WHERE s.restaurant_id=p_restaurant_id::text
     AND (s.branch_id=b.id OR (s.branch_id IS NULL AND s.branch=b.branch_key))
     AND s.closing_state='finalized'
     AND lower(btrim(coalesce(s.shift,''))) IN ('morning','evening')
     AND s.date<=p_as_of_date
   ORDER BY s.date DESC,
     CASE lower(btrim(s.shift)) WHEN 'evening' THEN 2 ELSE 1 END DESC,
     coalesce(s.finalized_at,s.session_closed_at,s.created_date) DESC NULLS LAST,
     s.closing_session_no DESC NULLS LAST,s.id DESC
   LIMIT 1
 ) c ON true
), checked AS (
 SELECT l.*,
    coalesce(sc.session_count,0) AS session_count,
    coalesce(sc.cashier_count,0) AS cashier_count,
    CASE
      WHEN l.closing_id IS NULL THEN 'no_closing'
      WHEN sc.cashier_count<>1 OR
           (sc.session_count>1 AND sc.unknown_cashier_count=sc.session_count)
        THEN 'ambiguous_drawer'
      WHEN l.actual_cash IS NULL OR l.actual_cash<0 THEN 'uncounted'
      ELSE 'verified'
    END AS status
 FROM latest l LEFT JOIN LATERAL (
   SELECT count(*)::int AS session_count,
     count(DISTINCT coalesce(s.cashier_id::text,s.cashier_employee_id::text,'__unknown__'))::int AS cashier_count,
     count(*) FILTER(WHERE s.cashier_id IS NULL AND s.cashier_employee_id IS NULL)::int AS unknown_cashier_count
   FROM public.daily_sales s
   WHERE s.restaurant_id=p_restaurant_id::text
     AND (s.branch_id=l.branch_id OR(s.branch_id IS NULL AND s.branch=l.branch_key))
     AND s.closing_state='finalized'
     AND s.date=l.closing_date
     AND lower(btrim(coalesce(s.shift,'')))=lower(btrim(coalesce(l.shift,'')))
 ) sc ON true
)
SELECT jsonb_build_object(
 'amount',CASE WHEN count(*)>0 AND count(*) FILTER(WHERE status<>'verified')=0
  THEN coalesce(sum(actual_cash),0) ELSE NULL END,
 'branches',count(*),
 'missingBranches',count(*) FILTER(WHERE status<>'verified'),
 'complete',count(*)>0 AND count(*) FILTER(WHERE status<>'verified')=0,
 'asOfDate',p_as_of_date,
 'basis','last_verified_physical_count_not_live_bank_balance',
 'details',coalesce(jsonb_agg(jsonb_build_object(
    'branchId',branch_id,'branchKey',branch_key,'branchName',branch_name,
    'date',closing_date,'shift',shift,'sessionNo',closing_session_no,
    'countedAt',counted_at,'status',status,
    'cash',CASE WHEN status='verified' THEN actual_cash ELSE NULL END,
    'latestCount',session_count,'cashierCount',cashier_count
 ) ORDER BY branch_key),'[]'::jsonb)
)
FROM checked;
$function$;

REVOKE ALL ON FUNCTION public.erp_owner_drawer_cash_asof(uuid,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_owner_drawer_cash_asof(uuid,date,uuid) TO authenticated;
