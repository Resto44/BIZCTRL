// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),create:vi.fn(),notify:null,lang:'en'}));
vi.mock('@/api/supabaseClient',()=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'safe-test-public'}));
vi.mock('@supabase/supabase-js',()=>({createClient:mocks.create}));
vi.mock('@/lib/restaurantPOS',()=>({
 restaurantRpc:(...args)=>mocks.rpc(...args),
 restaurantProductName:(line,lang)=>line?.['name_'+lang]||line?.name||line?.name_en||'',
}));
vi.mock('@/lib/retailCashier',()=>({money:(v,c)=>c+' '+Number(v||0).toFixed(2)}));
vi.mock('@/lib/cashierBroadcast',()=>({subscribeCashierBroadcast:(client,topic,listener)=>{
 mocks.notify={client,topic,listener};return()=>{mocks.notify=null;};
}}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:mocks.lang})}));
import RestaurantCustomerDisplay,{restaurantCustomerStage,restaurantCustomerHasOrder}
 from '../src/pages/restaurant/RestaurantCustomerDisplay.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root,host;
const token='a'.repeat(64);
const fixture={
 topic:'customer-display-topic',business_name:'Test Restaurant',branch_name:'Rayan',
 device_code:'POS-01',number:170,status:'held',kitchen_status:'queued',
 submitted_at:'2026-11-10T09:00:00Z',order_type:'takeaway',table_label:'7',
 currency:'SAR',subtotal:40,tax_total:4,net_total:44,units:2,
 lines:[{name:'Chicken',name_ar:'دجاج',name_fa:'مرغ',quantity:2,unit_price:22,line_total:44}],
};
beforeEach(()=>{
 vi.useFakeTimers();mocks.rpc.mockReset();mocks.create.mockReset();mocks.lang='en';
 mocks.rpc.mockResolvedValue(fixture);
 mocks.create.mockReturnValue({rpc:vi.fn()});
 host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();});
async function render(url='/restaurant/customer-display#'+token){
 await act(async()=>root.render(<MemoryRouter initialEntries={[url]}><RestaurantCustomerDisplay/></MemoryRouter>));
}

describe('Restaurant-only customer display ERP',()=>{
 it('uses private anonymous kiosk client and kitchen/order language, not retail shopping',async()=>{
  await render();
  expect(mocks.create).toHaveBeenCalledWith(expect.any(String),expect.any(String),
    expect.objectContaining({auth:expect.objectContaining({
      persistSession:false,autoRefreshToken:false,detectSessionInUrl:false
    })}));
  expect(mocks.rpc).toHaveBeenCalledWith('customer_display',{p_token:token},expect.any(Object));
  expect(host.textContent).toContain('Test Restaurant');
  expect(host.textContent).toContain('#170');
  expect(host.textContent).toContain('Ordered meals');
  expect(host.textContent).toContain('Received by kitchen');
  expect(host.textContent).toContain('SAR 44.00');
  expect(host.textContent).not.toContain('Your shopping');
  expect(host.textContent).not.toContain('Updates with every scan');
  expect(mocks.notify.topic).toBe('customer-display:customer-display-topic');
 });
 it('reflects Kitchen Display status changes on signal without checkout or duplicate sale',async()=>{
  await render();
  mocks.rpc.mockResolvedValue({...fixture,kitchen_status:'preparing'});
  await act(async()=>{mocks.notify.listener('changed');await vi.advanceTimersByTimeAsync(150);});
  expect(host.textContent).toContain('Preparing');
  mocks.rpc.mockResolvedValue({...fixture,kitchen_status:'ready',status:'paid'});
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  expect(host.textContent).toContain('Ready for pickup');
  expect(host.textContent).toContain('Payment received');
  expect(mocks.rpc.mock.calls.every(([operation])=>operation==='customer_display')).toBe(true);
 });
 it('does not show invented zero revenue when no order is paired',async()=>{
  mocks.rpc.mockResolvedValue({...fixture,number:null,status:null,kitchen_status:null,lines:[],net_total:null,units:0});
  await render();
  expect(host.textContent).toContain('Waiting for your order');
  expect(host.textContent).not.toContain('SAR 0.00');
  expect(host.querySelector('[data-testid="restaurant-order-total"]').textContent).toBe('—');
 });
 it('renders restaurant food translations in Arabic and Persian',async()=>{
  mocks.lang='ar';await render();
  expect(host.textContent).toContain('دجاج');
  expect(host.textContent).toContain('الوجبات المطلوبة');
  expect(host.textContent).not.toContain('Your shopping');
 });
 it('blocks invalid tokens and expired links; no stale order details',async()=>{
  await render('/restaurant/customer-display#not-valid');
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
 });
 it('removes prior order details immediately when backend revokes pairing',async()=>{
  await render();
  mocks.rpc.mockRejectedValue({code:'42501'});
  await act(async()=>{mocks.notify.listener('changed');await vi.advanceTimersByTimeAsync(150);});
  expect(host.textContent).not.toContain('Chicken');
  expect(host.textContent).not.toContain('SAR 44.00');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
 });
 it('hides old totals when network stops responding',async()=>{
  await render();
  mocks.rpc.mockRejectedValue(new Error('Offline'));
  await act(async()=>{await vi.advanceTimersByTimeAsync(16000);});
  expect(host.textContent).not.toContain('SAR 44.00');
  expect(host.textContent).toContain('Connection lost');
 });
 it('maps canonical stages and validates row identity',()=>{
  expect(restaurantCustomerStage('draft')).toBe(-1);
  expect(restaurantCustomerStage('queued')).toBe(0);
  expect(restaurantCustomerStage('preparing')).toBe(1);
  expect(restaurantCustomerStage('ready')).toBe(2);
  expect(restaurantCustomerStage('served')).toBe(3);
  expect(restaurantCustomerHasOrder({number:0})).toBe(true);
  expect(restaurantCustomerHasOrder({number:null})).toBe(false);
 });
 it('preserves retail CustomerDisplay route and restricts paired restaurant JSON fields',()=>{
  const sql=readFileSync(resolve('supabase/migrations/20261110110000_restaurant_customer_display_erp.sql'),'utf8');
  const app=readFileSync(resolve('src/App.jsx'),'utf8');
  expect(app).toContain('path="/retail/customer-display" element={<CustomerDisplay />}');
  expect(app).toContain('path="/restaurant/customer-display" element={<RestaurantCustomerDisplay />}');
  expect(sql).toContain("x.id=ds.order_id and x.device_id=d.id");
  expect(sql).toContain("ds.expires_at>now()");
  expect(sql).toContain("'kitchen_status'");
  expect(sql).toContain("'name_fa'");
  expect(sql).toContain("'net_total',case when o.id is null then null");
  expect(sql).toContain("after update of kitchen_status,status");
  expect(sql).toContain("perform realtime.send('{}'::jsonb,'changed'");
  expect(sql).not.toContain("'cash_paid'");
  expect(sql).not.toContain("'customer_email'");
  expect(sql).not.toContain("DELETE FROM public.daily_sales");
 });
});
