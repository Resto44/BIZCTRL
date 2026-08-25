-- Sales Closing lifecycle hardening
--
-- Canonical state machine:
--   NEW (in memory only) -> DRAFT -> FINALIZED -> LOCKED
--
-- Finalized and locked records are financial history. This guard deliberately
-- permits only a server-authorized, append-only correction request audit event;
-- ordinary data updates, lifecycle reversions, and client-side bypasses remain
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
    -- correction-request audit event. No business, identity, lifecycle, or
    -- financial values may change as part of that request.
    v_is_correction_request :=
      v_authorized
      AND NEW.closing_state = OLD.closing_state
      AND jsonb_typeof(v_old_audit) = 'array'
      AND jsonb_typeof(v_new_audit) = 'array'
      AND jsonb_array_length(v_new_audit) = jsonb_array_length(v_old_audit) + 1
      AND (v_new_audit - (jsonb_array_length(v_new_audit) - 1)) = v_old_audit
      AND (v_new_audit -> (jsonb_array_length(v_new_audit) - 1) ->> 'action') = 'correction_requested'
      AND (to_jsonb(NEW) - ARRAY['closing_audit', 'updated_date']) = (to_jsonb(OLD) - ARRAY['closing_audit', 'updated_date']);

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
  'Protects finalized and locked Sales Closing history and allows only an authorized append-only correction-request audit event.';
