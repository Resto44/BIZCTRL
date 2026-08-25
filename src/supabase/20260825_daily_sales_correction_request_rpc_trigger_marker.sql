-- Corrects protected Sales Closing correction requests by binding the append-only audit event to the SECURITY DEFINER RPC transaction.

-- Sales Closing lifecycle hardening
--
-- Canonical state machine:
--   NEW (in memory only) -> DRAFT -> FINALIZED -> LOCKED
--
-- Finalized and locked records are financial history. This guard deliberately
-- permits only an RPC-marked, server-authorized, append-only correction request
-- audit event; ordinary data updates, lifecycle reversions, and client-side bypasses remain
-- rejected. The actual financial correction must continue through an approved
-- accounting workflow rather than rewriting posted closing values.

CREATE OR REPLACE FUNCTION public.erp_guard_daily_sales_closing_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_restaurant_id uuid := NULLIF(COALESCE(NEW.restaurant_id, OLD.restaurant_id), '')::uuid;
  v_authorized boolean := false;
  v_old_audit jsonb := COALESCE(OLD.closing_audit, '[]'::jsonb);
  v_new_audit jsonb := COALESCE(NEW.closing_audit, '[]'::jsonb);
  v_is_correction_request boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.closing_state IN ('finalized', 'locked') THEN
    v_authorized := public.erp_can_manage_workspace_customization(v_restaurant_id);

    -- A protected closing may receive exactly one appended, owner-authorized
    -- correction-request audit event only from the SECURITY DEFINER correction
    -- RPC. The transaction-local marker cannot be produced by ordinary entity
    -- updates, while the append-only audit checks prevent a different event.
    v_is_correction_request :=
      v_authorized
      AND current_setting('app.daily_sales_correction_request_id', true) = OLD.id::text
      AND NEW.closing_state = OLD.closing_state
      AND jsonb_typeof(v_old_audit) = 'array'
      AND jsonb_typeof(v_new_audit) = 'array'
      AND jsonb_array_length(v_new_audit) = jsonb_array_length(v_old_audit) + 1
      AND (v_new_audit - (jsonb_array_length(v_new_audit) - 1)) = v_old_audit
      AND (v_new_audit -> (jsonb_array_length(v_new_audit) - 1) ->> 'action') = 'correction_requested';

    IF NOT v_is_correction_request THEN
      IF OLD.closing_state = 'locked' AND NOT v_authorized THEN
        RAISE EXCEPTION 'DAILY_SALES_CLOSING_LOCKED'
          USING DETAIL = 'A locked closing can only receive an authorized correction request.';
      END IF;
      IF OLD.closing_state = 'finalized' AND NEW.closing_state = 'draft' THEN
        RAISE EXCEPTION 'DAILY_SALES_CLOSING_FINALIZATION_REVERT_DENIED'
          USING DETAIL = 'A finalized closing cannot revert to draft because finalized financial records have already been posted.';
      END IF;
      RAISE EXCEPTION 'DAILY_SALES_CLOSING_PROTECTED'
        USING DETAIL = 'Finalized and locked closings are immutable. Submit an authorized correction request instead.';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.closing_state = 'locked'
     AND OLD.closing_state IS DISTINCT FROM 'locked'
     AND NOT public.erp_can_manage_workspace_customization(v_restaurant_id) THEN
    RAISE EXCEPTION 'DAILY_SALES_CLOSING_LOCK_DENIED'
      USING DETAIL = 'Only an authorized owner workflow can lock a closing.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.erp_guard_daily_sales_closing_lifecycle() IS
  'Protects finalized and locked Sales Closing history and allows only an RPC-marked, authorized append-only correction-request audit event.';


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

  -- A transaction-local marker is set only inside this SECURITY DEFINER RPC.
  -- The lifecycle trigger still validates the exact append-only audit shape;
  -- ordinary direct protected-row updates never carry this marker.
  PERFORM set_config('app.daily_sales_correction_request_id', v_closing.id::text, true);

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
