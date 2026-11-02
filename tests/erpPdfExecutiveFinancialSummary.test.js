import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {jsPDF} from 'jspdf';
import {buildPdfFinancialExecutiveSummary,compactPdfMoney,exactPdfMoney} from '../src/lib/pdfFinancialExecutiveSummary.js';
import {drawTwoPageERPReport} from '../src/lib/twoPageERPReport.js';
import {generateSalesAnalyticsPDF} from '../src/lib/salesAnalyticsPdf.js';

const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const october={
 sales:25867,cash:8789,network:14457,credit:885,other:1736,
 purchases:26570.65,fixedDeduction:650.07,variableExpenses:1084,
 totalExpenses:1734.07,grossProfit:-703.65,netProfit:-2437.72,
 netMargin:-9.42,averageDailySales:834.42,finalizedClosings:38,
 hasExpenseSource:true,breakdown:[{
 date:'2026-10-31',sales:25867,purchases:26570.65,fixed:650.07,variable:1084,
 netProfit:-2437.72,cash:8789,network:14457,credit:885,other:1736
 }]
};
const fixture={
 snapshot:october,range:{from:'2026-10-01',to:'2026-10-31'},
 branchLabel:'All branches',businessName:'مطاعم شمعة الريان',currency:'SAR',
 operationsReport:{branches:[],hasInventoryData:false,hasConsumptionData:false,hasDebtData:false,
   costGroups:[],consumption:[],debts:{receivables:0,payables:0}},
 download:false
};
describe('ERP PDF eight-card executive summary (all manual and scheduled exports)',()=>{
 it('conserves October actuals: sales from all sources are counted once',()=>{
  const o=buildPdfFinancialExecutiveSummary(october);
  expect(o).toMatchObject({
   sales:25867,purchases:26570.65,fixed:650.07,variable:1084,
   operatingExpenses:1734.07,totalCostIncludingPurchases:28304.72,
   grossPurchaseProxy:-703.65,netOperatingProxy:-2437.72,
   sourcesAreIncluded:true,purchaseBasis:true,fixedCostIsAllocated:true
  });
  expect(o.sales).toBe(october.sales);
  expect(o.sales).not.toBe(october.sales+october.cash+october.network+october.credit+october.other);
  expect(o.grossPurchaseProxy-o.operatingExpenses).toBeCloseTo(o.netOperatingProxy,2);
 });
 it('large compact value and smaller exact amount coexist; negatives stay marked',()=>{
  expect(compactPdfMoney(25867)).toBe('25.9K');
  expect(compactPdfMoney(26570.65)).toBe('26.6K');
  expect(compactPdfMoney(-2437.72)).toBe('−2.4K');
  expect(exactPdfMoney(-2437.72,'SAR')).toBe('−2,437.72 SAR');
  expect(exactPdfMoney(25867,'SAR')).toBe('25,867.00 SAR');
  expect(compactPdfMoney(null)).toBe('—');
  expect(exactPdfMoney(undefined)).toBe('—');
  expect(buildPdfFinancialExecutiveSummary({...october,fixedDeduction:null}).operatingExpenses).toBeNull();
 });
 it('keeps A4 two-page PDF, localized for Persian Arabic and English',async()=>{
  for(const lang of ['fa','ar','en']){
   const pdf=await generateSalesAnalyticsPDF({...fixture,lang});
   expect(pdf.getNumberOfPages()).toBe(2);
   expect(pdf.output('arraybuffer').byteLength).toBeGreaterThan(10000);
  }
 });
 it('financial KPIs are above charts with readable large value and precise number',()=>{
  const code=source('../src/lib/completeSalesAnalyticsPdf.js');
  expect(code).toContain('financeExecutiveCards();');
  expect(code).toContain('detailViewport=false;');
  expect(code).toContain('const width=46.75');
  expect(code).toContain('compactPdfMoney(value)');
  expect(code).toContain('exactPdfMoney(value,currency)');
  expect(code).toContain('finance.totalCostIncludingPurchases');
  expect(code).toContain('finance.grossPurchaseProxy');
  expect(code).toContain('finance.netOperatingProxy');
  expect(code).toContain("tr('Sales · all sources'");
 });
 it('uses exactly the same generator in Reports, manual Scheduled Reports and auto owner worker source',()=>{
  expect(source('../src/pages/Reports.jsx')).toContain('generateSalesAnalyticsPDF(');
  expect(source('../src/pages/ScheduledReports.jsx')).toContain('generateSalesAnalyticsPDF(');
  expect(source('../src/lib/automaticReportPdf.js')).toContain('generateSalesAnalyticsPDF(');
  expect(source('../src/lib/salesAnalyticsPdf.js')).toContain('drawTwoPageERPReport(doc');
 });
});
