-- Controlled clean Auth provisioning for the existing Platform Owner application
-- record. This migration never deletes or changes ERP/business tables. It records
-- only the old/new Auth binding, aggregate business baselines, and non-secret
-- invocation hash required for a one-time server-side provisioning operation.

CREATE TABLE IF NOT EXISTS public.platform_owner_clean_auth_rebind_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  new_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_email text NOT NULL,
  archived_old_email text,
  invocation_nonce_hash text NOT NULL UNIQUE,
  business_baseline jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'provisioning', 'bound', 'setup_dispatched', 'verified', 'finalized', 'failed', 'rolled_back')),
  failure_code text,
  bound_at timestamptz,
  setup_dispatched_at timestamptz,
  verified_at timestamptz,
  finalized_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (target_email = lower(target_email))
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_owner_clean_auth_rebind_one_open_job
  ON public.platform_owner_clean_auth_rebind_jobs (old_user_id)
  WHERE status IN ('pending', 'provisioning', 'bound', 'setup_dispatched', 'verified');

ALTER TABLE public.platform_owner_clean_auth_rebind_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_owner_clean_auth_rebind_jobs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_owner_create_clean_auth_rebind(
  p_old_user_id uuid,
  p_target_email text,
  p_invocation_nonce_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_target_email text := lower(btrim(coalesce(p_target_email, '')));
  v_baseline jsonb;
  v_job public.platform_owner_clean_auth_rebind_jobs;
BEGIN
  IF NOT public.platform_owner_reset_operator_authorized() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_RESET_OPERATOR_REQUIRED';
  END IF;

  IF p_old_user_id IS NULL OR p_invocation_nonce_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_CLEAN_PROVISION_INPUT_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.platform_owner_accounts poa
    JOIN auth.users u ON u.id = poa.user_id
    WHERE poa.user_id = p_old_user_id
      AND poa.status = 'active'
      AND poa.mfa_required
      AND lower(u.email) = v_target_email
      AND u.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_CLEAN_PROVISION_TARGET_INVALID';
  END IF;

  SELECT jsonb_build_object(
    'restaurants', (SELECT count(*) FROM public.restaurants),
    'branches', (SELECT count(*) FROM public.branches),
    'products', (SELECT count(*) FROM public.products),
    'inventory', (SELECT count(*) FROM public.inventory),
    'sales_invoices', (SELECT count(*) FROM public.sales_invoices),
    'purchases', (SELECT count(*) FROM public.purchases),
    'expenses', (SELECT count(*) FROM public.expenses),
    'platform_owner_activity_logs', (SELECT count(*) FROM public.platform_owner_activity_logs)
  ) INTO v_baseline;

  UPDATE public.platform_owner_mfa_recovery_requests
  SET status = 'expired', updated_at = now()
  WHERE user_id = p_old_user_id
    AND status IN ('email_requested', 'authorized', 'password_updated', 'finalizing');

  UPDATE public.platform_owner_auth_reset_jobs
  SET status = 'expired', invalidated_at = now(), updated_at = now()
  WHERE user_id = p_old_user_id
    AND status IN ('pending_delivery', 'dispatching');

  INSERT INTO public.platform_owner_clean_auth_rebind_jobs (
    old_user_id,
    target_email,
    invocation_nonce_hash,
    business_baseline
  ) VALUES (
    p_old_user_id,
    v_target_email,
    p_invocation_nonce_hash,
    v_baseline
  ) RETURNING * INTO v_job;

  INSERT INTO public.platform_owner_activity_logs (
    actor_user_id, action, resource_type, resource_id, restaurant_id, details
  ) VALUES (
    p_old_user_id,
    'platform_owner_clean_auth_provision_prepared',
    'platform_owner_auth',
    v_job.id::text,
    NULL,
    jsonb_build_object('canonical_origin', 'https://mybizctrl.site')
  );

  RETURN jsonb_build_object('job_id', v_job.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_claim_clean_auth_rebind(
  p_invocation_nonce_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_job public.platform_owner_clean_auth_rebind_jobs;
  v_old_email text;
BEGIN
  IF NOT public.platform_owner_reset_operator_authorized() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_RESET_OPERATOR_REQUIRED';
  END IF;

  UPDATE public.platform_owner_clean_auth_rebind_jobs
  SET status = 'provisioning', updated_at = now()
  WHERE invocation_nonce_hash = p_invocation_nonce_hash
    AND status = 'pending'
  RETURNING * INTO v_job;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_CLEAN_PROVISION_JOB_UNAVAILABLE';
  END IF;

  SELECT email INTO v_old_email
  FROM auth.users
  WHERE id = v_job.old_user_id
    AND lower(email) = v_job.target_email;

  IF v_old_email IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_CLEAN_PROVISION_TARGET_INVALID';
  END IF;

  RETURN jsonb_build_object(
    'job_id', v_job.id,
    'old_user_id', v_job.old_user_id,
    'target_email', v_job.target_email,
    'archived_old_email', 'retired-platform-owner-' || replace(v_job.old_user_id::text, '-', '') || '@invalid.mybizctrl.site'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_bind_clean_auth_rebind(
  p_job_id uuid,
  p_new_user_id uuid,
  p_archived_old_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_job public.platform_owner_clean_auth_rebind_jobs;
BEGIN
  IF NOT public.platform_owner_reset_operator_authorized() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_RESET_OPERATOR_REQUIRED';
  END IF;

  SELECT * INTO v_job
  FROM public.platform_owner_clean_auth_rebind_jobs
  WHERE id = p_job_id
    AND status = 'provisioning'
  FOR UPDATE;

  IF NOT FOUND OR p_new_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_CLEAN_PROVISION_JOB_UNAVAILABLE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = p_new_user_id
      AND lower(u.email) = v_job.target_email
      AND u.email_confirmed_at IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM auth.mfa_factors WHERE user_id = p_new_user_id
  ) OR EXISTS (
    SELECT 1 FROM auth.sessions WHERE user_id = p_new_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_CLEAN_PROVISION_NEW_AUTH_INVALID';
  END IF;

  UPDATE public.platform_owner_accounts
  SET user_id = p_new_user_id, updated_at = now()
  WHERE user_id = v_job.old_user_id
    AND status = 'active'
    AND mfa_required;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_CLEAN_PROVISION_BINDING_FAILED';
  END IF;

  UPDATE public.platform_owner_clean_auth_rebind_jobs
  SET new_user_id = p_new_user_id,
      archived_old_email = lower(btrim(p_archived_old_email)),
      status = 'bound',
      bound_at = now(),
      updated_at = now()
  WHERE id = v_job.id;

  INSERT INTO public.platform_owner_activity_logs (
    actor_user_id, action, resource_type, resource_id, restaurant_id, details
  ) VALUES (
    p_new_user_id,
    'platform_owner_clean_auth_bound',
    'platform_owner_auth',
    v_job.id::text,
    NULL,
    jsonb_build_object('canonical_origin', 'https://mybizctrl.site')
  );

  RETURN jsonb_build_object('bound', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_record_clean_auth_setup_delivery(
  p_job_id uuid,
  p_dispatched boolean,
  p_failure_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
BEGIN
  IF NOT public.platform_owner_reset_operator_authorized() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_RESET_OPERATOR_REQUIRED';
  END IF;

  UPDATE public.platform_owner_clean_auth_rebind_jobs
  SET status = CASE WHEN p_dispatched THEN 'setup_dispatched' ELSE 'bound' END,
      setup_dispatched_at = CASE WHEN p_dispatched THEN now() ELSE NULL END,
      failure_code = CASE WHEN p_dispatched THEN NULL ELSE nullif(btrim(p_failure_code), '') END,
      updated_at = now()
  WHERE id = p_job_id
    AND status IN ('bound', 'setup_dispatched');

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_CLEAN_PROVISION_JOB_UNAVAILABLE';
  END IF;

  RETURN jsonb_build_object('recorded', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_mark_clean_auth_verified(
  p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_job public.platform_owner_clean_auth_rebind_jobs;
BEGIN
  IF NOT public.platform_owner_reset_operator_authorized() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_RESET_OPERATOR_REQUIRED';
  END IF;

  SELECT * INTO v_job
  FROM public.platform_owner_clean_auth_rebind_jobs
  WHERE id = p_job_id
    AND status = 'setup_dispatched'
  FOR UPDATE;

  IF NOT FOUND OR v_job.new_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_CLEAN_PROVISION_JOB_UNAVAILABLE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.platform_owner_accounts poa
    WHERE poa.user_id = v_job.new_user_id
      AND poa.status = 'active'
      AND poa.mfa_required
  ) OR NOT EXISTS (
    SELECT 1
    FROM auth.mfa_factors f
    WHERE f.user_id = v_job.new_user_id
      AND f.factor_type = 'totp'
      AND f.status = 'verified'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_CLEAN_PROVISION_NOT_VERIFIED';
  END IF;

  UPDATE public.platform_owner_clean_auth_rebind_jobs
  SET status = 'verified', verified_at = now(), updated_at = now()
  WHERE id = v_job.id;

  RETURN jsonb_build_object('verified', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_finalize_clean_auth_rebind(
  p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_job public.platform_owner_clean_auth_rebind_jobs;
BEGIN
  IF NOT public.platform_owner_reset_operator_authorized() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_RESET_OPERATOR_REQUIRED';
  END IF;

  SELECT * INTO v_job
  FROM public.platform_owner_clean_auth_rebind_jobs
  WHERE id = p_job_id
    AND status = 'verified'
  FOR UPDATE;

  IF NOT FOUND OR v_job.new_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_CLEAN_PROVISION_JOB_UNAVAILABLE';
  END IF;

  DELETE FROM auth.sessions WHERE user_id = v_job.old_user_id;
  DELETE FROM auth.mfa_factors WHERE user_id = v_job.old_user_id;

  UPDATE public.platform_owner_mfa_recovery_requests
  SET status = 'expired', updated_at = now()
  WHERE user_id = v_job.old_user_id
    AND status IN ('email_requested', 'authorized', 'password_updated', 'finalizing');

  UPDATE public.platform_owner_auth_reset_jobs
  SET status = 'expired', invalidated_at = now(), updated_at = now()
  WHERE user_id = v_job.old_user_id
    AND status IN ('pending_delivery', 'dispatching');

  UPDATE public.platform_owner_clean_auth_rebind_jobs
  SET status = 'finalized', finalized_at = now(), updated_at = now()
  WHERE id = v_job.id;

  RETURN jsonb_build_object('finalized', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_owner_mark_clean_auth_rebind_failed(
  p_job_id uuid,
  p_failure_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
BEGIN
  IF NOT public.platform_owner_reset_operator_authorized() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_RESET_OPERATOR_REQUIRED';
  END IF;

  UPDATE public.platform_owner_clean_auth_rebind_jobs
  SET status = 'failed', failure_code = nullif(btrim(p_failure_code), ''), updated_at = now()
  WHERE id = p_job_id
    AND status IN ('provisioning', 'bound');

  RETURN jsonb_build_object('recorded', FOUND);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_owner_create_clean_auth_rebind(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_owner_claim_clean_auth_rebind(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_owner_bind_clean_auth_rebind(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_owner_record_clean_auth_setup_delivery(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_owner_mark_clean_auth_verified(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_owner_finalize_clean_auth_rebind(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_owner_mark_clean_auth_rebind_failed(uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.platform_owner_create_clean_auth_rebind(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_owner_claim_clean_auth_rebind(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_owner_bind_clean_auth_rebind(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_owner_record_clean_auth_setup_delivery(uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_owner_mark_clean_auth_verified(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_owner_finalize_clean_auth_rebind(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_owner_mark_clean_auth_rebind_failed(uuid, text) TO service_role;
NOTIFY pgrst, 'reload schema';
