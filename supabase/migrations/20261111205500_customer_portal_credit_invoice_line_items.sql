-- Customer portal returns itemized invoice snapshots only for the authorized customer.
-- Existing statement totals/payments/orders stay unchanged; financial rows remain read-only.
CREATE OR REPLACE FUNCTION customer_portal_private.statement(p_customer_id uuid, p_kind text, p_from date, p_to date, p_page integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c public.customers; v_totals jsonb; v_rows jsonb; v_count bigint;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'CUSTOMER_PORTAL_FORBIDDEN'; END IF;
 SELECT customer.* INTO c FROM public.customers customer JOIN public.customer_portal_access a ON a.customer_id=customer.id
 WHERE customer.id=p_customer_id AND a.user_id=auth.uid() AND a.active AND customer.is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_PORTAL_FORBIDDEN'; END IF;
 IF p_kind NOT IN ('invoices','payments','orders') OR p_kind IS NULL OR p_page IS NULL OR p_page<0 OR p_page>100000 OR p_from>p_to THEN RAISE EXCEPTION 'CUSTOMER_PORTAL_FILTER_INVALID'; END IF;
 SELECT jsonb_build_object('total',coalesce(sum(greatest(total_amount,0)),0),'paid',coalesce(sum(greatest(paid_amount,0)),0),
  'balance',coalesce(sum(greatest(remaining_amount,0)),0),'overdue',coalesce(sum(greatest(remaining_amount,0)) FILTER(WHERE due_date<CURRENT_DATE),0))
 INTO v_totals FROM public.debt_records d WHERE d.customer_id=c.id AND d.restaurant_id=c.restaurant_id
 AND (c.branch_id IS NULL OR d.branch_id=c.branch_id) AND d.party_type='customer' AND d.type='receivable' AND d.status IS DISTINCT FROM 'written_off';
 IF p_kind='invoices' THEN
  WITH records AS (
   SELECT d.id,coalesce(d.invoice_number,d.invoice_auto_number) AS reference,d.date,d.due_date,d.total_amount AS amount,d.paid_amount,d.remaining_amount,d.status,
     coalesce(il.items,'[]'::jsonb) AS items,coalesce(il.source_type,'legacy') AS invoice_source,
     d.description
   FROM public.debt_records d
   LEFT JOIN public.customer_credit_invoice_lines il ON il.debt_id=d.id
    AND il.restaurant_id=c.restaurant_id AND il.customer_id=c.id
    AND (c.branch_id IS NULL OR il.branch_id=c.branch_id)
   WHERE d.customer_id=c.id AND d.restaurant_id=c.restaurant_id AND (c.branch_id IS NULL OR d.branch_id=c.branch_id)
   AND d.party_type='customer' AND d.type='receivable' AND (p_from IS NULL OR d.date>=p_from) AND (p_to IS NULL OR d.date<=p_to)
  ) SELECT (SELECT count(*) FROM records),(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT * FROM records ORDER BY date DESC NULLS LAST,id LIMIT 25 OFFSET p_page*25)x) INTO v_count,v_rows;
 ELSIF p_kind='payments' THEN
  WITH records AS (
   SELECT p.id,p.receipt_number AS reference,p.date,p.amount,p.payment_method,d.invoice_number
   FROM public.debt_payments p JOIN public.debt_records d ON d.id=p.debt_id
   WHERE d.customer_id=c.id AND d.restaurant_id=c.restaurant_id AND p.restaurant_id=c.restaurant_id
   AND (p.customer_id IS NULL OR p.customer_id=c.id) AND (c.branch_id IS NULL OR (d.branch_id=c.branch_id AND p.branch_id=c.branch_id))
   AND d.party_type='customer' AND d.type='receivable' AND (p_from IS NULL OR p.date>=p_from) AND (p_to IS NULL OR p.date<=p_to)
  ) SELECT (SELECT count(*) FROM records),(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT * FROM records ORDER BY date DESC NULLS LAST,id LIMIT 25 OFFSET p_page*25)x) INTO v_count,v_rows;
 ELSE
  WITH records AS (
   SELECT o.id,o.order_number AS reference,o.created_date AS date,o.total_amount AS amount,o.status,o.payment_status,o.subtotal,o.tax_amount,o.discount,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'product_id',i.product_id,'name',pr.name,'name_ar',pr.name_ar,'name_fa',pr.name_fa,'quantity',i.quantity,'unit_price',i.unit_price,'total_price',i.total_price)),'[]'::jsonb)
     FROM public.order_items i LEFT JOIN public.products pr ON pr.id=i.product_id AND pr.restaurant_id=c.restaurant_id WHERE i.order_id=o.id AND i.restaurant_id=c.restaurant_id) AS items
   FROM public.orders o WHERE o.customer_id=c.id AND o.restaurant_id=c.restaurant_id AND (c.branch_id IS NULL OR o.branch_id=c.branch_id)
   AND (p_from IS NULL OR o.created_date>=p_from::timestamptz) AND (p_to IS NULL OR o.created_date<(p_to+1)::timestamptz)
  ) SELECT (SELECT count(*) FROM records),(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT * FROM records ORDER BY date DESC NULLS LAST,id LIMIT 25 OFFSET p_page*25)x) INTO v_count,v_rows;
 END IF;
 RETURN jsonb_build_object('totals',v_totals,'rows',v_rows,'count',v_count,'page',p_page,'page_size',25,'as_of',now());
END $function$;
