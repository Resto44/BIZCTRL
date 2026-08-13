-- Production ERP audit remediation
-- 1. Remove an unused SECURITY DEFINER analytics view that was effectively readable
--    by both anon and authenticated roles and could bypass branch/tenant scope.
-- 2. Remove redundant legacy public policies that bypass canonical ERP scope checks.
-- 3. Add focused indexes for the active restaurant/branch/date query paths.

DROP VIEW IF EXISTS public.v_branch_analytics;

DROP POLICY IF EXISTS products_org_isolation ON public.products;
DROP POLICY IF EXISTS suppliers_org_isolation ON public.suppliers;

CREATE INDEX IF NOT EXISTS idx_daily_sales_restaurant_branch_date
  ON public.daily_sales (restaurant_id, branch_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_sales_restaurant_branch_key_date
  ON public.daily_sales (restaurant_id, branch, date DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_restaurant_branch_key_date
  ON public.expenses (restaurant_id, branch_key, date DESC);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_restaurant_branch_status_date
  ON public.supplier_invoices (restaurant_id, branch, status, date DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_restaurant_branch_date
  ON public.wallet_transactions (restaurant_id, branch, transaction_date DESC);
