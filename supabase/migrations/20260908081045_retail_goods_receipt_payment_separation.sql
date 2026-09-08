CREATE OR REPLACE FUNCTION public.trg_auto_cash_movement_and_recalculate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Determine common fields per table
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
    -- Goods received is a physical inventory event. Payment is posted separately.
    IF nullif(to_jsonb(v_row)->>'inventory_receipt_line_id','') IS NOT NULL THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
    -- Compatible with both purchase schema variants.
    v_date := COALESCE((to_jsonb(v_row)->>'purchase_date')::date, v_row.date);
    v_branch := COALESCE(to_jsonb(v_row)->>'branch_key', v_row.branch);
    v_created_by := v_row.created_by;
    v_restaurant_id := v_row.restaurant_id;
    v_source_module := 'Purchases';
    v_source_record_id := v_row.id::TEXT;
    v_description := 'Cash Purchase';
    v_movement_type := 'cash_purchase';
    v_settlement_col := 'cash_purchases';
    v_direction := 'out';
    v_amount := COALESCE((to_jsonb(v_row)->>'cash_amount')::numeric, (to_jsonb(v_row)->>'amount')::numeric, 0);
    IF TG_OP = 'UPDATE' THEN v_old_amount := COALESCE((to_jsonb(OLD)->>'cash_amount')::numeric, (to_jsonb(OLD)->>'amount')::numeric, 0); END IF;
    IF TG_OP = 'DELETE' THEN v_old_amount := v_amount; v_amount := 0; END IF;

  ELSIF TG_TABLE_NAME = 'expenses' THEN
    -- expenses uses: date (not expense_date), branch_key (not branch), amount (not cash_amount)
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
    v_branch := v_row.branch;
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
$function$;

