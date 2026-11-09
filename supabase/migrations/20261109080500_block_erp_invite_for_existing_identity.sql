-- Prevent new owner invitations for ERP-linked identities that cannot
-- activate under the existing single-workspace account model.
-- No preexisting invitations or account data are changed.
-- Existing Owner authorization, rate limits, capacity and role controls are unchanged.

CREATE OR REPLACE FUNCTION public.create_erp_invitation(p_role text, p_restaurant_id uuid, p_branch_id uuid, p_full_name text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_permissions jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET row_security TO 'off'
AS $function$
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

  -- Existing organization members cannot be re-onboarded into a second
  -- tenant/role with this project's current one-identity ERP architecture.
  -- This check runs only after verifying the authenticated Owner caller.
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.users u
    WHERE lower(btrim(u.email)) = v_email
      AND (
        EXISTS (SELECT 1 FROM public.erp_memberships m WHERE m.user_id = u.id)
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',
      MESSAGE='INVITEE_ALREADY_HAS_ERP_ACCOUNT_USE_NEW_EMAIL';
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
$function$
