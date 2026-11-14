/**
 * The Purchase Invoice uses brands of products already available to this
 * particular category / subcategory / supplier. A brand never identifies a
 * supplier and must never change the payable's supplier_id.
 */
import { cleanProductBrands, normalizeProductBrand } from './productBrands.js';

export function purchaseBrandOptions(products = [], savedBrand = '', organizationBrands = []) {
  // Combine brands found in the current supplier/category with the verified
  // organization vocabulary shared with Product Master. Never use global brands.
  const mapped = (Array.isArray(products) ? products : []).map(product => product?.brand);
  const shared = Array.isArray(organizationBrands) ? organizationBrands : [];
  return cleanProductBrands([...mapped, ...shared], savedBrand);
}

export function purchaseProductsForBrand(products = [], brand = '') {
  const selected = normalizeProductBrand(brand).toLocaleLowerCase();
  if (!selected) return Array.isArray(products) ? products : [];
  return (Array.isArray(products) ? products : []).filter(product =>
    normalizeProductBrand(product?.brand).toLocaleLowerCase() === selected,
  );
}

export function purchaseProductBrand(products = [], productId, savedBrand = '') {
  const saved = normalizeProductBrand(savedBrand);
  if (saved) return saved;
  const product = (Array.isArray(products) ? products : []).find(row => String(row.id) === String(productId));
  return normalizeProductBrand(product?.brand);
}

/** Clear obsolete product/price whenever category, supplier or brand changes. */
export function clearPurchaseProductForFilter(item, field, value) {
  const oldValue = field === 'brand' ? normalizeProductBrand(item.brand) : item[field];
  const nextValue = field === 'brand' ? normalizeProductBrand(value) : value;
  const updated = { ...item, [field]: nextValue };
  if (oldValue !== nextValue) {
    updated.product_id = '';
    updated.product_name = '';
    updated.unit = '';
    updated.unit_cost = 0;
    if (field === 'category_id') {
      updated.subcategory_id = '';
      updated.brand = '';
    } else if (field === 'subcategory_id' || field === 'supplier_id') {
      updated.brand = '';
    }
  }
  return updated;
}

export function selectPurchaseProduct(item, product) {
  if (!product?.id) return item;
  return {
    ...item,
    product_id: product.id,
    product_name: product.name || '',
    brand: normalizeProductBrand(product.brand),
    unit: product.unit || item.unit,
    // A defined zero price is valid and should not inherit a prior product's cost.
    unit_cost: product.default_cost ?? product.purchase_cost ?? 0,
  };
}
