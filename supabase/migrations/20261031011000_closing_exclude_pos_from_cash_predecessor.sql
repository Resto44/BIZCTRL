-- Exclude POS sales from physical cash drawer predecessor selection.
-- No updates to sales, opening counts, or audit rows. No schema changes.
-- Preserve auth scope, prior-finalized sessions and fail-closed missing counts.
-- An ordinary POS sale is a finalized revenue event, not a counted drawer close.
-- Restrict all cash carry-forward predecessors to real Morning/Evening closures.
CREATE OR REPLACE FUNCTION public.erp_closing_predecessor(
 r uuid, b uuid, k text, d date, s text, c uuid, current_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE
 result uuid;
 current_row public.daily_sales;
BEGIN
 IF auth.uid() IS NULL OR NOT public.erp_can_access_scope_text(r::text,b::text) THEN
  RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
 END IF;
 IF current_id IS NOT NULL THEN
  SELECT * INTO current_row FROM public.daily_sales
  WHERE id=current_id AND restaurant_id=r::text AND branch_id=b;
  IF NOT FOUND THEN RAISE EXCEPTION 'SALES_CLOSING_BRANCH_CONTEXT_MISMATCH'; END IF;
  IF current_row.closing_session_id IS NOT NULL THEN
   RETURN current_row.previous_closing_id;
  END IF;
  RETURN NULL;
 END IF;
 SELECT p.id INTO result
 FROM public.daily_sales p
 WHERE p.restaurant_id=r::text
  AND (p.branch_id=b OR (p.branch_id IS NULL AND p.branch=k))
  AND p.closing_state='finalized'
  AND lower(btrim(COALESCE(p.shift,''))) IN ('morning','evening')
  AND (p.date<d OR (p.date=d
    AND CASE lower(p.shift) WHEN 'evening' THEN 2 ELSE 1 END
        <=CASE lower(s) WHEN 'evening' THEN 2 ELSE 1 END))
  AND (p.cashier_id=c OR p.cashier_id IS NULL)
 ORDER BY p.date DESC,
  CASE lower(p.shift) WHEN 'evening' THEN 2 ELSE 1 END DESC,
  COALESCE(p.closing_session_no,1) DESC,
  p.finalized_at DESC,p.id DESC
 LIMIT 1;
 RETURN result;
END;
$function$;

-- Also remove POS from legacy fallback so a branch without a prior
-- counted Morning/Evening closing can start with a real verified count.
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

  -- First session in a shift: use the one immutable, already-authorized opening count.
  -- Do NOT reuse a shift-start count for a second closing in the same shift:
  -- that session must instead carry forward the previous physical ending count.
  SELECT * INTO v_verification
  FROM public.sales_closing_opening_verifications v
  WHERE v.restaurant_id = p_restaurant_id AND v.branch_id = p_branch_id
    AND v.date = p_date AND lower(v.shift) = lower(p_shift)
    AND v.cashier_id = p_cashier_id
  LIMIT 1;
  IF v_verification.id IS NOT NULL AND (
    v_session_previous.id IS NULL OR v_session_previous.date <> p_date
    OR lower(v_session_previous.shift) <> lower(p_shift)
  ) THEN
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

  IF v_session_previous.id IS NOT NULL THEN
    RETURN jsonb_build_object('opening_cash',v_session_previous.actual_cash,
      'opening_status','verified_previous','opening_verified',v_session_previous.actual_cash IS NOT NULL,
      'opening_source','previous_closing_session','opening_prior_count',1,
      'opening_shift_date',v_session_previous.date,'opening_shift',v_session_previous.shift,
      'previous_closing_id',v_session_previous.id,'previous_finalized_at',public.erp_closing_session_cutoff(v_session_previous.id));
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
    AND lower(btrim(COALESCE(previous.shift,''))) IN ('morning','evening')
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
    AND lower(btrim(COALESCE(p.shift,''))) IN ('morning','evening')
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
    AND lower(btrim(COALESCE(p.shift,''))) IN ('morning','evening')
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
    AND lower(btrim(COALESCE(p.shift,''))) IN ('morning','evening')
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
    AND lower(btrim(COALESCE(p.shift,''))) IN ('morning','evening')
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
