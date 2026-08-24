-- Unified Sales Closing lifecycle and audit support.
-- Additive only: existing historical daily_sales rows remain intact and are treated as finalized.

BEGIN;

ALTER TABLE public.daily_sales
  ADD COLUMN IF NOT EXISTS closing_state text NOT NULL DEFAULT 'finalized',
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_by text,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS closing_audit jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'daily_sales_closing_state_valid'
      AND conrelid = 'public.daily_sales'::regclass
  ) THEN
    ALTER TABLE public.daily_sales
      ADD CONSTRAINT daily_sales_closing_state_valid
      CHECK (closing_state IN ('draft', 'finalized', 'locked'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'daily_sales_closing_audit_array'
      AND conrelid = 'public.daily_sales'::regclass
  ) THEN
    ALTER TABLE public.daily_sales
      ADD CONSTRAINT daily_sales_closing_audit_array
      CHECK (jsonb_typeof(closing_audit) = 'array');
  END IF;
END;
$constraint$;

-- Existing records are deliberately not updated here. Their new non-null default
-- state is finalized, while null audit/timestamp values retain original history
-- without invoking unrelated sales, treasury, or Driver Sales update triggers.

CREATE INDEX IF NOT EXISTS idx_daily_sales_closing_state_scope
  ON public.daily_sales (restaurant_id, branch_id, date DESC, closing_state);

CREATE OR REPLACE FUNCTION public.erp_guard_daily_sales_closing_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.closing_state = 'locked'
    AND NOT public.erp_can_manage_workspace_customization(OLD.restaurant_id) THEN
    RAISE EXCEPTION 'DAILY_SALES_CLOSING_LOCKED'
      USING DETAIL = 'A locked closing can only be corrected by an authorized owner workflow.';
  END IF;

  IF NEW.closing_state = 'locked' AND OLD.closing_state IS DISTINCT FROM 'locked'
    AND NOT public.erp_can_manage_workspace_customization(NEW.restaurant_id) THEN
    RAISE EXCEPTION 'DAILY_SALES_CLOSING_LOCK_DENIED'
      USING DETAIL = 'Only an authorized owner workflow can lock a closing.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS erp_guard_daily_sales_closing_lifecycle ON public.daily_sales;
CREATE TRIGGER erp_guard_daily_sales_closing_lifecycle
BEFORE UPDATE ON public.daily_sales
FOR EACH ROW EXECUTE FUNCTION public.erp_guard_daily_sales_closing_lifecycle();

COMMIT;
