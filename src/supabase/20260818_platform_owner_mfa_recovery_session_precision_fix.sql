-- Correct the hosted recovery-session proof for Platform Owner MFA recovery.
--
-- Supabase timestamps the JWT `iat` claim to whole seconds, while the recovery
-- request ledger uses microsecond timestamps. Comparing those values directly
-- can reject a recovery session created later in the same second. In addition,
-- auth.users.recovery_sent_at is not a request-scoped delivery receipt and may
-- remain from an older reset request. The durable proof is instead the signed
-- Supabase session itself, which must be a distinct AAL1 session created after
-- the server-recorded recovery request. The initiating password session has
-- already been globally revoked and the password randomized by the Edge Function.

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
  v_token_issued_at timestamptz;
  v_session_created_at timestamptz;
BEGIN
  IF NOT public.platform_owner_is_authorized() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_REQUIRED';
  END IF;

  -- Account-recovery password updates are completed only from a signed AAL1
  -- session. The subsequent checks bind that session to this exact recovery
  -- request, so an ordinary AAL1 password session cannot satisfy this gate.
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

  -- The password-login session that requested recovery is never eligible to
  -- consume it. It is invalidated before the browser opens the recovery link.
  IF NOT FOUND OR v_request.session_id = v_session_id OR v_request.email_requested_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_NOT_AUTHORIZED';
  END IF;

  SELECT created_at INTO v_session_created_at
  FROM auth.sessions
  WHERE id = v_session_id
    AND user_id = auth.uid()
    AND aal = 'aal1'
    AND factor_id IS NULL;

  -- `iat` has only second precision. Keep the precise database session check
  -- as the authority and compare the JWT timestamp at the same precision to
  -- avoid rejecting a valid recovery session minted later in the same second.
  IF v_token_issued_at < date_trunc('second', v_request.email_requested_at)
    OR v_session_created_at IS NULL
    OR v_session_created_at < v_request.email_requested_at THEN
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

GRANT EXECUTE ON FUNCTION public.platform_owner_begin_mfa_recovery() TO authenticated;
