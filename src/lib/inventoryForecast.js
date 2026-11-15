import { latestInventorySnapshots } from './inventorySnapshotView';
import { riyadhISODate } from './inventoryTrendAnalytics';

const DAY = 86400000;
const number = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
export function forecastWindow(days = 30, today = riyadhISODate()) {
  if (![30, 60, 90].includes(days)) throw new Error('Invalid forecast period');
  const end = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(end)) throw new Error('Invalid forecast date');
  return { from: new Date(end - (days - 1) * DAY).toISOString().slice(0, 10), to: today };
}

/** Purchases are inbound stock, never demand. Do not invent usage or unit conversions. */
export function buildInventoryForecast({ inventory = [], consumption = [], branches = [], days = 30, today } = {}) {
  const range = forecastWindow(days, today);
  const aliases = new Map();
  for (const b of branches) for (const key of [b.id, b.branch_key, b.key, b.name]) {
    if (key) aliases.set(String(key), String(b.id || b.branch_key || b.key));
  }
  const branch = row => aliases.get(String(row.branch_id || row.branch || '')) || String(row.branch_id || row.branch || '');
  const unit = row => String(row.unit || '').trim().toLowerCase();
  const key = row => JSON.stringify([String(row.product_id || ''), branch(row), unit(row)]);
  const usage = new Map();
  const seen = new Set();
  const outgoing = new Set(['recipe_consumption', 'consumption', 'sale', 'usage', 'ingredient_usage', 'production_consumption', 'stock_out', 'waste']);
  for (const row of consumption) {
    const date = String(row.created_date || row.date || '').slice(0, 10);
    const qty = number(row.quantity);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !row.product_id || !branch(row) || !unit(row) || qty === null || date < range.from || date > range.to) continue;
    if (!outgoing.has(row.transaction_type) && row.transaction_type !== 'consumption_return') continue;
    if (row.id && seen.has(row.id)) continue;
    if (row.id) seen.add(row.id);
    const delta = row.transaction_type === 'consumption_return' ? -Math.abs(qty) : Math.abs(qty);
    usage.set(key(row), (usage.get(key(row)) || 0) + delta);
  }
  return latestInventorySnapshots(inventory, branches).map(row => {
    const consumed = usage.get(key(row));
    const daily = consumed > 0 ? consumed / days : null;
    // quantity is maintained atomically by database stock movements. Opening balance is not current stock.
    const stock = number(row.quantity);
    const daysLeft = daily !== null && stock !== null ? Math.max(0, Math.floor(stock / daily)) : null;
    const b = branches.find(b => String(b.id || b.key) === branch(row));
    return { product_id: row.product_id, product_name: row.product_name || String(row.product_id || ''),
      branch_id: branch(row), branch: b?.name || b?.label || row.branch || branch(row), unit: row.unit || '',
      avgDaily: daily, currentStock: stock, daysLeft,
      needsReorder: daysLeft !== null && daysLeft <= 7 };
  }).sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
}
