/**
 * Explicitly invoked, SELECT-only shadow reader for Issue #183.
 * No RPC posting, no mutation, no realtime subscriptions and NO automatic use
 * by the Owner Dashboard. The caller must already have an authenticated,
 * RLS-constrained Supabase client and authorized scope.
 *
 * This fetches evidence, NOT a transactional multi-table snapshot. Therefore
 * no financial KPI is attested as certified merely because rows were fetched.
 */
import { validateShadowScope } from './erpCanonicalShadowReconciliation.js';

const TABLES = Object.freeze({
  daily_sales: { date: 'date', legacy: 'branch' },
  supplier_invoices: { date: 'date', legacy: 'branch' },
  inventory_transactions: { date: 'created_date', legacy: 'branch' },
  expenses: { date: 'date', legacy: 'branch_key' },
  payroll_runs: { date: null, legacy: 'branch' },
  cash_movements: { date: 'date', legacy: 'branch' },
  debt_records: { date: null, legacy: 'branch' },
  wallet_transactions: { date: 'transaction_date', legacy: 'branch' },
});
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const nextDate = date => {
  const d = new Date(date + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Never accepts arbitrary caller-supplied table identifiers.
 * Query responses hitting maxRows throw instead of appearing complete.
 * A single branch with legacy names requires explicit unique mapping.
 */
export async function readCanonicalShadowEvidence({
  db, scope: rawScope, pageSize = 500, maxRows = 50000,
} = {}) {
  const scope = validateShadowScope(rawScope);
  if (!db || typeof db.from !== 'function') throw new Error('SHADOW_READ_CLIENT_REQUIRED');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000 ||
      !Number.isSafeInteger(maxRows) || maxRows < pageSize) throw new Error('SHADOW_READ_PAGE_INVALID');
  if (!ISO_DATE.test(scope.from) || !ISO_DATE.test(scope.to)) throw new Error('SHADOW_READ_DATE_INVALID');
  const legacy = scope.legacyBranchMap || {};
  const mapped = Object.entries(legacy).filter(([, id]) => scope.authorizedBranchIds.includes(id)).map(([key]) => key);
  const sources = {};
  const completeness = {};
  const diagnostics = [];
  const readPages = async (table, config, predicate) => {
    const result = [];
    for (let offset = 0; offset < maxRows; offset += pageSize) {
      let query = db.from(table).select('*').eq('restaurant_id', scope.restaurantId);
      if (predicate === 'canonical') {
        query = scope.branchId ? query.eq('branch_id', scope.branchId) : query.in('branch_id', scope.authorizedBranchIds);
      } else {
        query = query.is('branch_id', null).in(config.legacy, mapped);
      }
      if (config.date) {
        if (config.date === 'created_date' || config.date === 'transaction_date') {
          // Pre-filter only; these timestamps MUST be mapped to business_date
          // by a separately audited business-timezone/source contract.
          query = query.gte(config.date, scope.from + 'T00:00:00').lt(config.date, nextDate(scope.to) + 'T00:00:00');
        } else {
          query = query.gte(config.date, scope.from).lte(config.date, scope.to);
        }
      }
      const { data, error } = await query.order('id', { ascending: true }).range(offset, offset + pageSize - 1);
      if (error) throw new Error('SHADOW_READ_FAILED:' + table + ':' + (error.code || error.message || 'unknown'));
      const batch = Array.isArray(data) ? data : [];
      result.push(...batch);
      if (batch.length < pageSize) return result;
    }
    throw new Error('SHADOW_READ_TRUNCATED:' + table);
  };
  for (const [table, config] of Object.entries(TABLES)) {
    // Deliberately do not return a "complete" result when legacy identities
    // have not been audited or relevant source business dates are unavailable.
    const [canonical, legacyRows] = await Promise.all([
      readPages(table, config, 'canonical'),
      mapped.length ? readPages(table, config, 'legacy') : Promise.resolve([]),
    ]);
    sources[table] = [...new Map([...canonical, ...legacyRows].map(row => [String(row.id), row])).values()];
    const evidenceSafe = ['daily_sales', 'supplier_invoices', 'expenses', 'cash_movements'].includes(table);
    completeness[table] = evidenceSafe && scope.legacyCoverageCertified === true;
    if (!completeness[table]) diagnostics.push({ table, reason: 'REQUIRES_LEGACY_OR_BUSINESS_DATE_CERTIFICATION' });
  }
  return {
    sources, completeness, diagnostics, readOnly: true,
    // These require independent audited posting, valuation, payroll and
    // cross-table snapshot evidence. Never assert them from SELECT alone.
    certifications: {
      salesPostingCertified: false, refundsCertified: false,
      cogsValuationCertified: false, expenseAllocationCertified: false,
      payrollAccrualCertified: false, payrollPeriodCertified: false,
      balanceAsOfCertified: false, treasuryPairingCertified: false,
    },
    scope: { restaurantId: scope.restaurantId, branchId: scope.branchId || null, from: scope.from, to: scope.to },
  };
}
