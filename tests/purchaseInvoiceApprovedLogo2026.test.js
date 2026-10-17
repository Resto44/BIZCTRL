// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { APPROVED_BIZCTRL_PNG_BASE64 } from '../scripts/approvedBizCTRLSource.mjs';
import { createBrandedPurchaseInvoicePDF } from '../src/lib/purchaseInvoicePdf.js';

const example = {
  id: 'e5a32428-27d2-4d9f-a8cd-cb0247a1c15f',
  invoice_number: 'PUR-20261016-0001',
  supplier_name: 'مستودع بن فاضل',
  branch: 'main-9a50614652',
  date: '2026-10-16',
  approval_status: 'auto_approved',
  status: 'paid',
  subtotal: 1445,
  tax_amount: 0,
  total_amount: 1445,
  paid_amount: 1445,
  items: [{ product_name: 'الرز البشاور', unit: 'شوال', quantity: 5, unit_cost: 289, discount: 0, tax: 0 }],
};
const options = {
  business: { name: 'مطاعم شمعة الريان', address: 'تبوك المملكة العربية السعودية' },
  branch: { name: 'فرع الريان' },
  currency: 'SAR',
};

describe('Approved glossy BizCTRL icon in Purchase Invoice PDFs', () => {
  it('reuses the exact previously approved 96×96 logo source from the application', () => {
    const png = Buffer.from(APPROVED_BIZCTRL_PNG_BASE64, 'base64');
    expect(png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))).toBe(true);
    expect(png.readUInt32BE(16)).toBe(96);
    expect(png.readUInt32BE(20)).toBe(96);
  });

  it('embeds real glossy raster logo in header and footer, not only the vector placeholder', () => {
    const { doc, filename, model } = createBrandedPurchaseInvoicePDF(example, { ...options, lang: 'fa' });
    const images = Object.values(doc.internal.collections.addImage_images || {});
    expect(images.length).toBeGreaterThan(0);
    expect(images.some(image => image.width === 96 && image.height === 96)).toBe(true);
    expect(doc.getNumberOfPages()).toBe(1);
    expect(filename).toContain('ERP-v3');
    expect(model.total).toBe(1445);
    expect(model.vat).toBe(0);
  });

  it('includes the approved icon on every continued page and preserves all purchased items', () => {
    const many = { ...example, items: Array.from({length: 25}, (_, i) => ({
      product_name: 'محصول نمونه '+i, unit:'کرتون', quantity:1,unit_cost:20,discount:0,tax:0,
    })),total_amount:null,subtotal:null,paid_amount:0 };
    const { doc, model } = createBrandedPurchaseInvoicePDF(many,{ ...options, lang:'ar' });
    expect(model.items).toHaveLength(25);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const images = Object.values(doc.internal.collections.addImage_images || {});
    expect(images.some(image => image.width === 96 && image.height === 96)).toBe(true);
    const layout = readFileSync('src/lib/purchaseInvoiceReferenceLayout.js', 'utf8');
    expect(layout).toContain('drawApprovedBizCTRLIcon(doc,15,14,14)');
    expect(layout).toContain('drawApprovedBizCTRLIcon(doc,11,279.2,10)');
    expect(layout).toContain('doc.addPage();finishHeader(true)');
  });

  it('shares the same rendered PDF through download and share; financial operations remain read-only', () => {
    const service = readFileSync('src/lib/purchaseInvoicePdf.js', 'utf8');
    expect(service).toContain('renderPurchaseInvoiceReference(doc,invoice,m,');
    expect(service).toContain('createBrandedPurchaseInvoicePDF(invoice,options)');
    expect(service).toContain("'BizCTRL-Purchase-ERP-v3-'");
    expect(service).not.toContain(".insert({");
  });
});
