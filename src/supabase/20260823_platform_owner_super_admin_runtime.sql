BEGIN;

-- Extend the existing canonical subscription catalog instead of introducing a parallel plan system.
ALTER TABLE public.subscription_plans
  DROP CONSTRAINT IF EXISTS subscription_plans_id_check,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS yearly_price_cents integer,
  ADD COLUMN IF NOT EXISTS entitlement_limits jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.subscription_plans
  DROP CONSTRAINT IF EXISTS subscription_plans_yearly_price_cents_check,
  DROP CONSTRAINT IF EXISTS subscription_plans_currency_check,
  DROP CONSTRAINT IF EXISTS subscription_plans_entitlement_limits_object,
  DROP CONSTRAINT IF EXISTS subscription_plans_max_branches_check,
  DROP CONSTRAINT IF EXISTS subscription_plans_max_employees_check,
  DROP CONSTRAINT IF EXISTS subscription_plans_max_users_check,
  DROP CONSTRAINT IF EXISTS subscription_plans_max_storage_mb_check,
  DROP CONSTRAINT IF EXISTS subscription_plans_max_pdf_exports_check,
  DROP CONSTRAINT IF EXISTS subscription_plans_max_ocr_scans_check;

ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_yearly_price_cents_check CHECK (yearly_price_cents IS NULL OR yearly_price_cents >= 0),
  ADD CONSTRAINT subscription_plans_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT subscription_plans_entitlement_limits_object CHECK (jsonb_typeof(entitlement_limits) = 'object'),
  ADD CONSTRAINT subscription_plans_max_branches_check CHECK (max_branches >= -1),
  ADD CONSTRAINT subscription_plans_max_employees_check CHECK (max_employees >= -1),
  ADD CONSTRAINT subscription_plans_max_users_check CHECK (max_users >= -1),
  ADD CONSTRAINT subscription_plans_max_storage_mb_check CHECK (max_storage_mb >= -1),
  ADD CONSTRAINT subscription_plans_max_pdf_exports_check CHECK (max_pdf_exports >= -1),
  ADD CONSTRAINT subscription_plans_max_ocr_scans_check CHECK (max_ocr_scans >= -1);

ALTER TABLE public.subscription_feature_overrides
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS limit_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.subscription_feature_overrides
  DROP CONSTRAINT IF EXISTS subscription_feature_overrides_limit_overrides_object,
  DROP CONSTRAINT IF EXISTS subscription_feature_overrides_window_check;

ALTER TABLE public.subscription_feature_overrides
  ADD CONSTRAINT subscription_feature_overrides_limit_overrides_object CHECK (jsonb_typeof(limit_overrides) = 'object'),
  ADD CONSTRAINT subscription_feature_overrides_window_check CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at);

ALTER TABLE public.subscription_usage
  DROP CONSTRAINT IF EXISTS subscription_usage_metric_check;
ALTER TABLE public.subscription_usage
  ADD CONSTRAINT subscription_usage_metric_check CHECK (metric = ANY (ARRAY[
    'pdf_exports', 'ocr_scans', 'storage_mb', 'ai_requests', 'api_requests', 'reports', 'transactions'
  ]));

CREATE TABLE IF NOT EXISTS public.platform_modules (
  feature_key text PRIMARY KEY CHECK (feature_key ~ '^[a-z0-9_]{2,80}$'),
  display_name text NOT NULL,
  category text NOT NULL,
  description text,
  is_globally_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
INSERT INTO public.platform_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_modules, public.platform_settings FROM anon, authenticated;

INSERT INTO public.platform_modules(feature_key, display_name, category, sort_order)
VALUES
  ('dashboard', 'Dashboard', 'Overview', 10),
  ('sales', 'Sales', 'Operations', 20),
  ('sales_invoices', 'Sales Invoices', 'Operations', 30),
  ('purchases', 'Purchases', 'Operations', 40),
  ('purchase_orders', 'Purchase Orders', 'Operations', 50),
  ('expenses', 'Expenses', 'Finance', 60),
  ('cash_register', 'Cash Register', 'Finance', 70),
  ('treasury', 'Treasury', 'Finance', 80),
  ('suppliers', 'Suppliers', 'Operations', 90),
  ('customers', 'Customers', 'Operations', 100),
  ('debt_receivables', 'Debt and Receivables', 'Finance', 110),
  ('inventory', 'Inventory', 'Operations', 120),
  ('stock', 'Stock', 'Operations', 130),
  ('transfers', 'Transfers', 'Operations', 140),
  ('waste', 'Waste', 'Operations', 150),
  ('products', 'Products', 'Operations', 160),
  ('branches', 'Branches', 'Administration', 170),
  ('employees', 'Employees', 'Administration', 180),
  ('reports', 'Reports', 'Analytics', 190),
  ('sales_analytics', 'Sales Analytics', 'Analytics', 200),
  ('executive_dashboard', 'Executive Dashboard', 'Analytics', 210),
  ('ceo_dashboard', 'CEO Dashboard', 'Analytics', 220),
  ('ai_copilot', 'AI Copilot', 'AI', 230),
  ('kpk', 'KPK', 'AI', 240),
  ('notifications', 'Notifications', 'Administration', 250),
  ('settings', 'Settings', 'Administration', 260)
ON CONFLICT (feature_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.platform_owner_plan_limit(p_plan public.subscription_plans, p_resource text)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_override text;
BEGIN
  v_override := p_plan.entitlement_limits ->> lower(coalesce(p_resource, ''));
  IF v_override ~ '^-?[0-9]+$' THEN
    RETURN v_override::bigint;
  END IF;
  RETURN CASE lower(coalesce(p_resource, ''))
    WHEN 'branches' THEN p_plan.max_branches
    WHEN 'employees' THEN p_plan.max_employees
    WHEN 'users' THEN p_plan.max_users
    WHEN 'storage_mb' THEN p_plan.max_storage_mb
    WHEN 'pdf_exports' THEN p_plan.max_pdf_exports
    WHEN 'ocr_scans' THEN p_plan.max_ocr_scans
    ELSE -1
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_subscription_can_use_feature(p_feature text, p_restaurant_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE
  v_restaurant_id uuid := coalesce(p_restaurant_id, public.auth_user_restaurant_id());
  v_feature text := lower(btrim(coalesce(p_feature, '')));
  v_override boolean;
  v_globally_enabled boolean;
BEGIN
  IF v_feature = '' OR v_restaurant_id IS NULL THEN RETURN false; END IF;
  SELECT is_globally_enabled INTO v_globally_enabled FROM public.platform_modules WHERE feature_key = v_feature;
  IF FOUND AND NOT v_globally_enabled THEN RETURN false; END IF;
  SELECT enabled INTO v_override
  FROM public.subscription_feature_overrides
  WHERE restaurant_id = v_restaurant_id
    AND feature_key = v_feature
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now());
  IF FOUND THEN RETURN v_override; END IF;
  RETURN coalesce((public.erp_subscription_snapshot(v_restaurant_id) -> 'feature_flags') ? 'all', false)
      OR coalesce((public.erp_subscription_snapshot(v_restaurant_id) -> 'feature_flags') ? v_feature, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_subscription_limit(p_restaurant_id uuid, p_resource text)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_subscription public.subscriptions; v_plan public.subscription_plans; v_override text;
BEGIN
  SELECT * INTO v_subscription FROM public.subscriptions WHERE restaurant_id = p_restaurant_id ORDER BY updated_at DESC LIMIT 1;
  IF v_subscription.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_REQUIRED'; END IF;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_subscription.plan AND is_active;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_PLAN_INVALID'; END IF;
  SELECT limit_overrides ->> lower(coalesce(p_resource, '')) INTO v_override
  FROM public.subscription_feature_overrides
  WHERE restaurant_id = p_restaurant_id AND feature_key = '__limits__'
    AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now());
  IF v_override ~ '^-?[0-9]+$' THEN RETURN v_override::bigint; END IF;
  RETURN public.platform_owner_plan_limit(v_plan, p_resource);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_consume_subscription_usage(p_metric text, p_amount bigint DEFAULT 1, p_restaurant_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE
  v_restaurant_id uuid := coalesce(p_restaurant_id, public.auth_user_restaurant_id());
  v_subscription public.subscriptions;
  v_limit bigint;
  v_used bigint;
  v_metric text := lower(btrim(coalesce(p_metric, '')));
  v_period date := CASE WHEN lower(coalesce(p_metric, '')) = 'storage_mb' THEN date '1970-01-01' ELSE date_trunc('month', current_date)::date END;
BEGIN
  IF auth.uid() IS NULL OR p_amount < 1 OR v_metric NOT IN ('pdf_exports', 'ocr_scans', 'storage_mb', 'ai_requests', 'api_requests', 'reports', 'transactions') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_USAGE_INPUT_INVALID';
  END IF;
  IF NOT public.erp_can_access_scope(v_restaurant_id, NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_REQUIRED', DETAIL = jsonb_build_object('metric', v_metric, 'billing_route', '/billing')::text;
  END IF;
  SELECT * INTO v_subscription FROM public.subscriptions WHERE restaurant_id = v_restaurant_id FOR UPDATE;
  v_limit := public.erp_subscription_limit(v_restaurant_id, v_metric);
  SELECT coalesce(used_amount, 0) INTO v_used FROM public.subscription_usage
    WHERE subscription_id = v_subscription.id AND metric = v_metric AND period_start = v_period FOR UPDATE;
  IF v_limit >= 0 AND coalesce(v_used, 0) + p_amount > v_limit THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_LIMIT_REACHED',
      DETAIL = jsonb_build_object('metric', v_metric, 'used', coalesce(v_used, 0), 'limit', v_limit, 'billing_route', '/billing')::text;
  END IF;
  INSERT INTO public.subscription_usage (subscription_id, restaurant_id, metric, period_start, used_amount)
  VALUES (v_subscription.id, v_restaurant_id, v_metric, v_period, p_amount)
  ON CONFLICT (subscription_id, metric, period_start) DO UPDATE
    SET used_amount = public.subscription_usage.used_amount + EXCLUDED.used_amount, updated_at = now()
  RETURNING used_amount INTO v_used;
  RETURN jsonb_build_object('metric', v_metric, 'used', v_used, 'limit', v_limit, 'period_start', v_period);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_enforce_subscription_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE
  v_restaurant_id uuid := CASE WHEN TG_TABLE_NAME = 'restaurants' THEN NEW.id ELSE NEW.restaurant_id END;
  v_resource text;
  v_limit bigint;
  v_count bigint;
BEGIN
  IF TG_TABLE_NAME = 'restaurants' THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR NOT public.erp_can_access_scope(v_restaurant_id, NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_SCOPE_DENIED', DETAIL = jsonb_build_object('resource', TG_TABLE_NAME, 'billing_route', '/billing')::text;
  END IF;
  IF NOT public.erp_subscription_has_erp_access(v_restaurant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_REQUIRED', DETAIL = jsonb_build_object('resource', TG_TABLE_NAME, 'billing_route', '/billing')::text;
  END IF;
  v_resource := CASE TG_TABLE_NAME
    WHEN 'branches' THEN 'branches' WHEN 'employees' THEN 'employees' WHEN 'erp_memberships' THEN 'users'
    WHEN 'products' THEN 'products' WHEN 'suppliers' THEN 'suppliers' WHEN 'customers' THEN 'customers'
    ELSE NULL END;
  IF v_resource IS NULL THEN RETURN NEW; END IF;
  v_limit := public.erp_subscription_limit(v_restaurant_id, v_resource);
  IF v_limit < 0 THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'branches' THEN
    SELECT count(*) INTO v_count FROM public.branches WHERE restaurant_id = v_restaurant_id AND coalesce(is_active, true);
  ELSIF TG_TABLE_NAME = 'employees' THEN
    SELECT count(*) INTO v_count FROM public.employees WHERE restaurant_id::text = v_restaurant_id::text;
  ELSIF TG_TABLE_NAME = 'erp_memberships' THEN
    SELECT count(*) INTO v_count FROM public.erp_memberships WHERE restaurant_id = v_restaurant_id AND status IN ('approved', 'pending');
  ELSIF TG_TABLE_NAME = 'products' THEN
    SELECT count(*) INTO v_count FROM public.products WHERE restaurant_id = v_restaurant_id;
  ELSIF TG_TABLE_NAME = 'suppliers' THEN
    SELECT count(*) INTO v_count FROM public.suppliers WHERE restaurant_id = v_restaurant_id;
  ELSE
    SELECT count(*) INTO v_count FROM public.customers WHERE restaurant_id = v_restaurant_id;
  END IF;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_LIMIT_REACHED',
      DETAIL = jsonb_build_object('resource', v_resource, 'used', v_count, 'limit', v_limit, 'billing_route', '/billing', 'upgrade_message', format('Your current plan allows up to %s %s. Upgrade your plan or contact the platform administrator.', v_limit, v_resource))::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_capacity_products ON public.products;
CREATE TRIGGER subscription_capacity_products BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.erp_enforce_subscription_capacity();
DROP TRIGGER IF EXISTS subscription_capacity_suppliers ON public.suppliers;
CREATE TRIGGER subscription_capacity_suppliers BEFORE INSERT ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.erp_enforce_subscription_capacity();
DROP TRIGGER IF EXISTS subscription_capacity_customers ON public.customers;
CREATE TRIGGER subscription_capacity_customers BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.erp_enforce_subscription_capacity();

CREATE OR REPLACE FUNCTION public.platform_owner_list_modules()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  PERFORM public.platform_owner_assert();
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(module) ORDER BY module.category, module.sort_order, module.feature_key), '[]'::jsonb) FROM public.platform_modules module);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_save_module(p_feature_key text, p_display_name text, p_category text, p_enabled boolean, p_description text DEFAULT NULL, p_sort_order integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_key text := lower(btrim(coalesce(p_feature_key, ''))); v_module public.platform_modules;
BEGIN
  PERFORM public.platform_owner_assert();
  IF v_key !~ '^[a-z0-9_]{2,80}$' OR nullif(btrim(coalesce(p_display_name, '')), '') IS NULL OR nullif(btrim(coalesce(p_category, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_MODULE_INPUT_INVALID';
  END IF;
  INSERT INTO public.platform_modules(feature_key, display_name, category, description, is_globally_enabled, sort_order, updated_by)
  VALUES (v_key, btrim(p_display_name), btrim(p_category), nullif(btrim(p_description), ''), coalesce(p_enabled, true), coalesce(p_sort_order, 0), auth.uid())
  ON CONFLICT (feature_key) DO UPDATE SET display_name = EXCLUDED.display_name, category = EXCLUDED.category, description = EXCLUDED.description, is_globally_enabled = EXCLUDED.is_globally_enabled, sort_order = EXCLUDED.sort_order, updated_at = now(), updated_by = auth.uid()
  RETURNING * INTO v_module;
  PERFORM public.platform_owner_log('module_updated', 'module', v_key, NULL, jsonb_build_object('globally_enabled', v_module.is_globally_enabled));
  RETURN to_jsonb(v_module);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_upsert_plan(
  p_plan_id text, p_display_name text, p_description text, p_monthly_price_cents integer,
  p_yearly_price_cents integer, p_currency text, p_billing_period_months smallint,
  p_trial_days smallint, p_original_price_cents integer, p_feature_flags jsonb,
  p_limits jsonb, p_is_active boolean, p_is_public boolean, p_sort_order integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE
  v_id text := lower(btrim(coalesce(p_plan_id, ''))); v_plan public.subscription_plans;
  v_price integer := coalesce(p_monthly_price_cents, 0); v_original integer := coalesce(p_original_price_cents, v_price);
  v_yearly integer := coalesce(p_yearly_price_cents, 0); v_currency text := upper(btrim(coalesce(p_currency, 'USD')));
  v_discount integer;
BEGIN
  PERFORM public.platform_owner_assert();
  IF v_id !~ '^[a-z0-9][a-z0-9_-]{1,62}$' OR nullif(btrim(coalesce(p_display_name, '')), '') IS NULL OR v_price < 0 OR v_original < v_price OR v_yearly < 0 OR v_currency !~ '^[A-Z]{3}$' OR coalesce(p_billing_period_months, 1) NOT BETWEEN 1 AND 12 OR coalesce(p_trial_days, 0) NOT BETWEEN 0 AND 90 OR jsonb_typeof(coalesce(p_feature_flags, '[]'::jsonb)) <> 'array' OR jsonb_typeof(coalesce(p_limits, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_PLAN_INPUT_INVALID';
  END IF;
  v_discount := CASE WHEN v_original > v_price AND v_original > 0 THEN round(((v_original - v_price)::numeric / v_original::numeric) * 100)::integer ELSE 0 END;
  INSERT INTO public.subscription_plans(id, display_name, description, monthly_price_cents, yearly_price_cents, original_price_cents, currency, billing_period_months, trial_days, discount_active, discount_percent, discount_label, feature_flags, entitlement_limits, max_restaurants, max_branches, max_employees, max_users, max_storage_mb, max_pdf_exports, max_ocr_scans, is_active, is_public, sort_order)
  VALUES (v_id, btrim(p_display_name), nullif(btrim(p_description), ''), v_price, v_yearly, v_original, v_currency, coalesce(p_billing_period_months, 1), coalesce(p_trial_days, 0), v_discount > 0, v_discount, CASE WHEN v_discount > 0 THEN v_discount::text || '% OFF' ELSE NULL END, coalesce(p_feature_flags, '[]'::jsonb), coalesce(p_limits, '{}'::jsonb), greatest(1, coalesce((p_limits ->> 'max_restaurants')::integer, 1)), coalesce((p_limits ->> 'branches')::integer, coalesce((p_limits ->> 'max_branches')::integer, 1)), coalesce((p_limits ->> 'employees')::integer, coalesce((p_limits ->> 'max_employees')::integer, 1)), coalesce((p_limits ->> 'users')::integer, coalesce((p_limits ->> 'max_users')::integer, 1)), coalesce((p_limits ->> 'storage_mb')::integer, coalesce((p_limits ->> 'max_storage_mb')::integer, 0)), coalesce((p_limits ->> 'pdf_exports')::integer, coalesce((p_limits ->> 'max_pdf_exports')::integer, 0)), coalesce((p_limits ->> 'ocr_scans')::integer, coalesce((p_limits ->> 'max_ocr_scans')::integer, 0)), coalesce(p_is_active, true), coalesce(p_is_public, true), coalesce(p_sort_order, 0))
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, monthly_price_cents = EXCLUDED.monthly_price_cents, yearly_price_cents = EXCLUDED.yearly_price_cents, original_price_cents = EXCLUDED.original_price_cents, currency = EXCLUDED.currency, billing_period_months = EXCLUDED.billing_period_months, trial_days = EXCLUDED.trial_days, discount_active = EXCLUDED.discount_active, discount_percent = EXCLUDED.discount_percent, discount_label = EXCLUDED.discount_label, feature_flags = EXCLUDED.feature_flags, entitlement_limits = EXCLUDED.entitlement_limits, max_branches = EXCLUDED.max_branches, max_employees = EXCLUDED.max_employees, max_users = EXCLUDED.max_users, max_storage_mb = EXCLUDED.max_storage_mb, max_pdf_exports = EXCLUDED.max_pdf_exports, max_ocr_scans = EXCLUDED.max_ocr_scans, is_active = EXCLUDED.is_active, is_public = EXCLUDED.is_public, sort_order = EXCLUDED.sort_order, updated_at = now()
  RETURNING * INTO v_plan;
  PERFORM public.platform_owner_log('plan_upserted', 'plan', v_id, NULL, jsonb_build_object('price_cents', v_price, 'active', v_plan.is_active, 'public', v_plan.is_public));
  RETURN to_jsonb(v_plan);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_set_tenant_feature_override(
  p_restaurant_id uuid, p_feature_key text, p_enabled boolean, p_reason text DEFAULT NULL,
  p_limit_overrides jsonb DEFAULT '{}'::jsonb, p_starts_at timestamptz DEFAULT NULL, p_ends_at timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_key text := lower(btrim(coalesce(p_feature_key, ''))); v_override public.subscription_feature_overrides;
BEGIN
  PERFORM public.platform_owner_assert();
  IF p_restaurant_id IS NULL OR v_key !~ '^[a-z0-9_]{2,80}$' OR jsonb_typeof(coalesce(p_limit_overrides, '{}'::jsonb)) <> 'object' OR (p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL AND p_ends_at <= p_starts_at) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_FEATURE_OVERRIDE_INVALID';
  END IF;
  INSERT INTO public.subscription_feature_overrides(restaurant_id, feature_key, enabled, reason, limit_overrides, starts_at, ends_at, updated_by)
  VALUES (p_restaurant_id, v_key, coalesce(p_enabled, false), nullif(btrim(p_reason), ''), coalesce(p_limit_overrides, '{}'::jsonb), p_starts_at, p_ends_at, auth.uid())
  ON CONFLICT (restaurant_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled, reason = EXCLUDED.reason, limit_overrides = EXCLUDED.limit_overrides, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, updated_at = now(), updated_by = auth.uid()
  RETURNING * INTO v_override;
  PERFORM public.platform_owner_log('tenant_feature_override_set', 'feature_override', v_key, p_restaurant_id, jsonb_build_object('enabled', v_override.enabled, 'limits', v_override.limit_overrides));
  RETURN to_jsonb(v_override);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_save_settings(p_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
DECLARE v_settings public.platform_settings;
BEGIN
  PERFORM public.platform_owner_assert();
  IF jsonb_typeof(coalesce(p_settings, '{}'::jsonb)) <> 'object' THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_SETTINGS_INPUT_INVALID'; END IF;
  UPDATE public.platform_settings SET settings = coalesce(p_settings, '{}'::jsonb), updated_at = now(), updated_by = auth.uid() WHERE id = true RETURNING * INTO v_settings;
  PERFORM public.platform_owner_log('platform_settings_updated', 'platform_settings', 'global');
  RETURN to_jsonb(v_settings);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_control_center()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET row_security = off AS $$
BEGIN
  PERFORM public.platform_owner_assert();
  RETURN jsonb_build_object(
    'dashboard', public.platform_owner_dashboard(),
    'modules', public.platform_owner_list_modules(),
    'plans', (SELECT coalesce(jsonb_agg(to_jsonb(plan) ORDER BY plan.sort_order, plan.display_name), '[]'::jsonb) FROM public.subscription_plans plan),
    'settings', (SELECT settings FROM public.platform_settings WHERE id = true),
    'usage', (SELECT coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb) FROM (
      SELECT metric, sum(used_amount)::bigint AS used FROM public.subscription_usage WHERE period_start >= date_trunc('month', current_date)::date GROUP BY metric ORDER BY metric
    ) row_data)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_owner_plan_limit(public.subscription_plans, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_subscription_limit(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_list_modules() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_save_module(text, text, text, boolean, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_upsert_plan(text, text, text, integer, integer, text, smallint, smallint, integer, jsonb, jsonb, boolean, boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_set_tenant_feature_override(uuid, text, boolean, text, jsonb, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_save_settings(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_control_center() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.erp_subscription_can_use_feature(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_subscription_limit(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_consume_subscription_usage(text, bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_list_modules() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_save_module(text, text, text, boolean, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_upsert_plan(text, text, text, integer, integer, text, smallint, smallint, integer, jsonb, jsonb, boolean, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_set_tenant_feature_override(uuid, text, boolean, text, jsonb, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_save_settings(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_control_center() TO authenticated;

COMMIT;
