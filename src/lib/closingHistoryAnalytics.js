import { dailySalesProfitSummary } from './dailySalesPresentation';

export function closingRevenue(row) {
  const values = [row.restaurant_cash ?? row.cash ?? 0, row.restaurant_network ?? row.network ?? 0, row.credit ?? 0, row.custom_sources_total ?? 0].map(Number);
  if (values.some(value => !Number.isFinite(value) || value < 0)) return null;
  return values.reduce((sum, value) => sum + Math.round(value * 100), 0) / 100;
}
const scopeKey = row => {
  const branch = row.branch_id ? `id:${row.branch_id}` : row.branch ? `key:${row.branch}` : null;
  const operator = row.cashier_id || row.cashier_employee_id || row.manager_user_id;
  return row.restaurant_id && branch && row.shift && operator
    ? JSON.stringify([row.restaurant_id, branch, row.shift, operator]) : null;
};

// Compare like-for-like finalized operator shifts, never mixed branch totals.
// Only available saved history is used. Repeated dates are ambiguous and omitted.
export function buildClosingTrendIndex(records) {
  const groups = new Map();
  for (const row of records) {
    const key = scopeKey(row);
    if (!key || !row.id || !/^\d{4}-\d{2}-\d{2}$/.test(row.date || '') || (row.closing_state || 'finalized') !== 'finalized' || closingRevenue(row) === null) continue;
    if (!groups.has(key)) groups.set(key, new Map());
    const dates = groups.get(key);
    const rows = dates.get(row.date) || new Map();
    rows.set(row.id, row); dates.set(row.date, rows);
  }
  const index = new Map();
  for (const dates of groups.values()) {
    const unique = [...dates.entries()].filter(([, rows]) => rows.size === 1)
      .sort(([a], [b]) => a.localeCompare(b)).map(([, rows]) => [...rows.values()][0]);
    unique.forEach((row, i) => {
      const points = unique.slice(Math.max(0, i - 6), i + 1).map(item => ({ date: item.date, value: closingRevenue(item) }));
      const previous = points.at(-2) || null;
      index.set(row.id, { points, previous, change: previous?.value > 0 ? ((closingRevenue(row) - previous.value) / previous.value) * 100 : null });
    });
  }
  return index;
}

export function closingFinancialAnalysis(row) {
  const sales = closingRevenue(row);
  const profit = dailySalesProfitSummary(row);
  if (sales === null) { profit.grossProfit = null; profit.netProfit = null; }
  const margin = sales > 0 && !profit.costsMissing && !profit.noRecordedCosts ? profit.netProfit / sales * 100 : null;
  const allocation = sales > 0 && !profit.costsMissing && !profit.noRecordedCosts && profit.purchases >= 0 && profit.operatingExpenses >= 0 && profit.netProfit >= 0
    ? [profit.purchases, profit.operatingExpenses, profit.netProfit].map(value => value / sales * 100) : null;
  return { sales, ...profit, margin, allocation };
}
