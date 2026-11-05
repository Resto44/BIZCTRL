import { sumClosingMoney } from './CashReconciliationLedger';

// A purchase-basis loss is not itself a cash payment. Only posted drawer flows
// determine liquidity. The physical count remains independent evidence.
export function closingFundingProposal(expectedCash, actualCash) {
  if (expectedCash === null || !Number.isFinite(Number(expectedCash))) return { minimum: 0, toCount: null };
  const minimum = Math.max(0, sumClosingMoney(-Number(expectedCash)));
  return { minimum, toCount: actualCash === null || !Number.isFinite(Number(actualCash)) ? null : Math.max(0, sumClosingMoney(Number(actualCash), -Number(expectedCash))) };
}

// Resolve legacy text-only network accounts against the *selected* canonical branch.
// Only unique aliases from authorized branch metadata are accepted, so duplicate
// display names cannot leak an account between branches.
const branchAlias = value => String(value || '').trim().toLocaleLowerCase().replace(/[_\s]+/g, ' ');

export function closingNetworkBranchAliases(branches, selectedBranchId, branchKey) {
  if (!selectedBranchId) return [];
  const records = Array.isArray(branches) ? branches : [];
  const selected = records.find(branch => String(branch.id) === String(selectedBranchId));
  if (!selected) return [];
  const values = branch => [branch.key, branch.branch_key, branch.name, branch.label].filter(Boolean);
  const candidates = [...values(selected), branchKey].filter(Boolean);
  return [...new Set(candidates.map(branchAlias).filter(Boolean))].filter(alias =>
    records.filter(branch => values(branch).some(value => branchAlias(value) === alias)).length === 1
  );
}

export function activeClosingNetworkAccounts(accounts, restaurantId, branchId, branchKey, branchAliases = null) {
  // A supplied empty alias list means that branch metadata is ambiguous.
  // Do not fall back to a potentially shared human-readable branch name.
  const keys = Array.isArray(branchAliases) ? branchAliases : [branchKey];
  const legacyKeys = new Set(keys.map(branchAlias).filter(Boolean));
  return accounts.filter(a => String(a.restaurant_id) === String(restaurantId)
    && (a.status ? String(a.status).toLowerCase() === 'active' : a.is_active === true)
    && (a.branch_id ? String(a.branch_id) === String(branchId)
      : [a.branch, a.branch_key].some(value => legacyKeys.has(branchAlias(value)))));
}
// A network account can be used only once in a Closing. Multiple amounts for
// the same physical POS terminal must be combined into its existing row rather
// than counted as separate card sources. This applies even to zero/blank rows.
export const closingNetworkAccountId = entry => String(entry?.network_account_id || entry?.device_id || '').trim();

export function hasDuplicateClosingNetworkAccounts(entries) {
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const id = closingNetworkAccountId(entry);
    if (!id) continue;
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}

export function validClosingNetworkEntries(entries, accounts) {
  if (!Array.isArray(entries) || !Array.isArray(accounts) || hasDuplicateClosingNetworkAccounts(entries)) return false;
  const ids = new Set(accounts.map(a => String(a.id)));
  return entries.every(e => e.amount === '' || e.amount == null ||
    (/^\d+(?:\.\d{1,2})?$/.test(String(e.amount)) && Number.isFinite(Number(e.amount)) &&
      (Number(e.amount) === 0 || ids.has(closingNetworkAccountId(e)))));
}

// Standalone receipts have no closing document ID. A new unsaved closing also
// has no ID; those two nulls must never classify a receipt as its settlement.
export function isClosingSettlementMovement(movement, closingId) {
  return Boolean(closingId) && movement?.movement_type === 'owner_injection'
    && movement?.source_module === 'OwnerCashInjection'
    && movement?.source_document_id === closingId;
}
