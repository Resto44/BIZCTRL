import {useState} from 'react';
import {ChefHat,ChevronDown} from 'lucide-react';
import {groupRestaurantFoods,servingSlots,servingCopy,canSellServing} from '@/lib/restaurantServingOptions';
import {restaurantProductName} from '@/lib/restaurantPOS';
import {money} from '@/lib/retailCashier';

export default function RestaurantFoodPicker({menu,search='',category='',lang='en',currency='SAR',editable,onChoose,emptyLabel}) {
 const [expanded,setExpanded]=useState(null);
 const c=servingCopy(lang);
 const groups=groupRestaurantFoods(menu,{search,category});
 return <>{!groups.length&&<p className="py-12 text-center text-slate-500">{emptyLabel}</p>}
 <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 2xl:grid-cols-4">
 {groups.slice(0,120).map(group=>{
  const first=group.items.find(m=>m.active)||group.items[0];
  const title=group.grouped?group.title:restaurantProductName(first,lang);
  const picture=group.items.find(m=>m.active&&/^https:\/\//.test(m.image_url||''))?.image_url;
  const open=group.grouped&&expanded===group.id;
  return <article key={group.id} className={'overflow-hidden rounded-2xl border bg-white dark:bg-slate-950 '+(open?'col-span-2 border-blue-500 ring-2 ring-blue-100':'border-slate-200')}>
   <button type="button" className="w-full text-start transition hover:bg-blue-50 disabled:opacity-50 dark:hover:bg-slate-900" disabled={!group.grouped&&(!editable||!canSellServing(first))} aria-expanded={group.grouped?open:undefined} onClick={()=>group.grouped?setExpanded(open?null:group.id):editable&&canSellServing(first)&&onChoose(first)}>
    {picture?<img src={picture} alt="" loading="lazy" className={(open?'h-40':'h-28')+' w-full object-cover'}/>:<div className="flex h-28 items-center justify-center bg-blue-50 text-blue-400"><ChefHat size={40}/></div>}
    <div className="p-3"><strong className="line-clamp-2 block min-h-10 text-sm">{title}</strong>
     {group.grouped?<span className="mt-2 flex items-center gap-2 text-sm font-bold text-blue-600">{c.choose}<ChevronDown size={16}/></span>:<span className="mt-2 block font-black text-blue-600" dir="ltr">{money(first.price,currency)}</span>}
    </div>
   </button>
   {open&&<div className="border-t border-blue-100 bg-blue-50/40 p-3" role="group" aria-label={title+' · '+c.choose}>
    <div className="grid grid-cols-2 gap-2">{servingSlots(group).map(({key,item})=>{
     const enabled=editable&&canSellServing(item);
     return <button type="button" key={key} data-serving={key} disabled={!enabled} onClick={()=>{if(enabled)onChoose(item);}} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white p-3 text-center hover:border-blue-600 hover:bg-blue-600 hover:text-white disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:bg-slate-900">
      <strong className="text-sm">{c[key]}</strong><span className="text-sm font-bold" dir={item?'ltr':undefined}>{canSellServing(item)?money(item.price,currency):item?c.unavailable:c.missing}</span>
     </button>;
    })}</div><p className="mt-3 text-xs leading-5 text-slate-500">{c.configure}</p>
   </div>}
  </article>;
 })}
 </div></>;
}
