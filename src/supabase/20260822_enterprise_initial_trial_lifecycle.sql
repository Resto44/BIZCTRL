-- Canonical 30-day Enterprise free trial for new Owner organizations.
-- Paid Paddle activation remains webhook-authoritative; this migration creates no payments.

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
    'enterprise_100', 'TRIAL', current_date, current_date + 30,
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
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE restaurant_id = p_restaurant_id
  FOR UPDATE;
  IF v_subscription.id IS NOT NULL THEN
    RETURN v_subscription;
  END IF;

  UPDATE public.subscriptions
  SET restaurant_id = p_restaurant_id,
      branch_id = NULL,
      tenant_id = p_restaurant_id::text,
      subscription_status = CASE
        WHEN subscription_status IN ('TRIAL', 'FREE', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED') THEN subscription_status
        ELSE 'EXPIRED'
      END,
      updated_at = now()
  WHERE id = (
    SELECT id
    FROM public.subscriptions
    WHERE restaurant_id IS NULL
      AND lower(coalesce(org_key, '')) = v_org_key
    ORDER BY created_date DESC NULLS LAST, id DESC
    LIMIT 1
  )
  RETURNING * INTO v_subscription;
  IF v_subscription.id IS NOT NULL THEN
    RETURN v_subscription;
  END IF;

  INSERT INTO public.subscriptions (
    org_key, restaurant_id, tenant_id, plan, subscription_status, trial_start,
    trial_end, current_period_start, current_period_end, payment_provider, billing_email, created_by
  ) VALUES (
    v_org_key, p_restaurant_id, p_restaurant_id::text, 'enterprise_100', 'TRIAL',
    current_date, current_date + 30, current_date, current_date + 30,
    'none', v_org_key, coalesce(v_org_key, auth.uid()::text)
  )
  RETURNING * INTO v_subscription;

  RETURN v_subscription;
END;
$$;

-- Align only currently valid, unpaid, application-provisioned Starter trials.
-- Historical paid Paddle trials, manual records, expired trials, and all payments/events remain untouched.
UPDATE public.subscriptions s
SET plan = 'enterprise_100',
    updated_at = now()
WHERE s.plan = 'starter_20'
  AND s.subscription_status = 'TRIAL'
  AND s.payment_provider = 'none'
  AND s.trial_start IS NOT NULL
  AND s.trial_end >= current_date
  AND NOT EXISTS (
    SELECT 1
    FROM public.subscription_payments p
    WHERE p.subscription_id = s.id
  );
