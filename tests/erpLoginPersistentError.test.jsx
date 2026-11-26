// @vitest-environment jsdom
import React from 'react';
import {act, create} from 'react-test-renderer';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
const mock = vi.hoisted(() => ({signIn:vi.fn(),signOut:vi.fn(),rpc:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{auth:{getSession:async()=>({data:{session:null}}),signInWithPassword:mock.signIn,signOut:mock.signOut},rpc:mock.rpc}}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:'en'})}));
vi.mock('@/lib/RoleContext',()=>({ROLES:{OWNER:'owner',MANAGER:'manager',EMPLOYEE:'employee',DRIVER:'driver',SUPPLIER:'supplier'},ROLE_HOME:{employee:'/employee-dashboard'}}));
vi.mock('@/components/help/HelpLink',()=>({default:()=>null}));
vi.mock('@/components/BrandLogo',()=>({default:()=>null}));
vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn()}}));
import ERPLogin from '@/pages/ERPLogin';
let tree;
beforeEach(()=>{vi.clearAllMocks();mock.signOut.mockResolvedValue({});});
afterEach(()=>{if(tree)act(()=>tree.unmount());});
async function mount(){
 await act(async()=>{tree=create(<MemoryRouter initialEntries={['/erp-login?role=manager']}><ERPLogin/></MemoryRouter>);});
 act(()=>{
  tree.root.findByProps({id:'email'}).props.onChange({target:{value:'employee@example.com'}});
  tree.root.findByProps({id:'password'}).props.onChange({target:{value:'test-only-password'}});
 });
}
async function submit(){await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));}
describe('persistent portal sign-in feedback',()=>{
 it('returns directly to the public root from a fresh portal URL and preserves the credential back action',async()=>{
  await act(async()=>{tree=create(<MemoryRouter initialEntries={['/erp-login?role=manager']}><Routes><Route path="/erp-login" element={<ERPLogin/>}/><Route path="/" element={<div data-testid="landing-destination"/>}/></Routes></MemoryRouter>);});
  const link=()=>tree.root.findAllByType('a').find(a=>a.props['data-testid']==='portal-back-to-landing');
  expect(link().props.href).toBe('/');
  act(()=>tree.root.findAllByType('button').find(b=>b.children.includes('Back to portal selection')).props.onClick());
  expect(link().props.href).toBe('/');
  act(()=>link().props.onClick({button:0,preventDefault(){},defaultPrevented:false,metaKey:false,altKey:false,ctrlKey:false,shiftKey:false}));
  expect(tree.root.findByProps({'data-testid':'landing-destination'})).toBeTruthy();
  expect(mock.signOut).not.toHaveBeenCalled();
 });
 it('keeps a rejected login visible after the toast and allows retry',async()=>{
  mock.signIn.mockResolvedValue({error:{message:'Invalid login credentials'}});
  await mount();await submit();
  expect(tree.root.findByProps({role:'alert'}).children).toContain('Invalid login credentials');
  expect(mock.rpc).not.toHaveBeenCalled();
  expect(tree.root.findAllByType('button').find(b=>b.props.type==='submit').props.disabled).toBe(false);
  mock.signIn.mockRejectedValue(new Error('Network unavailable'));
  await submit();
  expect(tree.root.findByProps({role:'alert'}).children).toContain('Login failed. Please try again.');
 });
 it('rejects a different role, retains the explanation and clears it when choosing another portal',async()=>{
  mock.signIn.mockResolvedValue({data:{user:{id:'employee-1'}},error:null});
  mock.rpc.mockResolvedValue({data:{role:'employee'},error:null});
  await mount();await submit();
  expect(mock.signOut).toHaveBeenCalledOnce();
  expect(tree.root.findByProps({role:'alert'}).children.join('')).toContain('employee portal');
  act(()=>tree.root.findAllByType('button').find(b=>JSON.stringify(b.children.map(c=>typeof c==='string'?c:'' )).includes('Back to portal selection')).props.onClick());
  expect(tree.root.findAllByProps({role:'alert'})).toHaveLength(0);
 });
});
