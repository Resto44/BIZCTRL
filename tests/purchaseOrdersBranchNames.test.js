import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { treasuryBranchDisplayName } from '../src/lib/treasuryBranchDisplay.js';

const branch = {
  id: '63a92c99-c4c8-4831-8e7f-33c8e0a6e653',
  branch_key: 'main-9a50614652',
  key: 'main-9a50614652',
  name: 'فرع الريان',
  label: 'فرع الريان',
  is_active: false, // Historical orders should retain the human-readable name.
};
const order = {
  branch_id: branch.id,
  branch: branch.branch_key,
  order_number: 'PO-749605',
  total_amount: 145,
};

describe('Purchase Orders branch display', () => {
  it('shows the real branch name from a tenant-scoped historic branch without modifying the purchase order', () => {
    const before = structuredClone(order);
    expect(treasuryBranchDisplayName(order, [branch], 'ar')).toBe('فرع الريان');
    expect(treasuryBranchDisplayName(order, [branch], 'fa')).toBe('فرع الريان');
    expect(treasuryBranchDisplayName(order, [branch], 'en')).toBe('فرع الريان');
    expect(order).toEqual(before);
  });

  it('resolves branch UUID first and falls back to a safe locale label for an unknown technical key', () => {
    expect(treasuryBranchDisplayName({ branch_id: branch.id, branch: 'outdated-main-code' }, [branch], 'en')).toBe('فرع الريان');
    expect(treasuryBranchDisplayName(order, [], 'fa')).toBe('فرع نامشخص');
    expect(treasuryBranchDisplayName(order, [], 'en')).toBe('Unknown branch');
  });

  it('applies the presentation helper in detail and list without writing a branch ID back to the database', () => {
    const detail = readFileSync(new URL('../src/components/purchase-orders/PurchaseOrderDetail.jsx', import.meta.url), 'utf8');
    const list = readFileSync(new URL('../src/pages/PurchaseOrders.jsx', import.meta.url), 'utf8');
    expect(detail).toContain('const { allBranches } = useTenant()');
    expect(detail).toContain('treasuryBranchDisplayName(order, allBranches, lang)');
    expect(detail).toContain('Branch: {branchName}');
    expect(detail).not.toContain('Branch: {order.branch}');
    expect(list).toContain('treasuryBranchDisplayName(order, allBranches, lang)');
    expect(list).not.toContain('{order.branch} ·');
  });
});
