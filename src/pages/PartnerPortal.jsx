import React,{useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {useLanguage} from '@/lib/LanguageContext';
import {partnerError,readPartnerPreferences} from '@/lib/partnerTreasury';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Card} from '@/components/ui/card';
import {peopleText} from '@/lib/peopleAccounts';
import PeopleMemberships from '@/components/settlement/PeopleMemberships';
import PartnerTransactionRequests from '@/components/settlement/PartnerTransactionRequests';
import PartnerWorkspace from '@/components/settlement/PartnerWorkspace';
import WalletPortalERPOverview from '@/components/settlement/WalletPortalERPOverview';
import {loadPartnerStatement} from '@/lib/partnerAnalytics';

// Separate external portal: no staff membership, owner wallet access, or branch permissions.
export default function PartnerPortal(){
 const {lang,setLang}=useLanguage(); const t=peopleText(lang); const qc=useQueryClient();
 const [session,setSession]=useState(null); const [authLoading,setAuthLoading]=useState(true);
 const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
 const [token,setToken]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('invite')||new URLSearchParams(window.location.search).get('invite')||sessionStorage.getItem('partner:invite')||'');
 const [joinToken,setJoinToken]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('join')||new URLSearchParams(window.location.search).get('join')||sessionStorage.getItem('people:join')||'');
 const [busy,setBusy]=useState(false); const lock=useRef(false); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
 const [selected,setSelected]=useState('');
 const [loanSignal,setLoanSignal]=useState(0),[custodySignal,setCustodySignal]=useState(0),[statementSignal,setStatementSignal]=useState(0),[accountSignal,setAccountSignal]=useState(0);
 const [preferences,setPreferences]=useState({title:'',showBalances:true,compact:false});
 useEffect(()=>{let live=true;supabase.auth.getSession().then(({data,error})=>{if(live){setSession(data?.session||null);setAuthLoading(false);if(error)setError(t.failed);}});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{if(live){setSession(next);setAuthLoading(false);}});
  return()=>{live=false;subscription.unsubscribe();};
 },[]);
 useEffect(()=>{if(joinToken){sessionStorage.setItem('people:join',joinToken);if(!authLoading)history.replaceState(null,'',window.location.pathname);}},[joinToken,authLoading]);
 useEffect(()=>{if(token){sessionStorage.setItem('partner:invite',token);if(!authLoading)history.replaceState(null,'',window.location.pathname);} },[token,authLoading]);
 useEffect(()=>{setPreferences(readPartnerPreferences(session?.user?.id));setSelected('');},[session?.user?.id]);
 const updatePreference=(key,value)=>setPreferences(p=>{const next={...p,[key]:value};try{localStorage.setItem(`partner-view:${session?.user?.id}:portal`,JSON.stringify(next));}catch{/* display still works */}return next;});
 const accounts=useQuery({queryKey:['partner-portal-accounts',session?.user?.id],enabled:!!session?.user?.id,
  queryFn:async()=>{const {data,error}=await supabase.rpc('erp_partner_portal_accounts');if(error)throw error;return data||[];},refetchInterval:15000});
 const partner=accounts.data?.find(p=>p.id===selected)||accounts.data?.[0];
 const scrollToSection=id=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'});
 const statement=useQuery({queryKey:['partner-portal-statement',session?.user?.id,partner?.id],enabled:!!session?.user?.id&&!!partner?.id,
  queryFn:({signal})=>loadPartnerStatement(supabase,partner.id,signal),refetchInterval:30000});
 const run=async(fn)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(partnerError(e,t));}finally{lock.current=false;setBusy(false);}};
 const authenticate=(signup)=>run(async()=>{
  if(!email.trim()||!password||(signup&&password.length<10))throw Error('INVALID');
  const payload={email:email.trim().toLowerCase(),password};
  const result=signup?await supabase.auth.signUp({...payload,options:{emailRedirectTo:`${window.location.origin}/partner-portal?${token?'invite='+encodeURIComponent(token):'join='+encodeURIComponent(joinToken)}`,data:token?{partner_invitation_token:token}:{people_portal_registration:true}}}):await supabase.auth.signInWithPassword(payload);
  if(result.error)throw result.error;
  if(result.data.session)setSession(result.data.session);else setNotice(t.verify);
 });
 const activate=()=>run(async()=>{const {data,error}=await supabase.rpc('erp_accept_partner_invitation',{p_token:token});if(error)throw error;
  setSelected(data);setToken('');sessionStorage.removeItem('partner:invite');await accounts.refetch();});
 const confirm=(id)=>run(async()=>{const {error}=await supabase.rpc('erp_confirm_partner_transaction',{p_transaction_id:id});if(error)throw error;await statement.refetch();});
 const signOut=()=>run(async()=>{const {error}=await supabase.auth.signOut();if(error)throw error;setSession(null);for(const key of ['partner-portal-statement','partner-portal-accounts','people-memberships','people-custody','partner-requests'])qc.removeQueries({queryKey:[key]});});
 return <main dir={lang==='en'?'ltr':'rtl'} className="mx-auto min-h-screen max-w-5xl space-y-4 bg-background p-4 pb-12 sm:p-6">
  <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"><div><p className="font-bold text-blue-600">BizCTRL</p><h1 className="text-xl font-extrabold">{preferences.title||t.portal}</h1></div>
   <div className="flex gap-2"><select aria-label="Language" className="rounded-lg border bg-background p-2" value={lang} onChange={e=>setLang(e.target.value)}><option value="fa">فارسی</option><option value="ar">العربية</option><option value="en">English</option></select>
   {session&&<Button variant="outline" disabled={busy} onClick={signOut}>{t.signOut}</Button>}</div></header>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}{notice&&<p role="status" className="rounded-xl bg-green-50 p-3 text-green-800">{notice}</p>}
  {authLoading?<p>{t.loading}</p>:!session?<Card className="mx-auto max-w-md space-y-4 p-5"><h2 className="font-bold">{t.signIn}</h2><p className="text-sm">{t.accountHelp}</p>
   <form className="space-y-3" onSubmit={e=>{e.preventDefault();authenticate(false);}}><label className="block">{t.email}<Input type="email" required value={email} autoComplete="email" dir="ltr" onChange={e=>setEmail(e.target.value)}/></label>
   <label className="block">{t.password}<Input type="password" required value={password} autoComplete="current-password" dir="ltr" onChange={e=>setPassword(e.target.value)}/></label>
   <div className="flex flex-wrap gap-2"><Button disabled={busy} type="submit">{t.signIn}</Button>{<Button type="button" variant="outline" disabled={busy||!email.trim()||password.length<10} onClick={()=>authenticate(true)}>{t.signUp}</Button>}</div></form></Card>:
   <>
    <PeopleMemberships key={session.user.id} userId={session.user.id} t={t} joinToken={joinToken} onJoined={()=>{setJoinToken('');sessionStorage.removeItem('people:join');setNotice(t.joinSent);}}/>
    {token&&<Card className="space-y-3 p-4"><p>{session.user.email}</p><Button disabled={busy} onClick={activate}>{t.accept}</Button></Card>}
    {accounts.isLoading?<p>{t.loading}</p>:accounts.isError?<p role="alert">{t.failed}<Button onClick={()=>accounts.refetch()}>{t.refresh}</Button></p>:!partner?<p>{t.noAccounts}</p>:<>
     <Card className="flex flex-wrap items-center justify-between gap-3 p-4"><select aria-label={t.partners} className="min-w-0 flex-1 rounded-xl border bg-background p-3" value={partner.id} onChange={e=>{setSelected(e.target.value);setError('');}}>
      {accounts.data.map(p=><option key={p.id} value={p.id}>{p.business} · {p.name}</option>)}
     </select><Button variant="outline" onClick={()=>{accounts.refetch();statement.refetch();}}>{t.refresh}</Button></Card>
     {statement.data&&<WalletPortalERPOverview partner={partner} statement={statement.data} lang={lang}
       onLoan={()=>{setLoanSignal(x=>x+1);scrollToSection('wallet-loan-requests');}}
       onCustody={()=>{setCustodySignal(x=>x+1);scrollToSection('wallet-custody-requests');}}
       onStatement={()=>{setStatementSignal(x=>x+1);scrollToSection('wallet-statement');}}
       onAccount={()=>{setAccountSignal(x=>x+1);scrollToSection('wallet-statement');}}/>}
     <div id="wallet-custody-requests" className="scroll-mt-4"><PartnerTransactionRequests key={`custody:${session.user.id}:${partner.id}`} partner={partner} t={t} custody openSignal={custodySignal}/></div>
     <div id="wallet-loan-requests" className="scroll-mt-4"><PartnerTransactionRequests key={`requests:${session.user.id}:${partner.id}`} partner={partner} t={t} openSignal={loanSignal}/></div>
     <div id="wallet-statement" className="scroll-mt-4">{statement.isLoading?<p>{t.loading}</p>:statement.isError?<p role="alert">{t.failed}<Button onClick={()=>statement.refetch()}>{t.refresh}</Button></p>:statement.data&&<PartnerWorkspace key={`${session.user.id}:${partner.id}`} data={statement.data} partner={partner} t={t} lang={lang} preferences={preferences} updatePreference={updatePreference} confirm={confirm} busy={busy} statementSignal={statementSignal} accountSignal={accountSignal}/>}</div>

    </>}
   </>}
 </main>;
}
