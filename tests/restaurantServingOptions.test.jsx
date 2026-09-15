// @vitest-environment jsdom
import React from 'react';
import {describe,it,expect,vi} from 'vitest';
import TestRenderer,{act} from 'react-test-renderer';
vi.mock('@/lib/restaurantPOS',()=>({restaurantProductName:(m,lang)=>m['name_'+lang]||m.name}));
vi.mock('@/lib/retailCashier',()=>({money:(value,currency)=>currency+' '+value}));
import RestaurantFoodPicker from '../src/components/restaurant-pos/RestaurantFoodPicker';
import {groupRestaurantFoods,canSellServing} from '../src/lib/restaurantServingOptions';
const whole={id:'whole',restaurant_id:'r',branch_id:'b',option_group:'شواية',option_key:'whole_rice',name:'Whole roast with rice',price:40,active:true,category:'Food',category_id:'managed'};
const half={...whole,id:'half',option_key:'half_plain',name:'Owner special half',price:18};
function render(choose,editable=true,menu=[whole,half]) {
 let view;act(()=>{view=TestRenderer.create(<RestaurantFoodPicker menu={menu} editable={editable} onChoose={choose}/>);});
 act(()=>view.root.findAllByType('button')[0].props.onClick());
 return {view,portion:key=>view.root.findByProps({'data-portion':key}),side:key=>view.root.findByProps({'data-side':key}),add:()=>view.root.findByProps({'data-add-serving':true})};
}
describe('touch serving choices',()=>{
 it('selects size and rice separately, then sends the exact owner variant and quantity once',async()=>{
  const choose=vi.fn().mockResolvedValue({});const {view,portion,side,add}=render(choose);
  expect(view.root.findAll(n=>n.type==='button'&&n.props['data-portion'])).toHaveLength(3);
  act(()=>portion('half').props.onClick());act(()=>side('plain').props.onClick());
  expect(choose).not.toHaveBeenCalled();
  expect(view.root.findByType('h3').props.children).toBe('Owner special half');
  expect(view.root.findByProps({'data-selected-price':true}).props.children).toBe('SAR 18');
  act(()=>view.root.findByProps({'aria-label':'Increase quantity'}).props.onClick());
  await act(async()=>add().props.onClick());
  expect(choose).toHaveBeenCalledTimes(1);expect(choose).toHaveBeenCalledWith(half,2);
  expect(view.root.findByType('output').props.children).toBe(1);
  act(()=>view.unmount());
 });
 it('shows all six combinations but never sells missing, inactive, unpriced, or locked choices',async()=>{
  for(const item of [null,{...whole,active:false},{...whole,price:null},{...whole,price:''},{...whole,price:0},{...whole,price:'NaN'}])expect(canSellServing(item)).toBe(false);
  const choose=vi.fn();const {view,portion,add}=render(choose);
  act(()=>portion('quarter').props.onClick());expect(add().props.disabled).toBe(true);
  await act(async()=>add().props.onClick());expect(choose).not.toHaveBeenCalled();
  act(()=>view.unmount());
  const locked=render(choose,false);expect(locked.add().props.disabled).toBe(true);
  await act(async()=>locked.add().props.onClick());expect(choose).not.toHaveBeenCalled();act(()=>locked.view.unmount());
 });
 it('suppresses double taps while waiting and keeps quantity after a failed command',async()=>{
  let finish;const choose=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));const {view,add}=render(choose);
  act(()=>view.root.findByProps({'aria-label':'Increase quantity'}).props.onClick());
  let pending;act(()=>{pending=add().props.onClick();void add().props.onClick();});
  expect(choose).toHaveBeenCalledTimes(1);expect(add().props.disabled).toBe(true);
  await act(async()=>{finish(null);await pending;});expect(view.root.findByType('output').props.children).toBe(2);
  act(()=>view.unmount());
 });
 it('keeps restaurant and branch groups separate and filters by managed category identity',()=>{
  expect(groupRestaurantFoods([whole,half,{...whole,id:'other',branch_id:'other'},{id:'rice',name:'Rice',price:8,active:true}])).toHaveLength(3);
  expect(groupRestaurantFoods([whole,half],{category:'managed'})).toHaveLength(1);
  expect(groupRestaurantFoods([whole,half],{category:'Food'})).toHaveLength(0);
  expect(groupRestaurantFoods([whole,half],{search:'special'})).toHaveLength(1);
 });
});

describe('custom food business choices',()=>{
 it('selects arbitrary size and milk options with the exact configured price and blocks unavailable combinations',async()=>{
  const small={...whole,id:'latte-small',option_group:'Latte',option_key:'custom_small',variant_options:[{label:'Size',value:'Small'},{label:'Milk',value:'Regular'}],name:'Small latte',price:12};
  const large={...small,id:'latte-large',option_key:'custom_large',variant_options:[{label:'Size',value:'Large'},{label:'Milk',value:'Oat'}],name:'Large oat latte',price:19};
  const choose=vi.fn().mockResolvedValue({});const {view,add}=render(choose,true,[small,large]);
  expect(view.root.findAll(n=>n.type==='button'&&n.props['data-portion'])).toHaveLength(0);
  act(()=>view.root.findByProps({'data-option':'Size:Large'}).props.onClick());expect(add().props.disabled).toBe(true);
  act(()=>view.root.findByProps({'data-option':'Milk:Oat'}).props.onClick());expect(add().props.disabled).toBe(false);
  expect(view.root.findByProps({'data-selected-price':true}).props.children).toBe('SAR 19');
  await act(async()=>add().props.onClick());expect(choose).toHaveBeenCalledWith(large,1);
  act(()=>view.unmount());
 });
});
