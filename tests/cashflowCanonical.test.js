import { describe,it,expect } from 'vitest';
import { computeRunningCashflow,cashflowDateRange } from '../src/lib/cashflowEngine';
import { resolveCashflowBranch,readCashflow } from '../src/lib/cashflowRepository';
const branches=[{id:'b1',key:'main',label:'Main'}];
const scope={branches,fromStr:'2026-10-01',toStr:'2026-10-02'};
const move=(id,date,direction,amount,extra={})=>({id,date,direction,amount,branch_id:'b1',...extra});
describe('canonical cash flow',()=>{
 it('sums posted cash exactly once, with funding and collections separate from non-cash sales',()=>{
  const movements=[move('a','2026-10-01','in','100.25',{movement_type:'cash_sale'}),move('b','2026-10-01','in','50.10',{movement_type:'cash_deposit'}),move('c','2026-10-02','in',20,{movement_type:'customer_debt_collection'}),move('d','2026-10-02','out',30.20,{movement_type:'supplier_payment'}),move('x','2026-10-01','out',999,{is_reversed:true})];
  const sales=Array.from({length:10},(_,i)=>({id:`s${i}`,date:'2026-10-01',closing_state:'finalized',branch_id:'b1',restaurant_cash:100,restaurant_network:10,credit:2}));
  const report=computeRunningCashflow({...scope,movements:[...movements,movements[0]],sales,settlements:[{id:'o',branch:'main',date:'2026-10-01',opening_cash:10,status:'Approved'}]});
  expect(report.summary).toMatchObject({openingCash:10,closingCash:150.15,totalCashIn:170.35,totalCashOut:30.20,netCash:140.15,networkSales:100,creditSales:20,closingCount:10,movementCount:4});
 });
 it('does not fabricate zero opening or closing when the historical anchor is absent',()=>{
  const result=computeRunningCashflow({...scope,movements:[move('a','2026-10-01','in',50)]});
  expect(result.summary).toMatchObject({openingCash:null,closingCash:null,netCash:50,latestCount:null});
  expect(result.rows[1].runningNet).toBe(50);
 });
 it('carries the latest prior count and only subsequent pre-period movements forward',()=>{
  const result=computeRunningCashflow({...scope,sales:[{id:'s',date:'2026-09-30',branch:'main',cashier_id:'c',closing_state:'finalized',actual_cash:40,session_closed_at:'2026-09-30T12:00:00Z'}],movements:[move('old','2026-09-30','in',999,{posted_at:'2026-09-30T11:00:00Z'}),move('after','2026-09-30','in',10,{posted_at:'2026-09-30T13:00:00Z'}),move('new','2026-10-01','out',5)]});
  expect(result.summary).toMatchObject({openingCash:50,closingCash:45,netCash:-5,latestCount:40});
 });
 it('does not pick an arbitrary drawer when different cashiers have counts',()=>{
  const sales=['a','b'].map(id=>({id,date:'2026-09-30',branch:'main',cashier_id:id,closing_state:'finalized',actual_cash:40}));
  expect(computeRunningCashflow({...scope,sales}).summary).toMatchObject({openingCash:null,latestCount:null});
 });
 it('rejects corrupt movement direction instead of counting it as a receipt',()=>{
  expect(()=>computeRunningCashflow({...scope,movements:[move('a','2026-10-01','bad',1)]})).toThrow('Invalid cash ledger');
 });
 it('uses Riyadh business date across UTC midnight and Saturday week start',()=>{
  expect(cashflowDateRange('today',new Date('2026-10-26T22:30:00Z'))).toEqual({from:'2026-10-27',to:'2026-10-27'});
  expect(cashflowDateRange('week',new Date('2026-10-26T22:30:00Z'))).toEqual({from:'2026-10-24',to:'2026-10-27'});
 });
 it('resolves managers by assigned UUID/key, never by owner-selected all',()=>{
  expect(resolveCashflowBranch({role:'manager',user:{branch:'main'},branches,selectedBranch:'all'})).toEqual(branches[0]);
  expect(()=>resolveCashflowBranch({role:'manager',user:{},branches,selectedBranch:'all'})).toThrow();
  expect(resolveCashflowBranch({role:'owner',user:{},branches,selectedBranch:'all'})).toBeNull();
 });
 it('scopes every paginated read to restaurant and canonical or legacy branch',async()=>{
  const reads=[];
  const client={from(table){const calls=[['table',table]];reads.push(calls);const q={};for(const m of ['select','eq','lte','in','order','is'])q[m]=(...args)=>{calls.push([m,...args]);return q;};q.range=async()=>({data:[],error:null});return q;}};
  await readCashflow(client,{restaurantId:'tenant',branch:branches[0],to:'2026-10-27'});
  expect(reads).toHaveLength(6);
  for(const calls of reads){expect(calls).toContainEqual(['eq','restaurant_id','tenant']);expect(calls.some(c=>c[0]==='eq'&&['branch_id','branch'].includes(c[1]))).toBe(true);}
 });
});
