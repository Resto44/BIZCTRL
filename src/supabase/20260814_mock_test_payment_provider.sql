BEGIN;

-- A paid selection has no ERP entitlement until a provider result is confirmed.
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_state_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_state_check
  CHECK (subscription_status IN ('TRIAL', 'FREE', 'PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'));

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_label text,
  ADD COLUMN IF NOT EXISTS provider_reference text;

-- This is system configuration rather than a second billing model. It defaults
-- to false and can only be enabled outside production by a service-role action.
CREATE TABLE IF NOT EXISTS public.subscription_test_mode_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.subscription_test_mode_settings (id, enabled)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.subscription_test_mode_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.erp_subscription_test_mode_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT coalesce((SELECT enabled FROM public.subscription_test_mode_settings WHERE id = true), false);
$$;

CREATE OR REPLACE FUNCTION public.erp_set_subscription_test_mode(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TEST_MODE_SERVER_CONFIGURATION_ONLY';
  END IF;
  UPDATE public.subscription_test_mode_settings
  SET enabled = coalesce(p_enabled, false), updated_at = now(), updated_by = auth.uid()
  WHERE id = true;
  RETURN jsonb_build_object('enabled', coalesce(p_enabled, false));
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_assert_billing_owner(p_restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_restaurant_id IS NULL OR NOT public.erp_is_approved_owner(p_restaurant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILLING_OWNER_REQUIRED';
  END IF;
END;
$$;

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
  v_payment public.subscription_payments;
BEGIN
  PERFORM public.erp_assert_billing_owner(v_restaurant_id);
  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = p_plan_id AND is_active AND is_public;
  IF v_plan.id IS NULL OR v_plan.monthly_price_cents <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAID_PLAN_REQUIRED';
  END IF;

  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE restaurant_id = v_restaurant_id
  FOR UPDATE;
  IF v_subscription.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_NOT_FOUND';
  END IF;

  -- There can be only one current pending attempt. An older unpaid attempt is
  -- retained in payment history but cannot later activate access.
  UPDATE public.subscription_payments
  SET status = 'superseded',
      display_label = 'TEST ONLY — Superseded pending attempt',
      updated_at = now()
  WHERE subscription_id = v_subscription.id
    AND provider = 'mock_test'
    AND status = 'pending';

  UPDATE public.subscriptions
  SET plan = v_plan.id,
      subscription_status = 'PENDING_PAYMENT',
      payment_provider = 'mock_test',
      cancel_at_period_end = false,
      canceled_at = NULL,
      updated_at = now()
  WHERE id = v_subscription.id;

  INSERT INTO public.subscription_payments (
    subscription_id, restaurant_id, plan_id, provider, status, amount_cents,
    currency, is_test, display_label, metadata
  ) VALUES (
    v_subscription.id, v_restaurant_id, v_plan.id, 'mock_test', 'pending',
    v_plan.monthly_price_cents, 'usd', true, 'TEST ONLY — Pending simulated payment',
    jsonb_build_object(
      'test_only', true,
      'payment_mode', 'mock_test',
      'requested_by', auth.uid(),
      'original_price_cents', v_plan.original_price_cents,
      'discount_percent', v_plan.discount_percent,
      'discount_active', v_plan.discount_active
    )
  ) RETURNING * INTO v_payment;

  INSERT INTO public.subscription_events (
    subscription_id, restaurant_id, event_type, previous_status, next_status,
    source, actor_user_id, details
  ) VALUES (
    v_subscription.id, v_restaurant_id, 'paid_plan_selected', v_subscription.subscription_status,
    'PENDING_PAYMENT', 'payment_provider_adapter', auth.uid(),
    jsonb_build_object('provider', 'mock_test', 'payment_id', v_payment.id, 'test_only', true)
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'plan_id', v_plan.id,
    'amount_cents', v_plan.monthly_price_cents,
    'original_price_cents', v_plan.original_price_cents,
    'discount_percent', v_plan.discount_percent,
    'discount_active', v_plan.discount_active,
    'payment_status', 'pending',
    'subscription_status', 'PENDING_PAYMENT',
    'provider', 'mock_test',
    'test_only', true,
    'test_mode_enabled', public.erp_subscription_test_mode_enabled()
  );
END;
$$;

-- Preserve the existing client procedure name while routing it through the
-- provider-independent intent creator. It does not create a real checkout.
CREATE OR REPLACE FUNCTION public.create_subscription_checkout_intent(p_plan_id text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.create_subscription_payment_intent(p_plan_id);
$$;

CREATE OR REPLACE FUNCTION public.erp_apply_mock_test_payment(
  p_payment_id uuid,
  p_outcome text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_restaurant_id uuid := public.auth_user_restaurant_id();
  v_payment public.subscription_payments;
  v_subscription public.subscriptions;
  v_next_status text;
  v_event_id text;
BEGIN
  PERFORM public.erp_assert_billing_owner(v_restaurant_id);
  IF NOT public.erp_subscription_test_mode_enabled() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TEST_MODE_DISABLED';
  END IF;
  IF lower(coalesce(p_outcome, '')) NOT IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TEST_PAYMENT_OUTCOME_INVALID';
  END IF;

  SELECT * INTO v_payment
  FROM public.subscription_payments
  WHERE id = p_payment_id AND restaurant_id = v_restaurant_id
  FOR UPDATE;
  IF v_payment.id IS NULL OR v_payment.provider <> 'mock_test' OR NOT v_payment.is_test OR v_payment.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TEST_PAYMENT_NOT_AVAILABLE';
  END IF;
  SELECT * INTO v_subscription FROM public.subscriptions WHERE id = v_payment.subscription_id FOR UPDATE;
  IF v_subscription.subscription_status <> 'PENDING_PAYMENT' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TEST_PAYMENT_STATE_CONFLICT';
  END IF;

  v_next_status := CASE WHEN lower(p_outcome) = 'succeeded' THEN 'ACTIVE' ELSE 'PAST_DUE' END;
  v_event_id := 'mock_test_' || replace(gen_random_uuid()::text, '-', '');

  UPDATE public.subscription_payments
  SET status = CASE WHEN v_next_status = 'ACTIVE' THEN 'paid' ELSE 'failed' END,
      provider_event_id = v_event_id,
      provider_reference = v_event_id,
      display_label = CASE WHEN v_next_status = 'ACTIVE'
        THEN 'TEST ONLY — Simulated successful payment'
        ELSE 'TEST ONLY — Simulated failed payment' END,
      paid_at = CASE WHEN v_next_status = 'ACTIVE' THEN now() ELSE NULL END,
      failed_at = CASE WHEN v_next_status = 'PAST_DUE' THEN now() ELSE NULL END,
      period_start = CASE WHEN v_next_status = 'ACTIVE' THEN current_date ELSE period_start END,
      period_end = CASE WHEN v_next_status = 'ACTIVE' THEN current_date + 30 ELSE period_end END,
      metadata = metadata || jsonb_build_object('simulated_by', auth.uid(), 'simulated_at', now(), 'outcome', lower(p_outcome), 'test_only', true),
      updated_at = now()
  WHERE id = v_payment.id;

  UPDATE public.subscriptions
  SET subscription_status = v_next_status,
      plan = v_payment.plan_id,
      payment_provider = 'mock_test',
      current_period_start = CASE WHEN v_next_status = 'ACTIVE' THEN current_date ELSE current_period_start END,
      current_period_end = CASE WHEN v_next_status = 'ACTIVE' THEN current_date + 30 ELSE current_period_end END,
      last_payment_at = CASE WHEN v_next_status = 'ACTIVE' THEN now() ELSE last_payment_at END,
      updated_at = now()
  WHERE id = v_subscription.id;

  INSERT INTO public.subscription_events (
    subscription_id, restaurant_id, event_type, previous_status, next_status,
    source, actor_user_id, provider_event_id, details
  ) VALUES (
    v_subscription.id, v_restaurant_id,
    CASE WHEN v_next_status = 'ACTIVE' THEN 'test_payment_succeeded' ELSE 'test_payment_failed' END,
    'PENDING_PAYMENT', v_next_status, 'mock_test_provider', auth.uid(), v_event_id,
    jsonb_build_object('test_only', true, 'payment_id', v_payment.id, 'outcome', lower(p_outcome))
  );
  RETURN jsonb_build_object('payment_id', v_payment.id, 'subscription_status', v_next_status, 'test_only', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_simulate_subscription_lifecycle(p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_restaurant_id uuid := public.auth_user_restaurant_id();
  v_subscription public.subscriptions;
  v_payment public.subscription_payments;
  v_normalized_action text := lower(coalesce(p_action, ''));
  v_event_id text := 'mock_test_' || replace(gen_random_uuid()::text, '-', '');
  v_next_status text;
BEGIN
  PERFORM public.erp_assert_billing_owner(v_restaurant_id);
  IF NOT public.erp_subscription_test_mode_enabled() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TEST_MODE_DISABLED';
  END IF;
  IF v_normalized_action NOT IN ('renewal', 'cancellation', 'expiration') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TEST_LIFECYCLE_ACTION_INVALID';
  END IF;
  SELECT * INTO v_subscription FROM public.subscriptions WHERE restaurant_id = v_restaurant_id FOR UPDATE;
  IF v_subscription.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_NOT_FOUND'; END IF;

  IF v_normalized_action = 'renewal' THEN
    IF v_subscription.subscription_status <> 'ACTIVE' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTIVE_SUBSCRIPTION_REQUIRED';
    END IF;
    INSERT INTO public.subscription_payments (
      subscription_id, restaurant_id, plan_id, provider, status, amount_cents,
      currency, is_test, display_label, provider_event_id, provider_reference,
      period_start, period_end, paid_at, metadata
    ) SELECT
      v_subscription.id, v_restaurant_id, v_subscription.plan, 'mock_test', 'paid', p.monthly_price_cents,
      'usd', true, 'TEST ONLY — Simulated renewal', v_event_id, v_event_id,
      current_date, current_date + 30, now(), jsonb_build_object('test_only', true, 'simulated_by', auth.uid(), 'action', 'renewal')
    FROM public.subscription_plans p WHERE p.id = v_subscription.plan
    RETURNING * INTO v_payment;
    UPDATE public.subscriptions
    SET current_period_start = current_date, current_period_end = current_date + 30,
        last_payment_at = now(), cancel_at_period_end = false, updated_at = now()
    WHERE id = v_subscription.id;
    v_next_status := 'ACTIVE';
  ELSIF v_normalized_action = 'cancellation' THEN
    UPDATE public.subscriptions
    SET subscription_status = 'CANCELED', cancel_at_period_end = false,
        canceled_at = now(), current_period_end = current_date, updated_at = now()
    WHERE id = v_subscription.id;
    v_next_status := 'CANCELED';
  ELSE
    UPDATE public.subscriptions
    SET subscription_status = 'EXPIRED', current_period_end = current_date,
        trial_end = CASE WHEN subscription_status = 'TRIAL' THEN current_date ELSE trial_end END,
        updated_at = now()
    WHERE id = v_subscription.id;
    v_next_status := 'EXPIRED';
  END IF;

  INSERT INTO public.subscription_events (
    subscription_id, restaurant_id, event_type, previous_status, next_status,
    source, actor_user_id, provider_event_id, details
  ) VALUES (
    v_subscription.id, v_restaurant_id, 'test_' || v_normalized_action,
    v_subscription.subscription_status, v_next_status, 'mock_test_provider', auth.uid(), v_event_id,
    jsonb_build_object('test_only', true, 'action', v_normalized_action)
  );
  RETURN jsonb_build_object('subscription_status', v_next_status, 'test_only', true, 'action', v_normalized_action);
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
BEGIN
  IF auth.uid() IS NULL OR v_restaurant_id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'has_erp_access', false, 'status', 'EXPIRED', 'test_mode_enabled', false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.erp_memberships m WHERE m.user_id = auth.uid() AND m.status = 'approved' AND m.restaurant_id = v_restaurant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_SCOPE_DENIED';
  END IF;
  SELECT * INTO v_subscription FROM public.subscriptions
  WHERE restaurant_id = v_restaurant_id ORDER BY updated_at DESC, created_date DESC NULLS LAST LIMIT 1;
  IF v_subscription.id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'has_erp_access', false, 'status', 'EXPIRED', 'test_mode_enabled', false);
  END IF;

  v_status := v_subscription.subscription_status;
  IF v_status = 'TRIAL' AND (v_subscription.trial_end IS NULL OR v_subscription.trial_end < current_date) THEN
    UPDATE public.subscriptions SET subscription_status = 'EXPIRED', updated_at = now() WHERE id = v_subscription.id;
    INSERT INTO public.subscription_events (subscription_id, restaurant_id, event_type, previous_status, next_status, source)
      VALUES (v_subscription.id, v_restaurant_id, 'trial_expired', 'TRIAL', 'EXPIRED', 'server_snapshot');
    v_status := 'EXPIRED';
  ELSIF v_status = 'ACTIVE' AND v_subscription.current_period_end IS NOT NULL AND v_subscription.current_period_end < current_date THEN
    UPDATE public.subscriptions SET subscription_status = 'PAST_DUE', updated_at = now() WHERE id = v_subscription.id;
    INSERT INTO public.subscription_events (subscription_id, restaurant_id, event_type, previous_status, next_status, source)
      VALUES (v_subscription.id, v_restaurant_id, 'billing_period_elapsed', 'ACTIVE', 'PAST_DUE', 'server_snapshot');
    v_status := 'PAST_DUE';
  END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_subscription.plan AND is_active = true;
  SELECT coalesce(jsonb_object_agg(metric, used_amount), '{}'::jsonb) INTO v_usage
  FROM public.subscription_usage
  WHERE subscription_id = v_subscription.id
    AND (period_start = date_trunc('month', current_date)::date OR period_start = date '1970-01-01');
  SELECT id INTO v_pending_payment_id FROM public.subscription_payments
  WHERE subscription_id = v_subscription.id AND provider = 'mock_test' AND is_test AND status = 'pending'
  ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'found', true, 'subscription_id', v_subscription.id, 'restaurant_id', v_restaurant_id,
    'plan_id', v_plan.id, 'plan_name', v_plan.display_name, 'status', v_status,
    'has_erp_access', public.erp_subscription_has_erp_access(v_restaurant_id),
    'trial_start', v_subscription.trial_start, 'trial_end', v_subscription.trial_end,
    'trial_days_remaining', CASE WHEN v_status = 'TRIAL' THEN greatest(0, v_subscription.trial_end - current_date) ELSE 0 END,
    'current_period_start', v_subscription.current_period_start, 'current_period_end', v_subscription.current_period_end,
    'next_billing_date', CASE WHEN v_status = 'ACTIVE' THEN v_subscription.current_period_end ELSE NULL END,
    'cancel_at_period_end', v_subscription.cancel_at_period_end, 'billing_email', v_subscription.billing_email,
    'payment_provider', v_subscription.payment_provider, 'pending_payment_id', v_pending_payment_id,
    'test_mode_enabled', public.erp_subscription_test_mode_enabled(),
    'limits', jsonb_build_object('restaurants', v_plan.max_restaurants, 'branches', v_plan.max_branches, 'employees', v_plan.max_employees, 'users', v_plan.max_users, 'storage_mb', v_plan.max_storage_mb, 'pdf_exports', v_plan.max_pdf_exports, 'ocr_scans', v_plan.max_ocr_scans),
    'usage', v_usage, 'advanced_analytics', (v_status = 'TRIAL' OR v_plan.advanced_analytics),
    'feature_flags', CASE WHEN v_status = 'TRIAL' THEN '["all"]'::jsonb ELSE v_plan.feature_flags END,
    'pricing', jsonb_build_object('monthly_price_cents', v_plan.monthly_price_cents, 'original_price_cents', v_plan.original_price_cents, 'discount_percent', v_plan.discount_percent, 'discount_active', v_plan.discount_active, 'discount_label', v_plan.discount_label)
  );
END;
$$;

COMMIT;
