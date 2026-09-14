import {useState} from 'react';
import {touchCopy} from '@/lib/restaurantServingOptions';
import RestaurantSalesCategories from './RestaurantSalesCategories';

export default function RestaurantCategorySelect({tenant,branch,categories=[],value,onChange,lang,refresh,disabled=false}) {
 const [open,setOpen]=useState(false),t=touchCopy(lang);
 const options=categories.filter(c=>c.is_active!==false);
 return <div className="space-y-2">
  <label className="grid gap-2 text-sm font-bold">{t.category}<select required disabled={disabled} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 dark:bg-slate-900 dark:text-white" value={value||''} onChange={e=>onChange(e.target.value)}><option value="">{t.choose}</option>{options.map(c=><option key={c.id} value={c.id}>{c['name_'+lang]||c.name}</option>)}</select></label>
  <button type="button" disabled={disabled} className="min-h-11 text-sm font-bold text-blue-600 underline" onClick={()=>setOpen(true)}>{t.manage}</button>
  {open&&<RestaurantSalesCategories tenant={tenant} branch={branch} lang={lang} close={()=>setOpen(false)} refresh={refresh} onSaved={onChange}/>}
 </div>;
}
