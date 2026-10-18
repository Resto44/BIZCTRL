import React,{useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {useLanguage} from '@/lib/LanguageContext';
import {partnerText,partnerError,readPartnerPreferences} from '@/lib/partnerTreasury';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Card} from '@/components/ui/card';

// Separate external portal: no staff membership, owner wallet access, or branch permissions.
export default function PartnerPortal(){
 const {lang,setLang}=useLanguage(); const t=partnerText(lang); const qc=useQueryClient();
 const [session,setSession]=useState(null); const [authLoading,setAuthLoading]=useState(true);
 const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
 const [token,setToken]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('invite')||new URLSearchParams(window.location.search).get('invite')||sessionStorage.getItem('partner:invite')||'');
 const [busy,setBusy]=useState(false); const lock=useRef(false); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
 const [selected,setSelected]=useState(''); const [offset,setOffset]=useState(0);
 const [preferences,setPreferences]=useState({title:'',showBalances:true,compact:false});
 useEffect(()=>{let live=true;supabase.auth.getSession().then(({data,error})=>{if(live){setSession(data?.session||null);setAuthLoading(false);if(error)setError(t.failed);}});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{if(live){setSession(next);setAuthLoading(false);}});
  return()=>{live=false;subscription.unsubscribe();};
 },[]);
 useEffect(()=>{if(token){sessionStorage.setItem('partner:invite',token);if(!authLoading)history.replaceState(null,'',window.location.pathname);} },[token,authLoading]);
 useEffect(()=>{setPreferences(readPartnerPreferences(session?.user?.id));setSelected('');setOffset(0);},[session?.user?.id]);
 const updatePreference=(key,value)=>setPreferences(p=>{const next={...p,[key]:value};try{localStorage.setItem(`partner-view:${session?.user?.id}:portal`,JSON.stringify(next));}catch{/* display still works */}return next;});
 const accounts=useQuery({queryKey:['partner-portal-accounts',session?.user?.id],enabled:!!session?.user?.id,
  queryFn:async()=>{const {data,error}=await supabase.rpc('erp_partner_portal_accounts');if(error)throw error;return data||[];},refetchInterval:15000});
 const partner=accounts.data?.find(p=>p.id===selected)||accounts.data?.[0];
 const statement=useQuery({queryKey:['partner-portal-statement',session?.user?.id,partner?.id,offset],enabled:!!session?.user?.id&&!!partner?.id,
  queryFn:async()=>{const {data,error}=await supabase.rpc('erp_partner_portal_statement',{p_partner_id:partner.id,p_offset:offset});if(error)throw error;return data;},refetchInterval:15000});
 const run=async(fn)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(partnerError(e,t));}finally{lock.current=false;setBusy(false);}};
 const authenticate=(signup)=>run(async()=>{
  if(!email.trim()||!password||(signup&&password.length<10))throw Error('INVALID');
  const payload={email:email.trim().toLowerCase(),password};
  const result=signup?await supabase.auth.signUp({...payload,options:{emailRedirectTo:`${window.location.origin}/partner-portal?invite=${encodeURIComponent(token)}`,data:{partner_invitation_token:token}}}):await supabase.auth.signInWithPassword(payload);
  if(result.error)throw result.error;
  if(result.data.session)setSession(result.data.session);else setNotice(t.verify);
 });
 const activate=()=>run(async()=>{const {data,error}=await supabase.rpc('erp_accept_partner_invitation',{p_token:token});if(error)throw error;
  setSelected(data);setToken('');sessionStorage.removeItem('partner:invite');await accounts.refetch();});
 const confirm=(id)=>run(async()=>{const {error}=await supabase.rpc('erp_confirm_partner_transaction',{p_transaction_id:id});if(error)throw error;await statement.refetch();});
 const signOut=()=>run(async()=>{const {error}=await supabase.auth.signOut();if(error)throw error;setSession(null);qc.removeQueries({queryKey:['partner-portal-statement']});qc.removeQueries({queryKey:['partner-portal-accounts']});});
 const money=(n,c)=>`${new Intl.NumberFormat(lang==='fa'?'fa-AF':lang==='ar'?'ar-SA':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n))} ${c}`;
 return <main dir={lang==='en'?'ltr':'rtl'} className="mx-auto min-h-screen max-w-5xl space-y-4 bg-background p-4 pb-12 sm:p-6">
  <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"><div><p className="font-bold text-blue-600">BizCTRL</p><h1 className="text-xl font-extrabold">{preferences.title||t.portal}</h1></div>
   <div className="flex gap-2"><select aria-label="Language" className="rounded-lg border bg-background p-2" value={lang} onChange={e=>setLang(e.target.value)}><option value="fa">فارسی</option><option value="ar">العربية</option><option value="en">English</option></select>
   {session&&<Button variant="outline" disabled={busy} onClick={signOut}>{t.signOut}</Button>}</div></header>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}{notice&&<p role="status" className="rounded-xl bg-green-50 p-3 text-green-800">{notice}</p>}
  {authLoading?<p>{t.loading}</p>:!session?<Card className="mx-auto max-w-md space-y-4 p-5"><h2 className="font-bold">{t.signIn}</h2><p className="text-sm">{t.accountHelp}</p>
   <form className="space-y-3" onSubmit={e=>{e.preventDefault();authenticate(false);}}><label className="block">{t.email}<Input type="email" required value={email} autoComplete="email" dir="ltr" onChange={e=>setEmail(e.target.value)}/></label>
   <label className="block">{t.password}<Input type="password" required value={password} autoComplete="current-password" dir="ltr" onChange={e=>setPassword(e.target.value)}/></label>
   <div className="flex flex-wrap gap-2"><Button disabled={busy} type="submit">{t.signIn}</Button>{token&&<Button type="button" variant="outline" disabled={busy||!email.trim()||password.length<10} onClick={()=>authenticate(true)}>{t.signUp}</Button>}</div></form></Card>:
   <>
    {token&&<Card className="space-y-3 p-4"><p>{session.user.email}</p><Button disabled={busy} onClick={activate}>{t.accept}</Button></Card>}
    {accounts.isLoading?<p>{t.loading}</p>:accounts.isError?<p role="alert">{t.failed}<Button onClick={()=>accounts.refetch()}>{t.refresh}</Button></p>:!partner?<p>{t.noAccounts}</p>:<>
     <Card className="flex flex-wrap items-center justify-between gap-3 p-4"><select aria-label={t.partners} className="min-w-0 flex-1 rounded-xl border bg-background p-3" value={partner.id} onChange={e=>{setSelected(e.target.value);setOffset(0);setError('');}}>
      {accounts.data.map(p=><option key={p.id} value={p.id}>{p.business} · {p.name}</option>)}
     </select><Button variant="outline" onClick={()=>{accounts.refetch();statement.refetch();}}>{t.refresh}</Button></Card>
     <details className="rounded-xl border p-4"><summary className="cursor-pointer font-bold">{t.customize}</summary><div className="mt-3 space-y-3"><label className="block text-sm">{t.customTitle}<Input maxLength={80} value={preferences.title} onChange={e=>updatePreference('title',e.target.value)}/></label>
      <label className="flex gap-2"><input type="checkbox" checked={preferences.showBalances} onChange={e=>updatePreference('showBalances',e.target.checked)}/>{t.showBalances}</label>
      <label className="flex gap-2"><input type="checkbox" checked={preferences.compact} onChange={e=>updatePreference('compact',e.target.checked)}/>{t.compact}</label><p className="text-xs text-muted-foreground">{t.preferencesHelp}</p></div></details>
     {statement.isLoading?<p>{t.loading}</p>:statement.isError?<p role="alert">{t.failed}</p>:statement.data&&<>
      {preferences.showBalances&&<section className="space-y-3"><p className="text-xs text-muted-foreground">{t.allTime}</p>{statement.data.balances.map(b=><div key={b.currency} className="grid grid-cols-2 gap-3">
       <Card className="min-w-0 bg-amber-50 p-4 text-amber-950"><p className="text-sm">{t.ownerOwes}</p><p dir="ltr" className="mt-2 break-words text-lg font-bold">{money(b.owner_owes,b.currency)}</p></Card>
       <Card className="min-w-0 bg-blue-50 p-4 text-blue-950"><p className="text-sm">{t.partnerOwes}</p><p dir="ltr" className="mt-2 break-words text-lg font-bold">{money(b.partner_owes,b.currency)}</p></Card>
      </div>)}</section>}
      <Card className="space-y-3 p-4"><h2 className="font-bold">{t.records} · {statement.data.count}</h2><p className="text-xs text-muted-foreground">{t.confirmationHelp}</p>
       {!statement.data.records.length&&<p>{t.noRecords}</p>}
       {statement.data.records.map(r=><article key={r.id} className={`rounded-xl border ${preferences.compact?'p-2':'p-4'} space-y-2`}><div className="flex flex-wrap justify-between gap-2"><strong>{t[r.kind]}</strong><strong dir="ltr">{money(r.amount,r.currency)}</strong></div>
        <p className="text-sm text-muted-foreground">{r.effective_date} · {t[r.payment_method]||'—'}</p>{r.external_reference&&<p dir="auto" className="break-words text-sm">{r.external_reference}</p>}{r.notes&&<p dir="auto" className="break-words text-sm">{r.notes}</p>}
        {r.confirmed_at?<p className="text-xs font-bold text-green-700">{t.confirmed}</p>:<Button size="sm" variant="outline" disabled={busy} onClick={()=>confirm(r.id)}>{t.confirm}</Button>}
       </article>)}
       <div className="flex justify-between"><Button variant="outline" disabled={offset===0} onClick={()=>setOffset(x=>Math.max(0,x-50))}>{t.previous}</Button><Button variant="outline" disabled={offset+50>=statement.data.count} onClick={()=>setOffset(x=>x+50)}>{t.next}</Button></div>
      </Card>
     </>}
    </>}
   </>}
 </main>;
}
