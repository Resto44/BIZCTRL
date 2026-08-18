-- Replace the failed Edge Function recovery ceremony with a native Supabase Auth
-- recovery-session re-enrollment flow. No TOTP secret, QR payload, recovery
-- token, JWT, or service credential is stored in application tables.

CREATE OR REPLACE FUNCTION public.platform_owner_authorize_mfa_reenrollment()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  IF NOT public.platform_owner_is_authorized() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.platform_owner_accounts
    WHERE user_id = auth.uid()
      AND status = 'active'
      AND mfa_required
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_NOT_REQUIRED';
  END IF;

  -- A password-recovery link creates the sole AAL1 session that may begin
  -- replacement enrollment. Ordinary AAL1 sessions cannot use this route.
  IF coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal1'
    OR NOT public.platform_owner_mfa_recovery_amr_present('recovery') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_EMAIL_PROOF_REQUIRED';
  END IF;

  v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_SESSION_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.mfa_factors
    WHERE user_id = auth.uid()
      AND factor_type = 'totp'
      AND status = 'verified'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_NO_VERIFIED_FACTOR';
  END IF;

  PERFORM public.platform_owner_log(
    'mfa_reenrollment_authorized',
    'platform_owner_mfa',
    v_session_id::text,
    NULL,
    jsonb_build_object('canonical_origin', 'https://mybizctrl.site')
  );

  RETURN jsonb_build_object('authorized', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_record_mfa_reenrollment_verified(
  p_new_factor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
BEGIN
  PERFORM public.platform_owner_assert();

  IF NOT public.platform_owner_mfa_recovery_amr_present('recovery')
    OR NOT public.platform_owner_mfa_recovery_amr_present('totp') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_STEP_UP_REQUIRED';
  END IF;

  IF p_new_factor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM auth.mfa_factors
    WHERE id = p_new_factor_id
      AND user_id = auth.uid()
      AND factor_type = 'totp'
      AND status = 'verified'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_NEW_FACTOR_UNVERIFIED';
  END IF;

  PERFORM public.platform_owner_log(
    'mfa_reenrollment_factor_verified',
    'platform_owner_mfa',
    p_new_factor_id::text,
    NULL,
    jsonb_build_object('canonical_origin', 'https://mybizctrl.site')
  );

  RETURN jsonb_build_object('verified', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_record_mfa_reenrollment_completed(
  p_new_factor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_remaining_verified_factor_count integer;
BEGIN
  PERFORM public.platform_owner_assert();

  IF NOT public.platform_owner_mfa_recovery_amr_present('recovery')
    OR NOT public.platform_owner_mfa_recovery_amr_present('totp') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_STEP_UP_REQUIRED';
  END IF;

  IF p_new_factor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM auth.mfa_factors
    WHERE id = p_new_factor_id
      AND user_id = auth.uid()
      AND factor_type = 'totp'
      AND status = 'verified'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_NEW_FACTOR_UNVERIFIED';
  END IF;

  SELECT count(*)::integer
    INTO v_remaining_verified_factor_count
  FROM auth.mfa_factors
  WHERE user_id = auth.uid()
    AND factor_type = 'totp'
    AND status = 'verified';

  IF v_remaining_verified_factor_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_RETIREMENT_INCOMPLETE';
  END IF;

  PERFORM public.platform_owner_log(
    'mfa_reenrollment_completed',
    'platform_owner_mfa',
    p_new_factor_id::text,
    NULL,
    jsonb_build_object('canonical_origin', 'https://mybizctrl.site')
  );

  RETURN jsonb_build_object('completed', true);
END;
$$;

-- Prevent all new use of the obsolete stateful Edge Function ceremony. Existing
-- historical rows are retained for audit only; no secret material exists there.
REVOKE EXECUTE ON FUNCTION public.platform_owner_prepare_mfa_recovery() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.platform_owner_begin_mfa_recovery() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.platform_owner_mark_mfa_recovery_password_updated(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.platform_owner_claim_mfa_recovery(uuid, uuid) FROM authenticated;

REVOKE ALL ON FUNCTION public.platform_owner_authorize_mfa_reenrollment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_record_mfa_reenrollment_verified(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_record_mfa_reenrollment_completed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_owner_authorize_mfa_reenrollment() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_record_mfa_reenrollment_verified(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_record_mfa_reenrollment_completed(uuid) TO authenticated;
