-- Preserve the calculated results of future Sales Closings for accurate History.
-- Existing records intentionally remain unchanged because their historical
-- expense basis was never stored and must not be reconstructed or overwritten.

BEGIN;

ALTER TABLE public.daily_sales
  ADD COLUMN IF NOT EXISTS expenses_total NUMERIC,
  ADD COLUMN IF NOT EXISTS operating_result NUMERIC;

COMMENT ON COLUMN public.daily_sales.expenses_total IS
  'Immutable total of the expense records included when this Sales Closing was saved.';
COMMENT ON COLUMN public.daily_sales.operating_result IS
  'Immutable Sales Closing result: total sales less approved purchases and expenses at save time.';

COMMIT;
