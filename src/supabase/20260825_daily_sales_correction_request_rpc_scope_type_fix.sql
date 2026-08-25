-- Server-authorized correction requests for finalized and locked Sales Closings.
--
-- Direct browser updates of protected rows remain forbidden. This RPC runs the
-- existing tenant authorization predicate, appends one immutable audit event,
-- and relies on erp_guard_daily_sales_closing_lifecycle() to reject any other
-- column change.

CREATE OR REPLACE FUNCTION public.request_daily_sales_closing_correction(
  p_closing_id uuid
)
RETURNS public.daily_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_closing public.daily_sales%ROWTYPE;
  v_authorized boolean := false;
  v_audit jsonb;
  v_requested_by text;
  v_restaurant_id uuid;
BEGIN
  SELECT *
  INTO v_closing
  FROM public.daily_sales
  WHERE id = p_closing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DAILY_SALES_CLOSING_NOT_FOUND';
  END IF;

  IF v_closing.closing_state NOT IN ('finalized', 'locked') THEN
    RAISE EXCEPTION 'DAILY_SALES_CLOSING_NOT_PROTECTED'
      USING DETAIL = 'Only finalized or locked closings can receive a correction request.';
  END IF;

  v_restaurant_id := NULLIF(v_closing.restaurant_id, '')::uuid;
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'DAILY_SALES_CLOSING_SCOPE_INVALID'
      USING DETAIL = 'The protected closing is missing its canonical restaurant scope.';
  END IF;

  v_authorized := public.erp_can_manage_workspace_customization(v_restaurant_id);
  IF NOT v_authorized THEN
    RAISE EXCEPTION 'DAILY_SALES_CLOSING_CORRECTION_DENIED'
      USING DETAIL = 'Only an authorized Owner or General Manager can request a protected closing correction.';
  END IF;

  v_audit := COALESCE(v_closing.closing_audit, '[]'::jsonb);
  IF jsonb_typeof(v_audit) <> 'array' THEN
    RAISE EXCEPTION 'DAILY_SALES_CLOSING_AUDIT_INVALID'
      USING DETAIL = 'The protected closing audit history is not an array and cannot be safely appended.';
  END IF;

  SELECT COALESCE(NULLIF(m.email, ''), NULLIF(p.email, ''), '')
  INTO v_requested_by
  FROM public.erp_memberships m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.user_id = auth.uid()
    AND m.restaurant_id = v_restaurant_id
    AND m.status = 'approved'
  ORDER BY CASE WHEN lower(m.role) = 'owner' THEN 0 ELSE 1 END, m.updated_at DESC
  LIMIT 1;

  UPDATE public.daily_sales
  SET closing_audit = v_audit || jsonb_build_array(jsonb_build_object(
    'action', 'correction_requested',
    'requested_at', now(),
    'requested_by', NULLIF(v_requested_by, ''),
    'closing_state', v_closing.closing_state
  ))
  WHERE id = v_closing.id
  RETURNING * INTO v_closing;

  RETURN v_closing;
END;
$$;

REVOKE ALL ON FUNCTION public.request_daily_sales_closing_correction(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_daily_sales_closing_correction(uuid) TO authenticated;

COMMENT ON FUNCTION public.request_daily_sales_closing_correction(uuid) IS
  'Appends one Owner- or General-Manager-authorized correction request to finalized or locked Sales Closing audit history without changing financial, identity, or lifecycle data.';
