import {useMemo,useState} from 'react';
import {useQuery,useQueryClient,useMutation} from '@tanstack/react-query';
import {Tag,Plus,Search} from 'lucide-react';
import {supabase} from '@/api/supabaseClient';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {fetchProductBrandChoices} from '@/lib/productBrands';
import {brandKey,brandLabel,mergeBrandMaster,saveBrandMaster,fetchBrandMaster,fetchBrandUsage,brandCatalogAnalytics,filterBrandCatalog,normalizeBrandImageUrl,safeBrandImageUrl} from '@/lib/productBrandMaster';
import BrandLogo from '@/components/products/BrandLogo';
import ProductBrandAnalytics,{analyticsCopy} from '@/components/products/ProductBrandAnalytics';

export const brandCopy = lang=>({
 en:{title:'Product brands',add:'Add new brand',manage:'Manage brands',search:'Search all brand names',en:'English name',ar:'Arabic name',fa:'Persian name',save:'Save brand',cancel:'Cancel',edit:'Edit',active:'Active',archived:'Archived',legacy:'Existing product brand',archive:'Archive',restore:'Restore',loading:'Loading brands…',error:'Could not load brand catalog.',retry:'Retry',required:'Enter all three names (maximum 120 characters each).',duplicate:'A brand with this name already exists. Edit it instead.',saved:'Brand saved independently of the product.',failed:'Brand could not be saved. Your input is retained.',empty:'No brands found.',hint:'Archive hides a brand from new selections. Existing product references are preserved.',confirmArchive:'Archive this brand from new selections?',confirmRestore:'Restore this brand?',back:'Back'},
 ar:{title:'العلامات التجارية للمنتجات',add:'إضافة علامة جديدة',manage:'إدارة العلامات التجارية',search:'بحث بجميع أسماء العلامة',en:'الاسم بالإنجليزية',ar:'الاسم بالعربية',fa:'الاسم بالفارسية',save:'حفظ العلامة',cancel:'إلغاء',edit:'تعديل',active:'نشطة',archived:'مؤرشفة',legacy:'علامة موجودة في المنتجات',archive:'أرشفة',restore:'استعادة',loading:'جارٍ تحميل العلامات…',error:'تعذر تحميل دليل العلامات.',retry:'إعادة المحاولة',required:'أدخل الأسماء الثلاثة (حتى 120 حرفًا لكل اسم).',duplicate:'هذه العلامة موجودة بالفعل. عدّلها بدلاً من ذلك.',saved:'تم حفظ العلامة بشكل مستقل عن المنتج.',failed:'تعذر حفظ العلامة. تم الاحتفاظ بمدخلاتك.',empty:'لا توجد علامات مطابقة.',hint:'الأرشفة تخفي العلامة من الاختيارات الجديدة وتحفظ مراجع المنتجات الحالية.',confirmArchive:'أرشفة هذه العلامة من الاختيارات الجديدة؟',confirmRestore:'استعادة هذه العلامة؟',back:'رجوع'},
 fa:{title:'برندهای محصولات',add:'افزودن برند جدید',manage:'مدیریت برندها',search:'جستجو در هر سه زبان',en:'نام انگلیسی',ar:'نام عربی',fa:'نام فارسی',save:'ذخیره برند',cancel:'لغو',edit:'ویرایش',active:'فعال',archived:'غیرفعال',legacy:'برند موجود در محصولات',archive:'غیرفعال‌سازی',restore:'فعال‌سازی',loading:'در حال بارگذاری برندها…',error:'دریافت کاتالوگ برند ناموفق بود.',retry:'تلاش دوباره',required:'هر سه نام را وارد کنید (حداکثر ۱۲۰ حرف برای هر نام).',duplicate:'این برند قبلاً ثبت شده؛ آن را ویرایش کنید.',saved:'برند مستقل از محصول ذخیره شد.',failed:'ذخیره برند ناموفق بود. اطلاعات واردشده حفظ شده است.',empty:'برندی یافت نشد.',hint:'غیرفعال‌سازی برند را از انتخاب‌های جدید پنهان می‌کند؛ اطلاعات محصولات قبلی حفظ می‌شوند.',confirmArchive:'برند برای انتخاب جدید غیرفعال شود؟',confirmRestore:'برند دوباره فعال شود؟',back:'برگشت'}
}[lang]||brandCopy('en'));

export function useBrandMaster(restaurantId) {
 return useQuery({queryKey:['product-brand-master',restaurantId],queryFn:()=>fetchBrandMaster(supabase,restaurantId),enabled:!!restaurantId,staleTime:30000,retry:1});
}
const empty={name_en:'',name_ar:'',name_fa:'',image_url:'',is_active:true};
const defaultFilters={status:'all',logo:'all',usage:'all',sort:'name'};
export default function ProductBrandManager({restaurantId,lang='en',onSelected,initialAdd=false}) {
 const t=brandCopy(lang),a=analyticsCopy(lang),qc=useQueryClient();
 const master=useBrandMaster(restaurantId);
 const legacy=useQuery({queryKey:['product-brand-choices',restaurantId],queryFn:()=>fetchProductBrandChoices(supabase,restaurantId),enabled:!!restaurantId,staleTime:30000,retry:1});
 const rows=useMemo(()=>mergeBrandMaster(master.data||[],legacy.data||[]),[master.data,legacy.data]);
 const [query,setQuery]=useState(''),[form,setForm]=useState(initialAdd?empty:null),[message,setMessage]=useState(''),[error,setError]=useState(''),[confirm,setConfirm]=useState(null);
 const [filters,setFilters]=useState(defaultFilters),[limit,setLimit]=useState(40),[preview,setPreview]=useState(null);
 const usage=useQuery({queryKey:['product-brand-usage',restaurantId],queryFn:()=>fetchBrandUsage(supabase,restaurantId),enabled:!!restaurantId&&!initialAdd,staleTime:0,refetchOnMount:'always',retry:1});
 const usageData=usage.isError?null:usage.data||null;
 const analytics=useMemo(()=>brandCatalogAnalytics(rows,usageData),[rows,usageData]);
 const filtered=useMemo(()=>filterBrandCatalog(rows,{...filters,query,lang,counts:usageData?.byBrand??null}),[rows,filters,query,lang,usageData]);
 const changeFilter=(key,value)=>{setFilters(old=>({...old,[key]:value}));setLimit(40);};
 const openForm=row=>{setForm(row);setPreview(null);setConfirm(null);setError('');setMessage('');};
 const mutation=useMutation({mutationFn:payload=>saveBrandMaster(supabase,restaurantId,payload),onSuccess:async(saved,submitted)=>{
   qc.setQueryData(['product-brand-master',restaurantId],old=>[...(old||[]).filter(r=>r.id!==saved.id),saved]);
   await qc.invalidateQueries({queryKey:['product-brand-master',restaurantId]});
   setForm(null);setConfirm(null);setError('');setMessage(t.saved);
   if(onSelected&&saved.is_active&&!submitted.statusOnly)onSelected(saved.brand);
 },onError:()=>setError(t.failed)});
 const submit=()=>{
   setError('');setMessage('');
   if(!form||['name_en','name_ar','name_fa'].some(k=>!String(form[k]||'').trim())){setError(t.required);return;}
   try{normalizeBrandImageUrl(form.image_url);}catch{setError(a.invalid);return;}
   const key=brandKey(form.brand||form.name_en);
   if(rows.some(r=>(brandKey(r.brand)===key||['name_en','name_ar','name_fa'].some(k=>brandKey(form[k])&&brandKey(form[k])===brandKey(r[k]))) && !(r.id&&r.id===form.id) && !(form.brand&&!r.id&&brandKey(r.brand)===brandKey(form.brand)))){setError(t.duplicate);return;}
   mutation.mutate(form);
 };
 const busy=master.isPending||legacy.isPending||mutation.isPending;
 return <section dir={lang==='en'?'ltr':'rtl'} className="min-w-0 space-y-3" data-testid="product-brand-manager">
   <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-base font-black"><Tag className="h-5 w-5 text-blue-600"/>{t.title}</h3><Button type="button" variant="outline" disabled={busy||master.isError||legacy.isError} onClick={()=>openForm({...empty})}><Plus className="me-1 h-4 w-4"/>{t.add}</Button></div>
   <p className="text-xs text-muted-foreground">{t.hint}</p>
   {(master.isPending||legacy.isPending)&&<p role="status">{t.loading}</p>}
   {(master.isError||legacy.isError)&&<div role="alert" className="rounded-lg border border-amber-400 p-3 text-sm">{t.error} <Button type="button" variant="outline" onClick={()=>{master.refetch();legacy.refetch();}}>{t.retry}</Button></div>}
   {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message&&<p role="status" className="text-sm text-emerald-700">{message}</p>}
   {!initialAdd&&!master.isPending&&!legacy.isPending&&!master.isError&&!legacy.isError&&<ProductBrandAnalytics data={analytics} lang={lang} usageLoading={usage.isPending} usageError={usage.isError}/>}
   {!initialAdd&&<div className="flex justify-end"><Button type="button" variant="outline" disabled={master.isFetching||legacy.isFetching||usage.isFetching} onClick={()=>{master.refetch();legacy.refetch();usage.refetch();}}>{a.refresh}</Button></div>}
   {form&&<div className="space-y-3 rounded-xl border bg-muted/30 p-3" data-testid="brand-editor">
     {['en','ar','fa'].map(l=><div key={l}><Label htmlFor={'brand-name-'+l}>{t[l]}</Label><Input id={'brand-name-'+l} dir={l==='en'?'ltr':'rtl'} maxLength={120} value={form['name_'+l]||''} disabled={mutation.isPending} onChange={e=>setForm(p=>({...p,['name_'+l]:e.target.value}))}/></div>)}
     <div className="space-y-2"><Label htmlFor="brand-image-url">{a.image}</Label><Input id="brand-image-url" type="url" inputMode="url" dir="ltr" placeholder="https://…" maxLength={2048} value={form.image_url||''} disabled={mutation.isPending} onChange={e=>{setForm(p=>({...p,image_url:e.target.value}));setPreview(null);}}/>
       <p className="text-xs text-muted-foreground">{a.imageHint}</p>
       <div className="flex flex-wrap items-center gap-2">{preview&&<BrandLogo url={preview} label={a.logoLabel} className="h-16 w-16"/>}<Button type="button" variant="outline" size="sm" disabled={!safeBrandImageUrl(form.image_url)||mutation.isPending} onClick={()=>setPreview(safeBrandImageUrl(form.image_url))}>{a.preview}</Button>{form.image_url&&<Button type="button" size="sm" variant="ghost" disabled={mutation.isPending} onClick={()=>{setForm(p=>({...p,image_url:''}));setPreview(null);}}>{a.remove}</Button>}</div>
     </div>
     <div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={()=>{setForm(null);setError('');}}>{t.cancel}</Button><Button type="button" disabled={busy||master.isError||legacy.isError} onClick={submit}>{t.save}</Button></div>
   </div>}
   {confirm&&<div className="rounded-lg border border-amber-400 p-3"><p className="text-sm">{confirm.is_active?t.confirmArchive:t.confirmRestore}</p><div className="mt-2 flex gap-2"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={()=>setConfirm(null)}>{t.cancel}</Button><Button type="button" disabled={busy} onClick={()=>mutation.mutate({...confirm,is_active:!confirm.is_active,statusOnly:true})}>{confirm.is_active?t.archive:t.restore}</Button></div></div>}
   <div className="relative"><Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="ps-9" aria-label={t.search} placeholder={t.search} value={query} onChange={e=>{setQuery(e.target.value);setLimit(40);}}/></div>
   <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-bold">{a.filters}</summary><div className="mt-3 grid grid-cols-2 gap-2">
     {[['status',a.status,[['all',a.all],['active',t.active],['archived',t.archived],['legacy',t.legacy]]],['logo',a.logo,[['all',a.all],['yes',a.yesLogo],['no',a.noLogo]]],...(!initialAdd?[['usage',a.usage,[['all',a.all],['used',a.used],['unused',a.unused]]]]:[]),['sort',a.sort,[['name',a.name],['recent',a.recent],...(!initialAdd&&usageData?[['products',a.most]]:[])]]].map(([key,label,options])=><div key={key} className="min-w-0"><Label htmlFor={'brand-filter-'+key}>{label}</Label><select id={'brand-filter-'+key} value={filters[key]} disabled={key==='usage'&&!usageData} onChange={e=>changeFilter(key,e.target.value)} className="mt-1 h-11 w-full min-w-0 rounded-lg border bg-background px-2 text-sm">{options.map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></div>)}
     <Button type="button" variant="outline" onClick={()=>{setFilters(defaultFilters);setQuery('');setLimit(40);}}>{a.clear}</Button>
   </div></details>
   <p className="text-xs text-muted-foreground">{a.shown} {Math.min(filtered.length,limit)} / {filtered.length}</p>
   <div className="space-y-2">{filtered.slice(0,limit).map(r=><article key={brandKey(r.brand)} className="min-w-0 rounded-xl border p-3">
    <div className="flex items-center gap-3"><BrandLogo url={r.image_url} label={brandLabel(r,lang)}/><div className="min-w-0 flex-1"><strong className="break-words">{brandLabel(r,lang)}</strong><div className="text-xs text-muted-foreground">{!r.id?t.legacy:r.is_active?t.active:t.archived}{usageData&&<> · {analytics.count(r)} {a.count}</>}</div></div></div>
    <div className="mt-1 text-xs text-muted-foreground" dir="auto">{[r.name_en,r.name_ar,r.name_fa].filter(Boolean).join(' · ')}</div>
    <div className="mt-2 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={busy||master.isError||legacy.isError} onClick={()=>openForm({...empty,...r})}>{t.edit}</Button>{r.id&&<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={()=>{setConfirm(r);setForm(null);setError('');}}>{r.is_active?t.archive:t.restore}</Button>}</div>
   </article>)}</div>
   {filtered.length>limit&&<Button type="button" variant="outline" className="w-full" onClick={()=>setLimit(n=>n+40)}>{a.more}</Button>}
   {!busy&&!master.isError&&!legacy.isError&&filtered.length===0&&<p className="text-sm text-muted-foreground">{t.empty}</p>}
 </section>;
}
