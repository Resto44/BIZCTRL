import { describe, expect, it } from 'vitest';
import { buildWastePayload, normalizeWasteRecord, describeWasteError } from './inventoryWaste.js';

const fixture = {
  restaurantId: 'restaurant-1',
  branch: { id: 'branch-1', key: 'rayyan' },
  product: { id: 'uuid-1', product_id: 'T51W0JN9', name: 'الدجاج اليوم', unit: 'piece' },
  form: { date: '2026-10-18', branch: 'rayyan', product_id: 'T51W0JN9', qty: '1', unit_cost: '15', reason: 'expired', notes: '' },
};

describe('waste schema and stock posting boundary', () => {
  it('creates tenant/branch scoped DB payload using quantity and total cost, not UI fields', () => {
    const data = buildWastePayload(fixture);
    expect(data).toMatchObject({ restaurant_id: 'restaurant-1', branch_id: 'branch-1', branch: 'rayyan', product_id: 'T51W0JN9', quantity: 1, cost: 15 });
    expect(data).not.toHaveProperty('qty');
    expect(data).not.toHaveProperty('unit_cost');
    expect(data).not.toHaveProperty('total_loss');
    expect(data).not.toHaveProperty('inventory_id'); // DB trigger links & deducts atomically
  });
  it('uses canonical UUID when a product has no legacy product_id', () => {
    expect(buildWastePayload({ ...fixture, product: { id: 'uuid-only', name: 'test' } }).product_id).toBe('uuid-only');
  });
  it.each([{ qty: '0' }, { qty: '-1' }, { qty: 'NaN' }, { qty: '' }])('rejects invalid quantity %j', overrides => {
    expect(() => buildWastePayload({ ...fixture, form: { ...fixture.form, ...overrides } })).toThrow(/Quantity/);
  });
  it('rejects negative costs, invalid branches, and unknown products before writing', () => {
    expect(() => buildWastePayload({ ...fixture, form: { ...fixture.form, unit_cost: '-2' } })).toThrow(/Unit cost/);
    expect(() => buildWastePayload({ ...fixture, branch: { key: 'rayyan' } })).toThrow(/branch/);
    expect(() => buildWastePayload({ ...fixture, product: null })).toThrow(/product/);
  });
  it('normalizes DB rows for existing report and stock-engine consumers', () => {
    expect(normalizeWasteRecord({ quantity: '2', cost: '30' })).toMatchObject({ qty: 2, total_loss: 30 });
  });
  it('shows actionable errors instead of silently failing', () => {
    expect(describeWasteError({ message: 'No stock record for this product in this branch' }, 'fa')).toContain('موجودی');
    expect(describeWasteError({ message: 'Insufficient stock for this waste quantity' }, 'en')).toContain('Not enough');
    expect(describeWasteError({ code: '42501' }, 'ar')).toContain('صلاحية');
  });
});
