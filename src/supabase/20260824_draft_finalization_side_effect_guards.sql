-- Draft closings are work-in-progress records. Invoice numbering, invoice sync,
-- and cash-movement posting are deferred until the explicit finalized transition.
-- Existing data is intentionally left untouched.

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

DROP TRIGGER IF EXISTS trg_daily_sales_gen_inv_num ON public.daily_sales;
CREATE TRIGGER trg_daily_sales_gen_inv_num
  BEFORE INSERT OR UPDATE ON public.daily_sales
  FOR EACH ROW
  WHEN (COALESCE(NEW.closing_state, 'finalized') = 'finalized')
  EXECUTE FUNCTION public.fn_daily_sales_generate_invoice_number();

DROP TRIGGER IF EXISTS trg_daily_sales_sync_invoice ON public.daily_sales;
CREATE TRIGGER trg_daily_sales_sync_invoice
  AFTER INSERT OR UPDATE ON public.daily_sales
  FOR EACH ROW
  WHEN (COALESCE(NEW.closing_state, 'finalized') = 'finalized')
  EXECUTE FUNCTION public.fn_daily_sales_sync_invoice();

DROP TRIGGER IF EXISTS trg_daily_sales_cash_movement ON public.daily_sales;
CREATE TRIGGER trg_daily_sales_cash_movement
  AFTER INSERT OR UPDATE ON public.daily_sales
  FOR EACH ROW
  WHEN (COALESCE(NEW.closing_state, 'finalized') = 'finalized')
  EXECUTE FUNCTION public.trg_auto_cash_movement_and_recalculate();

DROP TRIGGER IF EXISTS trg_daily_sales_cash_movement_delete ON public.daily_sales;
CREATE TRIGGER trg_daily_sales_cash_movement_delete
  AFTER DELETE ON public.daily_sales
  FOR EACH ROW
  WHEN (COALESCE(OLD.closing_state, 'finalized') = 'finalized')
  EXECUTE FUNCTION public.trg_auto_cash_movement_and_recalculate();
