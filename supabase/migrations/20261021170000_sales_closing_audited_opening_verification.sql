-- Explicit audited physical opening balance; no historical financial rows changed.
CREATE TABLE IF NOT EXISTS public.sales_closing_opening_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  branch text NOT NULL,
  date date NOT NULL,
  shift text NOT NULL,
  cashier_id uuid NOT NULL,
  counted_cash numeric(18,2) NOT NULL CHECK (counted_cash >= 0),
  reason text NOT NULL CHECK (char_length(btrim(reason)) >= 10),
  previous_status text NOT NULL,
  verified_by uuid NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_closing_opening_verified_scope_unique
  ON public.sales_closing_opening_verifications
  (restaurant_id, branch_id, date, lower(shift), cashier_id);

ALTER TABLE public.sales_closing_opening_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_closing_opening_scope_read
  ON public.sales_closing_opening_verifications;
CREATE POLICY sales_closing_opening_scope_read
  ON public.sales_closing_opening_verifications FOR SELECT TO authenticated
  USING (public.erp_can_access_scope_text(restaurant_id::text, branch_id::text));
REVOKE ALL ON TABLE public.sales_closing_opening_verifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sales_closing_opening_verifications TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_sales_closing_opening_verification_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'OPENING_VERIFICATION_IMMUTABLE';
END;
$$;
DROP TRIGGER IF EXISTS opening_verifications_immutable ON public.sales_closing_opening_verifications;
CREATE TRIGGER opening_verifications_immutable
  BEFORE UPDATE OR DELETE ON public.sales_closing_opening_verifications
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sales_closing_opening_verification_change();

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
  v_verification public.sales_closing_opening_verifications%ROWTYPE;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR p_restaurant_id IS NULL OR p_branch_id IS NULL OR p_date IS NULL
     OR NOT public.erp_can_access_scope_text(p_restaurant_id::text, p_branch_id::text)
  THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
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

CREATE OR REPLACE FUNCTION public.erp_verify_sales_closing_opening_count(
  p_restaurant_id uuid, p_branch_id uuid, p_branch text,
  p_date date, p_shift text, p_cashier_id uuid,
  p_counted_cash numeric, p_reason text, p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_existing public.sales_closing_opening_verifications%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_status jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.erp_current_role() <> 'owner'
    OR NOT public.erp_can_write_scope_text(p_restaurant_id::text, p_branch_id::text)
  THEN RAISE EXCEPTION 'OPENING_VERIFICATION_OWNER_REQUIRED'; END IF;
  IF p_restaurant_id IS NULL OR p_branch_id IS NULL OR p_date IS NULL
     OR p_cashier_id IS NULL OR p_request_id IS NULL
     OR trim(COALESCE(p_shift,'')) NOT IN ('Morning','Evening')
     OR p_counted_cash IS NULL OR p_counted_cash < 0
     OR p_counted_cash::text IN ('NaN','Infinity','-Infinity')
     OR round(p_counted_cash,2) <> p_counted_cash
     OR char_length(btrim(coalesce(p_reason,''))) < 10
  THEN RAISE EXCEPTION 'OPENING_VERIFICATION_VALID_COUNT_AND_REASON_REQUIRED'; END IF;

  SELECT * INTO v_branch
  FROM public.branches
  WHERE id=p_branch_id AND restaurant_id=p_restaurant_id AND is_active IS NOT FALSE;
  IF NOT FOUND OR v_branch.branch_key IS DISTINCT FROM p_branch THEN
    RAISE EXCEPTION 'OPENING_VERIFICATION_BRANCH_SCOPE_INVALID';
  END IF;

  SELECT * INTO v_existing
  FROM public.sales_closing_opening_verifications
  WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.restaurant_id IS DISTINCT FROM p_restaurant_id
       OR v_existing.branch_id IS DISTINCT FROM p_branch_id
       OR v_existing.date IS DISTINCT FROM p_date
       OR v_existing.shift IS DISTINCT FROM p_shift
       OR v_existing.cashier_id IS DISTINCT FROM p_cashier_id
       OR v_existing.counted_cash IS DISTINCT FROM p_counted_cash
       OR v_existing.reason IS DISTINCT FROM btrim(p_reason)
    THEN RAISE EXCEPTION 'OPENING_VERIFICATION_REQUEST_REUSED'; END IF;
    RETURN jsonb_build_object('opening_cash',v_existing.counted_cash,
      'verified_at',v_existing.verified_at,'verification_id',v_existing.id,
      'idempotent',true);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.daily_sales s
    WHERE s.restaurant_id=p_restaurant_id::text
      AND s.branch_id=p_branch_id AND s.date=p_date
      AND lower(s.shift)=lower(p_shift) AND s.closing_state='finalized'
      AND COALESCE(s.cashier_id::text,s.cashier_employee_id)=p_cashier_id::text
  ) THEN
    RAISE EXCEPTION 'OPENING_VERIFICATION_SHIFT_ALREADY_CLOSED';
  END IF;

  -- Never override a reliably counted predecessor.
  v_status := public.erp_sales_closing_opening_context(
    p_restaurant_id,p_branch_id,p_branch,p_date,p_shift,p_cashier_id,NULL
  );
  IF COALESCE(v_status->>'opening_verified','false') = 'true' THEN
    RAISE EXCEPTION 'OPENING_VERIFICATION_ALREADY_VERIFIED';
  END IF;

  INSERT INTO public.sales_closing_opening_verifications(
    request_id,restaurant_id,branch_id,branch,date,shift,cashier_id,
    counted_cash,reason,previous_status,verified_by
  ) VALUES(
    p_request_id,p_restaurant_id,p_branch_id,p_branch,p_date,p_shift,p_cashier_id,
    p_counted_cash,btrim(p_reason),v_status->>'opening_status',auth.uid()
  ) RETURNING * INTO v_existing;

  RETURN jsonb_build_object('opening_cash',v_existing.counted_cash,
    'verified_at',v_existing.verified_at,'verification_id',v_existing.id,
    'idempotent',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.erp_verify_sales_closing_opening_count(uuid,uuid,text,date,text,uuid,numeric,text,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_verify_sales_closing_opening_count(uuid,uuid,text,date,text,uuid,numeric,text,uuid)
  TO authenticated;

-- Cash carry-forward fails closed until the owner records a starting drawer
-- count for the first shift or resolves ambiguous/uncounted legacy closings.
DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='erp_verify_sales_closing_opening_count')
    OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='erp_sales_closing_opening_context'
      AND position('initial_opening_required' IN pg_get_functiondef(oid))>0)
  THEN RAISE EXCEPTION 'OPENING_VERIFICATION_DEPLOY_INCOMPLETE'; END IF;
END;
$verify$;
