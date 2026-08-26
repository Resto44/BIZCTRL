-- Repair ordinary Sales Source saves after canonical driver-source support.
-- Legacy clients sent `driver_entries: []` on every source. Only explicitly
-- driver-enabled sources may reach the driver normalizer with that property.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_prepare_driver_source_payload(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_sources jsonb := COALESCE(v_payload -> 'sales_sources_json', '[]'::jsonb);
  v_prepared_sources jsonb := '[]'::jsonb;
  v_source jsonb;
BEGIN
  IF jsonb_typeof(v_sources) <> 'array' THEN
    RETURN v_payload;
  END IF;

  FOR v_source IN SELECT value FROM jsonb_array_elements(v_sources) LOOP
    IF lower(COALESCE(v_source ->> 'allows_driver_entries', 'false')) = 'true' THEN
      v_prepared_sources := v_prepared_sources || jsonb_build_array(v_source);
    ELSE
      v_prepared_sources := v_prepared_sources || jsonb_build_array(v_source - 'driver_entries');
    END IF;
  END LOOP;

  RETURN jsonb_set(v_payload, '{sales_sources_json}', v_prepared_sources, true);
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
    payment_method, notes, status, finalized_at, created_by, created_date, updated_date
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
    GREATEST(COALESCE(NULLIF(entry ->> 'amount', '')::numeric, 0), 0),
    COALESCE(NULLIF(entry ->> 'payment_method', ''), 'cash'),
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

REVOKE ALL ON FUNCTION public.erp_prepare_driver_source_payload(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_save_sales_closing(jsonb, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_save_sales_closing(jsonb, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.erp_prepare_driver_source_payload(jsonb) IS
  'Removes stale empty driver-entry payloads from standard Sales Sources before Sales Closing normalization.';

COMMIT;
