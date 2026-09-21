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
import RestaurantDevices from '../src/components/restaurant-pos/RestaurantDevices.jsx';
import RestaurantSalesCategories from '../src/components/restaurant-pos/RestaurantSalesCategories.jsx';
import RestaurantMenuGroupEditor from '../src/components/restaurant-pos/RestaurantMenuGroupEditor.jsx';
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
  const {view,close}=await render(<Setup tenant="tenant" branch="branch" c={restaurantCopy('en')} menuOnly initial={{category_id:'managed',name:'Chicken meal',price:18,tax_rate:0,recipe:[{inventory_id:'stock',quantity:'0.25'}]}} close={done} refresh={refresh}/>);
  await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
  const call=fixture.rpc.mock.calls.find(([name])=>name==='erp_restaurant_pos_setup');
  expect(call[1]).toMatchObject({p_restaurant_id:'tenant',p_branch_id:'branch',p_command:'menu',p_payload:{category_id:'managed',product_id:'',name:'Chicken meal',price:18,stock_mode:'recipe',recipe:[{inventory_id:'stock',quantity:0.25}]}});
  expect(done).toHaveBeenCalled();expect(refresh).toHaveBeenCalled();
  await close();
 });
});

describe('owner serving editor',()=>{
 it('uses managed categories and saves independent names/prices in one atomic request',async()=>{
  fixture.rpc.mockClear();fixture.rpc.mockResolvedValue({data:{ok:true}});
  const initial=[{id:'old',option_group:'Roast',option_key:'whole_rice',category_id:'category',name:'Whole special',price:40,active:true,stock_mode:'recipe',recipe:[{inventory_id:'stock',quantity:0.5}]}];
  const {view,close}=await render(<RestaurantMenuGroupEditor tenant="tenant" branch="branch" initial={initial} catalog={{categories:[{id:'category',name:'Chicken',is_active:true},{id:'hidden',name:'Hidden',is_active:false}],inventory:[]}} refresh={vi.fn()} close={vi.fn()}/>);
  expect(view.root.findAll(n=>n.type==='section'&&n.props['data-owner-serving'])).toHaveLength(6);
  const category=view.root.findAllByType('select').find(n=>n.props.value==='category');
  expect(category.findAllByType('option').map(n=>n.props.value)).toEqual(['','category']);
  const row=()=>view.root.findByProps({'data-owner-serving':'half_plain'});
  act(()=>row().findByProps({type:'checkbox'}).props.onChange({target:{checked:true}}));
  expect(row().findByProps({'data-field':'price'}).props.value).toBe('');
  act(()=>row().findByProps({'data-field':'name'}).props.onChange({target:{value:'My half plain'}}));
  act(()=>row().findByProps({'data-field':'price'}).props.onChange({target:{value:'17.5'}}));
  act(()=>row().findAllByType('select').find(n=>n.props.value==='recipe').props.onChange({target:{value:'untracked'}}));
  act(()=>view.root.findAllByType('input').find(n=>n.props.type==='checkbox'&&n.props.required).props.onChange({target:{checked:true}}));
  await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
  const calls=fixture.rpc.mock.calls.filter(([name])=>name==='erp_restaurant_pos_setup');expect(calls).toHaveLength(1);
  const payload=calls[0][1];expect(payload.p_command).toBe('menu_batch');expect(payload.p_payload.category_id).toBe('category');
  expect(payload.p_payload.items).toHaveLength(2);
  expect(payload.p_payload.items.find(r=>r.option_key==='half_plain')).toMatchObject({name:'My half plain',price:17.5,recipe:[],stock_mode:'untracked'});
  expect(payload.p_payload.items.find(r=>r.option_key==='whole_rice')).toMatchObject({id:'old',price:40,recipe:[{inventory_id:'stock',quantity:0.5}]});
  await close();
 });
});

describe('separate POS sales category management',()=>{
 it('lists and saves restaurant POS categories only, without submitting the surrounding menu form',async()=>{
  fixture.rpc.mockReset();fixture.rpc.mockImplementation(async(name,args)=>({data:args?.p_command==='category_list'?{categories:[{id:'sales-cat',name:'Grills',is_active:true,sort_order:0}]}:{ok:true}}));
  const saved=vi.fn();
  const {view,close}=await render(<RestaurantSalesCategories tenant="tenant" branch="branch" lang="en" close={vi.fn()} refresh={vi.fn()} onSaved={saved}/>);
  expect(fixture.rpc).toHaveBeenCalledWith('erp_restaurant_pos_setup',expect.objectContaining({p_restaurant_id:'tenant',p_branch_id:'branch',p_command:'category_list'}));
  expect(view.root.findAllByType('strong').some(n=>text(n)==='Grills')).toBe(true);
  await act(async()=>view.root.findAllByType('button').find(n=>text(n).trim()==='Add sales category').props.onClick());
  const field=label=>view.root.findAllByType('label').find(n=>text(n).trim()===label).findByType('input');
  act(()=>field('Category name').props.onChange({target:{value:'Rice dishes'}}));
  act(()=>field('Arabic name').props.onChange({target:{value:'أطباق الأرز'}}));
  const stopped=vi.fn();await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){},stopPropagation:stopped}));
  const calls=fixture.rpc.mock.calls.filter(([,args])=>args.p_command==='category_save');expect(calls).toHaveLength(1);
  expect(calls[0][1]).toMatchObject({p_restaurant_id:'tenant',p_branch_id:'branch',p_payload:{name:'Rice dishes',name_ar:'أطباق الأرز',is_active:true}});
  expect(stopped).toHaveBeenCalledOnce();expect(saved).toHaveBeenCalledWith(calls[0][1].p_payload.id);
  expect(fixture.rpc.mock.calls.every(([name])=>name==='erp_restaurant_pos_setup')).toBe(true);
  await close();
 });
});

describe('customizable food owner setup',()=>{
 it('generates a café menu with editable option groups and saves only owner-priced choices',async()=>{
  fixture.rpc.mockReset();fixture.rpc.mockResolvedValue({data:{ok:true}});
  const {view,close}=await render(<RestaurantMenuGroupEditor tenant="tenant" branch="branch" catalog={{categories:[{id:'cat',name:'Drinks',is_active:true}]}} refresh={vi.fn()} close={vi.fn()}/>);
  act(()=>view.root.findByProps({'data-template':'cafe'}).props.onClick());
  expect(view.root.findAllByType('textarea')).toHaveLength(3);
  act(()=>view.root.findByProps({'data-generate-options':true}).props.onClick());
  const rows=view.root.findAll(n=>n.type==='section'&&n.props['data-owner-serving']);expect(rows).toHaveLength(12);
  const title=view.root.findAllByType('input').find(n=>n.props.maxLength===80);act(()=>title.props.onChange({target:{value:'Latte'}}));
  const category=view.root.findAllByType('select').find(n=>n.findAllByType('option').some(o=>o.props.value==='cat'));act(()=>category.props.onChange({target:{value:'cat'}}));
  const key=rows[0].props['data-owner-serving'];const row=()=>view.root.findByProps({'data-owner-serving':key});
  act(()=>row().findByProps({type:'checkbox'}).props.onChange({target:{checked:true}}));
  act(()=>row().findByProps({'data-field':'name'}).props.onChange({target:{value:'My small latte'}}));
  act(()=>row().findByProps({'data-field':'price'}).props.onChange({target:{value:'14'}}));
  act(()=>row().findAllByType('select').find(n=>n.props.value==='recipe').props.onChange({target:{value:'untracked'}}));
  act(()=>view.root.findAllByType('input').find(n=>n.props.type==='checkbox'&&n.props.required).props.onChange({target:{checked:true}}));
  await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
  const call=fixture.rpc.mock.calls.find(([,args])=>args.p_command==='menu_batch');
  expect(call[1].p_payload.items).toHaveLength(1);expect(call[1].p_payload.items[0]).toMatchObject({name:'My small latte',price:14,variant_options:[{label:'Size',value:'Small'},{label:'Milk',value:'Regular'},{label:'Sugar',value:'No sugar'}]});
  await close();
 });
});


describe('manual POS registration',()=>{
 it('starts empty and creates exactly one named branch device with a stable retry ID',async()=>{
  fixture.rpc.mockReset();fixture.rpc.mockResolvedValue({data:{ok:true}});
  const {view,close}=await render(<RestaurantDevices tenant="tenant" branch="branch" branches={[{id:'branch',name:'Main'}]} devices={[]} close={vi.fn()} refresh={vi.fn()}/>);
  expect(view.root.findAllByType('h3').some(n=>text(n)==='No POS devices added')).toBe(true);
  expect(fixture.rpc).not.toHaveBeenCalled();
  act(()=>view.root.findAllByType('button').find(n=>text(n).includes('Add POS')).props.onClick());
  act(()=>view.root.findByType('input').props.onChange({target:{value:'Front counter'}}));
  await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){},stopPropagation(){}}));
  expect(fixture.rpc).toHaveBeenCalledOnce();expect(fixture.rpc.mock.calls[0][1]).toMatchObject({p_branch_id:'branch',p_command:'device_save',p_payload:{code:'Front counter'}});
  expect(fixture.rpc.mock.calls[0][1].p_payload.id).toBeTruthy();
  await close();
 });
});
describe('restaurant food removal',()=>{
 it('selects all and individually deactivates dishes without deleting invoice records',async()=>{
  fixture.rpc.mockClear();const dishes=[{id:'a',name:'Food A',price:20,tax_rate:0,active:true,stock_mode:'untracked',category_id:'cat',recipe:[]},{id:'b',name:'Food B',price:10,tax_rate:0,active:true,stock_mode:'untracked',category_id:'cat',recipe:[]}];
  let catalogReads=0;
  fixture.rpc.mockImplementation(async(name,args)=>{if(args?.p_command==='menu_archive'){dishes.filter(d=>args.p_payload.ids.includes(d.id)).forEach(d=>{d.active=false;});return {data:{ok:true}};}if(++catalogReads>1)return new Promise(()=>{});return {data:{menu:dishes.map(d=>({...d})),categories:[],inventory:[]}};});
  const {view,close}=await render(<RestaurantProductWorkspace rawMaterials={<p>RAW</p>}/>);
  const all=view.root.findAllByType('input').find(n=>n.props.type==='checkbox'&&!n.props['aria-label']);await act(async()=>all.props.onChange({target:{checked:true}}));
  const bulk=view.root.findAllByType('button').find(n=>text(n).includes('Delete selected'));expect(bulk.props.disabled).toBe(false);expect(view.root.findAllByType('input').filter(n=>n.props['aria-label']?.startsWith('Select ')&&n.props.checked)).toHaveLength(2);await act(async()=>bulk.props.onClick());
  await act(async()=>view.root.findAllByType('button').find(n=>text(n)==='Confirm removal').props.onClick());
  const mutations=fixture.rpc.mock.calls.filter(([,a])=>a?.p_command==='menu_archive');expect(mutations).toHaveLength(1);expect(mutations[0][1]).toMatchObject({p_restaurant_id:'tenant',p_branch_id:'branch',p_payload:{ids:['a','b']}});
  expect(view.root.findAllByType('button').some(n=>text(n)==='Confirm removal')).toBe(false);
  expect(view.root.findAllByType('h2').some(n=>text(n)==='Food A'||text(n)==='Food B')).toBe(false);
  expect(view.root.findAll(n=>n.props.role==='status').some(n=>text(n).includes('Removed: 2'))).toBe(true);
  await close();
 });
});
