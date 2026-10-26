-- Independent incremental closing sessions; legacy finalized records stay intact.
ALTER TABLE public.daily_sales ADD COLUMN IF NOT EXISTS closing_session_id uuid;
ALTER TABLE public.daily_sales ADD COLUMN IF NOT EXISTS closing_session_no integer;
ALTER TABLE public.daily_sales ADD COLUMN IF NOT EXISTS previous_closing_id uuid REFERENCES public.daily_sales(id);
ALTER TABLE public.daily_sales ADD COLUMN IF NOT EXISTS session_closed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS daily_sales_session_token_unique ON public.daily_sales(restaurant_id, closing_session_id) WHERE closing_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.erp_closing_session_cutoff(closing_id uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE(d.session_closed_at,(SELECT max(v.finalized_at) FROM public.sales_closing_finalized_versions v WHERE v.closing_id=d.id),d.finalized_at)
 FROM public.daily_sales d WHERE d.id=closing_id;
$$;
REVOKE ALL ON FUNCTION public.erp_closing_session_cutoff(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.erp_closing_predecessor(r uuid,b uuid,k text,d date,s text,c uuid,current_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid; current_row public.daily_sales;
BEGIN
 IF auth.uid() IS NULL OR NOT public.erp_can_access_scope_text(r::text,b::text) THEN RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED'; END IF;
 IF current_id IS NOT NULL THEN
  SELECT * INTO current_row FROM public.daily_sales WHERE id=current_id AND restaurant_id=r::text AND branch_id=b;
  IF NOT FOUND THEN RAISE EXCEPTION 'SALES_CLOSING_BRANCH_CONTEXT_MISMATCH'; END IF;
  IF current_row.closing_session_id IS NOT NULL THEN RETURN current_row.previous_closing_id; END IF;
  RETURN NULL;
 END IF;
 SELECT id INTO result FROM public.daily_sales p WHERE p.restaurant_id=r::text
 AND (p.branch_id=b OR (p.branch_id IS NULL AND p.branch=k)) AND p.closing_state='finalized'
 AND (p.date<d OR (p.date=d AND CASE lower(p.shift) WHEN 'evening' THEN 2 ELSE 1 END <= CASE lower(s) WHEN 'evening' THEN 2 ELSE 1 END))
 AND (p.cashier_id=c OR p.cashier_id IS NULL)
 ORDER BY p.date DESC, CASE lower(p.shift) WHEN 'evening' THEN 2 ELSE 1 END DESC, COALESCE(p.closing_session_no,1) DESC, p.finalized_at DESC, p.id DESC LIMIT 1;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.erp_closing_predecessor(uuid,uuid,text,date,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_closing_predecessor(uuid,uuid,text,date,text,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.erp_closing_movement_after_previous(r uuid,b uuid,k text,d date,s text,c uuid,current_id uuid,movement_time timestamptz)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE predecessor public.daily_sales;
BEGIN
 SELECT * INTO predecessor FROM public.daily_sales WHERE id=public.erp_closing_predecessor(r,b,k,d,s,c,current_id);
 RETURN predecessor.id IS NULL OR predecessor.date<>d OR movement_time>public.erp_closing_session_cutoff(predecessor.id);
END $$;
REVOKE ALL ON FUNCTION public.erp_closing_movement_after_previous(uuid,uuid,text,date,text,uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.erp_closing_session_costs(r uuid,b uuid,k text,d date,current_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE costs jsonb; used_fixed numeric; used_variable numeric; used_purchases numeric; purchases numeric;
BEGIN
 costs:=public.erp_sales_closing_expense_context(r,b,k,d);
 SELECT COALESCE(sum(fixed_expenses_total),0),COALESCE(sum(variable_expenses_total),0),COALESCE(sum(approved_purchases_total),0)
 INTO used_fixed,used_variable,used_purchases FROM public.daily_sales
 WHERE restaurant_id=r::text AND (branch_id=b OR (branch_id IS NULL AND branch=k)) AND date=d AND closing_state='finalized' AND id IS DISTINCT FROM current_id;
 SELECT COALESCE(sum(total_amount),0) INTO purchases FROM public.supplier_invoices
 WHERE restaurant_id=r AND (branch_id=b OR (branch_id IS NULL AND branch=k)) AND date=d AND approval_status IN ('approved','auto_approved');
 RETURN jsonb_build_object('fixed_expense_today',greatest(0,(costs->>'fixed_expense_today')::numeric-used_fixed),
 'variable_expenses_today',greatest(0,(costs->>'variable_expenses_today')::numeric-used_variable),
 'approved_purchases_total',greatest(0,purchases-used_purchases));
END $$;
REVOKE ALL ON FUNCTION public.erp_closing_session_costs(uuid,uuid,text,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_closing_session_costs(uuid,uuid,text,date,uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.erp_sales_closing_opening_context(p_restaurant_id uuid, p_branch_id uuid, p_branch text, p_date date, p_shift text, p_cashier_id uuid, p_current_closing_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_previous_date date;
  v_previous_rank integer;
  v_candidates integer := 0;
  v_cashier_matches integer := 0;
  v_previous public.daily_sales%ROWTYPE;
  v_verification public.sales_closing_opening_verifications%ROWTYPE;
  v_result jsonb;
  v_session_previous public.daily_sales;
BEGIN
  IF auth.uid() IS NULL
     OR p_restaurant_id IS NULL OR p_branch_id IS NULL OR p_date IS NULL
     OR NOT public.erp_can_access_scope_text(p_restaurant_id::text, p_branch_id::text)
  THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
  END IF;

  SELECT * INTO v_session_previous FROM public.daily_sales WHERE id=public.erp_closing_predecessor(p_restaurant_id,p_branch_id,p_branch,p_date,p_shift,p_cashier_id,p_current_closing_id);
  IF v_session_previous.id IS NOT NULL THEN
    RETURN jsonb_build_object('opening_cash',v_session_previous.actual_cash,
      'opening_status','verified_previous','opening_verified',v_session_previous.actual_cash IS NOT NULL,
      'opening_source','previous_closing_session','opening_prior_count',1,
      'opening_shift_date',v_session_previous.date,'opening_shift',v_session_previous.shift,
      'previous_closing_id',v_session_previous.id,'previous_finalized_at',public.erp_closing_session_cutoff(v_session_previous.id));
  END IF;

  -- Manual opening verification is immutable and owner-authorized. It can
  -- resolve an initial drawer count or an ambiguous/legacy predecessor without
  -- rewriting old sales, wallet or cash-movement rows.
  SELECT * INTO v_verification
  FROM public.sales_closing_opening_verifications v
  WHERE v.restaurant_id = p_restaurant_id AND v.branch_id = p_branch_id
    AND v.date = p_date AND lower(v.shift) = lower(p_shift)
    AND v.cashier_id = p_cashier_id
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'opening_cash', v_verification.counted_cash,
      'opening_status', 'manual_verified_opening',
      'opening_verified', true,
      'opening_source', 'owner_verified_drawer_count',
      'opening_verification_id', v_verification.id,
      'opening_verified_at', v_verification.verified_at,
      'opening_prior_count', NULL,
      'opening_shift_date', NULL,
      'opening_shift', NULL
    );
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
      'opening_cash', NULL, 'opening_status', 'initial_opening_required',
      'opening_verified', false, 'opening_source', 'first_shift_requires_count',
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


CREATE OR REPLACE FUNCTION public.erp_sales_closing_expected_cash(p_restaurant_id uuid, p_branch_id uuid, p_branch text, p_date date, p_shift text, p_cashier_id uuid, p_current_closing_id uuid, p_current_cash_sales numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_opening numeric;
  v_cash_flow numeric;
  v_expected numeric;
BEGIN
  v_opening := public.erp_sales_closing_opening_cash(
    p_restaurant_id, p_branch_id, p_branch, p_date, p_shift, p_cashier_id,
    p_current_closing_id
  );

  SELECT COALESCE(SUM(CASE WHEN movement.direction = 'in' THEN movement.amount
                           WHEN movement.direction = 'out' THEN -movement.amount
                           ELSE 0 END), 0)
    INTO v_cash_flow
  FROM public.cash_movements movement
  WHERE movement.restaurant_id = p_restaurant_id
    AND (movement.branch_id = p_branch_id
      OR (movement.branch_id IS NULL AND movement.branch = p_branch))
    AND movement.date = p_date
    AND (movement.shift = p_shift OR movement.shift IS NULL)
    AND (movement.cashier_id = p_cashier_id OR movement.cashier_id IS NULL)
    AND COALESCE(movement.is_reversed,false) = false
    AND public.erp_closing_movement_after_previous(p_restaurant_id,p_branch_id,p_branch,p_date,p_shift,p_cashier_id,p_current_closing_id,COALESCE(movement.posted_at,movement.created_date))
    AND movement.source_record_id IS DISTINCT FROM p_current_closing_id::text
    AND NOT (movement.movement_type = 'owner_injection'
      AND movement.source_module = 'OwnerCashInjection'
      AND p_current_closing_id IS NOT NULL AND movement.source_document_id IS NOT NULL AND movement.source_document_id = p_current_closing_id::text);

  v_expected := round(v_opening + v_cash_flow
    + GREATEST(COALESCE(p_current_cash_sales, 0), 0), 2);
  IF v_expected < 0 THEN
    RAISE EXCEPTION 'SALES_CLOSING_CASH_LEDGER_OVERDRAWN'
      USING HINT = 'Reconcile cash withdrawals and properly posted funding movements before finalizing.';
  END IF;
  RETURN v_expected;
END;
$function$;


CREATE OR REPLACE FUNCTION public.erp_sales_closing_cash_context(p_restaurant_id uuid, p_branch_id uuid, p_branch text, p_date date, p_shift text, p_cashier_id uuid, p_closing_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
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
    AND public.erp_closing_movement_after_previous(p_restaurant_id,p_branch_id,p_branch,p_date,p_shift,p_cashier_id,p_closing_id,COALESCE(movement.posted_at,movement.created_date))
    AND movement.source_record_id IS DISTINCT FROM p_closing_id::text;

  SELECT to_jsonb(shortage) INTO v_settlement
  FROM public.cash_shortages shortage
  WHERE shortage.closing_id = p_closing_id
  ORDER BY shortage.created_date DESC
  LIMIT 1;

  v_expenses := public.erp_closing_session_costs(p_restaurant_id,p_branch_id,p_branch,p_date,p_closing_id);

  RETURN v_opening_context || jsonb_build_object(
    'approved_purchases_total',v_expenses->'approved_purchases_total',
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


CREATE OR REPLACE FUNCTION public.erp_save_sales_closing_core_legacy_customer_balance(p_payload jsonb, p_closing_id uuid DEFAULT NULL::uuid, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_session_uuid uuid := NULLIF(p_payload->>'closing_session_id','')::uuid;
  v_previous_session uuid;
  v_session_no integer;

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
  v_prior_credit_entries jsonb := '[]'::jsonb;
  v_prior_customer_today numeric := 0;
  v_closing_version integer := 0;
  v_fixed_expenses numeric := 0;
  v_variable_expenses numeric := 0;
  v_expense_context jsonb := '{}'::jsonb;
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

  PERFORM public.erp_sales_closing_assert_existing_branch_context(p_closing_id, v_restaurant_id, v_branch_id, v_branch);

  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|','closing-day',v_restaurant_id,v_branch_id::text,v_date::text),0));
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|', v_restaurant_id, v_branch_id::text, v_date::text, lower(v_shift), v_cashier_id::text), 0));
  PERFORM set_config('app.sales_closing_transaction', 'on', true);

  SELECT * INTO v_existing
  FROM public.daily_sales
  WHERE restaurant_id = v_restaurant_id
    AND (
      id = p_closing_id
      OR closing_request_id = v_request_id
      OR (v_session_uuid IS NOT NULL AND closing_session_id=v_session_uuid)
      OR (v_session_uuid IS NULL AND branch_id = v_branch_id AND date = v_date AND lower(BTRIM(shift)) = lower(v_shift) AND cashier_id = v_cashier_id)
    )
  ORDER BY CASE WHEN id = p_closing_id THEN 0 WHEN closing_request_id = v_request_id THEN 1 ELSE 2 END
  LIMIT 1
  FOR UPDATE;
  v_has_existing := FOUND;
  IF v_has_existing AND (v_existing.branch_id IS DISTINCT FROM v_branch_id OR v_existing.date IS DISTINCT FROM v_date OR lower(v_existing.shift) IS DISTINCT FROM lower(v_shift) OR v_existing.cashier_id IS DISTINCT FROM v_cashier_id) THEN RAISE EXCEPTION 'SALES_CLOSING_BRANCH_CONTEXT_MISMATCH'; END IF;
  IF v_has_existing THEN v_session_uuid:=COALESCE(v_existing.closing_session_id,v_session_uuid); END IF;
  IF v_has_existing AND p_closing_id IS NULL AND v_session_uuid IS NOT NULL AND v_existing.closing_state='finalized' THEN
    RETURN jsonb_build_object('closing',to_jsonb(v_existing),'idempotent',true,'finalized_transition',false);
  END IF;
  IF v_has_existing AND EXISTS(SELECT 1 FROM public.daily_sales WHERE previous_closing_id=v_existing.id AND closing_state='finalized') THEN
    RAISE EXCEPTION 'SALES_CLOSING_HAS_LATER_SESSION';
  END IF;
  v_previous_session:=public.erp_closing_predecessor(v_restaurant_uuid,v_branch_id,v_branch,v_date,v_shift,v_cashier_id,NULL);
  IF NOT v_has_existing AND v_session_uuid IS NOT NULL AND v_previous_session IS DISTINCT FROM NULLIF(p_payload->>'previous_closing_id','')::uuid THEN
    RAISE EXCEPTION 'SALES_CLOSING_SESSION_CHANGED';
  END IF;
  SELECT COALESCE(max(COALESCE(closing_session_no,1)),0)+1 INTO v_session_no FROM public.daily_sales
   WHERE restaurant_id=v_restaurant_id AND branch_id=v_branch_id AND date=v_date;

  IF v_has_existing THEN
    SELECT COALESCE(version_row.credit_entries_json, '[]'::jsonb)
      INTO v_prior_credit_entries
      FROM public.sales_closing_finalized_versions AS version_row
      WHERE version_row.closing_id = v_existing.id
      ORDER BY version_row.version DESC
      LIMIT 1;
  END IF;
  IF v_has_existing THEN
    SELECT COALESCE(MAX(version_row.version), 0)
      INTO v_closing_version
      FROM public.sales_closing_finalized_versions AS version_row
      WHERE version_row.closing_id = v_existing.id;
    IF v_requested_state = 'finalized' THEN
      v_closing_version := v_closing_version + 1;
    END IF;
  ELSIF v_requested_state = 'finalized' THEN
    v_closing_version := 1;
  ELSE
    v_closing_version := 0;
  END IF;

  IF v_has_existing AND v_existing.closing_request_id = v_request_id THEN
    RETURN jsonb_build_object('closing', to_jsonb(v_existing), 'idempotent', true, 'finalized_transition', false);
  END IF;

  IF v_requested_state = 'draft' AND v_has_existing
     AND (v_existing.closing_state IN ('finalized','locked','corrected')
       OR COALESCE(v_closing_version, 0) > 0) THEN
    RAISE EXCEPTION 'SALES_CLOSING_FINALIZED_DRAFT_DENIED'
      USING HINT = 'Open the finalized closing from History. A posted closing cannot become a draft.';
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

    v_prior_customer_today := 0;
    IF v_has_existing AND jsonb_array_length(v_prior_credit_entries) > 0 THEN
      SELECT COALESCE(SUM(GREATEST(COALESCE(NULLIF(prior_entry ->> 'today_credit', '')::numeric, NULLIF(prior_entry ->> 'amount', '')::numeric, 0), 0)), 0)
        INTO v_prior_customer_today
        FROM jsonb_array_elements(v_prior_credit_entries) AS prior_entry
        WHERE prior_entry ->> 'customer_id' = v_customer.id::text;
    END IF;
    v_previous_credit := GREATEST(COALESCE(v_customer.outstanding_balance, 0) - v_prior_customer_today, 0);
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
    WHERE COALESCE(entry ->> 'payment_bucket', entry ->> 'default_payment_method', 'other') IN ('cash', 'cash_on_delivery', 'cod')
      AND COALESCE((entry ->> 'included_in_revenue')::boolean, true);

  IF v_session_uuid IS NOT NULL THEN
    v_expense_context:=public.erp_closing_session_costs(v_restaurant_uuid,v_branch_id,v_branch,v_date,CASE WHEN v_has_existing THEN v_existing.id ELSE NULL END);
    p_payload:=jsonb_set(p_payload,'{approved_purchases_total}',v_expense_context->'approved_purchases_total');
  END IF;
  v_opening := public.erp_sales_closing_opening_cash(
    v_restaurant_uuid, v_branch_id, v_branch, v_date, v_shift, v_cashier_id,
    CASE WHEN v_has_existing THEN v_existing.id ELSE p_closing_id END
  );
  BEGIN
  v_expected_cash := public.erp_sales_closing_expected_cash(
    v_restaurant_uuid, v_branch_id, v_branch, v_date, v_shift, v_cashier_id,
    CASE WHEN v_has_existing THEN v_existing.id ELSE p_closing_id END,
    v_manual_cash + v_cash_source_total
  );
  EXCEPTION WHEN raise_exception THEN
    IF v_requested_state <> 'draft' OR SQLERRM <> 'SALES_CLOSING_CASH_LEDGER_OVERDRAWN' THEN
      RAISE;
    END IF;
    -- Unresolved drafts preserve input without inventing a balance or variance.
    v_expected_cash := NULL;
  END;
  IF v_actual IS NOT NULL AND v_expected_cash IS NOT NULL THEN
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
    -- A reconciliation note is informational only. A cash variance must be
    -- recorded and settled, but the absence of a note must never block Closing.
    -- Variances remain visible and are separately posted as shortage/overage.
    -- They do not rewrite sales or require the retired correction workflow.
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
        session_closed_at = CASE WHEN v_requested_state='finalized' THEN now() ELSE session_closed_at END,
        closing_state = v_requested_state,
        closing_version = v_closing_version,
        finalized_at = CASE WHEN v_requested_state = 'finalized' THEN COALESCE(finalized_at, now()) ELSE finalized_at END,
        finalized_by = CASE WHEN v_requested_state = 'finalized' THEN auth.uid()::text ELSE finalized_by END,
        closing_request_id = v_request_id,
        updated_date = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_saved;
    v_action := CASE WHEN v_requested_state = 'finalized' THEN 'closing_finalized' ELSE 'draft_saved' END;
  ELSE
    INSERT INTO public.daily_sales (session_closed_at,closing_session_id,closing_session_no,previous_closing_id,
      restaurant_id, date, business_date, branch, branch_id, shift, cashier_id, cashier_employee_id, cashier_name,
      sales_notes, restaurant_cash, cash, restaurant_network, network, credit, credit_entries_json, custom_sources_total, sales_sources_json,
      payment_reconciliation_json, opening_cash, expected_cash, actual_cash, closing_cash, cash_difference, cash_status,
      cash_notes, owner_cash_injection, manager_approval, manager_approved_by, approved_purchases_total, expenses_total,
      operating_result, closing_state, closing_version, finalized_at, finalized_by, closing_request_id, created_by, created_date, updated_date
    ) VALUES (CASE WHEN v_requested_state='finalized' THEN now() ELSE NULL END,v_session_uuid,CASE WHEN v_session_uuid IS NOT NULL THEN v_session_no ELSE NULL END,CASE WHEN v_session_uuid IS NOT NULL THEN v_previous_session ELSE NULL END,
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
      v_requested_state, v_closing_version, CASE WHEN v_requested_state = 'finalized' THEN now() ELSE NULL END,
      CASE WHEN v_requested_state = 'finalized' THEN auth.uid()::text ELSE '' END,
      v_request_id, auth.uid()::text, now(), now()
    ) RETURNING * INTO v_saved;
    v_transitioned := v_requested_state = 'finalized';
    v_action := CASE WHEN v_requested_state = 'finalized' THEN 'closing_finalized' ELSE 'closing_created' END;
  END IF;

  DELETE FROM public.sales_closing_source_snapshots WHERE closing_id = v_saved.id;
  INSERT INTO public.sales_closing_source_snapshots (
    closing_id, source_id, source_name_snapshot, today_amount, historical_before_closing, total_after_closing, payment_bucket, payment_method, subcategory, included_in_revenue
  )
  SELECT v_saved.id,
    CASE WHEN entry ->> 'source_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (entry ->> 'source_id')::uuid ELSE NULL END,
    COALESCE(NULLIF(entry ->> 'name_en', ''), NULLIF(entry ->> 'source_name_snapshot', ''), 'Sales source'),
    GREATEST(COALESCE(NULLIF(entry ->> 'today_amount', '')::numeric, NULLIF(entry ->> 'amount', '')::numeric, 0), 0),
    GREATEST(COALESCE(NULLIF(entry ->> 'previous_amount', '')::numeric, 0), 0),
    GREATEST(COALESCE(NULLIF(entry ->> 'total_amount', '')::numeric, NULLIF(entry ->> 'today_amount', '')::numeric, NULLIF(entry ->> 'amount', '')::numeric, 0), 0),
    COALESCE(NULLIF(entry ->> 'payment_bucket', ''), NULLIF(entry ->> 'default_payment_method', ''), 'other'),
    COALESCE(NULLIF(entry ->> 'payment_method', ''), NULLIF(entry ->> 'default_payment_method', ''), 'cash'),
    NULLIF(entry ->> 'subcategory', ''),
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

  IF v_expected_cash IS NULL THEN
    DELETE FROM public.sales_closing_cash_reconciliations WHERE closing_id = v_saved.id;
  ELSE
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

  END IF;

  -- Recompute daily costs on the server. Client totals are display hints only;
  -- fixed monthly allocation and variable daily expense totals are canonical here.
  v_expense_context := CASE WHEN v_session_uuid IS NOT NULL THEN public.erp_closing_session_costs(v_restaurant_uuid,v_branch_id,v_branch,v_date,v_saved.id)
    ELSE public.erp_sales_closing_expense_context(v_restaurant_uuid, v_branch_id, v_branch, v_date) END;
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
  END IF;

  -- cash_shortages records only a real shortage or overage.  A balanced Closing
  -- has no variance record, so it cannot violate the Shortage/Overage constraint.
  IF v_requested_state = 'finalized' AND COALESCE(v_difference, 0) <> 0 THEN
    INSERT INTO public.cash_shortages (
      closing_id, date, branch, branch_id, shift, cashier_id, restaurant_id, created_by,
      expected_amount, actual_amount, shortage_amount, overage_amount, type, status,
      responsible_party, owner_settlement_required, owner_payment_amount, reported_by
    ) VALUES (
      v_saved.id, v_date, v_branch, v_branch_id, v_shift, v_cashier_id, v_restaurant_uuid, auth.uid()::text,
      v_expected_cash, COALESCE(v_actual, 0), GREATEST(-COALESCE(v_difference, 0), 0), GREATEST(COALESCE(v_difference, 0), 0),
      CASE WHEN v_difference < 0 THEN 'Shortage' ELSE 'Overage' END,
      'Pending',
      'owner', GREATEST(-v_difference, 0), 0, auth.uid()::text
    ) ON CONFLICT (closing_id) WHERE closing_id IS NOT NULL DO UPDATE SET
      expected_amount = EXCLUDED.expected_amount,
      actual_amount = EXCLUDED.actual_amount,
      shortage_amount = EXCLUDED.shortage_amount,
      overage_amount = EXCLUDED.overage_amount,
      type = EXCLUDED.type,
      status = CASE
        WHEN EXCLUDED.type = 'Shortage'
          AND public.cash_shortages.owner_payment_amount >= EXCLUDED.owner_settlement_required
          THEN 'Resolved'
        ELSE 'Pending'
      END,
      owner_settlement_required = EXCLUDED.owner_settlement_required,
      updated_date = now();
  ELSIF v_requested_state = 'finalized' THEN
    DELETE FROM public.cash_shortages WHERE closing_id = v_saved.id;
  END IF;

  -- Settle only on the one draft-to-finalized transition. Later authorized
  -- finalized edits create a new immutable version but never re-debit a wallet.
  IF v_requested_state = 'finalized' AND v_transitioned THEN
    PERFORM public.erp_apply_sales_closing_wallet_settlement(v_saved.id, v_request_id);
    SELECT * INTO v_saved FROM public.daily_sales WHERE id = v_saved.id;
  END IF;

  INSERT INTO public.sales_closing_audit_log (
    closing_id, restaurant_id, actor_id, actor_role, action, request_id, new_value
  ) VALUES (
    v_saved.id, v_restaurant_id, auth.uid(), v_role, v_action, v_request_id,
    jsonb_build_object('status', v_requested_state, 'expected_cash', v_expected_cash, 'actual_cash', v_actual, 'difference', v_difference, 'customer_credit_today', v_credit_master_total, 'customer_credit_entries', v_credit_entries_sanitized)
  );

  RETURN jsonb_build_object('closing', to_jsonb(v_saved), 'idempotent', false, 'finalized_transition', v_transitioned);
END;
$function$;


CREATE OR REPLACE FUNCTION public.erp_finalize_sales_closing_with_funding(p_payload jsonb, p_closing_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 r uuid:=(p_payload->>'restaurant_id')::uuid; b uuid:=(p_payload->>'branch_id')::uuid;
 d date:=(p_payload->>'date')::date; sh text:=p_payload->>'shift'; c uuid:=(p_payload->>'cashier_id')::uuid;
 f jsonb:=p_payload->'wallet_funding'; req closing_funding_private.requests; existing public.daily_sales;
 result jsonb; fund_result jsonb; correction uuid; request_payload jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.treasury_account_is_owner(r) OR NOT public.erp_can_write_scope_text(r::text,b::text)
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR f IS NULL OR f->>'source' NOT IN ('treasury','restaurant') OR (f->>'received')::boolean IS DISTINCT FROM true
 OR p_payload->>'closing_state' IS DISTINCT FROM 'finalized' THEN RAISE EXCEPTION 'CLOSING_FUNDING_INVALID_INPUT'; END IF;
 request_payload:=jsonb_build_object('closing_id',p_closing_id,'payload',p_payload);
 PERFORM pg_advisory_xact_lock(hashtextextended('atomic-closing:'||p_request_id::text,0));
 SELECT * INTO req FROM closing_funding_private.requests WHERE id=p_request_id;
 IF FOUND THEN
 IF req.actor<>auth.uid() OR req.payload IS DISTINCT FROM request_payload THEN RAISE EXCEPTION 'CLOSING_FUNDING_REQUEST_CONFLICT'; END IF;
 RETURN req.result||jsonb_build_object('idempotent',true,'finalized_transition',false);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|','closing-day',r::text,b::text,d::text),0));
 PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|',r::text,b::text,d::text,lower(sh),c::text),0));
 -- Lock the same branch before the closing row, matching the funding lock order.
 PERFORM 1 FROM public.branches WHERE id=b AND restaurant_id=r FOR UPDATE;
 SELECT * INTO existing FROM public.daily_sales WHERE restaurant_id=r::text AND branch_id=b
 AND date=d AND lower(trim(shift))=lower(trim(sh)) AND cashier_id=c
 AND (id=p_closing_id OR (p_closing_id IS NULL AND closing_session_id=NULLIF(p_payload->>'closing_session_id','')::uuid)) FOR UPDATE;
 IF p_closing_id IS NOT NULL AND existing.id IS DISTINCT FROM p_closing_id THEN RAISE EXCEPTION 'SALES_CLOSING_BRANCH_CONTEXT_MISMATCH'; END IF;
 IF existing.closing_state='finalized' THEN
   IF p_closing_id IS NULL THEN RAISE EXCEPTION 'CLOSING_OPEN_EXISTING'; END IF;
   correction:=existing.id;
 END IF;
 IF p_closing_id IS NULL AND p_payload->>'closing_session_id' IS NOT NULL AND existing.id IS NULL THEN
   correction:=public.erp_closing_predecessor(r,b,p_payload->>'branch',d,sh,c,NULL);
 END IF;
 fund_result:=closing_funding_private.post(p_request_id,r,b,d,sh,c,(f->>'amount')::numeric,f->>'source',
 (f->>'source_account_id')::uuid,(f->>'destination_account_id')::uuid,
 'Wallet funding and closing confirmed together',true,true,correction);
 result:=public.erp_finalize_sales_closing(p_payload-'wallet_funding',p_closing_id,p_request_id);
 -- A changed ledger/count cannot spend money and leave an unresolved closing.
 IF (result->'closing'->>'cash_difference')::numeric IS DISTINCT FROM 0 THEN
 RAISE EXCEPTION 'CLOSING_FUNDING_PREVIEW_CHANGED'; END IF;
 result:=result||jsonb_build_object('funding',fund_result);
 INSERT INTO closing_funding_private.requests(id,actor,payload,result) VALUES(p_request_id,auth.uid(),request_payload,result);
 RETURN result;
END;$function$;


CREATE OR REPLACE FUNCTION closing_funding_private.post(p_request_id uuid, p_restaurant_id uuid, p_branch_id uuid, p_date date, p_shift text, p_cashier_id uuid, p_amount numeric, p_source text, p_source_account_id uuid DEFAULT NULL::uuid, p_destination_account_id uuid DEFAULT NULL::uuid, p_note text DEFAULT ''::text, p_received boolean DEFAULT false, p_settled boolean DEFAULT false, p_correction_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 b public.branches; s public.daily_cash_settlements; v_payload jsonb; v_existing public.sales_closing_funding_requests;
 v_source public.treasury_accounts; v_balance numeric; v_debit uuid; v_result jsonb; v_injection public.owner_cash_injections; v_count integer; v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.treasury_account_is_owner(p_restaurant_id)
 OR NOT public.erp_can_write_scope_text(p_restaurant_id::text,p_branch_id::text)
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_date IS NULL OR p_date>(now() AT TIME ZONE 'Asia/Riyadh')::date OR p_cashier_id IS NULL OR p_shift IS NULL OR p_shift NOT IN ('Morning','Evening')
 OR p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount<=0 OR p_amount>1000000000 OR round(p_amount,2)<>p_amount
 OR p_source IS NULL OR p_source NOT IN ('owner','treasury','restaurant') OR p_received IS NOT TRUE OR length(trim(coalesce(p_note,'')))<10
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_INVALID_INPUT'; END IF;
 v_payload:=jsonb_build_object('restaurant',p_restaurant_id,'branch',p_branch_id,'date',p_date,'shift',p_shift,'cashier',p_cashier_id,
 'amount',p_amount,'source',p_source,'source_account',p_source_account_id,'destination_account',p_destination_account_id,'note',p_note,'received',p_received,'settled',p_settled);
 PERFORM pg_advisory_xact_lock(hashtextextended('closing-funding:'||p_request_id::text,0));
 SELECT * INTO v_existing FROM public.sales_closing_funding_requests WHERE id=p_request_id;
 IF FOUND THEN
   IF v_existing.payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'CLOSING_FUNDING_REQUEST_CONFLICT'; END IF;
   RETURN v_existing.result || jsonb_build_object('status','already_posted');
 END IF;
 -- Use the same scope lock as erp_save_sales_closing_core to serialize funding and finalization.
 PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_restaurant_id::text,p_branch_id::text,p_date::text,lower(p_shift),p_cashier_id::text),0));
 SELECT * INTO b FROM public.branches WHERE id=p_branch_id AND restaurant_id=p_restaurant_id AND is_active IS NOT FALSE FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CLOSING_FUNDING_BRANCH_INVALID'; END IF;
 IF p_cashier_id<>auth.uid() AND NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_cashier_id AND e.restaurant_id=p_restaurant_id
   AND (e.branch_id=p_branch_id OR (e.branch_id IS NULL AND e.branch=b.branch_key)) AND e.is_active IS NOT FALSE)
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_CASHIER_INVALID'; END IF;

 IF p_correction_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM public.daily_sales WHERE id=p_correction_id AND restaurant_id=p_restaurant_id::text
 AND branch_id=p_branch_id AND date<=p_date
 AND cashier_id=p_cashier_id AND closing_state='finalized')
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_CORRECTION_SCOPE_INVALID'; END IF;
 -- A later finalized count still blocks correction; immutable versions remain intact.

 IF EXISTS(SELECT 1 FROM public.daily_sales d WHERE d.restaurant_id=p_restaurant_id::text
   AND (d.branch_id=p_branch_id OR (d.branch_id IS NULL AND d.branch=b.branch_key)) AND d.closing_state='finalized' AND (p_correction_id IS NULL OR d.id<>p_correction_id)
   AND (d.date>p_date OR (d.date=p_date AND ((p_shift='Morning' AND d.shift='Evening')))))
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_CLOSED_PERIOD'; END IF;
 IF EXISTS(SELECT 1 FROM public.owner_cash_injections WHERE id=p_request_id)
 OR EXISTS(SELECT 1 FROM public.wallet_transactions WHERE restaurant_id=p_restaurant_id AND (settlement_request_id=p_request_id OR reference_id=p_request_id::text))
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_REQUEST_CONFLICT'; END IF;
 IF p_source='owner' THEN
   IF p_source_account_id IS NOT NULL OR p_destination_account_id IS NOT NULL THEN RAISE EXCEPTION 'CLOSING_FUNDING_INVALID_INPUT'; END IF;
   v_injection:=public.post_owner_cash_injection(p_request_id,p_restaurant_id,p_branch_id,p_date,p_amount,'Operational Funding',p_note,NULL);
   -- Scope only the movement created within this transaction, never prior rows.
   UPDATE public.cash_movements SET shift=p_shift,cashier_id=p_cashier_id,branch_id=p_branch_id,payment_method='cash'
    WHERE restaurant_id=p_restaurant_id AND source_module='OwnerCashInjection' AND source_record_id=p_request_id::text AND is_reversed IS NOT TRUE
    RETURNING id INTO v_id;
   IF v_id IS NULL THEN RAISE EXCEPTION 'CLOSING_FUNDING_MOVEMENT_MISSING'; END IF;

 ELSIF p_source='restaurant' THEN
   IF p_date<>(now() AT TIME ZONE 'Asia/Riyadh')::date THEN RAISE EXCEPTION 'CLOSING_FUNDING_TREASURY_DATE_REVIEW'; END IF;
   IF p_destination_account_id IS NOT NULL THEN RAISE EXCEPTION 'CLOSING_FUNDING_INVALID_INPUT'; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|','sales_closing_wallet',p_restaurant_id::text,p_branch_id::text),0));
   SELECT * INTO v_source FROM public.treasury_accounts WHERE id=p_source_account_id AND restaurant_id=p_restaurant_id AND is_active
    AND (branch_id=p_branch_id OR (branch_id IS NULL AND branch_key=b.branch_key))
    AND account_type IN ('cash','petty_cash') FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'CLOSING_FUNDING_BRANCH_WALLET_INVALID'; END IF;
   IF v_source.currency IS DISTINCT FROM (SELECT coalesce(nullif(currency,''),'SAR') FROM public.restaurants WHERE id=p_restaurant_id)
   THEN RAISE EXCEPTION 'CLOSING_FUNDING_CURRENCY_MISMATCH'; END IF;
   SELECT v_source.opening_balance+coalesce(sum(CASE WHEN direction='in' THEN amount WHEN direction='out' THEN -amount ELSE 0 END),0)
     INTO v_balance FROM public.wallet_transactions WHERE account_id=v_source.id AND restaurant_id=p_restaurant_id;
   IF v_balance<p_amount THEN RAISE EXCEPTION 'CLOSING_FUNDING_INSUFFICIENT_BALANCE'; END IF;
   s:=public.cash_register_prepare(p_restaurant_id,p_branch_id,p_date);
   IF s.status NOT IN ('Draft','Rejected') THEN RAISE EXCEPTION 'CLOSING_FUNDING_CLOSED_PERIOD'; END IF;
   INSERT INTO public.wallet_transactions(transaction_date,transaction_type,flow_type,direction,wallet,branch,branch_id,amount,payment_method,description,
     reference_id,auto_generated,restaurant_id,account_id,settlement_request_id,recorded_by,created_by)
   VALUES(p_date,'closing_wallet_funding','closing_settlement','out','branch_cash',b.branch_key,p_branch_id,p_amount,'cash',p_note,
     p_request_id::text,true,p_restaurant_id,v_source.id,p_request_id,auth.uid()::text,auth.uid()::text) RETURNING id INTO v_debit;
   INSERT INTO public.cash_movements(date,branch,branch_id,restaurant_id,direction,amount,movement_type,source_module,source_record_id,
     source_document_id,description,posted_by,created_by,settlement_id,shift,cashier_id,payment_method,settlement_request_id)
   VALUES(p_date,b.branch_key,p_branch_id,p_restaurant_id,'in',p_amount,'cash_deposit','Treasury',v_debit::text,
     p_request_id::text,p_note,auth.uid()::text,auth.uid()::text,s.id,p_shift,p_cashier_id,'cash',p_request_id) RETURNING id INTO v_id;
   UPDATE public.daily_cash_settlements SET cash_transfer_in=coalesce(cash_transfer_in,0)+p_amount WHERE id=s.id;
   PERFORM public.recompute_settlement(s.id);
   v_result:=jsonb_build_object('debit_id',v_debit,'source_account_id',v_source.id);
 ELSE
   -- Existing treasury transfer API posts on the Riyadh business date.
   IF p_date<>(now() AT TIME ZONE 'Asia/Riyadh')::date THEN RAISE EXCEPTION 'CLOSING_FUNDING_TREASURY_DATE_REVIEW'; END IF;
   s:=public.cash_register_prepare(p_restaurant_id,p_branch_id,p_date);
   IF s.status NOT IN ('Draft','Rejected') THEN RAISE EXCEPTION 'CLOSING_FUNDING_CLOSED_PERIOD'; END IF;
   v_result:=public.erp_owner_fund_branch(p_restaurant_id,p_branch_id,p_source_account_id,p_destination_account_id,p_amount,'cash',p_request_id,p_note,p_settled,p_received);
   IF v_result->>'status' IS DISTINCT FROM 'posted' OR v_result->>'credit_id' IS NULL THEN RAISE EXCEPTION 'CLOSING_FUNDING_REQUEST_CONFLICT'; END IF;
   -- The canonical transfer writes both treasury legs; its trigger intentionally
   -- does not post owner_to_branch_funding to the drawer. Post that leg once.
   IF EXISTS(SELECT 1 FROM public.cash_movements WHERE restaurant_id=p_restaurant_id AND source_module='Treasury' AND source_record_id=v_result->>'credit_id' AND is_reversed IS NOT TRUE) THEN RAISE EXCEPTION 'CLOSING_FUNDING_MOVEMENT_ALREADY_EXISTS'; END IF;
   INSERT INTO public.cash_movements(date,branch,branch_id,restaurant_id,direction,amount,movement_type,source_module,source_record_id,
      source_document_id,description,posted_by,created_by,settlement_id,shift,cashier_id,payment_method,settlement_request_id)
   VALUES(p_date,b.branch_key,p_branch_id,p_restaurant_id,'in',p_amount,'cash_deposit','Treasury',v_result->>'credit_id',
      p_request_id::text,p_note,auth.uid()::text,auth.uid()::text,s.id,p_shift,p_cashier_id,'cash',p_request_id) RETURNING id INTO v_id;
   UPDATE public.daily_cash_settlements SET cash_transfer_in=coalesce(cash_transfer_in,0)+p_amount WHERE id=s.id;
   PERFORM public.recompute_settlement(s.id);
 END IF;
 SELECT count(*) INTO v_count FROM public.cash_movements WHERE id=v_id AND amount=p_amount AND direction='in' AND cashier_id=p_cashier_id AND shift=p_shift;
 IF v_count<>1 THEN RAISE EXCEPTION 'CLOSING_FUNDING_MOVEMENT_MISSING'; END IF;
 v_result:=coalesce(v_result,'{}'::jsonb)||jsonb_build_object('status','posted','request_id',p_request_id,'movement_id',v_id,'amount',p_amount);
 INSERT INTO public.sales_closing_funding_requests VALUES(p_request_id,p_restaurant_id,p_branch_id,v_payload,v_result,auth.uid(),now());
 RETURN v_result;
END $function$;
