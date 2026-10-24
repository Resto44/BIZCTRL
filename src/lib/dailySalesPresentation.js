export const toDailySalesCardRecord = (sale) => ({
  id: sale.id,
  closing_state: sale.closing_state || 'finalized',
  date: sale.date,
  branch: sale.branch,
  branch_id: sale.branch_id,
  restaurant_cash: sale.restaurant_cash,
  cash: sale.cash,
  restaurant_network: sale.restaurant_network,
  network: sale.network,
  credit: sale.credit,
  custom_sources_total: sale.custom_sources_total,
  sales_sources_json: sale.sales_sources_json,
  cashier_name: sale.cashier_name,
  shift: sale.shift,
  approved_purchases_total: sale.approved_purchases_total,
  expenses_total: sale.expenses_total,
  fixed_expenses_total: sale.fixed_expenses_total,
  variable_expenses_total: sale.variable_expenses_total,
  operating_result: sale.operating_result,
  opening_cash: sale.opening_cash,
  expected_cash: sale.expected_cash,
  actual_cash: sale.actual_cash,
  closing_cash: sale.closing_cash,
  cash_difference: sale.cash_difference,
  cash_status: sale.cash_status,
  manager_user_id: sale.manager_user_id,
  manager_name: sale.manager_name,
  manager_email: sale.manager_email,
  created_by: sale.created_by,
});

const NETWORK_PAYMENT_BUCKETS = new Set([
  'card', 'network', 'pos', 'bank', 'bank_transfer', 'transfer',
  'online', 'digital', 'gateway', 'wallet', 'e_wallet', 'ewallet',
]);

export const parseDailySalesSourceSnapshots = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
};

export const dailySalesNetworkBreakdown = (sale, snapshots = parseDailySalesSourceSnapshots(sale?.sales_sources_json)) => {
  const total = Math.max(0, Number(sale?.restaurant_network ?? sale?.network) || 0);
  let rawDriver = 0;
  let rawOther = 0;
  const otherSourceNames = [];

  snapshots.forEach((source) => {
    const entries = Array.isArray(source?.driver_entries) ? source.driver_entries.filter(Boolean) : [];
    if (entries.length > 0) {
      entries.forEach((entry) => {
        const hasSplit = entry.network_amount !== null && entry.network_amount !== undefined
          || entry.network !== null && entry.network !== undefined;
        if (hasSplit) rawDriver += Math.max(0, Number(entry.network_amount ?? entry.network) || 0);
        else if (NETWORK_PAYMENT_BUCKETS.has(String(entry.payment_bucket || entry.payment_method || '').toLowerCase())) {
          rawDriver += Math.max(0, Number(entry.amount ?? entry.today_amount) || 0);
        }
      });
      return;
    }

    const paymentBucket = String(source?.payment_bucket || source?.default_payment_method || source?.payment_method || '').toLowerCase();
    if (!NETWORK_PAYMENT_BUCKETS.has(paymentBucket)) return;
    rawOther += Math.max(0, Number(source.amount ?? source.today_amount) || 0);
    otherSourceNames.push(source.name_en || source.name_ar || source.source_key || 'Sales source');
  });

  // Canonical restaurant_network is authoritative and already includes all
  // network sources. Capping identifiable detail prevents a legacy snapshot
  // from making the breakdown exceed the persisted Network Total.
  const driver = Math.min(total, rawDriver);
  const other = Math.min(total - driver, rawOther);
  const counter = Math.max(0, total - driver - other);
  return { counter, driver, other, total, otherSourceNames };
};

// Source snapshots explain the saved payment buckets; they are not an extra
// revenue bucket. Cash, network, and credit source amounts are already folded
// into their canonical columns, while only an explicit other bucket belongs in
// custom_sources_total.
const customSourceTotal = (sale) => Math.max(0, Number(sale?.custom_sources_total) || 0);

export const filterDailySalesRecords = (sales, filters) => sales.filter((sale) => {
  if (!sale?.date) return false;
  if (filters.branch !== 'all' && sale.branch !== filters.branch) return false;
  if (filters.from && sale.date < filters.from) return false;
  if (filters.to && sale.date > filters.to) return false;
  const total = (Number(sale.restaurant_cash) || Number(sale.cash) || 0)
    + (Number(sale.restaurant_network) || Number(sale.network) || 0)
    + (Number(sale.credit) || 0)
    + customSourceTotal(sale);
  if (filters.minTotal && total < Number(filters.minTotal)) return false;
  if (filters.maxTotal && total > Number(filters.maxTotal)) return false;
  return true;
});

// These are closing estimates based on saved purchases, not inventory COGS.
// Missing cost snapshots must never be silently treated as zero expenses.
export function dailySalesProfitSummary(sale) {
  const amount = (value) => {
    if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
  };
  const revenue = [sale?.restaurant_cash ?? sale?.cash, sale?.restaurant_network ?? sale?.network,
    sale?.credit, sale?.custom_sources_total].reduce((sum, value) => sum + (amount(value) ?? 0), 0);
  const purchases = amount(sale?.approved_purchases_total);
  const expenses = amount(sale?.expenses_total);
  const fixed = amount(sale?.fixed_expenses_total);
  const variable = amount(sale?.variable_expenses_total);
  const expenseBreakdownComplete = fixed !== null && variable !== null && fixed >= 0 && variable >= 0;
  const expenseBreakdownMismatch = expenseBreakdownComplete && expenses !== null && fixed + variable !== expenses;
  const costs = purchases !== null && expenses !== null ? purchases + expenses : null;
  const gross = purchases !== null ? revenue - purchases : null;
  const net = costs !== null && !expenseBreakdownMismatch ? revenue - costs : null;
  const money = (value) => value === null ? null : value / 100;
  return { fixedExpenses: money(fixed), variableExpenses: money(variable), expenseBreakdownComplete, expenseBreakdownMismatch,
    purchases: money(purchases), operatingExpenses: money(expenses), totalCosts: money(costs),
    grossProfit: money(gross), netProfit: money(net),
    costsMissing: purchases === null || expenses === null || expenseBreakdownMismatch,
    noRecordedCosts: costs === 0 };
}

// Strict RPC boundary: an unavailable amount is not a recorded zero.
export function closingExpenseContext(context = {}) {
  const read = value => {
    if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null;
  };
  const fixed = read(context.fixed_expense_today);
  const variable = read(context.variable_expenses_today);
  const complete = fixed !== null && variable !== null;
  return { fixed, variable, complete, total: complete ? (Math.round(fixed * 100) + Math.round(variable * 100)) / 100 : null };
}
