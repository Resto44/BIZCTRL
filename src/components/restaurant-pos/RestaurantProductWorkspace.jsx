import RestaurantFoodDelete,{foodDeleteCopy} from './RestaurantFoodDelete';
import {materialImportCopy} from './RestaurantMaterialImport';
import RestaurantFoodImport,{foodImportCopy} from './RestaurantFoodImport';
import {customizationCopy} from '@/lib/restaurantCustomization';
import RestaurantSalesCategories from './RestaurantSalesCategories';
import RestaurantMenuGroupEditor from './RestaurantMenuGroupEditor';
import {servingCopy,touchCopy} from '@/lib/restaurantServingOptions';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Package, Plus, Pencil, RefreshCw, Trash2, RotateCcw } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useRole } from '@/lib/RoleContext';
import { restaurantRpc, restaurantProductName } from '@/lib/restaurantPOS';
import { AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter } from '@/components/ui/alert-dialog';
import { filterRawMaterials,toggleRawMaterialSelection,selectedRawMaterials } from '@/lib/rawMaterialSelection';
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
 const [removedNotice,setRemovedNotice]=useState('');
 const [selected,setSelected]=useState([]),[showInactive,setShowInactive]=useState(false),[deleting,setDeleting]=useState(null);const del=foodDeleteCopy(lang);
 const selectionScope=tenant+':'+branch;const selectedIds=selected.filter(s=>s.scope===selectionScope).map(s=>s.id);
 const toggle=id=>setSelected(rows=>selectedIds.includes(id)?rows.filter(r=>r.id!==id):[...rows,{id,scope:selectionScope}]);
 const [editing,setEditing]=useState(null);
 // Owner mobile quick entry opens the existing POS menu-product editor.
 // Remove the one-shot URL flag so closing does not reopen the form.
 useEffect(()=>{
  if(params.get('create')!=='1'||!manage||!branch||raw)return;
  setEditing({});
  setParams(current=>{
   const next=new URLSearchParams(current);
   next.delete('create');
   return next;
  },{replace:true});
 },[params,manage,branch,raw,setParams]);
 const [categoryOpen,setCategoryOpen]=useState(false);
 const [importOpen,setImportOpen]=useState(false);
 const [groupEditing,setGroupEditing]=useState(null);const touch=touchCopy(lang);
 const qc=useQueryClient();
 const q=useQuery({queryKey:['restaurant-menu-catalog',tenant,branch],enabled:Boolean(tenant&&branch&&manage&&!raw),
  queryFn:()=>restaurantRpc('pos_catalog',{p_restaurant_id:tenant,p_branch_id:branch,p_search:''})});
 const menu=(q.data?.menu||[]).filter(m=>(showInactive||m.active)&&[m.name,m.name_ar,m.name_fa,m.category].join(' ').toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 const onRemoved=ids=>{
  qc.setQueryData(['restaurant-menu-catalog',tenant,branch],current=>current?{...current,menu:(current.menu||[]).map(m=>ids.includes(m.id)?{...m,active:false}:m)}:current);
  setShowInactive(false);setSelected([]);setDeleting(null);setRemovedNotice(del.saved+': '+ids.length);
  void refresh().catch(()=>{});
 };
 const refresh=async()=>{await Promise.all([qc.invalidateQueries({queryKey:['restaurant-menu-catalog']}),qc.invalidateQueries({queryKey:['restaurant-pos']}),qc.invalidateQueries({queryKey:['restaurant-pos-setup']}),qc.invalidateQueries({queryKey:['products']})]);};
 return <main className="space-y-4 pb-24" dir={lang==='en'?'ltr':'rtl'}>
  <header className={panel}>
   <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-black">{labels.title}</h1><Link to="/support?tab=guides&guide=restaurant-menu-product-fields" className="inline-flex min-h-11 items-center rounded-xl border border-blue-200 px-3 py-2 text-sm font-bold text-blue-700">{lang === 'ar' ? 'شرح حقول المنتجات' : lang === 'fa' ? 'راهنمای فیلدهای منو' : 'Menu fields help'}</Link></div><p className="mt-2 text-sm leading-6 text-slate-500">{labels.hint}</p>
   <nav className="mt-4 grid grid-cols-2 gap-2" aria-label={labels.title}>
    {[[false,labels.menu,ChefHat],[true,labels.raw,Package]].map(([isRaw,label,Icon])=><button type="button" key={label} className={raw===isRaw?primary:button} aria-pressed={raw===isRaw} onClick={()=>{setEditing(null);setGroupEditing(null);setCategoryOpen(false);setParams(prev=>{const next=new URLSearchParams(prev);next.set('product_view',isRaw?'raw':'menu');return next;});}}><Icon size={20}/>{label}</button>)}
   </nav>
  </header>
  {raw?rawMaterials:<>
   <section className={panel}>
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold">{labels.branch}<select className={input} value={branch} onChange={e=>{setChoice(e.target.value);setEditing(null);setGroupEditing(null);setCategoryOpen(false);}}><option value="" disabled>{labels.choose}</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name||b.label}</option>)}</select></label><label className="grid gap-2 text-sm font-bold">{labels.search}<input className={input} type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
    <div className="mt-4 flex flex-wrap gap-2">{manage&&<button type="button" className={primary} disabled={!branch} onClick={()=>setEditing({})}><Plus size={18}/>{labels.add}</button>}<>{manage&&<button type="button" className={button} disabled={!branch||!q.data} onClick={()=>setGroupEditing([])}><Plus size={18}/>{customizationCopy(lang).new}</button>}</><>{manage&&<button type="button" className={button} disabled={!branch} onClick={()=>setCategoryOpen(true)}>{touch.manage}</button>}</><>{manage&&<button type="button" className={button} disabled={!branch||!q.data||q.isFetching} onClick={()=>setImportOpen(true)}>{foodImportCopy(lang).title}</button>}</><Link className={button} to="/restaurant/pos">{labels.pos}</Link><button type="button" aria-label="Refresh" className={button} disabled={q.isFetching} onClick={()=>void refresh()}><RefreshCw size={18}/></button></div>
   </section>
   {manage&&<div className={panel+' flex flex-wrap items-center gap-3'}><label className="flex min-h-12 items-center gap-2"><input type="checkbox" checked={menu.length>0&&menu.every(m=>selectedIds.includes(m.id))} onChange={e=>setSelected(e.target.checked?menu.map(m=>({id:m.id,scope:selectionScope})):[])}/>{del.all} ({menu.length})</label><button type="button" className={button+' text-red-600'} disabled={!selectedIds.length} onClick={()=>setDeleting((q.data?.menu||[]).filter(m=>selectedIds.includes(m.id)))}>{del.selected} ({selectedIds.length})</button><label className="flex min-h-12 items-center gap-2"><input type="checkbox" checked={showInactive} onChange={e=>{setShowInactive(e.target.checked);setSelected([]);}}/>{del.show}</label></div>}
   {removedNotice&&<p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{removedNotice}</p>}
   {q.error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{q.error.message}</p>}
   {q.isLoading&&manage&&branch&&<p role="status" className={panel}>{labels.loading}</p>}
   {!manage&&<p className={panel}>{labels.pos}: <Link className="text-blue-600 underline" to="/restaurant/pos">{labels.menu}</Link></p>}
   {manage&&!q.isLoading&&!q.error&&<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{menu.map(m=><article key={m.id} className={panel}>
    {m.image_url&&/^https:\/\//.test(m.image_url)?<img src={m.image_url} alt="" loading="lazy" className="mb-3 h-40 w-full rounded-xl object-cover"/>:<div className="mb-3 flex h-32 items-center justify-center rounded-xl bg-blue-50 text-blue-500"><ChefHat size={40}/></div>}
    <label className="mb-2 flex min-h-11 items-center gap-2"><input type="checkbox" aria-label={del.select+' '+restaurantProductName(m,lang)} checked={selectedIds.includes(m.id)} onChange={()=>toggle(m.id)}/>{del.select}</label>
    <h2 className="text-lg font-black">{restaurantProductName(m,lang)}</h2><p className="mt-1 text-sm text-slate-500">{m.category} · {m.station}</p>
    <p className="my-3 text-xl font-black text-blue-600">{formatMoney(m.price)}</p>
    <div className="mb-4 flex flex-wrap gap-2 text-xs font-bold"><span className={m.active?'rounded-full bg-emerald-50 px-3 py-2 text-emerald-700':'rounded-full bg-slate-100 px-3 py-2 text-slate-600'}>{m.active?labels.active:labels.inactive}</span><span className={m.stock_mode==='recipe'?'rounded-full bg-blue-50 px-3 py-2 text-blue-700':'rounded-full bg-amber-50 px-3 py-2 text-amber-800'}>{m.stock_mode==='recipe'?labels.recipe:labels.untracked}</span></div>
    {m.option_group&&<p className="mb-3 text-sm text-blue-600">{m.option_group} · {m.variant_options?.length?m.variant_options.map(o=>o.value).join(' · '):serving[m.option_key]}</p>}
    {m.option_group&&<button type="button" className={button+' mb-2 w-full'} onClick={()=>setGroupEditing((q.data?.menu||[]).filter(v=>v.option_group===m.option_group))}><Pencil size={16}/>{touch.edit}</button>}
    <button type="button" className={button+' w-full'} onClick={()=>m.variant_options?.length?setGroupEditing((q.data?.menu||[]).filter(v=>v.option_group===m.option_group)):setEditing(m)}><Pencil size={16}/>{labels.edit}</button>
    <button type="button" className={button+' mt-2 w-full text-red-600'} onClick={()=>setDeleting([m])}>{del.remove}</button>
   </article>)}</div>}
   {manage&&!q.isLoading&&!q.error&&!menu.length&&<p className={panel}>{labels.empty}</p>}
   <p className="px-2 text-sm leading-6 text-slate-500">{labels.rawConflict}</p>
  </>}
  {deleting&&branch&&manage&&!raw&&<RestaurantFoodDelete key={selectionScope} tenant={tenant} branch={branch} items={deleting} lang={lang} close={()=>{setDeleting(null);setSelected([]);}} onRemoved={onRemoved}/>}
  {importOpen&&branch&&manage&&!raw&&<RestaurantFoodImport key={tenant+':'+branch+':import'} tenant={tenant} branch={branch} catalog={q.data} lang={lang} close={()=>setImportOpen(false)} refresh={refresh}/>}
  {categoryOpen&&branch&&manage&&!raw&&<RestaurantSalesCategories key={tenant+':'+branch} tenant={tenant} branch={branch} lang={lang} close={()=>setCategoryOpen(false)} refresh={refresh}/>}
  {groupEditing&&branch&&manage&&!raw&&<RestaurantMenuGroupEditor key={tenant+':'+branch+':group'} tenant={tenant} branch={branch} initial={groupEditing} catalog={q.data} reload={q.refetch} refresh={refresh} close={()=>setGroupEditing(null)}/>}
  {editing&&branch&&manage&&!raw&&<Setup key={tenant+':'+branch+':'+(editing.id||editing.option_key||'new')} tenant={tenant} branch={branch} c={restaurantCopy(lang)} initial={editing} menuOnly close={()=>setEditing(null)} refresh={refresh}/>}
 </main>;
}

const rawDeleteCopy=lang=>({
en:{all:'Select all matching',selected:'Selected',clear:'Clear selection',remove:'Delete (archive)',restore:'Restore',active:'Active',archived:'Archived',confirm:'Confirm selected materials',hint:'Remove from the active catalog without deleting stock, recipes or purchase history. You can restore archived items.',restoreHint:'Restore these materials to the active catalog.',cancel:'Cancel',done:'Updated materials',error:'Operation not confirmed. Refresh and retry.',more:'Show more',max:'Select at most 5,000 materials per operation.',busy:'Saving…',loading:'Loading materials…',retry:'Retry',scope:'Entire business catalog'},
ar:{all:'تحديد كل النتائج',selected:'المحدد',clear:'إلغاء التحديد',remove:'حذف (أرشفة)',restore:'استعادة',active:'نشطة',archived:'مؤرشفة',confirm:'تأكيد المواد المحددة',hint:'إزالة من الدليل النشط دون حذف المخزون أو الوصفات أو سجل المشتريات. يمكن استعادة المواد المؤرشفة.',restoreHint:'استعادة هذه المواد إلى الدليل النشط.',cancel:'إلغاء',done:'تم تحديث المواد',error:'تعذر تأكيد العملية. حدّث وحاول مجدداً.',more:'عرض المزيد',max:'حدد حتى 5000 مادة في العملية الواحدة.',busy:'جارٍ الحفظ…',loading:'جارٍ تحميل المواد…',retry:'إعادة المحاولة',scope:'دليل النشاط بالكامل'},
fa:{all:'انتخاب همه نتایج',selected:'انتخاب‌شده',clear:'لغو انتخاب',remove:'حذف (آرشیو)',restore:'بازیابی',active:'فعال',archived:'آرشیوشده',confirm:'تأیید محصولات انتخاب‌شده',hint:'حذف از کاتالوگ فعال بدون پاک کردن موجودی، دستور پخت یا سابقه خرید. محصولات آرشیوشده قابل بازیابی‌اند.',restoreHint:'این مواد به کاتالوگ فعال برمی‌گردند.',cancel:'لغو',done:'محصول به‌روزرسانی شد',error:'عملیات تأیید نشد؛ تازه‌سازی و دوباره تلاش کنید.',more:'نمایش بیشتر',max:'در هر عملیات حداکثر ۵۰۰۰ محصول انتخاب کنید.',busy:'در حال ذخیره…',loading:'در حال دریافت محصولات…',retry:'تلاش مجدد',scope:'کاتالوگ کل کسب‌وکار'}
}[lang]||rawDeleteCopy('en'));
export function RawMaterialCatalog({products,onEdit,onAdd,onManageCategories,onManageUnits,onManageBrands,onImport,money,onArchive,loading=false,loadError=false,onRetry}) {
 const {lang}=useLanguage();const labels=restaurantProductCopy(lang),d=rawDeleteCopy(lang);
 const [search,setSearch]=useState(''),[archived,setArchived]=useState(false),[selected,setSelected]=useState([]),[limit,setLimit]=useState(100),[pending,setPending]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const matches=filterRawMaterials(products,search,archived);
 const chosen=selectedRawMaterials(matches,selected);
 const all=matches.length>0&&chosen.length===matches.length;
 const blocked=busy||loading||loadError;
 const changeView=value=>{setArchived(value);setSelected([]);setLimit(100);setError('');setNotice('');};
 const ask=rows=>{if(!rows.length||blocked)return;setError('');setNotice('');if(rows.length>5000){setError(d.max);return;}setPending({rows,archive:!archived});};
 const confirm=async()=>{if(!pending||busy||!onArchive)return;setBusy(true);setError('');try{const count=await onArchive(pending.rows.map(p=>p.id),pending.archive);setNotice(d.done+': '+count);setSelected([]);setPending(null);}catch(e){setError(d.error+' '+(e.message||''));}finally{setBusy(false);}};
 return <section className={panel} dir={lang==='en'?'ltr':'rtl'}>
  <h2 className="text-xl font-black">{labels.materials}</h2><p className="my-2 text-sm text-slate-500">{labels.materialHint}</p>
  <div className="my-4 flex flex-wrap gap-2"><button type="button" className={primary} onClick={onAdd}><Plus size={18}/>{labels.materials}</button>{onImport&&<button type="button" className={button} onClick={onImport}>{materialImportCopy(lang).title}</button>}<Link className={button} to="/purchase-orders">{labels.purchase}</Link><button type="button" className={button} onClick={onManageCategories}>{restaurantCopy(lang).category}</button><button type="button" className={button} onClick={onManageUnits}>{lang==='ar'?'الوحدات':lang==='fa'?'واحدها':'Units'}</button>{onManageBrands&&<button type="button" className={button} onClick={onManageBrands}>{lang==='ar'?'العلامات التجارية':lang==='fa'?'برندها':'Brands'}</button>}</div>
  <input className={input} type="search" aria-label={labels.rawSearch} placeholder={labels.rawSearch} value={search} disabled={busy} onChange={e=>{setSearch(e.target.value);setSelected([]);setLimit(100);}}/>
  <div className="mt-3 flex flex-wrap gap-2">{[[false,d.active],[true,d.archived]].map(([v,label])=><button type="button" key={label} className={archived===v?primary:button} aria-pressed={archived===v} disabled={busy} onClick={()=>changeView(v)}>{label}</button>)}</div>
  {onArchive&&<div className="mt-3 rounded-xl border p-3 space-y-2"><p className="text-xs text-slate-500">{d.scope}</p><label className="flex min-h-11 items-center gap-2 font-semibold"><input type="checkbox" checked={all} disabled={blocked||!matches.length} onChange={e=>setSelected(e.target.checked?matches.map(p=>p.id):[])}/>{d.all} ({matches.length})</label><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold">{d.selected}: {chosen.length}</span><button type="button" className={button+' text-red-600'} disabled={blocked||!chosen.length} onClick={()=>ask(chosen)}>{archived?<RotateCcw size={16}/>:<Trash2 size={16}/>} {archived?d.restore:d.remove} ({chosen.length})</button><button type="button" className={button} disabled={blocked||!chosen.length} onClick={()=>setSelected([])}>{d.clear}</button></div></div>}
  {loading&&<p role="status" className="py-4">{d.loading}</p>}{loadError&&<p role="alert" className="py-4 text-red-700">{d.error} <button type="button" className={button} onClick={onRetry}>{d.retry}</button></p>}
  {notice&&<p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}{error&&!pending&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  {!loading&&!loadError&&<><div className="mt-4 divide-y">{matches.slice(0,limit).map(p=><div className="flex items-center gap-3 py-4" key={p.id}>{onArchive&&<label className="flex min-h-11 min-w-8 items-center justify-center"><input type="checkbox" aria-label={d.selected+' '+restaurantProductName(p,lang)} checked={selected.includes(p.id)} disabled={busy} onChange={()=>setSelected(ids=>toggleRawMaterialSelection(ids,p.id))}/></label>}<div className="min-w-0 flex-1"><strong className="break-words">{restaurantProductName(p,lang)}</strong><p className="text-sm text-slate-500">{p.sku||p.product_id} · {p.unit} · {money(p.default_cost??p.purchase_cost??0)}</p></div><div className="flex shrink-0 gap-1"><button type="button" className={button} aria-label={labels.edit+' '+p.name} disabled={busy} onClick={()=>onEdit(p)}><Pencil size={16}/></button>{onArchive&&<button type="button" className={button+' text-red-600'} aria-label={(archived?d.restore:d.remove)+' '+p.name} disabled={busy} onClick={()=>ask([p])}>{archived?<RotateCcw size={16}/>:<Trash2 size={16}/>}</button>}</div></div>)}</div>
  {!matches.length&&<p className="py-8 text-center text-slate-500">{labels.rawEmpty}</p>}{matches.length>limit&&<button type="button" className={button+' w-full'} onClick={()=>setLimit(n=>n+100)}>{d.more} ({Math.min(limit,matches.length)}/{matches.length})</button>}</>}
  <AlertDialog open={!!pending} onOpenChange={v=>{if(!v&&!busy){setPending(null);setError('');}}}><AlertDialogContent dir={lang==='en'?'ltr':'rtl'} className="max-h-[90dvh] overflow-y-auto"><AlertDialogHeader><AlertDialogTitle>{d.confirm} ({pending?.rows.length||0})</AlertDialogTitle><AlertDialogDescription>{pending?.archive?d.hint:d.restoreHint}</AlertDialogDescription></AlertDialogHeader><div className="max-h-48 overflow-y-auto text-sm">{pending?.rows.slice(0,20).map(p=><p key={p.id}>{restaurantProductName(p,lang)} · {p.sku||''}</p>)}{pending?.rows.length>20&&<p>+ {pending.rows.length-20}</p>}</div>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<AlertDialogFooter><button type="button" className={button} disabled={busy} onClick={()=>{setPending(null);setError('');}}>{d.cancel}</button><button type="button" className={primary+' '+(pending?.archive?'!bg-red-600':'')} disabled={busy||blocked} onClick={confirm}>{busy?d.busy:pending?.archive?d.remove:d.restore}</button></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </section>;
}
