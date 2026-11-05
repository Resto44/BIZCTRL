/**
 * Financially safe trend summaries of the signed retail stock ledger.
 * Counts events by local Saudi business day. Do not add incompatible
 * product units or treat transfer traffic as revenue/COGS.
 */
import { inventoryPeriodWindow, riyadhISODate } from './inventoryTrendAnalytics';

export function retailInventoryMovementSummary(rows = [], period = 'month', todayISO = riyadhISODate()) {
  const window = inventoryPeriodWindow(period, todayISO);
  const start = Date.parse(`${window.from}T00:00:00Z`);
  const days = window.days;
  const count = Math.min(7, days);
  const series = Array.from({ length: count }, (_, index) => {
    const lo = Math.floor(index * days / count);
    const hi = Math.floor((index + 1) * days / count) - 1;
    return { date: new Date(start + lo * 86400000).toISOString().slice(0, 10),
      end: new Date(start + hi * 86400000).toISOString().slice(0, 10),
      inbound: 0, outbound: 0 };
  });
  const types = new Map();
  let inbound = 0, outbound = 0;
  rows.forEach(row => {
    if (!row?.created_at) return;
    const date = riyadhISODate(new Date(row.created_at));
    if (date < window.from || date > window.to) return;
    const amount = Number(row.quantity);
    if (!Number.isFinite(amount) || amount === 0) return;
    const isIn = amount > 0;
    const offset = Math.floor((Date.parse(`${date}T00:00:00Z`) - start) / 86400000);
    const bucket = Math.min(count - 1, Math.floor(offset * count / days));
    if (!series[bucket]) return;
    if (isIn) { inbound++; series[bucket].inbound++; }
    else { outbound++; series[bucket].outbound++; }
    const type = String(row.kind || 'other');
    types.set(type, (types.get(type) || 0) + 1);
  });
  return {
    window, series, inbound, outbound, total: inbound + outbound,
    kinds: [...types].map(([name, value]) => ({ name, value })).sort((a,b) => b.value-a.value),
  };
}

export function nextRiyadhDay(dateISO) {
  return new Date(Date.parse(`${dateISO}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
}
