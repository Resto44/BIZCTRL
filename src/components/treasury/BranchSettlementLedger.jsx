import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Building2, TrendingUp, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency } from '@/lib/helpers';
import { format } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

// Settlement transaction types — which direction affects each ledger column
const SENT_TO_OWNER_TYPES = [
  'branch_to_owner_cash',
  'branch_to_owner_network',
  'network_sales_auto', // auto network sales go to owner_network
];
const RETURNED_TO_BRANCH_TYPES = [
  'owner_to_branch_funding',
];
const OWNER_EXPENSE_FOR_BRANCH_TYPES = [
  'owner_expense',
  'owner_salary_payment',
  'owner_external_payment',
  'branch_purchase_payment',
];

const transactionDate = (transaction) => transaction?.transaction_date || transaction?.date || '';
const transactionType = (transaction) => transaction?.transaction_type || transaction?.type || '';

/**
 * Computes per-branch settlement ledger from all wallet transactions.
 * Returns { [branchKey]: { sentToOwner, returnedToBranch, ownerExpenseForBranch, remaining, lastSentDate, lastExpenseDate } }
 */
export function computeBranchSettlements(transactions, _branches) {
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
    if (!tx.branch) return;
    ensureBranch(tx.branch);
    const entry = ledger[tx.branch];

    if (SENT_TO_OWNER_TYPES.includes(transactionType(tx))) {
      entry.sentToOwner += tx.amount || 0;
      if (!entry.lastSentDate || transactionDate(tx) > entry.lastSentDate) entry.lastSentDate = transactionDate(tx);
      entry.history.push({ ...tx, ledgerRole: 'sent' });
    } else if (RETURNED_TO_BRANCH_TYPES.includes(transactionType(tx))) {
      entry.returnedToBranch += tx.amount || 0;
      entry.history.push({ ...tx, ledgerRole: 'returned' });
    } else if (OWNER_EXPENSE_FOR_BRANCH_TYPES.includes(transactionType(tx))) {
      entry.ownerExpenseForBranch += tx.amount || 0;
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

const MONTH_OPTIONS = Array.from({ length: 6 }, (_, i) => {
  const d = new Date();
  d.setMonth(d.getMonth() - i);
  return { value: format(d, 'yyyy-MM'), label: format(d, 'MMM yyyy') };
});

export default function BranchSettlementLedger({ transactions = [], branches = [], currency = 'SAR', onRecord }) {
  const [expandedBranch, setExpandedBranch] = useState(null);
  const [statementMonth, setStatementMonth] = useState(format(new Date(), 'yyyy-MM'));
  const fmt = (v) => formatCurrency(v, currency);

  const settlements = useMemo(() =>
    computeBranchSettlements(transactions, branches),
    [transactions]
  );

  // Chart data — per-branch comparison
  const chartData = useMemo(() =>
    branches.map(b => {
      const s = settlements[b.key] || { sentToOwner: 0, ownerExpenseForBranch: 0, returnedToBranch: 0, remaining: 0 };
      return {
        name: b.label,
        key: b.key,
        'Sent to Owner': s.sentToOwner,
        'Owner Expenses': s.ownerExpenseForBranch,
        'Returned': s.returnedToBranch,
        'Remaining': Math.max(0, s.remaining),
      };
    }).filter(d => d['Sent to Owner'] > 0 || d['Remaining'] > 0),
    [settlements, branches]
  );

  // Monthly statement for selected month
  const monthlyStatement = useMemo(() => {
    return branches.map(b => {
      const prevTx = transactions.filter(tx => tx.branch === b.key && transactionDate(tx) < `${statementMonth}-01`);
      const monthTx = transactions.filter(tx => tx.branch === b.key && transactionDate(tx).startsWith(statementMonth));

      const calcSettlement = (txList) => computeBranchSettlements(txList, [b]);
      const prevLedger = calcSettlement(prevTx)[b.key] || { sentToOwner: 0, returnedToBranch: 0, ownerExpenseForBranch: 0, remaining: 0 };
      const monthLedger = calcSettlement(monthTx)[b.key] || { sentToOwner: 0, returnedToBranch: 0, ownerExpenseForBranch: 0, remaining: 0 };

      const openingBalance = prevLedger.remaining;
      const closing = openingBalance + monthLedger.sentToOwner - monthLedger.returnedToBranch - monthLedger.ownerExpenseForBranch;

      return {
        branch: b,
        openingBalance,
        sentThisMonth: monthLedger.sentToOwner,
        ownerExpensesThisMonth: monthLedger.ownerExpenseForBranch + monthLedger.returnedToBranch,
        closingBalance: closing,
      };
    }).filter(s => s.openingBalance !== 0 || s.sentThisMonth !== 0 || s.ownerExpensesThisMonth !== 0);
  }, [transactions, branches, statementMonth]);

  const totalHeldByOwner = useMemo(() =>
    Object.values(settlements).reduce((s, v) => s + v.remaining, 0),
    [settlements]
  );

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <Card className="p-4 border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <p className="text-sm font-semibold text-indigo-700">Branch Settlement Overview</p>
          </div>
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={onRecord}>
            + Record Transfer
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white dark:bg-background rounded-lg p-2 text-center">
            <p className="text-xs text-muted-foreground">Total Held by Owner</p>
            <p className={`text-base font-bold ${totalHeldByOwner >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>{fmt(totalHeldByOwner)}</p>
            <p className="text-xs text-muted-foreground">Across all branches</p>
          </div>
          <div className="bg-white dark:bg-background rounded-lg p-2 text-center">
            <p className="text-xs text-muted-foreground">Active Branches</p>
            <p className="text-base font-bold text-indigo-600">{Object.keys(settlements).length}</p>
            <p className="text-xs text-muted-foreground">With settlement history</p>
          </div>
        </div>
      </Card>

      {/* Per-branch ledger cards */}
      {branches.map(b => {
        const s = settlements[b.key] || { sentToOwner: 0, returnedToBranch: 0, ownerExpenseForBranch: 0, remaining: 0, lastSentDate: null, lastExpenseDate: null, history: [] };
        const isNegative = s.remaining < 0;
        const expanded = expandedBranch === b.key;

        return (
          <Card key={b.key} className={`p-4 ${isNegative ? 'border-red-300 bg-red-50/30 dark:bg-red-950/10' : ''}`}>
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setExpandedBranch(expanded ? null : b.key)}
            >
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isNegative ? 'bg-red-100' : 'bg-emerald-100'}`}>
                  <Building2 className={`w-4 h-4 ${isNegative ? 'text-red-500' : 'text-emerald-600'}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold">{b.label}</p>
                  {isNegative && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      مصارف اونر بیشتر از مبلغ ارسالی است
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Remaining w/ Owner</p>
                  <p className={`text-sm font-bold ${isNegative ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(s.remaining)}</p>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>

            {/* Collapsed: summary grid */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-blue-50 dark:bg-blue-950/20 rounded p-2 text-center">
                <ArrowUpRight className="w-3 h-3 text-blue-500 mx-auto mb-0.5" />
                <p className="text-xs text-muted-foreground">Sent to Owner</p>
                <p className="text-xs font-bold text-blue-600">{fmt(s.sentToOwner)}</p>
                {s.lastSentDate && <p className="text-xs text-muted-foreground">{s.lastSentDate}</p>}
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/20 rounded p-2 text-center">
                <ArrowDownLeft className="w-3 h-3 text-amber-500 mx-auto mb-0.5" />
                <p className="text-xs text-muted-foreground">Owner Spent</p>
                <p className="text-xs font-bold text-amber-600">{fmt(s.ownerExpenseForBranch + s.returnedToBranch)}</p>
                {s.lastExpenseDate && <p className="text-xs text-muted-foreground">{s.lastExpenseDate}</p>}
              </div>
              <div className={`rounded p-2 text-center ${isNegative ? 'bg-red-50 dark:bg-red-950/20' : 'bg-emerald-50 dark:bg-emerald-950/20'}`}>
                <TrendingUp className={`w-3 h-3 mx-auto mb-0.5 ${isNegative ? 'text-red-500' : 'text-emerald-500'}`} />
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className={`text-xs font-bold ${isNegative ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(s.remaining)}</p>
              </div>
            </div>

            {/* Expanded: full history */}
            {expanded && s.history.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-xs font-semibold mb-2 text-muted-foreground">Settlement History</p>
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {s.history.map((tx, i) => {
                    const roleColor = tx.ledgerRole === 'sent' ? 'text-blue-600' : tx.ledgerRole === 'returned' ? 'text-emerald-600' : 'text-amber-600';
                    const roleLabel = tx.ledgerRole === 'sent' ? 'Sent →' : tx.ledgerRole === 'returned' ? '← Returned' : 'Owner Expense';
                    return (
                      <div key={i} className="flex items-center justify-between text-xs py-0.5 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={`text-xs py-0 px-1 ${roleColor}`}>{roleLabel}</Badge>
                          <span className="text-muted-foreground">{transactionDate(tx)}</span>
                          {tx.description && <span className="text-muted-foreground truncate max-w-24">{tx.description}</span>}
                        </div>
                        <span className={`font-semibold ${tx.ledgerRole === 'sent' ? 'text-blue-600' : 'text-red-500'}`}>
                          {tx.ledgerRole === 'sent' ? '+' : '-'}{fmt(tx.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {/* Settlement comparison chart */}
      {chartData.length > 0 && (
        <Card className="p-4">
          <p className="text-sm font-semibold mb-3">Branch Settlement Comparison</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v / 1000}k`} />
              <Tooltip formatter={v => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="Sent to Owner" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Owner Expenses" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Remaining" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Monthly statements */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Monthly Settlement Statements</p>
          </div>
          <Select value={statementMonth} onValueChange={setStatementMonth}>
            <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {monthlyStatement.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">No settlement activity for this month</p>
        ) : (
          <div className="space-y-3">
            {monthlyStatement.map(({ branch: b, openingBalance, sentThisMonth, ownerExpensesThisMonth, closingBalance }) => (
              <div key={b.key} className="border border-border rounded-lg p-3">
                <p className="text-xs font-semibold mb-2">{b.label}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Opening Balance</span>
                  <span className="font-medium text-right">{fmt(openingBalance)}</span>
                  <span className="text-muted-foreground">+ Sent to Owner</span>
                  <span className="font-medium text-blue-600 text-right">+{fmt(sentThisMonth)}</span>
                  <span className="text-muted-foreground">– Owner Spending</span>
                  <span className="font-medium text-amber-600 text-right">-{fmt(ownerExpensesThisMonth)}</span>
                  <span className="font-semibold border-t border-border pt-1">Closing Balance</span>
                  <span className={`font-bold text-right border-t border-border pt-1 ${closingBalance < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(closingBalance)}</span>
                </div>
                {closingBalance < 0 && (
                  <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    باقی‌مانده هر فرع نزد اونر به عنوان موجودی عملیاتی ثبت می‌شود، نه سود جدید.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer note */}
        <p className="text-xs text-muted-foreground italic mt-3 pt-3 border-t border-border">
          باقی‌مانده هر فرع نزد اونر به عنوان موجودی عملیاتی ثبت می‌شود، نه سود جدید.
        </p>
      </Card>
    </div>
  );
}