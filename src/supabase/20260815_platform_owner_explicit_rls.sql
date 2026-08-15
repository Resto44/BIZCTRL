BEGIN;

DROP POLICY IF EXISTS platform_owner_accounts_deny_direct ON public.platform_owner_accounts;
CREATE POLICY platform_owner_accounts_deny_direct ON public.platform_owner_accounts AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS platform_owner_activity_logs_deny_direct ON public.platform_owner_activity_logs;
CREATE POLICY platform_owner_activity_logs_deny_direct ON public.platform_owner_activity_logs AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS platform_manual_payment_settings_deny_direct ON public.platform_manual_payment_settings;
CREATE POLICY platform_manual_payment_settings_deny_direct ON public.platform_manual_payment_settings AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS platform_promotions_deny_direct ON public.platform_promotions;
CREATE POLICY platform_promotions_deny_direct ON public.platform_promotions AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS subscription_feature_overrides_deny_direct ON public.subscription_feature_overrides;
CREATE POLICY subscription_feature_overrides_deny_direct ON public.subscription_feature_overrides AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false);

COMMIT;
