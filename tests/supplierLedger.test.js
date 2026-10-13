import {describe,it,expect} from 'vitest';
import {buildSupplierLedger,matchesLedgerBranch} from '../src/lib/supplierLedger';
import {fetchSupplierLedger} from '../src/lib/supplierLedgerData';
const invoice=(x={})=>({id:'i1',date:'2026-10-01',due_date:'2026-10-12',currency:'SAR',total_amount:100,paid_amount:40,status:'partial',restaurant_id:'r',branch_id:'b',supplier_id:'s',...x});
const payment=(x={})=>({id:'p1',date:'2026-10-02',amount:40,invoice_id:'i1',restaurant_id:'r',branch_id:'b',supplier_id:'s',...x});
const build=(x={})=>buildSupplierLedger({invoices:[invoice()],payments:[payment()],end:'2026-10-13',...x});
describe('supplier ledger accounting',()=>{
 it('uses payment evidence once and reconciles the closing KPI with the timeline',()=>{const {groups,issues}=build();expect(issues).toEqual([]);expect(groups[0]).toMatchObject({opening:0,invoiced:100,paid:40,closing:60});expect(groups[0].rows.at(-1).balance).toBe(60);});
 it('carries opening into a period containing only a partial payment',()=>{const g=build({start:'2026-10-02'}).groups[0];expect(g).toMatchObject({opening:100,invoiced:0,paid:40,closing:60});expect(g.rows[0].balance).toBe(60);});
 it('does not invent payments from a conflicting paid_amount',()=>{const l=build({invoices:[invoice({paid_amount:75})]});expect(l.groups[0].closing).toBe(60);expect(l.issues).toContainEqual({type:'payment_mismatch',ref:'i1',difference:35});});
 it('excludes pending approval from posted balances and flags it',()=>{const l=build({invoices:[invoice({approval_status:'pending'})],payments:[]});expect(l.groups).toEqual([]);expect(l.issues[0].type).toBe('unapproved_invoice');});
 it('retains advance credit instead of clamping it to zero',()=>{expect(build({payments:[payment({amount:150})]}).groups[0].closing).toBe(-50);});
 it('never adds cancelled, rejected or draft invoices to payables',()=>{for(const status of ['cancelled','rejected','draft','void'])expect(build({invoices:[invoice({status})],payments:[]}).groups).toEqual([]);});
 it('keeps cancelled-invoice payments visible and flags them',()=>{const l=build({invoices:[invoice({status:'cancelled'})]});expect(l.groups[0].closing).toBe(-40);expect(l.issues.some(x=>x.type==='unmatched_payment')).toBe(true);});
 it('separates currencies and leaves unallocated currency unknown',()=>{const l=build({invoices:[invoice(),invoice({id:'i2',currency:'USD',paid_amount:0})],payments:[payment(),payment({id:'p2',invoice_id:null,amount:20})]});expect(l.groups.map(g=>[g.currency,g.closing])).toEqual([['SAR',60],['UNKNOWN',-20],['USD',100]]);});
 it('honors canonical branch id over stale legacy names',()=>{expect(matchesLedgerBranch({branch_id:'other',branch:'same'},{id:'b',key:'same'})).toBe(false);expect(matchesLedgerBranch({branch:'same'},{id:'b',key:'same'})).toBe(true);expect(build({branch:{id:'other'}}).groups).toEqual([]);});
 it('uses supplier ids instead of similar supplier names',()=>{expect(build({supplierId:'different'}).groups).toEqual([]);});
 it('rounds monetary strings without concatenation or float drift',()=>{const l=build({invoices:[invoice({total_amount:'0.30',paid_amount:'0.10'})],payments:[payment({amount:'0.10'})]});expect(l.groups[0].closing).toBe(.2);});
 it('excludes future payments in historical statements and avoids false reconciliation mismatch',()=>{const l=build({end:'2026-10-01'});expect(l.groups[0].closing).toBe(100);expect(l.issues).toEqual([]);});
 it('counts overdue by remaining evidence and date, not stale paid status',()=>{expect(build({invoices:[invoice({status:'paid'})]}).groups[0].overdue).toHaveLength(1);expect(build({end:'2026-10-12'}).groups[0].overdue).toHaveLength(0);});
 it('flags invalid dates and never crashes sorting them',()=>{const l=build({invoices:[invoice({date:null})],payments:[payment({date:'invalid'})]});expect(l.groups).toEqual([]);expect(l.issues).toHaveLength(2);});
 it('deduplicates repeated ids but flags repeated invoice numbers without deleting financial records',()=>{const a=invoice({invoice_number:'N',paid_amount:0});const l=build({invoices:[a,a,{...a,id:'i2'}],payments:[]});expect(l.groups[0].invoiced).toBe(200);expect(l.issues.map(i=>i.type)).toEqual(['duplicate_or_missing_id','duplicate_invoice_number']);});
 it('sorts equal-day invoices before payments deterministically',()=>{const l=build({payments:[payment({date:'2026-10-01'})]});expect(l.groups[0].rows.map(r=>r.type)).toEqual(['invoice','payment']);});
});
describe('supplier ledger reads',()=>{
 it('refuses missing tenant scope',async()=>{await expect(fetchSupplierLedger({},{})).rejects.toThrow('Select an organization');});
 it('keeps tenant and branch constraints on every financial page and propagates errors',async()=>{
  const calls=[];
  const client={from:table=>{const q={select:()=>q,eq:(...a)=>{calls.push([table,'eq',...a]);return q;},order:()=>q,or:v=>{calls.push([table,'or',v]);return q;},range:()=>Promise.resolve(table==='supplier_payments'?{error:new Error('denied')}:{data:[]})};return q;}};
  await expect(fetchSupplierLedger(client,{restaurantId:'r',branch:{id:'b',key:'branch'}})).rejects.toThrow('denied');
  for(const table of ['supplier_invoices','supplier_payments','suppliers'])expect(calls).toContainEqual([table,'eq','restaurant_id','r']);
  expect(calls.filter(c=>c[1]==='or')).toHaveLength(2);
 });
});
