const records = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

export const salesSourceAmount = (value) => Math.max(0, Number(value) || 0);

// This deliberately reads only the editable Today values. Previous is a
// presentation and audit value derived from finalized history; it is never
// returned as current-period revenue.
export const salesSourceTodayTotal = (summaries) => records(summaries)
  .reduce((total, summary) => total + salesSourceAmount(summary?.today), 0);

// A closing keeps one immutable snapshot per active source. `amount` remains
// the canonical daily amount used by existing ledger and balance readers;
// `previous_amount` and `total_amount` make the historical context explicit
// without ever being recognized as a new revenue amount.
export const buildSalesSourceClosingSnapshots = (summaries, scope = {}) => records(summaries)
  .filter(({ source }) => Boolean(source?.id))
  .map(({ source, today, previous, total }) => {
    const currentToday = salesSourceAmount(today);
    const historicalPrevious = salesSourceAmount(previous);
    return {
      source_id: source.id,
      source_key: source.system_key || source.id,
      name_en: source.name_en || '',
      name_ar: source.name_ar || null,
      subcategory: source.subcategory || source.category || null,
      amount: currentToday,
      today_amount: currentToday,
      previous_amount: historicalPrevious,
      total_amount: salesSourceAmount(total ?? historicalPrevious + currentToday),
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
    };
  });
