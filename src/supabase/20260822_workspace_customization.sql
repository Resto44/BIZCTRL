-- BizCTRL organization workspace customization (additive, tenant-scoped)
-- This migration intentionally does not alter subscriptions, plans, entitlements,
-- Paddle configuration, checkout, webhook, payment, or accounting tables.

BEGIN;

-- Product-specific custom values are kept separate from canonical product columns.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS custom_attributes jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_custom_attributes_object'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_custom_attributes_object
      CHECK (jsonb_typeof(custom_attributes) = 'object');
  END IF;
END;
$constraint$;

-- Reuse the existing owner/delegated customization capability so no parallel
-- role or permission architecture is introduced.
CREATE OR REPLACE FUNCTION public.erp_can_manage_workspace_customization(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $function$
  SELECT public.erp_can_manage_dashboard_customization(p_restaurant_id);
$function$;

-- Organization-wide configuration is saved only through this server-side
-- function.  The allow-list keeps the JSON namespace presentation-only.
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
  WHERE key NOT IN (
    'version', 'navigation', 'labels', 'fields', 'forms', 'tables', 'reports',
    'workflows', 'notifications', 'regional', 'documents'
  )
  LIMIT 1;
  IF v_invalid_key IS NOT NULL THEN
    RAISE EXCEPTION 'WORKSPACE_CUSTOMIZATION_KEY_NOT_ALLOWED: %', v_invalid_key;
  END IF;

  IF p_customization::text ~* '<\s*\/?(script|iframe|object|embed|style)\b|javascript\s*:' THEN
    RAISE EXCEPTION 'WORKSPACE_CUSTOMIZATION_UNSAFE_CONTENT';
  END IF;

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

  INSERT INTO public.audit_logs (
    restaurant_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    created_by,
    created_date
  )
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

-- Existing org_settings consumers do not use this table in the current runtime.
-- Restrict direct REST mutations; trusted server functions own organization-wide
-- configuration writes and preserve the canonical tenant boundary.
DROP POLICY IF EXISTS "org_settings_org_access" ON public.org_settings;
DROP POLICY IF EXISTS org_settings_workspace_select ON public.org_settings;
CREATE POLICY org_settings_workspace_select
ON public.org_settings
FOR SELECT
TO authenticated
USING (public.erp_can_access_scope(organization_id, NULL));

REVOKE INSERT, UPDATE, DELETE ON public.org_settings FROM anon, authenticated;
GRANT SELECT ON public.org_settings TO authenticated;

-- Durable personal and organization-shared saved views are the only new table.
-- Their definitions are presentation metadata; no query text, executable content,
-- permissions, billing values, or API endpoints are accepted or consumed.
CREATE TABLE IF NOT EXISTS public.workspace_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  definition jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(definition) = 'object'),
  is_shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_saved_views_restaurant_updated
  ON public.workspace_saved_views (restaurant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_saved_views_creator
  ON public.workspace_saved_views (restaurant_id, created_by);

CREATE OR REPLACE FUNCTION public.workspace_saved_views_set_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.created_at := COALESCE(NEW.created_at, now());
  END IF;
  IF NEW.definition::text ~* '<\s*\/?(script|iframe|object|embed|style)\b|javascript\s*:' THEN
    RAISE EXCEPTION 'WORKSPACE_SAVED_VIEW_UNSAFE_CONTENT';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS workspace_saved_views_set_audit_fields ON public.workspace_saved_views;
CREATE TRIGGER workspace_saved_views_set_audit_fields
BEFORE INSERT OR UPDATE ON public.workspace_saved_views
FOR EACH ROW EXECUTE FUNCTION public.workspace_saved_views_set_audit_fields();

ALTER TABLE public.workspace_saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_saved_views_select ON public.workspace_saved_views;
CREATE POLICY workspace_saved_views_select
ON public.workspace_saved_views
FOR SELECT
TO authenticated
USING (
  public.erp_can_access_scope(restaurant_id, NULL)
  AND (is_shared OR created_by = auth.uid())
);

DROP POLICY IF EXISTS workspace_saved_views_insert ON public.workspace_saved_views;
CREATE POLICY workspace_saved_views_insert
ON public.workspace_saved_views
FOR INSERT
TO authenticated
WITH CHECK (
  public.erp_can_access_scope(restaurant_id, NULL)
  AND created_by = auth.uid()
  AND (NOT is_shared OR public.erp_can_manage_workspace_customization(restaurant_id))
);

DROP POLICY IF EXISTS workspace_saved_views_update ON public.workspace_saved_views;
CREATE POLICY workspace_saved_views_update
ON public.workspace_saved_views
FOR UPDATE
TO authenticated
USING (
  public.erp_can_access_scope(restaurant_id, NULL)
  AND (created_by = auth.uid() OR (is_shared AND public.erp_can_manage_workspace_customization(restaurant_id)))
)
WITH CHECK (
  public.erp_can_access_scope(restaurant_id, NULL)
  AND (created_by = auth.uid() OR public.erp_can_manage_workspace_customization(restaurant_id))
  AND (NOT is_shared OR public.erp_can_manage_workspace_customization(restaurant_id))
);

DROP POLICY IF EXISTS workspace_saved_views_delete ON public.workspace_saved_views;
CREATE POLICY workspace_saved_views_delete
ON public.workspace_saved_views
FOR DELETE
TO authenticated
USING (
  public.erp_can_access_scope(restaurant_id, NULL)
  AND (created_by = auth.uid() OR (is_shared AND public.erp_can_manage_workspace_customization(restaurant_id)))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_saved_views TO authenticated;

-- Supported document patterns are looked up on the server and interpolated only
-- with server-issued date and sequence values.  The browser never generates an
-- invoice number.
CREATE OR REPLACE FUNCTION public.erp_workspace_document_pattern(
  p_restaurant_id uuid,
  p_key text,
  p_default text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $function$
  SELECT CASE
    WHEN p_key = 'sales_pattern' AND settings #>> '{workspace_customization,documents,sales_pattern}' IN ('INV-{YYYYMMDD}-{SEQ:4}', 'INV-{YYYY}-{SEQ:6}')
      THEN settings #>> '{workspace_customization,documents,sales_pattern}'
    WHEN p_key = 'purchase_pattern' AND settings #>> '{workspace_customization,documents,purchase_pattern}' IN ('PUR-{YYYYMMDD}-{SEQ:4}', 'PUR-{YYYY}-{SEQ:6}')
      THEN settings #>> '{workspace_customization,documents,purchase_pattern}'
    ELSE p_default
  END
  FROM public.org_settings
  WHERE organization_id = p_restaurant_id
  UNION ALL SELECT p_default
  WHERE NOT EXISTS (SELECT 1 FROM public.org_settings WHERE organization_id = p_restaurant_id)
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.erp_render_workspace_document_number(
  p_pattern text,
  p_date date,
  p_sequence integer
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO public
AS $function$
  SELECT replace(
    replace(
      replace(
        replace(p_pattern, '{YYYYMMDD}', to_char(p_date, 'YYYYMMDD')),
        '{YYYY}', to_char(p_date, 'YYYY')
      ),
      '{SEQ:4}', lpad(p_sequence::text, 4, '0')
    ),
    '{SEQ:6}', lpad(p_sequence::text, 6, '0')
  );
$function$;

CREATE OR REPLACE FUNCTION public.generate_sales_invoice_number(
  p_restaurant_id uuid,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_sequence integer;
  v_pattern text;
BEGIN
  IF NOT public.erp_can_access_scope(p_restaurant_id, NULL) THEN
    RAISE EXCEPTION 'SALES_INVOICE_SCOPE_DENIED';
  END IF;

  INSERT INTO public.invoice_sequences (restaurant_id, sequence_date, last_sequence)
  VALUES (p_restaurant_id, p_date, 1)
  ON CONFLICT (restaurant_id, sequence_date)
  DO UPDATE SET last_sequence = public.invoice_sequences.last_sequence + 1
  RETURNING last_sequence INTO v_sequence;

  v_pattern := public.erp_workspace_document_pattern(p_restaurant_id, 'sales_pattern', 'INV-{YYYYMMDD}-{SEQ:4}');
  RETURN public.erp_render_workspace_document_number(v_pattern, p_date, v_sequence);
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_purchase_invoice_number(
  p_restaurant_id uuid,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_sequence integer;
  v_pattern text;
BEGIN
  IF NOT public.erp_can_access_scope(p_restaurant_id, NULL) THEN
    RAISE EXCEPTION 'PURCHASE_INVOICE_SCOPE_DENIED';
  END IF;

  INSERT INTO public.invoice_sequences (restaurant_id, sequence_date, last_sequence)
  VALUES (p_restaurant_id, p_date, 1)
  ON CONFLICT (restaurant_id, sequence_date)
  DO UPDATE SET last_sequence = public.invoice_sequences.last_sequence + 1
  RETURNING last_sequence INTO v_sequence;

  v_pattern := public.erp_workspace_document_pattern(p_restaurant_id, 'purchase_pattern', 'PUR-{YYYYMMDD}-{SEQ:4}');
  RETURN public.erp_render_workspace_document_number(v_pattern, p_date, v_sequence);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.erp_can_manage_workspace_customization(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.erp_update_workspace_customization(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.workspace_saved_views_set_audit_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erp_workspace_document_pattern(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.erp_render_workspace_document_number(text, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_can_manage_workspace_customization(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_update_workspace_customization(uuid, jsonb) TO authenticated;

COMMIT;
