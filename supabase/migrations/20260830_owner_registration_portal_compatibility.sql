-- Keep the currently deployed registration client functional while the portal
-- selector release rolls out. The new UI always supplies business_type; older
-- cached clients safely receive the legacy restaurant default. Any non-empty,
-- unknown portal value is still rejected by the canonical allowlist.

BEGIN;

DO $migration$
DECLARE
  v_definition text;
  v_original text := E'  requested_business_mode := lower(btrim(coalesce(NEW.raw_user_meta_data->>''business_type'', '''')));';
  v_replacement text := E'  requested_business_mode := lower(btrim(coalesce(nullif(NEW.raw_user_meta_data->>''business_type'', ''''), ''restaurant'')));';
BEGIN
  SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure)
  INTO v_definition;

  IF position(v_replacement IN v_definition) = 0 THEN
    IF position(v_original IN v_definition) = 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'OWNER_PORTAL_COMPATIBILITY_TRIGGER_SHAPE_UNEXPECTED';
    END IF;
    v_definition := replace(v_definition, v_original, v_replacement);
    EXECUTE v_definition;
  END IF;
END;
$migration$;

COMMIT;
