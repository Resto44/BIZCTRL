-- Safe Platform Owner permanent Organization deletion.
-- A tenant with any business, financial, payment, or unclassified references
-- is NOT deleted. Only an empty administrative shell can be hard-deleted.
-- There is no client-side delete-from-restaurants endpoint.
CREATE OR REPLACE FUNCTION public.platform_owner_organization_deletion_check(p_restaurant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public,pg_temp SET row_security = off
AS $$
DECLARE
  v_org public.restaurants%ROWTYPE;
  v_branches uuid[];
  v_ref record;
  v_where text;
  v_exists boolean;
  v_blockers text[] := '{}'::text[];
  v_allow text[] := ARRAY[
    'public.branches',
    'public.erp_memberships',
    'public.erp_registrations',
    'public.branch_assignments',
    'public.subscriptions',
    'public.subscription_events',
    'public.subscription_usage',
    'public.subscription_feature_overrides',
    'public.tenant_settings',
    'public.org_settings',
    'public.brand_settings',
    'public.erp_role_permissions',
    'public.tenant_permissions',
    'public.role_templates',
    'public.dashboard_configurations',
    'public.workspace_saved_views',
    'public.app_settings',
    'public.org_currencies',
    'public.owner_push_preferences',
    'public.platform_owner_activity_logs'
  ];
BEGIN
  PERFORM public.platform_owner_assert();
  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'PLATFORM_ORGANIZATION_NOT_FOUND' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_org FROM public.restaurants WHERE id=p_restaurant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found',false,'eligible',false,'blockers',jsonb_build_array('not_found'));
  END IF;
  SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO v_branches FROM public.branches
    WHERE restaurant_id=p_restaurant_id;

  -- No auto-cancellation of live provider billing or active subscriptions.
  IF EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.restaurant_id=p_restaurant_id AND
      (s.subscription_status IN ('ACTIVE','PAST_DUE','PENDING_PAYMENT')
        OR coalesce(to_jsonb(s)->>'provider_subscription_id','') <> ''
        OR coalesce(to_jsonb(s)->>'paddle_subscription_id','') <> '')
  ) THEN
    v_blockers:=array_append(v_blockers,'active_or_provider_subscription');
  END IF;

  -- Discover all direct and indirect tenant-key references. Fail closed:
  -- an unclassified table is considered business data, never auto-purged.
  -- This covers tables even when their restaurant_id has no FK, and rows
  -- linked only to one of the organization's branch UUIDs.
  FOR v_ref IN
    SELECT n.nspname AS schema_name, c.relname AS table_name,
      bool_or(a.attname='restaurant_id' AND a.atttypid='uuid'::regtype) AS restaurant_uuid,
      bool_or(a.attname='restaurant_id' AND a.atttypid<>'uuid'::regtype) AS restaurant_text,
      bool_or(a.attname='organization_id' AND a.atttypid='uuid'::regtype) AS organization_uuid,
      bool_or(a.attname='org_id' AND a.atttypid IN ('text'::regtype,'character varying'::regtype)) AS org_text,
      bool_or(a.attname='org_key' AND a.atttypid IN ('text'::regtype,'character varying'::regtype)) AS org_key_text,
      bool_or(a.attname='branch_id' AND a.atttypid='uuid'::regtype) AS branch_uuid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE n.nspname IN ('public','restaurant_pos_private','retail_pos_private')
      AND c.relkind IN ('r','p')
      AND a.attname IN ('restaurant_id','organization_id','org_id','org_key','branch_id')
    GROUP BY n.nspname,c.relname
    ORDER BY n.nspname,c.relname
  LOOP
    IF (v_ref.schema_name || '.' || v_ref.table_name)=ANY(v_allow)
      OR (v_ref.schema_name='public' AND v_ref.table_name='restaurants')
    THEN CONTINUE; END IF;
    v_where:='';
    IF v_ref.restaurant_uuid THEN
      v_where:=v_where||'restaurant_id = $1';
    ELSIF v_ref.restaurant_text THEN
      v_where:=v_where||'(restaurant_id = $2 OR restaurant_id = $3)';
    END IF;
    IF v_ref.organization_uuid THEN
      v_where:=v_where||CASE WHEN v_where='' THEN '' ELSE ' OR ' END||'organization_id = $1';
    END IF;
    IF v_ref.org_text THEN
      v_where:=v_where||CASE WHEN v_where='' THEN '' ELSE ' OR ' END||'org_id = $3';
    END IF;
    IF v_ref.org_key_text THEN
      v_where:=v_where||CASE WHEN v_where='' THEN '' ELSE ' OR ' END||'org_key = $3';
    END IF;
    IF v_ref.branch_uuid AND coalesce(array_length(v_branches,1),0)>0 THEN
      v_where:=v_where||CASE WHEN v_where='' THEN '' ELSE ' OR ' END||'branch_id = ANY($4)';
    END IF;
    IF v_where='' THEN CONTINUE; END IF;
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %s LIMIT 1)',
      v_ref.schema_name,v_ref.table_name,v_where)
      INTO v_exists USING p_restaurant_id,p_restaurant_id::text,v_org.org_id,v_branches;
    IF v_exists THEN
      v_blockers:=array_append(v_blockers,v_ref.schema_name||'.'||v_ref.table_name);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'found',true,'eligible',coalesce(array_length(v_blockers,1),0)=0,
    'organization_id',v_org.id,
    'organization_name',v_org.name,
    'branch_count',coalesce(array_length(v_branches,1),0),
    'blockers',to_jsonb(v_blockers)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_owner_organization_deletion_check(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_owner_organization_deletion_check(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_owner_delete_organization(
  p_restaurant_id uuid, p_confirm_name text, p_confirm_phrase text, p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public,pg_temp SET row_security = off
AS $$
DECLARE
  v_org public.restaurants%ROWTYPE;
  v_check jsonb;
  v_count integer;
BEGIN
  PERFORM public.platform_owner_assert();
  IF p_restaurant_id IS NULL OR coalesce(p_confirm_phrase,'')<>'DELETE ORGANIZATION' THEN
    RAISE EXCEPTION 'PLATFORM_ORGANIZATION_CONFIRMATION_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF length(coalesce(p_reason,''))>500 THEN
    RAISE EXCEPTION 'PLATFORM_ORGANIZATION_REASON_TOO_LONG' USING ERRCODE='22023';
  END IF;
  -- Locks the tenant row so concurrent new FK-linked writes cannot race
  -- past the recheck and get silently cascaded.
  SELECT * INTO v_org FROM public.restaurants WHERE id=p_restaurant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted',false,'reason','not_found');
  END IF;
  IF p_confirm_name IS DISTINCT FROM v_org.name THEN
    RAISE EXCEPTION 'PLATFORM_ORGANIZATION_NAME_MISMATCH' USING ERRCODE='22023';
  END IF;
  v_check:=public.platform_owner_organization_deletion_check(p_restaurant_id);
  IF NOT coalesce((v_check->>'eligible')::boolean,false) THEN
    RETURN jsonb_build_object('deleted',false,'reason','has_protected_records',
      'blockers',v_check->'blockers');
  END IF;

  -- Explicitly remove safe configuration rows whose FK uses NO ACTION.
  -- Everything else must be empty or CASCADE-protected by the DB schema.
  DELETE FROM public.app_settings WHERE restaurant_id=p_restaurant_id OR (restaurant_id IS NULL AND org_id=v_org.org_id);
  UPDATE public.restaurants SET branch_id=NULL WHERE id=p_restaurant_id AND branch_id IS NOT NULL;
  DELETE FROM public.restaurants WHERE id=p_restaurant_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'PLATFORM_ORGANIZATION_DELETE_FAILED' USING ERRCODE='P0001';
  END IF;

  -- Preserve audit evidence; the audit FK SET NULL on deleted restaurant.
  PERFORM public.platform_owner_log('organization_deleted','organization',
    p_restaurant_id::text,NULL,
    jsonb_build_object('organization_name',v_org.name,'organization_id',v_org.id,
      'org_code',v_org.org_code,'reason',p_reason,
      'branch_count',v_check->'branch_count',
      'mode','empty_tenant_permanent_delete'));
  RETURN jsonb_build_object('deleted',true,'organization_id',v_org.id,
    'organization_name',v_org.name);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_owner_delete_organization(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_owner_delete_organization(uuid,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.platform_owner_delete_organization(uuid,text,text,text) IS
'Platform Owner/MFA only. Permanently removes a verified empty tenant shell after exact typed confirmation; blocks any financial/operational or unclassified tenant/branch records. Never deletes auth.users or storage receipts.';
