// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {partnerText} from '../src/lib/partnerTreasury';
const state=vi.hoisted(()=>({rpc:vi.fn(),invalidateQueries:vi.fn().mockResolvedValue(),owner:false}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:(...a)=>state.rpc(...a)}}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>state,useQuery:({queryKey})=>({data:queryKey[0]==='partner-requests'?{count:1,records:[{id:'req',kind:'sponsor_advance_to_owner',amount:35,currency:'SAR',effective_date:'2026-10-18',payment_method:'cash',status:'pending'}]}:[{id:'account',account_name:'Cash',currency:'SAR',account_type:'cash'}],refetch:vi.fn()})}));
import Requests from '../src/components/settlement/PartnerTransactionRequests';
it('partner submits request without invoking the posting or approval RPC',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);const t=partnerText('en');state.rpc.mockReset().mockImplementation(async(_n,a)=>({data:{id:a.p_request_id,status:'pending'}}));
 try{await act(async()=>root.render(<Requests partner={{id:'partner'}} t={t}/>));await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===t.newRequest).click());const amount=host.querySelector('[inputmode="decimal"]');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(amount,'35');amount.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>host.querySelector('[type="checkbox"]').click());await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(state.rpc).toHaveBeenCalledTimes(1);expect(state.rpc).toHaveBeenCalledWith('erp_submit_partner_request',expect.objectContaining({p_partner_id:'partner',p_amount:35}));expect(host.textContent).toContain(t.requestSent);}finally{await act(async()=>root.unmount());host.remove();}
});
it('owner approval requires account and confirmation and uses atomic review RPC',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);const t=partnerText('en');state.rpc.mockReset().mockResolvedValue({data:{id:'req',status:'approved'}});
 try{await act(async()=>root.render(<Requests partner={{id:'partner',restaurant_id:'tenant'}} owner t={t}/>));const submit=[...host.querySelectorAll('button')].find(b=>b.textContent===t.approveRequest);expect(submit.disabled).toBe(true);await act(async()=>{const select=host.querySelector('select');select.value='account';select.dispatchEvent(new Event('change',{bubbles:true}));});await act(async()=>host.querySelector('[type="checkbox"]').click());expect(submit.disabled).toBe(false);await act(async()=>submit.click());expect(state.rpc).toHaveBeenCalledWith('erp_review_partner_request',{p_request_id:'req',p_approve:true,p_account_id:'account',p_note:''});}finally{await act(async()=>root.unmount());host.remove();}
});
