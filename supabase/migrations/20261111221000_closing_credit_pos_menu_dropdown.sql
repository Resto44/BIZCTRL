-- Read-only, owner/manager-scoped Cashier POS menu choices for Sales Closing.
CREATE OR REPLACE FUNCTION public.erp_customer_credit_pos_items(
 p_restaurant_id uuid,p_branch_id uuid,p_search text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $menu$
DECLARE result jsonb; search_term text:=left(btrim(coalesce(p_search,'')),100);
BEGIN
 IF auth.uid() IS NULL OR p_restaurant_id IS NULL OR p_branch_id IS NULL
   OR NOT public.erp_can_write_scope(p_restaurant_id,p_branch_id) THEN
  RAISE EXCEPTION 'CUSTOMER_CREDIT_MENU_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=p_branch_id
  AND b.restaurant_id=p_restaurant_id AND coalesce(b.is_active,true)) THEN
  RAISE EXCEPTION 'CUSTOMER_CREDIT_MENU_BRANCH_INVALID' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.option_group,q.name,q.id),'[]'::jsonb)
 INTO result FROM (
  SELECT m.id,m.product_id,m.name,m.name_ar,m.name_fa,
   m.option_group,m.option_key,m.variant_options,m.category,m.price
  FROM restaurant_pos_private.menu m
  JOIN public.products p ON p.id=m.product_id AND p.restaurant_id=p_restaurant_id
   AND p.restaurant_product_type='menu_item' AND coalesce(p.is_active,true)
  WHERE m.restaurant_id=p_restaurant_id AND m.branch_id=p_branch_id
   AND m.active IS TRUE AND m.price>0 AND round(m.price,2)=m.price
   AND (search_term='' OR concat_ws(' ',m.name,m.name_ar,m.name_fa,m.option_group,m.category)
     ILIKE '%'||search_term||'%')
  ORDER BY m.option_group,m.name,m.id LIMIT 1000
 ) q;
 RETURN result;
END $menu$;
REVOKE ALL ON FUNCTION public.erp_customer_credit_pos_items(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_customer_credit_pos_items(uuid,uuid,text) TO authenticated;

-- Server checks branch, menu-id, actual price and product-id for new selected items.
-- Existing amount-only and legacy manual closings remain backward compatible.
CREATE OR REPLACE FUNCTION customer_portal_private.store_credit_invoice_lines(p_debt_id uuid, p_restaurant_id uuid, p_branch_id uuid, p_customer_id uuid, p_source_type text, p_source_order_id uuid, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE debt public.debt_records; v_item jsonb; v_clean jsonb:='[]'::jsonb;
 v_name text; v_quantity numeric; v_price numeric; v_total numeric; v_sum numeric:=0;
 v_pos_menu restaurant_pos_private.menu;
BEGIN
 IF auth.uid() IS NULL THEN
   RAISE EXCEPTION 'CUSTOMER_CREDIT_DETAILS_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF p_source_type='restaurant_pos' THEN
   -- Verified cashier device role; do NOT give cashiers the broad owner/manager debt RPC.
   PERFORM restaurant_pos_private.guard(p_restaurant_id,p_branch_id,'uploadSales');
   PERFORM restaurant_pos_private.guard(p_restaurant_id,p_branch_id,'viewSales');
 ELSIF p_source_type='sales_closing' THEN
   IF NOT public.erp_can_write_scope(p_restaurant_id,p_branch_id) THEN
     RAISE EXCEPTION 'CUSTOMER_CREDIT_DETAILS_FORBIDDEN' USING ERRCODE='42501';
   END IF;
 ELSE
   RAISE EXCEPTION 'CUSTOMER_CREDIT_DETAILS_SOURCE_INVALID' USING ERRCODE='23514';
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
  IF p_source_type='sales_closing' AND nullif(v_item->>'menu_id','') IS NOT NULL THEN
   IF (v_item->>'menu_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
  v_clean:=v_clean||jsonb_build_array(jsonb_build_object(
    'name',v_name,'name_ar',left(coalesce(v_item->>'name_ar',v_name),160),
    'name_fa',left(coalesce(v_item->>'name_fa',v_name),160),
    'quantity',v_quantity,'unit_price',v_price,'total_price',v_total,
    'product_id',CASE WHEN coalesce(v_item->>'product_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_item->>'product_id' ELSE NULL END,
    'menu_id',CASE WHEN p_source_type='sales_closing' THEN nullif(v_item->>'menu_id','') ELSE NULL END
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
END $function$
 THEN
     RAISE EXCEPTION 'CUSTOMER_CREDIT_POS_MENU_INVALID' USING ERRCODE='23514';
   END IF;
   SELECT m.* INTO v_pos_menu
   FROM restaurant_pos_private.menu m
   JOIN public.products p ON p.id=m.product_id AND p.restaurant_id=p_restaurant_id
     AND p.restaurant_product_type='menu_item' AND coalesce(p.is_active,true)
   WHERE m.id=(v_item->>'menu_id')::uuid AND m.restaurant_id=p_restaurant_id
     AND m.branch_id=p_branch_id AND m.active IS TRUE AND m.price>0;
   IF NOT FOUND OR v_price IS DISTINCT FROM v_pos_menu.price
     OR v_item->>'product_id' IS DISTINCT FROM v_pos_menu.product_id::text THEN
     RAISE EXCEPTION 'CUSTOMER_CREDIT_POS_MENU_PRICE_CHANGED' USING ERRCODE='23514';
   END IF;
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
END $function$;

