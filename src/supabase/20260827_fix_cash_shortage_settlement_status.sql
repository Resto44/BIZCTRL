-- Align the canonical Sales Closing shortage/owner-settlement lifecycle with the
-- existing public.cash_shortages_status_check constraint.  The Closing transaction
-- uses Pending for a payable shortage and Resolved after its owner payment posts.

DO $migration$
DECLARE
  v_save_definition text;
  v_owner_payment_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_save_definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'erp_save_sales_closing'
  LIMIT 1;

  IF v_save_definition IS NULL THEN
    RAISE EXCEPTION 'ERP_CASH_RECONCILIATION_SAVE_FUNCTION_MISSING';
  END IF;

  v_save_definition := replace(v_save_definition, '''Unpaid''', '''Pending''');
  v_save_definition := replace(v_save_definition, '''Recorded''', '''Pending''');
  v_save_definition := replace(v_save_definition, '''Balanced''', '''Pending''');
  v_save_definition := replace(v_save_definition, '''Paid''', '''Resolved''');
  EXECUTE v_save_definition;

  SELECT pg_get_functiondef(p.oid)
    INTO v_owner_payment_definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'erp_record_sales_closing_owner_payment'
  LIMIT 1;

  IF v_owner_payment_definition IS NULL THEN
    RAISE EXCEPTION 'ERP_CASH_RECONCILIATION_OWNER_PAYMENT_FUNCTION_MISSING';
  END IF;

  v_owner_payment_definition := replace(v_owner_payment_definition, '''Paid''', '''Resolved''');
  EXECUTE v_owner_payment_definition;
END
$migration$;

-- Enforce the intended status contract as a release invariant.
DO $verify$
DECLARE
  v_save_definition text;
  v_owner_payment_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_save_definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'erp_save_sales_closing'
  LIMIT 1;

  SELECT pg_get_functiondef(p.oid)
    INTO v_owner_payment_definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'erp_record_sales_closing_owner_payment'
  LIMIT 1;

  IF position('''Unpaid''' IN COALESCE(v_save_definition, '')) > 0
     OR position('''Paid''' IN COALESCE(v_save_definition, '')) > 0
     OR position('''Paid''' IN COALESCE(v_owner_payment_definition, '')) > 0
     OR position('''Pending''' IN COALESCE(v_save_definition, '')) = 0
     OR position('''Resolved''' IN COALESCE(v_owner_payment_definition, '')) = 0 THEN
    RAISE EXCEPTION 'ERP_CASH_SHORTAGE_STATUS_LIFECYCLE_INVALID';
  END IF;
END
$verify$;
