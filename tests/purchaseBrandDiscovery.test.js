import {describe,it,expect} from 'vitest';
import {purchaseBrandDiscovery,unassignedPurchaseProducts,purchaseProductsForBrand} from '../src/lib/purchaseInvoiceBrands';
import {readFileSync} from 'node:fs';
const category=[{id:'1',brand:'Royal Fresh',name:'Fresh Lamb',supplier_id:null},{id:'2',brand:'Royal Fresh',name:'Lamb Mince',supplier_id:null},{id:'3',brand:'Other',supplier_id:'other'}];
describe('Purchase brand discovery with unassigned imports',()=>{
 it('shows actual category brands even when selected supplier has zero products',()=>{
  const supplier=[];
  const names=purchaseBrandDiscovery({categoryProducts:category,supplierProducts:supplier,categorySelected:true});
  expect(names).toContain('Royal Fresh');
  expect(purchaseProductsForBrand(supplier,'Royal Fresh')).toEqual([]);
  expect(unassignedPurchaseProducts(category,'Royal Fresh').map(x=>x.id)).toEqual(['1','2']);
 });
 it('does not surface unrelated master brands in a selected category and hides archived brands',()=>{
  expect(purchaseBrandDiscovery({categoryProducts:category,categorySelected:true,masterBrands:[{brand:'Other',is_active:false},{brand:'Unrelated',is_active:true}]})).toEqual(['Royal Fresh']);
  expect(purchaseBrandDiscovery({masterBrands:[{brand:'Royal Fresh',is_active:true}]})).toEqual(['Royal Fresh']);
 });
 it('never uses discovery products as selectable invoice rows',()=>{
  const form=readFileSync('src/components/purchases/PurchaseInvoiceForm.jsx','utf8');
  expect(form).toContain('const visibleProducts = purchaseProductsForBrand(categoryProducts, selectedBrand)');
  expect(form).toContain("const soleProduct = uniquePurchaseProductForBrand(categoryProducts, brand)");
  expect(form).toContain('data-testid="purchase-unassigned-products"');
  expect(form).not.toContain('No brands saved for this business yet');
 });
});
