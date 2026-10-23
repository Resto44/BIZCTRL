-- Draft capture is independent of final cash reconciliation. No posted records are changed.
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.erp_save_sales_closing_core_legacy_customer_balance(jsonb,uuid,uuid)'::regprocedure) INTO definition;
  IF position($old$  -- Resolve every amount-bearing credit row$old$ IN definition) = 0 THEN RAISE EXCEPTION 'CLOSING_DRAFT_MIGRATION_CONTEXT_CHANGED'; END IF;
  definition := replace(definition, $old$  -- Resolve every amount-bearing credit row$old$, $new$  IF v_requested_state = 'draft' AND v_has_existing
     AND (v_existing.closing_state IN ('finalized','locked','corrected')
       OR COALESCE(v_closing_version, 0) > 0) THEN
    RAISE EXCEPTION 'SALES_CLOSING_FINALIZED_DRAFT_DENIED'
      USING HINT = 'Open the finalized closing from History. A posted closing cannot become a draft.';
  END IF;

  -- Resolve every amount-bearing credit row$new$);
  IF position($old$  v_expected_cash := public.erp_sales_closing_expected_cash(
    v_restaurant_uuid, v_branch_id, v_branch, v_date, v_shift, v_cashier_id,
    CASE WHEN v_has_existing THEN v_existing.id ELSE p_closing_id END,
    v_manual_cash + v_cash_source_total
  );
$old$ IN definition) = 0 THEN RAISE EXCEPTION 'CLOSING_DRAFT_MIGRATION_CONTEXT_CHANGED'; END IF;
  definition := replace(definition, $old$  v_expected_cash := public.erp_sales_closing_expected_cash(
    v_restaurant_uuid, v_branch_id, v_branch, v_date, v_shift, v_cashier_id,
    CASE WHEN v_has_existing THEN v_existing.id ELSE p_closing_id END,
    v_manual_cash + v_cash_source_total
  );
$old$, $new$  BEGIN
  v_expected_cash := public.erp_sales_closing_expected_cash(
    v_restaurant_uuid, v_branch_id, v_branch, v_date, v_shift, v_cashier_id,
    CASE WHEN v_has_existing THEN v_existing.id ELSE p_closing_id END,
    v_manual_cash + v_cash_source_total
  );
  EXCEPTION WHEN raise_exception THEN
    IF v_requested_state <> 'draft' OR SQLERRM <> 'SALES_CLOSING_CASH_LEDGER_OVERDRAWN' THEN
      RAISE;
    END IF;
    -- Unresolved drafts preserve input without inventing a balance or variance.
    v_expected_cash := NULL;
  END;
$new$);
  IF position($old$  IF v_actual IS NOT NULL THEN$old$ IN definition) = 0 THEN RAISE EXCEPTION 'CLOSING_DRAFT_MIGRATION_CONTEXT_CHANGED'; END IF;
  definition := replace(definition, $old$  IF v_actual IS NOT NULL THEN$old$, $new$  IF v_actual IS NOT NULL AND v_expected_cash IS NOT NULL THEN$new$);
  IF position($old$  INSERT INTO public.sales_closing_cash_reconciliations ($old$ IN definition) = 0 THEN RAISE EXCEPTION 'CLOSING_DRAFT_MIGRATION_CONTEXT_CHANGED'; END IF;
  definition := replace(definition, $old$  INSERT INTO public.sales_closing_cash_reconciliations ($old$, $new$  IF v_expected_cash IS NULL THEN
    DELETE FROM public.sales_closing_cash_reconciliations WHERE closing_id = v_saved.id;
  ELSE
  INSERT INTO public.sales_closing_cash_reconciliations ($new$);
  IF position($old$  -- Recompute daily costs on the server.$old$ IN definition) = 0 THEN RAISE EXCEPTION 'CLOSING_DRAFT_MIGRATION_CONTEXT_CHANGED'; END IF;
  definition := replace(definition, $old$  -- Recompute daily costs on the server.$old$, $new$  END IF;

  -- Recompute daily costs on the server.$new$);
  EXECUTE definition;
END;
$migration$;

