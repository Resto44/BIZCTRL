-- Resolve owner permission in the selected restaurant, not whichever
-- membership was modified most recently across unrelated organizations.
-- The existing erp_can_write_scope_text already requires an approved Owner
-- membership on the exact business and branch.
DO $migration$
DECLARE v_original text; v_updated text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_original
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='erp_verify_sales_closing_opening_count'
    AND p.pronargs=9;
  IF v_original IS NULL THEN
    RAISE EXCEPTION 'OPENING_VERIFICATION_FUNCTION_MISSING';
  END IF;
  v_updated := replace(
    v_original,
    $$auth.uid() IS NULL OR public.erp_current_role() <> 'owner'
    OR NOT public.erp_can_write_scope_text(p_restaurant_id::text, p_branch_id::text)$$,
    $$auth.uid() IS NULL
    OR NOT public.erp_can_write_scope_text(p_restaurant_id::text, p_branch_id::text)$$
  );
  IF v_updated = v_original
     AND position('public.erp_current_role()' IN v_original)>0 THEN
    RAISE EXCEPTION 'OPENING_VERIFICATION_SCOPE_PATCH_FAILED';
  END IF;
  EXECUTE v_updated;
END;
$migration$;

DO $verify$
DECLARE v_source text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_source
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='erp_verify_sales_closing_opening_count'
    AND p.pronargs=9;
  IF position('erp_can_write_scope_text(p_restaurant_id::text, p_branch_id::text)' IN coalesce(v_source,''))=0
     OR position('public.erp_current_role()' IN coalesce(v_source,''))>0
  THEN RAISE EXCEPTION 'OWNER_SCOPE_AUTHORIZATION_REGRESSION'; END IF;
END;
$verify$;
