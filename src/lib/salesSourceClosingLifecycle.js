const records = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

export const salesSourceAmount = (value) => Math.max(0, Number(value) || 0);

const hasValue = (value) => value !== undefined && value !== null && value !== '';

export const driverSourceEntryAmounts = (entry = {}) => {
  const hasSplitAmounts = hasValue(entry.cash_amount)
    || hasValue(entry.network_amount)
    || hasValue(entry.cash)
    || hasValue(entry.network);

  if (hasSplitAmounts) {
    const cash = salesSourceAmount(entry.cash_amount ?? entry.cash);
    const network = salesSourceAmount(entry.network_amount ?? entry.network);
    return { cash, network, total: cash + network };
  }

  const total = salesSourceAmount(entry.amount ?? entry.today_amount ?? entry.total_amount);
  const paymentMethod = String(entry.payment_method ?? entry.payment_bucket ?? 'cash').trim().toLowerCase();
  return {
    cash: ['cash', 'cash_on_delivery', 'cod'].includes(paymentMethod) ? total : 0,
    network: ['card', 'network', 'pos', 'visa', 'mastercard', 'mada', 'bank', 'bank_transfer', 'transfer', 'iban', 'online', 'digital', 'gateway', 'wallet', 'e_wallet', 'ewallet'].includes(paymentMethod) ? total : 0,
    total,
  };
};

export const driverSourcePaymentBreakdown = (value) => records(value)
  .reduce((totals, entry) => {
    const amounts = driverSourceEntryAmounts(entry);
    totals.cash += amounts.cash;
    totals.network += amounts.network;
    totals.total += amounts.total;
    return totals;
  }, { cash: 0, network: 0, total: 0 });

export const driverSourceEntries = (value) => records(value)
  .map((entry) => {
    const amounts = driverSourceEntryAmounts(entry);
    return {
      client_row_id: entry?.client_row_id || entry?.id || '',
      driver_id: entry?.driver_id || '',
      driver_name: entry?.driver_name || '',
      sales_source_id: entry?.sales_source_id || entry?.source_id || '',
      subcategory: entry?.subcategory || 'Drivers',
      date: entry?.date || null,
      branch_id: entry?.branch_id || null,
      branch: entry?.branch || null,
      shift: entry?.shift || null,
      cash_amount: amounts.cash,
      network_amount: amounts.network,
      total_amount: amounts.total,
      amount: amounts.total,
      today_amount: amounts.total,
      // Retained only for legacy readers. New code uses the persisted split values.
      payment_method: amounts.cash > 0 && amounts.network > 0 ? 'mixed' : (amounts.network > 0 ? 'card' : 'cash'),
      payment_bucket: amounts.cash > 0 && amounts.network > 0 ? 'mixed' : (amounts.network > 0 ? 'network' : 'cash'),
      notes: entry?.notes || '',
    };
  })
  .filter((entry) => entry.driver_id && entry.total_amount > 0);

export const driverSourceTodayTotal = (value) => driverSourcePaymentBreakdown(value).total;

// This deliberately reads only the editable Today values. Previous is a
// presentation and audit value derived from finalized history; it is never
// returned as current-period revenue.
export const salesSourceTodayTotal = (summaries) => records(summaries)
  .reduce((total, summary) => total + salesSourceAmount(summary?.today), 0);

// A closing keeps one immutable snapshot per active source. `amount` remains
// the canonical daily amount used by existing ledger and balance readers;
// `previous_amount` and `total_amount` make the historical context explicit
// without ever being recognized as new revenue. Driver source totals are always
// regenerated from driver entries so a manual source total cannot be double
// counted beside its driver breakdown.
export const buildSalesSourceClosingSnapshots = (summaries, scope = {}) => records(summaries)
  .filter(({ source }) => Boolean(source?.id))
  .map(({ source, today, previous, total, driverEntries }) => {
    const entries = source.allows_driver_entries === true ? driverSourceEntries(driverEntries) : [];
    const currentToday = entries.length ? driverSourceTodayTotal(entries) : salesSourceAmount(today);
    const historicalPrevious = salesSourceAmount(previous);
    return {
      source_id: source.id,
      source_key: source.system_key || source.id,
      name_en: source.name_en || '',
      name_ar: source.name_ar || null,
      subcategory: source.subcategory || source.category || null,
      allows_driver_entries: source.allows_driver_entries === true,
      amount: currentToday,
      today_amount: currentToday,
      previous_amount: historicalPrevious,
      total_amount: entries.length ? historicalPrevious + currentToday : salesSourceAmount(total ?? historicalPrevious + currentToday),
      default_payment_method: source.default_payment_method || 'cash',
      payment_method: source.default_payment_method || 'cash',
      payment_bucket: source.payment_bucket || null,
      included_in_revenue: source.included_in_revenue !== false,
      branch_id: scope.branchId || null,
      branch: scope.branch || null,
      date: scope.date || null,
      shift: scope.shift || null,
      cashier_id: scope.cashierId || null,
      cashier_name: scope.cashierName || null,
      ...(source.allows_driver_entries === true ? {
        driver_entries: entries.map((entry) => ({
          ...entry,
          sales_source_id: source.id,
          subcategory: source.subcategory || entry.subcategory || 'Drivers',
          date: scope.date || entry.date || null,
          branch_id: scope.branchId || entry.branch_id || null,
          branch: scope.branch || entry.branch || null,
          shift: scope.shift || entry.shift || null,
        })),
      } : {}),
    };
  });
