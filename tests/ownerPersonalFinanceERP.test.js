import { describe, it, expect } from 'vitest';
import {
  ownerFinanceSummary, ownerFinancePeriodBounds, filterOwnerFinance,
  ownerFinanceTrend, ownerFinanceCategories, parseOwnerFinanceAmount,
  isRealFinanceDate, ownerWithdrawalIntegrity,
  readCompleteOwnerFinance, buildOwnerFinanceCsv,
} from '../src/lib/ownerPersonalFinanceAnalytics.js';

const sample = [
  { id:'i1', record_type:'income', amount:200, date:'2026-10-10', source:'external' },
  { id:'w1', record_type:'withdrawal', amount:70, date:'2026-10-10', wallet_source:'owner_cash' },
  { id:'e1', record_type:'expense', amount:90, date:'2026-10-15', category:'family' },
  { id:'e2', record_type:'expense', amount:40, date:'2026-09-15', category:'vehicles' },
];
const now = new Date(2026, 9, 16);

describe('Owner personal finance ERP financial integrity', () => {
  it('treats drawing as personal cash inflow, not a business operating expense', () => {
    expect(ownerFinanceSummary(sample)).toMatchObject({
      income:200,withdrawal:70,expense:130,inflow:270,netFlow:140,count:4,
    });
  });
  it('does not mistake signed numerics or string amounts for concatenation', () => {
    expect(ownerFinanceSummary([{record_type:'income',amount:'200.55'}, {record_type:'expense',amount:'25.25'}]).netFlow).toBeCloseTo(175.30);
  });
  it('filters periods and transaction types without mixing prior month records', () => {
    expect(filterOwnerFinance(sample,{period:'month'},now)).toHaveLength(3);
    expect(filterOwnerFinance(sample,{period:'previous'},now)).toHaveLength(1);
    expect(filterOwnerFinance(sample,{period:'month',type:'withdrawal'},now).map(x=>x.id)).toEqual(['w1']);
    expect(ownerFinancePeriodBounds('previous',now)).toEqual({from:'2026-09-01',to:'2026-09-30'});
  });
  it('shows six chronological monthly buckets, categories and net flows', () => {
    const trend=ownerFinanceTrend(sample,now,6);
    expect(trend).toHaveLength(6);
    expect(trend.at(-1)).toMatchObject({key:'2026-10',Income:200,Withdrawals:70,Expenses:90,Net:180});
    expect(ownerFinanceCategories(sample)).toMatchObject([{key:'family',amount:90},{key:'vehicles',amount:40}]);
  });
  it('accepts valid monetary amounts and dates; rejects nonsense and impossible dates', () => {
    expect(parseOwnerFinanceAmount('23.75')).toBe(23.75);
    expect(parseOwnerFinanceAmount('۲۳.۷۵')).toBe(23.75);
    expect(parseOwnerFinanceAmount('23.750')).toBeNull();
    expect(parseOwnerFinanceAmount('-4')).toBeNull();
    expect(parseOwnerFinanceAmount('1e4')).toBeNull();
    expect(parseOwnerFinanceAmount('0')).toBeNull();
    expect(isRealFinanceDate('2026-10-16')).toBe(true);
    expect(isRealFinanceDate('2026-02-30')).toBe(false);
  });
  it('flags missing, wrong and duplicate Treasury debits', () => {
    const linked = [{id:'tx1',reference_id:'owner_personal_finance:w1',transaction_type:'owner_personal_withdrawal',direction:'out',wallet:'owner_cash',account_id:'a1',amount:70}];
    expect(ownerWithdrawalIntegrity(sample,linked)).toEqual([{id:'w1',status:'matched'}]);
    expect(ownerWithdrawalIntegrity(sample,[])[0].status).toBe('missing');
    expect(ownerWithdrawalIntegrity(sample,linked.concat(linked))[0].status).toBe('mismatch');
  });
  it('paginates more than 1000 records and refuses incomplete totals',async () => {
    const all=Array.from({length:1201},(_,i)=>({id:'p'+i,date:'2026-10-16',amount:1}));
    const db={from:()=>({select(){return this},eq(){return this},order(){return this},
      range(from,to){return Promise.resolve({data:all.slice(from,to+1),error:null})}})};
    const rows=await readCompleteOwnerFinance(db,'r','owner@example.org',{pageSize:500});
    expect(rows).toHaveLength(1201);
  });
  it('escapes CSV spreadsheet injections and includes a BOM',()=>{
    const csv=buildOwnerFinanceCsv([{note:'=SUM(A1:A2)'}],[{label:'Description',get:r=>r.note}]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain("'=SUM(A1:A2)");
  });
});
