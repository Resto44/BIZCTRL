-- ============================================================================
-- Sales Source Management Center
-- Date: 2026-08-25
-- Purpose: Extend the existing Sales Source configuration and daily_sales
--          snapshots into a branch-aware management, history, and analytics
--          surface. No duplicate sales, debt, treasury, report, or permission
--          tables are introduced.
-- ============================================================================

-- 1. Extend the canonical sales_sources master record. Current balances,
--    historical amounts, and today amounts remain derived from daily_sales;
--    they are deliberately not stored on the source master record.
ALTER TABLE public.sales_sources
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS branch_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by TEXT;

ALTER TABLE public.sales_sources
  DROP CONSTRAINT IF EXISTS sales_sources_category_check;

ALTER TABLE public.sales_sources
  ADD CONSTRAINT sales_sources_category_check
  CHECK (category IN ('delivery', 'wholesale', 'counter', 'online', 'corporate', 'credit', 'bank_transfer', 'other'));

COMMENT ON COLUMN public.sales_sources.branch_ids IS
  'Additional canonical branch UUIDs where a non-global source is available. Legacy branch_id remains supported for historical compatibility.';
COMMENT ON COLUMN public.sales_sources.category IS
  'Operational Sales Source category. It is configuration metadata only and is never an accounting relationship key.';

CREATE INDEX IF NOT EXISTS idx_sales_sources_restaurant_active_order
  ON public.sales_sources (restaurant_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_sales_sources_branch_ids
  ON public.sales_sources USING GIN (branch_ids);

-- 2. Preserve per-source links in the existing debt/customer architecture.
--    A NULL source_id remains valid for legacy debt records and payments.
ALTER TABLE public.debt_records
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES public.sales_sources(id) ON DELETE RESTRICT;

ALTER TABLE public.debt_payments
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES public.sales_sources(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_debt_records_source_id ON public.debt_records (source_id);
CREATE INDEX IF NOT EXISTS idx_debt_payments_source_id ON public.debt_payments (source_id);

-- 3. Add query support for finalized/locked source-history reads. Draft closings
--    are intentionally excluded from the management ledger.
CREATE INDEX IF NOT EXISTS idx_daily_sales_source_history_scope
  ON public.daily_sales (restaurant_id, branch_id, date DESC)
  WHERE COALESCE(closing_state, 'finalized') <> 'draft';

-- 4. Safeguard historical source snapshots. Source IDs, not names, are the
--    relationship key. A source with historical entries may be archived but
--    cannot be deleted. This mirrors the current configuration UI contract.
CREATE OR REPLACE FUNCTION public.prevent_sales_source_delete_if_in_use()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.daily_sales AS closing
    WHERE closing.sales_sources_json @> jsonb_build_array(jsonb_build_object('source_id', OLD.id::text))
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'SALES_SOURCE_IN_USE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.debt_records AS debt WHERE debt.source_id = OLD.id LIMIT 1
  ) OR EXISTS (
    SELECT 1 FROM public.debt_payments AS payment WHERE payment.source_id = OLD.id LIMIT 1
  ) THEN
    RAISE EXCEPTION 'SALES_SOURCE_IN_USE';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_sales_source_delete_if_in_use ON public.sales_sources;
CREATE TRIGGER trg_prevent_sales_source_delete_if_in_use
BEFORE DELETE ON public.sales_sources
FOR EACH ROW
EXECUTE FUNCTION public.prevent_sales_source_delete_if_in_use();

-- 5. Expand the existing branch-scope SELECT rule with multi-branch availability
--    while retaining global sources and legacy branch-key compatibility.
DROP POLICY IF EXISTS sales_sources_scope_select ON public.sales_sources;
CREATE POLICY sales_sources_scope_select
ON public.sales_sources
FOR SELECT
USING (
  public.erp_can_access_scope_text(restaurant_id, branch_id)
  OR (is_global = true AND public.erp_can_access_scope_text(restaurant_id, NULL))
  OR EXISTS (
    SELECT 1
    FROM public.erp_memberships AS membership
    WHERE membership.user_id = auth.uid()
      AND membership.status = 'approved'
      AND membership.role IN ('manager', 'employee')
      AND membership.restaurant_id::text = NULLIF(sales_sources.restaurant_id, '')
      AND membership.branch_id = ANY(COALESCE(sales_sources.branch_ids, ARRAY[]::UUID[]))
  )
  OR EXISTS (
    SELECT 1
    FROM public.erp_memberships AS membership
    JOIN public.branches AS branch
      ON branch.id = membership.branch_id
    WHERE membership.user_id = auth.uid()
      AND membership.status = 'approved'
      AND membership.role IN ('manager', 'employee')
      AND membership.restaurant_id::text = NULLIF(sales_sources.restaurant_id, '')
      AND branch.branch_key = sales_sources.branch_id
  )
);

-- 6. Source history comes from the existing immutable daily_sales snapshots.
--    System cash/network/credit rows are reconstructed from their canonical
--    totals only after subtracting custom source entries already embedded in
--    those totals, so no source is double counted.
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
      NULLIF(entry ->> 'source_id', '')::UUID AS source_id,
      COALESCE(entry ->> 'source_key', entry ->> 'source_id') AS source_key,
      closing.id AS closing_id,
      closing.date AS closing_date,
      closing.branch_id,
      closing.branch,
      closing.closing_state,
      closing.cashier_name,
      closing.created_by,
      GREATEST(COALESCE(NULLIF(entry ->> 'amount', '')::NUMERIC, 0), 0) AS amount,
      COALESCE(entry ->> 'default_payment_method', 'other') AS payment_method,
      COALESCE(entry ->> 'payment_bucket', entry ->> 'default_payment_method', 'other') AS payment_bucket,
      NULLIF(entry ->> 'customer_id', '')::UUID AS customer_id,
      NULLIF(entry ->> 'customer_name', '') AS customer_name,
      'sales_closing_source'::TEXT AS transaction_type,
      closing.created_date AS created_at
    FROM scoped_closings AS closing
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(COALESCE(closing.sales_sources_json, '[]'::JSONB)) = 'array'
          THEN COALESCE(closing.sales_sources_json, '[]'::JSONB)
        ELSE '[]'::JSONB
      END
    ) AS entry
    WHERE NULLIF(entry ->> 'source_id', '') IS NOT NULL
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

-- 7. One source-level aggregation function supports dashboard cards, contribution,
--    ranking, source trends, and reconciliation without loading all history into a
--    browser. Collections and outstanding amounts are always read from the
--    existing debt records/payments rather than a parallel debt ledger.
CREATE OR REPLACE FUNCTION public.get_sales_source_dashboard(
  p_restaurant_id TEXT,
  p_branch_id UUID DEFAULT NULL,
  p_branch_key TEXT DEFAULT NULL,
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL
)
RETURNS TABLE (
  source_id UUID,
  today_sales NUMERIC,
  previous_sales NUMERIC,
  total_sales NUMERIC,
  transaction_count BIGINT,
  average_transaction NUMERIC,
  cash_amount NUMERIC,
  digital_amount NUMERIC,
  credit_amount NUMERIC,
  collected_amount NUMERIC,
  outstanding_amount NUMERIC,
  contribution_percent NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH source_rows AS (
    SELECT *
    FROM public.get_sales_source_history(
      p_restaurant_id,
      NULL,
      p_branch_id,
      p_branch_key,
      p_from,
      p_to,
      NULL,
      NULL,
      NULL,
      500,
      0
    )
  ),
  source_totals AS (
    SELECT
      row.source_id,
      COALESCE(SUM(row.amount) FILTER (WHERE row.closing_date = CURRENT_DATE), 0) AS today_sales,
      COALESCE(SUM(row.amount) FILTER (WHERE row.closing_date < CURRENT_DATE), 0) AS previous_sales,
      COALESCE(SUM(row.amount), 0) AS total_sales,
      COUNT(*) AS transaction_count,
      COALESCE(AVG(row.amount), 0) AS average_transaction,
      COALESCE(SUM(row.amount) FILTER (WHERE row.payment_bucket = 'cash'), 0) AS cash_amount,
      COALESCE(SUM(row.amount) FILTER (WHERE row.payment_bucket IN ('network', 'card', 'pos')), 0) AS digital_amount,
      COALESCE(SUM(row.amount) FILTER (WHERE row.payment_bucket = 'credit'), 0) AS credit_amount
    FROM source_rows AS row
    GROUP BY row.source_id
  ),
  debt_totals AS (
    SELECT
      record.source_id,
      COALESCE(SUM(record.paid_amount), 0) AS collected_amount,
      COALESCE(SUM(record.remaining_amount), 0) AS outstanding_amount
    FROM public.debt_records AS record
    WHERE record.restaurant_id::TEXT = p_restaurant_id
      AND (p_branch_id IS NULL OR record.branch_id = p_branch_id)
    GROUP BY record.source_id
  ),
  totals AS (SELECT COALESCE(SUM(total_sales), 0) AS amount FROM source_totals)
  SELECT
    source.id AS source_id,
    COALESCE(summary.today_sales, 0) AS today_sales,
    COALESCE(summary.previous_sales, 0) AS previous_sales,
    COALESCE(summary.total_sales, 0) AS total_sales,
    COALESCE(summary.transaction_count, 0) AS transaction_count,
    COALESCE(summary.average_transaction, 0) AS average_transaction,
    COALESCE(summary.cash_amount, 0) AS cash_amount,
    COALESCE(summary.digital_amount, 0) AS digital_amount,
    COALESCE(summary.credit_amount, 0) AS credit_amount,
    COALESCE(debt.collected_amount, 0) AS collected_amount,
    COALESCE(debt.outstanding_amount, 0) AS outstanding_amount,
    CASE WHEN totals.amount > 0 THEN ROUND((COALESCE(summary.total_sales, 0) / totals.amount) * 100, 2) ELSE 0 END AS contribution_percent
  FROM public.sales_sources AS source
  LEFT JOIN source_totals AS summary ON summary.source_id = source.id
  LEFT JOIN debt_totals AS debt ON debt.source_id = source.id
  CROSS JOIN totals
  WHERE source.restaurant_id = p_restaurant_id
  ORDER BY source.sort_order, source.created_date;
$$;

REVOKE EXECUTE ON FUNCTION public.get_sales_source_dashboard(TEXT, UUID, TEXT, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_source_dashboard(TEXT, UUID, TEXT, DATE, DATE) TO authenticated;

-- 8. Keep source master audit fields current for direct existing-context mutations.
CREATE OR REPLACE FUNCTION public.touch_sales_source_updated_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_date = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_sales_source_updated_date ON public.sales_sources;
CREATE TRIGGER trg_touch_sales_source_updated_date
BEFORE UPDATE ON public.sales_sources
FOR EACH ROW
EXECUTE FUNCTION public.touch_sales_source_updated_date();
