-- A verified recovery-email session is proven once in
-- platform_owner_begin_mfa_recovery and then bound to this immutable ledger
-- row. Supabase Auth may rotate or normalize AMR after an administrative
-- password update, so the post-update transition must verify the bound purpose
-- and exact session instead of re-evaluating an already-consumed AMR claim.
-- This does not authorize generic AAL1 or recovery sessions: all identity,
-- purpose, expiry, and single-use checks remain server-side and mandatory.

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
    OR coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal1' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_AUTHENTICATED_SESSION_REQUIRED';
  END IF;

  v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  IF v_session_id IS NULL OR p_recovery_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_SESSION_REQUIRED';
  END IF;

  -- `authorized` can only be written by platform_owner_begin_mfa_recovery,
  -- which verifies the signed recovery-email session AMR, issuance time after
  -- recovery_sent_at, Platform Owner identity, an active prior TOTP factor,
  -- and a distinct requester-versus-recovery session. This exact recovery
  -- session ID is then bound to the row and cannot be supplied by the client.
  SELECT * INTO v_request
  FROM public.platform_owner_mfa_recovery_requests
  WHERE id = p_recovery_id
    AND user_id = auth.uid()
    AND session_id = v_session_id
    AND status = 'authorized'
    AND email_requested_at IS NOT NULL
    AND authorized_at IS NOT NULL
    AND authorized_at >= email_requested_at
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_MFA_RECOVERY_NOT_AUTHORIZED';
  END IF;

  UPDATE public.platform_owner_mfa_recovery_requests
  SET status = 'password_updated',
      password_updated_at = now(),
      updated_at = now()
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

REVOKE ALL ON FUNCTION public.platform_owner_mark_mfa_recovery_password_updated(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_mark_mfa_recovery_password_updated(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_owner_mark_mfa_recovery_password_updated(uuid) TO authenticated;
