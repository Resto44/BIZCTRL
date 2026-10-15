import {describe,it,expect,vi} from 'vitest';
import {jsPDF} from 'jspdf';
import {prepareLocalizedPdf} from '../src/lib/pdfLocalization';
import {drawDetailedERPReport} from '../src/lib/detailedERPReport';
import {buildOperationsPdfReport} from '../src/lib/operationsPdfReport';

const range={from:'2026-10-01',to:'2026-10-15'};
describe('Readable complete ERP report',()=>{
 it('retains all inventory, consumption and category rows beyond former preview limits',()=>{
  const inventory=Array.from({length:95},(_,i)=>({id:`p${i}`,product_id:`p${i}`,product_name:`Item ${i}`,quantity:1,low_stock_threshold:2}));
  const transactions=inventory.map(x=>({product_id:x.id,created_date:'2026-10-10',transaction_type:'sale',quantity:2,unit_cost:4}));
  const report=buildOperationsPdfReport({range,inventory,inventoryTransactions:transactions});
  expect(report.stocks).toHaveLength(95);expect(report.lowStock).toHaveLength(95);expect(report.consumption).toHaveLength(95);
 });
 it.each(['fa','ar','en'])('paginates %s long rows without shrinking text, losing records or exceeding printable bounds',lang=>{
  const doc=new jsPDF();prepareLocalizedPdf(doc,{lang});
  const calls=[];const original=doc.text.bind(doc);
  vi.spyOn(doc,'text').mockImplementation((value,x,y,options={})=>{
   calls.push({value:String(value),x,y,size:doc.getFontSize(),font:doc.getFont(),width:doc.getTextWidth(doc.processArabic(String(value))),options,page:doc.getCurrentPageInfo().pageNumber});
   return original(value,x,y,options);
  });
  const stocks=Array.from({length:95},(_,i)=>({name:`رقم ${i} محصول با نام طولانی مخصوص گزارش مدیریت شعبه`,quantity:i,unit:'کیلوگرام',threshold:2}));
  stocks.push({name:'VeryLongReference'.repeat(100),quantity:-5,unit:'unit',threshold:0});
  drawDetailedERPReport(doc,{snapshot:{sales:100,netProfit:-12,breakdown:[]},range,branchLabel:'فرع الريان',businessName:'مطعم',lang,report:{stocks,asOfDate:'2026-10-15'}});
  expect(doc.getNumberOfPages()).toBeGreaterThan(12);
  for(let i=0;i<95;i++)expect(calls.some(c=>c.value.includes(`رقم ${i} `))).toBe(true);
  for(const c of calls.filter(c=>c.y>40&&c.y<280)){
   expect(c.size).toBeGreaterThanOrEqual(10);
   expect(c.font.fontName).toBe('Vazirmatn');
   const left=c.options.align==='right'?c.x-c.width:c.x;
   expect(left,c.value).toBeGreaterThanOrEqual(9.9);
   expect(left+c.width,c.value).toBeLessThanOrEqual(200.1);
   expect(c.y,c.value).toBeLessThanOrEqual(275);
  }
  for(let i=1;i<=doc.getNumberOfPages();i++)expect(calls.some(c=>c.page===i&&c.value===`${i} / ${doc.getNumberOfPages()}`)).toBe(true);
 });
});
