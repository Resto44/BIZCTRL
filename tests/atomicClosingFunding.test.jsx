// @vitest-environment jsdom
import React from 'react';
import {act,create} from 'react-test-renderer';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:mock}));
import ClosingWalletChoice from '@/components/sales/ClosingWalletChoice';
import {saveClosingSession} from '@/lib/closing/ClosingRepository';
let tree,client;
afterEach(()=>{if(tree)act(()=>tree.unmount());tree=null;client?.clear();sessionStorage.clear();vi.resetAllMocks();});
const payload=(id)=>({restaurant_id:id,branch_id:'branch',date:'2026-10-26',shift:'Morning',cashier_id:'owner',closing_state:'finalized',actual_cash:180,wallet_funding:{source:'treasury',amount:289,source_account_id:'owner-wallet',destination_account_id:'branch-wallet',received:true}});
describe('atomic closing wallet confirmation',()=>{
 it('selects a wallet without posting any transfer',async()=>{
  mock.rpc.mockResolvedValue({data:[{id:'owner-wallet',currency:'SAR',account_type:'cash',available_balance:2000},{id:'branch-wallet',branch_id:'branch',currency:'SAR',account_type:'cash',available_balance:0}]});
  const onChange=vi.fn();client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  await act(async()=>{tree=create(<QueryClientProvider client={client}><ClosingWalletChoice restaurantId="r" branchId="branch" branchKey="main" currency="SAR" expectedCash={-109} actualCash={180} lang="fa" role="owner" onChange={onChange}/></QueryClientProvider>);});
  await act(async()=>new Promise(r=>setTimeout(r,30)));
  const choices=tree.root.findAllByProps({role:'radio'});expect(choices).toHaveLength(2);expect(choices[0].props.disabled).toBe(true);
  act(()=>choices[1].props.onClick());expect(onChange).toHaveBeenCalledWith(expect.objectContaining({amount:289,source:'treasury'}));
  expect(mock.rpc.mock.calls.every(([name])=>name==='erp_closing_funding_accounts')).toBe(true);
 });
 it('finalizes through a single atomic RPC and reuses the frozen request after timeout',async()=>{
  mock.rpc.mockResolvedValueOnce({error:{message:'network timeout'}}).mockResolvedValueOnce({data:{closing:{id:'existing',closing_state:'finalized'},idempotent:true}});
  await expect(saveClosingSession({payload:payload('retry'),closingId:'existing',requestId:'request-1'})).rejects.toThrow();
  await saveClosingSession({payload:payload('retry'),closingId:'existing',requestId:'request-2'});
  expect(mock.rpc.mock.calls[0][0]).toBe('erp_finalize_sales_closing_with_funding');
  expect(mock.rpc.mock.calls[1]).toEqual(mock.rpc.mock.calls[0]);
 });
 it('does not silently replace an uncertain transfer with a changed amount',async()=>{
  mock.rpc.mockResolvedValueOnce({error:{message:'timeout'}}).mockResolvedValueOnce({data:{closing:{id:'c'}}});
  const original=payload('conflict');await expect(saveClosingSession({payload:original,closingId:'c'})).rejects.toThrow();
  await expect(saveClosingSession({payload:{...original,actual_cash:200},closingId:'c'})).rejects.toMatchObject({code:'CLOSING_FUNDING_PENDING_RETRY'});
  expect(mock.rpc).toHaveBeenCalledTimes(1);await saveClosingSession({payload:original,closingId:'c'});
 });
 it('allows a corrected request after a definite transaction rejection',async()=>{
  mock.rpc.mockResolvedValueOnce({error:{code:'P0001',message:'CLOSING_FUNDING_PREVIEW_CHANGED'}}).mockResolvedValueOnce({data:{closing:{id:'c'}}});
  await expect(saveClosingSession({payload:payload('rollback'),closingId:'c'})).rejects.toThrow();
  await saveClosingSession({payload:{...payload('rollback'),actual_cash:185},closingId:'c'});expect(mock.rpc).toHaveBeenCalledTimes(2);
 });
});
