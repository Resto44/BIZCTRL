BEGIN;

-- Sales Closing ERP runtime hardening. This migration is deliberately additive:
-- it preserves every historical daily_sales row and introduces canonical tables,
-- lifecycle values, append-only audit records, and one atomic save RPC for future
-- sessions.

ALTER TABLE public.daily_sales
  ADD COLUMN IF NOT EXISTS business_date date,
  ADD COLUMN IF NOT EXISTS actual_cash numeric,
  ADD COLUMN IF NOT EXISTS expected_cash numeric,
  ADD COLUMN IF NOT EXISTS closing_request_id uuid,
  ADD COLUMN IF NOT EXISTS payment_reconciliation_json jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.daily_sales
  DROP CONSTRAINT IF EXISTS daily_sales_closing_state_valid;

ALTER TABLE public.daily_sales
  ADD CONSTRAINT daily_sales_closing_state_valid
  CHECK (closing_state = ANY (ARRAY[
    'draft'::text,
    'ready'::text,
    'finalized'::text,
    'correction_requested'::text,
    'corrected'::text,
    'cancelled'::text,
    -- Retained solely for historical rows created before the explicit lifecycle.
    'locked'::text
  ]));

ALTER TABLE public.daily_sales
  ADD CONSTRAINT daily_sales_payment_reconciliation_array
  CHECK (jsonb_typeof(payment_reconciliation_json) = 'array');

CREATE TABLE IF NOT EXISTS public.sales_closing_source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id uuid NOT NULL REFERENCES public.daily_sales(id) ON DELETE RESTRICT,
  source_id uuid,
  source_name_snapshot text NOT NULL,
  today_amount numeric NOT NULL DEFAULT 0 CHECK (today_amount >= 0),
  historical_before_closing numeric NOT NULL DEFAULT 0 CHECK (historical_before_closing >= 0),
  total_after_closing numeric NOT NULL DEFAULT 0 CHECK (total_after_closing >= 0),
  payment_bucket text NOT NULL DEFAULT 'other',
  included_in_revenue boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (closing_id, source_id)
);

CREATE TABLE IF NOT EXISTS public.sales_closing_payment_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id uuid NOT NULL REFERENCES public.daily_sales(id) ON DELETE RESTRICT,
  payment_method text NOT NULL,
  expected_amount numeric NOT NULL DEFAULT 0 CHECK (expected_amount >= 0),
  actual_amount numeric,
  difference_amount numeric,
  variance_status text NOT NULL DEFAULT 'pending' CHECK (variance_status IN ('pending', 'balanced', 'shortage', 'overage')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (closing_id, payment_method)
);

CREATE TABLE IF NOT EXISTS public.sales_closing_cash_reconciliations (
  closing_id uuid PRIMARY KEY REFERENCES public.daily_sales(id) ON DELETE RESTRICT,
  opening_cash numeric NOT NULL DEFAULT 0,
  cash_sales numeric NOT NULL DEFAULT 0,
  cash_in numeric NOT NULL DEFAULT 0,
  cash_out numeric NOT NULL DEFAULT 0,
  cash_expenses numeric NOT NULL DEFAULT 0,
  cash_deposits numeric NOT NULL DEFAULT 0,
  approved_adjustments numeric NOT NULL DEFAULT 0,
  expected_cash numeric NOT NULL DEFAULT 0,
  actual_cash numeric,
  difference_amount numeric,
  variance_status text NOT NULL DEFAULT 'pending' CHECK (variance_status IN ('pending', 'balanced', 'shortage', 'overage')),
  variance_note text,
  manager_approved boolean NOT NULL DEFAULT false,
  manager_approved_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_closing_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id uuid NOT NULL REFERENCES public.daily_sales(id) ON DELETE RESTRICT,
  restaurant_id text NOT NULL,
  actor_id uuid,
  actor_role text,
  action text NOT NULL,
  request_id uuid,
  field_name text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_closing_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id uuid NOT NULL REFERENCES public.daily_sales(id) ON DELETE RESTRICT,
  restaurant_id text NOT NULL,
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  fields_requested_for_change jsonb NOT NULL DEFAULT '[]'::jsonb,
  old_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by uuid,
  approved_at timestamptz,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'applied')),
  UNIQUE (closing_id, status) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX IF NOT EXISTS sales_closing_source_snapshots_closing_idx
  ON public.sales_closing_source_snapshots (closing_id);
CREATE INDEX IF NOT EXISTS sales_closing_payment_reconciliation_closing_idx
  ON public.sales_closing_payment_reconciliations (closing_id);
CREATE INDEX IF NOT EXISTS sales_closing_audit_log_closing_created_idx
  ON public.sales_closing_audit_log (closing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_closing_correction_requests_closing_idx
  ON public.sales_closing_correction_requests (closing_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS daily_sales_business_session_idx
  ON public.daily_sales (restaurant_id, business_date, branch_id, shift, cashier_id)
  WHERE business_date IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS daily_sales_closing_request_id_idx
  ON public.daily_sales (restaurant_id, closing_request_id)
  WHERE closing_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.erp_closing_audit_log_is_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'SALES_CLOSING_AUDIT_IMMUTABLE'
    USING DETAIL = 'Sales Closing audit events are append-only and cannot be changed or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS sales_closing_audit_log_no_update ON public.sales_closing_audit_log;
CREATE TRIGGER sales_closing_audit_log_no_update
  BEFORE UPDATE OR DELETE ON public.sales_closing_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.erp_closing_audit_log_is_append_only();

-- Historical financial values are immutable after finalization unless an
-- explicitly authorized server transaction is performing a correction workflow.
CREATE OR REPLACE FUNCTION public.erp_guard_sales_closing_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.closing_state IN ('finalized', 'correction_requested', 'corrected', 'locked') THEN
    RAISE EXCEPTION 'SALES_CLOSING_HISTORY_IMMUTABLE';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.closing_state IN ('finalized', 'correction_requested', 'corrected', 'locked')
     AND current_setting('app.sales_closing_transaction', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'SALES_CLOSING_HISTORY_IMMUTABLE'
      USING DETAIL = 'Finalized sales closings can only change through an authorized correction transaction.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS erp_guard_sales_closing_history ON public.daily_sales;
CREATE TRIGGER erp_guard_sales_closing_history
  BEFORE UPDATE OR DELETE ON public.daily_sales
  FOR EACH ROW EXECUTE FUNCTION public.erp_guard_sales_closing_history();

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

  IF jsonb_typeof(v_sources) <> 'array' OR jsonb_typeof(v_payments) <> 'array' THEN
    RAISE EXCEPTION 'SALES_CLOSING_PAYLOAD_INVALID';
  END IF;

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
      sales_notes, restaurant_cash, cash, restaurant_network, network, credit, custom_sources_total, sales_sources_json,
      payment_reconciliation_json, opening_cash, expected_cash, actual_cash, closing_cash, cash_difference, cash_status,
      cash_notes, owner_cash_injection, manager_approval, manager_approved_by, approved_purchases_total, expenses_total,
      operating_result, closing_state, finalized_at, finalized_by, closing_request_id, created_by, created_date, updated_date
    ) VALUES (
      v_restaurant_id, v_date, v_date, v_branch, v_branch_id, v_shift, v_cashier_id,
      COALESCE(p_payload ->> 'cashier_employee_id', v_cashier_id::text), COALESCE(v_cashier_name, ''),
      COALESCE(p_payload ->> 'sales_notes', ''), v_manual_cash + v_cash_source_total, v_manual_cash + v_cash_source_total,
      v_network, v_network, v_credit, v_other, v_sources, v_payments, v_opening, v_expected_cash, v_actual,
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
  SELECT
    v_saved.id,
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
  SELECT
    v_saved.id,
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

  INSERT INTO public.sales_closing_audit_log (
    closing_id, restaurant_id, actor_id, actor_role, action, request_id, new_value
  ) VALUES (
    v_saved.id, v_restaurant_id, auth.uid(), v_role, v_action, v_request_id,
    jsonb_build_object('status', v_requested_state, 'expected_cash', v_expected_cash, 'actual_cash', v_actual, 'difference', v_difference)
  );

  RETURN jsonb_build_object('closing', to_jsonb(v_saved), 'idempotent', false, 'finalized_transition', v_transitioned);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_request_sales_closing_correction(
  p_closing_id uuid,
  p_reason text,
  p_fields jsonb DEFAULT '[]'::jsonb,
  p_old_values jsonb DEFAULT '{}'::jsonb,
  p_new_values jsonb DEFAULT '{}'::jsonb
)
RETURNS public.sales_closing_correction_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closing public.daily_sales%ROWTYPE;
  v_request public.sales_closing_correction_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_closing FROM public.daily_sales WHERE id = p_closing_id FOR UPDATE;
  IF NOT FOUND OR v_closing.closing_state NOT IN ('finalized', 'correction_requested', 'corrected', 'locked') THEN
    RAISE EXCEPTION 'SALES_CLOSING_CORRECTION_NOT_AVAILABLE';
  END IF;
  IF NOT public.erp_can_write_scope(v_closing.restaurant_id::uuid, v_closing.branch_id) THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
  END IF;
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_CORRECTION_REASON_REQUIRED';
  END IF;

  PERFORM set_config('app.sales_closing_transaction', 'on', true);
  INSERT INTO public.sales_closing_correction_requests (
    closing_id, restaurant_id, requested_by, reason, fields_requested_for_change, old_values, new_values
  ) VALUES (
    v_closing.id, v_closing.restaurant_id, auth.uid(), p_reason, COALESCE(p_fields, '[]'::jsonb), COALESCE(p_old_values, '{}'::jsonb), COALESCE(p_new_values, '{}'::jsonb)
  ) RETURNING * INTO v_request;

  UPDATE public.daily_sales
  SET closing_state = 'correction_requested', updated_date = now()
  WHERE id = v_closing.id;

  INSERT INTO public.sales_closing_audit_log (
    closing_id, restaurant_id, actor_id, actor_role, action, reason, new_value
  ) VALUES (
    v_closing.id, v_closing.restaurant_id, auth.uid(), lower(COALESCE(public.erp_current_role(), '')),
    'correction_requested', p_reason, jsonb_build_object('correction_request_id', v_request.id)
  );

  RETURN v_request;
END;
$$;

ALTER TABLE public.sales_closing_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_closing_payment_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_closing_cash_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_closing_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_closing_correction_requests ENABLE ROW LEVEL SECURITY;

-- Direct browser writes are not allowed. Authorized writes run through the
-- SECURITY DEFINER transactions above; select scope follows the daily_sales row.
DROP POLICY IF EXISTS sales_closing_source_snapshot_read ON public.sales_closing_source_snapshots;
CREATE POLICY sales_closing_source_snapshot_read ON public.sales_closing_source_snapshots
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.daily_sales d WHERE d.id = closing_id AND public.erp_can_write_scope(d.restaurant_id::uuid, d.branch_id)));
DROP POLICY IF EXISTS sales_closing_payment_reconciliation_read ON public.sales_closing_payment_reconciliations;
CREATE POLICY sales_closing_payment_reconciliation_read ON public.sales_closing_payment_reconciliations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.daily_sales d WHERE d.id = closing_id AND public.erp_can_write_scope(d.restaurant_id::uuid, d.branch_id)));
DROP POLICY IF EXISTS sales_closing_cash_reconciliation_read ON public.sales_closing_cash_reconciliations;
CREATE POLICY sales_closing_cash_reconciliation_read ON public.sales_closing_cash_reconciliations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.daily_sales d WHERE d.id = closing_id AND public.erp_can_write_scope(d.restaurant_id::uuid, d.branch_id)));
DROP POLICY IF EXISTS sales_closing_audit_log_read ON public.sales_closing_audit_log;
CREATE POLICY sales_closing_audit_log_read ON public.sales_closing_audit_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.daily_sales d WHERE d.id = closing_id AND public.erp_can_write_scope(d.restaurant_id::uuid, d.branch_id)));
DROP POLICY IF EXISTS sales_closing_correction_request_read ON public.sales_closing_correction_requests;
CREATE POLICY sales_closing_correction_request_read ON public.sales_closing_correction_requests
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.daily_sales d WHERE d.id = closing_id AND public.erp_can_write_scope(d.restaurant_id::uuid, d.branch_id)));

REVOKE ALL ON TABLE public.sales_closing_source_snapshots, public.sales_closing_payment_reconciliations, public.sales_closing_cash_reconciliations, public.sales_closing_audit_log, public.sales_closing_correction_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.sales_closing_source_snapshots, public.sales_closing_payment_reconciliations, public.sales_closing_cash_reconciliations, public.sales_closing_audit_log, public.sales_closing_correction_requests FROM authenticated;
REVOKE ALL ON FUNCTION public.erp_save_sales_closing(jsonb, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_save_sales_closing(jsonb, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.erp_request_sales_closing_correction(uuid, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_request_sales_closing_correction(uuid, text, jsonb, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.erp_save_sales_closing(jsonb, uuid, uuid) IS
  'Atomic, idempotent Sales Closing save/finalize transaction with canonical cash reconciliation, immutable source snapshots, child reconciliations, and append-only audit event.';

COMMIT;
