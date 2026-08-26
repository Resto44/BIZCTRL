-- Opening Cash must be the prior finalized Closing's physical Actual Cash only.
-- Do not carry forward expected cash, revenue, Sales Sources, owner funding, or
-- Branch Wallet settlement amounts. Scope the predecessor to the same Closing
-- identity: restaurant, branch, shift/cashier, and immediately prior period.

CREATE OR REPLACE FUNCTION public.erp_sales_closing_opening_cash(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_branch text,
  p_date date,
  p_shift text,
  p_cashier_id uuid,
  p_current_closing_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE((
    SELECT COALESCE(previous_closing.actual_cash, 0)
    FROM public.daily_sales AS previous_closing
    WHERE previous_closing.restaurant_id = p_restaurant_id::text
      AND (previous_closing.branch_id = p_branch_id OR (previous_closing.branch_id IS NULL AND previous_closing.branch = p_branch))
      AND previous_closing.id IS DISTINCT FROM p_current_closing_id
      AND previous_closing.closing_state = 'finalized'
      AND (
        p_cashier_id IS NULL
        OR COALESCE(previous_closing.cashier_id, previous_closing.cashier_employee_id) = p_cashier_id
      )
      AND (
        previous_closing.date < p_date
        OR (
          previous_closing.date = p_date
          AND CASE lower(COALESCE(previous_closing.shift, '')) WHEN 'morning' THEN 1 WHEN 'evening' THEN 2 ELSE 0 END
              < CASE lower(COALESCE(p_shift, '')) WHEN 'morning' THEN 1 WHEN 'evening' THEN 2 ELSE 0 END
        )
      )
    ORDER BY previous_closing.date DESC,
      CASE lower(COALESCE(previous_closing.shift, '')) WHEN 'evening' THEN 2 WHEN 'morning' THEN 1 ELSE 0 END DESC,
      previous_closing.updated_date DESC
    LIMIT 1
  ), 0);
$function$;

DO $verify$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'erp_sales_closing_opening_cash'
    AND pg_get_function_identity_arguments(p.oid) = 'p_restaurant_id uuid, p_branch_id uuid, p_branch text, p_date date, p_shift text, p_cashier_id uuid, p_current_closing_id uuid'
  LIMIT 1;

  IF position('COALESCE(previous_closing.actual_cash, 0)' IN COALESCE(v_definition, '')) = 0
     OR position('owner_payment_amount' IN COALESCE(v_definition, '')) > 0
     OR position('wallet_payment_amount' IN COALESCE(v_definition, '')) > 0
     OR position('COALESCE(previous_closing.cashier_id, previous_closing.cashier_employee_id) = p_cashier_id' IN COALESCE(v_definition, '')) = 0 THEN
    RAISE EXCEPTION 'SALES_CLOSING_OPENING_CASH_SOURCE_VERIFICATION_FAILED';
  END IF;
END;
$verify$;
