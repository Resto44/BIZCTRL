const totals = ['credit_sale_count', 'total_credit_sales', 'total_collected', 'outstanding_balance', 'overdue_count', 'open_count'];

// Ledger aggregates own financial totals; customer profile caches can be stale.
export function mergeCustomerReportSummary(summary, customers, restaurantId) {
  const active = customers.filter(c => c.is_active !== false && (!restaurantId || c.restaurant_id === restaurantId));
  const profiles = new Map(active.map(c => [c.id, c]));
  const result = new Map();
  for (const row of summary) {
    if (restaurantId && row.restaurant_id !== restaurantId) continue;
    // Legacy rows may predate customer_id. Match only an unambiguous name.
    const matches = active.filter(c => c.name === row.customer_name);
    const profile = row.customer_id ? profiles.get(row.customer_id) : matches.length === 1 ? matches[0] : null;
    if (row.customer_id && customers.some(c => c.id === row.customer_id && c.is_active === false)) continue;
    const key = profile?.id || row.customer_id || `legacy:${row.customer_name}:${row.phone || ''}`;
    const previous = result.get(key);
    const item = previous || { ...row, ...profile, customer_name: profile?.name || row.customer_name, source: profile ? 'both' : 'summary' };
    for (const field of totals) item[field] = (previous ? Number(previous[field] || 0) : 0) + Number(row[field] || 0);
    item.last_transaction_date = [previous?.last_transaction_date, row.last_transaction_date].filter(Boolean).sort().at(-1);
    result.set(key, item);
  }
  for (const profile of active) {
    if (!result.has(profile.id)) result.set(profile.id, { ...profile, customer_name: profile.name, source: 'registered' });
  }
  return [...result.values()];
}
