import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {CUSTOMER_DISPLAY_DURATIONS,customerDisplayDurationLabel,displayDurationCopyKey} from '../src/lib/restaurantDisplayLinkDuration.js';

const sql=readFileSync('supabase/migrations/20261113215500_customer_display_pair_duration.sql','utf8');
const pos=readFileSync('src/pages/restaurant/RestaurantPOS.jsx','utf8');
const tv=readFileSync('src/pages/restaurant/RestaurantCustomerDisplay.jsx','utf8');

describe('Restaurant customer screen fixed viewport and secure selectable link lifetime',()=>{
 it('offers exactly 24h, one week, one month, one year and permanent in three languages',()=>{
  expect(CUSTOMER_DISPLAY_DURATIONS).toEqual(['24h','7d','1m','1y','permanent']);
  for(const lang of ['en','ar','fa']){
   const labels=customerDisplayDurationLabel(lang);
   expect(labels.title).toBeTruthy();
   for(const duration of CUSTOMER_DISPLAY_DURATIONS)
    expect(labels[displayDurationCopyKey[duration]]?.length).toBeGreaterThan(2);
  }
  expect(customerDisplayDurationLabel('fa').permanent).toContain('دائمی');
 });
 it('pairs new TV links with selected duration, not hardcoded eight hours',()=>{
  expect(pos).toContain('data-testid="restaurant-display-duration-picker"');
  expect(pos).toContain("useState('24h')");
  expect(pos).toContain("api.command('pair_display',{display_duration:displayDuration})");
  expect(pos).toContain('CUSTOMER_DISPLAY_DURATIONS.map');
  expect(pos).toContain('data-testid="restaurant-display-revoke"');
  expect(pos).toContain("api.command('unpair_display')");
 });
 it('requires Owner/Manager for yearly and permanent bearer links and rejects invalid modes',()=>{
  expect(sql).toContain("NOT IN ('8h','24h','7d','1m','1y','permanent')");
  expect(sql).toContain("in ('1y','permanent')");
  expect(sql).toContain("restaurant_pos_private.guard(d.restaurant_id,d.branch_id,'viewOrders',true)");
  expect(sql).toContain('encode(extensions.gen_random_bytes(32)');
  expect(sql).toContain("encode(extensions.digest(tok,'sha256'),'hex')");
  expect(sql).toContain("when 'permanent' then 'infinity'::timestamptz");
  expect(sql).not.toMatch(/GRANT\s+.*\s+TO\s+anon/i);
 });
 it('keeps legacy 8-hour shift close and retains chosen durations across shifts',()=>{
  expect(sql).toContain("ADD COLUMN IF NOT EXISTS link_duration text NOT NULL DEFAULT '8h'");
  expect(sql).toContain("where device_id=d.id AND link_duration='8h'");
  expect(sql).toContain("p_command<>'unpair_display'");
  expect(sql).toContain("ds.link_duration='8h' and not exists");
  expect(sql).toContain("where s.id=x.shift_id and s.device_id=d.id and s.closed_at is null");
  expect(sql).toContain('CUSTOMER_DISPLAY_READER_SOURCE_CHANGED_ABORT');
  expect(sql).toContain("where device_id=d.id;"); // explicit unpair remains unrestricted
  expect(sql).toContain('link_duration=excluded.link_duration');
  expect(sql).toContain("topic=gen_random_uuid()");
 });
 it('does not mutate any purchase, payment, shift balances, or customer records',()=>{
  expect(sql).not.toMatch(/DELETE FROM\s+public\./i);
  expect(sql).not.toMatch(/TRUNCATE|DROP TABLE|ALTER TABLE\s+public\.(?:daily_sales|customers)/i);
  expect(sql).not.toContain('INSERT INTO public.daily_sales');
  expect(sql).not.toContain('UPDATE public.inventory');
  expect(sql).toContain('CUSTOMER_DISPLAY_PAIR_SOURCE_CHANGED_ABORT');
 });
 it('enforces a fixed fullscreen viewport and paged order items without document scrolling',()=>{
  expect(tv).toContain('data-testid="restaurant-customer-tv-viewport"');
  expect(tv).toContain('data-testid="restaurant-customer-tv-content"');
  expect(tv).toContain('data-testid="restaurant-customer-tv-bottom"');
  expect(tv).toContain('fixed inset-0');
  expect(tv).toContain('h-[100dvh] w-screen overflow-hidden');
  expect(tv).toContain('grid-rows-[auto_minmax(0,1fr)_auto]');
  expect(tv).toContain('grid-rows-[auto_auto_auto_minmax(0,1fr)]');
  expect(tv).toContain('data-testid="restaurant-visible-item-lines"');
  expect(tv).toContain('setInterval(()=>setItemPage(previous=>(previous+1)%itemPages),6000)');
  expect(tv).not.toContain('overflow-y-auto');
  expect(tv).not.toContain('min-h-dvh bg-[#f3f7fd]');
 });
});
