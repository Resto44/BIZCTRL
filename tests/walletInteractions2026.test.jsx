// @vitest-environment jsdom
import React from 'react';
import {describe,it,expect,vi} from 'vitest';
import {create,act} from 'react-test-renderer';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc}}));
vi.mock('recharts',()=>({ResponsiveContainer:()=>null,ComposedChart:()=>null,Bar:()=>null,Line:()=>null,XAxis:()=>null,YAxis:()=>null,Tooltip:()=>null,CartesianGrid:()=>null}));
import WalletBankingCenter from '../src/components/wallet-banking/WalletBankingCenter';
const person={id:'p1',restaurant_id:'r1',name:'Test'};
const transaction={id:'tx1',kind:'fund_wallet',amount:45,currency:'SAR',status:'posted',note:'Salary',created_at:'2026-10-20T07:30:00Z',payer:'Business',payee:'Test'};
const textOf=node=>typeof node==='string'?node:(node.children||[]).map(textOf).join('');
const button=(root,text)=>root.findAllByType('button').find(b=>textOf(b)===text);
async function mount(owner=false){let categories=[],tags={};rpc.mockReset();rpc.mockImplementation(async(name,args)=>{
 if(name==='erp_bank_wallet_dashboard')return {data:{currencies:[{currency:'SAR',balance:45,transfers_in:45,transfers_out:0,pending_amount:0,status:'active'}],transactions:[transaction]}};
 if(name==='erp_bank_wallet_trend')return {data:{opening_balance:0,days:[{day:'2026-10-20',incoming:45,outgoing:0,balance:45,count:1}]}};
 if(name==='erp_bank_wallet_owner_funding_accounts')return {data:[]};
 if(name==='erp_wallet_personal_labels'){if(args.p_action==='save'){if(args.p_category)categories=[{id:'cat1',name:args.p_name}];else categories.push({id:'cat1',name:args.p_name});}if(args.p_action==='tag')tags[args.p_request]=args.p_category;return {data:{categories:[...categories],tags:{...tags}}};}
 if(name==='erp_bank_wallet_request')return {data:args.p_request_id};throw Error(name);
 });
 const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});let tree;
 await act(async()=>{tree=create(<QueryClientProvider client={client}><WalletBankingCenter person={person} owner={owner}/></QueryClientProvider>);});
 for(let i=0;i<20;i++){await act(async()=>{await new Promise(r=>setTimeout(r,10));});if(owner?rpc.mock.calls.some(c=>c[0]==='erp_bank_wallet_trend'):tree.root.findAllByType('input').some(x=>x.props.placeholder==='Category name'))break;}
 if(!owner)expect(tree.root.findAllByType('input').some(x=>x.props.placeholder==='Category name')).toBe(true);
 return {tree,client};
}
describe('Wallet interactions with mocked RPC transport',()=>{
 it('requires Other details and submits generated note with the original amount',async()=>{const {tree,client}=await mount();await act(async()=>button(tree.root,'Receive').props.onClick());await act(async()=>{tree.root.findAllByType('input').find(x=>x.props.type==='number').props.onChange({target:{value:'25'}});tree.root.findAllByType('select').find(x=>x.props.value==='funding').props.onChange({target:{value:'other'}});});expect(button(tree.root,'Submit for owner approval').props.disabled).toBe(true);await act(async()=>tree.root.findAllByType('textarea')[0].props.onChange({target:{value:'Family request'}}));expect(button(tree.root,'Submit for owner approval').props.disabled).toBe(false);await act(async()=>button(tree.root,'Submit for owner approval').props.onClick());expect(rpc).toHaveBeenCalledWith('erp_bank_wallet_request',expect.objectContaining({p_person:'p1',p_amount:25,p_currency:'SAR',p_note:'Other: Family request'}));tree.unmount();client.clear();});
 it('creates, renames and assigns a private category through the API',async()=>{const {tree,client}=await mount();const nameInput=()=>tree.root.findAllByType('input').find(x=>x.props.placeholder==='Category name');await act(async()=>nameInput().props.onChange({target:{value:'Family'}}));await act(async()=>button(tree.root,'Save category').props.onClick());await act(async()=>{await new Promise(r=>setTimeout(r,20));});await act(async()=>tree.root.findAllByType('button').find(x=>x.props['aria-label']==='Edit: Family').props.onClick());await act(async()=>nameInput().props.onChange({target:{value:'Home'}}));await act(async()=>button(tree.root,'Save category').props.onClick());expect(rpc).toHaveBeenCalledWith('erp_wallet_personal_labels',expect.objectContaining({p_action:'save',p_category:'cat1',p_name:'Home'}));await act(async()=>{await new Promise(r=>setTimeout(r,20));});const requestSelect=tree.root.findAllByType('select').find(x=>x.findAllByType('option').some(o=>o.props.value==='tx1'));await act(async()=>requestSelect.props.onChange({target:{value:'tx1'}}));const categorySelect=tree.root.findAllByType('select').find(x=>x.findAllByType('option').some(o=>o.props.value==='cat1'));await act(async()=>categorySelect.props.onChange({target:{value:'cat1'}}));await act(async()=>button(tree.root,'Save label').props.onClick());expect(rpc).toHaveBeenCalledWith('erp_wallet_personal_labels',expect.objectContaining({p_action:'tag',p_category:'cat1',p_request:'tx1'}));tree.unmount();client.clear();});
 it('does not request or show another person’s private categories in owner mode',async()=>{const {tree,client}=await mount(true);expect(rpc.mock.calls.some(c=>c[0]==='erp_wallet_personal_labels')).toBe(false);expect(JSON.stringify(tree.toJSON())).not.toContain('Personal categories');tree.unmount();client.clear();});
});
