import React,{useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {useTenant} from '@/lib/TenantContext';
import {useRole} from '@/lib/RoleContext';
import {useLanguage} from '@/lib/LanguageContext';
import {partnerError} from '@/lib/partnerTreasury';
import {peopleText,newPersonPermissions} from '@/lib/peopleAccounts';
import PeopleCustodySummary from './PeopleCustodySummary';
import WalletERPOverview from './WalletERPOverview';
import PeopleMemberships from './PeopleMemberships';
import PersonPermissions from './PersonPermissions';
import PartnerTransactionRequests from './PartnerTransactionRequests';
import PartnerInvitationLink from './PartnerInvitationLink';
import SponsorOwnerBilateralLedger from './SponsorOwnerBilateralLedger';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Card} from '@/components/ui/card';

export default function PartnerTreasuryCenter(){
 const {activeRestaurantId}=useTenant();
 const {role}=useRole();
 const {lang}=useLanguage(); const t=peopleText(lang); const qc=useQueryClient();
 const [selected,setSelected]=useState(''); const [form,setForm]=useState(null);
 const [view,setView]=useState('overview'); const [recordSignal,setRecordSignal]=useState(0);
 const [busy,setBusy]=useState(false); const lock=useRef(false);
 const [error,setError]=useState(''); const [invitation,setInvitation]=useState('');
 const {data:partners=[],isLoading,isError,refetch}=useQuery({
  queryKey:['business-partners',activeRestaurantId],enabled:role==='owner'&&!!activeRestaurantId,
  queryFn:async()=>{const {data,error}=await supabase.from('business_partners').select('*').eq('restaurant_id',activeRestaurantId).order('name');if(error)throw error;return data||[];},
  refetchInterval:15000,
 });
 useEffect(()=>{setForm(null);setInvitation('');setError('');setSelected('');setView('overview');setRecordSignal(0);},[activeRestaurantId]);
 const branches=useQuery({queryKey:['people-branches',activeRestaurantId],enabled:role==='owner'&&!!activeRestaurantId,queryFn:async()=>{const {data,error}=await supabase.from('branches').select('id,name').eq('restaurant_id',activeRestaurantId).eq('is_active',true);if(error)throw error;return data||[];}});
 const partner=partners.find(p=>p.id===selected)||partners[0];
 const newAccount=()=>{setError('');setInvitation('');setForm({...newPersonPermissions(),id:crypto.randomUUID(),name:'',email:'',is_active:true,invite:true,isNew:true});setView('manage');};
 const editAccount=p=>{setError('');setInvitation('');setSelected(p.id);setForm({...p,invite:false});setView('manage');};
 const save=async(event)=>{
  event.preventDefault(); if(lock.current||!form)return;
  lock.current=true;setBusy(true);setError('');
  try{
   const {data,error}=await supabase.rpc('erp_save_person_account',{
    p_restaurant_id:activeRestaurantId,p_id:form.id,p_name:form.name.trim(),p_email:form.email.trim().toLowerCase(),
    p_active:form.is_active,p_invite:form.invite,p_role:form.account_role,p_branch:form.branch_id||null,p_submit:form.can_submit,p_loans:form.allow_loans,p_custody:form.allow_custody,
   });if(error)throw error;if(!data?.partner?.id)throw Error('NO_CONFIRMATION');
   setSelected(data.partner.id);
   setInvitation(data.token?`${window.location.origin}/wallet-portal#invite=${encodeURIComponent(data.token)}`:'');
   setForm(null);await qc.invalidateQueries({queryKey:['business-partners',activeRestaurantId]});
  }catch(e){setError(partnerError(e,t));}finally{lock.current=false;setBusy(false);}
 };
 if(role!=='owner')return null;
 const tabs={en:{overview:'Overview',ledger:'Account details & ledger',requests:'Approvals & settlements',manage:'Account management'},ar:{overview:'نظرة عامة',ledger:'تفاصيل الحساب والدفتر',requests:'الطلبات والتسويات',manage:'إدارة الحسابات'},fa:{overview:'نمای کلی',ledger:'جزئیات حساب و دفتر',requests:'درخواست‌ها و تسویه',manage:'مدیریت حساب‌ها'}}[lang]||{overview:'Overview',ledger:'Account details & ledger',requests:'Approvals & settlements',manage:'Account management'};
 return <section className="mx-auto max-w-6xl min-w-0 space-y-4 pb-20" dir={lang==='en'?'ltr':'rtl'}>
  <nav aria-label={t.title} className="grid grid-cols-2 gap-2 rounded-2xl border bg-white p-2 sm:grid-cols-4">{['overview','ledger','requests','manage'].map(key=><button key={key} type="button" aria-current={view===key?'page':undefined} onClick={()=>{setView(key);setError('');}} className={`min-h-11 min-w-0 rounded-xl px-2 py-2 text-xs font-bold leading-5 sm:text-sm ${view===key?'bg-blue-600 text-white':'bg-slate-50 text-slate-600'}`}>{tabs[key]}</button>)}</nav>
  {view==='overview'&&<WalletERPOverview restaurantId={activeRestaurantId} partners={partners} partner={partner} lang={lang}
    onSelect={setSelected} onAdd={newAccount} onEdit={editAccount}
    onLedger={()=>setView('ledger')}
    onRecord={()=>{setRecordSignal(x=>x+1);setView('ledger');}}
    onRequests={()=>setView('requests')} onMembers={()=>setView('manage')}/>}
  {view==='manage'&&<Card className="min-w-0 space-y-3 rounded-[24px] border-slate-200 bg-white p-4 shadow-sm sm:p-6">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-950 sm:text-xl">{t.title}</h2><p className="mt-1 text-xs text-slate-600">{t.partners}</p></div>
    <Button onClick={newAccount}>{t.add}</Button></div>
   <p className="text-sm text-muted-foreground">{t.help}</p>
   {isLoading?<p>{t.loading}</p>:isError?<div role="alert">{t.failed} <Button onClick={()=>refetch()}>{t.refresh}</Button></div>:
    !partners.length?<p>{t.empty}</p>:<div className="flex flex-wrap items-center gap-3">
     <label className="min-w-0 flex-1">{t.partners}<select className="mt-1 w-full rounded-xl border bg-background p-3" value={partner?.id||''} onChange={e=>{setSelected(e.target.value);setForm(null);setInvitation('');setError('');}}>
      {partners.map(p=><option key={p.id} value={p.id}>{p.name} · {t[p.account_role||'partner']} · {p.is_active?t.active:t.inactive}</option>)}
     </select></label>
     <Button variant="outline" onClick={()=>editAccount(partner)}>{t.edit}</Button>
     <span className="w-full text-xs text-muted-foreground">{partner?.user_id?t.linked:t.pending} · {partner?.email}</span>
    </div>}
   {form&&<form onSubmit={save} className="space-y-3 rounded-xl border p-3">
    <label className="block text-sm">{t.name}<Input required maxLength={120} value={form.name} disabled={busy} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <label className="block text-sm">{t.email}<Input required type="email" dir="ltr" maxLength={254} value={form.email} disabled={busy||!form.isNew} onChange={e=>setForm({...form,email:e.target.value})}/></label>
    <PersonPermissions value={form} onChange={setForm} branches={branches.data||[]} t={t} disabled={busy}/>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={form.is_active} disabled={busy} onChange={e=>setForm({...form,is_active:e.target.checked})}/>{t.active}</label>
    {!form.user_id&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={form.invite} disabled={busy||!form.is_active} onChange={e=>setForm({...form,invite:e.target.checked})}/>{t.invite}</label>}
    <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy?t.loading:t.save}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>{setForm(null);setError('');}}>{t.cancel}</Button></div>
   </form>}
   {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
   {invitation&&<PartnerInvitationLink key={invitation} invitation={invitation} t={t}/>}
  </Card>}
  {view==='ledger'&&partner&&<SponsorOwnerBilateralLedger key={`${activeRestaurantId}:${partner.id}`} partner={partner} openTransactionSignal={recordSignal}/>}
  {view==='ledger'&&<PeopleCustodySummary tenant={activeRestaurantId} t={t}/>}
  {view==='manage'&&<PeopleMemberships tenant={activeRestaurantId} t={t} branches={branches.data||[]}/>}
  {view==='requests'&&partner&&<PartnerTransactionRequests key={`custody:${activeRestaurantId}:${partner.id}`} partner={partner} t={t} owner custody/>}
  {view==='requests'&&partner&&<PartnerTransactionRequests key={`requests:${activeRestaurantId}:${partner.id}`} partner={partner} t={t} owner/>}
  <p className="rounded-xl border bg-blue-50 p-3 text-xs leading-5 text-blue-900">{t.scopeNote}</p>
 </section>;
}
