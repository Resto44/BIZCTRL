import { describe, expect, it } from 'vitest';
import {
  buildRetailPosAuditRows,
  buildRetailPosPeriod,
  calculateRetailPosExecutive,
  deviceIsLive,
  groupDevicesByBranch,
  normalizeRetailPosSnapshot,
  terminalCashDifference,
} from './retailPosControl';

describe('retail POS control calculations', () => {
  it('keeps purchases and expenses out of sales and calculates net profit once', () => {
    expect(calculateRetailPosExecutive({ net_sales: 1000, purchase_total: 300, expense_total: 120, device_count: 10, online_device_count: 8 }))
      .toMatchObject({ sales: 1000, purchases: 300, expenses: 120, netProfit: 580, offlineDeviceCount: 2 });
  });

  it('normalizes an absent snapshot without inventing operational data', () => {
    const snapshot = normalizeRetailPosSnapshot(null);
    expect(snapshot.devices).toEqual([]);
    expect(snapshot.summary.net_sales).toBe(0);
  });

  it('uses a five minute heartbeat window', () => {
    const now = new Date('2026-09-04T12:05:00Z');
    expect(deviceIsLive({ status: 'online', last_seen_at: '2026-09-04T12:01:00Z' }, now)).toBe(true);
    expect(deviceIsLive({ status: 'online', last_seen_at: '2026-09-04T11:59:00Z' }, now)).toBe(false);
    expect(deviceIsLive({ status: 'offline', last_seen_at: '2026-09-04T12:04:59Z' }, now)).toBe(false);
  });

  it('groups and naturally sorts terminals per branch', () => {
    const groups = groupDevicesByBranch([
      { branch_id: 'b1', code: 'POS-10' },
      { branch_id: 'b1', code: 'POS-02' },
      { branch_id: 'b2', code: 'POS-01' },
    ]);
    expect(groups.get('b1').map((device) => device.code)).toEqual(['POS-02', 'POS-10']);
    expect(groups.get('b2')).toHaveLength(1);
  });

  it('calculates the terminal cash variance from the shift account', () => {
    expect(terminalCashDifference({ opening_cash: 500, cash_total: 1200, counted_cash: 1680 })).toBe(-20);
    expect(terminalCashDifference({ opening_cash: 500, cash_total: 1200, counted_cash: null })).toBeNull();
  });

  it('builds Riyadh-aligned daily, weekly and monthly periods', () => {
    const now = new Date('2026-09-04T22:30:00Z');
    expect(buildRetailPosPeriod('today', now).fromDate).toBe('2026-09-05');
    expect(buildRetailPosPeriod('month', now).fromDate).toBe('2026-09-01');
    expect(buildRetailPosPeriod('week', now).from).toContain('T00:00:00+03:00');
  });

  it('orders critical audit events ahead of approvals', () => {
    const rows = buildRetailPosAuditRows(
      [{ id: '1', severity: 'critical', event_type: 'cash_variance', title: 'Variance', occurred_at: '2026-09-04T10:00:00Z' }],
      [{ id: '2', status: 'pending', request_type: 'refund', reason: 'Refund', created_at: '2026-09-04T11:00:00Z' }],
    );
    expect(rows[0].source).toBe('event');
  });
});
