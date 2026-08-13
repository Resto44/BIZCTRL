import { format, startOfDay, startOfMonth, startOfWeek, startOfYear, subDays } from 'date-fns';

export const DRIVER_ANALYTICS_PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
];

const number = (value) => Number(value) || 0;

export function getDriverAnalyticsDateRange(period, now = new Date()) {
  const today = startOfDay(now);
  let start = today;
  let end = today;

  if (period === 'yesterday') {
    start = startOfDay(subDays(today, 1));
    end = start;
  } else if (period === 'week') {
    start = startOfWeek(today, { weekStartsOn: 1 });
  } else if (period === 'month') {
    start = startOfMonth(today);
  } else if (period === 'year') {
    start = startOfYear(today);
  }

  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
  };
}

export function getCustomSourcesTotal(sale = {}) {
  if (number(sale.custom_sources_total) > 0) return number(sale.custom_sources_total);
  if (!sale.sales_sources_json) return 0;

  try {
    const entries = JSON.parse(sale.sales_sources_json);
    return Array.isArray(entries)
      ? entries.reduce((total, entry) => total + number(entry?.amount), 0)
      : 0;
  } catch {
    return 0;
  }
}

const amountsFromDriverEntry = (entry = {}) => {
  const cash = number(entry.cash);
  const network = number(entry.network);
  const credit = number(entry.credit);
  return { cash, network, credit, other: 0, revenue: cash + network + credit };
};

export function getDriverSaleEntries(sale = {}) {
  // New multi-driver entries carry one snapshot element per branch driver in
  // the same daily_sales row. This is deliberately separate from normal POS.
  if (sale.drivers_json) {
    try {
      const snapshot = JSON.parse(sale.drivers_json);
      if (Array.isArray(snapshot) && snapshot.length) {
        return snapshot
          .filter((entry) => entry?.driver_id || entry?.driver_name)
          .map((entry) => ({
            driver_id: entry.driver_id || '',
            driver_name: entry.driver_name || '',
            notes: typeof entry.notes === 'string' ? entry.notes : '',
            ...amountsFromDriverEntry(entry),
          }));
      }
    } catch { /* Fall through to legacy compatibility. */ }
  }

  if (!sale.driver_id && !sale.driver_name) return [];

  // Some legacy driver entries stored only cash/network split columns.
  if (number(sale.driver_cash) > 0 || number(sale.driver_network) > 0) {
    const cash = number(sale.driver_cash);
    const network = number(sale.driver_network);
    return [{ driver_id: sale.driver_id || '', driver_name: sale.driver_name || '', notes: '', cash, network, credit: 0, other: 0, revenue: cash + network }];
  }

  // Legacy attributed records predate the dedicated snapshot. Preserve their
  // historical reporting behavior rather than rewriting existing results.
  const cash = number(sale.restaurant_cash ?? sale.cash);
  const network = number(sale.restaurant_network ?? sale.network);
  const credit = number(sale.credit);
  const other = getCustomSourcesTotal(sale);
  return [{ driver_id: sale.driver_id || '', driver_name: sale.driver_name || '', notes: '', cash, network, credit, other, revenue: cash + network + credit + other }];
}

export function getDriverSaleAmounts(sale = {}, driverId = null) {
  const entries = getDriverSaleEntries(sale);
  const entry = driverId
    ? entries.find((item) => String(item.driver_id) === String(driverId))
    : entries.at(0);
  return entry || { cash: 0, network: 0, credit: 0, other: 0, revenue: 0 };
}

export function branchMatches(record = {}, branchKey, branchId) {
  if (!branchKey && !branchId) return true;
  const matchesId = !!branchId && String(record.branch_id || '') === String(branchId);
  const matchesKey = !!branchKey && String(record.branch || record.branch_key || '') === String(branchKey);
  return matchesId || matchesKey;
}

function driverBranchMatches(driver, branchKey, branchId) {
  if (!branchKey && !branchId) return true;
  const matchesId = !!branchId && String(driver.branch_id || '') === String(branchId);
  const matchesKey = !!branchKey && String(driver.branch || driver.branch_key || '') === String(branchKey);
  return matchesId || matchesKey;
}

function saleDateMatches(sale, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  const date = String(sale?.date || '').slice(0, 10);
  if (!date) return false;
  return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
}

export function buildDriverSalesAnalytics({ drivers = [], sales = [], branchKey, branchId, dateFrom, dateTo } = {}) {
  const scopedDrivers = drivers.filter((driver) => driverBranchMatches(driver, branchKey, branchId));
  const driverById = new Map(scopedDrivers.map((driver) => [String(driver.id), driver]));
  const driverByName = new Map(scopedDrivers.map((driver) => [String(driver.full_name || '').trim().toLowerCase(), driver]));

  const rows = new Map(scopedDrivers.map((driver) => [String(driver.id), {
    driverId: driver.id,
    name: driver.full_name || 'Unnamed driver',
    branch: driver.branch || driver.branch_key || '',
    branchId: driver.branch_id || null,
    active: driver.is_active !== false && driver.status !== 'inactive',
    orders: 0,
    cash: 0,
    network: 0,
    credit: 0,
    other: 0,
    revenue: 0,
  }]));

  sales.forEach((sale) => {
    if (!branchMatches(sale, branchKey, branchId) || !saleDateMatches(sale, dateFrom, dateTo)) return;
    getDriverSaleEntries(sale).forEach((entry) => {
      const linkedDriver = entry.driver_id
        ? driverById.get(String(entry.driver_id))
        : driverByName.get(String(entry.driver_name || '').trim().toLowerCase());
      if (!linkedDriver) return;

      const row = rows.get(String(linkedDriver.id));
      row.orders += 1;
      row.cash += entry.cash;
      row.network += entry.network;
      row.credit += entry.credit;
      row.other += entry.other;
      row.revenue += entry.revenue;
    });
  });

  const driverRows = Array.from(rows.values())
    .map((row) => ({ ...row, averageSale: row.orders > 0 ? row.revenue / row.orders : 0 }))
    .sort((left, right) => right.revenue - left.revenue || right.orders - left.orders || left.name.localeCompare(right.name));

  const totals = driverRows.reduce((summary, row) => ({
    drivers: summary.drivers + 1,
    activeDrivers: summary.activeDrivers + (row.active ? 1 : 0),
    orders: summary.orders + row.orders,
    cash: summary.cash + row.cash,
    network: summary.network + row.network,
    credit: summary.credit + row.credit,
    other: summary.other + row.other,
    revenue: summary.revenue + row.revenue,
  }), { drivers: 0, activeDrivers: 0, orders: 0, cash: 0, network: 0, credit: 0, other: 0, revenue: 0 });

  return {
    driverRows,
    rankedDrivers: driverRows.filter((row) => row.orders > 0).slice(0, 10),
    totals,
  };
}

export function buildBranchDriverAnalytics({ drivers = [], sales = [], branches = [], dateFrom, dateTo } = {}) {
  return branches.map((branch) => {
    const branchKey = branch.key || branch.branch_key || '';
    const branchId = branch.id || null;
    const analytics = buildDriverSalesAnalytics({ drivers, sales, branchKey, branchId, dateFrom, dateTo });
    return {
      branchId,
      branchKey,
      branchName: branch.label || branch.name || branchKey,
      ...analytics.totals,
    };
  }).sort((left, right) => right.revenue - left.revenue || left.branchName.localeCompare(right.branchName));
}
