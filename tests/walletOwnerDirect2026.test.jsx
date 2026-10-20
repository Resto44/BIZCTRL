// @vitest-environment jsdom
import React from 'react';
import {act,create} from 'react-test-renderer';
import {describe,it,expect,vi} from 'vitest';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc}}));
import OwnerWalletDashboard from '../src/components/wallet-banking/OwnerWalletDashboard';
const text=node=>typeof node==='string'?node:(node.children||[]).map(text).join('');
const button=(tree,label)=>tree.root.findAllByType('button').find(b=>text(b)===label);
const snapshot={accounts:[{id:'cash',account_name:'Owner cash',available_balance:100}],people:[{id:'person',name:'Person',balance:30,is_active:true,linked:true,status:'active'}],summary:{wallet_balance:30,pending_count:0,pending_amount:0,funded:30,returned:0},transactions:[],total:0};
async function mount({kind='fund_wallet',fail=false,pending=false}={}){rpc.mockReset();let calls=0;rpc.mockImplementation(async(name,args)=>{
 if(name==='erp_bank_wallet_owner_overview')return {data:pending?{...snapshot,transactions:[{id:'pending-1',person_id:'person',person_name:'Person',is_active:true,status:'pending',kind:'fund_wallet',amount:5,currency:'SAR',activity_at:'2026-10-20T12:00:00Z',note:'Requested funding'}],total:1}:snapshot};
 if(name==='erp_bank_wallet_owner_transfer'){calls++;if(fail&&calls===1)return {error:{message:'network timeout'}};return {data:args.p_request_id};}
 if(name==='erp_bank_wallet_review')return {data:args.p_request_id};
 throw Error(name);
 });const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});let tree;
 await act(async()=>{tree=create(<QueryClientProvider client={client}><OwnerWalletDashboard tenant="tenant" initialPerson="person" initialKind={kind} onOpenWallet={()=>{}}/></QueryClientProvider>);});
 await act(async()=>{await new Promise(r=>setTimeout(r,30));});return {tree,client};}
async function fill(tree,amount='20'){
 await act(async()=>{
 tree.root.findAllByType('select').find(n=>n.props['aria-label']==='Treasury account').props.onChange({target:{value:'cash'}});
 tree.root.findByType('input').props.onChange({target:{value:amount}});
 tree.root.findByType('textarea').props.onChange({target:{value:'Operational funding'}});
 });}
describe('Owner direct wallet UI',()=>{
 it('separates treasury and wallet totals and only posts after explicit review and confirmation',async()=>{
 const {tree,client}=await mount();expect(text(tree.root)).toContain('100.00 SAR');expect(text(tree.root)).toContain('30.00 SAR');
 await fill(tree);expect(rpc.mock.calls.filter(c=>c[0]==='erp_bank_wallet_owner_transfer')).toHaveLength(0);
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
 expect(text(tree.root)).toContain('Treasury after: 80.00 SAR');expect(text(tree.root)).toContain('Balance after: 50.00 SAR');
 await act(async()=>button(tree,'Confirm & post').props.onClick());
 expect(rpc).toHaveBeenCalledWith('erp_bank_wallet_owner_transfer',expect.objectContaining({p_kind:'fund_wallet',p_person:'person',p_amount:20,p_treasury_account:'cash',p_currency:'SAR'}));
 expect(text(tree.root)).toContain('Transaction posted');tree.unmount();client.clear();
 });
 it('receives against beneficiary funds and blocks overdrawing that wallet',async()=>{
 const {tree,client}=await mount({kind:'return_to_owner'});await fill(tree,'31');expect(button(tree,'Review transaction').props.disabled).toBe(true);
 await fill(tree,'10');await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
 expect(text(tree.root)).toContain('Treasury after: 110.00 SAR');expect(text(tree.root)).toContain('Balance after: 20.00 SAR');
 await act(async()=>button(tree,'Confirm & post').props.onClick());expect(rpc).toHaveBeenCalledWith('erp_bank_wallet_owner_transfer',expect.objectContaining({p_kind:'return_to_owner',p_amount:10}));tree.unmount();client.clear();
 });
 it('reuses the exact idempotency key after transport failure',async()=>{
 const {tree,client}=await mount({fail:true});await fill(tree);await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
 await act(async()=>button(tree,'Confirm & post').props.onClick());expect(text(tree.root)).toContain('Posting could not be confirmed');
 await act(async()=>button(tree,'Confirm & post').props.onClick());const calls=rpc.mock.calls.filter(c=>c[0]==='erp_bank_wallet_owner_transfer');expect(calls).toHaveLength(2);expect(calls[0][1]).toEqual(calls[1][1]);tree.unmount();client.clear();
 });
 it('reviews an exact pending record from owner history without creating another transfer',async()=>{
 const {tree,client}=await mount({kind:null,pending:true});
 const row=tree.root.findByType('article');await act(async()=>row.findByType('button').props.onClick());
 await act(async()=>{row.findByType('select').props.onChange({target:{value:'cash'}});row.findByType('textarea').props.onChange({target:{value:'Approved owner review'}});});
 await act(async()=>button(tree,'Approve & post').props.onClick());
 expect(rpc).toHaveBeenCalledWith('erp_bank_wallet_review',{p_request_id:'pending-1',p_approve:true,p_treasury_account:'cash',p_review_note:'Approved owner review'});
 expect(rpc.mock.calls.some(c=>c[0]==='erp_bank_wallet_owner_transfer')).toBe(false);tree.unmount();client.clear();
 });
 it('blocks insufficient treasury funds and invalid precision',async()=>{
 const {tree,client}=await mount();await fill(tree,'101');expect(button(tree,'Review transaction').props.disabled).toBe(true);
 await fill(tree,'1.001');expect(button(tree,'Review transaction').props.disabled).toBe(true);tree.unmount();client.clear();
 });
});
