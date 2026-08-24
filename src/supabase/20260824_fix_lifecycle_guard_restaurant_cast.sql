-- `daily_sales.restaurant_id` remains text for backward compatibility, while
-- the authorization helper accepts UUID. Cast only at the helper boundary.

CREATE OR REPLACE FUNCTION public.erp_guard_daily_sales_closing_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.closing_state = 'locked'
    AND NOT public.erp_can_manage_workspace_customization(NULLIF(OLD.restaurant_id, '')::uuid) THEN
    RAISE EXCEPTION 'DAILY_SALES_CLOSING_LOCKED'
      USING DETAIL = 'A locked closing can only be corrected by an authorized owner workflow.';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.closing_state = 'finalized'
    AND NEW.closing_state = 'draft' THEN
    RAISE EXCEPTION 'DAILY_SALES_CLOSING_FINALIZATION_REVERT_DENIED'
      USING DETAIL = 'A finalized closing cannot revert to draft because finalized financial records have already been posted.';
  END IF;

  IF NEW.closing_state = 'locked' AND OLD.closing_state IS DISTINCT FROM 'locked'
    AND NOT public.erp_can_manage_workspace_customization(NULLIF(NEW.restaurant_id, '')::uuid) THEN
    RAISE EXCEPTION 'DAILY_SALES_CLOSING_LOCK_DENIED'
      USING DETAIL = 'Only an authorized owner workflow can lock a closing.';
  END IF;

  RETURN NEW;
END;
$function$;
