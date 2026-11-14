// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizePurchaseLine, calcInvoiceTotals, groupPurchaseLinesBySupplier } from '../src/lib/procurementEngine.js';
import {
  purchaseBrandOptions, purchaseProductsForBrand, purchaseProductBrand,
  clearPurchaseProductForFilter, selectPurchaseProduct,
} from '../src/lib/purchaseInvoiceBrands.js';

const supplierA='supplier-A';
const supplierB='supplier-B';
const riceCategory='rice';
const products=[
  { id:'1',name:'سانيتا',category_id:riceCategory,brand:'Sanita',supplier_id:supplierA,unit:'carton',default_cost:125 },
  { id:'2',name:'أرز بخاري',category_id:riceCategory,brand:' سنوايت ',supplier_id:supplierA,unit:'bag',default_cost:289 },
  { id:'3',name:'Other product',category_id:riceCategory,brand:'SANITA',supplier_id:supplierA,unit:'bag',default_cost:0 },
  { id:'4',name:'Other supplier rice',category_id:riceCategory,brand:'OtherBrand',supplier_id:supplierB,unit:'bag',default_cost:999 },
];

describe('Purchase Invoice brand selector ERP',()=>{
  it('shows saved brands from the same tenant Product Master and matching catalog, deduplicated',()=>{
    const supplierProducts=products.filter(p=>p.supplier_id===supplierA);
    expect(purchaseBrandOptions(supplierProducts,'',['Sanita','PepSI',' pepsi ','کاسه'])).toEqual(expect.arrayContaining(['Sanita','PepSI','سنوايت','کاسه']));
    expect(purchaseBrandOptions(supplierProducts).filter(name=>name.toLowerCase()==='sanita')).toHaveLength(1);
    expect(purchaseBrandOptions([], 'Legacy brand')).toEqual(['Legacy brand']);
    expect(purchaseBrandOptions([], '', [])).toEqual([]);
  });
  it('filters Product IDs only inside the authorized category/supplier catalog',()=>{
    const onlyA=products.filter(p=>p.supplier_id===supplierA && p.category_id===riceCategory);
    expect(purchaseProductsForBrand(onlyA,' sanita ').map(p=>p.id)).toEqual(['1','3']);
    expect(purchaseProductsForBrand(onlyA,'OtherBrand')).toEqual([]);
    expect(purchaseProductsForBrand(onlyA).map(p=>p.id)).toEqual(['1','2','3']);
  });
  it('preselects brand on saved draft edit and on newly selected product',()=>{
    const old={_id:'line-1',category_id:riceCategory,product_id:'1',product_name:'سانيتا',unit:'carton',unit_cost:125,quantity:1,discount:0,tax:0};
    expect(purchaseProductBrand(products,old.product_id,old.brand)).toBe('Sanita');
    expect(purchaseProductBrand(products,old.product_id,'Other Brand')).toBe('Other Brand');
    const selected=normalizePurchaseLine(selectPurchaseProduct({...old,product_id:'',product_name:'',unit_cost:0}, products[1]));
    expect(selected).toMatchObject({product_id:'2',product_name:'أرز بخاري',brand:'سنوايت',unit:'bag',unit_cost:289,line_total:289});
    const zero=selectPurchaseProduct({...old,unit_cost:289},products[2]);
    expect(zero.unit_cost).toBe(0);
    expect(zero.brand).toBe('SANITA');
  });
  it('resets stale product and price after brand, category, subcategory or supplier changes',()=>{
    const line={ _id:'line-1',category_id:riceCategory,subcategory_id:'sub-1',brand:'Sanita',supplier_id:supplierA,product_id:'1',product_name:'سانيتا',unit:'carton',unit_cost:125,quantity:2 };
    const brandChange=clearPurchaseProductForFilter(line,'brand','سنوايت');
    expect(brandChange).toMatchObject({brand:'سنوايت',product_id:'',product_name:'',unit:'',unit_cost:0,category_id:riceCategory,quantity:2});
    expect(clearPurchaseProductForFilter(line,'subcategory_id','sub-2')).toMatchObject({subcategory_id:'sub-2',brand:'',product_id:'',unit_cost:0});
    expect(clearPurchaseProductForFilter(line,'supplier_id',supplierB)).toMatchObject({supplier_id:supplierB,brand:'',product_id:'',unit_cost:0});
    expect(clearPurchaseProductForFilter(line,'category_id','different')).toMatchObject({category_id:'different',subcategory_id:'',brand:'',product_id:'',unit_cost:0});
    // Selecting the unchanged brand never clears an existing priced line.
    expect(clearPurchaseProductForFilter(line,'brand','Sanita').product_id).toBe('1');
  });
  it('persists brand as line metadata but never treats it as a supplier or adds a monetary charge',()=>{
    const line=normalizePurchaseLine({...selectPurchaseProduct({quantity:2,discount:0,tax:0},products[0]),supplier_id:supplierA});
    expect(line.brand).toBe('Sanita');
    expect(line.line_total).toBe(250);
    expect(calcInvoiceTotals([line]).grandTotal).toBe(250);
    const groups=groupPurchaseLinesBySupplier([line],[{id:supplierA,name:'Supplier A'}]);
    expect(groups[0].items[0].brand).toBe('Sanita');
    expect(groups[0].supplierId).toBe(supplierA);
    expect(groups[0].totals.grandTotal).toBe(250);
  });
  it('renders a real Brand dropdown before Product on every purchase invoice line',()=>{
    const code=readFileSync('src/components/purchases/PurchaseInvoiceForm.jsx','utf8');
    const brand=code.indexOf('data-testid="purchase-line-brand"');
    const product=code.indexOf('>Product *</Label>',brand);
    expect(brand).toBeGreaterThan(-1);
    expect(product).toBeGreaterThan(brand);
    expect(code).toContain('aria-label="Select product brand"');
    expect(code).toContain("queryKey: ['product-brand-choices', restaurantId]");
    expect(code).toContain('fetchProductBrandChoices(supabase, restaurantId)');
    expect(code).toContain('const visibleProducts = purchaseProductsForBrand(categoryProducts, selectedBrand)');
    expect(code).toContain("updateItem(item._id, 'selected_product', product)");
    expect(code).toContain('return normalizePurchaseLine(clearPurchaseProductForFilter(item, field, value))');
    expect(code).toContain('return normalizePurchaseLine(selectPurchaseProduct(item, value))');
    expect(code).toContain('key={item._id}');
    expect(code).toContain('multiSupplierMode={multiSupplierMode}');
    // The invoice's payable and supplier selection remain unchanged.
    expect(code).toContain('supplierId={form.supplier_id}');
  });
});
