import { describe, it, expect } from 'vitest';
import { retailInventoryMovementSummary, nextRiyadhDay } from '../src/lib/retailInventoryTrends';
describe('commerce portal inventory trend summaries', () => {
  it('provides 6 business periods and groups signed journal movements by Riyadh dates', () => {
    const rows = [
      { created_at: '2026-11-05T22:30:00Z', quantity: '12', kind: 'receipt' },
      { created_at: '2026-11-06T12:00:00Z', quantity: '-2', kind: 'sale' },
      { created_at: '2026-11-04T12:00:00Z', quantity: '-4', kind: 'sale' },
      { created_at: '2026-09-01T12:00:00Z', quantity: '15', kind: 'receipt' },
    ];
    const day = retailInventoryMovementSummary(rows, 'day', '2026-11-06');
    expect(day.total).toBe(2);
    expect(day.inbound).toBe(1);
    expect(day.outbound).toBe(1);
    expect(day.series).toHaveLength(1);
    const week = retailInventoryMovementSummary(rows, 'week', '2026-11-06');
    expect(week.total).toBe(3);
    expect(week.kinds).toEqual([{ name: 'sale', value: 2 }, { name: 'receipt', value: 1 }]);
    expect(retailInventoryMovementSummary(rows, 'quarter', '2026-11-06').total).toBe(4);
    expect(['day','week','month','quarter','half','year'].map(p =>
      retailInventoryMovementSummary(rows, p, '2026-11-06').window.days)).toEqual([1,7,30,90,180,365]);
    expect(nextRiyadhDay('2026-12-31')).toBe('2027-01-01');
  });
});
