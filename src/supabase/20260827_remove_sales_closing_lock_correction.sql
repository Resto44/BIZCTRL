BEGIN;

-- Normal Sales Closing edits are no longer a correction workflow. Retire every
-- active lifecycle guard while retaining append-only financial versions.
DROP TRIGGER IF EXISTS erp_guard_sales_closing_history ON public.daily_sales;
DROP FUNCTION IF EXISTS public.erp_guard_sales_closing_history();
DROP FUNCTION IF EXISTS public.erp_request_sales_closing_correction(uuid, text, jsonb, jsonb, jsonb);
DROP POLICY IF EXISTS sales_closing_correction_request_read ON public.sales_closing_correction_requests;
REVOKE ALL ON TABLE public.sales_closing_correction_requests FROM anon, authenticated;

-- Retain legacy status labels only so existing historical rows remain readable.
-- They are no longer interpreted by any frontend, RPC, trigger, policy, or
-- validation path as a lock or correction requirement. Avoid direct updates to
-- daily_sales here because unrelated Driver Sales ownership triggers protect
-- historical owner attribution.
ALTER TABLE public.daily_sales
  DROP CONSTRAINT IF EXISTS daily_sales_closing_state_valid;
ALTER TABLE public.daily_sales
  ADD CONSTRAINT daily_sales_closing_state_valid
  CHECK (closing_state = ANY (ARRAY[
    'draft'::text,
    'ready'::text,
    'finalized'::text,
    'cancelled'::text,
    'correction_requested'::text,
    'corrected'::text,
    'locked'::text
  ]));

ALTER TABLE public.daily_sales
  ADD COLUMN IF NOT EXISTS closing_version integer NOT NULL DEFAULT 0
  CHECK (closing_version >= 0);

-- A finalized version is immutable history. The editable daily_sales record
-- remains the current working version and can return to draft or finalize again.
CREATE TABLE IF NOT EXISTS public.sales_closing_finalized_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id uuid NOT NULL REFERENCES public.daily_sales(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  restaurant_id text,
  finalized_by uuid,
  finalized_at timestamptz NOT NULL DEFAULT now(),
  closing_snapshot jsonb NOT NULL,
  sales_sources_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_reconciliation_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  credit_entries_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  actual_cash numeric,
  expected_cash numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (closing_id, version)
);

ALTER TABLE public.sales_closing_finalized_versions
  ALTER COLUMN restaurant_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS sales_closing_finalized_versions_closing_idx
  ON public.sales_closing_finalized_versions (closing_id, version DESC);

CREATE OR REPLACE FUNCTION public.erp_guard_sales_closing_finalized_version_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'SALES_CLOSING_VERSION_IMMUTABLE'
    USING DETAIL = 'Finalized Sales Closing versions are append-only.';
END;
$$;

DROP TRIGGER IF EXISTS sales_closing_finalized_versions_no_mutation
  ON public.sales_closing_finalized_versions;
CREATE TRIGGER sales_closing_finalized_versions_no_mutation
  BEFORE UPDATE OR DELETE ON public.sales_closing_finalized_versions
  FOR EACH ROW EXECUTE FUNCTION public.erp_guard_sales_closing_finalized_version_immutable();

-- Preserve the currently finalized record as version 1 before normal editing is
-- enabled. This prevents historical Sales Source and Customer Credit values from
-- being overwritten when a Closing is later reopened.
INSERT INTO public.sales_closing_finalized_versions (
  closing_id,
  version,
  restaurant_id,
  finalized_by,
  finalized_at,
  closing_snapshot,
  sales_sources_json,
  payment_reconciliation_json,
  credit_entries_json,
  actual_cash,
  expected_cash
)
SELECT
  daily_sales.id,
  GREATEST(COALESCE(daily_sales.closing_version, 0), 1),
  daily_sales.restaurant_id,
  CASE WHEN daily_sales.finalized_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN daily_sales.finalized_by::uuid ELSE NULL END,
  COALESCE(daily_sales.finalized_at, daily_sales.updated_date, now()),
  to_jsonb(daily_sales),
  CASE WHEN jsonb_typeof(COALESCE(daily_sales.sales_sources_json, '[]'::jsonb)) = 'array'
    THEN COALESCE(daily_sales.sales_sources_json, '[]'::jsonb) ELSE '[]'::jsonb END,
  CASE WHEN jsonb_typeof(COALESCE(daily_sales.payment_reconciliation_json, '[]'::jsonb)) = 'array'
    THEN COALESCE(daily_sales.payment_reconciliation_json, '[]'::jsonb) ELSE '[]'::jsonb END,
  CASE WHEN jsonb_typeof(COALESCE(daily_sales.credit_entries_json, '[]'::jsonb)) = 'array'
    THEN COALESCE(daily_sales.credit_entries_json, '[]'::jsonb) ELSE '[]'::jsonb END,
  daily_sales.actual_cash,
  daily_sales.expected_cash
FROM public.daily_sales
WHERE daily_sales.closing_state IN ('finalized', 'correction_requested', 'corrected', 'locked')
ON CONFLICT (closing_id, version) DO NOTHING;

-- Replace only the canonical save function’s retired lifecycle branch and add
-- append-only versioning. All scope checks, required-field validation, cash
-- reconciliation, idempotency, source persistence, and Customer Master checks
-- remain inside the same SECURITY DEFINER transaction.
DO $migration$
DECLARE
  v_definition text;
  v_old_guard text := $old_guard$
  IF v_has_existing AND v_existing.closing_state IN ('finalized', 'correction_requested', 'corrected', 'locked') THEN
    RAISE EXCEPTION 'SALES_CLOSING_HISTORY_IMMUTABLE'
      USING DETAIL = 'Use the correction request workflow for a finalized closing.';
  END IF;$old_guard$;
  v_old_declarations text := $old_declarations$
  v_has_existing boolean := false;$old_declarations$;
  v_new_declarations text := $new_declarations$
  v_has_existing boolean := false;
  v_prior_credit_entries jsonb := '[]'::jsonb;
  v_prior_customer_today numeric := 0;
  v_closing_version integer := 0;$new_declarations$;
  v_old_found text := $old_found$
  v_has_existing := FOUND;

  IF v_has_existing AND v_existing.closing_request_id = v_request_id THEN$old_found$;
  v_new_found text := $new_found$
  v_has_existing := FOUND;
  IF v_has_existing THEN
    SELECT COALESCE(version_row.credit_entries_json, '[]'::jsonb)
      INTO v_prior_credit_entries
      FROM public.sales_closing_finalized_versions AS version_row
      WHERE version_row.closing_id = v_existing.id
      ORDER BY version_row.version DESC
      LIMIT 1;
  END IF;
  IF v_requested_state = 'finalized' THEN
    IF v_has_existing THEN
      SELECT COALESCE(MAX(version_row.version), 0) + 1
        INTO v_closing_version
        FROM public.sales_closing_finalized_versions AS version_row
        WHERE version_row.closing_id = v_existing.id;
    ELSE
      v_closing_version := 1;
    END IF;
  ELSIF v_has_existing THEN
    v_closing_version := GREATEST(COALESCE(v_existing.closing_version, 0), 0);
  ELSE
    v_closing_version := 0;
  END IF;

  IF v_has_existing AND v_existing.closing_request_id = v_request_id THEN$new_found$;
  v_old_previous_credit text := $old_previous_credit$
    v_previous_credit := GREATEST(COALESCE(v_customer.outstanding_balance, 0), 0);$old_previous_credit$;
  v_new_previous_credit text := $new_previous_credit$
    v_prior_customer_today := 0;
    IF v_has_existing AND jsonb_array_length(v_prior_credit_entries) > 0 THEN
      SELECT COALESCE(SUM(GREATEST(COALESCE(NULLIF(prior_entry ->> 'today_credit', '')::numeric, NULLIF(prior_entry ->> 'amount', '')::numeric, 0), 0)), 0)
        INTO v_prior_customer_today
        FROM jsonb_array_elements(v_prior_credit_entries) AS prior_entry
        WHERE prior_entry ->> 'customer_id' = v_customer.id::text;
    END IF;
    v_previous_credit := GREATEST(COALESCE(v_customer.outstanding_balance, 0) - v_prior_customer_today, 0);$new_previous_credit$;
  v_old_update_state text := $old_update_state$
        closing_state = v_requested_state,
        finalized_at = CASE WHEN v_requested_state = 'finalized' THEN COALESCE(finalized_at, now()) ELSE NULL END,
        finalized_by = CASE WHEN v_requested_state = 'finalized' THEN auth.uid()::text ELSE '' END,
        closing_request_id = v_request_id,$old_update_state$;
  v_new_update_state text := $new_update_state$
        closing_state = v_requested_state,
        closing_version = v_closing_version,
        finalized_at = CASE WHEN v_requested_state = 'finalized' THEN COALESCE(finalized_at, now()) ELSE finalized_at END,
        finalized_by = CASE WHEN v_requested_state = 'finalized' THEN auth.uid()::text ELSE finalized_by END,
        closing_request_id = v_request_id,$new_update_state$;
  v_old_insert_columns text := $old_insert_columns$
      operating_result, closing_state, finalized_at, finalized_by, closing_request_id, created_by, created_date, updated_date$old_insert_columns$;
  v_new_insert_columns text := $new_insert_columns$
      operating_result, closing_state, closing_version, finalized_at, finalized_by, closing_request_id, created_by, created_date, updated_date$new_insert_columns$;
  v_old_insert_values text := $old_insert_values$
      v_requested_state, CASE WHEN v_requested_state = 'finalized' THEN now() ELSE NULL END,
      CASE WHEN v_requested_state = 'finalized' THEN auth.uid()::text ELSE '' END,
      v_request_id, auth.uid()::text, now(), now()$old_insert_values$;
  v_new_insert_values text := $new_insert_values$
      v_requested_state, v_closing_version, CASE WHEN v_requested_state = 'finalized' THEN now() ELSE NULL END,
      CASE WHEN v_requested_state = 'finalized' THEN auth.uid()::text ELSE '' END,
      v_request_id, auth.uid()::text, now(), now()$new_insert_values$;
  v_old_credit_posting text := $old_credit_posting$
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
  END IF;$old_credit_posting$;
  v_new_credit_posting text := $new_credit_posting$
  IF v_requested_state = 'finalized' THEN
    INSERT INTO public.sales_closing_finalized_versions (
      closing_id, version, restaurant_id, finalized_by, finalized_at, closing_snapshot,
      sales_sources_json, payment_reconciliation_json, credit_entries_json, actual_cash, expected_cash
    ) VALUES (
      v_saved.id, v_closing_version, v_restaurant_id, auth.uid(), now(), to_jsonb(v_saved),
      v_sources, v_payments, v_credit_entries_sanitized, v_actual, v_expected_cash
    );

    -- The original Customer Credit snapshot remains immutable. Each later
    -- finalized version is preserved in the version table above.
    IF NOT EXISTS (
      SELECT 1 FROM public.sales_closing_customer_credit_snapshots AS snapshot
      WHERE snapshot.closing_id = v_saved.id
    ) AND jsonb_array_length(v_credit_snapshot_rows) > 0 THEN
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
    END IF;

    WITH prior_credit AS (
      SELECT prior_entry ->> 'customer_id' AS customer_id,
        SUM(GREATEST(COALESCE(NULLIF(prior_entry ->> 'today_credit', '')::numeric, NULLIF(prior_entry ->> 'amount', '')::numeric, 0), 0)) AS amount
      FROM jsonb_array_elements(v_prior_credit_entries) AS prior_entry
      WHERE NULLIF(BTRIM(prior_entry ->> 'customer_id'), '') IS NOT NULL
      GROUP BY prior_entry ->> 'customer_id'
    ), current_credit AS (
      SELECT current_entry ->> 'customer_id' AS customer_id,
        SUM(GREATEST(COALESCE(NULLIF(current_entry ->> 'today_credit', '')::numeric, NULLIF(current_entry ->> 'amount', '')::numeric, 0), 0)) AS amount
      FROM jsonb_array_elements(v_credit_snapshot_rows) AS current_entry
      WHERE NULLIF(BTRIM(current_entry ->> 'customer_id'), '') IS NOT NULL
      GROUP BY current_entry ->> 'customer_id'
    ), credit_delta AS (
      SELECT COALESCE(prior_credit.customer_id, current_credit.customer_id)::uuid AS customer_id,
        COALESCE(prior_credit.amount, 0) AS previous_amount,
        COALESCE(current_credit.amount, 0) AS current_amount
      FROM prior_credit
      FULL OUTER JOIN current_credit ON current_credit.customer_id = prior_credit.customer_id
    )
    UPDATE public.customers AS customer
    SET outstanding_balance = GREATEST(0, COALESCE(customer.outstanding_balance, 0) - credit_delta.previous_amount) + credit_delta.current_amount,
        total_credit_sales = GREATEST(0, COALESCE(customer.total_credit_sales, 0) - credit_delta.previous_amount) + credit_delta.current_amount,
        last_transaction_date = v_date,
        updated_date = now()
    FROM credit_delta
    WHERE customer.id = credit_delta.customer_id;
  END IF;$new_credit_posting$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'erp_save_sales_closing'
    AND pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb, p_closing_id uuid, p_request_id uuid';

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_SAVE_FUNCTION_NOT_FOUND';
  END IF;

  v_definition := replace(v_definition, v_old_guard, '');
  v_definition := replace(v_definition, v_old_declarations, v_new_declarations);
  v_definition := replace(v_definition, v_old_found, v_new_found);
  v_definition := replace(v_definition, v_old_previous_credit, v_new_previous_credit);
  v_definition := replace(v_definition, v_old_update_state, v_new_update_state);
  v_definition := replace(v_definition, v_old_insert_columns, v_new_insert_columns);
  v_definition := replace(v_definition, v_old_insert_values, v_new_insert_values);
  v_definition := replace(v_definition, v_old_credit_posting, v_new_credit_posting);

  IF position('SALES_CLOSING_HISTORY_IMMUTABLE' IN v_definition) > 0
     OR position('correction request workflow' IN v_definition) > 0
     OR position('v_closing_version integer := 0;' IN v_definition) = 0
     OR position('public.sales_closing_finalized_versions' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'SALES_CLOSING_SAVE_FUNCTION_UNEXPECTED_VERSION';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

COMMIT;
