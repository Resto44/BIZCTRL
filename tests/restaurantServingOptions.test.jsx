// @vitest-environment jsdom
import React from 'react';
import {describe,it,expect,vi} from 'vitest';
import TestRenderer,{act} from 'react-test-renderer';
vi.mock('@/lib/restaurantPOS',()=>({restaurantProductName:(m,lang)=>m['name_'+lang]||m.name}));
vi.mock('@/lib/retailCashier',()=>({money:(value,currency)=>currency+' '+value}));
import RestaurantFoodPicker from '../src/components/restaurant-pos/RestaurantFoodPicker';
import {groupRestaurantFoods,servingSlots,canSellServing} from '../src/lib/restaurantServingOptions';
const whole={id:'whole',restaurant_id:'r',branch_id:'b',option_group:'شواية',option_key:'whole_rice',name:'Whole roast with rice',price:40,active:true,category:'Food'};
const half={...whole,id:'half',option_key:'half_plain',name:'Half roast plain',price:18};
describe('touch serving choices',()=>{
 it('expands under the picture without adding a sale; sends only the chosen ID',()=>{
  const choose=vi.fn();let view;
  act(()=>{view=TestRenderer.create(<RestaurantFoodPicker menu={[whole,half]} lang="ar" currency="SAR" editable onChoose={choose}/>);});
  const header=view.root.findAllByType('button')[0];
  act(()=>header.props.onClick());expect(choose).not.toHaveBeenCalled();
  const slots=view.root.findAll(n=>n.type==='button'&&n.props['data-serving']);
  expect(slots).toHaveLength(4);
  expect(slots.find(n=>n.props['data-serving']==='half_rice').props.disabled).toBe(true);
  act(()=>slots.find(n=>n.props['data-serving']==='whole_rice').props.onClick());
  expect(choose).toHaveBeenCalledWith(whole);
  act(()=>slots.find(n=>n.props['data-serving']==='half_plain').props.onClick());
  expect(choose).toHaveBeenLastCalledWith(half);
  act(()=>view.unmount());
 });
 it('does not sell unavailable, unpriced or zero-price options, or a missing choice',()=>{
  for(const item of [null,{...whole,active:false},{...whole,price:null},{...whole,price:''},{...whole,price:0},{...whole,price:'NaN'}])expect(canSellServing(item)).toBe(false);
  expect(canSellServing(whole)).toBe(true);
  const choose=vi.fn();let view;
  act(()=>{view=TestRenderer.create(<RestaurantFoodPicker menu={[whole]} editable={false} onChoose={choose}/>);});
  act(()=>view.root.findAllByType('button')[0].props.onClick());
  for(const b of view.root.findAll(n=>n.type==='button'&&n.props['data-serving'])){expect(b.props.disabled).toBe(true);act(()=>b.props.onClick());}
  expect(choose).not.toHaveBeenCalled();act(()=>view.unmount());
 });
 it('keeps restaurant and branch groups separate and retains standalone foods',()=>{
  const groups=groupRestaurantFoods([whole,half,{...whole,id:'other',branch_id:'other'},{id:'rice',name:'Rice',price:8,active:true}]);
  expect(groups).toHaveLength(3);expect(groups[0].items.map(m=>m.id)).toEqual(['whole','half']);
  expect(servingSlots(groups[0]).find(s=>s.key==='whole_plain').item).toBeNull();
  expect(groupRestaurantFoods([whole,half],{search:'Half'})).toHaveLength(1);
  expect(groupRestaurantFoods([whole,half],{category:'Drinks'})).toHaveLength(0);
 });
});
