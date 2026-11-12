-- Owner-confirmed full physical receipt of Supplier Invoice goods.
-- Deliberately independent from invoice approval, payment, purchases, stock and payable ledgers.
CREATE TABLE IF NOT EXISTS public.supplier_invoice_delivery_receipts (
 invoice_id uuid PRIMARY KEY REFERENCES public.supplier_invoices(id) ON DELETE RESTRICT,
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
 verified_items jsonb NOT NULL CHECK (jsonb_typeof(verified_items)='array' AND jsonb_array_length(verified_items) BETWEEN 1 AND 100),
 confirmed_by uuid NOT NULL,
 confirmed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_invoice_receipts_scope
 ON public.supplier_invoice_delivery_receipts(restaurant_id,branch_id,supplier_id,confirmed_at DESC);
ALTER TABLE public.supplier_invoice_delivery_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_invoice_delivery_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.supplier_invoice_delivery_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.erp_owner_confirm_supplier_invoice_delivery(
 p_invoice_id uuid,p_received_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $receipt$
DECLARE
 inv public.supplier_invoices;
 receipt public.supplier_invoice_delivery_receipts;
 v_owner uuid:=(SELECT auth.uid());
 v_branch uuid;
 source_items jsonb;
 verified jsonb:='[]'::jsonb;
 line jsonb;
 entry jsonb;
 expected_qty numeric;
 actual_qty numeric;
 n integer;
 i integer;
BEGIN
 IF v_owner IS NULL OR p_invoice_id IS NULL THEN
  RAISE EXCEPTION 'SUPPLIER_INVOICE_DELIVERY_OWNER_ONLY' USING ERRCODE='42501';
 END IF;
 SELECT * INTO inv FROM public.supplier_invoices WHERE id=p_invoice_id FOR UPDATE;
 IF NOT FOUND OR inv.restaurant_id IS NULL OR inv.supplier_id IS NULL
  OR NOT public.erp_subscription_has_erp_access(inv.restaurant_id)
  OR NOT EXISTS(SELECT 1 FROM public.erp_memberships m
    WHERE m.user_id=v_owner AND m.restaurant_id=inv.restaurant_id
     AND m.role='owner' AND m.status='approved') THEN
  RAISE EXCEPTION 'SUPPLIER_INVOICE_DELIVERY_OWNER_ONLY' USING ERRCODE='42501';
 END IF;
 v_branch:=inv.branch_id;
 IF v_branch IS NULL THEN
  SELECT b.id INTO v_branch FROM public.branches b
   WHERE b.restaurant_id=inv.restaurant_id AND b.branch_key=inv.branch
   LIMIT 1;
 END IF;
 IF v_branch IS NULL OR NOT EXISTS(SELECT 1 FROM public.branches b
  WHERE b.id=v_branch AND b.restaurant_id=inv.restaurant_id)
  OR NOT EXISTS(SELECT 1 FROM public.suppliers s
   WHERE s.id=inv.supplier_id AND s.restaurant_id=inv.restaurant_id
    AND (s.branch_id IS NULL OR s.branch_id=v_branch)) THEN
  RAISE EXCEPTION 'SUPPLIER_INVOICE_DELIVERY_LINK_MISSING' USING ERRCODE='23514';
 END IF;
 SELECT * INTO receipt FROM public.supplier_invoice_delivery_receipts WHERE invoice_id=inv.id;
 IF FOUND THEN
  RETURN jsonb_build_object('invoice_id',receipt.invoice_id,'status','received',
    'confirmed_at',receipt.confirmed_at,'verified_items',receipt.verified_items,
    'already_confirmed',true);
 END IF;
 IF inv.approval_status NOT IN ('approved','auto_approved')
    OR coalesce(inv.status,'') NOT IN ('approved','paid','partial','unpaid') THEN
  RAISE EXCEPTION 'SUPPLIER_INVOICE_DELIVERY_REQUIRES_APPROVAL' USING ERRCODE='23514';
 END IF;
 source_items:=inv.items;
 IF jsonb_typeof(source_items)<>'array'
   OR jsonb_array_length(source_items) NOT BETWEEN 1 AND 100
   OR p_received_items IS NULL
   OR jsonb_typeof(p_received_items)<>'array'
   OR jsonb_array_length(p_received_items)<>jsonb_array_length(source_items) THEN
  RAISE EXCEPTION 'SUPPLIER_INVOICE_DELIVERY_ITEMS_REQUIRED' USING ERRCODE='23514';
 END IF;
 n:=jsonb_array_length(source_items);
 FOR i IN 0..n-1 LOOP
  line:=source_items->i;
  IF jsonb_typeof(line)<>'object'
    OR nullif(btrim(coalesce(line->>'product_name',line->>'name','')),'') IS NULL THEN
   RAISE EXCEPTION 'SUPPLIER_INVOICE_DELIVERY_ITEM_INVALID' USING ERRCODE='23514';
  END IF;
  BEGIN
   expected_qty:=coalesce(nullif(line->>'quantity',''),nullif(line->>'qty',''))::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   RAISE EXCEPTION 'SUPPLIER_INVOICE_DELIVERY_ITEM_INVALID' USING ERRCODE='23514';
  END;
  IF expected_qty IS NULL OR expected_qty<=0 OR expected_qty>1000000 THEN
   RAISE EXCEPTION 'SUPPLIER_INVOICE_DELIVERY_ITEM_INVALID' USING ERRCODE='23514';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_received_items) x
    WHERE x->>'line_index'=i::text)<>1 THEN
   RAISE EXCEPTION 'SUPPLIER_INVOICE_DELIVERY_ITEMS_REQUIRED' USING ERRCODE='23514';
  END IF;
  SELECT x INTO entry FROM jsonb_array_elements(p_received_items) x
    WHERE x->>'line_index'=i::text LIMIT 1;
  BEGIN
   actual_qty:=(entry->>'received_qty')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   RAISE EXCEPTION 'SUPPLIER_INVOICE_DELIVERY_QUANTITY_MISMATCH' USING ERRCODE='23514';
  END;
  IF actual_qty IS DISTINCT FROM expected_qty THEN
   RAISE EXCEPTION 'SUPPLIER_INVOICE_DELIVERY_QUANTITY_MISMATCH' USING ERRCODE='23514';
  END IF;
  verified:=verified||jsonb_build_array(line||jsonb_build_object(
   'line_index',i,'ordered_quantity',expected_qty,
   'received_quantity',actual_qty,'owner_verified',true));
 END LOOP;
 INSERT INTO public.supplier_invoice_delivery_receipts(
  invoice_id,restaurant_id,branch_id,supplier_id,verified_items,confirmed_by)
 VALUES(inv.id,inv.restaurant_id,v_branch,inv.supplier_id,verified,v_owner)
 RETURNING * INTO receipt;
 RETURN jsonb_build_object('invoice_id',receipt.invoice_id,'status','received',
  'confirmed_at',receipt.confirmed_at,'verified_items',receipt.verified_items,
  'already_confirmed',false);
END $receipt$;
REVOKE ALL ON FUNCTION public.erp_owner_confirm_supplier_invoice_delivery(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_owner_confirm_supplier_invoice_delivery(uuid,jsonb) TO authenticated;

-- Owner gets only current organization's receipts; supplier gets only invoices
-- linked to their approved supplier membership + exact branch. Not public.
CREATE OR REPLACE FUNCTION public.erp_supplier_invoice_delivery_receipts(p_restaurant_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $read$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'invoice_id',r.invoice_id,'confirmed_at',r.confirmed_at,
  'branch_id',r.branch_id,'supplier_id',r.supplier_id,
  'verified_items',r.verified_items)
  ORDER BY r.confirmed_at DESC),'[]'::jsonb)
 FROM public.supplier_invoice_delivery_receipts r
 JOIN public.supplier_invoices inv ON inv.id=r.invoice_id
  AND inv.restaurant_id=r.restaurant_id AND inv.supplier_id=r.supplier_id
 WHERE r.restaurant_id=p_restaurant_id
  AND (SELECT auth.uid()) IS NOT NULL
  AND public.erp_subscription_has_erp_access(r.restaurant_id)
  AND EXISTS(SELECT 1 FROM public.erp_memberships m
    WHERE m.user_id=(SELECT auth.uid()) AND m.restaurant_id=r.restaurant_id
      AND m.status='approved'
      AND (m.role='owner'
       OR (m.role='supplier' AND m.linked_entity_id=r.supplier_id
          AND m.branch_id=r.branch_id)));
$read$;
REVOKE ALL ON FUNCTION public.erp_supplier_invoice_delivery_receipts(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_supplier_invoice_delivery_receipts(uuid) TO authenticated;
