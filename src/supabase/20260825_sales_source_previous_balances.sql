BEGIN;

-- Historical Sales Source snapshots are immutable financial records. Earlier
-- browser releases serialized an array into the JSONB column as a JSON string,
-- while current releases write a native JSONB array. This helper reads both
-- representations without rewriting any historical financial data.
CREATE OR REPLACE FUNCTION public.sales_source_snapshot_entries(p_snapshot JSONB)
RETURNS TABLE (entry JSONB)
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public
AS $$
DECLARE
  v_entries JSONB := '[]'::JSONB;
BEGIN
  IF jsonb_typeof(p_snapshot) = 'array' THEN
    v_entries := p_snapshot;
  ELSIF jsonb_typeof(p_snapshot) = 'string' THEN
    BEGIN
      v_entries := COALESCE((p_snapshot #>> '{}')::JSONB, '[]'::JSONB);
    EXCEPTION WHEN OTHERS THEN
      v_entries := '[]'::JSONB;
    END;
  END IF;

  IF jsonb_typeof(v_entries) <> 'array' THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT value
    FROM jsonb_array_elements(v_entries);
END;
$$;

COMMENT ON FUNCTION public.sales_source_snapshot_entries(JSONB) IS
  'Safely reads native and legacy string-wrapped Sales Source JSON snapshots without mutating financial history.';

-- One aggregate query returns all Previous balances for the active Sales
-- Closing scope. It is tenant-isolated, branch-isolated, keyed only by the
-- immutable Sales Source UUID, excludes drafts and the current closing date,
-- and does not issue one query per source.
CREATE OR REPLACE FUNCTION public.get_sales_source_previous_balances(
  p_restaurant_id TEXT,
  p_branch_id UUID DEFAULT NULL,
  p_branch_key TEXT DEFAULT NULL,
  p_before_date DATE DEFAULT NULL,
  p_current_closing_id UUID DEFAULT NULL
)
RETURNS TABLE (
  source_id UUID,
  previous_amount NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped_closings AS (
    SELECT closing.id, closing.sales_sources_json
    FROM public.daily_sales AS closing
    WHERE closing.restaurant_id = p_restaurant_id
      AND p_before_date IS NOT NULL
      AND closing.date < p_before_date
      AND COALESCE(closing.closing_state, 'finalized') <> 'draft'
      AND (p_current_closing_id IS NULL OR closing.id <> p_current_closing_id)
      AND (
        -- No branch supplied is the explicit all-branches aggregation case.
        (p_branch_id IS NULL AND NULLIF(BTRIM(p_branch_key), '') IS NULL)
        -- Canonical branch scope, with legacy branch-key fallback for records
        -- that predate branch UUID adoption.
        OR (
          p_branch_id IS NOT NULL
          AND (
            closing.branch_id = p_branch_id
            OR (
              closing.branch_id IS NULL
              AND NULLIF(BTRIM(p_branch_key), '') IS NOT NULL
              AND closing.branch = p_branch_key
            )
          )
        )
        -- Legacy-only selected branch scope.
        OR (
          p_branch_id IS NULL
          AND NULLIF(BTRIM(p_branch_key), '') IS NOT NULL
          AND closing.branch_id IS NULL
          AND closing.branch = p_branch_key
        )
      )
  ),
  source_entries AS (
    SELECT
      CASE
        WHEN entry.entry ->> 'source_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (entry.entry ->> 'source_id')::UUID
        ELSE NULL
      END AS source_id,
      GREATEST(
        COALESCE(
          NULLIF(entry.entry ->> 'amount', '')::NUMERIC,
          NULLIF(entry.entry ->> 'today_amount', '')::NUMERIC,
          0
        ),
        0
      ) AS amount
    FROM scoped_closings AS closing
    CROSS JOIN LATERAL public.sales_source_snapshot_entries(closing.sales_sources_json) AS entry
  )
  SELECT source_id, COALESCE(SUM(amount), 0) AS previous_amount
  FROM source_entries
  WHERE source_id IS NOT NULL
  GROUP BY source_id;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_source_snapshot_entries(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_source_snapshot_entries(JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_sales_source_previous_balances(TEXT, UUID, TEXT, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_source_previous_balances(TEXT, UUID, TEXT, DATE, UUID) TO authenticated;

COMMIT;
