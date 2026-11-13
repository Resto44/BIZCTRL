import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {purchaseOrderSupplierMessage,parsePurchaseOrderItems} from '../src/lib/purchaseOrderSupplierMessage.js';
const read=p=>readFileSync(p,'utf8');
const migration=read('supabase/migrations/20261113173000_purchase_orders_supplier_price_privacy.sql');
const form=read('src/components/purchase-orders/PurchaseOrderForm.jsx');
const supplier=read('src/pages/SupplierPortalERP.jsx');
const owner=read('src/pages/PurchaseOrders.jsx');
const detail=read('src/components/purchase-orders/PurchaseOrderDetail.jsx');
const order={id:'123',order_number:'PO-2026',branch:'Main',created_date:'2026-11-13',
 expected_date:'2026-11-14',notes:'Deliver before noon',total_amount:921.3,
 hide_prices_from_supplier:true,items:JSON.stringify([
 {product_id:'p',product_name:'Fresh chicken',qty:4,unit:'cartons',unit_price:230.325,line_total:921.3}
 ])};
describe('Private Supplier PO and instant draft view',()=>{
 it('sends product quantities without prices when Owner selects Hide Prices',()=>{
  const message=purchaseOrderSupplierMessage(order,'SAR');
  expect(message).toContain('Fresh chicken: 4 cartons');
  expect(message).toContain('Expected Delivery: 2026-11-14');
  for(const v of ['230.325','230.32','921.3','921.30','@ SAR','Total: SAR'])expect(message).not.toContain(v);
  expect(message).toContain('Prices are hidden');
 });
 it('preserves optional normal supplier-visible prices when hide is unchecked',()=>{
  const message=purchaseOrderSupplierMessage({...order,hide_prices_from_supplier:false},'SAR');
  expect(message).toContain('230.32');
  expect(message).toContain('Total: SAR921.30');
  expect(parsePurchaseOrderItems(order.items)).toHaveLength(1);
 });
 it('prevents malicious item strings from crashing outbound order messages',()=>{
  expect(parsePurchaseOrderItems('{not json')).toEqual([]);
  expect(parsePurchaseOrderItems({x:1})).toEqual([]);
 });
 it('supplies optional hide-prices flag to persisted PO and fixes nullable delivery date',()=>{
  expect(form).toContain('data-testid="purchase-order-supplier-privacy"');
  expect(form).toContain('checked={form.hide_prices_from_supplier}');
  expect(form).toContain('hide_prices_from_supplier: Boolean(form.hide_prices_from_supplier)');
  expect(form).toContain("expected_date: form.expected_delivery || null");
  expect(form).toContain('data-testid="purchase-order-mobile-dates"');
  expect(form).toContain('grid-cols-1 gap-3 sm:grid-cols-2');
  expect(form).toContain('min-w-0 max-w-full');
  expect(form).toContain("status: order?.status || 'draft'");
 });
 it('supplier reads ONLY the secure server-masked RPC, never all purchase order columns',()=>{
  expect(supplier).toContain("supabase.rpc('erp_supplier_visible_purchase_orders')");
  expect(supplier).not.toContain(".from('purchase_orders')");
  expect(supplier).toContain("if(!Array.isArray(data))throw Error('SUPPLIER_PURCHASE_ORDER_RESPONSE_INVALID')");
  expect(migration).toContain('ALTER POLICY erp_permission_select ON public.purchase_orders');
  expect(migration).toContain("coalesce(public.erp_current_role(),'') <> 'supplier'");
  expect(migration).toContain('REVOKE ALL ON FUNCTION public.erp_supplier_visible_purchase_orders() FROM PUBLIC,anon');
  expect(migration).toContain("m.user_id=(SELECT auth.uid()) AND m.role='supplier'");
  expect(migration).toContain("m.status='approved' AND m.branch_id IS NOT NULL");
  expect(migration).toContain('po.branch_id=m.branch_id AND po.supplier_id=m.linked_entity_id');
  expect(migration).toContain('WHEN rec.hide_prices_from_supplier THEN NULL ELSE rec.total_amount');
  expect(migration).toContain("'qty',coalesce(item->'qty',item->'quantity')");
  expect(migration).not.toMatch(/GRANT SELECT ON public\.purchase_orders TO supplier/i);
 });
 it('supplier sees newly submitted orders and can ship without owner pre-approval',()=>{
  expect(supplier).toContain('data-testid="supplier-new-purchase-orders"');
  expect(supplier).toContain("['draft','sent','pending'].includes(po.status)");
  expect(supplier).toContain("['draft','sent','pending','approved'].includes(po.status) && <Button");
  expect(supplier).toContain("{po.price_hidden?copy.priceHidden");
  expect(supplier).toContain("po.price_hidden?'':' · '+moneyLabel(item.unit_price)");
  expect(supplier).toContain("['received','cancelled'].includes(po.status)");
  expect(supplier).toContain("supabase.rpc('erp_supplier_mark_order_shipped',{p_order_id:poId})");
  expect(supplier).toContain('refetchOnWindowFocus:true');
 });
 it('supplier email and WhatsApp never leak prices hidden in order detail and owner list',()=>{
  expect(owner).toContain('const body = purchaseOrderSupplierMessage(order,currency)');
  expect(owner).toContain('const message = purchaseOrderSupplierMessage(order,currency)');
  expect(detail).toContain('purchaseOrderSupplierMessage(order,currency)');
 });
 it('does not mutate financial ledgers, create supplier accounts, or auto-approve pending orders',()=>{
  expect(migration).not.toMatch(/DELETE\s+FROM\s+public\./i);
  expect(migration).not.toMatch(/UPDATE\s+public\.(wallet_transactions|supplier_invoices|purchase_orders)\s+SET/i);
  expect(migration).not.toContain('UPDATE public.purchase_orders SET status');
  expect(migration).not.toContain('CREATE TRIGGER');
 });
});
