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
import RestaurantCustomerDisplay,{restaurantCustomerStage,restaurantCustomerHasOrder,
 restaurantWaitElapsedSeconds,restaurantWaitClock,restaurantCustomerItemColumns}
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
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
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
 it('follows Kitchen Display language even when customer TV browser is set to English',async()=>{
  mocks.lang='en';
  mocks.rpc.mockResolvedValue({...fixture,kitchen_language:'ar'});
  await render();
  expect(host.textContent).toContain('الوجبات المطلوبة');
  expect(host.textContent).toContain('دجاج');
  expect(host.querySelector('[data-testid="restaurant-customer-display"]').getAttribute('dir')).toBe('rtl');
  mocks.rpc.mockResolvedValue({...fixture,kitchen_language:'fa',kitchen_status:'preparing'});
  await act(async()=>{mocks.notify.listener('changed');await vi.advanceTimersByTimeAsync(150);});
  expect(host.textContent).toContain('غذاهای سفارش‌شده');
  expect(host.textContent).toContain('مرغ');
  expect(host.textContent).toContain('در حال آماده‌سازی');
 });
 it('displays slow-pulsing real kitchen wait time and a thank-you message in Arabic',async()=>{
  mocks.lang='en';
  mocks.rpc.mockResolvedValue({...fixture,kitchen_language:'ar',
    kitchen_status:'preparing',submitted_at:'2026-11-10T10:00:00Z',
    server_time:'2026-11-10T10:03:15Z'});
  await render();
  expect(host.textContent).toContain('شكرًا على صبركم!');
  expect(host.textContent).toContain('مدة انتظار طلبكم');
  const clock=host.querySelector('[data-testid="restaurant-waiting-clock"]');
  expect(clock).not.toBeNull();
  expect(clock.textContent).toBe('03:15');
  expect(clock.className).toContain('motion-reduce:animate-none');
  expect(clock.getAttribute('aria-live')).toBe('off');
  await act(async()=>{await vi.advanceTimersByTimeAsync(2000);});
  expect(host.querySelector('[data-testid="restaurant-waiting-clock"]').textContent).toBe('03:17');
 });
 it('never invents waiting time when no order exists, and hides timer when ready',async()=>{
  mocks.rpc.mockResolvedValue({...fixture,number:null,status:null,lines:[],
    submitted_at:null,server_time:'2026-11-10T10:05:00Z',kitchen_status:null});
  await render();
  expect(host.textContent).toContain('Thank you for visiting!');
  expect(host.querySelector('[data-testid="restaurant-waiting-panel"]')).toBeNull();
  mocks.rpc.mockResolvedValue({...fixture,kitchen_status:'ready',
    server_time:'2026-11-10T10:05:00Z'});
  await act(async()=>{mocks.notify.listener('changed');await vi.advanceTimersByTimeAsync(150);});
  expect(host.textContent).toContain('Your order is ready for pickup');
  expect(host.querySelector('[data-testid="restaurant-waiting-panel"]')).toBeNull();
 });
 it('calculates elapsed time from server time rather than an unreliable local TV clock',()=>{
  expect(restaurantWaitElapsedSeconds('2026-11-10T10:00:00Z','2026-11-10T10:03:15Z',0)).toBe(195);
  expect(restaurantWaitElapsedSeconds('2026-11-10T10:00:00Z','2026-11-10T10:03:15Z',2000)).toBe(197);
  expect(restaurantWaitElapsedSeconds('2026-11-10T10:03:15Z','2026-11-10T10:00:00Z',0)).toBe(0);
  expect(restaurantWaitElapsedSeconds(null,null,0)).toBeNull();
  expect(restaurantWaitClock(197)).toBe('03:17');
  expect(restaurantWaitClock(null)).toBeNull();
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
 it('keeps last successful order visible through background fetch failures, without disruptive offline view',async()=>{
  await render();
  mocks.rpc.mockRejectedValue(new Error('Temporary network failure'));
  await act(async()=>{await vi.advanceTimersByTimeAsync(16000);});
  expect(host.textContent).toContain('#170');
  expect(host.textContent).toContain('SAR 44.00');
  expect(host.textContent).toContain('Updating quietly');
  expect(host.querySelector('[data-testid="restaurant-display-status"]')).not.toBeNull();
  expect(host.querySelector('[data-testid="restaurant-order-total"]')).not.toBeNull();
  expect(host.textContent).not.toContain('Connection lost');
  expect(host.textContent).not.toContain('Connection interrupted');
 });
 it('recovers automatically on the next background poll without refreshing the page',async()=>{
  await render();
  mocks.rpc.mockRejectedValue(new Error('Temporary connection issue'));
  await act(async()=>{await vi.advanceTimersByTimeAsync(18000);});
  expect(host.textContent).toContain('#170');
  mocks.rpc.mockResolvedValue({...fixture,number:171,kitchen_status:'ready',status:'paid',net_total:55});
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  expect(host.textContent).toContain('#171');
  expect(host.textContent).toContain('Ready for pickup');
  expect(host.textContent).toContain('SAR 55.00');
  expect(host.querySelector('[data-testid="restaurant-display-status"]').textContent).toContain('Live');
 });
 it('stops showing old customer totals after a bounded two-minute outage but never shows a disruptive error',async()=>{
  await render();
  mocks.rpc.mockRejectedValue(new Error('Offline'));
  await act(async()=>{await vi.advanceTimersByTimeAsync(125000);});
  expect(host.textContent).not.toContain('SAR 44.00');
  expect(host.textContent).not.toContain('#170');
  expect(host.textContent).toContain('Thank you for visiting!');
  expect(host.textContent).not.toContain('Connection lost');
  expect(host.querySelector('[data-testid="restaurant-waiting-clock"]')).toBeNull();
 });
 it('keeps a neutral welcome screen before first successful fetch instead of a big offline error',async()=>{
  mocks.rpc.mockRejectedValue(new Error('Initial network error'));
  await render();
  expect(host.textContent).toContain('Thank you for visiting!');
  expect(host.textContent).toContain('Preparing the display');
  expect(host.textContent).not.toContain('Connection lost');
  expect(host.textContent).not.toContain('SAR 0.00');
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
 it('shows ALL 12 ordered meals at once without blinking, pagination or document scroll',async()=>{
  mocks.rpc.mockResolvedValue({...fixture,lines:Array.from({length:12},(_,i)=>({
    name:'Dish-'+String(i+1).padStart(2,'0'),quantity:1,unit_price:10,line_total:10
  }))});
  await render();
  const screen=host.querySelector('[data-testid="restaurant-customer-display"]');
  expect(screen.className).toContain('fixed inset-0');
  expect(screen.className).toContain('h-[100dvh]');
  expect(screen.className).toContain('overflow-hidden');
  const list=host.querySelector('[data-testid="restaurant-visible-item-lines"]');
  expect(list).not.toBeNull();
  expect(list.getAttribute('data-all-items-visible')).toBe('true');
  expect(list.getAttribute('data-item-count')).toBe('12');
  expect(host.querySelectorAll('[data-testid="restaurant-visible-item"]')).toHaveLength(12);
  expect(host.querySelector('[data-testid="restaurant-items-pagination"]')).toBeNull();
  for(let n=1;n<=12;n++)expect(list.textContent).toContain('Dish-'+String(n).padStart(2,'0'));
  await act(async()=>{await vi.advanceTimersByTimeAsync(16000);});
  const after=host.querySelector('[data-testid="restaurant-visible-item-lines"]');
  expect(host.querySelectorAll('[data-testid="restaurant-visible-item"]')).toHaveLength(12);
  for(let n=1;n<=12;n++)expect(after.textContent).toContain('Dish-'+String(n).padStart(2,'0'));
 });
 it('renders five long Arabic food names in one mobile column without truncation',async()=>{
  mocks.lang='ar';
  // jsdom defaults to a 1024px landscape TV, not a narrow phone.
  vi.stubGlobal('innerWidth',390);
  vi.stubGlobal('innerHeight',800);
  const names=[
   'الرز البخاري بالدجاج',
   'الرز الأبيض بالسمن',
   'ربيان مقلي مقرمش',
   'حاشي مندي بالرز',
   'سلطة عربية مشكلة',
  ];
  mocks.rpc.mockResolvedValue({...fixture,kitchen_language:'ar',lines:names.map((name,i)=>({
   name_ar:name,name,quantity:1,line_total:6+i,
  }))});
  expect(restaurantCustomerItemColumns(5,390,800)).toBe(1);
  expect(restaurantCustomerItemColumns(5,320,620)).toBe(1);
  // 16:9 TVs keep every meal visible in fewer, taller rows.
  expect(restaurantCustomerItemColumns(4,1280,720)).toBe(1);
  expect(restaurantCustomerItemColumns(7,1280,720)).toBe(2);
  expect(restaurantCustomerItemColumns(12,1280,720)).toBe(3);
  await render();
  const grid=host.querySelector('[data-testid="restaurant-visible-item-lines"]');
  expect(grid.style.gridTemplateColumns).toBe('repeat(1,minmax(0,1fr))');
  const labels=[...host.querySelectorAll('[data-testid="restaurant-food-full-name"]')];
  expect(labels).toHaveLength(5);
  names.forEach((name,i)=>{
   expect(labels[i].textContent).toContain(name);
   expect(labels[i].className).toContain('whitespace-normal');
   expect(labels[i].className).toContain('break-words');
   expect(labels[i].className).not.toContain('truncate');
   expect(labels[i].className).not.toContain('line-clamp');
  });
  expect(host.querySelectorAll('[data-testid="restaurant-visible-item"]')).toHaveLength(5);
 });
 it('puts large wait timer and attention-getting order number in separate always legible cards',async()=>{
  mocks.lang='fa';
  mocks.rpc.mockResolvedValue({...fixture,kitchen_language:'fa',
   submitted_at:'2026-11-10T10:00:00Z',server_time:'2026-11-10T10:01:41Z'});
  await render();
  const timer=host.querySelector('[data-testid="restaurant-waiting-clock"]');
  expect(timer.textContent).toBe('01:41');
  expect(timer.className).toContain('text-[clamp(2rem,8.2vw,5.8rem)]');
  expect(host.querySelector('[data-testid="restaurant-waiting-panel"]')).not.toBeNull();
  const ticket=host.querySelector('[data-testid="restaurant-ticket-attention"]');
  expect(ticket).not.toBeNull();
  expect(ticket.className).toContain('bizctrl-customer-ticket-attention');
  const number=host.querySelector('[data-testid="restaurant-order-number"]');
  expect(number.textContent).toBe('#170');
  expect(number.className).toContain('text-[clamp(2.15rem,9.4vw,6.4rem)]');
  expect(number.className).not.toContain('animate-pulse');
  expect(number.className).not.toContain('truncate');
  // Check the local 1-second clock without the test fixture's static
  // server_time being re-fetched on the 5-second network poll.
  await act(async()=>{await vi.advanceTimersByTimeAsync(2000);});
  expect(host.querySelector('[data-testid="restaurant-order-number"]').textContent).toBe('#170');
  expect(host.querySelector('[data-testid="restaurant-waiting-clock"]').textContent).toBe('01:43');
 });
 it('flashes the ticket border, never food names, wait digits or whole-screen opacity',()=>{
  const css=readFileSync(resolve('src/pages/restaurant/customerTicketGlow.css'),'utf8');
  expect(css).toContain('@keyframes bizctrl-customer-ticket-glow');
  expect(css).toContain('box-shadow:');
  expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  expect(css).not.toMatch(/opacity:\\s*0/);
  expect(css).not.toMatch(/display:\\s*none/);
 });
 it('ignores a one-off empty poll without clearing the current order, but clears confirmed empty snapshots',async()=>{
  await render();
  expect(host.textContent).toContain('#170');
  mocks.rpc.mockResolvedValue({...fixture,number:null,kitchen_status:null,lines:[],net_total:null});
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  expect(host.textContent).toContain('#170');
  expect(host.textContent).toContain('Chicken');
  expect(host.textContent).toContain('SAR 44.00');
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  expect(host.textContent).not.toContain('#170');
  expect(host.textContent).not.toContain('Chicken');
  expect(host.querySelector('[data-testid="restaurant-order-total"]').textContent).toBe('—');
 });
 it('never displays order item count or monetary values from another customer on revoked links',async()=>{
  await render();
  expect(host.querySelectorAll('[data-testid="restaurant-visible-item"]')).toHaveLength(1);
  mocks.rpc.mockRejectedValue({code:'42501'});
  await act(async()=>{mocks.notify.listener('changed');await vi.advanceTimersByTimeAsync(150);});
  expect(host.querySelectorAll('[data-testid="restaurant-visible-item"]')).toHaveLength(0);
  expect(host.textContent).not.toContain('SAR 44.00');
 });
 it('never offers vertical document scroll when the display is waiting for an order',async()=>{
  mocks.rpc.mockResolvedValue({...fixture,number:null,lines:[],kitchen_status:null,net_total:null});
  await render();
  expect(host.querySelector('[data-testid="restaurant-customer-tv-viewport"]').className).toContain('overflow-hidden');
  expect(host.querySelector('[data-testid="restaurant-customer-tv-bottom"]').className).toContain('overflow-hidden');
  expect(host.textContent).toContain('Waiting for your order');
  expect(host.textContent).not.toContain('SAR 0.00');
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
