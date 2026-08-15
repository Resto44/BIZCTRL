BEGIN;

CREATE OR REPLACE FUNCTION public.platform_owner_list_plans()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  PERFORM public.platform_owner_assert();
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(plan) ORDER BY plan.sort_order), '[]'::jsonb)
    FROM public.subscription_plans plan WHERE plan.id IN ('starter_20', 'growth_40', 'enterprise_100'));
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_update_plan(p_plan_id text, p_display_name text, p_monthly_price_cents integer, p_feature_flags jsonb, p_limits jsonb, p_is_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_expected_price integer; v_plan public.subscription_plans;
BEGIN
  PERFORM public.platform_owner_assert();
  v_expected_price := CASE p_plan_id WHEN 'starter_20' THEN 2000 WHEN 'growth_40' THEN 4000 WHEN 'enterprise_100' THEN 10000 ELSE NULL END;
  IF v_expected_price IS NULL OR coalesce(p_monthly_price_cents, 0) <> v_expected_price THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_PLAN_CATALOG_LOCKED'; END IF;
  UPDATE public.subscription_plans SET display_name = coalesce(nullif(btrim(p_display_name), ''), display_name), monthly_price_cents = v_expected_price, original_price_cents = greatest(original_price_cents, v_expected_price), feature_flags = coalesce(p_feature_flags, feature_flags), max_branches = coalesce((p_limits ->> 'max_branches')::integer, max_branches), max_employees = coalesce((p_limits ->> 'max_employees')::integer, max_employees), max_users = coalesce((p_limits ->> 'max_users')::integer, max_users), max_storage_mb = coalesce((p_limits ->> 'max_storage_mb')::integer, max_storage_mb), max_pdf_exports = coalesce((p_limits ->> 'max_pdf_exports')::integer, max_pdf_exports), max_ocr_scans = coalesce((p_limits ->> 'max_ocr_scans')::integer, max_ocr_scans), is_active = coalesce(p_is_active, is_active), updated_at = now() WHERE id = p_plan_id RETURNING * INTO v_plan;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_PLAN_NOT_FOUND'; END IF;
  PERFORM public.platform_owner_log('plan_updated', 'plan', p_plan_id, NULL, jsonb_build_object('is_active', v_plan.is_active));
  RETURN to_jsonb(v_plan);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_list_subscriptions(p_status text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
BEGIN
  PERFORM public.platform_owner_assert();
  RETURN (WITH filtered AS (
    SELECT subscription.id, subscription.restaurant_id, restaurant.name AS organization_name, subscription.plan, plan.display_name AS plan_name, plan.original_price_cents, plan.monthly_price_cents, subscription.subscription_status, subscription.trial_start, subscription.trial_end, subscription.current_period_start, subscription.current_period_end, subscription.payment_provider, subscription.created_date
    FROM public.subscriptions subscription JOIN public.restaurants restaurant ON restaurant.id = subscription.restaurant_id JOIN public.subscription_plans plan ON plan.id = subscription.plan
    WHERE nullif(btrim(coalesce(p_status, '')), '') IS NULL OR subscription.subscription_status = p_status
  ), page AS (SELECT * FROM filtered ORDER BY created_date DESC LIMIT v_limit OFFSET greatest(coalesce(p_offset, 0), 0))
  SELECT jsonb_build_object('total', (SELECT count(*) FROM filtered), 'items', coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page), '[]'::jsonb)));
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_set_subscription_status(p_restaurant_id uuid, p_action text, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_subscription public.subscriptions; v_action text := lower(coalesce(p_action, '')); v_next text;
BEGIN
  PERFORM public.platform_owner_assert();
  IF v_action NOT IN ('suspend', 'cancel', 'expire', 'reactivate') THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_SUBSCRIPTION_ACTION_INVALID'; END IF;
  SELECT * INTO v_subscription FROM public.subscriptions WHERE restaurant_id = p_restaurant_id FOR UPDATE;
  IF v_subscription.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_NOT_FOUND'; END IF;
  v_next := CASE v_action WHEN 'suspend' THEN 'SUSPENDED' WHEN 'cancel' THEN 'CANCELED' WHEN 'expire' THEN 'EXPIRED' WHEN 'reactivate' THEN CASE WHEN v_subscription.current_period_end >= current_date THEN 'ACTIVE' WHEN v_subscription.trial_end >= current_date THEN 'TRIAL' ELSE 'PENDING_PAYMENT' END END;
  UPDATE public.subscriptions SET subscription_status = v_next, canceled_at = CASE WHEN v_next = 'CANCELED' THEN now() ELSE canceled_at END, current_period_end = CASE WHEN v_next IN ('CANCELED', 'EXPIRED') THEN current_date ELSE current_period_end END, updated_at = now() WHERE id = v_subscription.id;
  INSERT INTO public.subscription_events(subscription_id, restaurant_id, event_type, previous_status, next_status, source, actor_user_id, details) VALUES (v_subscription.id, p_restaurant_id, 'platform_subscription_' || v_action, v_subscription.subscription_status, v_next, 'platform_owner', auth.uid(), jsonb_build_object('reason', p_reason));
  PERFORM public.platform_owner_log('subscription_' || v_action, 'subscription', v_subscription.id::text, p_restaurant_id, jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('subscription_id', v_subscription.id, 'status', v_next);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_list_promotions(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
BEGIN
  PERFORM public.platform_owner_assert();
  RETURN (WITH page AS (SELECT promotion.*, plan.display_name AS plan_name FROM public.platform_promotions promotion JOIN public.subscription_plans plan ON plan.id = promotion.plan_id ORDER BY promotion.created_at DESC LIMIT v_limit OFFSET greatest(coalesce(p_offset, 0), 0)) SELECT jsonb_build_object('total', (SELECT count(*) FROM public.platform_promotions), 'items', coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page), '[]'::jsonb)));
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_save_promotion(p_id uuid DEFAULT NULL, p_name text DEFAULT NULL, p_plan_id text DEFAULT NULL, p_percent_off integer DEFAULT NULL, p_fixed_amount_cents integer DEFAULT NULL, p_starts_at timestamptz DEFAULT NULL, p_ends_at timestamptz DEFAULT NULL, p_max_redemptions integer DEFAULT NULL, p_first_time_only boolean DEFAULT false, p_coupon_code text DEFAULT NULL, p_is_active boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_promotion public.platform_promotions;
BEGIN
  PERFORM public.platform_owner_assert();
  IF p_id IS NULL THEN
    INSERT INTO public.platform_promotions(name, plan_id, percent_off, fixed_amount_cents, starts_at, ends_at, max_redemptions, first_time_only, coupon_code, is_active, created_by) VALUES (nullif(btrim(p_name), ''), p_plan_id, p_percent_off, p_fixed_amount_cents, p_starts_at, p_ends_at, p_max_redemptions, coalesce(p_first_time_only, false), nullif(upper(btrim(p_coupon_code)), ''), coalesce(p_is_active, true), auth.uid()) RETURNING * INTO v_promotion;
  ELSE
    UPDATE public.platform_promotions SET name = coalesce(nullif(btrim(p_name), ''), name), plan_id = coalesce(p_plan_id, plan_id), percent_off = p_percent_off, fixed_amount_cents = p_fixed_amount_cents, starts_at = coalesce(p_starts_at, starts_at), ends_at = coalesce(p_ends_at, ends_at), max_redemptions = p_max_redemptions, first_time_only = coalesce(p_first_time_only, first_time_only), coupon_code = nullif(upper(btrim(p_coupon_code)), ''), is_active = coalesce(p_is_active, is_active), updated_at = now() WHERE id = p_id RETURNING * INTO v_promotion;
  END IF;
  IF v_promotion.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_PROMOTION_NOT_FOUND'; END IF;
  PERFORM public.platform_owner_log(CASE WHEN p_id IS NULL THEN 'promotion_created' ELSE 'promotion_updated' END, 'promotion', v_promotion.id::text, NULL, jsonb_build_object('plan_id', v_promotion.plan_id));
  RETURN to_jsonb(v_promotion);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_list_activity_logs(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
BEGIN
  PERFORM public.platform_owner_assert();
  RETURN (WITH page AS (SELECT log.id, log.action, log.resource_type, log.resource_id, log.restaurant_id, restaurant.name AS organization_name, log.details, log.created_at, profile.full_name AS actor_name, profile.email AS actor_email FROM public.platform_owner_activity_logs log LEFT JOIN public.restaurants restaurant ON restaurant.id = log.restaurant_id LEFT JOIN public.profiles profile ON profile.id = log.actor_user_id ORDER BY log.created_at DESC LIMIT v_limit OFFSET greatest(coalesce(p_offset, 0), 0)) SELECT jsonb_build_object('total', (SELECT count(*) FROM public.platform_owner_activity_logs), 'items', coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page), '[]'::jsonb)));
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_owner_list_plans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_update_plan(text, text, integer, jsonb, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_list_subscriptions(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_set_subscription_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_list_promotions(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_save_promotion(uuid, text, text, integer, integer, timestamptz, timestamptz, integer, boolean, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_list_activity_logs(integer, integer) TO authenticated;

COMMIT;
