// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { closingFundingProposal, activeClosingNetworkAccounts, validClosingNetworkEntries, isClosingSettlementMovement } from '@/lib/closing/ClosingFunding';
import { cashReconciliationSnapshot } from '@/lib/closing/CashReconciliationLedger';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:mock.rpc}}));
import ClosingFundingPanel from '@/components/sales/ClosingFundingPanel';
let tree,client;
afterEach(()=>{if(tree)act(()=>tree.unmount());tree=null;client?.clear();sessionStorage.clear();vi.clearAllMocks();});
describe('closing funding and networks',()=>{
 it('includes standalone owner receipts in a new closing and excludes only its linked settlement',()=>{
  const standalone={direction:'in',amount:247,movement_type:'owner_injection',source_module:'OwnerCashInjection',source_document_id:null};
  expect(isClosingSettlementMovement(standalone,null)).toBe(false);
  expect(isClosingSettlementMovement(standalone,'closing')).toBe(false);
  expect(isClosingSettlementMovement({...standalone,source_document_id:'closing'},'closing')).toBe(true);
  const movements=[standalone].filter(m=>!isClosingSettlementMovement(m,null));
  expect(cashReconciliationSnapshot({ledgerMovements:movements,actualCash:247})).toMatchObject({expectedCash:247,difference:0});
 });
 it('shows both the minimum deficit and the funding matching an unchanged physical count',()=>{
  expect(closingFundingProposal(-152,95)).toEqual({minimum:152,toCount:247});
  expect(closingFundingProposal(null,null)).toEqual({minimum:0,toCount:null});
  expect(closingFundingProposal(100,95)).toEqual({minimum:0,toCount:0});
 });
 it('keeps sales and card revenue unchanged after funding while reconciling remaining cash',()=>{
  const input={openingCash:16,currentCashSales:121,revenueEntries:[{amount:529,payment_method:'card'}],actualCash:95,ledgerMovements:[{direction:'out',amount:289}]};
  expect(cashReconciliationSnapshot(input)).toMatchObject({revenueToday:650,expectedCash:-152,actualCash:95});
  const funded=cashReconciliationSnapshot({...input,ledgerMovements:[...input.ledgerMovements,{direction:'in',amount:247,movement_type:'owner_injection'}]});
  expect(funded).toMatchObject({revenueToday:650,cashSales:121,cardSales:529,expectedCash:95,actualCash:95,difference:0});
 });
 it('does not fund a noncash accounting expense or use card sales as drawer liquidity',()=>{
  const s=cashReconciliationSnapshot({currentCashSales:50,revenueEntries:[{amount:600,payment_method:'card'}],expenses:900,actualCash:50});
  expect(s).toMatchObject({expectedCash:50,cashFundingRequired:0,operatingResult:-250});
 });
 it('uses the tenant and canonical branch, and excludes inactive/foreign network accounts',()=>{
  const active={id:'a',restaurant_id:'r',branch_id:'b',status:'active'};
  const accounts=activeClosingNetworkAccounts([active,{...active,id:'foreign',restaurant_id:'other'},{...active,id:'wrong',branch_id:'other',branch:'main'},{...active,id:'off',status:'inactive',is_active:true},{...active,id:'legacy',branch_id:null,branch:'main'}],'r','b','main');
  expect(accounts.map(a=>a.id)).toEqual(['a','legacy']);
  expect(validClosingNetworkEntries([{amount:50,network_account_id:'a'}],accounts)).toBe(true);
  expect(validClosingNetworkEntries([{amount:50}],accounts)).toBe(false);
  expect(validClosingNetworkEntries([{amount:'1.001',network_account_id:'a'}],accounts)).toBe(false);
  expect(validClosingNetworkEntries([{amount:0}],[])).toBe(true);
 });
 const mount=async(role='owner', expectedCash=-152, actualCash=95)=>{client=new QueryClient({defaultOptions:{queries:{retry:false}}});await act(async()=>{tree=create(<QueryClientProvider client={client}><ClosingFundingPanel restaurantId="r" branchId="b" branchKey="main" date="2026-10-23" shift="Morning" cashierId="c" expectedCash={expectedCash} actualCash={actualCash} role={role}/></QueryClientProvider>);});};
 const fill=()=>act(()=>{tree.root.findByType('textarea').props.onChange({target:{value:'Confirmed supplier cash funding'}});tree.root.findAllByType('input').find(x=>x.props.type==='checkbox').props.onChange({target:{checked:true}});});
 it('offers Owner/Treasury funding for a real counted shortage without pretending variance disappears',async()=>{
  await mount('owner',100,95);
  const amount=tree.root.findAllByType('input').find(x=>x.props.inputMode==='decimal');
  expect(amount.props.value).toBe('5');
  const notice=tree.root.findByProps({ 'data-testid': 'funding-physical-shortage-note' });
  expect(notice).toBeTruthy();
  expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('never posts on render or before confirmation; double click posts only once',async()=>{
  let resolve;mock.rpc.mockReturnValue(new Promise(r=>resolve=r));await mount();expect(mock.rpc).not.toHaveBeenCalled();
  let button=tree.root.findAllByType('button').at(-1);expect(button.props.disabled).toBe(true);fill();button=tree.root.findAllByType('button').at(-1);
  let submit;act(()=>{submit=button.props.onClick();button.props.onClick();});expect(mock.rpc).toHaveBeenCalledTimes(1);
  expect(mock.rpc.mock.calls[0][1]).toMatchObject({p_amount:247,p_source:'owner',p_cashier_id:'c',p_shift:'Morning',p_received:true});
  await act(async()=>{resolve({data:{status:'posted'}});await submit;});expect(sessionStorage.length).toBe(0);
 });
 it('retries the same frozen payload after an ambiguous connection failure',async()=>{
  mock.rpc.mockResolvedValueOnce({error:{message:'Connection lost'}}).mockResolvedValueOnce({data:{status:'already_posted'}});await mount();fill();
  await act(async()=>{await tree.root.findAllByType('button').at(-1).props.onClick();});
  expect(tree.root.findByType('fieldset').props.disabled).toBe(true);
  const first=mock.rpc.mock.calls[0][1];await act(async()=>{await tree.root.findAllByType('button').at(-1).props.onClick();});
  expect(mock.rpc.mock.calls[1][1]).toEqual(first);
 });
 it('shows managers the funding requirement without granting posting access',async()=>{await mount('manager');expect(tree.root.findAllByType('button')).toHaveLength(0);expect(mock.rpc).not.toHaveBeenCalled();});
});
