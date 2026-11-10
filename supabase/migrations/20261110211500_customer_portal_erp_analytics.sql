-- Read-only, permission-scoped analytics for the customer self-service portal.
-- The customer's current balance remains supplied by erp_customer_portal_statement.
-- Period revenue metrics are distinct: credit invoices, received credit payments and
-- placed orders; orders may overlap invoices and MUST NOT be added to credit totals.
CREATE OR REPLACE FUNCTION customer_portal_private.analytics(
  p_customer_id uuid,
  p_period text DEFAULT 'month',
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $analytics$
DECLARE
  c public.customers;
  v_today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  v_start date;
  v_end date;
  v_first date;
  v_grain text;
  v_step interval;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_PORTAL_FORBIDDEN';
  END IF;
  -- Match the existing customer statement scope, including tenant AND optional branch.
  SELECT customer.* INTO c
  FROM public.customers customer
  JOIN public.customer_portal_access a ON a.customer_id = customer.id
  WHERE customer.id = p_customer_id
    AND a.user_id = auth.uid()
    AND a.active IS TRUE
    AND customer.is_active IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_PORTAL_FORBIDDEN'; END IF;

  IF p_period NOT IN ('day','week','month','3m','6m','year','custom')
     OR p_period IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_PORTAL_FILTER_INVALID';
  END IF;

  CASE p_period
    WHEN 'day' THEN v_start := v_today;
    WHEN 'week' THEN v_start := v_today - 6;
    WHEN 'month' THEN v_start := date_trunc('month',v_today::timestamp)::date;
    WHEN '3m' THEN v_start := (date_trunc('month',v_today::timestamp) - interval '2 months')::date;
    WHEN '6m' THEN v_start := (date_trunc('month',v_today::timestamp) - interval '5 months')::date;
    WHEN 'year' THEN v_start := (date_trunc('month',v_today::timestamp) - interval '11 months')::date;
    WHEN 'custom' THEN v_start := p_from;
  END CASE;
  v_end := CASE WHEN p_period = 'custom' THEN p_to ELSE v_today END;
  IF v_start IS NULL OR v_end IS NULL OR v_start > v_end OR v_end > v_today
     OR v_end - v_start > 366 THEN
    RAISE EXCEPTION 'CUSTOMER_PORTAL_FILTER_INVALID';
  END IF;

  v_grain := CASE WHEN v_end - v_start > 62 THEN 'month' ELSE 'day' END;
  v_step := CASE WHEN v_grain = 'month' THEN interval '1 month' ELSE interval '1 day' END;
  v_first := CASE WHEN v_grain = 'month' THEN date_trunc('month',v_start::timestamp)::date ELSE v_start END;

  WITH invoice_base AS (
    SELECT d.date AS event_day, greatest(coalesce(d.total_amount,0),0)::numeric AS amount
    FROM public.debt_records d
    WHERE d.customer_id=c.id AND d.restaurant_id=c.restaurant_id
      AND (c.branch_id IS NULL OR d.branch_id=c.branch_id)
      AND d.party_type='customer' AND d.type='receivable'
      AND d.status IS DISTINCT FROM 'written_off'
      AND d.date BETWEEN v_start AND v_end
  ), receipt_base AS (
    SELECT p.date AS event_day, greatest(coalesce(p.amount,0),0)::numeric AS amount,
      coalesce(nullif(btrim(p.payment_method),''),'unknown') AS method
    FROM public.debt_payments p
    JOIN public.debt_records d ON d.id=p.debt_id
    WHERE d.customer_id=c.id AND d.restaurant_id=c.restaurant_id
      AND p.restaurant_id=c.restaurant_id
      AND (p.customer_id IS NULL OR p.customer_id=c.id)
      AND (c.branch_id IS NULL OR (d.branch_id=c.branch_id AND p.branch_id=c.branch_id))
      AND d.party_type='customer' AND d.type='receivable'
      AND p.date BETWEEN v_start AND v_end
  ), order_base AS (
    SELECT (o.created_date AT TIME ZONE 'Asia/Riyadh')::date AS event_day,
      greatest(coalesce(o.total_amount,0),0)::numeric AS amount
    FROM public.orders o
    WHERE o.customer_id=c.id AND o.restaurant_id=c.restaurant_id
      AND (c.branch_id IS NULL OR o.branch_id=c.branch_id)
      AND (o.status IS NULL OR lower(o.status) NOT IN ('cancelled','canceled','rejected'))
      AND o.created_date >= (v_start::timestamp AT TIME ZONE 'Asia/Riyadh')
      AND o.created_date < ((v_end+1)::timestamp AT TIME ZONE 'Asia/Riyadh')
  ), events AS (
    SELECT event_day,amount,'invoices'::text AS kind FROM invoice_base
    UNION ALL SELECT event_day,amount,'payments'::text FROM receipt_base
    UNION ALL SELECT event_day,amount,'orders'::text FROM order_base
  ), grouped AS (
    SELECT CASE WHEN v_grain='month' THEN date_trunc('month',event_day::timestamp)::date ELSE event_day END AS bucket,
      coalesce(sum(amount) FILTER(WHERE kind='invoices'),0)::numeric AS invoices,
      coalesce(sum(amount) FILTER(WHERE kind='payments'),0)::numeric AS payments,
      coalesce(sum(amount) FILTER(WHERE kind='orders'),0)::numeric AS orders,
      count(*) FILTER(WHERE kind='invoices') AS invoice_count,
      count(*) FILTER(WHERE kind='payments') AS payment_count,
      count(*) FILTER(WHERE kind='orders') AS order_count
    FROM events GROUP BY 1
  ), filled AS (
    SELECT g.bucket,
      coalesce(d.invoices,0)::numeric AS invoices,
      coalesce(d.payments,0)::numeric AS payments,
      coalesce(d.orders,0)::numeric AS orders,
      coalesce(d.invoice_count,0) AS invoice_count,
      coalesce(d.payment_count,0) AS payment_count,
      coalesce(d.order_count,0) AS order_count
    FROM (SELECT generate_series(v_first::timestamp,v_end::timestamp,v_step)::date AS bucket) g
    LEFT JOIN grouped d ON d.bucket=g.bucket
  ), methods AS (
    SELECT method,count(*) AS count,sum(amount)::numeric AS amount
    FROM receipt_base GROUP BY method ORDER BY amount DESC,method
  )
  SELECT jsonb_build_object(
    'period',p_period,'start',v_start,'end',v_end,'grain',v_grain,
    'as_of',now(),'currency',(SELECT currency FROM public.restaurants WHERE id=c.restaurant_id),
    'totals',jsonb_build_object(
      'invoices',coalesce((SELECT sum(amount) FROM invoice_base),0),
      'payments',coalesce((SELECT sum(amount) FROM receipt_base),0),
      'orders',coalesce((SELECT sum(amount) FROM order_base),0),
      'invoice_count',(SELECT count(*) FROM invoice_base),
      'payment_count',(SELECT count(*) FROM receipt_base),
      'order_count',(SELECT count(*) FROM order_base)
    ),
    'series',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'date',bucket,'invoices',invoices,'payments',payments,'orders',orders,
      'invoice_count',invoice_count,'payment_count',payment_count,'order_count',order_count
    ) ORDER BY bucket) FROM filled),'[]'::jsonb),
    'methods',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'method',method,'amount',amount,'count',count
    ) ORDER BY amount DESC,method) FROM methods),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END $analytics$;

CREATE OR REPLACE FUNCTION public.erp_customer_portal_analytics(
  p_customer_id uuid,
  p_period text DEFAULT 'month',
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $wrapper$
  SELECT customer_portal_private.analytics(p_customer_id,p_period,p_from,p_to)
$wrapper$;

REVOKE ALL ON FUNCTION customer_portal_private.analytics(uuid,text,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION customer_portal_private.analytics(uuid,text,date,date) TO authenticated;
REVOKE ALL ON FUNCTION public.erp_customer_portal_analytics(uuid,text,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_customer_portal_analytics(uuid,text,date,date) TO authenticated;
