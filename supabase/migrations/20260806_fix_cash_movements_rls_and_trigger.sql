-- 1. Rebuild the cash movement trigger function as SECURITY DEFINER so that
-- trigger-driven inserts into cash_movements execute with elevated privileges
-- and are not blocked by RLS when initiated by Branch Managers.
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
BEGIN
  -- Determine common fields
  IF TG_TABLE_NAME = 'daily_sales' THEN
    v_date := NEW.date;
    v_branch := NEW.branch;
    v_created_by := NEW.created_by;
    v_restaurant_id := NEW.restaurant_id;
    v_source_module := 'Sales';
    v_source_record_id := NEW.id::TEXT;
    v_description := 'Cash Sale';
    v_movement_type := 'cash_sale';
    v_settlement_col := 'cash_sales';
    v_direction := 'in';
    v_amount := COALESCE(NEW.restaurant_cash, 0);
    IF TG_OP = 'UPDATE' THEN v_old_amount := COALESCE(OLD.restaurant_cash, 0); END IF;
  ELSIF TG_TABLE_NAME = 'purchases' THEN
    v_date := NEW.purchase_date;
    v_branch := NEW.branch;
    v_created_by := NEW.created_by;
    v_restaurant_id := NEW.restaurant_id;
    v_source_module := 'Purchases';
    v_source_record_id := NEW.id::TEXT;
    v_description := 'Cash Purchase';
    v_movement_type := 'cash_purchase';
    v_settlement_col := 'cash_purchases';
    v_direction := 'out';
    v_amount := COALESCE(NEW.cash_amount, 0);
    IF TG_OP = 'UPDATE' THEN v_old_amount := COALESCE(OLD.cash_amount, 0); END IF;
  ELSIF TG_TABLE_NAME = 'expenses' THEN
    v_date := NEW.expense_date;
    v_branch := NEW.branch;
    v_created_by := NEW.created_by;
    v_restaurant_id := NEW.restaurant_id;
    v_source_module := 'Expenses';
    v_source_record_id := NEW.id::TEXT;
    v_description := 'Cash Expense';
    v_movement_type := 'cash_expense';
    v_settlement_col := 'cash_expenses';
    v_direction := 'out';
    v_amount := COALESCE(NEW.cash_amount, 0);
    IF TG_OP = 'UPDATE' THEN v_old_amount := COALESCE(OLD.cash_amount, 0); END IF;
  ELSIF TG_TABLE_NAME = 'customer_payments' THEN
    v_date := NEW.payment_date;
    v_branch := NEW.branch;
    v_created_by := NEW.created_by;
    v_restaurant_id := NEW.restaurant_id;
    v_source_module := 'CustomerPayments';
    v_source_record_id := NEW.id::TEXT;
    v_description := 'Customer Debt Collection';
    v_movement_type := 'customer_debt_collection';
    v_settlement_col := 'customer_debt_collection';
    v_direction := 'in';
    v_amount := COALESCE(NEW.cash_amount, 0);
    IF TG_OP = 'UPDATE' THEN v_old_amount := COALESCE(OLD.cash_amount, 0); END IF;
  ELSIF TG_TABLE_NAME = 'supplier_payments' THEN
    v_date := NEW.payment_date;
    v_branch := NEW.branch;
    v_created_by := NEW.created_by;
    v_restaurant_id := NEW.restaurant_id;
    v_source_module := 'SupplierPayments';
    v_source_record_id := NEW.id::TEXT;
    v_description := 'Supplier Payment';
    v_movement_type := 'supplier_payment';
    v_settlement_col := 'supplier_payments';
    v_direction := 'out';
    v_amount := COALESCE(NEW.cash_amount, 0);
    IF TG_OP = 'UPDATE' THEN v_old_amount := COALESCE(OLD.cash_amount, 0); END IF;
  ELSIF TG_TABLE_NAME = 'wallet_transactions' THEN
    v_date := NEW.transaction_date;
    v_branch := NEW.branch;
    v_created_by := NEW.created_by;
    v_restaurant_id := NEW.restaurant_id;
    v_source_module := 'Treasury';
    v_source_record_id := NEW.id::TEXT;
    IF NEW.transaction_type = 'deposit' AND NEW.payment_method = 'Cash' THEN
      v_description := 'Cash Deposit';
      v_movement_type := 'cash_deposit';
      v_settlement_col := 'cash_transfer_in';
      v_direction := 'in';
      v_amount := COALESCE(NEW.amount, 0);
    ELSIF NEW.transaction_type = 'withdrawal' AND NEW.payment_method = 'Cash' THEN
      v_description := 'Cash Withdrawal';
      v_movement_type := 'cash_withdrawal';
      v_settlement_col := 'cash_transfer_out';
      v_direction := 'out';
      v_amount := COALESCE(NEW.amount, 0);
    ELSE
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF OLD.transaction_type = 'deposit' AND OLD.payment_method = 'Cash' THEN
        v_old_amount := COALESCE(OLD.amount, 0);
      ELSIF OLD.transaction_type = 'withdrawal' AND OLD.payment_method = 'Cash' THEN
        v_old_amount := COALESCE(OLD.amount, 0);
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'owner_cash_injections' THEN
    v_date := NEW.date;
    v_branch := NEW.branch;
    v_created_by := NEW.created_by;
    v_restaurant_id := NEW.restaurant_id;
    v_source_module := 'OwnerCashInjection';
    v_source_record_id := NEW.id::TEXT;
    v_description := 'Owner Cash Injection';
    v_movement_type := 'owner_injection';
    v_settlement_col := 'owner_injection';
    v_direction := 'in';
    v_amount := COALESCE(NEW.amount, 0);
    IF TG_OP = 'UPDATE' THEN v_old_amount := COALESCE(OLD.amount, 0); END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF v_amount = 0 AND v_old_amount = 0 THEN
    RETURN NEW;
  END IF;

  v_settlement_id := public.get_or_create_settlement(v_date, v_branch, v_created_by, v_restaurant_id);

  IF TG_OP = 'UPDATE' AND v_old_amount > 0 THEN
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

      EXECUTE FORMAT('UPDATE public.daily_cash_settlements SET %I = %I - %L WHERE id = %L',
        v_settlement_col, v_settlement_col, v_old_amount, v_settlement_id);
      PERFORM public.recompute_settlement(v_settlement_id);
    END IF;
  END IF;

  IF v_amount > 0 THEN
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

  IF TG_OP = 'DELETE' THEN
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

      EXECUTE FORMAT('UPDATE public.daily_cash_settlements SET %I = %I - %L WHERE id = %L',
        v_settlement_col, v_settlement_col, v_old_amount, v_settlement_id);
      PERFORM public.recompute_settlement(v_settlement_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Ensure cash_movements RLS policies use erp_can_write_scope_text and support Branch Managers correctly.
DROP POLICY IF EXISTS "erp_scope_insert" ON public.cash_movements;
CREATE POLICY "erp_scope_insert" ON public.cash_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.erp_can_write_scope_text(restaurant_id::text, branch)
  );

DROP POLICY IF EXISTS "erp_scope_update" ON public.cash_movements;
CREATE POLICY "erp_scope_update" ON public.cash_movements
  FOR UPDATE TO authenticated
  USING (
    public.erp_can_write_scope_text(restaurant_id::text, branch)
  )
  WITH CHECK (
    public.erp_can_write_scope_text(restaurant_id::text, branch)
  );
