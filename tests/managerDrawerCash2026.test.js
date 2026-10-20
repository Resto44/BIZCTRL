import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {latestBranchDrawerCash,enteredDrawerCash,summarizeDrawerCash} from '../src/lib/executiveDrawerCash.js';
const manager=readFileSync('src/pages/ManagerDashboardERP.jsx','utf8');
const date='2026-10-20';
const close=(more={})=>({
  id:'1',date,business_date:date,branch_id:'branch-1',closing_state:'finalized',
  actual_cash:60,closing_cash:160,owner_cash_injection:100,restaurant_cash:414,
  finalized_at:'2026-10-20T13:00:00Z',...more
});

describe('ERP manager: recorded cash remaining in assigned branch drawer',()=>{
 it('shows the latest physical count, not total cash sales, profit, owner funding or summed shifts',()=>{
  const old=close({id:'old',actual_cash:100,finalized_at:'2026-10-20T09:00:00Z'});
  const current=close({id:'new',actual_cash:60,finalized_at:'2026-10-20T13:00:00Z'});
  expect(latestBranchDrawerCash([old,current],date)).toEqual({
    amount:60,date,complete:true,current:true
  });
  expect(latestBranchDrawerCash([current,old],date).amount).toBe(60);
  expect(enteredDrawerCash(current)).toBe(60);
  expect(summarizeDrawerCash([old,current]).amount).toBe(60);
 });
 it('displays last verified historical date transparently instead of pretending current live stock',()=>{
  expect(latestBranchDrawerCash([close({date:'2026-10-19',business_date:'2026-10-19',actual_cash:25})],date))
   .toMatchObject({amount:25,date:'2026-10-19',current:false,complete:true});
 });
 it('suppresses stale count when more recent finalized close is incomplete',()=>{
  const prior=close({date:'2026-10-19',business_date:'2026-10-19',actual_cash:100,closing_cash:100});
  const latest=close({actual_cash:null,closing_cash:210,owner_cash_injection:100});
  expect(latestBranchDrawerCash([prior,latest],date)).toEqual({
    amount:null,date,complete:false,current:false
  });
 });
 it('treats zero as valid counted cash, and drafts or future closing as unverified',()=>{
  expect(latestBranchDrawerCash([close({actual_cash:0})],date)).toMatchObject({amount:0,complete:true,current:true});
  expect(latestBranchDrawerCash([close({closing_state:'draft'})],date)).toMatchObject({amount:null,complete:false});
  expect(latestBranchDrawerCash([close({date:'2026-10-21',business_date:'2026-10-21'})],date)).toMatchObject({amount:null,complete:false});
  expect(latestBranchDrawerCash([],date)).toMatchObject({amount:null,date:null,complete:false});
 });
 it('reads only authorized branch finalized sales, with no false cash calculation or total page failure',()=>{
  expect(manager).toContain("queryKey:['mgr-drawer-cash',branchId,today]");
  expect(manager).toContain(".eq('branch_id',branchId).eq('closing_state','finalized').lte('date',today)");
  expect(manager).toContain('latestBranchDrawerCash(drawerClosings,today)');
  expect(manager).toContain('data-testid="manager-drawer-cash"');
  expect(manager).toContain('drawerError||!drawerCash.complete');
  expect(manager).toContain('drawerCash.current?drawerCopy.current');
  expect(manager).toContain('Cash remaining in drawer');
  expect(manager).toContain('پول باقی‌مانده در صندوق');
  expect(manager).toContain('النقد المتبقي في الصندوق');
  expect(manager).toContain('formatMoney(drawerCash.amount)');
  expect(manager).toContain("const {lang,formatMoney} = useLanguage()");
  expect(manager).not.toContain('kpis.cashTotal-kpis.expTotal');
  expect(manager).not.toContain('kpis.cashTotal + kpis.treasuryIn');
  expect(manager).not.toContain("drawerCash.amount||0");
  expect(manager).not.toContain('if (todaySalesError || drawerError');
 });
});
