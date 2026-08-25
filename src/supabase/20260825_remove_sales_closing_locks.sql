-- Sales Closing normal-editing restoration
--
-- Historical records and their audit fields are retained. This migration removes
-- only the lifecycle guard and correction-only RPC that blocked ordinary Save
-- Draft and Finalize requests for existing closings.

BEGIN;

-- Remove the trigger that rejected updates to finalized or legacy locked rows.
-- Existing closing_state, locked_at, locked_by, and closing_audit data remain
-- unchanged so that historical records are neither deleted nor reset.
DROP TRIGGER IF EXISTS erp_guard_daily_sales_closing_lifecycle ON public.daily_sales;
DROP FUNCTION IF EXISTS public.erp_guard_daily_sales_closing_lifecycle();

-- The correction-only path is no longer part of the Sales Closing lifecycle.
DROP FUNCTION IF EXISTS public.request_daily_sales_closing_correction(uuid);

-- Preserve the canonical duplicate-session safeguard, including the cashier
-- dimension. The older trigger omitted cashier identity and could reject a
-- different cashier's valid session as if the whole business period were locked.
CREATE OR REPLACE FUNCTION public.erp_prevent_duplicate_daily_closing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  closing_scope text;
BEGIN
  -- Keep incomplete historical imports outside the normal session rule.
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

  -- Serialize identical session inserts. The unique index remains the final
  -- concurrency safeguard; no existing record is deleted or altered.
  PERFORM pg_advisory_xact_lock(hashtextextended(closing_scope, 0));

  IF EXISTS (
    SELECT 1
    FROM public.daily_sales AS existing_closing
    WHERE existing_closing.restaurant_id = NEW.restaurant_id
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
      DETAIL = 'A daily closing already exists for this restaurant, branch, date, shift, and cashier.';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.erp_prevent_duplicate_daily_closing() IS
  'Prevents duplicate Sales Closing sessions by restaurant, branch, date, shift, and cashier without locking existing closings.';

COMMIT;
