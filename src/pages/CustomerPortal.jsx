import React, { lazy, Suspense, useEffect, useState } from 'react';
import { customerAccountDisplayLabel } from '@/lib/customerAccountDisplay';
import CustomerIdentityCard from '@/components/customer/CustomerIdentityCard';
const CustomerAnalyticsDashboard = lazy(() => import('@/components/customer/CustomerAnalyticsDashboard'));
const PortalPushSettings = lazy(() => import('@/components/notifications/PortalPushSettings'));
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { withPortalReadDeadline } from '@/lib/portalReadDeadline';
import { customerPortalRpc, customerPortalText, customerPortalErrorMessage, portalStatus } from '@/lib/customerPortal';
import { customerInviteTokenFromHash, resolveCustomerInviteToken } from '@/lib/customerInviteLink';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function inviteToken() {
 const token = customerInviteTokenFromHash(window.location.hash);
 if (token) sessionStorage.setItem('customer:invite', token);
 return resolveCustomerInviteToken(window.location.hash, sessionStorage.getItem('customer:invite'));
}
export default function CustomerPortal() {
 const {lang,setLang}=useLanguage(), t=customerPortalText[lang]||customerPortalText.en, client=useQueryClient();
 const [session,setSession]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[invite,setInvite]=useState(inviteToken),[emailPending,setEmailPending]=useState(false);
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
 // Safari may keep this React page mounted when a newer email link changes only the URL hash.
 // Update the active invitation immediately; never keep using a superseded sessionStorage token.
 useEffect(()=>{
  const syncInvitationFromUrl = () => {
   const newest = customerInviteTokenFromHash(window.location.hash);
   if (!newest) return;
   sessionStorage.setItem('customer:invite', newest);
   setInvite(previous => previous === newest ? previous : newest);
   setError('');
   setNotice('');
  };
  window.addEventListener('hashchange', syncInvitationFromUrl);
  window.addEventListener('pageshow', syncInvitationFromUrl);
  return () => {
   window.removeEventListener('hashchange', syncInvitationFromUrl);
   window.removeEventListener('pageshow', syncInvitationFromUrl);
  };
 },[]);
 const accounts=useQuery({queryKey:['customer-portal','accounts',session?.user?.id],enabled:!!session?.user?.id,
  queryFn:()=>customerPortalRpc('erp_customer_portal_accounts'),refetchInterval:20000,retry:1});
 const account=accounts.isError?null:accounts.data?.find(a=>a.id===selected)||accounts.data?.[0];
 const statement=useQuery({queryKey:['customer-portal','statement',session?.user?.id,account?.id,kind,dates,page],enabled:!!session?.user?.id&&!!account,
  queryFn:()=>customerPortalRpc('erp_customer_portal_statement',{p_customer_id:account.id,p_kind:kind,p_from:dates.from||null,p_to:dates.to||null,p_page:page}),refetchInterval:5000,refetchIntervalInBackground:false,refetchOnWindowFocus:true,retry:1});
 const data=statement.isError?null:statement.data;
 const money=value=>`${Number(value||0).toLocaleString(lang==='en'?'en-US':lang==='ar'?'ar-SA':'fa-AF',{minimumFractionDigits:2,maximumFractionDigits:2})} ${account?.currency||''}`;
 async function run(action){if(busy)return;setBusy(true);setError('');setNotice('');try{await action();}catch(err){setError(customerPortalErrorMessage(err,t));if(/email[_ ]not[_ ]confirmed/i.test(String(err?.message||err?.code||'')))setEmailPending(true);}finally{setBusy(false);}}
 function authenticate(signup){return run(async()=>{
  const credentials={email:email.trim(),password};
  if(signup&&(!invite||password.length<10))throw Error('INVALID_SIGNUP');
  // The existing identity-only registration path grants no staff role or data access.
  const result=signup?await supabase.auth.signUp({...credentials,options:{emailRedirectTo:window.location.origin+'/customer-portal',data:{people_portal_registration:true}}}):await supabase.auth.signInWithPassword(credentials);
  if(result.error)throw result.error;if(result.data.session){setSession(result.data.session);setEmailPending(false);}else{setEmailPending(true);setNotice(t.verify);}
 });}
 function signOutForInvitation(){return run(async()=>{
  const {error}=await supabase.auth.signOut();
  if(error)throw error;
  setSession(null);
  setEmail('');
  setPassword('');
  setEmailPending(false);
  client.removeQueries({queryKey:['customer-portal']});
  if(invite)setNotice(t.signoutSwitchHelp);
 });}
 function resendConfirmation(){return run(async()=>{
  if(!email.trim())throw Error('EMAIL_REQUIRED');
  const {error}=await supabase.auth.resend({type:'signup',email:email.trim(),options:{emailRedirectTo:window.location.origin+'/customer-portal'}});
  if(error)throw error;
  setNotice(t.confirmationRequested);
 });}
 // An active customer account may have an obsolete invite saved in Safari sessionStorage.
 // Never silently discard a second legitimate invitation; let the customer dismiss it.
 function dismissInvitation() {
  setInvite('');
  setError('');
  sessionStorage.removeItem('customer:invite');
  if (customerInviteTokenFromHash(window.location.hash)) {
   window.history.replaceState(null,'',window.location.pathname+window.location.search);
  }
 }
 function activateInvitation(){return run(async()=>{
  const accepted=await customerPortalRpc('erp_customer_portal_accept',{p_token:invite});
  dismissInvitation();
  setSelected(accepted.customer_id);
  setPage(0);
  await accounts.refetch();
 });}
 function refreshDashboard(){
  accounts.refetch();
  statement.refetch();
  client.invalidateQueries({queryKey:['customer-portal','analytics',account?.id]});
 }
 const statementAsOf=data?.as_of ? new Date(data.as_of).toLocaleString(
  lang==='ar'?'ar-SA':lang==='fa'?'fa-AF':'en-US',
  {timeZone:'Asia/Riyadh',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}
 ) : '—';
 return <main data-i18n-skip="true" dir={lang==='en'?'ltr':'rtl'} className="min-h-screen w-full max-w-full min-w-0 overflow-x-clip bg-slate-50 text-slate-900">
  <div className="mx-auto w-full min-w-0 max-w-6xl space-y-3 overflow-x-clip px-3 pb-4 pt-1 sm:space-y-5 sm:p-6">
   <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b pb-3 sm:gap-4 sm:pb-5">
    <div className="min-w-0 max-w-full break-words"><p className="text-sm font-bold text-teal-700">BizControl</p><h1 className="text-2xl font-black leading-tight">{t.title}</h1><p className="text-sm leading-snug text-slate-600">{t.subtitle}</p></div>
    <div className="flex flex-wrap items-center gap-2 print:hidden"><select aria-label="Language" className="min-h-11 rounded-lg border bg-white px-2 py-1" value={lang} onChange={e=>setLang(e.target.value)}><option value="fa">فارسی</option><option value="ar">العربية</option><option value="en">English</option></select>
    {session&&<Button variant="outline" disabled={busy} onClick={signOutForInvitation}>{t.signout}</Button>}</div>
   </header>
   {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
   {notice&&<p role="status" className="rounded-lg bg-teal-50 p-3">{notice}</p>}
   {loading?<p role="status">{t.loading}</p>:!session?<form className="mx-auto max-w-md space-y-4 rounded-2xl border bg-white p-6 shadow-sm" onSubmit={e=>{e.preventDefault();authenticate(false);}}>
    <label className="block">{t.email}<Input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} /></label>
    <label className="block">{t.password}<Input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <Button disabled={busy} className="w-full">{t.signin}</Button>
    {invite&&<Button type="button" variant="outline" disabled={busy||password.length<10||!email.includes('@')} className="w-full" onClick={()=>authenticate(true)}>{t.signup}</Button>}
    {invite&&<><Button type="button" variant="outline" disabled={busy||!email.includes('@')} className="w-full" onClick={resendConfirmation}>{t.resendConfirmation}</Button><p className="text-xs text-slate-500">{t.confirmEmailHelp}</p></>}
    <p className="text-sm text-slate-500">{emailPending?t.emailNotVerified:invite?t.verify:t.empty}</p>
   </form>:<>
    {invite && !accounts.isPending && !accounts.isError && account ? <aside className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm print:hidden">
     <p className="min-w-0 flex-1 leading-relaxed text-amber-950">{t.additionalInviteHint}</p>
     <div className="flex flex-wrap gap-2">
      <Button disabled={busy} onClick={activateInvitation}>{t.activate}</Button>
      <Button variant="outline" disabled={busy} onClick={dismissInvitation}>{t.dismissInvite}</Button>
     </div>
    </aside> : null}
    {invite && !accounts.isPending && !accounts.isError && !account && <>
     <p className="break-words text-sm text-slate-600">{t.email}: <span dir="ltr" className="break-all">{session.user.email}</span> · {t.customerInviteHelp}</p>
     <p className="text-sm leading-relaxed text-amber-900">{t.accountMismatchHelp}</p>
     <div className="flex flex-wrap gap-2">
      <Button disabled={busy} onClick={activateInvitation}>{t.activate}</Button>
      <Button variant="outline" disabled={busy} onClick={signOutForInvitation}>{t.switchAccount}</Button>
      <Button variant="ghost" disabled={busy} onClick={dismissInvitation}>{t.dismissInvite}</Button>
     </div>
    </>}
    {accounts.isPending?<p role="status">{t.loading}</p>:accounts.isError?<div role="alert">{t.error} <Button onClick={()=>accounts.refetch()}>{t.refresh}</Button></div>:!account?<p>{t.empty}</p>:<>
     <section className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2">
      <label className="block w-full min-w-0 max-w-full text-sm font-semibold sm:max-w-xl">{t.account}<select aria-label={t.account} title={customerAccountDisplayLabel(account)} className="mt-1 block box-border min-h-11 w-full min-w-0 max-w-full truncate rounded-lg border bg-white px-3 py-2 text-base" value={account.id} onChange={e=>{setSelected(e.target.value);setPage(0);}}>{accounts.data.map(a=><option key={a.id} value={a.id}>{customerAccountDisplayLabel(a)}</option>)}</select></label>
      <div className="flex w-full min-w-0 flex-wrap gap-2 print:hidden sm:w-auto"><Button variant="outline" onClick={refreshDashboard}>{t.refresh}</Button><Button disabled={!data} onClick={()=>window.print()}>{t.print}</Button></div>
     </section>
     <CustomerIdentityCard key={account.id} account={account} lang={lang}/>
     <Suspense fallback={<p role="status" className="rounded-xl border bg-white p-4 text-sm text-slate-500">{t.loading}</p>}>
      <PortalPushSettings key={'push-'+account.id} role="customer" customerId={account.id} language={lang}/>
      <CustomerAnalyticsDashboard key={account.id} account={account} lang={lang}/>
     </Suspense>
     {statement.isError?<p role="alert" className="rounded-lg bg-red-50 p-4">{t.error}</p>:statement.isPending?<p role="status">{t.loading}</p>:data&&<>
      <p className="text-sm text-slate-600">{t.allTime} · {statementAsOf} · {t.timezoneSaudi}</p>
      <section className="grid min-w-0 grid-cols-1 gap-3 min-[380px]:grid-cols-2 lg:grid-cols-4">{['total','paid','balance','overdue'].map(key=><article key={key} className="min-w-0 rounded-2xl border bg-white p-4 shadow-sm"><h2 className="text-sm text-slate-600">{t[key]}</h2><p className={`mt-2 break-words text-xl font-black ${key==='overdue'?'text-rose-700':'text-teal-800'}`}>{money(data.totals[key])}</p></article>)}</section>
     </>}
     <nav className="grid min-w-0 grid-cols-1 gap-2 print:hidden min-[390px]:grid-cols-2 sm:flex sm:flex-wrap">{['invoices','payments','orders'].map(k=><Button key={k} variant={kind===k?'default':'outline'} aria-pressed={kind===k} className="min-w-0 w-full whitespace-normal text-center sm:w-auto" onClick={()=>{setKind(k);setPage(0);}}>{t[k==='orders'?'purchases':k]}</Button>)}</nav>
     <form className="grid min-w-0 grid-cols-1 items-end gap-3 print:hidden sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={e=>{e.preventDefault();setDates({from,to});setPage(0);}}>
      <label className="block min-w-0 text-sm font-semibold">{t.from}<Input className="mt-1 w-full min-w-0 max-w-full" type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/></label>
      <label className="block min-w-0 text-sm font-semibold">{t.to}<Input className="mt-1 w-full min-w-0 max-w-full" type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label>
      <Button variant="outline" className="w-full sm:w-auto">{t.filter}</Button>
     </form>
     {data&&<section className="space-y-3">
      <h2 className="font-bold">{t[kind==='orders'?'purchases':kind]} · {data.count}</h2>
      {(dates.from||dates.to)&&<p>{dates.from||'…'} — {dates.to||'…'}</p>}
      {!data.rows.length&&<p className="rounded-xl border bg-white p-6">{t.noRecords}</p>}
      {data.rows.map(row=><article key={row.id} className="min-w-0 max-w-full rounded-xl border bg-white p-4 shadow-sm break-inside-avoid">
       <div className="flex min-w-0 flex-wrap justify-between gap-3"><div className="min-w-0 max-w-full break-words"><strong className="break-all">{t.reference}: {row.reference||'—'}</strong><p className="text-sm text-slate-500">{String(row.date||'').slice(0,10)}</p>{kind==='invoices'&&<p className="mt-1 text-xs font-medium text-teal-700">{row.invoice_source==='restaurant_pos'?(lang==='ar'?'فاتورة آجل من الكاشير':lang==='fa'?'فاکتور نسیه از کاشیر':'Credit invoice from POS'):row.invoice_source==='sales_closing'?(lang==='ar'?'فاتورة آجل من إقفال المبيعات':lang==='fa'?'فاکتور نسیه از کلوزینگ':'Credit invoice from Sales Closing'):''}</p>}</div><strong className="text-lg">{money(row.amount)}</strong></div>
       <details className="mt-3" open={kind==='invoices'&&Array.isArray(row.items)&&row.items.length>0?true:undefined}><summary className="cursor-pointer text-sm font-semibold text-teal-700">{t.details}{kind==='invoices'&&row.items?.length?` · ${row.items.length}`:''}</summary><dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        {kind==='invoices'?<><div><dt>{t.paid}</dt><dd>{money(row.paid_amount)}</dd></div><div><dt>{t.remaining}</dt><dd>{money(row.remaining_amount)}</dd></div><div><dt>{t.due}</dt><dd>{row.due_date||'—'}</dd></div></>:null}
        {kind==='payments'?<><div><dt>{t.method}</dt><dd>{portalStatus(row.payment_method,lang)}</dd></div><div><dt>{t.reference}</dt><dd>{row.invoice_number||'—'}</dd></div></>:<div><dt>{t.status}</dt><dd>{portalStatus(row.status,lang)}</dd></div>}
        </dl>{row.items?.map((item,index)=><p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm" key={item.id}>{index+1}. {item['name_'+lang]||item.name||'—'} · {t.quantity}: {item.quantity} · {t.price}: {money(item.unit_price)} · {money(item.total_price)}</p>)}
       </details>
      </article>)}
      <div className="flex min-w-0 flex-wrap items-center justify-center gap-3 print:hidden"><Button variant="outline" disabled={page===0} onClick={()=>setPage(p=>p-1)}>{t.previous}</Button><span>{page+1} / {Math.max(1,Math.ceil(data.count/25))}</span><Button variant="outline" disabled={(page+1)*25>=data.count} onClick={()=>setPage(p=>p+1)}>{t.next}</Button></div>
      <p className="text-xs text-slate-500">{t.notice}</p>
     </section>}
    </>}
   </>}
  </div>
 </main>;
}
