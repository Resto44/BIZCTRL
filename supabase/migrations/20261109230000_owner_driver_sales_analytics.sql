-- Read-only Owner ERP analytics for canonical, finalized driver sales.
-- Driver collections are already included in Sales Closing revenue.
-- Never add driver declarations or delivery orders as independent revenue.
CREATE OR REPLACE FUNCTION public.erp_owner_driver_sales_analytics(
  p_restaurant_id uuid,
  p_from date,
  p_to date,
  p_branch_id uuid DEFAULT NULL,
  p_driver_id uuid DEFAULT NULL,
  p_bucket text DEFAULT 'day'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET row_security TO 'off'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.erp_memberships m
    WHERE m.user_id = auth.uid()
      AND m.restaurant_id = p_restaurant_id
      AND m.role = 'owner'
      AND m.status = 'approved'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='OWNER_SCOPE_REQUIRED';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to
     OR (p_to - p_from) > 370
     OR p_bucket NOT IN ('day','week','month') OR p_bucket IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_DRIVER_ANALYTICS_PERIOD';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = p_branch_id AND b.restaurant_id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='BRANCH_OUT_OF_SCOPE';
  END IF;
  IF p_driver_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = p_driver_id AND d.restaurant_id = p_restaurant_id
      AND (p_branch_id IS NULL OR d.branch_id = p_branch_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='DRIVER_OUT_OF_SCOPE';
  END IF;

  WITH posted AS MATERIALIZED (
    SELECT s.date, s.branch_id, s.driver_id,
           s.cash_amount, s.network_amount, s.total_amount
    FROM public.driver_sales_entries s
    JOIN public.daily_sales closing ON closing.id = s.closing_id
      AND closing.restaurant_id = p_restaurant_id::text
      AND closing.closing_state IN ('finalized', 'locked')
      AND closing.branch_id = s.branch_id
      AND closing.date = s.date
    JOIN public.drivers d ON d.id = s.driver_id
      AND d.restaurant_id = p_restaurant_id
      AND d.branch_id = s.branch_id
    WHERE s.restaurant_id = p_restaurant_id
      AND s.status = 'finalized'
      AND s.date BETWEEN p_from AND p_to
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND (p_driver_id IS NULL OR s.driver_id = p_driver_id)
  ),
  driver_totals AS (
    SELECT p.driver_id,
           COUNT(*)::integer entries,
           SUM(p.cash_amount)::numeric cash,
           SUM(p.network_amount)::numeric network,
           SUM(p.total_amount)::numeric revenue
    FROM posted p GROUP BY p.driver_id
  ),
  branch_totals AS (
    SELECT p.branch_id,
           COUNT(*)::integer entries,
           COUNT(DISTINCT p.driver_id)::integer selling_drivers,
           SUM(p.cash_amount)::numeric cash,
           SUM(p.network_amount)::numeric network,
           SUM(p.total_amount)::numeric revenue
    FROM posted p GROUP BY p.branch_id
  ),
  time_totals AS (
    SELECT date_trunc(p_bucket, p.date::timestamp)::date bucket,
           COUNT(*)::integer entries,
           SUM(p.cash_amount)::numeric cash,
           SUM(p.network_amount)::numeric network,
           SUM(p.total_amount)::numeric revenue
    FROM posted p GROUP BY 1
  )
  SELECT jsonb_build_object(
    'totals', (SELECT jsonb_build_object(
       'revenue',COALESCE(SUM(total_amount),0),
       'cash',COALESCE(SUM(cash_amount),0),
       'network',COALESCE(SUM(network_amount),0),
       'entries',COUNT(*),
       'selling_drivers',COUNT(DISTINCT driver_id)
    ) FROM posted),
    'trend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', t.bucket, 'revenue',t.revenue, 'cash',t.cash,
        'network',t.network,'entries',t.entries
      ) ORDER BY t.bucket) FROM time_totals t
    ),'[]'::jsonb),
    'drivers',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',d.id,'name',d.full_name,'branch_id',d.branch_id,
        'branch_name',COALESCE(b.name,'—'),'active',COALESCE(d.is_active,true),
        'revenue',COALESCE(dt.revenue,0),
        'cash',COALESCE(dt.cash,0),'network',COALESCE(dt.network,0),
        'entries',COALESCE(dt.entries,0)
      ) ORDER BY COALESCE(dt.revenue,0) DESC,d.full_name,d.id)
      FROM public.drivers d
      LEFT JOIN public.branches b ON b.id = d.branch_id
        AND b.restaurant_id = p_restaurant_id
      LEFT JOIN driver_totals dt ON dt.driver_id = d.id
      WHERE d.restaurant_id = p_restaurant_id
        AND (p_branch_id IS NULL OR d.branch_id = p_branch_id)
        AND (p_driver_id IS NULL OR d.id = p_driver_id)
    ),'[]'::jsonb),
    'branches',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',b.id,'name',b.name,
        'revenue',COALESCE(bt.revenue,0),'cash',COALESCE(bt.cash,0),
        'network',COALESCE(bt.network,0),'entries',COALESCE(bt.entries,0),
        'selling_drivers',COALESCE(bt.selling_drivers,0)
      ) ORDER BY COALESCE(bt.revenue,0) DESC,b.name,b.id)
      FROM public.branches b
      LEFT JOIN branch_totals bt ON bt.branch_id = b.id
      WHERE b.restaurant_id = p_restaurant_id
        AND (p_branch_id IS NULL OR b.id = p_branch_id)
        AND (p_driver_id IS NULL OR EXISTS (
          SELECT 1 FROM public.drivers d
          WHERE d.id = p_driver_id AND d.branch_id = b.id
            AND d.restaurant_id = p_restaurant_id
        ))
    ),'[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.erp_owner_driver_sales_analytics(uuid,date,date,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_owner_driver_sales_analytics(uuid,date,date,uuid,uuid,text) TO authenticated,service_role;
