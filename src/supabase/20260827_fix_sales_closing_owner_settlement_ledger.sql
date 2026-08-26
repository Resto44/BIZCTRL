-- Correct the Sales Closing settlement posting against the established canonical
-- cash_movements vocabulary.  A settlement is an owner funding event, identified
-- by its OwnerCashInjection source and the Closing document reference; it is not
-- sales and it must never revise the Closing's original expected-cash baseline.
--
-- This migration also removes the pre-trigger snapshot write from the canonical
-- save RPC.  The existing zzz_erp_enrich_sales_closing_cash_ledger AFTER trigger
-- snapshots only after the original Sales cash movement has been enriched with
-- the exact restaurant / branch / date / shift / cashier scope.

DO $migration$
DECLARE
  v_expected_definition text;
  v_save_definition text;
  v_owner_payment_definition text;
  v_old_shortage_block text := $old_shortage$
  IF v_requested_state = 'finalized' THEN
    INSERT INTO public.cash_shortages (
      closing_id, date, branch, branch_id, shift, cashier_id, restaurant_id, created_by,
      expected_amount, actual_amount, shortage_amount, overage_amount, type, status,
      responsible_party, owner_settlement_required, owner_payment_amount, reported_by
    ) VALUES (
      v_saved.id, v_date, v_branch, v_branch_id, v_shift, v_cashier_id, v_restaurant_uuid, auth.uid()::text,
      v_expected_cash, COALESCE(v_actual, 0), GREATEST(-COALESCE(v_difference, 0), 0), GREATEST(COALESCE(v_difference, 0), 0),
      CASE WHEN COALESCE(v_difference, 0) < 0 THEN 'Shortage' WHEN COALESCE(v_difference, 0) > 0 THEN 'Overage' ELSE 'Pending' END,
      CASE WHEN COALESCE(v_difference, 0) < 0 THEN 'Pending' WHEN COALESCE(v_difference, 0) > 0 THEN 'Pending' ELSE 'Pending' END,
      'owner', GREATEST(-COALESCE(v_difference, 0), 0), 0, auth.uid()::text
    ) ON CONFLICT (closing_id) WHERE closing_id IS NOT NULL DO UPDATE SET
      expected_amount = EXCLUDED.expected_amount,
      actual_amount = EXCLUDED.actual_amount,
      shortage_amount = EXCLUDED.shortage_amount,
      overage_amount = EXCLUDED.overage_amount,
      type = EXCLUDED.type,
      status = CASE WHEN public.cash_shortages.owner_payment_amount >= EXCLUDED.owner_settlement_required THEN 'Resolved' ELSE EXCLUDED.status END,
      owner_settlement_required = EXCLUDED.owner_settlement_required,
      updated_date = now();
  END IF;
$old_shortage$;
  v_new_shortage_block text := $new_shortage$
  -- cash_shortages records only a real shortage or overage.  A balanced Closing
  -- has no variance record, so it cannot violate the Shortage/Overage constraint.
  IF v_requested_state = 'finalized' AND COALESCE(v_difference, 0) <> 0 THEN
    INSERT INTO public.cash_shortages (
      closing_id, date, branch, branch_id, shift, cashier_id, restaurant_id, created_by,
      expected_amount, actual_amount, shortage_amount, overage_amount, type, status,
      responsible_party, owner_settlement_required, owner_payment_amount, reported_by
    ) VALUES (
      v_saved.id, v_date, v_branch, v_branch_id, v_shift, v_cashier_id, v_restaurant_uuid, auth.uid()::text,
      v_expected_cash, COALESCE(v_actual, 0), GREATEST(-COALESCE(v_difference, 0), 0), GREATEST(COALESCE(v_difference, 0), 0),
      CASE WHEN v_difference < 0 THEN 'Shortage' ELSE 'Overage' END,
      'Pending',
      'owner', GREATEST(-v_difference, 0), 0, auth.uid()::text
    ) ON CONFLICT (closing_id) WHERE closing_id IS NOT NULL DO UPDATE SET
      expected_amount = EXCLUDED.expected_amount,
      actual_amount = EXCLUDED.actual_amount,
      shortage_amount = EXCLUDED.shortage_amount,
      overage_amount = EXCLUDED.overage_amount,
      type = EXCLUDED.type,
      status = CASE
        WHEN EXCLUDED.type = 'Shortage'
          AND public.cash_shortages.owner_payment_amount >= EXCLUDED.owner_settlement_required
          THEN 'Resolved'
        ELSE 'Pending'
      END,
      owner_settlement_required = EXCLUDED.owner_settlement_required,
      updated_date = now();
  ELSIF v_requested_state = 'finalized' THEN
    DELETE FROM public.cash_shortages WHERE closing_id = v_saved.id;
  END IF;
$new_shortage$;
  v_old_snapshot_block text := $old_snapshot$
  IF v_requested_state = 'finalized' THEN
    INSERT INTO public.sales_closing_cash_ledger_snapshots (
      closing_id, closing_version, ledger_snapshot, reconciliation_snapshot, owner_settlement_snapshot
    )
    SELECT v_saved.id, v_closing_version,
      COALESCE((SELECT jsonb_agg(to_jsonb(movement) ORDER BY movement.posted_at, movement.created_date)
        FROM public.cash_movements AS movement
        WHERE movement.restaurant_id = v_restaurant_uuid
          AND movement.branch_id = v_branch_id
          AND movement.date = v_date
          AND movement.shift = v_shift
          AND movement.cashier_id = v_cashier_id
          AND COALESCE(movement.is_reversed, false) = false), '[]'::jsonb),
      jsonb_build_object(
        'opening_cash', v_opening,
        'expected_cash', v_expected_cash,
        'actual_cash', v_actual,
        'difference', v_difference,
        'variance_status', v_variance_status,
        'revenue', v_saved.total,
        'cash_sales', v_saved.restaurant_cash,
        'non_cash_sales', COALESCE(v_saved.restaurant_network, 0),
        'customer_credit', COALESCE(v_saved.credit, 0),
        'operating_result', v_saved.operating_result
      ),
      COALESCE((SELECT to_jsonb(shortage) FROM public.cash_shortages AS shortage WHERE shortage.closing_id = v_saved.id), '{}'::jsonb)
    ON CONFLICT (closing_id, closing_version) DO NOTHING;
  END IF;
$old_snapshot$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_expected_definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'erp_sales_closing_expected_cash'
  LIMIT 1;

  IF v_expected_definition IS NULL THEN
    RAISE EXCEPTION 'ERP_CASH_RECONCILIATION_EXPECTED_CASH_FUNCTION_MISSING';
  END IF;
  v_expected_definition := replace(
    v_expected_definition,
    $old_expected$movement.movement_type <> 'owner_settlement_payment'$old_expected$,
    $new_expected$NOT (
      movement.movement_type = 'owner_injection'
      AND movement.source_module = 'OwnerCashInjection'
      AND movement.source_document_id = p_current_closing_id::text
    )$new_expected$
  );
  IF position('movement.movement_type <> ''owner_settlement_payment''' IN v_expected_definition) > 0
     OR position('movement.source_document_id = p_current_closing_id::text' IN v_expected_definition) = 0 THEN
    RAISE EXCEPTION 'ERP_CASH_RECONCILIATION_EXPECTED_CASH_OWNER_SETTLEMENT_FILTER_INVALID';
  END IF;
  EXECUTE v_expected_definition;

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
  v_owner_payment_definition := replace(
    v_owner_payment_definition,
    $old_owner_movement$'owner_settlement_payment', 'cash',
    'OwnerSettlement'$old_owner_movement$,
    $new_owner_movement$'owner_injection', 'cash',
    'OwnerCashInjection'$new_owner_movement$
  );
  IF position('''owner_settlement_payment''' IN v_owner_payment_definition) > 0
     OR position('''owner_injection''' IN v_owner_payment_definition) = 0
     OR position('''OwnerCashInjection''' IN v_owner_payment_definition) = 0 THEN
    RAISE EXCEPTION 'ERP_CASH_RECONCILIATION_OWNER_PAYMENT_MOVEMENT_INVALID';
  END IF;
  EXECUTE v_owner_payment_definition;

  SELECT pg_get_functiondef(p.oid)
    INTO v_save_definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'erp_save_sales_closing'
    AND pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb, p_closing_id uuid, p_request_id uuid'
  LIMIT 1;

  IF v_save_definition IS NULL THEN
    RAISE EXCEPTION 'ERP_CASH_RECONCILIATION_SAVE_FUNCTION_MISSING';
  END IF;
  v_save_definition := replace(v_save_definition, v_old_shortage_block, v_new_shortage_block);
  v_save_definition := replace(v_save_definition, v_old_snapshot_block, '');
  IF position('sales_closing_cash_ledger_snapshots' IN v_save_definition) > 0
     OR position('COALESCE(v_difference, 0) <> 0' IN v_save_definition) = 0
     OR position('CASE WHEN v_difference < 0 THEN ''Shortage'' ELSE ''Overage'' END' IN v_save_definition) = 0 THEN
    RAISE EXCEPTION 'ERP_CASH_RECONCILIATION_SAVE_FUNCTION_SETTLEMENT_OR_SNAPSHOT_INVALID';
  END IF;
  EXECUTE v_save_definition;
END;
$migration$;

-- Keep the immutable snapshot writer attached to the post-ledger trigger and
-- assert the active routine now matches the established ledger vocabulary.
DO $verify$
DECLARE
  v_expected_definition text;
  v_save_definition text;
  v_owner_payment_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_expected_definition
  FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'erp_sales_closing_expected_cash'
  LIMIT 1;
  SELECT pg_get_functiondef(p.oid) INTO v_save_definition
  FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'erp_save_sales_closing'
    AND pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb, p_closing_id uuid, p_request_id uuid'
  LIMIT 1;
  SELECT pg_get_functiondef(p.oid) INTO v_owner_payment_definition
  FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'erp_record_sales_closing_owner_payment'
  LIMIT 1;

  IF position('''owner_settlement_payment''' IN COALESCE(v_expected_definition, '')) > 0
     OR position('''owner_settlement_payment''' IN COALESCE(v_owner_payment_definition, '')) > 0
     OR position('''owner_injection''' IN COALESCE(v_owner_payment_definition, '')) = 0
     OR position('''OwnerCashInjection''' IN COALESCE(v_owner_payment_definition, '')) = 0
     OR position('sales_closing_cash_ledger_snapshots' IN COALESCE(v_save_definition, '')) > 0
     OR position('COALESCE(v_difference, 0) <> 0' IN COALESCE(v_save_definition, '')) = 0 THEN
    RAISE EXCEPTION 'ERP_CASH_RECONCILIATION_OWNER_SETTLEMENT_LEDGER_FIX_INVALID';
  END IF;
END
$verify$;
