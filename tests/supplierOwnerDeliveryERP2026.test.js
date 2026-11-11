import {describe,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');

describe('Supplier Owner verified order completion and responsive dashboard',()=>{
 it('wraps long supplier identity independently of mobile action buttons',async()=>{
  const page=await read('../src/pages/SupplierPortalERP.jsx');
  expect(page).toContain('data-testid="supplier-full-name"');
  expect(page).toContain('whitespace-normal break-words [overflow-wrap:anywhere]');
  expect(page).not.toContain('truncate text-base font-extrabold text-slate-950');
  expect(page).toContain('data-testid="supplier-account-email"');
  expect(page).toContain('sm:justify-between');
  expect(page).toContain('self-end sm:self-auto');
  expect(page).toContain('dir={isRTL?\'rtl\':\'ltr\'}');
 });
 it('renders accurate customer-independent analytics with all requested filters and responsive trends',async()=>{
  const [page,dashboard]=await Promise.all([
    read('../src/pages/SupplierPortalERP.jsx'),
    read('../src/components/suppliers/SupplierPortalAnalytics.jsx')
  ]);
  expect(page).toContain('<SupplierPortalAnalytics orders={purchaseOrders} invoices={invoices} payments={payments} deliveries={verifiedDeliveries}');
  expect(dashboard).toContain('data-testid="supplier-erp-analytics"');
  expect(dashboard).toContain("['today','7d','month','3m','6m','12m','custom']");
  expect(dashboard).toContain('data-testid={\'supplier-analytics-currency-\'+c.currency}');
  expect(dashboard).toContain('overflow-x-auto');
  expect(page).toContain('supplierInvoiceCurrencyTotals(invoices)');
 });
 it('supplier can mark approved order shipped but never confirm delivery or perform finance writes',async()=>{
  const [page,sql]=await Promise.all([
   read('../src/pages/SupplierPortalERP.jsx'),
   read('../supabase/migrations/20261112023000_supplier_owner_delivery_confirmation.sql')
  ]);
  expect(page).toContain("supabase.rpc('erp_supplier_mark_order_shipped',{p_order_id:poId})");
  expect(page).toContain("supabase.rpc('erp_supplier_verified_deliveries')");
  expect(page).toContain('refetchInterval: 12000');
  expect(page).toContain('data-testid="supplier-awaiting-owner-status"');
  expect(page).toContain('data-testid="supplier-owner-verified-badge"');
  expect(page).toContain('data-testid="supplier-verified-order-items"');
  expect(page).not.toContain(".update({ status: 'shipped' })");
  expect(sql).toContain("m.role='supplier' AND m.status='approved'");
  expect(sql).toContain("OLD.status IS DISTINCT FROM 'approved'");
  expect(sql).toContain("NEW.status IS DISTINCT FROM 'shipped'");
  expect(sql).toContain("SUPPLIER_RECEIPT_OWNER_CONFIRMATION_REQUIRED");
  expect(sql).not.toMatch(/\bTRUNCATE\b|\bDELETE FROM public\.supplier_invoices\b/i);
 });
 it('Owner confirms every product quantity, not a generic order status toggle',async()=>{
  const [page,form,sql]=await Promise.all([
   read('../src/pages/PurchaseOrders.jsx'),
   read('../src/components/purchase-orders/SupplierOrderOwnerVerification.jsx'),
   read('../supabase/migrations/20261112023000_supplier_owner_delivery_confirmation.sql')
  ]);
  expect(page).toContain("order.status==='shipped' && order.supplier_id && user?.role==='owner'");
  expect(page).toContain('SupplierOrderOwnerVerification order={order}');
  expect(form).toContain('items.every((_,i)=>checked[i]===true)');
  expect(form).toContain("supabase.rpc('erp_owner_confirm_supplier_delivery'");
  expect(form).toContain('p_received_items:items.map');
  expect(sql).toContain("m.status='approved' AND m.role='owner'");
  expect(sql).toContain("received_qty IS DISTINCT FROM ordered_qty");
  expect(sql).toContain("UPDATE public.purchase_orders SET status='received'");
  expect(sql).toContain('supplier_order_delivery_confirmations');
  expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  expect(sql).toContain('REVOKE ALL ON public.supplier_order_delivery_confirmations FROM PUBLIC,anon,authenticated');
 });
});
