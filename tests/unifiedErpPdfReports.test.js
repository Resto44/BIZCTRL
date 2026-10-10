import {describe,it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {fetchScheduledERPReportData} from '../src/lib/scheduledERPReportData.js';
import {buildSalesReportSnapshot,salesReportGrowth} from '../src/lib/salesReportPeriod.js';
import {generateSalesAnalyticsPDF} from '../src/lib/salesAnalyticsPdf.js';
import {drawBizCTRLReportIcon} from '../src/lib/erpPdfBrand.js';
import jsPDF from 'jspdf';
const file=p=>readFile(new URL(p,import.meta.url),'utf8');
const range={type:'week',from:'2026-10-10',to:'2026-10-16',previousFrom:'2026-10-03',previousTo:'2026-10-09'};
const restaurant='tenant1',branch='branch1',key='rayyan';
function mockDB(tables={},fault=null){
 const calls=[];
 return {calls,from(table){
  let where=[];
  const query={
   select(){return query;},
   eq(c,v){where.push(row=>row[c]===v);return query;},
   is(c,v){where.push(row=>row[c]===v);return query;},
   gte(c,v){where.push(row=>row[c]>=v);return query;},
   lte(c,v){where.push(row=>row[c]<=v);return query;},
   order(){return query;},
   async range(start,end){
    calls.push({table,start,end});
    if(fault===table)return {data:null,error:new Error('Ledger fetch failed')};
    return {data:(tables[table]||[]).filter(row=>where.every(fn=>fn(row))).slice(start,end+1),error:null};
   },
  };
  if(table==='expense_categories')query.select=()=>({
   eq(){return Promise.resolve({data:(tables[table]||[]).filter(row=>row.restaurant_id===restaurant),error:null});},
  });
  return query;
 }};
}
const sale=(id,tenant,date,branchId,legacyKey,v)=>({
 id,restaurant_id:tenant,date,branch_id:branchId,branch:legacyKey,closing_state:'finalized',
 restaurant_cash:v,restaurant_network:0,credit:0,
});
describe('One-page unified BizCTRL ERP PDF reporting',()=>{
 it('loads confirmed week sales and previous comparison across paginated tenant/branch records, without cross-tenant data',async()=>{
  const sales=Array.from({length:505},(_,i)=>sale('s'+i,restaurant,'2026-10-15',branch,key,1));
  sales.push(sale('legacy',restaurant,'2026-10-15',null,key,10));
  sales.push(sale('other','tenant2','2026-10-15',branch,key,100000));
  sales.push(sale('other-branch',restaurant,'2026-10-15','branch2','other',90000));
  const db=mockDB({daily_sales:sales,expense_categories:[{id:'e',restaurant_id:restaurant,is_fixed:false}]});
  const data=await fetchScheduledERPReportData({db,restaurantId:restaurant,branchId:branch,branchKey:key,
   allBranches:false,range});
  expect(data.sales).toHaveLength(506);
  expect(db.calls.filter(c=>c.table==='daily_sales').length).toBeGreaterThan(2);
  const snapshot=buildSalesReportSnapshot({
   ...data,from:range.from,to:range.to});
  expect(snapshot.sales).toBe(515);
  expect(snapshot.finalizedClosings).toBe(506);
 });
 it('throws instead of exporting fabricated zero totals when any tenant source fails',async()=>{
  const db=mockDB({},'supplier_invoices');
  await expect(fetchScheduledERPReportData({db,restaurantId:restaurant,range}))
    .rejects.toThrow('Ledger fetch failed');
 });
 it('produces EXACTLY one A4 PDF, all languages, with actual snapshot totals',async()=>{
  const snapshot=buildSalesReportSnapshot({sales:[sale('one',restaurant,'2026-10-15',branch,key,885)],
    from:range.from,to:range.to});
  const prior=buildSalesReportSnapshot({sales:[sale('prior',restaurant,'2026-10-09',branch,key,800)],
    from:range.previousFrom,to:range.previousTo});
  for(const lang of ['en','ar','fa']){
   const pdf=await generateSalesAnalyticsPDF({snapshot,previousSnapshot:prior,
     growth:salesReportGrowth(snapshot,prior),range,branchLabel:'فرع الريان',
     businessName:'مطاعم شمعة الريان',lang,download:false});
   expect(pdf.getNumberOfPages()).toBe(1);
   expect(pdf.__erpPdfRTL).toBe(lang!=='en');
   expect(Buffer.from(pdf.output('arraybuffer')).subarray(0,5).toString()).toBe('%PDF-');
  }
 });
 it('draws the four-tile BizCTRL icon and brand on offline jsPDF',()=>{
  const doc=new jsPDF({unit:'mm',format:'a4'});
  expect(()=>drawBizCTRLReportIcon(doc,10,10,15)).not.toThrow();
 });
 it('removes legacy 13-page Scheduled PDF path and applies the same brand to all managed report exports',async()=>{
  const scheduled=await file('../src/pages/ScheduledReports.jsx');
  const analytics=await file('../src/lib/salesAnalyticsPdf.js');
  const table=await file('../src/lib/exportUtils.js');
  const profit=await file('../src/pages/ProfitLoss.jsx');
  const supplier=await file('../src/components/suppliers/SupplierStatement.jsx');
  const invoice=await file('../src/lib/purchaseInvoiceReferenceLayout.js');
  expect(scheduled).toContain('fetchScheduledERPReportData');
  expect(scheduled).toContain('generateSalesAnalyticsPDF');
  expect(scheduled).not.toContain('generateUltimatePDF');
  expect(scheduled).not.toContain('handleSendNow');
  expect(analytics).toContain('drawSinglePageSalesAnalytics');
  expect(table).toContain('drawERPReportBrand');
  expect(profit).toContain('drawERPReportBrand');
  expect(supplier).toContain('drawERPReportBrand');
  expect(invoice).toContain('drawBizCTRLReportIcon');
 });
});
