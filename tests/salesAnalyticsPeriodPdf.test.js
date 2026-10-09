import { describe, it, expect } from 'vitest';
import {
 SALES_REPORT_PERIODS, salesReportDateRange, buildSalesReportSnapshot, salesReportGrowth,
} from '../src/lib/salesReportPeriod.js';
import { generateSalesAnalyticsPDF } from '../src/lib/salesAnalyticsPdf.js';

const date=new Date(2026,9,9,12);
const sales=[
 {id:'a',date:'2026-10-09',closing_state:'finalized',restaurant_cash:400,restaurant_network:440,credit:45,custom_sources_total:0,
  sales_sources_json:[{amount:885}]},
 {id:'b',date:'2026-10-09',closing_state:'finalized',restaurant_cash:150,restaurant_network:300,credit:0},
 {id:'draft',date:'2026-10-09',closing_state:'draft',restaurant_cash:9999},
 {id:'y',date:'2026-10-08',closing_state:'finalized',restaurant_cash:838},
 {id:'old',date:'2026-09-30',closing_state:'locked',restaurant_cash:120},
];
const purchases=[
 {date:'2026-10-09',total_amount:289,approval_status:'auto_approved'},
 {date:'2026-10-09',total_amount:578,approval_status:'approved'},
 {date:'2026-10-09',total_amount:1000,approval_status:'pending'},
 {date:'2026-10-08',total_amount:100,approval_status:'approved'},
];
describe('ERP Sales Analytics canonical periods',()=>{
 it('has exactly five periods with Saturday to current-day week, and comparable prior dates',()=>{
  expect(SALES_REPORT_PERIODS).toEqual(['today','yesterday','week','month','year']);
  expect(salesReportDateRange('today',date)).toMatchObject({from:'2026-10-09',to:'2026-10-09',previousFrom:'2026-10-08',previousTo:'2026-10-08',dayCount:1});
  expect(salesReportDateRange('yesterday',date)).toMatchObject({from:'2026-10-08',to:'2026-10-08',previousFrom:'2026-10-07',previousTo:'2026-10-07'});
  expect(salesReportDateRange('week',date)).toMatchObject({from:'2026-10-03',to:'2026-10-09',previousFrom:'2026-09-26',previousTo:'2026-10-02',dayCount:7});
  expect(salesReportDateRange('month',date)).toMatchObject({from:'2026-10-01',to:'2026-10-09',previousFrom:'2026-09-01',previousTo:'2026-09-09'});
  expect(salesReportDateRange('year',date)).toMatchObject({from:'2026-01-01',to:'2026-10-09',previousFrom:'2025-01-01',previousTo:'2025-10-09'});
 });
 it('sums finalized/locked sales exactly once; excludes draft and unapproved invoices',()=>{
  const s=buildSalesReportSnapshot({sales,purchases,from:'2026-10-09',to:'2026-10-09'});
  expect(s.sales).toBe(1335);
  expect(s.cash).toBe(550);
  expect(s.network).toBe(740);
  expect(s.credit).toBe(45);
  expect(s.purchases).toBe(867);
  expect(s.grossProfit).toBe(468);
  expect(s.netProfit).toBe(468);
  expect(s.grossMargin).toBeCloseTo(35.05618,3);
  expect(s.finalizedClosings).toBe(2);
  expect(s.breakdown).toHaveLength(1);
  expect(s.breakdown[0].sales).toBe(1335);
 });
 it('does not count cash remitted to owner or network settlements as additional sales',()=>{
  const s=buildSalesReportSnapshot({sales:[{...sales[0],cash_to_owner:250,closing_cash:50}],from:'2026-10-09',to:'2026-10-09'});
  expect(s.sales).toBe(885);
  expect(s.cash).toBe(400);
 });
 it('allocates fixed expenses across a week spanning two months, and each daily ledger exactly reconciles',()=>{
  const expenses=[
   {date:'2026-09-01',amount:300,category_id:'rent'},
   {date:'2026-10-01',amount:310,category_id:'rent'},
   {date:'2026-10-09',amount:20,category_id:'electric'},
   {date:'2026-10-09',amount:400,category_id:'electric',status:'cancelled'},
  ];
  const cats=[{id:'rent',is_fixed:true},{id:'electric',is_fixed:false}];
  const r=buildSalesReportSnapshot({sales,purchases,expenses,expenseCategories:cats,from:'2026-09-29',to:'2026-10-03'});
  expect(r.fixedDeduction).toBeCloseTo(50,4);
  expect(r.totalExpenses).toBeCloseTo(50,4);
  expect(r.breakdown.reduce((sum,row)=>sum+row.fixed,0)).toBeCloseTo(r.fixedDeduction,5);
  const d=buildSalesReportSnapshot({sales,purchases,expenses,expenseCategories:cats,from:'2026-10-09',to:'2026-10-09'});
  expect(d.fixedDeduction).toBeCloseTo(10,4);
  expect(d.variableExpenses).toBe(20);
  expect(d.netProfit).toBe(438);
 });
 it('groups year report by month, not 365 unreadable rows',()=>{
  const r=buildSalesReportSnapshot({sales,purchases,from:'2026-01-01',to:'2026-10-09',groupBy:'month'});
  expect(r.breakdown).toHaveLength(10);
  expect(r.breakdown.at(-1).date).toBe('2026-10');
  expect(r.breakdown.reduce((sum,x)=>sum+x.sales,0)).toBeCloseTo(r.sales,5);
 });
 it('uses null for growth when previous period has no sales',()=>{
  expect(salesReportGrowth({sales:100},{sales:0})).toBeNull();
  expect(salesReportGrowth({sales:110},{sales:100})).toBeCloseTo(10);
 });
 it('generates an offline-capable localized A4 PDF based on the SAME snapshot without a separate recalculation',async()=>{
  const snapshot=buildSalesReportSnapshot({sales,purchases,from:'2026-10-09',to:'2026-10-09'});
  const range=salesReportDateRange('today',date);
  for(const lang of ['en','ar','fa']){
   const doc=await generateSalesAnalyticsPDF({snapshot,previousSnapshot:null,growth:null,range,
    branchLabel:'فرع الريان',businessName:'مطاعم شمعة الريان',currency:'SAR',lang,download:false});
   expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
   expect(Buffer.from(doc.output('arraybuffer')).subarray(0,8).toString()).toContain('%PDF-');
   expect(doc.__erpPdfRTL).toBe(lang!=='en');
  }
 });
});
