import { describe, it, expect } from 'vitest';
import { inventoryOpeningPayload } from '../src/lib/inventoryOpeningPayload';
import { buildLowStockDraft } from '../src/lib/lowStockPurchaseOrder';
import { computeLiveStock } from '../src/lib/stockEngine';
const branch={id:'b',key:'branch'};
const row={id:'stock',restaurant_id:'r',product_id:'p',branch_id:'b',branch:'branch',unit:'kg',opening_stock:10,quantity:3,low_stock_threshold:5,date:'2026-11-15'};
const supplier={id:'s',restaurant_id:'r',branch_id:'b',name:'Supplier'};
const products=[{id:'p',restaurant_id:'r',supplier_id:'s',unit:'kg'}];
const draft=overrides=>buildLowStockDraft({restaurantId:'r',branch,supplier,stock:[row],products,orderNumber:'PO-test',...overrides});
describe('stock integrity',()=>{
 it('does not replay purchases or waste over the database balance',()=>{
   expect(computeLiveStock([row],[{...row,qty:100}],[{...row,quantity:2}])[0]).toMatchObject({currentStock:3,isLow:true});
   expect(computeLiveStock([{...row,quantity:0,low_stock_threshold:0}],[])[0]).toMatchObject({currentStock:0,isLow:true});
 });
 it('keeps different units and tenants separate',()=>{
   expect(computeLiveStock([row,{...row,id:'box',unit:'box'},{...row,id:'other',restaurant_id:'other'}],[])).toHaveLength(3);
 });
 it('does not write stale quantity, cost, scope or timestamps from edit forms',()=>{
   const payload=inventoryOpeningPayload({...row,quantity:999,average_cost:99,total_value:999,last_updated:'old'},[branch],row);
   expect(payload).not.toHaveProperty('quantity');expect(payload).not.toHaveProperty('average_cost');expect(payload).not.toHaveProperty('total_value');expect(payload).not.toHaveProperty('last_updated');
   expect(payload.branch_id).toBe('b');
 });
 it('rejects moving a stock record and nonfinite opening values',()=>{
   expect(()=>inventoryOpeningPayload({...row,product_id:'other'},[branch],row)).toThrow('cannot be moved');
   expect(()=>inventoryOpeningPayload({...row,opening_stock:NaN},[branch])).toThrow('valid');
 });
 it('writes only supported draft columns and one supplier branch',()=>{
   const payload=draft();expect(payload).toMatchObject({restaurant_id:'r',branch_id:'b',supplier_id:'s',status:'draft'});
   for(const key of ['date','supplier_email','supplier_phone'])expect(payload).not.toHaveProperty(key);
   expect(JSON.parse(payload.items)[0]).toMatchObject({product_id:'p',qty:10});
 });
 it('rejects mixed tenant, branch, supplier and unit rows',()=>{
   for(const patch of [{restaurant_id:'other'},{branch_id:'other'},{unit:'box'},{product_id:'other'}])expect(()=>draft({stock:[{...row,...patch}]})).toThrow();
   expect(()=>draft({supplier:{...supplier,branch_id:'other'}})).toThrow();
   expect(()=>draft({products:[{...products[0],supplier_id:'other'}]})).toThrow();
 });
 it('rejects zero, negative, or nonfinite reorder quantities',()=>{
   for(const qty of [0,-1,NaN,Infinity])expect(()=>draft({quantities:{stock:qty}})).toThrow('greater than zero');
 });
});
