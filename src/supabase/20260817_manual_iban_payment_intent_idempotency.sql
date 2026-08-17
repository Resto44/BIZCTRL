BEGIN;

-- Serialize intent creation on the canonical subscription row. A retry for the
-- same paid plan reuses the outstanding payment instead of superseding it and
-- creating another bank-transfer reference.
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
  v_existing_payment public.subscription_payments;
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

  SELECT * INTO v_existing_payment
  FROM public.subscription_payments
  WHERE subscription_id = v_subscription.id
    AND provider = 'manual_iban'
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_payment.id IS NOT NULL THEN
    IF v_existing_payment.plan_id = v_plan.id THEN
      RETURN jsonb_build_object(
        'payment_id', v_existing_payment.id,
        'status', v_existing_payment.status,
        'subscription_status', 'PENDING_PAYMENT',
        'amount_cents', v_existing_payment.amount_cents,
        'currency', v_existing_payment.currency,
        'plan_id', v_existing_payment.plan_id,
        'promotion_id', v_existing_payment.promotion_id,
        'reused', true
      );
    END IF;

    IF v_existing_payment.payment_proof_key IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PENDING_PAYMENT_REVIEW_REQUIRED';
    END IF;
  END IF;

  SELECT * INTO v_promotion
  FROM public.platform_promotions promotion
  WHERE promotion.plan_id = v_plan.id
    AND promotion.is_active
    AND promotion.starts_at <= now()
    AND promotion.ends_at >= now()
    AND (promotion.max_redemptions IS NULL OR promotion.redemption_count < promotion.max_redemptions)
    AND (NOT promotion.first_time_only OR NOT EXISTS (
      SELECT 1
      FROM public.subscription_payments prior_payment
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

  IF v_existing_payment.id IS NOT NULL THEN
    UPDATE public.subscription_payments
    SET status = 'superseded', updated_at = now()
    WHERE id = v_existing_payment.id;
  END IF;

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
    'promotion_id', v_promotion.id,
    'reused', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_manual_iban_payment_intent(text, text) TO authenticated;

COMMIT;
