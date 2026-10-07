// Reuse persisted source fields so existing branch-scoped RPCs need no schema change.
export const isCustomerCreditSource = source => source?.system_key === 'credit'
  || (source?.requires_customer === true && source?.default_payment_method === 'credit' && source?.allows_driver_entries !== true);
export const customerCreditSourcePatch = enabled => enabled ? {
  requires_customer: true, default_payment_method: 'credit', allows_driver_entries: false,
  included_in_revenue: true, included_in_profit_calc: true,
  included_in_cash_register: false, requires_pos_device: false, requires_wallet: false, requires_reference: false,
} : { requires_customer: false, default_payment_method: 'cash' };
export const creditEntrySourceId = (entry, sources) => entry.source_id || sources[0]?.id || '';
export function customerCreditSnapshots(sources, entries) {
  const totals = new Map();
  for (const entry of entries) {
    const amount = Number(entry.amount) || 0;
    if (amount <= 0) continue;
    const id = creditEntrySourceId(entry, sources);
    if (!sources.some(source => source.id === id)) throw new Error('Select an active customer credit sales source.');
    totals.set(id, (totals.get(id) || 0) + amount);
  }
  return sources.filter(source => totals.has(source.id)).map(source => {
    const amount = Math.round(totals.get(source.id) * 100) / 100;
    return {
      source_id: source.id, source_key: source.system_key || source.id,
      name_en: source.name_en || 'Customer Credit', name_ar: source.name_ar || null,
      subcategory: source.subcategory || source.category || null,
      amount, today_amount: amount, previous_amount: 0, total_amount: amount,
      default_payment_method: 'credit', payment_method: 'credit', payment_bucket: 'credit', included_in_revenue: true,
    };
  });
}
