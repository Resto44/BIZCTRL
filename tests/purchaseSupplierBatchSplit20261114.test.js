// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 groupPurchaseLinesBySupplier,calcInvoiceTotals
} from '../src/lib/procurementEngine.js';

const suppliers=Array.from({length:20},(_,i)=>({
 id:'supplier-'+(i+1),name:'Supplier '+(i+1),email:'supplier'+(i+1)+'@example.com'
}));
const item=(supplier_id,product_name,quantity,unit_cost,tax=0)=>({
 supplier_id,product_name,quantity,unit_cost,tax,discount:0,line_total:999999
});

describe('ERP purchase session: separate supplier invoice and payable per party',()=>{
 it('splits one purchase of four products among three suppliers without cross-attribution',()=>{
  const lines=[
   item('supplier-1','Rice',1,289),
   item('supplier-2','Salt',2,5),
   item('supplier-1','Flour',1,11),
   item('supplier-3','Oil',1,4.5,10),
  ];
  const groups=groupPurchaseLinesBySupplier(lines,suppliers);
  expect(groups.map(g=>g.supplierId)).toEqual(['supplier-1','supplier-2','supplier-3']);
  expect(groups.map(g=>g.items.map(i=>i.product_name))).toEqual([
   ['Rice','Flour'],['Salt'],['Oil']
  ]);
  expect(groups.map(g=>g.totals.grandTotal)).toEqual([300,10,4.95]);
  const cents=groups.reduce((sum,g)=>sum+Math.round(g.totals.grandTotal*100),0);
  expect(cents).toBe(Math.round(calcInvoiceTotals(lines).grandTotal*100));
  expect(groups[0].supplierName).toBe('Supplier 1');
  expect(groups[2].supplierEmail).toBe('supplier3@example.com');
 });
 it('supports twenty separate suppliers without silently truncating invoice totals',()=>{
  const lines=suppliers.map((s,i)=>item(s.id,'Product '+i,1,i+1));
  const groups=groupPurchaseLinesBySupplier(lines,suppliers);
  expect(groups).toHaveLength(20);
  expect(groups.reduce((sum,g)=>sum+g.totals.grandTotal,0)).toBe(210);
  expect(new Set(groups.map(g=>g.supplierId)).size).toBe(20);
 });
 it('rejects unknown suppliers and incomplete supplier allocations before writing',()=>{
  expect(()=>groupPurchaseLinesBySupplier([item('', 'Rice',1,20)],suppliers)).toThrow('Line 1');
  expect(()=>groupPurchaseLinesBySupplier([item('other','Rice',1,20)],suppliers)).toThrow('registered supplier');
  expect(()=>groupPurchaseLinesBySupplier([],suppliers)).toThrow('at least one');
  expect(()=>groupPurchaseLinesBySupplier([...suppliers.map(s=>item(s.id,'Rice',1,1)),item('other','Oil',1,1)], [...suppliers,{id:'other',name:'Other'}])).toThrow('at most 20');
 });
 it('keeps shared payment, expense and extra costs out of multi supplier posting',()=>{
  const source=readFileSync('src/components/purchases/PurchaseInvoiceForm.jsx','utf8');
  expect(source).toContain("groupPurchaseLinesBySupplier(items, suppliers)");
  expect(source).toContain("const itemSupplierId = multiSupplierMode ? item.supplier_id : supplierId");
  expect(source).toContain("supplier_id: group.supplierId");
  expect(source).toContain("paid_amount: 0");
  expect(source).toContain("additionalCosts.some(cost => Number(cost.amount) !== 0)");
  expect(source).toContain("expense_id: null");
  expect(source).toContain("if (progress.completed.has(group.supplierId)) continue;");
  expect(source).toContain("progress.blocked = true");
  expect(source).toContain("invoice_number: invoiceNumber");
  expect(source).toContain("Post separate invoices");
  expect(source).toContain("computeApprovalStatus(batchGrandTotal) === 'pending'");
  expect(source).toContain("Save separate supplier drafts for Owner review");
  expect(source).toContain("Purchase batch");
  expect(source).toContain("data-testid=\"purchase-line-supplier\"");
 });
});
