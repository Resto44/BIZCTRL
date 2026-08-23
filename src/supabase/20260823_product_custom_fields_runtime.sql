-- Product custom fields runtime hardening.
-- Reuses public.org_settings.settings.workspace_customization for tenant definitions
-- and public.products.custom_attributes for tenant-scoped values. No parallel table is created.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_validate_product_custom_fields(p_fields jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO public
AS $function$
DECLARE
  v_field jsonb;
  v_id text;
  v_label text;
  v_type text;
  v_options jsonb;
  v_duplicate_id text;
BEGIN
  IF jsonb_typeof(COALESCE(p_fields, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_fields, '[]'::jsonb)) > 25 THEN
    RAISE EXCEPTION 'PRODUCT_CUSTOM_FIELDS_INVALID_COLLECTION';
  END IF;

  SELECT field_id INTO v_duplicate_id
  FROM (
    SELECT btrim(value ->> 'id') AS field_id
    FROM jsonb_array_elements(COALESCE(p_fields, '[]'::jsonb)) AS field_row(value)
    GROUP BY btrim(value ->> 'id')
    HAVING count(*) > 1
  ) AS duplicates
  LIMIT 1;
  IF v_duplicate_id IS NOT NULL AND v_duplicate_id <> '' THEN
    RAISE EXCEPTION 'PRODUCT_CUSTOM_FIELD_DUPLICATE: %', v_duplicate_id;
  END IF;

  FOR v_field IN SELECT value FROM jsonb_array_elements(COALESCE(p_fields, '[]'::jsonb)) AS field_row(value)
  LOOP
    IF jsonb_typeof(v_field) <> 'object' THEN
      RAISE EXCEPTION 'PRODUCT_CUSTOM_FIELD_INVALID';
    END IF;

    v_id := btrim(v_field ->> 'id');
    v_label := btrim(v_field ->> 'label');
    v_type := v_field ->> 'type';
    v_options := COALESCE(v_field -> 'options', '[]'::jsonb);

    IF v_id = '' OR v_id IS NULL OR v_id !~ '^[A-Za-z0-9_-]{1,72}$' THEN
      RAISE EXCEPTION 'PRODUCT_CUSTOM_FIELD_NAME_INVALID';
    END IF;
    IF v_label = '' OR char_length(v_label) > 80 THEN
      RAISE EXCEPTION 'PRODUCT_CUSTOM_FIELD_LABEL_INVALID';
    END IF;
    IF v_type NOT IN ('text', 'number', 'decimal', 'currency', 'date', 'datetime', 'boolean', 'select', 'multiselect', 'email', 'phone', 'url', 'long_text') THEN
      RAISE EXCEPTION 'PRODUCT_CUSTOM_FIELD_TYPE_INVALID: %', COALESCE(v_type, '');
    END IF;
    IF jsonb_typeof(v_options) <> 'array' OR jsonb_array_length(v_options) > 30 THEN
      RAISE EXCEPTION 'PRODUCT_CUSTOM_FIELD_OPTIONS_INVALID: %', v_id;
    END IF;
    IF v_type IN ('select', 'multiselect') AND jsonb_array_length(v_options) = 0 THEN
      RAISE EXCEPTION 'PRODUCT_CUSTOM_FIELD_OPTIONS_REQUIRED: %', v_id;
    END IF;
    IF COALESCE((v_field ->> 'required')::boolean, false) AND COALESCE((v_field ->> 'visible')::boolean, true) = false THEN
      RAISE EXCEPTION 'PRODUCT_CUSTOM_FIELD_REQUIRED_HIDDEN: %', v_id;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(v_options) AS options(option_value)
      WHERE btrim(option_value) = '' OR char_length(btrim(option_value)) > 80
    ) THEN
      RAISE EXCEPTION 'PRODUCT_CUSTOM_FIELD_OPTION_INVALID: %', v_id;
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements_text(v_options)) <> (SELECT count(DISTINCT lower(btrim(option_value))) FROM jsonb_array_elements_text(v_options) AS options(option_value)) THEN
      RAISE EXCEPTION 'PRODUCT_CUSTOM_FIELD_OPTIONS_DUPLICATE: %', v_id;
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.erp_update_workspace_customization(
  p_restaurant_id uuid,
  p_customization jsonb
)
RETURNS public.org_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
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
  IF octet_length(p_customization::text) > 131072 THEN
    RAISE EXCEPTION 'WORKSPACE_CUSTOMIZATION_TOO_LARGE';
  END IF;
  SELECT key INTO v_invalid_key
  FROM jsonb_object_keys(p_customization) AS key
  WHERE key NOT IN ('version', 'navigation', 'labels', 'fields', 'forms', 'tables', 'reports', 'workflows', 'notifications', 'regional', 'documents')
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

CREATE OR REPLACE FUNCTION public.erp_validate_product_custom_attributes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
SET row_security = off
AS $function$
DECLARE
  v_fields jsonb := '[]'::jsonb;
  v_field jsonb;
  v_id text;
  v_type text;
  v_value jsonb;
  v_value_text text;
BEGIN
  IF jsonb_typeof(COALESCE(NEW.custom_attributes, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'PRODUCT_CUSTOM_ATTRIBUTES_INVALID';
  END IF;

  SELECT COALESCE(settings #> '{workspace_customization,fields,products}', '[]'::jsonb)
  INTO v_fields
  FROM public.org_settings
  WHERE organization_id = NEW.restaurant_id;

  FOR v_field IN SELECT value FROM jsonb_array_elements(COALESCE(v_fields, '[]'::jsonb)) AS field_row(value)
  LOOP
    IF COALESCE((v_field ->> 'active')::boolean, true) = false THEN
      CONTINUE;
    END IF;
    v_id := v_field ->> 'id';
    v_type := v_field ->> 'type';
    v_value := NEW.custom_attributes -> v_id;
    IF COALESCE((v_field ->> 'required')::boolean, false) AND (v_value IS NULL OR v_value = 'null'::jsonb OR v_value = '""'::jsonb) THEN
      RAISE EXCEPTION 'PRODUCT_CUSTOM_ATTRIBUTE_REQUIRED: %', v_id;
    END IF;
    IF v_value IS NULL OR v_value = 'null'::jsonb THEN
      CONTINUE;
    END IF;
    v_value_text := trim(both '"' from v_value::text);
    IF v_type IN ('number', 'decimal', 'currency') AND (jsonb_typeof(v_value) NOT IN ('number', 'string') OR v_value_text !~ '^-?[0-9]+(\.[0-9]+)?$') THEN
      RAISE EXCEPTION 'PRODUCT_CUSTOM_ATTRIBUTE_NUMBER_INVALID: %', v_id;
    ELSIF v_type = 'boolean' AND jsonb_typeof(v_value) <> 'boolean' THEN
      RAISE EXCEPTION 'PRODUCT_CUSTOM_ATTRIBUTE_BOOLEAN_INVALID: %', v_id;
    ELSIF v_type = 'date' AND (jsonb_typeof(v_value) <> 'string' OR v_value_text !~ '^\d{4}-\d{2}-\d{2}$') THEN
      RAISE EXCEPTION 'PRODUCT_CUSTOM_ATTRIBUTE_DATE_INVALID: %', v_id;
    ELSIF v_type = 'select' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_field -> 'options', '[]'::jsonb)) AS options(option_value)
      WHERE option_value = v_value_text) THEN
      RAISE EXCEPTION 'PRODUCT_CUSTOM_ATTRIBUTE_OPTION_INVALID: %', v_id;
    ELSIF v_type = 'multiselect' AND (
      jsonb_typeof(v_value) <> 'array'
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_value) AS selected(selected_value) WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_field -> 'options', '[]'::jsonb)) AS options(option_value) WHERE option_value = selected_value))
    ) THEN
      RAISE EXCEPTION 'PRODUCT_CUSTOM_ATTRIBUTE_OPTIONS_INVALID: %', v_id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS products_validate_custom_attributes ON public.products;
CREATE TRIGGER products_validate_custom_attributes
BEFORE INSERT OR UPDATE OF restaurant_id, custom_attributes ON public.products
FOR EACH ROW EXECUTE FUNCTION public.erp_validate_product_custom_attributes();

REVOKE EXECUTE ON FUNCTION public.erp_validate_product_custom_fields(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.erp_validate_product_custom_attributes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erp_update_workspace_customization(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_update_workspace_customization(uuid, jsonb) TO authenticated;

COMMIT;
