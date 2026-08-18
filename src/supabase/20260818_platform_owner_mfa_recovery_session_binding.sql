-- Supabase hosted recovery links in this project establish a signed implicit
-- AAL1 session without a `recovery` AMR entry. Bind recovery to the verifiable
-- server-side lifecycle instead: a fresh pre-recovery password proof is revoked,
-- a recovery email is issued afterwards, and only a distinct session created after
-- that email can advance the single-use recovery request.

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
  v_session_created_at timestamptz;
BEGIN
  IF NOT public.platform_owner_is_authorized() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_REQUIRED';
  END IF;

  IF coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal1' THEN
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

  -- The recovery email must have been requested by a distinct password session.
  IF NOT FOUND OR v_request.session_id = v_session_id OR v_request.email_requested_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_NOT_AUTHORIZED';
  END IF;

  SELECT recovery_sent_at INTO v_recovery_sent_at
  FROM auth.users
  WHERE id = auth.uid();

  -- Look up the session server-side. The session must have been minted after the
  -- specific recovery email was sent, rather than being a pre-existing password,
  -- magic-link, or ordinary sign-in session.
  SELECT created_at INTO v_session_created_at
  FROM auth.sessions
  WHERE id = v_session_id
    AND user_id = auth.uid()
    AND aal = 'aal1'
    AND factor_id IS NULL;

  IF v_recovery_sent_at IS NULL
    OR v_recovery_sent_at < v_request.email_requested_at
    OR v_token_issued_at < v_request.email_requested_at
    OR v_session_created_at IS NULL
    OR v_session_created_at < v_recovery_sent_at THEN
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
    OR coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal1' THEN
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
  -- The normal Platform Owner assertion remains AAL2-only. The exact session
  -- bound to the recovery request must also have stepped up with a TOTP factor.
  PERFORM public.platform_owner_assert();

  IF NOT public.platform_owner_mfa_recovery_amr_present('totp') THEN
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

GRANT EXECUTE ON FUNCTION public.platform_owner_begin_mfa_recovery() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_mark_mfa_recovery_password_updated(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_claim_mfa_recovery(uuid, uuid) TO authenticated;
