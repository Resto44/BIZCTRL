-- Customer Credit Sales Source / Receivables rebuild.
-- Customer Master remains the identity and credit-limit authority; debt_records
-- remains the only outstanding-balance authority. This migration deliberately
-- preserves historical sales, debt, and payment records.

BEGIN;

-- A settlement request can span several open receivables. Persist the parent
-- request on the accounting ledgers so retries cannot duplicate a cash posting.
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS settlement_request_id uuid,
  ADD COLUMN IF NOT EXISTS customer_id uuid;

ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS settlement_request_id uuid,
  ADD COLUMN IF NOT EXISTS customer_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_transactions_customer_receivable_settlement
  ON public.wallet_transactions (settlement_request_id)
  WHERE settlement_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_movements_customer_receivable_settlement
  ON public.cash_movements (settlement_request_id)
  WHERE settlement_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_credit_options_scope
  ON public.customers (restaurant_id, branch_id, is_active, name);

CREATE INDEX IF NOT EXISTS idx_debt_records_customer_open_receivable_scope
  ON public.debt_records (restaurant_id, branch_id, customer_id, due_date, date)
  WHERE party_type = 'customer'
    AND type = 'receivable'
    AND COALESCE(remaining_amount, 0) > 0
    AND status NOT IN ('paid', 'written_off');

-- Normalize the canonical, system-managed Sales Source for every existing
-- tenant. Existing custom sources remain untouched.
UPDATE public.sales_sources
   SET name_en = 'Customer Credit',
       name_ar = 'ائتمان العملاء',
       name_fa = 'فروش اعتباری',
       description = 'Credit sales recorded as customer receivables. No cash is added at the time of sale.',
       icon = 'UserCheck',
       color = 'amber',
       default_payment_method = 'credit',
       requires_customer = true,
       requires_pos_device = false,
       requires_reference = false,
       requires_wallet = false,
       included_in_revenue = true,
       included_in_cash_register = false,
       included_in_dashboard_kpi = true,
       included_in_profit_calc = true,
       is_active = true,
       is_system = true,
       updated_date = now()
 WHERE system_key = 'credit';

INSERT INTO public.sales_sources (
  restaurant_id, name_en, name_ar, name_fa, description, icon, color, sort_order,
  is_active, is_system, is_global, system_key, default_payment_method,
  requires_customer, requires_pos_device, requires_reference, requires_wallet,
  included_in_revenue, included_in_cash_register, included_in_dashboard_kpi,
  included_in_profit_calc, branch_ids, created_date, updated_date
)
SELECT restaurant.id::text, 'Customer Credit', 'ائتمان العملاء', 'فروش اعتباری',
       'Credit sales recorded as customer receivables. No cash is added at the time of sale.',
       'UserCheck', 'amber', 20,
       true, true, true, 'credit', 'credit',
       true, false, false, false,
       true, false, true, true, ARRAY[]::uuid[], now(), now()
  FROM public.restaurants AS restaurant
 WHERE NOT EXISTS (
   SELECT 1
     FROM public.sales_sources AS source
    WHERE source.restaurant_id = restaurant.id::text
      AND source.system_key = 'credit'
 );

-- A branch-scoped, aggregate query prevents Customer Credit from loading the
-- full customer/debt dataset into the browser. It always derives balance from
-- receivable rows keyed by customer_id.
CREATE OR REPLACE FUNCTION public.erp_list_customer_credit_options(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  customer_name text,
  name text,
  phone text,
  credit_limit numeric,
  outstanding_balance numeric,
  total_credit_sales numeric,
  total_collected numeric,
  available_credit numeric,
  credit_status text,
  branch text,
  branch_id uuid,
  is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_key text;
  v_search text := NULLIF(BTRIM(COALESCE(p_search, '')), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
BEGIN
  IF auth.uid() IS NULL
     OR p_restaurant_id IS NULL
     OR p_branch_id IS NULL
     OR NOT public.erp_can_access_scope_text(p_restaurant_id::text, p_branch_id::text) THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
  END IF;

  SELECT value.branch_key
    INTO v_branch_key
    FROM public.branches AS value
   WHERE value.id = p_branch_id
     AND value.restaurant_id = p_restaurant_id
   LIMIT 1;
  IF v_branch_key IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_BRANCH_CONTEXT_INVALID';
  END IF;

  RETURN QUERY
  SELECT customer.id,
         customer.name AS customer_name,
         customer.name,
         COALESCE(customer.phone, ''),
         GREATEST(COALESCE(customer.credit_limit, 0), 0),
         COALESCE(SUM(GREATEST(COALESCE(debt.remaining_amount, 0), 0))
           FILTER (WHERE debt.status IS DISTINCT FROM 'written_off'), 0),
         COALESCE(SUM(GREATEST(COALESCE(debt.total_amount, 0), 0))
           FILTER (WHERE debt.status IS DISTINCT FROM 'written_off'), 0),
         COALESCE(SUM(GREATEST(COALESCE(debt.paid_amount, 0), 0))
           FILTER (WHERE debt.status IS DISTINCT FROM 'written_off'), 0),
         GREATEST(
           COALESCE(customer.credit_limit, 0)
           - COALESCE(SUM(GREATEST(COALESCE(debt.remaining_amount, 0), 0))
             FILTER (WHERE debt.status IS DISTINCT FROM 'written_off'), 0),
           0
         ),
         CASE WHEN COALESCE(SUM(GREATEST(COALESCE(debt.remaining_amount, 0), 0))
             FILTER (WHERE debt.status IS DISTINCT FROM 'written_off'), 0) > 0
           THEN 'outstanding' ELSE 'settled' END,
         customer.branch,
         customer.branch_id,
         COALESCE(customer.is_active, true)
    FROM public.customers AS customer
    LEFT JOIN public.debt_records AS debt
      ON debt.customer_id = customer.id
     AND debt.restaurant_id = p_restaurant_id
     AND debt.party_type = 'customer'
     AND debt.type = 'receivable'
     AND (
       debt.branch_id = p_branch_id
       OR (debt.branch_id IS NULL AND debt.branch = v_branch_key)
     )
   WHERE customer.restaurant_id = p_restaurant_id
     AND COALESCE(customer.is_active, true) = true
     AND (
       customer.branch_id IS NULL
       OR customer.branch_id = p_branch_id
       OR customer.branch IS NULL
       OR customer.branch = v_branch_key
     )
     AND (
       v_search IS NULL
       OR customer.name ILIKE '%' || v_search || '%'
       OR COALESCE(customer.phone, '') ILIKE '%' || v_search || '%'
       OR COALESCE(customer.customer_code, '') ILIKE '%' || v_search || '%'
     )
   GROUP BY customer.id, customer.name, customer.phone, customer.credit_limit,
            customer.branch, customer.branch_id, customer.is_active
   ORDER BY customer.name
   LIMIT v_limit;
END;
$$;

-- Direct Add Sales debt repayment. The payment is allocated oldest due/open
-- receivables first and carries one parent request key across its ledger rows.
CREATE OR REPLACE FUNCTION public.erp_record_customer_receivable_payment(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF v_method = 'cash' THEN
    INSERT INTO public.cash_movements (
      date, branch, branch_id, restaurant_id, created_by, direction, amount,
      movement_type, payment_method, source_module, source_record_id,
      source_document_id, description, posted_by, posted_by_name, tenant_id,
      settlement_request_id, customer_id
    ) VALUES (
      v_date, v_branch, v_branch_id, v_restaurant_id, auth.uid()::text, 'in', v_amount,
      'customer_debt_collection', 'cash', 'CustomerPayments', v_request_id::text,
      v_customer_id::text, 'Customer debt repayment', auth.uid()::text, auth.uid()::text,
      COALESCE(v_customer.tenant_id, v_restaurant_id::text), v_request_id, v_customer_id
    );
  END IF;

  SELECT public.erp_refresh_customer_receivable_cache(v_customer_id) INTO v_cached;
  RETURN jsonb_build_object(
    'payment', COALESCE(v_payment_rows -> 0, '{}'::jsonb),
    'payments', v_payment_rows,
    'idempotent', false,
    'customer_position', v_cached
  );
END;
$$;

-- The legacy Closing core owns unrelated cash, source snapshot, expense,
-- permission, and idempotency lifecycle logic. Feed it a credit-entry-free
-- payload, then persist only sanitized canonical receivable references. This
-- prevents its deprecated Customer Master balance mutation and snapshot writes.
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
  v_restaurant_id uuid := NULLIF(BTRIM(COALESCE(p_payload ->> 'restaurant_id', '')), '')::uuid;
  v_branch_id uuid := NULLIF(BTRIM(COALESCE(p_payload ->> 'branch_id', '')), '')::uuid;
  v_branch text := NULLIF(BTRIM(COALESCE(p_payload ->> 'branch', '')), '');
  v_requested_state text := COALESCE(NULLIF(BTRIM(COALESCE(p_payload ->> 'closing_state', '')), ''), 'draft');
  v_entries jsonb := COALESCE(p_payload -> 'credit_entries_json', '[]'::jsonb);
  v_entry jsonb;
  v_customer public.customers%ROWTYPE;
  v_customer_id uuid;
  v_amount numeric;
  v_outstanding numeric;
  v_limit numeric;
  v_available numeric;
  v_credit_total numeric := 0;
  v_sanitized_entries jsonb := '[]'::jsonb;
  v_result jsonb;
  v_closing public.daily_sales%ROWTYPE;
  v_debt public.debt_records%ROWTYPE;
  v_existing_count integer := 0;
  v_existing_total numeric := 0;
  v_sanitized_count integer := 0;
  v_legacy_payload jsonb;
  v_seen_customer_ids text[] := ARRAY[]::text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_AUTH_REQUIRED';
  END IF;
  IF v_restaurant_id IS NULL OR v_branch_id IS NULL OR v_branch IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_SCOPE_REQUIRED';
  END IF;
  IF jsonb_typeof(v_entries) <> 'array' THEN
    RAISE EXCEPTION 'SALES_CLOSING_PAYLOAD_INVALID';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_entries) LOOP
    IF NULLIF(BTRIM(COALESCE(v_entry ->> 'amount', v_entry ->> 'today_credit', '')), '') IS NULL THEN
      v_amount := 0;
    ELSE
      v_amount := COALESCE(NULLIF(v_entry ->> 'amount', '')::numeric, NULLIF(v_entry ->> 'today_credit', '')::numeric, 0);
    END IF;
    IF v_amount < 0 THEN
      RAISE EXCEPTION 'SALES_CLOSING_CREDIT_AMOUNT_INVALID';
    END IF;
    v_customer_id := NULLIF(BTRIM(COALESCE(v_entry ->> 'customer_id', '')), '')::uuid;
    IF v_amount = 0 AND v_customer_id IS NULL THEN
      CONTINUE;
    END IF;
    IF v_amount <= 0 OR v_customer_id IS NULL THEN
      RAISE EXCEPTION 'SALES_CLOSING_CREDIT_CUSTOMER_REQUIRED';
    END IF;
    IF v_customer_id::text = ANY(v_seen_customer_ids) THEN
      RAISE EXCEPTION 'SALES_CLOSING_CREDIT_CUSTOMER_DUPLICATE';
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

    SELECT COALESCE(SUM(GREATEST(COALESCE(remaining_amount, 0), 0))
             FILTER (WHERE status IS DISTINCT FROM 'written_off'), 0)
      INTO v_outstanding
      FROM public.debt_records
     WHERE customer_id = v_customer_id
       AND restaurant_id = v_restaurant_id
       AND party_type = 'customer'
       AND type = 'receivable'
       AND (branch_id = v_branch_id OR (branch_id IS NULL AND branch = v_branch));
    v_limit := GREATEST(COALESCE(v_customer.credit_limit, 0), 0);
    v_available := GREATEST(v_limit - v_outstanding, 0);
    IF v_amount > v_available THEN
      RAISE EXCEPTION 'SALES_CLOSING_CREDIT_LIMIT_EXCEEDED';
    END IF;

    v_sanitized_entries := v_sanitized_entries || jsonb_build_array(jsonb_build_object(
      'client_row_id', COALESCE(v_entry ->> 'client_row_id', gen_random_uuid()::text),
      'source_id', NULLIF(v_entry ->> 'source_id', ''),
      'customer_id', v_customer.id,
      'customer_name_snapshot', v_customer.name,
      'customer_phone', COALESCE(v_customer.phone, ''),
      'previous_outstanding_debt', v_outstanding,
      'credit_limit', v_limit,
      'available_credit', v_available,
      'amount', v_amount,
      'notes', COALESCE(v_entry ->> 'notes', '')
    ));
    v_credit_total := v_credit_total + v_amount;
    v_seen_customer_ids := array_append(v_seen_customer_ids, v_customer_id::text);
  END LOOP;
  v_sanitized_count := jsonb_array_length(v_sanitized_entries);

  -- A finalized Closing's receivables are accounting documents. Allow ordinary
  -- Closing edits, but reject a different customer-credit composition rather
  -- than rewriting historical debt principal or deleting a receivable.
  IF p_closing_id IS NOT NULL THEN
    SELECT * INTO v_closing FROM public.daily_sales WHERE id = p_closing_id FOR UPDATE;
    IF FOUND AND lower(COALESCE(v_closing.closing_state, '')) = 'finalized' THEN
      SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
        INTO v_existing_count, v_existing_total
        FROM public.debt_records
       WHERE sales_closing_id = v_closing.id
         AND party_type = 'customer'
         AND type = 'receivable';
      IF v_existing_count <> v_sanitized_count OR v_existing_total <> v_credit_total OR EXISTS (
        SELECT 1
          FROM jsonb_array_elements(v_sanitized_entries) AS candidate
         WHERE NOT EXISTS (
           SELECT 1
             FROM public.debt_records AS debt
            WHERE debt.sales_closing_id = v_closing.id
              AND debt.customer_id = (candidate ->> 'customer_id')::uuid
              AND debt.total_amount = (candidate ->> 'amount')::numeric
         )
      ) THEN
        RAISE EXCEPTION 'SALES_CLOSING_CREDIT_FINALIZED_IMMUTABLE';
      END IF;
    END IF;
  END IF;

  v_legacy_payload := jsonb_set(
    jsonb_set(p_payload, '{credit_entries_json}', '[]'::jsonb, true),
    '{credit}', to_jsonb(v_credit_total), true
  );
  v_result := public.erp_save_sales_closing_core_legacy_customer_balance(
    v_legacy_payload, p_closing_id, p_request_id
  );
  IF COALESCE((v_result ->> 'idempotent')::boolean, false) THEN
    RETURN v_result;
  END IF;

  SELECT * INTO v_closing
    FROM public.daily_sales
   WHERE id = NULLIF(v_result -> 'closing' ->> 'id', '')::uuid
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALES_CLOSING_SAVE_FAILED';
  END IF;

  UPDATE public.daily_sales
     SET credit = v_credit_total,
         credit_entries_json = v_sanitized_entries,
         updated_date = now()
   WHERE id = v_closing.id
   RETURNING * INTO v_closing;

  -- The compatibility core receives an empty credit array to bypass its retired
  -- Customer Master mutation. Restore the sanitized, canonical source detail in
  -- the finalized version it just created so closing history remains auditable.
  IF v_requested_state = 'finalized' THEN
    UPDATE public.sales_closing_finalized_versions
       SET credit_entries_json = v_sanitized_entries
     WHERE closing_id = v_closing.id
       AND version = v_closing.closing_version;
  END IF;

  IF v_requested_state = 'finalized'
     AND COALESCE((v_result ->> 'finalized_transition')::boolean, false) THEN
    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_sanitized_entries) LOOP
      INSERT INTO public.debt_records (
        restaurant_id, tenant_id, branch, branch_id, type, party_type, party_name,
        party_phone, customer_id, sales_closing_id, source_id, date, total_amount,
        paid_amount, remaining_amount, status, description, notes, created_by,
        created_date, updated_date
      ) VALUES (
        v_restaurant_id, COALESCE(v_closing.tenant_id, v_restaurant_id::text),
        v_branch, v_branch_id, 'receivable', 'customer', v_entry ->> 'customer_name_snapshot',
        NULLIF(v_entry ->> 'customer_phone', ''), (v_entry ->> 'customer_id')::uuid,
        v_closing.id,
        CASE WHEN v_entry ->> 'source_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (v_entry ->> 'source_id')::uuid ELSE NULL END,
        v_closing.date, (v_entry ->> 'amount')::numeric, 0, (v_entry ->> 'amount')::numeric,
        'open', 'Credit sale from Customer Credit sales source',
        NULLIF(v_entry ->> 'notes', ''), auth.uid()::text, now(), now()
      )
      ON CONFLICT (sales_closing_id, customer_id)
      WHERE sales_closing_id IS NOT NULL AND customer_id IS NOT NULL
      DO NOTHING
      RETURNING * INTO v_debt;

      PERFORM public.erp_refresh_customer_receivable_cache((v_entry ->> 'customer_id')::uuid);
    END LOOP;
  END IF;

  RETURN jsonb_set(v_result, '{closing}', to_jsonb(v_closing), true);
END;
$$;

REVOKE ALL ON FUNCTION public.erp_list_customer_credit_options(uuid, uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_record_customer_receivable_payment(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_save_sales_closing_core(jsonb, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_list_customer_credit_options(uuid, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_record_customer_receivable_payment(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_save_sales_closing_core(jsonb, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.erp_list_customer_credit_options(uuid, uuid, text, integer) IS
  'Branch-scoped active customer options with outstanding balance derived from canonical receivable rows.';
COMMENT ON FUNCTION public.erp_record_customer_receivable_payment(jsonb) IS
  'Atomically allocates a customer repayment over branch-scoped receivables and posts one non-revenue ledger movement.';
COMMENT ON FUNCTION public.erp_save_sales_closing_core(jsonb, uuid, uuid) IS
  'Sales Closing wrapper that blocks legacy Customer Master balance mutation and records Customer Credit solely as receivables.';

COMMIT;
