// @vitest-environment jsdom
import React from 'react';
import {act,create} from 'react-test-renderer';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:mock}));
import ClosingFundingPanel from '@/components/sales/ClosingFundingPanel';
let tree,client;
afterEach(()=>{if(tree)act(()=>tree.unmount());client?.clear();sessionStorage.clear();vi.resetAllMocks();});
const accounts=[
 {id:'wallet',restaurant_id:'r',account_name:'Owner wallet',account_type:'cash',currency:'SAR',is_active:true},
 {id:'drawer',restaurant_id:'r',branch_id:'b',account_name:'Drawer',account_type:'cash',currency:'SAR',is_active:true},
 {id:'foreign-currency',restaurant_id:'r',account_name:'USD wallet',account_type:'cash',currency:'USD',is_active:true},
];
const mount=async({balance=2000,history=[],balanceError=false}={})=>{
 mock.from.mockImplementation(table=>{const chain={};for(const name of ['select','eq','gte','order'])chain[name]=vi.fn(()=>chain);chain.range=vi.fn(async()=>({data:table==='treasury_accounts'?accounts:history,error:null}));return chain;});
 mock.rpc.mockImplementation(async(name)=>name==='erp_bank_wallet_owner_funding_accounts'?(balanceError?{error:new Error('offline')}:{data:[{id:'wallet',available_balance:balance}]}):{data:{status:'posted'}});
 client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 await act(async()=>{tree=create(<QueryClientProvider client={client}><ClosingFundingPanel initialSource="treasury" restaurantId="r" branchId="b" branchKey="main" date="2026-10-25" shift="Morning" cashierId="c" expectedCash={-1702} actualCash={150} role="owner"/></QueryClientProvider>);});
 await act(async()=>{await new Promise(r=>setTimeout(r,30));});
};
const fill=()=>act(()=>{
 const selects=tree.root.findAllByType('select');selects[1].props.onChange({target:{value:'wallet'}});selects[2].props.onChange({target:{value:'drawer'}});
 tree.root.findAllByType('input').find(x=>x.props.inputMode==='decimal').props.onChange({target:{value:'1852'}});
 tree.root.findByType('textarea').props.onChange({target:{value:'Owner wallet cash receipt'}});
 tree.root.findAllByType('input').find(x=>x.props.type==='checkbox').props.onChange({target:{checked:true}});
});
const postButton=()=>tree.root.findAllByType('button').at(-1);
describe('closing owner wallet transfer',()=>{
 it('posts explicitly selected wallet and drawer once, without treating it as new owner money',async()=>{
  await mount();fill();expect(postButton().props.disabled).toBe(false);
  expect(tree.root.findAllByType('option').some(x=>x.props.value==='foreign-currency')).toBe(false);
  expect(mock.rpc.mock.calls.filter(x=>x[0]==='erp_fund_sales_closing_drawer')).toHaveLength(0);
  await act(async()=>{await postButton().props.onClick();});
  const posts=mock.rpc.mock.calls.filter(x=>x[0]==='erp_fund_sales_closing_drawer');
  expect(posts).toHaveLength(1);expect(posts[0][1]).toMatchObject({p_source:'treasury',p_source_account_id:'wallet',p_destination_account_id:'drawer',p_amount:1852,p_received:true,p_date:'2026-10-25'});
 });
 it('does not permit spending beyond the verified wallet balance',async()=>{await mount({balance:100});fill();expect(postButton().props.disabled).toBe(true);await act(async()=>postButton().props.onClick());expect(mock.rpc.mock.calls.filter(x=>x[0]==='erp_fund_sales_closing_drawer')).toHaveLength(0);});
 it('shows the blocking finalized date before attempting funding',async()=>{await mount({history:[{id:'closed',branch_id:'b',date:'2026-10-26',shift:'Morning',closing_state:'finalized'}]});fill();expect(tree.root.findByProps({'data-testid':'funding-closed-period'})).toBeTruthy();expect(postButton().props.disabled).toBe(true);});
 it('fails closed when wallet balance cannot be verified',async()=>{await mount({balanceError:true});fill();expect(postButton().props.disabled).toBe(true);});
 it('does not let another branch closed period block this drawer',async()=>{await mount({history:[{id:'closed',branch_id:'other',date:'2026-10-26',shift:'Morning',closing_state:'finalized'}]});fill();expect(postButton().props.disabled).toBe(false);});
});
