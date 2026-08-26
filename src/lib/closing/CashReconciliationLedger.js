const amount = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const money = (value) => Math.round(Math.max(0, amount(value)) * 100) / 100;

export const PAYMENT_METHODS = Object.freeze({
  CASH: 'cash',
  CARD: 'card',
  BANK_TRANSFER: 'bank_transfer',
  ONLINE: 'online',
  WALLET: 'wallet',
  CREDIT: 'credit',
});

export const paymentMethodForCode = (value) => {
  const code = String(value || '').trim().toLowerCase();
  if (['cash', 'cash_on_delivery', 'cod'].includes(code)) return PAYMENT_METHODS.CASH;
  if (['card', 'network', 'pos', 'visa', 'mastercard', 'mada'].includes(code)) return PAYMENT_METHODS.CARD;
  if (['bank', 'bank_transfer', 'transfer', 'iban'].includes(code)) return PAYMENT_METHODS.BANK_TRANSFER;
  if (['online', 'digital', 'gateway'].includes(code)) return PAYMENT_METHODS.ONLINE;
  if (['wallet', 'e_wallet', 'ewallet'].includes(code)) return PAYMENT_METHODS.WALLET;
  if (['credit', 'customer_credit', 'on_account'].includes(code)) return PAYMENT_METHODS.CREDIT;
  return PAYMENT_METHODS.CASH;
};

export const paymentBuckets = (entries = []) => entries.reduce((totals, entry) => {
  const method = paymentMethodForCode(entry?.payment_method || entry?.payment_bucket || entry?.default_payment_method);
  const value = money(entry?.today_amount ?? entry?.amount);
  totals[method] += value;
  return totals;
}, {
  [PAYMENT_METHODS.CASH]: 0,
  [PAYMENT_METHODS.CARD]: 0,
  [PAYMENT_METHODS.BANK_TRANSFER]: 0,
  [PAYMENT_METHODS.ONLINE]: 0,
  [PAYMENT_METHODS.WALLET]: 0,
  [PAYMENT_METHODS.CREDIT]: 0,
});

export const ledgerTotals = (movements = []) => movements.reduce((totals, movement) => {
  if (movement?.is_reversed) return totals;
  const value = money(movement?.amount);
  if (String(movement?.direction || '').toLowerCase() === 'out') totals.cashOut += value;
  else totals.cashIn += value;
  return totals;
}, { cashIn: 0, cashOut: 0 });

/** Allocate a cash-shortage funding requirement without treating funding as revenue. */
export const walletFirstSettlementAllocation = ({ requiredFunding = 0, branchWalletAvailable = 0 } = {}) => {
  const required = money(requiredFunding);
  const walletAvailable = money(branchWalletAvailable);
  const walletApplied = Math.min(required, walletAvailable);
  const ownerPaymentRequired = money(required - walletApplied);
  const walletRemaining = money(walletAvailable - walletApplied);
  return {
    requiredFunding: required,
    branchWalletAvailable: walletAvailable,
    branchWalletApplied: walletApplied,
    ownerPaymentRequired,
    walletRemaining,
    totalCovered: money(walletApplied + ownerPaymentRequired),
    settlementStatus: required === 0
      ? 'No funding required'
      : ownerPaymentRequired === 0
        ? 'Paid from Branch Wallet'
        : walletApplied > 0
          ? 'Partially paid from Branch Wallet'
          : 'Owner payment required',
  };
};

/** Fixed monthly cost allocated deterministically to the configured business-day count. */
export const dailyFixedExpenseAllocation = (fixedExpenses = []) => money(fixedExpenses.reduce((total, expense) => {
  if (expense?.is_active === false || expense?.is_fixed === false) return total;
  // Legacy fixed rows store the monthly value on the expense itself while newer
  // configuration may store it on the category. A zero configuration is not a
  // value to prefer over a real monthly source record.
  const monthlyAmount = money(expense?.monthly_amount) || money(expense?.amount);
  const allocationDays = Math.max(1, Math.trunc(amount(expense?.allocation_days ?? expense?.business_days ?? 30)) || 30);
  return total + (monthlyAmount / allocationDays);
}, 0));

/**
 * The only physical-cash formula. Revenue and physical cash remain independent.
 * `ledgerMovements` excludes the current unsaved Closing sale, which is passed as
 * `currentCashSales` exactly once while the form is being edited.
 */
export const cashReconciliationSnapshot = ({
  openingCash = 0,
  ledgerMovements = [],
  currentCashSales = 0,
  actualCash = null,
  revenueEntries = [],
  customerCredit = 0,
  purchases = 0,
  expenses = 0,
  otherOperatingCosts = 0,
  branchWalletAvailable = 0,
} = {}) => {
  const ledger = ledgerTotals(ledgerMovements);
  const payments = paymentBuckets(revenueEntries);
  const explicitCredit = money(customerCredit);
  const cashSales = money(currentCashSales) + payments.cash;
  const cardSales = payments.card;
  const bankTransferSales = payments.bank_transfer;
  const onlineSales = payments.online;
  const walletSales = payments.wallet;
  const creditSales = payments.credit + explicitCredit;
  const revenueToday = cashSales + cardSales + bankTransferSales + onlineSales + walletSales + creditSales;
  const opening = money(openingCash);
  const expectedCash = money(opening + ledger.cashIn + cashSales - ledger.cashOut);
  const actual = actualCash === '' || actualCash === null || actualCash === undefined ? null : money(actualCash);
  const difference = actual === null ? null : Math.round((actual - expectedCash) * 100) / 100;
  const shortage = difference !== null && difference < 0 ? Math.abs(difference) : 0;
  const overage = difference !== null && difference > 0 ? difference : 0;
  const cashFundingRequired = money(ledger.cashOut - (opening + ledger.cashIn + cashSales));
  const settlement = walletFirstSettlementAllocation({ requiredFunding: shortage, branchWalletAvailable });
  const operatingResult = Math.round((revenueToday - money(purchases) - money(expenses) - money(otherOperatingCosts)) * 100) / 100;

  return {
    openingCash: opening,
    cashIn: ledger.cashIn,
    cashOut: ledger.cashOut,
    cashSales,
    cardSales,
    bankTransferSales,
    onlineSales,
    walletSales,
    creditSales,
    nonCashSales: cardSales + bankTransferSales + onlineSales + walletSales,
    revenueToday,
    expectedCash,
    actualCash: actual,
    difference,
    shortage,
    overage,
    ownerSettlementRequired: settlement.ownerPaymentRequired,
    cashFundingRequired,
    operatingResult,
    varianceStatus: difference === null ? 'pending' : difference === 0 ? 'balanced' : difference < 0 ? 'shortage' : 'overage',
    ...settlement,
  };
};

/** New daily Closing state intentionally never copies prior daily inputs. */
export const dailyClosingDefaults = ({ date, branch, branchId, shift, cashierId, cashierName } = {}) => ({
  date: date || '',
  branch: branch || '',
  branch_id: branchId || null,
  shift: shift || 'Morning',
  cashier_id: cashierId || null,
  cashier_employee_id: cashierId || null,
  cashier_name: cashierName || '',
  restaurant_cash: 0,
  restaurant_network: 0,
  credit: 0,
  custom_sources_total: 0,
  actual_cash: null,
  opening_cash: 0,
  cash_notes: '',
  owner_cash_injection: 0,
  sales_sources_json: [],
  credit_entries_json: [],
  pos_entries_json: [],
  payment_reconciliation_json: [],
});
