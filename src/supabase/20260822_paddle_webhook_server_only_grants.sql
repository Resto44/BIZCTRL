-- Paddle reconciliation is invoked only by verified server-side Edge Functions.
-- Browser roles must not be able to call these SECURITY DEFINER routines directly.

REVOKE ALL ON FUNCTION public.paddle_apply_webhook_event(text, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paddle_apply_webhook_event(text, text, timestamptz, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.paddle_apply_customer_webhook_event(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paddle_apply_customer_webhook_event(text, text, jsonb) TO service_role;
