import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Building2, TrendingUp, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { formatLocalizedCurrency } from '@/lib/localization';
import { treasuryText } from '@/lib/treasuryLocalization';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

export { computeBranchSettlements } from '@/lib/treasurySettlementPeriods';
import { buildSettlementStatement, settlementPeriodRange, SETTLEMENT_PERIODS } from '@/lib/treasurySettlementPeriods';
const transactionDate = transaction => transaction?.transaction_date || transaction?.date || '';
const PERIOD_LABELS = {today:'Today', week:'Week (last 7 days)', month:'Month', '3months':'3 months', '6months':'6 months', year:'Year', all:'All history'};

export default function BranchSettlementLedger({ transactions = [], branches = [], currency = 'SAR', onRecord, initialBranchKey = 'all', loading = false }) {
  const [expandedBranch, setExpandedBranch] = useState(null);
  const [period, setPeriod] = useState('month');
  const [branchKey, setBranchKey] = useState(initialBranchKey);
  const { lang, formatDate } = useLanguage();
  const tr = value => treasuryText(value, lang);
  const fmt = value => formatLocalizedCurrency(value, lang, currency);
  const range = settlementPeriodRange(period);
  const visibleBranches = useMemo(() => branches.filter(b => branchKey === 'all' || b.key === branchKey), [branches, branchKey]);
  const settlements = useMemo(() => buildSettlementStatement(transactions, visibleBranches, range), [transactions, visibleBranches, range.start, range.end]);

  // Chart data — per-branch comparison
  const chartData = useMemo(() =>
    visibleBranches.map(b => {
      const s = settlements[b.key] || { sentToOwner: 0, ownerExpenseForBranch: 0, returnedToBranch: 0, remaining: 0 };
      return {
        name: b.label,
        key: b.key,
        'Sent to Owner': s.sentToOwner,
        'Owner Expenses': s.ownerExpenseForBranch,
        'Returned': s.returnedToBranch,
        'Remaining': s.remaining,
      };
    }).filter(d => ['Sent to Owner', 'Owner Expenses', 'Returned', 'Remaining'].some(key => d[key] !== 0)),
    [settlements, visibleBranches]
  );

  const periodStatement = visibleBranches.map(branch => ({branch, ...settlements[branch.key]}));
  const totalHeldByOwner = useMemo(() =>
    Object.values(settlements).reduce((s, v) => s + v.closingBalance, 0),
    [settlements]
  );

  return (
    <div className="space-y-4 min-w-0" data-i18n-skip="true">
      <Card className="p-3 sm:p-4 space-y-3">
        <label className="block text-xs font-semibold">{tr('Branch')}
          <select aria-label={tr('Branch')} value={branchKey} onChange={event => {setBranchKey(event.target.value);setExpandedBranch(null);}} className="mt-1 block w-full rounded-lg border bg-background p-2 text-sm">
            <option value="all">{tr('All branches')}</option>
            {branches.map(branch => <option key={branch.key} value={branch.key}>{branch.label}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-7" aria-label={tr('Reporting period')}>
          {SETTLEMENT_PERIODS.map(value => <Button key={value} size="sm" variant={period === value ? 'default' : 'outline'} aria-pressed={period === value} onClick={() => {setPeriod(value);setExpandedBranch(null);}} className="h-auto min-h-9 whitespace-normal text-xs">{tr(PERIOD_LABELS[value])}</Button>)}
        </div>
        <p className="text-xs text-muted-foreground">{range.start ? formatDate(range.start) : tr('All history')} — {formatDate(range.end)}</p>
        <p className="text-xs text-muted-foreground">{tr('Calendar months and year to date; week is the last 7 days. Dates follow your device calendar.')}</p>
      </Card>
      {loading ? <Card role="status" className="p-4 text-sm">{tr('Loading settlement ledger…')}</Card> : <>
      {Object.values(settlements).some(s => s.excludedCount > 0) && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{tr('Entries without a valid date are excluded from this report.')}</p>}
      {/* Summary header */}
      <Card className="p-4 border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <p className="text-sm font-semibold text-indigo-700">{tr("Branch Settlement Overview")}</p>
          </div>
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={onRecord}>
            {tr('+ Record Transfer')}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white dark:bg-background rounded-lg p-2 text-center">
            <p className="text-xs text-muted-foreground">{tr("Closing Balance")}</p>
            <p className={`text-base font-bold ${totalHeldByOwner >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>{fmt(totalHeldByOwner)}</p>
            <p className="text-xs text-muted-foreground">{tr("Selected branches · end of period")}</p>
          </div>
          <div className="bg-white dark:bg-background rounded-lg p-2 text-center">
            <p className="text-xs text-muted-foreground">{tr("Branches in report")}</p>
            <p className="text-base font-bold text-indigo-600">{Object.keys(settlements).length}</p>
            <p className="text-xs text-muted-foreground">{tr("Selected branch scope")}</p>
          </div>
        </div>
      </Card>

      {/* Per-branch ledger cards */}
      {visibleBranches.map(b => {
        const s = settlements[b.key] || { sentToOwner: 0, returnedToBranch: 0, ownerExpenseForBranch: 0, remaining: 0, lastSentDate: null, lastExpenseDate: null, history: [] };
        const isNegative = s.closingBalance < 0;
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
                      {tr('Owner spending and returns exceed the amount received.')}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-end">
                  <p className="text-xs text-muted-foreground">{tr("Closing ledger balance (not bank cash)")}</p>
                  <p className={`text-sm font-bold ${isNegative ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(s.closingBalance)}</p>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>

            {/* Collapsed: summary grid */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-blue-50 dark:bg-blue-950/20 rounded p-2 text-center">
                <ArrowUpRight className="w-3 h-3 text-blue-500 mx-auto mb-0.5" />
                <p className="text-xs text-muted-foreground">{tr("Sent to Owner")}</p>
                <p className="text-xs font-bold text-blue-600">{fmt(s.sentToOwner)}</p>
                {s.lastSentDate && <p className="text-xs text-muted-foreground">{formatDate(s.lastSentDate)}</p>}
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/20 rounded p-2 text-center">
                <ArrowDownLeft className="w-3 h-3 text-amber-500 mx-auto mb-0.5" />
                <p className="text-xs text-muted-foreground">{tr("Owner spending + funding")}</p>
                <p className="text-xs font-bold text-amber-600">{fmt(s.ownerExpenseForBranch + s.returnedToBranch)}</p>
                {s.lastExpenseDate && <p className="text-xs text-muted-foreground">{formatDate(s.lastExpenseDate)}</p>}
              </div>
              <div className={`rounded p-2 text-center ${isNegative ? 'bg-red-50 dark:bg-red-950/20' : 'bg-emerald-50 dark:bg-emerald-950/20'}`}>
                <TrendingUp className={`w-3 h-3 mx-auto mb-0.5 ${isNegative ? 'text-red-500' : 'text-emerald-500'}`} />
                <p className="text-xs text-muted-foreground">{tr("Period movement")}</p>
                <p className={`text-xs font-bold ${s.remaining < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(s.remaining)}</p>
              </div>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">{tr('Opening Balance')}: {fmt(s.openingBalance)}</p>
            {expanded && s.history.length === 0 && <p className="mt-3 text-xs text-muted-foreground">{tr('No settlement activity in this period')}</p>}
            {/* Expanded: full history */}
            {expanded && s.history.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-xs font-semibold mb-2 text-muted-foreground">{tr("Settlement History")}</p>
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {s.history.map((tx, i) => {
                    const roleColor = tx.ledgerRole === 'sent' ? 'text-blue-600' : tx.ledgerRole === 'returned' ? 'text-emerald-600' : 'text-amber-600';
                    const roleLabel = tx.ledgerRole === 'sent' ? tr('Sent →') : tx.ledgerRole === 'returned' ? tr('← Returned') : tr('Owner Expense');
                    return (
                      <div key={i} className="flex items-center justify-between text-xs py-0.5 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={`text-xs py-0 px-1 ${roleColor}`}>{roleLabel}</Badge>
                          <span className="text-muted-foreground">{formatDate(transactionDate(tx))}</span>
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
          <p className="text-sm font-semibold mb-3">{tr("Branch Settlement Comparison")}</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v / 1000}k`} />
              <Tooltip formatter={v => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar name={tr('Sent to Owner')} dataKey="Sent to Owner" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar name={tr('Owner Expenses')} dataKey="Owner Expenses" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              <Bar name={tr('– Returned to branch')} dataKey="Returned" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              <Bar name={tr('Period movement')} dataKey="Remaining" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Monthly statements */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">{tr("Period Settlement Statements")}</p>
          </div>
        </div>

        {periodStatement.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">{tr("No settlement activity in this period")}</p>
        ) : (
          <div className="space-y-3">
            {periodStatement.map(({ branch: b, openingBalance, sentToOwner, ownerExpenseForBranch, returnedToBranch, closingBalance }) => (
              <div key={b.key} className="border border-border rounded-lg p-3">
                <p className="text-xs font-semibold mb-2">{b.label}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">{tr("Opening Balance")}</span>
                  <span className="font-medium text-end">{fmt(openingBalance)}</span>
                  <span className="text-muted-foreground">{tr("+ Sent to Owner")}</span>
                  <span className="font-medium text-blue-600 text-end">+{fmt(sentToOwner)}</span>
                  <span className="text-muted-foreground">{tr("– Owner Spending")}</span>
                  <span className="font-medium text-amber-600 text-end">-{fmt(ownerExpenseForBranch)}</span>
                  <span className="text-muted-foreground">{tr('– Returned to branch')}</span>
                  <span className="font-medium text-amber-600 text-end">-{fmt(returnedToBranch)}</span>
                  <span className="font-semibold border-t border-border pt-1">{tr("Closing Balance")}</span>
                  <span className={`font-bold text-end border-t border-border pt-1 ${closingBalance < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(closingBalance)}</span>
                </div>
                {closingBalance < 0 && (
                  <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {tr('Each branch’s balance held by the owner is an operating balance, not additional profit.')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer note */}
        <p className="text-xs text-muted-foreground italic mt-3 pt-3 border-t border-border">
          {tr('Each branch’s balance held by the owner is an operating balance, not additional profit.')}
        </p>
      </Card>
      </>}
    </div>
  );
}