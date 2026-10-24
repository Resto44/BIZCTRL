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

/**
 * Detect whether finalized Closing credit is backed by linked receivable
 * principal. This is a read-only exception report; it must NEVER create
 * missing debt, infer a customer's identity or add unposted credit to AR.
 */
export function auditPostedClosingCredit(sales, debts, { complete = true } = {}) {
  if (!complete || !Array.isArray(sales) || !Array.isArray(debts)) {
    return { status: 'UNAVAILABLE', issues: 0, unexplainedAmount: null, legacyWithoutDetails: 0 };
  }
  const linked = new Map();
  for (const debt of debts) {
    if (debt.type !== 'receivable' || debt.party_type !== 'customer' || !debt.sales_closing_id) continue;
    const key = String(debt.sales_closing_id);
    const value = Number(debt.total_amount);
    if (!Number.isFinite(value)) return { status: 'UNAVAILABLE', issues: 0, unexplainedAmount: null, legacyWithoutDetails: 0 };
    linked.set(key, (linked.get(key) || 0) + Math.round(value * 100));
  }
  let issues = 0, deltaCents = 0, legacyWithoutDetails = 0;
  const seen = new Set();
  for (const sale of sales) {
    if (String(sale.closing_state || '').toLowerCase() !== 'finalized' || !sale.id || seen.has(sale.id)) continue;
    seen.add(sale.id);
    const credit = Number(sale.credit || 0);
    if (!Number.isFinite(credit) || credit <= 0) continue;
    let entries = sale.credit_entries_json;
    if (typeof entries === 'string') {
      try { entries = JSON.parse(entries); } catch { entries = null; }
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      legacyWithoutDetails += 1;
      continue; // cannot link a specific customer; never auto-backfill
    }
    const expected = Math.round(credit * 100);
    const actual = linked.get(String(sale.id)) || 0;
    if (Math.abs(actual - expected) > 1) {
      issues += 1;
      deltaCents += Math.max(0, expected - actual);
    }
  }
  return {
    status: issues || legacyWithoutDetails ? 'REVIEW_REQUIRED' : 'CHECKED_SCOPE',
    issues, unexplainedAmount: Number((deltaCents / 100).toFixed(2)), legacyWithoutDetails,
  };
}
