-- Make the owner's registration portal selection authoritative from signup to
-- the tenant's initial ERP workspace. Staff invitation signup remains tenant-
-- assigned and never receives a browser-controlled portal selector.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_registration_workspace_for_portal(p_business_mode text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO public, pg_temp
AS $function$
  SELECT CASE
    WHEN p_business_mode NOT IN (
      'restaurant', 'cafe', 'retail', 'warehouse', 'factory',
      'pharmacy', 'clinic', 'wholesale', 'services', 'other'
    ) THEN NULL
    ELSE jsonb_build_object(
      'version', 2,
      'business', jsonb_build_object(
        'template', p_business_mode,
        'disabled_modules', to_jsonb(CASE p_business_mode
          WHEN 'restaurant' THEN ARRAY['barcode', 'sku_management', 'product_variants', 'batch_lot_tracking', 'expiry_tracking', 'serial_numbers']::text[]
          WHEN 'cafe' THEN ARRAY['barcode', 'sku_management', 'product_variants', 'batch_lot_tracking', 'expiry_tracking', 'serial_numbers']::text[]
          WHEN 'retail' THEN ARRAY[]::text[]
          WHEN 'warehouse' THEN ARRAY['sales', 'cash_register', 'debt_management', 'network_settlement', 'ai_analytics', 'product_variants', 'expiry_tracking', 'serial_numbers']::text[]
          WHEN 'factory' THEN ARRAY['cash_register', 'network_settlement', 'ai_analytics', 'barcode', 'sku_management', 'product_variants', 'expiry_tracking', 'serial_numbers']::text[]
          WHEN 'pharmacy' THEN ARRAY['ai_analytics', 'product_variants']::text[]
          WHEN 'clinic' THEN ARRAY['cash_register', 'network_settlement', 'ai_analytics', 'barcode', 'sku_management', 'product_variants', 'batch_lot_tracking']::text[]
          WHEN 'wholesale' THEN ARRAY['cash_register', 'ai_analytics', 'serial_numbers']::text[]
          WHEN 'services' THEN ARRAY['cash_register', 'purchase', 'inventory', 'product_management', 'supplier_management', 'network_settlement', 'barcode', 'sku_management', 'product_variants', 'batch_lot_tracking', 'expiry_tracking', 'serial_numbers']::text[]
          ELSE ARRAY['barcode', 'sku_management', 'product_variants', 'batch_lot_tracking', 'expiry_tracking', 'serial_numbers']::text[]
        END)
      )
    )
  END;
$function$;

REVOKE EXECUTE ON FUNCTION public.erp_registration_workspace_for_portal(text) FROM PUBLIC, anon, authenticated;

-- Patch the live Auth trigger definition in place. This preserves the existing
-- clean Platform Owner Auth bypass and invitation-only security guards that were
-- added after the trigger's original migration.
DO $migration$
DECLARE
  v_definition text;
  v_declaration_original text := E'  requested_role text;';
  v_declaration_replacement text := E'  requested_role text;\n  requested_business_mode text;';
  v_owner_guard_original text := E'  IF requested_role <> ''owner'' THEN\n    RAISE EXCEPTION ''Non-owner accounts are invitation-only. Ask an organization owner to send an invitation.'';\n  END IF;';
  v_owner_guard_replacement text := E'  IF requested_role <> ''owner'' THEN\n    RAISE EXCEPTION ''Non-owner accounts are invitation-only. Ask an organization owner to send an invitation.'';\n  END IF;\n\n  requested_business_mode := lower(btrim(coalesce(NEW.raw_user_meta_data->>''business_type'', '''')));\n  IF requested_business_mode NOT IN (\n    ''restaurant'', ''cafe'', ''retail'', ''warehouse'', ''factory'',\n    ''pharmacy'', ''clinic'', ''wholesale'', ''services'', ''other''\n  ) THEN\n    RAISE EXCEPTION ''Owner setup requires a valid ERP portal'';\n  END IF;';
  v_mode_original text := E'    CASE WHEN coalesce(NEW.raw_user_meta_data->>''business_type'', ''restaurant'') IN (''retail'', ''pharmacy'', ''wholesale'')\n      THEN ''retail''::business_mode_type ELSE ''restaurant''::business_mode_type END,\n    coalesce(nullif(NEW.raw_user_meta_data->>''business_type'', ''''), ''restaurant''),';
  v_mode_replacement text := E'    requested_business_mode::public.business_mode_type,\n    requested_business_mode,';
  v_settings_anchor text := E'  ) RETURNING id INTO created_restaurant;\n\n  INSERT INTO public.branches (';
  v_settings_replacement text := E'  ) RETURNING id INTO created_restaurant;\n\n  INSERT INTO public.org_settings (organization_id, settings, created_at, updated_at)\n  VALUES (\n    created_restaurant,\n    jsonb_build_object(\n      ''workspace_customization'',\n      public.erp_registration_workspace_for_portal(requested_business_mode)\n    ),\n    now(),\n    now()\n  )\n  ON CONFLICT (organization_id) DO UPDATE\n  SET settings = coalesce(public.org_settings.settings, ''{}''::jsonb)\n      || jsonb_build_object(\n        ''workspace_customization'',\n        public.erp_registration_workspace_for_portal(requested_business_mode)\n      ),\n      updated_at = now();\n\n  INSERT INTO public.branches (';
BEGIN
  SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure)
  INTO v_definition;

  IF position('requested_business_mode text;' IN v_definition) = 0 THEN
    IF position(v_declaration_original IN v_definition) = 0
       OR position(v_owner_guard_original IN v_definition) = 0
       OR position(v_mode_original IN v_definition) = 0
       OR position(v_settings_anchor IN v_definition) = 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'OWNER_PORTAL_REGISTRATION_TRIGGER_SHAPE_UNEXPECTED';
    END IF;

    v_definition := replace(v_definition, v_declaration_original, v_declaration_replacement);
    v_definition := replace(v_definition, v_owner_guard_original, v_owner_guard_replacement);
    v_definition := replace(v_definition, v_mode_original, v_mode_replacement);
    v_definition := replace(v_definition, v_settings_anchor, v_settings_replacement);
    EXECUTE v_definition;
  END IF;
END;
$migration$;

-- Keep the legacy descriptive column aligned when an owner later changes the
-- template from Customize Workspace.
DO $migration$
DECLARE
  v_definition text;
  v_original text := E'  SET business_mode = p_business_mode::public.business_mode_type,\n      updated_at = now()';
  v_replacement text := E'  SET business_mode = p_business_mode::public.business_mode_type,\n      business_type = p_business_mode,\n      updated_at = now()';
BEGIN
  SELECT pg_get_functiondef('public.erp_update_business_workspace(uuid,text,jsonb)'::regprocedure)
  INTO v_definition;

  IF position('business_type = p_business_mode' IN v_definition) = 0 THEN
    IF position(v_original IN v_definition) = 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BUSINESS_WORKSPACE_SYNC_FUNCTION_SHAPE_UNEXPECTED';
    END IF;
    v_definition := replace(v_definition, v_original, v_replacement);
    EXECUTE v_definition;
  END IF;
END;
$migration$;

COMMIT;
