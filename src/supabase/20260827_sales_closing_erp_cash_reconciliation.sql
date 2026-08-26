BEGIN;

-- Extend the existing canonical cash ledger; do not create a parallel balance.
ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS cashier_id uuid,
  ADD COLUMN IF NOT EXISTS shift text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS source_document_id text;

CREATE INDEX IF NOT EXISTS cash_movements_closing_scope_idx
  ON public.cash_movements (restaurant_id, branch_id, date, shift, cashier_id)
  WHERE COALESCE(is_reversed, false) = false;

ALTER TABLE public.sales_sources
  ADD COLUMN IF NOT EXISTS subcategory text;
ALTER TABLE public.sales_closing_source_snapshots
  ADD COLUMN IF NOT EXISTS subcategory text,
  ADD COLUMN IF NOT EXISTS payment_method text;

ALTER TABLE public.cash_shortages
  ADD COLUMN IF NOT EXISTS closing_id uuid REFERENCES public.daily_sales(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS shift text,
  ADD COLUMN IF NOT EXISTS cashier_id uuid,
  ADD COLUMN IF NOT EXISTS responsible_party text NOT NULL DEFAULT 'owner',
  ADD COLUMN IF NOT EXISTS owner_settlement_required numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS owner_payment_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS owner_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_payment_by uuid,
  ADD COLUMN IF NOT EXISTS owner_payment_movement_id uuid REFERENCES public.cash_movements(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS cash_shortages_closing_id_unique
  ON public.cash_shortages (closing_id)
  WHERE closing_id IS NOT NULL;

-- Append-only snapshot of the exact ledger and owner-settlement state used by a
-- finalized Closing version. Daily fields are never copied into the next day.
CREATE TABLE IF NOT EXISTS public.sales_closing_cash_ledger_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id uuid NOT NULL REFERENCES public.daily_sales(id) ON DELETE RESTRICT,
  closing_version integer NOT NULL CHECK (closing_version > 0),
  ledger_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  reconciliation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_settlement_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (closing_id, closing_version)
);

CREATE OR REPLACE FUNCTION public.erp_guard_sales_closing_cash_ledger_snapshot_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'SALES_CLOSING_CASH_LEDGER_SNAPSHOT_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS sales_closing_cash_ledger_snapshots_no_mutation
  ON public.sales_closing_cash_ledger_snapshots;
CREATE TRIGGER sales_closing_cash_ledger_snapshots_no_mutation
  BEFORE UPDATE OR DELETE ON public.sales_closing_cash_ledger_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.erp_guard_sales_closing_cash_ledger_snapshot_immutable();

CREATE OR REPLACE FUNCTION public.erp_sales_closing_opening_cash(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_branch text,
  p_date date,
  p_shift text,
  p_cashier_id uuid,
  p_current_closing_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT COALESCE(previous_closing.actual_cash, previous_closing.closing_cash, 0)
      + COALESCE((SELECT shortage.owner_payment_amount FROM public.cash_shortages AS shortage WHERE shortage.closing_id = previous_closing.id), 0)
    FROM public.daily_sales AS previous_closing
    WHERE previous_closing.restaurant_id = p_restaurant_id::text
      AND (previous_closing.branch_id = p_branch_id OR (previous_closing.branch_id IS NULL AND previous_closing.branch = p_branch))
      AND previous_closing.id IS DISTINCT FROM p_current_closing_id
      AND previous_closing.closing_state = 'finalized'
      AND (
        previous_closing.date < p_date
        OR (
          previous_closing.date = p_date
          AND CASE lower(COALESCE(previous_closing.shift, '')) WHEN 'morning' THEN 1 WHEN 'evening' THEN 2 ELSE 0 END
              < CASE lower(COALESCE(p_shift, '')) WHEN 'morning' THEN 1 WHEN 'evening' THEN 2 ELSE 0 END
        )
      )
    ORDER BY previous_closing.date DESC,
      CASE lower(COALESCE(previous_closing.shift, '')) WHEN 'evening' THEN 2 WHEN 'morning' THEN 1 ELSE 0 END DESC,
      previous_closing.updated_date DESC
    LIMIT 1
  ), 0);
$$;

CREATE OR REPLACE FUNCTION public.erp_sales_closing_expected_cash(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_branch text,
  p_date date,
  p_shift text,
  p_cashier_id uuid,
  p_current_closing_id uuid,
  p_current_cash_sales numeric
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.erp_sales_closing_opening_cash(
      p_restaurant_id, p_branch_id, p_branch, p_date, p_shift, p_cashier_id, p_current_closing_id
    )
    + COALESCE(SUM(CASE WHEN movement.direction = 'in' THEN movement.amount ELSE -movement.amount END), 0)
    + GREATEST(COALESCE(p_current_cash_sales, 0), 0)
  FROM public.cash_movements AS movement
  WHERE movement.restaurant_id = p_restaurant_id
    AND (movement.branch_id = p_branch_id OR (movement.branch_id IS NULL AND movement.branch = p_branch))
    AND movement.date = p_date
    AND (movement.shift = p_shift OR movement.shift IS NULL)
    AND (movement.cashier_id = p_cashier_id OR movement.cashier_id IS NULL)
    AND COALESCE(movement.is_reversed, false) = false
    AND movement.source_record_id IS DISTINCT FROM p_current_closing_id::text
    -- Owner settlement is a post-close liability payment, never revenue and never
    -- a retroactive change to the Closing's original Expected Cash.
    AND movement.movement_type <> 'owner_settlement_payment';
$$;

CREATE OR REPLACE FUNCTION public.erp_sales_closing_cash_context(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_branch text,
  p_date date,
  p_shift text,
  p_cashier_id uuid,
  p_closing_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening numeric;
  v_movements jsonb;
  v_cash_in numeric;
  v_cash_out numeric;
  v_settlement jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.erp_can_access_scope_text(p_restaurant_id::text, p_branch_id::text) THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
  END IF;

  v_opening := public.erp_sales_closing_opening_cash(
    p_restaurant_id, p_branch_id, p_branch, p_date, p_shift, p_cashier_id, p_closing_id
  );

  SELECT COALESCE(jsonb_agg(to_jsonb(movement) ORDER BY movement.posted_at, movement.created_date), '[]'::jsonb),
         COALESCE(SUM(CASE WHEN movement.direction = 'in' THEN movement.amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN movement.direction = 'out' THEN movement.amount ELSE 0 END), 0)
    INTO v_movements, v_cash_in, v_cash_out
  FROM public.cash_movements AS movement
  WHERE movement.restaurant_id = p_restaurant_id
    AND (movement.branch_id = p_branch_id OR (movement.branch_id IS NULL AND movement.branch = p_branch))
    AND movement.date = p_date
    AND (movement.shift = p_shift OR movement.shift IS NULL)
    AND (movement.cashier_id = p_cashier_id OR movement.cashier_id IS NULL)
    AND COALESCE(movement.is_reversed, false) = false
    AND movement.source_record_id IS DISTINCT FROM p_closing_id::text;

  SELECT to_jsonb(shortage)
    INTO v_settlement
  FROM public.cash_shortages AS shortage
  WHERE shortage.closing_id = p_closing_id
  ORDER BY shortage.created_date DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'opening_cash', v_opening,
    'cash_in', v_cash_in,
    'cash_out', v_cash_out,
    'movements', v_movements,
    'owner_settlement', COALESCE(v_settlement, '{}'::jsonb)
  );
END;
$$;

-- The original cash-movement trigger already creates the Sales cash row. This
-- after-trigger enriches that existing row with the exact Closing scope and then
-- writes an immutable ledger snapshot only after that row is available.
CREATE OR REPLACE FUNCTION public.erp_enrich_sales_closing_cash_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version integer;
BEGIN
  IF NEW.closing_state <> 'finalized' THEN
    RETURN NEW;
  END IF;

  UPDATE public.cash_movements
     SET branch_id = NEW.branch_id,
         cashier_id = NEW.cashier_id,
         shift = NEW.shift,
         payment_method = 'cash',
         source_document_id = NEW.id::text,
         tenant_id = COALESCE(NEW.tenant_id, NEW.restaurant_id),
         updated_date = now()
   WHERE source_module = 'Sales'
     AND source_record_id = NEW.id::text
     AND movement_type = 'cash_sale'
     AND COALESCE(is_reversed, false) = false;

  SELECT version INTO v_version
  FROM public.sales_closing_finalized_versions
  WHERE closing_id = NEW.id
  ORDER BY version DESC
  LIMIT 1;

  IF v_version IS NOT NULL THEN
    INSERT INTO public.sales_closing_cash_ledger_snapshots (
      closing_id, closing_version, ledger_snapshot, reconciliation_snapshot, owner_settlement_snapshot
    )
    SELECT NEW.id,
      v_version,
      COALESCE((SELECT jsonb_agg(to_jsonb(movement) ORDER BY movement.posted_at, movement.created_date)
        FROM public.cash_movements AS movement
        WHERE movement.restaurant_id = NEW.restaurant_id::uuid
          AND movement.branch_id = NEW.branch_id
          AND movement.date = NEW.date
          AND movement.shift = NEW.shift
          AND movement.cashier_id = NEW.cashier_id
          AND COALESCE(movement.is_reversed, false) = false), '[]'::jsonb),
      jsonb_build_object(
        'opening_cash', NEW.opening_cash,
        'expected_cash', NEW.expected_cash,
        'actual_cash', NEW.actual_cash,
        'difference', NEW.cash_difference,
        'variance_status', NEW.cash_status,
        'revenue', NEW.total,
        'cash_sales', NEW.restaurant_cash,
        'non_cash_sales', COALESCE(NEW.restaurant_network, 0),
        'customer_credit', COALESCE(NEW.credit, 0),
        'operating_result', NEW.operating_result
      ),
      COALESCE((SELECT to_jsonb(shortage) FROM public.cash_shortages AS shortage WHERE shortage.closing_id = NEW.id), '{}'::jsonb)
    ON CONFLICT (closing_id, closing_version) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_erp_enrich_sales_closing_cash_ledger ON public.daily_sales;
CREATE TRIGGER zzz_erp_enrich_sales_closing_cash_ledger
  AFTER INSERT OR UPDATE ON public.daily_sales
  FOR EACH ROW EXECUTE FUNCTION public.erp_enrich_sales_closing_cash_ledger();

CREATE OR REPLACE FUNCTION public.erp_record_sales_closing_owner_payment(
  p_closing_id uuid,
  p_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closing public.daily_sales%ROWTYPE;
  v_shortage public.cash_shortages%ROWTYPE;
  v_movement public.cash_movements%ROWTYPE;
  v_role text := lower(COALESCE(public.erp_current_role(), ''));
  v_request_id uuid := COALESCE(p_request_id, gen_random_uuid());
  v_amount numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SALES_CLOSING_AUTH_REQUIRED'; END IF;
  SELECT * INTO v_closing FROM public.daily_sales WHERE id = p_closing_id FOR UPDATE;
  IF NOT FOUND OR v_closing.closing_state <> 'finalized' THEN
    RAISE EXCEPTION 'SALES_CLOSING_FINALIZED_REQUIRED';
  END IF;
  IF NOT public.erp_can_write_scope(v_closing.restaurant_id::uuid, v_closing.branch_id) THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
  END IF;
  IF v_role NOT IN ('owner', 'general_manager', 'manager', 'branch_manager') THEN
    RAISE EXCEPTION 'SALES_CLOSING_OWNER_SETTLEMENT_DENIED';
  END IF;

  SELECT * INTO v_shortage FROM public.cash_shortages
  WHERE closing_id = p_closing_id FOR UPDATE;
  IF NOT FOUND OR COALESCE(v_shortage.owner_settlement_required, 0) <= COALESCE(v_shortage.owner_payment_amount, 0) THEN
    RAISE EXCEPTION 'SALES_CLOSING_OWNER_SETTLEMENT_NOT_REQUIRED';
  END IF;

  v_amount := v_shortage.owner_settlement_required - v_shortage.owner_payment_amount;
  INSERT INTO public.cash_movements (
    date, branch, branch_id, restaurant_id, created_by, direction, amount, movement_type,
    payment_method, source_module, source_record_id, source_document_id, description,
    posted_by, posted_by_name, cashier_id, shift, tenant_id
  ) VALUES (
    v_closing.date, v_closing.branch, v_closing.branch_id, v_closing.restaurant_id::uuid,
    auth.uid()::text, 'in', v_amount, 'owner_settlement_payment', 'cash',
    'OwnerSettlement', v_shortage.id::text, p_closing_id::text,
    'Owner payment for Sales Closing shortage', auth.uid()::text, auth.uid()::text,
    v_closing.cashier_id, v_closing.shift, COALESCE(v_closing.tenant_id, v_closing.restaurant_id)
  ) RETURNING * INTO v_movement;

  UPDATE public.cash_shortages
     SET owner_payment_amount = owner_payment_amount + v_amount,
         owner_payment_at = now(),
         owner_payment_by = auth.uid(),
         owner_payment_movement_id = v_movement.id,
         status = 'Paid',
         reviewed_by = auth.uid()::text,
         reviewed_at = now(),
         updated_date = now()
   WHERE id = v_shortage.id;

  INSERT INTO public.sales_closing_audit_log (closing_id, restaurant_id, actor_id, actor_role, action, request_id, new_value)
  VALUES (p_closing_id, v_closing.restaurant_id, auth.uid(), v_role, 'owner_settlement_paid', v_request_id,
    jsonb_build_object('shortage_id', v_shortage.id, 'movement_id', v_movement.id, 'amount', v_amount));

  RETURN jsonb_build_object('movement', to_jsonb(v_movement), 'amount', v_amount, 'status', 'Paid');
END;
$$;

-- Make the canonical Closing RPC derive opening/expected physical cash from the
-- ledger. It no longer trusts client-provided opening cash or a revenue field.
DO $migration$
DECLARE
  v_original text;
  v_definition text;
  v_old_expected text := $old_expected$
  v_expected_cash := v_opening + v_manual_cash + v_cash_source_total;$old_expected$;
  v_new_expected text := $new_expected$
  v_opening := public.erp_sales_closing_opening_cash(
    v_restaurant_uuid, v_branch_id, v_branch, v_date, v_shift, v_cashier_id,
    CASE WHEN v_has_existing THEN v_existing.id ELSE p_closing_id END
  );
  v_expected_cash := public.erp_sales_closing_expected_cash(
    v_restaurant_uuid, v_branch_id, v_branch, v_date, v_shift, v_cashier_id,
    CASE WHEN v_has_existing THEN v_existing.id ELSE p_closing_id END,
    v_manual_cash + v_cash_source_total
  );$new_expected$;
  v_old_manager_gate text := $old_manager_gate$
    IF v_difference IS DISTINCT FROM 0
       AND COALESCE((p_payload ->> 'manager_approval')::boolean, false) = false THEN
      RAISE EXCEPTION 'SALES_CLOSING_MANAGER_APPROVAL_REQUIRED';
    END IF;$old_manager_gate$;
  v_new_manager_gate text := $new_manager_gate$
    -- Variances remain visible and are separately posted as shortage/overage.
    -- They do not rewrite sales or require the retired correction workflow.$new_manager_gate$;
  v_old_source_snapshot_columns text := $old_source_snapshot_columns$
    closing_id, source_id, source_name_snapshot, today_amount, historical_before_closing, total_after_closing, payment_bucket, included_in_revenue$old_source_snapshot_columns$;
  v_new_source_snapshot_columns text := $new_source_snapshot_columns$
    closing_id, source_id, source_name_snapshot, today_amount, historical_before_closing, total_after_closing, payment_bucket, payment_method, subcategory, included_in_revenue$new_source_snapshot_columns$;
  v_old_source_snapshot_values text := $old_source_snapshot_values$
    COALESCE(NULLIF(entry ->> 'payment_bucket', ''), NULLIF(entry ->> 'default_payment_method', ''), 'other'),
    COALESCE((entry ->> 'included_in_revenue')::boolean, true)$old_source_snapshot_values$;
  v_new_source_snapshot_values text := $new_source_snapshot_values$
    COALESCE(NULLIF(entry ->> 'payment_bucket', ''), NULLIF(entry ->> 'default_payment_method', ''), 'other'),
    COALESCE(NULLIF(entry ->> 'payment_method', ''), NULLIF(entry ->> 'default_payment_method', ''), 'cash'),
    NULLIF(entry ->> 'subcategory', ''),
    COALESCE((entry ->> 'included_in_revenue')::boolean, true)$new_source_snapshot_values$;
  v_old_audit text := $old_audit$
  INSERT INTO public.sales_closing_audit_log ($old_audit$;
  v_new_audit text := $new_audit$
  IF v_requested_state = 'finalized' THEN
    INSERT INTO public.cash_shortages (
      closing_id, date, branch, branch_id, shift, cashier_id, restaurant_id, created_by,
      expected_amount, actual_amount, shortage_amount, overage_amount, type, status,
      responsible_party, owner_settlement_required, owner_payment_amount, reported_by
    ) VALUES (
      v_saved.id, v_date, v_branch, v_branch_id, v_shift, v_cashier_id, v_restaurant_uuid, auth.uid()::text,
      v_expected_cash, COALESCE(v_actual, 0), GREATEST(-COALESCE(v_difference, 0), 0), GREATEST(COALESCE(v_difference, 0), 0),
      CASE WHEN COALESCE(v_difference, 0) < 0 THEN 'Shortage' WHEN COALESCE(v_difference, 0) > 0 THEN 'Overage' ELSE 'Balanced' END,
      CASE WHEN COALESCE(v_difference, 0) < 0 THEN 'Unpaid' WHEN COALESCE(v_difference, 0) > 0 THEN 'Recorded' ELSE 'Balanced' END,
      'owner', GREATEST(-COALESCE(v_difference, 0), 0), 0, auth.uid()::text
    ) ON CONFLICT (closing_id) WHERE closing_id IS NOT NULL DO UPDATE SET
      expected_amount = EXCLUDED.expected_amount,
      actual_amount = EXCLUDED.actual_amount,
      shortage_amount = EXCLUDED.shortage_amount,
      overage_amount = EXCLUDED.overage_amount,
      type = EXCLUDED.type,
      status = CASE WHEN public.cash_shortages.owner_payment_amount >= EXCLUDED.owner_settlement_required THEN 'Paid' ELSE EXCLUDED.status END,
      owner_settlement_required = EXCLUDED.owner_settlement_required,
      updated_date = now();
  END IF;

  IF v_requested_state = 'finalized' THEN
    INSERT INTO public.sales_closing_cash_ledger_snapshots (
      closing_id, closing_version, ledger_snapshot, reconciliation_snapshot, owner_settlement_snapshot
    )
    SELECT v_saved.id, v_closing_version,
      COALESCE((SELECT jsonb_agg(to_jsonb(movement) ORDER BY movement.posted_at, movement.created_date)
        FROM public.cash_movements AS movement
        WHERE movement.restaurant_id = v_restaurant_uuid
          AND movement.branch_id = v_branch_id
          AND movement.date = v_date
          AND movement.shift = v_shift
          AND movement.cashier_id = v_cashier_id
          AND COALESCE(movement.is_reversed, false) = false), '[]'::jsonb),
      jsonb_build_object(
        'opening_cash', v_opening,
        'expected_cash', v_expected_cash,
        'actual_cash', v_actual,
        'difference', v_difference,
        'variance_status', v_variance_status,
        'revenue', v_saved.total,
        'cash_sales', v_saved.restaurant_cash,
        'non_cash_sales', COALESCE(v_saved.restaurant_network, 0),
        'customer_credit', COALESCE(v_saved.credit, 0),
        'operating_result', v_saved.operating_result
      ),
      COALESCE((SELECT to_jsonb(shortage) FROM public.cash_shortages AS shortage WHERE shortage.closing_id = v_saved.id), '{}'::jsonb)
    ON CONFLICT (closing_id, closing_version) DO NOTHING;
  END IF;

  INSERT INTO public.sales_closing_audit_log ($new_audit$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_original
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'erp_save_sales_closing'
    AND pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb, p_closing_id uuid, p_request_id uuid';
  IF v_original IS NULL THEN RAISE EXCEPTION 'SALES_CLOSING_SAVE_FUNCTION_NOT_FOUND'; END IF;

  v_definition := replace(v_original, v_old_expected, v_new_expected);
  v_definition := replace(v_definition, v_old_manager_gate, v_new_manager_gate);
  v_definition := replace(v_definition, v_old_source_snapshot_columns, v_new_source_snapshot_columns);
  v_definition := replace(v_definition, v_old_source_snapshot_values, v_new_source_snapshot_values);
  v_definition := replace(v_definition, v_old_audit, v_new_audit);
  IF v_definition = v_original
     OR position('erp_sales_closing_expected_cash' IN v_definition) = 0
     OR position('cash_shortages' IN v_definition) = 0
     OR position('payment_method, subcategory, included_in_revenue' IN v_definition) = 0
     OR position('SALES_CLOSING_MANAGER_APPROVAL_REQUIRED' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'SALES_CLOSING_CASH_RECONCILIATION_FUNCTION_UNEXPECTED_VERSION';
  END IF;
  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.erp_sales_closing_cash_context(uuid, uuid, text, date, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_sales_closing_cash_context(uuid, uuid, text, date, text, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.erp_record_sales_closing_owner_payment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_record_sales_closing_owner_payment(uuid, uuid) TO authenticated;

COMMIT;
