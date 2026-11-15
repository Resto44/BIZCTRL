import { describe, it, expect, vi } from 'vitest';
import { buildInventoryForecast, forecastWindow, readForecastInventory } from '../src/lib/inventoryForecast';
const item = { id: 'i', product_id: 'rice', branch_id: 'b', unit: 'kg', quantity: '10', opening_stock: 999, date: '2026-11-15' };
const movement = { id: 'm', product_id: 'rice', branch_id: 'b', unit: 'kg', quantity: '60', transaction_type: 'recipe_consumption', created_date: '2026-11-15' };
const forecast = (inventory = [item], consumption = [movement]) => buildInventoryForecast({ inventory, consumption, today: '2026-11-15' });
describe('verified inventory forecast', () => {
  it('uses current quantity and actual consumption, never opening stock or purchases', () => {
    expect(forecast()[0]).toMatchObject({ currentStock: 10, avgDaily: 2, daysLeft: 5, needsReorder: true });
    expect(forecast([item], [{ ...movement, transaction_type: 'purchase' }])[0].daysLeft).toBeNull();
  });
  it('counts returns once and preserves numeric strings', () => {
    const rows = [movement, movement, { ...movement, id: 'return', quantity: '-30', transaction_type: 'consumption_return' }];
    expect(forecast([item], rows)[0]).toMatchObject({ avgDaily: 1, daysLeft: 10 });
  });
  it('does not mix branches or units', () => {
    expect(forecast([item], [{ ...movement, branch_id: 'other' }, { ...movement, id: 'box', unit: 'box' }])[0].daysLeft).toBeNull();
  });
  it('does not treat missing current stock or usage as zero days', () => {
    expect(forecast([{ ...item, quantity: null }])[0]).toMatchObject({ currentStock: null, daysLeft: null, needsReorder: false });
    expect(forecast([item], [])[0].avgDaily).toBeNull();
    expect(forecast([{ ...item, quantity: 0 }])[0].daysLeft).toBe(0);
  });
  it('uses an inclusive exact 30-day window and excludes future and older consumption', () => {
    expect(forecastWindow(30, '2026-11-15')).toEqual({ from: '2026-10-17', to: '2026-11-15' });
    expect(forecast([item], [{ ...movement, created_date: '2026-10-16' }, { ...movement, id: 'future', created_date: '2026-11-16' }])[0].daysLeft).toBeNull();
  });
  it('uses latest snapshot and canonical branch aliases', () => {
    const result = buildInventoryForecast({ inventory: [{ ...item, date: '2026-10-01', quantity: 999 }, item], consumption: [{ ...movement, branch_id: null, branch: 'branch-key' }], branches: [{ id: 'b', key: 'branch-key', name: 'Branch' }], today: '2026-11-15' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ branch: 'Branch', daysLeft: 5 });
  });
});

describe('forecast inventory transport', () => {
  const dbFor = result => { const q = { select: vi.fn(() => q), eq: vi.fn(() => q), order: vi.fn(() => q), limit: vi.fn(async () => result) }; return { from: vi.fn(() => q), q }; };
  it('throws the actual database error instead of returning empty data', async () => {
    const error = new Error('offline');
    await expect(readForecastInventory({ db: dbFor({error}), restaurantId:'tenant' })).rejects.toThrow('offline');
  });
  it('detects truncation even when the server caps fewer rows than the requested limit', async () => {
    await expect(readForecastInventory({ db: dbFor({data:[item],count:2}), restaurantId:'tenant' })).rejects.toThrow('INVENTORY_ROW_LIMIT');
  });
  it('enforces scope and permits a verified empty result', async () => {
    const db = dbFor({data:[],count:0});
    await expect(readForecastInventory({db,restaurantId:'tenant',branchId:'branch'})).resolves.toEqual([]);
    expect(db.q.eq.mock.calls).toEqual([['restaurant_id','tenant'],['branch_id','branch']]);
    await expect(readForecastInventory({db})).rejects.toThrow('scope');
  });
});
