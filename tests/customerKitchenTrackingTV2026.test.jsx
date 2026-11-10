// @vitest-environment jsdom
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {MemoryRouter} from 'react-router-dom';
import {describe,it,expect,vi,beforeEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const mocks=vi.hoisted(()=>({
  rpc:vi.fn(),client:{},subscribe:vi.fn(),
}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>mocks.client}));
vi.mock('@/api/supabaseClient',()=>({SUPABASE_URL:'https://supabase.invalid',SUPABASE_ANON_KEY:'test-anon'}));
vi.mock('@/lib/restaurantPOS',()=>({restaurantRpc:(...args)=>mocks.rpc(...args)}));
vi.mock('@/lib/cashierBroadcast',()=>({
  subscribeCashierBroadcast:(...args)=>{mocks.subscribe(...args);return()=>{};}
}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:'en'})}));
import CustomerTrackingDisplay,{trackingGroup} from '../src/pages/restaurant/CustomerTrackingDisplay.jsx';

const token='a'.repeat(64);
const orders=[
 {number:110,stage:'queued',submitted_at:'2026-11-10T07:00:00Z'},
 {number:111,stage:'preparing',submitted_at:'2026-11-10T07:03:00Z'},
 {number:112,stage:'ready',submitted_at:'2026-11-10T07:06:00Z'},
];
const data={
 business_name:'Test Restaurant',branch_name:'Test Branch',topic:'topic-1',
 counts:{queued:1,preparing:1,ready:1},orders,overflow:0,
 // Hostile fixtures: public screen must never render private fields.
 customer_email:'private@example.com',phone:'+966123',cash_paid:40000,
};
const source=p=>readFileSync(resolve(process.cwd(),p),'utf8');
const render=async(hash='#'+token)=>{
 let tree;
 await act(async()=>{tree=TestRenderer.create(<MemoryRouter initialEntries={['/restaurant/customer-tracking'+hash]}>
    <CustomerTrackingDisplay/>
  </MemoryRouter>);});
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
 return {tree,close:async()=>{await act(async()=>tree.unmount());}};
};
beforeEach(()=>{
 mocks.rpc.mockReset();mocks.subscribe.mockReset();
 mocks.rpc.mockResolvedValue(data);
});

describe('Customer Tracking KDS TV',()=>{
 it('groups only supported kitchen stages in chronological order',()=>{
   expect(trackingGroup([...orders,{number:99,stage:'served'}]).ready.map(x=>x.number)).toEqual([112]);
   expect(trackingGroup([...orders].reverse()).queued.map(x=>x.number)).toEqual([110]);
   expect(trackingGroup(null)).toEqual({queued:[],preparing:[],ready:[]});
 });
 it('reads live order statuses through anonymous token-scoped RPC and never shows payment or contact data',async()=>{
   const {tree,close}=await render();
   try{
     expect(mocks.rpc).toHaveBeenCalledWith('customer_tracking_display',{p_token:token},mocks.client);
     expect(mocks.subscribe).toHaveBeenCalledWith(mocks.client,'customer-tracking:topic-1',expect.any(Function));
     expect(tree.root.findAllByProps({'data-testid':'customer-tracking-ticket'})).toHaveLength(3);
     expect(tree.root.findAllByProps({'data-testid':'customer-tracking-ready'})).toHaveLength(1);
     const text=JSON.stringify(tree.toJSON());
     expect(text).toContain('#110');
     expect(text).toContain('#112');
     expect(text).not.toContain('private@example.com');
     expect(text).not.toContain('+966123');
     expect(text).not.toContain('40000');
     expect(text).toContain('Test Restaurant');
   }finally{await close();}
 });
 it('rejects malformed links before any RPC call',async()=>{
   const {tree,close}=await render('#not-a-token');
   try{
     expect(mocks.rpc).not.toHaveBeenCalled();
     expect(tree.root.findAllByProps({role:'alert'})).not.toHaveLength(0);
   }finally{await close();}
 });
 it('fails closed if an 8-hour token is expired/revoked',async()=>{
   mocks.rpc.mockRejectedValue({code:'42501',message:'expired'});
   const {tree,close}=await render();
   try{
     expect(tree.root.findAllByProps({'data-testid':'customer-tracking-ticket'})).toHaveLength(0);
     expect(tree.root.findAllByProps({role:'alert'})).toHaveLength(1);
   }finally{await close();}
 });
 it('wires independent kitchen controls, public route and a least-privilege SQL token scheme',()=>{
   const sql=source('supabase/migrations/20261110074500_customer_kitchen_tv_tracking.sql');
   const kitchen=source('src/pages/restaurant/KitchenDisplayERP.jsx');
   const pos=source('src/pages/restaurant/RestaurantPOS.jsx');
   const app=source('src/App.jsx');
   expect(sql).toContain("restaurant_pos_private.guard(p_restaurant_id,p_branch_id,'viewOrders',true)");
   expect(sql).toContain("tok:=encode(extensions.gen_random_bytes(32),'hex')");
   expect(sql).toContain("encode(extensions.digest(p_token,'sha256'),'hex')");
   expect(sql).toContain("expiry:=now()+interval '8 hours'");
   expect(sql).toContain("x.expires_at>now()");
   expect(sql).toContain("t.branch_id=display_row.branch_id");
   expect(sql).toContain("t.restaurant_id=display_row.restaurant_id");
   expect(sql).toContain("o.kitchen_status in ('queued','preparing','ready')");
   expect(sql).toContain("'number',q.number,'stage',q.kitchen_status");
   expect(sql).not.toContain("'customer_name'");
   expect(sql).not.toContain("'price'");
   expect(sql).not.toContain("'cash_paid'");
   expect(sql).toContain("revoke all on restaurant_pos_private.customer_tracking_displays from public,anon,authenticated");
   expect(sql).toContain("grant execute on function public.erp_restaurant_customer_tracking_display(text) to anon,authenticated");
   expect(sql).toContain("perform realtime.send('{}'::jsonb,'changed','customer-tracking:'||rec.topic,false)");
   expect(kitchen).toContain("data-testid=\"kds-pair-customer-tv\"");
   expect(kitchen).toContain("p_action:action");
   expect(pos).toContain('data-testid="restaurant-customer-tracking-link"');
   expect(app).toContain('path="/restaurant/customer-tracking" element={<CustomerTrackingDisplay />}');
 });
});
