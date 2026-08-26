// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  calcInvoiceTotals,
  calcLineTotal,
  computeInvoiceStatus,
  distributeAdditionalCosts,
  normalizePurchaseLine,
} from '../src/lib/procurementEngine.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const line = (overrides = {}) => ({
  product_id: 'product-1',
  product_name: 'Test product',
  quantity: 1,
  unit_cost: 0,
  discount: 0,
  tax: 0,
  ...overrides,
});

describe('canonical purchase calculation flow', () => {
  it('recalculates a line from quantity and unit cost even when stored line_total is stale', () => {
    const item = line({ quantity: 2, unit_cost: 125, line_total: 0 });

    expect(calcLineTotal(item)).toBe(250);
    expect(normalizePurchaseLine(item).line_total).toBe(250);
    expect(calcInvoiceTotals([item]).subtotal).toBe(250);
    expect(calcInvoiceTotals([item]).grandTotal).toBe(250);
  });

  it('recalculates multiple edited lines and removal from source values', () => {
    const first = line({ product_id: 'one', quantity: 2, unit_cost: 125, line_total: 0 });
    const second = line({ product_id: 'two', quantity: 3, unit_cost: 80, line_total: 999 });
    const third = line({ product_id: 'three', quantity: 1, unit_cost: 50 });

    expect(calcInvoiceTotals([first, second, third])).toMatchObject({ subtotal: 540, grandTotal: 540 });
    expect(calcInvoiceTotals([first, third])).toMatchObject({ subtotal: 300, grandTotal: 300 });
    expect(calcInvoiceTotals([{ ...first, quantity: 4 }])).toMatchObject({ subtotal: 500, grandTotal: 500 });
    expect(calcInvoiceTotals([{ ...first, unit_cost: 80 }])).toMatchObject({ subtotal: 160, grandTotal: 160 });
  });

  it('applies fixed discount before tax and includes additional costs exactly once', () => {
    const totals = calcInvoiceTotals(
      [line({ quantity: 2, unit_cost: 125, discount: 10, tax: 15 })],
      [{ type: 'delivery', amount: 50 }],
    );

    expect(totals).toMatchObject({
      subtotal: 276,
      discountAmount: 10,
      taxAmount: 36,
      additionalTotal: 50,
      grandTotal: 326,
    });
  });

  it('rounds decimal money consistently without binary-float artifacts', () => {
    const totals = calcInvoiceTotals([line({ quantity: 3, unit_cost: 83.333, tax: 0 })]);

    expect(totals.subtotal).toBe(250);
    expect(totals.grandTotal).toBe(250);
  });

  it('allocates additional costs to inventory lines while reconciling exactly to document costs', () => {
    const allocated = distributeAdditionalCosts(
      [line({ product_id: 'one', quantity: 2, unit_cost: 125 }), line({ product_id: 'two', quantity: 3, unit_cost: 80 })],
      [{ type: 'delivery', amount: 50 }],
    );

    expect(allocated.map((item) => item.allocated_additional_cost)).toEqual([25.51, 24.49]);
    expect(allocated.reduce((sum, item) => sum + item.allocated_additional_cost, 0)).toBe(50);
    expect(allocated[0].effective_unit_cost).toBe(137.76);
    expect(allocated[1].effective_unit_cost).toBe(88.16);
  });

  it('uses the canonical grand total for payment state', () => {
    const { grandTotal } = calcInvoiceTotals([line({ quantity: 2, unit_cost: 125 })], [{ type: 'delivery', amount: 50 }]);

    expect(grandTotal).toBe(300);
    expect(computeInvoiceStatus(grandTotal, 200)).toBe('partial');
    expect(computeInvoiceStatus(grandTotal, 300)).toBe('paid');
  });

  it('renders and saves form lines through the canonical calculator rather than stale line_total state', async () => {
    const form = await source('../src/components/purchases/PurchaseInvoiceForm.jsx');

    expect(form).toContain('normalizePurchaseLine(i)');
    expect(form).toContain('{calcLineTotal(item).toLocaleString');
    expect(form).toContain('return normalizePurchaseLine(updated);');
    expect(form).toContain('const cleanItems = items.map(({ _id, ...i }) => normalizePurchaseLine(i));');
  });

  it('enforces totals from JSON line data in the database before saving or paying an invoice', async () => {
    const migration = await source('../src/supabase/20260826_purchase_invoice_canonical_totals.sql');

    expect(migration).toContain('erp_recalculate_supplier_invoice_totals');
    expect(migration).toContain("NEW.total_amount := round(v_subtotal + v_additional_total, 2);");
    expect(migration).toContain("RAISE EXCEPTION 'PURCHASE_INVOICE_OVERPAYMENT'");
    expect(migration).toContain('BEFORE INSERT OR UPDATE OF items, additional_costs, subtotal, tax_amount, discount_amount, total_amount, paid_amount');
  });
});
