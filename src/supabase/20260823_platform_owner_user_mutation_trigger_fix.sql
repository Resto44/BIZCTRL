BEGIN;

-- Platform Owner control-plane routines are authorized by platform_owner_assert(),
-- not by an organization-level erp_memberships record. Preserve the normal owner
-- approval guard while allowing only a transaction-local, server-authorized mutation.
CREATE OR REPLACE FUNCTION public.erp_protect_profile_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NEW.role IS DISTINCT FROM OLD.role OR
    NEW.approval_status IS DISTINCT FROM OLD.approval_status OR
    NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id OR
    NEW.branch_id IS DISTINCT FROM OLD.branch_id OR
    NEW.permissions IS DISTINCT FROM OLD.permissions
  ) THEN
    IF coalesce(current_setting('app.platform_owner_user_mutation', true), '') = 'enabled' THEN
      -- A client-controlled setting alone never grants access: the server-side
      -- Platform Owner + MFA assertion is evaluated again in the trigger.
      PERFORM public.platform_owner_assert();
      RETURN NEW;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.erp_memberships actor
      WHERE actor.user_id = auth.uid()
        AND actor.role = 'owner'
        AND actor.status = 'approved'
        AND actor.restaurant_id = coalesce(NEW.restaurant_id, OLD.restaurant_id)
    ) THEN
      RAISE EXCEPTION 'Authorization fields can only be changed through the owner approval workflow';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_set_user_status(
  p_user_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_status text := lower(coalesce(p_status, ''));
BEGIN
  PERFORM public.platform_owner_assert();

  IF p_user_id IS NULL OR v_status NOT IN ('active', 'suspended', 'disabled') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_USER_STATUS_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.platform_owner_accounts account
    WHERE account.user_id = p_user_id AND account.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_ACCOUNT_PROTECTED';
  END IF;

  PERFORM set_config('app.platform_owner_user_mutation', 'enabled', true);

  UPDATE public.profiles
  SET is_active = v_status = 'active',
      approval_status = CASE WHEN v_status = 'active' THEN 'approved' ELSE 'suspended' END,
      updated_date = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_USER_NOT_FOUND';
  END IF;

  UPDATE public.erp_memberships
  SET status = CASE WHEN v_status = 'active' THEN 'approved' ELSE 'suspended' END,
      rejection_reason = CASE WHEN v_status = 'active' THEN NULL ELSE p_reason END,
      updated_at = now()
  WHERE user_id = p_user_id;

  PERFORM public.platform_owner_log('user_' || v_status, 'user', p_user_id::text, NULL, jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('user_id', p_user_id, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_archive_user(
  p_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  PERFORM public.platform_owner_assert();

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_USER_INPUT_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.platform_owner_accounts
    WHERE user_id = p_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_ACCOUNT_PROTECTED';
  END IF;

  PERFORM set_config('app.platform_owner_user_mutation', 'enabled', true);

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
  SET status = 'suspended',
      rejection_reason = coalesce(nullif(btrim(p_reason), ''), 'archived by Platform Owner'),
      updated_at = now()
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
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_anonymized_email text;
  v_revoked_sessions integer := 0;
BEGIN
  PERFORM public.platform_owner_assert();

  IF p_user_id IS NULL OR btrim(coalesce(p_confirmation, '')) <> 'DELETE USER' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_USER_DELETE_CONFIRMATION_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.platform_owner_accounts
    WHERE user_id = p_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_ACCOUNT_PROTECTED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_USER_NOT_FOUND';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_AUTH_USER_NOT_FOUND';
  END IF;

  v_anonymized_email := 'deleted+' || p_user_id::text || '@deleted.invalid';
  PERFORM set_config('app.platform_owner_user_mutation', 'enabled', true);

  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_revoked_sessions = ROW_COUNT;

  UPDATE auth.users
  SET email = v_anonymized_email,
      phone = NULL,
      raw_user_meta_data = '{}'::jsonb,
      confirmation_token = '',
      recovery_token = '',
      email_change_token_new = '',
      email_change_token_current = '',
      email_change = '',
      email_change_sent_at = NULL,
      phone_change = '',
      phone_change_token = '',
      phone_change_sent_at = NULL,
      reauthentication_token = '',
      reauthentication_sent_at = NULL,
      banned_until = 'infinity'::timestamptz,
      deleted_at = now(),
      updated_at = now()
  WHERE id = p_user_id;

  UPDATE auth.identities
  SET identity_data = (
        (coalesce(identity_data, '{}'::jsonb)
          - 'email' - 'phone' - 'full_name' - 'name' - 'avatar_url' - 'picture')
        || jsonb_build_object('email', v_anonymized_email)
      ),
      updated_at = now()
  WHERE user_id = p_user_id;

  UPDATE public.profiles
  SET full_name = 'Deleted user',
      email = v_anonymized_email,
      phone = NULL,
      is_active = false,
      approval_status = 'suspended',
      archived_at = now(),
      updated_date = now()
  WHERE id = p_user_id;

  UPDATE public.erp_memberships
  SET status = 'suspended',
      rejection_reason = coalesce(nullif(btrim(p_reason), ''), 'deleted and anonymized by Platform Owner'),
      updated_at = now()
  WHERE user_id = p_user_id;

  PERFORM public.platform_owner_log(
    'user_deleted_and_anonymized',
    'user',
    p_user_id::text,
    NULL,
    jsonb_build_object(
      'reason', nullif(btrim(p_reason), ''),
      'auth_account_anonymized', true,
      'sessions_revoked', v_revoked_sessions,
      'financial_records_preserved', true
    )
  );

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'status', 'deleted_and_anonymized',
    'auth_account_anonymized', true,
    'sessions_revoked', v_revoked_sessions,
    'financial_records_preserved', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_owner_set_user_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_archive_user(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_anonymize_user(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_owner_set_user_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_archive_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_anonymize_user(uuid, text, text) TO authenticated;

COMMIT;
