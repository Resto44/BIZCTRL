// Verified summary projection for the Owner Executive dashboard.
// Sales buckets are mutually exclusive. The physical drawer cash is a balance,
// not a payment source; it must never participate in sales mix calculations.
const valid = value => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const moneyChange = (current, previous) => {
  const before = valid(previous);
  const now = valid(current);
  return before != null && before > 0 && now != null ? ((now - before) / before) * 100 : null;
};

export function buildExecutiveSnapshotPresentation({
  periodMetrics = {}, previousPeriodMetrics = {}, revenueTrend = [], periodKey = 'today',
} = {}) {
  const sales = valid(periodMetrics.totalSales) ?? 0;
  const methods = [
    { key: 'cash', amount: valid(periodMetrics.totalCash) ?? 0, color: '#10b981' },
    { key: 'network', amount: valid(periodMetrics.totalNetwork) ?? 0, color: '#2563eb' },
    { key: 'credit', amount: valid(periodMetrics.totalCredit) ?? 0, color: '#8b5cf6' },
    { key: 'otherSources', amount: valid(periodMetrics.totalAdditionalSources) ?? 0, color: '#f59e0b' },
  ].map(method => ({
    ...method,
    percent: sales > 0 ? Math.max(0, (method.amount / sales) * 100) : 0,
  }));
  const methodsTotal = methods.reduce((total, item) => total + item.amount, 0);
  const reconciled = Math.abs(methodsTotal - sales) < 0.01;
  const monthly = periodKey === 'year' || periodKey === 'six-months';
  const series = new Map();
  for (const item of Array.isArray(revenueTrend) ? revenueTrend : []) {
    if (!item?.date || !Number.isFinite(Number(item?.sales))) continue;
    const date = String(item.date);
    const key = monthly ? date.slice(0, 7) : date;
    series.set(key, (series.get(key) || 0) + Number(item.sales));
  }
  const trend = [...series.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, sales: amount }));

  return {
    sales, methods, methodsTotal, reconciled, trend,
    salesChange: moneyChange(sales, previousPeriodMetrics.totalSales),
    profitChange: moneyChange(periodMetrics.netProfit, previousPeriodMetrics.netProfit),
    marginChangePoints: (valid(previousPeriodMetrics.totalSales) ?? 0) > 0
      && valid(previousPeriodMetrics.netMargin) != null
      && valid(periodMetrics.netMargin) != null
      ? periodMetrics.netMargin - previousPeriodMetrics.netMargin : null,
  };
}
