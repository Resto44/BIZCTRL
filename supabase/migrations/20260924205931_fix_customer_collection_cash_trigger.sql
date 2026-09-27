-- Fix collection schema compatibility and keep a single cash-posting owner.
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
    -- These tables have different row types. COALESCE does not make a missing
    -- RECORD field safe: extract optional legacy columns through JSON instead.
    v_date := COALESCE((to_jsonb(v_row)->>'payment_date')::date, (to_jsonb(v_row)->>'date')::date);
    v_branch := COALESCE(to_jsonb(v_row)->>'branch_key', to_jsonb(v_row)->>'branch');
    v_created_by := v_row.created_by;
    v_restaurant_id := v_row.restaurant_id;
    v_source_module := 'CustomerPayments';
    v_source_record_id := v_row.id::TEXT;
    v_description := 'Customer Debt Collection';
    v_movement_type := 'customer_debt_collection';
    v_settlement_col := 'customer_debt_collection';
    v_direction := 'in';
    -- Noncash repayments reduce debt but must not increase the cash drawer.
    IF lower(COALESCE(to_jsonb(v_row)->>'payment_method', 'cash')) IN ('cash', 'cash_on_delivery', 'cod') THEN
      v_amount := COALESCE((to_jsonb(v_row)->>'cash_amount')::numeric, (to_jsonb(v_row)->>'amount')::numeric, 0);
    END IF;
    IF TG_OP = 'UPDATE' AND lower(COALESCE(to_jsonb(OLD)->>'payment_method', 'cash')) IN ('cash', 'cash_on_delivery', 'cod') THEN
      v_old_amount := COALESCE((to_jsonb(OLD)->>'cash_amount')::numeric, (to_jsonb(OLD)->>'amount')::numeric, 0);
    END IF;
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

CREATE OR REPLACE FUNCTION public.erp_record_customer_receivable_payment(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_restaurant_id uuid := NULLIF(BTRIM(COALESCE(p_payload ->> 'restaurant_id', '')), '')::uuid;
  v_branch_id uuid := NULLIF(BTRIM(COALESCE(p_payload ->> 'branch_id', '')), '')::uuid;
  v_customer_id uuid := NULLIF(BTRIM(COALESCE(p_payload ->> 'customer_id', '')), '')::uuid;
  v_branch text := NULLIF(BTRIM(COALESCE(p_payload ->> 'branch', '')), '');
  v_request_id uuid := COALESCE(NULLIF(BTRIM(COALESCE(p_payload ->> 'request_id', '')), '')::uuid, gen_random_uuid());
  v_amount numeric := NULLIF(BTRIM(COALESCE(p_payload ->> 'amount', '')), '')::numeric;
  v_date date := COALESCE(NULLIF(p_payload ->> 'date', '')::date, CURRENT_DATE);
  v_method text := lower(COALESCE(NULLIF(BTRIM(p_payload ->> 'payment_method'), ''), 'cash'));
  v_notes text := NULLIF(BTRIM(COALESCE(p_payload ->> 'notes', '')), '');
  v_customer public.customers%ROWTYPE;
  v_debt public.debt_records%ROWTYPE;
  v_payment public.debt_payments%ROWTYPE;
  v_cached jsonb;
  v_total_open numeric := 0;
  v_remaining_to_apply numeric;
  v_applied numeric;
  v_new_paid numeric;
  v_new_remaining numeric;
  v_child_request_id uuid;
  v_existing_wallet_id uuid;
  v_payment_rows jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_AUTH_REQUIRED';
  END IF;
  IF v_restaurant_id IS NULL OR v_branch_id IS NULL OR v_branch IS NULL
     OR v_customer_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'CUSTOMER_DEBT_PAYMENT_INVALID';
  END IF;

  v_method := CASE v_method
    WHEN 'network' THEN 'card'
    WHEN 'pos' THEN 'card'
    WHEN 'online_payment' THEN 'online'
    WHEN 'digital' THEN 'online'
    WHEN 'bank' THEN 'bank_transfer'
    WHEN 'transfer' THEN 'bank_transfer'
    ELSE v_method
  END;
  IF v_method NOT IN ('cash', 'card', 'bank_transfer', 'online', 'wallet') THEN
    RAISE EXCEPTION 'CUSTOMER_DEBT_PAYMENT_METHOD_INVALID';
  END IF;

  SELECT * INTO v_customer
    FROM public.customers
   WHERE id = v_customer_id
     AND restaurant_id = v_restaurant_id
     AND COALESCE(is_active, true) = true
     AND (branch_id IS NULL OR branch_id = v_branch_id OR branch IS NULL OR branch = v_branch)
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALES_CLOSING_CREDIT_CUSTOMER_INVALID';
  END IF;
  IF NOT public.erp_can_write_scope(v_restaurant_id, v_branch_id) THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
  END IF;

  SELECT id INTO v_existing_wallet_id
    FROM public.wallet_transactions
   WHERE settlement_request_id = v_request_id
   LIMIT 1;
  IF FOUND THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(payment) ORDER BY payment.created_date), '[]'::jsonb)
      INTO v_payment_rows
      FROM public.debt_payments AS payment
     WHERE payment.customer_id = v_customer_id
       AND payment.request_id IN (
         SELECT (substr(md5(v_request_id::text || ':' || debt.id::text), 1, 32))::uuid
           FROM public.debt_records AS debt
          WHERE debt.customer_id = v_customer_id
            AND debt.restaurant_id = v_restaurant_id
            AND (debt.branch_id = v_branch_id OR (debt.branch_id IS NULL AND debt.branch = v_branch))
       );
    SELECT public.erp_refresh_customer_receivable_cache(v_customer_id) INTO v_cached;
    RETURN jsonb_build_object(
      'payment', COALESCE(v_payment_rows -> 0, '{}'::jsonb),
      'payments', v_payment_rows,
      'idempotent', true,
      'customer_position', v_cached
    );
  END IF;

  FOR v_debt IN
    SELECT *
      FROM public.debt_records
     WHERE customer_id = v_customer_id
       AND restaurant_id = v_restaurant_id
       AND party_type = 'customer'
       AND type = 'receivable'
       AND (branch_id = v_branch_id OR (branch_id IS NULL AND branch = v_branch))
       AND COALESCE(remaining_amount, 0) > 0
       AND status NOT IN ('paid', 'written_off')
     ORDER BY due_date NULLS LAST, date, created_date, id
     FOR UPDATE
  LOOP
    v_total_open := v_total_open + GREATEST(COALESCE(v_debt.remaining_amount, 0), 0);
  END LOOP;

  IF v_total_open <= 0 THEN
    RAISE EXCEPTION 'CUSTOMER_DEBT_PAYMENT_SETTLED';
  END IF;
  IF v_amount > v_total_open THEN
    RAISE EXCEPTION 'CUSTOMER_DEBT_PAYMENT_EXCEEDS_REMAINING';
  END IF;

  v_remaining_to_apply := v_amount;
  FOR v_debt IN
    SELECT *
      FROM public.debt_records
     WHERE customer_id = v_customer_id
       AND restaurant_id = v_restaurant_id
       AND party_type = 'customer'
       AND type = 'receivable'
       AND (branch_id = v_branch_id OR (branch_id IS NULL AND branch = v_branch))
       AND COALESCE(remaining_amount, 0) > 0
       AND status NOT IN ('paid', 'written_off')
     ORDER BY due_date NULLS LAST, date, created_date, id
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_to_apply <= 0;
    v_applied := LEAST(v_remaining_to_apply, GREATEST(COALESCE(v_debt.remaining_amount, 0), 0));
    v_new_paid := COALESCE(v_debt.paid_amount, 0) + v_applied;
    v_new_remaining := GREATEST(COALESCE(v_debt.total_amount, 0) - v_new_paid, 0);

    UPDATE public.debt_records
       SET paid_amount = v_new_paid,
           remaining_amount = v_new_remaining,
           status = CASE WHEN v_new_remaining = 0 THEN 'paid' ELSE 'partial' END,
           updated_date = now()
     WHERE id = v_debt.id
     RETURNING * INTO v_debt;

    v_child_request_id := (substr(md5(v_request_id::text || ':' || v_debt.id::text), 1, 32))::uuid;
    INSERT INTO public.debt_payments (
      debt_id, customer_id, amount, date, payment_method, notes, party_name,
      party_phone, restaurant_id, branch, branch_id, tenant_id, request_id,
      recorded_by, recorded_by_name, created_by, created_date, updated_date
    ) VALUES (
      v_debt.id, v_customer_id, v_applied, v_date, v_method, v_notes, v_debt.party_name,
      v_debt.party_phone, v_restaurant_id, v_branch, v_branch_id,
      COALESCE(v_debt.tenant_id, v_restaurant_id::text), v_child_request_id,
      auth.uid()::text, auth.uid()::text, auth.uid()::text, now(), now()
    ) RETURNING * INTO v_payment;

    INSERT INTO public.customer_collections (
      debt_id, customer_id, customer_name, amount, date, payment_method, notes,
      branch, branch_id, restaurant_id, tenant_id, request_id, created_by, created_date, updated_date
    ) VALUES (
      v_debt.id, v_customer_id, v_debt.party_name, v_applied, v_date, v_method, v_notes,
      v_branch, v_branch_id, v_restaurant_id, COALESCE(v_debt.tenant_id, v_restaurant_id::text),
      v_child_request_id, auth.uid()::text, now(), now()
    );

    v_payment_rows := v_payment_rows || jsonb_build_array(to_jsonb(v_payment));
    v_remaining_to_apply := v_remaining_to_apply - v_applied;
  END LOOP;

  INSERT INTO public.wallet_transactions (
    transaction_date, transaction_type, direction, wallet, branch, branch_id,
    amount, payment_method, description, reference_id, auto_generated,
    recorded_by, created_by, created_date, updated_date, restaurant_id, tenant_id,
    settlement_request_id, customer_id
  ) VALUES (
    v_date,
    CASE WHEN v_method = 'cash' THEN 'credit_collection_cash' ELSE 'credit_collection_network' END,
    'in', CASE WHEN v_method = 'cash' THEN 'branch_cash' ELSE 'owner_network' END,
    v_branch, v_branch_id, v_amount, v_method, 'Customer debt repayment', v_request_id::text, true,
    auth.uid()::text, auth.uid()::text, now(), now(), v_restaurant_id,
    COALESCE(v_customer.tenant_id, v_restaurant_id::text), v_request_id, v_customer_id
  );

  -- Collection trigger owns cash posting, including the settlement total.
  -- Do not also post the aggregate here: that would count the same money twice.

  SELECT public.erp_refresh_customer_receivable_cache(v_customer_id) INTO v_cached;
  RETURN jsonb_build_object(
    'payment', COALESCE(v_payment_rows -> 0, '{}'::jsonb),
    'payments', v_payment_rows,
    'idempotent', false,
    'customer_position', v_cached
  );
END;
$function$;
