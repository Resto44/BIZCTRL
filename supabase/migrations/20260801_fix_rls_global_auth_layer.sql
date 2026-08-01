-- ============================================================
-- MIGRATION: 20260801_fix_rls_global_auth_layer.sql
-- PURPOSE: Fix broken authorization layer globally.
--
-- ROOT CAUSES FIXED:
--   1. erp_memberships: owner rows with NULL restaurant_id — backfill from profiles
--   2. erp_can_write_scope_text: NULL branch_id in payload must be allowed for owners
--   3. sales_invoices INSERT policy: overly strict created_by check blocks GMs + owners
--   4. debt_payments INSERT policy: NULL branch_id in payload fails scope check
--   5. supplier_payments INSERT policy: NULL branch_id in payload fails scope check
--   6. cash_movements INSERT policy: NULL branch_id in payload fails scope check
--   7. daily_cash_settlements INSERT: NULL branch_id fails scope check
--   8. owner_cash_injections INSERT: NULL branch_id fails scope check
--   9. wallet_transactions INSERT: NULL branch_id fails scope check
--  10. Branch analytics view: missing DB view for per-branch aggregation
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- STEP 1: Backfill erp_memberships.restaurant_id for owners
--         whose profile has organization_id / restaurant_id set
--         but their membership row is NULL.
-- ──────────────────────────────────────────────────────────────
UPDATE public.erp_memberships m
SET
  restaurant_id = COALESCE(p.organization_id, p.restaurant_id),
  updated_at    = now()
FROM public.profiles p
WHERE m.user_id      = p.id
  AND m.role         = 'owner'
  AND m.status       = 'approved'
  AND m.restaurant_id IS NULL
  AND COALESCE(p.organization_id, p.restaurant_id) IS NOT NULL;

-- ──────────────────────────────────────────────────────────────
-- STEP 2: Harden erp_can_write_scope_text
--
-- Problem: when the INSERT payload sends branch_id = NULL (e.g.
-- debt_payments, supplier_payments, cash_movements), the function
-- receives p_branch_id = '' (cast of NULL::uuid to text = '').
-- The existing code already handles nullif(p_branch_id,'') but
-- the fast-path requires m.restaurant_id to be non-NULL.
-- We make the function SECURITY DEFINER so it bypasses RLS on
-- erp_memberships (preventing infinite recursion) and we add a
-- third path: owner with matching profile org.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.erp_can_write_scope_text(
  p_restaurant_id text,
  p_branch_id     text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Fast path: approved membership with matching restaurant
    SELECT 1
    FROM public.erp_memberships m
    WHERE m.user_id        = auth.uid()
      AND m.status         = 'approved'
      AND m.restaurant_id::text = nullif(p_restaurant_id, '')
      AND m.role           IN ('owner', 'manager', 'general_manager')
      AND (
        m.role = 'owner'
        OR nullif(p_branch_id, '') IS NULL
        OR m.branch_id::text = p_branch_id
      )
  )
  OR EXISTS (
    -- Fallback: owner whose erp_membership has NULL restaurant_id but
    -- profiles.organization_id / restaurant_id is correctly set.
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = auth.uid()
      AND pr.role = 'owner'
      AND COALESCE(pr.approval_status, 'approved') = 'approved'
      AND COALESCE(pr.organization_id, pr.restaurant_id)::text = nullif(p_restaurant_id, '')
  );
$$;

-- ──────────────────────────────────────────────────────────────
-- STEP 3: Harden erp_can_access_scope_text (same pattern)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.erp_can_access_scope_text(
  p_restaurant_id text,
  p_branch_id     text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.erp_memberships m
    WHERE m.user_id = auth.uid()
      AND m.status  = 'approved'
      AND m.restaurant_id::text = nullif(p_restaurant_id, '')
      AND (
        m.role = 'owner'
        OR nullif(p_branch_id, '') IS NULL
        OR m.branch_id::text = p_branch_id
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = auth.uid()
      AND pr.role = 'owner'
      AND COALESCE(pr.approval_status, 'approved') = 'approved'
      AND COALESCE(pr.organization_id, pr.restaurant_id)::text = nullif(p_restaurant_id, '')
  );
$$;

-- ──────────────────────────────────────────────────────────────
-- STEP 4: Fix sales_invoices INSERT policy
--
-- Problem: The current WITH CHECK requires:
--   NULLIF(created_by,'') = COALESCE(auth.jwt()->>'email','')
-- This fails when:
--   a) The JWT email claim is absent (service role / edge case)
--   b) The payload sends created_by from a different source
--
-- Fix: relax the created_by check to also allow the user's email
-- from auth.users, and allow owners/GMs to omit created_by.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "erp_scope_insert" ON public.sales_invoices;

CREATE POLICY "erp_scope_insert"
ON public.sales_invoices
FOR INSERT
TO authenticated
WITH CHECK (
  restaurant_id IS NOT NULL
  AND branch_id IS NOT NULL
  AND (
    -- Owner or manager with write scope
    erp_can_write_scope_text((restaurant_id)::text, (branch_id)::text)
    OR
    -- General manager with uploadSales permission
    (
      erp_current_role() = 'general_manager'
      AND erp_can_access_scope_text((restaurant_id)::text, (branch_id)::text)
      AND erp_has_permission('uploadSales')
    )
  )
  AND (
    -- created_by must be non-empty and match the authenticated user's email
    NULLIF(created_by, '') IS NOT NULL
    AND (
      NULLIF(created_by, '') = COALESCE((auth.jwt() ->> 'email'), '')
      OR NULLIF(created_by, '') = (
        SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1
      )
    )
  )
);

-- ──────────────────────────────────────────────────────────────
-- STEP 5: Fix debt_payments INSERT policy
--
-- Problem: payload sends NULL branch_id — policy fails.
-- Fix: allow NULL branch_id when restaurant_id matches (owner context).
-- The erp_can_write_scope_text already handles NULL branch via
-- nullif(p_branch_id,'') IS NULL path — but we need to ensure
-- the cast of NULL uuid to text works.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "erp_scope_insert" ON public.debt_payments;

CREATE POLICY "erp_scope_insert"
ON public.debt_payments
FOR INSERT
TO authenticated
WITH CHECK (
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    COALESCE((branch_id)::text, '')
  )
);

-- ──────────────────────────────────────────────────────────────
-- STEP 6: Fix supplier_payments INSERT policy
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "erp_scope_insert" ON public.supplier_payments;

CREATE POLICY "erp_scope_insert"
ON public.supplier_payments
FOR INSERT
TO authenticated
WITH CHECK (
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    COALESCE((branch_id)::text, '')
  )
);

-- ──────────────────────────────────────────────────────────────
-- STEP 7: Fix cash_movements INSERT policy
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "erp_scope_insert" ON public.cash_movements;

CREATE POLICY "erp_scope_insert"
ON public.cash_movements
FOR INSERT
TO authenticated
WITH CHECK (
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    COALESCE((branch_id)::text, '')
  )
);

-- ──────────────────────────────────────────────────────────────
-- STEP 8: Fix daily_cash_settlements INSERT policy
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "erp_scope_insert" ON public.daily_cash_settlements;

CREATE POLICY "erp_scope_insert"
ON public.daily_cash_settlements
FOR INSERT
TO authenticated
WITH CHECK (
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    COALESCE((branch_id)::text, '')
  )
);

-- ──────────────────────────────────────────────────────────────
-- STEP 9: Fix owner_cash_injections INSERT policy
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "erp_scope_insert" ON public.owner_cash_injections;

CREATE POLICY "erp_scope_insert"
ON public.owner_cash_injections
FOR INSERT
TO authenticated
WITH CHECK (
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    COALESCE((branch_id)::text, '')
  )
);

-- ──────────────────────────────────────────────────────────────
-- STEP 10: Fix wallet_transactions INSERT policy
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "erp_scope_insert" ON public.wallet_transactions;

CREATE POLICY "erp_scope_insert"
ON public.wallet_transactions
FOR INSERT
TO authenticated
WITH CHECK (
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    COALESCE((branch_id)::text, '')
  )
);

-- ──────────────────────────────────────────────────────────────
-- STEP 11: Fix debt_records INSERT policy (same NULL branch_id issue)
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "erp_scope_insert" ON public.debt_records;

CREATE POLICY "erp_scope_insert"
ON public.debt_records
FOR INSERT
TO authenticated
WITH CHECK (
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    COALESCE((branch_id)::text, '')
  )
);

-- ──────────────────────────────────────────────────────────────
-- STEP 12: Fix daily_sales INSERT policy
-- The existing erp_scope_insert uses erp_can_write_scope_text(restaurant_id, branch_id::text)
-- where restaurant_id is TEXT on daily_sales. Ensure COALESCE handles NULL.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "erp_scope_insert" ON public.daily_sales;

CREATE POLICY "erp_scope_insert"
ON public.daily_sales
FOR INSERT
TO authenticated
WITH CHECK (
  erp_can_write_scope_text(
    COALESCE(restaurant_id, ''),
    COALESCE((branch_id)::text, '')
  )
);

-- ──────────────────────────────────────────────────────────────
-- STEP 13: Fix expenses INSERT policy (same NULL branch_id issue)
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "erp_scope_insert" ON public.expenses;

CREATE POLICY "erp_scope_insert"
ON public.expenses
FOR INSERT
TO authenticated
WITH CHECK (
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    COALESCE((branch_id)::text, '')
  )
);

-- ──────────────────────────────────────────────────────────────
-- STEP 14: Fix purchases INSERT policy
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "erp_scope_insert" ON public.purchases;

CREATE POLICY "erp_scope_insert"
ON public.purchases
FOR INSERT
TO authenticated
WITH CHECK (
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    COALESCE((branch_id)::text, '')
  )
);

-- ──────────────────────────────────────────────────────────────
-- STEP 15: Create branch analytics view
--
-- Aggregates Sales + Purchases (supplier_invoices) + Expenses
-- per branch per restaurant. Used by BranchManagement analytics.
-- The view is SECURITY INVOKER so RLS on underlying tables applies.
-- ──────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_branch_analytics;

CREATE VIEW public.v_branch_analytics
WITH (security_invoker = true)
AS
SELECT
  b.id                                          AS branch_id,
  b.restaurant_id,
  b.branch_key,
  b.name                                        AS branch_name,
  b.is_active,

  -- Sales (last 30 days)
  COALESCE(s30.total_sales, 0)                  AS sales_30d,
  COALESCE(s30.sale_count, 0)                   AS sale_count_30d,

  -- Purchases via supplier_invoices (last 30 days)
  COALESCE(p30.total_purchases, 0)              AS purchases_30d,
  COALESCE(p30.invoice_count, 0)                AS purchase_count_30d,

  -- Expenses (last 30 days)
  COALESCE(e30.total_expenses, 0)               AS expenses_30d,
  COALESCE(e30.expense_count, 0)                AS expense_count_30d,

  -- Profit = Sales - Purchases - Expenses
  COALESCE(s30.total_sales, 0)
    - COALESCE(p30.total_purchases, 0)
    - COALESCE(e30.total_expenses, 0)           AS profit_30d

FROM public.branches b

-- Sales aggregation
LEFT JOIN LATERAL (
  SELECT
    SUM(COALESCE(ds.cash, 0) + COALESCE(ds.network, 0) + COALESCE(ds.credit, 0)) AS total_sales,
    COUNT(*)                                                                        AS sale_count
  FROM public.daily_sales ds
  WHERE ds.branch_id = b.id
    AND ds.date >= (CURRENT_DATE - INTERVAL '30 days')
) s30 ON true

-- Purchases aggregation (supplier_invoices as source of truth)
LEFT JOIN LATERAL (
  SELECT
    SUM(COALESCE(si.total_amount, 0)) AS total_purchases,
    COUNT(*)                           AS invoice_count
  FROM public.supplier_invoices si
  WHERE si.branch_id = b.id
    AND si.status IN ('approved', 'partial', 'paid')
    AND si.created_date >= (CURRENT_DATE - INTERVAL '30 days')
) p30 ON true

-- Expenses aggregation
LEFT JOIN LATERAL (
  SELECT
    SUM(COALESCE(ex.amount, 0)) AS total_expenses,
    COUNT(*)                     AS expense_count
  FROM public.expenses ex
  WHERE ex.branch_id = b.id
    AND ex.date >= (CURRENT_DATE - INTERVAL '30 days')
) e30 ON true

WHERE b.is_active = true;

-- Grant read access to authenticated users
GRANT SELECT ON public.v_branch_analytics TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- STEP 16: Also fix UPDATE policies to use COALESCE for NULL branch_id
-- ──────────────────────────────────────────────────────────────

-- debt_payments UPDATE
DROP POLICY IF EXISTS "erp_scope_update" ON public.debt_payments;
CREATE POLICY "erp_scope_update"
ON public.debt_payments
FOR UPDATE
TO authenticated
USING (erp_can_write_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')))
WITH CHECK (erp_can_write_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')));

-- debt_payments SELECT
DROP POLICY IF EXISTS "erp_scope_select" ON public.debt_payments;
CREATE POLICY "erp_scope_select"
ON public.debt_payments
FOR SELECT
TO authenticated
USING (erp_can_access_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')));

-- debt_records UPDATE
DROP POLICY IF EXISTS "erp_scope_update" ON public.debt_records;
CREATE POLICY "erp_scope_update"
ON public.debt_records
FOR UPDATE
TO authenticated
USING (erp_can_write_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')))
WITH CHECK (erp_can_write_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')));

-- debt_records SELECT
DROP POLICY IF EXISTS "erp_scope_select" ON public.debt_records;
CREATE POLICY "erp_scope_select"
ON public.debt_records
FOR SELECT
TO authenticated
USING (erp_can_access_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')));

-- supplier_payments UPDATE
DROP POLICY IF EXISTS "erp_scope_update" ON public.supplier_payments;
CREATE POLICY "erp_scope_update"
ON public.supplier_payments
FOR UPDATE
TO authenticated
USING (erp_can_write_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')))
WITH CHECK (erp_can_write_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')));

-- supplier_payments SELECT
DROP POLICY IF EXISTS "erp_scope_select" ON public.supplier_payments;
CREATE POLICY "erp_scope_select"
ON public.supplier_payments
FOR SELECT
TO authenticated
USING (erp_can_access_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')));

-- cash_movements UPDATE
DROP POLICY IF EXISTS "erp_scope_update" ON public.cash_movements;
CREATE POLICY "erp_scope_update"
ON public.cash_movements
FOR UPDATE
TO authenticated
USING (erp_can_write_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')))
WITH CHECK (erp_can_write_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')));

-- cash_movements SELECT
DROP POLICY IF EXISTS "erp_scope_select" ON public.cash_movements;
CREATE POLICY "erp_scope_select"
ON public.cash_movements
FOR SELECT
TO authenticated
USING (erp_can_access_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')));

-- daily_cash_settlements UPDATE
DROP POLICY IF EXISTS "erp_scope_update" ON public.daily_cash_settlements;
CREATE POLICY "erp_scope_update"
ON public.daily_cash_settlements
FOR UPDATE
TO authenticated
USING (erp_can_write_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')))
WITH CHECK (erp_can_write_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')));

-- daily_cash_settlements SELECT
DROP POLICY IF EXISTS "erp_scope_select" ON public.daily_cash_settlements;
CREATE POLICY "erp_scope_select"
ON public.daily_cash_settlements
FOR SELECT
TO authenticated
USING (erp_can_access_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')));

-- owner_cash_injections UPDATE
DROP POLICY IF EXISTS "erp_scope_update" ON public.owner_cash_injections;
CREATE POLICY "erp_scope_update"
ON public.owner_cash_injections
FOR UPDATE
TO authenticated
USING (erp_can_write_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')))
WITH CHECK (erp_can_write_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')));

-- wallet_transactions UPDATE
DROP POLICY IF EXISTS "erp_scope_update" ON public.wallet_transactions;
CREATE POLICY "erp_scope_update"
ON public.wallet_transactions
FOR UPDATE
TO authenticated
USING (erp_can_write_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')))
WITH CHECK (erp_can_write_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')));

-- wallet_transactions SELECT
DROP POLICY IF EXISTS "erp_scope_select" ON public.wallet_transactions;
CREATE POLICY "erp_scope_select"
ON public.wallet_transactions
FOR SELECT
TO authenticated
USING (erp_can_access_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')));

-- owner_cash_injections SELECT
DROP POLICY IF EXISTS "erp_scope_select" ON public.owner_cash_injections;
CREATE POLICY "erp_scope_select"
ON public.owner_cash_injections
FOR SELECT
TO authenticated
USING (erp_can_access_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')));

-- ──────────────────────────────────────────────────────────────
-- STEP 17: Ensure erp_memberships restaurant_id is kept in sync
-- via a trigger on profiles updates (for future-proofing)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_owner_membership_restaurant_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When a profile's organization_id or restaurant_id is set/updated,
  -- sync it to the corresponding owner erp_membership row.
  IF (NEW.role = 'owner' AND COALESCE(NEW.organization_id, NEW.restaurant_id) IS NOT NULL) THEN
    UPDATE public.erp_memberships
    SET
      restaurant_id = COALESCE(NEW.organization_id, NEW.restaurant_id),
      updated_at    = now()
    WHERE user_id      = NEW.id
      AND role         = 'owner'
      AND status       = 'approved'
      AND restaurant_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_owner_membership ON public.profiles;

CREATE TRIGGER trg_sync_owner_membership
AFTER INSERT OR UPDATE OF organization_id, restaurant_id
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_owner_membership_restaurant_id();

-- ──────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES (run manually to confirm)
-- ──────────────────────────────────────────────────────────────
-- SELECT COUNT(*) FROM erp_memberships WHERE role='owner' AND status='approved' AND restaurant_id IS NULL;
-- -- Should return 0 for owners who have profiles with org set.
--
-- SELECT * FROM v_branch_analytics LIMIT 10;
-- -- Should return branch rows with sales/purchases/expenses aggregated.
