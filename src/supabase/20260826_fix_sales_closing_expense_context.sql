-- Canonical Sales Closing expense context.
-- This function is read-only and deterministic: opening, saving, or finalizing a
-- Closing cannot create or duplicate an expense allocation.
CREATE OR REPLACE FUNCTION public.erp_sales_closing_expense_context(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_branch text,
  p_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_branch_key text;
BEGIN
  IF auth.uid() IS NULL
     OR p_restaurant_id IS NULL
     OR p_branch_id IS NULL
     OR p_date IS NULL
     OR NOT public.erp_can_access_scope_text(p_restaurant_id::text, p_branch_id::text) THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
  END IF;

  SELECT branch.branch_key
    INTO v_branch_key
  FROM public.branches AS branch
  WHERE branch.id = p_branch_id
    AND branch.restaurant_id = p_restaurant_id
  LIMIT 1;

  IF v_branch_key IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_BRANCH_CONTEXT_INVALID';
  END IF;

  RETURN (
    WITH fixed_sources AS (
      SELECT
        category.id,
        GREATEST(
          COALESCE(NULLIF(category.monthly_amount, 0), monthly_record.amount, 0),
          0
        ) AS monthly_amount,
        GREATEST(COALESCE(category.allocation_days, 30), 1) AS allocation_days
      FROM public.expense_categories AS category
      LEFT JOIN LATERAL (
        -- A legacy fixed monthly Expense row is a branch-specific monthly source.
        -- Only its current calendar month and dates on or before this Closing may
        -- contribute, preventing future or duplicate historical rows from loading.
        SELECT expense.amount
        FROM public.expenses AS expense
        WHERE expense.restaurant_id = p_restaurant_id
          AND (expense.branch_id = p_branch_id OR (expense.branch_id IS NULL AND expense.branch_key = v_branch_key))
          AND COALESCE(expense.expense_category_id, expense.category_id) = category.id
          AND expense.date <= p_date
          AND date_trunc('month', expense.date)::date = date_trunc('month', p_date)::date
          AND lower(COALESCE(expense.status, 'pending')) NOT IN ('cancelled', 'canceled', 'rejected', 'void', 'voided', 'deleted')
        ORDER BY expense.date DESC, expense.created_date DESC, expense.id DESC
        LIMIT 1
      ) AS monthly_record ON true
      WHERE category.restaurant_id = p_restaurant_id
        AND COALESCE(category.is_active, true) = true
        AND (COALESCE(category.is_fixed, false) = true OR lower(COALESCE(category.expense_type, 'variable')) = 'fixed')
        -- A configured monthly value must be owned by this branch. A global legacy
        -- category may participate only when its selected-branch monthly record is
        -- present; it can never pull an amount from another branch.
        AND (
          category.branch_id = p_branch_id
          OR (category.branch_id IS NULL AND monthly_record.amount IS NOT NULL)
        )
    ), fixed AS (
      SELECT COALESCE(SUM(ROUND(monthly_amount / allocation_days, 2)), 0) AS fixed_expense_today
      FROM fixed_sources
    ), variable AS (
      SELECT COALESCE(SUM(GREATEST(COALESCE(expense.amount, 0), 0)), 0) AS variable_expenses_today
      FROM public.expenses AS expense
      LEFT JOIN public.expense_categories AS category
        ON category.id = COALESCE(expense.expense_category_id, expense.category_id)
      WHERE expense.restaurant_id = p_restaurant_id
        AND expense.date = p_date
        AND (expense.branch_id = p_branch_id OR (expense.branch_id IS NULL AND expense.branch_key = v_branch_key))
        AND lower(COALESCE(expense.status, 'pending')) NOT IN ('cancelled', 'canceled', 'rejected', 'void', 'voided', 'deleted')
        AND NOT (COALESCE(category.is_fixed, false) = true OR lower(COALESCE(category.expense_type, 'variable')) = 'fixed')
    )
    SELECT jsonb_build_object(
      'fixed_expense_today', fixed.fixed_expense_today,
      'variable_expenses_today', variable.variable_expenses_today,
      'total_daily_expenses', fixed.fixed_expense_today + variable.variable_expenses_today
    )
    FROM fixed CROSS JOIN variable
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.erp_sales_closing_expense_context(uuid, uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_sales_closing_expense_context(uuid, uuid, text, date) TO authenticated;

DO $verify$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'erp_sales_closing_expense_context'
    AND pg_get_function_identity_arguments(p.oid) = 'p_restaurant_id uuid, p_branch_id uuid, p_branch text, p_date date'
  LIMIT 1;

  IF position('erp_can_access_scope_text(p_restaurant_id::text, p_branch_id::text)' IN COALESCE(v_definition, '')) = 0
     OR position('expense.branch_id = p_branch_id' IN COALESCE(v_definition, '')) = 0
     OR position('expense.date = p_date' IN COALESCE(v_definition, '')) = 0
     OR position('monthly_amount / allocation_days' IN COALESCE(v_definition, '')) = 0
     OR position('expense.date <= p_date' IN COALESCE(v_definition, '')) = 0
     OR position('total_daily_expenses' IN COALESCE(v_definition, '')) = 0 THEN
    RAISE EXCEPTION 'SALES_CLOSING_EXPENSE_CONTEXT_VERIFICATION_FAILED';
  END IF;
END;
$verify$;
