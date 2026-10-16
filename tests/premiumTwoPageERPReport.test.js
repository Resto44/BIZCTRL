import { describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import { prepareLocalizedPdf } from '../src/lib/pdfLocalization';
import {
  drawTwoPageERPReport, aggregateReportTrend, aggregateConsumptionEvents, summarizeReportRows,
} from '../src/lib/twoPageERPReport';
import { buildOperationsPdfReport } from '../src/lib/operationsPdfReport';
import { buildSalesReportSnapshot } from '../src/lib/salesReportPeriod';
import { generateSalesAnalyticsPDF } from '../src/lib/salesAnalyticsPdf';

const days = Array.from({ length: 365 }, (_, i) => ({
  date: 'day-' + String(i).padStart(3, '0'), sales: 10 + i, purchases: 5 + i / 2,
  variable: 2, fixed: 3, closings: 1 + i % 3,
}));
const snapshot = {
  sales: 189560, cash: 68420, network: 92300, credit: 28840, other: 0,
  averageDailySales: 13540, purchases: 124850, totalExpenses: 92300,
  fixedDeduction: 41500, variableExpenses: 50800, netProfit: -27590,
  finalizedClosings: 14, breakdown: days,
};
const operations = {
  branches: Array.from({ length: 14 }, (_, i) => ({
    name: 'فرع تجريبي للإدارة ' + i, sales: i * 1234,
    purchases: i * 753, expenses: i * 192,
  })),
  costGroups: Array.from({ length: 19 }, (_, i) => ({
    name: 'مصروفات الفئة ' + i, value: i * 200,
  })),
  hasConsumptionData: true,
  consumption: [
    { name: 'برنج باسماتی', quantity: 135, unit: 'kg', costAvailable: true, estimatedCost: 675 },
    { name: 'زيت', quantity: 40, unit: 'litre', costAvailable: false },
  ],
  consumptionTrend: [
    { date: '2026-10-01', events: 4, valuedCost: 40, unvalued: 0 },
    { date: '2026-10-02', events: 7, valuedCost: 0, unvalued: 2 },
  ],
  hasWasteData: true, wasteCostComplete: false, wasteCost: 0,
};
describe('Premium two-page vector ERP analytics PDF', () => {
  it('conserves all sales/purchases/expenses and verified count trends across 365 days', () => {
    const trend = aggregateReportTrend(days, 16);
    expect(trend.length).toBeLessThanOrEqual(16);
    for (const key of ['sales', 'purchases', 'closings'])
      expect(trend.reduce((n, row) => n + row[key], 0)).toBeCloseTo(
        days.reduce((n, row) => n + row[key], 0), 5);
    expect(trend.reduce((n, row) => n + row.expenses, 0)).toBe(
      days.reduce((n, row) => n + row.fixed + row.variable, 0));
    expect(summarizeReportRows(Array.from({ length: 20 }, (_, i) => ({
      name: 'Branch ' + i, value: 1,
    })), 4, 'Other').reduce((n, r) => n + r.value, 0)).toBe(20);
  });
  it('counts true inventory consumption movements without adding kg, litres or waste as sales', () => {
    const movements = [
      { id: 'a', created_date: '2026-10-02T10:00:00+00:00',
        transaction_type: 'recipe_consumption', product_id: 'rice', quantity: -3, unit_cost: 6 },
      { id: 'b', created_date: '2026-10-02T12:00:00+00:00',
        transaction_type: 'usage', product_id: 'oil', quantity: -2, unit_cost: null },
      { id: 'c', created_date: '2026-10-02T13:00:00+00:00',
        transaction_type: 'waste', product_id: 'rice', quantity: -1, unit_cost: 6 },
      { id: 'd', created_date: '2026-10-03T10:00:00+00:00',
        transaction_type: 'stock_in', product_id: 'rice', quantity: 5, unit_cost: 6 },
    ];
    const report = buildOperationsPdfReport({
      branches: [], inventory: [{ id: 'rice', name: 'Rice', unit: 'kg' },
        { id: 'oil', name: 'Oil', unit: 'litre' }],
      inventoryTransactions: movements, range: { from: '2026-10-01', to: '2026-10-14' },
    });
    expect(report.consumptionEventCount).toBe(2);
    expect(report.consumptionTrend).toHaveLength(1);
    expect(report.consumptionTrend[0]).toMatchObject({ events: 2, valuedCost: 18, unvalued: 1 });
    expect(report.wasteCost).toBe(6);
    expect(report.consumption).toHaveLength(2);
    expect(aggregateConsumptionEvents(report.consumptionTrend)
      .reduce((n, r) => n + r.events, 0)).toBe(2);
  });
  it.each(['fa', 'ar', 'en'])('renders exactly 2 A4 pages in %s using real PDF text and vector charts', lang => {
    const doc = new jsPDF({ format: 'a4', unit: 'mm' });
    prepareLocalizedPdf(doc, { lang, dir: lang === 'en' ? 'ltr' : 'rtl' });
    const calls = [];
    const original = doc.text.bind(doc);
    vi.spyOn(doc, 'text').mockImplementation((v, x, y, options = {}) => {
      // Text weight and font size now vary by semantic role. Measure the width
      // at draw time with the actual active font; the last PDF font differs.
      const value = String(v);
      const measured = doc.getTextWidth(doc.processArabic(value));
      calls.push({ value, x, y, options, measured });
      return original(v, x, y, options);
    });
    drawTwoPageERPReport(doc, {
      snapshot, previousSnapshot: { ...snapshot, breakdown: [...days].reverse() },
      growth: 12.5, report: operations,
      range: { from: '2026-10-01', to: '2026-10-14' },
      branchLabel: 'فرع الريان طويل الاسم لتجربة التقرير',
      businessName: 'مطاعم الريان',
      currency: 'SAR', lang,
    });
    expect(doc.getNumberOfPages()).toBe(2);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
    expect(calls.length).toBeGreaterThan(60);
    for (const { value, x, y, options, measured } of calls) {
      const left = options.align === 'right' ? x - measured
        : options.align === 'center' ? x - measured / 2 : x;
      expect(left, value).toBeGreaterThanOrEqual(6.8);
      expect(left + measured, value).toBeLessThanOrEqual(203.2);
      expect(y, value).toBeGreaterThanOrEqual(4);
      expect(y, value).toBeLessThan(294);
    }
    expect(calls.map(x => x.value)).toContain('1 / 2');
    expect(calls.map(x => x.value)).toContain('2 / 2');
    expect(calls.some(x => x.value.includes('برنج باسماتی'))).toBe(true);
    const content = doc.output('arraybuffer');
    expect(content.byteLength).toBeGreaterThan(50000);
  });
  it('keeps PDF export shared by Reports and Scheduled Reports', () => {
    const generate = generateSalesAnalyticsPDF.toString();
    expect(generate).toContain('drawTwoPageERPReport');
    // Both routes import the same public generator; no 13-page fallback.
    expect(buildSalesReportSnapshot).toBeTypeOf('function');
  });
});
