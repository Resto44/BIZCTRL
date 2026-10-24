import { describe, it, expect, vi } from 'vitest';
import { readTenantReportRows, visibleEmployeeAnnouncement } from '../src/lib/verifiedReportRead';
import { readAllPortalRows, supplierInvoiceTotals } from '../src/lib/portalReliability';

describe('verified portal report reads', () => {
  it('reads every page under one tenant with stable ordering', async () => {
    const calls = [];
    const rows = Array.from({ length: 501 }, (_, id) => ({ id }));
    const db = { from(table) {
      calls.push(['from', table]);
      const query = {
        select(value) { calls.push(['select', value]); return query; },
        eq(...args) { calls.push(['eq', ...args]); return query; },
        order(...args) { calls.push(['order', ...args]); return query; },
        range(from, to) { return Promise.resolve({ data: rows.slice(from, to + 1) }); },
      };
      return query;
    } };
    expect(await readTenantReportRows(db, 'expenses', 'tenant-a', 'date', false)).toHaveLength(501);
    expect(calls.filter(c => c[0] === 'eq')).toEqual([['eq', 'restaurant_id', 'tenant-a'], ['eq', 'restaurant_id', 'tenant-a']]);
    expect(calls.filter(c => c[0] === 'order')).toEqual([
      ['order', 'date', { ascending: false }], ['order', 'id', { ascending: true }],
      ['order', 'date', { ascending: false }], ['order', 'id', { ascending: true }],
    ]);
    expect(() => readTenantReportRows(db, 'expenses', null)).toThrow('scope');
  });
  it('rejects failures and malformed pages instead of returning zero financial totals', async () => {
    const range = vi.fn().mockResolvedValueOnce({ data: [1, 2] }).mockResolvedValueOnce({ error: new Error('offline') });
    await expect(readAllPortalRows(() => ({ range }), 2)).rejects.toThrow('offline');
    await expect(readAllPortalRows(() => ({ range: async () => ({ data: null }) }))).rejects.toThrow('Invalid portal');
    await expect(readAllPortalRows(() => ({}), 0)).rejects.toThrow('page size');
  });
  it('does not show inactive, expired, or manager-only announcements to employees', () => {
    const now = Date.parse('2026-10-24T12:00:00Z');
    const good = { is_active: true, target_role: 'employee', expires_at: '2026-10-25T12:00:00Z' };
    expect(visibleEmployeeAnnouncement(good, now)).toBe(true);
    for (const patch of [{ is_active: false }, { target_role: 'manager' }, { expires_at: '2026-10-24T12:00:00Z' }, { expires_at: 'invalid' }]) {
      expect(visibleEmployeeAnnouncement({ ...good, ...patch }, now)).toBe(false);
    }
    expect(visibleEmployeeAnnouncement({ is_active: true, target_role: 'all' }, now)).toBe(true);
  });
  it('excludes voided and deleted invoices from supplier liabilities', () => {
    expect(supplierInvoiceTotals([{ status: 'voided', total_amount: 500 }, { status: 'deleted', total_amount: 300 }, { status: 'approved', total_amount: 100, paid_amount: 20 }])).toEqual({ invoiced: 100, paid: 20, outstanding: 80 });
  });
});
