import { describe, expect, it } from 'vitest';
import {
  CANONICAL_KPI_DEFAULT_ENABLED,
  assessCanonicalRelease,
  reconcileCanonicalShadow,
  validateShadowScope,
} from '../src/lib/erpCanonicalShadowReconciliation.js';
import { readCanonicalShadowEvidence } from '../src/lib/erpShadowReadOnlyReader.js';

const scope = Object.freeze({
  restaurantId: 'tenant-1', branchId: 'branch-a', authorizedBranchIds: ['branch-a'],
  from: '2026-10-23', to: '2026-10-23', shift: 'morning', cashierId: 'cashier-1',
});
const closing = (overrides = {}) => ({
  id: 'sale-1', restaurant_id: 'tenant-1', branch_id: 'branch-a',
  date: '2026-10-23', shift: 'morning', cashier_id: 'cashier-1',
  closing_state: 'finalized', restaurant_cash: 100, restaurant_network: 50,
  credit: 20, custom_sources_total: 5,
  sales_sources_json: [{ source_id: 'delivery', amount: 100 }],
  ...overrides,
});
const purchase = (overrides = {}) => ({
  id: 'buy-1', restaurant_id: 'tenant-1', branch_id: 'branch-a',
  date: '2026-10-23', approval_status: 'approved', status: 'partial',
  total_amount: 90, ...overrides,
});
const complete = {
  daily_sales: true, salesPostingCertified: true, refundsCertified: true,
  supplier_invoices: true, inventory_transactions: true, expenses: true,
  payroll_runs: true, cash_movements: true, debt_records: true, wallet_transactions: true,
};
const run = (opts = {}) => reconcileCanonicalShadow({
  scope, sources: { daily_sales: [closing()], supplier_invoices: [purchase()], ...opts.sources },
  completeness: { ...complete, ...opts.completeness }, legacy: opts.legacy || {},
});

describe('Issue #183 read-only shadow source of truth', () => {
  it('keeps canonical feature flag disabled and never asserts publication readiness', () => {
    expect(CANONICAL_KPI_DEFAULT_ENABLED).toBe(false);
    const result = run();
    expect(result.readOnly).toBe(true);
    expect(result.releaseFlagEnabled).toBe(false);
    expect(result.canPublishCanonicalKpis).toBe(false);
  });

  it('rejects missing scope, unauthorized branches, invalid periods and cashier-without-shift', () => {
    expect(() => validateShadowScope({ ...scope, restaurantId: null })).toThrow('SHADOW_INVALID_SCOPE');
    expect(() => validateShadowScope({ ...scope, branchId: 'branch-b' })).toThrow('SHADOW_BRANCH_ACCESS_DENIED');
    expect(() => validateShadowScope({ ...scope, from: '2026-10-24', to: '2026-10-23' })).toThrow('SHADOW_INVALID_SCOPE');
    expect(() => validateShadowScope({ ...scope, shift: '' })).toThrow('SHADOW_SHIFT_REQUIRED');
  });

  it('includes finalized closing only; sources/payment breakdown never add extra revenue', () => {
    const result = run({ sources: { daily_sales: [
      closing(), closing({ id: 'draft', closing_state: 'draft', restaurant_cash: 500 }),
      closing({ id: 'other-day', date: '2026-10-22', restaurant_cash: 900 }),
    ] } });
    expect(result.metrics.net_sales.amount).toBe(175);
    expect(result.metrics.net_sales.confidence).toBe('VERIFIED');
  });

  it('isolates tenant, branch, shift and cashier and blocks questionable scope rows', () => {
    const result = run({ sources: { daily_sales: [
      closing(), closing({ id: 'foreign', restaurant_id: 'tenant-2' }),
      closing({ id: 'different-branch', branch_id: 'branch-b' }),
      closing({ id: 'missing-shift', shift: null }),
      closing({ id: 'different-cashier', cashier_id: 'cashier-2' }),
    ] } });
    expect(result.metrics.net_sales.amount).toBeNull();
    expect(result.metrics.net_sales.confidence).toBe('UNAVAILABLE');
    expect(result.issues.map(x => x.code)).toContain('TENANT_SCOPE_MISMATCH');
    expect(result.issues.map(x => x.code)).toContain('SHIFT_IDENTITY_MISSING');
  });

  it('deduplicates identical sale ID but blocks conflicting repeated IDs', () => {
    expect(run({ sources: { daily_sales: [closing(), closing()] } }).metrics.net_sales.amount).toBe(175);
    const result = run({ sources: { daily_sales: [closing(), closing({ restaurant_cash: 200 })] } });
    expect(result.metrics.net_sales.amount).toBeNull();
    expect(result.issues.map(x => x.code)).toContain('DUPLICATE_ID_CONFLICT');
  });

  it('keeps customer credit in sales exactly once and does not add collection rows as sales', () => {
    const result = run({ sources: { debt_records: [{
      id: 'ar-1', restaurant_id: 'tenant-1', branch_id: 'branch-a', type: 'receivable', remaining_amount: 12,
    }] } });
    expect(result.metrics.net_sales.amount).toBe(175);
    expect(result.metrics.receivables.confidence).toBe('ESTIMATED');
    expect(result.metrics.receivables.estimatedAmount).toBe(12);
  });

  it('keeps approved supplier purchases separate from consumption COGS', () => {
    const result = run();
    expect(result.metrics.approved_purchases.amount).toBe(90);
    expect(result.metrics.recognized_cogs.amount).toBeNull();
    expect(result.metrics.gross_profit.confidence).toBe('UNAVAILABLE');
    expect(result.comparisons.gross_profit.classification).toBe('UNAVAILABLE');
  });

  it('ignores pending/rejected purchases even if their payment status suggests approval', () => {
    const result = run({ sources: { supplier_invoices: [
      purchase({ approval_status: 'rejected', status: 'paid', total_amount: 999 }),
      purchase({ id: 'buy-2', approval_status: 'approved', total_amount: 0 }),
    ] } });
    expect(result.metrics.approved_purchases.amount).toBe(0);
  });

  it('recognizes recipe consumption with explicit cost and source, not unrelated inventory receipts or transfers', () => {
    const inventory = (id, kind, more = {}) => ({
      id, restaurant_id: 'tenant-1', branch_id: 'branch-a', date: '2026-10-23',
      transaction_type: kind, quantity: 4, unit_cost: 3, reference_id: 'order-1',
      reference_type: 'sale', ...more,
    });
    const result = run({ sources: { inventory_transactions: [
      inventory('consumed', 'recipe_consumption'), inventory('purchase', 'purchase'),
      inventory('transfer', 'transfer_out'),
    ] }, completeness: { cogsValuationCertified: true } });
    expect(result.metrics.recognized_cogs.amount).toBe(12);
    expect(result.metrics.gross_profit.amount).toBe(163);
    expect(result.metrics.recognized_cogs.confidence).toBe('VERIFIED');
  });

  it('withholds Verified COGS when unit cost or valuation reference is absent', () => {
    const result = run({ sources: { inventory_transactions: [{
      id: 'missing-value', restaurant_id: 'tenant-1', branch_id: 'branch-a',
      date: '2026-10-23', transaction_type: 'recipe_consumption', quantity: 1,
    }] }, completeness: { cogsValuationCertified: true } });
    expect(result.metrics.recognized_cogs.amount).toBeNull();
    expect(result.issues.map(x => x.code)).toContain('COGS_VALUATION_INCOMPLETE');
  });

  it('withholds zero when a read is missing or incomplete', () => {
    const result = run({ sources: { daily_sales: [] }, completeness: { daily_sales: false } });
    expect(result.metrics.net_sales.amount).toBeNull();
    expect(result.metrics.net_sales.estimatedAmount).toBeNull();
    expect(result.metrics.net_sales.confidence).toBe('UNAVAILABLE');
  });

  it('shows a verified drawer with posted owner injection as Cash In but not revenue', () => {
    const result = run({ sources: {
      drawerCount: { openingCash: 30, actualCash: 148 },
      cash_movements: [{
        id: 'inject-1', restaurant_id: 'tenant-1', branch_id: 'branch-a',
        date: '2026-10-23', shift: 'morning', cashier_id: 'cashier-1',
        movement_type: 'owner_injection', direction: 'in', amount: 20, posted_at: '2026-10-23T08:00:00Z',
      }, {
        id: 'expense-1', restaurant_id: 'tenant-1', branch_id: 'branch-a',
        date: '2026-10-23', shift: 'morning', cashier_id: 'cashier-1',
        movement_type: 'expense', direction: 'out', amount: 2, status: 'posted',
      }, {
        id: 'sale-movement', restaurant_id: 'tenant-1', branch_id: 'branch-a',
        date: '2026-10-23', shift: 'morning', cashier_id: 'cashier-1',
        source_module: 'Sales', source_record_id: 'sale-1', direction: 'in', amount: 100, status: 'posted',
      }],
    } });
    expect(result.metrics.drawer_expected.amount).toBe(148);
    expect(result.metrics.drawer_variance.amount).toBe(0);
    expect(result.metrics.net_sales.amount).toBe(175);
  });

  it('preserves actual cash shortages, not hiding variance in revenue', () => {
    const result = run({ sources: { drawerCount: { openingCash: 0, actualCash: 95 } } });
    expect(result.metrics.drawer_expected.amount).toBe(100);
    expect(result.metrics.drawer_variance.amount).toBe(-5);
    expect(result.metrics.net_sales.amount).toBe(175);
  });

  it('never turns customer collection, wallet transfer or owner handover into sales', () => {
    const result = run({ sources: { wallet_transactions: [
      { id: 'leg-a', restaurant_id: 'tenant-1', branch_id: 'branch-a', date: '2026-10-23',
        transaction_type: 'owner_branch_funding_debit', reference_id: 'fund-1', amount: 50 },
      { id: 'leg-b', restaurant_id: 'tenant-1', branch_id: 'branch-a', date: '2026-10-23',
        transaction_type: 'owner_to_branch_funding', reference_id: 'fund-1', amount: 50 },
    ] }, completeness: { treasuryPairingCertified: true } });
    expect(result.metrics.net_sales.amount).toBe(175);
    expect(result.metrics.treasury_transfer_net.amount).toBe(0);
  });

  it('flags unmatched treasury transfer legs instead of balancing them silently', () => {
    const result = run({ sources: { wallet_transactions: [{
      id: 'leg-a', restaurant_id: 'tenant-1', branch_id: 'branch-a', date: '2026-10-23',
      transaction_type: 'owner_branch_funding_debit', reference_id: 'fund-1', amount: 50,
    }] }, completeness: { treasuryPairingCertified: true } });
    expect(result.metrics.treasury_transfer_net.amount).toBeNull();
    expect(result.issues.map(x => x.code)).toContain('TREASURY_TRANSFER_UNPAIRED');
  });

  it('requires verified legacy lock lineage to count historical locked closing', () => {
    const result = run({ sources: { daily_sales: [
      closing({ id: 'legacy', closing_state: 'locked', legacy_lock_verified: false }),
    ] } });
    expect(result.metrics.net_sales.amount).toBe(0);
    const verified = run({ sources: { daily_sales: [
      closing({ id: 'legacy', closing_state: 'locked', legacy_lock_verified: true }),
    ] } });
    expect(verified.metrics.net_sales.amount).toBe(175);
  });

  it('never treats purchase-basis profit as canonical profit parity', () => {
    const result = run({
      sources: { inventory_transactions: [{
        id: 'cogs-1', restaurant_id: 'tenant-1', branch_id: 'branch-a',
        date: '2026-10-23', transaction_type: 'recipe_consumption',
        quantity: 3, unit_cost: 5, reference_id: 'sale-1', reference_type: 'sale',
      }] },
      completeness: { cogsValuationCertified: true },
      legacy: { gross_profit: 160 },
    });
    expect(result.metrics.gross_profit.amount).toBe(160);
    expect(result.comparisons.gross_profit.classification).toBe('BASIS_REVIEW_REQUIRED');
  });

  it('calculates payroll expense before advances, requiring full period certification', () => {
    const monthScope = { ...scope, from: '2026-10-01', to: '2026-10-31', shift: undefined, cashierId: undefined };
    const result = reconcileCanonicalShadow({
      scope: monthScope,
      sources: { payroll_runs: [{
        id: 'pay-1', restaurant_id: 'tenant-1', branch_id: 'branch-a',
        month: '2026-10', status: 'finalized', base_salary: 2000,
        bonuses: 100, deductions: 50, advances: 800, final_salary: 1250,
      }] },
      completeness: { ...complete, payrollAccrualCertified: true, payrollPeriodCertified: true },
    });
    expect(result.metrics.payroll_expense.amount).toBe(2050);
  });

  it('requires independently audited CI, branch evidence, 14 days and approvals for canary', () => {
    const result = run();
    const gate = assessCanonicalRelease({
      snapshot: result, testsPassed: true, authorizedBranches: ['branch-a'],
      reconciledBranches: ['branch-a'], daysObserved: 14,
      financeApproved: true, technicalApproved: true, ownerApproved: true,
    });
    expect(gate.eligibleForManualCanaryReview).toBe(false);
    expect(gate.blockers).toContain('UNVERIFIED_METRIC');
    expect(assessCanonicalRelease({ snapshot: result }).blockers).toContain('TESTS_NOT_PASSED');
  });

  it('does not mutate caller input rows or trusted legacy baselines', () => {
    const sales = [closing()];
    const original = JSON.stringify(sales);
    const legacy = { net_sales: 175 };
    const result = run({ sources: { daily_sales: sales }, legacy });
    expect(JSON.stringify(sales)).toBe(original);
    expect(legacy.net_sales).toBe(175);
    expect(result.comparisons.net_sales.classification).toBe('MATCH');
  });
});

describe('Shadow evidence reader security', () => {
  it('requires explicit authorized context and SELECT-only client', async () => {
    await expect(readCanonicalShadowEvidence({ scope })).rejects.toThrow('SHADOW_READ_CLIENT_REQUIRED');
  });

  it('does not call an RPC/mutation or certify inferred business-date mappings', async () => {
    const ops = [];
    const rows = [{
      id: 'x-1', restaurant_id: 'tenant-1', branch_id: 'branch-a',
      date: '2026-10-23', month: '2026-10',
    }];
    const make = () => {
      const q = { select: () => { ops.push('select'); return q; },
        eq: () => q, in: () => q, is: () => q, gte: () => q,
        lte: () => q, lt: () => q, order: () => q,
        range: async () => ({ data: rows, error: null }) };
      return q;
    };
    const db = { from: () => make(), rpc: () => { throw new Error('RPC must never be called'); } };
    const result = await readCanonicalShadowEvidence({
      db, scope: { ...scope, legacyCoverageCertified: true },
    });
    expect(ops.every(x => x === 'select')).toBe(true);
    expect(result.sources.daily_sales).toHaveLength(1);
    expect(result.completeness.inventory_transactions).toBe(false);
    expect(result.certifications.salesPostingCertified).toBe(false);
  });
});
