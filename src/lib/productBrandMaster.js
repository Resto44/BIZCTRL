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
    const {data,error}=await db.from('product_brand_master').select('id,brand,name_en,name_ar,name_fa,is_active,image_url,created_at').eq('restaurant_id',restaurantId).order('id').range(offset,offset+499);
    if(error)throw error;
    if(!Array.isArray(data))throw new Error('Invalid brand response');
    rows.push(...data);if(data.length<500)return rows;
  }
}
export async function saveBrandMaster(db,restaurantId,form) {
  const payload=form.id&&form.statusOnly?{is_active:form.is_active!==false}:{...brandMasterPayload(form),is_active:form.is_active!==false};
  if(!form.statusOnly && Object.prototype.hasOwnProperty.call(form,'image_url')) payload.image_url=normalizeBrandImageUrl(form.image_url);
  const query=form.id
    ? db.from('product_brand_master').update(payload).eq('restaurant_id',restaurantId).eq('id',form.id)
    : db.from('product_brand_master').insert({...payload,restaurant_id:restaurantId,brand:normalizeProductBrand(form.brand||payload.name_en)});
  const {data,error}=await query.select('id,brand,name_en,name_ar,name_fa,is_active,image_url,created_at').single();
  if(error)throw error;
  if(!data?.id)throw new Error('Brand save not verified');
  return data;
}

export function normalizeBrandImageUrl(value) {
  const raw=typeof value==='string'?value.trim():'';
  if(!raw)return null;
  if(raw.length>2048 || !/^https:\/\/[^/@\s]+(?:[/?#][^\s]*)?$/.test(raw) || raw.includes('\\'))throw new Error('BRAND_IMAGE_URL_INVALID');
  const url=new URL(raw);
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password)throw new Error('BRAND_IMAGE_URL_INVALID');
  return raw;
}
export function safeBrandImageUrl(value) {
  try{return normalizeBrandImageUrl(value)}catch{return null}
}
// Counts are product master records, not quantity, turnover or revenue.
export async function fetchBrandUsage(db,restaurantId) {
  if(!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(restaurantId||''))throw new Error('Missing business');
  const result={total:0,unbranded:0,byBrand:{}};
  const counts=new Map();
  for(let offset=0;;offset+=500){
    const {data,error}=await db.from('products').select('id,brand').eq('restaurant_id',restaurantId).order('id').range(offset,offset+499);
    if(error)throw error;
    if(!Array.isArray(data))throw new Error('Invalid product response');
    for(const row of data){
      result.total++;
      const key=brandKey(row.brand);
      if(!key){result.unbranded++;continue;}
      counts.set(key,(counts.get(key)||0)+1);
    }
    if(data.length<500){result.byBrand=Object.fromEntries(counts);return result;}
  }
}
export function brandCatalogAnalytics(rows=[],usage=null,now=new Date(),months=6) {
  const end=new Date(now);
  const trend=Array.from({length:months},(_,i)=>{
    const d=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()-months+1+i,1));
    return {month:d.toISOString().slice(0,7),count:0};
  });
  const buckets=new Map(trend.map(x=>[x.month,x]));
  let active=0,archived=0,legacy=0,withLogo=0;
  for(const row of rows){
    if(!row.id)legacy++;else if(row.is_active===false)archived++;else active++;
    if(safeBrandImageUrl(row.image_url))withLogo++;
    if(row.id&&row.created_at){
      const stamp=new Date(row.created_at);
      if(Number.isFinite(stamp.getTime())&&stamp<=end){
        const b=buckets.get(stamp.toISOString().slice(0,7));if(b)b.count++;
      }
    }
  }
  const count=row=>Object.hasOwn(usage?.byBrand||{},brandKey(row.brand))?usage.byBrand[brandKey(row.brand)]:0;
  const ranked=usage?[...rows].sort((a,b)=>count(b)-count(a)||brandLabel(a,'en').localeCompare(brandLabel(b,'en'))).filter(r=>count(r)>0).slice(0,5):[];
  return {total:rows.length,active,archived,legacy,withLogo,trend,ranked,count,unbranded:usage?.unbranded??null,products:usage?.total??null};
}
export function filterBrandCatalog(rows,{query='',status='all',logo='all',usage='all',sort='name',lang='en',counts=null}={}) {
  const count=row=>Object.hasOwn(counts||{},brandKey(row.brand))?counts[brandKey(row.brand)]:0;
  return rows.filter(r=>brandMatches(r,query)
    && (status==='all'||(status==='legacy'?!r.id:status==='archived'?r.id&&r.is_active===false:r.id&&r.is_active!==false))
    && (logo==='all'||Boolean(safeBrandImageUrl(r.image_url))===(logo==='yes'))
    && (usage==='all'||(counts!=null&&(usage==='used'?count(r)>0:count(r)===0))))
    .sort((a,b)=>(sort==='products'&&counts?count(b)-count(a):sort==='recent'?String(b.created_at||'').localeCompare(String(a.created_at||'')):0)||brandLabel(a,lang).localeCompare(brandLabel(b,lang)));
}
