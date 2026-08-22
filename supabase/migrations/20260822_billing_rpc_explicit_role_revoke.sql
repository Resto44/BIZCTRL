BEGIN;

-- The production ACL inspection showed explicit role grants in addition to
-- PostgreSQL's PUBLIC grant. Remove anonymous access explicitly, then restore
-- only the canonical runtime callers for each procedure.

REVOKE ALL ON FUNCTION public.cancel_subscription_at_period_end() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_subscription_at_period_end() TO authenticated;

REVOKE ALL ON FUNCTION public.erp_consume_subscription_usage(text, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_consume_subscription_usage(text, bigint, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.erp_require_subscription_feature(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_require_subscription_feature(text) TO authenticated;

REVOKE ALL ON FUNCTION public.erp_subscription_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_subscription_snapshot(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.paddle_create_checkout_context(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.paddle_create_checkout_context(text) TO authenticated;

REVOKE ALL ON FUNCTION public.paddle_customer_portal_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.paddle_customer_portal_context() TO authenticated;

REVOKE ALL ON FUNCTION public.paddle_link_checkout_transaction(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paddle_link_checkout_transaction(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.paddle_apply_webhook_event(text, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paddle_apply_webhook_event(text, text, timestamptz, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.apply_subscription_provider_event(text, text, text, uuid, text, text, text, date, date, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_subscription_checkout_intent(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_subscription_payment_intent(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.erp_apply_mock_test_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_apply_mock_test_payment(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.erp_set_subscription_test_mode(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_set_subscription_test_mode(boolean) TO service_role;
REVOKE ALL ON FUNCTION public.erp_simulate_subscription_lifecycle(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_simulate_subscription_lifecycle(text) TO authenticated;

COMMIT;
