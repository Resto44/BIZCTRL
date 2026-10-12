import {describe,it,expect} from 'vitest';
import {buildSettlementStatement,settlementPeriodRange} from '../src/lib/treasurySettlementPeriods';
const branches=[{id:'id-a',key:'a'},{id:'id-b',key:'b'}];
const tx=(date,amount,type='branch_to_owner_cash',branch='a')=>({transaction_date:date,amount,transaction_type:type,branch});
describe('Branch settlement reporting periods',()=>{
 const now=new Date(2026,9,12,15);
 it.each([['today','2026-10-12'],['week','2026-10-06'],['month','2026-10-01'],['3months','2026-08-01'],['6months','2026-05-01'],['year','2026-01-01'],['all','']])('computes %s through today', (period,start)=>expect(settlementPeriodRange(period,now)).toEqual({start,end:'2026-10-12'}));
 it('handles year rollover and leap days',()=>{
  expect(settlementPeriodRange('3months',new Date(2026,0,31)).start).toBe('2025-11-01');
  expect(settlementPeriodRange('week',new Date(2024,2,1)).start).toBe('2024-02-24');
 });
 it('carries opening balances and separates spending from branch funding',()=>{
  const result=buildSettlementStatement([tx('2026-09-30',100),tx('2026-10-01',40),tx('2026-10-12T23:59:59',10,'owner_expense'),tx('2026-10-11',20,'owner_to_branch_funding'),tx('2026-10-13',999),tx('2026-10-02',200,'branch_to_owner_cash','b')],branches,{start:'2026-10-01',end:'2026-10-12'});
  expect(result.a).toMatchObject({openingBalance:100,sentToOwner:40,ownerExpenseForBranch:10,returnedToBranch:20,remaining:10,closingBalance:110});
  expect(result.a.history).toHaveLength(3);expect(result.b.closingBalance).toBe(200);
 });
 it('preserves opening balance even when there is no period activity',()=>{
  expect(buildSettlementStatement([tx('2026-09-01',20,'owner_expense')],branches,{start:'2026-10-01',end:'2026-10-12'}).a).toMatchObject({openingBalance:-20,remaining:0,closingBalance:-20,history:[]});
 });
 it('uses canonical branch IDs and does not leak another branch into a filtered statement',()=>{
  const rows=[{...tx('2026-10-12',75),branch_id:'id-b'}];
  expect(buildSettlementStatement(rows,branches,{start:'',end:'2026-10-12'}).b.closingBalance).toBe(75);
  expect(buildSettlementStatement(rows,[branches[0]],{start:'',end:'2026-10-12'}).a.closingBalance).toBe(0);
 });
 it('reports undated or impossible dates rather than placing them in opening balance',()=>{
  const row=buildSettlementStatement([tx('',10),tx('2026-02-30',20)],branches,{start:'2026-10-01',end:'2026-10-12'}).a;
  expect(row).toMatchObject({openingBalance:0,closingBalance:0,excludedCount:2});
 });
});
