BEGIN;

-- Keep the canonical branches table as the only branch source while retaining
-- optional dashboard quick-create details that may be completed later.
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS manager_name text;

-- Keep the existing subscription capacity trigger behavior, including the
-- onboarding-only owner seed exception, while treating -1 as an unlimited plan.
CREATE OR REPLACE FUNCTION public.erp_enforce_subscription_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_subscription public.subscriptions;
  v_plan public.subscription_plans;
  v_resource text;
  v_limit integer;
  v_count bigint;
  v_is_auth_owner_seed boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'restaurants' THEN
    SELECT s.* INTO v_subscription
    FROM public.restaurants restaurant
    JOIN public.subscriptions s ON s.restaurant_id = restaurant.id
    WHERE lower(coalesce(restaurant.created_by, '')) = lower(coalesce(NEW.created_by, ''))
    ORDER BY s.updated_at DESC, s.created_date DESC NULLS LAST
    LIMIT 1;

    IF v_subscription.id IS NULL OR v_subscription.subscription_status = 'TRIAL' THEN
      RETURN NEW;
    END IF;
    IF v_subscription.subscription_status NOT IN ('FREE', 'ACTIVE') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_REQUIRED',
        DETAIL = jsonb_build_object('resource', 'restaurants', 'billing_route', '/billing')::text;
    END IF;

    SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_subscription.plan AND is_active = true;
    SELECT count(*) INTO v_count FROM public.restaurants WHERE lower(coalesce(created_by, '')) = lower(coalesce(NEW.created_by, ''));
    IF v_plan.max_restaurants >= 0 AND v_count >= v_plan.max_restaurants THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_LIMIT_REACHED',
        DETAIL = jsonb_build_object('resource', 'restaurants', 'used', v_count, 'limit', v_plan.max_restaurants, 'plan_id', v_plan.id, 'billing_route', '/billing', 'upgrade_message', 'Upgrade Plan to create another restaurant.')::text;
    END IF;
    RETURN NEW;
  END IF;

  BEGIN
    v_restaurant_id := nullif(NEW.restaurant_id::text, '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_SCOPE_INVALID',
      DETAIL = jsonb_build_object('resource', TG_TABLE_NAME, 'billing_route', '/billing')::text;
  END;

  IF TG_TABLE_NAME = 'employees' AND v_restaurant_id IS NULL THEN
    v_restaurant_id := public.auth_user_restaurant_id();
    IF v_restaurant_id IS NOT NULL THEN NEW.restaurant_id := v_restaurant_id; END IF;
  END IF;
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_SCOPE_REQUIRED',
      DETAIL = jsonb_build_object('resource', TG_TABLE_NAME, 'billing_route', '/billing')::text;
  END IF;

  IF TG_TABLE_NAME = 'branches' AND auth.uid() IS NULL AND pg_trigger_depth() > 1 AND NEW.branch_key LIKE 'main-%' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.restaurants restaurant
      WHERE restaurant.id = v_restaurant_id
        AND restaurant.tenant_id = NEW.tenant_id
        AND lower(coalesce(restaurant.created_by, '')) = lower(coalesce(NEW.created_by, ''))
    ) INTO v_is_auth_owner_seed;
  END IF;

  IF TG_TABLE_NAME IN ('branches', 'employees')
     AND NOT v_is_auth_owner_seed
     AND (auth.uid() IS NULL OR NOT public.erp_can_access_scope(v_restaurant_id, NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_SCOPE_DENIED',
      DETAIL = jsonb_build_object('resource', TG_TABLE_NAME, 'billing_route', '/billing')::text;
  END IF;

  SELECT * INTO v_subscription FROM public.subscriptions WHERE restaurant_id = v_restaurant_id FOR UPDATE;
  IF v_subscription.id IS NULL OR NOT public.erp_subscription_has_erp_access(v_restaurant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_REQUIRED',
      DETAIL = jsonb_build_object('resource', TG_TABLE_NAME, 'billing_route', '/billing')::text;
  END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_subscription.plan AND is_active = true;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_PLAN_INVALID'; END IF;

  IF TG_TABLE_NAME = 'branches' THEN
    v_resource := 'branches';
    v_limit := v_plan.max_branches;
    SELECT count(*) INTO v_count FROM public.branches WHERE restaurant_id = v_restaurant_id AND coalesce(is_active, true);
  ELSIF TG_TABLE_NAME = 'employees' THEN
    v_resource := 'employees';
    v_limit := v_plan.max_employees;
    SELECT count(*) INTO v_count FROM public.employees WHERE restaurant_id::text = v_restaurant_id::text;
  ELSIF TG_TABLE_NAME = 'erp_memberships' THEN
    v_resource := 'users';
    v_limit := v_plan.max_users;
    SELECT count(*) INTO v_count FROM public.erp_memberships WHERE restaurant_id = v_restaurant_id AND status IN ('approved', 'pending');
  ELSE
    RETURN NEW;
  END IF;

  IF v_limit >= 0 AND v_count >= v_limit THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_LIMIT_REACHED',
      DETAIL = jsonb_build_object('resource', v_resource, 'used', v_count, 'limit', v_limit, 'plan_id', v_plan.id, 'billing_route', '/billing', 'upgrade_message', format('Upgrade Plan to add more %s.', v_resource))::text;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.erp_quick_create_branch(
  p_restaurant_id uuid,
  p_name text,
  p_branch_code text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_manager_name text DEFAULT NULL,
  p_is_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $function$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_branch_key text;
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_manager_name text := nullif(btrim(coalesce(p_manager_name, '')), '');
  v_actor_email text := nullif(auth.jwt() ->> 'email', '');
  v_branch public.branches;
  v_limit integer;
  v_usage bigint;
  v_plan_id text;
BEGIN
  IF auth.uid() IS NULL OR p_restaurant_id IS NULL OR NOT public.erp_is_approved_owner(p_restaurant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANCH_CREATE_NOT_AUTHORIZED';
  END IF;

  IF v_name = '' OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANCH_NAME_INVALID';
  END IF;
  IF char_length(coalesce(v_address, '')) > 500
     OR char_length(coalesce(v_city, '')) > 120
     OR char_length(coalesce(v_phone, '')) > 64
     OR char_length(coalesce(v_manager_name, '')) > 160 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANCH_DETAILS_INVALID';
  END IF;

  v_branch_key := lower(regexp_replace(coalesce(nullif(btrim(p_branch_code), ''), v_name), '[^a-zA-Z0-9]+', '_', 'g'));
  v_branch_key := trim(both '_' FROM v_branch_key);
  IF v_branch_key = '' THEN
    v_branch_key := 'branch_' || substr(md5(v_name || clock_timestamp()::text), 1, 12);
  END IF;
  IF char_length(v_branch_key) > 80 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANCH_CODE_INVALID';
  END IF;

  -- Serialize same-name / same-code attempts within a tenant so duplicate checks
  -- remain correct even when two dashboard requests arrive at the same moment.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text || ':' || lower(v_name), 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text || ':' || v_branch_key, 0));

  IF EXISTS (
    SELECT 1 FROM public.branches
    WHERE restaurant_id = p_restaurant_id
      AND lower(btrim(name)) = lower(v_name)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANCH_NAME_ALREADY_EXISTS';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.branches
    WHERE restaurant_id = p_restaurant_id
      AND lower(branch_key) = lower(v_branch_key)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANCH_CODE_ALREADY_EXISTS';
  END IF;

  SELECT plan INTO v_plan_id
  FROM public.subscriptions
  WHERE restaurant_id = p_restaurant_id
  FOR UPDATE;
  SELECT max_branches INTO v_limit
  FROM public.subscription_plans
  WHERE id = v_plan_id
    AND is_active = true;
  SELECT count(*) INTO v_usage
  FROM public.branches
  WHERE restaurant_id = p_restaurant_id
    AND coalesce(is_active, true);

  IF v_plan_id IS NULL OR v_limit IS NULL OR NOT public.erp_subscription_has_erp_access(p_restaurant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_REQUIRED',
      DETAIL = jsonb_build_object('resource', 'branches', 'billing_route', '/billing')::text;
  END IF;
  IF v_limit >= 0 AND v_usage >= v_limit THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_LIMIT_REACHED',
      DETAIL = jsonb_build_object(
        'resource', 'branches',
        'used', v_usage,
        'limit', v_limit,
        'plan_id', v_plan_id,
        'billing_route', '/billing',
        'upgrade_message', format('Your plan allows up to %s branches. Please upgrade your plan to add another branch.', v_limit)
      )::text;
  END IF;

  INSERT INTO public.branches (
    restaurant_id, branch_key, name, location, city, phone, manager_name,
    is_active, created_by, created_date, updated_date
  ) VALUES (
    p_restaurant_id, v_branch_key, v_name, v_address, v_city, v_phone, v_manager_name,
    coalesce(p_is_active, true), coalesce(v_actor_email, auth.uid()::text), now(), now()
  )
  RETURNING * INTO v_branch;

  INSERT INTO public.audit_logs (
    restaurant_id, action, entity_type, entity_id, old_values, new_values, created_by, created_date
  ) VALUES (
    p_restaurant_id,
    'branch_created',
    'branch',
    v_branch.id::text,
    '{}'::jsonb,
    jsonb_build_object(
      'branch_id', v_branch.id,
      'branch_key', v_branch.branch_key,
      'name', v_branch.name,
      'is_active', v_branch.is_active,
      'created_by_user_id', auth.uid(),
      'created_by_email', v_actor_email
    ),
    coalesce(v_actor_email, auth.uid()::text),
    now()
  );

  RETURN jsonb_build_object(
    'id', v_branch.id,
    'restaurant_id', v_branch.restaurant_id,
    'branch_key', v_branch.branch_key,
    'name', v_branch.name,
    'location', v_branch.location,
    'city', v_branch.city,
    'phone', v_branch.phone,
    'manager_name', v_branch.manager_name,
    'is_active', v_branch.is_active,
    'usage', jsonb_build_object('branches', v_usage + CASE WHEN coalesce(v_branch.is_active, true) THEN 1 ELSE 0 END),
    'limit', v_limit
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.erp_quick_create_branch(uuid, text, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_quick_create_branch(uuid, text, text, text, text, text, text, boolean) TO authenticated;

COMMIT;
