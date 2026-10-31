import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { calculateERPAccounting, calculateSalesRevenue } from '../src/lib/helpers.js';
import { enteredDrawerCash, normalizeDrawerCashAsOf } from '../src/lib/executiveDrawerCash.js';
import { cashReconciliationSnapshot } from '../src/lib/closing/CashReconciliationLedger.js';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');
const closing = {
  closing_state: 'finalized', branch_id: 'b1', date: '2026-10-21',
  restaurant_cash: 300, restaurant_network: 120, credit: 80,
  custom_sources_total: 0,
  actual_cash: 45, closing_cash: 445, owner_cash_injection: 400,
  sales_sources_json: [
    { source_key: 'cash', amount: 300 },
    { source_key: 'network', amount: 120 },
    { source_key: 'customer_credit', amount: 80 },
  ],
};

describe('ERP contract: Sales Closing ↔ Owner Dashboard', () => {
  it('posts finalized payment channels only once, never owner injection or prior balances', () => {
    const turnedOffAfterPosting = [
      { system_key: 'cash', included_in_revenue: false },
      { system_key: 'network', included_in_revenue: false },
      { system_key: 'credit', included_in_revenue: false },
    ];
    expect(calculateSalesRevenue(closing, turnedOffAfterPosting).total).toBe(500);
    expect(calculateERPAccounting({
      sales: [closing], purchases: [{ total_amount: 60 }],
      periodExpenses: [{ amount: 20 }], rangeType: 'day', asOfDate: '2026-10-21',
      revenueSources: turnedOffAfterPosting,
    })).toMatchObject({
      totalSales: 500, totalCash: 300, totalNetwork: 120, totalCredit: 80,
      totalPurchaseCost: 60, totalExpenses: 20, netProfit: 420,
      accountingBasis: 'sales_less_approved_purchases_and_recorded_expenses',
      requiresInventoryCogs: true,
    });
    expect(enteredDrawerCash(closing)).toBe(45);
    expect(enteredDrawerCash({ ...closing, actual_cash: null })).toBeNull();
  });

  it('never treats owner transfers, network or customer credit as physical drawer cash', () => {
    const result = cashReconciliationSnapshot({
      openingCash: 25,
      currentCashSales: 300,
      revenueEntries: [{ amount: 120, payment_method: 'card' }, { amount: 80, payment_method: 'credit' }],
      ledgerMovements: [{ direction: 'out', amount: 280 }],
      actualCash: 45,
    });
    expect(result.expectedCash).toBe(45);
    expect(result.difference).toBe(0);
    expect(result.cashSales).toBe(300);
    expect(result.cardSales).toBe(120);
    expect(result.creditSales).toBe(80);
    expect(result.revenueToday).toBe(500);
  });

  it('rejects incomplete as-of balances when the latest branch shift has multiple draws or no counted Actual Cash', () => {
    const payload = {
      basis: 'last_verified_physical_count_not_live_bank_balance',
      amount: 45, branches: 1, missingBranches: 0, complete: true,
      details: [{ status: 'verified', cash: 45, latestCount: 1 }],
    };
    expect(normalizeDrawerCashAsOf(payload)).toMatchObject({ amount: 45, complete: true });
    const ambiguous = { ...payload, amount: null, missingBranches: 1, complete: false,
      details: [{ status: 'ambiguous_drawer', cash: null, latestCount: 2 }] };
    expect(normalizeDrawerCashAsOf(ambiguous)).toMatchObject({ amount: null, complete: false });
  });

  it('keeps the all-branches amount unknown but exposes the latest verified branch snapshot',()=>{
    const payload={
      basis:'last_verified_physical_count_not_live_bank_balance',
      amount:null,branches:4,missingBranches:2,complete:false,
      details:[
        {branchKey:'branch_2',branchName:'Branch 2',status:'verified',cash:180,date:'2026-10-28',sessionNo:1,countedAt:'2026-10-28T07:00:00Z'},
        {branchKey:'branch_3',status:'no_closing',cash:null,date:null},
        {branchKey:'branch_4',status:'no_closing',cash:null,date:null},
        {branchKey:'main-9a50614652',branchName:'Main',status:'verified',cash:150,date:'2026-10-31',sessionNo:6,countedAt:'2026-10-31T20:14:39Z'},
      ]
    };
    const result=normalizeDrawerCashAsOf(payload);
    expect(result).toMatchObject({
      amount:null,complete:false,branches:4,missingBranches:2,verifiedBranches:2,
      latestVerifiedDetail:{cash:150,branchName:'Main',date:'2026-10-31',sessionNo:6,status:'verified'}
    });
    expect(normalizeDrawerCashAsOf({...payload,error:'none'},{error:true})).toMatchObject({amount:null,complete:false,error:true});
  });
  it('does not mistake an uncounted last closing for verified money, or turn null into zero',()=>{
    const payload={
      basis:'last_verified_physical_count_not_live_bank_balance',
      amount:null,branches:1,missingBranches:1,complete:false,
      details:[{branchKey:'main',status:'uncounted',cash:null,date:'2026-10-31'}]
    };
    expect(normalizeDrawerCashAsOf(payload)).toMatchObject({amount:null,latestVerifiedDetail:null,verifiedBranches:0,complete:false});
  });
  it('uses only actual physical cash, never the expected or cash-sales amounts',()=>{
    expect(enteredDrawerCash({actual_cash:150,closing_cash:2000,restaurant_cash:1200})).toBe(150);
    expect(enteredDrawerCash({actual_cash:null,closing_cash:2000,restaurant_cash:1200})).toBeNull();
  });
  it('replaces the ambiguous multi-session database rule while rejecting POS and independent drawers',async()=>{
    const [migration,component]=await Promise.all([
      source('../supabase/migrations/20261031231000_owner_latest_physical_cash_session.sql'),
      source('../src/components/dashboard/ExecutiveSnapshotV2.jsx'),
    ]);
    expect(migration).toContain("lower(btrim(coalesce(s.shift,''))) IN ('morning','evening')");
    expect(migration).toContain('s.closing_session_no DESC NULLS LAST');
    expect(migration).toContain("sc.cashier_count<>1");
    expect(migration).toContain("actual_cash IS NULL");
    expect(migration).toContain("last_verified_physical_count_not_live_bank_balance");
    expect(migration).not.toContain('UPDATE public.daily_sales');
    expect(component).toContain('snapshot-drawer-partial');
    expect(component).toContain('snapshot-drawer-branch-breakdown');
    expect(component).toContain('NOT all-branch total');
  });
  it('uses the same posted ledger as the dashboard and never displays an invented bank cash position', async () => {
    const [owner, report, executive, closingPage, realtime, migration] = await Promise.all([
      source('../src/pages/OwnerDashboard.jsx'),
      source('../src/components/dashboard/OwnerReportCenter.jsx'),
      source('../src/components/dashboard/ExecutiveSnapshotV2.jsx'),
      source('../src/components/sales/UnifiedSalesClosing.jsx'),
      source('../src/hooks/useOwnerDashboardRealtime.js'),
      source('../supabase/migrations/20261021174500_owner_drawer_cash_asof_verified.sql'),
    ]);
    expect(owner).toContain("supabase.rpc('erp_owner_drawer_cash_asof'");
    expect(owner).toContain('normalizeDrawerCashAsOf(drawerCashQuery.data');
    expect(owner).not.toContain('summarizeDrawerCash(periodSales)');
    expect(owner).toContain('ERP_REPORT_ROW_LIMIT_REACHED');
    expect(realtime).toContain("'owner_drawer_cash_asof'");
    expect(report).not.toContain('const operatingCash = periodMetrics.totalCash + periodMetrics.totalNetwork');
    expect(report).toContain('data-testid="owner-accounting-liquidity-basis"');
    expect(report).toContain('data-testid="owner-pending-expense-estimate"');
    expect(executive).toContain('hasQueryError||accountingProvisional');
    expect(closingPage).not.toContain('No posted ERP cash sales were found.');
    expect(closingPage).toContain('data-testid="offline-sales-audit"');
    expect(closingPage).not.toContain('nextErrors.sales_notes =');
    expect(closingPage).toContain('data-testid="sales-entry-manual"');
    expect(closingPage).toContain('data-testid="sales-entry-automatic"');
    expect(closingPage).toContain('data-testid="closing-blockers"');
    expect(closingPage).toContain('effectiveCashierId');
    expect(migration).toContain('erp_can_access_scope_text');
    expect(migration).not.toContain('UPDATE public.daily_sales');
    expect(migration).not.toContain('closing_cash AS actual_cash');
    expect(migration).toContain("'ambiguous_drawer'");
  });
});
