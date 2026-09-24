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
import {createRoot} from 'react-dom/client';
import RestaurantPOS, {ActionDialog} from '../src/pages/restaurant/RestaurantPOS.jsx';
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

it('takes restaurant payment on one screen with confirmation and canonical checkout',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const api={snapshot:{cart:{net_total:22}},command:vi.fn().mockResolvedValue({receipt:{id:'r'}})},close=vi.fn(),result=vi.fn(),c=restaurantCopy('en');
 try{
  await React.act(async()=>root.render(<ActionDialog touch kind="payment" api={api} c={c} currency="SAR" close={close} onResult={result}/>));
  const form=document.querySelector('.touch-quick-payment');expect(form).toBeTruthy();expect(document.querySelector('.touch-form')).toBeNull();
  expect(form.querySelector('input[type=number]')).toBeTruthy();expect(form.querySelector('input[type=checkbox]')).toBeNull();
  await React.act(async()=>[...form.querySelectorAll('button')].find(b=>b.textContent===c.card).click());
  expect(form.querySelector('input[type=number]')).toBeNull();
  await React.act(async()=>form.querySelector(':scope > button:last-child').click());
  expect(api.command).toHaveBeenCalledWith('checkout',{payment_confirmed:true,payments:[{payment_method:'card',amount:22}]});
  expect(close).toHaveBeenCalledTimes(1);expect(result).toHaveBeenCalledWith({receipt:{id:'r'}});
 }finally{await React.act(async()=>root.unmount());host.remove();}
});

it('opens branch-scoped product tools for managers and hides them without manage permission',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;fixture.portal='restaurant';
 const workspace={devices:[{id:'device',branch_id:'branch',code:'POS-01'}],menu:[],orders:[],events:[],can_manage:true};
 fixture.rpc.mockImplementation(async name=>({data:name==='erp_restaurant_pos_catalog'?{menu:[],categories:[],inventory:[]}:workspace}));
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await React.act(async()=>root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/restaurant/pos']}><RestaurantPOS/></MemoryRouter></QueryClientProvider>));
  await React.act(async()=>{await new Promise(r=>setTimeout(r,30));});
  const find=label=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(label));
  await React.act(async()=>find('Master / Add product').click());
  await React.act(async()=>{await new Promise(r=>setTimeout(r,30));});
  expect(fixture.rpc).toHaveBeenCalledWith('erp_restaurant_pos_catalog',{p_restaurant_id:'tenant',p_branch_id:'branch',p_search:''});
  expect(find('Bulk import').disabled).toBe(false);expect(find('Export all products').disabled).toBe(true);
  await React.act(async()=>find('Bulk import').click());
  expect(document.querySelector('input[type=file]').accept).toBe('.xlsx,.csv');
  await React.act(async()=>{client.setQueriesData({queryKey:['restaurant-pos']},old=>({...old,can_manage:false}));});
  await React.act(async()=>{await new Promise(r=>setTimeout(r,30));});
  expect(find('Master / Add product')).toBeUndefined();expect(document.querySelector('input[type=file]')).toBeNull();
 }finally{await React.act(async()=>root.unmount());host.remove();client.clear();}
});
