BEGIN;

-- Billing RPCs rely on authenticated owner/server checks. Remove PostgreSQL's
-- default PUBLIC execution permission so anonymous API callers cannot invoke
-- even guarded procedures. Explicitly retain only the callers used by the
-- canonical production checkout, portal, entitlement, and webhook paths.

REVOKE ALL ON FUNCTION public.cancel_subscription_at_period_end() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_subscription_at_period_end() TO authenticated;

REVOKE ALL ON FUNCTION public.erp_consume_subscription_usage(text, bigint, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erp_consume_subscription_usage(text, bigint, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.erp_require_subscription_feature(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erp_require_subscription_feature(text) TO authenticated;

REVOKE ALL ON FUNCTION public.erp_subscription_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erp_subscription_snapshot(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.paddle_create_checkout_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paddle_create_checkout_context(text) TO authenticated;

REVOKE ALL ON FUNCTION public.paddle_customer_portal_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paddle_customer_portal_context() TO authenticated;

REVOKE ALL ON FUNCTION public.paddle_link_checkout_transaction(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paddle_link_checkout_transaction(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.paddle_apply_webhook_event(text, text, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paddle_apply_webhook_event(text, text, timestamptz, jsonb) TO service_role;

-- The following are dormant legacy/test functions. The live Paddle checkout
-- does not call them, and they must not be exposed to anonymous callers.
REVOKE ALL ON FUNCTION public.apply_subscription_provider_event(text, text, text, uuid, text, text, text, date, date, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_subscription_checkout_intent(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_subscription_payment_intent(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_apply_mock_test_payment(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_set_subscription_test_mode(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_simulate_subscription_lifecycle(text) FROM PUBLIC;

COMMIT;
