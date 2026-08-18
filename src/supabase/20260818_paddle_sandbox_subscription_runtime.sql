BEGIN;

-- Paddle identifiers are provider metadata on the existing canonical subscription
-- tables. They do not create a parallel billing or tenant model.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paddle_customer_id text,
  ADD COLUMN IF NOT EXISTS paddle_subscription_id text,
  ADD COLUMN IF NOT EXISTS paddle_price_id text,
  ADD COLUMN IF NOT EXISTS paddle_event_occurred_at timestamptz;

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS paddle_transaction_id text,
  ADD COLUMN IF NOT EXISTS paddle_event_occurred_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_paddle_subscription_unique_idx
  ON public.subscriptions (paddle_subscription_id)
  WHERE paddle_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_paddle_transaction_unique_idx
  ON public.subscription_payments (paddle_transaction_id)
  WHERE paddle_transaction_id IS NOT NULL;

-- Checkout can only be initiated by the approved owner of the authenticated
-- organization. The client supplies only a plan key; price, tenant, and payment
-- association are all calculated and persisted in the database.
CREATE OR REPLACE FUNCTION public.paddle_create_checkout_context(p_plan_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_restaurant_id uuid := public.auth_user_restaurant_id();
  v_subscription public.subscriptions;
  v_plan public.subscription_plans;
  v_payment public.subscription_payments;
  v_existing_payment public.subscription_payments;
BEGIN
  PERFORM public.erp_assert_billing_owner(v_restaurant_id);

  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = btrim(coalesce(p_plan_id, ''))
    AND is_active
    AND is_public
    AND monthly_price_cents > 0
    AND paddle_price_id ~ '^pri_[a-z0-9]{26}$';
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_SANDBOX_PRICE_NOT_CONFIGURED';
  END IF;

  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE restaurant_id = v_restaurant_id
  FOR UPDATE;
  IF v_subscription.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_NOT_FOUND';
  END IF;

  SELECT * INTO v_existing_payment
  FROM public.subscription_payments
  WHERE subscription_id = v_subscription.id
    AND provider = 'paddle'
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_payment.id IS NOT NULL AND v_existing_payment.plan_id = v_plan.id THEN
    RETURN jsonb_build_object(
      'payment_id', v_existing_payment.id,
      'plan_id', v_plan.id,
      'paddle_price_id', v_plan.paddle_price_id,
      'transaction_id', v_existing_payment.paddle_transaction_id,
      'reused', true
    );
  END IF;

  IF v_existing_payment.id IS NOT NULL THEN
    UPDATE public.subscription_payments
    SET status = 'superseded', updated_at = now()
    WHERE id = v_existing_payment.id;
  END IF;

  UPDATE public.subscriptions
  SET plan = v_plan.id,
      subscription_status = 'PENDING_PAYMENT',
      payment_provider = 'paddle',
      cancel_at_period_end = false,
      canceled_at = NULL,
      updated_at = now()
  WHERE id = v_subscription.id;

  INSERT INTO public.subscription_payments (
    subscription_id, restaurant_id, plan_id, provider, status, amount_cents,
    currency, is_test, display_label, metadata
  ) VALUES (
    v_subscription.id, v_restaurant_id, v_plan.id, 'paddle', 'pending',
    v_plan.monthly_price_cents, 'USD', true, 'Paddle Sandbox checkout pending',
    jsonb_build_object(
      'requested_by', auth.uid(),
      'paddle_environment', 'sandbox',
      'paddle_price_id', v_plan.paddle_price_id,
      'original_price_cents', v_plan.original_price_cents,
      'discount_percent', v_plan.discount_percent,
      'trial_days', v_plan.trial_days,
      'reactivation', v_subscription.subscription_status IN ('CANCELED', 'EXPIRED', 'PAST_DUE')
    )
  ) RETURNING * INTO v_payment;

  INSERT INTO public.subscription_events (
    subscription_id, restaurant_id, event_type, previous_status, next_status,
    source, actor_user_id, details
  ) VALUES (
    v_subscription.id, v_restaurant_id, 'paddle_checkout_requested',
    v_subscription.subscription_status, 'PENDING_PAYMENT', 'paddle_checkout', auth.uid(),
    jsonb_build_object('payment_id', v_payment.id, 'plan_id', v_plan.id, 'paddle_price_id', v_plan.paddle_price_id, 'environment', 'sandbox')
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'restaurant_id', v_restaurant_id,
    'user_id', auth.uid(),
    'plan_id', v_plan.id,
    'paddle_price_id', v_plan.paddle_price_id,
    'billing_email', coalesce(v_subscription.billing_email, auth.jwt() ->> 'email'),
    'transaction_id', NULL,
    'reused', false
  );
END;
$$;

-- Only a server function using Supabase service role can link a local pending
-- payment to the server-created Paddle transaction ID.
CREATE OR REPLACE FUNCTION public.paddle_link_checkout_transaction(
  p_payment_id uuid,
  p_transaction_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_payment public.subscription_payments;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_SERVER_ONLY';
  END IF;
  IF p_payment_id IS NULL OR coalesce(p_transaction_id, '') !~ '^txn_[a-z0-9]{26}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_TRANSACTION_INVALID';
  END IF;

  SELECT * INTO v_payment FROM public.subscription_payments WHERE id = p_payment_id FOR UPDATE;
  IF v_payment.id IS NULL OR v_payment.provider <> 'paddle' OR v_payment.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_PAYMENT_NOT_PENDING';
  END IF;

  IF v_payment.paddle_transaction_id IS NOT NULL AND v_payment.paddle_transaction_id <> p_transaction_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_TRANSACTION_ALREADY_LINKED';
  END IF;

  UPDATE public.subscription_payments
  SET paddle_transaction_id = p_transaction_id,
      provider_reference = p_transaction_id,
      updated_at = now()
  WHERE id = v_payment.id;

  RETURN jsonb_build_object('payment_id', v_payment.id, 'transaction_id', p_transaction_id);
END;
$$;

-- Returns a short-lived Paddle customer-portal context only to the authenticated
-- billing owner. The Edge Function creates the actual hosted portal URL.
CREATE OR REPLACE FUNCTION public.paddle_customer_portal_context()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_restaurant_id uuid := public.auth_user_restaurant_id();
  v_subscription public.subscriptions;
BEGIN
  PERFORM public.erp_assert_billing_owner(v_restaurant_id);
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE restaurant_id = v_restaurant_id
  FOR UPDATE;

  IF v_subscription.id IS NULL
     OR v_subscription.payment_provider <> 'paddle'
     OR coalesce(v_subscription.paddle_customer_id, '') !~ '^ctm_[a-z0-9]{26}$'
     OR coalesce(v_subscription.paddle_subscription_id, '') !~ '^sub_[a-z0-9]{26}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_CUSTOMER_PORTAL_NOT_AVAILABLE';
  END IF;

  RETURN jsonb_build_object(
    'restaurant_id', v_restaurant_id,
    'customer_id', v_subscription.paddle_customer_id,
    'subscription_id', v_subscription.paddle_subscription_id
  );
END;
$$;

-- Paddle sends at-least-once, potentially out-of-order webhook deliveries. This
-- service-role-only function deduplicates event IDs, resolves associations using
-- server-created custom data, validates the configured catalog price, and only
-- permits newer provider events to replace current subscription state.
CREATE OR REPLACE FUNCTION public.paddle_apply_webhook_event(
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
AS $$
DECLARE
  v_payment public.subscription_payments;
  v_subscription public.subscriptions;
  v_plan public.subscription_plans;
  v_custom jsonb := coalesce(p_data -> 'custom_data', '{}'::jsonb);
  v_payment_id uuid;
  v_event_time timestamptz := coalesce(p_occurred_at, now());
  v_provider_status text := lower(coalesce(p_data ->> 'status', ''));
  v_next_status text;
  v_price_id text := coalesce(
    p_data #>> '{items,0,price,id}',
    p_data #>> '{items,0,price_id}',
    p_data #>> '{details,line_items,0,price_id}'
  );
  v_subscription_id text := CASE WHEN p_event_type LIKE 'subscription.%' THEN p_data ->> 'id' ELSE p_data ->> 'subscription_id' END;
  v_transaction_id text := CASE WHEN p_event_type LIKE 'transaction.%' THEN p_data ->> 'id' ELSE NULL END;
  v_period_start date := nullif(coalesce(p_data #>> '{current_billing_period,starts_at}', p_data #>> '{billing_period,starts_at}'), '')::timestamptz::date;
  v_period_end date := nullif(coalesce(p_data #>> '{current_billing_period,ends_at}', p_data #>> '{billing_period,ends_at}'), '')::timestamptz::date;
  v_trial_start date := nullif(p_data #>> '{items,0,trial_dates,starts_at}', '')::timestamptz::date;
  v_trial_end date := nullif(p_data #>> '{items,0,trial_dates,ends_at}', '')::timestamptz::date;
  v_cancel_at_period_end boolean := coalesce(p_data #>> '{scheduled_change,action}', '') = 'cancel';
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_SERVER_ONLY';
  END IF;
  IF coalesce(p_event_id, '') !~ '^evt_[a-z0-9]{26}$' OR coalesce(p_event_type, '') = '' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_EVENT_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM public.subscription_events WHERE provider_event_id = p_event_id) THEN
    RETURN jsonb_build_object('processed', false, 'reason', 'duplicate_event');
  END IF;

  IF coalesce(v_custom ->> 'bizctrl_payment_id', '') ~ '^[0-9a-f]{8}-[0-9a-f-]{27}$' THEN
    v_payment_id := (v_custom ->> 'bizctrl_payment_id')::uuid;
    SELECT * INTO v_payment FROM public.subscription_payments WHERE id = v_payment_id FOR UPDATE;
  ELSIF coalesce(v_subscription_id, '') ~ '^sub_[a-z0-9]{26}$' THEN
    SELECT * INTO v_payment
    FROM public.subscription_payments
    WHERE provider = 'paddle' AND provider_subscription_id = v_subscription_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_payment.id IS NULL OR v_payment.provider <> 'paddle' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_EVENT_NOT_ASSOCIATED';
  END IF;

  SELECT * INTO v_subscription FROM public.subscriptions WHERE id = v_payment.subscription_id FOR UPDATE;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_payment.plan_id AND is_active;
  v_price_id := coalesce(nullif(v_price_id, ''), v_payment.metadata ->> 'paddle_price_id');
  IF v_subscription.id IS NULL OR v_plan.id IS NULL
     OR v_custom ->> 'bizctrl_restaurant_id' <> v_subscription.restaurant_id::text
     OR NOT EXISTS (
       SELECT 1 FROM public.erp_memberships membership
       WHERE membership.restaurant_id = v_subscription.restaurant_id
         AND membership.user_id::text = v_custom ->> 'bizctrl_user_id'
         AND membership.role = 'owner'
         AND membership.status = 'approved'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_EVENT_TENANT_MISMATCH';
  END IF;
  IF nullif(v_price_id, '') IS NULL OR v_price_id <> v_plan.paddle_price_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_EVENT_PRICE_MISMATCH';
  END IF;

  IF v_subscription.paddle_event_occurred_at IS NOT NULL AND v_subscription.paddle_event_occurred_at > v_event_time THEN
    INSERT INTO public.subscription_events (
      subscription_id, restaurant_id, event_type, previous_status, next_status,
      source, provider_event_id, details
    ) VALUES (
      v_subscription.id, v_subscription.restaurant_id, p_event_type,
      v_subscription.subscription_status, v_subscription.subscription_status,
      'paddle', p_event_id, jsonb_build_object('ignored_for_ordering', true, 'occurred_at', v_event_time, 'payload', p_data)
    );
    RETURN jsonb_build_object('processed', false, 'reason', 'stale_event');
  END IF;

  v_next_status := CASE
    WHEN p_event_type IN ('subscription.trialing') OR v_provider_status = 'trialing' THEN 'TRIAL'
    WHEN p_event_type IN ('subscription.activated') OR v_provider_status = 'active' THEN 'ACTIVE'
    WHEN p_event_type IN ('subscription.canceled') OR v_provider_status = 'canceled' THEN 'CANCELED'
    WHEN p_event_type IN ('subscription.past_due', 'subscription.paused', 'transaction.payment_failed', 'transaction.past_due', 'transaction.refunded')
      OR v_provider_status IN ('past_due', 'paused') THEN 'PAST_DUE'
    WHEN p_event_type IN ('transaction.paid', 'transaction.completed') THEN v_subscription.subscription_status
    ELSE v_subscription.subscription_status
  END;

  UPDATE public.subscription_payments
  SET provider_event_id = p_event_id,
      provider_subscription_id = coalesce(nullif(v_subscription_id, ''), provider_subscription_id),
      paddle_transaction_id = coalesce(nullif(v_transaction_id, ''), paddle_transaction_id),
      provider_reference = coalesce(nullif(v_transaction_id, ''), provider_reference),
      status = CASE
        WHEN p_event_type IN ('transaction.paid', 'transaction.completed') OR v_next_status IN ('TRIAL', 'ACTIVE') THEN 'paid'
        WHEN v_next_status = 'PAST_DUE' THEN 'failed'
        WHEN v_next_status = 'CANCELED' THEN 'canceled'
        ELSE status
      END,
      paid_at = CASE WHEN p_event_type IN ('transaction.paid', 'transaction.completed') OR v_next_status IN ('TRIAL', 'ACTIVE') THEN now() ELSE paid_at END,
      failed_at = CASE WHEN v_next_status = 'PAST_DUE' THEN now() ELSE failed_at END,
      period_start = coalesce(v_period_start, period_start),
      period_end = coalesce(v_period_end, period_end),
      paddle_event_occurred_at = v_event_time,
      display_label = 'Paddle Sandbox ' || p_event_type,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('paddle_event_type', p_event_type, 'paddle_status', v_provider_status, 'paddle_event_occurred_at', v_event_time),
      updated_at = now()
  WHERE id = v_payment.id;

  UPDATE public.subscriptions
  SET plan = CASE WHEN v_next_status IN ('TRIAL', 'ACTIVE') THEN v_payment.plan_id ELSE plan END,
      subscription_status = v_next_status,
      payment_provider = 'paddle',
      paddle_customer_id = coalesce(nullif(p_data ->> 'customer_id', ''), paddle_customer_id),
      paddle_subscription_id = coalesce(nullif(v_subscription_id, ''), paddle_subscription_id),
      paddle_price_id = coalesce(nullif(v_price_id, ''), paddle_price_id),
      paddle_event_occurred_at = v_event_time,
      trial_start = CASE WHEN v_next_status = 'TRIAL' THEN coalesce(v_trial_start, trial_start, current_date) ELSE trial_start END,
      trial_end = CASE WHEN v_next_status = 'TRIAL' THEN coalesce(v_trial_end, trial_end) ELSE trial_end END,
      current_period_start = coalesce(v_period_start, current_period_start),
      current_period_end = coalesce(v_period_end, current_period_end),
      last_payment_at = CASE WHEN p_event_type IN ('transaction.paid', 'transaction.completed') OR v_next_status IN ('TRIAL', 'ACTIVE') THEN now() ELSE last_payment_at END,
      cancel_at_period_end = CASE WHEN v_next_status = 'CANCELED' THEN false ELSE v_cancel_at_period_end END,
      canceled_at = CASE WHEN v_next_status = 'CANCELED' THEN now() ELSE canceled_at END,
      updated_at = now()
  WHERE id = v_subscription.id;

  INSERT INTO public.subscription_events (
    subscription_id, restaurant_id, event_type, previous_status, next_status,
    source, provider_event_id, details
  ) VALUES (
    v_subscription.id, v_subscription.restaurant_id, p_event_type,
    v_subscription.subscription_status, v_next_status,
    'paddle', p_event_id, jsonb_build_object('occurred_at', v_event_time, 'payload', p_data)
  );

  RETURN jsonb_build_object('processed', true, 'subscription_status', v_next_status, 'payment_id', v_payment.id);
END;
$$;

-- Canceled subscriptions retain access through the paid period. Past-due and
-- paused subscriptions restrict paid ERP features but never delete tenant data.
CREATE OR REPLACE FUNCTION public.erp_subscription_has_erp_access(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.restaurant_id = p_restaurant_id
      AND (
        (s.subscription_status = 'TRIAL' AND s.trial_end IS NOT NULL AND s.trial_end >= current_date)
        OR s.subscription_status = 'FREE'
        OR (s.subscription_status IN ('ACTIVE', 'CANCELED') AND (s.current_period_end IS NULL OR s.current_period_end >= current_date))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.paddle_create_checkout_context(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.paddle_customer_portal_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.paddle_link_checkout_transaction(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.paddle_apply_webhook_event(text, text, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paddle_create_checkout_context(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.paddle_customer_portal_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.paddle_link_checkout_transaction(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.paddle_apply_webhook_event(text, text, timestamptz, jsonb) TO service_role;

COMMIT;
