import { sumClosingMoney } from './CashReconciliationLedger';

// A purchase-basis loss is not itself a cash payment. Only posted drawer flows
// determine liquidity. The physical count remains independent evidence.
export function closingFundingProposal(expectedCash, actualCash) {
  if (expectedCash === null || !Number.isFinite(Number(expectedCash))) return { minimum: 0, toCount: null };
  const minimum = Math.max(0, sumClosingMoney(-Number(expectedCash)));
  return { minimum, toCount: actualCash === null || !Number.isFinite(Number(actualCash)) ? null : Math.max(0, sumClosingMoney(Number(actualCash), -Number(expectedCash))) };
}

export function activeClosingNetworkAccounts(accounts, restaurantId, branchId, branchKey) {
  return accounts.filter(a => String(a.restaurant_id) === String(restaurantId)
    && (a.status ? a.status.toLowerCase() === 'active' : a.is_active === true)
    && (a.branch_id ? a.branch_id === branchId : [a.branch, a.branch_key].includes(branchKey)));
}
export function validClosingNetworkEntries(entries, accounts) {
  const ids = new Set(accounts.map(a => a.id));
  return entries.every(e => e.amount === '' || e.amount == null ||
    (/^\d+(?:\.\d{1,2})?$/.test(String(e.amount)) && Number.isFinite(Number(e.amount)) &&
      (Number(e.amount) === 0 || ids.has(e.network_account_id || e.device_id))));
}
