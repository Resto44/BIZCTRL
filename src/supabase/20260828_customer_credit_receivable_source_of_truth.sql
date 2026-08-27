-- Customer Credit / Debts & Receivables source-of-truth repair.
-- Customer Master stays authoritative for identity and credit limit. Customer
-- receivable rows stay authoritative for outstanding debt and collections.

BEGIN;

ALTER TABLE public.debt_records
  ADD COLUMN IF NOT EXISTS sales_closing_id uuid,
  ADD COLUMN IF NOT EXISTS settlement_request_id uuid;

ALTER TABLE public.debt_payments
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS request_id uuid;

ALTER TABLE public.customer_collections
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS request_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debt_records_customer_id_fkey') THEN
    ALTER TABLE public.debt_records
      ADD CONSTRAINT debt_records_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debt_records_sales_closing_id_fkey') THEN
    ALTER TABLE public.debt_records
      ADD CONSTRAINT debt_records_sales_closing_id_fkey
      FOREIGN KEY (sales_closing_id) REFERENCES public.daily_sales(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debt_payments_customer_id_fkey') THEN
    ALTER TABLE public.debt_payments
      ADD CONSTRAINT debt_payments_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_collections_customer_id_fkey') THEN
    ALTER TABLE public.customer_collections
      ADD CONSTRAINT customer_collections_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) NOT VALID;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_debt_records_customer_receivable_scope
  ON public.debt_records (restaurant_id, branch_id, customer_id)
  WHERE party_type = 'customer' AND type = 'receivable';
CREATE INDEX IF NOT EXISTS idx_debt_records_sales_closing_customer
  ON public.debt_records (sales_closing_id, customer_id)
  WHERE sales_closing_id IS NOT NULL AND customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_records_sales_closing_customer
  ON public.debt_records (sales_closing_id, customer_id)
  WHERE sales_closing_id IS NOT NULL AND customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_payments_request_id
  ON public.debt_payments (request_id)
  WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_collections_request_id
  ON public.customer_collections (request_id)
  WHERE request_id IS NOT NULL;

-- Link only unambiguous legacy receivables. A row with no single matching
-- Customer Master identity remains unlinked rather than being assigned by a
-- display name alone.
WITH candidate_links AS (
  SELECT debt.id,
         MIN(customer.id::text)::uuid AS customer_id
    FROM public.debt_records AS debt
    JOIN public.customers AS customer
      ON customer.restaurant_id = debt.restaurant_id
     AND (customer.branch_id = debt.branch_id OR (customer.branch_id IS NULL AND customer.branch = debt.branch))
     AND lower(btrim(customer.name)) = lower(btrim(debt.party_name))
     AND (
       NULLIF(regexp_replace(COALESCE(debt.party_phone, ''), '[^0-9]+', '', 'g'), '') IS NULL
       OR NULLIF(regexp_replace(COALESCE(customer.phone, ''), '[^0-9]+', '', 'g'), '') = NULLIF(regexp_replace(COALESCE(debt.party_phone, ''), '[^0-9]+', '', 'g'), '')
     )
   WHERE debt.customer_id IS NULL
     AND debt.party_type = 'customer'
     AND debt.type = 'receivable'
   GROUP BY debt.id
  HAVING COUNT(*) = 1
)
UPDATE public.debt_records AS debt
   SET customer_id = candidate_links.customer_id,
       updated_date = now()
  FROM candidate_links
 WHERE debt.id = candidate_links.id;

UPDATE public.debt_payments AS payment
   SET customer_id = debt.customer_id,
       updated_date = now()
  FROM public.debt_records AS debt
 WHERE payment.debt_id = debt.id
   AND payment.customer_id IS NULL
   AND debt.customer_id IS NOT NULL;

UPDATE public.customer_collections AS collection
   SET customer_id = debt.customer_id,
       updated_date = now()
  FROM public.debt_records AS debt
 WHERE collection.debt_id = debt.id
   AND collection.customer_id IS NULL
   AND debt.customer_id IS NOT NULL;

-- remaining_amount is a derived balance cache. Normalize only customer
-- receivables from their preserved principal and paid values. Historical paid
-- amounts and records are never deleted or overwritten.
UPDATE public.debt_records
   SET remaining_amount = GREATEST(COALESCE(total_amount, 0) - COALESCE(paid_amount, 0), 0),
       status = CASE
         WHEN GREATEST(COALESCE(total_amount, 0) - COALESCE(paid_amount, 0), 0) = 0 THEN 'paid'
         WHEN COALESCE(paid_amount, 0) > 0 THEN 'partial'
         ELSE 'open'
       END,
       updated_date = now()
 WHERE party_type = 'customer'
   AND type = 'receivable'
   AND (
     COALESCE(remaining_amount, 0) <> GREATEST(COALESCE(total_amount, 0) - COALESCE(paid_amount, 0), 0)
     OR (GREATEST(COALESCE(total_amount, 0) - COALESCE(paid_amount, 0), 0) = 0 AND status IS DISTINCT FROM 'paid')
   );

CREATE OR REPLACE FUNCTION public.erp_refresh_customer_receivable_cache(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer public.customers%ROWTYPE;
  v_total_credit numeric := 0;
  v_total_collected numeric := 0;
  v_outstanding numeric := 0;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_customer FROM public.customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(SUM(GREATEST(COALESCE(total_amount, 0), 0)) FILTER (WHERE status IS DISTINCT FROM 'written_off'), 0),
    COALESCE(SUM(GREATEST(COALESCE(paid_amount, 0), 0)) FILTER (WHERE status IS DISTINCT FROM 'written_off'), 0),
    COALESCE(SUM(GREATEST(COALESCE(remaining_amount, 0), 0)) FILTER (WHERE status IS DISTINCT FROM 'written_off'), 0)
    INTO v_total_credit, v_total_collected, v_outstanding
    FROM public.debt_records
   WHERE customer_id = p_customer_id
     AND party_type = 'customer'
     AND type = 'receivable';

  UPDATE public.customers
     SET total_credit_sales = v_total_credit,
         total_collected = v_total_collected,
         outstanding_balance = v_outstanding,
         last_transaction_date = CASE WHEN v_total_credit > 0 THEN CURRENT_DATE ELSE last_transaction_date END,
         updated_date = now()
   WHERE id = p_customer_id
   RETURNING * INTO v_customer;

  RETURN jsonb_build_object(
    'customer_id', v_customer.id,
    'total_credit_sales', v_total_credit,
    'total_collected', v_total_collected,
    'outstanding_balance', v_outstanding,
    'credit_limit', GREATEST(COALESCE(v_customer.credit_limit, 0), 0),
    'available_credit', GREATEST(COALESCE(v_customer.credit_limit, 0) - v_outstanding, 0)
  );
END;
$$;

-- Refresh only customers that have a canonical receivable reference. The
-- Customer Master amount columns remain compatibility caches, never the source
-- used to calculate outstanding debt in Customer Credit.
DO $$
DECLARE
  v_customer_id uuid;
BEGIN
  FOR v_customer_id IN
    SELECT DISTINCT customer_id
      FROM public.debt_records
     WHERE customer_id IS NOT NULL
       AND party_type = 'customer'
       AND type = 'receivable'
  LOOP
    PERFORM public.erp_refresh_customer_receivable_cache(v_customer_id);
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.erp_create_customer_receivable(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid := NULLIF(BTRIM(COALESCE(p_payload ->> 'customer_id', '')), '')::uuid;
  v_branch_id uuid := NULLIF(BTRIM(COALESCE(p_payload ->> 'branch_id', '')), '')::uuid;
  v_branch text := NULLIF(BTRIM(COALESCE(p_payload ->> 'branch', '')), '');
  v_total numeric := GREATEST(COALESCE(NULLIF(p_payload ->> 'total_amount', '')::numeric, 0), 0);
  v_paid numeric := GREATEST(COALESCE(NULLIF(p_payload ->> 'paid_amount', '')::numeric, 0), 0);
  v_date date := COALESCE(NULLIF(p_payload ->> 'date', '')::date, CURRENT_DATE);
  v_customer public.customers%ROWTYPE;
  v_debt public.debt_records%ROWTYPE;
  v_outstanding numeric := 0;
  v_remaining numeric;
  v_limit numeric;
  v_request_id uuid := COALESCE(NULLIF(BTRIM(COALESCE(p_payload ->> 'request_id', '')), '')::uuid, gen_random_uuid());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_AUTH_REQUIRED';
  END IF;
  IF v_customer_id IS NULL OR v_branch_id IS NULL OR v_branch IS NULL OR v_total <= 0 OR v_paid > v_total THEN
    RAISE EXCEPTION 'CUSTOMER_RECEIVABLE_INVALID';
  END IF;

  SELECT * INTO v_customer
    FROM public.customers
   WHERE id = v_customer_id
     AND COALESCE(is_active, true) = true
     AND (branch_id IS NULL OR branch_id = v_branch_id OR branch IS NULL OR branch = v_branch)
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALES_CLOSING_CREDIT_CUSTOMER_INVALID';
  END IF;
  IF NOT public.erp_can_write_scope(v_customer.restaurant_id, v_branch_id) THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
  END IF;

  SELECT COALESCE(SUM(GREATEST(COALESCE(remaining_amount, 0), 0)) FILTER (WHERE status IS DISTINCT FROM 'written_off'), 0)
    INTO v_outstanding
    FROM public.debt_records
   WHERE customer_id = v_customer_id
     AND party_type = 'customer'
     AND type = 'receivable';
  v_remaining := v_total - v_paid;
  v_limit := GREATEST(COALESCE(v_customer.credit_limit, 0), 0);
  IF v_remaining > GREATEST(v_limit - v_outstanding, 0) THEN
    RAISE EXCEPTION 'SALES_CLOSING_CREDIT_LIMIT_EXCEEDED';
  END IF;

  INSERT INTO public.debt_records (
    restaurant_id, tenant_id, branch, branch_id, type, party_type, party_name,
    party_phone, customer_id, settlement_request_id, invoice_number, date, due_date,
    total_amount, paid_amount, remaining_amount, status, description, notes,
    created_by, created_date, updated_date
  ) VALUES (
    v_customer.restaurant_id, COALESCE(v_customer.tenant_id, v_customer.restaurant_id::text),
    v_branch, v_branch_id, 'receivable', 'customer', v_customer.name, v_customer.phone,
    v_customer.id, v_request_id, NULLIF(BTRIM(COALESCE(p_payload ->> 'invoice_number', '')), ''),
    v_date, NULLIF(p_payload ->> 'due_date', '')::date, v_total, v_paid, v_remaining,
    CASE WHEN v_remaining = 0 THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'open' END,
    NULLIF(BTRIM(COALESCE(p_payload ->> 'description', 'Manual customer credit sale')), ''),
    NULLIF(BTRIM(COALESCE(p_payload ->> 'notes', '')), ''), auth.uid()::text, now(), now()
  )
  ON CONFLICT (settlement_request_id) WHERE settlement_request_id IS NOT NULL
  DO NOTHING
  RETURNING * INTO v_debt;

  IF NOT FOUND THEN
    SELECT * INTO v_debt FROM public.debt_records WHERE settlement_request_id = v_request_id LIMIT 1;
    RETURN jsonb_build_object('debt', to_jsonb(v_debt), 'idempotent', true, 'customer_position', public.erp_refresh_customer_receivable_cache(v_customer_id));
  END IF;

  RETURN jsonb_build_object('debt', to_jsonb(v_debt), 'idempotent', false, 'customer_position', public.erp_refresh_customer_receivable_cache(v_customer_id));
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_records_settlement_request_id
  ON public.debt_records (settlement_request_id)
  WHERE settlement_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.erp_record_customer_debt_payment(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_debt_id uuid := NULLIF(BTRIM(COALESCE(p_payload ->> 'debt_id', '')), '')::uuid;
  v_request_id uuid := COALESCE(NULLIF(BTRIM(COALESCE(p_payload ->> 'request_id', '')), '')::uuid, gen_random_uuid());
  v_amount numeric := GREATEST(COALESCE(NULLIF(p_payload ->> 'amount', '')::numeric, 0), 0);
  v_date date := COALESCE(NULLIF(p_payload ->> 'date', '')::date, CURRENT_DATE);
  v_method text := lower(COALESCE(NULLIF(BTRIM(p_payload ->> 'payment_method'), ''), 'cash'));
  v_notes text := NULLIF(BTRIM(COALESCE(p_payload ->> 'notes', '')), '');
  v_debt public.debt_records%ROWTYPE;
  v_payment public.debt_payments%ROWTYPE;
  v_new_paid numeric;
  v_new_remaining numeric;
  v_customer_cache jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_AUTH_REQUIRED';
  END IF;
  IF v_debt_id IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'CUSTOMER_DEBT_PAYMENT_INVALID';
  END IF;

  SELECT * INTO v_payment
    FROM public.debt_payments
   WHERE request_id = v_request_id
   LIMIT 1;
  IF FOUND THEN
    SELECT public.erp_refresh_customer_receivable_cache(v_payment.customer_id) INTO v_customer_cache;
    RETURN jsonb_build_object('payment', to_jsonb(v_payment), 'idempotent', true, 'customer_position', v_customer_cache);
  END IF;

  SELECT * INTO v_debt
    FROM public.debt_records
   WHERE id = v_debt_id
     AND party_type = 'customer'
     AND type = 'receivable'
   FOR UPDATE;
  IF NOT FOUND OR v_debt.customer_id IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_DEBT_PAYMENT_INVALID';
  END IF;
  IF NOT public.erp_can_write_scope(v_debt.restaurant_id, v_debt.branch_id) THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
  END IF;
  IF v_debt.status IN ('paid', 'written_off') OR COALESCE(v_debt.remaining_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'CUSTOMER_DEBT_PAYMENT_SETTLED';
  END IF;
  IF v_amount > COALESCE(v_debt.remaining_amount, 0) THEN
    RAISE EXCEPTION 'CUSTOMER_DEBT_PAYMENT_EXCEEDS_REMAINING';
  END IF;

  v_new_paid := COALESCE(v_debt.paid_amount, 0) + v_amount;
  v_new_remaining := GREATEST(COALESCE(v_debt.total_amount, 0) - v_new_paid, 0);

  UPDATE public.debt_records
     SET paid_amount = v_new_paid,
         remaining_amount = v_new_remaining,
         status = CASE WHEN v_new_remaining = 0 THEN 'paid' ELSE 'partial' END,
         updated_date = now()
   WHERE id = v_debt.id
   RETURNING * INTO v_debt;

  INSERT INTO public.debt_payments (
    debt_id, customer_id, amount, date, payment_method, notes, party_name,
    party_phone, restaurant_id, branch, branch_id, tenant_id, request_id,
    recorded_by, recorded_by_name, created_by, created_date, updated_date
  ) VALUES (
    v_debt.id, v_debt.customer_id, v_amount, v_date, v_method, v_notes, v_debt.party_name,
    v_debt.party_phone, v_debt.restaurant_id, v_debt.branch, v_debt.branch_id,
    COALESCE(v_debt.tenant_id, v_debt.restaurant_id::text), v_request_id,
    auth.uid()::text, auth.uid()::text, auth.uid()::text, now(), now()
  ) RETURNING * INTO v_payment;

  -- Preserve the existing Customer Management collection history from the same
  -- request. The request_id unique index makes retries idempotent.
  INSERT INTO public.customer_collections (
    debt_id, customer_id, customer_name, amount, date, payment_method, notes,
    branch, branch_id, restaurant_id, tenant_id, request_id, created_by, created_date, updated_date
  ) VALUES (
    v_debt.id, v_debt.customer_id, v_debt.party_name, v_amount, v_date, v_method, v_notes,
    v_debt.branch, v_debt.branch_id, v_debt.restaurant_id,
    COALESCE(v_debt.tenant_id, v_debt.restaurant_id::text), v_request_id, auth.uid()::text, now(), now()
  );

  -- Treasury receives the repayment as a collection, not as sales revenue.
  INSERT INTO public.wallet_transactions (
    transaction_date, transaction_type, direction, wallet, branch, branch_id,
    amount, payment_method, description, reference_id, auto_generated,
    recorded_by, created_by, created_date, updated_date, restaurant_id, tenant_id
  ) VALUES (
    v_date,
    CASE WHEN v_method IN ('cash', 'cash_on_delivery', 'cod') THEN 'credit_collection_cash' ELSE 'credit_collection_network' END,
    'in',
    CASE WHEN v_method IN ('cash', 'cash_on_delivery', 'cod') THEN 'branch_cash' ELSE 'owner_network' END,
    v_debt.branch, v_debt.branch_id, v_amount, v_method,
    'Customer debt repayment', v_payment.id::text, true,
    auth.uid()::text, auth.uid()::text, now(), now(), v_debt.restaurant_id,
    COALESCE(v_debt.tenant_id, v_debt.restaurant_id::text)
  );

  SELECT public.erp_refresh_customer_receivable_cache(v_debt.customer_id) INTO v_customer_cache;
  RETURN jsonb_build_object('payment', to_jsonb(v_payment), 'debt', to_jsonb(v_debt), 'idempotent', false, 'customer_position', v_customer_cache);
END;
$$;

-- Wrap the deployed Closing core instead of duplicating its cash, driver,
-- expense, permission, snapshot, and idempotency logic. The compatibility core
-- still validates Customer Master credit limits; this wrapper first refreshes
-- the selected Customer Master cache from receivables and then writes a single
-- receivable row per finalized Closing/customer inside the same transaction.
DO $$
BEGIN
  IF to_regprocedure('public.erp_save_sales_closing_core_legacy_customer_balance(jsonb,uuid,uuid)') IS NULL THEN
    ALTER FUNCTION public.erp_save_sales_closing_core(jsonb, uuid, uuid)
      RENAME TO erp_save_sales_closing_core_legacy_customer_balance;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.erp_save_sales_closing_core(
  p_payload jsonb,
  p_closing_id uuid DEFAULT NULL,
  p_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entries jsonb := COALESCE(p_payload -> 'credit_entries_json', '[]'::jsonb);
  v_entry jsonb;
  v_customer_id uuid;
  v_result jsonb;
  v_closing jsonb;
  v_closing_id uuid;
  v_entry_amount numeric;
  v_saved_debt public.debt_records%ROWTYPE;
  v_existing_paid numeric;
BEGIN
  IF jsonb_typeof(v_entries) = 'array' THEN
    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_entries) LOOP
      IF NULLIF(BTRIM(COALESCE(v_entry ->> 'customer_id', '')), '') IS NOT NULL THEN
        v_customer_id := (v_entry ->> 'customer_id')::uuid;
        PERFORM public.erp_refresh_customer_receivable_cache(v_customer_id);
      END IF;
    END LOOP;
  END IF;

  v_result := public.erp_save_sales_closing_core_legacy_customer_balance(p_payload, p_closing_id, p_request_id);
  v_closing := v_result -> 'closing';
  IF v_closing IS NULL OR v_closing ->> 'id' IS NULL OR COALESCE((v_result ->> 'idempotent')::boolean, false) THEN
    RETURN v_result;
  END IF;
  IF lower(COALESCE(v_closing ->> 'closing_state', '')) <> 'finalized'
     OR COALESCE((v_result ->> 'finalized_transition')::boolean, false) = false THEN
    RETURN v_result;
  END IF;

  v_closing_id := (v_closing ->> 'id')::uuid;
  v_entries := COALESCE(v_closing -> 'credit_entries_json', '[]'::jsonb);
  IF jsonb_typeof(v_entries) <> 'array' THEN
    RETURN v_result;
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_entries) LOOP
    v_entry_amount := GREATEST(COALESCE(NULLIF(v_entry ->> 'today_credit', '')::numeric, NULLIF(v_entry ->> 'amount', '')::numeric, 0), 0);
    IF v_entry_amount <= 0 OR NULLIF(BTRIM(COALESCE(v_entry ->> 'customer_id', '')), '') IS NULL THEN
      CONTINUE;
    END IF;
    v_customer_id := (v_entry ->> 'customer_id')::uuid;

    SELECT paid_amount INTO v_existing_paid
      FROM public.debt_records
     WHERE sales_closing_id = v_closing_id
       AND customer_id = v_customer_id
     FOR UPDATE;
    IF FOUND AND COALESCE(v_existing_paid, 0) > v_entry_amount THEN
      RAISE EXCEPTION 'SALES_CLOSING_CREDIT_EDIT_BELOW_PAID';
    END IF;

    INSERT INTO public.debt_records (
      restaurant_id, tenant_id, branch, branch_id, type, party_type, party_name,
      party_phone, customer_id, sales_closing_id, source_id, date, total_amount, paid_amount,
      remaining_amount, status, description, notes, created_by, created_date, updated_date
    ) VALUES (
      (v_closing ->> 'restaurant_id')::uuid,
      COALESCE(v_closing ->> 'tenant_id', v_closing ->> 'restaurant_id'),
      v_closing ->> 'branch', (v_closing ->> 'branch_id')::uuid, 'receivable', 'customer',
      v_entry ->> 'customer_name_snapshot', NULLIF(v_entry ->> 'customer_phone', ''),
      v_customer_id, v_closing_id, NULLIF(v_entry ->> 'source_id', '')::uuid, (v_closing ->> 'date')::date, v_entry_amount, 0,
      v_entry_amount, 'open', 'Credit sale from Sales Closing', NULLIF(v_entry ->> 'notes', ''),
      auth.uid()::text, now(), now()
    )
    ON CONFLICT (sales_closing_id, customer_id) WHERE sales_closing_id IS NOT NULL AND customer_id IS NOT NULL
    DO UPDATE SET
      total_amount = EXCLUDED.total_amount,
      remaining_amount = GREATEST(EXCLUDED.total_amount - COALESCE(public.debt_records.paid_amount, 0), 0),
      status = CASE
        WHEN GREATEST(EXCLUDED.total_amount - COALESCE(public.debt_records.paid_amount, 0), 0) = 0 THEN 'paid'
        WHEN COALESCE(public.debt_records.paid_amount, 0) > 0 THEN 'partial'
        ELSE 'open'
      END,
      party_name = EXCLUDED.party_name,
      party_phone = EXCLUDED.party_phone,
      notes = EXCLUDED.notes,
      updated_date = now()
    RETURNING * INTO v_saved_debt;

    PERFORM public.erp_refresh_customer_receivable_cache(v_customer_id);
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.erp_refresh_customer_receivable_cache(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_create_customer_receivable(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_record_customer_debt_payment(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_save_sales_closing_core(jsonb, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_refresh_customer_receivable_cache(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_create_customer_receivable(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_record_customer_debt_payment(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_save_sales_closing_core(jsonb, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.erp_create_customer_receivable(jsonb) IS
  'Atomically creates one Customer Master-linked receivable after branch, active status, and available-credit validation.';
COMMENT ON FUNCTION public.erp_record_customer_debt_payment(jsonb) IS
  'Atomically records a customer receivable repayment, updates the debt and Customer Master compatibility cache, and posts a non-revenue Treasury collection.';
COMMENT ON FUNCTION public.erp_save_sales_closing_core(jsonb, uuid, uuid) IS
  'Sales Closing compatibility wrapper that derives Customer Credit from receivables and creates exactly one linked receivable per finalized Closing/customer.';

COMMIT;
