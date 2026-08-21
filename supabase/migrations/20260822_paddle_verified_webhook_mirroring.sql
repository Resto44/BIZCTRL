-- Paddle webhook fulfillment mirrors verified provider state into the existing
-- canonical billing schema. This migration intentionally does not alter or
-- delete any existing Paddle, subscription, customer, payment, or event data.

CREATE TABLE IF NOT EXISTS public.paddle_customers (
  paddle_customer_id text PRIMARY KEY,
  -- Customer notifications can arrive after subscription notifications, so email is
  -- completed by customer.created/customer.updated rather than fabricated.
  email text,
  name text,
  locale text,
  status text,
  custom_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paddle_customers_paddle_customer_id_format
    CHECK (paddle_customer_id ~ '^ctm_[a-z0-9]{26}$')
);

CREATE TABLE IF NOT EXISTS public.paddle_subscription_mirror (
  paddle_subscription_id text PRIMARY KEY,
  paddle_customer_id text NOT NULL REFERENCES public.paddle_customers(paddle_customer_id),
  status text NOT NULL,
  paddle_price_id text,
  paddle_product_id text,
  scheduled_change_action text,
  scheduled_change_at timestamptz,
  current_billing_period_starts_at timestamptz,
  current_billing_period_ends_at timestamptz,
  custom_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paddle_subscription_mirror_paddle_subscription_id_format
    CHECK (paddle_subscription_id ~ '^sub_[a-z0-9]{26}$')
);

CREATE INDEX IF NOT EXISTS paddle_subscription_mirror_customer_id_idx
  ON public.paddle_subscription_mirror (paddle_customer_id);

CREATE TABLE IF NOT EXISTS public.paddle_webhook_events (
  paddle_event_id text PRIMARY KEY,
  paddle_event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paddle_webhook_events_paddle_event_id_format
    CHECK (paddle_event_id ~ '^evt_[a-z0-9]{26}$')
);

CREATE INDEX IF NOT EXISTS paddle_webhook_events_occurred_at_idx
  ON public.paddle_webhook_events (occurred_at DESC);

ALTER TABLE public.paddle_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paddle_subscription_mirror ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paddle_webhook_events ENABLE ROW LEVEL SECURITY;

-- The browser must not read or write provider mirrors or the webhook event log.
-- Server-side functions use SECURITY DEFINER and service-role-only checks.
REVOKE ALL ON TABLE public.paddle_customers FROM anon, authenticated;
REVOKE ALL ON TABLE public.paddle_subscription_mirror FROM anon, authenticated;
REVOKE ALL ON TABLE public.paddle_webhook_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.paddle_subscription_grants_access(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT lower(coalesce(p_status, '')) IN ('active', 'trialing');
$function$;

COMMENT ON FUNCTION public.paddle_subscription_grants_access(text) IS
  'Paddle-level access rule: only active and trialing subscriptions grant access. Scheduled cancellation or pause requests are not revocations; paused and past_due do not grant access.';

CREATE OR REPLACE FUNCTION public.paddle_sync_verified_webhook_event(
  p_event_id text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $function$
DECLARE
  v_event_time timestamptz := coalesce(p_occurred_at, now());
  v_customer_id text := nullif(p_data ->> 'id', '');
  v_subscription_id text := nullif(p_data ->> 'id', '');
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_SERVER_ONLY';
  END IF;

  IF coalesce(p_event_id, '') !~ '^evt_[a-z0-9]{26}$'
     OR p_event_type NOT IN (
       'customer.created',
       'customer.updated',
       'subscription.created',
       'subscription.updated',
       'subscription.canceled',
       'transaction.completed'
     )
     OR jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_EVENT_INVALID';
  END IF;

  INSERT INTO public.paddle_webhook_events (
    paddle_event_id,
    paddle_event_type,
    occurred_at,
    payload
  ) VALUES (
    p_event_id,
    p_event_type,
    v_event_time,
    p_data
  ) ON CONFLICT (paddle_event_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('processed', false, 'reason', 'duplicate_event');
  END IF;

  IF p_event_type IN ('customer.created', 'customer.updated') THEN
    IF coalesce(v_customer_id, '') !~ '^ctm_[a-z0-9]{26}$'
       OR coalesce(nullif(p_data ->> 'email', ''), '') = '' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_CUSTOMER_INVALID';
    END IF;

    INSERT INTO public.paddle_customers (
      paddle_customer_id,
      email,
      name,
      locale,
      status,
      custom_data,
      provider_created_at,
      provider_updated_at
    ) VALUES (
      v_customer_id,
      p_data ->> 'email',
      nullif(p_data ->> 'name', ''),
      nullif(p_data ->> 'locale', ''),
      nullif(p_data ->> 'status', ''),
      coalesce(p_data -> 'custom_data', '{}'::jsonb),
      nullif(p_data ->> 'created_at', '')::timestamptz,
      nullif(p_data ->> 'updated_at', '')::timestamptz
    ) ON CONFLICT (paddle_customer_id) DO UPDATE
    SET email = EXCLUDED.email,
        name = EXCLUDED.name,
        locale = EXCLUDED.locale,
        status = EXCLUDED.status,
        custom_data = EXCLUDED.custom_data,
        provider_created_at = EXCLUDED.provider_created_at,
        provider_updated_at = EXCLUDED.provider_updated_at,
        updated_at = now()
    WHERE public.paddle_customers.provider_updated_at IS NULL
       OR EXCLUDED.provider_updated_at IS NULL
       OR EXCLUDED.provider_updated_at >= public.paddle_customers.provider_updated_at;

    RETURN jsonb_build_object('processed', true, 'kind', 'customer');
  END IF;

  IF p_event_type IN ('subscription.created', 'subscription.updated', 'subscription.canceled') THEN
    IF coalesce(v_subscription_id, '') !~ '^sub_[a-z0-9]{26}$'
       OR coalesce(nullif(p_data ->> 'customer_id', ''), '') !~ '^ctm_[a-z0-9]{26}$'
       OR coalesce(nullif(p_data ->> 'status', ''), '') = '' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_SUBSCRIPTION_INVALID';
    END IF;

    INSERT INTO public.paddle_customers (
      paddle_customer_id,
      email,
      custom_data,
      provider_updated_at
    ) VALUES (
      p_data ->> 'customer_id',
      nullif(p_data #>> '{custom_data,email}', ''),
      '{}'::jsonb,
      v_event_time
    ) ON CONFLICT (paddle_customer_id) DO NOTHING;

    INSERT INTO public.paddle_subscription_mirror (
      paddle_subscription_id,
      paddle_customer_id,
      status,
      paddle_price_id,
      paddle_product_id,
      scheduled_change_action,
      scheduled_change_at,
      current_billing_period_starts_at,
      current_billing_period_ends_at,
      custom_data,
      provider_created_at,
      provider_updated_at
    ) VALUES (
      v_subscription_id,
      p_data ->> 'customer_id',
      p_data ->> 'status',
      coalesce(nullif(p_data #>> '{items,0,price,id}', ''), nullif(p_data #>> '{items,0,price_id}', '')),
      nullif(p_data #>> '{items,0,price,product_id}', ''),
      nullif(p_data #>> '{scheduled_change,action}', ''),
      nullif(p_data #>> '{scheduled_change,effective_at}', '')::timestamptz,
      nullif(p_data #>> '{current_billing_period,starts_at}', '')::timestamptz,
      nullif(p_data #>> '{current_billing_period,ends_at}', '')::timestamptz,
      coalesce(p_data -> 'custom_data', '{}'::jsonb),
      nullif(p_data ->> 'created_at', '')::timestamptz,
      nullif(p_data ->> 'updated_at', '')::timestamptz
    ) ON CONFLICT (paddle_subscription_id) DO UPDATE
    SET paddle_customer_id = EXCLUDED.paddle_customer_id,
        status = EXCLUDED.status,
        paddle_price_id = EXCLUDED.paddle_price_id,
        paddle_product_id = EXCLUDED.paddle_product_id,
        scheduled_change_action = EXCLUDED.scheduled_change_action,
        scheduled_change_at = EXCLUDED.scheduled_change_at,
        current_billing_period_starts_at = EXCLUDED.current_billing_period_starts_at,
        current_billing_period_ends_at = EXCLUDED.current_billing_period_ends_at,
        custom_data = EXCLUDED.custom_data,
        provider_created_at = EXCLUDED.provider_created_at,
        provider_updated_at = EXCLUDED.provider_updated_at,
        updated_at = now()
    WHERE public.paddle_subscription_mirror.provider_updated_at IS NULL
       OR EXCLUDED.provider_updated_at IS NULL
       OR EXCLUDED.provider_updated_at >= public.paddle_subscription_mirror.provider_updated_at;
  END IF;

  -- The canonical tenant subscription is only updated through the pre-existing
  -- guarded procedure. It validates checkout custom_data, price, tenant, event
  -- ordering, and payment association before it grants or revokes ERP access.
  v_result := public.paddle_apply_webhook_event(
    p_event_id,
    p_event_type,
    v_event_time,
    p_data
  );

  RETURN coalesce(v_result, jsonb_build_object('processed', true));
END;
$function$;

REVOKE ALL ON FUNCTION public.paddle_subscription_grants_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paddle_subscription_grants_access(text) TO service_role;

REVOKE ALL ON FUNCTION public.paddle_sync_verified_webhook_event(text, text, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paddle_sync_verified_webhook_event(text, text, timestamptz, jsonb) TO service_role;

COMMENT ON FUNCTION public.paddle_sync_verified_webhook_event(text, text, timestamptz, jsonb) IS
  'Service-role-only idempotent handler for Paddle events that have already passed SDK signature verification.';
