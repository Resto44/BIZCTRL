DO $migration$
DECLARE
  definition text;
  needle text := '  RETURN jsonb_set(v_result, ''{closing}'', to_jsonb(v_closing), true);';
  guard text := $guard$
  -- Check the actual resolved closing, including natural-key matches when
  -- p_closing_id is null. A posted credit change must never silently diverge
  -- from its receivable; exception rolls back the entire closing transaction.
  IF lower(COALESCE(v_closing.closing_state, '')) = 'finalized' THEN
    SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
      INTO v_existing_count, v_existing_total
      FROM public.debt_records
     WHERE sales_closing_id = v_closing.id
       AND party_type = 'customer' AND type = 'receivable';
    IF v_existing_count <> v_sanitized_count
       OR v_existing_total <> v_credit_total
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(v_sanitized_entries) AS candidate
         WHERE NOT EXISTS (
           SELECT 1 FROM public.debt_records AS debt
           WHERE debt.sales_closing_id = v_closing.id
             AND debt.restaurant_id = v_restaurant_id
             AND debt.party_type = 'customer' AND debt.type = 'receivable'
             AND debt.customer_id = (candidate ->> 'customer_id')::uuid
             AND debt.total_amount = (candidate ->> 'amount')::numeric
         )
       ) THEN
      RAISE EXCEPTION 'SALES_CLOSING_CREDIT_FINALIZED_IMMUTABLE'
        USING HINT = 'The posted closing and customer receivable must reconcile. Open History; do not replace posted credit through a new closing.';
    END IF;
  END IF;
$guard$;
BEGIN
 SELECT pg_get_functiondef('public.erp_save_sales_closing_core(jsonb,uuid,uuid)'::regprocedure) INTO definition;
 IF position('-- Check the actual resolved closing' in definition) > 0 THEN RETURN; END IF;
 IF position(needle in definition) = 0 THEN RAISE EXCEPTION 'CREDIT_GUARD_PATCH_TARGET_MISSING'; END IF;
 EXECUTE replace(definition, needle, guard || E'\n' || needle);
END;
$migration$;
