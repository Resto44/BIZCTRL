import React,{useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {useLanguage} from '@/lib/LanguageContext';
import {peopleText} from '@/lib/peopleAccounts';
import PeopleMemberships from '@/components/settlement/PeopleMemberships';
import WalletBankingCenter from '@/components/wallet-banking/WalletBankingCenter';
import {accountRowsUnique} from '@/lib/walletPersonalActivity';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

const tr={
 en:{error:'Account identity conflict. Contact the business owner.',choose:'Choose wallet account',loading:'Loading verified wallet…',signup:'Create account',signin:'Sign in',verify:'Check email for confirmation before requesting account access.',empty:'No owner-approved wallet account yet. Submit a membership request.',invalid:'Enter a valid email and password (at least 10 characters for registration).',failed:'Could not complete the request.',signout:'Sign out',access:'Wallet Banking Center',refresh:'Refresh'},
 ar:{error:'تعارض في هوية الحساب. راجع مالك المنشأة.',choose:'اختيار حساب المحفظة',loading:'جارٍ تحميل المحفظة الموثقة…',signup:'إنشاء حساب',signin:'تسجيل الدخول',verify:'تحقق من رسالة تأكيد البريد قبل طلب العضوية.',empty:'لا يوجد حساب محفظة معتمد. قدم طلب انضمام.',invalid:'أدخل البريد وكلمة المرور (١٠ أحرف للتسجيل).',failed:'لم تكتمل العملية.',signout:'خروج',access:'مركز المحفظة البنكية',refresh:'تحديث'},
 fa:{error:'شناسه حساب تکراری یا نامعتبر است؛ با اونر تماس بگیرید.',choose:'انتخاب حساب والت',loading:'در حال بارگذاری والت تأییدشده…',signup:'ایجاد حساب',signin:'ورود',verify:'پیش از درخواست عضویت، ایمیل خود را تأیید کنید.',empty:'هنوز والت مورد تأیید اونر ندارید؛ درخواست عضویت بفرستید.',invalid:'ایمیل و رمز صحیح (برای ثبت‌نام دست‌کم ۱۰ کاراکتر) وارد کنید.',failed:'اجرای درخواست ناموفق بود.',signout:'خروج',access:'مرکز بانکداری والت',refresh:'تازه‌سازی'},
};
const fromAddress=key=>{
 const hash=new URLSearchParams(window.location.hash.slice(1));
 const query=new URLSearchParams(window.location.search);
 return hash.get(key)||query.get(key)||sessionStorage.getItem(key==='invite'?'partner:invite':'people:join')||'';
};
export default function PartnerPortal(){
 const {lang,setLang}=useLanguage();
 const t=tr[lang]||tr.en,people=peopleText(lang),client=useQueryClient();
 const [session,setSession]=useState(null),[authLoading,setAuthLoading]=useState(true);
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [invite,setInvite]=useState(()=>fromAddress('invite')),[join,setJoin]=useState(()=>fromAddress('join'));
 const [selected,setSelected]=useState(''),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const lock=useRef(false);
 useEffect(()=>{
  let live=true;
  supabase.auth.getSession().then(({data,error})=>{
   if(live){setSession(data?.session||null);setAuthLoading(false);if(error)setError(t.failed);}
  }).catch(()=>{if(live){setAuthLoading(false);setError(t.failed);}});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{
   if(live){setSession(next);setAuthLoading(false);}
  });
  return()=>{live=false;subscription.unsubscribe();};
 },[]);
 useEffect(()=>{setSelected('');},[session?.user?.id]);
 useEffect(()=>{if(invite)sessionStorage.setItem('partner:invite',invite);if(join)sessionStorage.setItem('people:join',join);},[invite,join]);
 const accounts=useQuery({
  queryKey:['partner-portal-accounts',session?.user?.id],
  enabled:!!session?.user?.id,
  queryFn:async()=>{
   const {data,error}=await supabase.rpc('erp_partner_portal_accounts');
   if(error)throw error;if(!Array.isArray(data))throw Error('UNVERIFIED_ACCOUNT_DATA');
   return data;
  },refetchInterval:20000,staleTime:12000
 });
 const verified=accountRowsUnique(accounts.data||[]);
 const conflict=!!accounts.data&&verified.length!==accounts.data.length;
 const person=conflict?null:verified.find(x=>x.id===selected)||verified[0];
 const run=async fn=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');
  try{await fn();}catch(e){setError(e?.message||t.failed);}
  finally{lock.current=false;setBusy(false);}
 };
 const authenticate=signup=>run(async()=>{
  if(!email.trim()||!password||(signup&&password.length<10))throw Error(t.invalid);
  const credentials={email:email.trim().toLowerCase(),password};
  const callback=invite?'invite='+encodeURIComponent(invite):join?'join='+encodeURIComponent(join):'';
  const result=signup?await supabase.auth.signUp({...credentials,options:{
    emailRedirectTo:window.location.origin+'/wallet-portal'+(callback?'?'+callback:''),
    data:invite?{partner_invitation_token:invite}:{people_portal_registration:true}
  }}):await supabase.auth.signInWithPassword(credentials);
  if(result.error)throw result.error;
  if(result.data?.session)setSession(result.data.session);
  else setNotice(t.verify);
 });
 const activate=()=>run(async()=>{
  const {data,error}=await supabase.rpc('erp_accept_partner_invitation',{p_token:invite});
  if(error)throw error;
  setSelected(data);setInvite('');sessionStorage.removeItem('partner:invite');
  await accounts.refetch();
 });
 const signOut=()=>run(async()=>{
  const {error}=await supabase.auth.signOut();if(error)throw error;
  setSession(null);setSelected('');
  for(const key of ['erp-bank-wallet','partner-portal-accounts','bank-wallet-owner-people','people-memberships','people-custody'])client.removeQueries({queryKey:[key]});
 });
 return <main dir={lang==='en'?'ltr':'rtl'} className="mx-auto min-h-screen max-w-6xl space-y-4 bg-slate-50 p-3 pb-20 sm:p-6">
  <header className="flex min-w-0 flex-wrap items-center justify-between gap-3">
   <h1 className="font-black text-blue-900">BizCTRL · {t.access}</h1>
   <div className="flex flex-wrap items-center gap-2">
    <select aria-label="Language" className="min-h-11 rounded-xl border bg-white px-2 text-xs" value={lang} onChange={e=>setLang(e.target.value)}>
     <option value="fa">فارسی</option><option value="ar">العربية</option><option value="en">English</option>
    </select>
    {session&&<Button variant="outline" disabled={busy} onClick={signOut}>{t.signout}</Button>}
   </div>
  </header>
  {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
  {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
  {authLoading?<p role="status">{t.loading}</p>:!session?
   <div className="mx-auto max-w-md space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
    <h2 className="text-xl font-black">{t.signin}</h2>
    <form onSubmit={e=>{e.preventDefault();authenticate(false);}} className="space-y-3">
      <label className="block text-sm">{people.email}<Input type="email" required autoComplete="email" dir="ltr" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label className="block text-sm">{people.password}<Input type="password" required autoComplete="current-password" dir="ltr" value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <div className="grid grid-cols-2 gap-2"><Button disabled={busy} type="submit" className="min-h-11">{t.signin}</Button><Button disabled={busy||password.length<10} type="button" variant="outline" className="min-h-11" onClick={()=>authenticate(true)}>{t.signup}</Button></div>
    </form>
   </div>:
   <>
    {invite&&<div className="rounded-xl border bg-white p-3 text-sm"><p>{session.user.email}</p><Button className="mt-2" disabled={busy} onClick={activate}>{people.accept}</Button></div>}
    {(!accounts.isLoading&&!accounts.isError&&(!verified.length||join))&&<PeopleMemberships userId={session.user.id} t={people} joinToken={join} onJoined={()=>{setJoin('');sessionStorage.removeItem('people:join');setNotice(people.joinSent);accounts.refetch();}}/>}
    {accounts.isPending?<p role="status">{t.loading}</p>:
     accounts.isError?<p role="alert" className="rounded-xl border bg-rose-50 p-3">{t.failed}<Button onClick={()=>accounts.refetch()}>{t.refresh}</Button></p>:
     conflict?<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4">{t.error}</p>:
     !person?<p className="rounded-xl border bg-white p-4">{t.empty}</p>:
     <>
      {verified.length>1&&<label className="block rounded-xl border bg-white p-3 text-xs font-bold">{t.choose}
        <select aria-label={t.choose} className="mt-1 min-h-11 w-full rounded-xl border bg-white p-2 text-sm" value={person.id} onChange={e=>setSelected(e.target.value)}>
          {verified.map(x=><option value={x.id} key={x.id}>{x.business} · {x.name}</option>)}
        </select></label>}
      <WalletBankingCenter key={person.id} person={person} lang={lang}/>
     </>}
   </>}
 </main>;
}
