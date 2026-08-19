-- Supabase Auth currently does not persist custom app_metadata soon enough for the
-- AFTER INSERT trigger. This one-time ticket is passed in raw_user_meta_data,
-- but is accepted only when its SHA-256 hash matches a pending/provisioning clean
-- Auth rebind job. The ticket is removed from the Auth metadata immediately after
-- user creation by the server-only provisioner.

DO $$
DECLARE
  v_definition text;
  v_original text := E'  IF coalesce(NEW.raw_app_meta_data ->> ''platform_owner_clean_provisioning'', ''false'') = ''true'' THEN\n    RETURN NEW;\n  END IF;';
  v_replacement text := E'  IF coalesce(NEW.raw_app_meta_data ->> ''platform_owner_clean_provisioning'', ''false'') = ''true''\n     OR EXISTS (\n       SELECT 1\n       FROM public.platform_owner_clean_auth_rebind_jobs j\n       WHERE j.status IN (''pending'', ''provisioning'')\n         AND j.invocation_nonce_hash = encode(extensions.digest(coalesce(NEW.raw_user_meta_data ->> ''platform_owner_clean_provisioning_nonce'', ''''), ''sha256''), ''hex'')\n     ) THEN\n    RETURN NEW;\n  END IF;';
BEGIN
  SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure)
  INTO v_definition;

  IF position('platform_owner_clean_provisioning_nonce' IN v_definition) = 0 THEN
    IF position(v_original IN v_definition) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OWNER_CLEAN_PROVISION_TRIGGER_GUARD_SHAPE_UNEXPECTED';
    END IF;

    v_definition := replace(v_definition, v_original, v_replacement);
    EXECUTE v_definition;
  END IF;
END;
$$;
