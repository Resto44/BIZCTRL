BEGIN;

-- Canonical subscription model: restaurants are the existing organization boundary.
-- These tables already exist in production; this migration strengthens them rather
-- than introducing parallel billing entities.
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS discount_label text,
  ADD COLUMN IF NOT EXISTS discount_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS discount_ends_at timestamptz;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS restaurant_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS tenant_id text,
  ADD COLUMN IF NOT EXISTS trial_start date,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS current_period_start date,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  previous_status text,
  next_status text,
  source text NOT NULL,
  actor_user_id uuid,
  provider_event_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Normalize the legacy records before constraining the state machine. Free is
-- represented by both a FREE status and the permanent `free` catalog plan.
INSERT INTO public.subscription_events (
  subscription_id, restaurant_id, event_type, previous_status, next_status, source, details
)
SELECT
  s.id,
  s.restaurant_id,
  'legacy_subscription_migrated',
  s.subscription_status,
  CASE
    WHEN lower(coalesce(s.subscription_status, '')) = 'trial' AND s.trial_end < current_date THEN 'EXPIRED'
    WHEN lower(coalesce(s.subscription_status, '')) IN ('active', 'paid') AND s.current_period_end < current_date THEN 'PAST_DUE'
    WHEN lower(coalesce(s.subscription_status, '')) IN ('suspended', 'expired') THEN 'EXPIRED'
    WHEN lower(coalesce(s.subscription_status, '')) IN ('canceled', 'cancelled') THEN 'CANCELED'
    WHEN lower(coalesce(s.subscription_status, '')) = 'free' THEN 'FREE'
    WHEN lower(coalesce(s.subscription_status, '')) = 'trial' THEN 'TRIAL'
    WHEN lower(coalesce(s.subscription_status, '')) IN ('active', 'paid') THEN 'ACTIVE'
    ELSE 'EXPIRED'
  END,
  'migration',
  jsonb_build_object('legacy_plan', s.plan, 'legacy_org_key', s.org_key)
FROM public.subscriptions s
WHERE s.restaurant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.subscription_events e
    WHERE e.subscription_id = s.id AND e.event_type = 'legacy_subscription_migrated'
  );

UPDATE public.subscriptions
SET subscription_status = CASE
      WHEN lower(coalesce(subscription_status, '')) = 'trial' AND trial_end < current_date THEN 'EXPIRED'
      WHEN lower(coalesce(subscription_status, '')) IN ('active', 'paid') AND current_period_end < current_date THEN 'PAST_DUE'
      WHEN lower(coalesce(subscription_status, '')) IN ('suspended', 'expired') THEN 'EXPIRED'
      WHEN lower(coalesce(subscription_status, '')) IN ('canceled', 'cancelled') THEN 'CANCELED'
      WHEN lower(coalesce(subscription_status, '')) = 'free' THEN 'FREE'
      WHEN lower(coalesce(subscription_status, '')) = 'trial' THEN 'TRIAL'
      WHEN lower(coalesce(subscription_status, '')) IN ('active', 'paid') THEN 'ACTIVE'
      ELSE 'EXPIRED'
    END,
    plan = CASE WHEN lower(coalesce(subscription_status, '')) = 'free' THEN 'free' ELSE plan END,
    updated_at = now();

-- Only these four public catalog plans are sellable. The live values preserve
-- the current ERP capacity profile while matching the mandated paid prices.
INSERT INTO public.subscription_plans (
  id, display_name, monthly_price_cents, original_price_cents, discount_percent, discount_active,
  max_restaurants, max_branches, max_employees, max_users, max_storage_mb, max_pdf_exports,
  max_ocr_scans, advanced_analytics, feature_flags, is_public, is_active, sort_order
) VALUES
  ('free', 'Free', 0, 0, 0, false, 1, 1, 5, 5, 512, 10, 10, false,
   '["sales","purchases","expenses","inventory","basic_reports"]'::jsonb, true, true, 0),
  ('starter_20', 'Starter', 2000, 2000, 0, false, 1, 3, 20, 20, 5120, 100, 100, false,
   '["sales","purchases","expenses","inventory","treasury","suppliers","reports","pdf_exports","ocr"]'::jsonb, true, true, 1),
  ('growth_40', 'Growth', 4000, 4000, 0, false, 3, 10, 75, 75, 25600, 500, 500, true,
   '["sales","purchases","expenses","inventory","treasury","suppliers","reports","pdf_exports","ocr","advanced_analytics","driver_analytics","scheduled_reports","cashflow_forecast"]'::jsonb, true, true, 2),
  ('enterprise_100', 'Enterprise', 10000, 10000, 0, false, 10, 50, 250, 250, 102400, 2000, 2000, true,
   '["all"]'::jsonb, true, true, 3)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  original_price_cents = EXCLUDED.original_price_cents,
  discount_percent = EXCLUDED.discount_percent,
  discount_active = EXCLUDED.discount_active,
  max_restaurants = EXCLUDED.max_restaurants,
  max_branches = EXCLUDED.max_branches,
  max_employees = EXCLUDED.max_employees,
  max_users = EXCLUDED.max_users,
  max_storage_mb = EXCLUDED.max_storage_mb,
  max_pdf_exports = EXCLUDED.max_pdf_exports,
  max_ocr_scans = EXCLUDED.max_ocr_scans,
  advanced_analytics = EXCLUDED.advanced_analytics,
  feature_flags = EXCLUDED.feature_flags,
  is_public = true,
  is_active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

UPDATE public.subscription_plans
SET is_public = false, is_active = false, updated_at = now()
WHERE id NOT IN ('free', 'starter_20', 'growth_40', 'enterprise_100');

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_state_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_state_check
  CHECK (subscription_status IN ('TRIAL', 'FREE', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED')) NOT VALID;
ALTER TABLE public.subscriptions VALIDATE CONSTRAINT subscriptions_status_state_check;

ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_discount_integrity_check;
ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_discount_integrity_check
  CHECK (
    (NOT discount_active AND discount_percent = 0)
    OR (discount_active AND original_price_cents > monthly_price_cents AND discount_percent > 0)
  );

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_per_restaurant_idx
  ON public.subscriptions (restaurant_id) WHERE restaurant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_provider_event_unique_idx
  ON public.subscription_payments (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS subscription_events_provider_event_unique_idx
  ON public.subscription_events (provider_event_id)
  WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscription_events_restaurant_created_idx
  ON public.subscription_events (restaurant_id, created_at DESC);

-- End user-facing direct mutation access. Billing changes happen only through
-- narrowly scoped SECURITY DEFINER procedures or a verified provider event.
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Subscriptions: owner manage" ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_scoped_read ON public.subscriptions;
CREATE POLICY subscriptions_scoped_read ON public.subscriptions FOR SELECT TO authenticated
  USING (restaurant_id IS NOT NULL AND public.erp_can_access_scope(restaurant_id, NULL));

DROP POLICY IF EXISTS subscription_usage_owner_read ON public.subscription_usage;
CREATE POLICY subscription_usage_owner_read ON public.subscription_usage FOR SELECT TO authenticated
  USING (public.erp_is_approved_owner(restaurant_id));

DROP POLICY IF EXISTS subscription_payments_owner_read ON public.subscription_payments;
CREATE POLICY subscription_payments_owner_read ON public.subscription_payments FOR SELECT TO authenticated
  USING (public.erp_is_approved_owner(restaurant_id));

DROP POLICY IF EXISTS subscription_events_owner_read ON public.subscription_events;
CREATE POLICY subscription_events_owner_read ON public.subscription_events FOR SELECT TO authenticated
  USING (public.erp_is_approved_owner(restaurant_id));

CREATE OR REPLACE FUNCTION public.erp_subscription_has_erp_access(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.restaurant_id = p_restaurant_id
      AND (
        (s.subscription_status = 'TRIAL' AND s.trial_end IS NOT NULL AND s.trial_end >= current_date)
        OR s.subscription_status = 'FREE'
        OR (s.subscription_status = 'ACTIVE' AND (s.current_period_end IS NULL OR s.current_period_end >= current_date))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.erp_can_access_scope(p_restaurant_id uuid, p_branch_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.erp_memberships m
    WHERE m.user_id = auth.uid()
      AND m.status = 'approved'
      AND m.restaurant_id = p_restaurant_id
      AND (m.role = 'owner' OR p_branch_id IS NULL OR m.branch_id = p_branch_id)
  ) AND public.erp_subscription_has_erp_access(p_restaurant_id);
$$;

CREATE OR REPLACE FUNCTION public.erp_can_access_scope_text(p_restaurant_id text, p_branch_id text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM public.erp_memberships m
      WHERE m.user_id = auth.uid()
        AND m.status = 'approved'
        AND m.restaurant_id::text = nullif(p_restaurant_id, '')
        AND (m.role = 'owner' OR nullif(p_branch_id, '') IS NULL OR m.branch_id::text = p_branch_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'owner'
        AND coalesce(pr.approval_status, 'approved') = 'approved'
        AND coalesce(pr.organization_id, pr.restaurant_id)::text = nullif(p_restaurant_id, '')
    )
  )
  AND EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.restaurant_id::text = nullif(p_restaurant_id, '')
      AND public.erp_subscription_has_erp_access(s.restaurant_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.erp_can_write_scope(p_restaurant_id uuid, p_branch_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.erp_memberships m
    WHERE m.user_id = auth.uid()
      AND m.status = 'approved'
      AND m.restaurant_id = p_restaurant_id
      AND m.role IN ('owner', 'manager')
      AND (m.role = 'owner' OR p_branch_id IS NULL OR m.branch_id = p_branch_id)
  ) AND public.erp_subscription_has_erp_access(p_restaurant_id);
$$;

CREATE OR REPLACE FUNCTION public.erp_can_write_scope_text(p_restaurant_id text, p_branch_id text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM public.erp_memberships m
      WHERE m.user_id = auth.uid()
        AND m.status = 'approved'
        AND m.restaurant_id::text = nullif(p_restaurant_id, '')
        AND (m.role IN ('owner', 'manager', 'general_manager', 'employee')
          OR coalesce((m.permissions ->> 'uploadSales')::boolean, false))
        AND (m.role = 'owner' OR (nullif(p_branch_id, '') IS NOT NULL AND m.branch_id::text = nullif(p_branch_id, '')))
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'owner'
        AND coalesce(pr.approval_status, 'approved') = 'approved'
        AND coalesce(pr.organization_id, pr.restaurant_id)::text = nullif(p_restaurant_id, '')
    )
  )
  AND EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.restaurant_id::text = nullif(p_restaurant_id, '')
      AND public.erp_subscription_has_erp_access(s.restaurant_id)
  );
$$;

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

DROP TRIGGER IF EXISTS subscription_trial_after_restaurant_create ON public.restaurants;
CREATE TRIGGER subscription_trial_after_restaurant_create
AFTER INSERT ON public.restaurants
FOR EACH ROW EXECUTE FUNCTION public.provision_organization_trial_subscription();

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
    v_org_key, p_restaurant_id, p_restaurant_id::text, 'enterprise_100', 'TRIAL',
    current_date, current_date + 30, current_date, current_date + 30, 'none', v_org_key, coalesce(v_org_key, auth.uid()::text)
  ) RETURNING * INTO v_subscription;
  RETURN v_subscription;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_subscription_snapshot(p_restaurant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_restaurant_id uuid := coalesce(p_restaurant_id, public.auth_user_restaurant_id());
  v_subscription public.subscriptions;
  v_plan public.subscription_plans;
  v_status text;
  v_usage jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_restaurant_id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'has_erp_access', false, 'status', 'EXPIRED');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.erp_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'approved' AND m.restaurant_id = v_restaurant_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_SCOPE_DENIED',
      DETAIL = jsonb_build_object('restaurant_id', v_restaurant_id)::text;
  END IF;

  SELECT * INTO v_subscription FROM public.subscriptions
  WHERE restaurant_id = v_restaurant_id
  ORDER BY updated_at DESC, created_date DESC NULLS LAST LIMIT 1;
  IF v_subscription.id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'has_erp_access', false, 'status', 'EXPIRED');
  END IF;

  v_status := v_subscription.subscription_status;
  IF v_status = 'TRIAL' AND (v_subscription.trial_end IS NULL OR v_subscription.trial_end < current_date) THEN
    UPDATE public.subscriptions SET subscription_status = 'EXPIRED', updated_at = now() WHERE id = v_subscription.id;
    INSERT INTO public.subscription_events (subscription_id, restaurant_id, event_type, previous_status, next_status, source)
      VALUES (v_subscription.id, v_restaurant_id, 'trial_expired', 'TRIAL', 'EXPIRED', 'server_snapshot');
    v_status := 'EXPIRED';
  ELSIF v_status = 'ACTIVE' AND v_subscription.current_period_end IS NOT NULL AND v_subscription.current_period_end < current_date THEN
    UPDATE public.subscriptions SET subscription_status = 'PAST_DUE', updated_at = now() WHERE id = v_subscription.id;
    INSERT INTO public.subscription_events (subscription_id, restaurant_id, event_type, previous_status, next_status, source)
      VALUES (v_subscription.id, v_restaurant_id, 'billing_period_elapsed', 'ACTIVE', 'PAST_DUE', 'server_snapshot');
    v_status := 'PAST_DUE';
  END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_subscription.plan AND is_active = true;
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_PLAN_INVALID';
  END IF;

  SELECT coalesce(jsonb_object_agg(metric, used_amount), '{}'::jsonb) INTO v_usage
  FROM public.subscription_usage
  WHERE subscription_id = v_subscription.id
    AND (period_start = date_trunc('month', current_date)::date OR period_start = date '1970-01-01');

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
    'payment_provider', v_subscription.payment_provider,
    'limits', jsonb_build_object(
      'restaurants', v_plan.max_restaurants, 'branches', v_plan.max_branches,
      'employees', v_plan.max_employees, 'users', v_plan.max_users,
      'storage_mb', v_plan.max_storage_mb, 'pdf_exports', v_plan.max_pdf_exports,
      'ocr_scans', v_plan.max_ocr_scans
    ),
    'usage', v_usage,
    'advanced_analytics', (v_status = 'TRIAL' OR v_plan.advanced_analytics),
    'feature_flags', CASE WHEN v_status = 'TRIAL' THEN '["all"]'::jsonb ELSE v_plan.feature_flags END,
    'pricing', jsonb_build_object(
      'monthly_price_cents', v_plan.monthly_price_cents,
      'original_price_cents', v_plan.original_price_cents,
      'discount_percent', v_plan.discount_percent,
      'discount_active', v_plan.discount_active,
      'discount_label', v_plan.discount_label
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_subscription_can_use_feature(p_feature text, p_restaurant_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT coalesce((public.erp_subscription_snapshot(p_restaurant_id) -> 'feature_flags') ? 'all', false)
      OR coalesce((public.erp_subscription_snapshot(p_restaurant_id) -> 'feature_flags') ? lower(coalesce(p_feature, '')), false);
$$;

CREATE OR REPLACE FUNCTION public.erp_consume_subscription_usage(
  p_metric text, p_amount bigint DEFAULT 1, p_restaurant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_restaurant_id uuid := coalesce(p_restaurant_id, public.auth_user_restaurant_id());
  v_subscription public.subscriptions;
  v_plan public.subscription_plans;
  v_limit bigint;
  v_used bigint;
  v_period date := CASE WHEN p_metric = 'storage_mb' THEN date '1970-01-01' ELSE date_trunc('month', current_date)::date END;
BEGIN
  IF auth.uid() IS NULL OR p_amount < 1 OR p_metric NOT IN ('pdf_exports', 'ocr_scans', 'storage_mb') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_USAGE_INPUT_INVALID';
  END IF;
  IF NOT public.erp_can_access_scope(v_restaurant_id, NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_REQUIRED',
      DETAIL = jsonb_build_object('metric', p_metric, 'billing_route', '/billing')::text;
  END IF;
  SELECT * INTO v_subscription FROM public.subscriptions WHERE restaurant_id = v_restaurant_id FOR UPDATE;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_subscription.plan AND is_active = true;
  v_limit := CASE p_metric WHEN 'pdf_exports' THEN v_plan.max_pdf_exports WHEN 'ocr_scans' THEN v_plan.max_ocr_scans ELSE v_plan.max_storage_mb END;
  SELECT coalesce(used_amount, 0) INTO v_used FROM public.subscription_usage
    WHERE subscription_id = v_subscription.id AND metric = p_metric AND period_start = v_period FOR UPDATE;
  IF coalesce(v_used, 0) + p_amount > v_limit THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_LIMIT_REACHED',
      DETAIL = jsonb_build_object('metric', p_metric, 'used', coalesce(v_used, 0), 'limit', v_limit, 'billing_route', '/billing')::text;
  END IF;
  INSERT INTO public.subscription_usage (subscription_id, restaurant_id, metric, period_start, used_amount)
  VALUES (v_subscription.id, v_restaurant_id, p_metric, v_period, p_amount)
  ON CONFLICT (subscription_id, metric, period_start) DO UPDATE
    SET used_amount = public.subscription_usage.used_amount + EXCLUDED.used_amount, updated_at = now()
  RETURNING used_amount INTO v_used;
  RETURN jsonb_build_object('metric', p_metric, 'used', v_used, 'limit', v_limit, 'period_start', v_period);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_enforce_subscription_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_restaurant_id uuid := CASE WHEN TG_TABLE_NAME = 'restaurants' THEN NEW.id ELSE NEW.restaurant_id END;
  v_subscription public.subscriptions;
  v_plan public.subscription_plans;
  v_limit integer;
  v_count bigint;
BEGIN
  IF TG_TABLE_NAME = 'restaurants' THEN
    SELECT s.* INTO v_subscription
    FROM public.restaurants r JOIN public.subscriptions s ON s.restaurant_id = r.id
    WHERE lower(coalesce(r.created_by, '')) = lower(coalesce(NEW.created_by, ''))
    ORDER BY s.updated_at DESC, s.created_date DESC NULLS LAST LIMIT 1;
    IF v_subscription.id IS NULL OR v_subscription.subscription_status = 'TRIAL' THEN RETURN NEW; END IF;
    IF v_subscription.subscription_status NOT IN ('FREE', 'ACTIVE') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_REQUIRED', DETAIL = '{"resource":"restaurants","billing_route":"/billing"}';
    END IF;
    SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_subscription.plan;
    SELECT count(*) INTO v_count FROM public.restaurants WHERE lower(coalesce(created_by, '')) = lower(coalesce(NEW.created_by, ''));
    IF v_count >= v_plan.max_restaurants THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_LIMIT_REACHED', DETAIL = jsonb_build_object('resource', 'restaurants', 'limit', v_plan.max_restaurants, 'billing_route', '/billing')::text;
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO v_subscription FROM public.subscriptions WHERE restaurant_id = v_restaurant_id;
  IF v_subscription.id IS NULL THEN RETURN NEW; END IF;
  IF NOT public.erp_subscription_has_erp_access(v_restaurant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_REQUIRED', DETAIL = jsonb_build_object('billing_route', '/billing')::text;
  END IF;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_subscription.plan;
  IF TG_TABLE_NAME = 'branches' THEN
    v_limit := v_plan.max_branches;
    SELECT count(*) INTO v_count FROM public.branches WHERE restaurant_id = v_restaurant_id AND coalesce(is_active, true);
  ELSIF TG_TABLE_NAME = 'employees' THEN
    v_limit := v_plan.max_employees;
    SELECT count(*) INTO v_count FROM public.employees WHERE restaurant_id = v_restaurant_id;
  ELSIF TG_TABLE_NAME = 'erp_memberships' THEN
    v_limit := v_plan.max_users;
    SELECT count(*) INTO v_count FROM public.erp_memberships WHERE restaurant_id = v_restaurant_id AND status IN ('approved', 'pending');
  ELSE
    RETURN NEW;
  END IF;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_LIMIT_REACHED',
      DETAIL = jsonb_build_object('resource', TG_TABLE_NAME, 'limit', v_limit, 'billing_route', '/billing')::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_capacity_branches ON public.branches;
CREATE TRIGGER subscription_capacity_branches BEFORE INSERT ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.erp_enforce_subscription_capacity();
DROP TRIGGER IF EXISTS subscription_capacity_employees ON public.employees;
CREATE TRIGGER subscription_capacity_employees BEFORE INSERT ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.erp_enforce_subscription_capacity();
DROP TRIGGER IF EXISTS subscription_capacity_memberships ON public.erp_memberships;
CREATE TRIGGER subscription_capacity_memberships BEFORE INSERT ON public.erp_memberships
FOR EACH ROW EXECUTE FUNCTION public.erp_enforce_subscription_capacity();

CREATE OR REPLACE FUNCTION public.select_free_subscription_plan()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_restaurant_id uuid := public.auth_user_restaurant_id();
  v_subscription public.subscriptions;
BEGIN
  IF auth.uid() IS NULL OR v_restaurant_id IS NULL OR NOT public.erp_is_approved_owner(v_restaurant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILLING_OWNER_REQUIRED';
  END IF;
  SELECT * INTO v_subscription FROM public.subscriptions WHERE restaurant_id = v_restaurant_id FOR UPDATE;
  UPDATE public.subscriptions
  SET plan = 'free', subscription_status = 'FREE', current_period_start = current_date,
      current_period_end = NULL, cancel_at_period_end = false, canceled_at = NULL, updated_at = now()
  WHERE id = v_subscription.id;
  INSERT INTO public.subscription_events (subscription_id, restaurant_id, event_type, previous_status, next_status, source, actor_user_id)
  VALUES (v_subscription.id, v_restaurant_id, 'free_plan_selected', v_subscription.subscription_status, 'FREE', 'owner_action', auth.uid());
  RETURN jsonb_build_object('subscription_id', v_subscription.id, 'plan_id', 'free', 'status', 'FREE');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_subscription_checkout_intent(p_plan_id text)
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
  IF auth.uid() IS NULL OR v_restaurant_id IS NULL OR NOT public.erp_is_approved_owner(v_restaurant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILLING_OWNER_REQUIRED';
  END IF;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id AND is_active AND is_public;
  IF v_plan.id IS NULL OR v_plan.monthly_price_cents <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PAID_PLAN_REQUIRED';
  END IF;
  SELECT * INTO v_subscription FROM public.subscriptions WHERE restaurant_id = v_restaurant_id FOR UPDATE;
  IF v_subscription.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_NOT_FOUND'; END IF;
  INSERT INTO public.subscription_payments (
    subscription_id, restaurant_id, plan_id, provider, status, amount_cents, currency, metadata
  ) VALUES (
    v_subscription.id, v_restaurant_id, v_plan.id, 'stripe', 'pending', v_plan.monthly_price_cents, 'usd',
    jsonb_build_object('requested_by', auth.uid(), 'original_price_cents', v_plan.original_price_cents,
      'discount_percent', v_plan.discount_percent, 'discount_active', v_plan.discount_active)
  ) RETURNING * INTO v_payment;
  RETURN jsonb_build_object('payment_id', v_payment.id, 'plan_id', v_plan.id, 'amount_cents', v_plan.monthly_price_cents,
    'original_price_cents', v_plan.original_price_cents, 'discount_percent', v_plan.discount_percent,
    'discount_active', v_plan.discount_active, 'currency', 'usd');
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_subscription_at_period_end()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_restaurant_id uuid := public.auth_user_restaurant_id();
  v_subscription public.subscriptions;
BEGIN
  IF auth.uid() IS NULL OR v_restaurant_id IS NULL OR NOT public.erp_is_approved_owner(v_restaurant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILLING_OWNER_REQUIRED';
  END IF;
  SELECT * INTO v_subscription FROM public.subscriptions WHERE restaurant_id = v_restaurant_id FOR UPDATE;
  IF v_subscription.id IS NULL OR v_subscription.subscription_status <> 'ACTIVE' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTIVE_SUBSCRIPTION_REQUIRED';
  END IF;
  UPDATE public.subscriptions SET cancel_at_period_end = true, updated_at = now() WHERE id = v_subscription.id;
  INSERT INTO public.subscription_events (subscription_id, restaurant_id, event_type, previous_status, next_status, source, actor_user_id)
  VALUES (v_subscription.id, v_restaurant_id, 'cancellation_requested', 'ACTIVE', 'ACTIVE', 'owner_action', auth.uid());
  RETURN jsonb_build_object('subscription_id', v_subscription.id, 'status', 'ACTIVE', 'cancel_at_period_end', true, 'effective_date', v_subscription.current_period_end);
END;
$$;

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
BEGIN
  IF auth.uid() IS NULL OR v_restaurant_id IS NULL OR NOT public.erp_is_approved_owner(v_restaurant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILLING_OWNER_REQUIRED';
  END IF;
  SELECT * INTO v_subscription FROM public.subscriptions WHERE restaurant_id = v_restaurant_id FOR UPDATE;
  IF v_subscription.id IS NULL OR v_subscription.subscription_status <> 'ACTIVE' OR NOT v_subscription.cancel_at_period_end THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RENEWAL_NOT_AVAILABLE';
  END IF;
  UPDATE public.subscriptions SET cancel_at_period_end = false, canceled_at = NULL, updated_at = now() WHERE id = v_subscription.id;
  INSERT INTO public.subscription_events (subscription_id, restaurant_id, event_type, previous_status, next_status, source, actor_user_id)
  VALUES (v_subscription.id, v_restaurant_id, 'cancellation_reversed', 'ACTIVE', 'ACTIVE', 'owner_action', auth.uid());
  RETURN jsonb_build_object('subscription_id', v_subscription.id, 'status', 'ACTIVE', 'cancel_at_period_end', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_subscription_provider_event(
  p_provider text, p_event_id text, p_event_type text, p_payment_id uuid,
  p_subscription_id text DEFAULT NULL, p_checkout_session_id text DEFAULT NULL,
  p_invoice_id text DEFAULT NULL, p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL, p_amount_cents integer DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
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
  v_next_status text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROVIDER_EVENT_SERVER_ONLY';
  END IF;
  IF coalesce(btrim(p_event_id), '') = '' OR p_payment_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROVIDER_EVENT_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM public.subscription_events WHERE provider_event_id = p_event_id) THEN
    RETURN jsonb_build_object('processed', false, 'reason', 'duplicate_event');
  END IF;
  SELECT * INTO v_payment FROM public.subscription_payments WHERE id = p_payment_id FOR UPDATE;
  SELECT * INTO v_subscription FROM public.subscriptions WHERE id = v_payment.subscription_id FOR UPDATE;
  v_next_status := CASE
    WHEN p_event_type IN ('checkout.session.completed', 'invoice.paid') THEN 'ACTIVE'
    WHEN p_event_type IN ('invoice.payment_failed', 'payment_intent.payment_failed') THEN 'PAST_DUE'
    WHEN p_event_type = 'customer.subscription.deleted' THEN 'CANCELED'
    ELSE v_subscription.subscription_status
  END;
  UPDATE public.subscription_payments SET
    provider = p_provider, provider_event_id = p_event_id,
    provider_checkout_session_id = coalesce(p_checkout_session_id, provider_checkout_session_id),
    provider_invoice_id = coalesce(p_invoice_id, provider_invoice_id),
    provider_subscription_id = coalesce(p_subscription_id, provider_subscription_id),
    status = CASE WHEN v_next_status = 'ACTIVE' THEN 'paid' WHEN v_next_status = 'PAST_DUE' THEN 'failed' WHEN v_next_status = 'CANCELED' THEN 'canceled' ELSE status END,
    amount_cents = coalesce(p_amount_cents, amount_cents), period_start = coalesce(p_period_start, period_start),
    period_end = coalesce(p_period_end, period_end), paid_at = CASE WHEN v_next_status = 'ACTIVE' THEN now() ELSE paid_at END,
    failed_at = CASE WHEN v_next_status = 'PAST_DUE' THEN now() ELSE failed_at END,
    metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb), updated_at = now()
  WHERE id = v_payment.id;
  IF p_event_type = 'customer.subscription.updated' AND coalesce((p_metadata ->> 'cancel_at_period_end')::boolean, false) THEN
    UPDATE public.subscriptions SET cancel_at_period_end = true, updated_at = now() WHERE id = v_subscription.id;
  ELSE
    UPDATE public.subscriptions SET
      plan = CASE WHEN v_next_status = 'ACTIVE' THEN v_payment.plan_id ELSE plan END,
      subscription_status = v_next_status, payment_provider = p_provider,
      stripe_subscription_id = coalesce(p_subscription_id, stripe_subscription_id),
      current_period_start = coalesce(p_period_start, current_period_start, current_date),
      current_period_end = coalesce(p_period_end, current_period_end, current_date + 30),
      last_payment_at = CASE WHEN v_next_status = 'ACTIVE' THEN now() ELSE last_payment_at END,
      cancel_at_period_end = false,
      canceled_at = CASE WHEN v_next_status = 'CANCELED' THEN now() ELSE canceled_at END,
      updated_at = now()
    WHERE id = v_subscription.id;
  END IF;
  INSERT INTO public.subscription_events (
    subscription_id, restaurant_id, event_type, previous_status, next_status, source, provider_event_id, details
  ) VALUES (
    v_subscription.id, v_subscription.restaurant_id, p_event_type, v_subscription.subscription_status,
    CASE WHEN p_event_type = 'customer.subscription.updated' AND coalesce((p_metadata ->> 'cancel_at_period_end')::boolean, false)
      THEN v_subscription.subscription_status ELSE v_next_status END,
    p_provider, p_event_id, coalesce(p_metadata, '{}'::jsonb)
  );
  RETURN jsonb_build_object('processed', true, 'status', v_next_status, 'payment_id', v_payment.id);
END;
$$;

COMMIT;
