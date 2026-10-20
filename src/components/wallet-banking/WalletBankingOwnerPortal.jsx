import React,{useEffect,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {useTenant} from '@/lib/TenantContext';
import {useLanguage} from '@/lib/LanguageContext';
import {useRole} from '@/lib/RoleContext';
import {peopleText} from '@/lib/peopleAccounts';
import PeopleMemberships from '@/components/settlement/PeopleMemberships';
import WalletBankingCenter from './WalletBankingCenter';
import {Button} from '@/components/ui/button';

const locale={
 en:{label:'Wallet beneficiaries',membership:'Membership requests and approvals',empty:'No wallet users enrolled yet.',choose:'Choose a person',refresh:'Refresh',security:'Only approved owners can see other user accounts.'},
 ar:{label:'المستفيدون من المحفظة',membership:'طلبات العضوية والموافقة',empty:'لا يوجد أصحاب محافظ معتمدون.',choose:'اختر الشخص',refresh:'تحديث',security:'المالك المصرح فقط يمكنه مراجعة حسابات الآخرين.'},
 fa:{label:'صاحبان حساب والت',membership:'درخواست‌های عضویت و تأیید',empty:'هنوز حساب کاربری مجاز وجود ندارد.',choose:'شخص را انتخاب کنید',refresh:'تازه‌سازی',security:'فقط اونر دارای صلاحیت می‌تواند حساب دیگران را ببیند.'}
};
export default function WalletBankingOwnerPortal(){
 const {activeRestaurantId}=useTenant();
 const {role}=useRole();
 const {lang}=useLanguage();
 const t=locale[lang]||locale.en;
 const membersRef=useRef(null);
 const [membersVersion,setMembersVersion]=useState(0);
 useEffect(()=>{if(membersVersion){membersRef.current?.scrollIntoView?.({behavior:'smooth',block:'start'});membersRef.current?.focus?.({preventScroll:true});}},[membersVersion]);
 const [selected,setSelected]=useState('');
 const [members,setMembers]=useState(false);
 const query=useQuery({
  queryKey:['bank-wallet-owner-people',activeRestaurantId],
  enabled:role==='owner'&&!!activeRestaurantId,
  queryFn:async()=>{
   const {data,error}=await supabase.from('business_partners')
    .select('id,restaurant_id,name,email,user_id,is_active,account_role')
    .eq('restaurant_id',activeRestaurantId).eq('is_active',true).not('user_id','is',null)
    .order('name');
   if(error)throw error;return data||[];
  },staleTime:15000,refetchInterval:20000
 });
 const branches=useQuery({
  queryKey:['bank-wallet-owner-branches',activeRestaurantId],
  enabled:role==='owner'&&!!activeRestaurantId&&members,
  queryFn:async()=>{
   const {data,error}=await supabase.from('branches')
     .select('id,name').eq('restaurant_id',activeRestaurantId).eq('is_active',true);
   if(error)throw error;return data||[];
  }
 });
 if(role!=='owner')return <p role="alert" className="p-5 text-sm">Access restricted.</p>;
 const person=query.data?.find(p=>p.id===selected)||query.data?.[0]||null;
 return <div dir={lang==='en'?'ltr':'rtl'} className="min-w-0 space-y-4">
  <div ref={membersRef} tabIndex={-1} className="scroll-mt-44 focus:outline-none grid min-w-0 grid-cols-1 gap-3 rounded-2xl border bg-white p-3 shadow-sm">
   <label className="block min-w-0 text-sm font-bold text-slate-600">{t.label}
    <select value={person?.id||''} onChange={e=>setSelected(e.target.value)}
     aria-label={t.choose} dir="auto" className="mt-2 min-h-12 w-full min-w-0 rounded-xl border bg-white px-3 py-2 text-base font-bold text-slate-950">
     {(query.data||[]).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
    </select>
   </label>
   {person&&<p dir="auto" className="min-w-0 whitespace-normal break-words text-base font-bold leading-7 text-slate-950">{person.name}</p>}
   <div className="flex min-w-0 flex-wrap gap-2">
    <Button variant="outline" className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal break-words px-3 py-2 text-center" onClick={()=>setMembers(x=>!x)}>{t.membership}</Button>
    <Button variant="outline" className="min-h-11 shrink-0" onClick={()=>query.refetch()}>{t.refresh}</Button>
   </div>
  </div>
  {members&&<div className="rounded-2xl border bg-white p-4"><h2 className="mb-3 text-lg font-black">{t.membership}</h2>
    <PeopleMemberships tenant={activeRestaurantId} t={peopleText(lang)} branches={branches.data||[]}/>
   </div>}
  {query.isError?<p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{String(query.error?.message||'Unable to load beneficiaries')}</p>:null}
  {query.isPending?<p className="rounded-xl border bg-white p-4 text-sm">…</p>:!person?<p className="rounded-xl border bg-white p-4 text-sm">{t.empty}</p>:
   <WalletBankingCenter key={person.id} owner person={person} lang={lang} onBeneficiaries={()=>{setMembers(true);setMembersVersion(v=>v+1);}}/>}
  <p className="px-3 text-xs text-slate-600">{t.security}</p>
 </div>;
}
