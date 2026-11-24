import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const form=read('src/components/purchase-orders/PurchaseOrderForm.jsx');
const portal=read('src/pages/SupplierPortalERP.jsx');
const owner=read('src/pages/PurchaseOrders.jsx');
const sql=read('supabase/migrations/20261113203000_supplier_direct_order_scoped_products.sql');
describe('Direct supplier orders and supplier-isolated product catalog',()=>{
 it('only fetches and displays products linked to the selected supplier',()=>{
  expect(form).toContain("queryKey:['products',activeRestaurantId,form.supplier_id,'purchase-materials',materialType || 'all']");
  expect(form).toContain(".eq('restaurant_id', activeRestaurantId)");
  expect(form).toContain("query.eq('supplier_id', supplierId)");
  expect(form).toContain("query.eq('restaurant_product_type', materialType)");
  expect(form).toContain('products.filter(p=>p.supplier_id===form.supplier_id)');
  expect(form).toContain('setItems([{...emptyItem}])');
  expect(form).toContain('p.product_id===i.product_id&&p.supplier_id===form.supplier_id');
  expect(sql).toContain('p.supplier_id=NEW.supplier_id AND p.product_id=v_product');
  expect(sql).toContain('PURCHASE_ORDER_PRODUCT_NOT_ASSIGNED_TO_SUPPLIER');
  expect(sql).toContain('v_old_count>=v_new_count AND v_old_count>0');
  expect(sql).toContain('NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id');
  expect(sql).toContain('NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id');
 });
 it('distinguishes errors and permits explicit owner-only assignment without overwriting other suppliers',()=>{
  expect(form).toContain('if (error) throw error');
  expect(form).toContain('role === ROLES.OWNER');
  expect(form).toContain(".eq('id',productId).eq('restaurant_id',restaurantId).is('supplier_id',null)");
  expect(form).toContain("data?.supplier_id !== supplierId");
  expect(form).toContain("invalidateQueries({queryKey:['products',variables.restaurantId]})");
  expect(form).toContain('disabled={!catalogReady||assignment.isPending||items.length>=100}');
  expect(form).toContain('data-testid="po-product-select"');
  expect(form).toContain('eligibleProducts.filter(p=>p.product_id===item.product_id||matchProduct(p))');
  expect(form).toContain('!productsFetching&&!productsError&&eligibleProducts.length===0');
 });
 it('creates a submitted order immediately without Owner approval',()=>{
  expect(form).toContain("status: order ? form.status : 'sent'");
  expect(portal).toContain("['draft','sent','pending','approved'].includes(po.status) && <Button");
  expect(portal).toContain("supabase.rpc('erp_supplier_mark_order_shipped',{p_order_id:poId})");
  // Completed order history has an inert callback because the shipment control is hidden there.
  expect(portal).toContain('newPurchaseOrders.map(po=><POCard');
  expect(portal).toContain('onConfirmShipment={()=>confirmShipmentMutation.mutate(po.id)}');
  expect(sql).toContain("po.status NOT IN ('draft','sent','pending','approved')");
  expect(sql).toContain("m.role='supplier' AND m.status='approved'");
  expect(owner).not.toContain('Approve for supplier shipment');
 });
 it('preserves physical delivery verification and financial boundaries',()=>{
  expect(owner).toContain('Verify delivered products');
  expect(sql).toContain('SUPPLIER_RECEIPT_OWNER_CONFIRMATION_REQUIRED');
  expect(sql).not.toContain('UPDATE public.supplier_invoices');
  expect(sql).not.toContain('INSERT INTO public.wallet_transactions');
  expect(sql).not.toContain('UPDATE public.products SET stock');
  expect(sql).not.toMatch(/DELETE FROM public\.(purchase_orders|erp_memberships|products)/i);
 });
});
