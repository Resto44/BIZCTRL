import { sourceDisplayName } from './erpPaymentAnalytics';

/**
 * Owner source analytics are a drill-down of finalized Sales Closing records.
 * Source allocations are not additive revenue, and a source entry is not a POS
 * order: one closing may hold multiple sources and multiple orders.
 */
const amount = (value) => {
  if (value == null || value === '') return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const parseEntries = (raw) => {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

export function buildOwnerOrderSourceAnalytics({ sales = [], revenueSources = [], lang = 'en', verifiedSales = 0 } = {}) {
  const configs = new Map();
  for (const source of revenueSources) {
    for (const key of [source.id, source.source_key, source.system_key]) {
      if (key != null && String(key).trim()) configs.set(String(key), source);
    }
  }

  const totals = new Map();
  for (const closing of sales) {
    if (closing?.closing_state && !['finalized', 'locked'].includes(String(closing.closing_state).toLowerCase())) continue;
    for (const entry of parseEntries(closing?.sales_sources_json)) {
      if (!entry || typeof entry !== 'object' || entry.included_in_revenue === false) continue;
      const key = String(entry.source_id || entry.source_key || entry.name_en || entry.name_ar || '').trim();
      if (!key) continue;
      const config = configs.get(key);
      if (config?.included_in_revenue === false) continue;
      const value = amount(entry.amount ?? entry.today_amount);
      if (value <= 0) continue;
      const previous = totals.get(key);
      totals.set(key, {
        key,
        name: sourceDisplayName(entry, lang, config),
        amount: (previous?.amount || 0) + value,
        closingCount: (previous?.closingCount || 0) + 1,
      });
    }
  }

  const sources = [...totals.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  const allocatedTotal = sources.reduce((sum, source) => sum + source.amount, 0);
  const salesTotal = amount(verifiedSales);
  return {
    sources: sources.map((source) => ({
      ...source,
      share: allocatedTotal > 0 ? (source.amount / allocatedTotal) * 100 : 0,
    })),
    allocatedTotal,
    verifiedSales: salesTotal,
    difference: salesTotal - allocatedTotal,
    reconciled: Math.abs(salesTotal - allocatedTotal) < 0.01,
  };
}
