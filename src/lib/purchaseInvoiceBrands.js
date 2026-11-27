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
    } else if (field === 'supplier_id') {
      updated.category_id = '';
      updated.category = '';
      updated.subcategory_id = '';
      updated.brand = '';
    } else if (field === 'subcategory_id') {
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
export async function fetchAlternateSupplierProductIds(db,restaurantId,supplierId) {
 if(!restaurantId||!supplierId)return [];
 const ids=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await db.from('product_alternate_suppliers').select('product_id').eq('restaurant_id',restaurantId).eq('supplier_id',supplierId).order('product_id').range(offset,offset+499);
  if(error)throw error;
  if(!Array.isArray(data))throw Error('Invalid supplier catalog response');
  ids.push(...data.map(r=>r.product_id));
  if(data.length<500)break;
 }
 return ids;
}
export async function fetchScopedPurchaseProducts(db, filters, alternateIds=[]) {
 if (!filters?.restaurant_id || (!filters.category_id && !filters.supplier_id)) return [];
 const rows=[];
 const read=async(scope,ids)=>{
 for(let offset=0;;offset+=500) {
  let q=db.from('products').select('id,name,name_en,name_ar,name_fa,sku,barcode,brand,unit,default_cost,purchase_cost,category_id,subcategory_id,supplier_id,restaurant_id,restaurant_product_type,is_active,status');
  for(const [key,value] of Object.entries(scope))if(value)q=q.eq(key,value);
  if(ids)q=q.in('id',ids);
  const {data,error}=await q.order('id').range(offset,offset+499);
  if(error)throw error;
  if(!Array.isArray(data))throw new Error('Invalid product response');
  rows.push(...data.filter(p=>p.is_active!==false&&!['inactive','discontinued'].includes(p.status)));
  if(data.length<500)break;
 }
 };
 await read(filters);
 if(filters.supplier_id&&alternateIds.length){
  const {supplier_id,...scope}=filters;
  for(let i=0;i<alternateIds.length;i+=100)await read(scope,alternateIds.slice(i,i+100));
 }
 return [...new Map(rows.map(p=>[p.id,p])).values()].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
}
export function searchPurchaseProducts(products, search) {
 const q=normalizeProductBrand(search).toLocaleLowerCase();
 return (products||[]).filter(p=>!q||[p.name,p.name_en,p.name_ar,p.name_fa,p.sku,p.barcode].some(v=>normalizeProductBrand(v).toLocaleLowerCase().includes(q)));
}

/** Brand discovery is independent of supplier eligibility; only the strict
 * product result may be used to select an invoice item. */
export function purchaseBrandDiscovery({categoryProducts=[],supplierProducts=[],masterBrands=[],categorySelected=false,savedBrand='' }={}) {
 const archived=new Set(masterBrands.filter(r=>r.is_active===false).map(r=>normalizeProductBrand(r.brand).toLocaleLowerCase()));
 const names=[...categoryProducts,...supplierProducts].map(p=>p.brand);
 if(!categorySelected)names.push(...masterBrands.filter(r=>r.is_active!==false).map(r=>r.brand));
 return cleanProductBrands(names.filter(b=>!archived.has(normalizeProductBrand(b).toLocaleLowerCase())),savedBrand);
}
export function unassignedPurchaseProducts(categoryProducts=[],brand='') {
 return purchaseProductsForBrand(categoryProducts,brand).filter(p=>!p.supplier_id);
}

/** Derive category choices from the same eligible supplier products used in
 * purchase selection. Only actual category_id values are selectable; a child
 * stored as subcategory_id belongs in the separate subcategory control. */
export function supplierPurchaseCategoryOptions(categories=[],products=[],categoryId='') {
 const active=(categories||[]).filter(c=>c.is_active!==false);
 const categoryIds=new Set((products||[]).map(p=>p.category_id).filter(Boolean));
 const subIds=new Set((products||[]).filter(p=>p.category_id===categoryId).map(p=>p.subcategory_id).filter(Boolean));
 return {
  categories:active.filter(c=>categoryIds.has(c.id)),
  subcategories:active.filter(c=>c.parent_id===categoryId&&subIds.has(c.id)),
 };
}
