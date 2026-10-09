import { describe, expect, it } from 'vitest';
import jsPDF from 'jspdf';
import { prepareLocalizedPdf, drawLocalizedPdfText } from '../src/lib/pdfLocalization.js';
import { generateSalesAnalyticsPDF } from '../src/lib/salesAnalyticsPdf.js';

const row={id:'rayyan',name:'فرع الريان',sales:885,purchases:578,expenses:0,netProfit:307,margin:34.7};
const report={
  branches:[row],best:null,worst:null,
  stocks:[{name:'كراتين الدجاج',quantity:120,unit:'كرتون',low:false}],
  stockCount:1,hasInventoryData:true,lowStock:[],noStock:0,
  consumption:[{name:'أكياس الرز',quantity:6,unit:'كيس'}],
  costGroups:[{name:'رواتب الموظفين',value:184}],
  hasDebtData:true,debts:{receivables:110,payables:400,unknown:0},
  branchProfitUnallocated:0,asOfDate:'2026-10-09',
};
const range={type:'today',from:'2026-10-09',to:'2026-10-09'};
const snapshot={
  sales:885,purchases:578,expenses:0,grossProfit:307,netProfit:307,netMargin:34.7,
  cash:400,network:440,credit:45,other:0,
  breakdown:[{date:range.from,sales:885,cash:400,network:440,credit:45,purchases:578,netProfit:307}],
};

describe('English ERP PDF with Arabic/Persian database fields',()=>{
  it('embeds Arabic font even if the selected PDF language is English',()=>{
    const doc=new jsPDF({unit:'mm',format:'a4',putOnlyUsedFonts:true});
    prepareLocalizedPdf(doc,{lang:'en',dir:'ltr'});
    expect(doc.__erpPdfRTL).toBe(false);
    expect(doc.getFontList().NotoNaskhArabic).toContain('normal');
    expect(doc.getFontList().NotoNaskhArabic).toContain('bold');
    drawLocalizedPdfText(doc,'BRANCH PERFORMANCE',12,12,{rtl:false});
    expect(doc.getFont().fontName).toBe('helvetica');
    drawLocalizedPdfText(doc,'فرع الريان',12,22,{rtl:false});
    expect(doc.getFont().fontName).toBe('NotoNaskhArabic');
    drawLocalizedPdfText(doc,'مطاعم شمعة الريان',12,32,{rtl:false,bold:true});
    expect(doc.getFont().fontName).toBe('NotoNaskhArabic');
    drawLocalizedPdfText(doc,'450 SAR',12,42,{rtl:false});
    expect(doc.getFont().fontName).toBe('helvetica');
  });

  it('keeps Arabic font in native Arabic and Persian reports without changing layout direction',()=>{
    for(const lang of ['ar','fa']){
      const doc=new jsPDF({unit:'mm',format:'a4',putOnlyUsedFonts:true});
      prepareLocalizedPdf(doc,{lang,dir:'rtl'});
      drawLocalizedPdfText(doc,'فرع الريان',15,20,{rtl:true,bold:true});
      expect(doc.getFont().fontName).toBe('NotoNaskhArabic');
      expect(doc.__erpPdfRTL).toBe(true);
    }
  });

  it('exports one A4 English report with intact Arabic record values and all finance numbers',async()=>{
    const pdf=await generateSalesAnalyticsPDF({
      snapshot,range,operationsReport:report,branchLabel:'فرع الريان',
      businessName:'مطاعم شمعة الريان',currency:'SAR',lang:'en',dir:'ltr',download:false,
    });
    expect(pdf.getNumberOfPages()).toBe(1);
    expect(pdf.__erpPdfRTL).toBe(false);
    const buffer=Buffer.from(pdf.output('arraybuffer'));
    expect(buffer.subarray(0,8).toString()).toContain('%PDF-');
    expect(pdf.getFontList().NotoNaskhArabic).toContain('normal');
    expect(buffer.byteLength).toBeGreaterThan(15000);
  });
});
