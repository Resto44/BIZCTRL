// @vitest-environment jsdom
import React from 'react';
import {act,create} from 'react-test-renderer';
import {describe,it,expect,vi} from 'vitest';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc}}));
vi.mock('../src/components/wallet-banking/WalletInsights',()=>({WalletTrend:()=>null,WalletPersonalCategories:()=>null}));
import WalletBankingCenter from '../src/components/wallet-banking/WalletBankingCenter';
const text=n=>typeof n==='string'?n:(n.children||[]).map(text).join('');
const button=(tree,label)=>tree.root.findAllByType('button').find(b=>text(b)===label);
async function mount({owner=false,initiated=true,fail=false}={}){
 rpc.mockReset();let pending=true;
 const row={id:'owner-request',kind:'return_to_owner',amount:10,currency:'SAR',status:'pending',initiated_by_owner:initiated,note:'Return unused funds',created_at:'2026-10-20T12:00:00Z',payer:'Person',payee:'Business'};
 rpc.mockImplementation(async(name,args)=>{
  if(name==='erp_bank_wallet_dashboard')return {data:{person_name:'Person',currencies:[{currency:'SAR',balance:30,pending_amount:pending?10:0}],transactions:[],pending_requests:pending?[row]:[]}};
  if(name==='erp_bank_wallet_owner_funding_accounts')return {data:[]};
  if(name==='erp_bank_wallet_review'){if(fail)return {error:{message:'WALLET_INSUFFICIENT_FUNDS'}};pending=false;return {data:args.p_request_id};}
  throw Error(name);
 });
 const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});let tree;
 await act(async()=>{tree=create(<QueryClientProvider client={client}><WalletBankingCenter owner={owner} person={{id:'person',restaurant_id:'tenant',name:'Person'}}/></QueryClientProvider>);});
 await act(async()=>{await new Promise(r=>setTimeout(r,30));});return {tree,client};
}
async function open(tree){
 const notice=tree.root.findAllByType('button').find(b=>text(b).includes('Review transfer'));
 await act(async()=>notice.props.onClick());
 await act(async()=>button(tree,'Transfer Approvals').props.onClick());
 await act(async()=>tree.root.findByType('textarea').props.onChange({target:{value:'Confirmed by beneficiary'}}));
}
describe('Beneficiary approval of owner requests',()=>{
 it.each([true,false])('reviews an old pending request outside history, approve=%s',async approve=>{
  const {tree,client}=await mount();expect(text(tree.root)).toContain('30.00');
  await open(tree);
  expect(text(tree.root)).toContain('Return unused funds');
  expect(tree.root.findAllByType('select').some(s=>s.props.children?.includes?.('Owner Treasury account'))).toBe(false);
  const action=button(tree,approve?'Approve & Post':'Reject');expect(action.props.disabled).toBe(false);
  await act(async()=>action.props.onClick());
  expect(rpc).toHaveBeenCalledWith('erp_bank_wallet_review',{p_request_id:'owner-request',p_approve:approve,p_treasury_account:null,p_review_note:'Confirmed by beneficiary'});
  tree.unmount();client.clear();
 });
 it('keeps failed approval visible without claiming success',async()=>{
  const {tree,client}=await mount({fail:true});await open(tree);await act(async()=>button(tree,'Approve & Post').props.onClick());
  expect(text(tree.root)).toContain('WALLET_INSUFFICIENT_FUNDS');expect(text(tree.root)).not.toContain('Owner review completed.');tree.unmount();client.clear();
 });
 it('does not let a beneficiary approve their own request',async()=>{
  const {tree,client}=await mount({initiated:false});expect(text(tree.root)).not.toContain('Review transfer');
  const pendingButton=tree.root.findAllByType('button').find(b=>text(b).includes('Pending Transfers'));
  await act(async()=>pendingButton.props.onClick());expect(button(tree,'Transfer Approvals')).toBeUndefined();tree.unmount();client.clear();
 });
 it('does not let an owner approve an owner-originated request',async()=>{
  const {tree,client}=await mount({owner:true});
  const pendingButton=tree.root.findAllByType('button').find(b=>text(b).includes('Pending Transfers'));
  await act(async()=>pendingButton.props.onClick());expect(button(tree,'Transfer Approvals')).toBeUndefined();expect(text(tree.root)).toContain('Awaiting beneficiary approval');tree.unmount();client.clear();
 });
});
