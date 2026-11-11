-- Save itemized customer receivable details atomically with finalized Sales Closing.
-- Existing customer selection, credit limit and close idempotency logic unchanged.
CREATE OR REPLACE FUNCTION public.erp_save_sales_closing_core(p_payload jsonb, p_closing_id uuid DEFAULT NULL::uuid, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_restaurant_id uuid := NULLIF(BTRIM(COALESCE(p_payload ->> 'restaurant_id', '')), '')::uuid;
  v_branch_id uuid := NULLIF(BTRIM(COALESCE(p_payload ->> 'branch_id', '')), '')::uuid;
  v_branch text := NULLIF(BTRIM(COALESCE(p_payload ->> 'branch', '')), '');
  v_requested_state text := COALESCE(NULLIF(BTRIM(COALESCE(p_payload ->> 'closing_state', '')), ''), 'draft');
  v_entries jsonb := COALESCE(p_payload -> 'credit_entries_json', '[]'::jsonb);
  v_entry jsonb;
  v_customer public.customers%ROWTYPE;
  v_customer_id uuid;
  v_amount numeric;
  v_outstanding numeric;
  v_limit numeric;
  v_available numeric;
  v_credit_total numeric := 0;
  v_sanitized_entries jsonb := '[]'::jsonb;
  v_result jsonb;
  v_closing public.daily_sales%ROWTYPE;
  v_debt public.debt_records%ROWTYPE;
  v_existing_count integer := 0;
  v_existing_total numeric := 0;
  v_sanitized_count integer := 0;
  v_legacy_payload jsonb;
  v_seen_customer_ids text[] := ARRAY[]::text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_AUTH_REQUIRED';
  END IF;
  IF v_restaurant_id IS NULL OR v_branch_id IS NULL OR v_branch IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_SCOPE_REQUIRED';
  END IF;
  IF jsonb_typeof(v_entries) <> 'array' THEN
    RAISE EXCEPTION 'SALES_CLOSING_PAYLOAD_INVALID';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_entries) LOOP
    IF NULLIF(BTRIM(COALESCE(v_entry ->> 'amount', v_entry ->> 'today_credit', '')), '') IS NULL THEN
      v_amount := 0;
    ELSE
      v_amount := COALESCE(NULLIF(v_entry ->> 'amount', '')::numeric, NULLIF(v_entry ->> 'today_credit', '')::numeric, 0);
    END IF;
    IF v_amount < 0 THEN
      RAISE EXCEPTION 'SALES_CLOSING_CREDIT_AMOUNT_INVALID';
    END IF;
    v_customer_id := NULLIF(BTRIM(COALESCE(v_entry ->> 'customer_id', '')), '')::uuid;
    IF v_amount = 0 AND v_customer_id IS NULL THEN
      CONTINUE;
    END IF;
    IF v_amount <= 0 OR v_customer_id IS NULL THEN
      RAISE EXCEPTION 'SALES_CLOSING_CREDIT_CUSTOMER_REQUIRED';
    END IF;
    IF v_customer_id::text = ANY(v_seen_customer_ids) THEN
      RAISE EXCEPTION 'SALES_CLOSING_CREDIT_CUSTOMER_DUPLICATE';
    END IF;

    SELECT * INTO v_customer
      FROM public.customers
     WHERE id = v_customer_id
       AND restaurant_id = v_restaurant_id
       AND COALESCE(is_active, true) = true
       AND (branch_id IS NULL OR branch_id = v_branch_id OR branch IS NULL OR branch = v_branch)
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SALES_CLOSING_CREDIT_CUSTOMER_INVALID';
    END IF;

    SELECT COALESCE(SUM(GREATEST(COALESCE(remaining_amount, 0), 0))
             FILTER (WHERE status IS DISTINCT FROM 'written_off'), 0)
      INTO v_outstanding
      FROM public.debt_records
     WHERE customer_id = v_customer_id
       AND restaurant_id = v_restaurant_id
       AND party_type = 'customer'
       AND type = 'receivable'
       AND (branch_id = v_branch_id OR (branch_id IS NULL AND branch = v_branch));
    v_limit := GREATEST(COALESCE(v_customer.credit_limit, 0), 0);
    v_available := GREATEST(v_limit - v_outstanding, 0);
    IF v_amount > v_available THEN
      RAISE EXCEPTION 'SALES_CLOSING_CREDIT_LIMIT_EXCEEDED';
    END IF;

    v_sanitized_entries := v_sanitized_entries || jsonb_build_array(jsonb_build_object(
      'client_row_id', COALESCE(v_entry ->> 'client_row_id', gen_random_uuid()::text),
      'source_id', NULLIF(v_entry ->> 'source_id', ''),
      'customer_id', v_customer.id,
      'customer_name_snapshot', v_customer.name,
      'customer_phone', COALESCE(v_customer.phone, ''),
      'previous_outstanding_debt', v_outstanding,
      'credit_limit', v_limit,
      'available_credit', v_available,
      'amount', v_amount,
      'items', COALESCE(v_entry -> 'items','[]'::jsonb),
      'notes', COALESCE(v_entry ->> 'notes', '')
    ));
    v_credit_total := v_credit_total + v_amount;
    v_seen_customer_ids := array_append(v_seen_customer_ids, v_customer_id::text);
  END LOOP;
  v_sanitized_count := jsonb_array_length(v_sanitized_entries);

  -- A finalized Closing's receivables are accounting documents. Allow ordinary
  -- Closing edits, but reject a different customer-credit composition rather
  -- than rewriting historical debt principal or deleting a receivable.
  IF p_closing_id IS NOT NULL THEN
    SELECT * INTO v_closing FROM public.daily_sales WHERE id = p_closing_id FOR UPDATE;
    IF FOUND AND lower(COALESCE(v_closing.closing_state, '')) = 'finalized' THEN
      SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
        INTO v_existing_count, v_existing_total
        FROM public.debt_records
       WHERE sales_closing_id = v_closing.id
         AND party_type = 'customer'
         AND type = 'receivable';
      IF v_existing_count <> v_sanitized_count OR v_existing_total <> v_credit_total OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_sanitized_entries) candidate
        WHERE COALESCE(candidate->'items','[]'::jsonb) IS DISTINCT FROM COALESCE((
          SELECT older->'items' FROM jsonb_array_elements(COALESCE(v_closing.credit_entries_json,'[]'::jsonb)) older
          WHERE older->>'customer_id'=candidate->>'customer_id' LIMIT 1),'[]'::jsonb)
      ) OR EXISTS (
        SELECT 1
          FROM jsonb_array_elements(v_sanitized_entries) AS candidate
         WHERE NOT EXISTS (
           SELECT 1
             FROM public.debt_records AS debt
            WHERE debt.sales_closing_id = v_closing.id
              AND debt.customer_id = (candidate ->> 'customer_id')::uuid
              AND debt.total_amount = (candidate ->> 'amount')::numeric
         )
      ) THEN
        RAISE EXCEPTION 'SALES_CLOSING_CREDIT_FINALIZED_IMMUTABLE';
      END IF;
    END IF;
  END IF;

  v_legacy_payload := jsonb_set(
    jsonb_set(p_payload, '{credit_entries_json}', '[]'::jsonb, true),
    '{credit}', to_jsonb(v_credit_total), true
  );
  v_result := public.erp_save_sales_closing_core_legacy_customer_balance(
    v_legacy_payload, p_closing_id, p_request_id
  );
  IF COALESCE((v_result ->> 'idempotent')::boolean, false) THEN
    RETURN v_result;
  END IF;

  SELECT * INTO v_closing
    FROM public.daily_sales
   WHERE id = NULLIF(v_result -> 'closing' ->> 'id', '')::uuid
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALES_CLOSING_SAVE_FAILED';
  END IF;

  UPDATE public.daily_sales
     SET credit = v_credit_total,
         credit_entries_json = v_sanitized_entries,
         updated_date = now()
   WHERE id = v_closing.id
   RETURNING * INTO v_closing;

  -- The compatibility core receives an empty credit array to bypass its retired
  -- Customer Master mutation. Restore the sanitized, canonical source detail in
  -- the finalized version it just created so closing history remains auditable.
  IF v_requested_state = 'finalized' THEN
    UPDATE public.sales_closing_finalized_versions
       SET credit_entries_json = v_sanitized_entries
     WHERE closing_id = v_closing.id
       AND version = v_closing.closing_version;
  END IF;

  IF v_requested_state = 'finalized'
     AND COALESCE((v_result ->> 'finalized_transition')::boolean, false) THEN
    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_sanitized_entries) LOOP
      INSERT INTO public.debt_records (
        restaurant_id, tenant_id, branch, branch_id, type, party_type, party_name,
        party_phone, customer_id, sales_closing_id, source_id, date, total_amount,
        paid_amount, remaining_amount, status, description, notes, created_by,
        created_date, updated_date
      ) VALUES (
        v_restaurant_id, COALESCE(v_closing.tenant_id, v_restaurant_id::text),
        v_branch, v_branch_id, 'receivable', 'customer', v_entry ->> 'customer_name_snapshot',
        NULLIF(v_entry ->> 'customer_phone', ''), (v_entry ->> 'customer_id')::uuid,
        v_closing.id,
        CASE WHEN v_entry ->> 'source_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (v_entry ->> 'source_id')::uuid ELSE NULL END,
        v_closing.date, (v_entry ->> 'amount')::numeric, 0, (v_entry ->> 'amount')::numeric,
        'open', 'Credit sale from Customer Credit sales source',
        NULLIF(v_entry ->> 'notes', ''), auth.uid()::text, now(), now()
      )
      ON CONFLICT (sales_closing_id, customer_id)
      WHERE sales_closing_id IS NOT NULL AND customer_id IS NOT NULL
      DO NOTHING
      RETURNING * INTO v_debt;

      IF v_debt.id IS NOT NULL THEN
        PERFORM customer_portal_private.store_credit_invoice_lines(
          v_debt.id,v_restaurant_id,v_branch_id,(v_entry->>'customer_id')::uuid,
          'sales_closing',NULL,v_entry->'items');
      END IF;
      PERFORM public.erp_refresh_customer_receivable_cache((v_entry ->> 'customer_id')::uuid);
    END LOOP;
  END IF;


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

  RETURN jsonb_set(v_result, '{closing}', to_jsonb(v_closing), true);
END;
$function$;
