BEGIN;

-- Customer-credit rows are part of a Closing's accounting history. Store their
-- finalized Customer Master values independently from mutable customer records.
CREATE TABLE IF NOT EXISTS public.sales_closing_customer_credit_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id uuid NOT NULL REFERENCES public.daily_sales(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  customer_name_snapshot text NOT NULL,
  previous_credit_snapshot numeric NOT NULL DEFAULT 0 CHECK (previous_credit_snapshot >= 0),
  credit_limit_snapshot numeric NOT NULL DEFAULT 0 CHECK (credit_limit_snapshot >= 0),
  available_credit_snapshot numeric NOT NULL DEFAULT 0 CHECK (available_credit_snapshot >= 0),
  today_credit numeric NOT NULL DEFAULT 0 CHECK (today_credit >= 0),
  new_credit_balance numeric NOT NULL DEFAULT 0 CHECK (new_credit_balance >= 0),
  remaining_credit_limit numeric NOT NULL,
  manager_override boolean NOT NULL DEFAULT false,
  manager_override_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (closing_id, customer_id)
);

CREATE INDEX IF NOT EXISTS sales_closing_customer_credit_snapshots_closing_idx
  ON public.sales_closing_customer_credit_snapshots (closing_id);

CREATE OR REPLACE FUNCTION public.erp_guard_sales_closing_customer_credit_snapshot_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'SALES_CLOSING_CUSTOMER_CREDIT_SNAPSHOT_IMMUTABLE'
    USING DETAIL = 'Finalized Customer Credit snapshots are immutable.';
END;
$$;

DROP TRIGGER IF EXISTS sales_closing_customer_credit_snapshots_no_mutation
  ON public.sales_closing_customer_credit_snapshots;
CREATE TRIGGER sales_closing_customer_credit_snapshots_no_mutation
  BEFORE UPDATE OR DELETE ON public.sales_closing_customer_credit_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.erp_guard_sales_closing_customer_credit_snapshot_immutable();

CREATE OR REPLACE FUNCTION public.erp_save_sales_closing(
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
  v_restaurant_id text := NULLIF(BTRIM(p_payload ->> 'restaurant_id'), '');
  v_restaurant_uuid uuid;
  v_branch_id uuid := NULLIF(p_payload ->> 'branch_id', '')::uuid;
  v_branch text := NULLIF(BTRIM(p_payload ->> 'branch'), '');
  v_date date := NULLIF(p_payload ->> 'date', '')::date;
  v_shift text := NULLIF(BTRIM(p_payload ->> 'shift'), '');
  v_cashier_id uuid := NULLIF(p_payload ->> 'cashier_id', '')::uuid;
  v_cashier_name text := NULLIF(BTRIM(p_payload ->> 'cashier_name'), '');
  v_requested_state text := COALESCE(NULLIF(BTRIM(p_payload ->> 'closing_state'), ''), 'draft');
  v_request_id uuid := COALESCE(p_request_id, NULLIF(p_payload ->> 'request_id', '')::uuid, gen_random_uuid());
  v_existing public.daily_sales%ROWTYPE;
  v_saved public.daily_sales%ROWTYPE;
  v_role text := lower(COALESCE(public.erp_current_role(), ''));
  v_manual_cash numeric := GREATEST(COALESCE(NULLIF(p_payload ->> 'restaurant_cash', '')::numeric, 0), 0);
  v_network numeric := GREATEST(COALESCE(NULLIF(p_payload ->> 'restaurant_network', '')::numeric, 0), 0);
  v_credit numeric := GREATEST(COALESCE(NULLIF(p_payload ->> 'credit', '')::numeric, 0), 0);
  v_other numeric := GREATEST(COALESCE(NULLIF(p_payload ->> 'custom_sources_total', '')::numeric, 0), 0);
  v_opening numeric := GREATEST(COALESCE(NULLIF(p_payload ->> 'opening_cash', '')::numeric, 0), 0);
  v_actual numeric := NULLIF(p_payload ->> 'actual_cash', '')::numeric;
  v_owner_contribution numeric := GREATEST(COALESCE(NULLIF(p_payload ->> 'owner_cash_injection', '')::numeric, 0), 0);
  v_cash_source_total numeric := 0;
  v_expected_cash numeric;
  v_difference numeric;
  v_variance_status text;
  v_sources jsonb := COALESCE(p_payload -> 'sales_sources_json', '[]'::jsonb);
  v_payments jsonb := COALESCE(p_payload -> 'payment_reconciliation_json', '[]'::jsonb);
  v_credit_entries jsonb := COALESCE(p_payload -> 'credit_entries_json', '[]'::jsonb);
  v_credit_entries_sanitized jsonb := '[]'::jsonb;
  v_credit_snapshot_rows jsonb := '[]'::jsonb;
  v_credit_entry jsonb;
  v_customer record;
  v_customer_id uuid;
  v_today_credit numeric;
  v_previous_credit numeric;
  v_credit_limit numeric;
  v_available_credit numeric;
  v_new_credit_balance numeric;
  v_remaining_credit_limit numeric;
  v_override boolean;
  v_credit_master_total numeric := 0;
  v_action text;
  v_transitioned boolean := false;
  v_has_existing boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_AUTH_REQUIRED';
  END IF;
  IF v_restaurant_id IS NULL OR v_branch_id IS NULL OR v_branch IS NULL OR v_date IS NULL OR v_shift IS NULL OR v_cashier_id IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_SCOPE_REQUIRED'
      USING DETAIL = 'Restaurant, branch, business date, shift, and cashier are required.';
  END IF;
  IF v_requested_state NOT IN ('draft', 'ready', 'finalized', 'cancelled') THEN
    RAISE EXCEPTION 'SALES_CLOSING_STATE_INVALID';
  END IF;
  IF jsonb_typeof(v_sources) <> 'array' OR jsonb_typeof(v_payments) <> 'array' OR jsonb_typeof(v_credit_entries) <> 'array' THEN
    RAISE EXCEPTION 'SALES_CLOSING_PAYLOAD_INVALID';
  END IF;

  v_restaurant_uuid := v_restaurant_id::uuid;
  IF NOT public.erp_can_write_scope(v_restaurant_uuid, v_branch_id) THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|', v_restaurant_id, v_branch_id::text, v_date::text, lower(v_shift), v_cashier_id::text), 0));
  PERFORM set_config('app.sales_closing_transaction', 'on', true);

  SELECT * INTO v_existing
  FROM public.daily_sales
  WHERE restaurant_id = v_restaurant_id
    AND (
      id = p_closing_id
      OR closing_request_id = v_request_id
      OR (branch_id = v_branch_id AND date = v_date AND lower(BTRIM(shift)) = lower(v_shift) AND cashier_id = v_cashier_id)
    )
  ORDER BY CASE WHEN id = p_closing_id THEN 0 WHEN closing_request_id = v_request_id THEN 1 ELSE 2 END
  LIMIT 1
  FOR UPDATE;
  v_has_existing := FOUND;

  IF v_has_existing AND v_existing.closing_request_id = v_request_id THEN
    RETURN jsonb_build_object('closing', to_jsonb(v_existing), 'idempotent', true, 'finalized_transition', false);
  END IF;
  IF v_has_existing AND v_existing.closing_state IN ('finalized', 'correction_requested', 'corrected', 'locked') THEN
    RAISE EXCEPTION 'SALES_CLOSING_HISTORY_IMMUTABLE'
      USING DETAIL = 'Use the correction request workflow for a finalized closing.';
  END IF;

  -- Resolve every amount-bearing credit row from Customer Master under a row lock.
  -- Client-supplied name, previous balance and limit are retained only as draft UX
  -- hints; accounting values always come from the selected master record.
  FOR v_credit_entry IN SELECT value FROM jsonb_array_elements(v_credit_entries) LOOP
    v_today_credit := GREATEST(COALESCE(NULLIF(v_credit_entry ->> 'today_credit', '')::numeric, NULLIF(v_credit_entry ->> 'amount', '')::numeric, 0), 0);
    v_customer_id := NULLIF(BTRIM(v_credit_entry ->> 'customer_id'), '')::uuid;
    IF v_today_credit = 0 AND v_customer_id IS NULL THEN
      CONTINUE;
    END IF;
    IF v_customer_id IS NULL THEN
      RAISE EXCEPTION 'SALES_CLOSING_CREDIT_CUSTOMER_REQUIRED';
    END IF;
    SELECT id, name, phone, credit_limit, outstanding_balance
      INTO v_customer
      FROM public.customers
      WHERE id = v_customer_id
        AND restaurant_id = v_restaurant_uuid
        AND COALESCE(is_active, true) = true
        AND (branch_id IS NULL OR branch_id = v_branch_id OR branch IS NULL OR branch = v_branch)
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SALES_CLOSING_CREDIT_CUSTOMER_INVALID';
    END IF;

    v_previous_credit := GREATEST(COALESCE(v_customer.outstanding_balance, 0), 0);
    v_credit_limit := GREATEST(COALESCE(v_customer.credit_limit, 0), 0);
    v_available_credit := GREATEST(v_credit_limit - v_previous_credit, 0);
    v_new_credit_balance := v_previous_credit + v_today_credit;
    v_remaining_credit_limit := v_credit_limit - v_new_credit_balance;
    v_override := COALESCE((v_credit_entry ->> 'manager_override')::boolean, false);

    IF v_today_credit > v_available_credit THEN
      IF NOT v_override THEN
        RAISE EXCEPTION 'SALES_CLOSING_CREDIT_LIMIT_EXCEEDED';
      END IF;
      IF v_role NOT IN ('owner', 'general_manager', 'manager', 'branch_manager') THEN
        RAISE EXCEPTION 'SALES_CLOSING_CREDIT_OVERRIDE_DENIED';
      END IF;
    END IF;

    v_credit_entries_sanitized := v_credit_entries_sanitized || jsonb_build_array(jsonb_build_object(
      'client_row_id', COALESCE(v_credit_entry ->> 'client_row_id', v_credit_entry ->> 'id', gen_random_uuid()::text),
      'customer_id', v_customer.id,
      'customer', v_customer.name,
      'customer_name_snapshot', v_customer.name,
      'customer_phone', COALESCE(v_customer.phone, ''),
      'previous_credit', v_previous_credit,
      'credit_limit', v_credit_limit,
      'available_credit', v_available_credit,
      'amount', v_today_credit,
      'today_credit', v_today_credit,
      'new_credit_balance', v_new_credit_balance,
      'remaining_credit_limit', v_remaining_credit_limit,
      'manager_override', v_override,
      'notes', COALESCE(v_credit_entry ->> 'notes', '')
    ));

    IF v_today_credit > 0 THEN
      v_credit_master_total := v_credit_master_total + v_today_credit;
      v_credit_snapshot_rows := v_credit_snapshot_rows || jsonb_build_array(jsonb_build_object(
        'customer_id', v_customer.id,
        'customer_name_snapshot', v_customer.name,
        'previous_credit_snapshot', v_previous_credit,
        'credit_limit_snapshot', v_credit_limit,
        'available_credit_snapshot', v_available_credit,
        'today_credit', v_today_credit,
        'new_credit_balance', v_new_credit_balance,
        'remaining_credit_limit', v_remaining_credit_limit,
        'manager_override', v_override
      ));
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_credit_snapshot_rows) AS entry
    GROUP BY entry ->> 'customer_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SALES_CLOSING_CREDIT_CUSTOMER_DUPLICATE'
      USING DETAIL = 'A customer can appear only once in a Customer Credit Closing.';
  END IF;

  -- Customer Master credit amounts are always at least the sum of Today's rows;
  -- this prevents a stale or manipulated aggregate from omitting a credit sale.
  v_credit := GREATEST(v_credit, v_credit_master_total);

  SELECT COALESCE(SUM(GREATEST(COALESCE(NULLIF(entry ->> 'today_amount', '')::numeric, NULLIF(entry ->> 'amount', '')::numeric, 0), 0)), 0)
    INTO v_cash_source_total
    FROM jsonb_array_elements(v_sources) AS entry
    WHERE COALESCE(entry ->> 'payment_bucket', entry ->> 'default_payment_method', 'other') IN ('cash', 'cash_on_delivery', 'cod');

  v_expected_cash := v_opening + v_manual_cash + v_cash_source_total;
  IF v_actual IS NOT NULL THEN
    v_actual := GREATEST(v_actual, 0);
    v_difference := v_actual - v_expected_cash;
    v_variance_status := CASE WHEN v_difference = 0 THEN 'balanced' WHEN v_difference < 0 THEN 'shortage' ELSE 'overage' END;
  ELSE
    v_difference := NULL;
    v_variance_status := 'pending';
  END IF;

  IF v_requested_state = 'finalized' THEN
    IF v_actual IS NULL THEN
      RAISE EXCEPTION 'SALES_CLOSING_ACTUAL_CASH_REQUIRED';
    END IF;
    IF v_difference IS DISTINCT FROM 0
       AND NULLIF(BTRIM(COALESCE(p_payload ->> 'cash_notes', '')), '') IS NULL THEN
      RAISE EXCEPTION 'SALES_CLOSING_VARIANCE_NOTE_REQUIRED';
    END IF;
    IF v_difference IS DISTINCT FROM 0
       AND COALESCE((p_payload ->> 'manager_approval')::boolean, false) = false THEN
      RAISE EXCEPTION 'SALES_CLOSING_MANAGER_APPROVAL_REQUIRED';
    END IF;
  END IF;

  IF v_has_existing THEN
    v_transitioned := v_existing.closing_state IS DISTINCT FROM 'finalized' AND v_requested_state = 'finalized';
    UPDATE public.daily_sales
    SET date = v_date,
        business_date = v_date,
        branch = v_branch,
        branch_id = v_branch_id,
        shift = v_shift,
        cashier_id = v_cashier_id,
        cashier_employee_id = COALESCE(p_payload ->> 'cashier_employee_id', v_cashier_id::text),
        cashier_name = COALESCE(v_cashier_name, ''),
        sales_notes = COALESCE(p_payload ->> 'sales_notes', ''),
        restaurant_cash = v_manual_cash + v_cash_source_total,
        cash = v_manual_cash + v_cash_source_total,
        restaurant_network = v_network,
        network = v_network,
        credit = v_credit,
        credit_entries_json = v_credit_entries_sanitized,
        custom_sources_total = v_other,
        sales_sources_json = v_sources,
        payment_reconciliation_json = v_payments,
        opening_cash = v_opening,
        expected_cash = v_expected_cash,
        actual_cash = v_actual,
        closing_cash = COALESCE(v_actual, v_opening) + v_owner_contribution,
        cash_difference = COALESCE(v_difference, 0),
        cash_status = initcap(v_variance_status),
        cash_notes = COALESCE(p_payload ->> 'cash_notes', ''),
        owner_cash_injection = v_owner_contribution,
        manager_approval = COALESCE((p_payload ->> 'manager_approval')::boolean, false),
        manager_approved_by = CASE WHEN COALESCE((p_payload ->> 'manager_approval')::boolean, false) THEN auth.uid()::text ELSE '' END,
        approved_purchases_total = GREATEST(COALESCE(NULLIF(p_payload ->> 'approved_purchases_total', '')::numeric, 0), 0),
        expenses_total = GREATEST(COALESCE(NULLIF(p_payload ->> 'expenses_total', '')::numeric, 0), 0),
        operating_result = (v_manual_cash + v_cash_source_total + v_network + v_credit + v_other)
          - GREATEST(COALESCE(NULLIF(p_payload ->> 'approved_purchases_total', '')::numeric, 0), 0)
          - GREATEST(COALESCE(NULLIF(p_payload ->> 'expenses_total', '')::numeric, 0), 0),
        closing_state = v_requested_state,
        finalized_at = CASE WHEN v_requested_state = 'finalized' THEN COALESCE(finalized_at, now()) ELSE NULL END,
        finalized_by = CASE WHEN v_requested_state = 'finalized' THEN auth.uid()::text ELSE '' END,
        closing_request_id = v_request_id,
        updated_date = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_saved;
    v_action := CASE WHEN v_requested_state = 'finalized' THEN 'closing_finalized' ELSE 'draft_saved' END;
  ELSE
    INSERT INTO public.daily_sales (
      restaurant_id, date, business_date, branch, branch_id, shift, cashier_id, cashier_employee_id, cashier_name,
      sales_notes, restaurant_cash, cash, restaurant_network, network, credit, credit_entries_json, custom_sources_total, sales_sources_json,
      payment_reconciliation_json, opening_cash, expected_cash, actual_cash, closing_cash, cash_difference, cash_status,
      cash_notes, owner_cash_injection, manager_approval, manager_approved_by, approved_purchases_total, expenses_total,
      operating_result, closing_state, finalized_at, finalized_by, closing_request_id, created_by, created_date, updated_date
    ) VALUES (
      v_restaurant_id, v_date, v_date, v_branch, v_branch_id, v_shift, v_cashier_id,
      COALESCE(p_payload ->> 'cashier_employee_id', v_cashier_id::text), COALESCE(v_cashier_name, ''),
      COALESCE(p_payload ->> 'sales_notes', ''), v_manual_cash + v_cash_source_total, v_manual_cash + v_cash_source_total,
      v_network, v_network, v_credit, v_credit_entries_sanitized, v_other, v_sources, v_payments, v_opening, v_expected_cash, v_actual,
      COALESCE(v_actual, v_opening) + v_owner_contribution, COALESCE(v_difference, 0), initcap(v_variance_status),
      COALESCE(p_payload ->> 'cash_notes', ''), v_owner_contribution, COALESCE((p_payload ->> 'manager_approval')::boolean, false),
      CASE WHEN COALESCE((p_payload ->> 'manager_approval')::boolean, false) THEN auth.uid()::text ELSE '' END,
      GREATEST(COALESCE(NULLIF(p_payload ->> 'approved_purchases_total', '')::numeric, 0), 0),
      GREATEST(COALESCE(NULLIF(p_payload ->> 'expenses_total', '')::numeric, 0), 0),
      (v_manual_cash + v_cash_source_total + v_network + v_credit + v_other)
        - GREATEST(COALESCE(NULLIF(p_payload ->> 'approved_purchases_total', '')::numeric, 0), 0)
        - GREATEST(COALESCE(NULLIF(p_payload ->> 'expenses_total', '')::numeric, 0), 0),
      v_requested_state, CASE WHEN v_requested_state = 'finalized' THEN now() ELSE NULL END,
      CASE WHEN v_requested_state = 'finalized' THEN auth.uid()::text ELSE '' END,
      v_request_id, auth.uid()::text, now(), now()
    ) RETURNING * INTO v_saved;
    v_transitioned := v_requested_state = 'finalized';
    v_action := CASE WHEN v_requested_state = 'finalized' THEN 'closing_finalized' ELSE 'closing_created' END;
  END IF;

  DELETE FROM public.sales_closing_source_snapshots WHERE closing_id = v_saved.id;
  INSERT INTO public.sales_closing_source_snapshots (
    closing_id, source_id, source_name_snapshot, today_amount, historical_before_closing, total_after_closing, payment_bucket, included_in_revenue
  )
  SELECT v_saved.id,
    CASE WHEN entry ->> 'source_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (entry ->> 'source_id')::uuid ELSE NULL END,
    COALESCE(NULLIF(entry ->> 'name_en', ''), NULLIF(entry ->> 'source_name_snapshot', ''), 'Sales source'),
    GREATEST(COALESCE(NULLIF(entry ->> 'today_amount', '')::numeric, NULLIF(entry ->> 'amount', '')::numeric, 0), 0),
    GREATEST(COALESCE(NULLIF(entry ->> 'previous_amount', '')::numeric, 0), 0),
    GREATEST(COALESCE(NULLIF(entry ->> 'total_amount', '')::numeric, NULLIF(entry ->> 'today_amount', '')::numeric, NULLIF(entry ->> 'amount', '')::numeric, 0), 0),
    COALESCE(NULLIF(entry ->> 'payment_bucket', ''), NULLIF(entry ->> 'default_payment_method', ''), 'other'),
    COALESCE((entry ->> 'included_in_revenue')::boolean, true)
  FROM jsonb_array_elements(v_sources) AS entry;

  DELETE FROM public.sales_closing_payment_reconciliations WHERE closing_id = v_saved.id;
  INSERT INTO public.sales_closing_payment_reconciliations (
    closing_id, payment_method, expected_amount, actual_amount, difference_amount, variance_status
  )
  SELECT v_saved.id,
    COALESCE(NULLIF(BTRIM(entry ->> 'payment_method'), ''), 'other'),
    GREATEST(COALESCE(NULLIF(entry ->> 'expected', '')::numeric, 0), 0),
    CASE WHEN NULLIF(entry ->> 'actual', '') IS NULL THEN NULL ELSE GREATEST((entry ->> 'actual')::numeric, 0) END,
    CASE WHEN NULLIF(entry ->> 'actual', '') IS NULL THEN NULL ELSE GREATEST((entry ->> 'actual')::numeric, 0) - GREATEST(COALESCE(NULLIF(entry ->> 'expected', '')::numeric, 0), 0) END,
    CASE WHEN NULLIF(entry ->> 'actual', '') IS NULL THEN 'pending'
         WHEN GREATEST((entry ->> 'actual')::numeric, 0) - GREATEST(COALESCE(NULLIF(entry ->> 'expected', '')::numeric, 0), 0) = 0 THEN 'balanced'
         WHEN GREATEST((entry ->> 'actual')::numeric, 0) - GREATEST(COALESCE(NULLIF(entry ->> 'expected', '')::numeric, 0), 0) < 0 THEN 'shortage'
         ELSE 'overage' END
  FROM jsonb_array_elements(v_payments) AS entry;

  INSERT INTO public.sales_closing_cash_reconciliations (
    closing_id, opening_cash, cash_sales, expected_cash, actual_cash, difference_amount, variance_status, variance_note, manager_approved, manager_approved_by, updated_at
  ) VALUES (
    v_saved.id, v_opening, v_manual_cash + v_cash_source_total, v_expected_cash, v_actual, v_difference,
    v_variance_status, NULLIF(BTRIM(COALESCE(p_payload ->> 'cash_notes', '')), ''),
    COALESCE((p_payload ->> 'manager_approval')::boolean, false),
    CASE WHEN COALESCE((p_payload ->> 'manager_approval')::boolean, false) THEN auth.uid() ELSE NULL END, now()
  ) ON CONFLICT (closing_id) DO UPDATE SET
    opening_cash = EXCLUDED.opening_cash,
    cash_sales = EXCLUDED.cash_sales,
    expected_cash = EXCLUDED.expected_cash,
    actual_cash = EXCLUDED.actual_cash,
    difference_amount = EXCLUDED.difference_amount,
    variance_status = EXCLUDED.variance_status,
    variance_note = EXCLUDED.variance_note,
    manager_approved = EXCLUDED.manager_approved,
    manager_approved_by = EXCLUDED.manager_approved_by,
    updated_at = now();

  IF v_requested_state = 'finalized' AND jsonb_array_length(v_credit_snapshot_rows) > 0 THEN
    INSERT INTO public.sales_closing_customer_credit_snapshots (
      closing_id, customer_id, customer_name_snapshot, previous_credit_snapshot, credit_limit_snapshot,
      available_credit_snapshot, today_credit, new_credit_balance, remaining_credit_limit,
      manager_override, manager_override_by
    )
    SELECT v_saved.id,
      (entry ->> 'customer_id')::uuid,
      entry ->> 'customer_name_snapshot',
      (entry ->> 'previous_credit_snapshot')::numeric,
      (entry ->> 'credit_limit_snapshot')::numeric,
      (entry ->> 'available_credit_snapshot')::numeric,
      (entry ->> 'today_credit')::numeric,
      (entry ->> 'new_credit_balance')::numeric,
      (entry ->> 'remaining_credit_limit')::numeric,
      COALESCE((entry ->> 'manager_override')::boolean, false),
      CASE WHEN COALESCE((entry ->> 'manager_override')::boolean, false) THEN auth.uid() ELSE NULL END
    FROM jsonb_array_elements(v_credit_snapshot_rows) AS entry;

    UPDATE public.customers AS customer
    SET outstanding_balance = (entry ->> 'new_credit_balance')::numeric,
        total_credit_sales = COALESCE(customer.total_credit_sales, 0) + (entry ->> 'today_credit')::numeric,
        last_transaction_date = v_date,
        updated_date = now()
    FROM jsonb_array_elements(v_credit_snapshot_rows) AS entry
    WHERE customer.id = (entry ->> 'customer_id')::uuid;
  END IF;

  INSERT INTO public.sales_closing_audit_log (
    closing_id, restaurant_id, actor_id, actor_role, action, request_id, new_value
  ) VALUES (
    v_saved.id, v_restaurant_id, auth.uid(), v_role, v_action, v_request_id,
    jsonb_build_object('status', v_requested_state, 'expected_cash', v_expected_cash, 'actual_cash', v_actual, 'difference', v_difference, 'customer_credit_today', v_credit_master_total, 'customer_credit_entries', v_credit_entries_sanitized)
  );

  RETURN jsonb_build_object('closing', to_jsonb(v_saved), 'idempotent', false, 'finalized_transition', v_transitioned);
END;
$$;

REVOKE ALL ON FUNCTION public.erp_save_sales_closing(jsonb, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_save_sales_closing(jsonb, uuid, uuid) TO authenticated;

COMMIT;
