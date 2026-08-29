BEGIN;

-- The receivables-first Customer Credit wrapper deliberately calls the retired
-- compatibility core with an empty credit array. That core inserts the new
-- append-only finalized version, after which the wrapper enriches only the
-- version's credit_entries_json inside the same transaction. The original
-- immutable trigger rejected that internal enrichment and rolled the entire
-- Finalize request back with SALES_CLOSING_VERSION_IMMUTABLE.
--
-- Keep finalized history immutable after commit. Permit only this one atomic
-- empty-to-canonical enrichment while the owner-executed Closing transaction is
-- active, and reject any change to every other column.
CREATE OR REPLACE FUNCTION public.erp_guard_sales_closing_finalized_version_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_table_owner name;
BEGIN
  SELECT pg_get_userbyid(relation.relowner)
    INTO v_table_owner
    FROM pg_class AS relation
   WHERE relation.oid = TG_RELID;

  IF TG_OP = 'UPDATE'
     AND current_user = v_table_owner
     AND COALESCE(current_setting('app.sales_closing_transaction', true), '') = 'on'
     AND COALESCE(OLD.credit_entries_json, '[]'::jsonb) = '[]'::jsonb
     AND jsonb_typeof(COALESCE(NEW.credit_entries_json, '[]'::jsonb)) = 'array'
     AND (to_jsonb(NEW) - 'credit_entries_json')
       IS NOT DISTINCT FROM (to_jsonb(OLD) - 'credit_entries_json') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'SALES_CLOSING_VERSION_IMMUTABLE'
    USING DETAIL = 'Finalized Sales Closing versions are append-only.';
END;
$$;

-- Finalized versions are written only by SECURITY DEFINER Closing routines.
-- Remove the broad default Data API grants and enable RLS as defense in depth.
ALTER TABLE public.sales_closing_finalized_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_closing_finalized_versions FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.erp_guard_sales_closing_finalized_version_immutable() IS
  'Rejects finalized-version mutation except the owner-only, same-transaction enrichment of a newly inserted empty Customer Credit snapshot.';

COMMIT;
