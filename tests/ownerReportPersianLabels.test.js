import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Persian ERP Owner Report Center mobile labels', () => {
  it('does not ellipsize KPI labels, values or detail captions', () => {
    const source = read('../src/components/dashboard/OwnerReportCenter.jsx');
    const metric = source.slice(source.indexOf('function MetricCard('), source.indexOf('function EmptyState('));
    expect(metric).toContain('data-testid="owner-metric-label"');
    expect(metric).toContain('data-testid="owner-metric-value"');
    expect(metric).toContain('whitespace-normal break-words');
    expect(metric).not.toContain('truncate');
    expect(metric).not.toContain('line-clamp');
  });

  it('gives every procurement/stock metric a full row on narrow phones', () => {
    const source = read('../src/components/dashboard/OwnerReportCenter.jsx');
    const section = source.slice(source.indexOf('function OperationsReport('), source.indexOf('function PriceControlReport('));
    expect((section.match(/mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3/g) || [])).toHaveLength(2);
    expect(section).toContain("text(copy, 'purchasedQty'");
    expect(section).toContain("text(copy, 'stockHealth'");
  });

  it('shows full Persian report links instead of truncation in two narrow columns', () => {
    const source = read('../src/components/dashboard/OwnerReportCenter.jsx');
    const reportLinks = source.slice(source.indexOf('function ReportLinks('), source.indexOf('function TrendChart('));
    expect(reportLinks).toContain('grid-cols-1 gap-2 min-[480px]:grid-cols-2');
    expect(reportLinks).toContain('data-testid="owner-report-link-label"');
    expect(reportLinks).toContain('whitespace-normal break-words');
    expect(reportLinks).not.toContain('truncate');
    // Data routes must remain unchanged despite presentation-only updates.
    expect(source).toContain("path: '/inventory-command-center'");
    expect(source).toContain("path: '/inventory'");
    expect(source).toContain("path: '/inventory-waste'");
  });

  it('wraps report titles and four main tabs without breaking RTL layout', () => {
    const source = read('../src/pages/OwnerDashboard.jsx');
    expect(source).toContain('dir={isRTL ? \'rtl\' : \'ltr\'}');
    expect(source).toContain('grid min-w-0 grid-cols-2 gap-1 sm:grid-cols-4');
    expect(source).toContain('whitespace-normal break-words text-center leading-5');
    expect(source).not.toContain('min-w-[38rem]');
  });
});
