import {describe,it,expect,vi} from 'vitest';
import {jsPDF} from 'jspdf';
import {prepareLocalizedPdf} from '../src/lib/pdfLocalization';
import {aggregateReportTrend,summarizeReportRows,drawTwoPageERPReport} from '../src/lib/twoPageERPReport';
const breakdown=Array.from({length:365},(_,i)=>({date:`day-${i}`,sales:i,purchases:i/2,variable:i/4,fixed:1}));
describe('Exactly two ERP summary pages',()=>{
 it('preserves all totals when grouping a long reporting period',()=>{
  const buckets=aggregateReportTrend(breakdown);
  expect(buckets.length).toBeLessThanOrEqual(16);
  for(const field of ['sales','purchases'])expect(buckets.reduce((s,r)=>s+r[field],0)).toBe(breakdown.reduce((s,r)=>s+r[field],0));
  expect(buckets.reduce((s,r)=>s+r.expenses,0)).toBe(breakdown.reduce((s,r)=>s+r.variable+r.fixed,0));
  expect(buckets[0].from).toBe('day-0');expect(buckets.at(-1).to).toBe('day-364');
 });
 it('explicitly includes excess branches/categories in Other',()=>{
  const rows=Array.from({length:90},(_,i)=>({name:`Branch ${i}`,value:i}));
  const summary=summarizeReportRows(rows,5,'Other');expect(summary).toHaveLength(5);
  expect(summary.at(-1).name).toBe('Other');expect(summary.reduce((s,r)=>s+r.value,0)).toBe(4005);
 });
 it.each(['fa','ar','en'])('keeps %s text within the page and outputs exactly two pages even for large data',lang=>{
  const doc=new jsPDF();prepareLocalizedPdf(doc,{lang});const calls=[];const original=doc.text.bind(doc);
  vi.spyOn(doc,'text').mockImplementation((value,x,y,options={})=>{
   calls.push({value,x,y,width:doc.getTextWidth(doc.processArabic(String(value))),align:options.align});return original(value,x,y,options);
  });
  drawTwoPageERPReport(doc,{snapshot:{sales:123456789.99,purchases:1234567.89,totalExpenses:45678,netProfit:-98765.43,averageDailySales:32345.67,breakdown},range:{from:'2026-01-01',to:'2026-12-31'},branchLabel:'شعبه با نام بسیار طولانی جهت آزمایش گزارش',businessName:'BizCTRL',lang,
   report:{branches:Array.from({length:90},(_,i)=>({name:'شعبه '+i,sales:i})),costGroups:Array.from({length:90},(_,i)=>({name:'مصارف '+i,value:i}))}});
  expect(doc.getNumberOfPages()).toBe(2);
  for(const c of calls){
   const left=c.align==='right'?c.x-c.width:c.x;expect(left,String(c.value)).toBeGreaterThanOrEqual(6.9);
   expect(left+c.width,String(c.value)).toBeLessThanOrEqual(203.1);expect(c.y).toBeLessThan(294);
  }
  expect(calls.some(c=>c.value==='1 / 2')).toBe(true);expect(calls.some(c=>c.value==='2 / 2')).toBe(true);
 });
});
