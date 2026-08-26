-- Sales Closing wallet-first settlement and fixed-expense allocation.
-- This migration extends the existing canonical Closing / cash ledger model. It
-- does not introduce a parallel settlement system: Branch Wallet uses the
-- established wallet_transactions ledger, while owner funding continues through
-- the existing canonical cash_movements owner_injection path.

ALTER TABLE public.daily_sales
  ADD COLUMN IF NOT EXISTS fixed_expenses_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variable_expenses_total numeric NOT NULL DEFAULT 0;

ALTER TABLE public.cash_shortages
  ADD COLUMN IF NOT EXISTS wallet_payment_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_payment_transaction_id uuid NULL REFERENCES public.wallet_transactions(id) ON DELETE RESTRICT;

ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS monthly_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allocation_days integer NOT NULL DEFAULT 30;

ALTER TABLE public.expense_categories
  DROP CONSTRAINT IF EXISTS expense_categories_allocation_days_check;
ALTER TABLE public.expense_categories
  ADD CONSTRAINT expense_categories_allocation_days_check CHECK (allocation_days BETWEEN 1 AND 366);

CREATE TABLE IF NOT EXISTS public.sales_closing_settlement_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id uuid NOT NULL REFERENCES public.daily_sales(id) ON DELETE RESTRICT,
  closing_version integer NOT NULL,
  settlement_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (closing_id, closing_version)
);

ALTER TABLE public.sales_closing_settlement_snapshots ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_transactions_closing_settlement
  ON public.wallet_transactions (reference_id, transaction_type)
  WHERE transaction_type = 'closing_settlement';

CREATE OR REPLACE FUNCTION public.erp_guard_sales_closing_settlement_snapshot_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RAISE EXCEPTION 'SALES_CLOSING_SETTLEMENT_SNAPSHOT_IMMUTABLE';
END;
$function$;

DROP TRIGGER IF EXISTS trg_sales_closing_settlement_snapshot_immutable ON public.sales_closing_settlement_snapshots;
CREATE TRIGGER trg_sales_closing_settlement_snapshot_immutable
BEFORE UPDATE OR DELETE ON public.sales_closing_settlement_snapshots
FOR EACH ROW EXECUTE FUNCTION public.erp_guard_sales_closing_settlement_snapshot_immutable();

CREATE OR REPLACE FUNCTION public.erp_sales_closing_expense_context(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_branch text,
  p_date date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH fixed AS (
    SELECT COALESCE(SUM(
      round(GREATEST(COALESCE(category.monthly_amount, 0), 0) / GREATEST(COALESCE(category.allocation_days, 30), 1), 2)
    ), 0) AS fixed_expense_today
    FROM public.expense_categories AS category
    WHERE category.restaurant_id = p_restaurant_id
      AND COALESCE(category.is_active, true) = true
      AND COALESCE(category.is_fixed, false) = true
  ), variable AS (
    SELECT COALESCE(SUM(GREATEST(COALESCE(expense.amount, 0), 0)), 0) AS variable_expenses_today
    FROM public.expenses AS expense
    LEFT JOIN public.expense_categories AS category
      ON category.id = COALESCE(expense.expense_category_id, expense.category_id)
    WHERE expense.restaurant_id = p_restaurant_id
      AND expense.date = p_date
      AND (expense.branch_id = p_branch_id OR (expense.branch_id IS NULL AND expense.branch_key = p_branch))
      AND COALESCE(category.is_fixed, false) = false
  )
  SELECT jsonb_build_object(
    'fixed_expense_today', fixed.fixed_expense_today,
    'variable_expenses_today', variable.variable_expenses_today,
    'total_daily_expenses', fixed.fixed_expense_today + variable.variable_expenses_today
  )
  FROM fixed CROSS JOIN variable;
$function$;

CREATE OR REPLACE FUNCTION public.erp_sales_closing_branch_wallet_balance(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_branch text
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT GREATEST(COALESCE(SUM(
    CASE WHEN transaction.direction = 'out' THEN -GREATEST(COALESCE(transaction.amount, 0), 0)
         ELSE GREATEST(COALESCE(transaction.amount, 0), 0)
    END
  ), 0), 0)
  FROM public.wallet_transactions AS transaction
  WHERE transaction.restaurant_id = p_restaurant_id
    AND transaction.wallet = 'branch_cash'
    AND (transaction.branch_id = p_branch_id OR (transaction.branch_id IS NULL AND transaction.branch = p_branch));
$function$;

CREATE OR REPLACE FUNCTION public.erp_apply_sales_closing_wallet_settlement(
  p_closing_id uuid,
  p_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_closing public.daily_sales%ROWTYPE;
  v_shortage public.cash_shortages%ROWTYPE;
  v_existing_wallet_tx public.wallet_transactions%ROWTYPE;
  v_wallet_available numeric := 0;
  v_wallet_applied numeric := 0;
  v_owner_required numeric := 0;
  v_role text := lower(COALESCE(public.erp_current_role(), ''));
  v_request_id uuid := COALESCE(p_request_id, gen_random_uuid());
BEGIN
  SELECT * INTO v_closing FROM public.daily_sales WHERE id = p_closing_id FOR UPDATE;
  IF NOT FOUND OR v_closing.closing_state <> 'finalized' THEN
    RAISE EXCEPTION 'SALES_CLOSING_FINALIZED_REQUIRED';
  END IF;

  IF NOT public.erp_can_write_scope(v_closing.restaurant_id::uuid, v_closing.branch_id) THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
  END IF;

  -- Serialise each branch wallet before calculating its available balance. This
  -- prevents concurrent finalizations from spending the same balance twice.
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|', 'sales_closing_wallet', v_closing.restaurant_id, v_closing.branch_id::text), 0));

  SELECT * INTO v_shortage
  FROM public.cash_shortages
  WHERE closing_id = p_closing_id
    AND type = 'Shortage'
  FOR UPDATE;

  IF NOT FOUND OR GREATEST(COALESCE(v_shortage.shortage_amount, 0), 0) = 0 THEN
    RETURN jsonb_build_object('required_funding', 0, 'wallet_applied', 0, 'owner_required', 0, 'status', 'No funding required');
  END IF;

  SELECT * INTO v_existing_wallet_tx
  FROM public.wallet_transactions
  WHERE reference_id = p_closing_id::text
    AND transaction_type = 'closing_settlement'
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_wallet_applied := GREATEST(COALESCE(v_existing_wallet_tx.amount, 0), 0);
  ELSE
    v_wallet_available := public.erp_sales_closing_branch_wallet_balance(v_closing.restaurant_id::uuid, v_closing.branch_id, v_closing.branch);
    v_wallet_applied := LEAST(GREATEST(COALESCE(v_shortage.shortage_amount, 0), 0), v_wallet_available);
    IF v_wallet_applied > 0 THEN
      INSERT INTO public.wallet_transactions (
        transaction_date, transaction_type, flow_type, direction, wallet, branch, branch_id,
        amount, payment_method, description, reference_id, auto_generated, recorded_by,
        created_by, restaurant_id, tenant_id
      ) VALUES (
        v_closing.date, 'closing_settlement', 'closing_settlement', 'out', 'branch_cash', v_closing.branch, v_closing.branch_id,
        v_wallet_applied, 'cash', 'Branch Wallet Closing Settlement', p_closing_id::text, true, auth.uid()::text,
        auth.uid()::text, v_closing.restaurant_id::uuid, COALESCE(v_closing.tenant_id, v_closing.restaurant_id)
      ) RETURNING * INTO v_existing_wallet_tx;
    END IF;
  END IF;

  v_owner_required := GREATEST(GREATEST(COALESCE(v_shortage.shortage_amount, 0), 0) - v_wallet_applied, 0);

  UPDATE public.cash_shortages
     SET wallet_payment_amount = v_wallet_applied,
         wallet_payment_transaction_id = CASE WHEN v_wallet_applied > 0 THEN v_existing_wallet_tx.id ELSE NULL END,
         owner_settlement_required = v_owner_required,
         responsible_party = CASE WHEN v_owner_required > 0 THEN 'owner' ELSE 'branch_wallet' END,
         status = CASE
           WHEN COALESCE(owner_payment_amount, 0) >= v_owner_required THEN 'Resolved'
           ELSE 'Pending'
         END,
         updated_date = now()
   WHERE id = v_shortage.id
   RETURNING * INTO v_shortage;

  INSERT INTO public.sales_closing_audit_log (closing_id, restaurant_id, actor_id, actor_role, action, request_id, new_value)
  VALUES (
    p_closing_id, v_closing.restaurant_id, auth.uid(), v_role, 'branch_wallet_settlement_applied', v_request_id,
    jsonb_build_object(
      'required_funding', v_shortage.shortage_amount,
      'branch_wallet_available', v_wallet_available,
      'branch_wallet_applied', v_wallet_applied,
      'owner_payment_required', v_owner_required,
      'wallet_transaction_id', CASE WHEN v_wallet_applied > 0 THEN v_existing_wallet_tx.id ELSE NULL END
    )
  );

  INSERT INTO public.sales_closing_settlement_snapshots (closing_id, closing_version, settlement_snapshot)
  VALUES (
    p_closing_id,
    v_closing.closing_version,
    jsonb_build_object(
      'required_funding', v_shortage.shortage_amount,
      'branch_wallet_available', v_wallet_available,
      'branch_wallet_applied', v_wallet_applied,
      'owner_payment_required', v_owner_required,
      'owner_payment_amount', v_shortage.owner_payment_amount,
      'settlement_status', v_shortage.status,
      'wallet_transaction_id', CASE WHEN v_wallet_applied > 0 THEN v_existing_wallet_tx.id ELSE NULL END,
      'owner_payment_movement_id', v_shortage.owner_payment_movement_id
    )
  ) ON CONFLICT (closing_id, closing_version) DO NOTHING;

  RETURN jsonb_build_object(
    'required_funding', v_shortage.shortage_amount,
    'branch_wallet_available', v_wallet_available,
    'branch_wallet_applied', v_wallet_applied,
    'owner_payment_required', v_owner_required,
    'wallet_remaining', GREATEST(v_wallet_available - v_wallet_applied, 0),
    'status', v_shortage.status
  );
END;
$function$;

DO $migration$
DECLARE
  v_save_definition text;
  v_context_definition text;
  v_opening_definition text;
  v_declarations text := $old_declarations$
  v_closing_version integer := 0;
$old_declarations$;
  v_new_declarations text := $new_declarations$
  v_closing_version integer := 0;
  v_fixed_expenses numeric := 0;
  v_variable_expenses numeric := 0;
  v_expense_context jsonb := '{}'::jsonb;
$new_declarations$;
  v_version_marker text := $old_version_marker$
  IF v_requested_state = 'finalized' THEN
    INSERT INTO public.sales_closing_finalized_versions (
$old_version_marker$;
  v_version_replacement text := $new_version_marker$
  -- Recompute daily costs on the server. Client totals are display hints only;
  -- fixed monthly allocation and variable daily expense totals are canonical here.
  v_expense_context := public.erp_sales_closing_expense_context(v_restaurant_uuid, v_branch_id, v_branch, v_date);
  v_fixed_expenses := GREATEST(COALESCE((v_expense_context ->> 'fixed_expense_today')::numeric, 0), 0);
  v_variable_expenses := GREATEST(COALESCE((v_expense_context ->> 'variable_expenses_today')::numeric, 0), 0);
  UPDATE public.daily_sales
     SET fixed_expenses_total = v_fixed_expenses,
         variable_expenses_total = v_variable_expenses,
         expenses_total = v_fixed_expenses + v_variable_expenses,
         operating_result = COALESCE(restaurant_cash, 0) + COALESCE(restaurant_network, 0)
           + COALESCE(credit, 0) + COALESCE(custom_sources_total, 0)
           - COALESCE(approved_purchases_total, 0) - v_fixed_expenses - v_variable_expenses,
         updated_date = now()
   WHERE id = v_saved.id
   RETURNING * INTO v_saved;

  IF v_requested_state = 'finalized' THEN
    INSERT INTO public.sales_closing_finalized_versions (
$new_version_marker$;
  v_settlement_marker text := $old_settlement_marker$
  INSERT INTO public.sales_closing_audit_log (
$old_settlement_marker$;
  v_settlement_replacement text := $new_settlement_marker$
  -- Settle only on the one draft-to-finalized transition. Later authorized
  -- finalized edits create a new immutable version but never re-debit a wallet.
  IF v_requested_state = 'finalized' AND v_transitioned THEN
    PERFORM public.erp_apply_sales_closing_wallet_settlement(v_saved.id, v_request_id);
    SELECT * INTO v_saved FROM public.daily_sales WHERE id = v_saved.id;
  END IF;

  INSERT INTO public.sales_closing_audit_log (
$new_settlement_marker$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_save_definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'erp_save_sales_closing'
    AND pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb, p_closing_id uuid, p_request_id uuid'
  LIMIT 1;

  IF v_save_definition IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_SAVE_ROUTINE_MISSING';
  END IF;

  v_save_definition := replace(v_save_definition, v_declarations, v_new_declarations);
  v_save_definition := replace(v_save_definition, v_version_marker, v_version_replacement);
  v_save_definition := replace(v_save_definition, v_settlement_marker, v_settlement_replacement);
  IF position('erp_apply_sales_closing_wallet_settlement' IN v_save_definition) = 0
     OR position('v_requested_state = ''finalized'' AND v_transitioned' IN v_save_definition) = 0
     OR position('fixed_expenses_total = v_fixed_expenses' IN v_save_definition) = 0
     OR position('variable_expenses_total = v_variable_expenses' IN v_save_definition) = 0 THEN
    RAISE EXCEPTION 'SALES_CLOSING_WALLET_FIRST_SAVE_ROUTINE_PATCH_FAILED';
  END IF;
  EXECUTE v_save_definition;

  SELECT pg_get_functiondef(p.oid) INTO v_opening_definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'erp_sales_closing_opening_cash'
  LIMIT 1;
  IF v_opening_definition IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_OPENING_CASH_ROUTINE_MISSING';
  END IF;
  v_opening_definition := replace(
    v_opening_definition,
    'COALESCE((SELECT shortage.owner_payment_amount FROM public.cash_shortages AS shortage WHERE shortage.closing_id = previous_closing.id), 0)',
    'COALESCE((SELECT shortage.owner_payment_amount + COALESCE(shortage.wallet_payment_amount, 0) FROM public.cash_shortages AS shortage WHERE shortage.closing_id = previous_closing.id), 0)'
  );
  IF position('wallet_payment_amount' IN v_opening_definition) = 0 THEN
    RAISE EXCEPTION 'SALES_CLOSING_OPENING_CASH_WALLET_PATCH_FAILED';
  END IF;
  EXECUTE v_opening_definition;

  SELECT pg_get_functiondef(p.oid) INTO v_context_definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'erp_sales_closing_cash_context'
  LIMIT 1;
  IF v_context_definition IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_CONTEXT_ROUTINE_MISSING';
  END IF;
  v_context_definition := replace(
    v_context_definition,
    $$    'owner_settlement', COALESCE(v_settlement, '{}'::jsonb)
  );$$,
    $$    'owner_settlement', COALESCE(v_settlement, '{}'::jsonb),
    'branch_wallet_available', public.erp_sales_closing_branch_wallet_balance(p_restaurant_id, p_branch_id, p_branch),
    'fixed_expense_today', COALESCE((public.erp_sales_closing_expense_context(p_restaurant_id, p_branch_id, p_branch, p_date) ->> 'fixed_expense_today')::numeric, 0),
    'variable_expenses_today', COALESCE((public.erp_sales_closing_expense_context(p_restaurant_id, p_branch_id, p_branch, p_date) ->> 'variable_expenses_today')::numeric, 0)
  );$$
  );
  IF position('branch_wallet_available' IN v_context_definition) = 0
     OR position('fixed_expense_today' IN v_context_definition) = 0 THEN
    RAISE EXCEPTION 'SALES_CLOSING_CONTEXT_WALLET_PATCH_FAILED';
  END IF;
  EXECUTE v_context_definition;
END;
$migration$;

DO $verify$
DECLARE
  v_save_definition text;
  v_context_definition text;
  v_opening_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_save_definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='erp_save_sales_closing'
  LIMIT 1;
  SELECT pg_get_functiondef(p.oid) INTO v_context_definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='erp_sales_closing_cash_context'
  LIMIT 1;
  SELECT pg_get_functiondef(p.oid) INTO v_opening_definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='erp_sales_closing_opening_cash'
  LIMIT 1;

  IF position('erp_apply_sales_closing_wallet_settlement' IN COALESCE(v_save_definition, '')) = 0
     OR position('v_requested_state = ''finalized'' AND v_transitioned' IN COALESCE(v_save_definition, '')) = 0
     OR position('fixed_expenses_total = v_fixed_expenses' IN COALESCE(v_save_definition, '')) = 0
     OR position('branch_wallet_available' IN COALESCE(v_context_definition, '')) = 0
     OR position('wallet_payment_amount' IN COALESCE(v_opening_definition, '')) = 0 THEN
    RAISE EXCEPTION 'SALES_CLOSING_WALLET_FIRST_MIGRATION_VERIFICATION_FAILED';
  END IF;
END;
$verify$;
