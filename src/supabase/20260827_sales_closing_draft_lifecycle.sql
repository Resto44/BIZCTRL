BEGIN;

-- One active work-in-progress is allowed for a Closing session. Historical
-- finalized snapshots are intentionally excluded so a new draft is never
-- blocked merely because an earlier financial period remains in history.
DROP INDEX IF EXISTS public.daily_sales_unique_closing_session_idx;
CREATE UNIQUE INDEX daily_sales_unique_closing_session_idx
  ON public.daily_sales (
    restaurant_id,
    COALESCE(branch_id::text, 'legacy:' || lower(btrim(branch))),
    date,
    lower(btrim(shift)),
    COALESCE(cashier_id::text, 'legacy:' || lower(btrim(cashier_name)))
  )
  WHERE closing_state IN ('draft', 'ready')
    AND restaurant_id IS NOT NULL
    AND date IS NOT NULL
    AND NULLIF(btrim(shift), '') IS NOT NULL
    AND (branch_id IS NOT NULL OR NULLIF(btrim(branch), '') IS NOT NULL)
    AND (cashier_id IS NOT NULL OR NULLIF(btrim(cashier_name), '') IS NOT NULL);

COMMENT ON INDEX public.daily_sales_unique_closing_session_idx IS
  'Permits one active draft or ready Sales Closing per session while preserving unlimited immutable historical snapshots.';

-- Finalized history stays immutable outside a SECURITY DEFINER server
-- transaction. The client never writes daily_sales directly; all normal saves
-- use erp_save_sales_closing and corrections use their dedicated RPC.
CREATE OR REPLACE FUNCTION public.erp_guard_sales_closing_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND OLD.closing_state IN ('finalized', 'correction_requested', 'corrected', 'locked') THEN
    RAISE EXCEPTION 'SALES_CLOSING_PROTECTED_RECORD'
      USING DETAIL = 'Historical Sales Closings cannot be deleted.';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.closing_state IN ('finalized', 'correction_requested', 'corrected', 'locked')
     AND current_setting('app.sales_closing_transaction', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'SALES_CLOSING_PROTECTED_RECORD'
      USING DETAIL = 'Historical Sales Closings require an authorized correction transaction.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Preserve the fully reviewed accounting transaction while replacing only its
-- protected-history branch. A direct edit of a finalized ID returns a typed
-- correction-required result; a New Closing without an ID proceeds as a new
-- draft even when historical rows share the same business session.
DO $$
DECLARE
  v_original text;
  v_definition text;
  v_old_branch text := $branch$
  IF v_has_existing AND v_existing.closing_state IN ('finalized', 'correction_requested', 'corrected', 'locked') THEN
    RAISE EXCEPTION 'SALES_CLOSING_HISTORY_IMMUTABLE'
      USING DETAIL = 'Use the correction request workflow for a finalized closing.';
  END IF;$branch$;
  v_new_branch text := $branch$
  IF v_has_existing AND v_existing.closing_state IN ('finalized', 'correction_requested', 'corrected', 'locked') THEN
    IF p_closing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'closing', to_jsonb(v_existing),
        'idempotent', false,
        'finalized_transition', false,
        'requires_correction', true,
        'lifecycle_action', 'correction_required'
      );
    END IF;
    v_has_existing := false;
  END IF;$branch$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_original
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'erp_save_sales_closing'
    AND pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb, p_closing_id uuid, p_request_id uuid';

  IF v_original IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_SAVE_FUNCTION_NOT_FOUND';
  END IF;

  v_definition := replace(v_original, v_old_branch, v_new_branch);
  IF v_definition = v_original THEN
    RAISE EXCEPTION 'SALES_CLOSING_SAVE_FUNCTION_UNEXPECTED_VERSION';
  END IF;

  EXECUTE v_definition;
END;
$$;

-- The older insert trigger also checked every historical row, which would
-- defeat the draft-only index above. Keep its advisory lock but scope both the
-- new row and the duplicate search to active draft/ready lifecycle states.
CREATE OR REPLACE FUNCTION public.erp_prevent_duplicate_daily_closing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  closing_scope text;
BEGIN
  IF COALESCE(NEW.closing_state, 'draft') NOT IN ('draft', 'ready') THEN
    RETURN NEW;
  END IF;

  IF NEW.restaurant_id IS NULL
     OR (NEW.branch_id IS NULL AND NULLIF(btrim(COALESCE(NEW.branch, '')), '') IS NULL)
     OR NEW.date IS NULL
     OR NULLIF(btrim(COALESCE(NEW.shift, '')), '') IS NULL
     OR (NEW.cashier_id IS NULL AND NULLIF(btrim(COALESCE(NEW.cashier_name, '')), '') IS NULL) THEN
    RETURN NEW;
  END IF;

  closing_scope := concat_ws(
    '|',
    NEW.restaurant_id::text,
    COALESCE(NEW.branch_id::text, 'legacy:' || lower(btrim(NEW.branch))),
    NEW.date::text,
    lower(btrim(NEW.shift)),
    COALESCE(NEW.cashier_id::text, 'legacy:' || lower(btrim(NEW.cashier_name)))
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(closing_scope, 0));

  IF EXISTS (
    SELECT 1
    FROM public.daily_sales AS existing_closing
    WHERE existing_closing.closing_state IN ('draft', 'ready')
      AND existing_closing.restaurant_id = NEW.restaurant_id
      AND COALESCE(existing_closing.branch_id::text, 'legacy:' || lower(btrim(existing_closing.branch)))
          = COALESCE(NEW.branch_id::text, 'legacy:' || lower(btrim(NEW.branch)))
      AND existing_closing.date = NEW.date
      AND lower(btrim(existing_closing.shift)) = lower(btrim(NEW.shift))
      AND COALESCE(existing_closing.cashier_id::text, 'legacy:' || lower(btrim(existing_closing.cashier_name)))
          = COALESCE(NEW.cashier_id::text, 'legacy:' || lower(btrim(NEW.cashier_name)))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'CLOSING_ALREADY_EXISTS',
      DETAIL = 'An active draft closing already exists for this restaurant, branch, date, shift, and cashier.';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
