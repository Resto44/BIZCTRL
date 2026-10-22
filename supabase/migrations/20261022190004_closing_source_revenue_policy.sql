-- Align the canonical posting path with Sales Source revenue inclusion.
-- Preserve original functions, authorization, snapshots, and historical records.
-- Fail atomically on unexpected upstream definitions rather than replacing a
-- newer implementation with a stale full function body.
BEGIN;
DO $migration$
DECLARE
  v_oid oid;
  v_definition text;
  v_acl aclitem[];
  v_old text;
  v_new text;
BEGIN
  v_oid := 'public.erp_save_sales_closing_core_legacy_customer_balance(jsonb,uuid,uuid)'::regprocedure;
  SELECT pg_get_functiondef(oid), proacl INTO v_definition, v_acl FROM pg_proc WHERE oid = v_oid;
  v_old := $old$WHERE COALESCE(entry ->> 'payment_bucket', entry ->> 'default_payment_method', 'other') IN ('cash', 'cash_on_delivery', 'cod');$old$;
  v_new := $new$WHERE COALESCE(entry ->> 'payment_bucket', entry ->> 'default_payment_method', 'other') IN ('cash', 'cash_on_delivery', 'cod')
      AND COALESCE((entry ->> 'included_in_revenue')::boolean, true);$new$;
  IF position(v_new IN v_definition) = 0 THEN
    IF (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 THEN
      RAISE EXCEPTION 'Closing source policy: unexpected core definition';
    END IF;
    EXECUTE replace(v_definition, v_old, v_new);
  END IF;
  IF (SELECT proacl FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_acl THEN
    RAISE EXCEPTION 'Closing source policy: core ACL changed';
  END IF;

  v_oid := 'public.erp_normalize_driver_source_payload(jsonb)'::regprocedure;
  SELECT pg_get_functiondef(oid), proacl INTO v_definition, v_acl FROM pg_proc WHERE oid = v_oid;
  IF position('IF COALESCE(v_source_master.included_in_revenue, true) THEN' IN v_definition) = 0 THEN
    IF position('SELECT id, subcategory' IN v_definition) = 0
       OR position('v_driver_cash := v_driver_cash + v_cash_amount;' IN v_definition) = 0
       OR position('v_driver_network := v_driver_network + v_network_amount;' IN v_definition) = 0
       OR position($marker$'allows_driver_entries', true,$marker$ IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Closing source policy: unexpected driver normalizer definition';
    END IF;
    v_definition := replace(v_definition, 'SELECT id, subcategory', 'SELECT id, subcategory, included_in_revenue');
    v_definition := replace(v_definition, 'v_driver_cash := v_driver_cash + v_cash_amount;',
      'IF COALESCE(v_source_master.included_in_revenue, true) THEN
        v_driver_cash := v_driver_cash + v_cash_amount;');
    v_definition := replace(v_definition, 'v_driver_network := v_driver_network + v_network_amount;',
      'v_driver_network := v_driver_network + v_network_amount;
      END IF;');
    v_definition := replace(v_definition, $marker$'allows_driver_entries', true,$marker$,
      $marker$'allows_driver_entries', true,
        'included_in_revenue', COALESCE(v_source_master.included_in_revenue, true),$marker$);
    EXECUTE v_definition;
  END IF;
  IF (SELECT proacl FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_acl THEN
    RAISE EXCEPTION 'Closing source policy: normalizer ACL changed';
  END IF;
END;
$migration$;
COMMIT;
