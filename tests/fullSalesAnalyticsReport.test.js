import {describe,it,expect,vi} from 'vitest';
import {buildFullSalesAnalyticsReport} from '../src/lib/fullSalesAnalyticsReport';
import {buildSalesReportSnapshot} from '../src/lib/salesReportPeriod';
import {buildOperationsPdfReport} from '../src/lib/operationsPdfReport';
import {drawTwoPageERPReport} from '../src/lib/twoPageERPReport';
import {prepareLocalizedPdf} from '../src/lib/pdfLocalization';
import {jsPDF} from 'jspdf';
const range={from:'2026-10-01',to:'2026-10-15',previousFrom:'2026-09-01',previousTo:'2026-09-15'};
const sales=[{date:'2026-10-01',closing_state:'finalized',restaurant_cash:100,restaurant_network:300,credit:50,sales_sources_json:[{source_key:'delivery',name_en:'Delivery',amount:100}]},
 {date:'2026-10-02',closing_state:'locked',restaurant_cash:200},
 {date:'2025-10-01',closing_state:'finalized',restaurant_cash:250},
 {date:'2025-10-20',closing_state:'finalized',restaurant_cash:9000},
 {date:'2026-10-03',closing_state:'draft',restaurant_cash:9999}];
const purchases=[{date:'2026-10-02',approval_status:'approved',total_amount:60,items:[{product_id:'rice',product_name:'Rice',quantity:2,unit:'bag',line_total:20},{product_id:'rice',product_name:'Rice',quantity:10,unit:'kg',line_total:40}]}];
const snapshot=buildSalesReportSnapshot({sales,purchases,from:range.from,to:range.to});
const report=buildOperationsPdfReport({sales,purchases,range});
const build=extra=>buildFullSalesAnalyticsReport({sales,purchases,snapshot,range,operationsReport:report,historyAvailable:true,...extra});
describe('Complete two-page Sales Analytics coverage',()=>{
 it('compares calendar months up to the same date, excludes drafts/future prior-month records',()=>{
  const a=build();expect(a.history.rows.at(-1)).toMatchObject({current:snapshot.sales,previous:250});
  expect(a.performance.best.date).toBe('2026-10-01');expect(a.performance.worst.date).toBe('2026-10-02');
 });
 it('does not classify purchases as consumption or merge bags into kg',()=>{
  const a=build();expect(a.products).toHaveLength(2);expect(a.products.find(p=>p.unit==='bag').quantity).toBe(2);
  expect(report.hasConsumptionData).toBe(false);expect(a.signals.missingConsumption).toBe(true);
 });
 it('excludes cash handovers and canceled transfers from network receipts',()=>{
  const a=build({walletTransactions:[
   {transaction_date:'2026-10-01T12:00:00Z',transaction_type:'sent_to_owner',amount:1000},
   {transaction_date:'2026-10-01T12:00:00Z',transaction_type:'branch_to_owner_network',amount:200},
   {transaction_date:'2026-10-01T12:00:00Z',transaction_type:'branch_to_owner_network',amount:900,status:'cancelled'}]});
  expect(a.network.received).toBe(200);expect(a.network.difference).toBe(snapshot.network-200);
  expect(build().network.available).toBe(false);
 });
 it('keeps overlapping operational sources separate from canonical payments',()=>{
  const a=build();expect(a.payment.total).toBe(snapshot.sales);expect(a.payment.sources[0].name).toBe('Delivery');expect(a.payment.reconciled).toBe(true);
 });
 it.each([[0,'Best branch by operating result'],[10,'Provisional leader (unallocated costs)']])('plots every branch and qualifies ranking when unallocated costs = %s',(unallocated,prefix)=>{
  const doc=new jsPDF();prepareLocalizedPdf(doc,{lang:'en'});const labels=[];
  const original=doc.text.bind(doc);vi.spyOn(doc,'text').mockImplementation((v,...args)=>{labels.push(String(v));return original(v,...args);});
  const branches=[
   {name:'High sales loss',sales:100,purchases:120,expenses:10,netProfit:-30,closings:1},
   {name:'Winner A',sales:60,purchases:20,expenses:10,netProfit:30,closings:1},
   {name:'Winner B',sales:50,purchases:10,expenses:10,netProfit:30,closings:1},
   {name:'No activity',sales:0,purchases:0,expenses:0,netProfit:0,closings:0},
   {name:'Fifth branch',sales:20,purchases:10,expenses:5,netProfit:5,closings:1},
  ];
  drawTwoPageERPReport(doc,{snapshot,range,report:{...report,branches,branchProfitUnallocated:unallocated},fullAnalytics:build(),lang:'en'});
  for(const branch of branches)expect(labels).toContain(branch.name);
  expect(labels).toContain(prefix);expect(labels).toContain('Winner A / Winner B');expect(labels).toContain('30 SAR');expect(labels).toContain('No recorded activity');
  expect(labels).toContain('-30');expect(labels).not.toContain('Other branches');
  expect(doc.getNumberOfPages()).toBe(2);
 });
 it.each([1,2])('does not call %s loss-making active branches profitable winners',(count)=>{
  const doc=new jsPDF();prepareLocalizedPdf(doc,{lang:'en'});const labels=[];
  const original=doc.text.bind(doc);vi.spyOn(doc,'text').mockImplementation((v,...args)=>{labels.push(String(v));return original(v,...args);});
  const branches=Array.from({length:count},(_,i)=>({name:'Loss '+i,sales:10,purchases:20+i,expenses:0,netProfit:-10-i,closings:1}));
  drawTwoPageERPReport(doc,{snapshot,range,report:{...report,branches,branchProfitUnallocated:0},fullAnalytics:build(),lang:'en'});
  expect(labels).toContain(count===1?'Only branch with recorded activity':'Lowest operating loss');
  expect(labels).toContain('-10 SAR');expect(labels).not.toContain('Best branch by operating result');
  expect(labels).toContain('No comparable prior sales');
 });
 it.each(['fa','ar'])('keeps the expense legend swatch adjacent to its own %s label',(lang)=>{
  const doc=new jsPDF();prepareLocalizedPdf(doc,{lang});const labels=[],rects=[];
  const originalText=doc.text.bind(doc),originalRect=doc.rect.bind(doc);
  vi.spyOn(doc,'text').mockImplementation((v,x,y,...args)=>{labels.push({v:String(v),x,y,page:doc.getNumberOfPages()});return originalText(v,x,y,...args);});
  vi.spyOn(doc,'rect').mockImplementation((x,y,w,h,...args)=>{rects.push({x,y,w,h,page:doc.getNumberOfPages()});return originalRect(x,y,w,h,...args);});
  drawTwoPageERPReport(doc,{snapshot,range,report,fullAnalytics:build(),lang});
  const label=labels.find(t=>t.v===(lang==='fa'?'مجموع مصارف ثابت و متغیر':'المصروفات الثابتة والمتغيرة'));
  expect(label).toBeDefined();
  expect(rects.some(r=>r.page===1&&Math.abs(r.x-label.x-2)<.01&&Math.abs(r.y-label.y)<2&&r.w===1.8)).toBe(true);
 });
 it('keeps 704 of expense records separate from supplier purchases',()=>{
  const result=buildSalesReportSnapshot({sales:[{date:'2026-10-15',closing_state:'finalized',restaurant_cash:7953}],purchases:[{date:'2026-10-15',approval_status:'approved',total_amount:7758.6}],expenses:[{date:'2026-10-15',amount:659},{date:'2026-10-15',amount:45}],from:range.from,to:range.to});
  expect(result.purchases).toBe(7758.6);expect(result.totalExpenses).toBe(704);expect(result.netProfit).toBeCloseTo(-509.6);
 });
 it('renders every analytics section in exactly two pages with explicit product row limits',()=>{
  const doc=new jsPDF();prepareLocalizedPdf(doc,{lang:'en'});const labels=[];
  const original=doc.text.bind(doc);vi.spyOn(doc,'text').mockImplementation((v,...args)=>{labels.push(String(v));return original(v,...args);});
  const a=build();a.products=Array.from({length:20},(_,i)=>({name:'Product '+i,quantity:i,unit:'carton',cost:i}));
  drawTwoPageERPReport(doc,{snapshot,range,report,fullAnalytics:a,lang:'en'});
  expect(doc.getNumberOfPages()).toBe(2);
  for(const label of ['Period sales trend','Payment mix','Monthly sales / year comparison','Payment channel trends','Sales sources (already included)','Network receipts / reconciliation','Branch performance & sales signals','Purchases trend','Fixed / variable expense trends','Sales / operating result*','Cost control · current / prior','Expense categories','Actual inventory use / direct sales','Purchased products (not consumption)','Management actions & balances'])expect(labels).toContain(label);
  expect(labels).toContain('Shown / total: 5 / 20');
 });
});
