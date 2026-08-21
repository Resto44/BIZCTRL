BEGIN;

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
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_LIVE_PRICE_NOT_CONFIGURED';
  END IF;

  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE restaurant_id = v_restaurant_id
  FOR UPDATE;
  IF v_subscription.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_NOT_FOUND';
  END IF;

  -- A tenant with an already-linked Paddle subscription must use the hosted
  -- customer portal for upgrades, downgrades, cancellation, and renewal. A new
  -- transaction here would risk creating a duplicate provider subscription.
  IF v_subscription.payment_provider = 'paddle'
     AND coalesce(v_subscription.paddle_customer_id, '') ~ '^ctm_[a-z0-9]{26}$'
     AND coalesce(v_subscription.paddle_subscription_id, '') ~ '^sub_[a-z0-9]{26}$'
     AND v_subscription.subscription_status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_EXISTING_SUBSCRIPTION_MANAGE_REQUIRED';
  END IF;

  SELECT * INTO v_existing_payment
  FROM public.subscription_payments
  WHERE subscription_id = v_subscription.id
    AND provider = 'paddle'
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- An unresolved Paddle checkout remains authoritative until Paddle reports a
  -- terminal webhook state. Reuse its transaction for the same plan; otherwise
  -- require the owner to complete or abandon it in Paddle before requesting a
  -- different plan. This prevents concurrent duplicate subscriptions.
  IF v_existing_payment.id IS NOT NULL THEN
    IF v_existing_payment.plan_id = v_plan.id THEN
      RETURN jsonb_build_object(
        'payment_id', v_existing_payment.id,
        'plan_id', v_plan.id,
        'paddle_price_id', v_plan.paddle_price_id,
        'transaction_id', v_existing_payment.paddle_transaction_id,
        'reused', true
      );
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_PENDING_CHECKOUT_EXISTS';
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
    v_plan.monthly_price_cents, 'USD', false, 'Paddle checkout pending',
    jsonb_build_object(
      'requested_by', auth.uid(),
      'paddle_environment', 'production',
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
    jsonb_build_object('payment_id', v_payment.id, 'plan_id', v_plan.id, 'paddle_price_id', v_plan.paddle_price_id, 'environment', 'production')
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

REVOKE ALL ON FUNCTION public.paddle_create_checkout_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paddle_create_checkout_context(text) TO authenticated;

COMMIT;
