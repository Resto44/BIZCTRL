// @vitest-environment jsdom
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn(),getSession:vi.fn(),signup:vi.fn(),signin:vi.fn(),signout:vi.fn(),listener:null,lang:'en'}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:(...a)=>mock.rpc(...a),auth:{getSession:()=>mock.getSession(),onAuthStateChange:fn=>{mock.listener=fn;return {data:{subscription:{unsubscribe:vi.fn()}}};},signUp:(...a)=>mock.signup(...a),signInWithPassword:(...a)=>mock.signin(...a),signOut:()=>mock.signout()}}}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:mock.lang,setLang:vi.fn()})}));
import CustomerPortal from '../src/pages/CustomerPortal';
import CustomerPortalInvitation from '../src/components/customer/CustomerPortalInvitation';
const accounts=[{id:'customer-a',name:'Alice',business:'Shop A',currency:'SAR'},{id:'customer-b',name:'Bob',business:'Shop B',currency:'USD'}];
let tree,client;
const pause=()=>new Promise(resolve=>setTimeout(resolve,30));
async function mount(element=<CustomerPortal/>){client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});await act(async()=>{tree=TestRenderer.create(<QueryClientProvider client={client}>{element}</QueryClientProvider>);await pause();});for(let i=0;i<4;i++)await act(pause);return tree;}
const text=()=>JSON.stringify(tree.toJSON());
const button=label=>tree.root.findAllByType('button').find(x=>x.children.join('').includes(label));
beforeEach(()=>{vi.clearAllMocks();mock.lang='en';sessionStorage.clear();window.history.replaceState(null,'','/customer-portal');mock.getSession.mockResolvedValue({data:{session:{user:{id:'user-a'}}}});mock.signout.mockResolvedValue({});mock.rpc.mockImplementation(async(name,args)=>({data:name==='erp_customer_portal_accounts'?accounts:{totals:{total:100,paid:30,balance:70,overdue:70},rows:[{id:'debt-a',reference:args?.p_customer_id==='customer-b'?'BOB-INVOICE':'ALICE-INVOICE',amount:100,paid_amount:30,remaining_amount:70}],count:1,as_of:'2026-11-10T10:00:00Z'},error:null}));});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());client?.clear();});
describe('Customer self-service',()=>{
 it('loads only server-authorized account data and sends the selected customer scope',async()=>{await mount();expect(text()).toContain('ALICE-INVOICE');expect(mock.rpc).toHaveBeenCalledWith('erp_customer_portal_statement',expect.objectContaining({p_customer_id:'customer-a',p_kind:'invoices',p_page:0}));
 const select=tree.root.findAllByType('select').find(x=>x.props.value==='customer-a');await act(async()=>{select.props.onChange({target:{value:'customer-b'}});await pause();});await act(pause);
 expect(text()).toContain('BOB-INVOICE');expect(text()).not.toContain('ALICE-INVOICE');});
 it('clears financial content on sign out',async()=>{await mount();await act(async()=>{button('Sign out').props.onClick();await pause();});expect(text()).not.toContain('ALICE-INVOICE');expect(text()).toContain('Sign in');});
 it('hides previously loaded statements when access is revoked',async()=>{await mount();mock.rpc.mockResolvedValue({data:null,error:{message:'CUSTOMER_PORTAL_FORBIDDEN'}});
 await act(async()=>{client.setQueryDefaults(['customer-portal'],{retry:false});await client.refetchQueries({queryKey:['customer-portal']});await pause();});expect(text()).not.toContain('ALICE-INVOICE');expect(text()).toContain('Unable to load');});
 it('has explicit empty account state without inventing finance records',async()=>{mock.rpc.mockResolvedValue({data:[],error:null});await mount();expect(text()).toContain('Ask the business owner');expect(mock.rpc.mock.calls.some(([name])=>name==='erp_customer_portal_statement')).toBe(false);});
 it('retains invitations during email confirmation and creates identity without staff roles',async()=>{mock.getSession.mockResolvedValue({data:{session:null}});mock.signup.mockResolvedValue({data:{session:null},error:null});const validToken='a'.repeat(64);window.history.replaceState(null,'','/customer-portal#invite='+validToken);await mount();
 const inputs=tree.root.findAllByType('input');await act(async()=>{inputs[0].props.onChange({target:{value:'customer@example.com'}});inputs[1].props.onChange({target:{value:'example-password-123'}});});await act(async()=>{button('Create account').props.onClick();await pause();});
 expect(mock.signup).toHaveBeenCalledWith(expect.objectContaining({options:{emailRedirectTo:window.location.origin+'/customer-portal',data:{people_portal_registration:true}}}));expect(sessionStorage.getItem('customer:invite')).toBe(validToken);expect(text()).toContain('Confirm your email');});
 it('creates and revokes an invitation for the exact owner-selected customer',async()=>{mock.rpc.mockResolvedValue({data:{token:'secure-token'},error:null});await mount(<CustomerPortalInvitation customer={{id:'customer-a',email:'customer@example.com'}}/>);
 await act(async()=>{tree.root.findByType('form').props.onSubmit({preventDefault(){}});await pause();});expect(mock.rpc).toHaveBeenCalledWith('erp_customer_portal_invite',{p_customer_id:'customer-a',p_email:'customer@example.com',p_revoke:false});expect(text()).toContain('/customer-portal#invite=secure-token');
 await act(async()=>{button('Revoke portal access').props.onClick();await pause();});expect(mock.rpc).toHaveBeenLastCalledWith('erp_customer_portal_invite',{p_customer_id:'customer-a',p_email:'customer@example.com',p_revoke:true});expect(text()).not.toContain('#invite=');});
 it('does not display a link when the owner invitation is denied',async()=>{mock.rpc.mockResolvedValue({data:null,error:{message:'DENIED'}});await mount(<CustomerPortalInvitation customer={{id:'customer-a',email:'customer@example.com'}}/>);await act(async()=>{tree.root.findByType('form').props.onSubmit({preventDefault(){}});await pause();});expect(text()).not.toContain('#invite=');expect(text()).toContain('request failed');});
});
