/**
 * The Purchase Invoice uses brands of products already available to this
 * particular category / subcategory / supplier. A brand never identifies a
 * supplier and must never change the payable's supplier_id.
 */
import { cleanProductBrands, normalizeProductBrand } from './productBrands.js';

export function purchaseBrandOptions(products = [], savedBrand = '') {
  const mapped = (Array.isArray(products) ? products : []).map(product => product?.brand);
  return cleanProductBrands(mapped, savedBrand);
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
    category_id: product.category_id || item.category_id || '',
    subcategory_id: product.subcategory_id || item.subcategory_id || '',
    brand: normalizeProductBrand(product.brand),
    unit: product.unit || item.unit,
    // A defined zero price is valid and should not inherit a prior product's cost.
    unit_cost: product.default_cost ?? product.purchase_cost ?? 0,
  };
}

/** No implicit fallback: each filter applies on the same tenant-scoped query.
 * Paginate so a brand is not lost beyond the default API row limit. */
export async function fetchScopedPurchaseProducts(db, filters) {
 if (!filters?.restaurant_id || (!filters.category_id && !filters.supplier_id)) return [];
 const rows=[];
 for(let offset=0;;offset+=500) {
  let q=db.from('products').select('id,name,name_en,name_ar,name_fa,sku,barcode,brand,unit,default_cost,purchase_cost,category_id,subcategory_id,supplier_id,restaurant_id,restaurant_product_type,is_active,status');
  for(const [key,value] of Object.entries(filters))if(value)q=q.eq(key,value);
  const {data,error}=await q.order('id').range(offset,offset+499);
  if(error)throw error;
  if(!Array.isArray(data))throw new Error('Invalid product response');
  rows.push(...data.filter(p=>p.is_active!==false&&!['inactive','discontinued'].includes(p.status)));
  if(data.length<500)break;
 }
 return rows.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
}
export function searchPurchaseProducts(products, search) {
 const q=normalizeProductBrand(search).toLocaleLowerCase();
 return (products||[]).filter(p=>!q||[p.name,p.name_en,p.name_ar,p.name_fa,p.sku,p.barcode].some(v=>normalizeProductBrand(v).toLocaleLowerCase().includes(q)));
}
