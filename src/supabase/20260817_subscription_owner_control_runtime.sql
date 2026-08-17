BEGIN;

-- Extend the single authoritative manual-payment configuration. The settings table
-- remains inaccessible to browser table queries; only guarded RPCs below expose data.
ALTER TABLE public.platform_manual_payment_settings
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS account_holder text,
  ADD COLUMN IF NOT EXISTS payment_reference_rules text;

-- A plan's price is current-catalog data. Existing paid subscriptions retain their
-- already-recorded payment amount and period; only future intents read these values.
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS billing_period_months smallint NOT NULL DEFAULT 1;

ALTER TABLE public.subscription_plans
  DROP CONSTRAINT IF EXISTS subscription_plans_billing_period_months_check;
ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_billing_period_months_check
  CHECK (billing_period_months BETWEEN 1 AND 12) NOT VALID;
ALTER TABLE public.subscription_plans
  VALIDATE CONSTRAINT subscription_plans_billing_period_months_check;

-- Archiving/anonymizing a tenant user is reversible at the application-data level
-- and preserves payment and audit history. It never deletes auth.users or financial rows.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE OR REPLACE FUNCTION public.platform_owner_manual_payment_settings()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_settings public.platform_manual_payment_settings;
BEGIN
  PERFORM public.platform_owner_assert();
  SELECT * INTO v_settings FROM public.platform_manual_payment_settings WHERE id = true;
  RETURN jsonb_build_object(
    'company_name', v_settings.company_name,
    'bank_name', v_settings.bank_name,
    'account_holder', v_settings.account_holder,
    'beneficiary_name', v_settings.beneficiary_name,
    'iban', v_settings.iban,
    'currency', v_settings.currency,
    'instructions', v_settings.instructions,
    'payment_reference_rules', v_settings.payment_reference_rules,
    'is_active', coalesce(v_settings.is_active, false)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_save_manual_payment_settings(
  p_company_name text,
  p_bank_name text,
  p_account_holder text,
  p_iban text,
  p_currency text,
  p_instructions text,
  p_payment_reference_rules text,
  p_is_active boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_iban text := upper(regexp_replace(coalesce(p_iban, ''), '[[:space:]-]+', '', 'g'));
DECLARE v_currency text := upper(btrim(coalesce(p_currency, '')));
DECLARE v_settings public.platform_manual_payment_settings;
BEGIN
  PERFORM public.platform_owner_assert();

  IF coalesce(p_is_active, false) THEN
    IF nullif(btrim(coalesce(p_company_name, '')), '') IS NULL
       OR nullif(btrim(coalesce(p_bank_name, '')), '') IS NULL
       OR nullif(btrim(coalesce(p_account_holder, '')), '') IS NULL
       OR v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'
       OR v_currency !~ '^[A-Z]{3}$' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MANUAL_PAYMENT_SETTINGS_INVALID';
    END IF;
  END IF;

  UPDATE public.platform_manual_payment_settings
  SET company_name = nullif(btrim(p_company_name), ''),
      bank_name = nullif(btrim(p_bank_name), ''),
      account_holder = nullif(btrim(p_account_holder), ''),
      beneficiary_name = nullif(btrim(p_account_holder), ''),
      iban = nullif(v_iban, ''),
      currency = coalesce(nullif(v_currency, ''), 'USD'),
      instructions = nullif(btrim(p_instructions), ''),
      payment_reference_rules = nullif(btrim(p_payment_reference_rules), ''),
      is_active = coalesce(p_is_active, false),
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = true
  RETURNING * INTO v_settings;

  PERFORM public.platform_owner_log(
    'manual_payment_settings_updated',
    'payment_settings',
    'manual_payment_settings',
    NULL,
    jsonb_build_object('is_active', v_settings.is_active, 'currency', v_settings.currency)
  );

  RETURN jsonb_build_object('configured', true, 'is_active', v_settings.is_active);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_manual_payment_instructions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_restaurant_id uuid := public.auth_user_restaurant_id();
DECLARE v_settings public.platform_manual_payment_settings;
BEGIN
  PERFORM public.erp_assert_billing_owner(v_restaurant_id);
  SELECT * INTO v_settings FROM public.platform_manual_payment_settings WHERE id = true;
  IF NOT coalesce(v_settings.is_active, false)
     OR v_settings.iban IS NULL
     OR v_settings.company_name IS NULL
     OR v_settings.bank_name IS NULL
     OR v_settings.account_holder IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MANUAL_PAYMENT_NOT_CONFIGURED';
  END IF;
  RETURN jsonb_build_object(
    'company_name', v_settings.company_name,
    'bank_name', v_settings.bank_name,
    'account_holder', v_settings.account_holder,
    'beneficiary_name', v_settings.beneficiary_name,
    'iban', v_settings.iban,
    'currency', v_settings.currency,
    'instructions', v_settings.instructions,
    'payment_reference_rules', v_settings.payment_reference_rules
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_list_plans()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  PERFORM public.platform_owner_assert();
  RETURN (
    SELECT coalesce(jsonb_agg(to_jsonb(plan) ORDER BY plan.sort_order), '[]'::jsonb)
    FROM public.subscription_plans plan
    WHERE plan.id IN ('starter_20', 'growth_40', 'enterprise_100')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_save_plan(
  p_plan_id text,
  p_display_name text,
  p_monthly_price_cents integer,
  p_original_price_cents integer,
  p_billing_period_months smallint,
  p_feature_flags jsonb,
  p_limits jsonb,
  p_is_active boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_plan public.subscription_plans;
DECLARE v_price integer := coalesce(p_monthly_price_cents, 0);
DECLARE v_original integer := coalesce(p_original_price_cents, v_price);
DECLARE v_period smallint := coalesce(p_billing_period_months, 1);
DECLARE v_discount integer;
BEGIN
  PERFORM public.platform_owner_assert();
  IF nullif(btrim(coalesce(p_plan_id, '')), '') IS NULL
     OR v_price <= 0
     OR v_original < v_price
     OR v_period NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_PLAN_INPUT_INVALID';
  END IF;

  v_discount := CASE WHEN v_original > v_price
    THEN round(((v_original - v_price)::numeric / v_original::numeric) * 100)::integer
    ELSE 0 END;

  UPDATE public.subscription_plans
  SET display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
      monthly_price_cents = v_price,
      original_price_cents = v_original,
      billing_period_months = v_period,
      discount_active = v_original > v_price,
      discount_percent = nullif(v_discount, 0),
      discount_label = CASE WHEN v_discount > 0 THEN v_discount::text || '% OFF' ELSE NULL END,
      feature_flags = coalesce(p_feature_flags, feature_flags),
      max_branches = coalesce((p_limits ->> 'max_branches')::integer, max_branches),
      max_employees = coalesce((p_limits ->> 'max_employees')::integer, max_employees),
      max_users = coalesce((p_limits ->> 'max_users')::integer, max_users),
      max_storage_mb = coalesce((p_limits ->> 'max_storage_mb')::integer, max_storage_mb),
      max_pdf_exports = coalesce((p_limits ->> 'max_pdf_exports')::integer, max_pdf_exports),
      max_ocr_scans = coalesce((p_limits ->> 'max_ocr_scans')::integer, max_ocr_scans),
      is_active = coalesce(p_is_active, is_active),
      updated_at = now()
  WHERE id = btrim(p_plan_id)
  RETURNING * INTO v_plan;

  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_PLAN_NOT_FOUND';
  END IF;

  PERFORM public.platform_owner_log(
    'plan_updated',
    'plan',
    v_plan.id,
    NULL,
    jsonb_build_object('monthly_price_cents', v_plan.monthly_price_cents, 'original_price_cents', v_plan.original_price_cents, 'billing_period_months', v_plan.billing_period_months, 'is_active', v_plan.is_active)
  );
  RETURN to_jsonb(v_plan);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_iban_payment_intent(
  p_plan_id text,
  p_coupon_code text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_restaurant_id uuid := public.auth_user_restaurant_id();
DECLARE v_subscription public.subscriptions;
DECLARE v_plan public.subscription_plans;
DECLARE v_promotion public.platform_promotions;
DECLARE v_payment public.subscription_payments;
DECLARE v_existing_payment public.subscription_payments;
DECLARE v_settings public.platform_manual_payment_settings;
DECLARE v_amount integer;
BEGIN
  PERFORM public.erp_assert_billing_owner(v_restaurant_id);
  PERFORM public.platform_manual_payment_instructions();
  SELECT * INTO v_settings FROM public.platform_manual_payment_settings WHERE id = true;

  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = btrim(p_plan_id)
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
    v_amount, v_settings.currency, v_promotion.id, 'Manual IBAN transfer pending review',
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
    'currency', v_settings.currency,
    'plan_id', v_plan.id,
    'promotion_id', v_promotion.id,
    'reused', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_review_manual_payment(
  p_payment_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_payment public.subscription_payments;
DECLARE v_subscription public.subscriptions;
DECLARE v_plan public.subscription_plans;
DECLARE v_status text;
DECLARE v_period_end date;
BEGIN
  PERFORM public.platform_owner_assert();
  SELECT * INTO v_payment
  FROM public.subscription_payments
  WHERE id = p_payment_id
  FOR UPDATE;
  IF v_payment.id IS NULL
     OR v_payment.provider <> 'manual_iban'
     OR v_payment.status <> 'pending'
     OR v_payment.payment_proof_key IS NULL
     OR v_payment.amount_cents < 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MANUAL_PAYMENT_REVIEW_NOT_AVAILABLE';
  END IF;

  SELECT * INTO v_subscription FROM public.subscriptions WHERE id = v_payment.subscription_id FOR UPDATE;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_payment.plan_id;
  IF v_subscription.id IS NULL OR v_plan.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MANUAL_PAYMENT_RELATIONSHIP_INVALID';
  END IF;

  v_status := CASE WHEN p_approve THEN 'ACTIVE' ELSE 'PAST_DUE' END;
  v_period_end := (current_date + make_interval(months => coalesce(v_plan.billing_period_months, 1)))::date;

  UPDATE public.subscription_payments
  SET status = CASE WHEN p_approve THEN 'paid' ELSE 'rejected' END,
      paid_at = CASE WHEN p_approve THEN now() ELSE NULL END,
      failed_at = CASE WHEN p_approve THEN NULL ELSE now() END,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      review_note = nullif(btrim(p_note), ''),
      period_start = CASE WHEN p_approve THEN current_date ELSE period_start END,
      period_end = CASE WHEN p_approve THEN v_period_end ELSE period_end END,
      display_label = CASE WHEN p_approve THEN 'Manual IBAN payment approved' ELSE 'Manual IBAN payment rejected' END,
      updated_at = now()
  WHERE id = v_payment.id;

  UPDATE public.subscriptions
  SET plan = CASE WHEN p_approve THEN v_payment.plan_id ELSE plan END,
      subscription_status = v_status,
      payment_provider = 'manual_iban',
      current_period_start = CASE WHEN p_approve THEN current_date ELSE current_period_start END,
      current_period_end = CASE WHEN p_approve THEN v_period_end ELSE current_period_end END,
      last_payment_at = CASE WHEN p_approve THEN now() ELSE last_payment_at END,
      cancel_at_period_end = CASE WHEN p_approve THEN false ELSE cancel_at_period_end END,
      canceled_at = CASE WHEN p_approve THEN NULL ELSE canceled_at END,
      updated_at = now()
  WHERE id = v_subscription.id;

  IF p_approve AND v_payment.promotion_id IS NOT NULL THEN
    UPDATE public.platform_promotions
    SET redemption_count = redemption_count + 1, updated_at = now()
    WHERE id = v_payment.promotion_id;
  END IF;

  INSERT INTO public.subscription_events (
    subscription_id, restaurant_id, event_type, previous_status, next_status,
    source, actor_user_id, details
  ) VALUES (
    v_subscription.id, v_payment.restaurant_id,
    CASE WHEN p_approve THEN 'manual_payment_approved' ELSE 'manual_payment_rejected' END,
    v_subscription.subscription_status, v_status, 'platform_owner', auth.uid(),
    jsonb_build_object('payment_id', v_payment.id, 'note', nullif(btrim(p_note), ''), 'amount_cents', v_payment.amount_cents, 'currency', v_payment.currency)
  );
  PERFORM public.platform_owner_log(
    CASE WHEN p_approve THEN 'payment_approved' ELSE 'payment_rejected' END,
    'payment', v_payment.id::text, v_payment.restaurant_id,
    jsonb_build_object('amount_cents', v_payment.amount_cents, 'currency', v_payment.currency, 'note', nullif(btrim(p_note), ''))
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'payment_status', CASE WHEN p_approve THEN 'paid' ELSE 'rejected' END,
    'subscription_status', v_status,
    'period_end', CASE WHEN p_approve THEN v_period_end ELSE v_payment.period_end END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_archive_user(
  p_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  PERFORM public.platform_owner_assert();
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_USER_INPUT_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_owner_accounts WHERE user_id = p_user_id AND status = 'active') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_ACCOUNT_PROTECTED';
  END IF;

  UPDATE public.profiles
  SET is_active = false,
      approval_status = 'suspended',
      archived_at = now(),
      updated_date = now()
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_USER_NOT_FOUND';
  END IF;

  UPDATE public.erp_memberships
  SET status = 'suspended', rejection_reason = coalesce(nullif(btrim(p_reason), ''), 'archived by Platform Owner'), updated_at = now()
  WHERE user_id = p_user_id;

  PERFORM public.platform_owner_log('user_archived', 'user', p_user_id::text, NULL, jsonb_build_object('reason', nullif(btrim(p_reason), '')));
  RETURN jsonb_build_object('user_id', p_user_id, 'status', 'archived');
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_anonymize_user(
  p_user_id uuid,
  p_confirmation text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  PERFORM public.platform_owner_assert();
  IF p_user_id IS NULL OR btrim(coalesce(p_confirmation, '')) <> 'DELETE USER' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_USER_DELETE_CONFIRMATION_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_owner_accounts WHERE user_id = p_user_id AND status = 'active') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_ACCOUNT_PROTECTED';
  END IF;

  UPDATE public.profiles
  SET full_name = 'Archived user',
      email = 'archived+' || id::text || '@deleted.invalid',
      phone = NULL,
      is_active = false,
      approval_status = 'suspended',
      archived_at = now(),
      updated_date = now()
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_USER_NOT_FOUND';
  END IF;

  UPDATE public.erp_memberships
  SET status = 'suspended', rejection_reason = coalesce(nullif(btrim(p_reason), ''), 'anonymized by Platform Owner'), updated_at = now()
  WHERE user_id = p_user_id;

  PERFORM public.platform_owner_log('user_anonymized', 'user', p_user_id::text, NULL, jsonb_build_object('reason', nullif(btrim(p_reason), ''), 'financial_records_preserved', true));
  RETURN jsonb_build_object('user_id', p_user_id, 'status', 'anonymized');
END;
$$;

REVOKE ALL ON FUNCTION public.platform_owner_save_manual_payment_settings(text, text, text, text, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_save_plan(text, text, integer, integer, smallint, jsonb, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_archive_user(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_anonymize_user(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_owner_manual_payment_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_save_manual_payment_settings(text, text, text, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_save_plan(text, text, integer, integer, smallint, jsonb, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_archive_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_anonymize_user(uuid, text, text) TO authenticated;

COMMIT;
