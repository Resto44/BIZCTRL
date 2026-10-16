import { describe, it, expect, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import { readFileSync } from 'node:fs';
import { prepareLocalizedPdf } from '../src/lib/pdfLocalization';
import { drawTwoPageERPReport } from '../src/lib/twoPageERPReport';
import { generateSalesAnalyticsPDF } from '../src/lib/salesAnalyticsPdf';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const range = { from: '2026-10-01', to: '2026-10-15' };
const snapshot = {
  sales: 7953, cash: 1267, network: 4630, credit: 320, other: 1736,
  purchases: 7758.6, totalExpenses: 704, fixedDeduction: 600,
  variableExpenses: 104, averageDailySales: 530.2,
  grossProfit: 194.4, netProfit: -509.6, netMargin: -6.4, finalizedClosings: 14,
  breakdown: Array.from({ length: 15 }, (_, i) => ({
    date: '2026-10-' + String(i + 1).padStart(2, '0'),
    sales: 530.2, purchases: 517.24, fixed: 40, variable: 6.933,
    cash: 90, network: 309, credit: 21.33, other: 109.87, netProfit: -33.97,
  })),
};
const report = {
  branches: [{ name: 'فرع الريان', sales: 7953, purchases: 7758.6, expenses: 704, netProfit: -509.6, closings: 14 }],
  costGroups: [{ name: 'مصارف ثابت ومتغير', value: 704 }],
  hasInventoryData: false, hasConsumptionData: false, hasDebtData: false,
};

describe('Modern PDF font design is independent of SaaS CSS', () => {
  it('exports a newly versioned two-page report in English, Arabic and Persian', async () => {
    for (const lang of ['fa', 'ar', 'en']) {
      const doc = await generateSalesAnalyticsPDF({ snapshot, range,
        operationsReport: report, branchLabel: 'فرع الريان',
        businessName: 'مطاعم شمعة الريان', lang, download: false });
      expect(doc.getNumberOfPages()).toBe(2);
      expect(doc.__erpPdfTypographyVersion).toBe('2026-10-16-modern');
      expect(doc.__erpPdfRTL).toBe(lang !== 'en');
      expect(doc.getFontList().Vazirmatn).toContain('bold');
      expect(Buffer.from(doc.output('arraybuffer')).subarray(0, 5).toString()).toBe('%PDF-');
    }
  });

  it('draws actual section headings, KPI figures and text with two font weights', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    prepareLocalizedPdf(doc, { lang: 'fa' });
    const calls = [];
    const original = doc.text.bind(doc);
    vi.spyOn(doc, 'text').mockImplementation((value, x, y, options) => {
      calls.push({ value: String(value), size: doc.getFontSize(), style: doc.getFont().fontStyle });
      return original(value, x, y, options);
    });
    drawTwoPageERPReport(doc, { snapshot, report, range, lang: 'fa',
      branchLabel: 'فرع الريان', businessName: 'مطاعم شمعة الريان' });
    expect(doc.getNumberOfPages()).toBe(2);
    expect(calls.some(c => c.value === 'گزارش جامع فروشات')).toBe(true);
    expect(calls.some(c => c.value === '7,953 SAR' && c.size >= 12 && c.style === 'bold')).toBe(true);
    expect(calls.some(c => c.style === 'normal')).toBe(true);
    expect(calls.some(c => c.style === 'bold')).toBe(true);
    const body = calls.filter(c => c.size >= 7 && c.size <= 11);
    expect(body.length).toBeGreaterThan(20);
  });

  it('uses readable standardized PDF typography instead of 6pt headings and microscopic KPIs', () => {
    const pdf = read('../src/lib/completeSalesAnalyticsPdf.js');
    const brand = read('../src/lib/erpPdfBrand.js');
    const generator = read('../src/lib/salesAnalyticsPdf.js');
    expect(pdf).toContain('section: 10.5, kpiLabel: 8.8, kpiValue: 15');
    expect(pdf).toContain('const TYPO = Object.freeze');
    expect(pdf).toContain("bold:weight==='heading'||weight==='kpi'");
    expect(brand).toContain('bold:true,size:13.5');
    expect(generator).toContain('BizCTRL-ERP-Analytics-v2-');
    expect(generator).toContain('2026-10-16-modern');
  });
});