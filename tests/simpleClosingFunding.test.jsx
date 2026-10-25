// @vitest-environment jsdom
import React from 'react';
import {act,create} from 'react-test-renderer';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:mock}));
import SimpleClosingFunding,{chooseClosingWallet,closingWalletFundingAmount} from '@/components/sales/SimpleClosingFunding';
const accounts=[{id:'owner',account_type:'cash',currency:'SAR',available_balance:5000},{id:'branch',branch_id:'b',account_type:'cash',currency:'SAR',available_balance:2000},{id:'foreign',branch_id:'other',account_type:'cash',currency:'SAR',available_balance:9999}];
let tree,client;
afterEach(()=>{if(tree)act(()=>tree.unmount());client?.clear();sessionStorage.clear();vi.resetAllMocks();});
const mount=async(lang='en')=>{client=new QueryClient({defaultOptions:{queries:{retry:false}}});mock.rpc.mockImplementation(async name=>name==='erp_closing_funding_accounts'?{data:accounts}:{data:{status:'posted'}});await act(async()=>{tree=create(<QueryClientProvider client={client}><SimpleClosingFunding restaurantId="r" branchId="b" branchKey="main" date="2026-10-25" shift="Morning" cashierId="c" expectedCash={-1702} actualCash={150} role="owner" lang={lang}/></QueryClientProvider>);});await act(async()=>new Promise(r=>setTimeout(r,30)));};
const button=()=>tree.root.findAllByType('button').at(-1);
describe('two-choice closing funding',()=>{
 it('never treats an actual counted loss as an extra incoming cash receipt',()=>{expect(closingWalletFundingAmount(100,50)).toBe(0);expect(closingWalletFundingAmount(-1702,150)).toBe(1852);expect(closingWalletFundingAmount(null,150)).toBe(0);});
 it('has exactly two wallet choices and no manual amount, reason or account fields',async()=>{await mount();expect(tree.root.findAllByProps({role:'radio'})).toHaveLength(2);for(const tag of ['input','select','textarea'])expect(tree.root.findAllByType(tag)).toHaveLength(0);expect(button().props.disabled).toBe(true);expect(mock.rpc.mock.calls.filter(x=>x[0]==='erp_fund_sales_closing_drawer')).toHaveLength(0);});
 it.each([['restaurant',0,'branch',null],['treasury',1,'owner','branch']])('posts %s with automatic amount and scoped accounts only after confirmation',async(source,index,account,destination)=>{await mount();act(()=>tree.root.findAllByProps({role:'radio'})[index].props.onClick());expect(button().props.disabled).toBe(false);await act(async()=>button().props.onClick());const posts=mock.rpc.mock.calls.filter(x=>x[0]==='erp_fund_sales_closing_drawer');expect(posts).toHaveLength(1);expect(posts[0][1]).toMatchObject({p_source:source,p_amount:1852,p_source_account_id:account,p_destination_account_id:destination,p_received:true});});
 it('uses only matching scope/currency and chooses deterministically',()=>{expect(chooseClosingWallet(accounts,'restaurant','b','main','SAR').id).toBe('branch');expect(chooseClosingWallet(accounts,'owner','b','main','USD')).toBeNull();});
 it.each(['fa','ar'])('localizes both choices in %s',async lang=>{await mount(lang);const text=JSON.stringify(tree.toJSON());expect(text).not.toContain('Owner wallet');expect(text).not.toContain('Restaurant wallet');});
 it('retries the frozen request after an ambiguous error without duplicating an amount calculation',async()=>{await mount();mock.rpc.mockImplementation(async name=>name==='erp_closing_funding_accounts'?{data:accounts}:{error:{message:'connection lost'}});act(()=>tree.root.findAllByProps({role:'radio'})[0].props.onClick());await act(async()=>button().props.onClick());const first=mock.rpc.mock.calls.filter(x=>x[0]==='erp_fund_sales_closing_drawer')[0][1];await act(async()=>button().props.onClick());expect(mock.rpc.mock.calls.filter(x=>x[0]==='erp_fund_sales_closing_drawer')[1][1]).toEqual(first);});
});
