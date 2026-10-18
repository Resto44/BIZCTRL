import React,{useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {useTenant} from '@/lib/TenantContext';
import {useRole} from '@/lib/RoleContext';
import {useLanguage} from '@/lib/LanguageContext';
import {partnerError} from '@/lib/partnerTreasury';
import {peopleText,newPersonPermissions} from '@/lib/peopleAccounts';
import PeopleCustodySummary from './PeopleCustodySummary';
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
 const [busy,setBusy]=useState(false); const lock=useRef(false);
 const [error,setError]=useState(''); const [invitation,setInvitation]=useState('');
 const {data:partners=[],isLoading,isError,refetch}=useQuery({
  queryKey:['business-partners',activeRestaurantId],enabled:role==='owner'&&!!activeRestaurantId,
  queryFn:async()=>{const {data,error}=await supabase.from('business_partners').select('*').eq('restaurant_id',activeRestaurantId).order('name');if(error)throw error;return data||[];},
  refetchInterval:15000,
 });
 useEffect(()=>{setForm(null);setInvitation('');setError('');setSelected('');},[activeRestaurantId]);
 const branches=useQuery({queryKey:['people-branches',activeRestaurantId],enabled:role==='owner'&&!!activeRestaurantId,queryFn:async()=>{const {data,error}=await supabase.from('branches').select('id,name').eq('restaurant_id',activeRestaurantId).eq('is_active',true);if(error)throw error;return data||[];}});
 const partner=partners.find(p=>p.id===selected)||partners[0];
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
 return <section className="mx-auto max-w-6xl min-w-0 space-y-4 pb-20" dir={lang==='en'?'ltr':'rtl'}>
  <Card className="min-w-0 space-y-3 rounded-[24px] border-slate-200 bg-white p-4 shadow-sm sm:p-6">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-950 sm:text-xl">{t.title}</h2><p className="mt-1 text-xs text-slate-600">{t.partners}</p></div>
    <Button onClick={()=>{setError('');setInvitation('');setForm({...newPersonPermissions(),id:crypto.randomUUID(),name:'',email:'',is_active:true,invite:true,isNew:true});}}>{t.add}</Button></div>
   <p className="text-sm text-muted-foreground">{t.help}</p>
   {isLoading?<p>{t.loading}</p>:isError?<div role="alert">{t.failed} <Button onClick={()=>refetch()}>{t.refresh}</Button></div>:
    !partners.length?<p>{t.empty}</p>:<div className="flex flex-wrap items-center gap-3">
     <label className="min-w-0 flex-1">{t.partners}<select className="mt-1 w-full rounded-xl border bg-background p-3" value={partner?.id||''} onChange={e=>{setSelected(e.target.value);setForm(null);setInvitation('');setError('');}}>
      {partners.map(p=><option key={p.id} value={p.id}>{p.name} · {t[p.account_role||'partner']} · {p.is_active?t.active:t.inactive}</option>)}
     </select></label>
     <Button variant="outline" onClick={()=>{setError('');setForm({...partner,invite:false});setInvitation('');}}>{t.edit}</Button>
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
  </Card>
  {partner&&<SponsorOwnerBilateralLedger key={`${activeRestaurantId}:${partner.id}`} partner={partner}/>}
  <PeopleCustodySummary tenant={activeRestaurantId} t={t}/>
  <PeopleMemberships tenant={activeRestaurantId} t={t} branches={branches.data||[]}/>
  {partner&&<PartnerTransactionRequests key={`custody:${activeRestaurantId}:${partner.id}`} partner={partner} t={t} owner custody/>}
  {partner&&<PartnerTransactionRequests key={`requests:${activeRestaurantId}:${partner.id}`} partner={partner} t={t} owner/>}
  <p className="rounded-xl border p-3 text-xs text-muted-foreground">{t.scopeNote}</p>
 </section>;
}
