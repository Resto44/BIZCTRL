import React, { memo, useState } from 'react';
import {
  ArrowRight, Banknote, CheckCircle2, ChevronRight, CircleMinus,
  CircleSlash2, Loader2, MessageCircle, RefreshCw, ShieldCheck,
  TrendingDown, TrendingUp,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ClosingNumericInput from '@/components/sales/ClosingNumericInput';

const numeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatted = (value) => Math.abs(numeric(value)).toLocaleString(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function Money({ currency, value, signed = false, className = '' }) {
  const amount = numeric(value);
  const sign = signed && amount !== 0 ? (amount > 0 ? '+' : '−') : '';
  return <span className={`whitespace-nowrap tabular-nums ${className}`} dir="ltr">{sign}{currency ? <>{currency}{'\u00A0'}</> : null}{formatted(amount)}</span>;
}

function EquationMetric({ label, value, currency, expected = false, className = '' }) {
  return (
    <div className={`min-w-0 rounded-xl bg-white px-2.5 py-3 text-center ${className}`}>
      <p className="truncate text-[10px] font-bold text-slate-500 sm:text-xs">{label}</p>
      <Money
        currency={expected ? currency : ''}
        value={value}
        className={`mt-1 block text-base font-black sm:text-lg ${expected ? 'text-emerald-700' : 'text-slate-950'}`}
      />
    </div>
  );
}

function EquationOperator({ children }) {
  return <span aria-hidden="true" className="hidden items-center justify-center text-xl font-medium text-slate-400 sm:flex">{children}</span>;
}

function VarianceRing({ difference, status }) {
  const tone = status === 'balanced'
    ? { ring: '#10b981', track: '#d1fae5', text: 'text-emerald-600' }
    : status === 'overage'
      ? { ring: '#f59e0b', track: '#fef3c7', text: 'text-amber-600' }
      : status === 'shortage'
        ? { ring: '#ef4444', track: '#fee2e2', text: 'text-red-500' }
        : { ring: '#94a3b8', track: '#e2e8f0', text: 'text-slate-400' };
  const display = difference === null ? '—' : difference === 0 ? '0' : `${difference > 0 ? '+' : '−'}${formatted(difference)}`;

  return (
    <div
      className="relative flex aspect-square w-24 max-w-full items-center justify-center rounded-full p-2 sm:w-28"
      style={{ background: `conic-gradient(${tone.ring} 0 28%, ${tone.track} 28% 100%)` }}
      role="status"
      aria-label={difference === null ? 'Variance pending' : `Cash variance ${difference}`}
    >
      <div className="flex h-full w-full items-center justify-center rounded-full bg-white">
        <span className={`text-2xl font-black tabular-nums sm:text-3xl ${tone.text}`} dir="ltr">{display}</span>
      </div>
    </div>
  );
}

const STATUS_OPTIONS = [
  { key: 'balanced', label: 'Balanced', Icon: CheckCircle2 },
  { key: 'overage', label: 'Over', Icon: CircleMinus },
  { key: 'shortage', label: 'Short', Icon: TrendingDown },
];

const CashReconciliationPanel = memo(function CashReconciliationPanel({
  currency = 'SAR',
  openingCash = 0,
  cashSales = 0,
  cashIn = 0,
  cashOut = 0,
  expectedCash = 0,
  actualCashValue = '',
  actualCash = null,
  difference = null,
  shortage = 0,
  overage = 0,
  cashNotes = '',
  onActualCashChange,
  onCashNotesChange,
  managerApproved = false,
  onApprove,
  actualCashError,
  ledgerLoading = false,
  ledgerUnavailable = false,
  onRetryLedger,
  branchWalletApplied = 0,
  ownerSettlementRequired = 0,
  ownerSettlementRemaining = 0,
  ownerSettlementResolved = false,
  ownerSettlementStatusLabel = 'PENDING',
  settlementStatus = '',
  canRecordOwnerPayment = false,
  onRecordOwnerPayment,
  isRecordingOwnerPayment = false,
  disabled = false,
}) {
  const [noteOpen, setNoteOpen] = useState(Boolean(cashNotes));
  const status = difference === null ? 'pending' : difference === 0 ? 'balanced' : difference < 0 ? 'shortage' : 'overage';
  const statusCopy = status === 'pending'
    ? 'Awaiting Count'
    : status === 'balanced'
      ? 'Balanced'
      : status === 'shortage'
        ? `${currency} ${formatted(shortage)} Shortage`
        : `${currency} ${formatted(overage)} Overage`;
  const StatusIcon = status === 'balanced' ? CheckCircle2 : status === 'overage' ? TrendingUp : status === 'shortage' ? TrendingDown : CircleSlash2;
  const statusTone = status === 'balanced'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : status === 'overage'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : status === 'shortage'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <section
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
      data-testid="cash-reconciliation"
      data-i18n-skip="true"
    >
      <div className="space-y-4 p-4 sm:space-y-5 sm:p-5 lg:p-6">
        <header className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-black tracking-tight text-slate-950 sm:text-2xl">Cash Reconciliation</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Physical cash count · ERP cash ledger</p>
          </div>
          <span className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-black sm:text-sm ${statusTone}`}>
            <StatusIcon className="h-4 w-4" />{statusCopy}
          </span>
        </header>

        {ledgerUnavailable ? (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-black">ERP cash ledger is unavailable.</p>
            <p className="mt-1 text-xs">The count cannot be approved until the scoped ledger is loaded.</p>
            <Button type="button" size="sm" variant="outline" className="mt-3 min-h-10 border-red-200 bg-white" onClick={onRetryLedger}>
              <RefreshCw className="mr-1.5 h-4 w-4" />Retry ledger load
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5 sm:p-3" aria-label="Expected cash equation">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.2fr)] sm:gap-1">
              <EquationMetric label="Opening" value={openingCash} />
              <EquationOperator>+</EquationOperator>
              <EquationMetric label="Cash Sales" value={cashSales} />
              <EquationOperator>+</EquationOperator>
              <EquationMetric label="Cash In" value={cashIn} />
              <EquationOperator>−</EquationOperator>
              <EquationMetric label="Cash Out" value={cashOut} />
              <EquationOperator>=</EquationOperator>
              <EquationMetric label="Expected" value={expectedCash} currency={currency} expected className="col-span-2 border border-emerald-100 sm:col-span-1" />
            </div>
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(7.5rem,0.65fr)] gap-3">
          <div id="quick-closing-reconciliation" className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <label htmlFor="quick-closing-actualCash" className="block text-xs font-black text-slate-700 sm:text-sm">Actual Cash <span className="text-red-500">*</span></label>
            <p className="mt-1 hidden text-xs text-slate-500 sm:block">Enter the physical cash count</p>
            <ClosingNumericInput
              id="quick-closing-actualCash"
              value={actualCashValue}
              onChange={onActualCashChange}
              prefix={currency}
              required
              disabled={disabled || ledgerLoading || ledgerUnavailable}
              error={actualCashError}
              placeholder="0.00"
              className="mt-3"
              inputClassName="h-20 rounded-2xl border-slate-300 bg-white pl-16 text-3xl font-black shadow-none focus-visible:ring-blue-500 sm:h-24 sm:text-4xl"
            />
          </div>
          <div className="flex min-w-0 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-2 sm:p-4">
            <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-600 sm:text-xs">Variance</p>
            {ledgerLoading ? <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-label="Loading cash ledger" /> : <VarianceRing difference={difference} status={status} />}
          </div>
        </div>

        <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-1" role="status" aria-label={`Cash status: ${statusCopy}`}>
          {STATUS_OPTIONS.map(({ key, label, Icon }) => {
            const active = status === key;
            const activeTone = key === 'balanced'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : key === 'overage'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-red-200 bg-red-50 text-red-700';
            return <div key={key} aria-current={active ? 'true' : undefined} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-bold sm:text-sm ${active ? activeTone : 'border-transparent text-slate-500'}`}><Icon className="h-4 w-4 shrink-0" />{label}</div>;
          })}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <button
            type="button"
            className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
            onClick={() => setNoteOpen((open) => !open)}
            aria-expanded={noteOpen}
            aria-controls="quick-closing-cashNotes-panel"
            aria-label="Add optional reconciliation note"
          >
            <MessageCircle className="h-5 w-5 shrink-0 text-slate-500" />
            <span className="min-w-0 flex-1 truncate">{cashNotes || 'Add optional note'}</span>
            <ChevronRight className={`h-5 w-5 shrink-0 transition-transform ${noteOpen ? 'rotate-90' : ''}`} />
          </button>
          {noteOpen && (
            <div id="quick-closing-cashNotes-panel" className="border-t border-slate-100 p-3">
              <Textarea
                id="quick-closing-cashNotes"
                value={cashNotes}
                onChange={(event) => onCashNotesChange?.(event.target.value)}
                placeholder="Optional reconciliation note"
                className="min-h-20 resize-none rounded-xl text-sm"
                disabled={disabled}
              />
              <p className="mt-1.5 text-[10px] text-slate-500">Optional — a variance is recorded even when no note is added.</p>
            </div>
          )}
        </div>

        <Button
          type="button"
          className={`min-h-14 w-full rounded-2xl text-base font-black shadow-sm ${managerApproved ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          onClick={onApprove}
          disabled={disabled || ledgerLoading || ledgerUnavailable || actualCash === null || managerApproved}
          aria-pressed={managerApproved}
        >
          {managerApproved ? <CheckCircle2 className="mr-2 h-5 w-5" /> : <ShieldCheck className="mr-2 h-5 w-5" />}
          {managerApproved ? 'Cash Count Approved' : 'Approve Cash Count'}
        </Button>

        {difference !== null && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              <h3 className="font-black text-slate-950">Settlement Responsibility</h3>
            </div>

            {status === 'shortage' ? (
              <>
                <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4">
                  <div className="rounded-2xl border border-blue-200 bg-white p-3 text-center">
                    <p className="text-xs font-bold text-blue-800">Branch Wallet</p>
                    <Money currency={currency} value={branchWalletApplied} className="mt-1 block text-xl font-black text-blue-700" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-blue-600" aria-hidden="true" />
                  <div className="rounded-2xl border border-red-200 bg-white p-3 text-center">
                    <p className="text-xs font-bold text-red-800">Owner</p>
                    <Money currency={currency} value={ownerSettlementRemaining || ownerSettlementRequired} className="mt-1 block text-xl font-black text-red-700" />
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-blue-800 sm:flex-row sm:items-center sm:justify-between">
                  <span>Separate settlement — no sales impact</span>
                  <span className="font-bold">{ownerSettlementResolved ? 'Resolved' : (ownerSettlementStatusLabel || settlementStatus)}</span>
                </div>
                {canRecordOwnerPayment && (
                  <Button type="button" size="sm" variant="outline" className="mt-3 min-h-11 w-full rounded-xl border-red-200 bg-white text-red-700 hover:bg-red-50" disabled={isRecordingOwnerPayment || ownerSettlementResolved || ownerSettlementRequired === 0} onClick={onRecordOwnerPayment}>
                    {isRecordingOwnerPayment ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Banknote className="mr-1.5 h-4 w-4" />}
                    {ownerSettlementResolved ? 'Owner Payment Recorded' : 'Record Owner Payment'}
                  </Button>
                )}
              </>
            ) : status === 'overage' ? (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                <div><p className="font-black">Cash Overage</p><p className="mt-1 text-xs">Recorded separately — no sales impact</p></div>
                <Money currency={currency} value={overage} className="text-xl font-black text-amber-700" />
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
                <CheckCircle2 className="h-5 w-5" />No settlement required
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
});

export default CashReconciliationPanel;
