BEGIN;

-- Rebuild the History reader on the shared snapshot parser. The parser accepts
-- both native JSONB arrays and older JSON strings, so this correction preserves
-- every finalized closing without mutating or duplicating financial history.
CREATE OR REPLACE FUNCTION public.get_sales_source_history(
  p_restaurant_id TEXT,
  p_source_id UUID DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_branch_key TEXT DEFAULT NULL,
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_cashier TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  source_id UUID,
  source_key TEXT,
  closing_id UUID,
  closing_date DATE,
  branch_id UUID,
  branch TEXT,
  closing_state TEXT,
  cashier_name TEXT,
  created_by TEXT,
  amount NUMERIC,
  payment_method TEXT,
  payment_bucket TEXT,
  customer_id UUID,
  customer_name TEXT,
  transaction_type TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped_closings AS (
    SELECT closing.*
    FROM public.daily_sales AS closing
    WHERE closing.restaurant_id = p_restaurant_id
      AND COALESCE(closing.closing_state, 'finalized') <> 'draft'
      AND (p_from IS NULL OR closing.date >= p_from)
      AND (p_to IS NULL OR closing.date <= p_to)
      AND (
        p_branch_id IS NULL
        OR closing.branch_id = p_branch_id
        OR (closing.branch_id IS NULL AND p_branch_key IS NOT NULL AND closing.branch = p_branch_key)
      )
  ),
  custom_entries AS (
    SELECT
      NULLIF(snapshot.entry ->> 'source_id', '')::UUID AS source_id,
      COALESCE(snapshot.entry ->> 'source_key', snapshot.entry ->> 'source_id') AS source_key,
      closing.id AS closing_id,
      closing.date AS closing_date,
      closing.branch_id,
      closing.branch,
      closing.closing_state,
      closing.cashier_name,
      closing.created_by,
      GREATEST(COALESCE(NULLIF(snapshot.entry ->> 'amount', '')::NUMERIC, NULLIF(snapshot.entry ->> 'today_amount', '')::NUMERIC, 0), 0) AS amount,
      COALESCE(snapshot.entry ->> 'default_payment_method', 'other') AS payment_method,
      COALESCE(snapshot.entry ->> 'payment_bucket', snapshot.entry ->> 'default_payment_method', 'other') AS payment_bucket,
      NULLIF(snapshot.entry ->> 'customer_id', '')::UUID AS customer_id,
      NULLIF(snapshot.entry ->> 'customer_name', '') AS customer_name,
      'sales_closing_source'::TEXT AS transaction_type,
      closing.created_date AS created_at
    FROM scoped_closings AS closing
    CROSS JOIN LATERAL public.sales_source_snapshot_entries(closing.sales_sources_json) AS snapshot(entry)
    WHERE NULLIF(snapshot.entry ->> 'source_id', '') IS NOT NULL
  ),
  custom_bucket_totals AS (
    SELECT
      closing_id,
      COALESCE(SUM(amount) FILTER (WHERE payment_bucket = 'cash'), 0) AS custom_cash,
      COALESCE(SUM(amount) FILTER (WHERE payment_bucket IN ('network', 'card', 'pos')), 0) AS custom_network,
      COALESCE(SUM(amount) FILTER (WHERE payment_bucket = 'credit'), 0) AS custom_credit
    FROM custom_entries
    GROUP BY closing_id
  ),
  system_entries AS (
    SELECT
      source.id AS source_id,
      source.system_key AS source_key,
      closing.id AS closing_id,
      closing.date AS closing_date,
      closing.branch_id,
      closing.branch,
      closing.closing_state,
      closing.cashier_name,
      closing.created_by,
      CASE source.system_key
        WHEN 'cash' THEN GREATEST(COALESCE(closing.restaurant_cash, closing.cash, 0) - COALESCE(custom.custom_cash, 0), 0)
        WHEN 'network' THEN GREATEST(COALESCE(closing.restaurant_network, closing.network, 0) - COALESCE(custom.custom_network, 0), 0)
        WHEN 'credit' THEN GREATEST(COALESCE(closing.credit, 0) - COALESCE(custom.custom_credit, 0), 0)
        ELSE 0
      END AS amount,
      source.default_payment_method AS payment_method,
      CASE source.system_key
        WHEN 'cash' THEN 'cash'
        WHEN 'network' THEN 'network'
        WHEN 'credit' THEN 'credit'
        ELSE 'other'
      END AS payment_bucket,
      closing.customer_id,
      NULL::TEXT AS customer_name,
      'sales_closing_system'::TEXT AS transaction_type,
      closing.created_date AS created_at
    FROM scoped_closings AS closing
    JOIN public.sales_sources AS source
      ON source.restaurant_id = p_restaurant_id
     AND source.is_system = true
     AND source.system_key IN ('cash', 'network', 'credit')
    LEFT JOIN custom_bucket_totals AS custom
      ON custom.closing_id = closing.id
  ),
  ledger AS (
    SELECT * FROM custom_entries
    UNION ALL
    SELECT * FROM system_entries WHERE amount > 0
  )
  SELECT *
  FROM ledger
  WHERE (p_source_id IS NULL OR ledger.source_id = p_source_id)
    AND (p_payment_method IS NULL OR ledger.payment_method = p_payment_method)
    AND (p_customer_id IS NULL OR ledger.customer_id = p_customer_id)
    AND (p_cashier IS NULL OR ledger.cashier_name = p_cashier OR ledger.created_by = p_cashier)
  ORDER BY closing_date DESC, created_at DESC, closing_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE EXECUTE ON FUNCTION public.get_sales_source_history(TEXT, UUID, UUID, TEXT, DATE, DATE, TEXT, UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_source_history(TEXT, UUID, UUID, TEXT, DATE, DATE, TEXT, UUID, TEXT, INTEGER, INTEGER) TO authenticated;

COMMIT;
