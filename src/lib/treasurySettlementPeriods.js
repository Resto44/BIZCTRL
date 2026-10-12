import { format, startOfMonth, startOfYear, subDays, subMonths } from 'date-fns';
// Settlement transaction types — which direction affects each ledger column
const SENT_TO_OWNER_TYPES = [
  'branch_to_owner_cash',
  'branch_to_owner_network',
  'network_sales_auto', // legacy automatic owner network receipts
  'network_sales_auto_v2', // canonical server-side owner network accruals
];
const RETURNED_TO_BRANCH_TYPES = [
  'owner_to_branch_funding',
];
const OWNER_EXPENSE_FOR_BRANCH_TYPES = [
  'owner_expense',
  'owner_salary_payment',
  'owner_external_payment',
];

const transactionDate = (transaction) => transaction?.transaction_date || transaction?.date || '';
const transactionType = (transaction) => transaction?.transaction_type || transaction?.type || '';

/**
 * Computes per-branch settlement ledger from all wallet transactions.
 * Returns { [branchKey]: { sentToOwner, returnedToBranch, ownerExpenseForBranch, remaining, lastSentDate, lastExpenseDate } }
 */
export function computeBranchSettlements(transactions, branches = []) {
  const ledger = {};

  const ensureBranch = (key) => {
    if (!ledger[key]) {
      ledger[key] = {
        sentToOwner: 0,
        returnedToBranch: 0,
        ownerExpenseForBranch: 0,
        lastSentDate: null,
        lastExpenseDate: null,
        history: [],
      };
    }
  };

  transactions.forEach(tx => {
    const branchKey = tx.branch_id ? branches.find(b => b.id === tx.branch_id)?.key : tx.branch;
    if (!branchKey) return;
    const type = transactionType(tx);
    if (![...SENT_TO_OWNER_TYPES, ...RETURNED_TO_BRANCH_TYPES, ...OWNER_EXPENSE_FOR_BRANCH_TYPES].includes(type)) return;
    const amount = Number(tx.amount ?? 0);
    if (!Number.isFinite(amount)) return;
    ensureBranch(branchKey);
    const entry = ledger[branchKey];

    if (SENT_TO_OWNER_TYPES.includes(transactionType(tx))) {
      entry.sentToOwner += amount;
      if (!entry.lastSentDate || transactionDate(tx) > entry.lastSentDate) entry.lastSentDate = transactionDate(tx);
      entry.history.push({ ...tx, ledgerRole: 'sent' });
    } else if (RETURNED_TO_BRANCH_TYPES.includes(transactionType(tx))) {
      entry.returnedToBranch += amount;
      entry.history.push({ ...tx, ledgerRole: 'returned' });
    } else if (OWNER_EXPENSE_FOR_BRANCH_TYPES.includes(transactionType(tx))) {
      entry.ownerExpenseForBranch += amount;
      if (!entry.lastExpenseDate || transactionDate(tx) > entry.lastExpenseDate) entry.lastExpenseDate = transactionDate(tx);
      entry.history.push({ ...tx, ledgerRole: 'expense' });
    }
  });

  // Compute remaining
  Object.keys(ledger).forEach(key => {
    const e = ledger[key];
    e.remaining = e.sentToOwner - e.returnedToBranch - e.ownerExpenseForBranch;
    // sort history descending
    e.history.sort((a, b) => transactionDate(b).localeCompare(transactionDate(a)));
  });

  return ledger;
}


export const SETTLEMENT_PERIODS = ['today', 'week', 'month', '3months', '6months', 'year', 'all'];
export function settlementPeriodRange(period, now = new Date()) {
  const end = format(now, 'yyyy-MM-dd');
  const starts = {today:now, week:subDays(now,6), month:startOfMonth(now),
    '3months':startOfMonth(subMonths(now,2)), '6months':startOfMonth(subMonths(now,5)), year:startOfYear(now)};
  return {start:period === 'all' ? '' : format(starts[period] || starts.month,'yyyy-MM-dd'), end};
}
const zero = () => ({sentToOwner:0, returnedToBranch:0, ownerExpenseForBranch:0, remaining:0, history:[]});
const validDate = tx => { const day = transactionDate(tx).slice(0,10); const parsed = new Date(day + 'T12:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === day; };
const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
export function buildSettlementStatement(transactions, branches, {start, end}) {
  const dated = transactions.filter(validDate);
  const excluded = computeBranchSettlements(transactions.filter(tx => !validDate(tx)), branches);
  const opening = computeBranchSettlements(start ? dated.filter(tx => transactionDate(tx).slice(0,10) < start) : [], branches);
  const movement = computeBranchSettlements(dated.filter(tx => {
    const day = transactionDate(tx).slice(0,10);
    return (!start || day >= start) && day <= end;
  }), branches);
  return Object.fromEntries(branches.map(b => {
    const period = movement[b.key] || zero();
    const openingBalance = money(opening[b.key]?.remaining || 0);
    const remaining = money(period.remaining);
    return [b.key, {...period, excludedCount:excluded[b.key]?.history.length || 0, sentToOwner:money(period.sentToOwner), returnedToBranch:money(period.returnedToBranch),
      ownerExpenseForBranch:money(period.ownerExpenseForBranch), remaining, openingBalance,
      closingBalance:money(openingBalance + remaining)}];
  }));
}
