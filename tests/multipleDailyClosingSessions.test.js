import { describe, expect, it } from 'vitest';
import { calculateERPAccounting } from '../src/lib/helpers.js';
import { loadClosingCashContext } from '../src/lib/closing/ClosingCashContext.js';

describe('independent daily closing sessions', () => {
  it('adds ten finalized sessions on the same date without merging their history', () => {
    const sales = Array.from({ length: 10 }, (_, i) => ({ id: `closing-${i}`, date: '2026-10-26', closing_state: 'finalized', restaurant_cash: (i + 1) * 10, restaurant_network: 0, credit: 0, custom_sources_total: 0 }));
    const result = calculateERPAccounting({ sales, purchases: [], periodExpenses: [], monthlyExpenses: [], rangeType: 'day', daysInPeriod: 1, asOfDate: '2026-10-26' });
    expect(result.totalSales).toBe(550);
    expect(new Set(sales.map(row => row.id)).size).toBe(10);
  });

  it('resolves only an unfinished draft, never the previous finalized closing', async () => {
    const filters = [];
    const query = { select() { return this; }, eq() { return this; }, in(column, values) { filters.push([column, values]); return this; }, then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); } };
    const client = { from: () => query, rpc: async (_name, params) => ({ data: { opening_cash: 40, id: params.p_closing_id }, error: null }) };
    const result = await loadClosingCashContext(client, { p_shift: 'Morning', p_closing_id: null });
    expect(filters).toEqual([['closing_state', ['draft', 'ready']]]);
    expect(result.resolved_closing_id).toBeNull();
    expect(result.opening_cash).toBe(40);
  });
});
