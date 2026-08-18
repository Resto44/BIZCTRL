-- Secure Platform Owner MFA recovery ledger. This table stores no TOTP secret,
-- QR payload, recovery code, credential, or session token.
CREATE TABLE IF NOT EXISTS public.platform_owner_mfa_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  prior_factor_ids uuid[] NOT NULL DEFAULT '{}',
  new_factor_id uuid,
  status text NOT NULL DEFAULT 'authorized'
    CHECK (status IN ('authorized', 'finalizing', 'completed', 'expired', 'failed')),
  expires_at timestamptz NOT NULL,
  authorized_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_owner_mfa_recovery_one_active_request_per_owner
  ON public.platform_owner_mfa_recovery_requests (user_id)
  WHERE status IN ('authorized', 'finalizing');

CREATE INDEX IF NOT EXISTS platform_owner_mfa_recovery_lookup_idx
  ON public.platform_owner_mfa_recovery_requests (id, user_id, status, expires_at);

ALTER TABLE public.platform_owner_mfa_recovery_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.platform_owner_mfa_recovery_amr_present(p_method text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) AS item
    WHERE item ->> 'method' = p_method
  );
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
  v_prior_factor_ids uuid[];
  v_request_id uuid;
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
    AND status IN ('authorized', 'finalizing')
    AND expires_at <= now();

  INSERT INTO public.platform_owner_mfa_recovery_requests
    (user_id, session_id, prior_factor_ids, expires_at)
  VALUES
    (auth.uid(), v_session_id, v_prior_factor_ids, v_expires_at)
  ON CONFLICT (user_id) WHERE status IN ('authorized', 'finalizing')
  DO UPDATE SET
    session_id = EXCLUDED.session_id,
    prior_factor_ids = EXCLUDED.prior_factor_ids,
    new_factor_id = NULL,
    status = 'authorized',
    expires_at = EXCLUDED.expires_at,
    authorized_at = now(),
    completed_at = NULL,
    updated_at = now()
  RETURNING id INTO v_request_id;

  PERFORM public.platform_owner_log(
    'mfa_recovery_email_verified',
    'platform_owner_mfa',
    v_request_id::text,
    NULL,
    jsonb_build_object('canonical_origin', 'https://mybizctrl.site')
  );

  RETURN jsonb_build_object('recovery_id', v_request_id, 'expires_at', v_expires_at);
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
    AND status IN ('authorized', 'finalizing')
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

REVOKE ALL ON TABLE public.platform_owner_mfa_recovery_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.platform_owner_mfa_recovery_requests FROM anon;
REVOKE ALL ON TABLE public.platform_owner_mfa_recovery_requests FROM authenticated;

REVOKE ALL ON FUNCTION public.platform_owner_mfa_recovery_amr_present(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_mfa_recovery_amr_present(text) FROM anon;
REVOKE ALL ON FUNCTION public.platform_owner_mfa_recovery_amr_present(text) FROM authenticated;

REVOKE ALL ON FUNCTION public.platform_owner_begin_mfa_recovery() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_begin_mfa_recovery() FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_owner_begin_mfa_recovery() TO authenticated;

REVOKE ALL ON FUNCTION public.platform_owner_claim_mfa_recovery(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_claim_mfa_recovery(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_owner_claim_mfa_recovery(uuid, uuid) TO authenticated;

GRANT SELECT, UPDATE ON public.platform_owner_mfa_recovery_requests TO service_role;
GRANT INSERT ON public.platform_owner_activity_logs TO service_role;
