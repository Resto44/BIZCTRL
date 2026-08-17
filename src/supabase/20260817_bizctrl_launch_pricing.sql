-- BizCTRL launch pricing remains the single authoritative public subscription catalog.
-- Existing subscriptions and payment records are intentionally preserved. New payment intents
-- read the updated catalog values, while prior paid amounts remain historical records.

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS trial_days smallint NOT NULL DEFAULT 0;

ALTER TABLE public.subscription_plans
  DROP CONSTRAINT IF EXISTS subscription_plans_trial_days_check;
ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_trial_days_check
  CHECK (trial_days BETWEEN 0 AND 90) NOT VALID;
ALTER TABLE public.subscription_plans
  VALIDATE CONSTRAINT subscription_plans_trial_days_check;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS billing_product_key text;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS paddle_price_id text;

UPDATE public.subscription_plans
SET
  monthly_price_cents = CASE id
    WHEN 'starter_20' THEN 1000
    WHEN 'growth_40' THEN 2400
    WHEN 'enterprise_100' THEN 20000
    ELSE monthly_price_cents
  END,
  original_price_cents = CASE id
    WHEN 'starter_20' THEN 4000
    WHEN 'growth_40' THEN 8000
    WHEN 'enterprise_100' THEN 20000
    ELSE original_price_cents
  END,
  discount_percent = CASE id
    WHEN 'starter_20' THEN 75
    WHEN 'growth_40' THEN 70
    WHEN 'enterprise_100' THEN 0
    ELSE discount_percent
  END,
  discount_active = CASE id
    WHEN 'starter_20' THEN true
    WHEN 'growth_40' THEN true
    WHEN 'enterprise_100' THEN false
    ELSE discount_active
  END,
  discount_label = CASE id
    WHEN 'starter_20' THEN '75% OFF'
    WHEN 'growth_40' THEN '70% OFF'
    WHEN 'enterprise_100' THEN NULL
    ELSE discount_label
  END,
  trial_days = CASE id
    WHEN 'starter_20' THEN 30
    WHEN 'growth_40' THEN 0
    WHEN 'enterprise_100' THEN 0
    ELSE trial_days
  END,
  billing_product_key = CASE id
    WHEN 'starter_20' THEN 'starter_monthly'
    WHEN 'growth_40' THEN 'growth_monthly'
    WHEN 'enterprise_100' THEN 'enterprise_monthly'
    ELSE billing_product_key
  END,
  paddle_price_id = NULL,
  billing_period_months = 1,
  updated_at = now()
WHERE id IN ('starter_20', 'growth_40', 'enterprise_100');

-- Every newly provisioned organization starts on the documented Starter trial.
CREATE OR REPLACE FUNCTION public.provision_organization_trial_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (
    org_key, restaurant_id, branch_id, tenant_id, plan, subscription_status,
    trial_start, trial_end, current_period_start, current_period_end,
    payment_provider, billing_email
  ) VALUES (
    coalesce(NEW.org_id, NEW.created_by, NEW.id::text), NEW.id, NEW.branch_id, NEW.id::text,
    'starter_20', 'TRIAL', current_date, current_date + 30,
    current_date, current_date + 30, 'none', NEW.created_by
  ) ON CONFLICT (restaurant_id) WHERE restaurant_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_erp_subscription(p_restaurant_id uuid, p_org_key text DEFAULT NULL)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_subscription public.subscriptions;
  v_org_key text := nullif(lower(btrim(coalesce(p_org_key, ''))), '');
BEGIN
  IF auth.uid() IS NULL OR p_restaurant_id IS NULL OR NOT public.erp_is_approved_owner(p_restaurant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILLING_OWNER_REQUIRED';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_restaurant_id::text));
  SELECT * INTO v_subscription FROM public.subscriptions WHERE restaurant_id = p_restaurant_id FOR UPDATE;
  IF v_subscription.id IS NOT NULL THEN RETURN v_subscription; END IF;
  UPDATE public.subscriptions
  SET restaurant_id = p_restaurant_id, branch_id = NULL, tenant_id = p_restaurant_id::text,
      subscription_status = CASE WHEN subscription_status IN ('TRIAL', 'FREE', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED') THEN subscription_status ELSE 'EXPIRED' END,
      updated_at = now()
  WHERE id = (
    SELECT id FROM public.subscriptions
    WHERE restaurant_id IS NULL AND lower(coalesce(org_key, '')) = v_org_key
    ORDER BY created_date DESC NULLS LAST, id DESC LIMIT 1
  ) RETURNING * INTO v_subscription;
  IF v_subscription.id IS NOT NULL THEN RETURN v_subscription; END IF;
  INSERT INTO public.subscriptions (
    org_key, restaurant_id, tenant_id, plan, subscription_status, trial_start,
    trial_end, current_period_start, current_period_end, payment_provider, billing_email, created_by
  ) VALUES (
    v_org_key, p_restaurant_id, p_restaurant_id::text, 'starter_20', 'TRIAL',
    current_date, current_date + 30, current_date, current_date + 30, 'none', v_org_key, coalesce(v_org_key, auth.uid()::text)
  ) RETURNING * INTO v_subscription;
  RETURN v_subscription;
END;
$$;
