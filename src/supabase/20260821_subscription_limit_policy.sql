BEGIN;

-- Canonical paid-plan capacity policy. Keep the existing identifiers because they
-- are referenced by live subscriptions, payments, events, and Paddle metadata.
-- Do not update paddle_price_id, provider credentials, checkout configuration, or
-- historical payment records in this migration.
UPDATE public.subscription_plans
SET
  monthly_price_cents = CASE id
    WHEN 'starter_20' THEN 1000
    WHEN 'growth_40' THEN 2000
    WHEN 'enterprise_100' THEN 5000
    ELSE monthly_price_cents
  END,
  max_users = CASE id
    WHEN 'starter_20' THEN 3
    WHEN 'growth_40' THEN 10
    WHEN 'enterprise_100' THEN 30
    ELSE max_users
  END,
  max_branches = CASE id
    WHEN 'starter_20' THEN 1
    WHEN 'growth_40' THEN 3
    WHEN 'enterprise_100' THEN 10
    ELSE max_branches
  END,
  max_employees = CASE id
    WHEN 'starter_20' THEN 5
    WHEN 'growth_40' THEN 15
    WHEN 'enterprise_100' THEN 50
    ELSE max_employees
  END,
  updated_at = now()
WHERE id IN ('starter_20', 'growth_40', 'enterprise_100');

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.subscription_plans
    WHERE id IN ('starter_20', 'growth_40', 'enterprise_100')
  ) <> 3 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_PLAN_CATALOG_INCOMPLETE';
  END IF;
END;
$$;

-- Central, server-derived resource usage for subscription display and preflight
-- checks. Pending invitations reserve user capacity so an account cannot bypass a
-- user limit by creating excess invitation records. Membership activation remains
-- protected by the insert trigger below for concurrent or direct insert attempts.
CREATE OR REPLACE FUNCTION public.erp_subscription_capacity_state(
  p_restaurant_id uuid,
  p_include_pending_invitations boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_subscription public.subscriptions;
  v_plan public.subscription_plans;
  v_branch_count bigint := 0;
  v_employee_count bigint := 0;
  v_membership_count bigint := 0;
  v_pending_invitation_count bigint := 0;
  v_user_count bigint := 0;
  v_exceeded jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_restaurant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_SCOPE_DENIED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.erp_memberships membership
    WHERE membership.user_id = auth.uid()
      AND membership.restaurant_id = p_restaurant_id
      AND membership.status = 'approved'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_SCOPE_DENIED';
  END IF;

  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE restaurant_id = p_restaurant_id
  ORDER BY updated_at DESC, created_date DESC NULLS LAST
  LIMIT 1;
  IF v_subscription.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_NOT_FOUND';
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = v_subscription.plan
    AND is_active = true;
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_PLAN_INVALID';
  END IF;

  SELECT count(*) INTO v_branch_count
  FROM public.branches
  WHERE restaurant_id = p_restaurant_id
    AND coalesce(is_active, true);

  SELECT count(*) INTO v_employee_count
  FROM public.employees
  WHERE restaurant_id::text = p_restaurant_id::text;

  SELECT count(*) INTO v_membership_count
  FROM public.erp_memberships
  WHERE restaurant_id = p_restaurant_id
    AND status IN ('approved', 'pending');

  IF p_include_pending_invitations THEN
    SELECT count(*) INTO v_pending_invitation_count
    FROM public.erp_invitations
    WHERE restaurant_id = p_restaurant_id
      AND status = 'pending'
      AND expires_at > now();
  END IF;
  v_user_count := v_membership_count + v_pending_invitation_count;

  IF v_branch_count > v_plan.max_branches THEN
    v_exceeded := v_exceeded || jsonb_build_array(jsonb_build_object(
      'resource', 'branches', 'used', v_branch_count, 'limit', v_plan.max_branches
    ));
  END IF;
  IF v_employee_count > v_plan.max_employees THEN
    v_exceeded := v_exceeded || jsonb_build_array(jsonb_build_object(
      'resource', 'employees', 'used', v_employee_count, 'limit', v_plan.max_employees
    ));
  END IF;
  IF v_user_count > v_plan.max_users THEN
    v_exceeded := v_exceeded || jsonb_build_array(jsonb_build_object(
      'resource', 'users', 'used', v_user_count, 'limit', v_plan.max_users
    ));
  END IF;

  RETURN jsonb_build_object(
    'plan_id', v_plan.id,
    'limits', jsonb_build_object(
      'branches', v_plan.max_branches,
      'employees', v_plan.max_employees,
      'users', v_plan.max_users
    ),
    'usage', jsonb_build_object(
      'branches', v_branch_count,
      'employees', v_employee_count,
      'users', v_user_count,
      'membership_users', v_membership_count,
      'pending_invitations', v_pending_invitation_count
    ),
    'exceeded_limits', v_exceeded,
    'is_within_capacity', jsonb_array_length(v_exceeded) = 0
  );
END;
$$;

-- Database-enforced capacity guard. The plan catalog is the only capacity source.
-- Existing records are never deleted during a downgrade: if a count is already
-- above a new plan ceiling, only subsequent insertions are rejected.
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

  -- The legacy generic employee client did not always send restaurant_id. Fill it
  -- only from the authenticated user's tenant, then enforce the same server rule.
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

  -- Resource insertions from the browser must be in the caller's permitted tenant.
  -- Membership activation is intentionally excluded because a valid invitation is
  -- converted into the first membership during onboarding.
  IF TG_TABLE_NAME IN ('branches', 'employees')
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

DROP TRIGGER IF EXISTS subscription_capacity_branches ON public.branches;
CREATE TRIGGER subscription_capacity_branches
BEFORE INSERT ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.erp_enforce_subscription_capacity();

DROP TRIGGER IF EXISTS subscription_capacity_employees ON public.employees;
CREATE TRIGGER subscription_capacity_employees
BEFORE INSERT ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.erp_enforce_subscription_capacity();

DROP TRIGGER IF EXISTS subscription_capacity_memberships ON public.erp_memberships;
CREATE TRIGGER subscription_capacity_memberships
BEFORE INSERT ON public.erp_memberships
FOR EACH ROW EXECUTE FUNCTION public.erp_enforce_subscription_capacity();

-- Invite issuance reserves a user slot before sending an activation link. This is
-- synchronized per organization to prevent concurrent API requests from exceeding
-- the plan through pending invitation records.
CREATE OR REPLACE FUNCTION public.create_erp_invitation(
  p_role text,
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_full_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_permissions jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
SET row_security = off
AS $$
DECLARE
  actor public.erp_memberships;
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_name text := btrim(coalesce(p_full_name, ''));
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_token text;
  v_hash text;
  v_invitation public.erp_invitations;
  v_capacity jsonb;
  v_used bigint;
  v_limit integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to create an invitation';
  END IF;

  SELECT * INTO actor
  FROM public.erp_memberships
  WHERE user_id = auth.uid()
    AND role = 'owner'
    AND status = 'approved'
    AND restaurant_id = p_restaurant_id
  LIMIT 1;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION 'Only the approved owner of the selected organization can create staff invitations';
  END IF;

  IF v_role NOT IN ('general_manager', 'manager', 'employee', 'supplier', 'driver', 'kitchen') THEN
    RAISE EXCEPTION 'The selected role cannot be provisioned by invitation';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'A staff member name is required';
  END IF;
  IF (v_email IS NULL) = (v_phone IS NULL) THEN
    RAISE EXCEPTION 'Provide exactly one identity channel: either an email address or a phone number';
  END IF;
  IF v_email IS NOT NULL AND v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'A valid email address is required';
  END IF;
  IF v_phone IS NOT NULL AND length(v_phone) < 8 THEN
    RAISE EXCEPTION 'A valid phone number is required';
  END IF;
  IF jsonb_typeof(coalesce(p_permissions, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Permissions must be a JSON object';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.branches branch
    WHERE branch.id = p_branch_id
      AND branch.restaurant_id = p_restaurant_id
      AND coalesce(branch.is_active, true)
  ) THEN
    RAISE EXCEPTION 'An active branch in the selected organization is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_restaurant_id::text));

  -- Reissuing an invitation to the same recipient reuses its capacity reservation.
  UPDATE public.erp_invitations
  SET status = 'revoked', revoked_by = auth.uid(), revoked_at = now()
  WHERE restaurant_id = p_restaurant_id
    AND status = 'pending'
    AND (
      (v_email IS NOT NULL AND lower(email) = v_email)
      OR (v_phone IS NOT NULL AND phone = v_phone)
    );

  v_capacity := public.erp_subscription_capacity_state(p_restaurant_id, true);
  v_used := coalesce((v_capacity -> 'usage' ->> 'users')::bigint, 0);
  v_limit := coalesce((v_capacity -> 'limits' ->> 'users')::integer, 0);
  IF v_used >= v_limit THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_LIMIT_REACHED',
      DETAIL = jsonb_build_object(
        'resource', 'users',
        'used', v_used,
        'limit', v_limit,
        'plan_id', v_capacity ->> 'plan_id',
        'billing_route', '/billing',
        'upgrade_message', 'Upgrade Plan to invite another user.'
      )::text;
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.erp_invitations (
    token_hash, email, phone, full_name, role, restaurant_id, branch_id,
    permissions, status, expires_at, created_by
  ) VALUES (
    v_hash, v_email, v_phone, v_name, v_role, p_restaurant_id, p_branch_id,
    coalesce(p_permissions, '{}'::jsonb), 'pending', now() + interval '7 days', auth.uid()
  )
  RETURNING * INTO v_invitation;

  INSERT INTO public.audit_logs (
    restaurant_id, branch_id, tenant_id, user_email, user_name,
    action, entity_type, entity_id, old_values, new_values, created_by
  ) VALUES (
    p_restaurant_id, p_branch_id, p_restaurant_id::text, actor.email, actor.full_name,
    'invitation_created', 'erp_invitation', v_invitation.id::text, '{}'::jsonb,
    jsonb_build_object(
      'role', v_role, 'email', v_email, 'phone', v_phone,
      'expires_at', v_invitation.expires_at
    ), actor.email
  );

  RETURN jsonb_build_object(
    'invitation_id', v_invitation.id,
    'token', v_token,
    'expires_at', v_invitation.expires_at,
    'status', v_invitation.status
  );
END;
$$;

-- Direct invitation-table writes must obey the same user capacity as the
-- owner RPC. This closes an API bypass while retaining the membership insert
-- trigger as the final activation-time concurrency safeguard.
CREATE OR REPLACE FUNCTION public.erp_enforce_subscription_invitation_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_capacity jsonb;
  v_used bigint;
  v_limit integer;
BEGIN
  IF NEW.restaurant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_SCOPE_REQUIRED',
      DETAIL = jsonb_build_object('resource', 'users', 'billing_route', '/billing')::text;
  END IF;
  IF auth.uid() IS NULL OR NOT public.erp_is_approved_owner(NEW.restaurant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_SCOPE_DENIED',
      DETAIL = jsonb_build_object('resource', 'users', 'billing_route', '/billing')::text;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.restaurant_id::text));
  v_capacity := public.erp_subscription_capacity_state(NEW.restaurant_id, true);
  v_used := coalesce((v_capacity -> 'usage' ->> 'users')::bigint, 0);
  v_limit := coalesce((v_capacity -> 'limits' ->> 'users')::integer, 0);
  IF v_used >= v_limit THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_LIMIT_REACHED',
      DETAIL = jsonb_build_object(
        'resource', 'users',
        'used', v_used,
        'limit', v_limit,
        'plan_id', v_capacity ->> 'plan_id',
        'billing_route', '/billing',
        'upgrade_message', 'Upgrade Plan to invite another user.'
      )::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_capacity_invitations ON public.erp_invitations;
CREATE TRIGGER subscription_capacity_invitations
BEFORE INSERT ON public.erp_invitations
FOR EACH ROW EXECUTE FUNCTION public.erp_enforce_subscription_invitation_capacity();

-- Supersede the latest Paddle runtime snapshot while preserving its payment and
-- subscription fields. The browser receives server-derived resource counts and
-- overages but never decides entitlement from those values.
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
    'payment_provider', v_subscription.payment_provider,
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
    'feature_flags', CASE WHEN v_status = 'TRIAL' THEN '[]'::jsonb ELSE coalesce(v_plan.feature_flags, '[]'::jsonb) END,
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

REVOKE ALL ON FUNCTION public.erp_enforce_subscription_invitation_capacity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_subscription_capacity_state(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erp_subscription_capacity_state(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.erp_subscription_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erp_subscription_snapshot(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_erp_invitation(text, uuid, uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_erp_invitation(text, uuid, uuid, text, text, text, jsonb) TO authenticated;

COMMIT;
