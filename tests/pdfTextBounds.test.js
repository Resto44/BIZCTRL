import {describe,it,expect,vi} from 'vitest';
import {jsPDF} from 'jspdf';
import {prepareLocalizedPdf,drawLocalizedPdfText} from '../src/lib/pdfLocalization';
import {drawSinglePageSalesAnalytics} from '../src/lib/singlePageSalesAnalyticsReport';

const panels=[[7,58,46,25],[57,58,46,25],[107,58,46,25],[157,58,46,25],
 [7,87,122,63],[133,87,70,63],[7,154,122,57],[133,154,70,57],
 [7,215,94,35],[105,215,98,35],[7,253,62,22],[73,253,62,22],[139,253,64,22]];
const snapshot={sales:1234567.89,purchases:7758.6,totalExpenses:12000.5,grossProfit:194.4,netProfit:-54321.21,netMargin:-4.4,cash:1267,network:4630,credit:320,other:1736,variableExpenses:10000,fixedDeduction:2000.5,finalizedClosings:14,breakdown:[{date:'2026-10-15',sales:1234567.89,netProfit:-54321.21}]};
const report={branches:[{name:'فرع طريق المدينة المنورة - القسم الرئيسي',sales:1234567.89,netProfit:-54321.21}],hasInventoryData:true,stockCount:20,lowStock:[],noStock:0,hasDebtData:true,debts:{receivables:300,payables:100},hasConsumptionData:true,consumption:[{name:'برنج باسمتی درجه یک ویژه رستورانت',quantity:1234.5,unit:'کیلوگرام',estimatedCost:9876.5,costAvailable:true}]};

describe('ERP PDF font coverage and bounded bilingual cells',()=>{
 it('embeds real regular and bold glyphs for mixed Persian, Arabic, Latin and digits',()=>{
  const doc=new jsPDF();prepareLocalizedPdf(doc,{lang:'fa'});
  for(const bold of [false,true]){
   drawLocalizedPdfText(doc,'گزارش ERP 2026 / فرع الريان',10,20,{bold});
   const font=doc.getFont();expect(font.fontStyle).toBe(bold?'bold':'normal');
   for(const char of 'گزارشERP2026فرعالريان')expect(font.metadata.characterToGlyph(char.codePointAt(0)),char).toBeGreaterThan(0);
  }
 });
 it.each(['fa','ar','en'])('keeps %s text inside its card, with unmodified ISO dates and financial amounts',lang=>{
  const doc=new jsPDF({unit:'mm',format:'a4',putOnlyUsedFonts:true});prepareLocalizedPdf(doc,{lang});
  const text=doc.text.bind(doc),calls=[];
  vi.spyOn(doc,'text').mockImplementation((value,x,y,options={})=>{
   const str=String(value),width=doc.getTextWidth(doc.processArabic(str));
   calls.push({value:str,x,y,options,width});return text(value,x,y,options);
  });
  drawSinglePageSalesAnalytics(doc,{snapshot,report,range:{from:'2026-01-01',to:'2026-10-15'},branchLabel:'فرع الريان',businessName:'مطاعم شمعة الريان',lang,currency:'SAR'});
  for(const call of calls){
   const card=panels.find(([x,y,w,h])=>call.x>=x&&call.x<=x+w&&call.y>=y&&call.y<=y+h);
   if(!card)continue;
   const left=call.options.align==='right'?call.x-call.width:call.x;
   expect(left,call.value).toBeGreaterThanOrEqual(card[0]-.05);
   expect(left+call.width,call.value).toBeLessThanOrEqual(card[0]+card[2]+.05);
   expect(call.options.maxWidth,call.value).toBeUndefined(); // no uncontrolled wrapping
  }
  expect(calls.some(c=>c.value==='2026-01-01 / 2026-10-15')).toBe(true);
  expect(calls.some(c=>c.value==='1,234,567.89 SAR')).toBe(true);
  expect(calls.some(c=>c.value==='-54,321.21 SAR')).toBe(true);
  expect(doc.getNumberOfPages()).toBe(1);
 });
});
