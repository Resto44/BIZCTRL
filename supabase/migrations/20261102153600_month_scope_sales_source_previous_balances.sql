-- Scope the Closing Sales "Previous" display to the selected calendar month.
-- Preserve all historical daily_sales rows for Owner dashboard, reports, and audit.
-- Include same-day finalized closings; exclude the edited closing by its UUID.
-- Retain the original RPC signature and SECURITY INVOKER / tenant-branch predicates.
CREATE OR REPLACE FUNCTION public.get_sales_source_previous_balances(
  p_restaurant_id text,
  p_branch_id uuid DEFAULT NULL,
  p_branch_key text DEFAULT NULL,
  p_before_date date DEFAULT NULL,
  p_current_closing_id uuid DEFAULT NULL
)
RETURNS TABLE(source_id uuid, previous_amount numeric)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH scoped_closings AS (
    SELECT closing.id, closing.sales_sources_json
    FROM public.daily_sales AS closing
    WHERE closing.restaurant_id = p_restaurant_id
      AND p_before_date IS NOT NULL
      AND closing.date >= date_trunc('month', p_before_date::timestamp)::date
      AND closing.date <= p_before_date
      AND COALESCE(closing.closing_state, 'finalized') <> 'draft'
      AND (p_current_closing_id IS NULL OR closing.id <> p_current_closing_id)
      AND (
        (p_branch_id IS NULL AND NULLIF(BTRIM(p_branch_key), '') IS NULL)
        OR (p_branch_id IS NOT NULL AND (
          closing.branch_id = p_branch_id
          OR (closing.branch_id IS NULL AND NULLIF(BTRIM(p_branch_key), '') IS NOT NULL AND closing.branch = p_branch_key)
        ))
        OR (p_branch_id IS NULL AND NULLIF(BTRIM(p_branch_key), '') IS NOT NULL
            AND closing.branch_id IS NULL AND closing.branch = p_branch_key)
      )
  ), source_entries AS (
    SELECT
      CASE WHEN entry.entry ->> 'source_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN (entry.entry ->> 'source_id')::uuid ELSE NULL END AS source_id,
      GREATEST(COALESCE(
        NULLIF(entry.entry ->> 'amount', '')::numeric,
        NULLIF(entry.entry ->> 'today_amount', '')::numeric,
        0
      ), 0) AS amount
    FROM scoped_closings AS closing
    CROSS JOIN LATERAL public.sales_source_snapshot_entries(closing.sales_sources_json) AS entry
  )
  SELECT source_id, COALESCE(SUM(amount), 0) AS previous_amount
  FROM source_entries WHERE source_id IS NOT NULL GROUP BY source_id;
$function$;
