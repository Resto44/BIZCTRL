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

CREATE OR REPLACE FUNCTION public.erp_subscription_snapshot(p_restaurant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_restaurant_id uuid := coalesce(p_restaurant_id, public.auth_user_restaurant_id());
  v_subscription public.subscriptions;
  v_plan public.subscription_plans;
  v_status text;
  v_usage jsonb := '{}'::jsonb;
  v_pending_payment_id uuid;
  v_can_manage_billing boolean := false;
BEGIN
  IF auth.uid() IS NULL OR v_restaurant_id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'has_erp_access', false, 'status', 'EXPIRED', 'test_mode_enabled', false, 'can_manage_billing', false);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.erp_memberships membership
    WHERE membership.user_id = auth.uid()
      AND membership.status = 'approved'
      AND membership.restaurant_id = v_restaurant_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_SCOPE_DENIED';
  END IF;

  v_can_manage_billing := public.erp_is_approved_owner(v_restaurant_id);
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE restaurant_id = v_restaurant_id
  ORDER BY updated_at DESC, created_date DESC NULLS LAST
  LIMIT 1;
  IF v_subscription.id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'has_erp_access', false, 'status', 'EXPIRED', 'test_mode_enabled', public.erp_subscription_test_mode_enabled(), 'can_manage_billing', v_can_manage_billing);
  END IF;

  v_status := v_subscription.subscription_status;
  IF v_status = 'TRIAL' AND (v_subscription.trial_end IS NULL OR v_subscription.trial_end < current_date) THEN
    UPDATE public.subscriptions SET subscription_status = 'EXPIRED', updated_at = now() WHERE id = v_subscription.id;
    INSERT INTO public.subscription_events(subscription_id, restaurant_id, event_type, previous_status, next_status, source)
    VALUES (v_subscription.id, v_restaurant_id, 'trial_expired', 'TRIAL', 'EXPIRED', 'server_snapshot');
    v_status := 'EXPIRED';
  ELSIF v_status = 'ACTIVE' AND v_subscription.current_period_end IS NOT NULL AND v_subscription.current_period_end < current_date THEN
    UPDATE public.subscriptions SET subscription_status = 'PAST_DUE', updated_at = now() WHERE id = v_subscription.id;
    INSERT INTO public.subscription_events(subscription_id, restaurant_id, event_type, previous_status, next_status, source)
    VALUES (v_subscription.id, v_restaurant_id, 'billing_period_elapsed', 'ACTIVE', 'PAST_DUE', 'server_snapshot');
    v_status := 'PAST_DUE';
  END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_subscription.plan;
  SELECT coalesce(jsonb_object_agg(metric, used_amount), '{}'::jsonb) INTO v_usage
  FROM public.subscription_usage
  WHERE subscription_id = v_subscription.id
    AND (period_start = date_trunc('month', current_date)::date OR period_start = date '1970-01-01');
  SELECT id INTO v_pending_payment_id
  FROM public.subscription_payments
  WHERE subscription_id = v_subscription.id
    AND provider IN ('manual_iban', 'mock_test')
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'found', true, 'subscription_id', v_subscription.id, 'restaurant_id', v_restaurant_id,
    'plan_id', v_plan.id, 'plan_name', v_plan.display_name, 'status', v_status,
    'has_erp_access', public.erp_subscription_has_erp_access(v_restaurant_id), 'trial_start', v_subscription.trial_start, 'trial_end', v_subscription.trial_end,
    'trial_days_remaining', CASE WHEN v_status = 'TRIAL' THEN greatest(0, v_subscription.trial_end - current_date) ELSE 0 END,
    'current_period_start', v_subscription.current_period_start, 'current_period_end', v_subscription.current_period_end,
    'next_billing_date', CASE WHEN v_status = 'ACTIVE' THEN v_subscription.current_period_end ELSE NULL END,
    'cancel_at_period_end', v_subscription.cancel_at_period_end, 'billing_email', v_subscription.billing_email, 'payment_provider', v_subscription.payment_provider,
    'paddle_customer_id', CASE WHEN v_can_manage_billing AND v_subscription.payment_provider = 'paddle' THEN v_subscription.paddle_customer_id ELSE NULL END,
    'pending_payment_id', v_pending_payment_id, 'test_mode_enabled', public.erp_subscription_test_mode_enabled(), 'can_manage_billing', v_can_manage_billing,
    'limits', jsonb_build_object('restaurants', v_plan.max_restaurants, 'branches', v_plan.max_branches, 'employees', v_plan.max_employees, 'users', v_plan.max_users, 'storage_mb', v_plan.max_storage_mb, 'pdf_exports', v_plan.max_pdf_exports, 'ocr_scans', v_plan.max_ocr_scans),
    'usage', v_usage, 'advanced_analytics', (v_status = 'TRIAL' OR v_plan.advanced_analytics), 'feature_flags', CASE WHEN v_status = 'TRIAL' THEN '[]'::jsonb ELSE coalesce(v_plan.feature_flags, '[]'::jsonb) END,
    'pricing', jsonb_build_object('monthly_price_cents', v_plan.monthly_price_cents, 'original_price_cents', v_plan.original_price_cents, 'discount_percent', v_plan.discount_percent, 'discount_active', v_plan.discount_active, 'discount_label', v_plan.discount_label)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.paddle_create_checkout_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paddle_create_checkout_context(text) TO authenticated;
REVOKE ALL ON FUNCTION public.erp_subscription_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erp_subscription_snapshot(uuid) TO authenticated;

COMMIT;
