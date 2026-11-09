import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {supplierInvoicePaymentEvidence,supplierInvoiceProgress} from '../src/lib/supplierInvoicePaymentEvidence.js';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const src=read('../src/pages/SupplierPortalERP.jsx');
const policy=read('../supabase/migrations/20261109133000_supplier_payment_self_read_rls.sql');
const sample=(paid,status='partial')=>({id:'invoice-1',total_amount:100,paid_amount:paid,status,currency:'SAR'});
const first={id:'payment-1',invoice_id:'invoice-1',amount:30,date:'2026-11-09',payment_method:'cash'};
const second={id:'payment-2',invoice_id:'invoice-1',amount:70,date:'2026-11-09',payment_method:'bank_transfer'};
describe('Supplier ERP payment ledger and invoice details',()=>{
 it('recalculates remaining amount after a partial then full manager payment (no duplicate posting)',()=>{
  const before=supplierInvoicePaymentEvidence(sample(0,'approved'),[]);
  expect(before).toMatchObject({paid:0,remaining:100,paidPercent:0,paidFull:false,paidPartial:false});
  const partial=supplierInvoicePaymentEvidence(sample(30),[first]);
  expect(partial).toMatchObject({total:100,paid:30,remaining:70,paidPercent:30,paidPartial:true,paidFull:false,
    historyAmount:30,historyNeedsReview:false,paymentCount:1});
  const full=supplierInvoicePaymentEvidence(sample(100,'paid'),[first,second]);
  expect(full).toMatchObject({paid:100,remaining:0,paidPercent:100,paidFull:true,paidPartial:false,
    historyAmount:100,historyNeedsReview:false,paymentCount:2});
  expect(full.paymentHistory.map(p=>p.id).sort()).toEqual(['payment-1','payment-2']);
 });
 it('does not count duplicate payment IDs or unrelated invoices',()=>{
  const actual=supplierInvoicePaymentEvidence(sample(30),[first,first,{...second,invoice_id:'another'}]);
  expect(actual.paymentHistory.map(p=>p.id)).toEqual(['payment-1']);
  expect(actual.historyAmount).toBe(30);
  expect(actual.historyNeedsReview).toBe(false);
 });
 it('never manufactures missing payment detail; discrepancies require reconciliation',()=>{
  const imported=supplierInvoicePaymentEvidence(sample(40),[]);
  expect(imported.legacyHistoryMissing).toBe(true);
  expect(imported.historyNeedsReview).toBe(false);
  expect(imported.remaining).toBe(60);
  const partialRows=supplierInvoicePaymentEvidence(sample(40),[first]);
  expect(partialRows.historyNeedsReview).toBe(true);
  expect(supplierInvoicePaymentEvidence(sample(40),[first],false).historyNeedsReview).toBe(false);
  expect(supplierInvoicePaymentEvidence({...sample(40),paid_amount:null},[first]).remaining).toBeNull();
 });
 it('keeps amounts in integer cents and excludes cancelled drafts',()=>{
  const invoice={id:'invoice-1',total_amount:0.3,paid_amount:0.1,status:'partial'};
  expect(supplierInvoicePaymentEvidence(invoice,[{...first,amount:0.1}]).remaining).toBeCloseTo(0.2);
  expect(supplierInvoiceProgress([sample(100,'paid'),sample(40),sample(0,'approved'),
    sample(100,'draft'),sample(30,'cancelled')])).toEqual({fullyPaid:1,partiallyPaid:1});
 });
 it('limits Supplier payment SELECT to linked own ID, keeping manager access as before',()=>{
  expect(policy).toContain('ALTER POLICY erp_scope_select ON public.supplier_payments');
  expect(policy).toContain("public.erp_current_role()");
  expect(policy).toContain("supplier_id = public.erp_current_linked_entity_id()");
  expect(policy).toContain('public.erp_can_access_scope_text');
  expect(policy).not.toContain('CREATE POLICY');
  expect(policy).not.toContain('UPDATE public.supplier_payments');
  expect(policy).not.toContain('DELETE FROM');
 });
 it('binds recorded payments to tenant branch supplier; live refetch follows manager payment',()=>{
  expect(src).toContain("queryKey:['supplier-payments-portal',supplierProfile?.id,user?.restaurant_id,user?.branch_id]");
  expect(src).toContain("from('supplier_payments')");
  expect(src).toContain(".eq('restaurant_id',user.restaurant_id)");
  expect(src).toContain(".eq('branch_id',user.branch_id)");
  expect(src).toContain(".eq('supplier_id',supplierProfile.id)");
  expect(src).toContain("refetchInterval:12000,refetchOnWindowFocus:true");
  expect(src).toContain("refetchInvoices();refetchPayments();");
  expect(src).toContain("supplierInvoiceCurrencyTotals(invoices)");
  expect(src).not.toContain("from('supplier_payments').insert");
  expect(src).not.toContain("from('supplier_payments').update");
 });
 it('exposes a real keyboard-accessible expandable invoice with item and payment history',()=>{
  expect(src).toContain('data-testid="supplier-invoice-open-details"');
  expect(src).toContain('aria-expanded={expanded}');
  expect(src).toContain('onClick={()=>setExpanded(v=>!v)}');
  expect(src).toContain('data-testid="supplier-invoice-detail"');
  expect(src).toContain('data-testid="supplier-invoice-payment-history"');
  expect(src).toContain('data-testid="supplier-recorded-payment"');
  expect(src).toContain('item.quantity??item.qty');
  expect(src).toContain('inv.additional_costs');
  expect(src).toContain('supplierInvoicePaymentEvidence(inv,payments');
  expect(src).toContain('copy.historyMismatch');
  expect(src).toContain('copy.historyGap');
 });
});
