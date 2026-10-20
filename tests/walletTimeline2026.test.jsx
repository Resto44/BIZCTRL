// @vitest-environment jsdom
import React from 'react';
import {act,create} from 'react-test-renderer';
import {it,expect,vi} from 'vitest';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc}}));
import OwnerWalletTimeline from '../src/components/wallet-banking/OwnerWalletTimeline';
const text=n=>typeof n==='string'?n:(n.children||[]).map(text).join('');
it('groups compact rows by day, signs treasury movements and expands private details on demand',async()=>{
 const rows=[{id:'1',person_name:'Ali',kind:'fund_wallet',status:'posted',amount:40,balance_before:0,balance_after:40,activity_day:'2026-10-20',activity_at:'2026-10-20T12:00:00Z',note:'Hidden transfer detail'}, {id:'2',person_name:'Sara',kind:'return_to_owner',status:'posted',amount:10,balance_before:40,balance_after:30,activity_day:'2026-10-20',activity_at:'2026-10-20T11:00:00Z'}, {id:'3',person_name:'Omar',kind:'fund_wallet',status:'pending',amount:5,activity_day:'2026-10-19',activity_at:'2026-10-19T10:00:00Z'}];
 rpc.mockResolvedValue({data:{transactions:rows,total:3}});
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});let tree;
 await act(async()=>{tree=create(<QueryClientProvider client={client}><OwnerWalletTimeline tenant="tenant" currency="SAR" lang="en" t={{posted:'Posted',pending:'Pending',previous:'Previous',next:'Next'}} money={n=>Number(n).toFixed(2)+' SAR'} renderReview={()=>null}/></QueryClientProvider>);});
 await act(async()=>{await new Promise(r=>setTimeout(r,30));});
 expect(tree.root.findAllByType('h3')).toHaveLength(2);
 const articles=tree.root.findAllByType('article');expect(text(articles[0])).toContain('−40.00 SAR');expect(text(articles[1])).toContain('+10.00 SAR');expect(text(articles[2])).toContain('No balance change');expect(text(articles[2])).not.toContain('−5.00');
 expect(text(tree.root)).not.toContain('Hidden transfer detail');
 await act(async()=>articles[0].findByType('button').props.onClick());expect(text(tree.root)).toContain('Hidden transfer detail');
 await act(async()=>tree.root.findAllByType('button').find(b=>text(b)==='Incoming').props.onClick());
 expect(rpc).toHaveBeenLastCalledWith('erp_bank_wallet_owner_timeline',expect.objectContaining({p_filter:'incoming',p_offset:0}));
 await act(async()=>tree.root.findAllByType('input').find(n=>n.props.type==='month').props.onChange({target:{value:'2026-10'}}));
 expect(rpc).toHaveBeenLastCalledWith('erp_bank_wallet_owner_timeline',expect.objectContaining({p_month:'2026-10'}));
 tree.unmount();client.clear();
});
