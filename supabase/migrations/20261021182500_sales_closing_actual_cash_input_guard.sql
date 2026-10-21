-- Cash posting trust boundary: counted cash cannot be negative or
-- fabricated from an unposted owner-injection field. Separate owner funding
-- belongs in posted cash movements, never cash sales or Closing Cash.
-- Only modifies procedure logic and EXECUTE grants, never accounting records.
DO $migration$
DECLARE
  v_old text;
  v_new text;
  v_needle text := E'  v_payload := public.erp_normalize_driver_source_payload(\\n    public.erp_prepare_driver_source_payload(p_payload)\\n  );';
  v_guard text := $guard$
  -- The cash count is an independently attested physical observation.
  -- Do not let the legacy core silently clamp negative input to zero.
  IF NULLIF(p_payload ->> 'actual_cash', '') IS NOT NULL THEN
    IF (p_payload ->> 'actual_cash')::numeric < 0
       OR (p_payload ->> 'actual_cash')::numeric::text IN ('NaN','Infinity','-Infinity')
       OR round((p_payload ->> 'actual_cash')::numeric, 2)
          <> (p_payload ->> 'actual_cash')::numeric
    THEN
      RAISE EXCEPTION 'SALES_CLOSING_ACTUAL_CASH_INVALID'
        USING HINT = 'Actual Cash must be a nonnegative physical count with at most two decimal places.';
    END IF;
  END IF;

  -- Owner injections are posted separately through authorized cash ledger
  -- movements. No client may increase Closing Cash with an unposted number.
  IF COALESCE(NULLIF(p_payload ->> 'owner_cash_injection', '')::numeric, 0) <> 0 THEN
    RAISE EXCEPTION 'SALES_CLOSING_UNPOSTED_OWNER_CASH_DENIED';
  END IF;
  v_payload := jsonb_set(
    public.erp_normalize_driver_source_payload(
      public.erp_prepare_driver_source_payload(p_payload)
    ),
    '{owner_cash_injection}', to_jsonb(0), true
  );
$guard$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_old
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='erp_save_sales_closing'
    AND p.pronargs=3;
  IF v_old IS NULL THEN RAISE EXCEPTION 'CANONICAL_CLOSING_WRAPPER_NOT_FOUND'; END IF;
  IF position('SALES_CLOSING_UNPOSTED_OWNER_CASH_DENIED' IN v_old)>0 THEN
    RETURN;
  END IF;
  v_new := replace(v_old, v_needle, v_guard);
  IF v_new = v_old
     OR position('SALES_CLOSING_UNPOSTED_OWNER_CASH_DENIED' IN v_new)=0
  THEN RAISE EXCEPTION 'CLOSING_GUARD_PATCH_NOT_APPLIED'; END IF;
  EXECUTE v_new;
END;
$migration$;

-- Canonical API and draft/finalize wrappers run SECURITY DEFINER. The
-- intermediary function must not be exposed for direct authenticated calls,
-- which would bypass request input validation at the canonical API boundary.
REVOKE ALL ON FUNCTION public.erp_save_sales_closing_core(jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE oid='public.erp_save_sales_closing(jsonb,uuid,uuid)'::regprocedure;
  IF position('SALES_CLOSING_ACTUAL_CASH_INVALID' IN coalesce(v_def,''))=0
    OR position('SALES_CLOSING_UNPOSTED_OWNER_CASH_DENIED' IN coalesce(v_def,''))=0
    OR has_function_privilege('authenticated','public.erp_save_sales_closing_core(jsonb,uuid,uuid)','execute')
  THEN RAISE EXCEPTION 'CLOSING_ACTUAL_CASH_HARDENING_INCOMPLETE'; END IF;
END;
$verify$;
