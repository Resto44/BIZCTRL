import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Procurement Center phone typography and navigation', () => {
  const page = read('../src/pages/EnterprisePurchaseCommandCenter.jsx');
  const cards = read('../src/components/purchases/EnterpriseUIComponents.jsx');

  it('keeps all three tabs in a bounded grid with short mobile labels', () => {
    expect(page).toContain('data-testid="procurement-tabs"');
    expect(page).toContain('min-w-0 grid-cols-3 gap-1 overflow-hidden');
    expect(page).toContain("invoices: 'فاکتورها'");
    expect(page).toContain("invoices: 'الفواتير'");
    expect(page).toContain("invoices: 'Invoices'");
    expect(page).toContain('sm:hidden">{mobileTabs.analytics}');
    expect(page).toContain('sm:block">{t(\'procurement_analytics\')');
    expect(page).not.toContain('grid grid-cols-3 h-9');
    expect(page).toContain('aria-label={t(\'purchase_invoices\')');
  });

  it('fits long Arabic/Persian supplier and product names inside KPI cards', () => {
    expect(cards).toContain('isTextValue: true');
    expect(cards).toContain('title={isTextValue ? String(value) : undefined}');
    expect(cards).toContain('line-clamp-2');
    expect(cards).toContain('[overflow-wrap:anywhere]');
    expect(cards).not.toContain('text-2xl font-bold text-foreground leading-none tracking-tight truncate');
    expect(cards).toContain('text-[clamp(0.95rem,4.5vw,1.5rem)]');
    expect(cards).toContain('grid min-w-0 grid-cols-2 gap-2');
  });

  it('does not cover overview KPI cards and analytics with fixed bottom action controls', () => {
    expect(page).toContain("{activeTab === 'invoices' && (");
    expect(page).toContain('<StickyActionBar');
    expect(page).toContain('onClick={handleAddInvoice}');
    expect(page).toContain("navigate('/procurement-dashboard')");
    expect(page).toContain('overflow-x-clip');
    expect(page).toContain('h-24');
  });
});
