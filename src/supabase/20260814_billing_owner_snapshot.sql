BEGIN;

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
  IF NOT EXISTS (SELECT 1 FROM public.erp_memberships m WHERE m.user_id = auth.uid() AND m.status = 'approved' AND m.restaurant_id = v_restaurant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_SCOPE_DENIED';
  END IF;
  v_can_manage_billing := public.erp_is_approved_owner(v_restaurant_id);
  SELECT * INTO v_subscription FROM public.subscriptions
  WHERE restaurant_id = v_restaurant_id ORDER BY updated_at DESC, created_date DESC NULLS LAST LIMIT 1;
  IF v_subscription.id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'has_erp_access', false, 'status', 'EXPIRED', 'test_mode_enabled', public.erp_subscription_test_mode_enabled(), 'can_manage_billing', v_can_manage_billing);
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
    'test_mode_enabled', public.erp_subscription_test_mode_enabled(), 'can_manage_billing', v_can_manage_billing,
    'limits', jsonb_build_object('restaurants', v_plan.max_restaurants, 'branches', v_plan.max_branches, 'employees', v_plan.max_employees, 'users', v_plan.max_users, 'storage_mb', v_plan.max_storage_mb, 'pdf_exports', v_plan.max_pdf_exports, 'ocr_scans', v_plan.max_ocr_scans),
    'usage', v_usage, 'advanced_analytics', (v_status = 'TRIAL' OR v_plan.advanced_analytics),
    'feature_flags', CASE WHEN v_status = 'TRIAL' THEN '["all"]'::jsonb ELSE v_plan.feature_flags END,
    'pricing', jsonb_build_object('monthly_price_cents', v_plan.monthly_price_cents, 'original_price_cents', v_plan.original_price_cents, 'discount_percent', v_plan.discount_percent, 'discount_active', v_plan.discount_active, 'discount_label', v_plan.discount_label)
  );
END;
$$;

COMMIT;
