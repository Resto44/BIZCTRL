BEGIN;

-- The verified Paddle webhook processor is shared by sandbox and live runtimes.
-- In live production it must not record a sandbox-only label in Billing history.
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
      display_label = 'Paddle Live ' || p_event_type,
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

REVOKE ALL ON FUNCTION public.paddle_apply_webhook_event(text, text, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paddle_apply_webhook_event(text, text, timestamptz, jsonb) TO service_role;

COMMIT;
