import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {latestFinalizedDrawerCash,drawerCurrencyCode,displayDrawerCash} from '../src/lib/managerDrawerCash.js';
const manager=readFileSync('src/pages/ManagerDashboardERP.jsx','utf8');

const physical={id:'count-a',date:'2026-10-20',closing_state:'finalized',actual_cash:16,closing_cash:16,owner_cash_injection:0,finalized_at:'2026-10-20T19:36:11Z'};
const old={id:'count-b',date:'2026-10-18',closing_state:'finalized',actual_cash:35,closing_cash:35,finalized_at:'2026-10-18T07:14:02Z'};

describe('Branch manager cash in drawer comes from a finalized physical count',()=>{
 it('shows 16 SAR when sales are 35 SAR, never conflating sales with closing drawer balance',()=>{
  const data=[
   {...physical,restaurant_cash:35},
   {...old,restaurant_cash:370},
   {date:'2026-10-20',closing_state:'draft',actual_cash:3500,restaurant_cash:35},
   {date:'2026-10-20',status:'Draft',expected_closing_cash:-254,cash_counted:0}
  ];
  expect(latestFinalizedDrawerCash(data,'2026-10-20')).toMatchObject({amount:16,date:'2026-10-20',reason:'last_finalized_count'});
  expect(displayDrawerCash(16,'SAR')).toContain('16.00');
  expect(displayDrawerCash(16,'SAR')).toContain('SAR');
 });
 it('never reads a future or draft date into todays visible amount',()=>{
  const rows=[{...physical,date:'2026-10-21',actual_cash:9999},old];
  expect(latestFinalizedDrawerCash(rows,'2026-10-20')).toMatchObject({amount:35,date:'2026-10-18'});
 });
 it('prefers the latest final count within the same day and never sums separate shifts',()=>{
  const rows=[physical,{...physical,id:'count-c',actual_cash:14,finalized_at:'2026-10-20T20:10:00Z'}];
  expect(latestFinalizedDrawerCash(rows,'2026-10-20').amount).toBe(14);
 });
 it('refuses to invent a balance from a register expected cash or an absent count',()=>{
  expect(latestFinalizedDrawerCash([],'2026-10-20').amount).toBeNull();
  expect(latestFinalizedDrawerCash([{date:'2026-10-20',expected_closing_cash:35,closing_state:'draft'}],'2026-10-20').amount).toBeNull();
  expect(latestFinalizedDrawerCash([{date:'2026-10-20',closing_state:'finalized',actual_cash:null,closing_cash:80,owner_cash_injection:15}],'2026-10-20')).toMatchObject({amount:null,reason:'unverified_count'});
  expect(latestFinalizedDrawerCash([{date:'2026-10-20',closing_state:'finalized',actual_cash:0,closing_cash:35}],'2026-10-20').amount).toBe(0);
  expect(latestFinalizedDrawerCash([{date:'2026-10-20',closing_state:'finalized',actual_cash:-18}],'2026-10-20').amount).toBeNull();
 });
 it('uses the organization currency, not the browser-selected currency that may be mislabeled',()=>{
  expect(drawerCurrencyCode('SAR')).toBe('SAR');
  expect(drawerCurrencyCode('ر.س')).toBe('SAR');
  expect(drawerCurrencyCode('$')).toBe('USD');
  expect(displayDrawerCash(16,undefined)).toBeNull();
  expect(displayDrawerCash(null,'SAR')).toBeNull();
 });
 it('scopes register reads to both tenant and branch and shows dated finalized result',()=>{
  expect(manager).toContain("queryKey: ['mgr-verified-drawer-cash', restaurantId, branchId, branchKey, today]");
  expect(manager).toContain(".eq('restaurant_id', restaurantId)");
  expect(manager).toContain(".eq('branch_id', branchId)");
  expect(manager).toContain(".eq('branch', branchKey).is('branch_id', null)");
  expect(manager).toContain(".eq('closing_state', 'finalized')");
  expect(manager).toContain(".lte('date', today)");
  expect(manager).toContain('latestFinalizedDrawerCash');
  expect(manager).toContain('drawerCashError');
  expect(manager).toContain('Last finalized physical count — not a live drawer reading');
  expect(manager).toContain('النقد المتبقي في الصندوق');
  expect(manager).toContain('پول باقی‌مانده داخل صندوق');
  expect(manager).toContain("businessCurrency={activeRestaurant?.currency || ''}");
  expect(manager).not.toContain("value={formatCurrency(kpis.cashTotal)}  icon={Wallet}");
 });
});
