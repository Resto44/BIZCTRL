import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {normalizeDrawerCashAsOf} from '../src/lib/executiveDrawerCash.js';
const src=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const asOf={
 basis:'last_verified_physical_count_not_live_bank_balance',
 amount:null,complete:false,asOfDate:'2026-11-07',
 branches:4,missingBranches:4,
 details:[
  {branchId:'rayyan',branchKey:'main-9a50614652',branchName:'فرع الريان',
   date:'2026-11-07',shift:'Morning',sessionNo:3,
   countedAt:'2026-11-07T20:19:50.294Z',
   status:'ambiguous_drawer',cash:null,reportedCash:35,
   latestCount:3,cashierCount:2},
  {branchId:'other',date:null,status:'no_closing',cash:null,reportedCash:null},
  {branchId:'third',date:null,status:'no_closing',cash:null,reportedCash:null},
  {branchId:'fourth',date:null,status:'no_closing',cash:null,reportedCash:null},
 ]
};
describe('Owner and manager drawer reconciliation when multiple cashiers close the same shift',()=>{
 it('shows SAR 35 as the latest reported count but never as an approved drawer balance or consolidated cash',()=>{
  const normalized=normalizeDrawerCashAsOf(asOf);
  expect(normalized.amount).toBeNull();
  expect(normalized.complete).toBe(false);
  expect(normalized.verifiedBranches).toBe(0);
  expect(normalized.latestVerifiedDetail).toBeNull();
  expect(normalized.latestReportedDetail).toMatchObject({
    reportedCash:35,status:'ambiguous_drawer',cash:null,sessionNo:3,cashierCount:2,
  });
  expect(normalized.latestPhysicalDetail?.reportedCash).toBe(35);
  expect(normalized.missingBranches).toBe(4);
 });
 it('never promotes an ambiguous amount even if the backend claims complete',()=>{
  expect(normalizeDrawerCashAsOf({...asOf,amount:35,complete:true,missingBranches:0}).amount).toBeNull();
 });
 it('prefers a more recent reported session over an older verified branch, without reclassifying it',()=>{
  const data={...asOf,branches:2,missingBranches:1,details:[
   {branchId:'other',status:'verified',cash:77,date:'2026-11-06',countedAt:'2026-11-06T20:00:00Z'},
   asOf.details[0],
  ]};
  const model=normalizeDrawerCashAsOf(data);
  expect(model.latestVerifiedDetail.cash).toBe(77);
  expect(model.latestPhysicalDetail.status).toBe('ambiguous_drawer');
  expect(model.latestPhysicalDetail.reportedCash).toBe(35);
  expect(model.amount).toBeNull();
 });
 it('keeps missing, canceled and uncounted amounts unknown; an authentic zero is not missing',()=>{
  const withNoReported={...asOf,details:asOf.details.map(d=>({...d,reportedCash:null}))};
  expect(normalizeDrawerCashAsOf(withNoReported).latestPhysicalDetail).toBeNull();
  const zero={...asOf,details:[{...asOf.details[0],reportedCash:0},...asOf.details.slice(1)]};
  expect(normalizeDrawerCashAsOf(zero).latestReportedDetail.reportedCash).toBe(0);
  expect(normalizeDrawerCashAsOf(asOf,{error:true}).amount).toBeNull();
 });
 it('exposes reportedCash only in an explicitly ambiguous state and does not modify totals',()=>{
  const migration=src('../supabase/migrations/20261107235000_owner_latest_recorded_cash_multicashier.sql');
  const snapshot=src('../src/components/dashboard/ExecutiveSnapshotV2.jsx');
  expect(migration).toContain("'reportedCash',CASE WHEN status='ambiguous_drawer' AND actual_cash>=0");
  expect(migration).toContain("'cash',CASE WHEN status='verified' THEN actual_cash ELSE NULL END");
  expect(migration).toContain("THEN coalesce(sum(actual_cash),0) ELSE NULL END");
  expect(migration).toContain('public.erp_can_access_scope_text');
  expect(snapshot).toContain('snapshot-drawer-needs-review');
  expect(snapshot).toContain('drawerCash.latestPhysicalDetail.reportedCash');
  expect(snapshot).toContain('item.reportedCash');
  expect(snapshot).toContain('NOT verified');
 });
});
