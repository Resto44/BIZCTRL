import React,{useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {ResponsiveContainer,ComposedChart,Bar,Line,XAxis,YAxis,Tooltip,CartesianGrid} from 'recharts';
import {supabase} from '@/api/supabaseClient';
import {Button} from '@/components/ui/button';
import {walletCopy,periodRange,validRange} from './walletPresentation';
const field='min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-950';
const money=(v,lang)=>new Intl.NumberFormat(lang==='fa'?'fa-AF':lang==='ar'?'ar-SA':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v));
export function WalletTrend({person,currency,lang}){
 const t=walletCopy[lang]||walletCopy.en;
 const [period,setPeriod]=useState('month'),[custom,setCustom]=useState(()=>periodRange('month'));
 const range=period==='custom'?custom:periodRange(period),valid=validRange(range.from,range.to),timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Riyadh';
 const query=useQuery({queryKey:['erp-wallet-trend',person.id,currency,range.from,range.to,timezone],enabled:valid,queryFn:async()=>{const {data,error}=await supabase.rpc('erp_bank_wallet_trend',{p_person:person.id,p_currency:currency,p_from:range.from,p_to:range.to,p_timezone:timezone});if(error)throw error;if(!Array.isArray(data?.days))throw Error('INVALID_TREND');return data;},refetchInterval:20000});
 const rows=query.data?.days||[],incoming=rows.reduce((n,r)=>n+Number(r.incoming),0),outgoing=rows.reduce((n,r)=>n+Number(r.outgoing),0),count=rows.reduce((n,r)=>n+Number(r.count),0);
 return <section className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
 <div><h2 className="text-lg font-black text-slate-950">{t.trend}</h2><p className="mt-1 text-xs text-slate-500">{t.posted} · {currency} · {timezone}</p></div>
 <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">{['today','week','month','custom'].map(p=><button type="button" key={p} aria-pressed={period===p} className={'min-h-11 rounded-lg px-1 text-xs font-bold '+(period===p?'bg-slate-900 text-white':'text-slate-600')} onClick={()=>setPeriod(p)}>{t[p]}</button>)}</div>
 {period==='custom'&&<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{['from','to'].map(k=><label key={k} className="min-w-0 text-xs font-bold">{t[k]}<input aria-label={t[k]} type="date" value={custom[k]} onChange={e=>setCustom({...custom,[k]:e.target.value})} className={field}/></label>)}</div>}
 {!valid?<p role="alert" className="text-sm text-rose-700">{t.rangeError}</p>:query.isPending?<p role="status">{t.loading}</p>:query.isError?<div role="alert" className="text-sm text-rose-700">{t.error} <Button type="button" variant="outline" onClick={()=>query.refetch()}>{t.retry}</Button></div>:<>
 <div className="grid grid-cols-2 gap-3">{[[t.incoming,incoming,'text-emerald-700'],[t.outgoing,outgoing,'text-rose-700'],[t.opening,query.data.opening_balance,'text-slate-800'],[t.balance,rows.at(-1)?.balance??query.data.opening_balance,'text-blue-900']].map(([label,value,tone])=><div key={label} className="min-w-0 rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-600">{label}</p><strong dir="ltr" className={'mt-1 block break-words text-lg tabular-nums '+tone}>{money(value,lang)} <small className="text-xs">{currency}</small></strong></div>)}</div>
 {!count?<p className="py-4 text-center text-sm text-slate-500">{t.empty}</p>:<div dir="ltr" className="h-56 min-w-0" role="img" aria-label={`${t.trend}: ${t.incoming} ${money(incoming,lang)}, ${t.outgoing} ${money(outgoing,lang)} ${currency}`}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows.map(r=>({...r,incoming:Number(r.incoming),outgoing:Number(r.outgoing),balance:Number(r.balance)}))} margin={{top:8,right:8,bottom:0,left:0}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="day" tickFormatter={s=>s.slice(5)} tick={{fontSize:10}} minTickGap={24}/><YAxis width={48} tick={{fontSize:10}}/><Tooltip formatter={(v,name)=>[`${money(v,lang)} ${currency}`,name]}/><Bar dataKey="incoming" name={t.incoming} fill="#059669" maxBarSize={18}/><Bar dataKey="outgoing" name={t.outgoing} fill="#e11d48" maxBarSize={18}/><Line type="linear" dataKey="balance" name={t.balance} stroke="#172554" strokeWidth={2} dot={rows.length===1}/></ComposedChart></ResponsiveContainer></div>}
 <div className="flex flex-wrap gap-3 text-xs font-semibold"><span className="text-emerald-700">● {t.incoming}</span><span className="text-rose-700">● {t.outgoing}</span><span className="text-blue-950">● {t.balance}</span></div>
 </>}
 </section>;
}
export function WalletPersonalCategories({person,transactions,lang}){
 const t=walletCopy[lang]||walletCopy.en,client=useQueryClient();
 const [name,setName]=useState(''),[editing,setEditing]=useState(null),[transaction,setTransaction]=useState(''),[category,setCategory]=useState(''),[notice,setNotice]=useState('');
 const key=['erp-wallet-personal',person.id];
 const query=useQuery({queryKey:key,queryFn:async()=>{const {data,error}=await supabase.rpc('erp_wallet_personal_labels',{p_person:person.id});if(error)throw error;return data;}});
 const mutation=useMutation({mutationFn:async payload=>{const {data,error}=await supabase.rpc('erp_wallet_personal_labels',{p_person:person.id,...payload});if(error)throw error;return data;},onSuccess:(data,variables)=>{client.setQueryData(key,data);setNotice(t.saved);if(variables.p_action==='save'){setName('');setEditing(null);}},onError:()=>setNotice(t.error)});
 return <section className="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
 <h2 className="text-lg font-black">{t.categories}</h2><p className="text-xs leading-5 text-slate-500">{t.private}</p>
 {query.isPending?<p>{t.loading}</p>:query.isError?<p role="alert">{t.error} <Button onClick={()=>query.refetch()}>{t.retry}</Button></p>:<>
 <div className="flex flex-wrap gap-2">{query.data.categories.map(c=><button key={c.id} type="button" disabled={mutation.isPending} onClick={()=>{setEditing(c.id);setName(c.name);setNotice('');}} className="min-h-11 max-w-full break-words rounded-xl border bg-slate-50 px-3 py-2 text-sm font-semibold" aria-label={`${t.edit}: ${c.name}`}>{c.name} <span className="text-xs text-blue-700">{t.edit}</span></button>)}</div>
 <label className="block text-xs font-bold">{editing?t.edit:t.add}<input value={name} onChange={e=>setName(e.target.value)} maxLength={60} placeholder={t.name} className={field}/></label><p className="text-xs text-slate-500">{t.categoryHelp}</p>
 <div className="flex flex-wrap gap-2"><Button type="button" disabled={!name.trim()||mutation.isPending} onClick={()=>{setNotice('');mutation.mutate({p_action:'save',p_category:editing,p_name:name.trim()});}}>{t.save}</Button>{editing&&<Button type="button" variant="outline" disabled={mutation.isPending} onClick={()=>{setEditing(null);setName('');}}>{t.cancel}</Button>}</div>
 <div className="space-y-3 border-t pt-3"><label className="block text-xs font-bold">{t.transaction}<select className={field} value={transaction} onChange={e=>{setTransaction(e.target.value);setCategory(query.data.tags[e.target.value]||'');setNotice('');}}><option value="">—</option>{transactions.map(r=><option key={r.id} value={r.id}>{new Date(r.created_at).toLocaleDateString()} · {money(r.amount,lang)} {r.currency} · {r.note||r.id.slice(0,8)}</option>)}</select></label>
 {transaction&&<><p dir="auto" className="break-words text-sm text-slate-600">{transactions.find(r=>r.id===transaction)?.note}</p><label className="block text-xs font-bold">{t.choose}<select className={field} value={category} onChange={e=>setCategory(e.target.value)}><option value="">{t.none}</option>{query.data.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><Button type="button" disabled={mutation.isPending} onClick={()=>{setNotice('');mutation.mutate({p_action:'tag',p_request:transaction,p_category:category||null});}}>{t.assign}</Button></>}
 </div></>}
 {notice&&<p role="status" className="text-sm">{notice}</p>}
 </section>;
}
