// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/api/supabaseClient', () => ({ supabase: {} }));
import { readFileSync } from 'node:fs';
import { salesInvoiceERPModel, invoicePercentLabel } from '../src/lib/salesInvoiceERPModel.js';
import { createLocalizedInvoicePDF } from '../src/lib/salesInvoiceService.js';

const archived = {
  id: 'invoice-1', restaurant_id:'rest-1',invoice_number:'INV-20261013-0006',
  sale_date:'2026-10-13', branch:'main-9a50614652',
  cashier_name:'احمد',shift:'Morning',opening_cash:80,closing_cash:97,
  cash_difference:3292,cash_status:'Overage',cash_sales:250,network_sales:1512,
  credit_sales:15,other_sales:0,sales_total:1777,
};
const branches=[{key:'main-9a50614652',id:'branch-1',name:'فرع الريان',label:'فرع الريان'}];

describe('Premium one-page ERP Sales Invoice PDF', () => {
  it('uses persisted revenue, not cash drawer subtraction or mockup values', () => {
    const m=salesInvoiceERPModel(archived,{branches,lang:'fa'});
    expect(m.branch).toBe('فرع الريان');
    expect(m.total).toBe(1777);
    expect(m.sources.map(s=>[s.key,s.amount])).toEqual([
      ['cash',250],['network',1512],['credit',15],
    ]);
    expect(m.sourceStatus).toBe('matched');
    expect(m.cashDifference).toBe(3292);
    expect(m.closingCash-m.openingCash).toBe(17);
    // Showing both facts is correct. Equating these figures would be a lie.
    expect(m.cashDifference).not.toBe(m.closingCash-m.openingCash);
    expect(invoicePercentLabel(m.sources.find(s=>s.key==='network').percent)).toBe('85.1%');
  });
  it('includes other sales as a first-class saved source and does not overstate other income', () => {
    const m=salesInvoiceERPModel({...archived,other_sales:30,sales_total:1807});
    expect(m.sources.find(s=>s.key==='other')?.amount).toBe(30);
    expect(m.sourceStatus).toBe('matched');
    expect(m.sourceGap).toBe(0);
  });
  it('flags mismatch and missing source values; no fabricated cash revenue',()=>{
    const missing=salesInvoiceERPModel({...archived,cash_sales:null,sales_total:1777});
    expect(missing.sourceStatus).toBe('incomplete');
    expect(missing.sources[0].amount).toBeNull();
    const wrong=salesInvoiceERPModel({...archived,sales_total:1700});
    expect(wrong.sourceStatus).toBe('mismatch');
    expect(wrong.sourceGap).toBe(-77);
  });
  it('renders a single A4 landscape PDF for English, Arabic and Persian without mutating the invoice',()=>{
    for(const lang of ['en','ar','fa']){
      const original={...archived};
      const {doc,filename}=createLocalizedInvoicePDF(archived,'BizCTRL','SAR',{lang,branches});
      expect(doc.getNumberOfPages()).toBe(1);
      expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(290);
      expect(doc.internal.pageSize.getHeight()).toBeLessThan(212);
      expect(filename).toContain('-erp-v2-');
      expect(filename).toContain('-'+lang+'.pdf');
      expect(new Uint8Array(doc.output('arraybuffer')).length).toBeGreaterThan(18000);
      expect(archived).toEqual(original);
    }
  });
  it('all buttons and background jobs run one canonical renderer and tenant-scoped storage update',()=>{
    const service=readFileSync('src/lib/salesInvoiceService.js','utf8');
    expect(service).toContain('renderERPSalesInvoicePDF(doc, invoice');
    expect(service).toContain('openInvoicePrint(invoice, brandName, currency, options)');
    expect(service).toContain(".eq('restaurant_id', invoice.restaurant_id)");
    expect(service).toContain("if (uploadError) throw uploadError");
    expect(service).toContain("if (urlError) throw urlError");
    const archive=readFileSync('src/pages/SalesInvoices.jsx','utf8');
    const sales=readFileSync('src/pages/Sales.jsx','utf8');
    expect(archive).toContain('lang, dir, translateLiteral, branches');
    expect(sales).toContain('{ lang, dir, translateLiteral, branches }');
  });
  it('uses true source totals and an explicit reconciliation provenance disclaimer',()=>{
    const design=readFileSync('src/lib/erpSalesInvoicePdf.js','utf8');
    expect(design).toContain('model.cashDifference');
    expect(design).toContain('model.sourceStatus');
    expect(design).toContain("const sourceColor=accents");
    expect(design).toContain('expected cash unavailable');
    expect(design).not.toContain('1777');
    expect(design).not.toContain('3292');
  });
});
