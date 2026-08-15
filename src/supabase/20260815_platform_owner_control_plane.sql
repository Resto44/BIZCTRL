BEGIN;

-- Platform Owner accounts are intentionally separate from tenant/organization roles.
CREATE TABLE IF NOT EXISTS public.platform_owner_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  mfa_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE IF NOT EXISTS public.platform_owner_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_manual_payment_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  iban text,
  bank_name text,
  beneficiary_name text,
  instructions text,
  currency text NOT NULL DEFAULT 'USD',
  is_active boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.platform_manual_payment_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan_id text NOT NULL REFERENCES public.subscription_plans(id),
  percent_off integer CHECK (percent_off IS NULL OR percent_off BETWEEN 1 AND 100),
  fixed_amount_cents integer CHECK (fixed_amount_cents IS NULL OR fixed_amount_cents > 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemption_count integer NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  first_time_only boolean NOT NULL DEFAULT false,
  coupon_code text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CHECK (ends_at > starts_at),
  CHECK ((percent_off IS NOT NULL)::integer + (fixed_amount_cents IS NOT NULL)::integer = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_promotions_coupon_code_unique
  ON public.platform_promotions (lower(coupon_code)) WHERE coupon_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_promotions_active_lookup_idx
  ON public.platform_promotions (plan_id, starts_at, ends_at) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.subscription_feature_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (restaurant_id, feature_key)
);

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES public.platform_promotions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_proof_key text,
  ADD COLUMN IF NOT EXISTS payment_proof_filename text,
  ADD COLUMN IF NOT EXISTS payment_proof_content_type text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_note text;

ALTER TABLE public.subscription_payments DROP CONSTRAINT IF EXISTS subscription_payments_status_check;
ALTER TABLE public.subscription_payments
  ADD CONSTRAINT subscription_payments_status_check
  CHECK (status IN ('pending', 'paid', 'failed', 'rejected', 'refunded', 'canceled', 'superseded')) NOT VALID;
ALTER TABLE public.subscription_payments VALIDATE CONSTRAINT subscription_payments_status_check;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_state_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_state_check
  CHECK (subscription_status IN ('TRIAL', 'PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED', 'EXPIRED', 'FREE')) NOT VALID;
ALTER TABLE public.subscriptions VALIDATE CONSTRAINT subscriptions_status_state_check;

-- Retire Free without deleting historical subscriptions or events.
WITH retired AS (
  UPDATE public.subscriptions
  SET subscription_status = 'EXPIRED', current_period_end = current_date, updated_at = now()
  WHERE subscription_status = 'FREE' OR plan = 'free'
  RETURNING id, restaurant_id
)
INSERT INTO public.subscription_events (subscription_id, restaurant_id, event_type, previous_status, next_status, source, details)
SELECT id, restaurant_id, 'legacy_free_retired', 'FREE', 'EXPIRED', 'platform_owner_migration',
       jsonb_build_object('reason', 'permanent_free_retired')
FROM retired WHERE restaurant_id IS NOT NULL;

UPDATE public.subscription_plans
SET is_active = false, is_public = false, updated_at = now()
WHERE id = 'free';

ALTER TABLE public.platform_owner_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_owner_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_manual_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_feature_overrides ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.platform_owner_is_authorized()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.platform_owner_accounts account
    WHERE account.user_id = auth.uid() AND account.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_assert()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_mfa_required boolean; v_aal text;
BEGIN
  IF NOT public.platform_owner_is_authorized() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_REQUIRED';
  END IF;
  SELECT mfa_required INTO v_mfa_required FROM public.platform_owner_accounts WHERE user_id = auth.uid();
  v_aal := coalesce(auth.jwt() ->> 'aal', 'aal1');
  IF v_mfa_required AND v_aal <> 'aal2' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_REQUIRED';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_log(
  p_action text, p_resource_type text, p_resource_id text DEFAULT NULL,
  p_restaurant_id uuid DEFAULT NULL, p_details jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  INSERT INTO public.platform_owner_activity_logs(actor_user_id, action, resource_type, resource_id, restaurant_id, details)
  VALUES (auth.uid(), p_action, p_resource_type, p_resource_id, p_restaurant_id, coalesce(p_details, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_session_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_account public.platform_owner_accounts; v_aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
BEGIN
  SELECT * INTO v_account FROM public.platform_owner_accounts WHERE user_id = auth.uid();
  RETURN jsonb_build_object(
    'authenticated', auth.uid() IS NOT NULL,
    'authorized', coalesce(v_account.status = 'active', false),
    'mfa_required', coalesce(v_account.mfa_required, false),
    'mfa_verified', v_aal = 'aal2',
    'session_expired', auth.uid() IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_total_orgs integer; v_active_orgs integer; v_total_users integer; v_active_users integer;
BEGIN
  PERFORM public.platform_owner_assert();
  SELECT count(*)::integer, count(*) FILTER (WHERE is_active)::integer INTO v_total_orgs, v_active_orgs FROM public.restaurants;
  SELECT count(*)::integer, count(*) FILTER (WHERE coalesce(is_active, true) AND coalesce(approval_status, 'approved') = 'approved')::integer INTO v_total_users, v_active_users FROM public.profiles;
  RETURN jsonb_build_object(
    'total_users', v_total_users, 'active_users', v_active_users,
    'new_users', (SELECT count(*) FROM public.profiles WHERE created_date >= current_date),
    'total_organizations', v_total_orgs, 'active_organizations', v_active_orgs,
    'trial_users', (SELECT count(*) FROM public.subscriptions WHERE subscription_status = 'TRIAL'),
    'active_subscriptions', (SELECT count(*) FROM public.subscriptions WHERE subscription_status = 'ACTIVE'),
    'expired_subscriptions', (SELECT count(*) FROM public.subscriptions WHERE subscription_status = 'EXPIRED'),
    'cancelled_subscriptions', (SELECT count(*) FROM public.subscriptions WHERE subscription_status = 'CANCELED'),
    'pending_payments', (SELECT count(*) FROM public.subscription_payments WHERE status = 'pending'),
    'approved_payments', (SELECT count(*) FROM public.subscription_payments WHERE status = 'paid'),
    'rejected_payments', (SELECT count(*) FROM public.subscription_payments WHERE status = 'rejected'),
    'monthly_recurring_revenue_cents', (SELECT coalesce(sum(plan.monthly_price_cents), 0) FROM public.subscriptions subscription JOIN public.subscription_plans plan ON plan.id = subscription.plan WHERE subscription.subscription_status = 'ACTIVE'),
    'monthly_revenue_cents', (SELECT coalesce(sum(amount_cents), 0) FROM public.subscription_payments WHERE status = 'paid' AND paid_at >= date_trunc('month', now())),
    'total_revenue_cents', (SELECT coalesce(sum(amount_cents), 0) FROM public.subscription_payments WHERE status = 'paid'),
    'active_promotions', (SELECT count(*) FROM public.platform_promotions WHERE is_active AND starts_at <= now() AND ends_at >= now()),
    'trial_conversion_rate', (SELECT CASE WHEN count(*) FILTER (WHERE subscription_status IN ('TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELED', 'PAST_DUE')) = 0 THEN 0 ELSE round(100.0 * count(*) FILTER (WHERE subscription_status = 'ACTIVE') / count(*) FILTER (WHERE subscription_status IN ('TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELED', 'PAST_DUE')), 2) END FROM public.subscriptions)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_list_organizations(p_query text DEFAULT NULL, p_status text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
BEGIN
  PERFORM public.platform_owner_assert();
  RETURN (WITH filtered AS (
    SELECT restaurant.id, restaurant.name, restaurant.business_mode, restaurant.is_active, restaurant.created_date,
      subscription.plan, subscription.subscription_status, subscription.trial_end, subscription.current_period_end,
      (SELECT count(*) FROM public.branches branch WHERE branch.restaurant_id = restaurant.id AND coalesce(branch.is_active, true)) AS branch_count,
      (SELECT count(*) FROM public.erp_memberships membership WHERE membership.restaurant_id = restaurant.id AND membership.status = 'approved') AS user_count
    FROM public.restaurants restaurant LEFT JOIN public.subscriptions subscription ON subscription.restaurant_id = restaurant.id
    WHERE (nullif(btrim(coalesce(p_query, '')), '') IS NULL OR restaurant.name ILIKE '%' || p_query || '%' OR restaurant.org_id ILIKE '%' || p_query || '%')
      AND (nullif(btrim(coalesce(p_status, '')), '') IS NULL OR subscription.subscription_status = p_status)
  ), page AS (SELECT * FROM filtered ORDER BY created_date DESC LIMIT v_limit OFFSET greatest(coalesce(p_offset, 0), 0))
  SELECT jsonb_build_object('total', (SELECT count(*) FROM filtered), 'items', coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page), '[]'::jsonb)));
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_list_users(p_query text DEFAULT NULL, p_status text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
BEGIN
  PERFORM public.platform_owner_assert();
  RETURN (WITH filtered AS (
    SELECT profile.id, profile.full_name, profile.email, profile.phone, profile.role, profile.is_active, profile.approval_status, profile.created_date,
      restaurant.name AS organization_name, restaurant.business_mode AS portal_type, subscription.plan, subscription.subscription_status
    FROM public.profiles profile
    LEFT JOIN public.restaurants restaurant ON restaurant.id = coalesce(profile.organization_id, profile.restaurant_id)
    LEFT JOIN public.subscriptions subscription ON subscription.restaurant_id = restaurant.id
    WHERE (nullif(btrim(coalesce(p_query, '')), '') IS NULL OR profile.email ILIKE '%' || p_query || '%' OR profile.full_name ILIKE '%' || p_query || '%')
      AND (nullif(btrim(coalesce(p_status, '')), '') IS NULL OR coalesce(profile.approval_status, 'approved') = p_status)
  ), page AS (SELECT * FROM filtered ORDER BY created_date DESC LIMIT v_limit OFFSET greatest(coalesce(p_offset, 0), 0))
  SELECT jsonb_build_object('total', (SELECT count(*) FROM filtered), 'items', coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page), '[]'::jsonb)));
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_list_payments(p_status text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
BEGIN
  PERFORM public.platform_owner_assert();
  RETURN (WITH filtered AS (
    SELECT payment.id, payment.status, payment.provider, payment.amount_cents, payment.currency, payment.payment_reference,
      payment.payment_proof_key, payment.payment_proof_filename, payment.created_at, payment.submitted_at, payment.reviewed_at,
      payment.review_note, plan.display_name AS plan_name, restaurant.name AS organization_name, payment.restaurant_id
    FROM public.subscription_payments payment
    JOIN public.subscription_plans plan ON plan.id = payment.plan_id
    JOIN public.restaurants restaurant ON restaurant.id = payment.restaurant_id
    WHERE (nullif(btrim(coalesce(p_status, '')), '') IS NULL OR payment.status = p_status)
  ), page AS (SELECT * FROM filtered ORDER BY created_at DESC LIMIT v_limit OFFSET greatest(coalesce(p_offset, 0), 0))
  SELECT jsonb_build_object('total', (SELECT count(*) FROM filtered), 'items', coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page), '[]'::jsonb)));
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_set_user_status(p_user_id uuid, p_status text, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_status text := lower(coalesce(p_status, ''));
BEGIN
  PERFORM public.platform_owner_assert();
  IF p_user_id IS NULL OR v_status NOT IN ('active', 'suspended', 'disabled') THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_USER_STATUS_INVALID'; END IF;
  IF EXISTS (SELECT 1 FROM public.platform_owner_accounts account WHERE account.user_id = p_user_id AND account.status = 'active') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_ACCOUNT_PROTECTED';
  END IF;
  UPDATE public.profiles SET is_active = v_status = 'active', approval_status = CASE WHEN v_status = 'active' THEN 'approved' ELSE 'suspended' END, updated_date = now() WHERE id = p_user_id;
  UPDATE public.erp_memberships SET status = CASE WHEN v_status = 'active' THEN 'approved' ELSE 'suspended' END, rejection_reason = CASE WHEN v_status = 'active' THEN NULL ELSE p_reason END, updated_at = now() WHERE user_id = p_user_id;
  PERFORM public.platform_owner_log('user_' || v_status, 'user', p_user_id::text, NULL, jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('user_id', p_user_id, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_set_organization_status(p_restaurant_id uuid, p_active boolean, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_subscription public.subscriptions; v_next text;
BEGIN
  PERFORM public.platform_owner_assert();
  SELECT * INTO v_subscription FROM public.subscriptions WHERE restaurant_id = p_restaurant_id FOR UPDATE;
  IF v_subscription.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_ORGANIZATION_NOT_FOUND'; END IF;
  v_next := CASE WHEN p_active THEN CASE WHEN v_subscription.current_period_end >= current_date THEN 'ACTIVE' WHEN v_subscription.trial_end >= current_date THEN 'TRIAL' ELSE 'EXPIRED' END ELSE 'SUSPENDED' END;
  UPDATE public.restaurants SET is_active = coalesce(p_active, false), updated_date = now() WHERE id = p_restaurant_id;
  UPDATE public.subscriptions SET subscription_status = v_next, updated_at = now() WHERE id = v_subscription.id;
  INSERT INTO public.subscription_events(subscription_id, restaurant_id, event_type, previous_status, next_status, source, actor_user_id, details)
  VALUES (v_subscription.id, p_restaurant_id, CASE WHEN p_active THEN 'platform_organization_activated' ELSE 'platform_organization_suspended' END, v_subscription.subscription_status, v_next, 'platform_owner', auth.uid(), jsonb_build_object('reason', p_reason));
  PERFORM public.platform_owner_log(CASE WHEN p_active THEN 'organization_activated' ELSE 'organization_suspended' END, 'organization', p_restaurant_id::text, p_restaurant_id, jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('restaurant_id', p_restaurant_id, 'is_active', p_active, 'subscription_status', v_next);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_extend_trial(p_restaurant_id uuid, p_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_subscription public.subscriptions; v_end date;
BEGIN
  PERFORM public.platform_owner_assert();
  IF coalesce(p_days, 0) NOT BETWEEN 1 AND 90 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_TRIAL_DAYS_INVALID'; END IF;
  SELECT * INTO v_subscription FROM public.subscriptions WHERE restaurant_id = p_restaurant_id FOR UPDATE;
  IF v_subscription.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_NOT_FOUND'; END IF;
  v_end := greatest(coalesce(v_subscription.trial_end, current_date), current_date) + p_days;
  UPDATE public.subscriptions SET subscription_status = 'TRIAL', trial_start = coalesce(trial_start, current_date), trial_end = v_end, updated_at = now() WHERE id = v_subscription.id;
  INSERT INTO public.subscription_events(subscription_id, restaurant_id, event_type, previous_status, next_status, source, actor_user_id, details)
  VALUES (v_subscription.id, p_restaurant_id, 'trial_extended', v_subscription.subscription_status, 'TRIAL', 'platform_owner', auth.uid(), jsonb_build_object('days', p_days, 'trial_end', v_end));
  PERFORM public.platform_owner_log('trial_extended', 'subscription', v_subscription.id::text, p_restaurant_id, jsonb_build_object('days', p_days, 'trial_end', v_end));
  RETURN jsonb_build_object('subscription_id', v_subscription.id, 'status', 'TRIAL', 'trial_end', v_end);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_set_feature_override(p_restaurant_id uuid, p_feature_key text, p_enabled boolean, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  PERFORM public.platform_owner_assert();
  IF p_restaurant_id IS NULL OR nullif(lower(btrim(coalesce(p_feature_key, ''))), '') IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_FEATURE_OVERRIDE_INVALID'; END IF;
  INSERT INTO public.subscription_feature_overrides(restaurant_id, feature_key, enabled, reason, updated_by)
  VALUES (p_restaurant_id, lower(btrim(p_feature_key)), coalesce(p_enabled, false), p_reason, auth.uid())
  ON CONFLICT (restaurant_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled, reason = EXCLUDED.reason, updated_at = now(), updated_by = auth.uid();
  PERFORM public.platform_owner_log('feature_override_set', 'feature_override', p_feature_key, p_restaurant_id, jsonb_build_object('enabled', p_enabled, 'reason', p_reason));
  RETURN jsonb_build_object('restaurant_id', p_restaurant_id, 'feature', lower(btrim(p_feature_key)), 'enabled', p_enabled);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_subscription_can_use_feature(p_feature text, p_restaurant_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_restaurant_id uuid := coalesce(p_restaurant_id, public.auth_user_restaurant_id()); v_override boolean;
BEGIN
  SELECT enabled INTO v_override FROM public.subscription_feature_overrides WHERE restaurant_id = v_restaurant_id AND feature_key = lower(coalesce(p_feature, ''));
  IF FOUND THEN RETURN v_override; END IF;
  RETURN coalesce((public.erp_subscription_snapshot(v_restaurant_id) -> 'feature_flags') ? 'all', false)
      OR coalesce((public.erp_subscription_snapshot(v_restaurant_id) -> 'feature_flags') ? lower(coalesce(p_feature, '')), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_set_manual_payment_settings(p_iban text, p_bank_name text, p_beneficiary_name text, p_instructions text, p_currency text DEFAULT 'USD', p_is_active boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  PERFORM public.platform_owner_assert();
  UPDATE public.platform_manual_payment_settings SET iban = nullif(btrim(p_iban), ''), bank_name = nullif(btrim(p_bank_name), ''), beneficiary_name = nullif(btrim(p_beneficiary_name), ''), instructions = nullif(btrim(p_instructions), ''), currency = upper(coalesce(nullif(btrim(p_currency), ''), 'USD')), is_active = coalesce(p_is_active, false), updated_at = now(), updated_by = auth.uid() WHERE id = true;
  PERFORM public.platform_owner_log('manual_payment_settings_updated', 'payment_settings');
  RETURN jsonb_build_object('configured', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_manual_payment_instructions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_restaurant_id uuid := public.auth_user_restaurant_id(); v_settings public.platform_manual_payment_settings;
BEGIN
  PERFORM public.erp_assert_billing_owner(v_restaurant_id);
  SELECT * INTO v_settings FROM public.platform_manual_payment_settings WHERE id = true;
  IF NOT v_settings.is_active OR v_settings.iban IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MANUAL_PAYMENT_NOT_CONFIGURED'; END IF;
  RETURN jsonb_build_object('iban', v_settings.iban, 'bank_name', v_settings.bank_name, 'beneficiary_name', v_settings.beneficiary_name, 'instructions', v_settings.instructions, 'currency', v_settings.currency);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_iban_payment_intent(p_plan_id text, p_coupon_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_restaurant_id uuid := public.auth_user_restaurant_id(); v_subscription public.subscriptions; v_plan public.subscription_plans; v_promotion public.platform_promotions; v_payment public.subscription_payments; v_amount integer;
BEGIN
  PERFORM public.erp_assert_billing_owner(v_restaurant_id);
  PERFORM public.platform_manual_payment_instructions();
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id AND is_active AND is_public AND monthly_price_cents > 0;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAID_PLAN_REQUIRED'; END IF;
  SELECT * INTO v_subscription FROM public.subscriptions WHERE restaurant_id = v_restaurant_id FOR UPDATE;
  IF v_subscription.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_NOT_FOUND'; END IF;
  SELECT * INTO v_promotion FROM public.platform_promotions promotion
  WHERE promotion.plan_id = v_plan.id AND promotion.is_active AND promotion.starts_at <= now() AND promotion.ends_at >= now()
    AND (promotion.max_redemptions IS NULL OR promotion.redemption_count < promotion.max_redemptions)
    AND (nullif(btrim(coalesce(p_coupon_code, '')), '') IS NULL OR lower(promotion.coupon_code) = lower(btrim(p_coupon_code)))
  ORDER BY promotion.percent_off DESC NULLS LAST, promotion.created_at DESC LIMIT 1;
  v_amount := greatest(0, v_plan.monthly_price_cents - CASE WHEN v_promotion.id IS NULL THEN 0 WHEN v_promotion.percent_off IS NOT NULL THEN round(v_plan.monthly_price_cents * v_promotion.percent_off / 100.0)::integer ELSE v_promotion.fixed_amount_cents END);
  UPDATE public.subscription_payments SET status = 'superseded', updated_at = now() WHERE subscription_id = v_subscription.id AND provider = 'manual_iban' AND status = 'pending';
  UPDATE public.subscriptions SET plan = v_plan.id, subscription_status = 'PENDING_PAYMENT', payment_provider = 'manual_iban', updated_at = now() WHERE id = v_subscription.id;
  INSERT INTO public.subscription_payments(subscription_id, restaurant_id, plan_id, provider, status, amount_cents, currency, promotion_id, display_label, metadata)
  VALUES (v_subscription.id, v_restaurant_id, v_plan.id, 'manual_iban', 'pending', v_amount, 'USD', v_promotion.id, 'Manual IBAN transfer pending review', jsonb_build_object('requested_by', auth.uid(), 'original_price_cents', v_plan.monthly_price_cents, 'promotion_id', v_promotion.id)) RETURNING * INTO v_payment;
  INSERT INTO public.subscription_events(subscription_id, restaurant_id, event_type, previous_status, next_status, source, actor_user_id, details)
  VALUES (v_subscription.id, v_restaurant_id, 'manual_payment_requested', v_subscription.subscription_status, 'PENDING_PAYMENT', 'manual_iban', auth.uid(), jsonb_build_object('payment_id', v_payment.id));
  RETURN jsonb_build_object('payment_id', v_payment.id, 'status', 'pending', 'subscription_status', 'PENDING_PAYMENT', 'amount_cents', v_amount, 'currency', 'USD', 'plan_id', v_plan.id, 'promotion_id', v_promotion.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_manual_iban_payment_proof(p_payment_id uuid, p_payment_reference text, p_proof_key text, p_filename text, p_content_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_restaurant_id uuid := public.auth_user_restaurant_id(); v_payment public.subscription_payments;
BEGIN
  PERFORM public.erp_assert_billing_owner(v_restaurant_id);
  SELECT * INTO v_payment FROM public.subscription_payments WHERE id = p_payment_id AND restaurant_id = v_restaurant_id FOR UPDATE;
  IF v_payment.id IS NULL OR v_payment.provider <> 'manual_iban' OR v_payment.status <> 'pending' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MANUAL_PAYMENT_PROOF_NOT_AVAILABLE'; END IF;
  IF nullif(btrim(coalesce(p_payment_reference, '')), '') IS NULL OR p_proof_key !~ ('^' || auth.uid()::text || '/' || p_payment_id::text || '/') THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MANUAL_PAYMENT_PROOF_INVALID'; END IF;
  UPDATE public.subscription_payments SET payment_reference = btrim(p_payment_reference), payment_proof_key = p_proof_key, payment_proof_filename = nullif(btrim(p_filename), ''), payment_proof_content_type = nullif(btrim(p_content_type), ''), submitted_at = now(), display_label = 'Manual IBAN transfer submitted for review', updated_at = now() WHERE id = v_payment.id;
  RETURN jsonb_build_object('payment_id', v_payment.id, 'status', 'pending', 'submitted', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_review_manual_payment(p_payment_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_payment public.subscription_payments; v_subscription public.subscriptions; v_status text;
BEGIN
  PERFORM public.platform_owner_assert();
  SELECT * INTO v_payment FROM public.subscription_payments WHERE id = p_payment_id FOR UPDATE;
  IF v_payment.id IS NULL OR v_payment.provider <> 'manual_iban' OR v_payment.status <> 'pending' OR v_payment.payment_proof_key IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MANUAL_PAYMENT_REVIEW_NOT_AVAILABLE'; END IF;
  SELECT * INTO v_subscription FROM public.subscriptions WHERE id = v_payment.subscription_id FOR UPDATE;
  v_status := CASE WHEN p_approve THEN 'ACTIVE' ELSE 'PAST_DUE' END;
  UPDATE public.subscription_payments SET status = CASE WHEN p_approve THEN 'paid' ELSE 'rejected' END, paid_at = CASE WHEN p_approve THEN now() ELSE NULL END, failed_at = CASE WHEN p_approve THEN NULL ELSE now() END, reviewed_at = now(), reviewed_by = auth.uid(), review_note = p_note, period_start = CASE WHEN p_approve THEN current_date ELSE period_start END, period_end = CASE WHEN p_approve THEN current_date + 30 ELSE period_end END, display_label = CASE WHEN p_approve THEN 'Manual IBAN payment approved' ELSE 'Manual IBAN payment rejected' END, updated_at = now() WHERE id = v_payment.id;
  UPDATE public.subscriptions SET plan = CASE WHEN p_approve THEN v_payment.plan_id ELSE plan END, subscription_status = v_status, payment_provider = 'manual_iban', current_period_start = CASE WHEN p_approve THEN current_date ELSE current_period_start END, current_period_end = CASE WHEN p_approve THEN current_date + 30 ELSE current_period_end END, last_payment_at = CASE WHEN p_approve THEN now() ELSE last_payment_at END, updated_at = now() WHERE id = v_subscription.id;
  IF p_approve AND v_payment.promotion_id IS NOT NULL THEN UPDATE public.platform_promotions SET redemption_count = redemption_count + 1, updated_at = now() WHERE id = v_payment.promotion_id; END IF;
  INSERT INTO public.subscription_events(subscription_id, restaurant_id, event_type, previous_status, next_status, source, actor_user_id, details)
  VALUES (v_subscription.id, v_payment.restaurant_id, CASE WHEN p_approve THEN 'manual_payment_approved' ELSE 'manual_payment_rejected' END, v_subscription.subscription_status, v_status, 'platform_owner', auth.uid(), jsonb_build_object('payment_id', v_payment.id, 'note', p_note));
  PERFORM public.platform_owner_log(CASE WHEN p_approve THEN 'payment_approved' ELSE 'payment_rejected' END, 'payment', v_payment.id::text, v_payment.restaurant_id, jsonb_build_object('note', p_note));
  RETURN jsonb_build_object('payment_id', v_payment.id, 'payment_status', CASE WHEN p_approve THEN 'paid' ELSE 'rejected' END, 'subscription_status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_owner_is_authorized() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_assert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_list_organizations(text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_list_users(text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_list_payments(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_owner_session_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_list_organizations(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_list_users(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_list_payments(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_set_user_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_set_organization_status(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_extend_trial(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_set_feature_override(uuid, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_set_manual_payment_settings(text, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_manual_payment_instructions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_iban_payment_intent(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_manual_iban_payment_proof(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_review_manual_payment(uuid, boolean, text) TO authenticated;

COMMIT;
