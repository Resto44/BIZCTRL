import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Plus,Pencil} from 'lucide-react';
import {restaurantRpc} from '@/lib/restaurantPOS';
import {touchCopy} from '@/lib/restaurantServingOptions';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';

const input='h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-base dark:bg-slate-900';
const button='inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold disabled:opacity-40';
export function salesCategoryCopy(lang='en') {
 return ({
  ar:{hint:'فئات بيع الطعام في POS فقط. فئات شراء المواد الخام مستقلة.',add:'إضافة فئة بيع',name:'اسم الفئة',arabic:'الاسم بالعربية',persian:'الاسم بالفارسية',active:'مفعّلة',inactive:'غير مفعّلة',order:'ترتيب العرض',save:'حفظ فئة البيع',edit:'تعديل',cancel:'إلغاء',empty:'لا توجد فئات بيع. أضف أول فئة.',loading:'جارٍ التحميل…',duplicate:'اسم الفئة موجود في هذا الفرع.'},
  fa:{hint:'فقط کتگوری فروش غذا در POS. کتگوری خرید مواد اولیه جدا است.',add:'افزودن کتگوری فروش',name:'نام کتگوری',arabic:'نام عربی',persian:'نام فارسی',active:'فعال',inactive:'غیرفعال',order:'ترتیب نمایش',save:'ذخیرهٔ کتگوری فروش',edit:'ویرایش',cancel:'لغو',empty:'کتگوری فروش وجود ندارد. اولین کتگوری را اضافه کنید.',loading:'در حال بارگذاری…',duplicate:'این نام کتگوری در فرع وجود دارد.'},
  en:{hint:'Food sales categories for POS only. Raw-material purchase categories are separate.',add:'Add sales category',name:'Category name',arabic:'Arabic name',persian:'Persian name',active:'Active',inactive:'Inactive',order:'Display order',save:'Save sales category',edit:'Edit',cancel:'Cancel',empty:'No sales categories. Add your first category.',loading:'Loading…',duplicate:'This category name already exists in this branch.'}
 })[lang]||salesCategoryCopy('en');
}
export default function RestaurantSalesCategories({tenant,branch,lang='en',close,refresh,onSaved}) {
 const c=salesCategoryCopy(lang),t=touchCopy(lang),qc=useQueryClient();
 const [form,setForm]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const queryKey=['restaurant-sales-categories',tenant,branch];
 const q=useQuery({queryKey,enabled:Boolean(tenant&&branch),queryFn:()=>restaurantRpc('pos_setup',{p_restaurant_id:tenant,p_branch_id:branch,p_command:'category_list',p_payload:{}})});
 const set=(k,value)=>setForm(f=>({...f,[k]:value}));
 const save=async e=>{
  e.preventDefault();e.stopPropagation();if(busy)return;
  setBusy(true);setError('');
  try{
   await restaurantRpc('pos_setup',{p_restaurant_id:tenant,p_branch_id:branch,p_command:'category_save',p_payload:{...form,name:form.name.trim(),sort_order:Number(form.sort_order)}});
   await Promise.all([q.refetch(),...['restaurant-menu-catalog','restaurant-pos-setup','restaurant-pos'].map(key=>qc.invalidateQueries({queryKey:[key]}))]);
   await refresh?.();if(form.is_active)onSaved?.(form.id);setForm(null);
  }catch(e){setError(e.code==='23505'?c.duplicate:e.message);}finally{setBusy(false);}
 };
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)close();}}><DialogContent dir={lang==='en'?'ltr':'rtl'} className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{t.manage}</DialogTitle><DialogDescription>{c.hint}</DialogDescription></DialogHeader>
  {q.isLoading&&<p role="status">{c.loading}</p>}
  {(error||q.error)&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error||q.error.message}</p>}
  {form?<form onSubmit={save} className="space-y-3"><fieldset disabled={busy} className="space-y-3">
   {[['name',c.name],['name_ar',c.arabic],['name_fa',c.persian]].map(([key,label])=><label className="grid gap-2 text-sm font-bold" key={key}>{label}<input className={input} required={key==='name'} maxLength={160} value={form[key]||''} onChange={e=>set(key,e.target.value)}/></label>)}
   <label className="grid gap-2 text-sm font-bold">{c.order}<input type="number" step="1" required className={input} value={form.sort_order} onChange={e=>set('sort_order',e.target.value)}/></label>
   <label className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={form.is_active} onChange={e=>set('is_active',e.target.checked)}/>{c.active}</label>
   <div className="grid grid-cols-2 gap-2"><button className={button+' border-blue-600 bg-blue-600 text-white'} disabled={busy}>{c.save}</button><button type="button" className={button} disabled={busy} onClick={()=>{setForm(null);setError('');}}>{c.cancel}</button></div>
  </fieldset></form>:<>
   <button type="button" className={button+' border-blue-600 bg-blue-600 text-white'} disabled={!tenant||!branch||q.isLoading||q.isError} onClick={()=>{setError('');setForm({id:crypto.randomUUID(),name:'',name_ar:'',name_fa:'',sort_order:0,is_active:true});}}><Plus size={18}/>{c.add}</button>
   <div className="space-y-2">{(q.data?.categories||[]).map(row=><article key={row.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><strong className="break-words">{row['name_'+lang]||row.name}</strong><p className={'mt-1 text-sm '+(row.is_active?'text-emerald-700':'text-slate-500')}>{row.is_active?c.active:c.inactive}</p></div><button type="button" className={button} aria-label={c.edit+' '+row.name} onClick={()=>{setError('');setForm(row);}}><Pencil size={16}/>{c.edit}</button></article>)}</div>
   {!q.isLoading&&!q.isError&&!q.data?.categories?.length&&<p className="py-6 text-center text-sm text-slate-500">{c.empty}</p>}
  </>}
 </DialogContent></Dialog>;
}
