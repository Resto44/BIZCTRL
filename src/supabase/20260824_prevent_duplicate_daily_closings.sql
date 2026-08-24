-- Prevent new duplicate daily closings while retaining all historical records.
-- The existing RLS policies and tenant/branch relationships remain unchanged.

CREATE OR REPLACE FUNCTION public.erp_prevent_duplicate_daily_closing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  closing_scope text;
BEGIN
  -- Preserve legacy inserts that do not yet carry a complete closing scope.
  IF NEW.restaurant_id IS NULL
     OR (NEW.branch_id IS NULL AND NULLIF(NEW.branch, '') IS NULL)
     OR NEW.date IS NULL
     OR NULLIF(NEW.shift, '') IS NULL THEN
    RETURN NEW;
  END IF;

  closing_scope := concat_ws(
    '|',
    NEW.restaurant_id::text,
    COALESCE(NEW.branch_id::text, NEW.branch),
    NEW.date::text,
    NEW.shift
  );

  -- A transaction-scoped advisory lock closes the race between a preflight check
  -- and the subsequent INSERT without changing or deleting historic records.
  PERFORM pg_advisory_xact_lock(hashtextextended(closing_scope, 0));

  IF EXISTS (
    SELECT 1
    FROM public.daily_sales AS existing_closing
    WHERE existing_closing.restaurant_id = NEW.restaurant_id
      AND COALESCE(existing_closing.branch_id::text, existing_closing.branch) = COALESCE(NEW.branch_id::text, NEW.branch)
      AND existing_closing.date = NEW.date
      AND existing_closing.shift = NEW.shift
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'CLOSING_ALREADY_EXISTS',
      DETAIL = 'A daily closing already exists for this restaurant, branch, date, and shift.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS erp_prevent_duplicate_daily_closing_insert ON public.daily_sales;

CREATE TRIGGER erp_prevent_duplicate_daily_closing_insert
BEFORE INSERT ON public.daily_sales
FOR EACH ROW
EXECUTE FUNCTION public.erp_prevent_duplicate_daily_closing();
