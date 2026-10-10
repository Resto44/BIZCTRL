// @vitest-environment jsdom
import {describe,expect,it,vi,afterEach} from 'vitest';
import {readFile} from 'node:fs/promises';
import {
  createBrandedPurchaseInvoicePDF,buildPurchaseInvoiceDocument,sharePurchaseInvoicePDF,
} from '../src/lib/purchaseInvoicePdf.js';
import {calcInvoiceTotals} from '../src/lib/procurementEngine.js';

const file=path=>readFile(new URL(path,import.meta.url),'utf8');
const demo={
 id:'0e87aa09-8c42-4c69-b1f3-7e63b0dabc02',
 invoice_number:'PUR-20261010-0042',
 date:'2026-10-10',supplier_name:'مستودع بن فاضل',
 branch:'rayyan',restaurant_id:'61f3c7a6-34e1-4802-9193-41f7b28756a2',
 currency:'SAR',approval_status:'auto_approved',status:'approved',
 paid_amount:289,
 items:[
  {product_name:'أرز بسمتي أبو كاس',unit:'كيس',quantity:10,unit_cost:220,tax:15,discount:0},
  {product_name:'دجاج مجمد',unit:'كرتون',quantity:20,unit_cost:135,tax:15,discount:0},
 ],
 notes:'تم توريد الأصناف',
};
const opts={business:{name:'مطاعم شمعة الريان',vat_number:'300000000000003'},
 branch:{name:'فرع الريان'},brand:{address:'تبوك'},currency:'SAR'};
afterEach(()=>vi.restoreAllMocks());
describe('Branded Purchase Invoice PDF and WhatsApp',()=>{
 it('uses canonical calculated line totals and persisted invoice payment amount',()=>{
  const totals=calcInvoiceTotals(demo.items);
  const m=buildPurchaseInvoiceDocument({...demo,total_amount:totals.grandTotal,
   subtotal:totals.subtotal,tax_amount:totals.taxAmount},opts);
  expect(totals.subtotal).toBe(5635);
  expect(totals.taxAmount).toBe(735);
  expect(m.beforeVAT).toBe(4900);
  expect(m.total).toBe(5635);
  expect(m.paid).toBe(289);
  expect(m.remaining).toBe(5346);
  expect(m.status).toBe('approved');
  expect(m.businessName).toBe('مطاعم شمعة الريان');
  expect(m.items).toHaveLength(2);
 });
 it('preserves draft and pending approval states without a fake approval stamp',()=>{
  expect(buildPurchaseInvoiceDocument({...demo,status:'draft',approval_status:'draft'}).status).toBe('draft');
  expect(buildPurchaseInvoiceDocument({...demo,status:'pending',approval_status:'pending'}).status).toBe('pending');
 });
 it('renders A4 PDF in AR, EN, FA with Arabic supplier and product names',()=>{
  for(const lang of ['en','ar','fa']){
   const {doc,filename,model}=createBrandedPurchaseInvoicePDF({...demo,
    total_amount:5635,subtotal:5635,tax_amount:735},{...opts,lang});
   expect(filename).toMatch(/\.pdf$/);
   expect(filename).toContain('PUR-20261010-0042');
   expect(doc.getNumberOfPages()).toBe(1);
   expect(model.remaining).toBe(5346);
   expect(doc.__erpPdfRTL).toBe(lang!=='en');
   expect(doc.getFontList().NotoNaskhArabic).toContain('normal');
   expect(Buffer.from(doc.output('arraybuffer')).subarray(0,8).toString()).toContain('%PDF-');
  }
 });
 it('paginates long invoices with no omitted line items',()=>{
  const items=Array.from({length:42},(_,i)=>({
    product_name:'Product '+i,quantity:1,unit_cost:5+i,tax:0,
  }));
  const {doc,model}=createBrandedPurchaseInvoicePDF({...demo,items,total_amount:null,subtotal:null,tax_amount:null},opts);
  expect(model.items).toHaveLength(42);
  expect(doc.getNumberOfPages()).toBeGreaterThan(2);
 });
 it('shows saved database totals rather than trusting edited line totals',()=>{
  const altered={...demo,total_amount:6000,subtotal:5635,tax_amount:735};
  const m=buildPurchaseInvoiceDocument(altered,opts);
  expect(m.total).toBe(6000);
  expect(m.difference).toBeGreaterThan(0);
 });
 it('has a WhatsApp file-share with fallback that never claims message sent',async()=>{
  const [pdf,purchases,list]=await Promise.all([
    file('../src/lib/purchaseInvoicePdf.js'),
    file('../src/pages/Purchases.jsx'),
    file('../src/components/purchases/PurchaseInvoiceList.jsx'),
  ]);
  expect(pdf).toContain('navigator.canShare?.({files:[file]})');
  expect(pdf).toContain('await navigator.share({files:[file]');
  expect(pdf).toContain('downloaded:true');
  expect(pdf).toContain('Attach it from Files');
  expect(purchases).toContain('onSharePDF={sharePDF}');
  expect(list).toContain('onDownloadPDF');
  expect(list).toContain('onSharePDF');
  expect(purchases).toContain('activeRestaurant?.id');
  expect(purchases).toContain('purchasePdfOptions(inv,evidence)');
  expect(purchases).toContain(".eq('invoice_id',inv.id)");
  expect(purchases).toContain(".eq('entity_id',inv.id)");
  expect(purchases).toContain(".eq('restaurant_id',activeRestaurant.id)");
  expect(sharePurchaseInvoicePDF).toBeTypeOf('function');
 });
});