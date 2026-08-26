const amount = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

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
  const value = Math.max(0, amount(entry?.today_amount ?? entry?.amount));
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
  const value = Math.max(0, amount(movement?.amount));
  if (String(movement?.direction || '').toLowerCase() === 'out') totals.cashOut += value;
  else totals.cashIn += value;
  return totals;
}, { cashIn: 0, cashOut: 0 });

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
} = {}) => {
  const ledger = ledgerTotals(ledgerMovements);
  const payments = paymentBuckets(revenueEntries);
  const explicitCredit = Math.max(0, amount(customerCredit));
  const cashSales = Math.max(0, amount(currentCashSales)) + payments.cash;
  const cardSales = payments.card;
  const bankTransferSales = payments.bank_transfer;
  const onlineSales = payments.online;
  const walletSales = payments.wallet;
  const creditSales = payments.credit + explicitCredit;
  const revenueToday = cashSales + cardSales + bankTransferSales + onlineSales + walletSales + creditSales;
  const opening = Math.max(0, amount(openingCash));
  const expectedCash = opening + ledger.cashIn + cashSales - ledger.cashOut;
  const actual = actualCash === '' || actualCash === null || actualCash === undefined ? null : Math.max(0, amount(actualCash));
  const difference = actual === null ? null : actual - expectedCash;
  const shortage = difference !== null && difference < 0 ? Math.abs(difference) : 0;
  const overage = difference !== null && difference > 0 ? difference : 0;
  const cashFundingRequired = Math.max(0, ledger.cashOut - (opening + ledger.cashIn + cashSales));
  const operatingResult = revenueToday - Math.max(0, amount(purchases)) - Math.max(0, amount(expenses)) - Math.max(0, amount(otherOperatingCosts));

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
    ownerSettlementRequired: shortage,
    cashFundingRequired,
    operatingResult,
    varianceStatus: difference === null ? 'pending' : difference === 0 ? 'balanced' : difference < 0 ? 'shortage' : 'overage',
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
