import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {jsPDF} from 'jspdf';
import {prepareLocalizedPdf} from '../src/lib/pdfLocalization.js';
import {buildPdfDriverSalesInsights} from '../src/lib/pdfDriverSalesInsights.js';
import {drawPdfNetworkManagement} from '../src/lib/drawPdfNetworkManagement.js';
import {buildFullSalesAnalyticsReport} from '../src/lib/fullSalesAnalyticsReport.js';
import {buildSalesReportSnapshot} from '../src/lib/salesReportPeriod.js';
import {generateSalesAnalyticsPDF} from '../src/lib/salesAnalyticsPdf.js';

const range={from:'2026-11-01',to:'2026-11-09',previousFrom:'2026-10-23',previousTo:'2026-10-31'};
const tenant='tenant-1';
const branches=[{id:'branch-1',name:'Rayyan'},{id:'branch-2',name:'East'}];
const drivers=[
 {id:'driver-1',restaurant_id:tenant,branch_id:'branch-1',full_name:'Driver One',is_active:true},
 {id:'driver-2',restaurant_id:tenant,branch_id:'branch-2',full_name:'Driver Two',is_active:true},
];
const closing=(id,date,branch_id,cash,network,state='finalized')=>({
 id,date,branch_id,restaurant_id:tenant,closing_state:state,
 restaurant_cash:cash,restaurant_network:network,credit:0,
});
const sales=[
 closing('c1','2026-11-08','branch-1',326,421),
 closing('c2','2026-11-09','branch-2',200,200),
 closing('p1','2026-10-30','branch-1',100,100),
 closing('draft','2026-11-09','branch-1',50000,50000,'draft'),
];
const entry=(id,closing_id,driver_id,branch_id,date,cash,network,status='finalized',restaurant_id=tenant)=>({
 id,closing_id,driver_id,branch_id,date,cash_amount:cash,network_amount:network,
 total_amount:cash+network,status,restaurant_id,
});
const driverSalesEntries=[
 entry('e1','c1','driver-1','branch-1','2026-11-08',326,421),
 entry('e2','c2','driver-2','branch-2','2026-11-09',200,200),
 entry('e3','p1','driver-1','branch-1','2026-10-30',100,100),
 entry('draft','draft','driver-1','branch-1','2026-11-09',50000,50000),
 entry('bad','c1','driver-1','branch-2','2026-11-08',40000,40000),
 entry('other','c1','driver-1','branch-1','2026-11-08',40000,40000,'finalized','tenant-2'),
];
const input={sales,driverSalesEntries,drivers,branches,range};
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const snapshot=buildSalesReportSnapshot({sales,from:range.from,to:range.to});
const previousSnapshot=buildSalesReportSnapshot({sales,from:range.previousFrom,to:range.previousTo});

describe('Driver Sales inside canonical 3-page ERP PDF',()=>{
 it('derives driver performance only from final, tenant+branch+date matching canonical closings',()=>{
  const a=buildPdfDriverSalesInsights({...input,snapshot});
  expect(a.available).toBe(true);
  expect(a.current).toEqual({sales:1147,cash:526,network:621,entries:2});
  expect(a.previous).toEqual({sales:200,cash:100,network:100,entries:1});
  expect(a.driversWithSales).toBe(2);
  expect(a.topDrivers.map(row=>row.name)).toEqual(['Driver One','Driver Two']);
  expect(a.current.sales).toBeLessThanOrEqual(snapshot.sales);
  expect(a.change).toBe(473.5);
  expect(a.ignored).toBe(2);
  expect(a.trend.reduce((s,row)=>s+row.value,0)).toBe(1147);
  expect(a.previousTrend.reduce((s,row)=>s+row.value,0)).toBe(200);
  expect(a.peak).toEqual({date:'2026-11-08',sales:747});
 });
 it('does not mistake an omitted driver dataset for zero sales',()=>{
  expect(buildPdfDriverSalesInsights({sales,branches,range}).available).toBe(false);
  expect(buildPdfDriverSalesInsights({...input,snapshot:{sales:1}}).exceedsTotal).toBe(true);
 });
 it('stays one final Network+Driver page for enterprise branch counts without losing branch totals',async()=>{
  const many=Array.from({length:15},(_,i)=>({id:'b'+i,name:'Branch '+(i+1)}));
  const allSales=many.map((b,i)=>closing('a'+i,'2026-11-09',b.id,0,100+i));
  const current=buildSalesReportSnapshot({sales:allSales,from:range.from,to:range.to});
  const prior=buildSalesReportSnapshot({sales:allSales,from:range.previousFrom,to:range.previousTo});
  const full=buildFullSalesAnalyticsReport({
   sales:allSales,branches:many,driverSalesEntries:[],drivers:[],range,
   snapshot:current,previousSnapshot:prior,historyAvailable:true,
  });
  const doc=await generateSalesAnalyticsPDF({snapshot:current,previousSnapshot:prior,range,
   branchLabel:'All branches',lang:'en',fullAnalytics:full,download:false});
  expect(doc.getNumberOfPages()).toBe(3);
  expect(full.networkBranches.branches.reduce((n,b)=>n+b.current.network,0)).toBe(current.network);
 });
 it.each(['en','ar','fa'])('renders localized driver trends, cash/POS and rankings on page 3 (%s)',async lang=>{
  const full=buildFullSalesAnalyticsReport({...input,snapshot,previousSnapshot,historyAvailable:true,lang});
  const doc=await generateSalesAnalyticsPDF({snapshot,previousSnapshot,range,
   branchLabel:'All branches',lang,fullAnalytics:full,download:false});
  expect(doc.getNumberOfPages()).toBe(3);
  expect(doc.__erpPdfRTL).toBe(lang!=='en');
  expect(Buffer.from(doc.output('arraybuffer')).subarray(0,5).toString()).toBe('%PDF-');
  const page=new jsPDF({unit:'mm',format:'a4'});
  prepareLocalizedPdf(page,{lang});
  const labels=[];
  const native=page.text.bind(page);
  vi.spyOn(page,'text').mockImplementation((value,x,y,...args)=>{
    labels.push({text:String(value),x,y,page:page.getNumberOfPages()});
    return native(value,x,y,...args);
  });
  drawPdfNetworkManagement(page,{insights:full.networkBranches,driverSales:full.driverSales,range,
   lang,branchLabel:'All branches'});
  expect(page.getNumberOfPages()).toBe(2);
  expect(labels.some(l=>l.text.includes('1,147.00')&&l.y>=207&&l.y<278)).toBe(true);
  expect(labels.filter(l=>l.y>=207&&l.y<278).length).toBeGreaterThan(10);
  expect(labels.every(l=>l.page!==2 || l.y<284)).toBe(true);
 });
 it('wires manual, scheduled, automatic sources and hard page cap without data mutation',()=>{
  const scheduled=read('../src/lib/scheduledERPReportData.js');
  const network=read('../src/lib/drawPdfNetworkManagement.js');
  const generator=read('../src/lib/salesAnalyticsPdf.js');
  const emails=read('../src/lib/automaticReportPdf.js');
  const report=read('../src/pages/Reports.jsx');
  expect(scheduled).toContain("read('driver_sales_entries'");
  expect(scheduled).toContain("read('drivers'");
  expect(network).toContain('const pageCount=1');
  expect(network).toContain('drawPdfDriverSalesSection(doc');
  expect(generator).toContain("ERP_PDF_PAGE_LIMIT_EXCEEDED");
  expect(emails).toContain('const requiredPages=3');
  expect(report).toContain('driverSalesEntries,drivers:pdfDrivers');
  expect(generator).not.toMatch(/\b(?:UPDATE|INSERT|DELETE)\s+public\./);
 });
});
