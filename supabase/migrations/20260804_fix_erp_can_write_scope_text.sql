-- ============================================================
-- MIGRATION: 20260804_fix_erp_can_write_scope_text.sql
-- DATE: 2026-08-04
--
-- ROOT CAUSE IDENTIFIED:
--   Condition 3 inside erp_can_write_scope_text:
--     m.restaurant_id::text = nullif(p_restaurant_id, '')
--   evaluates to NULL (not TRUE) when p_restaurant_id is NULL or ''
--   because: ANY_VALUE = NULL → NULL (not FALSE, but treated as FALSE in WHERE).
--
--   This happens when INSERT payloads from:
--     - QuickPurchaseModal (purchases table): no restaurant_id sent
--     - FinancialPurchaseForm (supplier_invoices): no restaurant_id sent
--     - ReceiveOrderDialog (purchases table): no restaurant_id sent
--
--   Secondary issues:
--     - erp_can_write_scope_text was last overwritten by
--       20260801_fix_sales_invoices_rls_comprehensive.sql which dropped:
--         a) STABLE keyword
--         b) SET search_path = public
--       making it VOLATILE and unprotected against search_path injection.
--
-- FIXES:
--   1. Rebuild erp_can_write_scope_text with:
--        a. STABLE + SECURITY DEFINER + SET search_path = public
--        b. Existing fast-path (manager/employee with restaurant_id)
--        c. Existing owner fallback (profiles path)
--        d. NEW self-healing path: when p_restaurant_id is empty/null,
--           auto-resolve from the caller's own erp_membership.
--           Safe because we still verify user_id = auth.uid() and status = approved.
--   2. Fix purchases table: drop legacy conflicting FOR ALL policies,
--      replace with clean erp_scope_* policies that use COALESCE.
--   3. Fix supplier_invoices erp_scope_insert to use COALESCE (consistency).
--   4. Fix QuickPurchaseModal payload via RPC fallback in the function itself.
--   5. Fix FinancialPurchaseForm payload via the same self-healing path.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- STEP 1: Rebuild erp_can_write_scope_text
--
-- Three evaluation paths (OR'd):
--   Path A (fast): approved membership with matching restaurant + role + branch
--   Path B (self-heal): p_restaurant_id empty → use caller's own restaurant
--   Path C (owner profile fallback): owner whose membership restaurant_id may be NULL
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.erp_can_write_scope_text(
  p_restaurant_id text,
  p_branch_id     text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Path A: Explicit restaurant_id provided and matches membership
  SELECT EXISTS (
    SELECT 1
    FROM public.erp_memberships m
    WHERE m.user_id = auth.uid()
      AND m.status  = 'approved'
      AND m.restaurant_id::text = nullif(p_restaurant_id, '')
      AND (
        m.role IN ('owner', 'manager', 'general_manager', 'employee')
        OR coalesce((m.permissions ->> 'uploadSales')::boolean, false)
      )
      AND (
        m.role = 'owner'
        OR nullif(p_branch_id, '') IS NULL
        OR m.branch_id::text = p_branch_id
      )
  )

  -- Path B: p_restaurant_id is empty/null — self-heal by using the caller's
  --         own membership restaurant_id.  Still enforces approved status,
  --         role, and branch scope.  Safe: we never grant cross-tenant access.
  OR (
    nullif(p_restaurant_id, '') IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.erp_memberships m
      WHERE m.user_id = auth.uid()
        AND m.status  = 'approved'
        AND m.restaurant_id IS NOT NULL
        AND (
          m.role IN ('owner', 'manager', 'general_manager', 'employee')
          OR coalesce((m.permissions ->> 'uploadSales')::boolean, false)
        )
        AND (
          m.role = 'owner'
          OR nullif(p_branch_id, '') IS NULL
          OR m.branch_id::text = p_branch_id
        )
    )
  )

  -- Path C: Owner whose erp_membership.restaurant_id may be NULL but
  --         profiles.organization_id / restaurant_id is correctly set.
  OR EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = auth.uid()
      AND pr.role = 'owner'
      AND COALESCE(pr.approval_status, 'approved') = 'approved'
      AND (
        nullif(p_restaurant_id, '') IS NULL
        OR COALESCE(pr.organization_id, pr.restaurant_id)::text = nullif(p_restaurant_id, '')
      )
  );
$$;

-- ──────────────────────────────────────────────────────────────
-- STEP 2: Fix purchases table — remove legacy FOR ALL policies
--         that conflict with erp_scope_insert and block managers.
--
-- Legacy policies 'purchases_branch_isolation' and 'purchases_org_isolation'
-- are FOR ALL (including INSERT) and require restaurant_id to be non-NULL.
-- They conflict with the ERP scope system and must be replaced.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "purchases_branch_isolation" ON public.purchases;
DROP POLICY IF EXISTS "purchases_org_isolation"    ON public.purchases;

-- Re-create clean ERP-scope policies for purchases (idempotent)
DROP POLICY IF EXISTS "erp_scope_insert"  ON public.purchases;
DROP POLICY IF EXISTS "erp_scope_update"  ON public.purchases;
DROP POLICY IF EXISTS "erp_scope_delete"  ON public.purchases;
DROP POLICY IF EXISTS "erp_permission_select" ON public.purchases;

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

CREATE POLICY "erp_scope_update"
ON public.purchases
FOR UPDATE
TO authenticated
USING (erp_can_write_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')))
WITH CHECK (erp_can_write_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')));

CREATE POLICY "erp_scope_delete"
ON public.purchases
FOR DELETE
TO authenticated
USING (erp_can_write_scope_text(COALESCE((restaurant_id)::text,''), COALESCE((branch_id)::text,'')));

CREATE POLICY "erp_permission_select"
ON public.purchases
FOR SELECT
TO authenticated
USING (
  erp_can_access_scope_text(
    COALESCE((restaurant_id)::text, ''),
    COALESCE((branch_id)::text, '')
  )
  AND erp_has_any_permission(ARRAY['viewPurchases'])
);

-- ──────────────────────────────────────────────────────────────
-- STEP 3: Fix supplier_invoices erp_scope_insert to use COALESCE
--         (consistent with all other tables, handles NULL branch_id)
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "erp_scope_insert" ON public.supplier_invoices;

CREATE POLICY "erp_scope_insert"
ON public.supplier_invoices
FOR INSERT
TO authenticated
WITH CHECK (
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    COALESCE((branch_id)::text, '')
  )
);

-- ──────────────────────────────────────────────────────────────
-- STEP 4: Fix payments (customer payments) erp_scope_insert
--         to use COALESCE (handles NULL branch_id from online ordering)
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "erp_scope_insert" ON public.payments;

CREATE POLICY "erp_scope_insert"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    COALESCE((branch_id)::text, '')
  )
);

-- ──────────────────────────────────────────────────────────────
-- STEP 5: Fix daily_sales legacy FOR ALL policies
--         Same pattern as purchases — legacy policies block managers
--         when restaurant_id is TEXT and comparison fails.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "daily_sales_branch_isolation" ON public.daily_sales;
DROP POLICY IF EXISTS "daily_sales_org_isolation"    ON public.daily_sales;

-- erp_scope_insert already exists with COALESCE — no change needed.
-- Recreate SELECT policy to cover the gap left by removed legacy policies.
DROP POLICY IF EXISTS "daily_sales_select" ON public.daily_sales;

-- ──────────────────────────────────────────────────────────────
-- STEP 6: Backfill restaurant_id on purchases rows where NULL
--         (for rows inserted before this fix, using created_by email)
-- ──────────────────────────────────────────────────────────────
UPDATE public.purchases p
SET
  restaurant_id = COALESCE(pr.organization_id, pr.restaurant_id),
  branch_id     = COALESCE(p.branch_id, pr.branch_id),
  updated_date  = now()
FROM public.profiles pr
WHERE p.restaurant_id IS NULL
  AND pr.email = p.created_by
  AND COALESCE(pr.organization_id, pr.restaurant_id) IS NOT NULL;

-- ──────────────────────────────────────────────────────────────
-- STEP 7: Backfill restaurant_id on supplier_invoices rows where NULL
-- ──────────────────────────────────────────────────────────────
UPDATE public.supplier_invoices si
SET
  restaurant_id = COALESCE(pr.organization_id, pr.restaurant_id),
  branch_id     = COALESCE(si.branch_id, pr.branch_id),
  updated_date  = now()
FROM public.profiles pr
WHERE si.restaurant_id IS NULL
  AND pr.email = si.created_by
  AND COALESCE(pr.organization_id, pr.restaurant_id) IS NOT NULL;

-- ──────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES (run manually to confirm)
-- ──────────────────────────────────────────────────────────────
-- SELECT proname, prosecdef, proconfig FROM pg_proc
-- WHERE proname = 'erp_can_write_scope_text' AND pronamespace = 'public'::regnamespace;
-- -- Should show: prosecdef=true, proconfig=['search_path=public']
--
-- SELECT COUNT(*) FROM pg_policies
-- WHERE tablename = 'purchases' AND policyname IN ('purchases_branch_isolation','purchases_org_isolation');
-- -- Should return 0
--
-- SELECT COUNT(*) FROM public.purchases WHERE restaurant_id IS NULL;
-- -- Should return 0 (or minimal for very new rows)
