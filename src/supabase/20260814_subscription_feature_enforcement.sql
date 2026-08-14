BEGIN;

-- Restrictive policies compose with the ERP's existing tenant scope policies.
-- `restaurant_id` is text in a few legacy tables and UUID in others, so policy
-- expressions normalize it to text before calling the canonical entitlement guard.
CREATE OR REPLACE FUNCTION public.erp_subscription_feature_row_allowed(p_feature text, p_restaurant_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.erp_can_access_scope_text(p_restaurant_id, NULL)
     AND EXISTS (
       SELECT 1
       FROM public.subscriptions s
       WHERE s.restaurant_id::text = nullif(p_restaurant_id, '')
         AND public.erp_subscription_can_use_feature(p_feature, s.restaurant_id)
     );
$$;

ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_feature_scheduled_reports ON public.scheduled_reports;
CREATE POLICY subscription_feature_scheduled_reports ON public.scheduled_reports AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.erp_subscription_feature_row_allowed('scheduled_reports', restaurant_id::text))
  WITH CHECK (public.erp_subscription_feature_row_allowed('scheduled_reports', restaurant_id::text));

ALTER TABLE public.ocr_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_feature_ocr_logs ON public.ocr_logs;
CREATE POLICY subscription_feature_ocr_logs ON public.ocr_logs AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.erp_subscription_feature_row_allowed('ocr', restaurant_id::text))
  WITH CHECK (public.erp_subscription_feature_row_allowed('ocr', restaurant_id::text));

ALTER TABLE public.product_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_feature_product_analytics ON public.product_analytics;
CREATE POLICY subscription_feature_product_analytics ON public.product_analytics AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.erp_subscription_feature_row_allowed('advanced_analytics', restaurant_id::text))
  WITH CHECK (public.erp_subscription_feature_row_allowed('advanced_analytics', restaurant_id::text));

ALTER TABLE public.network_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_feature_network_accounts ON public.network_accounts;
CREATE POLICY subscription_feature_network_accounts ON public.network_accounts AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.erp_subscription_feature_row_allowed('network_management', restaurant_id::text))
  WITH CHECK (public.erp_subscription_feature_row_allowed('network_management', restaurant_id::text));

ALTER TABLE public.network_pos_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_feature_network_pos_devices ON public.network_pos_devices;
CREATE POLICY subscription_feature_network_pos_devices ON public.network_pos_devices AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.erp_subscription_feature_row_allowed('network_management', restaurant_id::text))
  WITH CHECK (public.erp_subscription_feature_row_allowed('network_management', restaurant_id::text));

ALTER TABLE public.network_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_feature_network_transfers ON public.network_transfers;
CREATE POLICY subscription_feature_network_transfers ON public.network_transfers AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.erp_subscription_feature_row_allowed('network_management', restaurant_id::text))
  WITH CHECK (public.erp_subscription_feature_row_allowed('network_management', restaurant_id::text));

ALTER TABLE public.network_reconciliations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_feature_network_reconciliations ON public.network_reconciliations;
CREATE POLICY subscription_feature_network_reconciliations ON public.network_reconciliations AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.erp_subscription_feature_row_allowed('network_management', restaurant_id::text))
  WITH CHECK (public.erp_subscription_feature_row_allowed('network_management', restaurant_id::text));

COMMIT;
