import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/pages/SupplierPortalERP.jsx',import.meta.url),'utf8');

describe('Supplier Portal mobile-first ERP workspace',()=>{
 it('replaces full-screen dark gradient with consistent responsive SaaS light and dark surfaces',()=>{
  expect(source).toContain('data-testid="supplier-erp-workspace"');
  expect(source).toContain('bg-slate-50/80');
  expect(source).toContain('dark:bg-slate-950');
  expect(source).toContain('data-testid="supplier-erp-header"');
  expect(source).not.toContain('min-h-screen bg-gradient-to-br from-slate-950');
  expect(source).not.toContain('bg-slate-950/90 backdrop-blur border-t border-white/10');
  expect(source).toContain('max-w-6xl');
 });
 it('places 4 tabs side by side on mobile, within the content instead of behind the global bottom nav',()=>{
  expect(source).toContain('data-testid="supplier-erp-tabs"');
  expect(source).toContain('grid grid-cols-4');
  expect(source).toContain("aria-current={activeTab===tab.id?'page':undefined}");
  for(const tab of ["id: 'home'","id: 'invoices'","id: 'orders'","id: 'history'"])
   expect(source).toContain(tab);
  expect(source).toContain("setActiveTab(tab.id);setSearch('')");
  expect(source).not.toContain('fixed bottom-0 left-0 right-0 bg-slate-950');
 });
 it('never invents balances and does not combine distinct currencies in a profit total',()=>{
  expect(source).toContain("supplierInvoiceCurrencyTotals(invoices)");
  expect(source).toContain('currencyTotals.map');
  expect(source).toContain("invoicesLoading ? '…' : showTotal('outstanding')");
  expect(source).toContain('invoicesLoading &&');
  expect(source).toContain('pending.length');
  expect(source).toContain('purchaseOrders.filter(po => po.status');
  expect(source).toContain('data-testid="supplier-order-progress"');
  expect(source).toContain('moneyLabel');
  expect(source).toContain("Number.isFinite(Number(value))");
  expect(source).not.toContain('totalPOValue');
 });
 it('shows responsive compact empty state and localized text in Arabic Dari and English',()=>{
  expect(source).toContain('data-testid="supplier-erp-empty"');
  expect(source).toContain('rounded-2xl border border-slate-200 bg-white');
  expect(source).toContain('SUPPLIER_COPY[lang]');
  expect(source).toContain("dir={isRTL?'rtl':'ltr'}");
  for(const label of ['بوابة المورّد','پورتال تأمین‌کننده','Supplier workspace','در انتظار ارسال','بانتظار الشحن'])
   expect(source).toContain(label);
  expect(source).toContain('copy.emptyDesc');
  expect(source).toContain('!isLoading && !invoicesLoading && pending.length === 0 && invoices.length === 0');
 });
 it('keeps signed-in tenant-branch-supplier scoped read, mutation and failures',()=>{
  expect(source).toContain("supabase.rpc('erp_supplier_self_profile')");
  expect(source).toContain("user?.role==='supplier'");
  expect(source).toContain("from('supplier_invoices')");
  expect(source).toContain("from('purchase_orders')");
  expect(source).toContain(".eq('restaurant_id', user.restaurant_id)");
  expect(source).toContain(".eq('branch_id', user.branch_id)");
  expect(source).toContain(".eq('supplier_id', supplierProfile.id)");
  expect(source).toContain("supabase.rpc('erp_supplier_mark_order_shipped',{p_order_id:poId})");
  expect(source).toContain("supabase.rpc('erp_supplier_verified_deliveries')");
  expect(source).toContain("if(data?.status!=='shipped')throw new Error");
  expect(source).toContain('ownerVerification={deliveryByOrder.get(String(po.id))}');
  expect(source).toContain('PortalDataState onRetry');
  expect(source).not.toContain("supabase.from('suppliers')");
 });
 it('maintains 44px confirmation and no submission for already shipped/cancelled orders',()=>{
  expect(source).toContain("po.status==='approved' && <Button");
  expect(source).toContain('disabled={loading} onClick={onConfirmShipment}');
  expect(source).toContain('min-h-11 w-full');
  expect(source).toContain("onConfirmShipment={()=>confirmShipmentMutation.mutate(po.id)}");
  expect(source).toContain('data-testid="supplier-invoice-card"');
  expect(source).toContain('data-testid="supplier-purchase-order-card"');
 });
});
