import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path,import.meta.url),'utf8');

describe('Owner dashboard business-first priority (mobile and desktop)',()=>{
  it('shows the canonical financial dashboard before POS monitoring and lower-priority driver analytics',async()=>{
    const source=await read('../src/pages/OwnerDashboard.jsx');
    const view=source.slice(source.indexOf('data-testid="owner-mega-dashboard"'));
    const mainReport=view.indexOf('<OwnerReportCenter activePage={activePage} model={model} copy={copy} />');
    const pos=view.indexOf('<OwnerUniversalPOS restaurant={activeRestaurant}');
    const drivers=view.indexOf('<OwnerDriverSalesCard');
    expect(mainReport).toBeGreaterThanOrEqual(0);
    expect(pos).toBeGreaterThan(mainReport);
    expect(drivers).toBeGreaterThan(pos);
    expect(view).toContain("role === 'owner' && activePage === 'executive'");
    expect(view).toContain("lang={lang} currency={currency}");
  });

  it('puts sales, purchases, net operating estimate and expenses in the first four KPI cards',async()=>{
    const source=await read('../src/components/dashboard/ExecutiveSnapshotV2.jsx');
    const firstRow=source.slice(source.indexOf('data-testid="snapshot-sales"'),source.indexOf('data-testid="executive-expense-breakdown"'));
    const keys=['data-testid="snapshot-sales"','testId="snapshot-purchases-primary"','testId="snapshot-profit"','testId="snapshot-expenses"'];
    const indexes=keys.map(key=>firstRow.indexOf(key));
    expect(indexes.every(index=>index>=0)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((a,b)=>a-b));
    expect(firstRow).toContain('money(periodMetrics.totalPurchaseCost)');
    expect(firstRow).toContain('money(periodMetrics.netProfit)');
    expect(firstRow).toContain('money(presentation.sales)');
    expect(source).toContain('data-testid="snapshot-sales-less-purchases"');
    expect(source).toContain('money(periodMetrics.grossProfit)');
    expect(source).toContain('Sales less purchases');
    expect(source).toContain('Purchase-basis estimate');
  });

  it('keeps financial tiles responsive and leaves actual accounting calculations unchanged',async()=>{
    const [snapshot, owner]=await Promise.all([
      read('../src/components/dashboard/ExecutiveSnapshotV2.jsx'),
      read('../src/pages/OwnerDashboard.jsx')
    ]);
    expect(snapshot).toContain('grid grid-cols-2 gap-2.5 lg:grid-cols-4');
    expect(snapshot).toContain('buildExecutiveSnapshotPresentation');
    expect(owner).toContain('calculateERPAccounting');
    expect(owner).toContain("filters: { closing_state: 'finalized' }");
  });
});
