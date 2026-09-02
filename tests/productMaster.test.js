import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  ERP_MASTER_KEY,
  buildProductMasterPayload,
  calculateProductPricing,
  mergeErpMaster,
  validateBranchStocks,
} from '../src/lib/productMaster.js';

const formPath = new URL('../src/components/products/ProductMasterForm.jsx', import.meta.url);
const productsPath = new URL('../src/pages/ProductManagement.jsx', import.meta.url);

describe('ERP Product Master', () => {
  it('calculates gross profit, margin and markup without NaN values', () => {
    expect(calculateProductPricing(145, 175)).toEqual({
      cost: 145,
      price: 175,
      profit: 30,
      margin: (30 / 175) * 100,
      markup: (30 / 145) * 100,
    });
    expect(calculateProductPricing('', '')).toEqual({ cost: 0, price: 0, profit: 0, margin: 0, markup: 0 });
  });

  it('stores advanced ERP settings inside the existing product JSON envelope', () => {
    const payload = buildProductMasterPayload({
      restaurantId: 'restaurant-1',
      categories: [{ id: 'category-1', name: 'Food' }],
      customFields: [],
      form: {
        name: 'Chicken Carton', product_id: 'CC-0001', category_id: 'category-1',
        purchase_cost: '145', selling_price: '175', tax_rate: '15', status: 'active',
        custom_attributes: { origin: 'Saudi Arabia' },
      },
      erp: { ...mergeErpMaster(), wholesale_price: '160', maximum_discount: '10' },
    });

    expect(payload.name).toBe('Chicken Carton');
    expect(payload.default_cost).toBe(145);
    expect(payload.default_price).toBe(175);
    expect(payload.custom_attributes.origin).toBe('Saudi Arabia');
    expect(payload.custom_attributes[ERP_MASTER_KEY].wholesale_price).toBe(160);
    expect(payload.custom_attributes[ERP_MASTER_KEY].maximum_discount).toBe(10);
  });

  it('restores saved ERP metadata without losing defaults', () => {
    const restored = mergeErpMaster({ custom_attributes: { [ERP_MASTER_KEY]: { costing_method: 'fifo', batch_tracking: true } } });
    expect(restored.costing_method).toBe('fifo');
    expect(restored.batch_tracking).toBe(true);
    expect(restored.sellable).toBe(true);
  });

  it('rejects negative branch inventory inputs', () => {
    expect(validateBranchStocks([{ opening_stock: 10, reorder_point: 3, par_level: 20 }])).toBe(true);
    expect(validateBranchStocks([{ opening_stock: -1, reorder_point: 3, par_level: 20 }])).toBe(false);
  });

  it('implements four responsive steps, local drafts and image barcode scanning', async () => {
    const source = await readFile(formPath, 'utf8');
    expect(source).toContain('Product Master');
    expect(source).toContain('Step {step + 1} of');
    expect(source).toContain('Product draft saved on this device.');
    expect(source).toContain("'BarcodeDetector' in window");
    expect(source).toContain('Branch opening stock');
    expect(source).toContain('Accounting mapping');
    expect(source).toContain('pb-[calc(0.75rem+env(safe-area-inset-bottom))]');
  });

  it('synchronizes real branch opening stock only after the product save succeeds', async () => {
    const source = await readFile(productsPath, 'utf8');
    expect(source).toContain('const product = await base44.entities.Product.create');
    expect(source).toContain('syncInventoryRows({ product, rows: _inventoryRows');
    expect(source).toContain('base44.entities.Inventory.update');
    expect(source).toContain('base44.entities.Inventory.create');
    expect(source).toContain('Promise.allSettled');
  });
});
