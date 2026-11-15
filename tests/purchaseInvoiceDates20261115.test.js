import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validPurchaseISODate,normalizePurchaseInvoiceDates} from '../src/lib/purchaseInvoiceDates.js';

const form=readFileSync('src/components/purchases/PurchaseInvoiceForm.jsx','utf8');
const engine=readFileSync('src/lib/procurementEngine.js','utf8');

describe('ERP Purchase Invoice: optional due date never sent as empty PostgreSQL DATE',()=>{
 it('normalizes empty or whitespace-only due_date to SQL NULL without changing date',()=>{
  for(const empty of ['', '  ', null, undefined]){
   const input={date:'2026-11-15',due_date:empty,supplier_id:'first',total_amount:19};
   expect(normalizePurchaseInvoiceDates(input)).toEqual({date:'2026-11-15',due_date:null});
   expect(input.due_date).toBe(empty);
  }
 });
 it('keeps a specified valid due date unchanged and does not use midnight UTC to pick a date',()=>{
  expect(normalizePurchaseInvoiceDates({date:' 2026-11-15 ',due_date:' 2026-12-01 '}))
   .toEqual({date:'2026-11-15',due_date:'2026-12-01'});
  expect(validPurchaseISODate('2024-02-29')).toBe(true);
  expect(validPurchaseISODate('2026-02-29')).toBe(false);
  expect(validPurchaseISODate('2026-11-15')).toBe(true);
 });
 it('rejects invalid required purchase dates and invalid nonempty due dates before writes',()=>{
  for(const value of ['',null,undefined,'2026-02-30','2026-13-15','11/15/2026','2026-11-15T00:00:00Z']){
   expect(()=>normalizePurchaseInvoiceDates({date:value,due_date:''})).toThrow(/valid purchase date/);
  }
  for(const value of ['2026-02-30','not-a-date','0000-01-01','2026-11-45']){
   expect(()=>normalizePurchaseInvoiceDates({date:'2026-11-15',due_date:value})).toThrow(/Due date/);
  }
 });
 it('normalizes the exact screenshot case before two separate supplier invoices are created',()=>{
  const batch=[
   {supplier_id:'vegetable',invoice_number:'PUR-20261115-0007-S01',total_amount:19,date:'2026-11-15',due_date:''},
   {supplier_id:'other',invoice_number:'PUR-20261115-0007-S02',total_amount:145,date:'2026-11-15',due_date:''},
  ];
  const ready=batch.map(x=>({...x,...normalizePurchaseInvoiceDates(x)}));
  expect(ready.map(x=>x.due_date)).toEqual([null,null]);
  expect(ready.map(x=>x.supplier_id)).toEqual(['vegetable','other']);
  expect(ready.reduce((total,x)=>total+x.total_amount,0)).toBe(164);
 });
 it('uses centralized date guard before creating or updating a supplier invoice',()=>{
  expect(engine).toContain("import {normalizePurchaseInvoiceDates} from './purchaseInvoiceDates.js'");
  expect((engine.match(/const validDates = normalizePurchaseInvoiceDates\(invoiceData\);/g)||[])).toHaveLength(2);
  expect((engine.match(/\.\.\.validDates,/g)||[])).toHaveLength(2);
  expect(engine.indexOf('const validDates = normalizePurchaseInvoiceDates(invoiceData);')).toBeLessThan(engine.indexOf(".from('supplier_invoices')\n    .insert(payload)"));
 });
 it('validates all batch dates BEFORE the first supplier write and preserves idempotent split',()=>{
  const start=form.indexOf('const handleSupplierBatchSubmit = async (mode)');
  const next=form.indexOf('const handleSubmit = async (e, mode',start);
  const batch=form.slice(start,next);
  expect(batch).toContain('normalizedDates = normalizePurchaseInvoiceDates(form)');
  expect(batch).toContain('...normalizedDates,');
  expect(batch).toContain('date: normalizedDates.date');
  expect(batch).toContain('dueDate: normalizedDates.due_date');
  expect(batch.indexOf('normalizedDates = normalizePurchaseInvoiceDates(form)'))
   .toBeLessThan(batch.indexOf('for (let index = 0; index < groups.length; index += 1)'));
  expect(batch).toContain("progress.completed.has(group.supplierId)");
  expect(batch).toContain(".eq('branch_id', branch.id)");
  expect(batch).toContain('progress.completed.set(group.supplierId, saved)');
  expect(form).toContain('normalizePurchaseInvoiceDates(form)');
  expect(form).toContain('if (multiSupplierMode) return handleSupplierBatchSubmit(mode)');
  expect(form).toContain('No invoice was saved.');
 });
});