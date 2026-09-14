import {lazy,Suspense,useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {touchCopy} from '@/lib/restaurantServingOptions';
const CategoryManager=lazy(()=>import('@/components/categories/CategoryManager'));

export default function RestaurantCategorySelect({categories=[],value,onChange,lang,refresh,disabled=false}) {
 const [open,setOpen]=useState(false),t=touchCopy(lang);
 const options=categories.filter(c=>c.is_active!==false);
 return <div className="space-y-2">
  <label className="grid gap-2 text-sm font-bold">{t.category}<select required disabled={disabled} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 dark:bg-slate-900 dark:text-white" value={value||''} onChange={e=>onChange(e.target.value)}><option value="">{t.choose}</option>{options.map(c=><option key={c.id} value={c.id}>{c['name_'+lang]||c.name}</option>)}</select></label>
  <button type="button" disabled={disabled} className="min-h-11 text-sm font-bold text-blue-600 underline" onClick={()=>setOpen(true)}>{t.manage}</button>
  {open&&<Dialog open onOpenChange={v=>{setOpen(v);if(!v)void refresh?.();}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{t.manage}</DialogTitle></DialogHeader><Suspense fallback={<p role="status">…</p>}><CategoryManager/></Suspense></DialogContent></Dialog>}
 </div>;
}
