// @vitest-environment jsdom
import React from 'react';
import {create,act} from 'react-test-renderer';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {describe,it,expect,vi,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({fail:'',reads:[],invalid:[]}));
vi.mock('@/lib/AuthContext',()=>({useAuth:()=>({user:{id:'u',restaurant_id:'r',branch_id:'b',linked_entity_id:'profile',email:'test@example.com'},logout:vi.fn()})}));
vi.mock('@/lib/TenantContext',()=>({useTenant:()=>({managerBranchObject:{id:'b',name:'Branch',branch_key:'branch'}})}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:'en'})}));
vi.mock('@/api/supabaseClient',()=>({supabase:{from:table=>{
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
afterEach(()=>{if(tree)act(()=>tree.unmount());client?.clear();});
describe('portal failed reads',()=>{
 for(const [name,Component,table] of [['manager',Manager,'inventory'],['employee',Employee,'employees'],['supplier',Supplier,'supplier_invoices']]){
  it(`${name} shows retry instead of totals/actions after a failed read`,async()=>{
   mocks.fail=table;mocks.reads=[];mocks.invalid=[];
   client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
   await act(async()=>{tree=create(<MemoryRouter><QueryClientProvider client={client}><Component/></QueryClientProvider></MemoryRouter>);});
   for(let i=0;i<5;i++)await act(async()=>{await new Promise(r=>setTimeout(r,15));});
   expect(mocks.reads).toContain(table);
   expect(mocks.invalid).toEqual([]);
   expect(tree.root.findByProps({role:'alert'})).toBeTruthy();
   expect(JSON.stringify(tree.toJSON())).toContain('Data could not be loaded');
   expect(tree.root.findAllByType('button').map(b=>b.children.join(''))).toEqual(['Retry']);
  });
 }
});
