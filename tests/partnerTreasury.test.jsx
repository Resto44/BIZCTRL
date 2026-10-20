// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {partnerRows} from '@/lib/partnerTreasury';
import {sponsorOwnerSummary} from '@/lib/sponsorOwnerBilateral';

const state=vi.hoisted(()=>({
 lang:'fa',rpc:vi.fn(),session:{user:{id:'user-1',email:'wallet@example.invalid'}}
}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:state.lang,setLang:vi.fn()})}));
vi.mock('@/api/supabaseClient',()=>({supabase:{
 rpc:(...args)=>state.rpc(...args),
 auth:{
  getSession:async()=>({data:{session:state.session}}),
  onAuthStateChange:()=>({data:{subscription:{unsubscribe:vi.fn()}}}),
  signOut:async()=>({error:null}),
 }
}}));
import PartnerPortal from '@/pages/PartnerPortal';
let root,host,client;
const person={id:'11111111-1111-4111-8111-111111111111',restaurant_id:'tenant-1',
 account_reference:'WLT-11111111111141118111111111111111',name:'شریک اول',
 business:'بیزنس آزمایشی',login_email:'wallet@example.invalid'};
const dashboard={
 person_id:person.id,person_name:person.name,business_name:person.business,
 account_reference:person.account_reference,currencies:[
  {id:'acct',currency:'SAR',status:'active',balance:100,pending_amount:20,transfers_in:120,transfers_out:20}
 ],transactions:[
  {id:'posted',kind:'fund_wallet',amount:120,currency:'SAR',status:'posted',payer:person.business,payee:person.account_reference,created_at:'2026-10-18T10:00:00Z',wallet_delta:120},
  {id:'pending',kind:'fund_wallet',amount:20,currency:'SAR',status:'pending',payer:person.business,payee:person.account_reference,created_at:'2026-10-19T10:00:00Z',wallet_delta:0},
 ]};
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear();state.lang='fa';
 state.rpc.mockReset().mockImplementation(async name=>{
  if(name==='erp_partner_portal_accounts')return {data:[person],error:null};
  if(name==='erp_bank_wallet_dashboard')return {data:dashboard,error:null};
  if(name==='erp_bank_wallet_request')return {data:'new-request-id',error:null};
  return {data:null,error:null};
 });
 client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0,refetchOnWindowFocus:false}}});
 host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();client.clear();});
const mount=async()=>{
 await act(async()=>root.render(<QueryClientProvider client={client}><PartnerPortal/></QueryClientProvider>));
 for(let i=0;i<10;i++){
  await act(async()=>{await new Promise(r=>setTimeout(r,10));});
  if(host.textContent.includes('100.00')||host.textContent.includes('۱۰۰'))break;
 }
};
describe('personal Banking Wallet replaces old partner loan portal',()=>{
 it('preserves archived sponsor principal without putting it into spendable wallet',()=>{
  const rows=[{partner_id:'a',kind:'sponsor_advance_to_owner',amount:100,currency:'SAR'},
   {partner_id:'b',kind:'sponsor_advance_to_owner',amount:900,currency:'SAR'}];
  expect(sponsorOwnerSummary(partnerRows(rows,'a'),'SAR').ownerOwes).toBe(100);
  expect(sponsorOwnerSummary(partnerRows(rows,'b'),'SAR').ownerOwes).toBe(900);
  expect(dashboard.currencies[0].balance).toBe(100);
 });
 it.each(['fa','ar','en'])('renders verified internal banking dashboard and own account for %s',async lang=>{
  state.lang=lang;await mount();
  const title={fa:'مرکز بانکداری والت',ar:'مركز المحفظة البنكية',en:'Wallet Banking Center'}[lang];
  expect(host.textContent).toContain(title);
  expect(host.querySelector('[title="'+person.account_reference+'"]')).not.toBeNull();
  expect(host.textContent).toContain('WLT-1111…1111');
  expect(host.textContent).toContain(person.business);
  expect(host.textContent).toContain(person.name);
  expect(host.textContent).toContain('SAR');
  expect(state.rpc).toHaveBeenCalledWith('erp_bank_wallet_dashboard',{p_person:person.id,p_limit:100});
  expect(host.querySelector('main').dir).toBe(lang==='en'?'ltr':'rtl');
 });
 it('blocks partial figures and fails closed when the server rejects an account read',async()=>{
  state.rpc.mockImplementation(async name=>name==='erp_partner_portal_accounts'
   ?{data:[person],error:null}:{data:null,error:{message:'WALLET_ACCESS_DENIED'}});
  await mount();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.textContent).not.toContain('100.00 SAR');
  expect(host.textContent).not.toContain('2,450.00');
 });
 it('separates pending requests from posted transfers and does not show a pending transfer as paid',async()=>{
  state.lang='en';await mount();
  expect(host.textContent).toContain('Pending Owner Review');
  expect(host.textContent).toContain('Posted');
  expect(host.textContent).toContain('20.00');
  expect(host.textContent).toContain('120.00');
  expect(state.rpc).not.toHaveBeenCalledWith('erp_confirm_partner_transaction',expect.anything());
 });
 it('keeps the wallet usable when category data is null',async()=>{
  state.lang='en';await mount();
  for(let i=0;i<10;i++)await act(async()=>{await new Promise(r=>setTimeout(r,10));});
  expect(host.textContent).toContain('Personal categories');
  expect(host.textContent).toContain('Unable to load or save');
  expect(host.textContent).toContain('Available Wallet Balance');
 });
 it('never mounts loan/custody legacy transaction controls in a verified wallet',async()=>{
  await mount();
  expect(host.textContent).toContain('مرکز بانکداری والت');
  expect(host.textContent).not.toContain('Person lent to business');
  expect(host.textContent).not.toContain('Business repaid person');
  expect(host.querySelector('nav[aria-label="Partner Treasury"]')).toBeNull();
 });
});
