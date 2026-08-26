BEGIN;

-- The editable daily_sales row intentionally does not receive a bulk historical
-- update because unrelated Driver Sales authorization triggers protect those
-- records. Derive each working/finalized version from append-only history instead.
DO $migration$
DECLARE
  v_original text;
  v_definition text;
  v_old_version_sequence text := $old_version_sequence$
  IF v_requested_state = 'finalized' THEN
    IF v_has_existing THEN
      SELECT COALESCE(MAX(version_row.version), 0) + 1
        INTO v_closing_version
        FROM public.sales_closing_finalized_versions AS version_row
        WHERE version_row.closing_id = v_existing.id;
    ELSE
      v_closing_version := 1;
    END IF;
  ELSIF v_has_existing THEN
    v_closing_version := GREATEST(COALESCE(v_existing.closing_version, 0), 0);
  ELSE
    v_closing_version := 0;
  END IF;$old_version_sequence$;
  v_new_version_sequence text := $new_version_sequence$
  IF v_has_existing THEN
    SELECT COALESCE(MAX(version_row.version), 0)
      INTO v_closing_version
      FROM public.sales_closing_finalized_versions AS version_row
      WHERE version_row.closing_id = v_existing.id;
    IF v_requested_state = 'finalized' THEN
      v_closing_version := v_closing_version + 1;
    END IF;
  ELSIF v_requested_state = 'finalized' THEN
    v_closing_version := 1;
  ELSE
    v_closing_version := 0;
  END IF;$new_version_sequence$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_original
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'erp_save_sales_closing'
    AND pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb, p_closing_id uuid, p_request_id uuid';

  IF v_original IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_SAVE_FUNCTION_NOT_FOUND';
  END IF;

  v_definition := replace(v_original, v_old_version_sequence, v_new_version_sequence);
  IF v_definition = v_original
     OR position('COALESCE(MAX(version_row.version), 0)' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'SALES_CLOSING_VERSION_SEQUENCE_UNEXPECTED_VERSION';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

COMMIT;
