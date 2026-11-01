-- Server-authorized annual Paddle subscriptions, 30% off the currently discounted monthly price.
alter table public.subscription_plans add column if not exists paddle_annual_price_id text;
alter table public.subscription_plans add constraint annual_paddle_price_id_valid check(paddle_annual_price_id is null or paddle_annual_price_id ~ '^pri_[a-z0-9]{26}$');
alter table public.subscriptions add column if not exists billing_interval text not null default 'month';
alter table public.subscriptions add constraint billing_interval_valid check(billing_interval in ('month','year'));
create or replace function public.paddle_annual_quote(p_plan_id text) returns jsonb
language plpgsql security definer set search_path='public' set row_security='off' as $q$
declare r uuid:=public.auth_user_restaurant_id();p public.subscription_plans;
begin
 perform public.erp_assert_billing_owner(r);
 select * into p from public.subscription_plans where id=btrim(coalesce(p_plan_id,'')) and is_active and is_public and monthly_price_cents>0 and paddle_price_id ~ '^pri_[a-z0-9]{26}$';
 if p.id is null then raise exception 'PADDLE_LIVE_PRICE_NOT_CONFIGURED'; end if;
 return jsonb_build_object('plan_id',p.id,'monthly_price_id',p.paddle_price_id,'annual_price_id',p.paddle_annual_price_id,'monthly_cents',p.monthly_price_cents,'annual_cents',round(p.monthly_price_cents::numeric*12*0.70)::int);
end $q$;
revoke all on function public.paddle_annual_quote(text) from public,anon;
grant execute on function public.paddle_annual_quote(text) to authenticated;
create or replace function public.paddle_register_annual_price(p_plan_id text,p_monthly_price_id text,p_annual_price_id text,p_amount_cents integer)
returns text language plpgsql security definer set search_path='public' set row_security='off' as $q$
declare p public.subscription_plans;
begin
 if auth.role()<>'service_role' then raise exception 'PADDLE_SERVER_ONLY'; end if;
 if p_annual_price_id !~ '^pri_[a-z0-9]{26}$' then raise exception 'PADDLE_PRICE_INVALID'; end if;
 select * into p from public.subscription_plans where id=p_plan_id for update;
 if p.id is null or p.paddle_price_id is distinct from p_monthly_price_id or round(p.monthly_price_cents::numeric*12*0.70)::int<>p_amount_cents then raise exception 'PADDLE_ANNUAL_PRICE_QUOTE_CHANGED'; end if;
 if p.paddle_annual_price_id is null then update public.subscription_plans set paddle_annual_price_id=p_annual_price_id where id=p.id;return p_annual_price_id;end if;
 return p.paddle_annual_price_id;
end $q$;
revoke all on function public.paddle_register_annual_price(text,text,text,integer) from public,anon,authenticated;
grant execute on function public.paddle_register_annual_price(text,text,text,integer) to service_role;

CREATE OR REPLACE FUNCTION public.paddle_create_checkout_context(p_plan_id text, p_billing_interval text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_restaurant_id uuid := public.auth_user_restaurant_id();
  v_subscription public.subscriptions;
  v_plan public.subscription_plans;
  v_payment public.subscription_payments;
  v_existing_payment public.subscription_payments;
  v_interval text := lower(coalesce(p_billing_interval,'month'));
  v_price text;
  v_amount integer;
BEGIN
  PERFORM public.erp_assert_billing_owner(v_restaurant_id);
  IF v_interval NOT IN ('month','year') THEN RAISE EXCEPTION 'INVALID_BILLING_INTERVAL'; END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = btrim(coalesce(p_plan_id, ''))
    AND is_active
    AND is_public
    AND monthly_price_cents > 0
    AND paddle_price_id ~ '^pri_[a-z0-9]{26}$';
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'PADDLE_LIVE_PRICE_NOT_CONFIGURED'; END IF;
  v_price := CASE WHEN v_interval='year' THEN v_plan.paddle_annual_price_id ELSE v_plan.paddle_price_id END;
  v_amount := CASE WHEN v_interval='year' THEN round(v_plan.monthly_price_cents::numeric*12*0.70)::integer ELSE v_plan.monthly_price_cents END;
  IF v_price IS NULL OR v_price !~ '^pri_[a-z0-9]{26}$' THEN RAISE EXCEPTION 'PADDLE_ANNUAL_PRICE_NOT_CONFIGURED'; END IF;

  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE restaurant_id = v_restaurant_id
  FOR UPDATE;
  IF v_subscription.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_NOT_FOUND';
  END IF;

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

  IF v_existing_payment.id IS NOT NULL AND v_existing_payment.plan_id = v_plan.id AND coalesce(v_existing_payment.metadata->>'billing_interval','month')=v_interval AND v_existing_payment.amount_cents=v_amount THEN
    RETURN jsonb_build_object(
      'payment_id', v_existing_payment.id,
      'plan_id', v_plan.id,
      'paddle_price_id', v_price,'billing_interval',v_interval,'amount_cents',v_amount,
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
    v_amount, 'USD', false, 'Paddle checkout pending',
    jsonb_build_object(
      'requested_by', auth.uid(),
      'paddle_environment', 'production',
      'paddle_price_id', v_price,
      'billing_interval',v_interval,'annual_discount_percent',CASE WHEN v_interval='year' THEN 30 ELSE 0 END,
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
    jsonb_build_object('payment_id', v_payment.id, 'plan_id', v_plan.id, 'paddle_price_id', v_price, 'environment', 'production')
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'restaurant_id', v_restaurant_id,
    'user_id', auth.uid(),
    'plan_id', v_plan.id,
    'paddle_price_id', v_price,'billing_interval',v_interval,'amount_cents',v_amount,
    'billing_email', coalesce(v_subscription.billing_email, auth.jwt() ->> 'email'),
    'transaction_id', NULL,
    'reused', false
  );
END;
$function$
;
REVOKE ALL ON FUNCTION public.paddle_create_checkout_context(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.paddle_create_checkout_context(text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.paddle_apply_webhook_event(p_event_id text, p_event_type text, p_occurred_at timestamp with time zone, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_payment public.subscription_payments;
  v_subscription public.subscriptions;
  v_plan public.subscription_plans;
  v_custom jsonb := coalesce(p_data -> 'custom_data', '{}'::jsonb);
  v_payment_id uuid;
  v_event_time timestamptz := coalesce(p_occurred_at, now());
  v_provider_status text := lower(coalesce(p_data ->> 'status', ''));
  v_next_status text;
  v_price_id text := coalesce(
    p_data #>> '{items,0,price,id}',
    p_data #>> '{items,0,price_id}',
    p_data #>> '{details,line_items,0,price_id}'
  );
  v_subscription_id text := CASE WHEN p_event_type LIKE 'subscription.%' THEN p_data ->> 'id' ELSE p_data ->> 'subscription_id' END;
  v_transaction_id text := CASE WHEN p_event_type LIKE 'transaction.%' THEN p_data ->> 'id' ELSE NULL END;
  v_period_start date := nullif(coalesce(p_data #>> '{current_billing_period,starts_at}', p_data #>> '{billing_period,starts_at}'), '')::timestamptz::date;
  v_period_end date := nullif(coalesce(p_data #>> '{current_billing_period,ends_at}', p_data #>> '{billing_period,ends_at}'), '')::timestamptz::date;
  v_trial_start date := nullif(p_data #>> '{items,0,trial_dates,starts_at}', '')::timestamptz::date;
  v_trial_end date := nullif(p_data #>> '{items,0,trial_dates,ends_at}', '')::timestamptz::date;
  v_cancel_at_period_end boolean := coalesce(p_data #>> '{scheduled_change,action}', '') = 'cancel';
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_SERVER_ONLY';
  END IF;
  IF coalesce(p_event_id, '') !~ '^evt_[a-z0-9]{26}$' OR coalesce(p_event_type, '') = '' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_EVENT_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM public.subscription_events WHERE provider_event_id = p_event_id) THEN
    RETURN jsonb_build_object('processed', false, 'reason', 'duplicate_event');
  END IF;

  IF coalesce(v_custom ->> 'bizctrl_payment_id', '') ~ '^[0-9a-f]{8}-[0-9a-f-]{27}$' THEN
    v_payment_id := (v_custom ->> 'bizctrl_payment_id')::uuid;
    SELECT * INTO v_payment FROM public.subscription_payments WHERE id = v_payment_id FOR UPDATE;
  ELSIF coalesce(v_subscription_id, '') ~ '^sub_[a-z0-9]{26}$' THEN
    SELECT * INTO v_payment
    FROM public.subscription_payments
    WHERE provider = 'paddle' AND provider_subscription_id = v_subscription_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_payment.id IS NULL OR v_payment.provider <> 'paddle' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_EVENT_NOT_ASSOCIATED';
  END IF;

  SELECT * INTO v_subscription FROM public.subscriptions WHERE id = v_payment.subscription_id FOR UPDATE;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_payment.plan_id AND is_active;
  v_price_id := coalesce(nullif(v_price_id, ''), v_payment.metadata ->> 'paddle_price_id');
  IF v_subscription.id IS NULL OR v_plan.id IS NULL
     OR v_custom ->> 'bizctrl_restaurant_id' <> v_subscription.restaurant_id::text
     OR NOT EXISTS (
       SELECT 1 FROM public.erp_memberships membership
       WHERE membership.restaurant_id = v_subscription.restaurant_id
         AND membership.user_id::text = v_custom ->> 'bizctrl_user_id'
         AND membership.role = 'owner'
         AND membership.status = 'approved'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_EVENT_TENANT_MISMATCH';
  END IF;
  IF nullif(v_price_id,'') IS NULL
    OR v_price_id <> coalesce(v_payment.metadata->>'paddle_price_id',v_plan.paddle_price_id)
    OR (coalesce(v_payment.metadata->>'billing_interval','month')='year' AND v_price_id IS DISTINCT FROM v_plan.paddle_annual_price_id)
    OR (coalesce(v_payment.metadata->>'billing_interval','month')='month' AND v_price_id IS DISTINCT FROM v_plan.paddle_price_id)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PADDLE_EVENT_PRICE_MISMATCH';
  END IF;

  IF v_subscription.paddle_event_occurred_at IS NOT NULL AND v_subscription.paddle_event_occurred_at > v_event_time THEN
    INSERT INTO public.subscription_events (
      subscription_id, restaurant_id, event_type, previous_status, next_status,
      source, provider_event_id, details
    ) VALUES (
      v_subscription.id, v_subscription.restaurant_id, p_event_type,
      v_subscription.subscription_status, v_subscription.subscription_status,
      'paddle', p_event_id, jsonb_build_object('ignored_for_ordering', true, 'occurred_at', v_event_time, 'payload', p_data)
    );
    RETURN jsonb_build_object('processed', false, 'reason', 'stale_event');
  END IF;

  v_next_status := CASE
    WHEN p_event_type IN ('subscription.trialing') OR v_provider_status = 'trialing' THEN 'TRIAL'
    WHEN p_event_type IN ('subscription.activated') OR v_provider_status = 'active' THEN 'ACTIVE'
    WHEN p_event_type IN ('subscription.canceled') OR v_provider_status = 'canceled' THEN 'CANCELED'
    WHEN p_event_type IN ('subscription.past_due', 'subscription.paused', 'transaction.payment_failed', 'transaction.past_due', 'transaction.refunded')
      OR v_provider_status IN ('past_due', 'paused') THEN 'PAST_DUE'
    WHEN p_event_type IN ('transaction.paid', 'transaction.completed') THEN v_subscription.subscription_status
    ELSE v_subscription.subscription_status
  END;

  UPDATE public.subscription_payments
  SET provider_event_id = p_event_id,
      provider_subscription_id = coalesce(nullif(v_subscription_id, ''), provider_subscription_id),
      paddle_transaction_id = coalesce(nullif(v_transaction_id, ''), paddle_transaction_id),
      provider_reference = coalesce(nullif(v_transaction_id, ''), provider_reference),
      status = CASE
        WHEN p_event_type IN ('transaction.paid', 'transaction.completed') OR v_next_status IN ('TRIAL', 'ACTIVE') THEN 'paid'
        WHEN v_next_status = 'PAST_DUE' THEN 'failed'
        WHEN v_next_status = 'CANCELED' THEN 'canceled'
        ELSE status
      END,
      paid_at = CASE WHEN p_event_type IN ('transaction.paid', 'transaction.completed') OR v_next_status IN ('TRIAL', 'ACTIVE') THEN now() ELSE paid_at END,
      failed_at = CASE WHEN v_next_status = 'PAST_DUE' THEN now() ELSE failed_at END,
      period_start = coalesce(v_period_start, period_start),
      period_end = coalesce(v_period_end, period_end),
      paddle_event_occurred_at = v_event_time,
      display_label = 'Paddle Live ' || p_event_type,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('paddle_event_type', p_event_type, 'paddle_status', v_provider_status, 'paddle_event_occurred_at', v_event_time),
      updated_at = now()
  WHERE id = v_payment.id;

  UPDATE public.subscriptions
  SET plan = CASE WHEN v_next_status IN ('TRIAL', 'ACTIVE') THEN v_payment.plan_id ELSE plan END,
      subscription_status = v_next_status,
      payment_provider = 'paddle',
      paddle_customer_id = coalesce(nullif(p_data ->> 'customer_id', ''), paddle_customer_id),
      paddle_subscription_id = coalesce(nullif(v_subscription_id, ''), paddle_subscription_id),
      paddle_price_id = coalesce(nullif(v_price_id, ''), paddle_price_id),
      billing_interval=CASE WHEN v_next_status IN ('ACTIVE','TRIAL') THEN coalesce(v_payment.metadata->>'billing_interval','month') ELSE billing_interval END,
      paddle_event_occurred_at = v_event_time,
      trial_start = CASE WHEN v_next_status = 'TRIAL' THEN coalesce(v_trial_start, trial_start, current_date) ELSE trial_start END,
      trial_end = CASE WHEN v_next_status = 'TRIAL' THEN coalesce(v_trial_end, trial_end) ELSE trial_end END,
      current_period_start = coalesce(v_period_start, current_period_start),
      current_period_end = coalesce(v_period_end, current_period_end),
      last_payment_at = CASE WHEN p_event_type IN ('transaction.paid', 'transaction.completed') OR v_next_status IN ('TRIAL', 'ACTIVE') THEN now() ELSE last_payment_at END,
      cancel_at_period_end = CASE WHEN v_next_status = 'CANCELED' THEN false ELSE v_cancel_at_period_end END,
      canceled_at = CASE WHEN v_next_status = 'CANCELED' THEN now() ELSE canceled_at END,
      updated_at = now()
  WHERE id = v_subscription.id;

  INSERT INTO public.subscription_events (
    subscription_id, restaurant_id, event_type, previous_status, next_status,
    source, provider_event_id, details
  ) VALUES (
    v_subscription.id, v_subscription.restaurant_id, p_event_type,
    v_subscription.subscription_status, v_next_status,
    'paddle', p_event_id, jsonb_build_object('occurred_at', v_event_time, 'payload', p_data)
  );

  RETURN jsonb_build_object('processed', true, 'subscription_status', v_next_status, 'payment_id', v_payment.id);
END;
$function$
;
REVOKE ALL ON FUNCTION public.paddle_apply_webhook_event(text,text,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.paddle_apply_webhook_event(text,text,timestamptz,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.erp_subscription_snapshot(p_restaurant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_restaurant_id uuid := coalesce(p_restaurant_id, public.auth_user_restaurant_id());
  v_subscription public.subscriptions;
  v_plan public.subscription_plans;
  v_status text;
  v_metered_usage jsonb := '{}'::jsonb;
  v_capacity jsonb := '{}'::jsonb;
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

  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = v_subscription.plan
    AND is_active = true;
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_PLAN_INVALID';
  END IF;

  SELECT coalesce(jsonb_object_agg(metric, used_amount), '{}'::jsonb)
  INTO v_metered_usage
  FROM public.subscription_usage
  WHERE subscription_id = v_subscription.id
    AND (period_start = date_trunc('month', current_date)::date OR period_start = date '1970-01-01');

  v_capacity := public.erp_subscription_capacity_state(v_restaurant_id, true);
  v_usage := coalesce(v_capacity -> 'usage', '{}'::jsonb) || v_metered_usage;

  SELECT id INTO v_pending_payment_id
  FROM public.subscription_payments
  WHERE subscription_id = v_subscription.id
    AND provider IN ('manual_iban', 'mock_test', 'paddle')
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'found', true,
    'subscription_id', v_subscription.id,
    'restaurant_id', v_restaurant_id,
    'plan_id', v_plan.id,
    'plan_name', v_plan.display_name,
    'status', v_status,
    'has_erp_access', public.erp_subscription_has_erp_access(v_restaurant_id),
    'trial_start', v_subscription.trial_start,
    'trial_end', v_subscription.trial_end,
    'trial_days_remaining', CASE WHEN v_status = 'TRIAL' THEN greatest(0, v_subscription.trial_end - current_date) ELSE 0 END,
    'current_period_start', v_subscription.current_period_start,
    'current_period_end', v_subscription.current_period_end,
    'next_billing_date', CASE WHEN v_status = 'ACTIVE' THEN v_subscription.current_period_end ELSE NULL END,
    'cancel_at_period_end', v_subscription.cancel_at_period_end,
    'billing_email', v_subscription.billing_email,
    'payment_provider', v_subscription.payment_provider,'billing_interval',coalesce(v_subscription.billing_interval,'month'),
    'paddle_customer_id', CASE WHEN v_can_manage_billing AND v_subscription.payment_provider = 'paddle' THEN v_subscription.paddle_customer_id ELSE NULL END,
    'pending_payment_id', v_pending_payment_id,
    'test_mode_enabled', public.erp_subscription_test_mode_enabled(),
    'can_manage_billing', v_can_manage_billing,
    'limits', jsonb_build_object(
      'restaurants', v_plan.max_restaurants,
      'branches', v_plan.max_branches,
      'employees', v_plan.max_employees,
      'users', v_plan.max_users,
      'storage_mb', v_plan.max_storage_mb,
      'pdf_exports', v_plan.max_pdf_exports,
      'ocr_scans', v_plan.max_ocr_scans
    ),
    'usage', v_usage,
    'exceeded_limits', coalesce(v_capacity -> 'exceeded_limits', '[]'::jsonb),
    'is_within_capacity', coalesce((v_capacity ->> 'is_within_capacity')::boolean, true),
    'advanced_analytics', (v_status = 'TRIAL' OR v_plan.advanced_analytics),
    'feature_flags', coalesce(v_plan.feature_flags, '[]'::jsonb),
    'pricing', jsonb_build_object(
      'monthly_price_cents', v_plan.monthly_price_cents,
      'original_price_cents', v_plan.original_price_cents,
      'discount_percent', v_plan.discount_percent,
      'discount_active', v_plan.discount_active,
      'discount_label', v_plan.discount_label
    )
  );
END;
$function$
;