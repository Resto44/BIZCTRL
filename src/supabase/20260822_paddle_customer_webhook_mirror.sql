-- Mirror verified Paddle customer events into the existing canonical subscription rows.
-- No customer, subscription, plan, payment, or entitlement table is created or replaced.

CREATE OR REPLACE FUNCTION public.paddle_apply_customer_webhook_event(
  p_event_id text,
  p_event_type text,
  p_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_customer_id text := coalesce(p_data->>'id', '');
  v_email text := nullif(lower(btrim(coalesce(p_data->>'email', ''))), '');
  v_updated_count integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_SERVER_ONLY';
  END IF;

  IF coalesce(p_event_id, '') !~ '^evt_[a-z0-9]{26}$'
     OR p_event_type NOT IN ('customer.created', 'customer.updated')
     OR v_customer_id !~ '^ctm_[a-z0-9]{26}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_CUSTOMER_EVENT_INVALID';
  END IF;

  UPDATE public.subscriptions
  SET paddle_customer_id = v_customer_id,
      billing_email = coalesce(v_email, billing_email),
      payment_provider = CASE WHEN payment_provider = 'paddle' THEN 'paddle' ELSE payment_provider END,
      updated_at = now()
  WHERE paddle_customer_id = v_customer_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'processed', true,
    'event_id', p_event_id,
    'event_type', p_event_type,
    'matched_subscriptions', v_updated_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.paddle_apply_customer_webhook_event(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paddle_apply_customer_webhook_event(text, text, jsonb) TO service_role;
