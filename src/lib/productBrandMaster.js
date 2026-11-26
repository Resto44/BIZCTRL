import { normalizeProductBrand } from './productBrands';

export const brandKey = value => normalizeProductBrand(value).toLocaleLowerCase('en-US');
export const brandLabel = (row,lang) => row?.['name_'+lang] || row?.name_en || row?.brand || '';
export function mergeBrandMaster(registered=[],legacy=[]) {
  const map=new Map();
  for(const brand of legacy) if(brandKey(brand)) map.set(brandKey(brand),{brand,name_en:brand,is_active:true});
  for(const row of registered) if(brandKey(row.brand)) map.set(brandKey(row.brand),row);
  return [...map.values()].sort((a,b)=>brandLabel(a,'en').localeCompare(brandLabel(b,'en')));
}
export function brandMatches(row,query) {
  const q=brandKey(query);
  return !q || [row.brand,row.name_en,row.name_ar,row.name_fa].some(v=>brandKey(v).includes(q));
}
export function brandMasterPayload(form) {
  const values=Object.fromEntries(['name_en','name_ar','name_fa'].map(k=>[k,normalizeProductBrand(form[k])]));
  if(Object.values(values).some(v=>!v||v.length>120)) throw new Error('BRAND_NAMES_REQUIRED');
  return values;
}
export async function fetchBrandMaster(db,restaurantId) {
  if(!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(restaurantId||'')) throw new Error('Missing business');
  const rows=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await db.from('product_brand_master').select('id,brand,name_en,name_ar,name_fa,is_active').eq('restaurant_id',restaurantId).order('id').range(offset,offset+499);
    if(error)throw error;
    if(!Array.isArray(data))throw new Error('Invalid brand response');
    rows.push(...data);if(data.length<500)return rows;
  }
}
export async function saveBrandMaster(db,restaurantId,form) {
  const names=brandMasterPayload(form);
  const payload={...names,is_active:form.is_active!==false};
  const query=form.id
    ? db.from('product_brand_master').update(payload).eq('restaurant_id',restaurantId).eq('id',form.id)
    : db.from('product_brand_master').insert({...payload,restaurant_id:restaurantId,brand:normalizeProductBrand(form.brand||names.name_en)});
  const {data,error}=await query.select('id,brand,name_en,name_ar,name_fa,is_active').single();
  if(error)throw error;
  if(!data?.id)throw new Error('Brand save not verified');
  return data;
}
