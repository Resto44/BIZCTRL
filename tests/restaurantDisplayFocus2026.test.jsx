// @vitest-environment jsdom
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {describe,it,expect,vi,beforeEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const api=vi.hoisted(()=>({
 rpc:vi.fn(),pinned:null,paired:true,
 orders:[{id:'order-95',number:95,kitchen_status:'preparing',status:'paid',order_type:'takeaway'}],
}));
vi.mock('@/lib/restaurantPOS',()=>({restaurantRpc:(...args)=>api.rpc(...args)}));
import RestaurantDisplayFocus from '../src/pages/restaurant/RestaurantDisplayFocus.jsx';
const source=p=>readFileSync(resolve(process.cwd(),p),'utf8');
async function mount(props={}){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
 let tree;
 await act(async()=>{tree=TestRenderer.create(<QueryClientProvider client={client}>
   <RestaurantDisplayFocus deviceId="device-1" allowed lang="en" {...props}/>
 </QueryClientProvider>);});
 await act(async()=>{await new Promise(r=>setTimeout(r,25));});
 return {tree,close:async()=>{await act(async()=>tree.unmount());client.clear();}};
}
beforeEach(()=>{
 api.rpc.mockReset();api.pinned=null;api.paired=true;
 api.rpc.mockImplementation(async(name,args)=>{
   if(name!=='pos_display_focus')throw Error('Unexpected ERP RPC');
   if(args.p_action==='pin')api.pinned=args.p_order_id;
   if(args.p_action==='cart')api.pinned=null;
   return {paired:api.paired,pinned_order_id:api.pinned,
     pinned_order_number:api.pinned?95:null,current_order_id:'order-100',
     orders:api.orders};
 });
});
describe('Cashier Customer Screen kitchen-order focus',()=>{
 it('defaults to current cashier order with explicit pin of #95, and returns to cart on demand',async()=>{
  const {tree,close}=await mount();
  try{
   const select=tree.root.findByProps({'data-testid':'restaurant-display-order-select'});
   expect(select.props.value).toBe('');
   expect(tree.root.findByProps({'data-testid':'restaurant-display-selected-mode'})).toBeTruthy();
   const apply=tree.root.findByProps({'data-testid':'restaurant-display-apply-order'});
   expect(apply.props.disabled).toBe(true);
   await act(async()=>select.props.onChange({target:{value:'order-95'}}));
   expect(tree.root.findByProps({'data-testid':'restaurant-display-apply-order'}).props.disabled).toBe(false);
   await act(async()=>{
     tree.root.findByProps({'data-testid':'restaurant-display-apply-order'}).props.onClick();
     await new Promise(r=>setTimeout(r,25));
   });
   expect(api.rpc).toHaveBeenCalledWith('pos_display_focus',{
     p_device_id:'device-1',p_action:'pin',p_order_id:'order-95'
   });
   expect(api.pinned).toBe('order-95');
   await act(async()=>{
     tree.root.findByProps({'data-testid':'restaurant-display-follow-cart'}).props.onClick();
     await new Promise(r=>setTimeout(r,25));
   });
   expect(api.rpc).toHaveBeenCalledWith('pos_display_focus',{
     p_device_id:'device-1',p_action:'cart',p_order_id:null
   });
   expect(api.pinned).toBeNull();
  }finally{await close();}
 });
 it('does not permit switching before a screen is paired',async()=>{
  api.paired=false;
  const {tree,close}=await mount();
  try{
   expect(tree.root.findByProps({'data-testid':'restaurant-display-order-select'}).props.disabled).toBe(true);
   expect(tree.root.findByProps({'data-testid':'restaurant-display-apply-order'}).props.disabled).toBe(true);
   expect(api.rpc.mock.calls.filter(([,p])=>p.p_action==='pin')).toHaveLength(0);
  }finally{await close();}
 });
 it('does not request scope data without cashier permission',async()=>{
  const {tree,close}=await mount({allowed:false});
  try{
   expect(tree.root.findAllByProps({'data-testid':'restaurant-display-focus'})).toHaveLength(0);
   expect(api.rpc).not.toHaveBeenCalled();
  }finally{await close();}
 });
 it('preserves current customer token / anonymous session while pinning selected same-shift order',()=>{
  const sql=source('supabase/migrations/20261110153000_restaurant_customer_display_focus.sql');
  const pos=source('src/pages/restaurant/RestaurantPOS.jsx');
  const customer=source('src/pages/restaurant/RestaurantCustomerDisplay.jsx');
  expect(sql).toContain('add column if not exists pinned_order_id uuid null');
  expect(sql).toContain("x.id=coalesce(ds.pinned_order_id,ds.order_id) and x.device_id=d.id");
  expect(sql).toContain("x.device_id=d.id and x.shift_id=s.id");
  expect(sql).toContain("x.kitchen_status in ('queued','preparing','ready')");
  expect(sql).toContain("p_action='pin'");
  expect(sql).toContain("p_action in ('list','pin','cart')");
  expect(sql).toContain("new.token_hash is distinct from old.token_hash");
  expect(sql).toContain("ds.order_id=new.id or ds.pinned_order_id=new.id");
  expect(sql).toContain("restaurant_pos_private.guard(d.restaurant_id,d.branch_id,'uploadSales')");
  expect(sql).toContain("grant execute on function public.erp_restaurant_pos_display_focus(uuid,text,uuid)");
  expect(pos).toContain('RestaurantDisplayFocus deviceId={device.id}');
  expect(customer).toContain("restaurantRpc('customer_display',{p_token:token},client)");
  expect(sql).not.toContain('UPDATE public.daily_sales');
 });
});
