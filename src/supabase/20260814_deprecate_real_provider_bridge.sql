BEGIN;

-- No payment gateway is enabled in this release. Preserve the function signature
-- as a dormant adapter seam for a later integration, but make activation through
-- external provider events impossible until that integration is intentionally
-- deployed with credentials and signature verification.
CREATE OR REPLACE FUNCTION public.apply_subscription_provider_event(
  p_provider text, p_event_id text, p_event_type text, p_payment_id uuid,
  p_subscription_id text DEFAULT NULL, p_checkout_session_id text DEFAULT NULL,
  p_invoice_id text DEFAULT NULL, p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL, p_amount_cents integer DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001',
    MESSAGE = 'PAYMENT_PROVIDER_NOT_ENABLED',
    DETAIL = 'No real payment gateway is enabled. Use the owner-only Mock/Test provider only in an explicitly enabled non-production environment.';
END;
$$;

COMMENT ON FUNCTION public.apply_subscription_provider_event(text, text, text, uuid, text, text, text, date, date, integer, jsonb)
  IS 'Dormant provider-adapter seam. This release has no live payment provider enabled.';

COMMIT;
