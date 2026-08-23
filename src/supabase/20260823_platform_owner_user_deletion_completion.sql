BEGIN;

-- Complete the Platform Owner deletion contract without physically deleting
-- financial/audit-linked rows. The former routine only anonymized public.profiles,
-- leaving the Auth account and current sessions usable and the user visible in the
-- control-plane list.
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
    SELECT 1
    FROM public.platform_owner_accounts
    WHERE user_id = p_user_id
      AND status = 'active'
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

  -- End every current session first so the deleted user loses access immediately.
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_revoked_sessions = ROW_COUNT;

  -- Keep the auth row for referential integrity, while making it unusable and
  -- removing contact and user-metadata values from the login record.
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

  -- Preserve provider identity keys such as "sub", but remove all contact/name
  -- attributes and replace the generated identity email with the anonymized value.
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

-- Deleted/anonymized accounts must no longer appear in the active Platform Owner
-- user registry. Their immutable history remains available through audit records.
CREATE OR REPLACE FUNCTION public.platform_owner_list_users(
  p_query text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
BEGIN
  PERFORM public.platform_owner_assert();

  RETURN (
    WITH filtered AS (
      SELECT
        profile.id,
        profile.full_name,
        profile.email,
        profile.phone,
        profile.role,
        profile.is_active,
        profile.approval_status,
        profile.created_date,
        restaurant.name AS organization_name,
        restaurant.business_mode AS portal_type,
        subscription.plan,
        subscription.subscription_status
      FROM public.profiles profile
      LEFT JOIN public.restaurants restaurant
        ON restaurant.id = coalesce(profile.organization_id, profile.restaurant_id)
      LEFT JOIN public.subscriptions subscription
        ON subscription.restaurant_id = restaurant.id
      WHERE profile.archived_at IS NULL
        AND (
          nullif(btrim(coalesce(p_query, '')), '') IS NULL
          OR profile.email ILIKE '%' || p_query || '%'
          OR profile.full_name ILIKE '%' || p_query || '%'
        )
        AND (
          nullif(btrim(coalesce(p_status, '')), '') IS NULL
          OR coalesce(profile.approval_status, 'approved') = p_status
        )
    ),
    page AS (
      SELECT *
      FROM filtered
      ORDER BY created_date DESC
      LIMIT v_limit
      OFFSET greatest(coalesce(p_offset, 0), 0)
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM filtered),
      'items', coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page), '[]'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_owner_anonymize_user(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_list_users(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_owner_anonymize_user(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_list_users(text, text, integer, integer) TO authenticated;

COMMIT;
