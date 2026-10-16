/**
 * The sponsor ledger is a *settlement* sub-ledger, NOT an owner wallet.
 * All postings must be approved; pending/rejected flows do not reduce holdings.
 * Never reassign unscoped legacy rows to a tenant by guessing an owner/branch.
 */
import { fetchCompleteTreasuryRows } from './treasuryLedgerRead';
import { treasuryBranchDisplayName } from './treasuryBranchDisplay';

const moneyCents = value => Math.round(Number(value || 0) * 100);

export function sponsorStatement(rows = [], branches = [], lang = 'en') {
  const byBranch = new Map();
  const unknown = 'unattributed';
  const ensure = (record) => {
    const known = branches.find(b => (record.branch_id && (b.id || b.branch_id) === record.branch_id)
      || (record.branch && [b.key, b.branch_key, b.name, b.label].includes(record.branch)));
    const key = known?.key || known?.branch_key || String(record.branch || '').trim() || unknown;
    if (!byBranch.has(key)) byBranch.set(key, {
      branch: key, label: known?.name || known?.label ||
        (key === unknown ? (lang === 'fa' ? 'بدون فرع مشخص' : lang === 'ar' ? 'غير منسوب لفرع' : 'Unattributed') :
        treasuryBranchDisplayName({ branch: key, branch_id: record.branch_id }, branches, lang)),
      received: 0, sent: 0, ownerToBranch: 0, pendingAmount: 0,
      pendingCount: 0, approvedCount: 0, history: [],
    });
    return byBranch.get(key);
  };

  let rejectedCount = 0;
  for (const record of rows) {
    const amount = moneyCents(record.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) continue;
    if (record.status === 'rejected') { rejectedCount++; continue; }
    const entry = ensure(record);
    if (record.status !== 'approved') {
      if (record.status === 'pending' || record.status === 'verified') {
        if (record.flow_type === 'MANAGER_TO_SPONSOR') {
          entry.pendingAmount += amount;
          entry.pendingCount++;
        }
      }
      continue;
    }
    if (record.flow_type === 'MANAGER_TO_SPONSOR') entry.received += amount;
    else if (record.flow_type === 'SPONSOR_TO_OWNER') entry.sent += amount;
    else if (record.flow_type === 'OWNER_TO_BRANCH') entry.ownerToBranch += amount;
    else continue;
    entry.approvedCount++;
    entry.history.push(record);
  }
  const ledger = [...byBranch.values()].map(b => {
    const remainder = b.received - b.sent;
    const state = b.received === 0 && b.sent === 0
      ? b.pendingCount > 0 ? 'pending' : b.ownerToBranch > 0 ? 'other' : 'no_data'
      : remainder < 0 ? 'mismatch'
      : remainder === 0 ? 'settled'
      : b.sent > 0 ? 'partial' : 'awaiting_transfer';
    return { ...b, received:b.received / 100, sent:b.sent / 100,
      ownerToBranch:b.ownerToBranch / 100, pendingAmount:b.pendingAmount / 100,
      remaining:remainder / 100, state,
    };
  }).sort((a,b) => b.remaining - a.remaining);

  const receivedCents = ledger.reduce((v,b) => v + moneyCents(b.received),0);
  const sentCents = ledger.reduce((v,b) => v + moneyCents(b.sent),0);
  const pendingCents = ledger.reduce((v,b) => v + moneyCents(b.pendingAmount),0);
  const remainingCents = receivedCents - sentCents;
  const mismatchCount = ledger.filter(b => b.state === 'mismatch').length;
  const hasApprovedSponsorFlow = ledger.some(b => b.received > 0 || b.sent > 0);
  const hasPending = ledger.some(b => b.pendingCount > 0);
  const status = mismatchCount > 0 ? 'mismatch'
    : !hasApprovedSponsorFlow ? (hasPending ? 'pending' : 'no_data')
    : remainingCents === 0 ? 'settled' : sentCents > 0 ? 'partial' : 'awaiting_transfer';
  return {
    ledger,
    totals: {
      received: receivedCents / 100, sent: sentCents / 100,
      remaining: remainingCents / 100, pending: pendingCents / 100,
      pendingCount: ledger.reduce((v,b) => v + b.pendingCount, 0),
      outstandingBranches: ledger.filter(b => b.remaining > 0).length,
      mismatchCount, rejectedCount, status,
      approvedCount: ledger.reduce((v,b) => v + b.approvedCount,0),
    },
  };
}

export function readSponsorSettlementRows(db, restaurantId) {
  // This query filters on canonical restaurant_id and is additionally subject
  // to the server's existing RLS. Historical null-restaurant rows are excluded,
  // not silently moved/assigned to an arbitrary tenant or branch.
  return fetchCompleteTreasuryRows({
    db, table:'settlement_records', restaurantId, allBranches:true, orderColumn:'date',
  });
}
