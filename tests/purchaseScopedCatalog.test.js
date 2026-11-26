import {describe,it,expect,vi} from 'vitest';
import {fetchScopedPurchaseProducts,purchaseBrandOptions,purchaseProductsForBrand,searchPurchaseProducts,selectPurchaseProduct} from '../src/lib/purchaseInvoiceBrands';
const fixtures=[
{id:'1',restaurant_id:'r',supplier_id:'a',category_id:'rice',subcategory_id:'long',brand:'Golden Grain',name:'Basmati',name_ar:'أرز',name_fa:'برنج',sku:'R01',restaurant_product_type:'raw_material'},
{id:'2',restaurant_id:'r',supplier_id:'a',category_id:'rice',subcategory_id:'long',brand:'Golden Grain',name:'Long grain',restaurant_product_type:'raw_material'},
{id:'3',restaurant_id:'r',supplier_id:'b',category_id:'rice',subcategory_id:'long',brand:'Golden Grain',restaurant_product_type:'raw_material'},
{id:'4',restaurant_id:'r',supplier_id:'a',category_id:'rice',subcategory_id:'short',brand:'Other',restaurant_product_type:'raw_material'},
{id:'5',restaurant_id:'other',supplier_id:'a',category_id:'rice',subcategory_id:'long',brand:'Other',restaurant_product_type:'raw_material'},
{id:'6',restaurant_id:'r',supplier_id:'a',category_id:'rice',subcategory_id:'long',brand:'Other',restaurant_product_type:'dish'},
{id:'7',restaurant_id:'r',supplier_id:'a',category_id:'rice',subcategory_id:'long',brand:'Other',restaurant_product_type:'raw_material',is_active:false}
];
function db(rows=fixtures,error=null){
 const filters=[];const q={select:()=>q,eq:(k,v)=>{filters.push([k,v]);return q;},order:()=>q,range:vi.fn(async(a,b)=>({data:rows.filter(r=>filters.every(([k,v])=>r[k]===v)).slice(a,b+1),error}))};
 return {from:()=>{filters.length=0;return q;},q};
}
const scope={restaurant_id:'r',supplier_id:'a',category_id:'rice',subcategory_id:'long',restaurant_product_type:'raw_material'};
describe('Strict purchase catalog scope',()=>{
 it('intersects all filters and shows only the matching brand products',async()=>{
  const rows=await fetchScopedPurchaseProducts(db(),scope);
  expect(rows.map(r=>r.id)).toEqual(['1','2']);
  expect(purchaseBrandOptions(rows)).toEqual(['Golden Grain']);
  expect(purchaseProductsForBrand(rows,' golden grain ').length).toBe(2);
  expect(searchPurchaseProducts(rows,'برنج').map(r=>r.id)).toEqual(['1']);
 });
 it('does not fall back when supplier or subcategory has no mapped products',async()=>{
  expect(await fetchScopedPurchaseProducts(db(),{...scope,supplier_id:'missing'})).toEqual([]);
  expect(await fetchScopedPurchaseProducts(db(),{...scope,subcategory_id:'missing'})).toEqual([]);
 });
 it('supports supplier-first and auto-fills category without replacing payable supplier',async()=>{
  const rows=await fetchScopedPurchaseProducts(db(),{restaurant_id:'r',supplier_id:'a',restaurant_product_type:'raw_material'});
  expect(rows.map(r=>r.id).sort()).toEqual(['1','2','4']);
  expect(selectPurchaseProduct({supplier_id:'a'},rows[0])).toMatchObject({supplier_id:'a',category_id:'rice'});
 });
 it('paginates beyond 500 and surfaces query errors',async()=>{
  const rows=Array.from({length:501},(_,i)=>({...fixtures[0],id:String(i)}));
  const d=db(rows);expect(await fetchScopedPurchaseProducts(d,scope)).toHaveLength(501);
  expect(d.q.range).toHaveBeenCalledTimes(2);
  await expect(fetchScopedPurchaseProducts(db([],new Error('denied')),scope)).rejects.toThrow('denied');
 });
});
