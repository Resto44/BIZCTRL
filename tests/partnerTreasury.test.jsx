// @vitest-environment jsdom
import {peopleText} from '../src/lib/peopleAccounts';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {partnerRows,partnerText,readPartnerPreferences} from '@/lib/partnerTreasury';
import {sponsorOwnerSummary} from '@/lib/sponsorOwnerBilateral';
const state=vi.hoisted(()=>({lang:'fa',rpc:vi.fn(),session:{user:{id:'partner-user',email:'partner@example.invalid'}}}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:state.lang,setLang:vi.fn()})}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:(...args)=>state.rpc(...args),auth:{
 getSession:async()=>({data:{session:state.session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:vi.fn()}}}),signOut:async()=>({error:null})
}}}));
import PartnerPortal from '@/pages/PartnerPortal';
let root,host,client;
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true; localStorage.clear();sessionStorage.clear();state.lang='fa';
 state.rpc.mockReset().mockImplementation(async(name)=>{
  if(name==='erp_partner_portal_accounts')return {data:[{id:'a',name:'شریک اول',business:'کسب‌وکار'}]};
  if(name==='erp_partner_portal_statement')return {data:{balances:[{currency:'SAR',owner_owes:100,partner_owes:0}],count:1,records:[{id:'tx-a',kind:'sponsor_advance_to_owner',amount:100,currency:'SAR',effective_date:'2026-10-18',payment_method:'cash'}]}};
  return {data:null,error:null};
 });
 client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();client.clear();});
const mount=async()=>{
 await act(async()=>{root.render(<QueryClientProvider client={client}><PartnerPortal/></QueryClientProvider>);});
 for(let i=0;i<5;i++)await act(async()=>{await new Promise(r=>setTimeout(r,10));});
};
describe('partner treasury isolation and portal',()=>{
 it('separates partner and legacy principal before calculating repayment balances',()=>{
  const rows=[{partner_id:'a',kind:'sponsor_advance_to_owner',amount:100,currency:'SAR'},
   {partner_id:'b',kind:'sponsor_advance_to_owner',amount:900,currency:'SAR'},
   {partner_id:null,kind:'sponsor_advance_to_owner',amount:50,currency:'SAR'}];
  expect(sponsorOwnerSummary(partnerRows(rows,'a'),'SAR').ownerOwes).toBe(100);
  expect(sponsorOwnerSummary(partnerRows(rows,'b'),'SAR').ownerOwes).toBe(900);
  expect(sponsorOwnerSummary(partnerRows(rows,null),'SAR').ownerOwes).toBe(50);
 });
 it.each(['fa','ar','en'])('renders the authorized statement and confirms through server in %s',async(lang)=>{
  state.lang=lang;await mount();const t=peopleText(lang);
  expect(host.textContent).toContain(t.ownerOwes);expect(host.textContent).toContain(t.sponsor_advance_to_owner);
  expect(host.querySelector('main').dir).toBe(lang==='en'?'ltr':'rtl');
  const button=[...host.querySelectorAll('button')].find(b=>b.textContent===t.confirm);
  await act(async()=>button.click());
  expect(state.rpc).toHaveBeenCalledWith('erp_confirm_partner_transaction',{p_transaction_id:'tx-a'});
  expect(state.rpc).toHaveBeenCalledWith('erp_partner_portal_statement',{p_partner_id:'a',p_offset:0});
 });
 it('does not invent or reuse balances after a denied server read',async()=>{
  state.rpc.mockImplementation(async(name)=>name==='erp_partner_portal_accounts'?{data:[{id:'a',name:'A',business:'Business'}]}:{error:{message:'PARTNER_ACCESS_DENIED'}});
  await mount();expect(host.textContent).toContain(partnerText('fa').failed);
  expect(host.textContent).not.toContain('SAR');expect(host.querySelector('[role="alert"]')).not.toBeNull();
 });
 it('keeps customization local to the current identity and rejects unsafe preference shapes',()=>{
  localStorage.setItem('partner-view:a:portal',JSON.stringify({title:'My dashboard',showBalances:false,compact:true,permissions:{owner:true}}));
  expect(readPartnerPreferences('a')).toEqual({title:'My dashboard',showBalances:false,compact:true});
  expect(readPartnerPreferences('b')).toEqual({title:'',showBalances:true,compact:false});
 });
});

it('navigates reports, transaction filters and account customization',async()=>{
 await mount();const t=partnerText('fa');
 const nav=label=>[...host.querySelectorAll('nav button')].find(b=>b.textContent===label);
 await act(async()=>nav(t.reports).click());expect(host.textContent).toContain(t.balanceTrend);expect(host.textContent).toContain(t.distribution);
 await act(async()=>nav(t.records).click());expect(host.querySelector('input[placeholder]')).not.toBeNull();
 await act(async()=>nav(t.account).click());expect(host.textContent).toContain(t.customize);
});
