-- Recovery-only password authorization for a Platform Owner with an unavailable
-- authenticator. This migration deliberately does not alter platform_owner_assert(),
-- normal login, or any tenant policy. It only records the narrow state transition
-- that an Edge Function may perform after validating a Supabase PASSWORD_RECOVERY JWT.

ALTER TABLE public.platform_owner_mfa_recovery_requests
  DROP CONSTRAINT IF EXISTS platform_owner_mfa_recovery_requests_status_check;

ALTER TABLE public.platform_owner_mfa_recovery_requests
  ADD CONSTRAINT platform_owner_mfa_recovery_requests_status_check
  CHECK (status IN ('authorized', 'password_updated', 'finalizing', 'completed', 'expired', 'failed'));

CREATE OR REPLACE FUNCTION public.platform_owner_begin_mfa_recovery()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_session_id uuid;
  v_prior_factor_ids uuid[];
  v_request public.platform_owner_mfa_recovery_requests;
  v_expires_at timestamptz := now() + interval '15 minutes';
BEGIN
  IF NOT public.platform_owner_is_authorized() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.platform_owner_accounts
    WHERE user_id = auth.uid() AND status = 'active' AND mfa_required
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_NOT_REQUIRED';
  END IF;

  -- A password-recovery email proves control of the verified mailbox, but never
  -- grants normal Platform Owner portal access. This procedure accepts only the
  -- short-lived Supabase recovery session at AAL1.
  IF coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal1'
    OR NOT public.platform_owner_mfa_recovery_amr_present('recovery') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_EMAIL_PROOF_REQUIRED';
  END IF;

  v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_SESSION_REQUIRED';
  END IF;

  SELECT coalesce(array_agg(id ORDER BY created_at), '{}'::uuid[])
    INTO v_prior_factor_ids
  FROM auth.mfa_factors
  WHERE user_id = auth.uid() AND factor_type = 'totp' AND status = 'verified';

  IF cardinality(v_prior_factor_ids) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_NO_VERIFIED_FACTOR';
  END IF;

  UPDATE public.platform_owner_mfa_recovery_requests
  SET status = 'expired', updated_at = now()
  WHERE user_id = auth.uid()
    AND status IN ('authorized', 'password_updated', 'finalizing')
    AND expires_at <= now();

  SELECT * INTO v_request
  FROM public.platform_owner_mfa_recovery_requests
  WHERE user_id = auth.uid()
    AND status IN ('authorized', 'password_updated', 'finalizing')
    AND expires_at > now()
  FOR UPDATE;

  IF FOUND THEN
    -- Idempotent only before the password replacement has occurred and only for
    -- the same recovery session. A different email link can never take over an
    -- in-progress ceremony.
    IF v_request.status = 'authorized' AND v_request.session_id = v_session_id THEN
      RETURN jsonb_build_object('recovery_id', v_request.id, 'expires_at', v_request.expires_at);
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_IN_PROGRESS';
  END IF;

  INSERT INTO public.platform_owner_mfa_recovery_requests
    (user_id, session_id, prior_factor_ids, expires_at)
  VALUES
    (auth.uid(), v_session_id, v_prior_factor_ids, v_expires_at)
  RETURNING * INTO v_request;

  PERFORM public.platform_owner_log(
    'mfa_recovery_email_verified',
    'platform_owner_mfa',
    v_request.id::text,
    NULL,
    jsonb_build_object('canonical_origin', 'https://mybizctrl.site')
  );

  RETURN jsonb_build_object('recovery_id', v_request.id, 'expires_at', v_request.expires_at);
END;
$$;

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
  v_request public.platform_owner_mfa_recovery_requests;
  v_session_id uuid;
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
  SET status = 'password_updated', updated_at = now()
  WHERE id = v_request.id;

  PERFORM public.platform_owner_log(
    'mfa_recovery_password_updated',
    'platform_owner_mfa',
    v_request.id::text,
    NULL,
    jsonb_build_object('canonical_origin', 'https://mybizctrl.site')
  );

  RETURN jsonb_build_object('recovery_id', v_request.id, 'expires_at', v_request.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_claim_mfa_recovery(
  p_recovery_id uuid,
  p_new_factor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_request public.platform_owner_mfa_recovery_requests;
BEGIN
  -- Normal owner authorization remains strictly AAL2-only. The recovery JWT must
  -- also be the same session that created the request and the new TOTP challenge
  -- must have elevated that very session to AAL2.
  PERFORM public.platform_owner_assert();

  IF NOT public.platform_owner_mfa_recovery_amr_present('recovery')
    OR NOT public.platform_owner_mfa_recovery_amr_present('totp') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_STEP_UP_REQUIRED';
  END IF;

  SELECT * INTO v_request
  FROM public.platform_owner_mfa_recovery_requests
  WHERE id = p_recovery_id
    AND user_id = auth.uid()
    AND session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
    AND status = 'password_updated'
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_NOT_AUTHORIZED';
  END IF;

  UPDATE public.platform_owner_mfa_recovery_requests
  SET status = 'finalizing', new_factor_id = p_new_factor_id, updated_at = now()
  WHERE id = v_request.id;

  RETURN jsonb_build_object(
    'recovery_id', v_request.id,
    'prior_factor_ids', v_request.prior_factor_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_owner_mark_mfa_recovery_password_updated(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_mark_mfa_recovery_password_updated(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_owner_mark_mfa_recovery_password_updated(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.platform_owner_begin_mfa_recovery() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_claim_mfa_recovery(uuid, uuid) TO authenticated;
