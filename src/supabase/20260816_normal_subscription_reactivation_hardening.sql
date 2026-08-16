BEGIN;

-- Reversing a scheduled cancellation remains an ACTIVE -> ACTIVE operation.
-- Reactivating an inactive paid subscription must enter the existing manual-payment
-- flow; it must never grant access or create a second subscription directly.
CREATE OR REPLACE FUNCTION public.renew_subscription()
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

  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE restaurant_id = v_restaurant_id
  FOR UPDATE;

  IF v_subscription.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_NOT_FOUND';
  END IF;

  IF v_subscription.subscription_status = 'ACTIVE' AND v_subscription.cancel_at_period_end THEN
    UPDATE public.subscriptions
    SET cancel_at_period_end = false,
        canceled_at = NULL,
        updated_at = now()
    WHERE id = v_subscription.id;

    INSERT INTO public.subscription_events (
      subscription_id, restaurant_id, event_type, previous_status, next_status,
      source, actor_user_id, details
    ) VALUES (
      v_subscription.id, v_restaurant_id, 'cancellation_reversed', 'ACTIVE', 'ACTIVE',
      'owner_action', auth.uid(), jsonb_build_object('reactivation_mode', 'cancel_reversal')
    );

    RETURN jsonb_build_object(
      'subscription_id', v_subscription.id,
      'subscription_status', 'ACTIVE',
      'cancel_at_period_end', false,
      'reactivation_mode', 'cancel_reversal'
    );
  END IF;

  IF v_subscription.subscription_status NOT IN ('CANCELED', 'EXPIRED', 'PAST_DUE') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RENEWAL_NOT_AVAILABLE';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = v_subscription.plan
    AND is_active
    AND is_public
    AND monthly_price_cents > 0;

  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REACTIVATION_PLAN_SELECTION_REQUIRED';
  END IF;

  -- A payment configuration must exist before a reactivation request can be created.
  PERFORM public.platform_manual_payment_instructions();

  UPDATE public.subscription_payments
  SET status = 'superseded',
      updated_at = now()
  WHERE subscription_id = v_subscription.id
    AND provider = 'manual_iban'
    AND status = 'pending';

  UPDATE public.subscriptions
  SET subscription_status = 'PENDING_PAYMENT',
      payment_provider = 'manual_iban',
      cancel_at_period_end = false,
      canceled_at = NULL,
      updated_at = now()
  WHERE id = v_subscription.id;

  INSERT INTO public.subscription_payments (
    subscription_id, restaurant_id, plan_id, provider, status, amount_cents,
    currency, display_label, metadata
  ) VALUES (
    v_subscription.id, v_restaurant_id, v_plan.id, 'manual_iban', 'pending',
    v_plan.monthly_price_cents, 'USD', 'Manual IBAN reactivation pending review',
    jsonb_build_object('requested_by', auth.uid(), 'reactivation', true)
  ) RETURNING * INTO v_payment;

  INSERT INTO public.subscription_events (
    subscription_id, restaurant_id, event_type, previous_status, next_status,
    source, actor_user_id, details
  ) VALUES (
    v_subscription.id, v_restaurant_id, 'reactivation_payment_requested',
    v_subscription.subscription_status, 'PENDING_PAYMENT', 'manual_iban', auth.uid(),
    jsonb_build_object('payment_id', v_payment.id, 'reactivation', true)
  );

  RETURN jsonb_build_object(
    'subscription_id', v_subscription.id,
    'subscription_status', 'PENDING_PAYMENT',
    'payment_id', v_payment.id,
    'payment_required', true,
    'reactivation_mode', 'manual_payment'
  );
END;
$$;

-- The plan-selection flow is also used for reactivation. Clear stale cancellation
-- markers when it transitions an existing subscription to PENDING_PAYMENT.
CREATE OR REPLACE FUNCTION public.create_manual_iban_payment_intent(
  p_plan_id text,
  p_coupon_code text DEFAULT NULL
)
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
  v_promotion public.platform_promotions;
  v_payment public.subscription_payments;
  v_amount integer;
BEGIN
  PERFORM public.erp_assert_billing_owner(v_restaurant_id);
  PERFORM public.platform_manual_payment_instructions();

  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = p_plan_id
    AND is_active
    AND is_public
    AND monthly_price_cents > 0;

  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAID_PLAN_REQUIRED';
  END IF;

  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE restaurant_id = v_restaurant_id
  FOR UPDATE;

  IF v_subscription.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_NOT_FOUND';
  END IF;

  SELECT * INTO v_promotion
  FROM public.platform_promotions promotion
  WHERE promotion.plan_id = v_plan.id
    AND promotion.is_active
    AND promotion.starts_at <= now()
    AND promotion.ends_at >= now()
    AND (promotion.max_redemptions IS NULL OR promotion.redemption_count < promotion.max_redemptions)
    AND (NOT promotion.first_time_only OR NOT EXISTS (
      SELECT 1 FROM public.subscription_payments prior_payment
      WHERE prior_payment.restaurant_id = v_restaurant_id
        AND prior_payment.status = 'paid'
    ))
    AND (nullif(btrim(coalesce(p_coupon_code, '')), '') IS NULL
      OR lower(promotion.coupon_code) = lower(btrim(p_coupon_code)))
  ORDER BY promotion.percent_off DESC NULLS LAST, promotion.created_at DESC
  LIMIT 1;

  v_amount := greatest(
    0,
    v_plan.monthly_price_cents - CASE
      WHEN v_promotion.id IS NULL THEN 0
      WHEN v_promotion.percent_off IS NOT NULL THEN round(v_plan.monthly_price_cents * v_promotion.percent_off / 100.0)::integer
      ELSE v_promotion.fixed_amount_cents
    END
  );

  UPDATE public.subscription_payments
  SET status = 'superseded',
      updated_at = now()
  WHERE subscription_id = v_subscription.id
    AND provider = 'manual_iban'
    AND status = 'pending';

  UPDATE public.subscriptions
  SET plan = v_plan.id,
      subscription_status = 'PENDING_PAYMENT',
      payment_provider = 'manual_iban',
      cancel_at_period_end = false,
      canceled_at = NULL,
      updated_at = now()
  WHERE id = v_subscription.id;

  INSERT INTO public.subscription_payments (
    subscription_id, restaurant_id, plan_id, provider, status, amount_cents,
    currency, promotion_id, display_label, metadata
  ) VALUES (
    v_subscription.id, v_restaurant_id, v_plan.id, 'manual_iban', 'pending',
    v_amount, 'USD', v_promotion.id, 'Manual IBAN transfer pending review',
    jsonb_build_object(
      'requested_by', auth.uid(),
      'original_price_cents', v_plan.monthly_price_cents,
      'promotion_id', v_promotion.id,
      'reactivation', v_subscription.subscription_status IN ('CANCELED', 'EXPIRED', 'PAST_DUE')
    )
  ) RETURNING * INTO v_payment;

  INSERT INTO public.subscription_events (
    subscription_id, restaurant_id, event_type, previous_status, next_status,
    source, actor_user_id, details
  ) VALUES (
    v_subscription.id, v_restaurant_id, 'manual_payment_requested',
    v_subscription.subscription_status, 'PENDING_PAYMENT', 'manual_iban', auth.uid(),
    jsonb_build_object('payment_id', v_payment.id)
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'status', 'pending',
    'subscription_status', 'PENDING_PAYMENT',
    'amount_cents', v_amount,
    'currency', 'USD',
    'plan_id', v_plan.id,
    'promotion_id', v_promotion.id
  );
END;
$$;

-- An approved manual payment is the only path to Active for this payment flow.
CREATE OR REPLACE FUNCTION public.platform_owner_review_manual_payment(
  p_payment_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
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
  v_status text;
BEGIN
  PERFORM public.platform_owner_assert();

  SELECT * INTO v_payment
  FROM public.subscription_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF v_payment.id IS NULL
    OR v_payment.provider <> 'manual_iban'
    OR v_payment.status <> 'pending'
    OR v_payment.payment_proof_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MANUAL_PAYMENT_REVIEW_NOT_AVAILABLE';
  END IF;

  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE id = v_payment.subscription_id
  FOR UPDATE;

  v_status := CASE WHEN p_approve THEN 'ACTIVE' ELSE 'PAST_DUE' END;

  UPDATE public.subscription_payments
  SET status = CASE WHEN p_approve THEN 'paid' ELSE 'rejected' END,
      paid_at = CASE WHEN p_approve THEN now() ELSE NULL END,
      failed_at = CASE WHEN p_approve THEN NULL ELSE now() END,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      review_note = p_note,
      period_start = CASE WHEN p_approve THEN current_date ELSE period_start END,
      period_end = CASE WHEN p_approve THEN current_date + 30 ELSE period_end END,
      display_label = CASE WHEN p_approve THEN 'Manual IBAN payment approved' ELSE 'Manual IBAN payment rejected' END,
      updated_at = now()
  WHERE id = v_payment.id;

  UPDATE public.subscriptions
  SET plan = CASE WHEN p_approve THEN v_payment.plan_id ELSE plan END,
      subscription_status = v_status,
      payment_provider = 'manual_iban',
      current_period_start = CASE WHEN p_approve THEN current_date ELSE current_period_start END,
      current_period_end = CASE WHEN p_approve THEN current_date + 30 ELSE current_period_end END,
      last_payment_at = CASE WHEN p_approve THEN now() ELSE last_payment_at END,
      cancel_at_period_end = CASE WHEN p_approve THEN false ELSE cancel_at_period_end END,
      canceled_at = CASE WHEN p_approve THEN NULL ELSE canceled_at END,
      updated_at = now()
  WHERE id = v_subscription.id;

  IF p_approve AND v_payment.promotion_id IS NOT NULL THEN
    UPDATE public.platform_promotions
    SET redemption_count = redemption_count + 1,
        updated_at = now()
    WHERE id = v_payment.promotion_id;
  END IF;

  INSERT INTO public.subscription_events (
    subscription_id, restaurant_id, event_type, previous_status, next_status,
    source, actor_user_id, details
  ) VALUES (
    v_subscription.id, v_payment.restaurant_id,
    CASE WHEN p_approve THEN 'manual_payment_approved' ELSE 'manual_payment_rejected' END,
    v_subscription.subscription_status, v_status, 'platform_owner', auth.uid(),
    jsonb_build_object('payment_id', v_payment.id, 'note', p_note)
  );

  PERFORM public.platform_owner_log(
    CASE WHEN p_approve THEN 'payment_approved' ELSE 'payment_rejected' END,
    'payment', v_payment.id::text, v_payment.restaurant_id, jsonb_build_object('note', p_note)
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'payment_status', CASE WHEN p_approve THEN 'paid' ELSE 'rejected' END,
    'subscription_status', v_status
  );
END;
$$;

COMMIT;
