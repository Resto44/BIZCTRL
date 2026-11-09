-- Restores the restricted Driver ERP portal identity after the historical
-- portal retirement. No existing member, driver, invoice or sales is changed.
-- Invitation only: never provision driver identities from public signup.
ALTER TABLE public.erp_memberships DROP CONSTRAINT erp_memberships_role_check;
ALTER TABLE public.erp_memberships ADD CONSTRAINT erp_memberships_role_check
 CHECK (role IN ('owner','manager','employee','supplier','driver'));

ALTER TABLE public.erp_invitations DROP CONSTRAINT erp_invitations_role_v2_check;
ALTER TABLE public.erp_invitations ADD CONSTRAINT erp_invitations_role_v2_check
 CHECK (role IN ('manager','employee','supplier','driver'));

CREATE OR REPLACE FUNCTION public.erp_default_permissions(p_role text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case lower(coalesce(p_role, ''))
    when 'owner' then '{"all":true}'::jsonb
    when 'manager' then '{
      "viewDashboard":true,"viewSales":true,"uploadSales":true,"viewOrders":true,
      "viewPurchases":true,"createPurchases":true,"viewPurchaseOrders":true,
      "viewInvoices":true,"viewInventory":true,"viewProducts":true,
      "viewSuppliers":true,"viewExpenses":true,"createExpenses":true,"viewTreasury":true,
      "viewEmployees":true,"viewAttendance":true,"recordAttendance":true,
      "viewSchedule":true,"viewTasks":true,"viewDelivery":true,
      "updateDelivery":true,"viewAlerts":true,"viewSupport":true
    }'::jsonb
    when 'employee' then '{
      "viewDashboard":true,"viewAttendance":true,"recordAttendance":true,
      "viewSchedule":true,"viewTasks":true,"viewProfile":true,"viewSupport":true
    }'::jsonb
    when 'driver' then '{"viewDashboard":true,"viewProfile":true,"viewSupport":true}'::jsonb
    when 'supplier' then '{
      "viewDashboard":true,"viewPurchaseOrders":true,"updatePurchaseOrders":true,
      "viewInvoices":true,"createInvoices":true,"viewPayments":true,
      "viewProducts":true,"viewProfile":true,"viewSupport":true
    }'::jsonb
    else '{}'::jsonb
  end;
$function$;
CREATE OR REPLACE FUNCTION public.erp_get_session_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_member public.erp_memberships;
  v_profile public.profiles;
  v_branch public.branches;
  v_role_permissions jsonb := '{}'::jsonb;
  v_effective jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select * into v_member
  from public.erp_memberships
  where user_id = v_uid
  order by updated_at desc
  limit 1;

  if v_member.id is null then
    raise exception using errcode = '42501', message = 'ERP_MEMBERSHIP_REQUIRED';
  end if;
  if v_member.status <> 'approved' then
    raise exception using errcode = '42501', message = 'ERP_MEMBERSHIP_' || upper(v_member.status);
  end if;
  if v_member.role not in ('owner','manager','employee','supplier','driver') then
    raise exception using errcode = '42501', message = 'ERP_ROLE_NOT_SUPPORTED';
  end if;
  if v_member.restaurant_id is null then
    raise exception using errcode = '42501', message = 'ERP_STORE_SCOPE_REQUIRED';
  end if;
  if v_member.role <> 'owner' and v_member.branch_id is null then
    raise exception using errcode = '42501', message = 'ERP_BRANCH_SCOPE_REQUIRED';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  select * into v_branch from public.branches where id = v_member.branch_id;
  select permissions into v_role_permissions
  from public.erp_role_permissions
  where restaurant_id = v_member.restaurant_id and role = v_member.role
  limit 1;

  v_effective := public.erp_effective_permissions(
    v_member.role,
    v_member.permissions,
    coalesce(v_role_permissions, '{}'::jsonb)
  );

  update public.erp_memberships
  set last_login_at = now()
  where id = v_member.id
    and (last_login_at is null or last_login_at < now() - interval '15 minutes');

  return jsonb_build_object(
    'id', v_uid,
    'membership_id', v_member.id,
    'email', coalesce(v_member.email, v_profile.email),
    'full_name', coalesce(nullif(v_member.full_name, ''), v_profile.full_name, ''),
    'phone', coalesce(v_member.phone, v_profile.phone),
    'role', v_member.role,
    'status', v_member.status,
    'restaurant_id', v_member.restaurant_id,
    'organization_id', v_member.restaurant_id,
    'branch_id', v_member.branch_id,
    'branch', v_branch.branch_key,
    'branch_name', v_branch.name,
    'data_scope', case when v_member.role = 'owner' then 'all_branches' else 'assigned_branch' end,
    'selected_branch_ids', case when v_member.role = 'owner' then v_member.selected_branch_ids else array[]::uuid[] end,
    'linked_entity_id', v_member.linked_entity_id,
    'permissions', v_effective,
    'effective_permissions', v_effective,
    'home_path', case v_member.role
      when 'owner' then '/owner-command-center'
      when 'manager' then '/manager-dashboard'
      when 'employee' then '/employee-dashboard'
      when 'supplier' then '/supplier-portal'
      when 'driver' then '/driver-dashboard'
    end
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.activate_erp_invitation(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET row_security TO 'off'
AS $function$
DECLARE
  invitation public.erp_invitations;
  v_hash text;
  v_email text;
  v_phone text;
  v_email_confirmed_at timestamptz;
  v_phone_confirmed_at timestamptz;
  v_permissions jsonb;
  v_linked_entity uuid;
  v_dashboard text;
  v_branch_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in or verify your identity before activating an invitation';
  END IF;
  IF NULLIF(btrim(coalesce(p_token, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A valid invitation token is required';
  END IF;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  SELECT * INTO invitation
  FROM public.erp_invitations
  WHERE token_hash = v_hash
  FOR UPDATE;

  IF invitation.id IS NULL THEN
    RAISE EXCEPTION 'This invitation is invalid';
  END IF;
  IF invitation.status = 'activated' THEN
    RAISE EXCEPTION 'This invitation has already been used';
  END IF;
  IF invitation.status = 'revoked' THEN
    RAISE EXCEPTION 'This invitation has been revoked';
  END IF;
  IF invitation.status = 'expired' OR invitation.expires_at <= now() THEN
    RAISE EXCEPTION 'This invitation has expired';
  END IF;

  SELECT u.email, u.phone, u.email_confirmed_at, u.phone_confirmed_at
  INTO v_email, v_phone, v_email_confirmed_at, v_phone_confirmed_at
  FROM auth.users u
  WHERE u.id = auth.uid();

  IF invitation.email IS NOT NULL THEN
    IF lower(coalesce(v_email, '')) <> lower(invitation.email) THEN
      RAISE EXCEPTION 'Sign in with the email address that received this invitation';
    END IF;
    IF v_email_confirmed_at IS NULL THEN
      RAISE EXCEPTION 'Verify your email address before activating this invitation';
    END IF;
  END IF;

  IF invitation.phone IS NOT NULL THEN
    IF regexp_replace(coalesce(v_phone, ''), '[^0-9]', '', 'g') <> invitation.phone THEN
      RAISE EXCEPTION 'Sign in with the phone number that received this invitation';
    END IF;
    IF v_phone_confirmed_at IS NULL THEN
      RAISE EXCEPTION 'Verify your phone number before activating this invitation';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid())
     OR EXISTS (SELECT 1 FROM public.erp_memberships WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'This identity already has an ERP account';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    JOIN public.restaurants r ON r.id = b.restaurant_id
    WHERE b.id = invitation.branch_id
      AND b.restaurant_id = invitation.restaurant_id
      AND coalesce(b.is_active, true)
      AND coalesce(r.is_active, true)
  ) THEN
    RAISE EXCEPTION 'The organization or branch assigned by this invitation is no longer active';
  END IF;

  SELECT public.erp_default_permissions(invitation.role)
      || coalesce(rp.permissions, '{}'::jsonb)
      || coalesce(invitation.permissions, '{}'::jsonb)
  INTO v_permissions
  FROM (SELECT 1) AS seed
  LEFT JOIN public.erp_role_permissions rp
    ON rp.restaurant_id = invitation.restaurant_id AND rp.role = invitation.role;

  -- Fetch branch name for sessionStorage pre-population on the client
  SELECT name INTO v_branch_name FROM public.branches WHERE id = invitation.branch_id;

  INSERT INTO public.profiles (
    id, email, full_name, role, phone, approval_status, restaurant_id, organization_id,
    branch_id, branch, tenant_id, permissions, is_active, approved_at, approved_by, created_by
  ) VALUES (
    auth.uid(), v_email, invitation.full_name, invitation.role, coalesce(v_phone, invitation.phone),
    'approved', invitation.restaurant_id, invitation.restaurant_id, invitation.branch_id,
    (SELECT branch_key FROM public.branches WHERE id = invitation.branch_id),
    invitation.restaurant_id::text, v_permissions, true, now(), invitation.created_by,
    coalesce(v_email, invitation.phone)
  );

  INSERT INTO public.erp_memberships (
    user_id, email, full_name, phone, role, status, restaurant_id, branch_id,
    permissions, registration_data, approved_at, approved_by
  ) VALUES (
    auth.uid(), v_email, invitation.full_name, coalesce(v_phone, invitation.phone), invitation.role,
    'approved', invitation.restaurant_id, invitation.branch_id, v_permissions,
    jsonb_build_object('onboarding', 'owner_invitation', 'invitation_id', invitation.id),
    now(), invitation.created_by
  );

  INSERT INTO public.branch_assignments (
    user_id, restaurant_id, organization_id, branch_id, role, assigned_by, is_primary, active
  ) VALUES (
    auth.uid(), invitation.restaurant_id, invitation.restaurant_id, invitation.branch_id,
    invitation.role, invitation.created_by, true, true
  )
  ON CONFLICT (user_id, branch_id) DO UPDATE
    SET restaurant_id  = EXCLUDED.restaurant_id,
        organization_id = EXCLUDED.organization_id,
        role           = EXCLUDED.role,
        assigned_by    = EXCLUDED.assigned_by,
        is_primary     = true,
        active         = true,
        updated_at     = now();

  -- Preserve the legacy operational records expected by driver and supplier pages.
  IF invitation.role = 'supplier' THEN
    SELECT s.id INTO v_linked_entity
    FROM public.suppliers s
    WHERE s.restaurant_id = invitation.restaurant_id
      AND (
        (v_email IS NOT NULL AND lower(coalesce(s.email, '')) = lower(v_email))
        OR (invitation.phone IS NOT NULL AND regexp_replace(coalesce(s.phone, ''), '[^0-9]', '', 'g') = invitation.phone)
      )
    LIMIT 1;

    IF v_linked_entity IS NULL THEN
      INSERT INTO public.suppliers (
        restaurant_id, branch_id, tenant_id, name, contact_person, phone, email, status, created_by
      ) VALUES (
        invitation.restaurant_id, invitation.branch_id, invitation.restaurant_id::text,
        invitation.full_name, invitation.full_name, coalesce(v_phone, invitation.phone), v_email,
        true, coalesce(v_email, invitation.phone)
      ) RETURNING id INTO v_linked_entity;
    END IF;
  ELSIF invitation.role = 'driver' THEN
    -- Do not silently bind a driver identity to a different branch.
    IF EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.restaurant_id = invitation.restaurant_id
        AND d.branch_id IS DISTINCT FROM invitation.branch_id
        AND (
          (v_email IS NOT NULL AND lower(coalesce(d.email, '')) = lower(v_email))
          OR (invitation.phone IS NOT NULL
              AND regexp_replace(coalesce(d.phone, ''), '[^0-9]', '', 'g') = invitation.phone)
        )
    ) THEN
      RAISE EXCEPTION 'Driver identity belongs to another branch; Owner must reconcile the driver directory first';
    END IF;
    SELECT d.id INTO v_linked_entity
    FROM public.drivers d
    WHERE d.restaurant_id = invitation.restaurant_id
      AND d.branch_id = invitation.branch_id
      AND COALESCE(d.is_active, true)
      AND (
        (v_email IS NOT NULL AND lower(coalesce(d.email, '')) = lower(v_email))
        OR (invitation.phone IS NOT NULL AND regexp_replace(coalesce(d.phone, ''), '[^0-9]', '', 'g') = invitation.phone)
      )
    ORDER BY d.created_date DESC
    LIMIT 1;

    IF v_linked_entity IS NULL THEN
      INSERT INTO public.drivers (
        restaurant_id, branch_id, tenant_id, full_name, phone, email,
        status, is_active, created_by
      ) VALUES (
        invitation.restaurant_id, invitation.branch_id, invitation.restaurant_id::text,
        invitation.full_name, coalesce(v_phone, invitation.phone), v_email,
        'active', true, coalesce(v_email, invitation.phone)
      ) RETURNING id INTO v_linked_entity;
    END IF;
  END IF;

  IF v_linked_entity IS NOT NULL THEN
    UPDATE public.erp_memberships
    SET linked_entity_id = v_linked_entity, updated_at = now()
    WHERE user_id = auth.uid();
  END IF;

  UPDATE public.erp_invitations
  SET status = 'activated', activated_by = auth.uid(), activated_at = now()
  WHERE id = invitation.id;

  INSERT INTO public.audit_logs (
    restaurant_id, branch_id, tenant_id, user_email, user_name,
    action, entity_type, entity_id, old_values, new_values, created_by
  ) VALUES (
    invitation.restaurant_id, invitation.branch_id, invitation.restaurant_id::text,
    v_email, invitation.full_name, 'invitation_activated', 'erp_invitation', invitation.id::text,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'activated', 'role', invitation.role, 'user_id', auth.uid()),
    coalesce(v_email, invitation.phone)
  );

  v_dashboard := CASE invitation.role
    WHEN 'general_manager' THEN '/gm-dashboard'
    WHEN 'manager'         THEN '/manager-dashboard'
    WHEN 'employee'        THEN '/employee-dashboard'
    WHEN 'driver'          THEN '/driver-dashboard'
    WHEN 'kitchen'         THEN '/kitchen-dashboard'
    WHEN 'supplier'        THEN '/supplier-portal'
    ELSE '/erp-login'
  END;

  RETURN jsonb_build_object(
    'status',        'activated',
    'role',          invitation.role,
    'dashboard',     v_dashboard,
    'organization_id', invitation.restaurant_id,
    'branch_id',     invitation.branch_id,
    'branch_name',   v_branch_name
  );
END;
$function$;
