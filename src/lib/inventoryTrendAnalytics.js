/**
 * Restaurant inventory insight calculations.
 * Only available purchase and waste records are used for movement trends.
 * Sales-driven consumption and historical stock valuation are deliberately
 * excluded until a verified stock ledger/BOM integration exists.
 */
const DAY_MS = 86400000;
export const INVENTORY_PERIOD_DAYS = Object.freeze({
  day: 1, week: 7, month: 30, quarter: 90, half: 180, year: 365,
});

const finite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export function riyadhISODate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

const isoUTC = timestamp => new Date(timestamp).toISOString().slice(0, 10);
const utcDate = iso => Date.parse(`${iso}T00:00:00Z`);

export function inventoryPeriodWindow(period = 'month', todayISO = riyadhISODate()) {
  const days = INVENTORY_PERIOD_DAYS[period] || INVENTORY_PERIOD_DAYS.month;
  const today = utcDate(todayISO);
  if (!Number.isFinite(today)) throw new Error('Invalid stock analytics reference date');
  return { from: isoUTC(today - (days - 1) * DAY_MS), to: todayISO, days };
}

export function inventoryRecordDate(row) {
  const value = String(row?.date || row?.created_at || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function branchKey(row) {
  return String(row?.branch_id || row?.branch || '');
}
function itemKey(row) {
  return `${String(row?.product_id || '')}::${branchKey(row)}`;
}

export function computeInventoryInsights(liveStock = [], purchases = [], waste = [], options = {}) {
  const window = inventoryPeriodWindow(options.period, options.todayISO || riyadhISODate());
  const inside = row => {
    const date = inventoryRecordDate(row);
    return Boolean(date && date >= window.from && date <= window.to);
  };
  const incoming = purchases.filter(inside);
  const wasted = waste.filter(inside);
  const buckets = Math.min(window.days, 7);
  const first = utcDate(window.from);
  const series = Array.from({ length: buckets }, (_, i) => {
    const fromOffset = Math.floor(i * window.days / buckets);
    const toOffset = Math.floor((i + 1) * window.days / buckets) - 1;
    return {
      date: isoUTC(first + fromOffset * DAY_MS),
      end: isoUTC(first + toOffset * DAY_MS),
      purchases: 0,
      waste: 0,
    };
  });
  const bucketFor = row => {
    const date = inventoryRecordDate(row);
    if (!date) return -1;
    const offset = Math.floor((utcDate(date) - first) / DAY_MS);
    return Math.min(buckets - 1, Math.floor(offset * buckets / window.days));
  };
  incoming.forEach(row => { const index = bucketFor(row); if (index >= 0) series[index].purchases++; });
  wasted.forEach(row => { const index = bucketFor(row); if (index >= 0) series[index].waste++; });

  const low = liveStock.filter(item => item.isLow);
  const out = liveStock.filter(item => finite(item.currentStock) <= 0);
  const branches = new Map();
  liveStock.forEach(item => {
    const key = branchKey(item);
    const current = branches.get(key) || { key, label: item.branch || key, items: 0, low: 0, out: 0 };
    current.items++;
    if (item.isLow) current.low++;
    if (finite(item.currentStock) <= 0) current.out++;
    branches.set(key, current);
  });
  const byItem = new Map();
  const addEvent = (row, type) => {
    if (!row?.product_id) return;
    const key = itemKey(row);
    const record = byItem.get(key) || { purchaseEvents: 0, wasteEvents: 0, purchasedQty: 0, wastedQty: 0 };
    if (type === 'purchase') {
      record.purchaseEvents++;
      record.purchasedQty += finite(row.qty ?? row.quantity);
    } else {
      record.wasteEvents++;
      record.wastedQty += finite(row.qty ?? row.quantity);
    }
    byItem.set(key, record);
  };
  incoming.forEach(row => addEvent(row, 'purchase'));
  wasted.forEach(row => addEvent(row, 'waste'));

  const atRisk = [...low].sort((a, b) => {
    const ratio = item => finite(item.currentStock) / Math.max(1, finite(item.low_stock_threshold));
    return ratio(a) - ratio(b);
  });

  return {
    window, series, incomingCount: incoming.length, wasteCount: wasted.length,
    itemsCount: liveStock.length, lowCount: low.length, outCount: out.length,
    lowPercent: liveStock.length ? low.length / liveStock.length * 100 : 0,
    atRisk, branches: [...branches.values()].sort((a, b) => b.low - a.low),
    byItem, limited: purchases.length >= 2000 || waste.length >= 2000,
  };
}

export function inventoryItemActivity(analytics, item) {
  return analytics.byItem.get(itemKey(item)) || {
    purchaseEvents: 0, wasteEvents: 0, purchasedQty: 0, wastedQty: 0,
  };
}
