/**
 * Issue #183 — PURE, opt-in, read-only accounting reconciliation.
 *
 * Never posts to the ERP, never changes an existing KPI or financial row, and
 * never enables the canonical feature flag. A caller must supply an audited,
 * complete, single-snapshot set of tenant-scoped source rows.
 *
 * Complete reads must be explicitly attested per source. Missing or ambiguous
 * data is UNAVAILABLE, not verified zero.
 */
export const CANONICAL_KPI_FLAG = 'erp_canonical_kpis_v1';
export const CANONICAL_KPI_DEFAULT_ENABLED = false;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const APPROVED = new Set(['approved', 'auto_approved', 'posted', 'paid', 'settled', 'partial']);
const NON_REVENUE = new Set(['owner_injection', 'owner_contribution', 'cash_handover', 'branch_transfer', 'treasury_transfer', 'debt_collection']);
const VALID_METRICS = ['net_sales', 'approved_purchases', 'recognized_cogs', 'posted_expenses', 'payroll_expense', 'gross_profit', 'operating_result', 'drawer_expected', 'drawer_variance', 'receivables', 'payables', 'treasury_transfer_net'];

const integer = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) : null;
};
const sum = values => values.reduce((a, b) => a + b, 0);
const money = cents => cents === null ? null : Number((cents / 100).toFixed(2));
const status = row => String(row?.status || '').toLowerCase();
const state = row => String(row?.closing_state || '').toLowerCase();
const dateOf = row => String(row?.business_date || row?.date || '').slice(0, 10);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const norm = value => String(value ?? '').trim().toLowerCase();

export function validateShadowScope(scope) {
  if (!scope || !scope.restaurantId || !DATE.test(scope.from || '') || !DATE.test(scope.to || '') || scope.from > scope.to) {
    throw new Error('SHADOW_INVALID_SCOPE');
  }
  if (!Array.isArray(scope.authorizedBranchIds) || !scope.authorizedBranchIds.length ||
      scope.authorizedBranchIds.some(id => !id || typeof id !== 'string')) {
    throw new Error('SHADOW_AUTHORIZED_BRANCHES_REQUIRED');
  }
  if (new Set(scope.authorizedBranchIds).size !== scope.authorizedBranchIds.length) {
    throw new Error('SHADOW_DUPLICATE_AUTHORIZED_BRANCH');
  }
  if (scope.branchId && !scope.authorizedBranchIds.includes(scope.branchId)) {
    throw new Error('SHADOW_BRANCH_ACCESS_DENIED');
  }
  if (scope.cashierId && !scope.shift) throw new Error('SHADOW_SHIFT_REQUIRED');
  return Object.freeze({ ...scope, authorizedBranchIds: [...scope.authorizedBranchIds] });
}

function scopeRows(rows, scope, table, issues, { dated = true, shiftScoped = false } = {}) {
  if (!Array.isArray(rows)) {
    issues.push({ code: 'SOURCE_NOT_ARRAY', table });
    return [];
  }
  const result = [];
  for (const row of rows) {
    if (!row || String(row.restaurant_id) !== String(scope.restaurantId)) {
      issues.push({ code: 'TENANT_SCOPE_MISMATCH', table, id: row?.id ?? null });
      continue;
    }
    const key = norm(row.branch || row.branch_key);
    const mapping = scope.legacyBranchMap || {};
    const legacy = key && has(mapping, key) ? mapping[key] : null;
    const branchId = row.branch_id == null ? legacy : String(row.branch_id);
    if (!branchId || !scope.authorizedBranchIds.includes(branchId) || (legacy && branchId !== legacy)) {
      issues.push({ code: 'BRANCH_SCOPE_UNRESOLVED', table, id: row.id ?? null });
      continue;
    }
    if (scope.branchId && scope.branchId !== branchId) continue;
    if (dated) {
      const day = dateOf(row);
      if (!DATE.test(day)) {
        issues.push({ code: 'BUSINESS_DATE_MISSING', table, id: row.id ?? null });
        continue;
      }
      if (day < scope.from || day > scope.to) continue;
    }
    if (shiftScoped && scope.shift && norm(row.shift) !== norm(scope.shift)) {
      if (!row.shift) issues.push({ code: 'SHIFT_IDENTITY_MISSING', table, id: row.id ?? null });
      continue;
    }
    if (shiftScoped && scope.cashierId && String(row.cashier_id || '') !== String(scope.cashierId)) {
      if (!row.cashier_id) issues.push({ code: 'CASHIER_IDENTITY_MISSING', table, id: row.id ?? null });
      continue;
    }
    result.push(row);
  }
  return result;
}

function metric(cents, verified, basis, reason = null) {
  return {
    amount: verified ? money(cents) : null,
    estimatedAmount: verified || cents === null ? null : money(cents),
    confidence: verified ? 'VERIFIED' : cents === null ? 'UNAVAILABLE' : 'ESTIMATED',
    basis,
    reason,
  };
}

const sourceReady = (completeness, name) => completeness[name] === true;
const issueExists = (issues, tables) => issues.some(issue => tables.includes(issue.table));

function distinctById(rows, table, issues) {
  const byId = new Map();
  for (const row of rows) {
    if (!row.id) {
      issues.push({ code: 'TRANSACTION_ID_MISSING', table });
      continue;
    }
    if (byId.has(row.id)) {
      if (JSON.stringify(byId.get(row.id)) !== JSON.stringify(row)) {
        issues.push({ code: 'DUPLICATE_ID_CONFLICT', table, id: row.id });
      }
    } else byId.set(row.id, row);
  }
  return [...byId.values()];
}

function closingCents(row, issues) {
  // Finalized payment buckets already include sales source snapshots.
  const cash = integer(row.restaurant_cash ?? row.cash);
  const network = integer(row.restaurant_network ?? row.network);
  const credit = integer(row.credit ?? 0);
  const other = integer(row.custom_sources_total ?? 0);
  if (cash === null || network === null || credit === null || other === null) {
    issues.push({ code: 'SALE_TENDER_MISSING', table: 'daily_sales', id: row.id });
    return null;
  }
  return { total: cash + network + credit + other, cash, network, credit, other };
}

function purchaseCents(row, issues) {
  const approved = row.approval_status
    ? ['approved', 'auto_approved'].includes(norm(row.approval_status))
    : ['approved', 'paid', 'partial'].includes(status(row));
  if (!approved) return null;
  const total = integer(row.total_amount);
  if (total === null) issues.push({ code: 'PURCHASE_AMOUNT_MISSING', table: 'supplier_invoices', id: row.id });
  return total;
}

function computeCash(scope, sources, completeness, issues, sales, saleDetails) {
  const base = { expected: metric(null, false, 'cash_ledger', 'COUNT_NOT_PROVIDED'),
    variance: metric(null, false, 'cash_ledger', 'COUNT_NOT_PROVIDED') };
  if (!scope.branchId || !scope.shift || !scope.cashierId || scope.from !== scope.to) return base;
  if (!sourceReady(completeness, 'cash_movements')) return base;
  const count = sources.drawerCount;
  const opening = integer(count?.openingCash);
  const actual = integer(count?.actualCash);
  if (opening === null || actual === null || actual < 0) return base;
  const scoped = distinctById(scopeRows(sources.cash_movements || [], scope, 'cash_movements', issues, { shiftScoped: true }), 'cash_movements', issues);
  let cashIn = 0, cashOut = 0;
  const salesIds = new Set(sales.map(row => String(row.id)));
  for (const row of scoped) {
    if (row.is_reversed === true || norm(row.movement_type) === 'owner_settlement_payment') continue;
    // The posted closing's cash bucket is already included once.
    if ((norm(row.source_module) === 'sales' && salesIds.has(String(row.source_record_id))) ||
        norm(row.movement_type) === 'cash_sale') continue;
    if (!row.posted_at && !['posted', 'approved', 'settled'].includes(status(row))) {
      issues.push({ code: 'CASH_POSTING_UNVERIFIED', table: 'cash_movements', id: row.id });
      continue;
    }
    const value = integer(row.amount);
    if (value === null || value < 0 || !['in', 'out'].includes(norm(row.direction))) {
      issues.push({ code: 'CASH_MOVEMENT_INVALID', table: 'cash_movements', id: row.id });
      continue;
    }
    if (norm(row.direction) === 'in') cashIn += value;
    else cashOut += value;
  }
  const cashSales = sum(saleDetails.map(value => value.cash));
  const expected = opening + cashSales + cashIn - cashOut;
  const verified = !issueExists(issues, ['cash_movements', 'daily_sales']) && sourceReady(completeness, 'daily_sales');
  return { expected: metric(expected, verified, 'posted_cash_movement_and_count', verified ? null : 'UNRECONCILED_CASH_SCOPE'),
    variance: metric(actual - expected, verified && expected >= 0, 'physical_minus_expected', expected < 0 ? 'NEGATIVE_EXPECTED_DRAWER' : null) };
}

export function reconcileCanonicalShadow({ scope: rawScope, sources = {}, completeness = {}, legacy = {} } = {}) {
  const scope = validateShadowScope(rawScope);
  const issues = [];
  const missing = ['daily_sales', 'supplier_invoices', 'inventory_transactions', 'expenses', 'payroll_runs', 'cash_movements', 'debt_records', 'wallet_transactions']
    .filter(table => !sourceReady(completeness, table));
  for (const table of missing) issues.push({ code: 'SOURCE_NOT_ATTESTED_COMPLETE', table });

  const sales = distinctById(scopeRows(sources.daily_sales || [], scope, 'daily_sales', issues, { shiftScoped: true })
    .filter(row => state(row) === 'finalized' || (state(row) === 'locked' && row.legacy_lock_verified === true)), 'daily_sales', issues);
  const saleDetails = sales.map(row => closingCents(row, issues)).filter(Boolean);
  const saleVerified = sourceReady(completeness, 'daily_sales') && completeness.salesPostingCertified === true && completeness.refundsCertified === true && !issueExists(issues, ['daily_sales']) && saleDetails.length === sales.length;
  const saleTotal = sum(saleDetails.map(x => x.total));

  const purchases = distinctById(scopeRows(sources.supplier_invoices || [], scope, 'supplier_invoices', issues), 'supplier_invoices', issues);
  const purchaseVals = purchases.map(row => purchaseCents(row, issues)).filter(x => x !== null);
  const purchaseVerified = sourceReady(completeness, 'supplier_invoices') && !issueExists(issues, ['supplier_invoices']);

  const inventory = distinctById(scopeRows(sources.inventory_transactions || [], scope, 'inventory_transactions', issues), 'inventory_transactions', issues);
  const consumed = inventory.filter(row => norm(row.transaction_type) === 'recipe_consumption' && !row.is_reversed);
  const cogsVals = consumed.map(row => {
    const qty = Number(row.quantity);
    const unit = integer(row.unit_cost);
    if (!Number.isFinite(qty) || qty < 0 || unit === null || !row.reference_id || !row.reference_type) {
      issues.push({ code: 'COGS_VALUATION_INCOMPLETE', table: 'inventory_transactions', id: row.id });
      return null;
    }
    return Math.round(qty * unit);
  });
  const valuedCOGS = sum(cogsVals.filter(x => x !== null));
  const cogsVerified = sourceReady(completeness, 'inventory_transactions') &&
    completeness.cogsValuationCertified === true && !issueExists(issues, ['inventory_transactions']);

  const expenses = distinctById(scopeRows(sources.expenses || [], scope, 'expenses', issues), 'expenses', issues);
  const expenseVals = expenses.filter(row => APPROVED.has(status(row))).map(row => {
    const value = integer(row.amount);
    if (value === null) issues.push({ code: 'EXPENSE_AMOUNT_MISSING', table: 'expenses', id: row.id });
    return value;
  });
  const expVerified = sourceReady(completeness, 'expenses') && completeness.expenseAllocationCertified === true &&
    !issueExists(issues, ['expenses']) && !(scope.shift && !completeness.shiftExpenseAllocationCertified);

  const payroll = distinctById(scopeRows(sources.payroll_runs || [], scope, 'payroll_runs', issues, { dated: false }), 'payroll_runs', issues)
    .filter(row => ['finalized', 'paid'].includes(status(row)) && (!row.month || (row.month >= scope.from.slice(0, 7) && row.month <= scope.to.slice(0, 7))));
  const payrollVals = payroll.map(row => {
    if (!row.month) issues.push({ code: 'PAYROLL_MONTH_MISSING', table: 'payroll_runs', id: row.id });
    const base = integer(row.base_salary), bonuses = integer(row.bonuses ?? 0), deductions = integer(row.deductions ?? 0);
    if (base === null || bonuses === null || deductions === null) {
      issues.push({ code: 'PAYROLL_ACCRUAL_INCOMPLETE', table: 'payroll_runs', id: row.id });
      return null;
    }
    // Salary advances are a receivable settlement, NOT an expense deduction.
    return base + bonuses - deductions;
  });
  const payrollVerified = sourceReady(completeness, 'payroll_runs') && completeness.payrollAccrualCertified === true &&
    !issueExists(issues, ['payroll_runs']) && !scope.shift && scope.from.endsWith('-01') &&
    completeness.payrollPeriodCertified === true;

  const salesM = metric(sourceReady(completeness, 'daily_sales') && saleDetails.length === sales.length ? saleTotal : null, saleVerified, 'finalized_closing_payment_buckets', saleVerified ? null : 'SALES_SCOPE_INCOMPLETE');
  const purchaseM = metric(sourceReady(completeness, 'supplier_invoices') && !issueExists(issues, ['supplier_invoices']) ? sum(purchaseVals) : null, purchaseVerified, 'approved_supplier_receipts', purchaseVerified ? null : 'PURCHASE_SCOPE_INCOMPLETE');
  const cogsM = metric(sourceReady(completeness, 'inventory_transactions') && consumed.length && cogsVals.every(v => v !== null) ? valuedCOGS : cogsVerified ? 0 : null, cogsVerified, 'valued_recipe_consumption', cogsVerified ? null : 'VALUATION_NOT_CERTIFIED');
  const expenseM = metric(sourceReady(completeness, 'expenses') && expenseVals.every(v => v !== null) ? sum(expenseVals) : null, expVerified, 'approved_posted_expenses', expVerified ? null : 'EXPENSE_ALLOCATION_NOT_CERTIFIED');
  const payrollM = metric(sourceReady(completeness, 'payroll_runs') && payrollVals.every(v => v !== null) ? sum(payrollVals) : null, payrollVerified, 'finalized_payroll_accrual', payrollVerified ? null : 'PAYROLL_PERIOD_NOT_CERTIFIED');
  const grossVerified = saleVerified && cogsVerified;
  const gross = metric(salesM.amount !== null && cogsM.amount !== null ? saleTotal - valuedCOGS : null, grossVerified, 'sales_minus_recognized_cogs', grossVerified ? null : 'DEPENDENCY_NOT_VERIFIED');
  const opVerified = grossVerified && expVerified && payrollVerified;
  const operating = metric(gross.amount !== null && expenseM.amount !== null && payrollM.amount !== null ? saleTotal - valuedCOGS - sum(expenseVals) - sum(payrollVals) : null, opVerified,
    'gross_profit_minus_opex_minus_payroll', opVerified ? null : 'DEPENDENCY_NOT_VERIFIED');
  const cash = computeCash(scope, sources, completeness, issues, sales, saleDetails);

  // Balance-sheet figures require an explicitly attested as-of snapshot.
  const asOf = completeness.balanceAsOfCertified === true && !scope.shift;
  const debtRows = distinctById(scopeRows(sources.debt_records || [], scope, 'debt_records', issues, { dated: false }), 'debt_records', issues);
  const balance = type => {
    const amounts = debtRows.filter(row => norm(row.type) === type).map(row => integer(row.remaining_amount ?? row.balance));
    if (amounts.some(value => value === null)) issues.push({ code: 'DEBT_BALANCE_MISSING', table: 'debt_records' });
    const valid = asOf && sourceReady(completeness, 'debt_records') && !issueExists(issues, ['debt_records']);
    return metric(sourceReady(completeness, 'debt_records') && amounts.every(v => v !== null) ? sum(amounts) : null, valid, 'receivable_payable_asof', valid ? null : 'ASOF_NOT_CERTIFIED');
  };
  const wallet = distinctById(scopeRows(sources.wallet_transactions || [], scope, 'wallet_transactions', issues), 'wallet_transactions', issues);
  // A transfer has two legs; this is only a diagnostic and must never enter sales.
  const transferRows = wallet.filter(row => ['owner_branch_funding_debit', 'owner_to_branch_funding'].includes(norm(row.transaction_type)));
  const legs = new Map();
  for (const row of transferRows) {
    const key = String(row.reference_id || '');
    if (!key) issues.push({ code: 'TRANSFER_REFERENCE_MISSING', table: 'wallet_transactions', id: row.id });
    const list = legs.get(key) || [];
    list.push(row);
    legs.set(key, list);
  }
  for (const [key, list] of legs) {
    if (!key || list.length !== 2 || new Set(list.map(x => norm(x.transaction_type))).size !== 2 ||
        integer(list[0].amount) !== integer(list[1].amount)) {
      issues.push({ code: 'TREASURY_TRANSFER_UNPAIRED', table: 'wallet_transactions', id: key || null });
    }
  }
  const treasuryVerified = sourceReady(completeness, 'wallet_transactions') &&
    !issueExists(issues, ['wallet_transactions']) && completeness.treasuryPairingCertified === true;

  const metrics = {
    net_sales: salesM, approved_purchases: purchaseM, recognized_cogs: cogsM,
    posted_expenses: expenseM, payroll_expense: payrollM, gross_profit: gross,
    operating_result: operating, drawer_expected: cash.expected, drawer_variance: cash.variance,
    receivables: balance('receivable'), payables: balance('payable'),
    treasury_transfer_net: metric(0, treasuryVerified, 'balanced_internal_transfer_pair', treasuryVerified ? null : 'PAIRING_NOT_CERTIFIED'),
  };
  const comparisons = Object.fromEntries(Object.entries(metrics).map(([name, canonical]) => {
    const legacyCents = integer(legacy[name]);
    const canonicalCents = canonical.confidence === 'VERIFIED' ? integer(canonical.amount) : null;
    const basisDifferent = ['gross_profit', 'operating_result', 'recognized_cogs'].includes(name);
    const difference = legacyCents === null || canonicalCents === null ? null : canonicalCents - legacyCents;
    return [name, {
      legacyAmount: money(legacyCents),
      canonicalAmount: canonical.amount,
      difference: money(difference),
      classification: canonical.confidence !== 'VERIFIED' || legacyCents === null ? 'UNAVAILABLE'
        : basisDifferent ? 'BASIS_REVIEW_REQUIRED'
          : Math.abs(difference) <= 1 ? 'MATCH' : 'MISMATCH',
    }];
  }));
  return Object.freeze({
    readOnly: true, releaseFlag: CANONICAL_KPI_FLAG, releaseFlagEnabled: false,
    scope: { restaurantId: scope.restaurantId, branchId: scope.branchId || null, from: scope.from, to: scope.to, shift: scope.shift || null, cashierId: scope.cashierId || null },
    metrics, comparisons, issues, canPublishCanonicalKpis: false,
  });
}

/**
 * Fail-closed release gate; this is advisory only and NEVER toggles a flag.
 * Independent approval + CI + complete branch evidence is required.
 */
export function assessCanonicalRelease({ snapshot, testsPassed = false, authorizedBranches = [], reconciledBranches = [],
  daysObserved = 0, financeApproved = false, technicalApproved = false, ownerApproved = false } = {}) {
  const blockers = [];
  if (!snapshot?.readOnly || snapshot.releaseFlagEnabled) blockers.push('UNSAFE_SNAPSHOT');
  if (!testsPassed) blockers.push('TESTS_NOT_PASSED');
  if (daysObserved < 14) blockers.push('SHADOW_WINDOW_INCOMPLETE');
  if (!authorizedBranches.length || authorizedBranches.some(id => !reconciledBranches.includes(id))) blockers.push('BRANCH_RECONCILIATION_INCOMPLETE');
  if (snapshot?.issues?.length) blockers.push('UNRESOLVED_SOURCE_EXCEPTIONS');
  if (!snapshot?.metrics || Object.values(snapshot.metrics).some(m => m.confidence !== 'VERIFIED')) blockers.push('UNVERIFIED_METRIC');
  if (!snapshot?.comparisons || Object.values(snapshot.comparisons).some(m => !['MATCH'].includes(m.classification))) blockers.push('KPI_PARITY_NOT_APPROVED');
  if (!financeApproved || !technicalApproved || !ownerApproved) blockers.push('APPROVALS_MISSING');
  return { eligibleForManualCanaryReview: blockers.length === 0, blockers };
}

// Codes intentionally exported for classification/unit tests and downstream UI.
export const SHADOW_NON_REVENUE_MOVEMENT_TYPES = NON_REVENUE;
