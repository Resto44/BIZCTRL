BEGIN;

-- This getter deliberately uses the existing Platform Owner assertion rather than
-- exposing the manual payment settings table to authenticated client queries.
CREATE OR REPLACE FUNCTION public.platform_owner_manual_payment_settings()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_settings public.platform_manual_payment_settings;
BEGIN
  PERFORM public.platform_owner_assert();
  SELECT * INTO v_settings FROM public.platform_manual_payment_settings WHERE id = true;
  RETURN jsonb_build_object(
    'iban', v_settings.iban,
    'bank_name', v_settings.bank_name,
    'beneficiary_name', v_settings.beneficiary_name,
    'instructions', v_settings.instructions,
    'currency', v_settings.currency,
    'is_active', coalesce(v_settings.is_active, false)
  );
END;
$$;

-- A plan change is an explicit Platform Owner management action. It validates the
-- canonical active catalog, retains the current subscription state, and records an audit event.
CREATE OR REPLACE FUNCTION public.platform_owner_change_subscription_plan(
  p_restaurant_id uuid,
  p_plan_id text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_subscription public.subscriptions; v_plan public.subscription_plans; v_previous_plan text;
BEGIN
  PERFORM public.platform_owner_assert();
  IF p_restaurant_id IS NULL OR nullif(btrim(coalesce(p_plan_id, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_SUBSCRIPTION_PLAN_INPUT_INVALID';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = btrim(p_plan_id) AND is_active = true;
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_SUBSCRIPTION_PLAN_NOT_AVAILABLE';
  END IF;

  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE restaurant_id = p_restaurant_id
  FOR UPDATE;
  IF v_subscription.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_NOT_FOUND';
  END IF;

  v_previous_plan := v_subscription.plan;
  UPDATE public.subscriptions
  SET plan = v_plan.id, updated_at = now()
  WHERE id = v_subscription.id;

  INSERT INTO public.subscription_events(
    subscription_id, restaurant_id, event_type, previous_status, next_status,
    source, actor_user_id, details
  ) VALUES (
    v_subscription.id, p_restaurant_id, 'platform_subscription_plan_changed',
    v_subscription.subscription_status, v_subscription.subscription_status,
    'platform_owner', auth.uid(),
    jsonb_build_object('previous_plan', v_previous_plan, 'plan_id', v_plan.id, 'reason', p_reason)
  );
  PERFORM public.platform_owner_log(
    'subscription_plan_changed', 'subscription', v_subscription.id::text,
    p_restaurant_id,
    jsonb_build_object('previous_plan', v_previous_plan, 'plan_id', v_plan.id, 'reason', p_reason)
  );

  RETURN jsonb_build_object(
    'subscription_id', v_subscription.id,
    'restaurant_id', p_restaurant_id,
    'previous_plan', v_previous_plan,
    'plan_id', v_plan.id,
    'subscription_status', v_subscription.subscription_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_owner_manual_payment_settings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_change_subscription_plan(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_owner_manual_payment_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_change_subscription_plan(uuid, text, text) TO authenticated;

COMMIT;
