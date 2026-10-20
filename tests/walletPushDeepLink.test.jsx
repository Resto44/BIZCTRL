// @vitest-environment jsdom
import React from 'react';
import {act,create} from 'react-test-renderer';
import {describe,it,expect,vi} from 'vitest';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc}}));
vi.mock('../src/components/wallet-banking/WalletInsights',()=>({WalletTrend:()=>null,WalletPersonalCategories:()=>null}));
import WalletBankingCenter from '../src/components/wallet-banking/WalletBankingCenter';
const id='11111111-1111-4111-8111-111111111111';
const text=n=>typeof n==='string'?n:(n.children||[]).map(text).join('');
describe('Exact wallet push record navigation',()=>{
 it.each(['pending','posted'])('opens a %s target outside recent history without posting anything',async status=>{
  const target={id,person_id:'person',restaurant_id:'tenant',currency:'USD',status,kind:'fund_wallet',amount:25,note:'Exact notification record',initiated_by_owner:true,created_at:'2026-10-20T12:00:00Z',payer:'Business',payee:'Person',balance_before:10,balance_after:35};
  rpc.mockReset().mockImplementation(async name=>{
   if(name==='erp_wallet_push_record')return {data:target};
   if(name==='erp_bank_wallet_dashboard')return {data:{currencies:[{currency:'USD',balance:status==='posted'?35:10}],transactions:[],pending_requests:status==='pending'?[target]:[]}};
   throw Error(name);
  });
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});let tree;
  await act(async()=>{tree=create(<QueryClientProvider client={client}><WalletBankingCenter person={{id:'person',restaurant_id:'tenant',name:'Person'}} initialRequestId={id}/></QueryClientProvider>);});
  await act(async()=>{await new Promise(r=>setTimeout(r,40));});
  expect(text(tree.root)).toContain('Exact notification record');expect(text(tree.root)).toContain('USD');
  if(status==='pending')expect(tree.root.findAllByType('button').some(b=>text(b)==='Approve & Post')).toBe(true);
  else expect(text(tree.root)).toContain('35.00');
  expect(rpc.mock.calls.some(c=>c[0]==='erp_bank_wallet_review'||c[0]==='erp_bank_wallet_owner_transfer')).toBe(false);
  tree.unmount();client.clear();
 });
});
