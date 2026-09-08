// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { barcodeSvg, labelPrintHtml } from '@/lib/barcodeLabels';

beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText: (text) => ({ width: text.length * 8 }) }); });
afterEach(() => vi.restoreAllMocks());

describe('product barcode labels', () => {
  it('renders the exact stored value, including leading zeros, without a SKU fallback', () => {
    expect(barcodeSvg('000742')).toContain('000742');
    expect(barcodeSvg('BC-000000000017')).toContain('BC-000000000017');
    expect(() => labelPrintHtml({ product: { sku: 'SKU-42' } })).toThrow();
  });
  it('escapes names and price, keeps Arabic, and prints the requested physical label count', () => {
    const html = labelPrintHtml({ product: { name_ar: 'حليب طازج', name_en: '<script>alert("name")</script>', barcode: 'BC-000000000017' }, price: '<img onerror=alert(1)>', copies: 3, size: '50x30' });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelectorAll('.label')).toHaveLength(3);
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(doc.querySelectorAll('[onerror]')).toHaveLength(0);
    expect(doc.body.textContent).toContain('حليب طازج');
    expect(doc.body.textContent).toContain('<script>alert("name")</script>');
    expect(html).toContain('@page{size:50mm 30mm;margin:0}');
    expect(html).not.toContain('window.close');
  });
  it.each([0, -1, 101, 1.5, NaN, Infinity])('rejects invalid copy count %s', (copies) => {
    expect(() => labelPrintHtml({ product: { barcode: '1234' }, copies })).toThrow('Invalid label settings');
  });
  it('rejects unknown paper sizes and unencodable values', () => {
    expect(() => labelPrintHtml({ product: { barcode: '1234' }, size: '400x400' })).toThrow();
    expect(() => barcodeSvg('بارکد')).toThrow();
    expect(() => barcodeSvg('x'.repeat(129))).toThrow();
  });
});
