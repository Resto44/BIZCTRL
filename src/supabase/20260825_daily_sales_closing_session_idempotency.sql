BEGIN;

-- A Sales Closing session is uniquely identified by its restaurant, branch,
-- business date, shift, and cashier. Normalizing canonical UUID values and
-- legacy labels in one expression protects both record formats from duplicate
-- submissions, double taps, retries, and concurrent clients.
--
-- The preflight audit verified that existing production rows do not collide on
-- this key. The partial predicate intentionally leaves incomplete historical
-- imports untouched while every normal UI-created closing is protected.
CREATE UNIQUE INDEX IF NOT EXISTS daily_sales_unique_closing_session_idx
  ON public.daily_sales (
    restaurant_id,
    COALESCE(branch_id::text, 'legacy:' || lower(btrim(branch))),
    date,
    lower(btrim(shift)),
    COALESCE(cashier_id::text, 'legacy:' || lower(btrim(cashier_name)))
  )
  WHERE restaurant_id IS NOT NULL
    AND date IS NOT NULL
    AND NULLIF(btrim(shift), '') IS NOT NULL
    AND (branch_id IS NOT NULL OR NULLIF(btrim(branch), '') IS NOT NULL)
    AND (cashier_id IS NOT NULL OR NULLIF(btrim(cashier_name), '') IS NOT NULL);

COMMENT ON INDEX public.daily_sales_unique_closing_session_idx IS
  'Prevents duplicate Sales Closing sessions by restaurant, branch, date, shift, and cashier across canonical and legacy scope fields.';

COMMIT;
