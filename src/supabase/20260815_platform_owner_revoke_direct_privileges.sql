BEGIN;

REVOKE ALL ON TABLE public.platform_owner_accounts FROM anon, authenticated;
REVOKE ALL ON TABLE public.platform_owner_activity_logs FROM anon, authenticated;
REVOKE ALL ON TABLE public.platform_manual_payment_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.platform_promotions FROM anon, authenticated;
REVOKE ALL ON TABLE public.subscription_feature_overrides FROM anon, authenticated;

COMMIT;
