// Management navigation after exiting the fixed cashier; portal rendering is covered in touchWorkspace.
vi.mock('@/components/pos-touch/TouchPrimitives',async importOriginal=>({...await importOriginal(),useTouchMode:()=>({enabled:false,supported:true,enable:()=>{},exit:()=>{}})}));
// @vitest-environment jsdom
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {describe,it,expect,vi} from 'vitest';
const fixture=vi.hoisted(()=>({portal:'restaurant',rpc:vi.fn(),command:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:fixture.rpc}}));
vi.mock('@/lib/cashierBroadcast',()=>({subscribeCashierBroadcast:()=>()=>{}}));
vi.mock('@/lib/TenantContext',()=>({useTenant:()=>({activeRestaurant:{id:'tenant',business_type:fixture.portal,currency:'SAR'},branches:[{id:'branch',name:'Main'}]})}));
vi.mock('@/lib/AuthContext',()=>({useAuth:()=>({user:{id:'owner'}})}));
vi.mock('@/lib/RoleContext',()=>({useRole:()=>({role:'owner',can:{viewSales:true,uploadSales:true,viewOrders:true,viewExpenses:true}})}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:'en'})}));
vi.mock('@/hooks/useRetailCashier',()=>({useRetailCashier:()=>({snapshot:{device:{id:'device',locked:false},shift:{cashier_name:'Cashier'},cart:{id:'cart',number:1,lines:[],net_total:0,tax_total:0},business:{branch_name:'Main',currency:'SAR'},receipts:[],held:[]},connected:true,command:fixture.command,refresh:vi.fn()})}));
import RestaurantPOS from '../src/pages/restaurant/RestaurantPOS.jsx';
import {isRestaurantPOSPortal,restaurantRpc,parseRecipeRows,kitchenNextState,restaurantProductName} from '../src/lib/restaurantPOS.js';
import {restaurantCopy} from '../src/components/restaurant-pos/copy.js';
const nodeText = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(nodeText).join(' ') : node?.props ? nodeText(node.props.children) : '';

describe('restaurant POS',()=>{
 it('keeps portal, recipe and kitchen rules explicit',()=>{
  expect(isRestaurantPOSPortal({business_type:'retail'})).toBe(false);
  expect(isRestaurantPOSPortal({business_type:'cafe'})).toBe(true);
  expect(parseRecipeRows([{inventory_id:'stock',quantity:'0.25'}])).toEqual([{inventory_id:'stock',quantity:0.25}]);
  expect(()=>parseRecipeRows([{inventory_id:'stock',quantity:'Infinity'}])).toThrow();
  expect(kitchenNextState('ready')).toBe('served');expect(kitchenNextState('served')).toBeNull();
  expect(restaurantProductName({name:'Chicken',name_ar:'دجاج'},'ar')).toBe('دجاج');
 });
 it('uses only restaurant RPC namespace and preserves server errors',async()=>{
  const client={rpc:vi.fn().mockResolvedValue({data:{ok:true},error:null})};
  expect(await restaurantRpc('cashier_snapshot',{p_device_id:'d'},client)).toEqual({ok:true});
  expect(client.rpc).toHaveBeenCalledWith('erp_restaurant_cashier_snapshot',{p_device_id:'d'});
  client.rpc.mockResolvedValue({error:{code:'42501',message:'Denied'}});
  await expect(restaurantRpc('cashier_snapshot',{},client)).rejects.toMatchObject({code:'42501'});
 });
 it('navigates all four screens without a refresh and queues a food touch',async()=>{
  fixture.portal='restaurant';fixture.command.mockResolvedValue({});
  fixture.rpc.mockResolvedValue({data:{devices:[{id:'device',branch_id:'branch',code:'POS-01'}],menu:[{id:'food',name:'Half chicken',price:15,active:true,category:'Food'}],orders:[],events:[],can_manage:true,paid_sales:0,unpaid_orders:0,purchases:0,expenses:0}});
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});let renderer;
  await act(async()=>{renderer=TestRenderer.create(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/restaurant/pos']}><RestaurantPOS/></MemoryRouter></QueryClientProvider>);});
  await act(async()=>{await new Promise(r=>setTimeout(r,50));});
  const click=async label=>{const b=renderer.root.findAllByType('button').find(n=>nodeText(n).includes(label));expect(b).toBeTruthy();await act(async()=>b.props.onClick());};
  await click('Half chicken');expect(fixture.command).toHaveBeenCalledWith('quantity',expect.any(Function));
  const c=restaurantCopy('en');
  for(const page of ['kitchen','display','control','sell']){
   const button=renderer.root.findByType('nav').findAllByType('button').find(b=>nodeText(b).includes(c[page]));
   await act(async()=>button.props.onClick());expect(button.props['aria-pressed']).toBe(true);
  }
  await act(async()=>renderer.unmount());client.clear();
 });
 it('does not query restaurant data inside the retail portal',async()=>{
  fixture.portal='retail';fixture.rpc.mockClear();const client=new QueryClient();let renderer;
  await act(async()=>{renderer=TestRenderer.create(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/restaurant/pos']}><RestaurantPOS/></MemoryRouter></QueryClientProvider>);});
  expect(renderer.root.findByProps({role:'alert'})).toBeTruthy();expect(fixture.rpc).not.toHaveBeenCalled();
  await act(async()=>renderer.unmount());client.clear();
 });
});
