// Network ERP analytics use final/locked Sales Closing snapshots as the
// canonical sales source. Never add settlement movements or POS line items to
// the reported card total: those are allocations, not additional revenue.
export const NETWORK_PERIODS = Object.freeze(['day', 'week', 'month', 'quarter', 'halfYear', 'year']);
const DAY_MS = 86400000;
const key = date => date.toISOString().slice(0, 10);
const atUTC = value => new Date(value + 'T00:00:00.000Z');
const move = (date, days) => new Date(date.getTime() + days * DAY_MS);
const monthStart = (date, monthsBack) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - monthsBack, 1));

export function riyadhBusinessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = type => parts.find(item => item.type === type)?.value;
  return [part('year'), part('month'), part('day')].join('-');
}

export function networkDateWindow(period, asOf = riyadhBusinessDate()) {
  if (!NETWORK_PERIODS.includes(period) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf) ||
    key(atUTC(asOf)) !== asOf) throw new Error('Invalid network analytics period or date');
  const end = atUTC(asOf);
  const start = period === 'day' ? end
    : period === 'week' ? move(end, -6)
    : monthStart(end, {month: 0, quarter: 2, halfYear: 5, year: 11}[period]);
  const elapsed = Math.round((end - start) / DAY_MS) + 1;
  const previousEnd = move(start, -1);
  return {
    period, asOf, start: key(start), end: key(end), previousStart: key(move(start, -elapsed)),
    previousEnd: key(previousEnd), days: elapsed,
  };
}

export const networkReportedAmount = sale => {
  const amount = Number(sale?.reported_network_sales ?? sale?.restaurant_network ?? sale?.network ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};
export const networkTotalSales = sale => {
  const amount = Number(sale?.total);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
};

const parsedEntries = sale => {
  try {
    const raw = typeof sale?.pos_entries_json === 'string'
      ? JSON.parse(sale.pos_entries_json) : sale?.pos_entries_json;
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
};
const alias = s => String(s || '').trim().toLocaleLowerCase().replace(/[_\s]+/g, ' ');
export const branchMatches = (sale, selected, branches = []) => {
  if (!selected || selected === 'all') return true;
  const branch = branches.find(b => String(b.id) === String(selected));
  if (!branch) return false;
  if (sale.branch_id) return String(sale.branch_id) === String(branch.id);
  const candidates = [branch.key, branch.branch_key, branch.name].map(alias).filter(Boolean);
  const unambiguous = candidates.filter(value =>
    branches.filter(b => [b.key, b.branch_key, b.name].some(name => alias(name) === value)).length === 1);
  return [sale.branch, sale.branch_key].some(v => unambiguous.includes(alias(v)));
};
const sum = (rows, getAmount) => rows.reduce((n, row) => n + getAmount(row), 0);
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const goodDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(atUTC(s).getTime());

export function networkInsights({ sales = [], accounts = [], branches = [], recons = [], window, branchId = 'all' }) {
  if (!window) throw new Error('Network analytics requires an explicit period');
  // Only the final/locked view is fed in by the tenant-scoped caller.
  const scoped = sales.filter(row => goodDate(row.date) && branchMatches(row, branchId, branches));
  const current = scoped.filter(row => row.date >= window.start && row.date <= window.end);
  const previous = scoped.filter(row => row.date >= window.previousStart && row.date <= window.previousEnd);
  const revenue = round(sum(current, networkReportedAmount));
  const priorRevenue = round(sum(previous, networkReportedAmount));
  const change = priorRevenue === 0 ? null : round((revenue - priorRevenue) * 100 / Math.abs(priorRevenue));
  const comparableDays = window.days;
  const dayTotals = new Map();
  const weekdayTotals = [0, 0, 0, 0, 0, 0, 0];
  const branchTotals = new Map();
  const accountTotals = new Map();
  let allocated = 0;
  let unattributedRecords = 0;
  let totalSales = 0;
  let totalSalesRows = 0;
  for (const sale of current) {
    const amount = networkReportedAmount(sale);
    dayTotals.set(sale.date, (dayTotals.get(sale.date) || 0) + amount);
    const day = (atUTC(sale.date).getUTCDay() + 6) % 7; // Monday first
    weekdayTotals[day] += amount;
    const branch = branches.find(b => String(b.id) === String(sale.branch_id)) ||
      branches.find(b => [b.key, b.branch_key, b.name].some(v => alias(v) === alias(sale.branch)));
    const branchName = branch?.name || sale.branch || 'Unassigned branch';
    branchTotals.set(branchName, (branchTotals.get(branchName) || 0) + amount);
    const sourceTotal = networkTotalSales(sale);
    if (sourceTotal !== null) { totalSales += sourceTotal; totalSalesRows++; }
    let rowAllocated = 0;
    for (const entry of parsedEntries(sale)) {
      const id = String(entry?.network_account_id || entry?.device_id || entry?.account_id || '').trim();
      const value = Number(entry?.amount);
      if (!id || !Number.isFinite(value) || value < 0) continue;
      rowAllocated += value;
      accountTotals.set(id, (accountTotals.get(id) || 0) + value);
    }
    allocated += rowAllocated;
    if (Math.abs(amount - rowAllocated) > 0.009) unattributedRecords++;
  }
  const intervals = new Map();
  const groupBy = window.period === 'year' || window.period === 'halfYear' ? 'month'
    : window.period === 'quarter' ? 'week' : 'day';
  // Use calendar-based UTC dates for labels; no browser time-zone boundary drift.
  for (let d = atUTC(window.start); key(d) <= window.end; d = move(d, 1)) {
    const stamp = key(d);
    const bucket = groupBy === 'month' ? stamp.slice(0, 7) :
      groupBy === 'week' ? key(move(d, -(d.getUTCDay() + 6) % 7)) : stamp;
    intervals.set(bucket, (intervals.get(bucket) || 0) + (dayTotals.get(stamp) || 0));
  }
  const trend = [...intervals.entries()].map(([date, value]) => ({date, value: round(value)}));
  const weekdays = weekdayTotals.map((value, day) => ({day: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][day], value: round(value)}));
  const byBranch = [...branchTotals.entries()].map(([name, value]) => ({name, value: round(value)})).sort((a,b) => b.value - a.value);
  const byAccount = [...accountTotals.entries()].map(([id,value]) => {
    const a = accounts.find(a => String(a.id) === id);
    return {id, name: a?.account_name || a?.network_name || 'Account not found', value: round(value)};
  }).sort((a,b) => b.value - a.value);
  const currentRecons = recons.filter(r => goodDate(r.recon_date) && r.recon_date >= window.start &&
    r.recon_date <= window.end && branchMatches(r, branchId, branches));
  const variance = round(sum(currentRecons, r => {
    const v = Number(r.variance);
    return Number.isFinite(v) ? Math.abs(v) : 0;
  }));
  const pending = currentRecons.filter(r => r.status === 'pending').length;
  const unmatched = currentRecons.filter(r => r.status === 'variance').length;
  const activeAccounts = accounts.filter(a => (a.status ? a.status === 'active' : a.is_active === true) &&
    (branchId === 'all' || branchMatches(a, branchId, branches))).length;
  const activityDays = [...dayTotals.values()].filter(v => v !== 0).length;
  return {
    revenue, priorRevenue, change, currentRows: current.length, priorRows: previous.length,
    averageDay: round(revenue / comparableDays), activeDays: activityDays,
    activeAccounts, totalAccounts: accounts.length, cardShare: totalSalesRows && totalSales > 0
      ? round(revenue * 100 / totalSales) : null,
    trend, weekdays, byBranch, byAccount, allocated: round(allocated),
    unallocated: round(revenue - allocated), unattributedRecords,
    currentRecons: currentRecons.length, pending, unmatched, variance,
    currentSales: [...current].sort((a,b) => b.date.localeCompare(a.date)),
  };
}
