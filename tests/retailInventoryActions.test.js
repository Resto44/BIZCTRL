import { describe, expect, it, vi } from 'vitest';
import { csvCell, documentActions, parseOrderItems, validateInventoryLines } from '@/lib/retailInventory';
vi.mock('@/api/supabaseClient', () => ({ supabase: { rpc: vi.fn() } }));
describe('Inventory workflow controls', () => {
  const manager = { edit: true, purchase: true, owner: false, userId: 'staff', branchId: 'north' };
  it('offers receipt only at the transfer destination while it is in transit', () => {
    const d = { kind: 'transfer', status: 'in_transit', branch_id: 'south', destination_branch_id: 'north' };
    expect(documentActions(d, manager)).toEqual(['receive']);
    expect(documentActions(d, { ...manager, branchId: 'south' })).toEqual([]);
    expect(documentActions({ ...d, status: 'received' }, manager)).toEqual([]);
  });
  it('keeps staff approval unavailable and allows only draft physical counts to be edited', () => {
    expect(documentActions({ kind: 'count', status: 'requested', branch_id: 'north', created_by: 'staff' }, manager)).toEqual(['cancel']);
    expect(documentActions({ kind: 'count', status: 'requested', branch_id: 'north' }, { ...manager, owner: true })).toEqual(['approve', 'reject', 'cancel']);
  });
  it('rejects empty, negative purchase and non-finite quantities while permitting reviewed negative adjustments', () => {
    const row = { product_id: 'milk', quantity: -1, unit_cost: 4 };
    expect(validateInventoryLines('receipt', [row])).toBeTruthy();
    expect(validateInventoryLines('adjustment', [row])).toBeNull();
    expect(validateInventoryLines('receipt', [{ ...row, quantity: Infinity }])).toBeTruthy();
    expect(validateInventoryLines('count', [])).toBeTruthy();
  });
  it('accepts both historic JSON strings and current JSONB arrays', () => {
    expect(parseOrderItems('[{"qty":3}]')).toEqual([{ qty: 3 }]);
    expect(parseOrderItems([{ qty: 4 }])).toEqual([{ qty: 4 }]);
    expect(parseOrderItems('invalid')).toEqual([]);
  });
  it('escapes formula-prefixed product names and comma/quote values in CSV exports', () => {
    expect(csvCell('=1+2')).toBe('"\'=1+2"');
    expect(csvCell('Milk, "fresh"')).toBe('"Milk, ""fresh"""');
  });
});
