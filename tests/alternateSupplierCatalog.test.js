import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fetchScopedPurchaseProducts,purchaseProductsForBrand} from '../src/lib/purchaseInvoiceBrands';
const rows=[
 {id:'a',name:'Lamb',restaurant_id:'r',supplier_id:'old',category_id:'meat',brand:'Royal Fresh'},
 {id:'b',name:'Beef',restaurant_id:'r',supplier_id:'new',category_id:'meat',brand:'Royal Fresh'},
 {id:'c',name:'Rice',restaurant_id:'r',supplier_id:'old',category_id:'rice'},
 {id:'d',name:'Other tenant',restaurant_id:'other',supplier_id:'old',category_id:'meat'},
 {id:'e',name:'Archived',restaurant_id:'r',supplier_id:'old',category_id:'meat',is_active:false}
];
function db(){return {from:()=>{let data=rows;const q={select:()=>q,eq:(k,v)=>{data=data.filter(r=>r[k]===v);return q},in:(k,ids)=>{data=data.filter(r=>ids.includes(r[k]));return q},order:()=>q,range:async(a,b)=>({data:data.slice(a,b+1),error:null})};return q}}}
describe('Alternate supplier catalog',()=>{
 it('includes only explicit alternate products alongside primary products within category and tenant',async()=>{
  const result=await fetchScopedPurchaseProducts(db(),{restaurant_id:'r',supplier_id:'new',category_id:'meat'},['a','b','c','d','e']);
  expect(result.map(p=>p.id).sort()).toEqual(['a','b']);
  expect(result.find(p=>p.id==='a').supplier_id).toBe('old');
  expect(purchaseProductsForBrand(result,'Royal Fresh')).toHaveLength(2);
 });
 it('does not expose an unrelated supplier when no links exist',async()=>{
  const result=await fetchScopedPurchaseProducts(db(),{restaurant_id:'r',supplier_id:'new',category_id:'meat'});
  expect(result.map(p=>p.id)).toEqual(['b']);
 });
 it('preserves primary suppliers and uses scoped RLS plus explicit alternate inserts',()=>{
  const sql=readFileSync('supabase/migrations/20261127001000_alternate_supplier_catalog.sql','utf8');
  expect(sql).toContain('enable row level security');
  expect(sql).toContain('if v_primary is null then');
  expect(sql).toContain('elsif v_primary<>v_id then');
  expect(sql).toContain('on conflict do nothing');
  expect(sql).toContain('security invoker');
  const picker=readFileSync('src/components/suppliers/SupplierCatalogPicker.jsx','utf8');
  expect(picker).toContain('filtered.filter(p=>!owns(p))');
  expect(picker).toContain('disabled={disabled||own}');
 });
});
