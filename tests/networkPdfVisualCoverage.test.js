import {describe,it,expect,vi} from 'vitest';
import {jsPDF} from 'jspdf';
import {prepareLocalizedPdf} from '../src/lib/pdfLocalization.js';
import {drawPdfNetworkManagement} from '../src/lib/drawPdfNetworkManagement.js';
import {buildPdfNetworkBranchInsights} from '../src/lib/pdfNetworkBranchInsights.js';
import {buildSalesReportSnapshot} from '../src/lib/salesReportPeriod.js';
import {buildFullSalesAnalyticsReport} from '../src/lib/fullSalesAnalyticsReport.js';
import {generateSalesAnalyticsPDF} from '../src/lib/salesAnalyticsPdf.js';

const range={from:'2026-06-01',to:'2026-11-06',previousFrom:'2025-12-27',previousTo:'2026-06-01'};
const branches=[{id:'b1',branch_key:'main',name:'Main'},{id:'b2',branch_key:'east',name:'East'}];
const closing=(id,date,branch_id,network,more={})=>({
 id,date,branch_id,closing_state:'finalized',restaurant_network:network,restaurant_cash:0,credit:0,...more,
});
const build=(rows)=>buildPdfNetworkBranchInsights({sales:rows,branches,range});

function drawAndCapture(insights,lang='en'){
 const doc=new jsPDF({unit:'mm',format:'a4'});
 prepareLocalizedPdf(doc,{lang});
 const labels=[];
 const real=doc.text.bind(doc);
 vi.spyOn(doc,'text').mockImplementation((value,x,y,...options)=>{
  labels.push({value:String(value),x,y,page:doc.getNumberOfPages()});
  return real(value,x,y,...options);
 });
 drawPdfNetworkManagement(doc,{insights,range,lang,currency:'SAR',branchLabel:'All branches'});
 return {doc,labels};
}

describe('Network PDF visual/attribution regression (screenshot repair)',()=>{
 it('uses saved single account references where POS JSON arrays are empty (legacy closings)',()=>{
  const rows=[
   closing('a','2026-11-06','b1',300,{pos_entries_json:[],restaurant_network_account_id:'mada-account'}),
   closing('b','2026-11-06','b2',200,{network_account_id:'network-account'}),
   closing('c','2026-11-05','b1',50,{pos_device_id:'device-1'}),
   closing('d','2026-11-05','b1',120,{pos_entries_json:[{account_id:'legacy-account',amount:120}]}),
   closing('unmapped','2026-11-05','b2',20),
  ];
  const insight=build(rows);
  expect(insight.total).toBe(690);
  expect(insight.allocation).toBe(670);
  expect(insight.allocationGap).toBe(20);
  expect(insight.explicitMapped).toBe(120);
  expect(insight.singleAccountMapped).toBe(550);
  expect(insight.allocationCoverage).toBe('partial');
  expect(insight.mappedClosings).toBe(4);
  expect(insight.unmappedClosings).toBe(1);
  expect(insight.accounts).toHaveLength(4);
  const snapshot=buildSalesReportSnapshot({sales:rows,from:range.from,to:range.to});
  expect(insight.total).toBe(snapshot.network); // only a breakdown, not a second revenue source
 });
 it('distinguishes missing POS details from a real shortage, without fabricating account mapping',()=>{
  const insight=build([closing('unknown','2026-11-06','b1',16198)]);
  expect(insight.allocationCoverage).toBe('unavailable');
  expect(insight.allocation).toBe(0);
  expect(insight.allocationGap).toBe(16198);
  const {labels}=drawAndCapture(insight);
  expect(labels.filter(r=>r.value==='No saved POS mapping available')).toHaveLength(1);
  expect(labels.filter(r=>r.value==='Unmapped is not a cash shortage')).toHaveLength(1);
  expect(labels.some(r=>r.value==='16,198.00 SAR' && r.x<100)).toBe(false);
  expect(labels.some(r=>r.value==='POS allocation gap')).toBe(false);
 });
 it('prints each bottom panel heading once and avoids chart-value/title overprinting',()=>{
  const insight=build([
   closing('first','2026-11-06','b1',90,{network_account_id:'a'}),
   closing('second','2026-11-05','b2',10),
  ]);
  const {labels,doc}=drawAndCapture(insight);
  expect(doc.getNumberOfPages()).toBe(2);
  const get=t=>labels.filter(r=>r.value===t);
  for(const title of ['POS account attribution','Accounting notes','Matched to saved POS accounts',
    'Unmapped in closing metadata','Finalized card sales are counted only once.',
    'Bank transfers are not extra revenue or proof of collection.']){
    expect(get(title),title).toHaveLength(1);
  }
  // Longer disclaimer is not repeated as a box heading and body.
  expect(get('Only finalized or locked closings. Card / POS allocations are included in sales, not additional income.')).toHaveLength(0);
  const [posTitle]=get('POS account attribution');
  const [posLabel]=get('Matched to saved POS accounts');
  const [notesTitle]=get('Accounting notes');
  const [notesBody]=get('Finalized card sales are counted only once.');
  expect(posLabel.y-posTitle.y).toBeGreaterThanOrEqual(8);
  expect(notesBody.y-notesTitle.y).toBeGreaterThanOrEqual(8);
  expect(posLabel.y).toBeLessThan(272);
  expect(get('No prior confirmed closings').length).toBeGreaterThan(0);
 });
 it.each(['en','fa','ar'])('correctly displays missing POS attribution in %s without duplicate dense disclaimer',lang=>{
   const insight=build([closing('a','2026-11-06','b1',120)]);
   const {doc,labels}=drawAndCapture(insight,lang);
   expect(doc.getNumberOfPages()).toBe(2);
   expect(doc.__erpPdfRTL).toBe(lang!=='en');
   expect(labels.filter(r=>r.page===2).length).toBeGreaterThan(15);
   expect(Buffer.from(doc.output('arraybuffer')).subarray(0,5).toString()).toBe('%PDF-');
 });
 it('paginates nine branches safely: append two pages and number every page correctly',async()=>{
   const many=Array.from({length:9},(_,i)=>({id:'id'+i,name:'Branch '+(i+1),branch_key:'k'+i}));
   const sales=many.map((b,i)=>closing('sale'+i,'2026-11-06',b.id,100+i));
   const snapshot=buildSalesReportSnapshot({sales,from:range.from,to:range.to});
   const previousSnapshot=buildSalesReportSnapshot({sales,from:range.previousFrom,to:range.previousTo});
   const fullAnalytics=buildFullSalesAnalyticsReport({sales,snapshot,previousSnapshot,branches:many,range,historyAvailable:true});
   expect(fullAnalytics.networkBranches.branches).toHaveLength(9);
   const pdf=await generateSalesAnalyticsPDF({snapshot,previousSnapshot,range,fullAnalytics,
    branchLabel:'All branches',lang:'en',download:false});
   expect(pdf.getNumberOfPages()).toBe(4); // two financial pages + two 8-row network pages
 });
});
