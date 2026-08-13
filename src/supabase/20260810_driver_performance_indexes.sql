-- Supports Owner Dashboard driver-performance analytics and manager delivery queries
-- without changing any application records.
CREATE INDEX IF NOT EXISTS idx_delivery_orders_restaurant_created_date
  ON public.delivery_orders (restaurant_id, created_date DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_driver_restaurant_branch
  ON public.delivery_orders (driver_id, restaurant_id, branch_id, created_date DESC);
