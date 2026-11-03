-- Universal touch POS: expand only the existing server-side portal classification.
-- All existing ERP membership, branch scope, cashier permission, inventory lock,
-- idempotency and payment controls remain untouched. No record DML.
CREATE OR REPLACE FUNCTION public.erp_retail_pos_portal_allowed(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurants restaurant
    WHERE restaurant.id = p_restaurant_id
      AND lower(btrim(coalesce(nullif(restaurant.business_type::text, ''), restaurant.business_mode::text, '')))
        IN ('retail','supermarket','warehouse','wholesale','factory','pharmacy','clinic','services','other')
  );
$function$;

COMMENT ON FUNCTION public.erp_retail_pos_portal_allowed(uuid) IS
  'Stock-backed POS portals only. Existing membership, RLS, branch and stock validation are not bypassed. Restaurant/cafe use dedicated POS.';

-- Restaurant cashiers have a different order ledger; give only an approved
-- organization Owner a read-only summary grouped by actual cashier shift.
CREATE OR REPLACE FUNCTION public.erp_restaurant_pos_owner_cashiers(
  p_restaurant_id uuid, p_branch_id uuid DEFAULT NULL, p_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_day date := coalesce(p_date, (now() AT TIME ZONE 'Asia/Riyadh')::date);
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL
    OR p_restaurant_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.erp_memberships membership
      WHERE membership.user_id=auth.uid()
        AND membership.restaurant_id=p_restaurant_id
        AND membership.role='owner'
        AND membership.status='approved'
    )
    OR NOT public.erp_subscription_has_erp_access(p_restaurant_id)
    OR (p_branch_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.branches branch
      WHERE branch.id=p_branch_id AND branch.restaurant_id=p_restaurant_id
    ))
  THEN
    RAISE EXCEPTION 'POS owner scope denied' USING errcode='42501';
  END IF;

  WITH cashier_rows AS (
    SELECT
      shift.id AS shift_id, terminal.branch_id, branch.name AS branch_name,
      terminal.code AS device_code, shift.cashier_id, shift.cashier_name,
      (shift.closed_at IS NULL) AS shift_open,
      (shift.closed_at IS NULL AND terminal.last_seen_at >= now()-interval '5 minutes') AS online,
      COUNT(sale.id) AS receipt_count,
      COALESCE(SUM(sale.net_total),0)::numeric(16,2) AS paid_sales,
      MAX(sale.paid_at) AS last_sale_at
    FROM restaurant_pos_private.shifts shift
    JOIN restaurant_pos_private.terminals terminal ON terminal.id=shift.device_id
    JOIN public.branches branch ON branch.id=terminal.branch_id AND branch.restaurant_id=terminal.restaurant_id
    LEFT JOIN restaurant_pos_private.orders sale
      ON sale.shift_id=shift.id AND sale.status='paid'
      AND (sale.paid_at AT TIME ZONE 'Asia/Riyadh')::date=v_day
    WHERE terminal.restaurant_id=p_restaurant_id
      AND (p_branch_id IS NULL OR terminal.branch_id=p_branch_id)
      AND ((shift.opened_at AT TIME ZONE 'Asia/Riyadh')::date=v_day OR sale.id IS NOT NULL)
    GROUP BY shift.id, terminal.branch_id, branch.name, terminal.code,
      shift.cashier_id, shift.cashier_name, shift.closed_at, terminal.last_seen_at
  )
  SELECT jsonb_build_object(
    'date',v_day,
    'posted_sales',COALESCE((SELECT SUM(paid_sales) FROM cashier_rows),0),
    'receipt_count',COALESCE((SELECT SUM(receipt_count) FROM cashier_rows),0),
    'cashiers',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.last_sale_at DESC NULLS LAST)
                         FROM cashier_rows c),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.erp_restaurant_pos_owner_cashiers(uuid,uuid,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_restaurant_pos_owner_cashiers(uuid,uuid,date) FROM anon;
GRANT EXECUTE ON FUNCTION public.erp_restaurant_pos_owner_cashiers(uuid,uuid,date) TO authenticated;

-- Non-restaurant POS amounts must be grouped by the actual transaction shift.
-- The POS device snapshot covers all shifts, so it is NOT a per-cashier total.
CREATE OR REPLACE FUNCTION public.erp_commerce_pos_owner_cashiers(
  p_restaurant_id uuid, p_branch_id uuid DEFAULT NULL, p_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_day date := coalesce(p_date, (now() AT TIME ZONE 'Asia/Riyadh')::date);
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_restaurant_id IS NULL
    OR NOT public.erp_retail_pos_portal_allowed(p_restaurant_id)
    OR NOT EXISTS (
      SELECT 1 FROM public.erp_memberships membership
      WHERE membership.user_id=auth.uid()
        AND membership.restaurant_id=p_restaurant_id
        AND membership.role='owner'
        AND membership.status='approved'
    )
    OR NOT public.erp_subscription_has_erp_access(p_restaurant_id)
    OR (p_branch_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.branches branch
      WHERE branch.id=p_branch_id AND branch.restaurant_id=p_restaurant_id
    ))
  THEN
    RAISE EXCEPTION 'POS owner scope denied' USING errcode='42501';
  END IF;
  WITH cashier_rows AS (
    SELECT sale.shift_id, sale.branch_id, branch.name AS branch_name,
      device.code AS device_code,
      coalesce(nullif(sale.cashier_name,''),shift.cashier_name) AS cashier_name,
      sale.cashier_user_id,
      count(*) FILTER (WHERE sale.transaction_type='sale') AS receipt_count,
      COALESCE(sum(CASE WHEN sale.transaction_type='sale' THEN sale.net_total
        WHEN sale.transaction_type IN ('refund','void') THEN -sale.net_total ELSE 0 END),0)::numeric(16,2) AS net_sales,
      max(sale.occurred_at) AS last_sale_at
    FROM public.retail_pos_transactions sale
    JOIN public.retail_pos_shifts shift ON shift.id=sale.shift_id
    JOIN public.retail_pos_devices device ON device.id=sale.device_id
      AND device.restaurant_id=sale.restaurant_id AND device.branch_id=sale.branch_id
    JOIN public.branches branch ON branch.id=sale.branch_id AND branch.restaurant_id=sale.restaurant_id
    WHERE sale.restaurant_id=p_restaurant_id
      AND (p_branch_id IS NULL OR sale.branch_id=p_branch_id)
      AND sale.business_date=v_day
      AND sale.status IN ('posted','approved')
    GROUP BY sale.shift_id,sale.branch_id,branch.name,device.code,
      coalesce(nullif(sale.cashier_name,''),shift.cashier_name),sale.cashier_user_id
  )
  SELECT jsonb_build_object(
    'date',v_day,
    'net_sales',coalesce((select sum(net_sales) from cashier_rows),0),
    'receipt_count',coalesce((select sum(receipt_count) from cashier_rows),0),
    'cashiers',coalesce((select jsonb_agg(to_jsonb(c) ORDER BY c.last_sale_at DESC)
       from cashier_rows c),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.erp_commerce_pos_owner_cashiers(uuid,uuid,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_commerce_pos_owner_cashiers(uuid,uuid,date) FROM anon;
GRANT EXECUTE ON FUNCTION public.erp_commerce_pos_owner_cashiers(uuid,uuid,date) TO authenticated;
