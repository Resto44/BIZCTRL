import { describe, expect, it } from 'vitest';
import { buildProductControlSnapshot, productTracksInventory } from '../src/lib/productControlCenter.js';

const stockProduct = {
  id: 'product-1',
  product_id: 'SKU-1',
  sku: 'SKU-1',
  name: 'Chicken Carton',
  purchase_cost: 100,
  selling_price: 120,
  min_stock: 10,
  status: 'active',
  custom_attributes: { __erp_master: { product_type: 'stock', track_inventory: true } },
};

describe('Master Product Control Center', () => {
  it('uses the inventory ledger for branch-scoped quantity and value', () => {
    const snapshot = buildProductControlSnapshot({
      products: [stockProduct],
      inventory: [{ product_id: 'SKU-1', branch_id: 'branch-1', opening_stock: 8, low_stock_threshold: 10 }],
      branches: [{ id: 'branch-1', name: 'Main Branch' }],
    });

    expect(snapshot.productRows[0]).toMatchObject({ quantity: 8, value: 800, stockStatus: 'low' });
    expect(snapshot.lowStock).toBe(1);
    expect(snapshot.inventoryValue).toBe(800);
    expect(snapshot.replenishmentQueue).toHaveLength(1);
  });

  it('does not report services as out of stock', () => {
    const service = {
      id: 'service-1', name: 'AC Maintenance', purchase_cost: 50, selling_price: 200,
      custom_attributes: { __erp_master: { product_type: 'service', track_inventory: false } },
    };
    const snapshot = buildProductControlSnapshot({ products: [service] });

    expect(productTracksInventory(service)).toBe(false);
    expect(snapshot.productRows[0].stockStatus).toBe('untracked');
    expect(snapshot.outOfStock).toBe(0);
    expect(snapshot.stockAccuracy).toBe(100);
  });

  it('detects duplicate SKUs and minimum-margin pricing exceptions', () => {
    const snapshot = buildProductControlSnapshot({
      products: [stockProduct, { ...stockProduct, id: 'product-2', product_id: 'SKU-2' }],
      priceRules: { minimum_margin: 25 },
    });

    expect(snapshot.duplicateSkus).toBe(1);
    expect(snapshot.priceApprovalQueue).toHaveLength(2);
    expect(snapshot.priceControlStatus.review).toBe(2);
  });
});
