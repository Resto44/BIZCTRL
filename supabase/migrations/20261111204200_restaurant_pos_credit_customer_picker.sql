-- Restaurant POS credit-customer picker. Authoritative global tenant balance matches
-- the protected POS receivable limit (not a branch-local preview).
CREATE OR REPLACE FUNCTION public.erp_restaurant_credit_customers(
 p_restaurant_id uuid,p_branch_id uuid,p_search text DEFAULT NULL,p_limit integer DEFAULT 100
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $picker$
DECLARE v_items jsonb; v_search text:=left(btrim(coalesce(p_search,'')),120);
 v_max integer:=greatest(1,least(coalesce(p_limit,100),100));
BEGIN
 IF auth.uid() IS NULL OR p_restaurant_id IS NULL OR p_branch_id IS NULL THEN
  RAISE EXCEPTION 'CUSTOMER_CREDIT_POS_SCOPE_DENIED' USING ERRCODE='42501';
 END IF;
 PERFORM restaurant_pos_private.guard(p_restaurant_id,p_branch_id,'uploadSales');
 PERFORM restaurant_pos_private.guard(p_restaurant_id,p_branch_id,'viewSales');
 IF NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=p_branch_id AND b.restaurant_id=p_restaurant_id) THEN
  RAISE EXCEPTION 'CUSTOMER_CREDIT_POS_BRANCH_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',q.id,'name',q.name,'customer_name',q.name,'phone',q.phone,
   'credit_limit',q.credit_limit,'outstanding_balance',q.outstanding_balance,
   'available_credit',greatest(q.credit_limit-q.outstanding_balance,0),
   'is_active',true) ORDER BY q.name),'[]'::jsonb) INTO v_items
 FROM (
  SELECT c.id,c.name,c.phone,greatest(coalesce(c.credit_limit,0),0) AS credit_limit,
   coalesce((SELECT sum(greatest(coalesce(d.remaining_amount,0),0))
    FROM public.debt_records d WHERE d.customer_id=c.id AND d.restaurant_id=p_restaurant_id
    AND d.party_type='customer' AND d.type='receivable'
    AND d.status IS DISTINCT FROM 'written_off'),0) AS outstanding_balance
  FROM public.customers c
  WHERE c.restaurant_id=p_restaurant_id AND c.is_active IS TRUE
   AND (c.branch_id IS NULL OR c.branch_id=p_branch_id)
   AND (v_search='' OR c.name ILIKE '%'||v_search||'%'
    OR coalesce(c.phone,'') ILIKE '%'||v_search||'%'
    OR coalesce(c.customer_code,'') ILIKE '%'||v_search||'%')
  ORDER BY c.name,c.id LIMIT v_max
 ) q;
 RETURN v_items;
END $picker$;
REVOKE ALL ON FUNCTION public.erp_restaurant_credit_customers(uuid,uuid,text,integer)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_restaurant_credit_customers(uuid,uuid,text,integer)
 TO authenticated;
