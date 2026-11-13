-- Hide owner purchasing prices from suppliers when expressly requested.
-- Supplier can still view draft orders (without shipment permissions) immediately.
-- Historical orders default to full-price visibility; finance data is unchanged.
ALTER TABLE public.purchase_orders
 ADD COLUMN IF NOT EXISTS hide_prices_from_supplier boolean NOT NULL DEFAULT false;

-- Prevent supplier accounts reading hidden prices through direct PostgREST
-- selection, regardless of whether the UI renders price fields.
-- Supplier order details are exposed only via the verified projection below.
ALTER POLICY erp_permission_select ON public.purchase_orders
 USING (
   public.erp_can_access_scope_text(restaurant_id::text,branch_id::text)
   AND public.erp_has_any_permission(ARRAY['viewPurchases','viewPurchaseOrders'])
   AND coalesce(public.erp_current_role(),'') <> 'supplier'
 );

CREATE OR REPLACE FUNCTION public.erp_supplier_visible_purchase_orders()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 rec record; raw_items jsonb; safe_items jsonb;
 output jsonb := '[]'::jsonb;
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN
  RAISE EXCEPTION 'SUPPLIER_PURCHASE_ORDERS_NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 -- Only the exact linked supplier record, tenant and branch is returned.
 FOR rec IN
  SELECT po.*,m.id AS member_id
  FROM public.erp_memberships m
  JOIN public.suppliers s ON s.id=m.linked_entity_id
   AND s.restaurant_id=m.restaurant_id
   AND (s.branch_id IS NULL OR s.branch_id=m.branch_id)
   AND coalesce(s.status,true)
  JOIN public.purchase_orders po ON po.restaurant_id=m.restaurant_id
   AND po.branch_id=m.branch_id AND po.supplier_id=m.linked_entity_id
  WHERE m.user_id=(SELECT auth.uid()) AND m.role='supplier'
    AND m.status='approved' AND m.branch_id IS NOT NULL
    AND m.linked_entity_id IS NOT NULL
    AND public.erp_subscription_has_erp_access(m.restaurant_id)
  ORDER BY po.created_date DESC,po.id DESC LIMIT 500
 LOOP
  BEGIN
   raw_items := CASE
     WHEN jsonb_typeof(rec.items)='array' THEN rec.items
     WHEN jsonb_typeof(rec.items)='string' THEN (rec.items#>>'{}')::jsonb
     ELSE '[]'::jsonb END;
   IF jsonb_typeof(raw_items)<>'array' THEN raw_items:='[]'::jsonb;END IF;
  EXCEPTION WHEN others THEN raw_items:='[]'::jsonb;
  END;
  IF rec.hide_prices_from_supplier THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object(
      'product_id', item->>'product_id',
      'product_name',coalesce(item->>'product_name',item->>'name'),
      'name',coalesce(item->>'name',item->>'product_name'),
      'qty',coalesce(item->'qty',item->'quantity'),
      'quantity',coalesce(item->'quantity',item->'qty'),
      'unit',item->>'unit'
    ) ORDER BY ord),'[]'::jsonb)
   INTO safe_items FROM jsonb_array_elements(raw_items) WITH ORDINALITY AS i(item,ord);
  ELSE
   safe_items:=raw_items;
  END IF;
  output:=output||jsonb_build_array(jsonb_build_object(
    'id',rec.id,
    'order_number',rec.order_number,
    'status',rec.status,
    'approval_status',rec.approval_status,
    'branch',rec.branch,
    'supplier_name',rec.supplier_name,
    'supplier_id',rec.supplier_id,
    'branch_id',rec.branch_id,
    'restaurant_id',rec.restaurant_id,
    'created_date',rec.created_date,
    'updated_date',rec.updated_date,
    'expected_date',rec.expected_date,
    'received_date',rec.received_date,
    'notes',rec.notes,
    'items',safe_items,
    'hide_prices_from_supplier',rec.hide_prices_from_supplier,
    'price_hidden',rec.hide_prices_from_supplier,
    'total_amount',CASE WHEN rec.hide_prices_from_supplier THEN NULL ELSE rec.total_amount END
  ));
 END LOOP;
 RETURN output;
END $function$;

REVOKE ALL ON FUNCTION public.erp_supplier_visible_purchase_orders() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_supplier_visible_purchase_orders() TO authenticated;
COMMENT ON FUNCTION public.erp_supplier_visible_purchase_orders() IS
 'Supplier-linked, tenant/branch scoped purchase orders. Private unit prices and total removed on server when Owner hides prices. Draft orders are view-only until approved.';
