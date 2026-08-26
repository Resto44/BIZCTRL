import { format, startOfDay, startOfMonth, startOfWeek, startOfYear, subDays } from 'date-fns';

export const DRIVER_ANALYTICS_PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
];

const number = (value) => Number(value) || 0;
const records = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

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
    const entries = typeof sale.sales_sources_json === 'string'
      ? JSON.parse(sale.sales_sources_json)
      : sale.sales_sources_json;
    return records(entries).reduce((total, entry) => total + number(entry?.amount), 0);
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

// Legacy snapshot parsing remains only for historical callers. New Driver
// Analytics callers supply canonical driver_sales_entries and never aggregate
// these legacy daily_sales fields, preventing duplicate revenue recognition.
export function getDriverSaleEntries(sale = {}) {
  if (sale.drivers_json) {
    try {
      const snapshot = typeof sale.drivers_json === 'string' ? JSON.parse(sale.drivers_json) : sale.drivers_json;
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

  if (number(sale.driver_cash) > 0 || number(sale.driver_network) > 0) {
    const cash = number(sale.driver_cash);
    const network = number(sale.driver_network);
    return [{ driver_id: sale.driver_id || '', driver_name: sale.driver_name || '', notes: '', cash, network, credit: 0, other: 0, revenue: cash + network }];
  }

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

export function paymentBucketForDriverSale(value) {
  const code = String(value || '').trim().toLowerCase();
  if (['cash', 'cash_on_delivery', 'cod'].includes(code)) return 'cash';
  if (['card', 'network', 'pos', 'visa', 'mastercard', 'mada'].includes(code)) return 'network';
  if (['credit', 'customer_credit', 'on_account'].includes(code)) return 'credit';
  return 'other';
}

export function canonicalDriverSaleAmounts(entry = {}) {
  const revenue = Math.max(0, number(entry.amount ?? entry.today_amount));
  const bucket = paymentBucketForDriverSale(entry.payment_method ?? entry.payment_bucket);
  return {
    cash: bucket === 'cash' ? revenue : 0,
    network: bucket === 'network' ? revenue : 0,
    credit: bucket === 'credit' ? revenue : 0,
    other: bucket === 'other' ? revenue : 0,
    revenue,
  };
}

export function isFinalizedDriverSale(entry = {}) {
  const status = String(entry.status || '').toLowerCase();
  const closingState = String(entry.closing_state || '').toLowerCase();
  return status === 'finalized' || closingState === 'finalized' || Boolean(entry.finalized_at);
}

function buildRows(drivers, branchKey, branchId) {
  const scopedDrivers = records(drivers).filter((driver) => driverBranchMatches(driver, branchKey, branchId));
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
  return { scopedDrivers, rows };
}

function summarizeRows(rows) {
  const driverRows = Array.from(rows.values())
    .map((row) => ({ ...row, averageSale: row.orders > 0 ? row.revenue / row.orders : 0 }))
    .sort((left, right) => right.revenue - left.revenue || left.name.localeCompare(right.name));

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

function addCanonicalDriverSales({ rows, driverEntries, branchKey, branchId, dateFrom, dateTo }) {
  records(driverEntries).forEach((entry) => {
    if (!isFinalizedDriverSale(entry) || !branchMatches(entry, branchKey, branchId) || !saleDateMatches(entry, dateFrom, dateTo)) return;
    const driverId = String(entry.driver_id || '');
    const row = rows.get(driverId);
    if (!row) return;
    // A database transaction already enforces this relationship. This client
    // guard ensures stale or malformed responses cannot cross branch analytics.
    if (entry.branch_id && row.branchId && String(entry.branch_id) !== String(row.branchId)) return;

    const amounts = canonicalDriverSaleAmounts(entry);
    row.orders += 1;
    row.cash += amounts.cash;
    row.network += amounts.network;
    row.credit += amounts.credit;
    row.other += amounts.other;
    row.revenue += amounts.revenue;
  });
}

function addLegacyDriverSnapshots({ rows, drivers, sales, branchKey, branchId, dateFrom, dateTo }) {
  const driverById = new Map(records(drivers).map((driver) => [String(driver.id), driver]));
  const driverByName = new Map(records(drivers).map((driver) => [String(driver.full_name || '').trim().toLowerCase(), driver]));

  records(sales).forEach((sale) => {
    if (!branchMatches(sale, branchKey, branchId) || !saleDateMatches(sale, dateFrom, dateTo)) return;
    getDriverSaleEntries(sale).forEach((entry) => {
      const linkedDriver = entry.driver_id
        ? driverById.get(String(entry.driver_id))
        : driverByName.get(String(entry.driver_name || '').trim().toLowerCase());
      if (!linkedDriver) return;

      const row = rows.get(String(linkedDriver.id));
      if (!row) return;
      row.orders += 1;
      row.cash += entry.cash;
      row.network += entry.network;
      row.credit += entry.credit;
      row.other += entry.other;
      row.revenue += entry.revenue;
    });
  });
}

export function buildDriverSalesAnalytics({ drivers = [], sales = [], driverEntries, branchKey, branchId, dateFrom, dateTo } = {}) {
  const { scopedDrivers, rows } = buildRows(drivers, branchKey, branchId);

  // Supplying canonical entries opts into the production data source, even when
  // the period has no rows. Legacy snapshots are never combined with this path.
  if (Array.isArray(driverEntries)) {
    addCanonicalDriverSales({ rows, driverEntries, branchKey, branchId, dateFrom, dateTo });
  } else {
    addLegacyDriverSnapshots({ rows, drivers: scopedDrivers, sales, branchKey, branchId, dateFrom, dateTo });
  }

  return summarizeRows(rows);
}

export function buildBranchDriverAnalytics({ drivers = [], sales = [], driverEntries, branches = [], dateFrom, dateTo } = {}) {
  return records(branches).map((branch) => {
    const branchKey = branch.key || branch.branch_key || '';
    const branchId = branch.id || null;
    const analytics = buildDriverSalesAnalytics({ drivers, sales, driverEntries, branchKey, branchId, dateFrom, dateTo });
    return {
      branchId,
      branchKey,
      branchName: branch.label || branch.name || branchKey,
      ...analytics.totals,
    };
  }).sort((left, right) => right.revenue - left.revenue || left.branchName.localeCompare(right.branchName));
}

export function buildDriverTrendAnalytics({
  drivers = [],
  sales = [],
  driverEntries,
  branches = [],
  branchKey,
  branchId,
  dateFrom,
  dateTo,
} = {}) {
  const analytics = buildDriverSalesAnalytics({
    drivers,
    sales,
    driverEntries,
    branchKey,
    branchId,
    dateFrom,
    dateTo,
  });

  const scopedBranches = records(branches).filter((branch) => {
    if (!branchKey && !branchId) return true;
    return branchMatches({
      branch_id: branch.id,
      branch: branch.key || branch.branch_key,
    }, branchKey, branchId);
  });
  const branchRows = buildBranchDriverAnalytics({
    drivers,
    sales,
    driverEntries,
    branches: scopedBranches,
    dateFrom,
    dateTo,
  });
  const branchNames = new Map(branchRows.flatMap((row) => [
    [String(row.branchId || ''), row.branchName],
    [String(row.branchKey || ''), row.branchName],
  ]));

  const driverRows = analytics.driverRows.map((row) => ({
    ...row,
    branchName: branchNames.get(String(row.branchId || ''))
      || branchNames.get(String(row.branch || ''))
      || row.branch
      || 'Unassigned branch',
  }));

  const datedRecords = Array.isArray(driverEntries) ? records(driverEntries) : records(sales);
  const dates = Array.from(new Set(
    datedRecords
      .filter((record) => branchMatches(record, branchKey, branchId) && saleDateMatches(record, dateFrom, dateTo))
      .map((record) => String(record.date || '').slice(0, 10))
      .filter(Boolean),
  )).sort((left, right) => left.localeCompare(right));

  const trendRows = dates.map((date) => {
    const daily = buildDriverSalesAnalytics({
      drivers,
      sales,
      driverEntries,
      branchKey,
      branchId,
      dateFrom: date,
      dateTo: date,
    }).totals;
    return {
      date,
      label: date.slice(5),
      ...daily,
    };
  });

  return {
    ...analytics,
    branchRows,
    driverRows,
    trendRows,
  };
}
