import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { prepareLocalizedPdf } from '../src/lib/pdfLocalization';
import { drawTwoPageERPReport, aggregateReportTrend, summarizeReportRows } from '../src/lib/twoPageERPReport';
import { generateSalesAnalyticsPDF } from '../src/lib/salesAnalyticsPdf';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const snapshot = {
  sales: 189560, cash: 68420, network: 92300, credit: 28840, other: 0,
  purchases: 124850, totalExpenses: 92300, variableExpenses: 80000,
  fixedDeduction: 12300, netProfit: -27590, averageDailySales: 13540,
  finalizedClosings: 42, days: 14,
  breakdown: Array.from({length:14}, (_, i) => ({
    date:'2026-10-' + String(i + 1).padStart(2,'0'),
    sales:13540, purchases: 8917.85714285, variable:5714.2857142, fixed:878.571428,
  })),
};
const earlier = { ...snapshot, sales:170000, cash:66000, network:83000,
  credit:21000, purchases:100000, totalExpenses:80000,
  breakdown:snapshot.breakdown.map(r=>({...r,date:'2026-09-' + r.date.slice(-2),
    sales:12142.85,purchases:7142.85,variable:4800,fixed:900})) };
const operations = {
  branches:[
    {id:'a',name:'فرع الريان',sales:72430,purchases:38450,expenses:28230},
    {id:'b',name:'فرع جدة',sales:45210,purchases:32180,expenses:24560},
    {id:'c',name:'فرع الدمام',sales:38560,purchases:28760,expenses:21340},
  ],
  costGroups:[{name:'الرواتب',value:31400},{name:'الإيجار',value:18450},
    {name:'الكهرباء',value:9840},{name:'الصيانة',value:4900}],
  hasConsumptionData:true, consumption:[
    {name:'برنج باسمتي',quantity:100,unit:'kg',estimatedCost:1500,costAvailable:true},
    {name:'دجاج الفحم',quantity:18,unit:'carton',estimatedCost:0,costAvailable:false},
  ], hasInventoryData:true, stockCount:40,
  lowStock:[{name:'Rice'},{name:'Oil'}],noStock:1,hasWasteData:true,
  wasteQuantity:5,wasteCostComplete:false,wasteCost:50,
};
const range = {from:'2026-10-01',to:'2026-10-14',previousFrom:'2026-09-01',previousTo:'2026-09-14'};

describe('BizCTRL illustrated two-page ERP PDF',()=>{
  it('buckets ALL daily chart values without omission or artificial future datapoints',()=>{
    const original=Array.from({length:365},(_,i)=>({
      date:'day'+i,sales:i+1,purchases:10,variable:2,fixed:1}));
    const rows=aggregateReportTrend(original,14);
    expect(rows.length).toBeLessThanOrEqual(14);
    expect(rows.reduce((n,r)=>n+r.sales,0)).toBe(original.reduce((n,r)=>n+r.sales,0));
    expect(rows.reduce((n,r)=>n+r.purchases,0)).toBe(3650);
    expect(rows.reduce((n,r)=>n+r.expenses,0)).toBe(1095);
    expect(summarizeReportRows([{name:'a',value:7},{name:'b',value:3},{name:'c',value:2}],2,'Other'))
      .toEqual([{name:'a',value:7},{name:'Other',value:5}]);
  });
  it('generates exactly two A4 pages in English, Arabic and Persian, with real scoped data',async()=>{
    for(const lang of ['en','ar','fa']){
      const doc=await generateSalesAnalyticsPDF({
        snapshot,previousSnapshot:earlier,growth:11.5,operationsReport:operations,
        range,branchLabel:'فرع الريان',businessName:'مطاعم شمعة الريان',
        currency:'SAR',lang,download:false,
      });
      expect(doc.getNumberOfPages()).toBe(2);
      expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210,0);
      expect(Buffer.from(doc.output('arraybuffer')).subarray(0,5).toString()).toBe('%PDF-');
      expect(doc.__erpPdfRTL).toBe(lang!=='en');
    }
  });
  it('handles no activity, missing inventory, unavailable consumption cost, and a single period',()=>{
    const doc=new jsPDF({format:'a4',unit:'mm'});
    prepareLocalizedPdf(doc,{lang:'fa'});
    expect(()=>drawTwoPageERPReport(doc,{snapshot:{
      ...snapshot,sales:0,cash:0,network:0,credit:0,other:0,purchases:0,
      totalExpenses:0,variableExpenses:0,fixedDeduction:0,netProfit:0,
      breakdown:[{date:'2026-10-15',sales:0,purchases:0,variable:0,fixed:0}],
    },growth:null,range:{from:'2026-10-15',to:'2026-10-15'},
    branchLabel:'فرع الريان',businessName:'Restaurant',ops:null,lang:'fa'})).not.toThrow();
    expect(doc.getNumberOfPages()).toBe(2);
  });
  it('draws verified consumption rather than demo suppliers or invented order counts',()=>{
    const src=source('../src/lib/twoPageERPReport.js');
    expect(src).toContain('buildPdfConsumptionCostControl');
    expect(src).toContain('ops?.hasConsumptionData');
    expect(src).toContain('row.costAvailable');
    expect(src).toContain("costMissing");
    expect(src).toContain('finalizedClosings');
    expect(src).not.toContain('1248');
    expect(src).not.toContain('2601');
    expect(src).toContain("drawERPReportBrand");
    expect(src).toContain('doc.addPage()');
  });
  it('both on-demand and scheduled report screens continue using this one canonical renderer',()=>{
    const current=source('../src/pages/Reports.jsx');
    const schedules=source('../src/pages/ScheduledReports.jsx');
    const entry=source('../src/lib/salesAnalyticsPdf.js');
    expect(current).toContain('generateSalesAnalyticsPDF({');
    expect(schedules).toContain('generateSalesAnalyticsPDF({');
    expect(entry).toContain('drawTwoPageERPReport');
    expect(entry).toContain('operationsReport');
  });
});
