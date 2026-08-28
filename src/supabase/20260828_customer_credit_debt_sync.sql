-- Customer Credit / Debts & Receivables synchronization hardening.
-- This migration is forward-only and non-destructive: it does not delete, merge,
-- or reassign any existing customer, receivable, or payment record.
BEGIN;

-- Customer Master is the canonical identity and branch assignment. A customer
-- receivable may be read or written only in that customer's restaurant + branch.
CREATE OR REPLACE FUNCTION public.erp_customer_matches_receivable_scope(
  p_customer_id uuid,
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_branch text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.customers AS customer
     WHERE customer.id = p_customer_id
       AND customer.restaurant_id = p_restaurant_id
       AND COALESCE(customer.is_active, true) = true
       AND (
         customer.branch_id = p_branch_id
         OR (p_branch_id IS NULL AND customer.branch = p_branch)
       )
  );
$$;

-- Customer Master cache values remain compatibility fields. Rebuild them only
-- from the same canonical customer ID in its own restaurant and branch.
CREATE OR REPLACE FUNCTION public.erp_refresh_customer_receivable_cache(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer public.customers%ROWTYPE;
  v_total_credit numeric := 0;
  v_total_collected numeric := 0;
  v_outstanding numeric := 0;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_customer
    FROM public.customers
   WHERE id = p_customer_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(SUM(GREATEST(COALESCE(total_amount, 0), 0)) FILTER (WHERE status IS DISTINCT FROM 'written_off'), 0),
    COALESCE(SUM(GREATEST(COALESCE(paid_amount, 0), 0)) FILTER (WHERE status IS DISTINCT FROM 'written_off'), 0),
    COALESCE(SUM(GREATEST(COALESCE(remaining_amount, 0), 0)) FILTER (WHERE status IS DISTINCT FROM 'written_off'), 0)
    INTO v_total_credit, v_total_collected, v_outstanding
    FROM public.debt_records
   WHERE customer_id = p_customer_id
     AND restaurant_id = v_customer.restaurant_id
     AND party_type = 'customer'
     AND type = 'receivable'
     AND (
       branch_id = v_customer.branch_id
       OR (branch_id IS NULL AND branch = v_customer.branch)
     );

  UPDATE public.customers
     SET total_credit_sales = v_total_credit,
         total_collected = v_total_collected,
         outstanding_balance = v_outstanding,
         last_transaction_date = CASE WHEN v_total_credit > 0 THEN CURRENT_DATE ELSE last_transaction_date END,
         updated_date = now()
   WHERE id = p_customer_id
   RETURNING * INTO v_customer;

  RETURN jsonb_build_object(
    'customer_id', v_customer.id,
    'total_credit_sales', v_total_credit,
    'total_collected', v_total_collected,
    'outstanding_balance', v_outstanding,
    'credit_limit', GREATEST(COALESCE(v_customer.credit_limit, 0), 0),
    'available_credit', GREATEST(COALESCE(v_customer.credit_limit, 0) - v_outstanding, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_create_customer_receivable(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid := NULLIF(BTRIM(COALESCE(p_payload ->> 'customer_id', '')), '')::uuid;
  v_restaurant_id uuid := NULLIF(BTRIM(COALESCE(p_payload ->> 'restaurant_id', '')), '')::uuid;
  v_branch_id uuid := NULLIF(BTRIM(COALESCE(p_payload ->> 'branch_id', '')), '')::uuid;
  v_branch text := NULLIF(BTRIM(COALESCE(p_payload ->> 'branch', '')), '');
  v_total numeric := GREATEST(COALESCE(NULLIF(p_payload ->> 'total_amount', '')::numeric, 0), 0);
  v_paid numeric := GREATEST(COALESCE(NULLIF(p_payload ->> 'paid_amount', '')::numeric, 0), 0);
  v_date date := COALESCE(NULLIF(p_payload ->> 'date', '')::date, CURRENT_DATE);
  v_customer public.customers%ROWTYPE;
  v_debt public.debt_records%ROWTYPE;
  v_outstanding numeric := 0;
  v_remaining numeric;
  v_limit numeric;
  v_request_id uuid := COALESCE(NULLIF(BTRIM(COALESCE(p_payload ->> 'request_id', '')), '')::uuid, gen_random_uuid());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_AUTH_REQUIRED';
  END IF;
  IF v_customer_id IS NULL OR v_restaurant_id IS NULL OR v_branch_id IS NULL OR v_branch IS NULL OR v_total <= 0 OR v_paid > v_total THEN
    RAISE EXCEPTION 'CUSTOMER_RECEIVABLE_INVALID';
  END IF;

  SELECT * INTO v_customer
    FROM public.customers
   WHERE id = v_customer_id
     AND restaurant_id = v_restaurant_id
     AND COALESCE(is_active, true) = true
     AND (
       branch_id = v_branch_id
       OR (branch_id IS NULL AND branch = v_branch)
     )
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALES_CLOSING_CREDIT_CUSTOMER_SCOPE_INVALID';
  END IF;
  IF NOT public.erp_can_write_scope(v_restaurant_id, v_branch_id) THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
  END IF;

  SELECT COALESCE(SUM(GREATEST(COALESCE(remaining_amount, 0), 0)) FILTER (WHERE status IS DISTINCT FROM 'written_off'), 0)
    INTO v_outstanding
    FROM public.debt_records
   WHERE customer_id = v_customer_id
     AND restaurant_id = v_restaurant_id
     AND party_type = 'customer'
     AND type = 'receivable'
     AND (
       branch_id = v_branch_id
       OR (branch_id IS NULL AND branch = v_branch)
     );
  v_remaining := v_total - v_paid;
  v_limit := GREATEST(COALESCE(v_customer.credit_limit, 0), 0);
  IF v_remaining > GREATEST(v_limit - v_outstanding, 0) THEN
    RAISE EXCEPTION 'SALES_CLOSING_CREDIT_LIMIT_EXCEEDED';
  END IF;

  INSERT INTO public.debt_records (
    restaurant_id, tenant_id, branch, branch_id, type, party_type, party_name,
    party_phone, customer_id, settlement_request_id, invoice_number, date, due_date,
    total_amount, paid_amount, remaining_amount, status, description, notes,
    created_by, created_date, updated_date
  ) VALUES (
    v_restaurant_id, COALESCE(v_customer.tenant_id, v_restaurant_id::text),
    v_branch, v_branch_id, 'receivable', 'customer', v_customer.name, v_customer.phone,
    v_customer.id, v_request_id, NULLIF(BTRIM(COALESCE(p_payload ->> 'invoice_number', '')), ''),
    v_date, NULLIF(p_payload ->> 'due_date', '')::date, v_total, v_paid, v_remaining,
    CASE WHEN v_remaining = 0 THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'open' END,
    NULLIF(BTRIM(COALESCE(p_payload ->> 'description', 'Manual customer credit sale')), ''),
    NULLIF(BTRIM(COALESCE(p_payload ->> 'notes', '')), ''), auth.uid()::text, now(), now()
  )
  ON CONFLICT (settlement_request_id) WHERE settlement_request_id IS NOT NULL
  DO NOTHING
  RETURNING * INTO v_debt;

  IF NOT FOUND THEN
    SELECT * INTO v_debt FROM public.debt_records WHERE settlement_request_id = v_request_id LIMIT 1;
    RETURN jsonb_build_object('debt', to_jsonb(v_debt), 'idempotent', true, 'customer_position', public.erp_refresh_customer_receivable_cache(v_customer_id));
  END IF;

  RETURN jsonb_build_object('debt', to_jsonb(v_debt), 'idempotent', false, 'customer_position', public.erp_refresh_customer_receivable_cache(v_customer_id));
END;
$$;

-- Keep repayment behavior transactional and idempotent, but refuse any legacy
-- receivable whose canonical customer no longer matches its stored scope.
CREATE OR REPLACE FUNCTION public.erp_record_customer_debt_payment(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_debt_id uuid := NULLIF(BTRIM(COALESCE(p_payload ->> 'debt_id', '')), '')::uuid;
  v_request_id uuid := COALESCE(NULLIF(BTRIM(COALESCE(p_payload ->> 'request_id', '')), '')::uuid, gen_random_uuid());
  v_amount numeric := GREATEST(COALESCE(NULLIF(p_payload ->> 'amount', '')::numeric, 0), 0);
  v_date date := COALESCE(NULLIF(p_payload ->> 'date', '')::date, CURRENT_DATE);
  v_method text := lower(COALESCE(NULLIF(BTRIM(p_payload ->> 'payment_method'), ''), 'cash'));
  v_notes text := NULLIF(BTRIM(COALESCE(p_payload ->> 'notes', '')), '');
  v_debt public.debt_records%ROWTYPE;
  v_payment public.debt_payments%ROWTYPE;
  v_new_paid numeric;
  v_new_remaining numeric;
  v_customer_cache jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_AUTH_REQUIRED';
  END IF;
  IF v_debt_id IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'CUSTOMER_DEBT_PAYMENT_INVALID';
  END IF;

  SELECT * INTO v_payment FROM public.debt_payments WHERE request_id = v_request_id LIMIT 1;
  IF FOUND THEN
    SELECT public.erp_refresh_customer_receivable_cache(v_payment.customer_id) INTO v_customer_cache;
    RETURN jsonb_build_object('payment', to_jsonb(v_payment), 'idempotent', true, 'customer_position', v_customer_cache);
  END IF;

  SELECT * INTO v_debt
    FROM public.debt_records
   WHERE id = v_debt_id
     AND party_type = 'customer'
     AND type = 'receivable'
   FOR UPDATE;
  IF NOT FOUND OR v_debt.customer_id IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_DEBT_PAYMENT_INVALID';
  END IF;
  IF NOT public.erp_customer_matches_receivable_scope(v_debt.customer_id, v_debt.restaurant_id, v_debt.branch_id, v_debt.branch) THEN
    RAISE EXCEPTION 'SALES_CLOSING_CREDIT_CUSTOMER_SCOPE_INVALID';
  END IF;
  IF NOT public.erp_can_write_scope(v_debt.restaurant_id, v_debt.branch_id) THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
  END IF;
  IF v_debt.status IN ('paid', 'written_off') OR COALESCE(v_debt.remaining_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'CUSTOMER_DEBT_PAYMENT_SETTLED';
  END IF;
  IF v_amount > COALESCE(v_debt.remaining_amount, 0) THEN
    RAISE EXCEPTION 'CUSTOMER_DEBT_PAYMENT_EXCEEDS_REMAINING';
  END IF;

  v_new_paid := COALESCE(v_debt.paid_amount, 0) + v_amount;
  v_new_remaining := GREATEST(COALESCE(v_debt.total_amount, 0) - v_new_paid, 0);
  UPDATE public.debt_records
     SET paid_amount = v_new_paid,
         remaining_amount = v_new_remaining,
         status = CASE WHEN v_new_remaining = 0 THEN 'paid' ELSE 'partial' END,
         updated_date = now()
   WHERE id = v_debt.id
   RETURNING * INTO v_debt;

  INSERT INTO public.debt_payments (
    debt_id, customer_id, amount, date, payment_method, notes, party_name,
    party_phone, restaurant_id, branch, branch_id, tenant_id, request_id,
    recorded_by, recorded_by_name, created_by, created_date, updated_date
  ) VALUES (
    v_debt.id, v_debt.customer_id, v_amount, v_date, v_method, v_notes, v_debt.party_name,
    v_debt.party_phone, v_debt.restaurant_id, v_debt.branch, v_debt.branch_id,
    COALESCE(v_debt.tenant_id, v_debt.restaurant_id::text), v_request_id,
    auth.uid()::text, auth.uid()::text, auth.uid()::text, now(), now()
  ) RETURNING * INTO v_payment;

  INSERT INTO public.customer_collections (
    debt_id, customer_id, customer_name, amount, date, payment_method, notes,
    branch, branch_id, restaurant_id, tenant_id, request_id, created_by, created_date, updated_date
  ) VALUES (
    v_debt.id, v_debt.customer_id, v_debt.party_name, v_amount, v_date, v_method, v_notes,
    v_debt.branch, v_debt.branch_id, v_debt.restaurant_id,
    COALESCE(v_debt.tenant_id, v_debt.restaurant_id::text), v_request_id, auth.uid()::text, now(), now()
  );

  -- A repayment is a treasury collection, never daily sales revenue and never a new debt.
  INSERT INTO public.wallet_transactions (
    transaction_date, transaction_type, direction, wallet, branch, branch_id,
    amount, payment_method, description, reference_id, auto_generated,
    recorded_by, created_by, created_date, updated_date, restaurant_id, tenant_id
  ) VALUES (
    v_date,
    CASE WHEN v_method IN ('cash', 'cash_on_delivery', 'cod') THEN 'credit_collection_cash' ELSE 'credit_collection_network' END,
    'in',
    CASE WHEN v_method IN ('cash', 'cash_on_delivery', 'cod') THEN 'branch_cash' ELSE 'owner_network' END,
    v_debt.branch, v_debt.branch_id, v_amount, v_method,
    'Customer debt repayment', v_payment.id::text, true,
    auth.uid()::text, auth.uid()::text, now(), now(), v_debt.restaurant_id,
    COALESCE(v_debt.tenant_id, v_debt.restaurant_id::text)
  );

  SELECT public.erp_refresh_customer_receivable_cache(v_debt.customer_id) INTO v_customer_cache;
  RETURN jsonb_build_object('payment', to_jsonb(v_payment), 'debt', to_jsonb(v_debt), 'idempotent', false, 'customer_position', v_customer_cache);
END;
$$;

-- Validate the entire Customer Credit payload before the legacy closing core
-- persists revenue. This preserves the core's cash/revenue accounting while
-- preventing cross-branch customers and repeated customer rows.
CREATE OR REPLACE FUNCTION public.erp_save_sales_closing_core(
  p_payload jsonb,
  p_closing_id uuid DEFAULT NULL,
  p_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entries jsonb := COALESCE(p_payload -> 'credit_entries_json', '[]'::jsonb);
  v_entry jsonb;
  v_customer_id uuid;
  v_customer_ids uuid[] := ARRAY[]::uuid[];
  v_restaurant_id uuid := NULLIF(BTRIM(COALESCE(p_payload ->> 'restaurant_id', '')), '')::uuid;
  v_branch_id uuid := NULLIF(BTRIM(COALESCE(p_payload ->> 'branch_id', '')), '')::uuid;
  v_branch text := NULLIF(BTRIM(COALESCE(p_payload ->> 'branch', '')), '');
  v_result jsonb;
  v_closing jsonb;
  v_closing_id uuid;
  v_entry_amount numeric;
  v_saved_debt public.debt_records%ROWTYPE;
  v_existing_paid numeric;
BEGIN
  IF jsonb_typeof(v_entries) = 'array' THEN
    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_entries) LOOP
      v_entry_amount := GREATEST(COALESCE(NULLIF(v_entry ->> 'today_credit', '')::numeric, NULLIF(v_entry ->> 'amount', '')::numeric, 0), 0);
      IF v_entry_amount <= 0 THEN
        CONTINUE;
      END IF;
      IF v_restaurant_id IS NULL OR v_branch_id IS NULL OR v_branch IS NULL
         OR NULLIF(BTRIM(COALESCE(v_entry ->> 'customer_id', '')), '') IS NULL THEN
        RAISE EXCEPTION 'SALES_CLOSING_CREDIT_CUSTOMER_SCOPE_INVALID';
      END IF;
      v_customer_id := (v_entry ->> 'customer_id')::uuid;
      IF v_customer_id = ANY(v_customer_ids) THEN
        RAISE EXCEPTION 'SALES_CLOSING_CREDIT_CUSTOMER_DUPLICATE';
      END IF;
      IF NOT public.erp_customer_matches_receivable_scope(v_customer_id, v_restaurant_id, v_branch_id, v_branch) THEN
        RAISE EXCEPTION 'SALES_CLOSING_CREDIT_CUSTOMER_SCOPE_INVALID';
      END IF;
      v_customer_ids := array_append(v_customer_ids, v_customer_id);
      PERFORM public.erp_refresh_customer_receivable_cache(v_customer_id);
    END LOOP;
  END IF;

  v_result := public.erp_save_sales_closing_core_legacy_customer_balance(p_payload, p_closing_id, p_request_id);
  v_closing := v_result -> 'closing';
  IF v_closing IS NULL OR v_closing ->> 'id' IS NULL OR COALESCE((v_result ->> 'idempotent')::boolean, false) THEN
    RETURN v_result;
  END IF;
  IF lower(COALESCE(v_closing ->> 'closing_state', '')) <> 'finalized'
     OR COALESCE((v_result ->> 'finalized_transition')::boolean, false) = false THEN
    RETURN v_result;
  END IF;

  v_closing_id := (v_closing ->> 'id')::uuid;
  v_entries := COALESCE(v_closing -> 'credit_entries_json', '[]'::jsonb);
  IF jsonb_typeof(v_entries) <> 'array' THEN
    RETURN v_result;
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_entries) LOOP
    v_entry_amount := GREATEST(COALESCE(NULLIF(v_entry ->> 'today_credit', '')::numeric, NULLIF(v_entry ->> 'amount', '')::numeric, 0), 0);
    IF v_entry_amount <= 0 OR NULLIF(BTRIM(COALESCE(v_entry ->> 'customer_id', '')), '') IS NULL THEN
      CONTINUE;
    END IF;
    v_customer_id := (v_entry ->> 'customer_id')::uuid;

    SELECT paid_amount INTO v_existing_paid
      FROM public.debt_records
     WHERE sales_closing_id = v_closing_id
       AND customer_id = v_customer_id
     FOR UPDATE;
    IF FOUND AND COALESCE(v_existing_paid, 0) > v_entry_amount THEN
      RAISE EXCEPTION 'SALES_CLOSING_CREDIT_EDIT_BELOW_PAID';
    END IF;

    -- Exactly one receivable for one customer in one finalized closing. Credit
    -- increases revenue through the closing core, but creates no cash movement.
    INSERT INTO public.debt_records (
      restaurant_id, tenant_id, branch, branch_id, type, party_type, party_name,
      party_phone, customer_id, sales_closing_id, source_id, date, total_amount, paid_amount,
      remaining_amount, status, description, notes, created_by, created_date, updated_date
    ) VALUES (
      (v_closing ->> 'restaurant_id')::uuid,
      COALESCE(v_closing ->> 'tenant_id', v_closing ->> 'restaurant_id'),
      v_closing ->> 'branch', (v_closing ->> 'branch_id')::uuid, 'receivable', 'customer',
      v_entry ->> 'customer_name_snapshot', NULLIF(v_entry ->> 'customer_phone', ''),
      v_customer_id, v_closing_id, NULLIF(v_entry ->> 'source_id', '')::uuid, (v_closing ->> 'date')::date, v_entry_amount, 0,
      v_entry_amount, 'open', 'Credit sale from Sales Closing', NULLIF(v_entry ->> 'notes', ''),
      auth.uid()::text, now(), now()
    )
    ON CONFLICT (sales_closing_id, customer_id) WHERE sales_closing_id IS NOT NULL AND customer_id IS NOT NULL
    DO UPDATE SET
      total_amount = EXCLUDED.total_amount,
      remaining_amount = GREATEST(EXCLUDED.total_amount - COALESCE(public.debt_records.paid_amount, 0), 0),
      status = CASE
        WHEN GREATEST(EXCLUDED.total_amount - COALESCE(public.debt_records.paid_amount, 0), 0) = 0 THEN 'paid'
        WHEN COALESCE(public.debt_records.paid_amount, 0) > 0 THEN 'partial'
        ELSE 'open'
      END,
      party_name = EXCLUDED.party_name,
      party_phone = EXCLUDED.party_phone,
      notes = EXCLUDED.notes,
      updated_date = now()
    RETURNING * INTO v_saved_debt;

    PERFORM public.erp_refresh_customer_receivable_cache(v_customer_id);
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.erp_customer_matches_receivable_scope(uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_refresh_customer_receivable_cache(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_create_customer_receivable(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_record_customer_debt_payment(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_save_sales_closing_core(jsonb, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_customer_matches_receivable_scope(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_refresh_customer_receivable_cache(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_create_customer_receivable(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_record_customer_debt_payment(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_save_sales_closing_core(jsonb, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.erp_customer_matches_receivable_scope(uuid, uuid, uuid, text) IS
  'Verifies that a canonical active Customer Master row belongs to the supplied restaurant and branch.';
COMMENT ON FUNCTION public.erp_create_customer_receivable(jsonb) IS
  'Creates one Customer Master-linked receivable in the supplied restaurant and branch after available-credit validation.';
COMMENT ON FUNCTION public.erp_record_customer_debt_payment(jsonb) IS
  'Idempotently reduces one scoped receivable and records a non-revenue treasury collection.';
COMMENT ON FUNCTION public.erp_save_sales_closing_core(jsonb, uuid, uuid) IS
  'Validates unique scoped customer credit entries before finalizing revenue and creating one linked receivable per customer.';

COMMIT;
