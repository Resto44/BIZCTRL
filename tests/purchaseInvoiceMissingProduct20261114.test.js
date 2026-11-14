// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {firstIncompletePurchaseProductLine,uniquePurchaseProductForBrand} from '../src/lib/purchaseInvoiceProductSelection.js';
import {selectPurchaseProduct,clearPurchaseProductForFilter} from '../src/lib/purchaseInvoiceBrands.js';
import {normalizePurchaseLine,calcInvoiceTotals} from '../src/lib/procurementEngine.js';

const form=readFileSync('src/components/purchases/PurchaseInvoiceForm.jsx','utf8');
const catalogHook=readFileSync('src/hooks/usePurchaseProductsByCategory.js','utf8');
const fixture=[
 {id:'p1',restaurant_id:'tenant-one',category_id:'rice',supplier_id:'a',brand:'رز هندي',name:'أرز هندي 10 كغ',unit:'bag',default_cost:76},
 {id:'p2',restaurant_id:'tenant-one',category_id:'rice',supplier_id:'b',brand:'Different',name:'أرز بخاري',unit:'bag',default_cost:87},
 {id:'p3',restaurant_id:'tenant-one',category_id:'rice',supplier_id:'b',brand:'Same',name:'أرز صنف 1'},
 {id:'p4',restaurant_id:'tenant-one',category_id:'rice',supplier_id:'b',brand:'Same',name:'أرز صنف 2'},
];

describe('Purchase Invoice cannot post a priced, brand-only empty product line',()=>{
 it('finds the precise incomplete item even if other items have valid prices',()=>{
  const items=[
   {_id:'first',brand:'رز هندي',unit_cost:76,quantity:1,product_id:'',product_name:''},
   {_id:'second',product_id:'p2',product_name:'أرز بخاري',unit_cost:87,quantity:1},
  ];
  expect(calcInvoiceTotals(items).grandTotal).toBe(163);
  expect(firstIncompletePurchaseProductLine(items)).toEqual({index:0,item:items[0]});
  expect(firstIncompletePurchaseProductLine(items.slice(1))).toBeNull();
  expect(firstIncompletePurchaseProductLine([{product_name:'  أرز يدوي  ',product_id:''}])).toBeNull();
  expect(firstIncompletePurchaseProductLine([{product_id:'p1',product_name:''}])).toBeNull();
 });
 it('auto-picks a brand product only if exactly one real scoped product matches',()=>{
  expect(uniquePurchaseProductForBrand(fixture,'رز هندي')).toEqual(fixture[0]);
  expect(uniquePurchaseProductForBrand(fixture,'Same')).toBeNull();
  expect(uniquePurchaseProductForBrand(fixture,'Unknown')).toBeNull();
  expect(uniquePurchaseProductForBrand(fixture,'')).toBeNull();
  const line=normalizePurchaseLine(selectPurchaseProduct(
   {quantity:1,unit_cost:0,product_id:'',product_name:'',discount:0,tax:0},fixture[0]));
  expect(line).toMatchObject({product_id:'p1',product_name:'أرز هندي 10 كغ',brand:'رز هندي',unit_cost:76,line_total:76});
 });
 it('changing a category, brand or supplier still clears stale selected product ID and price',()=>{
  const line={product_id:'p1',product_name:'أرز هندي 10 كغ',brand:'رز هندي',category_id:'rice',unit_cost:76};
  expect(clearPurchaseProductForFilter(line,'brand','Other')).toMatchObject({product_id:'',product_name:'',unit_cost:0});
  expect(clearPurchaseProductForFilter(line,'supplier_id','b')).toMatchObject({product_id:'',product_name:'',unit_cost:0});
 });
 it('shows the exact missing row and preserves invoice before any finance write for draft and post',()=>{
  expect(form).toContain('firstIncompletePurchaseProductLine(items)');
  const marker=form.indexOf('const invalid = firstIncompletePurchaseProductLine(items)');
  const single=form.indexOf('if (multiSupplierMode) return handleSupplierBatchSubmit(mode)',marker);
  const persistence=form.indexOf('saveInvoice: () => isEdit',single);
  expect(marker).toBeGreaterThan(0);
  expect(single).toBeGreaterThan(marker);
  expect(persistence).toBeGreaterThan(single);
  expect(form).toContain('setShowLineItems(true)');
  expect(form).toContain('setInvalidLineId(invalid.item._id)');
  expect(form).toContain('scrollIntoView({behavior:\'smooth\',block:\'center\'})');
  expect(form).toContain('missingProduct={invalidLineId===item._id}');
  expect(form).toContain('Choose a product or enter its name to save this item.');
  expect(form).toContain('visibleProducts.length === 0');
  expect(form).toContain('aria-label="Select purchase product"');
  expect(form).toContain('data-testid="purchase-product-name-entry"');
 });
 it('keeps unique auto-select within the existing supplier and category product lookup',()=>{
  expect(form).toContain('const soleProduct = uniquePurchaseProductForBrand(categoryProducts, brand)');
  expect(form).toContain("if (soleProduct) updateItem(item._id, 'selected_product', soleProduct)");
  expect(catalogHook).toContain('restaurant_id: activeRestaurantId');
  expect(catalogHook).toContain('productCategoryId && { category_id: productCategoryId }');
  expect(catalogHook).toContain('return fetchCatalog(baseFilter)');
  expect(catalogHook).toContain('if (supplierProducts?.length) return supplierProducts');
  expect(catalogHook).not.toContain('base44.entities.Product.list()');
 });
});
