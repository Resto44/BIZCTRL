-- Tenant-scoped business template and module customization.
-- Business mode and workspace configuration are committed atomically through
-- an authorized, audited RPC. Existing operational records are not modified.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_update_workspace_customization(
  p_restaurant_id uuid,
  p_customization jsonb
)
RETURNS public.org_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
SET row_security = off
AS $function$
DECLARE
  v_old_settings jsonb := '{}'::jsonb;
  v_next_settings jsonb;
  v_result public.org_settings;
  v_invalid_key text;
BEGIN
  IF p_restaurant_id IS NULL OR NOT public.erp_can_manage_workspace_customization(p_restaurant_id) THEN
    RAISE EXCEPTION 'WORKSPACE_CUSTOMIZATION_NOT_AUTHORIZED';
  END IF;
  IF jsonb_typeof(COALESCE(p_customization, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'WORKSPACE_CUSTOMIZATION_INVALID';
  END IF;
  IF octet_length(COALESCE(p_customization, '{}'::jsonb)::text) > 131072 THEN
    RAISE EXCEPTION 'WORKSPACE_CUSTOMIZATION_TOO_LARGE';
  END IF;

  SELECT key INTO v_invalid_key
  FROM jsonb_object_keys(COALESCE(p_customization, '{}'::jsonb)) AS key
  WHERE key NOT IN (
    'version', 'business', 'navigation', 'labels', 'fields', 'forms', 'tables',
    'reports', 'workflows', 'notifications', 'regional', 'documents'
  )
  LIMIT 1;
  IF v_invalid_key IS NOT NULL THEN
    RAISE EXCEPTION 'WORKSPACE_CUSTOMIZATION_KEY_NOT_ALLOWED: %', v_invalid_key;
  END IF;
  IF p_customization::text ~* '<\s*\/?(script|iframe|object|embed|style)\b|javascript\s*:' THEN
    RAISE EXCEPTION 'WORKSPACE_CUSTOMIZATION_UNSAFE_CONTENT';
  END IF;

  PERFORM public.erp_validate_product_custom_fields(COALESCE(p_customization #> '{fields,products}', '[]'::jsonb));

  SELECT settings INTO v_old_settings
  FROM public.org_settings
  WHERE organization_id = p_restaurant_id
  FOR UPDATE;
  v_old_settings := COALESCE(v_old_settings, '{}'::jsonb);
  v_next_settings := v_old_settings || jsonb_build_object('workspace_customization', p_customization);

  INSERT INTO public.org_settings (organization_id, settings, created_at, updated_at)
  VALUES (p_restaurant_id, v_next_settings, now(), now())
  ON CONFLICT (organization_id)
  DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()
  RETURNING * INTO v_result;

  INSERT INTO public.audit_logs (restaurant_id, action, entity_type, entity_id, old_values, new_values, created_by, created_date)
  VALUES (
    p_restaurant_id,
    'workspace_customization_updated',
    'organization_workspace_customization',
    p_restaurant_id::text,
    jsonb_build_object('workspace_customization', v_old_settings -> 'workspace_customization'),
    jsonb_build_object('workspace_customization', p_customization),
    auth.uid()::text,
    now()
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.erp_update_business_workspace(
  p_restaurant_id uuid,
  p_business_mode text,
  p_customization jsonb
)
RETURNS public.org_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
SET row_security = off
AS $function$
DECLARE
  v_old_mode text;
  v_result public.org_settings;
BEGIN
  IF p_restaurant_id IS NULL OR NOT public.erp_can_manage_workspace_customization(p_restaurant_id) THEN
    RAISE EXCEPTION 'WORKSPACE_CUSTOMIZATION_NOT_AUTHORIZED';
  END IF;
  IF p_business_mode IS NULL OR p_business_mode NOT IN (
    'restaurant', 'cafe', 'retail', 'warehouse', 'factory',
    'pharmacy', 'clinic', 'wholesale', 'services', 'other'
  ) THEN
    RAISE EXCEPTION 'BUSINESS_MODE_INVALID';
  END IF;

  SELECT business_mode::text INTO v_old_mode
  FROM public.restaurants
  WHERE id = p_restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BUSINESS_NOT_FOUND';
  END IF;

  p_customization := COALESCE(p_customization, '{}'::jsonb)
    || jsonb_build_object(
      'business',
      COALESCE(p_customization -> 'business', '{}'::jsonb)
        || jsonb_build_object('template', p_business_mode)
    );

  UPDATE public.restaurants
  SET business_mode = p_business_mode::public.business_mode_type,
      updated_at = now()
  WHERE id = p_restaurant_id;

  v_result := public.erp_update_workspace_customization(p_restaurant_id, p_customization);

  IF v_old_mode IS DISTINCT FROM p_business_mode THEN
    INSERT INTO public.audit_logs (restaurant_id, action, entity_type, entity_id, old_values, new_values, created_by, created_date)
    VALUES (
      p_restaurant_id,
      'business_mode_updated',
      'restaurant',
      p_restaurant_id::text,
      jsonb_build_object('business_mode', v_old_mode),
      jsonb_build_object('business_mode', p_business_mode),
      auth.uid()::text,
      now()
    );
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.erp_update_workspace_customization(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_update_workspace_customization(uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.erp_update_business_workspace(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_update_business_workspace(uuid, text, jsonb) TO authenticated;

COMMIT;
