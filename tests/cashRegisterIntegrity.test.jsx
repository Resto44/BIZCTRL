// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, afterEach } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),success:vi.fn(),error:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:mocks.rpc,from:mocks.from}}));
vi.mock('@/lib/AuthContext',()=>({useAuth:()=>({user:{id:'owner',role:'owner'}})}));
vi.mock('@/lib/TenantContext',()=>({useTenant:()=>({activeRestaurantId:'business',branches:[{id:'branch-id',key:'internal-key',label:'فرع الريان'}]})}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:'fa',currency:'SAR',formatMoney:n=>`SAR ${n.toFixed(2)}`})}));
vi.mock('@/lib/useNotify',()=>({useNotify:()=>({success:mocks.success,error:mocks.error})}));
import {readCashRows,cashRegisterIssues,validCashAmount,cashBranchLabel} from '../src/lib/cashRegisterData';
import {computeExpectedClosing,createOwnerCashInjection,submitSettlement} from '../src/services/cashRegisterService';
import OwnerCashInjectionForm from '../src/components/cashregister/OwnerCashInjectionForm';
let tree,client;
afterEach(()=>{if(tree)act(()=>tree.unmount());tree=null;client?.clear();sessionStorage.clear();vi.clearAllMocks();});
describe('cash register financial rules',()=>{
 it('preserves counted zero and cent precision',()=>{
  expect(computeExpectedClosing({opening_cash:0.1,owner_injection:0.2,cash_counted:0})).toEqual({expected_closing_cash:0.3,difference:-0.3,shortage:0.3,overage:0});
 });
 it('rejects invalid, blank, negative and sub-cent amounts',()=>{
  for(const value of ['',-1,0,Infinity,NaN,'2.001'])expect(validCashAmount(value)).toBe(false);
  expect(validCashAmount('45.25')).toBe(true);expect(validCashAmount(0,true)).toBe(true);
 });
 it('flags missing treasury links and duplicate active injection movements',()=>{
  expect(cashRegisterIssues([{id:'a',wallet_transaction_id:'w'},{id:'b'},{id:'c',wallet_transaction_id:'v'}],[{source_module:'OwnerCashInjection',source_record_id:'a'},{source_module:'OwnerCashInjection',source_record_id:'a'},{source_module:'OwnerCashInjection',source_record_id:'c'},{source_module:'OwnerCashInjection',source_record_id:'c',is_reversed:true}]).map(r=>r.id)).toEqual(['a','b']);
  expect(cashBranchLabel([{key:'internal',name:'Branch name'}],'internal')).toBe('Branch name');
 });
 it('posts only through the atomic RPC and forwards the retry ID',async()=>{
  mocks.rpc.mockResolvedValue({data:{id:'request'},error:null});
  await createOwnerCashInjection({requestId:'request',restaurantId:'business',branchId:'branch',date:'2026-10-13',amount:45.25,reason:'Operational Funding'});
  expect(mocks.rpc).toHaveBeenCalledWith('post_owner_cash_injection',expect.objectContaining({p_request_id:'request',p_amount:45.25,p_branch:'branch'}));expect(mocks.from).not.toHaveBeenCalled();
  await submitSettlement({settlementId:'settlement',cashCounted:0});expect(mocks.rpc).toHaveBeenLastCalledWith('cash_register_transition',expect.objectContaining({p_counted:0,p_action:'submit'}));
 });
 it('reads every page with explicit business scope and propagates errors',async()=>{
  const query={eq:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),range:vi.fn().mockResolvedValueOnce({data:Array.from({length:500},(_,id)=>({id}))}).mockResolvedValueOnce({data:[{id:500}]})};mocks.from.mockReturnValue({select:()=>query});
  const rows=await readCashRows('OwnerCashInjection',{restaurant_id:'business'});
  expect(rows).toHaveLength(501);expect(query.eq).toHaveBeenCalledWith('restaurant_id','business');expect(query.range).toHaveBeenLastCalledWith(500,999);
  query.range.mockResolvedValueOnce({error:new Error('offline')});await expect(readCashRows('OwnerCashInjection',{restaurant_id:'business'})).rejects.toThrow('offline');
  expect(()=>readCashRows('OwnerCashInjection',{})).toThrow('Choose a business');
 });
 it('keeps the same persisted request after a lost response and shows the branch name',async()=>{
  mocks.rpc.mockResolvedValueOnce({error:new Error('network lost')}).mockResolvedValueOnce({data:{id:'posted'},error:null});
  client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  await act(async()=>{tree=create(<MemoryRouter><QueryClientProvider client={client}><OwnerCashInjectionForm defaultBranch="internal-key" /></QueryClientProvider></MemoryRouter>);});
  act(()=>tree.root.findByProps({type:'number'}).props.onChange({target:{value:'45.25'}}));
  expect(tree.root.findAllByType('strong').some(n=>n.children.includes('فرع الريان'))).toBe(true);
  await act(async()=>{tree.root.findByType('form').props.onSubmit({preventDefault(){}});});
  // React Query delivers mutation observer updates on its notification task.
  await act(async()=>{await new Promise(r=>setTimeout(r,10));});
  const first=mocks.rpc.mock.calls[0][1].p_request_id;
  expect(JSON.parse(sessionStorage.getItem('cash-injection:owner:business:new')).requestId).toBe(first);
  await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
  await act(async()=>{await new Promise(r=>setTimeout(r,10));});
  expect(mocks.rpc.mock.calls[1][1].p_request_id).toBe(first);expect(sessionStorage.getItem('cash-injection:owner:business:new')).toBe(null);
 });
});
