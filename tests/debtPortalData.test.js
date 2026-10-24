import { describe, expect, it } from 'vitest';
import { readDebtPortalRows } from '../src/lib/debtPortalData';

function database(rows, failPage = false) {
  const calls = [];
  return { calls, from(table) {
    calls.push(['table', table]);
    const filters = [];
    const q = {
      select() { return q; },
      eq(key, value) { calls.push([key, value]); filters.push([key, value]); return q; },
      order() { return q; },
      async range(from, to) {
        if (failPage && from > 0) return { error: new Error('offline') };
        return { data: rows.filter(r => filters.every(([k, v]) => r[k] === v)).slice(from, to + 1) };
      },
    };
    return q;
  } };
}
describe('complete scoped debt ledger', () => {
  const rows = Array.from({ length: 501 }, (_, id) => ({ id, restaurant_id: 'r', branch_id: 'a', created_by: id % 2 ? 'cashier' : 'owner' }));
  it('includes other staff postings and all pages for the same restaurant', async () => {
    const db = database([...rows, { id: 999, restaurant_id: 'other', branch_id: 'a' }]);
    expect(await readDebtPortalRows(db, 'debt_records', 'r', null)).toHaveLength(501);
    expect(db.calls.some(([key]) => key === 'created_by')).toBe(false);
  });
  it('isolates staff to their assigned canonical branch', async () => {
    const db = database([...rows, { id: 999, restaurant_id: 'r', branch_id: 'b' }]);
    expect(await readDebtPortalRows(db, 'debt_payments', 'r', 'b', true)).toEqual([{ id: 999, restaurant_id: 'r', branch_id: 'b' }]);
    expect(() => readDebtPortalRows(db, 'debt_records', 'r', null, true)).toThrow('scope');
    expect(() => readDebtPortalRows(db, 'customers', 'r', 'a')).toThrow('scope');
  });
  it('rejects the complete ledger if a later page fails', async () => {
    await expect(readDebtPortalRows(database(rows, true), 'debt_records', 'r', null)).rejects.toThrow('offline');
  });
});
