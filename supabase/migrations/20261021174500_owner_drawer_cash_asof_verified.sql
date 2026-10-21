-- Owner dashboard cash position: physical counts, not revenues.
-- Read-only, tenant/branch RLS guard, period-independent as-of date.
-- Do not substitute closing_cash (legacy derived field) for actual_cash.
-- Multiple closings in the latest shift are ambiguous without drawer IDs.
CREATE OR REPLACE FUNCTION public.erp_owner_drawer_cash_asof(
  p_restaurant_id uuid,
  p_as_of_date date,
  p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
WITH permitted AS (
  SELECT b.id, b.branch_key
  FROM public.branches b
  WHERE auth.uid() IS NOT NULL
    AND p_restaurant_id IS NOT NULL
    AND p_as_of_date IS NOT NULL
    AND b.restaurant_id = p_restaurant_id
    AND b.is_active IS DISTINCT FROM false
    AND (p_branch_id IS NULL OR b.id = p_branch_id)
    AND public.erp_can_access_scope_text(p_restaurant_id::text, b.id::text)
), last_shift AS (
  SELECT b.id AS branch_id, b.branch_key, last.date AS closing_date,
         last.shift_rank
  FROM permitted b
  LEFT JOIN LATERAL (
    SELECT s.date,
      CASE lower(coalesce(s.shift, ''))
        WHEN 'morning' THEN 1 WHEN 'evening' THEN 2 ELSE 0 END AS shift_rank
    FROM public.daily_sales s
    WHERE s.restaurant_id = p_restaurant_id::text
      AND (s.branch_id = b.id OR (s.branch_id IS NULL AND s.branch = b.branch_key))
      AND s.closing_state = 'finalized'
      AND s.date <= p_as_of_date
    ORDER BY s.date DESC,
      CASE lower(coalesce(s.shift, ''))
        WHEN 'evening' THEN 2 WHEN 'morning' THEN 1 ELSE 0 END DESC,
      s.finalized_at DESC NULLS LAST, s.id DESC
    LIMIT 1
  ) last ON true
), counted AS (
  SELECT ls.branch_id,ls.branch_key,ls.closing_date,
    coalesce(last_rows.total_count,0) AS latest_count,
    CASE
      WHEN ls.closing_date IS NULL THEN 'no_closing'
      WHEN last_rows.total_count <> 1 THEN 'ambiguous_drawer'
      WHEN last_rows.actual_cash IS NULL OR last_rows.actual_cash < 0
        THEN 'uncounted'
      ELSE 'verified'
    END AS status,
    CASE
      WHEN last_rows.total_count = 1 AND last_rows.actual_cash >= 0
        THEN last_rows.actual_cash
      ELSE NULL
    END AS actual_cash
  FROM last_shift ls
  LEFT JOIN LATERAL (
    SELECT count(*) AS total_count, max(s.actual_cash) AS actual_cash
    FROM public.daily_sales s
    WHERE s.restaurant_id = p_restaurant_id::text
      AND (s.branch_id = ls.branch_id
        OR (s.branch_id IS NULL AND s.branch = ls.branch_key))
      AND s.closing_state = 'finalized'
      AND s.date = ls.closing_date
      AND CASE lower(coalesce(s.shift, ''))
            WHEN 'morning' THEN 1 WHEN 'evening' THEN 2 ELSE 0 END
          = ls.shift_rank
  ) last_rows ON true
)
SELECT jsonb_build_object(
  'amount', CASE
    WHEN count(*) > 0 AND count(*) FILTER (WHERE status <> 'verified') = 0
      THEN coalesce(sum(actual_cash),0)
    ELSE NULL END,
  'branches',count(*),
  'missingBranches',count(*) FILTER (WHERE status <> 'verified'),
  'complete',count(*) > 0 AND count(*) FILTER (WHERE status <> 'verified') = 0,
  'asOfDate',p_as_of_date,
  'basis','last_verified_physical_count_not_live_bank_balance',
  'details',coalesce(jsonb_agg(jsonb_build_object(
    'branchId',branch_id,'branchKey',branch_key,'date',closing_date,
    'status',status,'cash',actual_cash,'latestCount',latest_count
  ) ORDER BY branch_key),'[]'::jsonb)
)
FROM counted;
$function$;

REVOKE ALL ON FUNCTION public.erp_owner_drawer_cash_asof(uuid,date,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_owner_drawer_cash_asof(uuid,date,uuid)
  TO authenticated;
