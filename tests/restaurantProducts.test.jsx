// @vitest-environment jsdom
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {describe,it,expect,vi} from 'vitest';
const fixture=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:fixture.rpc}}));
vi.mock('@/lib/TenantContext',()=>({useTenant:()=>({activeRestaurant:{id:'tenant',business_type:'restaurant'},branches:[{id:'branch',name:'Main'}]})}));
vi.mock('@/lib/RoleContext',()=>({useRole:()=>({role:'owner',can:{uploadSales:true}})}));
vi.mock('@/lib/AuthContext',()=>({useAuth:()=>({user:{id:'owner'}})}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:'en',formatMoney:v=>'SAR '+v})}));
vi.mock('@/hooks/useRetailCashier',()=>({useRetailCashier:vi.fn()}));
vi.mock('@/components/ui/dialog',()=>({
 Dialog:({children})=><div>{children}</div>,DialogContent:({children})=><div>{children}</div>,
 DialogHeader:({children})=><div>{children}</div>,DialogTitle:({children})=><h2>{children}</h2>,
 DialogDescription:({children})=><p>{children}</p>
}));
import RestaurantProductWorkspace from '../src/components/restaurant-pos/RestaurantProductWorkspace.jsx';
import {Setup} from '../src/pages/restaurant/RestaurantPOS.jsx';
import {restaurantCopy} from '../src/components/restaurant-pos/copy.js';
import {restaurantMaterialFilter} from '../src/lib/restaurantProducts.js';
const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(' '):n?.props?text(n.props.children):'';
async function render(element) {
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});let view;
 await act(async()=>{view=TestRenderer.create(<QueryClientProvider client={client}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>);});
 await act(async()=>{await new Promise(r=>setTimeout(r,30));});
 return {view,close:async()=>{await act(async()=>view.unmount());client.clear();}};
}
describe('restaurant product separation',()=>{
 it('restricts only restaurant/cafe purchasing to materials',()=>{
  expect(restaurantMaterialFilter({business_type:'restaurant'})).toEqual({restaurant_product_type:'raw_material'});
  expect(restaurantMaterialFilter({business_mode:'cafe'})).toEqual({restaurant_product_type:'raw_material'});
  expect(restaurantMaterialFilter({business_type:'retail'})).toEqual({});
  expect(restaurantMaterialFilter({business_type:'supermarket'})).toEqual({});
 });
 it('shows dishes and switches to a separate materials workspace without refresh',async()=>{
  fixture.rpc.mockResolvedValue({data:{menu:[{id:'dish',name:'Chicken meal',price:18,active:true,stock_mode:'recipe',recipe:[]}],inventory:[],products:[]}});
  const {view,close}=await render(<RestaurantProductWorkspace rawMaterials={<p>RAW STOCK WORKSPACE</p>}/>);
  expect(text(view.toTree().rendered)).not.toContain('RAW STOCK WORKSPACE');
  expect(view.root.findAllByType('h2').some(n=>text(n)==='Chicken meal')).toBe(true);
  const nav=view.root.findByType('nav');
  await act(async()=>nav.findAllByType('button')[1].props.onClick());
  expect(view.root.findAllByType('p').some(n=>text(n)==='RAW STOCK WORKSPACE')).toBe(true);
  expect(view.root.findAllByType('h2').some(n=>text(n)==='Chicken meal')).toBe(false);
  await act(async()=>nav.findAllByType('button')[0].props.onClick());
  expect(view.root.findAllByType('h2').some(n=>text(n)==='Chicken meal')).toBe(true);
  await close();
 });
 it('creates a named dish with a per-portion recipe, without reusing the ingredient product',async()=>{
  fixture.rpc.mockResolvedValue({data:{products:[],inventory:[{id:'stock',product_name:'Raw chicken',quantity:10,unit:'kg'}]}});
  const done=vi.fn();const refresh=vi.fn().mockResolvedValue(undefined);
  const {view,close}=await render(<Setup tenant="tenant" branch="branch" c={restaurantCopy('en')} menuOnly initial={{name:'Chicken meal',price:18,tax_rate:0,recipe:[{inventory_id:'stock',quantity:'0.25'}]}} close={done} refresh={refresh}/>);
  await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
  const call=fixture.rpc.mock.calls.find(([name])=>name==='erp_restaurant_pos_setup');
  expect(call[1]).toMatchObject({p_restaurant_id:'tenant',p_branch_id:'branch',p_command:'menu',p_payload:{product_id:'',name:'Chicken meal',price:18,stock_mode:'recipe',recipe:[{inventory_id:'stock',quantity:0.25}]}});
  expect(done).toHaveBeenCalled();expect(refresh).toHaveBeenCalled();
  await close();
 });
});
