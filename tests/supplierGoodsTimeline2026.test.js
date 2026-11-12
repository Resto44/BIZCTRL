import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {buildSupplierGoodsTimeline,completedSupplierGoodsHistory} from '../src/lib/supplierGoodsTimeline.js';
const read = path => readFile(new URL(path,import.meta.url),'utf8');

const base = {id:'invoice-a',restaurant_id:'tenant-1',branch_id:'branch-1',supplier_id:'supplier-1',
  approval_status:'approved',status:'paid',items:[{product_name:'Rice',quantity:2}]};
const receipt = {invoice_id:'invoice-a',branch_id:'branch-1',supplier_id:'supplier-1',
  confirmed_at:'2026-11-12T06:00:00Z',verified_items:[{product_name:'Rice',received_quantity:2}]};

describe('Supplier purchase invoice goods progress and completed history',()=>{
 it('never confuses invoice payment, approval or unpaid balance with physical receipt',()=>{
   const entries=buildSupplierGoodsTimeline([base],[]);
   expect(entries[0].stage).toBe('awaiting_owner');
   expect(completedSupplierGoodsHistory(entries)).toEqual([]);
   expect(buildSupplierGoodsTimeline([{...base,status:'pending',approval_status:'pending'}],[])[0].stage).toBe('pending_approval');
 });
 it('displays an exact Owner-confirmed receipt with quantities in completed history',()=>{
   const entries=buildSupplierGoodsTimeline([base],[receipt]);
   expect(entries[0].stage).toBe('received');
   expect(completedSupplierGoodsHistory(entries)[0].receipt.verified_items[0].received_quantity).toBe(2);
 });
 it('rejects unlinked, cross-branch and other-supplier receipts even if invoice ID coincides',()=>{
   for(const changed of [{supplier_id:'supplier-2'},{branch_id:'branch-2'},{invoice_id:'other'}]){
     const entries=buildSupplierGoodsTimeline([base],[{...receipt,...changed}]);
     expect(entries[0].stage).toBe('awaiting_owner');
     expect(completedSupplierGoodsHistory(entries)).toHaveLength(0);
   }
 });
 it('sorts completed receipts newest first and excludes invoices outside the permitted branch',()=>{
   const other={...base,id:'invoice-b'};
   const lines=buildSupplierGoodsTimeline([base,other,{...base,id:'invoice-legacy',branch_id:null}],
     [receipt,{...receipt,invoice_id:'invoice-b',confirmed_at:'2026-11-12T09:00:00Z'}]);
   expect(completedSupplierGoodsHistory(lines).map(x=>x.invoice.id)).toEqual(['invoice-b','invoice-a']);
 });
 it('shows both invoice goods progress and receipt history, preserving purchase orders separately',async()=>{
   const source=await read('../src/pages/SupplierPortalERP.jsx');
   expect(source).toContain('buildSupplierGoodsTimeline(invoices,invoiceDeliveries)');
   expect(source).toContain('completedSupplierGoodsHistory(goodsTimeline)');
   expect(source).toContain('data-testid="supplier-invoice-goods-orders"');
   expect(source).toContain('data-testid="supplier-goods-delivery-history"');
   expect(source).toContain('data-testid="supplier-goods-progress"');
   expect(source).toContain('invoiceDeliveryError');
   expect(source).toContain('refetchInvoiceDeliveries()');
   expect(source).toContain('data-testid="supplier-verified-goods-line"');
   expect(source).not.toContain("supabase.rpc('erp_owner_confirm_supplier_invoice_delivery'");
 });
});
