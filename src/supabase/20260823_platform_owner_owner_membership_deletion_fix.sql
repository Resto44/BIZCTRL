BEGIN;

-- erp_membership_owner_scope deliberately requires owner memberships to remain
-- approved. A permanent Platform Owner deletion cannot set an owner membership to
-- suspended; it must remove that no-longer-valid membership while preserving all
-- financial and audit records keyed by the immutable Auth user ID.
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
  v_removed_owner_membership boolean := false;
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

  -- For a business Owner, suspended membership is prohibited by the existing
  -- owner-scope constraint. Delete the membership and branch assignments instead;
  -- no table has a foreign-key dependency on erp_memberships.
  DELETE FROM public.erp_memberships
  WHERE user_id = p_user_id
    AND role = 'owner';
  v_removed_owner_membership := FOUND;

  IF NOT v_removed_owner_membership THEN
    UPDATE public.erp_memberships
    SET status = 'suspended',
        rejection_reason = coalesce(nullif(btrim(p_reason), ''), 'deleted and anonymized by Platform Owner'),
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  DELETE FROM public.branch_assignments WHERE user_id = p_user_id;

  PERFORM public.platform_owner_log(
    'user_deleted_and_anonymized',
    'user',
    p_user_id::text,
    NULL,
    jsonb_build_object(
      'reason', nullif(btrim(p_reason), ''),
      'auth_account_anonymized', true,
      'sessions_revoked', v_revoked_sessions,
      'owner_membership_removed', v_removed_owner_membership,
      'financial_records_preserved', true
    )
  );

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'status', 'deleted_and_anonymized',
    'auth_account_anonymized', true,
    'sessions_revoked', v_revoked_sessions,
    'owner_membership_removed', v_removed_owner_membership,
    'financial_records_preserved', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_owner_anonymize_user(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_owner_anonymize_user(uuid, text, text) TO authenticated;

COMMIT;
