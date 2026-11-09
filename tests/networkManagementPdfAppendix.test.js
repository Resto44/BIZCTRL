import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {jsPDF} from 'jspdf';
import {prepareLocalizedPdf} from '../src/lib/pdfLocalization.js';
import {buildPdfNetworkBranchInsights} from '../src/lib/pdfNetworkBranchInsights.js';
import {buildFullSalesAnalyticsReport} from '../src/lib/fullSalesAnalyticsReport.js';
import {buildSalesReportSnapshot} from '../src/lib/salesReportPeriod.js';
import {generateSalesAnalyticsPDF} from '../src/lib/salesAnalyticsPdf.js';
import {drawPdfNetworkManagement} from '../src/lib/drawPdfNetworkManagement.js';

const source = p => readFileSync(new URL(p,import.meta.url),'utf8');
const range = {from:'2026-11-01',to:'2026-11-05',previousFrom:'2026-10-27',previousTo:'2026-10-31'};
const branches = [
 {id:'b1',branch_key:'main',name:'Main branch'},
 {id:'b2',branch_key:'east',name:'East branch'},
];
const sales = [
 {id:'first',date:'2026-11-05',closing_state:'finalized',branch_id:'b1',branch:'main',
  restaurant_cash:75,restaurant_network:25,credit:0,
  pos_entries_json:[{network_account_id:'mada',device_name:'Main Mada',amount:25}]},
 {id:'second',date:'2026-11-05',closing_state:'locked',branch_id:'b2',branch:'east',
  restaurant_cash:20,restaurant_network:65,credit:0,
  pos_entries_json:[{network_account_id:'visa',device_name:'East VISA',amount:65}]},
 {id:'legacy',date:'2026-11-04',closing_state:'finalized',branch:'main',restaurant_network:10,
  pos_entries_json:'[]'},
 {id:'unassigned',date:'2026-11-03',closing_state:'finalized',branch:'ambiguous',restaurant_network:5},
 {id:'prior',date:'2026-10-30',closing_state:'finalized',branch_id:'b1',branch:'main',restaurant_network:30},
 {id:'draft',date:'2026-11-05',closing_state:'draft',branch_id:'b1',branch:'main',restaurant_network:9999},
 {id:'future',date:'2026-11-06',closing_state:'finalized',branch_id:'b1',branch:'main',restaurant_network:2000},
];
const current = buildSalesReportSnapshot({sales,from:range.from,to:range.to});
const previous = buildSalesReportSnapshot({sales,from:range.previousFrom,to:range.previousTo});
const model = buildPdfNetworkBranchInsights({sales,branches,range,snapshot:current,previousSnapshot:previous});

describe('Network Management ERP appendix in canonical PDF reports',()=>{
 it('retains exact sales as subset, excludes drafts and future, and leaves settlement flows untouched',()=>{
  expect(model.total).toBe(105);
  expect(model.previousTotal).toBe(30);
  expect(model.currentClosings).toBe(4);
  expect(current.network).toBe(model.total);
  expect(model.sourceMismatch).toBe(0);
  expect(model.change).toBe(250);
  expect(model.allocation).toBe(90);
  expect(model.allocationGap).toBe(15);
  expect(model.branches).toHaveLength(3);
  expect(model.branches[0].id).toBe('b2');
  expect(model.branches.map(b=>b.current.network)).toEqual([65,35,5]);
  expect(model.branches.reduce((t,b)=>t+b.current.network,0)).toBe(105);
  expect(model.trend.reduce((t,b)=>t+b.value,0)).toBe(105);
  expect(model.previousTrend.reduce((t,b)=>t+b.value,0)).toBe(30);
  expect(model.weekdays.reduce((t,b)=>t+b.value,0)).toBe(105);
  expect(model.accounts.map(a=>a.value)).toEqual([65,25]);
  // Distinct closing, daily and weekend metrics must not change the sales total.
  expect(model.operational).toMatchObject({
    closingCount:4, cardPositiveClosings:4, activeCardDays:3,
    averageCardPerClosing:26.25, weekendShare:0,
    peakDay:{date:'2026-11-05',value:90},topBranch:{id:'b2'},
  });
  expect(model.operational.peakWeekday).toEqual({day:'Thu',value:90});
 });
 it('does not misattribute a legacy row to a branch with a duplicate human-readable name',()=>{
  const duplicated=[{id:'one',branch_key:'one',name:'Shared'},{id:'two',branch_key:'two',name:'Shared'}];
  const insight=buildPdfNetworkBranchInsights({range,branches:duplicated,sales:[
   {date:'2026-11-05',closing_state:'finalized',branch:'Shared',restaurant_network:70},
   {date:'2026-11-05',closing_state:'locked',branch_id:'two',restaurant_network:20},
  ]});
  expect(insight.total).toBe(90);
  expect(insight.branches.find(b=>b.id==='__unattributed__').current.network).toBe(70);
  expect(insight.branches.find(b=>b.id==='two').current.network).toBe(20);
 });
 it('does not fabricate growth when prior sales are zero',()=>{
  const insight=buildPdfNetworkBranchInsights({range,branches,sales:sales.filter(s=>s.id!=='prior')});
  expect(insight.change).toBeNull();
  expect(insight.branches[0].growth).toBeNull();
 });
 it('integrates into full PDF analytics model with scoped branch metadata and no ledger writes',()=>{
  const full=buildFullSalesAnalyticsReport({
   sales,branches,snapshot:current,previousSnapshot:previous,range,walletTransactions:[],
  });
  expect(full.networkBranches.total).toBe(current.network);
  expect(full.networkBranches.branches).toHaveLength(3);
  const sources=[
   '../src/lib/automaticReportPdf.js',
   '../src/pages/Reports.jsx',
   '../src/pages/ScheduledReports.jsx',
   '../src/pages/OwnerDashboard.jsx',
  ].map(source);
  sources.forEach(file=>expect(file).toContain('buildFullSalesAnalyticsReport('));
  expect(source('../src/lib/salesAnalyticsPdf.js')).toContain('drawPdfNetworkManagement(');
  expect(source('../src/lib/drawPdfNetworkManagement.js')).not.toContain('supabase.from(');
 });
 it.each(['en','ar','fa'])('renders A4 3+ pages with readable localized branch network appendix in %s',async lang=>{
  const fullAnalytics=buildFullSalesAnalyticsReport({sales,branches,snapshot:current,
   previousSnapshot:previous,range,walletTransactions:[],historyAvailable:true,lang});
  const doc=await generateSalesAnalyticsPDF({snapshot:current,previousSnapshot:previous,range,
   fullAnalytics,branchLabel:'All branches',businessName:'BizCTRL Restaurant',currency:'SAR',lang,download:false});
  expect(doc.getNumberOfPages()).toBe(3);
  expect(doc.__erpPdfRTL).toBe(lang!=='en');
  expect(Buffer.from(doc.output('arraybuffer')).subarray(0,5).toString()).toBe('%PDF-');
 });
 it('aggregates 15 enterprise branches into one appendix without losing any total',()=>{
  const many=Array.from({length:15},(_,i)=>({
   id:'b'+i,name:'Branch '+(i+1),current:{network:10+i,total:10+i,closings:1},
   previous:{network:5},share:5,growth:10,cardMix:100,
  }));
  const doc=new jsPDF({unit:'mm',format:'a4'});
  prepareLocalizedPdf(doc,{lang:'en'});
  const count=drawPdfNetworkManagement(doc,{insights:{...model,branches:many},range,lang:'en'});
  expect(count).toBe(1);
  expect(doc.getNumberOfPages()).toBe(2); // 1 starting page + 1 consolidated appendix
  expect(many.reduce((n,b)=>n+b.current.network,0)).toBe(255);
 });
});
