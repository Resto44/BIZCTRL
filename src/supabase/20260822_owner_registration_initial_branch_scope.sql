BEGIN;

-- Owner registration runs inside auth.users -> handle_new_user(), where auth.uid()
-- is intentionally null. Permit only that nested, metadata-bound initial branch seed.
-- All browser-side branch and employee inserts keep the existing tenant-scope and
-- subscription-capacity enforcement.
CREATE OR REPLACE FUNCTION public.erp_enforce_subscription_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
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
    SELECT count(*) INTO v_count
    FROM public.restaurants
    WHERE lower(coalesce(created_by, '')) = lower(coalesce(NEW.created_by, ''));
    IF v_count >= v_plan.max_restaurants THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_LIMIT_REACHED',
        DETAIL = jsonb_build_object(
          'resource', 'restaurants', 'used', v_count, 'limit', v_plan.max_restaurants,
          'plan_id', v_plan.id, 'billing_route', '/billing',
          'upgrade_message', 'Upgrade Plan to create another restaurant.'
        )::text;
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
    IF v_restaurant_id IS NOT NULL THEN
      NEW.restaurant_id := v_restaurant_id;
    END IF;
  END IF;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_SCOPE_REQUIRED',
      DETAIL = jsonb_build_object('resource', TG_TABLE_NAME, 'billing_route', '/billing')::text;
  END IF;

  -- This narrow exception covers only the first branch created by the trusted
  -- auth.users provisioning trigger. The parent restaurant must already exist,
  -- and its tenant and owner-email metadata must exactly match the branch.
  IF TG_TABLE_NAME = 'branches'
     AND auth.uid() IS NULL
     AND pg_trigger_depth() > 1
     AND NEW.branch_key LIKE 'main-%' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.restaurants restaurant
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

  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE restaurant_id = v_restaurant_id
  FOR UPDATE;
  IF v_subscription.id IS NULL OR NOT public.erp_subscription_has_erp_access(v_restaurant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_REQUIRED',
      DETAIL = jsonb_build_object('resource', TG_TABLE_NAME, 'billing_route', '/billing')::text;
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = v_subscription.plan
    AND is_active = true;
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_PLAN_INVALID';
  END IF;

  IF TG_TABLE_NAME = 'branches' THEN
    v_resource := 'branches';
    v_limit := v_plan.max_branches;
    SELECT count(*) INTO v_count
    FROM public.branches
    WHERE restaurant_id = v_restaurant_id
      AND coalesce(is_active, true);
  ELSIF TG_TABLE_NAME = 'employees' THEN
    v_resource := 'employees';
    v_limit := v_plan.max_employees;
    SELECT count(*) INTO v_count
    FROM public.employees
    WHERE restaurant_id::text = v_restaurant_id::text;
  ELSIF TG_TABLE_NAME = 'erp_memberships' THEN
    v_resource := 'users';
    v_limit := v_plan.max_users;
    SELECT count(*) INTO v_count
    FROM public.erp_memberships
    WHERE restaurant_id = v_restaurant_id
      AND status IN ('approved', 'pending');
  ELSE
    RETURN NEW;
  END IF;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_LIMIT_REACHED',
      DETAIL = jsonb_build_object(
        'resource', v_resource,
        'used', v_count,
        'limit', v_limit,
        'plan_id', v_plan.id,
        'billing_route', '/billing',
        'upgrade_message', format('Upgrade Plan to add more %s.', v_resource)
      )::text;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
