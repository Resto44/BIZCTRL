-- Bind Platform Owner MFA recovery to two separate proofs without weakening normal
-- MFA: a recent password login may request recovery, but only the subsequent
-- signed Supabase recovery-email session may change the password or replace MFA.

ALTER TABLE public.platform_owner_mfa_recovery_requests
  ADD COLUMN IF NOT EXISTS email_requested_at timestamptz;

ALTER TABLE public.platform_owner_mfa_recovery_requests
  DROP CONSTRAINT IF EXISTS platform_owner_mfa_recovery_requests_status_check;

ALTER TABLE public.platform_owner_mfa_recovery_requests
  ADD CONSTRAINT platform_owner_mfa_recovery_requests_status_check
  CHECK (status IN ('email_requested', 'authorized', 'password_updated', 'finalizing', 'completed', 'expired', 'failed'));

DROP INDEX IF EXISTS public.platform_owner_mfa_recovery_one_active_request_per_owner;

CREATE UNIQUE INDEX IF NOT EXISTS platform_owner_mfa_recovery_one_active_request_per_owner
  ON public.platform_owner_mfa_recovery_requests (user_id)
  WHERE status IN ('email_requested', 'authorized', 'password_updated', 'finalizing');

CREATE OR REPLACE FUNCTION public.platform_owner_prepare_mfa_recovery()
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

  -- Only a fresh password login that has not passed MFA may request recovery.
  -- This does not authorize password replacement or portal access.
  IF coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal1'
    OR NOT public.platform_owner_mfa_recovery_amr_present('password') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_PASSWORD_PROOF_REQUIRED';
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
    AND status IN ('email_requested', 'authorized', 'password_updated', 'finalizing')
    AND expires_at <= now();

  SELECT * INTO v_request
  FROM public.platform_owner_mfa_recovery_requests
  WHERE user_id = auth.uid()
    AND status IN ('email_requested', 'authorized', 'password_updated', 'finalizing')
    AND expires_at > now()
  FOR UPDATE;

  IF FOUND THEN
    IF v_request.status = 'email_requested' AND v_request.session_id = v_session_id THEN
      UPDATE public.platform_owner_mfa_recovery_requests
      SET email_requested_at = now(), expires_at = v_expires_at, updated_at = now()
      WHERE id = v_request.id
      RETURNING * INTO v_request;
      RETURN jsonb_build_object('recovery_id', v_request.id, 'expires_at', v_request.expires_at);
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_IN_PROGRESS';
  END IF;

  INSERT INTO public.platform_owner_mfa_recovery_requests
    (user_id, session_id, prior_factor_ids, status, email_requested_at, expires_at)
  VALUES
    (auth.uid(), v_session_id, v_prior_factor_ids, 'email_requested', now(), v_expires_at)
  RETURNING * INTO v_request;

  PERFORM public.platform_owner_log(
    'mfa_recovery_email_requested',
    'platform_owner_mfa',
    v_request.id::text,
    NULL,
    jsonb_build_object('canonical_origin', 'https://mybizctrl.site')
  );

  RETURN jsonb_build_object('recovery_id', v_request.id, 'expires_at', v_request.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_begin_mfa_recovery()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_session_id uuid;
  v_request public.platform_owner_mfa_recovery_requests;
  v_recovery_sent_at timestamptz;
  v_token_issued_at timestamptz;
BEGIN
  IF NOT public.platform_owner_is_authorized() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_REQUIRED';
  END IF;

  -- Supabase documents account recovery as a distinct AMR. It is mandatory here;
  -- an AAL1 password, magic-link, or normal login session cannot use this route.
  IF coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal1'
    OR NOT public.platform_owner_mfa_recovery_amr_present('recovery') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_EMAIL_PROOF_REQUIRED';
  END IF;

  v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_token_issued_at := to_timestamp(nullif(auth.jwt() ->> 'iat', '')::bigint);
  IF v_session_id IS NULL OR v_token_issued_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_SESSION_REQUIRED';
  END IF;

  SELECT * INTO v_request
  FROM public.platform_owner_mfa_recovery_requests
  WHERE user_id = auth.uid()
    AND status = 'email_requested'
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND OR v_request.session_id = v_session_id OR v_request.email_requested_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_NOT_AUTHORIZED';
  END IF;

  SELECT recovery_sent_at INTO v_recovery_sent_at
  FROM auth.users
  WHERE id = auth.uid();

  IF v_recovery_sent_at IS NULL
    OR v_recovery_sent_at < v_request.email_requested_at
    OR v_token_issued_at < v_request.email_requested_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_EMAIL_PROOF_REQUIRED';
  END IF;

  UPDATE public.platform_owner_mfa_recovery_requests
  SET session_id = v_session_id,
      status = 'authorized',
      authorized_at = now(),
      updated_at = now()
  WHERE id = v_request.id
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
  -- The normal Platform Owner assertion remains AAL2-only. The exact recovery
  -- session must also have stepped up with the newly enrolled TOTP factor.
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

REVOKE ALL ON FUNCTION public.platform_owner_prepare_mfa_recovery() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_prepare_mfa_recovery() FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_owner_prepare_mfa_recovery() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_begin_mfa_recovery() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_mark_mfa_recovery_password_updated(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_claim_mfa_recovery(uuid, uuid) TO authenticated;
