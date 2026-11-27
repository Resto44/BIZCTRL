import {describe,it,expect} from 'vitest';
import {supplierPurchaseCategoryOptions,clearPurchaseProductForFilter,fetchScopedPurchaseProducts} from '../src/lib/purchaseInvoiceBrands';
import {readFileSync} from 'node:fs';
const categories=[{id:'beverages'},{id:'water',parent_id:'beverages'},{id:'juice',parent_id:'beverages'},{id:'meat'},{id:'red',parent_id:'meat'},{id:'rice'},{id:'inactive',is_active:false}];
const products=[{id:'w1',restaurant_id:'r',supplier_id:'water-supplier',category_id:'beverages',subcategory_id:'water'},{id:'w2',restaurant_id:'r',supplier_id:'primary-other',category_id:'beverages',subcategory_id:'water'},{id:'j1',restaurant_id:'r',supplier_id:'other',category_id:'beverages',subcategory_id:'juice'},{id:'m1',restaurant_id:'r',supplier_id:'meat-supplier',category_id:'meat',subcategory_id:'red'},{id:'r1',restaurant_id:'other-tenant',supplier_id:'water-supplier',category_id:'rice'},{id:'a1',restaurant_id:'r',supplier_id:'water-supplier',category_id:'rice',is_active:false}];
function db(){return {from:()=>{let rows=products;const q={select:()=>q,eq:(k,v)=>{rows=rows.filter(x=>x[k]===v);return q},in:(k,v)=>{rows=rows.filter(x=>v.includes(x[k]));return q},order:()=>q,range:async(a,b)=>({data:rows.slice(a,b+1)})};return q;}}}
describe('Purchase category supplier scope',()=>{
 it('includes primary and explicit alternate products only, excludes unrelated categories and subcategories',async()=>{
  const catalog=await fetchScopedPurchaseProducts(db(),{restaurant_id:'r',supplier_id:'water-supplier'},['w2']);
  expect(catalog.map(x=>x.id)).toEqual(['w1','w2']);
  const result=supplierPurchaseCategoryOptions(categories,catalog,'beverages');
  expect(result.categories.map(x=>x.id)).toEqual(['beverages']);
  expect(result.subcategories.map(x=>x.id)).toEqual(['water']);
 });
 it('isolates each invoice line supplier and returns no choices for empty catalogs',()=>{
  expect(supplierPurchaseCategoryOptions(categories,[products[3]],'meat').subcategories.map(x=>x.id)).toEqual(['red']);
  expect(supplierPurchaseCategoryOptions(categories,[])).toEqual({categories:[],subcategories:[]});
 });
 it('clears stale category, subcategory, brand and selected product when supplier changes but keeps quantity',()=>{
  const line={supplier_id:'old',category:'Meat',category_id:'meat',subcategory_id:'red',brand:'Royal Fresh',product_id:'m1',product_name:'Lamb',unit:'KG',unit_cost:45,quantity:3};
  expect(clearPurchaseProductForFilter(line,'supplier_id','new')).toMatchObject({supplier_id:'new',category:'',category_id:'',subcategory_id:'',brand:'',product_id:'',product_name:'',unit:'',unit_cost:0,quantity:3});
  expect(clearPurchaseProductForFilter(line,'supplier_id','old')).toEqual(line);
 });
 it('uses the per-line supplier, not a global category fallback, and exposes error retry',()=>{
  const code=readFileSync('src/components/purchases/PurchaseInvoiceForm.jsx','utf8');
  expect(code).toContain("multiSupplierMode ? item.supplier_id : supplierId");
  expect(code).toContain("usePurchaseProductsByCategory('',itemSupplierId,'')");
  expect(code).toContain('itemSupplierId ? scopedCategories.categories.map');
  expect(code).toContain('itemSupplierId?scopedCategories.subcategories');
  expect(code).toContain('categoryPending||categoryFailed');
  expect(code).toContain('retrySupplierCatalog()');
 });
});
