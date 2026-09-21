import RestaurantFoodImport,{foodImportCopy} from './RestaurantFoodImport';
import {customizationCopy} from '@/lib/restaurantCustomization';
import RestaurantSalesCategories from './RestaurantSalesCategories';
import RestaurantMenuGroupEditor from './RestaurantMenuGroupEditor';
import {servingCopy,touchCopy} from '@/lib/restaurantServingOptions';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Package, Plus, Pencil, RefreshCw } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useRole } from '@/lib/RoleContext';
import { restaurantRpc, restaurantProductName } from '@/lib/restaurantPOS';
import { restaurantProductCopy } from '@/lib/restaurantProducts';
import { restaurantCopy } from '@/components/restaurant-pos/copy';
import { Setup, panel, input, button, primary } from '@/pages/restaurant/RestaurantPOS';

export default function RestaurantProductWorkspace({rawMaterials}) {
 const {activeRestaurant,branches=[]}=useTenant();
 const {lang,formatMoney}=useLanguage();
 const {can,role}=useRole();
 const labels=restaurantProductCopy(lang);const serving=servingCopy(lang);
 const [params,setParams]=useSearchParams();
 const raw=params.get('product_view')==='raw';
 const [choice,setChoice]=useState('');
 const branch=branches.some(b=>b.id===choice)?choice:branches[0]?.id||'';
 const tenant=activeRestaurant?.id;
 const manage=['owner','manager'].includes(role)&&Boolean(can.uploadSales);
 const [search,setSearch]=useState('');
 const [editing,setEditing]=useState(null);
 const [categoryOpen,setCategoryOpen]=useState(false);
 const [importOpen,setImportOpen]=useState(false);
 const [groupEditing,setGroupEditing]=useState(null);const touch=touchCopy(lang);
 const qc=useQueryClient();
 const q=useQuery({queryKey:['restaurant-menu-catalog',tenant,branch],enabled:Boolean(tenant&&branch&&manage&&!raw),
  queryFn:()=>restaurantRpc('pos_catalog',{p_restaurant_id:tenant,p_branch_id:branch,p_search:''})});
 const menu=(q.data?.menu||[]).filter(m=>[m.name,m.name_ar,m.name_fa,m.category].join(' ').toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 const refresh=async()=>{await Promise.all([qc.invalidateQueries({queryKey:['restaurant-menu-catalog']}),qc.invalidateQueries({queryKey:['restaurant-pos']}),qc.invalidateQueries({queryKey:['restaurant-pos-setup']}),qc.invalidateQueries({queryKey:['products']})]);};
 return <main className="space-y-4 pb-24" dir={lang==='en'?'ltr':'rtl'}>
  <header className={panel}>
   <h1 className="text-2xl font-black">{labels.title}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{labels.hint}</p>
   <nav className="mt-4 grid grid-cols-2 gap-2" aria-label={labels.title}>
    {[[false,labels.menu,ChefHat],[true,labels.raw,Package]].map(([isRaw,label,Icon])=><button type="button" key={label} className={raw===isRaw?primary:button} aria-pressed={raw===isRaw} onClick={()=>{setEditing(null);setGroupEditing(null);setCategoryOpen(false);setParams(prev=>{const next=new URLSearchParams(prev);next.set('product_view',isRaw?'raw':'menu');return next;});}}><Icon size={20}/>{label}</button>)}
   </nav>
  </header>
  {raw?rawMaterials:<>
   <section className={panel}>
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold">{labels.branch}<select className={input} value={branch} onChange={e=>{setChoice(e.target.value);setEditing(null);setGroupEditing(null);setCategoryOpen(false);}}><option value="" disabled>{labels.choose}</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name||b.label}</option>)}</select></label><label className="grid gap-2 text-sm font-bold">{labels.search}<input className={input} type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
    <div className="mt-4 flex flex-wrap gap-2">{manage&&<button type="button" className={primary} disabled={!branch} onClick={()=>setEditing({})}><Plus size={18}/>{labels.add}</button>}<>{manage&&<button type="button" className={button} disabled={!branch||!q.data} onClick={()=>setGroupEditing([])}><Plus size={18}/>{customizationCopy(lang).new}</button>}</><>{manage&&<button type="button" className={button} disabled={!branch} onClick={()=>setCategoryOpen(true)}>{touch.manage}</button>}</><>{manage&&<button type="button" className={button} disabled={!branch||!q.data||q.isFetching} onClick={()=>setImportOpen(true)}>{foodImportCopy(lang).title}</button>}</><Link className={button} to="/restaurant/pos">{labels.pos}</Link><button type="button" aria-label="Refresh" className={button} disabled={q.isFetching} onClick={()=>void refresh()}><RefreshCw size={18}/></button></div>
   </section>
   {q.error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{q.error.message}</p>}
   {q.isLoading&&manage&&branch&&<p role="status" className={panel}>{labels.loading}</p>}
   {!manage&&<p className={panel}>{labels.pos}: <Link className="text-blue-600 underline" to="/restaurant/pos">{labels.menu}</Link></p>}
   {manage&&!q.isLoading&&!q.error&&<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{menu.map(m=><article key={m.id} className={panel}>
    {m.image_url&&/^https:\/\//.test(m.image_url)?<img src={m.image_url} alt="" loading="lazy" className="mb-3 h-40 w-full rounded-xl object-cover"/>:<div className="mb-3 flex h-32 items-center justify-center rounded-xl bg-blue-50 text-blue-500"><ChefHat size={40}/></div>}
    <h2 className="text-lg font-black">{restaurantProductName(m,lang)}</h2><p className="mt-1 text-sm text-slate-500">{m.category} · {m.station}</p>
    <p className="my-3 text-xl font-black text-blue-600">{formatMoney(m.price)}</p>
    <div className="mb-4 flex flex-wrap gap-2 text-xs font-bold"><span className={m.active?'rounded-full bg-emerald-50 px-3 py-2 text-emerald-700':'rounded-full bg-slate-100 px-3 py-2 text-slate-600'}>{m.active?labels.active:labels.inactive}</span><span className={m.stock_mode==='recipe'?'rounded-full bg-blue-50 px-3 py-2 text-blue-700':'rounded-full bg-amber-50 px-3 py-2 text-amber-800'}>{m.stock_mode==='recipe'?labels.recipe:labels.untracked}</span></div>
    {m.option_group&&<p className="mb-3 text-sm text-blue-600">{m.option_group} · {m.variant_options?.length?m.variant_options.map(o=>o.value).join(' · '):serving[m.option_key]}</p>}
    {m.option_group&&<button type="button" className={button+' mb-2 w-full'} onClick={()=>setGroupEditing((q.data?.menu||[]).filter(v=>v.option_group===m.option_group))}><Pencil size={16}/>{touch.edit}</button>}
    <button type="button" className={button+' w-full'} onClick={()=>m.variant_options?.length?setGroupEditing((q.data?.menu||[]).filter(v=>v.option_group===m.option_group)):setEditing(m)}><Pencil size={16}/>{labels.edit}</button>
   </article>)}</div>}
   {manage&&!q.isLoading&&!q.error&&!menu.length&&<p className={panel}>{labels.empty}</p>}
   <p className="px-2 text-sm leading-6 text-slate-500">{labels.rawConflict}</p>
  </>}
  {importOpen&&branch&&manage&&!raw&&<RestaurantFoodImport key={tenant+':'+branch+':import'} tenant={tenant} branch={branch} catalog={q.data} lang={lang} close={()=>setImportOpen(false)} refresh={refresh}/>}
  {categoryOpen&&branch&&manage&&!raw&&<RestaurantSalesCategories key={tenant+':'+branch} tenant={tenant} branch={branch} lang={lang} close={()=>setCategoryOpen(false)} refresh={refresh}/>}
  {groupEditing&&branch&&manage&&!raw&&<RestaurantMenuGroupEditor key={tenant+':'+branch+':group'} tenant={tenant} branch={branch} initial={groupEditing} catalog={q.data} reload={q.refetch} refresh={refresh} close={()=>setGroupEditing(null)}/>}
  {editing&&branch&&manage&&!raw&&<Setup key={tenant+':'+branch+':'+(editing.id||editing.option_key||'new')} tenant={tenant} branch={branch} c={restaurantCopy(lang)} initial={editing} menuOnly close={()=>setEditing(null)} refresh={refresh}/>}
 </main>;
}

export function RawMaterialCatalog({products,onEdit,onAdd,onManageCategories,onManageUnits,money}) {
 const {lang}=useLanguage();const labels=restaurantProductCopy(lang);const [search,setSearch]=useState('');
 const matches=products.filter(p=>[p.name,p.name_ar,p.name_fa,p.sku,p.product_id].join(' ').toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 return <section className={panel}>
  <h2 className="text-xl font-black">{labels.materials}</h2><p className="my-2 text-sm text-slate-500">{labels.materialHint}</p>
  <div className="my-4 flex flex-wrap gap-2"><button className={primary} onClick={onAdd}><Plus size={18}/>{labels.materials}</button><Link className={button} to="/purchase-orders">{labels.purchase}</Link><button className={button} onClick={onManageCategories}>{restaurantCopy(lang).category}</button><button className={button} onClick={onManageUnits}>{lang==='ar'?'الوحدات':lang==='fa'?'واحدها':'Units'}</button></div>
  <input className={input} type="search" aria-label={labels.rawSearch} placeholder={labels.rawSearch} value={search} onChange={e=>setSearch(e.target.value)}/>
  <div className="mt-4 divide-y">{matches.slice(0,200).map(p=><div className="flex flex-wrap items-center justify-between gap-3 py-4" key={p.id}><div><strong>{restaurantProductName(p,lang)}</strong><p className="text-sm text-slate-500">{p.sku||p.product_id} · {p.unit} · {money(p.default_cost||p.purchase_cost||0)}</p></div><button className={button} aria-label={labels.edit+' '+p.name} onClick={()=>onEdit(p)}><Pencil size={16}/></button></div>)}</div>
  {!matches.length&&<p className="py-8 text-center text-slate-500">{labels.rawEmpty}</p>}
  {matches.length>200&&<p className="text-sm text-slate-500">{lang==='en'?'Showing 200 results. Search to narrow the list.':lang==='ar'?'عرض ٢٠٠ نتيجة. استخدم البحث لتحديد النتائج.':'۲۰۰ نتیجه نمایش داده شد. جستجو را دقیق‌تر کنید.'}</p>}
 </section>;
}
