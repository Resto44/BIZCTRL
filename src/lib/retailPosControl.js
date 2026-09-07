const RIYADH_TIME_ZONE = 'Asia/Riyadh';

const EMPTY_SUMMARY = Object.freeze({
  branch_count: 0,
  device_count: 0,
  online_device_count: 0,
  transaction_count: 0,
  net_sales: 0,
  cash_total: 0,
  mada_total: 0,
  apple_pay_total: 0,
  credit_total: 0,
  refunds: 0,
  voids: 0,
  purchase_total: 0,
  expense_total: 0,
  pending_approvals: 0,
  critical_alerts: 0,
});

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function riyadhDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: RIYADH_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

function dateKey({ year, month, day }) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftDate(parts, days) {
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

function startOfRiyadhWeek(parts) {
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return shiftDate(parts, -weekday);
}

export function buildRetailPosPeriod(period = 'today', now = new Date()) {
  const today = riyadhDateParts(now);
  let fromParts = today;
  let toParts = shiftDate(today, 1);

  if (period === 'week') {
    fromParts = startOfRiyadhWeek(today);
  } else if (period === 'month') {
    fromParts = { ...today, day: 1 };
  }

  return {
    key: period,
    from: `${dateKey(fromParts)}T00:00:00+03:00`,
    to: `${dateKey(toParts)}T00:00:00+03:00`,
    fromDate: dateKey(fromParts),
    toDate: dateKey(shiftDate(toParts, -1)),
  };
}

export function normalizeRetailPosSnapshot(value) {
  const snapshot = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    period: snapshot.period || null,
    summary: { ...EMPTY_SUMMARY, ...(snapshot.summary || {}) },
    branches: Array.isArray(snapshot.branches) ? snapshot.branches : [],
    devices: Array.isArray(snapshot.devices) ? snapshot.devices : [],
    transactions: Array.isArray(snapshot.transactions) ? snapshot.transactions : [],
    events: Array.isArray(snapshot.events) ? snapshot.events : [],
    approvals: Array.isArray(snapshot.approvals) ? snapshot.approvals : [],
    salesSeries: Array.isArray(snapshot.sales_series) ? snapshot.sales_series : [],
  };
}

export function calculateRetailPosExecutive(summary = EMPTY_SUMMARY) {
  const sales = numeric(summary.net_sales);
  const purchases = numeric(summary.purchase_total);
  const expenses = numeric(summary.expense_total);
  return {
    sales,
    purchases,
    expenses,
    netProfit: sales - purchases - expenses,
    transactionCount: numeric(summary.transaction_count),
    branchCount: numeric(summary.branch_count),
    deviceCount: numeric(summary.device_count),
    onlineDeviceCount: numeric(summary.online_device_count),
    offlineDeviceCount: Math.max(0, numeric(summary.device_count) - numeric(summary.online_device_count)),
  };
}

export function deviceIsLive(device, now = new Date()) {
  if (!device || device.status !== 'online' || !device.last_seen_at) return false;
  const lastSeen = new Date(device.last_seen_at).getTime();
  return Number.isFinite(lastSeen) && now.getTime() - lastSeen <= 5 * 60 * 1000;
}

export function paymentLabel(payments = []) {
  if (!Array.isArray(payments) || payments.length === 0) return '—';
  return payments.map((payment) => payment.method || payment.payment_method).filter(Boolean).join(' + ') || '—';
}

export function terminalExpectedCash(device) {
  return numeric(device?.opening_cash) + numeric(device?.cash_total);
}

export function terminalCashDifference(device) {
  if (device?.cash_difference !== null && device?.cash_difference !== undefined) return numeric(device.cash_difference);
  if (device?.counted_cash === null || device?.counted_cash === undefined) return null;
  return numeric(device.counted_cash) - terminalExpectedCash(device);
}

export function groupDevicesByBranch(devices = []) {
  const grouped = new Map();
  devices.forEach((device) => {
    const key = String(device.branch_id || 'unassigned');
    const list = grouped.get(key) || [];
    list.push(device);
    grouped.set(key, list);
  });
  grouped.forEach((list) => list.sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true })));
  return grouped;
}

export function severityRank(value) {
  return value === 'critical' ? 3 : value === 'warning' ? 2 : 1;
}

export function buildRetailPosAuditRows(events = [], approvals = []) {
  const eventRows = events.map((event) => ({
    id: `event-${event.id}`,
    source: 'event',
    occurredAt: event.occurred_at,
    severity: event.severity || 'info',
    branchName: event.branch_name,
    deviceCode: event.device_code,
    cashierName: event.details?.cashier_name || '',
    type: event.event_type,
    title: event.title,
    amount: numeric(event.details?.amount ?? event.details?.cash_difference),
    status: event.details?.status || 'recorded',
    raw: event,
  }));
  const approvalRows = approvals.map((request) => ({
    id: `approval-${request.id}`,
    source: 'approval',
    occurredAt: request.created_at,
    severity: request.status === 'pending' ? 'warning' : 'info',
    branchName: request.branch_name,
    deviceCode: request.device_code,
    cashierName: request.cashier_name || '',
    type: request.request_type,
    title: request.reason,
    amount: numeric(request.amount),
    status: request.status,
    raw: request,
  }));
  return [...eventRows, ...approvalRows].sort((a, b) => {
    const rank = severityRank(b.severity) - severityRank(a.severity);
    return rank || new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime();
  });
}

export const RETAIL_POS_REALTIME_TABLES = Object.freeze([
  'retail_pos_devices',
  'retail_pos_shifts',
  'retail_pos_transactions',
  'retail_pos_device_events',
  'retail_pos_approval_requests',
  'retail_pos_device_commands',
]);
