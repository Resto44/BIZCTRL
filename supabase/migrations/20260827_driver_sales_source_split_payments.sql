-- Canonical split payments for Driver Sales Sources.
-- One driver may collect both physical cash and network/card payments in one closing.

BEGIN;

ALTER TABLE public.driver_sales_entries
  ADD COLUMN IF NOT EXISTS cash_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS network_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric NOT NULL DEFAULT 0;

-- Preserve historical single-method records while making their split values explicit.
UPDATE public.driver_sales_entries
SET
  cash_amount = CASE
    WHEN lower(COALESCE(payment_method, 'cash')) IN ('cash', 'cash_on_delivery', 'cod') THEN GREATEST(COALESCE(amount, 0), 0)
    ELSE 0
  END,
  network_amount = CASE
    WHEN lower(COALESCE(payment_method, 'cash')) IN ('card', 'network', 'pos', 'visa', 'mastercard', 'mada', 'bank', 'bank_transfer', 'transfer', 'iban', 'online', 'digital', 'gateway', 'wallet', 'e_wallet', 'ewallet') THEN GREATEST(COALESCE(amount, 0), 0)
    ELSE 0
  END,
  total_amount = GREATEST(COALESCE(amount, 0), 0)
WHERE COALESCE(cash_amount, 0) = 0
  AND COALESCE(network_amount, 0) = 0
  AND COALESCE(total_amount, 0) = 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_sales_entries_cash_amount_nonnegative' AND conrelid = 'public.driver_sales_entries'::regclass) THEN
    ALTER TABLE public.driver_sales_entries
      ADD CONSTRAINT driver_sales_entries_cash_amount_nonnegative CHECK (cash_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_sales_entries_network_amount_nonnegative' AND conrelid = 'public.driver_sales_entries'::regclass) THEN
    ALTER TABLE public.driver_sales_entries
      ADD CONSTRAINT driver_sales_entries_network_amount_nonnegative CHECK (network_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_sales_entries_total_amount_split_check' AND conrelid = 'public.driver_sales_entries'::regclass) THEN
    ALTER TABLE public.driver_sales_entries
      ADD CONSTRAINT driver_sales_entries_total_amount_split_check CHECK (total_amount = cash_amount + network_amount);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.erp_normalize_driver_source_payload(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_restaurant_id text := NULLIF(BTRIM(v_payload ->> 'restaurant_id'), '');
  v_restaurant_uuid uuid;
  v_branch_id uuid := NULLIF(v_payload ->> 'branch_id', '')::uuid;
  v_branch text := NULLIF(BTRIM(v_payload ->> 'branch'), '');
  v_sources jsonb := COALESCE(v_payload -> 'sales_sources_json', '[]'::jsonb);
  v_normalized_sources jsonb := '[]'::jsonb;
  v_source jsonb;
  v_entry jsonb;
  v_source_id uuid;
  v_driver_id uuid;
  v_source_master record;
  v_driver record;
  v_driver_entries jsonb;
  v_normalized_driver_entries jsonb;
  v_source_total numeric;
  v_previous_amount numeric;
  v_cash_amount numeric;
  v_network_amount numeric;
  v_total_amount numeric;
  v_legacy_payment_method text;
  v_driver_cash numeric := 0;
  v_driver_network numeric := 0;
  v_seen_driver_ids text[];
BEGIN
  IF jsonb_typeof(v_sources) <> 'array' THEN
    RETURN v_payload;
  END IF;
  IF v_restaurant_id IS NULL OR v_branch_id IS NULL OR v_branch IS NULL THEN
    RETURN v_payload;
  END IF;

  v_restaurant_uuid := v_restaurant_id::uuid;

  FOR v_source IN SELECT value FROM jsonb_array_elements(v_sources) LOOP
    v_driver_entries := v_source -> 'driver_entries';
    IF jsonb_typeof(v_driver_entries) IS DISTINCT FROM 'array' THEN
      v_normalized_sources := v_normalized_sources || jsonb_build_array(v_source);
      CONTINUE;
    END IF;

    IF NULLIF(BTRIM(v_source ->> 'source_id'), '') IS NULL
       OR NOT (v_source ->> 'source_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'SALES_CLOSING_DRIVER_SOURCE_INVALID'
        USING DETAIL = 'A driver source requires a valid Sales Source identifier.';
    END IF;
    v_source_id := (v_source ->> 'source_id')::uuid;

    SELECT id, subcategory
      INTO v_source_master
      FROM public.sales_sources
      WHERE id = v_source_id
        AND restaurant_id::text = v_restaurant_id
        AND COALESCE(is_active, true) = true
        AND COALESCE(allows_driver_entries, false) = true
        AND (
          COALESCE(is_global, false) = true
          OR branch_id IS NULL
          OR branch_id = v_branch_id::text
          OR v_branch_id = ANY(COALESCE(branch_ids, ARRAY[]::uuid[]))
        )
      FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SALES_CLOSING_DRIVER_SOURCE_INVALID'
        USING DETAIL = 'The selected Sales Source is unavailable for driver entries in this branch.';
    END IF;

    v_normalized_driver_entries := '[]'::jsonb;
    v_source_total := 0;
    v_seen_driver_ids := ARRAY[]::text[];

    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_driver_entries) LOOP
      IF NULLIF(BTRIM(v_entry ->> 'driver_id'), '') IS NULL
         OR NOT (v_entry ->> 'driver_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
        RAISE EXCEPTION 'SALES_CLOSING_DRIVER_REQUIRED';
      END IF;
      v_driver_id := (v_entry ->> 'driver_id')::uuid;

      IF v_driver_id::text = ANY(v_seen_driver_ids) THEN
        RAISE EXCEPTION 'SALES_CLOSING_DRIVER_DUPLICATE'
          USING DETAIL = 'A driver can appear only once in a Sales Source for the same Sales Closing shift.';
      END IF;
      v_seen_driver_ids := array_append(v_seen_driver_ids, v_driver_id::text);

      SELECT id, full_name
        INTO v_driver
        FROM public.drivers
        WHERE id = v_driver_id
          AND restaurant_id = v_restaurant_uuid
          AND branch_id = v_branch_id
          AND COALESCE(is_active, true) = true
          AND lower(COALESCE(status, 'active')) <> 'inactive'
        FOR SHARE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALES_CLOSING_DRIVER_BRANCH_INVALID'
          USING DETAIL = 'The selected driver is not active in the Sales Closing branch.';
      END IF;

      IF NULLIF(v_entry ->> 'cash_amount', '') IS NULL
         AND NULLIF(v_entry ->> 'cash', '') IS NULL
         AND NULLIF(v_entry ->> 'network_amount', '') IS NULL
         AND NULLIF(v_entry ->> 'network', '') IS NULL THEN
        -- Safe compatibility for a pending legacy draft created before split payments.
        v_total_amount := GREATEST(COALESCE(NULLIF(v_entry ->> 'amount', '')::numeric, NULLIF(v_entry ->> 'today_amount', '')::numeric, 0), 0);
        v_legacy_payment_method := lower(COALESCE(NULLIF(BTRIM(v_entry ->> 'payment_method'), ''), 'cash'));
        v_cash_amount := CASE WHEN v_legacy_payment_method IN ('cash', 'cash_on_delivery', 'cod') THEN v_total_amount ELSE 0 END;
        v_network_amount := CASE WHEN v_legacy_payment_method IN ('card', 'network', 'pos', 'visa', 'mastercard', 'mada', 'bank', 'bank_transfer', 'transfer', 'iban', 'online', 'digital', 'gateway', 'wallet', 'e_wallet', 'ewallet') THEN v_total_amount ELSE 0 END;
      ELSE
        v_cash_amount := COALESCE(NULLIF(v_entry ->> 'cash_amount', '')::numeric, NULLIF(v_entry ->> 'cash', '')::numeric, 0);
        v_network_amount := COALESCE(NULLIF(v_entry ->> 'network_amount', '')::numeric, NULLIF(v_entry ->> 'network', '')::numeric, 0);
        v_total_amount := v_cash_amount + v_network_amount;
      END IF;
      IF v_cash_amount < 0 OR v_network_amount < 0 THEN
        RAISE EXCEPTION 'SALES_CLOSING_DRIVER_PAYMENT_NEGATIVE'
          USING DETAIL = 'Driver Cash and Network amounts cannot be negative.';
      END IF;
      IF v_total_amount <= 0 THEN
        RAISE EXCEPTION 'SALES_CLOSING_DRIVER_AMOUNT_INVALID'
          USING DETAIL = 'A driver requires a positive Cash plus Network total.';
      END IF;

      v_source_total := v_source_total + v_total_amount;
      v_driver_cash := v_driver_cash + v_cash_amount;
      v_driver_network := v_driver_network + v_network_amount;

      v_normalized_driver_entries := v_normalized_driver_entries || jsonb_build_array(jsonb_build_object(
        'client_row_id', COALESCE(NULLIF(BTRIM(v_entry ->> 'client_row_id'), ''), gen_random_uuid()::text),
        'driver_id', v_driver.id,
        'driver_name', v_driver.full_name,
        'sales_source_id', v_source_id,
        'subcategory', COALESCE(NULLIF(BTRIM(v_source_master.subcategory), ''), NULLIF(BTRIM(v_entry ->> 'subcategory'), ''), 'Drivers'),
        'date', v_payload ->> 'date',
        'branch_id', v_branch_id,
        'branch', v_branch,
        'shift', v_payload ->> 'shift',
        'cash_amount', v_cash_amount,
        'network_amount', v_network_amount,
        'total_amount', v_total_amount,
        'amount', v_total_amount,
        'today_amount', v_total_amount,
        'payment_method', 'split',
        'payment_bucket', 'split',
        'notes', COALESCE(v_entry ->> 'notes', '')
      ));
    END LOOP;

    v_previous_amount := GREATEST(COALESCE(NULLIF(v_source ->> 'previous_amount', '')::numeric, 0), 0);
    v_normalized_sources := v_normalized_sources || jsonb_build_array(
      v_source || jsonb_build_object(
        'allows_driver_entries', true,
        'subcategory', COALESCE(NULLIF(BTRIM(v_source_master.subcategory), ''), NULLIF(BTRIM(v_source ->> 'subcategory'), ''), 'Drivers'),
        'amount', v_source_total,
        'today_amount', v_source_total,
        'previous_amount', v_previous_amount,
        'total_amount', v_previous_amount + v_source_total,
        'payment_bucket', 'other',
        'driver_entries', v_normalized_driver_entries
      )
    );
  END LOOP;

  v_payload := jsonb_set(v_payload, '{sales_sources_json}', v_normalized_sources, true);
  v_payload := jsonb_set(v_payload, '{restaurant_cash}', to_jsonb(GREATEST(COALESCE(NULLIF(v_payload ->> 'restaurant_cash', '')::numeric, 0) + v_driver_cash, 0)), true);
  v_payload := jsonb_set(v_payload, '{cash}', to_jsonb(GREATEST(COALESCE(NULLIF(v_payload ->> 'cash', '')::numeric, 0) + v_driver_cash, 0)), true);
  v_payload := jsonb_set(v_payload, '{restaurant_network}', to_jsonb(GREATEST(COALESCE(NULLIF(v_payload ->> 'restaurant_network', '')::numeric, 0) + v_driver_network, 0)), true);
  v_payload := jsonb_set(v_payload, '{network}', to_jsonb(GREATEST(COALESCE(NULLIF(v_payload ->> 'network', '')::numeric, 0) + v_driver_network, 0)), true);
  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_save_sales_closing(
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
  v_payload jsonb;
  v_result jsonb;
  v_closing jsonb;
  v_closing_id uuid;
  v_restaurant_id uuid;
  v_state text;
BEGIN
  v_payload := public.erp_normalize_driver_source_payload(
    public.erp_prepare_driver_source_payload(p_payload)
  );
  v_result := public.erp_save_sales_closing_core(v_payload, p_closing_id, p_request_id);
  v_closing := v_result -> 'closing';
  IF v_closing IS NULL OR v_closing ->> 'id' IS NULL THEN
    RETURN v_result;
  END IF;

  v_closing_id := (v_closing ->> 'id')::uuid;
  v_restaurant_id := (v_closing ->> 'restaurant_id')::uuid;
  v_state := lower(COALESCE(v_closing ->> 'closing_state', v_payload ->> 'closing_state', 'draft'));

  DELETE FROM public.driver_sales_entries WHERE closing_id = v_closing_id;

  INSERT INTO public.driver_sales_entries (
    restaurant_id, tenant_id, branch, branch_id, driver_id, driver_name,
    sales_source_id, subcategory, closing_id, shift, date, amount,
    cash_amount, network_amount, total_amount, payment_method, notes,
    status, finalized_at, created_by, created_date, updated_date
  )
  SELECT
    v_restaurant_id,
    v_restaurant_id::text,
    COALESCE(source ->> 'branch', v_closing ->> 'branch'),
    (source ->> 'branch_id')::uuid,
    (entry ->> 'driver_id')::uuid,
    entry ->> 'driver_name',
    (source ->> 'source_id')::uuid,
    COALESCE(NULLIF(entry ->> 'subcategory', ''), NULLIF(source ->> 'subcategory', ''), 'Drivers'),
    v_closing_id,
    COALESCE(entry ->> 'shift', v_closing ->> 'shift'),
    COALESCE(NULLIF(entry ->> 'date', '')::date, (v_closing ->> 'date')::date),
    GREATEST(COALESCE(NULLIF(entry ->> 'total_amount', '')::numeric, 0), 0),
    GREATEST(COALESCE(NULLIF(entry ->> 'cash_amount', '')::numeric, 0), 0),
    GREATEST(COALESCE(NULLIF(entry ->> 'network_amount', '')::numeric, 0), 0),
    GREATEST(COALESCE(NULLIF(entry ->> 'total_amount', '')::numeric, 0), 0),
    'split',
    COALESCE(entry ->> 'notes', ''),
    CASE WHEN v_state = 'finalized' THEN 'finalized' ELSE 'draft' END,
    CASE WHEN v_state = 'finalized' THEN COALESCE(NULLIF(v_closing ->> 'finalized_at', '')::timestamptz, now()) ELSE NULL END,
    auth.uid()::text,
    now(),
    now()
  FROM jsonb_array_elements(COALESCE(v_payload -> 'sales_sources_json', '[]'::jsonb)) AS source
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(source -> 'driver_entries', '[]'::jsonb)) AS entry;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.erp_normalize_driver_source_payload(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_save_sales_closing(jsonb, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_save_sales_closing(jsonb, uuid, uuid) TO authenticated;

COMMENT ON COLUMN public.driver_sales_entries.cash_amount IS 'Physical cash collected by this driver for the linked Sales Closing.';
COMMENT ON COLUMN public.driver_sales_entries.network_amount IS 'Network/card amount collected by this driver for the linked Sales Closing.';
COMMENT ON COLUMN public.driver_sales_entries.total_amount IS 'Canonical driver revenue equal to cash_amount plus network_amount.';

COMMIT;
