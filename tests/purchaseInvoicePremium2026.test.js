// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  createBrandedPurchaseInvoicePDF,buildPurchaseInvoiceDocument,
} from '../src/lib/purchaseInvoicePdf.js';

const sample={
  id:'e5a32428-27d2-4d9f-a8cd-cb0247a1c15f',
  invoice_number:'PUR-20261016-0001',
  supplier_name:'مستودع بن فاضل',
  branch:'main-9a50614652',
  date:'2026-10-16',
  approval_status:'auto_approved',
  status:'paid',paid_amount:1445,subtotal:1445,tax_amount:0,total_amount:1445,
  items:[{product_name:'الرز البشاور دجاج اليوم',unit:'شوال',quantity:5,
    unit_cost:289,discount:0,tax:0}],
};
const opts={
  business:{name:'مطاعم شمعة الريان',vat_number:'300000000000003',
    address:'تبوك المملكة العربية السعودية'},
  brand:{brand_name:'مطاعم شمعة الريان',address:'تبوك حي الريان'},
  branch:{name:'فرع الريان'},currency:'SAR',
};
describe('Premium BizCTRL Purchase Invoice 2026 ERP reflow',()=>{
  it('retains screenshot invoice zero VAT and saved payment amount without inventing tax',()=>{
    const model=buildPurchaseInvoiceDocument(sample,opts);
    expect(model.items).toHaveLength(1);
    expect(model.beforeVAT).toBe(1445);
    expect(model.vat).toBe(0);
    expect(model.total).toBe(1445);
    expect(model.paid).toBe(1445);
    expect(model.remaining).toBe(0);
    expect(model.branch).toBe('فرع الريان');
    for(const lang of ['en','ar','fa']){
      const {doc,filename}=createBrandedPurchaseInvoicePDF(sample,{...opts,lang});
      expect(doc.getNumberOfPages()).toBe(1);
      expect(doc.internal.pageSize.getWidth()).toBeLessThan(doc.internal.pageSize.getHeight());
      expect(filename).toContain('ERP-v2');
      expect(doc.getFontList().Vazirmatn).toContain('bold');
    }
  });
  it('shows six line items and summary on one page, and paginates all 28',()=>{
    const items=Array.from({length:6},(_,i)=>({
      product_name:'دجاج اليوم طازج ',unit:'كرتون',quantity:i+1,
      unit_cost:20,discount:0,tax:0,
    }));
    const six=createBrandedPurchaseInvoicePDF({
      ...sample,items,total_amount:null,subtotal:null,tax_amount:null,paid_amount:0,
    },{...opts,lang:'fa'});
    expect(six.model.items).toHaveLength(6);
    expect(six.doc.getNumberOfPages()).toBe(1);
    const more=createBrandedPurchaseInvoicePDF({
      ...sample,items:Array.from({length:28},(_,i)=>({...items[0],product_name:'منتج رقم '+i})),
      total_amount:null,subtotal:null,tax_amount:null,paid_amount:0,
    },opts);
    expect(more.model.items).toHaveLength(28);
    expect(more.doc.getNumberOfPages()).toBeGreaterThan(2);
  });
  it('uses separated columns with readable font and no mid-page blank reserved for summary',()=>{
    const code=readFileSync('src/lib/purchaseInvoiceReferenceLayout.js','utf8');
    expect(code).toContain('summary(y);');
    expect(code).toContain('const summaryY=y+4;');
    expect(code).not.toContain('Math.max(183,y+3)');
    expect(code).toContain('size:9.2,bold:j===0');
    expect(code).toContain('const itemHeight=item=>13.4');
    expect(code).toContain('size:i===3?10.8:9.2');
    expect(code).toContain("fit:Boolean(maxWidth)");
    expect(code).toContain("const payload='BizCTRL invoice reference: '+invoiceNumber;");
    expect(code).toContain('Internal reference QR only');
  });
  it('does not create approval or payment records when downloading or sharing',()=>{
    const source=readFileSync('src/lib/purchaseInvoicePdf.js','utf8');
    expect(source).toContain('createBrandedPurchaseInvoicePDF');
    expect(source).toContain('sharePurchaseInvoicePDF');
    expect(source).toContain('downloadPurchaseInvoicePDF');
    expect(source).not.toContain("supabase.from('supplier_payments').insert");
  });
});