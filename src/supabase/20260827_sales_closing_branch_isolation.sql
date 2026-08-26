-- Canonical branch isolation for Sales Closing runtime reads and writes.
-- Branch-scoped reads are verified on the server; branch-specific source rows
-- are never returned as a restaurant-wide dataset for browser filtering.

CREATE OR REPLACE FUNCTION public.erp_sales_closing_branch_sources(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_include_inactive boolean DEFAULT false
)
RETURNS SETOF public.sales_sources
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_branch_key text;
BEGIN
  IF auth.uid() IS NULL
     OR p_restaurant_id IS NULL
     OR p_branch_id IS NULL
     OR NOT public.erp_can_access_scope_text(p_restaurant_id::text, p_branch_id::text) THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
  END IF;

  SELECT branch.branch_key
    INTO v_branch_key
  FROM public.branches AS branch
  WHERE branch.id = p_branch_id
    AND branch.restaurant_id = p_restaurant_id
  LIMIT 1;

  IF v_branch_key IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_BRANCH_CONTEXT_INVALID';
  END IF;

  RETURN QUERY
  SELECT source.*
  FROM public.sales_sources AS source
  WHERE source.restaurant_id = p_restaurant_id::text
    AND (p_include_inactive OR COALESCE(source.is_active, true))
    AND (
      COALESCE(source.is_global, false) = true
      OR source.branch_id = p_branch_id::text
      OR source.branch_id = v_branch_key
      OR p_branch_id = ANY(COALESCE(source.branch_ids, ARRAY[]::uuid[]))
    )
  ORDER BY source.sort_order, source.created_date, source.id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.erp_sales_closing_branch_sources(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_sales_closing_branch_sources(uuid, uuid, boolean) TO authenticated;

-- The canonical persistence RPC already authorizes the supplied restaurant and
-- branch. Also reject a stale edited Closing ID that belongs to another branch;
-- this protects save/finalize when a user switches branch before a request runs.
CREATE OR REPLACE FUNCTION public.erp_sales_closing_assert_existing_branch_context(
  p_closing_id uuid,
  p_restaurant_id text,
  p_branch_id uuid,
  p_branch text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_existing public.daily_sales%ROWTYPE;
BEGIN
  IF p_closing_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_existing
  FROM public.daily_sales
  WHERE id = p_closing_id
    AND restaurant_id = p_restaurant_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALES_CLOSING_NOT_FOUND';
  END IF;

  IF NOT (
    v_existing.branch_id = p_branch_id
    OR (v_existing.branch_id IS NULL AND v_existing.branch = p_branch)
  ) THEN
    RAISE EXCEPTION 'SALES_CLOSING_BRANCH_CONTEXT_MISMATCH'
      USING DETAIL = 'The Closing belongs to a different branch than the active Closing context.';
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.erp_sales_closing_assert_existing_branch_context(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_sales_closing_assert_existing_branch_context(uuid, text, uuid, text) TO authenticated;

DO $rewrite$
DECLARE
  v_definition text;
  v_rewritten text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'erp_save_sales_closing'
    AND pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb, p_closing_id uuid, p_request_id uuid'
  LIMIT 1;

  IF v_definition IS NULL
     OR position('PERFORM pg_advisory_xact_lock' IN v_definition) = 0
     OR position('SELECT * INTO v_existing' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'SALES_CLOSING_SAVE_ROUTINE_UNEXPECTED';
  END IF;

  IF position('erp_sales_closing_assert_existing_branch_context' IN v_definition) = 0 THEN
    v_rewritten := replace(
      v_definition,
      E'  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(\'|\', v_restaurant_id, v_branch_id::text, v_date::text, lower(v_shift), v_cashier_id::text), 0));',
      E'  PERFORM public.erp_sales_closing_assert_existing_branch_context(p_closing_id, v_restaurant_id, v_branch_id, v_branch);\n\n  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(\'|\', v_restaurant_id, v_branch_id::text, v_date::text, lower(v_shift), v_cashier_id::text), 0));'
    );
    IF v_rewritten = v_definition THEN
      RAISE EXCEPTION 'SALES_CLOSING_SAVE_BRANCH_GUARD_INJECTION_FAILED';
    END IF;
    EXECUTE v_rewritten;
  END IF;
END;
$rewrite$;

DO $verify$
DECLARE
  v_sources_definition text;
  v_save_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_sources_definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'erp_sales_closing_branch_sources'
  LIMIT 1;

  SELECT pg_get_functiondef(p.oid) INTO v_save_definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'erp_save_sales_closing'
    AND pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb, p_closing_id uuid, p_request_id uuid'
  LIMIT 1;

  IF position('erp_can_access_scope_text(p_restaurant_id::text, p_branch_id::text)' IN COALESCE(v_sources_definition, '')) = 0
     OR position('source.branch_id = p_branch_id::text' IN COALESCE(v_sources_definition, '')) = 0
     OR position('p_branch_id = ANY' IN COALESCE(v_sources_definition, '')) = 0
     OR position('erp_sales_closing_assert_existing_branch_context' IN COALESCE(v_save_definition, '')) = 0 THEN
    RAISE EXCEPTION 'SALES_CLOSING_BRANCH_ISOLATION_VERIFICATION_FAILED';
  END IF;
END;
$verify$;
