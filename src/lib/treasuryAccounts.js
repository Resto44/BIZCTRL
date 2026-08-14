export const TREASURY_ACCOUNT_TYPES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank Account' },
  { value: 'network_pos', label: 'Network / POS' },
  { value: 'digital_wallet', label: 'Digital Wallet' },
  { value: 'petty_cash', label: 'Petty Cash' },
  { value: 'clearing', label: 'Clearing Account' },
  { value: 'other', label: 'Other' },
];

export function signedTreasuryAmount(transaction) {
  const amount = Number(transaction?.amount || 0);
  return transaction?.direction === 'out' ? -amount : amount;
}

export function calculateTreasuryAccountBalance(account, transactions = []) {
  const openingBalance = Number(account?.opening_balance || 0);
  const movementBalance = transactions
    .filter((transaction) => transaction?.account_id === account?.id)
    .reduce((sum, transaction) => sum + signedTreasuryAmount(transaction), 0);
  return openingBalance + movementBalance;
}

export function buildTreasuryAccountBalances(accounts = [], transactions = []) {
  return accounts.reduce((balances, account) => {
    balances[account.id] = calculateTreasuryAccountBalance(account, transactions);
    return balances;
  }, {});
}

export function calculateTreasuryLedgerBalance(accounts = [], transactions = []) {
  return accounts.reduce(
    (sum, account) => sum + calculateTreasuryAccountBalance(account, transactions),
    0,
  );
}

export function transactionAccountName(transaction, accounts = []) {
  return accounts.find((account) => account.id === transaction?.account_id)?.account_name || '';
}
