-- Allow an assigned branch manager to record the first starting count.
-- No invented zero, revenue, funding, or changes to finalized records.
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
  IF auth.uid() IS NULL OR p_branch_id IS NULL
    OR NOT public.erp_can_write_scope(p_restaurant_id, p_branch_id)
  THEN RAISE EXCEPTION 'OPENING_VERIFICATION_SCOPE_REQUIRED'; END IF;
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

  -- Same branch/day and drawer locks used by the closing writer.
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|','closing-day',p_restaurant_id::text,p_branch_id::text,p_date::text),0));
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_restaurant_id::text,p_branch_id::text,p_date::text,lower(p_shift),p_cashier_id::text),0));
  IF p_date > (now() AT TIME ZONE 'Asia/Riyadh')::date THEN
    RAISE EXCEPTION 'OPENING_VERIFICATION_FUTURE_DATE';
  END IF;
  IF p_cashier_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.employees e WHERE e.id=p_cashier_id AND e.restaurant_id=p_restaurant_id
      AND (e.branch_id=p_branch_id OR (e.branch_id IS NULL AND e.branch=p_branch)) AND e.is_active IS NOT FALSE
  ) THEN RAISE EXCEPTION 'OPENING_VERIFICATION_CASHIER_INVALID'; END IF;

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
      AND lower(s.shift)=lower(p_shift) AND s.closing_state IN ('finalized','locked')
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

  -- Managers can initialize their branch, but cannot rewrite ambiguous
  -- historic baselines. An authenticated owner retains that recovery action.
  IF NOT public.erp_can_write_scope_text(p_restaurant_id::text,p_branch_id::text)
     AND v_status->>'opening_status' IS DISTINCT FROM 'initial_opening_required' THEN
    RAISE EXCEPTION 'OPENING_VERIFICATION_OWNER_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.daily_sales s
    WHERE s.restaurant_id=p_restaurant_id::text AND s.branch_id=p_branch_id
      AND s.cashier_id=p_cashier_id AND s.closing_state IN ('finalized','locked')
      AND (s.date>p_date OR (s.date=p_date AND lower(s.shift)='evening' AND lower(p_shift)='morning'))
  ) THEN RAISE EXCEPTION 'OPENING_VERIFICATION_LATER_CLOSING_EXISTS'; END IF;

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

