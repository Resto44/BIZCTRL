-- Server-side authorization state machine for Platform Owner MFA recovery.
-- This ledger intentionally stores only user/session/factor identifiers, statuses,
-- and timestamps. It never stores passwords, recovery tokens, JWTs, TOTP secrets,
-- QR payloads, service keys, or any other credential material.

ALTER TABLE public.platform_owner_mfa_recovery_requests
  ADD COLUMN IF NOT EXISTS password_updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.platform_owner_authorize_mfa_reenrollment()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_session_id uuid;
  v_request public.platform_owner_mfa_recovery_requests;
BEGIN
  IF NOT public.platform_owner_is_authorized() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_REQUIRED';
  END IF;

  IF coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal1' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_AAL1_REQUIRED';
  END IF;

  v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_SESSION_REQUIRED';
  END IF;

  SELECT * INTO v_request
  FROM public.platform_owner_mfa_recovery_requests
  WHERE user_id = auth.uid()
    AND session_id = v_session_id
    AND status = 'password_updated'
    AND password_updated_at IS NOT NULL
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_NOT_AUTHORIZED';
  END IF;

  RETURN jsonb_build_object('authorized', true, 'expires_at', v_request.expires_at);
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
DECLARE
  v_session_id uuid;
  v_request public.platform_owner_mfa_recovery_requests;
BEGIN
  PERFORM public.platform_owner_assert();

  v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  IF v_session_id IS NULL OR p_new_factor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_SESSION_REQUIRED';
  END IF;

  SELECT * INTO v_request
  FROM public.platform_owner_mfa_recovery_requests
  WHERE user_id = auth.uid()
    AND session_id = v_session_id
    AND status = 'password_updated'
    AND password_updated_at IS NOT NULL
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_NOT_AUTHORIZED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.mfa_factors
    WHERE id = p_new_factor_id
      AND user_id = auth.uid()
      AND factor_type = 'totp'
      AND status = 'verified'
      AND NOT id = ANY(v_request.prior_factor_ids)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_NEW_FACTOR_UNVERIFIED';
  END IF;

  UPDATE public.platform_owner_mfa_recovery_requests
  SET status = 'finalizing',
      new_factor_id = p_new_factor_id,
      updated_at = now()
  WHERE id = v_request.id;

  PERFORM public.platform_owner_log(
    'mfa_reenrollment_factor_verified',
    'platform_owner_mfa',
    v_request.id::text,
    NULL,
    jsonb_build_object('new_factor_id', p_new_factor_id, 'canonical_origin', 'https://mybizctrl.site')
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
  v_session_id uuid;
  v_request public.platform_owner_mfa_recovery_requests;
  v_remaining_verified_factor_count integer;
BEGIN
  PERFORM public.platform_owner_assert();

  v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  IF v_session_id IS NULL OR p_new_factor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_SESSION_REQUIRED';
  END IF;

  SELECT * INTO v_request
  FROM public.platform_owner_mfa_recovery_requests
  WHERE user_id = auth.uid()
    AND session_id = v_session_id
    AND status = 'finalizing'
    AND new_factor_id = p_new_factor_id
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_NOT_AUTHORIZED';
  END IF;

  SELECT count(*)::integer
  INTO v_remaining_verified_factor_count
  FROM auth.mfa_factors
  WHERE user_id = auth.uid()
    AND factor_type = 'totp'
    AND status = 'verified';

  IF v_remaining_verified_factor_count <> 1 OR NOT EXISTS (
    SELECT 1
    FROM auth.mfa_factors
    WHERE id = p_new_factor_id
      AND user_id = auth.uid()
      AND factor_type = 'totp'
      AND status = 'verified'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_RETIREMENT_INCOMPLETE';
  END IF;

  UPDATE public.platform_owner_mfa_recovery_requests
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = v_request.id;

  PERFORM public.platform_owner_log(
    'mfa_reenrollment_completed',
    'platform_owner_mfa',
    v_request.id::text,
    NULL,
    jsonb_build_object('new_factor_id', p_new_factor_id, 'canonical_origin', 'https://mybizctrl.site')
  );

  RETURN jsonb_build_object('completed', true);
END;
$$;

-- The completion marker must run before re-enrollment authorization and cannot
-- be reached by normal AAL1, expired, reused, or unrelated sessions.
CREATE OR REPLACE FUNCTION public.platform_owner_mark_mfa_recovery_password_updated(
  p_recovery_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_session_id uuid;
  v_request public.platform_owner_mfa_recovery_requests;
BEGIN
  IF NOT public.platform_owner_is_authorized()
    OR coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal1'
    OR NOT public.platform_owner_mfa_recovery_amr_present('recovery') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_EMAIL_PROOF_REQUIRED';
  END IF;

  v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  SELECT * INTO v_request
  FROM public.platform_owner_mfa_recovery_requests
  WHERE id = p_recovery_id
    AND user_id = auth.uid()
    AND session_id = v_session_id
    AND status = 'authorized'
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_NOT_AUTHORIZED';
  END IF;

  UPDATE public.platform_owner_mfa_recovery_requests
  SET status = 'password_updated', password_updated_at = now(), updated_at = now()
  WHERE id = v_request.id;

  PERFORM public.platform_owner_log(
    'mfa_recovery_password_updated',
    'platform_owner_mfa',
    v_request.id::text,
    NULL,
    jsonb_build_object('canonical_origin', 'https://mybizctrl.site')
  );

  RETURN jsonb_build_object('authorized', true, 'expires_at', v_request.expires_at);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_owner_authorize_mfa_reenrollment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_record_mfa_reenrollment_verified(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_record_mfa_reenrollment_completed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_mark_mfa_recovery_password_updated(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_owner_authorize_mfa_reenrollment() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_record_mfa_reenrollment_verified(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_record_mfa_reenrollment_completed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_mark_mfa_recovery_password_updated(uuid) TO authenticated;
