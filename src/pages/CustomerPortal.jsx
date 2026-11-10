import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { withPortalReadDeadline } from '@/lib/portalReadDeadline';
import { customerPortalRpc, customerPortalText, portalStatus } from '@/lib/customerPortal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function inviteToken() {
 const token = new URLSearchParams(window.location.hash.slice(1)).get('invite');
 if(token)sessionStorage.setItem('customer:invite',token);
 return token || sessionStorage.getItem('customer:invite') || '';
}
export default function CustomerPortal() {
 const {lang,setLang}=useLanguage(), t=customerPortalText[lang]||customerPortalText.en, client=useQueryClient();
 const [session,setSession]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[invite,setInvite]=useState(inviteToken);
 const [selected,setSelected]=useState(''),[kind,setKind]=useState('invoices'),[page,setPage]=useState(0),[from,setFrom]=useState(''),[to,setTo]=useState(''),[dates,setDates]=useState({from:'',to:''});
 useEffect(()=>{
  let live=true,authEvent=false;
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{authEvent=true;if(live){setSession(next);setLoading(false);}});
  withPortalReadDeadline(supabase.auth.getSession(),8000,'CUSTOMER_SESSION_TIMEOUT').then(({data,error})=>{
   if(live&&!authEvent){if(error)setError(t.error);setSession(data?.session||null);setLoading(false);}
  }).catch(()=>{if(live&&!authEvent){setError(t.error);setLoading(false);}});
  return()=>{live=false;subscription.unsubscribe();};
 },[]);
 useEffect(()=>{setSelected('');setPage(0);},[session?.user?.id]);
 const accounts=useQuery({queryKey:['customer-portal','accounts',session?.user?.id],enabled:!!session?.user?.id,
  queryFn:()=>customerPortalRpc('erp_customer_portal_accounts'),refetchInterval:20000,retry:1});
 const account=accounts.isError?null:accounts.data?.find(a=>a.id===selected)||accounts.data?.[0];
 const statement=useQuery({queryKey:['customer-portal','statement',session?.user?.id,account?.id,kind,dates,page],enabled:!!session?.user?.id&&!!account,
  queryFn:()=>customerPortalRpc('erp_customer_portal_statement',{p_customer_id:account.id,p_kind:kind,p_from:dates.from||null,p_to:dates.to||null,p_page:page}),refetchInterval:20000,retry:1});
 const data=statement.isError?null:statement.data;
 const money=value=>`${Number(value||0).toLocaleString(lang==='en'?'en-US':lang==='ar'?'ar-SA':'fa-AF',{minimumFractionDigits:2,maximumFractionDigits:2})} ${account?.currency||''}`;
 async function run(action){if(busy)return;setBusy(true);setError('');setNotice('');try{await action();}catch{setError(t.failed);}finally{setBusy(false);}}
 function authenticate(signup){return run(async()=>{
  const credentials={email:email.trim(),password};
  if(signup&&(!invite||password.length<10))throw Error('INVALID_SIGNUP');
  // The existing identity-only registration path grants no staff role or data access.
  const result=signup?await supabase.auth.signUp({...credentials,options:{emailRedirectTo:window.location.origin+'/customer-portal',data:{people_portal_registration:true}}}):await supabase.auth.signInWithPassword(credentials);
  if(result.error)throw result.error;if(result.data.session)setSession(result.data.session);else setNotice(t.verify);
 });}
 return <main dir={lang==='en'?'ltr':'rtl'} className="min-h-screen bg-slate-50 text-slate-900">
  <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
   <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
    <div><p className="text-sm font-bold text-teal-700">BizControl</p><h1 className="text-2xl font-black">{t.title}</h1><p className="text-sm text-slate-600">{t.subtitle}</p></div>
    <div className="flex flex-wrap gap-2 print:hidden"><select aria-label="Language" className="rounded-lg border bg-white p-2" value={lang} onChange={e=>setLang(e.target.value)}><option value="fa">فارسی</option><option value="ar">العربية</option><option value="en">English</option></select>
    {session&&<Button variant="outline" disabled={busy} onClick={()=>run(async()=>{const {error}=await supabase.auth.signOut();if(error)throw error;setSession(null);client.removeQueries({queryKey:['customer-portal']});})}>{t.signout}</Button>}</div>
   </header>
   {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
   {notice&&<p role="status" className="rounded-lg bg-teal-50 p-3">{notice}</p>}
   {loading?<p role="status">{t.loading}</p>:!session?<form className="mx-auto max-w-md space-y-4 rounded-2xl border bg-white p-6 shadow-sm" onSubmit={e=>{e.preventDefault();authenticate(false);}}>
    <label className="block">{t.email}<Input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} /></label>
    <label className="block">{t.password}<Input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <Button disabled={busy} className="w-full">{t.signin}</Button>
    {invite&&<Button type="button" variant="outline" disabled={busy||password.length<10||!email.includes('@')} className="w-full" onClick={()=>authenticate(true)}>{t.signup}</Button>}
    <p className="text-sm text-slate-500">{invite?t.verify:t.empty}</p>
   </form>:<>
    {invite&&<Button disabled={busy} onClick={()=>run(async()=>{const accepted=await customerPortalRpc('erp_customer_portal_accept',{p_token:invite});setInvite('');sessionStorage.removeItem('customer:invite');window.history.replaceState(null,'',window.location.pathname);setSelected(accepted.customer_id);await accounts.refetch();})}>{t.activate}</Button>}
    {accounts.isPending?<p role="status">{t.loading}</p>:accounts.isError?<div role="alert">{t.error} <Button onClick={()=>accounts.refetch()}>{t.refresh}</Button></div>:!account?<p>{t.empty}</p>:<>
     <section className="flex flex-wrap items-center justify-between gap-3">
      <label className="min-w-0">{t.account}<select className="mx-2 max-w-full rounded-lg border bg-white p-3" value={account.id} onChange={e=>{setSelected(e.target.value);setPage(0);}}>{accounts.data.map(a=><option key={a.id} value={a.id}>{a.business} · {a.name} · {a.branch}</option>)}</select></label>
      <div className="flex gap-2 print:hidden"><Button variant="outline" onClick={()=>{accounts.refetch();statement.refetch();}}>{t.refresh}</Button><Button disabled={!data} onClick={()=>window.print()}>{t.print}</Button></div>
     </section>
     {statement.isError?<p role="alert" className="rounded-lg bg-red-50 p-4">{t.error}</p>:statement.isPending?<p role="status">{t.loading}</p>:data&&<>
      <p className="text-sm text-slate-600">{t.allTime} · {new Date(data.as_of).toLocaleString()}</p>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{['total','paid','balance','overdue'].map(key=><article key={key} className="min-w-0 rounded-2xl border bg-white p-4 shadow-sm"><h2 className="text-sm text-slate-600">{t[key]}</h2><p className={`mt-2 break-words text-xl font-black ${key==='overdue'?'text-rose-700':'text-teal-800'}`}>{money(data.totals[key])}</p></article>)}</section>
     </>}
     <nav className="flex flex-wrap gap-2 print:hidden">{['invoices','payments','orders'].map(k=><Button key={k} variant={kind===k?'default':'outline'} aria-pressed={kind===k} onClick={()=>{setKind(k);setPage(0);}}>{t[k==='orders'?'purchases':k]}</Button>)}</nav>
     <form className="flex flex-wrap items-end gap-3 print:hidden" onSubmit={e=>{e.preventDefault();setDates({from,to});setPage(0);}}><label>{t.from}<Input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/></label><label>{t.to}<Input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label><Button variant="outline">{t.filter}</Button></form>
     {data&&<section className="space-y-3">
      <h2 className="font-bold">{t[kind==='orders'?'purchases':kind]} · {data.count}</h2>
      {(dates.from||dates.to)&&<p>{dates.from||'…'} — {dates.to||'…'}</p>}
      {!data.rows.length&&<p className="rounded-xl border bg-white p-6">{t.noRecords}</p>}
      {data.rows.map(row=><article key={row.id} className="rounded-xl border bg-white p-4 shadow-sm break-inside-avoid">
       <div className="flex flex-wrap justify-between gap-3"><div><strong>{t.reference}: {row.reference||'—'}</strong><p className="text-sm text-slate-500">{String(row.date||'').slice(0,10)}</p></div><strong className="text-lg">{money(row.amount)}</strong></div>
       <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-teal-700">{t.details}</summary><dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        {kind==='invoices'?<><div><dt>{t.paid}</dt><dd>{money(row.paid_amount)}</dd></div><div><dt>{t.remaining}</dt><dd>{money(row.remaining_amount)}</dd></div><div><dt>{t.due}</dt><dd>{row.due_date||'—'}</dd></div></>:null}
        {kind==='payments'?<><div><dt>{t.method}</dt><dd>{portalStatus(row.payment_method,lang)}</dd></div><div><dt>{t.reference}</dt><dd>{row.invoice_number||'—'}</dd></div></>:<div><dt>{t.status}</dt><dd>{portalStatus(row.status,lang)}</dd></div>}
        </dl>{row.items?.map((item,index)=><p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm" key={item.id}>{index+1}. {item['name_'+lang]||item.name||'—'} · {t.quantity}: {item.quantity} · {t.price}: {money(item.unit_price)} · {money(item.total_price)}</p>)}
       </details>
      </article>)}
      <div className="flex items-center justify-center gap-3 print:hidden"><Button variant="outline" disabled={page===0} onClick={()=>setPage(p=>p-1)}>{t.previous}</Button><span>{page+1} / {Math.max(1,Math.ceil(data.count/25))}</span><Button variant="outline" disabled={(page+1)*25>=data.count} onClick={()=>setPage(p=>p+1)}>{t.next}</Button></div>
      <p className="text-xs text-slate-500">{t.notice}</p>
     </section>}
    </>}
   </>}
  </div>
 </main>;
}
