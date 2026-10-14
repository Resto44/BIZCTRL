-- Payroll finalization must be idempotent across browser tabs.
-- Legacy null-scope rows are not automatically linked to any restaurant.
CREATE UNIQUE INDEX IF NOT EXISTS ux_payroll_runs_restaurant_employee_month
  ON public.payroll_runs (restaurant_id, employee_id, month)
  WHERE restaurant_id IS NOT NULL AND employee_id IS NOT NULL AND month IS NOT NULL;
