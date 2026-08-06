-- Persist the Branch Manager's resolved Sales Closing assignments on each daily sale.
-- cashier_id can represent the authenticated Branch Manager or an employee cashier,
-- so it intentionally remains an unconstrained UUID.
ALTER TABLE public.daily_sales
  ADD COLUMN IF NOT EXISTS cashier_id UUID,
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id),
  ADD COLUMN IF NOT EXISTS pos_device_id UUID REFERENCES public.network_accounts(id);

CREATE INDEX IF NOT EXISTS idx_daily_sales_cashier_id
  ON public.daily_sales (cashier_id)
  WHERE cashier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_daily_sales_customer_id
  ON public.daily_sales (customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_daily_sales_pos_device_id
  ON public.daily_sales (pos_device_id)
  WHERE pos_device_id IS NOT NULL;
