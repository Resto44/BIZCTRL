import {customizationCopy,axesFromItems} from '@/lib/restaurantCustomization';
import {useRef,useState} from 'react';
import {ChefHat,ChevronDown,CheckCircle2,ShoppingCart,Plus,Minus} from 'lucide-react';
import {groupRestaurantFoods,servingCopy,touchCopy,canSellServing,PORTIONS,SIDES} from '@/lib/restaurantServingOptions';
import {restaurantProductName} from '@/lib/restaurantPOS';
import {money} from '@/lib/retailCashier';

const choiceClass=selected=>'flex min-h-14 items-center justify-center gap-2 rounded-xl border px-3 py-4 text-base font-bold transition '+(selected?'border-blue-600 bg-blue-600 text-white shadow-sm':'border-slate-200 bg-slate-50 text-slate-800 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white');

function ServingConfigurator({group,lang,currency,editable,onChoose}) {
 const c=servingCopy(lang),t=touchCopy(lang);
 const first=group.items.find(canSellServing)||group.items[0];
 const custom=Boolean(first.variant_options?.length);
 const [selected,setSelected]=useState(()=>Object.fromEntries((first.variant_options||[]).map(o=>[o.label,o.value])));
 const axes=custom?axesFromItems(group.items):[];
 const [portion,setPortion]=useState(first.option_key?.split('_')[0]||'whole');
 const [side,setSide]=useState(first.option_key?.split('_')[1]||'rice');
 const [quantity,setQuantity]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const inFlight=useRef(false);
 const item=custom?group.items.find(m=>m.active&&m.variant_options?.length===axes.length&&m.variant_options.every(o=>selected[o.label]===o.value)):group.items.find(m=>m.option_key===`${portion}_${side}`);
 const sellable=canSellServing(item);
 const add=async()=>{
  if(!editable||!sellable||inFlight.current)return;
  inFlight.current=true;setBusy(true);setError('');
  try {const result=await onChoose(item,quantity);if(result!==null)setQuantity(1);} catch(e) {setError(e.message);} finally {inFlight.current=false;setBusy(false);}
 };
 return <div className="space-y-4 border-t border-slate-100 p-4 sm:p-5" aria-label={group.title+' · '+c.choose}>
  {custom?axes.map(axis=><fieldset key={axis.label} disabled={busy}><legend className="mb-2 text-lg font-bold">{axis.label}</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{axis.values.split('\n').map(value=><button type="button" key={value} data-option={axis.label+':'+value} aria-pressed={selected[axis.label]===value} className={choiceClass(selected[axis.label]===value)} onClick={()=>{setSelected(v=>({...v,[axis.label]:value}));setQuantity(1);}}>{selected[axis.label]===value&&<CheckCircle2 size={19}/>} {value}</button>)}</div></fieldset>):<>
  <fieldset disabled={busy}><legend className="mb-2 text-lg font-bold">{t.size}</legend><div className="grid grid-cols-3 gap-2">{PORTIONS.map(key=><button type="button" data-portion={key} aria-pressed={portion===key} key={key} className={choiceClass(portion===key)} onClick={()=>{setPortion(key);setQuantity(1);}}>{portion===key&&<CheckCircle2 size={19}/>} {t[key]}</button>)}</div></fieldset>
  <fieldset disabled={busy}><legend className="mb-2 text-lg font-bold">{t.side}</legend><div className="grid grid-cols-2 gap-2">{SIDES.map(key=><button type="button" data-side={key} aria-pressed={side===key} key={key} className={choiceClass(side===key)} onClick={()=>{setSide(key);setQuantity(1);}}>{side===key&&<CheckCircle2 size={19}/>} {t[key]}</button>)}</div></fieldset>
  </>}
  <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-center dark:border-slate-800 dark:bg-slate-900" aria-live="polite">
   <h3 className="text-lg font-black">{item?restaurantProductName(item,lang):custom?customizationCopy(lang).options:c[`${portion}_${side}`]}</h3>
   <p className={'text-2xl font-black '+(sellable?'text-slate-950 dark:text-white':'text-amber-700')} data-selected-price>{sellable?money(item.price,currency):item?c.unavailable:c.missing}</p>
   {!sellable&&<p className="text-sm text-slate-500">{c.configure}</p>}
   <div className="mx-auto mt-3 flex w-fit items-center overflow-hidden rounded-xl border border-slate-200 bg-white dark:bg-slate-950" dir="ltr">
    <button type="button" className="p-4 disabled:opacity-30" aria-label={t.decrease} disabled={busy||quantity<=1} onClick={()=>setQuantity(q=>Math.max(1,q-1))}><Minus size={22}/></button>
    <output aria-label={t.quantity} className="min-w-16 border-x px-4 text-xl font-bold">{quantity}</output>
    <button type="button" className="p-4 disabled:opacity-30" aria-label={t.increase} disabled={busy||quantity>=99} onClick={()=>setQuantity(q=>Math.min(99,q+1))}><Plus size={22}/></button>
   </div>
  </div>
  {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
  <button type="button" data-add-serving className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-4 text-lg font-bold text-white shadow-sm hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500" disabled={!editable||!sellable||busy} onClick={add}><ShoppingCart size={22}/>{busy?t.busy:t.add}{sellable&&<span> · {money(Number(item.price)*quantity,currency)}</span>}</button>
 </div>;
}

export default function RestaurantFoodPicker({menu,search='',category='',lang='en',currency='SAR',editable,onChoose,emptyLabel}) {
 const [expanded,setExpanded]=useState(null);
 const c=servingCopy(lang),groups=groupRestaurantFoods(menu,{search,category});
 return <>{!groups.length&&<p className="py-12 text-center text-slate-500">{emptyLabel}</p>}
 <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 2xl:grid-cols-4">
 {groups.slice(0,120).map(group=>{
  const first=group.items.find(m=>m.active)||group.items[0];
  const title=group.grouped?group.title:restaurantProductName(first,lang);
  const picture=group.items.find(m=>m.active&&/^https:\/\//.test(m.image_url||''))?.image_url;
  const open=group.grouped&&expanded===group.id;
  return <article key={group.id} className={'overflow-hidden rounded-2xl border bg-white dark:bg-slate-950 '+(open?'col-span-full border-blue-100 shadow-sm':'border-slate-200')}>
   <button type="button" className="w-full text-start transition hover:bg-blue-50 disabled:opacity-50 dark:hover:bg-slate-900" disabled={!group.grouped&&(!editable||!canSellServing(first))} aria-expanded={group.grouped?open:undefined} onClick={()=>group.grouped?setExpanded(open?null:group.id):editable&&canSellServing(first)&&onChoose(first,1)}>
    {open&&<h2 className="px-4 pb-3 pt-5 text-2xl font-black sm:px-5">{title}</h2>}
    {picture?<img src={picture} alt="" loading="lazy" className={open?'mx-auto h-52 w-[calc(100%-2rem)] rounded-xl object-cover sm:h-64':'h-28 w-full object-cover'}/>:<div className={(open?'mx-4 h-40 rounded-xl':'h-28')+' flex items-center justify-center bg-blue-50 text-blue-400'}><ChefHat size={40}/></div>}
    {!open&&<div className="p-3"><strong className="line-clamp-2 block min-h-10 text-sm">{title}</strong>{group.grouped?<span className="mt-2 flex items-center gap-2 text-sm font-bold text-blue-600">{c.choose}<ChevronDown size={16}/></span>:<span className="mt-2 block font-black text-blue-600" dir="ltr">{money(first.price,currency)}</span>}</div>}
   </button>
   {open&&<ServingConfigurator key={group.id} group={group} lang={lang} currency={currency} editable={editable} onChoose={onChoose}/>}
  </article>;
 })}
 </div></>;
}
