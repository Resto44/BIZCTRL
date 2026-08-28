BEGIN;

-- Customer Credit is a transaction interface only.
-- Financial truth is always derived from customer receivables in debt_records.

CREATE OR REPLACE FUNCTION public.erp_list_customer_credit_options(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  customer_name text,
  name text,
  phone text,
  credit_limit numeric,
  outstanding_balance numeric,
  total_credit_sales numeric,
  total_collected numeric,
  available_credit numeric,
  credit_status text,
  branch text,
  branch_id uuid,
  is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_key text;
  v_search text := NULLIF(BTRIM(COALESCE(p_search, '')), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50);
BEGIN
  IF auth.uid() IS NULL
     OR p_restaurant_id IS NULL
     OR p_branch_id IS NULL
     OR NOT public.erp_can_access_scope_text(p_restaurant_id::text, p_branch_id::text) THEN
    RAISE EXCEPTION 'SALES_CLOSING_PERMISSION_DENIED';
  END IF;

  SELECT b.branch_key INTO v_branch_key
  FROM public.branches b
  WHERE b.id = p_branch_id AND b.restaurant_id = p_restaurant_id
  LIMIT 1;

  IF v_branch_key IS NULL THEN
    RAISE EXCEPTION 'SALES_CLOSING_BRANCH_CONTEXT_INVALID';
  END IF;

  RETURN QUERY
  WITH receivable AS (
    SELECT d.customer_id,
           COALESCE(SUM(GREATEST(COALESCE(d.remaining_amount,0),0)) FILTER (WHERE d.status IS DISTINCT FROM 'written_off'),0) AS outstanding_balance,
           COALESCE(SUM(GREATEST(COALESCE(d.total_amount,0),0)) FILTER (WHERE d.status IS DISTINCT FROM 'written_off'),0) AS total_credit_sales,
           COALESCE(SUM(GREATEST(COALESCE(d.paid_amount,0),0)) FILTER (WHERE d.status IS DISTINCT FROM 'written_off'),0) AS total_collected
      FROM public.debt_records d
     WHERE d.restaurant_id = p_restaurant_id
       AND d.party_type = 'customer'
       AND d.type = 'receivable'
       AND d.customer_id IS NOT NULL
       AND (d.branch_id = p_branch_id OR (d.branch_id IS NULL AND d.branch = v_branch_key))
     GROUP BY d.customer_id
  )
  SELECT c.id,
         c.name,
         c.name,
         COALESCE(c.phone,''),
         GREATEST(COALESCE(c.credit_limit,0),0),
         COALESCE(r.outstanding_balance,0),
         COALESCE(r.total_credit_sales,0),
         COALESCE(r.total_collected,0),
         GREATEST(GREATEST(COALESCE(c.credit_limit,0),0) - COALESCE(r.outstanding_balance,0),0),
         CASE WHEN COALESCE(r.outstanding_balance,0) > 0 THEN 'outstanding' ELSE 'settled' END,
         c.branch,
         c.branch_id,
         COALESCE(c.is_active,true)
    FROM public.customers c
    LEFT JOIN receivable r ON r.customer_id = c.id
   WHERE c.restaurant_id = p_restaurant_id
     AND COALESCE(c.is_active,true) = true
     AND (c.branch_id IS NULL OR c.branch_id = p_branch_id OR c.branch IS NULL OR c.branch = v_branch_key)
     AND (v_search IS NULL OR c.name ILIKE '%'||v_search||'%' OR COALESCE(c.phone,'') ILIKE '%'||v_search||'%' OR COALESCE(c.customer_code,'') ILIKE '%'||v_search||'%')
   ORDER BY c.name
   LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.erp_list_customer_credit_options(uuid, uuid, text, integer)
IS 'Customer Credit options: Customer Master provides identity/limit; debt_records provides every financial balance.';

REVOKE ALL ON FUNCTION public.erp_list_customer_credit_options(uuid, uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_list_customer_credit_options(uuid, uuid, text, integer) TO authenticated;

COMMIT;
