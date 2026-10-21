-- ERP Cash Closing: verifiable physical cash carry-forward.
-- No historical postings are deleted, backfilled or modified.
-- One branch can have multiple cashiers/drawers in a shift, so ambiguous
-- predecessors never default to 0 or to a random cashier's balance.

CREATE OR REPLACE FUNCTION public.erp_sales_closing_opening_context(
  p_restaurant_id uuid, p_branch_id uuid, p_branch text,
  p_date date, p_shift text, p_cashier_id uuid,
  p_current_closing_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_previous_date date;
  v_previous_rank integer;
  v_candidates integer := 0;
  v_cashier_matches integer := 0;
  v_previous public.daily_sales%ROWTYPE;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR p_restaurant_id IS NULL OR p_branch_id IS NULL OR p_date IS NULL
     OR NOT public.erp_can_access_scope_text(p_restaurant_id::text, p_branch_id::text)
  THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
  END IF;

  -- A shift is an ordered physical count: compare the business date and the
  -- morning/evening phase, not the UUID or time at which a row was edited.
  SELECT previous.date,
         CASE lower(COALESCE(previous.shift, ''))
           WHEN 'morning' THEN 1 WHEN 'evening' THEN 2 ELSE 0 END
  INTO v_previous_date, v_previous_rank
  FROM public.daily_sales previous
  WHERE previous.restaurant_id = p_restaurant_id::text
    AND (previous.branch_id = p_branch_id
      OR (previous.branch_id IS NULL AND previous.branch = p_branch))
    AND previous.id IS DISTINCT FROM p_current_closing_id
    AND previous.closing_state = 'finalized'
    AND (
      previous.date < p_date
      OR (previous.date = p_date
          AND CASE lower(COALESCE(previous.shift, ''))
                WHEN 'morning' THEN 1 WHEN 'evening' THEN 2 ELSE 0 END
              < CASE lower(COALESCE(p_shift, ''))
                WHEN 'morning' THEN 1 WHEN 'evening' THEN 2 ELSE 0 END)
    )
  ORDER BY previous.date DESC,
    CASE lower(COALESCE(previous.shift, ''))
      WHEN 'evening' THEN 2 WHEN 'morning' THEN 1 ELSE 0 END DESC,
    previous.updated_date DESC, previous.id DESC
  LIMIT 1;

  IF v_previous_date IS NULL THEN
    RETURN jsonb_build_object(
      'opening_cash', 0, 'opening_status', 'initial_zero',
      'opening_verified', true, 'opening_source', 'no_prior_finalized_shift',
      'opening_prior_count', 0, 'opening_shift_date', NULL,
      'opening_shift', NULL
    );
  END IF;

  SELECT count(*) INTO v_candidates
  FROM public.daily_sales p
  WHERE p.restaurant_id = p_restaurant_id::text
    AND (p.branch_id = p_branch_id
      OR (p.branch_id IS NULL AND p.branch = p_branch))
    AND p.id IS DISTINCT FROM p_current_closing_id
    AND p.closing_state = 'finalized'
    AND p.date = v_previous_date
    AND CASE lower(COALESCE(p.shift, ''))
          WHEN 'morning' THEN 1 WHEN 'evening' THEN 2 ELSE 0 END
        = v_previous_rank;

  IF v_candidates = 1 THEN
    SELECT * INTO v_previous
    FROM public.daily_sales p
    WHERE p.restaurant_id = p_restaurant_id::text
      AND (p.branch_id = p_branch_id
        OR (p.branch_id IS NULL AND p.branch = p_branch))
      AND p.id IS DISTINCT FROM p_current_closing_id
      AND p.closing_state = 'finalized'
      AND p.date = v_previous_date
      AND CASE lower(COALESCE(p.shift, ''))
            WHEN 'morning' THEN 1 WHEN 'evening' THEN 2 ELSE 0 END
          = v_previous_rank
    LIMIT 1;
  ELSIF p_cashier_id IS NOT NULL THEN
    -- Multiple distinct drawers: carry forward the same cashier only if the
    -- latest shift has exactly one unambiguous matching closing.
    SELECT count(*) INTO v_cashier_matches
    FROM public.daily_sales p
    WHERE p.restaurant_id = p_restaurant_id::text
      AND (p.branch_id = p_branch_id
        OR (p.branch_id IS NULL AND p.branch = p_branch))
      AND p.id IS DISTINCT FROM p_current_closing_id
      AND p.closing_state = 'finalized'
      AND p.date = v_previous_date
      AND CASE lower(COALESCE(p.shift, ''))
            WHEN 'morning' THEN 1 WHEN 'evening' THEN 2 ELSE 0 END
          = v_previous_rank
      AND COALESCE(p.cashier_id::text, p.cashier_employee_id) = p_cashier_id::text;

    IF v_cashier_matches = 1 THEN
      SELECT * INTO v_previous
      FROM public.daily_sales p
      WHERE p.restaurant_id = p_restaurant_id::text
        AND (p.branch_id = p_branch_id
          OR (p.branch_id IS NULL AND p.branch = p_branch))
        AND p.id IS DISTINCT FROM p_current_closing_id
        AND p.closing_state = 'finalized'
        AND p.date = v_previous_date
        AND CASE lower(COALESCE(p.shift, ''))
              WHEN 'morning' THEN 1 WHEN 'evening' THEN 2 ELSE 0 END
            = v_previous_rank
        AND COALESCE(p.cashier_id::text, p.cashier_employee_id) = p_cashier_id::text
      LIMIT 1;
    END IF;
  END IF;

  IF v_previous.id IS NULL THEN
    RETURN jsonb_build_object(
      'opening_cash', NULL, 'opening_status', 'ambiguous_previous_shift',
      'opening_verified', false, 'opening_source', 'multiple_drawers_need_review',
      'opening_prior_count', v_candidates,
      'opening_shift_date', v_previous_date,
      'opening_shift', CASE v_previous_rank WHEN 1 THEN 'Morning'
                                          WHEN 2 THEN 'Evening' ELSE 'Other' END
    );
  END IF;

  IF v_previous.actual_cash IS NULL
    OR v_previous.actual_cash < 0
    OR round(v_previous.actual_cash, 2) IS DISTINCT FROM v_previous.actual_cash
  THEN
    RETURN jsonb_build_object(
      'opening_cash', NULL, 'opening_status', 'previous_count_missing',
      'opening_verified', false, 'opening_source', 'finalized_closing_without_verified_actual',
      'opening_prior_count', v_candidates,
      'opening_shift_date', v_previous_date, 'opening_shift', v_previous.shift
    );
  END IF;

  -- Physical Count is the only certified carry-forward balance. Legacy
  -- closing_cash, cash sales, wallet settlements and owner funding cannot be
  -- substituted for a missing actual_cash.
  RETURN jsonb_build_object(
    'opening_cash', v_previous.actual_cash,
    'opening_status', 'verified_previous',
    'opening_verified', true,
    'opening_source', CASE WHEN v_candidates > 1 THEN 'same_cashier_count'
                           ELSE 'single_branch_shift_count' END,
    'opening_prior_count', v_candidates,
    'opening_shift_date', v_previous_date,
    'opening_shift', v_previous.shift
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.erp_sales_closing_opening_context(uuid,uuid,text,date,text,uuid,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_sales_closing_opening_context(uuid,uuid,text,date,text,uuid,uuid)
  TO authenticated;

-- Existing saving routines already call this entrypoint. The explicit
-- exception makes it impossible to persist a fabricated zero opening on an
-- unverified/ambiguous predecessor.
CREATE OR REPLACE FUNCTION public.erp_sales_closing_opening_cash(
  p_restaurant_id uuid, p_branch_id uuid, p_branch text,
  p_date date, p_shift text, p_cashier_id uuid,
  p_current_closing_id uuid DEFAULT NULL
)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_status jsonb;
BEGIN
  v_status := public.erp_sales_closing_opening_context(
    p_restaurant_id, p_branch_id, p_branch, p_date, p_shift, p_cashier_id,
    p_current_closing_id
  );
  IF COALESCE(v_status ->> 'opening_verified', 'false') <> 'true' THEN
    RAISE EXCEPTION 'SALES_CLOSING_OPENING_RECONCILIATION_REQUIRED'
      USING HINT = 'Review prior physical cash count or ambiguous shift register; no zero balance was inferred.';
  END IF;
  RETURN (v_status ->> 'opening_cash')::numeric;
END;
$function$;

-- Preserve the existing scoped movements and settlement reads, adding
-- transparent provenance so the UI can display a warning without losing
-- access to its previous cash reconciliation context.
CREATE OR REPLACE FUNCTION public.erp_sales_closing_cash_context(
  p_restaurant_id uuid, p_branch_id uuid, p_branch text,
  p_date date, p_shift text, p_cashier_id uuid,
  p_closing_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_opening_context jsonb;
  v_movements jsonb;
  v_cash_in numeric;
  v_cash_out numeric;
  v_settlement jsonb;
  v_expenses jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.erp_can_access_scope_text(p_restaurant_id::text, p_branch_id::text)
  THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
  END IF;

  v_opening_context := public.erp_sales_closing_opening_context(
    p_restaurant_id, p_branch_id, p_branch, p_date, p_shift, p_cashier_id,
    p_closing_id
  );

  SELECT COALESCE(jsonb_agg(to_jsonb(movement)
                            ORDER BY movement.posted_at, movement.created_date), '[]'::jsonb),
         COALESCE(SUM(CASE WHEN movement.direction = 'in' THEN movement.amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN movement.direction = 'out' THEN movement.amount ELSE 0 END), 0)
    INTO v_movements, v_cash_in, v_cash_out
  FROM public.cash_movements movement
  WHERE movement.restaurant_id = p_restaurant_id
    AND (movement.branch_id = p_branch_id OR
        (movement.branch_id IS NULL AND movement.branch = p_branch))
    AND movement.date = p_date
    AND (movement.shift = p_shift OR movement.shift IS NULL)
    AND (movement.cashier_id = p_cashier_id OR movement.cashier_id IS NULL)
    AND COALESCE(movement.is_reversed, false) = false
    AND movement.source_record_id IS DISTINCT FROM p_closing_id::text;

  SELECT to_jsonb(shortage) INTO v_settlement
  FROM public.cash_shortages shortage
  WHERE shortage.closing_id = p_closing_id
  ORDER BY shortage.created_date DESC
  LIMIT 1;

  v_expenses := public.erp_sales_closing_expense_context(
    p_restaurant_id, p_branch_id, p_branch, p_date
  );

  RETURN v_opening_context || jsonb_build_object(
    'cash_in', v_cash_in,
    'cash_out', v_cash_out,
    'movements', v_movements,
    'owner_settlement', COALESCE(v_settlement, '{}'::jsonb),
    'branch_wallet_available',
      public.erp_sales_closing_branch_wallet_balance(p_restaurant_id, p_branch_id, p_branch),
    'fixed_expense_today', COALESCE((v_expenses ->> 'fixed_expense_today')::numeric, 0),
    'variable_expenses_today', COALESCE((v_expenses ->> 'variable_expenses_today')::numeric, 0)
  );
END;
$function$;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'erp_sales_closing_opening_context'
      AND position('ambiguous_previous_shift' IN pg_get_functiondef(p.oid)) > 0
      AND position('previous_count_missing' IN pg_get_functiondef(p.oid)) > 0
  ) THEN RAISE EXCEPTION 'CASH_OPENING_CONTEXT_DEPLOY_INCOMPLETE'; END IF;
END;
$verify$;
