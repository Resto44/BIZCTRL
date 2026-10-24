/**
 * Posted customer receivables are the only balance-sheet authority.
 * Draft Closing credit and customer-master cached balances never enter this
 * total. Missing/incomplete ledger reads are NOT verified zero.
 */
export function summarizePostedCustomerReceivables(rows, { complete = true } = {}) {
  if (!complete || !Array.isArray(rows)) return { amount: null, count: 0, status: 'UNAVAILABLE' };
  const byId = new Map();
  for (const row of rows) {
    if (!row || !row.id || row.type !== 'receivable' || row.party_type !== 'customer') {
      return { amount: null, count: 0, status: 'INVALID_SCOPE' };
    }
    if (byId.has(row.id) && JSON.stringify(byId.get(row.id)) !== JSON.stringify(row)) {
      return { amount: null, count: 0, status: 'DUPLICATE_CONFLICT' };
    }
    byId.set(row.id, row);
  }
  let cents = 0;
  let count = 0;
  for (const row of byId.values()) {
    if (['written_off', 'cancelled', 'canceled', 'void', 'voided', 'deleted'].includes(String(row.status || '').toLowerCase())) continue;
    // remaining_amount = 0 is valid for fully settled debts, but null is not.
    const amount = row.remaining_amount === null || row.remaining_amount === undefined ? NaN : Number(row.remaining_amount);
    if (!Number.isFinite(amount) || amount < -0.01) return { amount: null, count: 0, status: 'LEDGER_INVALID' };
    cents += Math.round(Math.max(0, amount) * 100);
    if (amount > 0) count += 1;
  }
  return { amount: Number((cents / 100).toFixed(2)), count, status: 'VERIFIED_POSTED_LEDGER' };
}
