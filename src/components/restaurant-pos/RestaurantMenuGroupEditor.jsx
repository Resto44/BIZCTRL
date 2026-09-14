import {useRef,useState} from 'react';
import {useLanguage} from '@/lib/LanguageContext';
import {restaurantRpc,parseRecipeRows} from '@/lib/restaurantPOS';
import {touchCopy,servingCopy,PORTIONS,SIDES} from '@/lib/restaurantServingOptions';
import {restaurantCopy} from './copy';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import RestaurantCategorySelect from './RestaurantCategorySelect';

const input='h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-base dark:bg-slate-900';
const Field=({label,children})=><label className="grid min-w-0 gap-2 text-sm font-semibold">{label}{children}</label>;
export default function RestaurantMenuGroupEditor({tenant,branch,initial=[],catalog,refresh,close,reload}) {
 const {lang}=useLanguage(),t=touchCopy(lang),c=restaurantCopy(lang),s=servingCopy(lang);
 const [group,setGroup]=useState(initial[0]?.option_group||'');
 const [category,setCategory]=useState(initial[0]?.category_id||'');
 const [image,setImage]=useState(initial[0]?.image_url||'');
 const [rows,setRows]=useState(()=>PORTIONS.flatMap(p=>SIDES.map(side=>{
  const key=p+'_'+side,old=initial.find(m=>m.option_key===key);
  return {id:crypto.randomUUID(),name:'',name_ar:'',name_fa:'',price:'',tax_rate:0,station:'Kitchen',stock_mode:'recipe',recipe:[],active:false,...old,option_key:key,existing:Boolean(old)};
 })));
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false);
 const inFlight=useRef(false);
 const update=(key,field,value)=>setRows(all=>all.map(r=>r.option_key===key?{...r,[field]:value}:r));
 const save=async e=>{
  e.preventDefault();if(inFlight.current)return;
  const selected=rows.filter(r=>r.active||r.existing);
  if(!selected.length){setError(s.missing);return;}
  if(!category){setError(t.choose);return;}
  const missingRecipe=selected.find(r=>r.stock_mode==='recipe'&&!r.recipe.some(v=>v.inventory_id));
  if(missingRecipe){setError(s[missingRecipe.option_key]+' · '+c.addIngredient);return;}
  inFlight.current=true;setBusy(true);setError('');
  try {
   const items=selected.map(({existing,...r})=>({...r,price:Number(r.price),tax_rate:Number(r.tax_rate),image_url:image,confirm_untracked:confirmed,recipe:r.stock_mode==='recipe'?parseRecipeRows(r.recipe):[]}));
   await restaurantRpc('pos_setup',{p_restaurant_id:tenant,p_branch_id:branch,p_command:'menu_batch',p_payload:{option_group:group.trim(),category_id:category,items}});
   await refresh();close();
  }catch(e){setError(e.message);}finally{inFlight.current=false;setBusy(false);}
 };
 const needsConfirmation=rows.some(r=>(r.active||r.existing)&&r.stock_mode==='untracked');
 return <Dialog open onOpenChange={v=>{if(!v&&!busy)close();}}><DialogContent dir={lang==='en'?'ltr':'rtl'} className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>{t.edit}</DialogTitle><DialogDescription>{s.groupHint}</DialogDescription></DialogHeader>
  <form onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
   <div className="grid gap-4 sm:grid-cols-2"><Field label={t.group}><input required maxLength={80} className={input} value={group} onChange={e=>setGroup(e.target.value)}/></Field><RestaurantCategorySelect categories={catalog?.categories} value={category} onChange={setCategory} lang={lang} refresh={reload} disabled={busy}/></div>
   <Field label={lang==='ar'?'رابط صورة الطعام':lang==='fa'?'لینک تصویر غذا':'Food image URL'}><input type="url" pattern="https://.*" className={input} value={image} onChange={e=>setImage(e.target.value)}/></Field>
   <div className="grid gap-3 md:grid-cols-2">{rows.map(r=><section key={r.option_key} data-owner-serving={r.option_key} className={'space-y-3 rounded-2xl border p-4 '+(r.active?'border-blue-200 bg-blue-50/30':'border-slate-200')}>
    <label className="flex min-h-11 items-center justify-between gap-3 font-bold"><span>{s[r.option_key]}</span><span className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={t.enable+' '+s[r.option_key]} checked={r.active} onChange={e=>update(r.option_key,'active',e.target.checked)}/>{t.enable}</span></label>
    {(r.active||r.existing)&&<>
     <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2"><Field label={t.name}><input required maxLength={160} data-field="name" className={input} value={r.name} onChange={e=>update(r.option_key,'name',e.target.value)}/></Field><Field label={t.price}><input required data-field="price" type="number" min="0.01" step="0.01" className={input} value={r.price} onChange={e=>update(r.option_key,'price',e.target.value)}/></Field></div>
     <details><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{c.arabic} / {lang==='ar'?'الفارسية':lang==='fa'?'فارسی':'Persian'}</summary><div className="grid gap-2">{[['name_ar',c.arabic],['name_fa',lang==='ar'?'الفارسية':lang==='fa'?'فارسی':'Persian']].map(([k,label])=><Field key={k} label={label}><input className={input} value={r[k]||''} onChange={e=>update(r.option_key,k,e.target.value)}/></Field>)}</div></details>
     <details><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{t.recipe} · {r.stock_mode==='recipe'?c.recipe:c.untracked}</summary><div className="space-y-3 pt-2">
      <div className="grid grid-cols-2 gap-2"><Field label={c.taxRate}><input required type="number" min="0" max="100" step="0.01" className={input} value={r.tax_rate} onChange={e=>update(r.option_key,'tax_rate',e.target.value)}/></Field><Field label={c.station}><input required className={input} value={r.station} onChange={e=>update(r.option_key,'station',e.target.value)}/></Field></div>
      <Field label={c.stockMode}><select className={input} value={r.stock_mode} onChange={e=>update(r.option_key,'stock_mode',e.target.value)}><option value="recipe">{c.recipe}</option><option value="untracked">{c.untracked}</option></select></Field>
      {r.stock_mode==='recipe'&&<>{r.recipe.map((ingredient,i)=><div key={i} className="grid grid-cols-[minmax(0,1fr)_85px_40px] items-end gap-2"><Field label={c.ingredient}><select required className={input} value={ingredient.inventory_id} onChange={e=>update(r.option_key,'recipe',r.recipe.map((v,j)=>i===j?{...v,inventory_id:e.target.value}:v))}><option value="">—</option>{catalog?.inventory?.map(v=><option key={v.id} value={v.id}>{v.product_name} · {v.unit}</option>)}</select></Field><Field label={c.quantity}><input required type="number" step="any" min="0.000001" className={input} value={ingredient.quantity} onChange={e=>update(r.option_key,'recipe',r.recipe.map((v,j)=>i===j?{...v,quantity:e.target.value}:v))}/></Field><button type="button" className="min-h-12 text-red-600" aria-label={c.remove} onClick={()=>update(r.option_key,'recipe',r.recipe.filter((_,j)=>j!==i))}>×</button></div>)}<button type="button" className="min-h-11 text-sm font-bold text-blue-600" onClick={()=>update(r.option_key,'recipe',[...r.recipe,{inventory_id:'',quantity:''}])}>+ {c.addIngredient}</button></>}
     </div></details>
    </>}
   </section>)}</div>
   {needsConfirmation&&<label className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><input required type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t.stock}</label>}
   {error&&<p role="alert" className="text-red-600">{error}</p>}
   <button className="min-h-14 w-full rounded-xl bg-blue-600 px-4 py-4 font-bold text-white disabled:opacity-40" disabled={busy||!rows.some(r=>r.active||r.existing)}>{t.save}</button>
  </fieldset></form>
 </DialogContent></Dialog>;
}
