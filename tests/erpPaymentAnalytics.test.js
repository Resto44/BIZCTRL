import { describe,expect,it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { buildSalesReportSnapshot, salesReportDateRange } from '../src/lib/salesReportPeriod.js';
import { buildERPFinancialPaymentAnalytics,sourceDisplayName } from '../src/lib/erpPaymentAnalytics.js';

const source=path=>readFile(new URL(path,import.meta.url),'utf8');
const DATE=new Date(2026,9,9,12);
const sourceId='fde69c57-bb78-47ee-953b-94b2eac79b7f';
const uuidOther='bf007a97-de6d-40b8-9281-6795f7283982';
const sales=[
 {date:'2026-10-09',closing_state:'finalized',restaurant_cash:400,restaurant_network:440,credit:45,custom_sources_total:0,
  sales_sources_json:[
    {source_id:sourceId,name_en:'شبكة توصيل زول',amount:65,payment_bucket:'card'},
    {source_id:uuidOther,name_en:'شبكه كوانتر 1',amount:45,payment_bucket:'card'},
    {source_id:'delivery',name_en:'توصيل طلبات',amount:580,payment_bucket:'other',driver_entries:[
      {amount:335,cash_amount:250,network_amount:85},
      {amount:245,cash_amount:150,network_amount:95},
    ]},
    {source_id:'credit',name_en:'كسمتر كرديت',amount:45,payment_bucket:'credit'},
  ]},
 {date:'2026-10-09',closing_state:'finalized',restaurant_cash:77,restaurant_network:308,credit:65,custom_sources_total:0,
  sales_sources_json:[
    {source_id:sourceId,name_en:'شبكة توصيل زول',amount:85,payment_bucket:'card'},
    {source_id:'delivery',name_en:'توصيل طلبات',amount:207,payment_bucket:'other',driver_entries:[
      {amount:97,cash_amount:52,network_amount:45},
      {amount:110,cash_amount:25,network_amount:85},
    ]},
  ]},
 {date:'2026-10-08',closing_state:'finalized',restaurant_cash:150,restaurant_network:623,credit:65,
  sales_sources_json:[{source_id:sourceId,name_en:'شبكة توصيل زول',amount:258,payment_bucket:'card'}]},
 {date:'2026-10-09',closing_state:'draft',restaurant_cash:50000,
  sales_sources_json:[{source_id:sourceId,name_en:'Draft',amount:50000}]},
];

describe('Enterprise Payment Analytics — canonical versus source detail',()=>{
 const range=salesReportDateRange('today',DATE);
 const snapshot=buildSalesReportSnapshot({sales,from:range.from,to:range.to});
 it('only the four mutually exclusive tender buckets add to 1335 verified sales',()=>{
  const model=buildERPFinancialPaymentAnalytics({sales,range,snapshot});
  expect(snapshot.sales).toBe(1335);
  expect(model.total).toBe(1335);
  expect(model.channels.map(c=>c.value)).toEqual([477,748,110,0]);
  expect(model.channels.map(c=>c.key)).toEqual(['cash','network','credit','other']);
  expect(model.channels.reduce((sum,c)=>sum+c.pct,0)).toBeCloseTo(100,8);
  expect(model.reconciled).toBe(true);
 });
 it('cash is sale, not physical drawer count, and no snapshots or driver child rows are added back to sales',()=>{
  const model=buildERPFinancialPaymentAnalytics({sales,range,snapshot});
  expect(model.sources.find(x=>x.key==='delivery')?.value).toBe(787);
  expect(model.sources.find(x=>x.key===sourceId)?.value).toBe(150);
  expect(model.total).toBe(1335);
  expect(model.isSourceDetailNonAdditive).toBe(true);
  expect(model.channels.reduce((sum,c)=>sum+c.value,0)).toBe(model.total);
  expect(model.sources.find(x=>x.key==='delivery')?.previous).toBe(0);
 });
 it('previous day trend comparison is correct and draft ignored',()=>{
  const model=buildERPFinancialPaymentAnalytics({sales,range,snapshot});
  expect(model.comparisonTotal).toBe(838);
  const network=model.channels.find(c=>c.key==='network');
  expect(network.previous).toBe(623);
  expect(network.change).toBeCloseTo((748-623)/623*100,5);
  expect(model.sources.find(x=>x.key===sourceId).previous).toBe(258);
 });
 it('supports selected source trend for year, using month grouping, without changing canonical overall totals',()=>{
  const annual=salesReportDateRange('year',DATE);
  const modelSnapshot=buildSalesReportSnapshot({sales,from:annual.from,to:annual.to,groupBy:'month'});
  const model=buildERPFinancialPaymentAnalytics({sales,range:annual,snapshot:modelSnapshot,selectedSource:sourceId});
  expect(model.trend).toHaveLength(10);
  expect(model.trend.at(-1)).toMatchObject({date:'2026-10',source:408});
  expect(model.total).toBe(modelSnapshot.sales);
 });
 it('never prints raw UUID as a source label and localizes fallback',()=>{
  expect(sourceDisplayName({source_id:uuidOther,name_ar:'شبكة توصيل',name_en:'Delivery Network'},'ar')).toBe('شبكة توصيل');
  expect(sourceDisplayName({source_key:uuidOther},'fa')).toBe('منبع دیگر');
  expect(sourceDisplayName({source_key:uuidOther},'en')).toBe('Other source');
 });
 it('degrades safely with malformed source data and missing sales',()=>{
  const empty=buildSalesReportSnapshot({sales:[],from:range.from,to:range.to});
  const report=buildERPFinancialPaymentAnalytics({sales:[{date:range.from,closing_state:'finalized',sales_sources_json:'{' }],range,snapshot:empty});
  expect(report.sources).toHaveLength(0);
  expect(report.reconciled).toBe(true);
  expect(report.total).toBe(0);
  expect(report.channels.reduce((sum,c)=>sum+c.pct,0)).toBe(0);
 });
 it('removes raw overflowing pie-labels and dense table; chart + source trends follow the selected branch/period',async()=>{
  const [page,component]=await Promise.all([
    source('../src/pages/Reports.jsx'),
    source('../src/components/reports/PaymentAnalyticsERP.jsx'),
  ]);
  expect(page).toContain('snapshot={periodSnapshot}');
  expect(page).toContain('range={reportRange}');
  expect(page).toContain('sales={sales}');
  expect(page).toContain('<PaymentAnalyticsERP');
  expect(page).not.toContain('label={({ name, percent })');
  expect(page).not.toContain('<PieChart>');
  expect(component).toContain('data-testid="payment-canonical-total"');
  expect(component).toContain('data-testid="payment-source-list"');
  expect(component).toContain('data-testid="payment-trend-chart"');
  expect(component).toContain('aria-pressed={selected===source.key}');
  expect(component).toContain('role="img"');
 });
});
