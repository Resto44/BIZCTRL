create function public.erp_retail_inventory_purchase_order(p_order_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  with orders as (
    select po.*,coalesce(po.branch_id,br.id) as resolved_branch,
      case jsonb_typeof(po.items) when 'array' then po.items when 'string' then (po.items#>>'{}')::jsonb else '[]'::jsonb end as order_items
    from public.purchase_orders po left join public.branches br on br.restaurant_id=po.restaurant_id and br.branch_key=po.branch
    where po.id=p_order_id and retail_inventory_private.allowed(po.restaurant_id,coalesce(po.branch_id,br.id),'createPurchases')
  ), items as (
    select p.id as product_id,p.name,p.name_ar,p.unit,p.sku,p.image_url,p.batch_tracked,p.expiry_tracked,
      sum((item->>'qty')::numeric) as ordered_quantity,max(coalesce((item->>'unit_price')::numeric,0)) as unit_price,
      coalesce((select sum(ln.quantity) from public.retail_inventory_lines ln join public.retail_inventory_documents d on d.id=ln.document_id where d.source_purchase_order_id=p_order_id and d.kind='receipt' and d.status='received' and ln.product_id=p.id),0) as received_quantity
    from orders po cross join lateral jsonb_array_elements(po.order_items) item
    join public.products p on p.restaurant_id=po.restaurant_id and (p.id::text=item->>'product_id' or p.product_id=item->>'product_id')
    group by p.id
  ) select jsonb_build_object('id',po.id,'branch_id',po.resolved_branch,'supplier_id',po.supplier_id,'order_number',po.order_number,
    'lines',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('remaining',greatest(ordered_quantity-received_quantity,0))) from items i),'[]'::jsonb)) from orders po;
$$;
revoke all on function public.erp_retail_inventory_purchase_order(uuid) from public,anon;
grant execute on function public.erp_retail_inventory_purchase_order(uuid) to authenticated;
notify pgrst,'reload schema';
