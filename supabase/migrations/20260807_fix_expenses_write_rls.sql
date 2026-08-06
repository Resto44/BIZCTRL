-- ============================================================
-- MIGRATION: 20260807_fix_expenses_write_rls.sql
-- DATE: 2026-08-07
--
-- ROOT CAUSE (two compounding issues):
--
-- 1. TRIGGER BUG (primary blocker):
--    The trigger function trg_auto_cash_movement_and_recalculate()
--    was updated in 20260806 to reference NEW.expense_date, NEW.branch,
--    and NEW.cash_amount for the 'expenses' table. However, the actual
--    expenses table columns are: date, branch_key, amount.
--    This caused EVERY INSERT/UPDATE/DELETE on expenses to fail with:
--      ERROR: record "new" has no field "expense_date"
--
-- 2. RLS POLICY BUG (secondary blocker):
--    The INSERT/UPDATE/DELETE policies called:
--      erp_can_write_scope_text(restaurant_id, branch_id)
--    The expenses table stores branch identity as branch_key (TEXT),
--    not branch_id (UUID). The branch_id column was always NULL.
--    Since erp_can_write_scope_text (as of 20260805) requires a non-null
--    branch_id for non-owner roles, ALL manager write operations returned
--    false → RLS blocked every write.
--    Additionally, legacy FOR ALL policies (expenses_org_isolation,
--    expenses_branch_isolation) conflicted with the ERP scope policies.
--
-- FIX:
--   1. Fix the trigger function to use correct column names for expenses.
--   2. Drop conflicting legacy policies.
--   3. Replace write policies to resolve branch_id from branch_key via
--      a subquery lookup against the branches table.
--   4. Backfill existing expenses.branch_id from branches table.
--   5. Add a BEFORE INSERT/UPDATE trigger to auto-resolve branch_id
--      from branch_key going forward.
-- ============================================================

-- ── STEP 1: Fix trigger function (correct expenses column names) ─────────────
CREATE OR REPLACE FUNCTION public.trg_auto_cash_movement_and_recalculate()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_settlement_id UUID;
  v_created_by    TEXT;
  v_restaurant_id UUID;
  v_source_module TEXT;
  v_source_record_id TEXT;
  v_description   TEXT;
  v_movement_type TEXT;
  v_settlement_col TEXT;
  v_direction     TEXT;
  v_amount        NUMERIC DEFAULT 0;
  v_branch        TEXT;
  v_date          DATE;
  v_old_amount    NUMERIC DEFAULT 0;
  v_old_movement_id UUID;
  v_row           RECORD;
BEGIN
  -- For DELETE, use OLD; for INSERT/UPDATE, use NEW
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  IF TG_TABLE_NAME = 'daily_sales' THEN
    v_date := v_row.date;
    v_branch := v_row.branch;
    v_created_by := v_row.created_by;
    v_restaurant_id := v_row.restaurant_id;
    v_source_module := 'Sales';
    v_source_record_id := v_row.id::TEXT;
    v_description := 'Cash Sale';
    v_movement_type := 'cash_sale';
    v_settlement_col := 'cash_sales';
    v_direction := 'in';
    v_amount := COALESCE(v_row.restaurant_cash, 0);
    IF TG_OP = 'UPDATE' THEN v_old_amount := COALESCE(OLD.restaurant_cash, 0); END IF;
    IF TG_OP = 'DELETE' THEN v_old_amount := v_amount; v_amount := 0; END IF;

  ELSIF TG_TABLE_NAME = 'purchases' THEN
    -- purchases may use purchase_date or date; branch_key or branch; cash_amount or amount
    v_date := COALESCE(v_row.purchase_date, v_row.date);
    v_branch := COALESCE(v_row.branch_key, v_row.branch);
    v_created_by := v_row.created_by;
    v_restaurant_id := v_row.restaurant_id;
    v_source_module := 'Purchases';
    v_source_record_id := v_row.id::TEXT;
    v_description := 'Cash Purchase';
    v_movement_type := 'cash_purchase';
    v_settlement_col := 'cash_purchases';
    v_direction := 'out';
    v_amount := COALESCE(v_row.cash_amount, v_row.amount, 0);
    IF TG_OP = 'UPDATE' THEN v_old_amount := COALESCE(OLD.cash_amount, OLD.amount, 0); END IF;
    IF TG_OP = 'DELETE' THEN v_old_amount := v_amount; v_amount := 0; END IF;

  ELSIF TG_TABLE_NAME = 'expenses' THEN
    -- expenses uses: date (NOT expense_date), branch_key (NOT branch), amount (NOT cash_amount)
    v_date := v_row.date;
    v_branch := v_row.branch_key;
    v_created_by := v_row.created_by;
    v_restaurant_id := v_row.restaurant_id;
    v_source_module := 'Expenses';
    v_source_record_id := v_row.id::TEXT;
    v_description := 'Cash Expense';
    v_movement_type := 'cash_expense';
    v_settlement_col := 'cash_expenses';
    v_direction := 'out';
    v_amount := COALESCE(v_row.amount, 0);
    IF TG_OP = 'UPDATE' THEN v_old_amount := COALESCE(OLD.amount, 0); END IF;
    IF TG_OP = 'DELETE' THEN v_old_amount := v_amount; v_amount := 0; END IF;

  ELSIF TG_TABLE_NAME IN ('customer_payments', 'customer_collections') THEN
    v_date := COALESCE(v_row.payment_date, v_row.date);
    v_branch := COALESCE(v_row.branch_key, v_row.branch);
    v_created_by := v_row.created_by;
    v_restaurant_id := v_row.restaurant_id;
    v_source_module := 'CustomerPayments';
    v_source_record_id := v_row.id::TEXT;
    v_description := 'Customer Debt Collection';
    v_movement_type := 'customer_debt_collection';
    v_settlement_col := 'customer_debt_collection';
    v_direction := 'in';
    v_amount := COALESCE(v_row.cash_amount, v_row.amount, 0);
    IF TG_OP = 'UPDATE' THEN v_old_amount := COALESCE(OLD.cash_amount, OLD.amount, 0); END IF;
    IF TG_OP = 'DELETE' THEN v_old_amount := v_amount; v_amount := 0; END IF;

  ELSIF TG_TABLE_NAME = 'supplier_payments' THEN
    v_date := COALESCE(v_row.payment_date, v_row.date);
    v_branch := COALESCE(v_row.branch_key, v_row.branch);
    v_created_by := v_row.created_by;
    v_restaurant_id := v_row.restaurant_id;
    v_source_module := 'SupplierPayments';
    v_source_record_id := v_row.id::TEXT;
    v_description := 'Supplier Payment';
    v_movement_type := 'supplier_payment';
    v_settlement_col := 'supplier_payments';
    v_direction := 'out';
    v_amount := COALESCE(v_row.cash_amount, v_row.amount, 0);
    IF TG_OP = 'UPDATE' THEN v_old_amount := COALESCE(OLD.cash_amount, OLD.amount, 0); END IF;
    IF TG_OP = 'DELETE' THEN v_old_amount := v_amount; v_amount := 0; END IF;

  ELSIF TG_TABLE_NAME = 'wallet_transactions' THEN
    v_date := v_row.transaction_date;
    v_branch := COALESCE(v_row.branch_key, v_row.branch);
    v_created_by := v_row.created_by;
    v_restaurant_id := v_row.restaurant_id;
    v_source_module := 'Treasury';
    v_source_record_id := v_row.id::TEXT;
    IF v_row.transaction_type = 'deposit' AND v_row.payment_method = 'Cash' THEN
      v_description := 'Cash Deposit';
      v_movement_type := 'cash_deposit';
      v_settlement_col := 'cash_transfer_in';
      v_direction := 'in';
      v_amount := COALESCE(v_row.amount, 0);
    ELSIF v_row.transaction_type = 'withdrawal' AND v_row.payment_method = 'Cash' THEN
      v_description := 'Cash Withdrawal';
      v_movement_type := 'cash_withdrawal';
      v_settlement_col := 'cash_transfer_out';
      v_direction := 'out';
      v_amount := COALESCE(v_row.amount, 0);
    ELSE
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF OLD.transaction_type = 'deposit' AND OLD.payment_method = 'Cash' THEN
        v_old_amount := COALESCE(OLD.amount, 0);
      ELSIF OLD.transaction_type = 'withdrawal' AND OLD.payment_method = 'Cash' THEN
        v_old_amount := COALESCE(OLD.amount, 0);
      END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN v_old_amount := v_amount; v_amount := 0; END IF;

  ELSIF TG_TABLE_NAME = 'owner_cash_injections' THEN
    v_date := v_row.date;
    v_branch := COALESCE(v_row.branch_key, v_row.branch);
    v_created_by := v_row.created_by;
    v_restaurant_id := v_row.restaurant_id;
    v_source_module := 'OwnerCashInjection';
    v_source_record_id := v_row.id::TEXT;
    v_description := 'Owner Cash Injection';
    v_movement_type := 'owner_injection';
    v_settlement_col := 'owner_injection';
    v_direction := 'in';
    v_amount := COALESCE(v_row.amount, 0);
    IF TG_OP = 'UPDATE' THEN v_old_amount := COALESCE(OLD.amount, 0); END IF;
    IF TG_OP = 'DELETE' THEN v_old_amount := v_amount; v_amount := 0; END IF;

  ELSE
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF v_amount = 0 AND v_old_amount = 0 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  v_settlement_id := public.get_or_create_settlement(v_date, v_branch, v_created_by, v_restaurant_id);

  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') AND v_old_amount > 0 THEN
    SELECT id INTO v_old_movement_id
    FROM public.cash_movements
    WHERE source_module = v_source_module
      AND source_record_id = OLD.id::TEXT
      AND movement_type = v_movement_type
      AND is_reversed = FALSE
    ORDER BY posted_at DESC LIMIT 1;

    IF FOUND THEN
      UPDATE public.cash_movements SET is_reversed = TRUE, updated_date = NOW()
      WHERE id = v_old_movement_id;

      EXECUTE FORMAT('UPDATE public.daily_cash_settlements SET %I = GREATEST(%I - %L, 0) WHERE id = %L',
        v_settlement_col, v_settlement_col, v_old_amount, v_settlement_id);
      PERFORM public.recompute_settlement(v_settlement_id);
    END IF;
  END IF;

  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND v_amount > 0 THEN
    INSERT INTO public.cash_movements (
      date, branch, restaurant_id, created_by, direction, amount, movement_type,
      source_module, source_record_id, description, posted_by, posted_by_name, settlement_id
    ) VALUES (
      v_date, v_branch, v_restaurant_id, v_created_by, v_direction, v_amount, v_movement_type,
      v_source_module, v_source_record_id, v_description, v_created_by, v_created_by, v_settlement_id
    );

    EXECUTE FORMAT('UPDATE public.daily_cash_settlements SET %I = %I + %L WHERE id = %L',
      v_settlement_col, v_settlement_col, v_amount, v_settlement_id);
    PERFORM public.recompute_settlement(v_settlement_id);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- ── STEP 2: Drop conflicting legacy FOR ALL policies ─────────────────────────
DROP POLICY IF EXISTS "expenses_org_isolation"    ON public.expenses;
DROP POLICY IF EXISTS "expenses_branch_isolation" ON public.expenses;
DROP POLICY IF EXISTS "erp_scope_insert"          ON public.expenses;
DROP POLICY IF EXISTS "erp_scope_update"          ON public.expenses;
DROP POLICY IF EXISTS "erp_scope_delete"          ON public.expenses;
DROP POLICY IF EXISTS "Expenses: owner delete all"     ON public.expenses;
DROP POLICY IF EXISTS "Expenses: manager delete branch" ON public.expenses;

-- ── STEP 3: Backfill branch_id from branches table ───────────────────────────
UPDATE public.expenses e
SET branch_id = b.id
FROM public.branches b
WHERE e.branch_id IS NULL
  AND e.restaurant_id = b.restaurant_id
  AND e.branch_key = b.branch_key;

-- ── STEP 4: INSERT policy ─────────────────────────────────────────────────────
-- Owner path: passes with NULL branch_id (erp_can_write_scope_text owner branch)
-- Manager path: resolves branch_id from branch_key via subquery
CREATE POLICY "erp_scope_insert"
ON public.expenses
FOR INSERT
TO authenticated
WITH CHECK (
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    NULL
  )
  OR
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    COALESCE(
      (SELECT b.id::text FROM public.branches b
       WHERE b.restaurant_id = expenses.restaurant_id
         AND b.branch_key = expenses.branch_key
       LIMIT 1),
      ''
    )
  )
);

-- ── STEP 5: UPDATE policy ─────────────────────────────────────────────────────
CREATE POLICY "erp_scope_update"
ON public.expenses
FOR UPDATE
TO authenticated
USING (
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    NULL
  )
  OR
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    COALESCE(
      (SELECT b.id::text FROM public.branches b
       WHERE b.restaurant_id = expenses.restaurant_id
         AND b.branch_key = expenses.branch_key
       LIMIT 1),
      ''
    )
  )
)
WITH CHECK (
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    NULL
  )
  OR
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    COALESCE(
      (SELECT b.id::text FROM public.branches b
       WHERE b.restaurant_id = expenses.restaurant_id
         AND b.branch_key = expenses.branch_key
       LIMIT 1),
      ''
    )
  )
);

-- ── STEP 6: DELETE policy ─────────────────────────────────────────────────────
CREATE POLICY "erp_scope_delete"
ON public.expenses
FOR DELETE
TO authenticated
USING (
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    NULL
  )
  OR
  erp_can_write_scope_text(
    COALESCE((restaurant_id)::text, ''),
    COALESCE(
      (SELECT b.id::text FROM public.branches b
       WHERE b.restaurant_id = expenses.restaurant_id
         AND b.branch_key = expenses.branch_key
       LIMIT 1),
      ''
    )
  )
);

-- ── STEP 7: Auto-resolve branch_id trigger ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_expenses_resolve_branch_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.branch_id IS NULL AND NEW.branch_key IS NOT NULL AND NEW.restaurant_id IS NOT NULL THEN
    SELECT id INTO NEW.branch_id
    FROM public.branches
    WHERE restaurant_id = NEW.restaurant_id
      AND branch_key = NEW.branch_key
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_resolve_branch_id ON public.expenses;

CREATE TRIGGER trg_expenses_resolve_branch_id
BEFORE INSERT OR UPDATE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.trg_expenses_resolve_branch_id();

-- ── STEP 8: Ensure table-level grants ────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
