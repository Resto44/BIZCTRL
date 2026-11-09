import { describe,expect,it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { buildOwnerReportPeriod } from '../src/lib/ownerReportCenter';
import { buildExecutiveMultiMetricTrend,executiveOperationalInsights,purchaseAmount } from '../src/lib/executiveTrendAnalytics';
import { buildExecutiveComparisonTrend,buildExecutiveSnapshotPresentation } from '../src/lib/executiveSnapshotPresentation';

const source=path=>readFile(new URL(path,import.meta.url),'utf8');
const now=new Date(2026,10,9,12,0,0);
const sale=(date,cash,network=0,id='closing')=>({id,closing_state:'finalized',date,restaurant_cash:cash,restaurant_network:network,credit:0,custom_sources_total:0,
  sales_sources_json:[{source_key:'driver',amount:cash+network}]});
const invoice=(date,total,id='invoice')=>({id,date,total_amount:total,status:'approved'});

describe('Executive ERP Snapshot IQ financial analytics',()=>{
 it('supports Yesterday and all requested 3/6/9 month comparison windows',()=>{
  expect(buildOwnerReportPeriod('yesterday',now)).toMatchObject({currentStart:'2026-11-08',currentEnd:'2026-11-09',previousStart:'2026-11-07',previousEnd:'2026-11-07',rangeType:'day'});
  expect(buildOwnerReportPeriod('three-months',now)).toMatchObject({currentStart:'2026-09-01',previousStart:'2026-06-01',previousEnd:'2026-08-09'});
  expect(buildOwnerReportPeriod('six-months',now)).toMatchObject({currentStart:'2026-06-01',previousStart:'2025-12-01',previousEnd:'2026-05-09'});
  expect(buildOwnerReportPeriod('nine-months',now)).toMatchObject({currentStart:'2026-03-01',previousStart:'2025-06-01',previousEnd:'2026-02-09'});
  expect(buildOwnerReportPeriod('year',now)).toMatchObject({currentStart:'2026-01-01',previousStart:'2025-01-01'});
 });
 it('preserves verified sales buckets and does not add driver snapshots a second time',()=>{
  const period=buildOwnerReportPeriod('month',now);
  const rows=buildExecutiveMultiMetricTrend({
   sales:[sale('2026-11-02',400,100),{...sale('2026-11-03',99),closing_state:'draft'}],
   purchases:[invoice('2026-11-02',450)],previousSales:[sale('2026-10-02',200)],
   previousPurchases:[invoice('2026-10-02',100)],period,
  });
  const posted=rows.find(row=>row.date==='2026-11-02');
  expect(posted).toMatchObject({sales:500,purchases:450,purchaseGap:50,prevSales:200,prevPurchases:100,prevPurchaseGap:100,closings:1,invoices:1});
  expect(rows.find(row=>row.date==='2026-11-03')).toMatchObject({sales:null,purchases:null,purchaseGap:null});
  expect(rows.find(row=>row.date==='2026-11-01')).toMatchObject({sales:null,purchases:null});
  expect(rows).toHaveLength(9);
 });
 it('does not turn missing financial dates into zero sales or invent an expense-inclusive profit series',()=>{
  const period=buildOwnerReportPeriod('week',now);
  const trend=buildExecutiveMultiMetricTrend({sales:[],purchases:[invoice('2026-11-09',100)],period});
  const monday=trend.find(row=>row.date==='2026-11-09');
  expect(monday).toMatchObject({sales:null,purchases:100,purchaseGap:-100,closings:0,invoices:1});
  expect(trend.every(row=>row.sales===null)).toBe(true);
  expect(trend.every(row=>!Object.hasOwn(row,'netProfit'))).toBe(true);
 });
 it('retains exact explicit zero purchase and quantity-price fallback',()=>{
  expect(purchaseAmount({total_amount:0,qty:9,used_price:200})).toBe(0);
  expect(purchaseAmount({qty:2,used_price:35})).toBe(70);
  expect(purchaseAmount({qty:'bad',used_price:35})).toBe(0);
 });
 it('groups weekly and monthly trends and lines up corresponding previous periods without flattening actual gaps',()=>{
  const period=buildOwnerReportPeriod('three-months',now);
  const trend=buildExecutiveMultiMetricTrend({period,granularity:'month',
    sales:[sale('2026-09-05',80),sale('2026-09-09',20,'0','another'),sale('2026-11-01',150)],
    purchases:[invoice('2026-09-09',30)],
    previousSales:[sale('2026-06-07',70)],previousPurchases:[invoice('2026-06-08',45)],
  });
  expect(trend).toHaveLength(3);
  expect(trend[0]).toMatchObject({date:'2026-09-01',purchases:30,prevSales:70,prevPurchases:45});
  expect(trend[1]).toMatchObject({date:'2026-10-01',sales:null,purchases:null,prevSales:null});
  expect(trend[2]).toMatchObject({date:'2026-11-01',sales:150});
  const grouped=buildExecutiveSnapshotPresentation({revenueTrend:[{date:'2026-09-05',sales:100},{date:'2026-09-09',sales:50}],periodKey:'three-months'}).trend;
  expect(grouped).toEqual([{date:'2026-09',sales:150}]);
  const previous=buildExecutiveComparisonTrend({revenueTrend:[{date:'2026-09-05',sales:100}],previousRevenueTrend:[{date:'2026-06-05',sales:50}],periodKey:'three-months',period});
  expect(previous[0]).toMatchObject({sales:100,previousSales:50});
  expect(previous).toHaveLength(3);
 });
 it('calculates real peak day, average per elapsed day and guarded ratios without forecasts',()=>{
  const period=buildOwnerReportPeriod('month',now);
  const v=executiveOperationalInsights({period,periodMetrics:{totalSales:350,totalPurchaseCost:500,netMargin:-100},
    sales:[sale('2026-11-02',100),sale('2026-11-03',250)],purchases:[invoice('2026-11-04',500)]});
  expect(v).toMatchObject({closingCount:2,approvedInvoices:1,peakDate:'2026-11-03',peakSales:250,netMargin:-100});
  expect(v.averagePerCalendarDay).toBeCloseTo(350/9,4);
  expect(v.purchaseToSales).toBeCloseTo(500/350*100,4);
  expect(executiveOperationalInsights({period,periodMetrics:{totalSales:0,totalPurchaseCost:200}}).purchaseToSales).toBeNull();
 });
 it('makes analytics lazy and keeps sales/purchases/estimate KPIs the first mobile row',async()=>{
  const [snapshot,owner,drill,periodSource]=await Promise.all([
    source('../src/components/dashboard/ExecutiveSnapshotV2.jsx'),
    source('../src/pages/OwnerDashboard.jsx'),
    source('../src/components/dashboard/ExecutiveAnalyticsDrilldown.jsx'),
    source('../src/lib/ownerReportCenter.js'),
  ]);
  expect(snapshot).toContain('React.lazy(() => import(\'./ExecutiveAnalyticsDrilldown\'))');
  expect(snapshot).toContain('data-testid="snapshot-advanced-toggle"');
  expect(snapshot).toContain('aria-expanded={advancedOpen}');
  expect(snapshot).toContain('data-testid="snapshot-period-selector"');
  expect(snapshot).toContain('data-testid="snapshot-purchases-primary"');
  expect(snapshot).toContain('snapshot-estimate-warning');
  expect(owner).toContain('periodPurchases, previousPeriodSales, previousPeriodPurchases');
  expect(owner).toContain("{ key: 'three-months'");
  expect(owner).toContain("{ key: 'nine-months'");
  expect(periodSource).toContain('three-months');
  expect(drill).toContain('data-testid="executive-trend-metric"');
  expect(drill).toContain('data-testid="executive-trend-group"');
  expect(drill).toContain('data-testid="executive-trend-compare"');
  expect(drill).toContain('data-testid="executive-multi-trend"');
  expect(drill).toContain('disabled={hasQueryError||!trend.length}');
  expect(drill).toContain('URL.createObjectURL');
  expect(drill).toContain('connectNulls={false}');
  expect(drill).toContain('fa:{');
  expect(drill).toContain('ar:{');
 });
});
