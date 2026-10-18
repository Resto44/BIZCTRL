// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {peopleText} from '../src/lib/peopleAccounts';
const state=vi.hoisted(()=>({rpc:vi.fn(),invalidateQueries:vi.fn().mockResolvedValue(),pending:[]}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:(...a)=>state.rpc(...a)}}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>state,useQuery:({queryKey})=>({data:queryKey[0]==='people-memberships'?state.pending:queryKey[0]==='people-custody'?{balances:[{currency:'SAR',payment_method:'cash',held:100,pending:2}],records:[],count:0}:[],refetch:vi.fn()})}));
import Requests from '../src/components/settlement/PartnerTransactionRequests';
import Memberships from '../src/components/settlement/PeopleMemberships';
let host,root;
async function mount(component){globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);await act(async()=>root.render(component));}
afterEach(async()=>{if(root)await act(async()=>root.unmount());host?.remove();state.rpc.mockReset();state.pending=[];});
async function input(el,value){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
it('custody submission only sends a request and displays held funds separately',async()=>{
 const t=peopleText('en');state.rpc.mockImplementation(async(_n,a)=>({data:a.p_id}));await mount(<Requests custody partner={{id:'employee',allow_custody:true,can_submit:true}} t={t}/>);
 expect(host.textContent).toContain('100.00 SAR');expect(host.textContent).toContain(t.held);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===t.newRequest).click());await input(host.querySelector('[inputmode="decimal"]'),'25');await act(async()=>host.querySelector('[type="checkbox"]').click());await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(state.rpc).toHaveBeenCalledTimes(1);expect(state.rpc).toHaveBeenCalledWith('erp_submit_custody_request',expect.objectContaining({p_person:'employee',p_kind:'custody_received',p_amount:25,p_method:'cash'}));expect(host.textContent).toContain(t.requestSent);
});
it('read only member has no transaction action',async()=>{const t=peopleText('fa');await mount(<Requests custody partner={{id:'employee',allow_custody:true,can_submit:false}} t={t}/>);expect(host.textContent).toContain(t.readOnly);expect([...host.querySelectorAll('button')].some(b=>b.textContent===t.newRequest)).toBe(false);});
it('joining does not let the applicant select or assign an ERP role',async()=>{
 const t=peopleText('en');state.rpc.mockResolvedValue({data:'request'});const joined=vi.fn();await mount(<Memberships t={t} joinToken="enrollment-secret" onJoined={joined}/>);expect(host.querySelector('select')).toBeNull();await input(host.querySelector('input'),'New staff');await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(state.rpc).toHaveBeenCalledWith('erp_request_person_account',{p_token:'enrollment-secret',p_name:'New staff'});expect(joined).toHaveBeenCalledTimes(1);
});
it.each(['fa','ar','en'])('account roles and custody copy exist in %s',lang=>{const t=peopleText(lang);for(const k of ['title','role','employee','manager','partner','custody_received','custody_returned','held','allowCustody'])expect(t[k]).toBeTruthy();});
