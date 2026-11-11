-- Credit invoice detail ledger. Independent of daily_sales cash and network totals.
-- Only authorized POS and Sales Closing RPCs can write; customer reads are via scoped statement RPC.
CREATE TABLE IF NOT EXISTS public.customer_credit_invoice_lines (
 debt_id uuid PRIMARY KEY REFERENCES public.debt_records(id) ON DELETE CASCADE,
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 customer_id uuid NOT NULL REFERENCES public.customers(id),
 source_type text NOT NULL CHECK(source_type IN ('restaurant_pos','sales_closing')),
 source_order_id uuid,
 items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_credit_invoice_lines_customer ON public.customer_credit_invoice_lines (restaurant_id,customer_id,created_at DESC);
ALTER TABLE public.customer_credit_invoice_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_credit_invoice_lines FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.customer_credit_invoice_lines TO service_role;

-- Validation and immutable item snapshot in the same transaction as the authorized receivable.
CREATE OR REPLACE FUNCTION customer_portal_private.store_credit_invoice_lines(
 p_debt_id uuid,p_restaurant_id uuid,p_branch_id uuid,p_customer_id uuid,
 p_source_type text,p_source_order_id uuid,p_items jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $store$
DECLARE debt public.debt_records; v_item jsonb; v_clean jsonb:='[]'::jsonb;
 v_name text; v_quantity numeric; v_price numeric; v_total numeric; v_sum numeric:=0;
BEGIN
 IF auth.uid() IS NULL OR NOT public.erp_can_write_scope(p_restaurant_id,p_branch_id) THEN
   RAISE EXCEPTION 'CUSTOMER_CREDIT_DETAILS_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT * INTO debt FROM public.debt_records
 WHERE id=p_debt_id AND restaurant_id=p_restaurant_id AND branch_id=p_branch_id
 AND customer_id=p_customer_id AND party_type='customer' AND type='receivable' FOR SHARE;
 IF NOT FOUND OR p_source_type NOT IN ('restaurant_pos','sales_closing') THEN
  RAISE EXCEPTION 'CUSTOMER_CREDIT_DETAILS_SCOPE_INVALID' USING ERRCODE='42501';
 END IF;
 IF p_items IS NOT NULL AND (jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)>100) THEN
  RAISE EXCEPTION 'CUSTOMER_CREDIT_DETAILS_INVALID';
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb)) LOOP
  v_name:=btrim(COALESCE(v_item->>'name',''));
  IF v_name='' OR length(v_name)>160 OR (v_item->>'quantity') IS NULL
    OR (v_item->>'unit_price') IS NULL OR (v_item->>'total_price') IS NULL
    OR jsonb_typeof(v_item) <> 'object' THEN
   RAISE EXCEPTION 'CUSTOMER_CREDIT_DETAILS_INVALID';
  END IF;
  BEGIN
   v_quantity:=(v_item->>'quantity')::numeric;
   v_price:=(v_item->>'unit_price')::numeric;
   v_total:=(v_item->>'total_price')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   RAISE EXCEPTION 'CUSTOMER_CREDIT_DETAILS_INVALID';
  END;
  IF v_quantity <= 0 OR v_quantity > 1000 OR v_price < 0 OR v_price > 1000000
    OR v_total < 0 OR round(v_price,2)<>v_price OR round(v_total,2)<>v_total
    OR round(v_quantity*v_price,2)<>v_total THEN
    RAISE EXCEPTION 'CUSTOMER_CREDIT_DETAILS_AMOUNT_MISMATCH';
  END IF;
  v_sum:=v_sum+v_total;
  v_clean:=v_clean||jsonb_build_array(jsonb_build_object(
    'name',v_name,'name_ar',left(coalesce(v_item->>'name_ar',v_name),160),
    'name_fa',left(coalesce(v_item->>'name_fa',v_name),160),
    'quantity',v_quantity,'unit_price',v_price,'total_price',v_total,
    'product_id',CASE WHEN coalesce(v_item->>'product_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_item->>'product_id' ELSE NULL END
   ));
 END LOOP;
 IF jsonb_array_length(v_clean)=0 THEN
  -- Closing amount without an itemized list is transparently labeled as a summary.
  IF p_source_type='restaurant_pos' THEN RAISE EXCEPTION 'CUSTOMER_CREDIT_DETAILS_MISSING_ITEMS'; END IF;
  v_sum:=debt.total_amount;
  v_clean:=jsonb_build_array(jsonb_build_object(
   'name','Credit sale from Sales Closing','name_ar','بيع آجل من إقفال المبيعات',
   'name_fa','فروش نسیه از کلوزینگ','quantity',1,'unit_price',v_sum,'total_price',v_sum,
   'summary_only',true));
 END IF;
 IF v_sum<>debt.total_amount THEN RAISE EXCEPTION 'CUSTOMER_CREDIT_DETAILS_AMOUNT_MISMATCH'; END IF;
 INSERT INTO public.customer_credit_invoice_lines
 (debt_id,restaurant_id,branch_id,customer_id,source_type,source_order_id,items)
 VALUES(p_debt_id,p_restaurant_id,p_branch_id,p_customer_id,p_source_type,p_source_order_id,v_clean)
 ON CONFLICT(debt_id) DO NOTHING;
 IF NOT FOUND AND NOT EXISTS(
  SELECT 1 FROM public.customer_credit_invoice_lines d
  WHERE d.debt_id=p_debt_id AND d.restaurant_id=p_restaurant_id AND d.customer_id=p_customer_id
  AND d.items=v_clean
 ) THEN RAISE EXCEPTION 'CUSTOMER_CREDIT_DETAILS_ALREADY_POSTED_DIFFERENTLY'; END IF;
END $store$;
REVOKE ALL ON FUNCTION customer_portal_private.store_credit_invoice_lines(uuid,uuid,uuid,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
