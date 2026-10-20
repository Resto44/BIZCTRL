import React,{useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ArrowDownLeft,ArrowUpRight,ChevronDown,ChevronRight,Clock3,Search,XCircle} from 'lucide-react';
import {supabase} from '@/api/supabaseClient';
import {Button} from '@/components/ui/button';
const copy={
 en:{title:'Transaction history',subtitle:'Owner Treasury',all:'All',incoming:'Incoming',outgoing:'Outgoing',pending:'Pending',month:'Month',allMonths:'All months',search:'Search by name',unchanged:'No balance change',balance:'Beneficiary balance',before:'Before',after:'After',details:'Transaction details'},
 ar:{title:'سجل المعاملات',subtitle:'خزينة المالك',all:'الكل',incoming:'وارد',outgoing:'صادر',pending:'معلق',month:'الشهر',allMonths:'كل الأشهر',search:'بحث بالاسم',unchanged:'لا تغيير في الرصيد',balance:'رصيد المستفيد',before:'قبل',after:'بعد',details:'تفاصيل المعاملة'},
 fa:{title:'تاریخچه معاملات',subtitle:'خزانه اونر',all:'همه',incoming:'ورودی',outgoing:'خروجی',pending:'منتظر',month:'ماه',allMonths:'تمام ماه‌ها',search:'جستجوی نام',unchanged:'بدون تغییر موجودی',balance:'موجودی مستفید',before:'قبلی',after:'بعدی',details:'جزئیات معامله'}
};
export default function OwnerWalletTimeline({tenant,currency,lang,t,money,onOpenWallet,onReview,renderReview,busy=false}){
 const c=copy[lang]||copy.en,locale=lang==='fa'?'fa-AF':lang==='ar'?'ar-SA':'en-GB';
 const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Riyadh';
 const [filter,setFilter]=useState('all'),[month,setMonth]=useState(''),[search,setSearch]=useState(''),[term,setTerm]=useState(''),[offset,setOffset]=useState(0),[expanded,setExpanded]=useState(null);
 useEffect(()=>{const timer=setTimeout(()=>{setTerm(search.trim());setOffset(0);},300);return()=>clearTimeout(timer);},[search]);
 const query=useQuery({queryKey:['erp-owner-wallet-timeline',tenant,currency,filter,month,term,offset,timezone],enabled:!!tenant,
 queryFn:async()=>{const {data,error}=await supabase.rpc('erp_bank_wallet_owner_timeline',{p_restaurant:tenant,p_currency:currency,p_filter:filter,p_offset:offset,p_month:month,p_timezone:timezone,p_search:term});if(error)throw error;if(!Array.isArray(data?.transactions)||!Number.isInteger(data.total))throw Error('WALLET_INVALID_HISTORY');return data;},refetchInterval:20000});
 const rows=query.data?.transactions||[],ready=query.isSuccess&&!query.isError;
 const groups=[];if(ready)for(const r of rows){const day=r.activity_day||new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.activity_at));let group=groups.at(-1);if(!group||group.day!==day){group={day,rows:[]};groups.push(group);}group.rows.push(r);}
 const reset=()=>{setOffset(0);setExpanded(null);};
 return <section aria-label={c.title} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
  <header className="space-y-3 bg-slate-950 p-4 text-white">
   <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-black">{c.title}</h2><p className="mt-0.5 text-xs text-slate-300">{c.subtitle} · {currency}</p></div><label className="min-w-0 text-xs text-slate-300">{c.month}<input aria-label={c.month} type="month" value={month} onChange={e=>{setMonth(e.target.value);reset();}} className="mt-1 block h-10 max-w-[11rem] rounded-lg border border-white/20 bg-slate-800 px-2 text-sm text-white [color-scheme:dark]"/></label></div>
   <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3"><Search aria-hidden="true" className="size-4 shrink-0 text-slate-300"/><input aria-label={c.search} placeholder={c.search} maxLength={100} value={search} onChange={e=>setSearch(e.target.value)} className="h-11 w-full min-w-0 bg-transparent text-base text-white placeholder:text-slate-400 focus:outline-none"/>{month&&<button type="button" onClick={()=>{setMonth('');reset();}} className="shrink-0 text-xs text-blue-200">{c.allMonths}</button>}</div>
  </header>
  <div className="flex gap-1.5 overflow-x-auto bg-slate-50 px-3 py-2.5">{['all','incoming','outgoing','pending'].map(key=><button key={key} type="button" aria-pressed={filter===key} onClick={()=>{setFilter(key);reset();}} className={'min-h-10 shrink-0 rounded-full px-3 text-xs font-bold transition-colors '+(filter===key?'bg-blue-600 text-white':'bg-white text-slate-600 hover:bg-slate-100')}>{c[key]}</button>)}</div>
  {query.isPending&&<p role="status" className="p-4 text-sm">{t.loading}</p>}
  {query.isError&&<div role="alert" className="p-4 text-sm text-rose-800">{t.error}<Button onClick={()=>query.refetch()} variant="outline" className="ms-2">{t.retry}</Button></div>}
  {ready&&!rows.length&&<p className="p-5 text-center text-sm text-slate-500">{t.empty}</p>}
  {groups.map(group=><section key={group.day} className="px-3 sm:px-4">
   <h3 className="flex items-center gap-3 py-3 text-xs font-black uppercase tracking-wide text-slate-700"><time dateTime={group.day}>{new Date(group.rows[0].activity_at).toLocaleDateString(locale,{timeZone:timezone,day:'numeric',month:'short',year:'numeric'})}</time><span className="h-px flex-1 bg-slate-200"/></h3>
   <div>{group.rows.map((r,index)=>{const posted=r.status==='posted',incoming=r.kind==='return_to_owner',isOpen=expanded===r.id;
    const Icon=r.status==='pending'?Clock3:r.status==='rejected'?XCircle:incoming?ArrowDownLeft:ArrowUpRight;
    const color=r.status==='pending'?'text-amber-700':!posted?'text-slate-500':incoming?'text-emerald-700':'text-rose-700';
    const iconBg=r.status==='pending'?'bg-amber-50':!posted?'bg-slate-100':incoming?'bg-emerald-50':'bg-rose-50';
    return <article key={r.id} className="relative min-w-0 pb-2">
     {index<group.rows.length-1&&<span aria-hidden="true" className="absolute start-[17px] top-9 bottom-0 w-px bg-slate-200"/>}
     <button type="button" aria-label={`${c.details}: ${r.person_name}`} aria-expanded={isOpen} aria-controls={`owner-history-${r.id}`} onClick={()=>setExpanded(isOpen?null:r.id)} className="relative flex min-h-[76px] w-full min-w-0 items-start gap-2.5 rounded-xl py-1.5 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
      <span className={`z-10 grid size-9 shrink-0 place-items-center rounded-full ${iconBg} ${color}`}><Icon aria-hidden="true" className="size-5"/></span>
      <span className="min-w-0 flex-1">
       <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5"><b dir="auto" className="break-words text-sm font-black text-slate-950">{r.person_name}</b><strong dir="ltr" className={`whitespace-nowrap text-sm font-black tabular-nums ${color}`}>{posted?(incoming?'+':'−'):''}{money(r.amount)}</strong></span>
       <span className="mt-0.5 block text-[11px] leading-5 text-slate-500">{incoming?c.incoming:c.outgoing} · {t[r.status]||c.pending} · {new Date(r.activity_at).toLocaleTimeString(locale,{timeZone:timezone,hour:'2-digit',minute:'2-digit'})}</span>
       <span className="block text-[11px] leading-5 text-slate-600">{posted?<>{c.balance}: <span dir="ltr" className="inline-block font-semibold tabular-nums text-slate-800"><span className="sr-only">{c.before} </span>{r.balance_before==null?'—':money(r.balance_before)} → <span className="sr-only">{c.after} </span>{r.balance_after==null?'—':money(r.balance_after)}</span></>:c.unchanged}</span>
      </span>
      {isOpen?<ChevronDown aria-hidden="true" className="mt-1 size-4 shrink-0 text-slate-400"/>:<ChevronRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-slate-400 rtl:rotate-180"/>}
     </button>
     {isOpen&&<div id={`owner-history-${r.id}`} className="ms-11 mb-2 space-y-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
      <p>{r.initiated_by_owner?t.owner:t.request}</p>{r.note&&<p dir="auto" className="break-words">{r.note}</p>}{r.account_name&&<p>{t.account}: <b dir="auto">{r.account_name}</b></p>}{r.review_note&&<p dir="auto" className="break-words">{r.review_note}</p>}
      {r.is_active&&<button type="button" disabled={busy} className="min-h-10 text-sm font-bold text-blue-700 disabled:opacity-50" onClick={()=>r.status==='pending'?onReview(r):onOpenWallet(r.person_id)}>{r.status==='pending'?t.review:t.open}</button>}
      {renderReview(r)}
     </div>}
    </article>;
   })}</div>
  </section>)}
  <div className="flex items-center justify-between gap-2 border-t px-3 py-2"><Button size="sm" variant="ghost" disabled={offset===0||query.isFetching} onClick={()=>{setOffset(x=>Math.max(0,x-50));setExpanded(null);}}>{t.previous}</Button><span className="text-xs text-slate-500">{ready?`${Math.min(offset+1,query.data.total)}–${Math.min(offset+50,query.data.total)} / ${query.data.total}`:'—'}</span><Button size="sm" variant="ghost" disabled={!ready||offset+50>=query.data.total||query.isFetching} onClick={()=>{setOffset(x=>x+50);setExpanded(null);}}>{t.next}</Button></div>
 </section>;
}
