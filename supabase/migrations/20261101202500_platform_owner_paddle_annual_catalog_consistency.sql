-- Keep Platform Owner's annual prices aligned with 3 verified Paddle price IDs.
-- All amounts are USD minor units. Payment fees/tax are calculated at checkout.
-- Active Paddle plan catalog rates cannot be changed here without Paddle sync.
DO $annual$
DECLARE v_count integer;
BEGIN
  IF (SELECT count(*) FROM public.subscription_plans p
      WHERE (p.id,p.monthly_price_cents,p.paddle_annual_price_id) IN
       (('starter_20',1000,'pri_01m6bax5b0hys34kvzz8kwzypm'),
        ('growth_40',2000,'pri_01m6bax67cbsrg2dt4d5myqv9d'),
        ('enterprise_100',5000,'pri_01m6bax73yy3yrab1mzz4gm3bt'))
       AND p.currency='USD'
       AND (p.yearly_price_cents IS NULL OR
           p.yearly_price_cents IN (8400,16800,42000))) <> 3 THEN
    RAISE EXCEPTION 'PADDLE_ANNUAL_CATALOG_RECONCILIATION_REQUIRED';
  END IF;

  UPDATE public.subscription_plans p
  SET yearly_price_cents=round(p.monthly_price_cents::numeric * 12 * 0.70)::integer,
      updated_at=now()
  WHERE p.id IN ('starter_20','growth_40','enterprise_100')
    AND p.paddle_annual_price_id IS NOT NULL
    AND p.yearly_price_cents IS DISTINCT FROM
      round(p.monthly_price_cents::numeric * 12 * 0.70)::integer;
END
$annual$;

-- Keep existing platform_owner_assert(), audit and access policies.
CREATE OR REPLACE FUNCTION public.platform_owner_upsert_plan(p_plan_id text, p_display_name text, p_description text, p_monthly_price_cents integer, p_yearly_price_cents integer, p_currency text, p_billing_period_months smallint, p_trial_days smallint, p_original_price_cents integer, p_feature_flags jsonb, p_limits jsonb, p_is_active boolean, p_is_public boolean, p_sort_order integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_id text := lower(btrim(coalesce(p_plan_id, ''))); v_plan public.subscription_plans;
  v_price integer := coalesce(p_monthly_price_cents, 0); v_original integer := coalesce(p_original_price_cents, v_price);
  v_yearly integer := coalesce(p_yearly_price_cents, 0); v_currency text := upper(btrim(coalesce(p_currency, 'USD')));
  v_discount integer;
  v_existing public.subscription_plans;
BEGIN
  PERFORM public.platform_owner_assert();
  SELECT * INTO v_existing FROM public.subscription_plans WHERE id=v_id;
  IF v_id !~ '^[a-z0-9][a-z0-9_-]{1,62}$' OR nullif(btrim(coalesce(p_display_name, '')), '') IS NULL OR v_price < 0 OR v_original < v_price OR v_yearly < 0 OR v_currency !~ '^[A-Z]{3}$' OR coalesce(p_billing_period_months, 1) NOT BETWEEN 1 AND 12 OR coalesce(p_trial_days, 0) NOT BETWEEN 0 AND 90 OR jsonb_typeof(coalesce(p_feature_flags, '[]'::jsonb)) <> 'array' OR jsonb_typeof(coalesce(p_limits, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_PLAN_INPUT_INVALID';
  END IF;
  -- Existing Paddle catalog prices are immutable from the Plan Editor. A
  -- price change must first be made/verified in Paddle with a deliberate
  -- catalog migration; editing only the ERP row would misquote customers.
  IF v_existing.id IS NOT NULL
    AND (v_existing.paddle_price_id IS NOT NULL OR v_existing.paddle_annual_price_id IS NOT NULL)
    AND (v_price IS DISTINCT FROM v_existing.monthly_price_cents
      OR v_yearly IS DISTINCT FROM v_existing.yearly_price_cents
      OR v_currency IS DISTINCT FROM v_existing.currency
      OR coalesce(p_billing_period_months,1) IS DISTINCT FROM v_existing.billing_period_months)
  THEN
     RAISE EXCEPTION USING ERRCODE='P0001',
       MESSAGE='PADDLE_LINKED_PLAN_PRICE_LOCKED';
  END IF;
  v_discount := CASE WHEN v_original > v_price AND v_original > 0 THEN round(((v_original - v_price)::numeric / v_original::numeric) * 100)::integer ELSE 0 END;
  INSERT INTO public.subscription_plans(id, display_name, description, monthly_price_cents, yearly_price_cents, original_price_cents, currency, billing_period_months, trial_days, discount_active, discount_percent, discount_label, feature_flags, entitlement_limits, max_restaurants, max_branches, max_employees, max_users, max_storage_mb, max_pdf_exports, max_ocr_scans, is_active, is_public, sort_order)
  VALUES (v_id, btrim(p_display_name), nullif(btrim(p_description), ''), v_price, v_yearly, v_original, v_currency, coalesce(p_billing_period_months, 1), coalesce(p_trial_days, 0), v_discount > 0, v_discount, CASE WHEN v_discount > 0 THEN v_discount::text || '% OFF' ELSE NULL END, coalesce(p_feature_flags, '[]'::jsonb), coalesce(p_limits, '{}'::jsonb), greatest(1, coalesce((p_limits ->> 'max_restaurants')::integer, v_existing.max_restaurants, 1)), coalesce((p_limits ->> 'branches')::integer, (p_limits ->> 'max_branches')::integer, v_existing.max_branches, 1), coalesce((p_limits ->> 'employees')::integer, (p_limits ->> 'max_employees')::integer, v_existing.max_employees, 1), coalesce((p_limits ->> 'users')::integer, (p_limits ->> 'max_users')::integer, v_existing.max_users, 1), coalesce((p_limits ->> 'storage_mb')::integer, (p_limits ->> 'max_storage_mb')::integer, v_existing.max_storage_mb, 0), coalesce((p_limits ->> 'pdf_exports')::integer, (p_limits ->> 'max_pdf_exports')::integer, v_existing.max_pdf_exports, 0), coalesce((p_limits ->> 'ocr_scans')::integer, (p_limits ->> 'max_ocr_scans')::integer, v_existing.max_ocr_scans, 0), coalesce(p_is_active, true), coalesce(p_is_public, true), coalesce(p_sort_order, 0))
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, monthly_price_cents = EXCLUDED.monthly_price_cents, yearly_price_cents = EXCLUDED.yearly_price_cents, original_price_cents = EXCLUDED.original_price_cents, currency = EXCLUDED.currency, billing_period_months = EXCLUDED.billing_period_months, trial_days = EXCLUDED.trial_days, discount_active = EXCLUDED.discount_active, discount_percent = EXCLUDED.discount_percent, discount_label = EXCLUDED.discount_label, feature_flags = EXCLUDED.feature_flags, entitlement_limits = EXCLUDED.entitlement_limits, max_restaurants = EXCLUDED.max_restaurants, max_branches = EXCLUDED.max_branches, max_employees = EXCLUDED.max_employees, max_users = EXCLUDED.max_users, max_storage_mb = EXCLUDED.max_storage_mb, max_pdf_exports = EXCLUDED.max_pdf_exports, max_ocr_scans = EXCLUDED.max_ocr_scans, is_active = EXCLUDED.is_active, is_public = EXCLUDED.is_public, sort_order = EXCLUDED.sort_order, updated_at = now()
  RETURNING * INTO v_plan;
  PERFORM public.platform_owner_log('plan_upserted', 'plan', v_id, NULL, jsonb_build_object('price_cents', v_price, 'active', v_plan.is_active, 'public', v_plan.is_public));
  RETURN to_jsonb(v_plan);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.platform_owner_list_subscriptions(p_status text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
BEGIN
  PERFORM public.platform_owner_assert();
  RETURN (WITH filtered AS (
    SELECT subscription.id, subscription.restaurant_id, restaurant.name AS organization_name, subscription.plan, plan.display_name AS plan_name, plan.original_price_cents, plan.monthly_price_cents, subscription.subscription_status, subscription.trial_start, subscription.trial_end, subscription.current_period_start, subscription.current_period_end, subscription.payment_provider, subscription.billing_interval, (subscription.paddle_subscription_id IS NOT NULL) AS has_paddle_subscription, plan.yearly_price_cents, subscription.created_date
    FROM public.subscriptions subscription JOIN public.restaurants restaurant ON restaurant.id = subscription.restaurant_id JOIN public.subscription_plans plan ON plan.id = subscription.plan
    WHERE nullif(btrim(coalesce(p_status, '')), '') IS NULL OR subscription.subscription_status = p_status
  ), page AS (SELECT * FROM filtered ORDER BY created_date DESC LIMIT v_limit OFFSET greatest(coalesce(p_offset, 0), 0))
  SELECT jsonb_build_object('total', (SELECT count(*) FROM filtered), 'items', coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page), '[]'::jsonb)));
END;
$function$
;
CREATE OR REPLACE FUNCTION public.platform_owner_change_subscription_plan(p_restaurant_id uuid, p_plan_id text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
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

  -- Never silently switch the ERP entitlement of a paid Paddle subscription
  -- without changing the underlying Paddle subscription/price first.
  IF v_subscription.paddle_subscription_id IS NOT NULL
    AND v_subscription.payment_provider='paddle'
    AND v_subscription.plan IS DISTINCT FROM v_plan.id THEN
    RAISE EXCEPTION USING ERRCODE='P0001',
      MESSAGE='PADDLE_SUBSCRIPTION_PLAN_CHANGE_REQUIRES_PROVIDER';
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
$function$
;
