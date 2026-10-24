import {describe,it,expect} from 'vitest';
import {buildExecutiveComparisonTrend} from '../src/lib/executiveSnapshotPresentation';

describe('Executive comparison chart',()=>{
  const period={currentStart:'2026-10-04',currentEnd:'2026-10-06',previousStart:'2026-09-27',previousEnd:'2026-10-03'};
  it('aligns calendar positions, preserves missing closings, excludes later previous days',()=>{
    const rows=buildExecutiveComparisonTrend({period,periodKey:'week',revenueTrend:[{date:'2026-10-04',sales:100},{date:'2026-10-06',sales:0}],previousRevenueTrend:[{date:'2026-09-28',sales:40},{date:'2026-10-03',sales:500}]});
    expect(rows.map(r=>r.sales)).toEqual([100,null,0]);
    expect(rows.map(r=>r.previousSales)).toEqual([null,40,null]);
    expect(rows[1].previousDate).toBe('2026-09-28');
  });
  it('groups by corresponding calendar month across years',()=>{
    const rows=buildExecutiveComparisonTrend({periodKey:'year',period:{currentStart:'2026-01-01',currentEnd:'2026-03-02',previousStart:'2025-01-01',previousEnd:'2025-03-02'},revenueTrend:[{date:'2026-01-01',sales:10},{date:'2026-01-03',sales:15}],previousRevenueTrend:[{date:'2025-02-05',sales:9}]});
    expect(rows.map(r=>r.sales)).toEqual([25,null,null]);
    expect(rows.map(r=>r.previousSales)).toEqual([null,9,null]);
  });
  it('rejects missing and invalid amounts without manufacturing zeroes',()=>{
    const rows=buildExecutiveComparisonTrend({period,revenueTrend:[{date:'2026-10-04',sales:null},{date:'2026-10-05',sales:'bad'}]});
    expect(rows.every(r=>r.sales===null)).toBe(true);
  });
});
