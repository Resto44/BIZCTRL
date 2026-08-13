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

export function getDriverSaleAmounts(sale = {}) {
  const cash = number(sale.restaurant_cash ?? sale.cash);
  const network = number(sale.restaurant_network ?? sale.network);
  const credit = number(sale.credit);
  const other = getCustomSourcesTotal(sale);

  return {
    cash,
    network,
    credit,
    other,
    revenue: cash + network + credit + other,
  };
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

export function buildDriverSalesAnalytics({ drivers = [], sales = [], branchKey, branchId } = {}) {
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
    if (!branchMatches(sale, branchKey, branchId)) return;
    const linkedDriver = sale.driver_id
      ? driverById.get(String(sale.driver_id))
      : driverByName.get(String(sale.driver_name || '').trim().toLowerCase());
    if (!linkedDriver) return;

    const row = rows.get(String(linkedDriver.id));
    const amounts = getDriverSaleAmounts(sale);
    row.orders += 1;
    row.cash += amounts.cash;
    row.network += amounts.network;
    row.credit += amounts.credit;
    row.other += amounts.other;
    row.revenue += amounts.revenue;
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

export function buildBranchDriverAnalytics({ drivers = [], sales = [], branches = [] } = {}) {
  return branches.map((branch) => {
    const branchKey = branch.key || branch.branch_key || '';
    const branchId = branch.id || null;
    const analytics = buildDriverSalesAnalytics({ drivers, sales, branchKey, branchId });
    return {
      branchId,
      branchKey,
      branchName: branch.label || branch.name || branchKey,
      ...analytics.totals,
    };
  }).sort((left, right) => right.revenue - left.revenue || left.branchName.localeCompare(right.branchName));
}
