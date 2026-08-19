-- The existing Auth user trigger provisions ERP tenant data for regular owner
-- signups and rejects all other unaffiliated users. A clean Platform Owner Auth
-- identity must not create a tenant, profile, membership, branch, or restaurant.
-- Only server-controlled app_metadata can take this branch; browser clients cannot
-- set app_metadata through the normal signup/update APIs.

DO $$
DECLARE
  v_definition text;
  v_original text := E'BEGIN\n  invitation_token :=';
  v_replacement text := E'BEGIN\n  IF coalesce(NEW.raw_app_meta_data ->> ''platform_owner_clean_provisioning'', ''false'') = ''true'' THEN\n    RETURN NEW;\n  END IF;\n\n  invitation_token :=';
BEGIN
  SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure)
  INTO v_definition;

  IF position('platform_owner_clean_provisioning' IN v_definition) = 0 THEN
    IF position(v_original IN v_definition) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_CLEAN_PROVISION_TRIGGER_SHAPE_UNEXPECTED';
    END IF;

    v_definition := replace(v_definition, v_original, v_replacement);
    EXECUTE v_definition;
  END IF;
END;
$$;
