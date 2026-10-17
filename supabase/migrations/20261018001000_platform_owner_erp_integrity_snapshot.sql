-- Read-only Platform Owner integrity snapshot.
-- Financial records are NEVER modified by this function.
-- This is an operational dashboard, not an automatic repair/migration.
CREATE OR REPLACE FUNCTION public.platform_owner_erp_integrity_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off
AS $$
DECLARE
  v_sales_total bigint;
  v_sales_mismatch bigint;
  v_sales_negative bigint;
  v_supplier_total bigint;
  v_supplier_overpaid bigint;
  v_supplier_missing_org bigint;
  v_daily_total bigint;
  v_daily_missing_branch bigint;
  v_daily_legacy_branch bigint;
  v_daily_recent_missing_branch bigint;
  v_branch_orphans bigint;
  v_public_tables bigint;
  v_public_rls_off bigint;
BEGIN
  PERFORM public.platform_owner_assert(); -- existing platform owner + MFA assertion

  SELECT count(*),
    count(*) FILTER (WHERE sales_total IS NOT NULL
      AND abs(coalesce(cash_sales,0)+coalesce(network_sales,0)
        +coalesce(credit_sales,0)+coalesce(other_sales,0)-sales_total)>0.01),
    count(*) FILTER (WHERE cash_sales<0 OR network_sales<0
      OR credit_sales<0 OR other_sales<0 OR sales_total<0)
  INTO v_sales_total,v_sales_mismatch,v_sales_negative
  FROM public.sales_invoices;

  SELECT count(*),
    count(*) FILTER (WHERE paid_amount>total_amount+0.01),
    count(*) FILTER (WHERE restaurant_id IS NULL)
  INTO v_supplier_total,v_supplier_overpaid,v_supplier_missing_org
  FROM public.supplier_invoices;

  SELECT count(*),
    count(*) FILTER (WHERE branch_id IS NULL),
    count(*) FILTER (WHERE branch_id IS NULL
      AND branch IS NOT NULL AND btrim(branch)<>''),
    count(*) FILTER (WHERE branch_id IS NULL AND date>=current_date-30)
  INTO v_daily_total,v_daily_missing_branch,v_daily_legacy_branch,
       v_daily_recent_missing_branch
  FROM public.daily_sales;

  SELECT
    (SELECT count(*) FROM public.daily_sales d
     WHERE d.branch_id IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=d.branch_id))
   +(SELECT count(*) FROM public.sales_invoices s
     WHERE s.branch_id IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=s.branch_id))
   +(SELECT count(*) FROM public.purchases p
     WHERE p.branch_id IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=p.branch_id))
   +(SELECT count(*) FROM public.expenses e
     WHERE e.branch_id IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=e.branch_id))
    INTO v_branch_orphans;

  SELECT count(*), count(*) FILTER (WHERE rowsecurity IS FALSE)
  INTO v_public_tables,v_public_rls_off
  FROM pg_catalog.pg_tables WHERE schemaname='public';

  RETURN jsonb_build_object(
    'generated_at',clock_timestamp(),
    'read_only',true,
    'scope','platform_owner_only',
    'groups',jsonb_build_array(
      jsonb_build_object('key','sales','total',v_sales_total,
        'alerts',v_sales_mismatch,'negative_amounts',v_sales_negative,
        'detail','Source buckets do not reconcile to posted total. Historical financial records remain unchanged.'),
      jsonb_build_object('key','supplier_invoices','total',v_supplier_total,
        'alerts',v_supplier_overpaid+v_supplier_missing_org,
        'overpaid',v_supplier_overpaid,'missing_organization',v_supplier_missing_org,
        'detail','Overpayments can be credit or reconciliation errors; unscoped documents require tenant review.'),
      jsonb_build_object('key','daily_sales','total',v_daily_total,
        'alerts',v_daily_missing_branch,'missing_branch_id',v_daily_missing_branch,
        'legacy_branch_name',v_daily_legacy_branch,
        'recent_missing_branch_id',v_daily_recent_missing_branch,
        'detail','Legacy text-only branches require verified mapping, not automatic reassignment.'),
      jsonb_build_object('key','branch_references','total',null,
        'alerts',v_branch_orphans,
        'detail','Four key transactional tables checked for orphan branch identifiers.'),
      jsonb_build_object('key','rls','total',v_public_tables,
        'alerts',v_public_rls_off,
        'detail','RLS enabled is a baseline check, not proof that every policy is secure.')
    ),
    'financial_changes',0
  );
END;
$$;
REVOKE ALL ON FUNCTION public.platform_owner_erp_integrity_snapshot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_owner_erp_integrity_snapshot() TO authenticated;

COMMENT ON FUNCTION public.platform_owner_erp_integrity_snapshot() IS
'Read-only Platform Owner+MFA integrity counters for sales, supplier credit, legacy branches, and public RLS. Does not expose invoice contents or change any business record.';
