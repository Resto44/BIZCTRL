-- A cash drawer cannot hold a negative physical amount. The previous
-- function returned a negative expected balance and then classified a positive
-- Actual Cash count as an Overage. Prevent new phantom-Overage closings.
-- No existing daily_sales, cash_movements or shortage history is modified.
CREATE OR REPLACE FUNCTION public.erp_sales_closing_expected_cash(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_branch text,
  p_date date,
  p_shift text,
  p_cashier_id uuid,
  p_current_closing_id uuid,
  p_current_cash_sales numeric
)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_opening numeric;
  v_cash_flow numeric;
  v_expected numeric;
BEGIN
  v_opening := public.erp_sales_closing_opening_cash(
    p_restaurant_id, p_branch_id, p_branch, p_date, p_shift, p_cashier_id,
    p_current_closing_id
  );

  SELECT COALESCE(SUM(CASE WHEN movement.direction = 'in' THEN movement.amount
                           WHEN movement.direction = 'out' THEN -movement.amount
                           ELSE 0 END), 0)
    INTO v_cash_flow
  FROM public.cash_movements movement
  WHERE movement.restaurant_id = p_restaurant_id
    AND (movement.branch_id = p_branch_id
      OR (movement.branch_id IS NULL AND movement.branch = p_branch))
    AND movement.date = p_date
    AND (movement.shift = p_shift OR movement.shift IS NULL)
    AND (movement.cashier_id = p_cashier_id OR movement.cashier_id IS NULL)
    AND COALESCE(movement.is_reversed,false) = false
    AND movement.source_record_id IS DISTINCT FROM p_current_closing_id::text
    AND NOT (movement.movement_type = 'owner_injection'
      AND movement.source_module = 'OwnerCashInjection'
      AND movement.source_document_id = p_current_closing_id::text);

  v_expected := round(v_opening + v_cash_flow
    + GREATEST(COALESCE(p_current_cash_sales, 0), 0), 2);
  IF v_expected < 0 THEN
    RAISE EXCEPTION 'SALES_CLOSING_CASH_LEDGER_OVERDRAWN'
      USING HINT = 'Reconcile cash withdrawals and properly posted funding movements before finalizing.';
  END IF;
  RETURN v_expected;
END;
$function$;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname='erp_sales_closing_expected_cash'
      AND position('SALES_CLOSING_CASH_LEDGER_OVERDRAWN' IN pg_get_functiondef(p.oid)) > 0
  ) THEN
    RAISE EXCEPTION 'CASH_OVERDRAW_GUARD_DEPLOY_INCOMPLETE';
  END IF;
END;
$verify$;
