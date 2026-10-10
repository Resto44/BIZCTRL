// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createBrandedPurchaseInvoicePDF} from '../src/lib/purchaseInvoicePdf.js';
import {invoiceApprovalSteps,invoicePaymentLabel} from '../src/lib/purchaseInvoiceReferenceLayout.js';
const file=path=>readFile(new URL(path,import.meta.url),'utf8');
const lines=[
 ['أرز بسمتي أبو كاس 40 كجم','كيس',10,220],
 ['دجاج مجمد ساديا 10 × 1 كجم','كرتون',20,135],
 ['زيت طبخ نخيل','عبوة',15,65],
 ['بهارات مشكلة','كيلو',8,48],
 ['مواد تغليف','كرتون',12,75],
 ['منتجات ألبان حليب طويل الأجل','كرتون',10,92],
];
const invoice={
 id:'bbf20cc0-3d0a-44f7-b4ed-efc91293da4b',
 invoice_number:'PUR-20261009-0005',date:'2026-10-09',
 supplier_name:'مستودع بن فاضل',branch:'rayyan',approval_status:'auto_approved',status:'approved',
 created_date:'2026-10-09T10:15:00Z',created_by:'creator@example.test',
 items:lines.map(([product_name,unit,quantity,unit_cost])=>({product_name,unit,quantity,unit_cost,tax:15,discount:0})),
 paid_amount:2000,notes:'تم توريد الأصناف حسب الطلبية المعتمدة',
};
const opts={business:{name:'مطاعم شمعة الريان',vat_number:'310987654300003'},
 brand:{brand_name:'مطاعم شمعة الريان',address:'تبوك حي الريان'},
 branch:{name:'فرع الريان'},currency:'SAR'};
describe('Reference ERP Purchase PDF visual and accounting invariants',()=>{
 it('places SIX saved line items and branded summary in one A4 page for each language',()=>{
  for (const lang of ['en','ar','fa']){
   const {doc,model}=createBrandedPurchaseInvoicePDF(invoice,{...opts,lang});
   expect(doc.getNumberOfPages()).toBe(1);
   expect(model.items).toHaveLength(6);
   expect(model.total).toBe(9290.85);
   expect(model.beforeVAT).toBe(8079);
   expect(model.vat).toBe(1211.85);
   expect(model.paid).toBe(2000);
   expect(doc.getFontList().NotoNaskhArabic).toContain('normal');
  }
 });
 it('renders approval history ONLY from real events, not fake Reviewed stamp or people',()=>{
  expect(invoiceApprovalSteps(invoice)).toEqual([
   {type:'created',date:invoice.created_date,who:invoice.created_by},
   {type:'auto',date:null,who:null},
  ]);
  const draft=invoiceApprovalSteps({...invoice,approval_status:'draft',status:'draft',created_date:null});
  expect(draft).toEqual([]);
  const reviewed=invoiceApprovalSteps(invoice,[{action:'reviewed',created_date:'2026-10-09T11:20:00Z',user_name:'Reviewer'},
   {action:'approved',created_date:'2026-10-09T12:05:00Z',user_name:'Manager'}]);
  expect(reviewed).toHaveLength(3);
  expect(reviewed[1]).toMatchObject({type:'reviewed',who:'Reviewer'});
  expect(reviewed[2]).toMatchObject({type:'auto',date:'2026-10-09T12:05:00Z'});
 });
 it('selects saved payment method or linked supplier payments; never guesses a wallet',()=>{
  expect(invoicePaymentLabel(invoice,[],'ar')).toBe('غير مسجل');
  expect(invoicePaymentLabel(invoice,[{payment_method:'wallet'}],'en')).toBe('wallet');
  expect(invoicePaymentLabel(invoice,[{payment_method:'cash'},{payment_method:'network'}],'en')).toBe('Multiple payment methods');
 });
 it('QR encodes only invoice reference, NOT a fake government tax verification',async()=>{
  const source=await file('../src/lib/purchaseInvoiceReferenceLayout.js');
  expect(source).toContain("BizCTRL invoice reference: ");
  expect(source).not.toContain('ZATCA');
  expect(source).toContain("invoicePaymentLabel");
 });
 it('does not drop a long list of products',()=>{
  const bigger={...invoice,items:Array.from({length:28},(_,i)=>({
   product_name:'منتج رقم '+(i+1),unit:'كرتون',quantity:1,unit_cost:5,tax:15,
  }))};
  const {doc,model}=createBrandedPurchaseInvoicePDF(bigger,opts);
  expect(model.items).toHaveLength(28);
  expect(doc.getNumberOfPages()).toBeGreaterThan(2);
 });
});
