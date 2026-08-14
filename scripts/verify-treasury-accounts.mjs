import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTreasuryAccountBalances,
  calculateTreasuryAccountBalance,
  calculateTreasuryLedgerBalance,
  signedTreasuryAmount,
} from '../src/lib/treasuryAccounts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const accounts = [
  { id: 'cash', opening_balance: 100 },
  { id: 'bank', opening_balance: 500 },
  { id: 'inactive', opening_balance: -20, is_active: false },
];
const transactions = [
  { account_id: 'cash', direction: 'in', amount: 75 },
  { account_id: 'cash', direction: 'out', amount: 20 },
  { account_id: 'bank', direction: 'out', amount: 90 },
  { account_id: 'bank', direction: 'in', amount: 12.5 },
];

assert.equal(signedTreasuryAmount({ direction: 'in', amount: 12 }), 12);
assert.equal(signedTreasuryAmount({ direction: 'out', amount: 12 }), -12);
assert.equal(calculateTreasuryAccountBalance(accounts[0], transactions), 155);
assert.equal(calculateTreasuryAccountBalance(accounts[1], transactions), 422.5);
assert.deepEqual(buildTreasuryAccountBalances(accounts, transactions), { cash: 155, bank: 422.5, inactive: -20 });
assert.equal(calculateTreasuryLedgerBalance(accounts, transactions), 557.5);

const treasury = read('src/pages/Treasury.jsx');
const forecast = read('src/components/treasury/CashflowProjection.jsx');
const client = read('src/api/supabaseClient.js');
const css = read('src/index.css');
const migration = read('supabase/migrations/20260814_canonical_treasury_accounts.sql');
const policyMigration = read('supabase/migrations/20260814_treasury_accounts_owner_policy_hardening.sql');
const settlementLedger = read('src/components/treasury/BranchSettlementLedger.jsx');
const reports = read('src/pages/Reports.jsx');
const scheduledReports = read('src/pages/ScheduledReports.jsx');
const cashRegisterService = read('src/services/cashRegisterService.js');
const salesAnalyticsEngine = read('src/services/salesAnalyticsEngine.js');
const cashflowAnalytics = read('src/services/analytics/cashflowAnalytics.js');
const phrases = read('src/lib/localizedPhrases.js');

[
  "account_id: selectedAccount.id",
  "buildTreasuryAccountBalances(accounts, transactions)",
  "calculateTreasuryLedgerBalance(accounts, transactions)",
  'value="accounts"',
  'openCreateAccount',
  'openEditAccount',
  'accountStatusMut',
  'deleteAccountId',
  'Select an active Treasury account.',
  'CashflowProjection accounts={accounts} transactions={transactions}',
  'transaction_date: form.date',
  'transaction_type: form.type',
  'const transactionDate = (transaction) => transaction?.transaction_date || transaction?.date || \'\';',
].forEach((needle) => assert.ok(treasury.includes(needle), `Treasury is missing ${needle}`));

[
  'export default function CashflowProjection({ accounts = [], transactions = [] })',
  'calculateTreasuryLedgerBalance(accounts, transactions)',
].forEach((needle) => assert.ok(forecast.includes(needle), `Forecast is missing ${needle}`));

assert.ok(client.includes("TreasuryAccount: createEntity('treasury_accounts')"), 'Treasury account entity mapping is missing');

[
  'CREATE TABLE IF NOT EXISTS public.treasury_accounts',
  'ADD COLUMN IF NOT EXISTS account_id uuid',
  'treasury_account_assign_wallet_transaction',
  'treasury_account_prevent_unsafe_delete',
  'treasury_accounts_owner_insert',
  'treasury_accounts_owner_update',
  'treasury_accounts_owner_delete',
  'v_branch := v_row.branch;',
].forEach((needle) => assert.ok(migration.includes(needle), `Canonical account migration is missing ${needle}`));

assert.ok(policyMigration.includes("lower(COALESCE(m.role, '')) = 'owner'"), 'Owner membership policy is missing');
assert.ok(settlementLedger.includes('transaction?.transaction_type || transaction?.type'), 'Settlement ledger does not support canonical transaction_type');
assert.ok(settlementLedger.includes('transaction?.transaction_date || transaction?.date'), 'Settlement ledger does not support canonical transaction_date');
assert.ok(reports.includes("WalletTransaction.filter(walletFilter || {}, '-transaction_date', 500)"), 'Treasury reports are not sorted by canonical transaction date');
assert.ok(scheduledReports.includes("WalletTransaction.filter(ownerFilter || {}, '-transaction_date', 500)"), 'Scheduled Treasury reports are not sorted by canonical transaction date');
assert.ok(cashRegisterService.includes("transaction_type: 'owner_capital_contribution'"), 'Owner cash injection does not write canonical transaction_type');
assert.ok(salesAnalyticsEngine.includes("transaction?.transaction_type || transaction?.type"), 'Network analytics does not support canonical transaction_type');
assert.ok(cashflowAnalytics.includes("t.wallet === 'owner_cash'"), 'Cash flow analytics is not using canonical wallet values');
assert.ok(policyMigration.includes("IN ('owner', 'admin', 'restaurant_admin')"), 'Owner profile policy is missing');

['.treasury-tab-scroll', '.treasury-tab-list', '.treasury-tab-trigger', "html[dir='rtl'] .treasury-tab-scroll"].forEach((needle) => {
  assert.ok(css.includes(needle), `Responsive Treasury CSS is missing ${needle}`);
});

[
  '"Add Account"',
  '"Treasury Account"',
  '"Treasury Accounts"',
  '"Delete Treasury account?"',
  '"fa": "افزودن حساب"',
  '"ar": "إضافة حساب"',
].forEach((needle) => assert.ok(phrases.includes(needle), `Treasury translation catalog is missing ${needle}`));

console.log('Treasury account regression passed: canonical balances, owner controls, account linkage, responsive tabs, forecast reuse, security migrations, and fa/ar labels are present.');
