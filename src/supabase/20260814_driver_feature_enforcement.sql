BEGIN;

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_feature_drivers ON public.drivers;
CREATE POLICY subscription_feature_drivers ON public.drivers AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.erp_subscription_feature_row_allowed('driver_analytics', restaurant_id::text))
  WITH CHECK (public.erp_subscription_feature_row_allowed('driver_analytics', restaurant_id::text));

COMMIT;
