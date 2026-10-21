/**
 * Cash position for the executive report.
 *
 * Revenue / cash sales are flows. Physical drawer cash is a balance, never a
 * sales source. Cash handed over to an owner must not be added back to the
 * amount entered as physically present in the closing.
 */
const moneyOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const branchKey = (record) => String(record?.branch_id || record?.branch || record?.branch_key || '__unassigned__');

const businessTime = (record) => {
  const date = String(record?.business_date || record?.date || '').slice(0, 10);
  return date ? Date.parse(`${date}T00:00:00Z`) || 0 : 0;
};

const savedTime = (record) => {
  const raw = record?.finalized_at || record?.updated_date || record?.updated_at
    || record?.created_date || record?.created_at;
  return raw ? Date.parse(raw) || 0 : 0;
};

export function enteredDrawerCash(record) {
  // Only the physical count is verifiable. Legacy closing_cash is often
  // derived from expected cash, an owner injection or a prior settlement, so
  // falling back to it misrepresents uncounted money as cash in the drawer.
  return moneyOrNull(record?.actual_cash);
}

/**
 * For multi-shift / multi-branch reports, take the latest finalized balance
 * in each branch, not the sum of cash sales or of multiple shifts. An absent
 * entered balance is unknown, NOT zero, and results in a visibly incomplete
 * aggregate rather than a false partial total.
 */
export function summarizeDrawerCash(sales = []) {
  const latest = new Map();
  for (const record of Array.isArray(sales) ? sales : []) {
    if (record?.closing_state !== 'finalized') continue;
    const key = branchKey(record);
    const rank = [businessTime(record), savedTime(record)];
    const prior = latest.get(key);
    if (!prior || rank[0] > prior.rank[0] || (rank[0] === prior.rank[0] && rank[1] >= prior.rank[1])) {
      latest.set(key, { record, rank });
    }
  }

  let total = 0;
  let missingBranches = 0;
  for (const { record } of latest.values()) {
    const amount = enteredDrawerCash(record);
    if (amount === null) missingBranches += 1;
    else total += amount;
  }
  return {
    amount: latest.size > 0 && missingBranches === 0 ? total : null,
    branches: latest.size,
    missingBranches,
    complete: latest.size > 0 && missingBranches === 0,
  };
}

/**
 * Normalizes the tenant-scoped owner cash-as-of RPC. A period flow is not a
 * cash balance: null/ambiguous/uncounted results MUST stay unknown, never 0.
 */
export function normalizeDrawerCashAsOf(payload, { loading = false, error = false } = {}) {
  const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  const count = Number(data?.branches);
  const missing = Number(data?.missingBranches);
  const cash = moneyOrNull(data?.amount);
  const details = Array.isArray(data?.details) ? data.details : [];
  const complete = !loading && !error && data?.basis === 'last_verified_physical_count_not_live_bank_balance'
    && data?.complete === true && Number.isInteger(count) && count > 0
    && Number.isInteger(missing) && missing === 0 && cash !== null
    && details.length === count
    && details.every(row => row?.status === 'verified' && moneyOrNull(row.cash) !== null);
  return {
    amount: complete ? cash : null,
    branches: Number.isInteger(count) && count >= 0 ? count : 0,
    missingBranches: Number.isInteger(missing) && missing >= 0 ? missing : 0,
    complete,
    asOfDate: typeof data?.asOfDate === 'string' ? data.asOfDate : null,
    details,
    loading: Boolean(loading),
    error: Boolean(error),
  };
}
