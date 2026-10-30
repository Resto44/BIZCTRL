import { describe,it,expect } from 'vitest';
import { computeRunningCashflow,cashflowDateRange,buildCashflowAuditEvents } from '../src/lib/cashflowEngine';
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
  expect(reads).toHaveLength(10);
  for(const calls of reads){expect(calls).toContainEqual(['eq','restaurant_id','tenant']);expect(calls.some(c=>c[0]==='eq'&&['branch_id','branch'].includes(c[1]))).toBe(true);}
 });
});


describe('cash opening, closing and shortage in the Cash Flow audit ledger',()=>{
 const closing=(id,date,opening,ending,difference=0,extras={})=>({
  id,date,branch_id:'b1',shift:'Morning',cashier_id:'cashier-a',closing_state:'finalized',
  opening_cash:opening,actual_cash:ending,closing_cash:ending,cash_difference:difference,
  closing_session_no:1,...extras
 });
 it('shows one immutable opening, one physical closing and one shortage without inventing a cash movement',()=>{
  const sales=[closing('close-1','2026-10-31',150,50,-150)];
  const shortages=[{id:'short-1',date:'2026-10-31',branch_id:'b1',shift:'Morning',closing_id:'close-1',
   shortage_amount:150,status:'Pending',owner_payment_amount:0,wallet_payment_amount:0}];
  const report=computeRunningCashflow({...scope,fromStr:'2026-10-31',toStr:'2026-10-31',
   sales,shortages,openingVerifications:[],movements:[],settlements:[]});
  expect(report.events.map(e=>e.type).sort()).toEqual(['cash_shortage','closing_cash','opening_cash']);
  expect(report.events.find(e=>e.type==='opening_cash').amount).toBe(150);
  expect(report.events.find(e=>e.type==='closing_cash').amount).toBe(50);
  expect(report.summary).toMatchObject({netCash:0,totalCashIn:0,totalCashOut:0,movementCount:0,
   shortageTotal:150,shortagePending:150,shortageCount:1});
 });
 it('keeps two consecutive closings separate and counts a shortage only once when it is saved in cash_shortages',()=>{
  const sales=[closing('a','2026-10-31',140,150,-111),
   closing('b','2026-10-31',150,50,-150,{closing_session_no:2})];
  const shortages=[
   {id:'sa',closing_id:'a',date:'2026-10-31',shortage_amount:111,status:'Pending',branch_id:'b1'},
   {id:'sb',closing_id:'b',date:'2026-10-31',shortage_amount:150,status:'Pending',branch_id:'b1'}
  ];
  const events=buildCashflowAuditEvents({sales,shortages,fromStr:'2026-10-31',toStr:'2026-10-31'});
  expect(events.filter(e=>e.type==='cash_shortage')).toHaveLength(2);
  expect(events.filter(e=>e.type==='closing_cash')).toHaveLength(2);
  expect(events.filter(e=>e.type==='opening_cash')).toHaveLength(2);
  expect(events.filter(e=>e.type==='cash_shortage').reduce((sum,e)=>sum+e.amount,0)).toBe(261);
 });
 it('does not mistake a finalized POS revenue record for a counted cash closing',()=>{
  const sales=[closing('pos','2026-10-31',250,null,-100,{shift:'POS:device-a',closing_cash:400})];
  expect(buildCashflowAuditEvents({sales,fromStr:'2026-10-31',toStr:'2026-10-31'})).toEqual([]);
 });
 it('records verified opening even before any closing, then hides duplicate after the closing is posted',()=>{
  const opening={id:'opening-verification',date:'2026-10-31',branch_id:'b1',shift:'Morning',
   cashier_id:'cashier-a',counted_cash:65,verified_at:'2026-10-31T07:00:00Z'};
  const before=buildCashflowAuditEvents({openingVerifications:[opening],fromStr:'2026-10-31',toStr:'2026-10-31'});
  expect(before).toHaveLength(1);
  expect(before[0]).toMatchObject({type:'opening_cash',amount:65,status:'verified'});
  const after=buildCashflowAuditEvents({openingVerifications:[opening],
   sales:[closing('final','2026-10-31',65,140)],fromStr:'2026-10-31',toStr:'2026-10-31'});
  expect(after.filter(e=>e.type==='opening_cash')).toHaveLength(1);
 });
 it('keeps unverified legacy closing separate from verified physical cash',()=>{
  const events=buildCashflowAuditEvents({sales:[closing('legacy','2026-10-31',0,null,0,{closing_cash:120})],
   fromStr:'2026-10-31',toStr:'2026-10-31'});
  expect(events.find(e=>e.type==='closing_cash')).toMatchObject({status:'unverified',amount:120});
 });
 it('reduces unresolved shortage when a documented wallet or owner payment exists without subtracting twice',()=>{
  const result=computeRunningCashflow({...scope,fromStr:'2026-10-31',toStr:'2026-10-31',
   shortages:[{id:'s1',date:'2026-10-31',branch_id:'b1',shortage_amount:150,status:'Pending',
    owner_payment_amount:40,wallet_payment_amount:30}],settlements:[],movements:[],sales:[]});
  expect(result.summary).toMatchObject({shortageTotal:150,shortagePending:80,netCash:0});
 });
});
