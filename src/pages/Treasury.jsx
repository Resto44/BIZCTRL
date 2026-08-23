import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useRole, ROLES } from '@/lib/RoleContext';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Link } from 'react-router-dom';
import { Plus, ArrowDownLeft, ArrowUpRight, Building2, User,
  TrendingUp, Banknote, CreditCard,
  Trash2, Scale, AlertTriangle, UserCircle, ShieldCheck, ExternalLink,
  Pencil, Power, WalletCards, Landmark
} from 'lucide-react';
import { formatCurrency } from '@/lib/helpers';
import { format } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, CartesianGrid
} from 'recharts';
import BranchSelect from '@/components/shared/BranchSelect';
import SponsorLedger from '@/components/settlement/SponsorLedger';
import BranchSettlementLedger from '@/components/treasury/BranchSettlementLedger';
import ReconciliationDashboard from '@/components/treasury/ReconciliationDashboard';
import CashflowProjection from '@/components/treasury/CashflowProjection';
import OwnerPersonalFinance from '@/components/treasury/OwnerPersonalFinance';
import { useNotify } from '@/lib/useNotify';
import {
  TREASURY_ACCOUNT_TYPES,
  buildTreasuryAccountBalances,
  calculateTreasuryLedgerBalance,
  transactionAccountName,
} from '@/lib/treasuryAccounts';

const TX_TYPES = [
  // Auto-generated (shown in history, not in add form)
  { value: 'network_sales_auto',        label: 'Network Sales (Auto)',            wallet: 'owner_network', direction: 'in',  auto: true },
  { value: 'cash_sales_branch',         label: 'Cash Sales (Auto)',               wallet: 'branch_cash',   direction: 'in',  auto: true },
  // Credit collections
  { value: 'credit_collection_network', label: 'Credit Collection (Network)',     wallet: 'owner_network', direction: 'in' },
  { value: 'credit_collection_cash',    label: 'Credit Collection (Cash)',        wallet: 'branch_cash',   direction: 'in' },
  // Branch → Owner settlements
  { value: 'branch_to_owner_cash',      label: 'Branch → Owner (Cash Transfer)', wallet: 'owner_cash',    direction: 'in',  settlement: true },
  { value: 'branch_to_owner_network',   label: 'Branch → Owner (Network Sales)', wallet: 'owner_network', direction: 'in',  settlement: true },
  // Owner → Branch
  { value: 'owner_to_branch_funding',   label: 'Owner → Branch (Funding)',        wallet: 'branch_cash',   direction: 'in',  settlement: true },
  { value: 'owner_expense',             label: 'Owner Expense (for Branch)',      wallet: 'owner_network', direction: 'out', settlement: true },
  { value: 'owner_salary_payment',      label: 'Owner Pays Salary (for Branch)', wallet: 'owner_network', direction: 'out', settlement: true },
  { value: 'owner_external_payment',    label: 'Owner Supplier Payment',         wallet: 'owner_network', direction: 'out', settlement: true },
  // Pure owner
  { value: 'owner_external_debt',       label: 'External Debt (Owner)',           wallet: 'owner_network', direction: 'out' },
  { value: 'owner_personal_withdrawal', label: 'Personal Withdrawal',             wallet: 'owner_cash',    direction: 'out' },
  { value: 'owner_investment',          label: 'Owner Investment In',             wallet: 'owner_cash',    direction: 'in' },
  { value: 'owner_capital_contribution',    label: 'Owner Capital Contribution',       wallet: 'owner_cash',    direction: 'in',  auto: true },
  // Cash Reconciliation audit entries (do NOT affect Sales Total)
  { value: 'cash_reconciliation_shortage', label: 'Cash Shortage (Reconciliation)',   wallet: 'branch_cash',   direction: 'out', auto: true },
  { value: 'cash_reconciliation_overage',  label: 'Cash Overage (Reconciliation)',    wallet: 'branch_cash',   direction: 'in',  auto: true },
  // Branch
  { value: 'salary_advance',            label: 'Salary Advance (Branch)',         wallet: 'branch_cash',   direction: 'out' },
  { value: 'branch_purchase_payment',   label: 'Branch Purchase Payment',        wallet: 'branch_cash',   direction: 'out' },
  { value: 'branch_expense',            label: 'Branch Expense',                  wallet: 'branch_cash',   direction: 'out' },
];

const TYPE_META = Object.fromEntries(TX_TYPES.map(t => [t.value, t]));

const MONTH_OPTIONS = Array.from({ length: 6 }, (_, i) => {
  const d = new Date();
  d.setMonth(d.getMonth() - i);
  return { value: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') };
});

const emptyForm = { date: format(new Date(), 'yyyy-MM-dd'), type: '', wallet: 'owner', branch: '', account_id: '', amount: '', payment_method: 'cash', description: '' };
const emptyAccountForm = { account_name: '', account_type: 'cash', branch_id: '', branch_key: '', currency: '', opening_balance: '', is_active: true, notes: '' };

function accountWalletKey(account) {
  if (account?.legacy_wallet_key) return account.legacy_wallet_key;
  if (account?.branch_key) return 'branch_cash';
  return ['bank', 'network_pos', 'digital_wallet', 'clearing'].includes(account?.account_type) ? 'owner_network' : 'owner_cash';
}

const transactionDate = (transaction) => transaction?.transaction_date || transaction?.date || '';
const transactionType = (transaction) => transaction?.transaction_type || transaction?.type || '';

export default function Treasury() {
  const { currency, t, translateLiteral } = useLanguage();
  const { role } = useRole();
  const { branches, activeRestaurantId, activeRestaurant, ownerFilter } = useTenant();
  const { selectedBranchId, selectedBranchKey, isAllBranches, setSelectedBranchId } = useBranchScope();
  const notif = useNotify();
  const qc = useQueryClient();
  const isOwner = role === ROLES.OWNER;
  const local = (value) => translateLiteral?.(value) || value;
  const [tab, setTab] = useState('overview');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [editingAccount, setEditingAccount] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [deleteAccountId, setDeleteAccountId] = useState(null);
  const [filterMonth, setFilterMonth] = useState(format(new Date(), 'yyyy-MM'));
  const filterBranch = isAllBranches ? 'all' : (selectedBranchKey || 'all');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const fetchScopedRows = async (table, legacyColumn = 'branch', orderColumn = 'date') => {
    if (!activeRestaurant?.id) return [];
    const baseQuery = () => supabase.from(table).select('*')
      .eq('restaurant_id', activeRestaurant.id)
      .order(orderColumn, { ascending: false })
      .limit(2000);
    if (isAllBranches) {
      const { data, error } = await baseQuery();
      if (error) throw error;
      return data || [];
    }
    if (!selectedBranchId || !selectedBranchKey) return [];
    const [canonical, legacy] = await Promise.all([
      baseQuery().eq('branch_id', selectedBranchId),
      baseQuery().is('branch_id', null).eq(legacyColumn, selectedBranchKey),
    ]);
    if (canonical.error || legacy.error) throw canonical.error || legacy.error;
    return Array.from(new Map([...(canonical.data || []), ...(legacy.data || [])]
      .map((record) => [record.id, record])).values());
  };

  const { data: accounts = [] } = useQuery({
    queryKey: ['treasury_accounts', activeRestaurantId],
    queryFn: () => base44.entities.TreasuryAccount.filter({ restaurant_id: activeRestaurantId }, 'account_name', 500),
    staleTime: 30000,
    enabled: !!activeRestaurantId,
  });

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['wallet_transactions', activeRestaurant?.id, selectedBranchId],
    queryFn: () => fetchScopedRows('wallet_transactions', 'branch', 'transaction_date'),
    staleTime: 60000,
    enabled: Boolean(activeRestaurant?.id),
  });
  const { data: employees = [] } = useQuery({
    queryKey: ['employees', activeRestaurant?.id, selectedBranchId],
    queryFn: () => base44.entities.Employee.filter({ restaurant_id: activeRestaurant?.id }, 'full_name', 500),
    enabled: Boolean(activeRestaurant?.id),
  });
  const { data: allSales = [] } = useQuery({
    queryKey: ['sales', activeRestaurant?.id, selectedBranchId],
    queryFn: () => fetchScopedRows('daily_sales'),
    staleTime: 60000,
    enabled: Boolean(activeRestaurant?.id),
  });

  const { data: settlements = [] } = useQuery({
    queryKey: ['settlements_all', activeRestaurant?.id, selectedBranchId],
    queryFn: () => fetchScopedRows('settlement_records'),
    staleTime: 30000,
    enabled: Boolean(activeRestaurant?.id),
  });

  // Sponsor ledger summary for overview
  const sponsorSummary = useMemo(() => {
    const receivedBySponsor = settlements
      .filter(s => s.flow_type === 'MANAGER_TO_SPONSOR' && s.status === 'approved')
      .reduce((a, s) => a + (s.amount || 0), 0);
    const sentToOwner = settlements
      .filter(s => s.flow_type === 'SPONSOR_TO_OWNER' && s.status !== 'rejected')
      .reduce((a, s) => a + (s.amount || 0), 0);
    const remaining = receivedBySponsor - sentToOwner;
    // Count distinct branches with remaining
    const branchMap = {};
    settlements.filter(s => s.flow_type === 'MANAGER_TO_SPONSOR' && s.status === 'approved' && s.branch)
      .forEach(s => { branchMap[s.branch] = (branchMap[s.branch] || 0) + (s.amount || 0); });
    settlements.filter(s => s.flow_type === 'SPONSOR_TO_OWNER' && s.status !== 'rejected' && s.branch)
      .forEach(s => { branchMap[s.branch] = (branchMap[s.branch] || 0) - (s.amount || 0); });
    const branchesWithBalance = Object.values(branchMap).filter(v => v > 0).length;
    return { receivedBySponsor, sentToOwner, remaining: Math.max(0, remaining), branchesWithBalance };
  }, [settlements]);

  const accountBalances = useMemo(() => buildTreasuryAccountBalances(accounts, transactions), [accounts, transactions]);
  const treasuryLedgerBalance = useMemo(() => calculateTreasuryLedgerBalance(accounts, transactions), [accounts, transactions]);
  const activeAccounts = useMemo(() => accounts.filter((account) => account.is_active !== false), [accounts]);

  const accountSaveMut = useMutation({
    mutationFn: async (payload) => {
      if (editingAccount?.id) return base44.entities.TreasuryAccount.update(editingAccount.id, payload);
      return base44.entities.TreasuryAccount.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treasury_accounts'] });
      setShowAccountForm(false);
      setEditingAccount(null);
      setAccountForm(emptyAccountForm);
    },
    onError: (error) => notif.error(error?.message || local('Unable to save Treasury account.')),
  });
  const accountStatusMut = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.TreasuryAccount.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['treasury_accounts'] }),
    onError: (error) => notif.error(error?.message || local('Unable to update Treasury account status.')),
  });
  const accountDeleteMut = useMutation({
    mutationFn: (id) => base44.entities.TreasuryAccount.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treasury_accounts'] });
      setDeleteAccountId(null);
    },
    onError: (error) => {
      setDeleteAccountId(null);
      notif.error(error?.message || local('Accounts with transactions must be deactivated instead of deleted.'));
    },
  });

  const saveMut = useMutation({
    mutationFn: d => base44.entities.WalletTransaction.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wallet_transactions'] }); setShowForm(false); setForm(emptyForm); },
  });
  const deleteMut = useMutation({
    mutationFn: id => base44.entities.WalletTransaction.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wallet_transactions'] }); setDeleteId(null); },
  });

  // ── Filter transactions ───────────────────────────────────────────────
  const monthTx = useMemo(() =>
    transactions.filter(tx => transactionDate(tx).startsWith(filterMonth)),
    [transactions, filterMonth]
  );
  const filteredTx = useMemo(() => monthTx, [monthTx]);

  // ── Wallet balances ───────────────────────────────────────────────────
  const walletBalance = useMemo(() => {
    const calc = (walletKey) => transactions.filter(tx => tx.wallet === walletKey)
      .reduce((s, tx) => s + (tx.direction === 'in' ? (tx.amount || 0) : -(tx.amount || 0)), 0);
    return {
      ownerNetwork: calc('owner_network'),
      ownerCash: calc('owner_cash'),
      get ownerTotal() { return this.ownerNetwork + this.ownerCash; },
    };
  }, [transactions]);

  const branchBalances = useMemo(() => {
    const map = {};
    transactions.filter(tx => tx.wallet === 'branch_cash' && tx.branch).forEach(tx => {
      if (!map[tx.branch]) map[tx.branch] = 0;
      map[tx.branch] += tx.direction === 'in' ? (tx.amount || 0) : -(tx.amount || 0);
    });
    return map;
  }, [transactions]);

  // ── Monthly summary ───────────────────────────────────────────────────
  const monthlySummary = useMemo(() => {
    const ownerIn = monthTx.filter(tx => (tx.wallet === 'owner_network' || tx.wallet === 'owner_cash') && tx.direction === 'in').reduce((s, tx) => s + (tx.amount || 0), 0);
    const ownerOut = monthTx.filter(tx => (tx.wallet === 'owner_network' || tx.wallet === 'owner_cash') && tx.direction === 'out').reduce((s, tx) => s + (tx.amount || 0), 0);
    const networkIn = monthTx.filter(tx => tx.wallet === 'owner_network' && tx.direction === 'in').reduce((s, tx) => s + (tx.amount || 0), 0);
    const branchIn = monthTx.filter(tx => tx.wallet === 'branch_cash' && tx.direction === 'in').reduce((s, tx) => s + (tx.amount || 0), 0);
    const branchOut = monthTx.filter(tx => tx.wallet === 'branch_cash' && tx.direction === 'out').reduce((s, tx) => s + (tx.amount || 0), 0);
    return { ownerIn, ownerOut, networkIn, branchIn, branchOut };
  }, [monthTx]);

  // ── Monthly trend (last 6 months) ────────────────────────────────────
  const trendData = useMemo(() => {
    return MONTH_OPTIONS.slice().reverse().map(({ value, label }) => {
      const txs = transactions.filter(tx => transactionDate(tx).startsWith(value));
      const networkIn = txs.filter(tx => tx.wallet === 'owner_network' && tx.direction === 'in').reduce((s, tx) => s + (tx.amount || 0), 0);
      const ownerOut = txs.filter(tx => (tx.wallet === 'owner_network' || tx.wallet === 'owner_cash') && tx.direction === 'out').reduce((s, tx) => s + (tx.amount || 0), 0);
      const ownerIn = txs.filter(tx => (tx.wallet === 'owner_network' || tx.wallet === 'owner_cash') && tx.direction === 'in').reduce((s, tx) => s + (tx.amount || 0), 0);
      return { label, networkIn, ownerIn, ownerOut, net: ownerIn - ownerOut };
    });
  }, [transactions]);

  // ── Branch balance chart ──────────────────────────────────────────────
  const branchBalanceChart = useMemo(() => {
    return Object.entries(branchBalances).map(([key, balance]) => ({
      name: branches.find(b => b.key === key)?.label || key,
      balance,
    }));
  }, [branchBalances, branches]);

  // ── Payroll obligation ────────────────────────────────────────────────
  const payrollObligation = useMemo(() =>
    employees.filter(e => e.is_active !== false).reduce((s, e) => s + (e.base_salary || 0), 0),
    [employees]
  );

  const openCreateAccount = () => {
    setEditingAccount(null);
    setAccountForm({ ...emptyAccountForm, currency: currency || 'SAR' });
    setShowAccountForm(true);
  };
  const openEditAccount = (account) => {
    setEditingAccount(account);
    setAccountForm({
      account_name: account.account_name || '',
      account_type: account.account_type || 'cash',
      branch_id: account.branch_id || '',
      branch_key: account.branch_key || '',
      currency: account.currency || currency || 'SAR',
      opening_balance: String(account.opening_balance || 0),
      is_active: account.is_active !== false,
      notes: account.notes || '',
    });
    setShowAccountForm(true);
  };
  const setAccount = (key, value) => setAccountForm((current) => ({ ...current, [key]: value }));
  const handleAccountSave = () => {
    if (!isOwner || !activeRestaurantId || !accountForm.account_name.trim()) return;
    const selectedBranch = branches.find((branch) => branch.id === accountForm.branch_id) || null;
    accountSaveMut.mutate({
      restaurant_id: activeRestaurantId,
      account_name: accountForm.account_name.trim(),
      account_type: accountForm.account_type,
      branch_id: selectedBranch?.id || null,
      branch_key: selectedBranch?.key || selectedBranch?.branch_key || null,
      currency: accountForm.currency.trim() || currency || 'SAR',
      opening_balance: Number(accountForm.opening_balance || 0),
      is_active: accountForm.is_active,
      notes: accountForm.notes.trim() || null,
    });
  };

  const handleSave = async () => {
    if (!form.type || !form.amount || !form.date) return;
    const meta = TYPE_META[form.type];
    const amount = Number(form.amount);
    const selectedAccount = activeAccounts.find((account) => account.id === form.account_id);
    if (!selectedAccount) {
      notif.error(local('Select an active Treasury account.'));
      return;
    }
    const formBranch = branches.find((branch) => (branch.key || branch.branch_key) === form.branch) || null;
    saveMut.mutate({
      transaction_date: form.date,
      transaction_type: form.type,
      account_id: selectedAccount.id,
      branch: form.branch || selectedAccount.branch_key || selectedBranchKey || '',
      branch_id: formBranch?.id || selectedAccount.branch_id || (isAllBranches ? null : selectedBranchId),
      amount,
      payment_method: form.payment_method,
      description: form.description || null,
      wallet: meta?.wallet || accountWalletKey(selectedAccount),
      direction: meta?.direction || 'out',
      restaurant_id: activeRestaurantId,
    });
    // Fire notification based on type
    if (form.type?.startsWith('branch_to_owner')) {
      notif.branchToOwner({ branch: form.branch, amount });
    } else if (form.type === 'owner_to_branch_funding') {
      notif.ownerToBranch({ branch: form.branch, amount });
    } else if (form.type?.startsWith('credit_collection')) {
      notif.creditCollection({ branch: form.branch, amount });
    } else if (form.type === 'salary_advance') {
      notif.salaryAdvance({ branch: form.branch, amount, employeeName: form.description || 'Employee' });
    }
  };

  const typeConfig = form.type ? TYPE_META[form.type] : null;
  const showBranch = typeConfig && (
    typeConfig.wallet === 'branch_cash' ||
    form.type?.startsWith('branch_') ||
    typeConfig.settlement === true
  );

  if (role === 'cashier') {
    return <div className="text-center py-20 text-muted-foreground text-sm">{t('error')}</div>;
  }

  const fmt = (v) => formatCurrency(v, currency);

  return (
    <div>
      <PageHeader
        title={t('treasury')}
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {isOwner && (
              <Button size="sm" variant="outline" className="w-full whitespace-nowrap sm:w-auto" onClick={openCreateAccount}>
                <Landmark className="h-3.5 w-3.5 shrink-0" /> {local('Add Account')}
              </Button>
            )}
            <Button size="sm" className="w-full whitespace-nowrap sm:w-auto" onClick={() => setShowForm(true)}>
              <Plus className="h-3.5 w-3.5 shrink-0" /> {t('add_transaction')}
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="mb-4 min-w-0">
        <div className="treasury-tab-scroll" role="region" aria-label={local('Treasury sections')}>
          <TabsList className="treasury-tab-list">
            <TabsTrigger value="overview" className="treasury-tab-trigger">{t('overview')}</TabsTrigger>
            <TabsTrigger value="accounts" className="treasury-tab-trigger"><WalletCards className="h-3.5 w-3.5 shrink-0" />{local('Accounts')}</TabsTrigger>
            <TabsTrigger value="settlement" className="treasury-tab-trigger"><Scale className="h-3.5 w-3.5 shrink-0" />{t('settlement')}</TabsTrigger>
            <TabsTrigger value="reconcile" className="treasury-tab-trigger text-amber-700"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{local('Reconciliation')}</TabsTrigger>
            <TabsTrigger value="transactions" className="treasury-tab-trigger">{local('Transactions')}</TabsTrigger>
            <TabsTrigger value="analytics" className="treasury-tab-trigger">{t('analytics')}</TabsTrigger>
            <TabsTrigger value="sponsor" className="treasury-tab-trigger text-amber-700"><ShieldCheck className="h-3.5 w-3.5 shrink-0" />{t('sponsor_treasury')}</TabsTrigger>
            <TabsTrigger value="forecast" className="treasury-tab-trigger text-indigo-600"><TrendingUp className="h-3.5 w-3.5 shrink-0" />{t('forecast')}</TabsTrigger>
            {isOwner ? <TabsTrigger value="personal" className="treasury-tab-trigger text-violet-600"><UserCircle className="h-3.5 w-3.5 shrink-0" />{local('Personal')}</TabsTrigger> : null}
          </TabsList>
        </div>

        {/* ── OVERVIEW ────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-3 space-y-3">
          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950/40"><WalletCards className="h-4 w-4 text-indigo-600" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{local('Treasury Accounts')}</p>
                  <p className="text-xs text-muted-foreground">{accounts.length} {local('accounts')} · {activeAccounts.length} {local('active')}</p>
                </div>
              </div>
              <div className="min-w-[9rem] rounded-lg bg-indigo-50 px-3 py-2 text-end dark:bg-indigo-950/20">
                <p className="text-xs text-muted-foreground">{local('Ledger Balance')}</p>
                <p className={`text-base font-bold ${treasuryLedgerBalance >= 0 ? 'text-indigo-700 dark:text-indigo-300' : 'text-red-500'}`}>{fmt(treasuryLedgerBalance)}</p>
              </div>
            </div>
            {accounts.length ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {accounts.slice(0, 6).map((account) => (
                  <div key={account.id} className="min-w-0 rounded-lg border border-border bg-muted/25 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="truncate text-xs font-semibold">{account.account_name}</p><p className="truncate text-xs text-muted-foreground">{local(TREASURY_ACCOUNT_TYPES.find((type) => type.value === account.account_type)?.label || account.account_type)}</p></div>
                      <Badge variant={account.is_active !== false ? 'outline' : 'secondary'} className="shrink-0 text-[10px]">{account.is_active !== false ? local('Active') : local('Inactive')}</Badge>
                    </div>
                    <p className={`mt-2 text-sm font-bold ${accountBalances[account.id] >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(accountBalances[account.id] || 0)}</p>
                  </div>
                ))}
              </div>
            ) : <p className="py-3 text-center text-xs text-muted-foreground">{local('No Treasury accounts have been created yet.')}</p>}
          </Card>

          {/* Owner wallets — split Network vs Cash */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('owner')} {t('total')}</p>
                <p className={`text-lg font-bold ${walletBalance.ownerTotal >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(walletBalance.ownerTotal)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><CreditCard className="w-3 h-3" /> {t('owner_network')}</p>
                <p className={`text-sm font-bold mt-0.5 ${walletBalance.ownerNetwork >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{fmt(walletBalance.ownerNetwork)}</p>
                <p className="text-xs text-muted-foreground">+{fmt(monthlySummary.networkIn)} {t('this_month')}</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Banknote className="w-3 h-3" /> {t('owner_cash')}</p>
                <p className={`text-sm font-bold mt-0.5 ${walletBalance.ownerCash >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(walletBalance.ownerCash)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-2 text-center">
                <p className="text-xs text-muted-foreground">{t('cash_in')}</p>
                <p className="text-sm font-semibold text-emerald-600">{fmt(monthlySummary.ownerIn)}</p>
              </div>
              <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-2 text-center">
                <p className="text-xs text-muted-foreground">{t('cash_out')}</p>
                <p className="text-sm font-semibold text-red-500">{fmt(monthlySummary.ownerOut)}</p>
              </div>
            </div>
          </Card>

          {/* Branch cash wallets */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-semibold">{t('branch_cash')}</p>
                <p className="text-xs text-muted-foreground">{t('branch')}</p>
              </div>
            </div>
            {Object.entries(branchBalances).length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('no_data')}</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(branchBalances).map(([key, bal]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm">{branches.find(b => b.key === key)?.label || key}</span>
                    <span className={`text-sm font-semibold ${bal >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(bal)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Sponsor Holdings Summary */}
          {(sponsorSummary.receivedBySponsor > 0 || sponsorSummary.remaining > 0) && (
            <Card className={`p-4 ${sponsorSummary.remaining > 0 ? 'border-amber-300 bg-amber-50/30' : 'border-emerald-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`w-4 h-4 ${sponsorSummary.remaining > 0 ? 'text-amber-500' : 'text-emerald-500'}`} />
                  <p className="text-sm font-semibold">Sponsor Holdings (كفيل)</p>
                </div>
                <Link to="/sponsor-treasury" className="text-xs text-primary flex items-center gap-1 hover:underline">
                  Details <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center mb-2">
                <div>
                  <p className="text-xs text-muted-foreground">{t('inflows')}</p>
                  <p className="text-sm font-bold text-blue-600">{fmt(sponsorSummary.receivedBySponsor)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('direction_out')}</p>
                  <p className="text-sm font-bold text-violet-600">{fmt(sponsorSummary.sentToOwner)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('net_flow')}</p>
                  <p className={`text-sm font-bold ${sponsorSummary.remaining > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {fmt(sponsorSummary.remaining)}
                  </p>
                </div>
              </div>
              {sponsorSummary.remaining > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-100 border border-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-700">
                    {sponsorSummary.branchesWithBalance} {t('branch')} — {t('settlement')}
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* Payroll obligation */}
          {payrollObligation > 0 && (
            <Card className="p-3 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-amber-500" />
                  <p className="text-sm font-medium">{t('payroll')}</p>
                </div>
                <p className="text-sm font-bold text-amber-600">{fmt(payrollObligation)}</p>
              </div>
            </Card>
          )}

          {/* Recent transactions */}
          <Card className="p-4">
            <p className="text-sm font-semibold mb-2">{t('details')}</p>
            <div className="space-y-2">
              {transactions.slice(0, 8).map(tx => {
                const meta = TYPE_META[transactionType(tx)];
                const isIn = tx.direction === 'in';
                return (
                  <div key={tx.id} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isIn ? 'bg-emerald-100' : 'bg-red-100'}`}>
                        {isIn ? <ArrowDownLeft className="w-3 h-3 text-emerald-600" /> : <ArrowUpRight className="w-3 h-3 text-red-500" />}
                      </div>
                      <div>
                        <p className="text-xs font-medium line-clamp-1">{local(meta?.label || transactionType(tx))}</p>
                        <p className="text-xs text-muted-foreground">{transactionDate(tx)}{transactionAccountName(tx, accounts) ? ` · ${transactionAccountName(tx, accounts)}` : ''}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold ${isIn ? 'text-emerald-600' : 'text-red-500'}`}>
                      {isIn ? '+' : '-'}{fmt(tx.amount)}
                    </span>
                  </div>
                );
              })}
              {transactions.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">{t('no_data')}</p>}
            </div>
          </Card>
        </TabsContent>

        {/* ── ACCOUNTS ────────────────────────────────────────────────── */}
        <TabsContent value="accounts" className="mt-3 space-y-3">
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Landmark className="h-5 w-5 shrink-0 text-indigo-600" />
                <div className="min-w-0"><p className="text-sm font-semibold">{local('Treasury Accounts')}</p><p className="text-xs text-muted-foreground">{local('Balances are calculated from opening balance plus linked transactions.')}</p></div>
              </div>
              {isOwner && <Button size="sm" className="w-full shrink-0 sm:w-auto" onClick={openCreateAccount}><Plus className="h-3.5 w-3.5 shrink-0" />{local('Add Account')}</Button>}
            </div>
          </Card>

          {accounts.length === 0 ? (
            <Card className="p-8 text-center"><WalletCards className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" /><p className="text-sm font-medium">{local('No Treasury accounts')}</p><p className="mt-1 text-xs text-muted-foreground">{local('Create an account to link every Treasury transaction and track its balance.')}</p>{isOwner && <Button size="sm" className="mt-4" onClick={openCreateAccount}>{local('Create Account')}</Button>}</Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {accounts.map((account) => {
                const balance = accountBalances[account.id] || 0;
                const linkedCount = transactions.filter((transaction) => transaction.account_id === account.id).length;
                const accountType = TREASURY_ACCOUNT_TYPES.find((type) => type.value === account.account_type)?.label || account.account_type;
                return (
                  <Card key={account.id} className="min-w-0 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950/40"><Landmark className="h-4 w-4 text-indigo-600" /></div>
                        <div className="min-w-0"><p className="truncate text-sm font-semibold">{account.account_name}</p><p className="truncate text-xs text-muted-foreground">{local(accountType)}{account.branch_key ? ` · ${account.branch_key}` : ''}</p></div>
                      </div>
                      <div className="text-end"><Badge variant={account.is_active !== false ? 'outline' : 'secondary'}>{account.is_active !== false ? local('Active') : local('Inactive')}</Badge><p className={`mt-1 text-base font-bold ${balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(balance)}</p></div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="min-w-0 rounded-md bg-muted/50 p-2"><p className="truncate text-[10px] text-muted-foreground">{local('Opening')}</p><p className="truncate text-xs font-semibold">{fmt(account.opening_balance || 0)}</p></div>
                      <div className="min-w-0 rounded-md bg-muted/50 p-2"><p className="truncate text-[10px] text-muted-foreground">{local('Transactions')}</p><p className="truncate text-xs font-semibold">{linkedCount}</p></div>
                      <div className="min-w-0 rounded-md bg-muted/50 p-2"><p className="truncate text-[10px] text-muted-foreground">{local('Currency')}</p><p className="truncate text-xs font-semibold" dir="ltr">{account.currency}</p></div>
                    </div>
                    {account.notes && <p className="mt-3 break-words text-xs text-muted-foreground">{account.notes}</p>}
                    {isOwner && <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                      <Button size="sm" variant="outline" className="min-w-24" onClick={() => openEditAccount(account)}><Pencil className="h-3.5 w-3.5" />{local('Edit')}</Button>
                      {!account.is_system && <Button size="sm" variant="outline" className="min-w-24" onClick={() => accountStatusMut.mutate({ id: account.id, is_active: account.is_active === false })}><Power className="h-3.5 w-3.5" />{account.is_active !== false ? local('Deactivate') : local('Activate')}</Button>}
                      {!account.is_system && <Button size="sm" variant="outline" className="min-w-24 text-destructive" onClick={() => setDeleteAccountId(account.id)}><Trash2 className="h-3.5 w-3.5" />{local('Delete')}</Button>}
                    </div>}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── RECONCILIATION ──────────────────────────────────────────── */}
        <TabsContent value="reconcile" className="mt-3">
          <ReconciliationDashboard
            transactions={transactions}
            sales={allSales}
            branches={branches}
            currency={currency}
          />
        </TabsContent>

        {/* ── SETTLEMENT ──────────────────────────────────────────────── */}
        <TabsContent value="settlement" className="mt-3">
          <BranchSettlementLedger
            transactions={transactions}
            branches={branches}
            currency={currency}
            onRecord={() => setShowForm(true)}
          />
        </TabsContent>

        {/* ── TRANSACTIONS ────────────────────────────────────────────── */}
        <TabsContent value="transactions" className="mt-3 space-y-3">
          <div className="flex gap-2">
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="flex-1 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <BranchSelect
              value={filterBranch}
              onChange={(branchKey) => setSelectedBranchId(
                branchKey === 'all' ? 'all' : branches.find((branch) => (branch.key || branch.branch_key) === branchKey)?.id || 'all'
              )}
              includeAll
            />
          </div>

          <div className="space-y-2">
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground text-sm">{t('loading')}</p>
            ) : filteredTx.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">{t('no_data')}</p>
            ) : filteredTx.map(tx => {
              const meta = TYPE_META[transactionType(tx)];
              const isIn = tx.direction === 'in';
              return (
                <Card key={tx.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isIn ? 'bg-emerald-100' : 'bg-red-100'}`}>
                        {isIn ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowUpRight className="w-3.5 h-3.5 text-red-500" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{local(meta?.label || transactionType(tx))}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">{transactionDate(tx)}</span>
                          {tx.branch && <Badge variant="outline" className="text-xs py-0">{tx.branch}</Badge>}
                          {transactionAccountName(tx, accounts) && <Badge variant="secondary" className="max-w-32 truncate text-xs py-0">{transactionAccountName(tx, accounts)}</Badge>}
                          {tx.description && <span className="text-xs text-muted-foreground truncate max-w-28">{tx.description}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-sm font-bold ${isIn ? 'text-emerald-600' : 'text-red-500'}`}>
                        {isIn ? '+' : '-'}{fmt(tx.amount)}
                      </span>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(tx.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ── SPONSOR LEDGER ──────────────────────────────────────────── */}
        <TabsContent value="sponsor" className="mt-3">
          <SponsorLedger />
        </TabsContent>

        {/* ── CASHFLOW FORECAST ────────────────────────────────────────── */}
        <TabsContent value="forecast" className="mt-3">
          <CashflowProjection accounts={accounts} transactions={transactions} />
        </TabsContent>

        {/* ── OWNER PERSONAL FINANCE ───────────────────────────────────── */}
        {(role === 'owner' || role === 'admin') && (
          <TabsContent value="personal" className="mt-3">
            <OwnerPersonalFinance />
          </TabsContent>
        )}

        {/* ── ANALYTICS ───────────────────────────────────────────────── */}
        <TabsContent value="analytics" className="mt-3 space-y-3">
          {trendData.some(d => d.ownerIn > 0 || d.ownerOut > 0) && (
            <Card className="p-4">
              <p className="text-sm font-semibold mb-3">{t('cashflow_title')}</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${currency}${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="networkIn" name={t('network')} stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ownerIn" name={t('inflows')} stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ownerOut" name={t('outflows')} stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="net" name={t('net_flow')} stroke="#6366f1" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {branchBalanceChart.length > 0 && (
            <Card className="p-4">
              <p className="text-sm font-semibold mb-3">{t('branch_cash')}</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={branchBalanceChart}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${currency}${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => fmt(v)} />
                  <Bar dataKey="balance" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Type breakdown */}
          <Card className="p-4">
            <p className="text-sm font-semibold mb-3">{t('summary')} — {filterMonth}</p>
            <div className="space-y-1.5">
              {TX_TYPES.map(({ value, label, direction }) => {
                const total = monthTx.filter(tx => transactionType(tx) === value).reduce((s, tx) => s + (tx.amount || 0), 0);
                if (total === 0) return null;
                return (
                  <div key={value} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate flex-1">{local(label)}</span>
                    <span className={`font-semibold ml-2 ${direction === 'in' ? 'text-emerald-600' : 'text-red-500'}`}>
                      {direction === 'in' ? '+' : '-'}{fmt(total)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add transaction dialog */}
      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) setForm(emptyForm); }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md overflow-y-auto">
          <DialogHeader><DialogTitle>{t('add_transaction')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t('transaction_type')} *</Label>
              <Select value={form.type} onValueChange={v => {
                const meta = TYPE_META[v];
                set('type', v);
                if (meta) { set('wallet', meta.wallet); }
              }}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={local('Select transaction type')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__settle_header__" disabled className="font-semibold text-xs text-muted-foreground">— Branch ↔ Owner Settlement —</SelectItem>
                  {TX_TYPES.filter(t => !t.auto && t.settlement).map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                  <SelectItem value="__credit_header__" disabled className="font-semibold text-xs text-muted-foreground">— Credit Collections —</SelectItem>
                  {TX_TYPES.filter(t => !t.auto && t.value.startsWith('credit_')).map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                  <SelectItem value="__owner_header__" disabled className="font-semibold text-xs text-muted-foreground">— Owner Only —</SelectItem>
                  {TX_TYPES.filter(t => !t.auto && !t.settlement && !t.value.startsWith('credit_') && (t.wallet === 'owner_network' || t.wallet === 'owner_cash')).map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                  <SelectItem value="__branch_header__" disabled className="font-semibold text-xs text-muted-foreground">— Branch Cash —</SelectItem>
                  {TX_TYPES.filter(t => !t.auto && !t.settlement && t.wallet === 'branch_cash').map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">{local('Treasury Account')} *</Label>
              <Select value={form.account_id} onValueChange={(value) => {
                const account = activeAccounts.find((item) => item.id === value);
                set('account_id', value);
                if (account?.branch_key && !form.branch) set('branch', account.branch_key);
                if (account) set('wallet', accountWalletKey(account));
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={local('Select account')} /></SelectTrigger>
                <SelectContent>{activeAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.account_name} · {fmt(accountBalances[account.id] || 0)}</SelectItem>)}</SelectContent>
              </Select>
              {activeAccounts.length === 0 && <p className="mt-1 text-xs text-destructive">{local('No active Treasury account is available.')}</p>}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div><Label className="text-xs">{local('Date')} *</Label><Input type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
              <div><Label className="text-xs">{local('Amount')} *</Label><Input type="number" inputMode="decimal" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" /></div>
            </div>

            {showBranch && (
              <div><Label className="text-xs">{local('Branch')}</Label><BranchSelect value={form.branch} onChange={(branchKey) => {
                set('branch', branchKey);
                setSelectedBranchId(branchKey === 'all' ? 'all' : branches.find((branch) => (branch.key || branch.branch_key) === branchKey)?.id || 'all');
              }} /></div>
            )}

            <div>
              <Label className="text-xs">{local('Payment Method')}</Label>
              <Select value={form.payment_method} onValueChange={v => set('payment_method', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{local('Cash')}</SelectItem>
                  <SelectItem value="network">{local('Network')}</SelectItem>
                  <SelectItem value="both">{local('Both')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div><Label className="text-xs">{local('Description / Notes')}</Label><Input value={form.description} onChange={e => set('description', e.target.value)} /></div>

            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              <Button className="w-full sm:flex-1" onClick={handleSave} disabled={saveMut.isPending || !form.type || !form.account_id || !form.amount}>{local('Save')}</Button>
              <Button variant="outline" className="w-full sm:flex-1" onClick={() => setShowForm(false)}>{local('Cancel')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAccountForm} onOpenChange={(open) => { setShowAccountForm(open); if (!open) { setEditingAccount(null); setAccountForm(emptyAccountForm); } }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{editingAccount ? local('Edit Treasury Account') : local('Add Treasury Account')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">{local('Account Name')} *</Label><Input className="mt-1" value={accountForm.account_name} onChange={(event) => setAccount('account_name', event.target.value)} placeholder={local('e.g. Main Bank Account')} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label className="text-xs">{local('Account Type')} *</Label><Select value={accountForm.account_type} onValueChange={(value) => setAccount('account_type', value)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{TREASURY_ACCOUNT_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{local(type.label)}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">{local('Currency')} *</Label><Input className="mt-1" dir="ltr" value={accountForm.currency} onChange={(event) => setAccount('currency', event.target.value.toUpperCase())} maxLength={8} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label className="text-xs">{local('Branch')}</Label><Select value={accountForm.branch_id || '__unassigned'} onValueChange={(value) => setAccount('branch_id', value === '__unassigned' ? '' : value)}><SelectTrigger className="mt-1"><SelectValue placeholder={local('All branches / Owner')} /></SelectTrigger><SelectContent><SelectItem value="__unassigned">{local('All branches / Owner')}</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.label || branch.name || branch.key}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">{local('Opening Balance')}</Label><Input className="mt-1" type="number" inputMode="decimal" value={accountForm.opening_balance} onChange={(event) => setAccount('opening_balance', event.target.value)} placeholder="0" /></div>
            </div>
            {!editingAccount?.is_system && <div><Label className="text-xs">{local('Status')}</Label><Select value={accountForm.is_active ? 'active' : 'inactive'} onValueChange={(value) => setAccount('is_active', value === 'active')}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">{local('Active')}</SelectItem><SelectItem value="inactive">{local('Inactive')}</SelectItem></SelectContent></Select></div>}
            {editingAccount?.is_system && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{local('System-mapped accounts stay active so automatic Treasury transactions remain linked.')}</div>}
            <div><Label className="text-xs">{local('Notes')}</Label><Textarea className="mt-1 min-h-20 resize-y" value={accountForm.notes} onChange={(event) => setAccount('notes', event.target.value)} /></div>
            <div className="flex flex-col gap-2 pt-1 sm:flex-row"><Button className="w-full sm:flex-1" onClick={handleAccountSave} disabled={accountSaveMut.isPending || !accountForm.account_name.trim()}>{accountSaveMut.isPending ? local('Saving...') : local('Save Account')}</Button><Button variant="outline" className="w-full sm:flex-1" onClick={() => setShowAccountForm(false)}>{local('Cancel')}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteAccountId} onOpenChange={() => setDeleteAccountId(null)}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md"><AlertDialogHeader><AlertDialogTitle>{local('Delete Treasury account?')}</AlertDialogTitle></AlertDialogHeader><p className="text-sm text-muted-foreground">{local('Accounts with transactions are protected and can be deactivated instead.')}</p><AlertDialogFooter className="gap-2 sm:gap-0"><AlertDialogCancel>{local('Cancel')}</AlertDialogCancel><AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => accountDeleteMut.mutate(deleteAccountId)}>{local('Delete')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this transaction?</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMut.mutate(deleteId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}