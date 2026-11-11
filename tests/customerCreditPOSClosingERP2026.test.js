import { describe,it,expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { isItemizedCustomerCreditValid } from '../src/components/sales/CustomerCreditInvoiceItems.jsx';

const read=file=>readFile(new URL(file,import.meta.url),'utf8');

describe('Customer credit cross-channel ERP invoice continuity',()=>{
 it('allows exact monetary item totals and rejects mismatched itemized sales',()=>{
  expect(isItemizedCustomerCreditValid([{name:'Chicken',quantity:2,unit_price:22,total_price:44}],44)).toBe(true);
  expect(isItemizedCustomerCreditValid([{name:'Chicken',quantity:2,unit_price:22,total_price:44}],45)).toBe(false);
  expect(isItemizedCustomerCreditValid([{name:'',quantity:2,unit_price:22,total_price:44}],44)).toBe(false);
  expect(isItemizedCustomerCreditValid([{name:'Tea',quantity:1,unit_price:-1,total_price:-1}],-1)).toBe(false);
  expect(isItemizedCustomerCreditValid([{name:'Tea',quantity:1,unit_price:0.29,total_price:0.29}],0.29)).toBe(true);
  expect(isItemizedCustomerCreditValid([],50)).toBe(true);
 });
 it('prevents any full-credit sale from being classified as cash/card revenue',async()=>{
  const pos=await read('../supabase/migrations/20261111204500_restaurant_pos_customer_credit_checkout.sql');
  expect(pos).toContain("v_credit_mode:=p_payload->>'payment_method'='credit'");
  expect(pos).toContain("v_credit_customer.id ELSE NULL END");
  expect(pos).toContain("CASE WHEN v_credit_mode THEN o.net_total ELSE 0 END");
  expect(pos).toContain('cash:=0; card:=0; change_due:=0;');
  expect(pos).toContain("credit_confirmed");
  expect(pos).toContain("CUSTOMER_CREDIT_POS_MIXED_NOT_SUPPORTED");
  expect(pos).toContain("restaurant_pos_private.post_customer_credit_receivable(");
  expect(pos).toContain("customer_portal_private.store_credit_invoice_lines(");
  expect(pos).toContain("restaurant-pos:'||o.id");
  expect(pos).toContain('request_id');
  expect(pos).toContain("payment_status',CASE WHEN v_credit_mode THEN 'credit_outstanding'");
  expect(pos).not.toContain('public.erp_create_customer_receivable(');
  expect(pos).not.toMatch(/\bTRUNCATE\b|\bDROP\s+TABLE\b|\bDELETE\s+FROM\s+public\.daily_sales/i);
 });
 it('POS authorizes the device and selected customer, and preserves existing credit limits and idempotency',async()=>{
  const sql=await read('../supabase/migrations/20261111204000_restaurant_pos_cashier_credit_receivable.sql');
  expect(sql).toContain("restaurant_pos_private.guard(v_device.restaurant_id,v_device.branch_id,'uploadSales')");
  expect(sql).toContain("restaurant_pos_private.guard(v_device.restaurant_id,v_device.branch_id,'viewSales')");
  expect(sql).toContain('is_active IS TRUE AND (branch_id IS NULL OR branch_id=v_device.branch_id)');
  expect(sql).toContain('restaurant_id=v_device.restaurant_id');
  expect(sql).toContain('v_limit:=greatest(coalesce(v_customer.credit_limit,0),0)');
  expect(sql).toContain('SALES_CLOSING_CREDIT_LIMIT_EXCEEDED');
  expect(sql).toContain('settlement_request_id=v_order.id');
  expect(sql).toContain('ON CONFLICT (settlement_request_id)');
  expect(sql).toContain('CUSTOMER_CREDIT_POS_DUPLICATE_CONFLICT');
  expect(sql).toContain('status IN (\'open\',\'held\')');
  expect(sql).toContain('erp_refresh_customer_receivable_cache');
  expect(sql).toContain('FROM PUBLIC,anon,authenticated');
 });
 it('invoice item details are immutable, private and the authoritative sale value',async()=>{
  const ledger=await read('../supabase/migrations/20261111203500_customer_credit_itemized_invoice_ledger.sql');
  expect(ledger).toContain('debt_id uuid PRIMARY KEY REFERENCES public.debt_records(id)');
  expect(ledger).toContain('ENABLE ROW LEVEL SECURITY');
  expect(ledger).toContain('REVOKE ALL ON public.customer_credit_invoice_lines FROM PUBLIC,anon,authenticated');
  expect(ledger).toContain('REVOKE ALL ON FUNCTION customer_portal_private.store_credit_invoice_lines');
  expect(ledger).toContain("IF v_sum<>debt.total_amount THEN RAISE EXCEPTION");
  expect(ledger).toContain("ON CONFLICT(debt_id) DO NOTHING");
  expect(ledger).toContain("CUSTOMER_CREDIT_DETAILS_ALREADY_POSTED_DIFFERENTLY");
  expect(ledger).toContain("p_source_type='restaurant_pos'");
  expect(ledger).toContain("p_source_type='sales_closing'");
  expect(ledger).toContain("'summary_only',true");
 });
 it('Closing keeps its receipt/amount locked and provides truthful original item descriptions',async()=>{
  const [core,form,component,details]=await Promise.all([
   read('../supabase/migrations/20261111205000_closing_customer_credit_invoice_details.sql'),
   read('../src/components/sales/UnifiedSalesClosing.jsx'),
   read('../src/components/sales/CustomerCreditSalesSource.jsx'),
   read('../src/components/sales/CustomerCreditInvoiceItems.jsx')
  ]);
  expect(core).toContain("'items', COALESCE(v_entry -> 'items','[]'::jsonb)");
  expect(core).toContain('SALES_CLOSING_CREDIT_FINALIZED_IMMUTABLE');
  expect(core).toContain("customer_portal_private.store_credit_invoice_lines(");
  expect(core).toContain("IF v_debt.id IS NOT NULL THEN");
  expect(form).toContain('items: Array.isArray(rest.items)?rest.items:[]');
  expect(component).toContain('<CustomerCreditInvoiceItems');
  expect(component).toContain('!lineItemsValid');
  expect(component).toContain('If this credit sale was already posted by POS');
  expect(details).toContain('isItemizedCustomerCreditValid');
 });
 it('Customer Portal only retrieves invoices by authorized tenant, branch and customer, with automatic refresh',async()=>{
  const [sql,page,receipt]=await Promise.all([
   read('../supabase/migrations/20261111205500_customer_portal_credit_invoice_line_items.sql'),
   read('../src/pages/CustomerPortal.jsx'),
   read('../src/lib/retailCashier.js')
  ]);
  expect(sql).toContain('a.user_id=auth.uid() AND a.active');
  expect(sql).toContain('il.debt_id=d.id');
  expect(sql).toContain('il.restaurant_id=c.restaurant_id AND il.customer_id=c.id');
  expect(sql).toContain('coalesce(il.items,\'[]\'::jsonb) AS items');
  expect(sql).toContain("d.party_type='customer' AND d.type='receivable'");
  expect(page).toContain('refetchInterval:5000,refetchIntervalInBackground:false');
  expect(page).toContain('row.items?.map');
  expect(page).toContain("row.invoice_source==='restaurant_pos'");
  expect(page).toContain("row.invoice_source==='sales_closing'");
  expect(receipt).toContain("receipt.payment_status === 'credit_outstanding'");
  expect(receipt).toContain('Amount due / المبلغ المستحق');
 });
 it('POS has a scoped customer picker, available-limit preview and explicit confirmation',async()=>{
  const file=await read('../src/pages/restaurant/RestaurantPOS.jsx');
  expect(file).toContain("supabase.rpc('erp_restaurant_credit_customers'");
  expect(file).toContain('p_restaurant_id:restaurantId,p_branch_id:branchId,p_search:creditSearch||null');
  const picker=await read('../supabase/migrations/20261111204200_restaurant_pos_credit_customer_picker.sql');
  expect(picker).toContain("restaurant_pos_private.guard(p_restaurant_id,p_branch_id,'uploadSales')");
  expect(picker).toContain('d.restaurant_id=p_restaurant_id');
  expect(picker).toContain('REVOKE ALL ON FUNCTION public.erp_restaurant_credit_customers');
  expect(file).toContain("mode:'cash'");
  expect(file).toContain("'cash','card','mixed','credit'");
  expect(file).toContain("payment_method:'credit',customer_id:v.credit_customer_id,credit_confirmed:v.credit_confirmed");
  expect(file).toContain('available>=Number(cart?.net_total)');
  expect(file).toContain('v.credit_confirmed');
  expect(file).toContain('credit_customer_id');
  expect(file).not.toContain('supabase.from(\'debt_records\').insert');
 });
});
