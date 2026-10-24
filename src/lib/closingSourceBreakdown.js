/** Source details explain posted tender totals; they must never be added to them. */
export function closingSourceBreakdown(records, sources = []) {
  const amounts = new Map();
  for (const record of records) {
    let entries = record.sales_sources_json;
    if (typeof entries === 'string') {
      try { entries = JSON.parse(entries); } catch { continue; }
    }
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || entry.included_in_revenue === false) continue;
      const config = sources.find(source => (entry.source_id && source.id === entry.source_id) || (entry.source_key && source.system_key === entry.source_key));
      if (config?.is_system || (record.closing_state !== 'finalized' && config?.included_in_revenue === false)) continue;
      const key = config?.id || entry.source_id || entry.source_key;
      const amount = Number(entry.amount ?? entry.today_amount);
      if (!key || !Number.isFinite(amount) || amount <= 0) continue;
      amounts.set(key, (amounts.get(key) || 0) + amount);
    }
  }
  return Object.fromEntries(amounts);
}
