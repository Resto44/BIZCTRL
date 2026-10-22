// @vitest-environment jsdom
import React from 'react';
import {create,act} from 'react-test-renderer';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {describe,it,expect,vi,afterEach,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({fail:'',reads:[],invalid:[]}));
vi.mock('@/lib/AuthContext',()=>({useAuth:()=>({user:{id:'u',restaurant_id:'r',branch_id:'b',linked_entity_id:'profile',email:'test@example.com'},logout:vi.fn()})}));
vi.mock('@/lib/TenantContext',()=>({useTenant:()=>({managerBranchObject:{id:'b',name:'Branch',branch_key:'branch'}})}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:'en',translateLiteral:(value)=>value})}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:async()=>({data:{configured:false,reason:'APPROVED_EMPLOYEE_LINK_REQUIRED'},error:null}),from:table=>{
 let single=false;
 const chain=new Proxy({}, {get:(_,key)=>{
  if(key==='then')return (resolve)=>{mocks.reads.push(table);resolve({data:single?{id:'profile'}:[],error:table===mocks.fail?new Error('offline'):null});};
  return (...args)=>{
   if(key==='single'||key==='maybeSingle')single=true;
   if((key==='select'||key==='order')&&/created_at|shipped_at|purchase_order_items/.test(args[0]))mocks.invalid.push(args[0]);
   return chain;
  };
 }});return chain;
}}}));
import Manager from '@/pages/ManagerDashboardERP';
import Employee from '@/pages/EmployeeDashboardERP';
import Supplier from '@/pages/SupplierPortalERP';
let tree,client;
// jsdom lacks the browser observer used by the dashboard chart during loading.
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }));
afterEach(()=>{if(tree)act(()=>tree.unmount());client?.clear();tree=null;vi.unstubAllGlobals();});
describe('portal failed reads',()=>{
 for(const [name,Component,table] of [['manager',Manager,'daily_sales'],['supplier',Supplier,'supplier_invoices']]){
  it(`${name} shows retry instead of totals/actions after a failed read`,async()=>{
   mocks.fail=table;mocks.reads=[];mocks.invalid=[];
   client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
   await act(async()=>{tree=create(<MemoryRouter><QueryClientProvider client={client}><Component/></QueryClientProvider></MemoryRouter>, { createNodeMock: element => { const node = document.createElement(element.type); node.getBoundingClientRect = () => ({ width: 800, height: 300 }); return node; } });});
   for(let i=0;i<5;i++)await act(async()=>{await new Promise(r=>setTimeout(r,15));});
   expect(mocks.reads).toContain(table);
   expect(mocks.invalid).toEqual([]);
   expect(tree.root.findByProps({role:'alert'})).toBeTruthy();
   expect(JSON.stringify(tree.toJSON())).toContain('Data could not be loaded');
   expect(tree.root.findAllByType('button').map(b=>b.children.join(''))).toEqual(['Retry']);
  });
 }
  it('manager keeps verified core totals available when a secondary inventory read fails', async () => {
    mocks.fail='inventory'; mocks.reads=[]; mocks.invalid=[];
    client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
    await act(async()=>{tree=create(<MemoryRouter><QueryClientProvider client={client}><Manager/></QueryClientProvider></MemoryRouter>, {createNodeMock: element => {const node=document.createElement(element.type); node.getBoundingClientRect=()=>({width:800,height:300}); return node;}});});
    for(let i=0;i<5;i++)await act(async()=>{await new Promise(r=>setTimeout(r,15));});
    expect(mocks.reads).toContain('inventory');
    expect(JSON.stringify(tree.toJSON())).toContain('Some secondary branch widgets could not refresh');
    expect(JSON.stringify(tree.toJSON())).not.toContain('Data could not be loaded');
    const retry=tree.root.findAllByType('button').find(node=>node.children.includes('Retry widgets'));
    expect(retry).toBeTruthy();
    mocks.fail='';
    await act(async()=>{retry.props.onClick();});
    for(let i=0;i<5;i++)await act(async()=>{await new Promise(r=>setTimeout(r,15));});
    expect(tree.root.findAllByProps({role:'alert'})).toHaveLength(0);
  });
  it('employee portal still displays a secure attendance clock when employee profile read fails',async()=>{
    mocks.fail='employees';mocks.reads=[];mocks.invalid=[];
    client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
    await act(async()=>{tree=create(<MemoryRouter><QueryClientProvider client={client}><Employee/></QueryClientProvider></MemoryRouter>);});
    for(let i=0;i<5;i++)await act(async()=>{await new Promise(r=>setTimeout(r,15));});
    expect(mocks.reads).toContain('employees');
    expect(mocks.invalid).toEqual([]);
    const ui=JSON.stringify(tree.toJSON());
    expect(ui).toContain('My attendance');
    expect(ui).toContain('Profile unavailable');
  });

});
