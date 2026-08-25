const MONEY_SCALE = 100;

const arrayOf = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

/**
 * Converts a raw, user-editable money value to minor units without floating-point
 * arithmetic. Database calculations remain authoritative; this keeps the live UI
 * calculation deterministic and safe for decimal input.
 */
export function moneyToMinor(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '-' || raw === '.' || raw === '-.') return 0;
  const match = raw.match(/^(-?)(\d*)(?:\.(\d{0,2}))?$/);
  if (!match) return 0;
  const [, sign, whole = '0', fraction = ''] = match;
  const major = Number.parseInt(whole || '0', 10);
  const minor = Number.parseInt(`${fraction}00`.slice(0, 2), 10);
  const amount = (major * MONEY_SCALE) + minor;
  return sign === '-' ? -amount : amount;
}

export function minorToMoney(value) {
  return Number(value || 0) / MONEY_SCALE;
}

export function nonNegativeMoney(value) {
  return Math.max(0, moneyToMinor(value));
}

export function moneyInputIsValid(value, { allowNegative = false, max = null } = {}) {
  const raw = String(value ?? '');
  if (raw === '') return true;
  const expression = allowNegative ? /^-?\d*(?:\.\d{0,2})?$/ : /^\d*(?:\.\d{0,2})?$/;
  if (!expression.test(raw)) return false;
  return max == null || moneyToMinor(raw) <= moneyToMinor(max);
}

export function varianceStatus(differenceMinor) {
  if (differenceMinor === 0) return 'BALANCED';
  return differenceMinor < 0 ? 'SHORTAGE' : 'OVERAGE';
}

/**
 * Computes one source's display values. Only `todayMinor` is revenue for the
 * active period; historical balance is display and audit context only.
 */
export function calculateSalesSource({ today = '', historical = 0 } = {}) {
  const todayMinor = nonNegativeMoney(today);
  const historicalMinor = nonNegativeMoney(historical);
  return {
    todayMinor,
    historicalMinor,
    totalMinor: historicalMinor + todayMinor,
  };
}

export function calculateSalesSources(sources) {
  return arrayOf(sources).reduce((summary, source) => {
    const result = calculateSalesSource({ today: source?.today, historical: source?.previous });
    summary.rows.push({ ...source, ...result });
    if (source?.included_in_revenue !== false) summary.erpRevenueMinor += result.todayMinor;
    return summary;
  }, { rows: [], erpRevenueMinor: 0 });
}

export function calculatePaymentReconciliation(methods) {
  const rows = arrayOf(methods).map((method) => {
    const expectedMinor = nonNegativeMoney(method?.expected);
    const actualMinor = method?.actual === '' || method?.actual == null ? null : nonNegativeMoney(method.actual);
    const differenceMinor = actualMinor == null ? null : actualMinor - expectedMinor;
    return {
      ...method,
      expectedMinor,
      actualMinor,
      differenceMinor,
      status: differenceMinor == null ? 'PENDING' : varianceStatus(differenceMinor),
    };
  });
  return {
    rows,
    expectedMinor: rows.reduce((sum, row) => sum + row.expectedMinor, 0),
    actualMinor: rows.reduce((sum, row) => sum + (row.actualMinor ?? 0), 0),
    hasVariance: rows.some((row) => row.differenceMinor != null && row.differenceMinor !== 0),
  };
}

/**
 * Canonical cash-drawer formula. Each term is in minor currency units and every
 * display path should consume this result rather than reimplementing the math.
 */
export function calculateCashReconciliation({
  openingCash = '',
  cashSales = '',
  cashIn = '',
  cashOut = '',
  cashExpenses = '',
  cashDeposits = '',
  approvedAdjustments = '',
  actualCash = '',
} = {}) {
  const openingMinor = nonNegativeMoney(openingCash);
  const cashSalesMinor = nonNegativeMoney(cashSales);
  const cashInMinor = nonNegativeMoney(cashIn);
  const cashOutMinor = nonNegativeMoney(cashOut);
  const cashExpensesMinor = nonNegativeMoney(cashExpenses);
  const cashDepositsMinor = nonNegativeMoney(cashDeposits);
  const approvedAdjustmentsMinor = moneyToMinor(approvedAdjustments);
  const expectedMinor = openingMinor
    + cashSalesMinor
    + cashInMinor
    - cashOutMinor
    - cashExpensesMinor
    - cashDepositsMinor
    + approvedAdjustmentsMinor;
  const hasActual = actualCash !== '' && actualCash != null;
  const actualMinor = hasActual ? nonNegativeMoney(actualCash) : null;
  const differenceMinor = actualMinor == null ? null : actualMinor - expectedMinor;
  return {
    openingMinor,
    cashSalesMinor,
    cashInMinor,
    cashOutMinor,
    cashExpensesMinor,
    cashDepositsMinor,
    approvedAdjustmentsMinor,
    expectedMinor,
    actualMinor,
    differenceMinor,
    status: differenceMinor == null ? 'PENDING' : varianceStatus(differenceMinor),
  };
}

export function calculateOperatingResult({ revenue = '', purchases = '', operatingExpenses = '', approvedDeductions = '' } = {}) {
  const revenueMinor = nonNegativeMoney(revenue);
  const purchasesMinor = nonNegativeMoney(purchases);
  const operatingExpensesMinor = nonNegativeMoney(operatingExpenses);
  const approvedDeductionsMinor = nonNegativeMoney(approvedDeductions);
  return {
    revenueMinor,
    purchasesMinor,
    operatingExpensesMinor,
    approvedDeductionsMinor,
    operatingResultMinor: revenueMinor - purchasesMinor - operatingExpensesMinor - approvedDeductionsMinor,
  };
}

export function buildCleanClosingDraft({ date, branch, branchId = null, shift = 'Morning', cashierId = null, cashierName = '' } = {}) {
  return {
    date: date || '',
    branch: branch || '',
    branch_id: branchId,
    shift,
    cashier_id: cashierId,
    cashier_employee_id: cashierId,
    cashier_name: cashierName,
    sales_notes: '',
    cash_notes: '',
    opening_cash: '',
    actual_cash: '',
    owner_cash_injection: '',
    sales_sources_json: [],
    payment_reconciliation_json: [],
    expenses_json: [],
    closing_state: 'draft',
  };
}

export const closingMath = {
  MONEY_SCALE,
  moneyToMinor,
  minorToMoney,
  nonNegativeMoney,
  moneyInputIsValid,
  varianceStatus,
  calculateSalesSource,
  calculateSalesSources,
  calculatePaymentReconciliation,
  calculateCashReconciliation,
  calculateOperatingResult,
  buildCleanClosingDraft,
};

export default closingMath;
