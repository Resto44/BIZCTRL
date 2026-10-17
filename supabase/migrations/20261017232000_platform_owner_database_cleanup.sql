-- Platform Owner data hygiene. Approved disposable objects only.
-- No DELETE runs in this migration. All execution requires MFA, a fresh scan,
-- a typed confirmation, and a required reason with an audit log.
-- All other inactive rows (including finance, organizations and users)
-- intentionally remain protected.
CREATE OR REPLACE FUNCTION public.platform_owner_cleanup_preview(
  p_category text DEFAULT 'all'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp SET row_security=off
AS $$
DECLARE
  v_inv_ids uuid[] := ARRAY[]::uuid[];
  v_push_ids uuid[] := ARRAY[]::uuid[];
  v_inv_count bigint := 0;
  v_push_count bigint := 0;
  v_token text;
BEGIN
  PERFORM public.platform_owner_assert();
  IF p_category NOT IN ('all','expired_invitations','inactive_push_subscriptions') OR p_category IS NULL THEN
    RAISE EXCEPTION 'PLATFORM_CLEANUP_INVALID_CATEGORY' USING ERRCODE='22023';
  END IF;
  IF p_category IN ('all','expired_invitations') THEN
    SELECT count(*) INTO v_inv_count FROM public.erp_invitations
    WHERE status='pending' AND activated_at IS NULL AND revoked_at IS NULL
      AND expires_at < now()-interval '30 days';
    SELECT coalesce(array_agg(ids.id ORDER BY ids.id),ARRAY[]::uuid[])
      INTO v_inv_ids FROM (
        SELECT id FROM public.erp_invitations
        WHERE status='pending' AND activated_at IS NULL AND revoked_at IS NULL
          AND expires_at < now()-interval '30 days'
        ORDER BY id LIMIT 100
      ) ids;
  END IF;
  IF p_category IN ('all','inactive_push_subscriptions') THEN
    SELECT count(*) INTO v_push_count FROM public.push_subscriptions
    WHERE is_active IS FALSE AND created_at < now()-interval '90 days';
    SELECT coalesce(array_agg(ids.id ORDER BY ids.id),ARRAY[]::uuid[])
      INTO v_push_ids FROM (
        SELECT id FROM public.push_subscriptions
        WHERE is_active IS FALSE AND created_at < now()-interval '90 days'
        ORDER BY id LIMIT 100
      ) ids;
  END IF;
  v_token:=md5(p_category||':'||
    array_to_string(v_inv_ids,',')||':'||array_to_string(v_push_ids,','));
  RETURN jsonb_build_object(
    'category',p_category,
    'preview_token',v_token,
    'scan_time',clock_timestamp(),
    'eligible_total',v_inv_count+v_push_count,
    'batch_total',coalesce(array_length(v_inv_ids,1),0)+coalesce(array_length(v_push_ids,1),0),
    'batch_limit_per_category',100,
    'groups',jsonb_build_array(
      jsonb_build_object('category','expired_invitations','label','Expired unused invitations (30+ days)',
        'eligible',v_inv_count,'in_batch',coalesce(array_length(v_inv_ids,1),0)),
      jsonb_build_object('category','inactive_push_subscriptions','label','Inactive push endpoints (90+ days)',
        'eligible',v_push_count,'in_batch',coalesce(array_length(v_push_ids,1),0))
    ),
    'protected',jsonb_build_array(
      'organizations','subscription_payments','sales','purchases',
      'expenses','wallet_transactions','payroll','customers','suppliers',
      'inventory','auth_users','audit_logs','activated_invitations'
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.platform_owner_cleanup_preview(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_owner_cleanup_preview(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_owner_run_cleanup(
  p_category text,
  p_preview_token text,
  p_confirmation text,
  p_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp SET row_security=off
AS $$
DECLARE
  v_inv_ids uuid[] := ARRAY[]::uuid[];
  v_push_ids uuid[] := ARRAY[]::uuid[];
  v_token text;
  v_inv_n integer := 0;
  v_push_n integer := 0;
  v_deleted integer := 0;
  v_total integer := 0;
BEGIN
  PERFORM public.platform_owner_assert();
  IF p_category NOT IN ('all','expired_invitations','inactive_push_subscriptions') OR p_category IS NULL
    OR p_confirmation IS DISTINCT FROM 'CLEANUP'
    OR coalesce(length(btrim(p_reason)),0)<8 OR length(p_reason)>500
    OR p_preview_token IS NULL OR p_preview_token !~ '^[0-9a-f]{32}$'
  THEN RAISE EXCEPTION 'PLATFORM_CLEANUP_CONFIRMATION_REQUIRED' USING ERRCODE='22023';
  END IF;
  -- Never run two cleanup jobs against the same allowlist simultaneously.
  PERFORM pg_advisory_xact_lock(hashtextextended('platform_owner_cleanup',0));
  IF p_category IN ('all','expired_invitations') THEN
    SELECT coalesce(array_agg(ids.id ORDER BY ids.id),ARRAY[]::uuid[])
      INTO v_inv_ids FROM (
        SELECT id FROM public.erp_invitations
        WHERE status='pending' AND activated_at IS NULL AND revoked_at IS NULL
          AND expires_at < now()-interval '30 days'
        ORDER BY id LIMIT 100 FOR UPDATE
      ) ids;
  END IF;
  IF p_category IN ('all','inactive_push_subscriptions') THEN
    SELECT coalesce(array_agg(ids.id ORDER BY ids.id),ARRAY[]::uuid[])
      INTO v_push_ids FROM (
        SELECT id FROM public.push_subscriptions
        WHERE is_active IS FALSE AND created_at < now()-interval '90 days'
        ORDER BY id LIMIT 100 FOR UPDATE
      ) ids;
  END IF;
  v_token:=md5(p_category||':'||
    array_to_string(v_inv_ids,',')||':'||array_to_string(v_push_ids,','));
  IF v_token IS DISTINCT FROM p_preview_token THEN
    RAISE EXCEPTION 'PLATFORM_CLEANUP_SCAN_CHANGED' USING ERRCODE='40001';
  END IF;
  v_inv_n:=coalesce(array_length(v_inv_ids,1),0);
  v_push_n:=coalesce(array_length(v_push_ids,1),0);
  IF v_inv_n+v_push_n=0 THEN
    RAISE EXCEPTION 'PLATFORM_CLEANUP_NO_ELIGIBLE_RECORDS' USING ERRCODE='22023';
  END IF;
  -- All rows are rechecked even after the preview (single DB transaction).
  DELETE FROM public.erp_invitations
  WHERE id=ANY(v_inv_ids) AND status='pending' AND activated_at IS NULL
    AND revoked_at IS NULL AND expires_at < now()-interval '30 days';
  GET DIAGNOSTICS v_deleted=ROW_COUNT;
  IF v_deleted<>v_inv_n THEN
    RAISE EXCEPTION 'PLATFORM_CLEANUP_INVITATIONS_CHANGED' USING ERRCODE='40001';
  END IF;
  v_total:=v_deleted;
  DELETE FROM public.push_subscriptions
  WHERE id=ANY(v_push_ids) AND is_active IS FALSE
    AND created_at < now()-interval '90 days';
  GET DIAGNOSTICS v_deleted=ROW_COUNT;
  IF v_deleted<>v_push_n THEN
    RAISE EXCEPTION 'PLATFORM_CLEANUP_PUSH_CHANGED' USING ERRCODE='40001';
  END IF;
  v_total:=v_total+v_deleted;

  -- Persistent audit without storing invitation token hashes or push credentials.
  PERFORM public.platform_owner_log('database_cleanup','platform',NULL,NULL,
    jsonb_build_object('category',p_category,
      'deleted_total',v_total,'expired_invitations',v_inv_n,
      'inactive_push_subscriptions',v_push_n,'reason',p_reason,
      'preview_token',v_token,'retention_invitations_days',30,
      'retention_push_days',90));
  RETURN jsonb_build_object('success',true,'deleted_total',v_total,
    'expired_invitations',v_inv_n,'inactive_push_subscriptions',v_push_n,
    'category',p_category);
END;
$$;
REVOKE ALL ON FUNCTION public.platform_owner_run_cleanup(text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_owner_run_cleanup(text,text,text,text) TO authenticated;
COMMENT ON FUNCTION public.platform_owner_run_cleanup(text,text,text,text) IS
'Platform owner MFA-only, manually confirmed, auditable, maximum 100 expired never-accepted invitations and 100 old inactive push endpoints per run. Does not delete any financial, business, customer or organization data.';
