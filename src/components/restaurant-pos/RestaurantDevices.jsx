import {useRef,useState} from 'react';
import {Plus,Monitor,Archive,RotateCcw,Pencil} from 'lucide-react';
import {restaurantRpc} from '@/lib/restaurantPOS';
import {customizationCopy} from '@/lib/restaurantCustomization';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
const input='min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base dark:bg-slate-900';
const button='inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 py-3 font-bold disabled:opacity-40';
export default function RestaurantDevices({tenant,branch,branches=[],devices=[],lang='en',close,refresh,onSelect,startNew=false}) {
 const c=customizationCopy(lang),[form,setForm]=useState(()=>startNew?{id:crypto.randomUUID(),branch_id:branch||branches[0]?.id||'',code:'',existing:false}:null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const inflight=useRef(false);
 const call=async(command,payload,branchId)=>{
  if(inflight.current)return;inflight.current=true;setBusy(true);setError('');
  try {await restaurantRpc('pos_setup',{p_restaurant_id:tenant,p_branch_id:branchId,p_command:command,p_payload:payload});await refresh();setForm(null);if(command==='device_save')onSelect?.(payload.id,branchId);}
  catch(e){setError(e.message);}finally{inflight.current=false;setBusy(false);}
 };
 const add=()=>{setError('');setForm({id:crypto.randomUUID(),branch_id:branch||branches[0]?.id||'',code:'',existing:false});};
 const active=devices.filter(d=>d.active!==false),archived=devices.filter(d=>d.active===false);
 const row=d=><div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><strong>{d.code}</strong><p className="text-sm text-slate-500">{branches.find(b=>b.id===d.branch_id)?.name}</p></div><div className="flex gap-2"><button type="button" className={button} aria-label={c.edit+' '+d.code} disabled={busy} onClick={()=>setForm({...d,existing:true})}><Pencil size={17}/></button><button type="button" className={button} disabled={busy} onClick={()=>call('device_archive',{id:d.id,active:d.active===false},d.branch_id)}>{d.active===false?<RotateCcw size={17}/>:<Archive size={17}/>} {d.active===false?c.restore:c.archive}</button></div></div>;
 return <Dialog open onOpenChange={v=>{if(!v&&!busy)close();}}><DialogContent dir={lang==='en'?'ltr':'rtl'} className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{c.devices}</DialogTitle><DialogDescription>{c.archiveHint}</DialogDescription></DialogHeader>
  <button type="button" className={button+' bg-blue-600 text-white'} disabled={busy} onClick={add}><Plus size={20}/>{c.addPOS}</button>
  {form&&<form onSubmit={e=>{e.preventDefault();e.stopPropagation();if(form.code.trim())void call('device_save',{id:form.id,code:form.code.trim()},form.branch_id);}} className="grid gap-4 rounded-2xl border border-blue-100 bg-blue-50/30 p-4"><fieldset disabled={busy} className="space-y-4"><label className="grid gap-2 font-bold">{c.deviceName}<input autoFocus required maxLength={40} placeholder={c.nameHint} className={input} value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value}))}/></label><label className="grid gap-2 font-bold">{lang==='ar'?'الفرع':lang==='fa'?'شعبه':'Branch'}<select required disabled={form.existing} className={input} value={form.branch_id} onChange={e=>setForm(f=>({...f,branch_id:e.target.value}))}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><div className="flex gap-2"><button className={button+' bg-blue-600 text-white'} disabled={!form.branch_id}>{c.savePOS}</button><button type="button" className={button} onClick={()=>setForm(null)}>{c.back}</button></div></fieldset></form>}
  {!active.length&&<div className="rounded-2xl border border-dashed p-8 text-center"><Monitor className="mx-auto mb-3 text-blue-500" size={42}/><h3 className="font-bold">{c.emptyPOS}</h3><p className="mt-2 text-sm text-slate-500">{c.emptyHint}</p></div>}
  <div className="space-y-2">{active.map(row)}</div>
  {!!archived.length&&<details><summary className="min-h-12 cursor-pointer py-3 font-bold">{c.archivedPOS} ({archived.length})</summary><div className="space-y-2">{archived.map(row)}</div></details>}
  {error&&<p role="alert" className="text-red-600">{error}</p>}
 </DialogContent></Dialog>;
}
