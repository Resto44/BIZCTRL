import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { calculateERPAccounting } from '../src/lib/helpers.js';
import {
  buildExecutiveSnapshotPresentation,moneyChange,
} from '../src/lib/executiveSnapshotPresentation.js';

const source=path=>readFile(new URL(path,import.meta.url),'utf8');

describe('ERP Executive Snapshot V2',()=>{
  const sale={
    date:'2026-10-09',closing_state:'finalized',
    restaurant_cash:400,restaurant_network:440,credit:45,custom_sources_total:0,
    actual_cash:50, sales_sources_json:[{amount:885}],
  };
  const metrics=calculateERPAccounting({
    sales:[sale],purchases:[{total_amount:578}],periodExpenses:[],
    rangeType:'day',daysInPeriod:1,asOfDate:'2026-10-09',
  });
  it('separates physical drawer balance from all FOUR non-overlapping sales buckets',()=>{
    const view=buildExecutiveSnapshotPresentation({
      periodMetrics:metrics,
      previousPeriodMetrics:{totalSales:838},
      revenueTrend:[{date:'2026-10-09',sales:885}],periodKey:'today',
    });
    expect(view.sales).toBe(885);
    expect(view.methods.map(c=>c.amount)).toEqual([400,440,45,0]);
    expect(view.methodsTotal).toBe(885);
    expect(view.reconciled).toBe(true);
    expect(view.methods.reduce((v,c)=>v+c.percent,0)).toBeCloseTo(100,7);
    expect(view.profitChange).toBeNull();
    expect(view.trend).toHaveLength(1);
    expect(view.salesChange).toBeCloseTo((885-838)/838*100);
    expect(view.methods.find(c=>c.key==='cash').amount).toBe(400);
    expect(sale.actual_cash).toBe(50);
  });
  it('uses only recorded sales, grouping real dates by month for year and six-month periods',()=>{
    const items=[{date:'2026-01-07',sales:100},{date:'2026-01-09',sales:130},
     {date:'2026-02-03',sales:180},{date:'2026-02-04',sales:20}];
    const year=buildExecutiveSnapshotPresentation({periodMetrics:{totalSales:430,totalCash:430},revenueTrend:items,periodKey:'year'});
    expect(year.trend).toEqual([{date:'2026-01',sales:230},{date:'2026-02',sales:200}]);
    expect(buildExecutiveSnapshotPresentation({periodMetrics:{totalSales:430,totalCash:430},revenueTrend:items,periodKey:'six-months'}).trend).toEqual(year.trend);
    expect(buildExecutiveSnapshotPresentation({periodMetrics:{totalSales:430,totalCash:430},revenueTrend:items,periodKey:'week'}).trend).toHaveLength(4);
  });
  it('does not invent comparison percentages when previous period had no comparable sales',()=>{
    expect(moneyChange(4219,0)).toBeNull();
    const view=buildExecutiveSnapshotPresentation({periodMetrics:{totalSales:4219,totalCash:717,totalNetwork:1591,totalCredit:175,totalAdditionalSources:1736,
      netProfit:73,netMargin:1.73},
    previousPeriodMetrics:{totalSales:0,netProfit:0,netMargin:0},revenueTrend:[]});
    expect(view.salesChange).toBeNull();
    expect(view.profitChange).toBeNull();
    expect(view.marginChangePoints).toBeNull();
    expect(view.reconciled).toBe(true);
    expect(view.methodsTotal).toBe(4219);
  });
  it('exposes a visible reconciliation warning rather than drawing a misleading complete donut',()=>{
    const view=buildExecutiveSnapshotPresentation({periodMetrics:{totalSales:885,totalCash:400,totalNetwork:440,totalCredit:20}});
    expect(view.reconciled).toBe(false);
    expect(view.methodsTotal).toBe(860);
  });
  it('mounts a mobile-first card with full source-driven values and drilldown actions',async()=>{
    const [dashboard,report,card]=await Promise.all([
      source('../src/pages/OwnerDashboard.jsx'),
      source('../src/components/dashboard/OwnerReportCenter.jsx'),
      source('../src/components/dashboard/ExecutiveSnapshotV2.jsx'),
    ]);
    expect(dashboard).toContain('periodKey: activePeriod');
    expect(report).toContain('<ExecutiveSnapshotV2 model={model} copy={copy} />');
    for(const id of ['snapshot-sales','snapshot-margin','snapshot-drawer-cash','snapshot-payment-mix'])
       expect(card).toContain(`data-testid="${id}"`);
    for(const id of ['snapshot-profit','snapshot-purchases','snapshot-receivables','snapshot-payables','snapshot-active-risks'])
       expect(card).toContain(`testId="${id}"`);
    expect(card).toContain('periodMetrics.totalPurchaseCost');
    expect(card).toContain('presentation.methods');
    expect(card).toContain("navigate('/reports')");
    expect(card).not.toContain('SAR 4,219');
    expect(card).not.toContain('Cash (Drawer)');
    expect(card).toContain('revenueTrend');
  });
});
