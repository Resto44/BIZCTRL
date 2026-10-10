import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {buildPdfConsumptionCostControl} from '../src/lib/reportConsumptionCostControl.js';
import {buildOperationsPdfReport} from '../src/lib/operationsPdfReport.js';
import {generateSalesAnalyticsPDF} from '../src/lib/salesAnalyticsPdf.js';
const snapshot={sales:1000,purchases:350,totalExpenses:200,grossProfit:650,netProfit:450,netMargin:45,
  variableExpenses:175,fixedDeduction:25,cash:500,network:400,credit:100,other:0,
  finalizedClosings:1,breakdown:[{date:'2026-10-10',sales:1000,netProfit:450}]};
const prev={...snapshot,sales:800,purchases:240,totalExpenses:200};
const period={from:'2026-10-10',to:'2026-10-10',type:'today'};
const report={branches:[{id:'b1',name:'Rayyan',sales:1000,netProfit:450}],
  hasConsumptionData:true,consumption:[
    {name:'Frozen chicken',quantity:8,unit:'carton',estimatedCost:200,costAvailable:true},
    {name:'Rice',quantity:5,unit:'bag',estimatedCost:0,costAvailable:false},
  ],hasWasteData:true,wasteCostComplete:false,wasteCost:50,
  costGroups:[{name:'Electricity',value:115}],
  stockCount:10,lowStock:[{name:'Rice'}],noStock:1,hasInventoryData:true,
  hasDebtData:true,debts:{receivables:110,payables:270}};
describe('ERP one-page report product consumption and cost control',()=>{
 it('uses verifiable purchase and expense ratios, not fake food cost',()=>{
   const result=buildPdfConsumptionCostControl({snapshot,previousSnapshot:prev,operationsReport:report});
   expect(result.purchaseRatio).toBe(35);
   expect(result.expenseRatio).toBe(20);
   expect(result.prevPurchaseRatio).toBe(30);
   expect(result.prevExpenseRatio).toBe(25);
   expect(result.purchaseDelta).toBe(5);
   expect(result.expenseDelta).toBe(-5);
   expect(result.topExpenseCategory).toEqual({name:'Electricity',value:115});
 });
 it('does not mislabel missing unit cost as free consumption or partially costed waste as fully valued',()=>{
   const result=buildPdfConsumptionCostControl({snapshot,operationsReport:report});
   expect(result.productRows).toEqual([
     {name:'Frozen chicken',quantity:8,unit:'carton',estimatedCost:200},
     {name:'Rice',quantity:5,unit:'bag',estimatedCost:null},
   ]);
   expect(result.wasteCost).toBeNull();
   expect(result.hasWasteData).toBe(true);
 });
 it('shows unavailable ratios instead of 0% when there is no sales denominator',()=>{
   const result=buildPdfConsumptionCostControl({snapshot:{...snapshot,sales:0},previousSnapshot:null,operationsReport:null});
   expect(result.purchaseRatio).toBeNull();
   expect(result.expenseRatio).toBeNull();
   expect(result.productRows).toEqual([]);
   expect(result.topExpenseCategory).toBeNull();
 });
 it('distinguishes missing waste costs in actual stock movement aggregation',()=>{
   const t=buildOperationsPdfReport({
     branches:[],range:period,inventory:[],
     inventoryTransactions:[
       {created_date:'2026-10-10T12:00:00Z',transaction_type:'waste',quantity:-3,unit_cost:10},
       {created_date:'2026-10-10T14:00:00Z',transaction_type:'waste',quantity:-2,unit_cost:null},
     ],
   });
   expect(t.wasteQuantity).toBe(5);
   expect(t.wasteCost).toBe(30);
   expect(t.hasWasteData).toBe(true);
   expect(t.wasteCostComplete).toBe(false);
   const complete=buildOperationsPdfReport({branches:[],range:period,inventory:[],
     inventoryTransactions:[{created_date:'2026-10-10T12:00:00Z',transaction_type:'waste',quantity:-3,unit_cost:10}]});
   expect(complete.wasteCostComplete).toBe(true);
   expect(buildPdfConsumptionCostControl({snapshot,operationsReport:complete}).wasteCost).toBe(30);
 });
 it('renders both headings and verified analytics in each app language on exactly one A4 page',async()=>{
   for(const lang of ['en','ar','fa']){
     const pdf=await generateSalesAnalyticsPDF({snapshot,previousSnapshot:prev,operationsReport:report,
       range:period,branchLabel:'فرع الريان',businessName:'مطاعم شمعة الريان',currency:'SAR',lang,download:false});
     expect(pdf.getNumberOfPages()).toBe(1);
     expect(pdf.__erpPdfRTL).toBe(lang!=='en');
     expect(Buffer.from(pdf.output('arraybuffer')).subarray(0,5).toString()).toBe('%PDF-');
   }
 });
 it('retains all original stock, debt, risk panels and integrates into both report entrypoints',async()=>{
  const pdf=await readFile(new URL('../src/lib/singlePageSalesAnalyticsReport.js',import.meta.url),'utf8');
  const reports=await readFile(new URL('../src/pages/Reports.jsx',import.meta.url),'utf8');
  const scheduled=await readFile(new URL('../src/pages/ScheduledReports.jsx',import.meta.url),'utf8');
  expect(pdf).toContain("buildPdfConsumptionCostControl({snapshot,previousSnapshot,operationsReport:report})");
  expect(pdf).toContain('tr.consumption');
  expect(pdf).toContain('tr.costControl');
  expect(pdf).toContain('tr.stock');
  expect(pdf).toContain('tr.debt');
  expect(pdf).toContain('tr.risk');
  expect(reports).toContain('generateSalesAnalyticsPDF');
  expect(scheduled).toContain('generateSalesAnalyticsPDF');
 });
});
