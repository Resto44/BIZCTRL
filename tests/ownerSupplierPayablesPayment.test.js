import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  supplierOutstandingAmount, isOpenSupplierPayable, canPaySupplierInvoice,
} from '../src/lib/supplierOpenPayables.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const base = {
  id: 'inv-1', restaurant_id: 'r-1', supplier_id: 's-1', branch_id: 'b-1',
  approval_status: 'approved', status: 'partial', total_amount: 1000, paid_amount: 250,
};

describe('Owner and Supplier payables share the posted invoice ledger', () => {
  it('computes a full and partially-paid balance without netting other invoice credits', () => {
    expect(supplierOutstandingAmount(base)).toBe(750);
    expect(supplierOutstandingAmount({ ...base, id: 'inv-2', total_amount: 100, paid_amount: 120 })).toBe(0);
    expect(supplierOutstandingAmount({ ...base, total_amount: 100.29, paid_amount: 0.28 })).toBe(100.01);
  });
  it('excludes drafts, cancelled, rejected, already-paid and unapproved invoices', () => {
    for (const status of ['draft','paid','cancelled','canceled','rejected','void']) {
      expect(isOpenSupplierPayable({ ...base, status })).toBe(false);
    }
    expect(isOpenSupplierPayable({ ...base, approval_status: 'pending', status: 'unpaid' })).toBe(false);
    expect(isOpenSupplierPayable({ ...base, status: 'unpaid' })).toBe(true);
  });
  it('shows remaining amounts for reconciliation but blocks payments lacking branch or supplier', () => {
    expect(canPaySupplierInvoice(base)).toBe(true);
    expect(canPaySupplierInvoice({ ...base, branch_id: null })).toBe(false);
    expect(canPaySupplierInvoice({ ...base, supplier_id: null })).toBe(false);
    expect(canPaySupplierInvoice({ ...base, status: 'paid', paid_amount: 1000 })).toBe(false);
  });
  it('links Owner card to outstanding invoice list and reuses the atomic supplier RPC', () => {
    const dashboard = source('../src/components/dashboard/ExecutiveSnapshotV2.jsx');
    const purchases = source('../src/pages/Purchases.jsx');
    const supplier = source('../src/components/suppliers/SupplierDetail.jsx');
    const payment = source('../src/components/suppliers/SupplierWorkspacePayment.jsx');
    const rpc = source('../src/lib/supplierWorkspace.js');
    expect(dashboard).toContain("navigate('/purchases?payables=open')");
    expect(purchases).toContain("filterStatus === 'outstanding' ? isOpenSupplierPayable(inv)");
    expect(purchases).toContain('readAllPortalRows(baseQuery)');
    expect(purchases).toContain('onPayInvoice={can?.createPurchases');
    expect(supplier).toContain('data-testid="supplier-open-invoices"');
    expect(payment).toContain("mode === 'full'");
    expect(payment).toContain("mode === 'partial'");
    expect(payment).toContain('await postSupplierPayment(request)');
    expect(payment).toContain('sessionStorage.setItem(key, JSON.stringify(request))');
    expect(rpc).toContain("supabase.rpc('post_supplier_invoice_payment'");
  });
});
