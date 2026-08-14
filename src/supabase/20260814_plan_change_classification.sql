BEGIN;

CREATE OR REPLACE FUNCTION public.create_subscription_payment_intent(p_plan_id text)
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
  v_current_plan public.subscription_plans;
  v_payment public.subscription_payments;
  v_change_type text;
BEGIN
  PERFORM public.erp_assert_billing_owner(v_restaurant_id);
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id AND is_active AND is_public;
  IF v_plan.id IS NULL OR v_plan.monthly_price_cents <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAID_PLAN_REQUIRED';
  END IF;

  SELECT * INTO v_subscription FROM public.subscriptions WHERE restaurant_id = v_restaurant_id FOR UPDATE;
  IF v_subscription.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_NOT_FOUND';
  END IF;
  SELECT * INTO v_current_plan FROM public.subscription_plans WHERE id = v_subscription.plan;
  v_change_type := CASE
    WHEN coalesce(v_current_plan.monthly_price_cents, 0) > v_plan.monthly_price_cents THEN 'plan_downgrade_selected'
    WHEN coalesce(v_current_plan.monthly_price_cents, 0) < v_plan.monthly_price_cents THEN 'plan_upgrade_selected'
    ELSE 'paid_plan_reselected'
  END;

  UPDATE public.subscription_payments
  SET status = 'superseded', display_label = 'TEST ONLY — Superseded pending attempt', updated_at = now()
  WHERE subscription_id = v_subscription.id AND provider = 'mock_test' AND status = 'pending';

  UPDATE public.subscriptions
  SET plan = v_plan.id, subscription_status = 'PENDING_PAYMENT', payment_provider = 'mock_test',
      cancel_at_period_end = false, canceled_at = NULL, updated_at = now()
  WHERE id = v_subscription.id;

  INSERT INTO public.subscription_payments (
    subscription_id, restaurant_id, plan_id, provider, status, amount_cents,
    currency, is_test, display_label, metadata
  ) VALUES (
    v_subscription.id, v_restaurant_id, v_plan.id, 'mock_test', 'pending',
    v_plan.monthly_price_cents, 'usd', true, 'TEST ONLY — Pending simulated payment',
    jsonb_build_object('test_only', true, 'payment_mode', 'mock_test', 'requested_by', auth.uid(),
      'change_type', v_change_type, 'previous_plan_id', v_current_plan.id,
      'original_price_cents', v_plan.original_price_cents, 'discount_percent', v_plan.discount_percent,
      'discount_active', v_plan.discount_active)
  ) RETURNING * INTO v_payment;

  INSERT INTO public.subscription_events (
    subscription_id, restaurant_id, event_type, previous_status, next_status,
    source, actor_user_id, details
  ) VALUES (
    v_subscription.id, v_restaurant_id, v_change_type, v_subscription.subscription_status,
    'PENDING_PAYMENT', 'payment_provider_adapter', auth.uid(),
    jsonb_build_object('provider', 'mock_test', 'payment_id', v_payment.id, 'test_only', true,
      'previous_plan_id', v_current_plan.id, 'selected_plan_id', v_plan.id)
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment.id, 'plan_id', v_plan.id, 'previous_plan_id', v_current_plan.id,
    'change_type', v_change_type, 'amount_cents', v_plan.monthly_price_cents,
    'original_price_cents', v_plan.original_price_cents, 'discount_percent', v_plan.discount_percent,
    'discount_active', v_plan.discount_active, 'payment_status', 'pending',
    'subscription_status', 'PENDING_PAYMENT', 'provider', 'mock_test', 'test_only', true,
    'test_mode_enabled', public.erp_subscription_test_mode_enabled()
  );
END;
$$;

COMMIT;
