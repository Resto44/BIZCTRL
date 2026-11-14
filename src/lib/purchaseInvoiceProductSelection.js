import {purchaseProductsForBrand} from './purchaseInvoiceBrands.js';

/** A brand, price, and category do not uniquely identify a product. */
export function firstIncompletePurchaseProductLine(items = []) {
 if (!Array.isArray(items)) return null;
 const index=items.findIndex(item=>!item?.product_id && !String(item?.product_name||'').trim());
 return index<0?null:{index,item:items[index]};
}

/**
 * Auto-select only when the current tenant/category/supplier-filtered product
 * list contains exactly one product matching the chosen brand. Never guess a
 * product from a shared brand label or from a different catalog.
 */
export function uniquePurchaseProductForBrand(products = [], brand = '') {
 const matches=purchaseProductsForBrand(products,brand);
 return brand && matches.length===1 ? matches[0] : null;
}
