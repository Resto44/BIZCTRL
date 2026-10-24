import { loadClosingCashContext } from '@/lib/closing/ClosingCashContext';
import { creditEntrySourceId, customerCreditSnapshots } from '@/lib/customerCreditSources';
/**
 * UnifiedSalesClosing — Canonical ERP Sales Closing module
 *
 * Architecture: exception-first, role-aware ERP closing workflow.
 * Design: Material 3 / Enterprise ERP, responsive, mobile-first.
 *
 * ERP posting contract:
 *  1. Sales = current-period cash + network/card + credit + other sales once.
 *  2. Opening Cash is a verified prior count or audited Owner opening.
 *  3. Expected Cash = Opening + Cash Sales + posted Cash In - Cash Out.
 *  4. Actual Cash is physically counted; Closing Cash is that count.
 *  5. Variance = Actual - Expected, recorded separately from revenue.
 *  6. Owner funding, wallet transfers and customer debt collections are not
 *     newly earned sales. Network receipts are not physical drawer cash.
 *  7. Operating Result here is Sales - approved purchases - recorded expenses,
 *     a purchase-basis management estimate, NOT audited inventory COGS profit.
 *  8. Unreconciled opening cash and overdrawn ledgers cannot finalize.
 *  9. Manual/offline cash entries need a traceable receipt and reason; their
 *     existence does not prove there are no sales in POS.
 * 10. Historic source snapshots are explanatory; do not add again.
 */
import React, { useState, useMemo, useEffect, useLayoutEffect, useCallback, useDeferredValue, useRef, memo } from 'react';
import { flushSync } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useAuth } from '@/lib/AuthContext';
import { useRole } from '@/lib/RoleContext';
import { useWorkspaceTabActive } from '@/lib/WorkspaceTabVisibilityContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import {
  Trash2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ChevronDown, ChevronUp,
  Loader2, RefreshCw, Save, X, PlusCircle,
  ClipboardCheck,
  Banknote, CreditCard, Network, ShieldCheck,
  Building2, Bike, MoreHorizontal, Coins, FileText, ChevronRight,
} from 'lucide-react';
import BranchSelect from '@/components/shared/BranchSelect';
import { toast } from 'sonner';
import { useSalesSources } from '@/hooks/useSalesSources';
import { useSalesClosingCustomization } from '@/lib/SalesClosingCustomizationContext';
import { buildSalesSourceClosingSnapshots, driverSourceEntryAmounts, driverSourcePaymentBreakdown, driverSourceTodayTotal, salesSourceTodayTotal } from '@/lib/salesSourceClosingLifecycle';
import ClosingNumericInput from '@/components/sales/ClosingNumericInput';
import CustomerCreditSalesSource from '@/components/sales/CustomerCreditSalesSource';
import CashReconciliationPanel from '@/components/sales/CashReconciliationPanel';
import ClosingCashSalesSources from '@/components/sales/ClosingCashSalesSources';
import ClosingFinalReview from '@/components/sales/ClosingFinalReview';
import { closingCashSalesSources } from '@/lib/closing/ClosingCashSalesSources';
import ClosingControlOverview from '@/components/sales/ClosingControlOverview';
import ClosingStepNavigation, { closingStepCopy, closingStepIssues } from '@/components/sales/ClosingStepNavigation';
import ClosingFundingPanel from '@/components/sales/ClosingFundingPanel';
import { activeClosingNetworkAccounts, validClosingNetworkEntries, isClosingSettlementMovement } from '@/lib/closing/ClosingFunding';
import { closingErrorDetails } from '@/lib/closing/ClosingRepository';
import { hasCanonicalCustomerScope, loadCanonicalActiveCustomers } from '@/lib/closing/CanonicalCustomerLoader';
import { recordCustomerReceivablePayment, invalidateCustomerReceivableQueries, customerDebtPaymentErrorMessage } from '@/lib/debt/customerReceivableRepository';
import { cashReconciliationSnapshot, paymentMethodForCode, closingSourceRevenueEntries, sumClosingMoney } from '@/lib/closing/CashReconciliationLedger';
import { salesSourceIconFor, salesSourceToneFor } from '@/lib/salesSourceAppearance';

const asRecordArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const firstRecord = (value) => asRecordArray(value).at(0) || null;
const newStableRowId = (prefix) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
const newCustomerCreditEntry = (sourceId = '') => ({
  id: newStableRowId('customer-credit'),
  client_row_id: newStableRowId('customer-credit-client'),
  source_id: sourceId,
  customer_id: '',
  customer_name_snapshot: '',
  customer_phone: '',
  previous_outstanding_debt: 0,
  credit_limit: 0,
  available_credit: 0,
  transaction_type: 'credit_sale',
  amount: '',
  payment_amount: '',
  payment_method: 'cash',
  notes: '',
});
const parseSalesSourceEntries = (record) => {
  const rawEntries = record?.sales_sources_json;
  if (Array.isArray(rawEntries)) return asRecordArray(rawEntries);
  try {
    return asRecordArray(JSON.parse(rawEntries || '[]'));
  } catch {
    return [];
  }
};
const matchesBranch = (record, branchKey, branchId) => {
  if (!branchKey && !branchId) return true;
  const recordBranchId = record?.branch_id;
  return (
    record?.branch === branchKey ||
    record?.branch_key === branchKey ||
    (recordBranchId && branchId && String(recordBranchId) === String(branchId)) ||
    (!record?.branch && !recordBranchId)
  );
};

// Payment-method configuration is consumed through every sales source's existing
// default_payment_method. Keep the accounting classification in one place so
// sources, totals, cash reconciliation, and the persisted closing agree.
const paymentBucketForCode = (value) => paymentMethodForCode(value);

// A saved closing stores source entries as daily snapshots. When that closing is
// reopened, its aggregate cash field already includes any cash-classified source
// amounts. Reconstruct the snapshot bucket total from the saved record rather
// than current source configuration, which may have changed since the close.
const salesSourceAmountForBucket = (record, bucket) => parseSalesSourceEntries(record)
  .reduce((total, entry) => {
    if (entry?.included_in_revenue === false) return total;
    const driverEntries = asRecordArray(entry?.driver_entries);
    if (driverEntries.length) {
      return total + driverEntries.reduce((driverTotal, driverEntry) => {
        const driverBucket = paymentBucketForCode(driverEntry?.payment_method || driverEntry?.payment_bucket);
        return driverBucket === bucket ? driverTotal + Math.max(0, Number(driverEntry?.amount ?? driverEntry?.today_amount) || 0) : driverTotal;
      }, 0);
    }
    const entryBucket = entry?.payment_bucket || paymentBucketForCode(entry?.default_payment_method);
    if (entryBucket !== bucket) return total;
    return total + Math.max(0, Number(entry?.amount ?? entry?.today_amount) || 0);
  }, 0);

const IDENTITY_FIELD_DEFAULTS = [
  { field_key: 'branch', fallback: 'Branch', sort_order: 0 },
  { field_key: 'cashier', fallback: 'Cashier', sort_order: 10 },
  { field_key: 'date', fallback: 'Date', sort_order: 30 },
  { field_key: 'shift', fallback: 'Shift', sort_order: 40 },
];

// ─────────────────────────────────────────────────────────────────────────────
// NUMERIC INPUT — shared stable Closing control
// ─────────────────────────────────────────────────────────────────────────────
// Keep the existing exported name for backwards-compatible call sites while every
// financial field uses one DOM-stable, raw-value numeric implementation.
export const NumInput = ClosingNumericInput;

// ─────────────────────────────────────────────────────────────────────────────
// MONEY — stable currency/number pairing for RTL and narrow screens
// ─────────────────────────────────────────────────────────────────────────────
function Money({ currency, value, className = '', signed = false }) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return <span className={className}>—</span>;
  const amount = Number(value);
  const sign = signed && amount > 0 ? '+' : amount < 0 ? '−' : '';
  return (
    <span className={`inline-flex max-w-full flex-wrap items-baseline gap-1 tabular-nums ${className}`} dir="ltr">
      {sign && <span>{sign}</span>}
      <span className="text-[0.78em] font-semibold tracking-wide opacity-75">{currency}</span>
      <span className="min-w-0 break-all">{Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </span>
  );
}

const CompactSalesSourceRow = memo(function CompactSalesSourceRow({
  source, sourceLabel, todayInput, today, previous, currency, onChange, historyLoading, historyUnavailable,
}) {
  const SourceIcon = salesSourceIconFor(source.icon);
  const tone = salesSourceToneFor(source.color);
  return (
    <div className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-background p-3 shadow-sm sm:grid-cols-[minmax(0,1fr)_minmax(9rem,0.55fr)] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.soft} ${tone.text}`}><SourceIcon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900" data-i18n-skip="true">{sourceLabel}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
            <span>{String(source.default_payment_method || 'cash').replaceAll('_', ' ')}</span>
            <span aria-hidden="true">•</span>
            <span>{historyLoading ? 'Loading history…' : historyUnavailable ? 'History unavailable' : <>Previous <Money currency={currency} value={previous} className="font-semibold" /></>}</span>
          </div>
        </div>
      </div>
      <ClosingNumericInput
        id={`quick-closing-source-${source.id}`}
        value={todayInput}
        onChange={onChange}
        prefix={currency}
        inputClassName="h-11 border-blue-200 font-bold"
      />
      <span className="sr-only">Today {today}; total {previous + today}</span>
    </div>
  );
});

const ClosingFieldControlRow = memo(function ClosingFieldControlRow({ field, label, value, error, onChange }) {
  const inputId = `quick-closing-custom_${field.id}`;
  const visibilityClass = field.visible_mobile === false ? 'hidden sm:grid' : field.visible_desktop === false ? 'sm:hidden' : '';
  const commonLabel = <span className="min-w-0 truncate text-sm font-bold text-slate-800">{label}{field.is_required && <span className="ml-1 text-destructive">*</span>}</span>;
  let control;
  if (field.field_type === 'long_text' || field.field_type === 'notes') {
    control = <Textarea id={inputId} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-16 resize-none text-sm sm:max-w-md" />;
  } else if (field.field_type === 'dropdown') {
    control = <Select value={value} onValueChange={onChange}><SelectTrigger id={inputId} className="min-h-11 sm:max-w-64"><SelectValue placeholder={label} /></SelectTrigger><SelectContent>{field.options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>;
  } else if (field.field_type === 'checkbox') {
    control = <label className="inline-flex min-h-11 items-center justify-end gap-2 text-sm font-semibold text-emerald-700"><input id={inputId} type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-emerald-600" />{value ? 'Completed' : 'Pending'}</label>;
  } else if (field.field_type === 'currency' || field.field_type === 'number') {
    control = <ClosingNumericInput id={inputId} value={value} onChange={onChange} required={field.is_required} inputClassName="h-11 font-bold sm:max-w-56" />;
  } else {
    control = <Input id={inputId} type={field.field_type === 'date' ? 'date' : field.field_type === 'time' ? 'time' : 'text'} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 sm:max-w-64" />;
  }
  return (
    <div id={`closing-control-field-${field.id}`} className={`grid min-w-0 gap-2 rounded-xl border border-slate-200 bg-background p-3 shadow-sm sm:grid-cols-[minmax(0,1fr)_minmax(11rem,0.75fr)_auto] sm:items-center ${visibilityClass}`}>
      <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><FileText className="h-4 w-4" /></span><div className="min-w-0">{commonLabel}{field.help_text && <p className="mt-0.5 truncate text-[10px] text-slate-500">{field.help_text}</p>}</div></div>
      <div className="min-w-0">{control}{error && <p className="mt-1 text-[10px] font-medium text-destructive">{error}</p>}</div>
      <CheckCircle2 className={`hidden h-5 w-5 sm:block ${field.field_type === 'checkbox' ? (value ? 'text-emerald-500' : 'text-slate-300') : String(value ?? '').trim() ? 'text-emerald-500' : 'text-slate-300'}`} />
    </div>
  );
});

const DriverSalesSourceCard = memo(function DriverSalesSourceCard({ source, sourceLabel, entries, drivers, branchLabel, previous, currency, onAdd, onChange, onRemove, isHistoryLoading, isHistoryUnavailable, copy }) {
  // This accordion deliberately excludes stored driver names from DOM translation.
  // Localize its own UI labels explicitly so the selected SaaS language is honored.
  const { translateLiteral } = useLanguage();
  const tr = translateLiteral;
  const driverEntries = asRecordArray(entries);
  const today = driverSourceTodayTotal(driverEntries);
  const total = previous + today;
  const breakdown = driverSourcePaymentBreakdown(driverEntries);
  const availableDrivers = asRecordArray(drivers).filter((driver) => driver.is_active !== false && driver.status !== 'inactive');
  const SourceIcon = salesSourceIconFor(source.icon);
  const tone = salesSourceToneFor(source.color);
  const [expandedEntryId, setExpandedEntryId] = useState(null);
  const [entryCountBeforeAdd, setEntryCountBeforeAdd] = useState(null);
  const canAddDriver = availableDrivers.length > driverEntries.length;

  useEffect(() => {
    if (entryCountBeforeAdd !== null && driverEntries.length > entryCountBeforeAdd) {
      setExpandedEntryId(driverEntries[driverEntries.length - 1]?.client_row_id || null);
      setEntryCountBeforeAdd(null);
      return;
    }
    if (expandedEntryId && !driverEntries.some((entry) => entry.client_row_id === expandedEntryId)) {
      setExpandedEntryId(null);
    }
  }, [driverEntries, entryCountBeforeAdd, expandedEntryId]);

  const addDriver = () => {
    setEntryCountBeforeAdd(driverEntries.length);
    onAdd();
  };

  return (
    <div className={`overflow-hidden rounded-2xl border bg-background shadow-sm ${tone.border}`} data-i18n-skip="true" data-testid="driver-source-accordion">
      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.soft} ${tone.text}`}><SourceIcon className="h-5 w-5" /></span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2"><p className={`truncate text-sm font-black ${tone.strongText}`}>{sourceLabel}</p><Badge variant="outline" className={`hidden shrink-0 text-[9px] sm:inline-flex ${tone.border} ${tone.soft} ${tone.text}`}>{tr('Driver source')}</Badge></div>
              <p className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground">{branchLabel || tr('Current branch')} · {availableDrivers.length} {tr('active')} {availableDrivers.length === 1 ? tr('driver') : tr('drivers')}</p>
            </div>
          </div>
          <Button type="button" size="sm" className="min-h-11 rounded-xl bg-blue-600 px-3 font-bold hover:bg-blue-700" onClick={addDriver} disabled={!canAddDriver}><PlusCircle className="mr-1.5 h-4 w-4" />{tr('Add Driver')}</Button>
        </div>

        <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70" data-testid="driver-source-summary">
          <div className="min-w-0 px-2 py-3 text-center"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{tr('Today')}</p><Money currency={currency} value={today} className="mt-1 block truncate text-sm font-black text-slate-950" /></div>
          <div className="min-w-0 border-x border-slate-200 px-2 py-3 text-center"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{tr('Cash')}</p><Money currency={currency} value={breakdown.cash} className="mt-1 block truncate text-sm font-black text-emerald-700" /></div>
          <div className="min-w-0 px-2 py-3 text-center"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{tr('Network')}</p><Money currency={currency} value={breakdown.network} className="mt-1 block truncate text-sm font-black text-blue-700" /></div>
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-100 bg-slate-50/40 p-3 sm:p-4">
        {driverEntries.length === 0 ? <div className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 bg-background px-3 py-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Bike className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xs font-bold text-slate-800">{tr('No driver sales yet')}</p><p className="mt-0.5 text-[10px] text-slate-500">{tr('Use Add Driver to record today\'s Cash and Network.')}</p></div></div> : driverEntries.map((entry) => {
          const usedDriverIds = new Set(driverEntries.filter((candidate) => candidate.client_row_id !== entry.client_row_id).map((candidate) => String(candidate.driver_id || '')));
          const amounts = driverSourceEntryAmounts(entry);
          const expanded = expandedEntryId === entry.client_row_id;
          const selectedDriver = availableDrivers.find((driver) => String(driver.id) === String(entry.driver_id || ''));
          const driverName = entry.driver_name || selectedDriver?.full_name || tr('Select driver');
          const initials = !entry.driver_name && !selectedDriver?.full_name ? '?' : driverName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
          const complete = Boolean(entry.driver_id) && amounts.total > 0;
          const panelId = `driver-source-panel-${entry.client_row_id}`;

          return <div key={entry.client_row_id} className={`overflow-hidden rounded-xl border bg-background transition-colors ${expanded ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'}`}>
            <button type="button" className="grid min-h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2.5 text-left" onClick={() => setExpandedEntryId(expanded ? null : entry.client_row_id)} aria-expanded={expanded} aria-controls={panelId}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black ${complete ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{initials}</span>
              <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900">{driverName}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{entry.driver_id ? <>{tr('Cash')} {currency} {amounts.cash.toLocaleString()} · {tr('Network')} {currency} {amounts.network.toLocaleString()}</> : tr('Choose a branch driver')}</span></span>
              <Money currency={currency} value={amounts.total} className="whitespace-nowrap text-sm font-black text-slate-900" />
              <span className="flex items-center gap-1.5">{complete ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <AlertCircle className="h-5 w-5 text-amber-500" />}{expanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}</span>
            </button>

            {expanded && <div id={panelId} className="space-y-3 border-t border-slate-100 bg-slate-50/50 p-3">
              <div><Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{tr('Driver')}</Label><Select value={entry.driver_id || ''} onValueChange={(driver_id) => {
                const driver = availableDrivers.find((candidate) => String(candidate.id) === String(driver_id));
                onChange(entry.client_row_id, { driver_id, driver_name: driver?.full_name || '' });
              }}><SelectTrigger className="min-h-11 bg-background"><SelectValue placeholder={tr("Select Driver")} /></SelectTrigger><SelectContent>{availableDrivers.map((driver) => <SelectItem key={driver.id} value={driver.id} disabled={usedDriverIds.has(String(driver.id))}>{driver.full_name}{driver.driver_id ? ` · ${driver.driver_id}` : ''}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label htmlFor={`driver-cash-${entry.client_row_id}`} className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{tr('Cash')}</Label><ClosingNumericInput id={`driver-cash-${entry.client_row_id}`} value={entry.cash_amount ?? entry.cash ?? ''} onChange={(value) => onChange(entry.client_row_id, { cash_amount: value })} prefix={currency} inputClassName="min-h-12 bg-background font-bold" /></div>
                <div><Label htmlFor={`driver-network-${entry.client_row_id}`} className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{tr('Network')}</Label><ClosingNumericInput id={`driver-network-${entry.client_row_id}`} value={entry.network_amount ?? entry.network ?? ''} onChange={(value) => onChange(entry.client_row_id, { network_amount: value })} prefix={currency} inputClassName="min-h-12 bg-background font-bold" /></div>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2"><span className="text-xs font-bold text-blue-800">{tr('Driver total')}</span><Money currency={currency} value={amounts.total} className="text-base font-black text-blue-900" /></div>
              <Textarea value={entry.notes || ''} onChange={(event) => onChange(entry.client_row_id, { notes: event.target.value })} placeholder={tr("Optional note")} className="min-h-11 resize-none bg-background" rows={1} />
              <div className="flex items-center justify-between gap-2"><Button type="button" variant="ghost" size="sm" className="min-h-10 text-destructive hover:text-destructive" onClick={() => onRemove(entry.client_row_id)}><Trash2 className="mr-1.5 h-4 w-4" />{tr('Remove')}</Button><Button type="button" size="sm" variant="outline" className="min-h-10 bg-background font-bold" onClick={() => setExpandedEntryId(null)}>{tr('Done')}</Button></div>
            </div>}
          </div>;
        })}
      </div>
      {availableDrivers.length === 0 && <p className="mx-3 mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 sm:mx-4">{tr('Create an active driver for this branch before recording driver sales.')}</p>}
      <div className="space-y-2 border-t border-slate-100 px-3 py-3 sm:px-4">
        <div className="flex items-center justify-between gap-3 text-sm"><div><p className="font-medium text-slate-700">{tr('Previous closings')}</p><p className="text-[10px] text-muted-foreground">{copy.previousHelp}</p></div>{isHistoryLoading ? <span className="text-xs text-muted-foreground">{copy.loadingHistory}</span> : isHistoryUnavailable ? <span className="text-xs text-destructive">{copy.historyUnavailable}</span> : <Money currency={currency} value={previous} className="font-semibold text-slate-500" />}</div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 text-sm"><div><p className="font-black text-slate-950">{tr('Running total')}</p><p className="text-[10px] text-muted-foreground">{tr('Previous + Today · read only')}</p></div>{isHistoryLoading ? <span className="text-xs text-muted-foreground">{copy.loadingHistory}</span> : isHistoryUnavailable ? <span className="text-xs text-destructive">{copy.historyUnavailable}</span> : <Money currency={currency} value={total} className="text-lg font-black text-cyan-800" />}</div>
      </div>
    </div>
  );
});
// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function UnifiedSalesClosing({ initial, onSubmit, onCancel, onNewClosing, onSessionContextChange, onRecordOwnerPayment, isOpeningNewClosing = false }) {
  const { currency, lang, t } = useLanguage();
  const { user } = useAuth();
  const { role } = useRole();
  const { ownerFilter, branches: tenantBranches, managerBranch, activeRestaurant, isManager } = useTenant();
  const { selectedBranchId: activeBranchId, selectedBranchKey: activeBranchKey, isAllBranches, setSelectedBranchId } = useBranchScope();
  const queryClient = useQueryClient();
  const {
    config: closingConfig,
    fields: configuredClosingFields,
    paymentMethods: configuredPaymentMethods,
  } = useSalesClosingCustomization();
  // The legacy automatic sources do not carry the Closing's full shift/cashier
  // identity. They must never seed a new Closing with historical branch/day
  // amounts. Current-period sales remain the explicit Today inputs until an
  // ERP feed with branch + date + shift + cashier scope is available.
  const automaticTotalsEnabled = false;
  // Manual closing never depends on POS connectivity. Automatic posting is
  // selectable only when a branch/date/shift/cashier-verified POS feed exists.
  // Legacy payment tables do not provide that scope and must not be used.
  const [salesEntryMode, setSalesEntryMode] = useState('manual');
  const requiresCashReconciliation = closingConfig?.validation_rules?.require_cash_reconciliation !== false;
  const salesSourceCopy = useMemo(() => ({
    title: t('salesClosing.sources.title'),
    today: t('salesClosing.sources.today'),
    previous: t('salesClosing.sources.previous'),
    total: t('salesClosing.sources.total'),
    todayIncluded: t('salesClosing.sources.todayIncluded'),
    todayTotal: t('salesClosing.sources.todayTotal'),
    dailyEditable: t('salesClosing.sources.dailyEditable'),
    previousHelp: t('salesClosing.sources.previousHelp'),
    totalHelp: t('salesClosing.sources.totalHelp'),
    dailySource: t('salesClosing.sources.dailySource'),
    loadingHistory: t('salesClosing.sources.loadingHistory'),
    historyUnavailable: t('salesClosing.sources.historyUnavailable'),
  }), [t]);
  const sourceNameForLanguage = useCallback((source) => {
    if (lang === 'en') return source.name_en || source.name_ar || source.name_fa || '';
    if (lang === 'fa') return source.name_fa || source.name_ar || source.name_en || '';
    return source.name_ar || source.name_en || source.name_fa || '';
  }, [lang]);
  const closingFieldNameForLanguage = useCallback((field, fallback = '') => {
    if (lang === 'en') return field?.label_en || field?.label_ar || fallback;
    return field?.label_ar || field?.label_en || fallback;
  }, [lang]);
  const branches = asRecordArray(tenantBranches);
  const [showFullDetails, setShowFullDetails] = useState(false);
  const [closingStep, setClosingStep] = useState(0);
  const finalConfirmation = useRef(false);
  const stepCopy = closingStepCopy[lang] || closingStepCopy.en;
  const [showBlockers, setShowBlockers] = useState(false);
  const [showNetworkDetail, setShowNetworkDetail] = useState(false);
  const [showOpeningVerification, setShowOpeningVerification] = useState(false);
  const [showFinalizeReview, setShowFinalizeReview] = useState(false);
  const formRef = useRef(null);
  const submissionInFlight = useRef(false);
  const workspaceTabActive = useWorkspaceTabActive();
  const assignedManagerBranch = useMemo(() => {
    if (!isManager) return null;
    return branches.find((branch) =>
      branch.id === user?.branch_id ||
      branch.key === managerBranch ||
      branch.branch_key === managerBranch,
    ) || null;
  }, [branches, isManager, managerBranch, user?.branch_id]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineErrors, setInlineErrors] = useState({});
  const [runtimeError, setRuntimeError] = useState(null);
  const [savedClosing, setSavedClosing] = useState(null);
  const [isRecordingOwnerPayment, setIsRecordingOwnerPayment] = useState(false);
  const [openingVerificationAmount, setOpeningVerificationAmount] = useState('');
  const [openingVerificationReason, setOpeningVerificationReason] = useState('');
  const [openingVerificationBusy, setOpeningVerificationBusy] = useState(false);
  const [openingVerificationError, setOpeningVerificationError] = useState('');
  const openingVerificationRequestId = useRef(null);
  const [requestedClosingState, setRequestedClosingState] = useState(
    initial?.closing_state === 'finalized' ? 'finalized' : 'draft',
  );

  // ── Form meta state ───────────────────────────────────────────────────────
  const [form, setForm] = useState({
    date: initial?.date || format(new Date(), 'yyyy-MM-dd'),
    branch: initial?.branch || (!isAllBranches ? activeBranchKey : '') || assignedManagerBranch?.key || assignedManagerBranch?.branch_key || managerBranch || '',
    branch_id: initial?.branch_id || (!isAllBranches ? activeBranchId : null) || null,
    shift: initial?.shift || 'Morning',
    cashier_name: initial?.cashier_name || '',
    cashier_employee_id: initial?.cashier_employee_id || '',
    cashier_id: initial?.cashier_id || initial?.cashier_employee_id || '',
    customer_id: initial?.customer_id || '',
    pos_device_id: initial?.pos_device_id || initial?.restaurant_network_account_id || '',
    sales_notes: initial?.sales_notes || '',
    ...initial,
  });
  const set = useCallback((field, value) => {
    setInlineErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);
  const focusField = useCallback((field) => {
    requestAnimationFrame(() => document.getElementById(`quick-closing-${field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, []);

  // The global branch UUID is the sole active Closing context. Do not restore a
  // private component preference that can reintroduce a previous branch after a
  // user switch. Parent scope changes remount an empty branch-specific form.
  useEffect(() => {
    if (initial?.id || isAllBranches || !activeBranchId || !branches.length) return;
    const activeBranch = branches.find((branch) => String(branch.id) === String(activeBranchId));
    const activeKey = activeBranch?.key || activeBranch?.branch_key;
    if (!activeKey) return;
    setForm((previous) => previous.branch === activeKey && String(previous.branch_id || '') === String(activeBranchId)
      ? previous
      : { ...previous, branch: activeKey, branch_id: activeBranchId });
  }, [activeBranchId, branches, initial?.id, isAllBranches]);

  // Tenant branches load after the workspace mounts. Persist the Branch Manager's
  // assigned branch key and UUID as soon as that record is available.
  useEffect(() => {
    if (initial?.id || !isManager || !assignedManagerBranch?.id) return;
    const branchKey = assignedManagerBranch.key || assignedManagerBranch.branch_key;
    if (!branchKey) return;
    setForm((previous) => {
      if (previous.branch && previous.branch !== branchKey) return previous;
      if (previous.branch === branchKey && previous.branch_id === assignedManagerBranch.id) return previous;
      return { ...previous, branch: branchKey, branch_id: assignedManagerBranch.id };
    });
  }, [assignedManagerBranch, initial?.id, isManager]);

  const selectedBranchId = useMemo(() => {
    const branch = branches.find((item) =>
      item.id === form.branch_id ||
      item.key === form.branch ||
      item.branch_key === form.branch,
    );
    return branch?.id || form.branch_id || null;
  }, [branches, form.branch, form.branch_id]);

  const selectClosingBranch = useCallback((nextBranchKey) => {
    const nextBranch = branches.find((branch) => branch.key === nextBranchKey || branch.branch_key === nextBranchKey);
    if (!nextBranch?.id) {
      toast.error('The selected branch is unavailable. Reload the authorized branch list and try again.');
      return;
    }
    // Clear the current component’s branch-dependent output synchronously. The
    // Sales page then remounts it under the same canonical global branch UUID,
    // preventing old branch data or in-flight responses from being rendered.
    queryClient.cancelQueries({ queryKey: ['sales-source-previous-balances'] });
    queryClient.cancelQueries({ queryKey: ['customers_form'] });
    queryClient.cancelQueries({ queryKey: ['approved_purchases_for_date'] });
    queryClient.cancelQueries({ queryKey: ['sales-closing-cash-ledger-context'] });
    setSavedClosing(null);
    setRuntimeError(null);
    setInlineErrors({});
    setRequestedClosingState('draft');
    setSalesEntryMode('manual');
    setCashSalesInput('');
    setOpeningCash('');
    setActualCashCount('');
    setCashNotes('');
    setManagerApproved(false);
    setPosEntries([{ id: newStableRowId('pos'), device_id: '', device_name: '', amount: '', notes: '' }]);
    setCustomerCreditSales([]);
    setCustomSourceAmounts({});
    setCustomClosingFieldValues({});
    setSelectedBranchId(nextBranch.id);
    setForm((previous) => ({
      ...previous,
      branch: nextBranch.key || nextBranch.branch_key,
      branch_id: nextBranch.id,
      customer_id: '',
      pos_device_id: '',
      sales_notes: '',
    }));
  }, [branches, queryClient, setSelectedBranchId]);

  // Previous source balances are calculated once in the database from immutable,
  // earlier completed closing snapshots. The aggregate is scoped by tenant, branch
  // and stable source UUID; it intentionally excludes the current date and drafts.
  const { data: sourcePreviousBalanceRows, isLoading: sourceHistoryLoading, isError: sourceHistoryUnavailable } = useQuery({
    queryKey: ['sales-source-previous-balances', activeRestaurant?.id, selectedBranchId, form.branch, form.date, initial?.id],
    enabled: Boolean(activeRestaurant?.id && form.date && (selectedBranchId || form.branch)),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sales_source_previous_balances', {
        p_restaurant_id: activeRestaurant.id,
        p_branch_id: selectedBranchId || null,
        p_branch_key: form.branch || null,
        p_before_date: form.date,
        p_current_closing_id: initial?.id || null,
      });
      if (error) throw error;
      return asRecordArray(data);
    },
    staleTime: 30000,
  });

  // ── Sales Revenue inputs ──────────────────────────────────────────────────
  const [cashSalesInput, setCashSalesInput] = useState(() => {
    const storedCash = initial?.restaurant_cash !== undefined
      ? Number(initial.restaurant_cash)
      : Number(initial?.cash);
    // `restaurant_cash` on an existing closing already contains cash-classified
    // source entries. Remove their saved daily snapshot before the live source
    // cards add those amounts back into the current calculation.
    const baseCash = initial?.id
      ? storedCash - salesSourceAmountForBucket(initial, 'cash')
      : storedCash;
    return Number.isFinite(baseCash) && baseCash ? String(Math.max(0, baseCash)) : '';
  });

  // ── Cash Reconciliation inputs ────────────────────────────────────────────
  const [openingCash, setOpeningCash] = useState(initial?.opening_cash ?? '');
  // Legacy Closing Cash is a derived field, not evidence that physical cash
  // was ever counted. Never turn a historical calculated amount into Actual.
  const [actualCashCount, setActualCashCount] = useState(
    () => initial?.actual_cash == null ? '' : String(initial.actual_cash),
  );
  const [cashNotes, setCashNotes] = useState(initial?.cash_notes || '');
  // Keep raw numeric editing values in their own stable state. React batches
  // the related calculations normally; synchronously replacing a keyed parent
  // during a keystroke can dismiss mobile keyboards.
  const updateCalculatedInput = useCallback((setter, value) => {
    setter(value);
  }, []);
  const updateCashSales = useCallback((value) => updateCalculatedInput(setCashSalesInput, value), [updateCalculatedInput]);
  const updateActualCashCount = useCallback((value) => updateCalculatedInput(setActualCashCount, value), [updateCalculatedInput]);
  const [managerApproved, setManagerApproved] = useState(initial?.manager_approval || false);
  const handleActualCashChange = useCallback((value) => {
    setInlineErrors((current) => ({ ...current, actualCash: undefined, reconciliation: undefined }));
    setManagerApproved(false);
    updateActualCashCount(value);
  }, [updateActualCashCount]);

  // ── POS entries ───────────────────────────────────────────────────────────
  const parsePosEntries = () => {
    // Supabase JSONB is already an array; legacy rows may contain a string.
    // JSON.parse(array) silently breaks reopening saved network POS totals.
    const raw = initial?.pos_entries_json;
    try {
      const parsed = asRecordArray(typeof raw === 'string' ? JSON.parse(raw) : raw);
      if (parsed.length) return parsed.map((entry, index) => ({
        ...entry,
        id: entry.id || newStableRowId(`saved-pos-${index}`),
      }));
    } catch { /* invalid legacy JSON: empty editable entry */ }
    return [{ id: newStableRowId('pos'), device_id: '', device_name: '', amount: '', notes: '' }];
  };
  const [posEntries, setPosEntries] = useState(parsePosEntries);

  // ── Customer Credit Sales Source entries ──────────────────────────────────
  const parseCustomerCreditSales = () => {
    if (initial?.credit_entries_json) {
      try {
        const raw = Array.isArray(initial.credit_entries_json) ? initial.credit_entries_json : JSON.parse(initial.credit_entries_json);
        const parsed = asRecordArray(raw);
        if (parsed.length) return parsed.map((entry) => ({
          id: entry.client_row_id || newStableRowId('customer-credit'),
          client_row_id: entry.client_row_id || newStableRowId('customer-credit-client'),
          source_id: entry.source_id || '',
          customer_id: entry.customer_id || '',
          customer_name_snapshot: entry.customer_name_snapshot || entry.customer || '',
          customer_phone: entry.customer_phone || '',
          previous_outstanding_debt: entry.previous_outstanding_debt ?? entry.previous_credit ?? entry.current_debt ?? 0,
          credit_limit: entry.credit_limit ?? entry.credit_limit_snapshot ?? 0,
          available_credit: entry.available_credit ?? 0,
          transaction_type: 'credit_sale',
          amount: entry.amount ?? entry.today_credit ?? '',
          payment_amount: '',
          payment_method: 'cash',
          notes: entry.notes || '',
        }));
      } catch { /* ignore malformed historical entry payloads */ }
    }
    return [];
  };
  const [customerCreditSales, setCustomerCreditSales] = useState(parseCustomerCreditSales);
  const [isRecordingCustomerDebtPayment, setIsRecordingCustomerDebtPayment] = useState(false);

  const addPos = () => setPosEntries(prev => [...prev, { id: Date.now(), device_id: '', device_name: '', amount: '', notes: '' }]);
  const removePos = (id) => setPosEntries(prev => prev.filter(e => e.id !== id));
  const updatePos = (id, field, value) => updateCalculatedInput(setPosEntries, prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  const removeCustomerCreditSale = (id) => setCustomerCreditSales((previous) => previous.filter((entry) => entry.id !== id));
  const updateCustomerCreditSale = (id, fieldOrPatch, value) => updateCalculatedInput(setCustomerCreditSales, (previous) => previous.map((entry) => {
    if (entry.id !== id) return entry;
    return typeof fieldOrPatch === 'object' ? { ...entry, ...fieldOrPatch } : { ...entry, [fieldOrPatch]: value };
  }));

  // ── Dynamic Sales Sources ───────────────────────────────────────────────────────────────
  const { customSources: customSourcesData, creditSource, creditSources = [], isLoading: sourcesLoading } = useSalesSources({ branchId: selectedBranchId });
  const customSources = asRecordArray(customSourcesData);
  const { data: driverSourceDriversData = [], isLoading: driverSourceDriversLoading } = useQuery({
    queryKey: ['sales-closing-driver-source-drivers', activeRestaurant?.id, selectedBranchId],
    queryFn: async () => {
      if (!activeRestaurant?.id || !selectedBranchId) return [];
      const { data, error } = await supabase
        .from('drivers')
        .select('id, restaurant_id, branch_id, driver_id, full_name, phone, status, is_active')
        .eq('restaurant_id', activeRestaurant.id)
        .eq('branch_id', selectedBranchId)
        .order('full_name')
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(activeRestaurant?.id && selectedBranchId),
    staleTime: 0,
  });
  const driverSourceDrivers = asRecordArray(driverSourceDriversData);
  const historicalSourceAmounts = useMemo(() => asRecordArray(sourcePreviousBalanceRows)
    .reduce((balances, row) => {
      if (!row?.source_id) return balances;
      balances[row.source_id] = Math.max(0, Number(row.previous_amount) || 0);
      return balances;
    }, {}), [sourcePreviousBalanceRows]);
  // Amounts keyed by source.id. Driver-enabled source values are always derived
  // from their child records and never accept a separate manual source amount.
  const [customSourceAmounts, setCustomSourceAmounts] = useState(() => {
    const map = {};
    parseSalesSourceEntries(initial).forEach((entry) => {
      if (entry?.source_id) map[entry.source_id] = String(entry.amount ?? entry.today_amount ?? '');
    });
    return map;
  });
  const [customSourceDriverEntries, setCustomSourceDriverEntries] = useState(() => parseSalesSourceEntries(initial)
    .reduce((grouped, sourceEntry) => {
      if (!sourceEntry?.source_id || !Array.isArray(sourceEntry.driver_entries)) return grouped;
      grouped[sourceEntry.source_id] = sourceEntry.driver_entries.map((entry) => ({
        ...entry,
        client_row_id: entry.client_row_id || entry.id || newStableRowId(`driver-source-${sourceEntry.source_id}`),
        sales_source_id: sourceEntry.source_id,
      }));
      return grouped;
    }, {}));
  const setCustomAmount = (sourceId, val) => updateCalculatedInput(setCustomSourceAmounts, prev => ({ ...prev, [sourceId]: val }));
  const addDriverSourceEntry = useCallback((source) => {
    setCustomSourceDriverEntries((current) => ({
      ...current,
      [source.id]: [...asRecordArray(current[source.id]), {
        client_row_id: newStableRowId(`driver-source-${source.id}`),
        sales_source_id: source.id,
        subcategory: source.subcategory || 'Drivers',
        date: form.date,
        branch_id: selectedBranchId,
        branch: form.branch,
        shift: form.shift,
        driver_id: '',
        driver_name: '',
        cash_amount: '',
        network_amount: '',
        notes: '',
      }],
    }));
  }, [form.branch, form.date, form.shift, selectedBranchId]);
  const updateDriverSourceEntry = useCallback((sourceId, clientRowId, patch) => {
    setCustomSourceDriverEntries((current) => ({
      ...current,
      [sourceId]: asRecordArray(current[sourceId]).map((entry) => entry.client_row_id === clientRowId ? { ...entry, ...patch } : entry),
    }));
  }, []);
  const removeDriverSourceEntry = useCallback((sourceId, clientRowId) => {
    setCustomSourceDriverEntries((current) => ({
      ...current,
      [sourceId]: asRecordArray(current[sourceId]).filter((entry) => entry.client_row_id !== clientRowId),
    }));
  }, []);
  const customSourceSummaries = useMemo(() => customSources.map((source) => {
    const driverEntries = source.allows_driver_entries === true ? asRecordArray(customSourceDriverEntries[source.id]) : [];
    const today = source.allows_driver_entries === true
      ? driverSourceTodayTotal(driverEntries)
      : Math.max(0, Number(customSourceAmounts[source.id]) || 0);
    const previous = Math.max(0, Number(historicalSourceAmounts[source.id] ?? 0) || 0);
    return { source, sourceLabel: sourceNameForLanguage(source), driverEntries, today, previous, total: previous + today };
  }), [customSources, customSourceAmounts, customSourceDriverEntries, historicalSourceAmounts, sourceNameForLanguage]);
  const customSourcePaymentTotals = useMemo(() =>
    customSourceSummaries.reduce((totals, { source, today, driverEntries }) => {
      if (source.included_in_revenue === false) return totals;
      if (source.allows_driver_entries === true) {
        const driverTotals = driverSourcePaymentBreakdown(driverEntries);
        totals.cash += driverTotals.cash;
        totals.card += driverTotals.network;
      } else {
        totals[paymentBucketForCode(source.default_payment_method)] += today;
      }
      return totals;
    }, { cash: 0, card: 0, bank_transfer: 0, online: 0, wallet: 0, credit: 0, other: 0 }),
    [customSourceSummaries]
  );
  const driverSourcePaymentTotals = useMemo(() => customSourceSummaries.reduce((totals, { source, driverEntries }) => {
    if (source.allows_driver_entries !== true || source.included_in_revenue === false) return totals;
    const driverTotals = driverSourcePaymentBreakdown(driverEntries);
    totals.cash += driverTotals.cash;
    totals.card += driverTotals.network;
    return totals;
  }, { cash: 0, card: 0, bank_transfer: 0, online: 0, wallet: 0, credit: 0, other: 0 }), [customSourceSummaries]);
  // The Sales Sources section and every revenue calculation use only current
  // Today values. Historical Previous values remain display/audit context.
  const customTotal = useMemo(() => salesSourceTodayTotal(customSourceSummaries), [customSourceSummaries]);
  const customClosingFields = useMemo(() => configuredClosingFields.filter((field) => !field.is_system && field.is_active !== false), [configuredClosingFields]);
  const configuredClosingFieldByKey = useMemo(() => new Map(configuredClosingFields.map((field) => [field.field_key, field])), [configuredClosingFields]);
  const closingFieldLabel = useCallback((fieldKey, fallback) => {
    const field = configuredClosingFieldByKey.get(fieldKey);
    return closingFieldNameForLanguage(field, fallback);
  }, [closingFieldNameForLanguage, configuredClosingFieldByKey]);
  const closingFieldVisibilityClass = useCallback((fieldKey) => {
    const field = configuredClosingFieldByKey.get(fieldKey);
    if (!field || field.is_active !== false) {
      if (!field) return '';
      if (field.visible_mobile === false) return 'hidden sm:block';
      if (field.visible_desktop === false) return 'sm:hidden';
      return '';
    }
    return 'hidden';
  }, [configuredClosingFieldByKey]);
  const isConfiguredClosingFieldShown = useCallback((fieldKey) => closingFieldVisibilityClass(fieldKey) !== 'hidden', [closingFieldVisibilityClass]);
  const configuredIdentityFields = useMemo(() => IDENTITY_FIELD_DEFAULTS
    .map((fallback) => ({ ...fallback, ...(configuredClosingFieldByKey.get(fallback.field_key) || {}) }))
    .filter((field) => field.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [configuredClosingFieldByKey]);
  const [customClosingFieldValues, setCustomClosingFieldValues] = useState(() => {
    const values = {};
    asRecordArray(initial?.sales_closing_custom_fields).forEach((entry) => {
      if (entry?.field_id) values[entry.field_id] = entry.value ?? '';
    });
    return values;
  });
  const updateCustomClosingField = useCallback((fieldId, value) => {
    setInlineErrors((current) => {
      const next = { ...current };
      delete next[`custom_${fieldId}`];
      return next;
    });
    updateCalculatedInput(setCustomClosingFieldValues, (previous) => ({ ...previous, [fieldId]: value }));
  }, [updateCalculatedInput]);
  const hasCustomClosingFieldValue = useCallback((field) => {
    const value = customClosingFieldValues[field.id];
    return field.field_type === 'checkbox' ? value === true : String(value ?? '').trim().length > 0;
  }, [customClosingFieldValues]);
  // ── Employees ─────────────────────────────────────────────────────────────
  const { data: employeesData, isLoading: empLoading, isError: empError } = useQuery({
    queryKey: ['employees_cashiers', activeRestaurant?.id, ownerFilter?.created_by, ownerFilter?.branch, form.branch, selectedBranchId],
    queryFn: async () => {
      if (isManager && !activeRestaurant?.id) return [];
      if (!isManager && !ownerFilter?.created_by && !ownerFilter?.branch) return [];
      const all = asRecordArray(await base44.entities.Employee.filter(
        isManager
          ? { restaurant_id: activeRestaurant.id, is_active: true }
          : { ...ownerFilter, is_active: true },
        'full_name',
        200,
      ));
      const branchFiltered = isManager
        ? all.filter((employee) => matchesBranch(employee, form.branch, selectedBranchId))
        : form.branch
          ? all.filter((employee) => !employee.branch || employee.branch === form.branch || employee.branch === 'all')
          : all;
      const CASHIER_ROLES_EN = ['cashier', 'manager', 'owner', 'supervisor', 'admin'];
      const CASHIER_ROLES_AR = ['كاشير', 'مدير', 'مشرف', 'أدمن', 'ادمن'];
      return branchFiltered.filter((employee) => {
        const position = employee.position || '';
        const positionLower = position.toLowerCase();
        return CASHIER_ROLES_EN.some((role) => positionLower.includes(role)) || CASHIER_ROLES_AR.some((role) => position.includes(role));
      });
    },
    staleTime: 60000,
    enabled: isManager
      ? !!activeRestaurant?.id && !!form.branch
      : !!ownerFilter?.created_by || !!ownerFilter?.branch,
  });
  const employees = asRecordArray(employeesData);
  const cashiers = useMemo(() => {
    const currentOperator = user?.id
      ? { id: user.id, full_name: user.full_name || user.email || (isManager ? 'Branch Manager' : 'Owner') }
      : null;
    const candidates = currentOperator && !employees.some((employee) => employee.id === currentOperator.id)
      ? [currentOperator, ...employees]
      : employees;
    const seen = new Set();
    return candidates.filter((cashier) => {
      if (!cashier?.id || seen.has(String(cashier.id))) return false;
      seen.add(String(cashier.id));
      return true;
    });
  }, [employees, isManager, user?.email, user?.full_name, user?.id]);
  const selectedCashier = useMemo(() => {
    const selectedId = form.cashier_employee_id || form.cashier_id;
    return cashiers.find((cashier) => String(cashier.id) === String(selectedId)) || null;
  }, [cashiers, form.cashier_employee_id, form.cashier_id]);
  const defaultCashier = firstRecord(cashiers);
  const cashierDisplayName = form.cashier_name || selectedCashier?.full_name || defaultCashier?.full_name || user?.full_name || user?.email || '';
  // A displayed name is NOT sufficient: every Closing ledger query and final
  // write must use one consistent UUID, including the authenticated operator
  // when an Employee cashier has not been configured.
  const uuidLike = (value) => typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  const effectiveCashierId = [
    form.cashier_id, form.cashier_employee_id, defaultCashier?.id, user?.id,
  ].find(uuidLike) || null;

  // Keep the outer New Closing action on the same stable business key as this
  // single canonical workspace. The callback is observational only: it neither
  // persists a draft nor resets any form state while the operator is typing.
  useEffect(() => {
    setClosingStep(0);
    setShowBlockers(false);
    setShowFinalizeReview(false);
    finalConfirmation.current = false;
  }, [activeRestaurant?.id, selectedBranchId, form.date, form.shift, effectiveCashierId]);

  useEffect(() => {
    onSessionContextChange?.({
      date: form.date,
      branch: form.branch,
      branch_id: selectedBranchId,
      shift: form.shift,
      cashier_id: effectiveCashierId,
      cashier_name: cashierDisplayName,
    });
  }, [cashierDisplayName, effectiveCashierId, form.branch, form.date, form.shift, onSessionContextChange, selectedBranchId]);

  // Keep the cashier name and ID synchronized. This also repairs a stale cashier
  // identifier and auto-selects the sole cashier available to an Owner.
  useEffect(() => {
    if (initial?.id || !cashiers.length) return;
    const selectedId = form.cashier_employee_id || form.cashier_id;
    const selected = cashiers.find((cashier) => String(cashier.id) === String(selectedId));

    if (selected?.id) {
      const name = selected.full_name || user?.full_name || user?.email || '';
      if (form.cashier_name === name) return;
      setForm((previous) => ({ ...previous, cashier_name: name }));
      return;
    }

    // The first active cashier is the displayed default until the user explicitly
    // chooses another option; it keeps the visible select and saved record aligned.
    const cashier = firstRecord(cashiers);
    if (!cashier?.id) return;
    setForm((previous) => ({
      ...previous,
      cashier_name: cashier.full_name || user?.full_name || user?.email || '',
      cashier_employee_id: cashier.id,
      cashier_id: cashier.id,
    }));
  }, [cashiers, form.cashier_employee_id, form.cashier_id, form.cashier_name, initial?.id, isManager, user?.email, user?.full_name]);

  // Opening Cash is supplied only by the canonical cash-context RPC below. The
  // former direct daily_sales fallback had no cashier or shift identity and could
  // apply a late response from a previously selected branch.

  // Account options come from Network Management in the active tenant/branch.
  const { data: posDevicesData, isLoading: posLoading, isError: posUnavailable, refetch: reloadNetworks } = useQuery({
    queryKey: ['pos_devices_form', activeRestaurant?.id, form.branch, selectedBranchId],
    enabled: Boolean(activeRestaurant?.id && selectedBranchId),
    queryFn: async () => {
      const all = [];
      for (let offset = 0; offset < 10000; offset += 500) {
        const { data, error } = await supabase.from('network_accounts')
          .select('id,restaurant_id,branch_id,branch,branch_key,account_name,network_name,network_provider,status,is_active')
          .eq('restaurant_id', activeRestaurant.id).order('id').range(offset, offset + 499);
        if (error) throw error;
        all.push(...data);
        if (data.length < 500) return activeClosingNetworkAccounts(all, activeRestaurant.id, selectedBranchId, form.branch);
      }
      throw new Error('Network account list exceeds safe pagination limit');
    },
    staleTime: 0,
  });
  const posDevices = useMemo(() => asRecordArray(posDevicesData), [posDevicesData]);
  const chooseNetwork = (rowId, accountId) => {
    const account = posDevices.find(item => item.id === accountId);
    setPosEntries(rows => rows.map(row => row.id === rowId ? { ...row, device_id: accountId, network_account_id: accountId,
      device_name: account?.account_name || account?.network_name || '', provider: account?.network_provider || '' } : row));
  };
  const networkSelector = (entry) => <label className="block min-w-0 space-y-1 text-xs font-semibold">
    <span>{lang === 'fa' ? 'حساب شبکه' : lang === 'ar' ? 'حساب الشبكة' : 'Network account'}</span>
    <select aria-label="Network account" className="min-h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-sm" value={entry.network_account_id || entry.device_id || ''}
      disabled={isSubmitting || posLoading || posUnavailable} onChange={event => chooseNetwork(entry.id, event.target.value)}>
      <option value="">{lang === 'fa' ? 'انتخاب از مدیریت شبکه' : lang === 'ar' ? 'اختر من إدارة الشبكات' : 'Choose from Network Management'}</option>
      {(entry.network_account_id || entry.device_id) && !posDevices.some(a => a.id === (entry.network_account_id || entry.device_id)) && <option value={entry.network_account_id || entry.device_id} disabled>{entry.device_name || 'Unavailable account'}</option>}
      {posDevices.map(account => <option key={account.id} value={account.id}>{account.account_name || account.network_name} {account.network_provider || ''}</option>)}
    </select>
  </label>;

  useEffect(() => {
    if (initial?.id || posDevices.length !== 1) return;
    const device = firstRecord(posDevices);
    if (!device?.id) return;
    setForm((previous) => ({ ...previous, pos_device_id: device.id }));
    setPosEntries((previous) => previous.map((entry, index) =>
      index === 0 && !entry.device_id
        ? {
            ...entry,
            device_id: device.id,
            network_account_id: device.id,
            device_name: device.account_name || device.device_name || '',
            provider: device.network_provider || '',
          }
        : entry,
    ));
  }, [initial?.id, posDevices]);

  // ── Customers ─────────────────────────────────────────────────────────────
  const canonicalCustomerScope = {
    restaurantId: activeRestaurant?.id,
    branchId: selectedBranchId,
    branchKey: form.branch,
  };
  const [customerSearch, setCustomerSearch] = useState('');
  const deferredCustomerSearch = useDeferredValue(customerSearch);
  const { data: allCustomersData, isLoading: custLoading, refetch: refetchCustomers } = useQuery({
    queryKey: ['canonical_customer_credit_options', canonicalCustomerScope.restaurantId, canonicalCustomerScope.branchId, deferredCustomerSearch],
    queryFn: () => loadCanonicalActiveCustomers({
      client: supabase,
      ...canonicalCustomerScope,
      search: deferredCustomerSearch,
      limit: 100,
    }),
    staleTime: 0,
    // The query and the gate intentionally use the same scope condition. This
    // avoids returning a cached-looking empty selector while the branch UUID or
    // legacy branch key is still being resolved, without widening branch access.
    enabled: hasCanonicalCustomerScope(canonicalCustomerScope),
  });
  const allCustomers = asRecordArray(allCustomersData);

  // The server-side RPC owns branch filtering and receivable aggregation. Never
  // reuse a restaurant-wide customer/debt cache after a branch switch.
  const customers = allCustomers;
  const addCustomerCreditSale = () => setCustomerCreditSales((previous) => [
    ...previous,
    newCustomerCreditEntry(creditSource?.id || ''),
  ]);

  // The selected design is a direct transaction composer. It must be ready as
  // soon as the Customer Credit Sales Source is active, without the old
  // "Add Transaction" gate or its nested wrapper.
  useEffect(() => {
    if (!creditSource || sourcesLoading) return;
    setCustomerCreditSales((previous) => previous.length
      ? previous
      : [newCustomerCreditEntry(creditSource.id)]);
  }, [creditSource?.id, sourcesLoading]);

  // ── Approved Purchases ────────────────────────────────────────────────────
  // BUG FIX: Approved purchases query must work for both Owner (created_by) and
  // Manager (restaurant_id + branch). When isManager, scope by restaurant_id and branch.
  const purchasesEnabled = !!activeRestaurant?.id && !!form.date && !!selectedBranchId && !!form.branch;

  const { data: approvedPurchasesForDateData, isLoading: purchasesLoading, isError: purchasesUnavailable } = useQuery({
    queryKey: ['approved_purchases_for_date', activeRestaurant?.id, selectedBranchId, form.branch, form.date, form.shift],
    queryFn: async () => {
      if (!activeRestaurant?.id || !form.date || !selectedBranchId || !form.branch) return [];
      const base = () => supabase
        .from('supplier_invoices')
        .select('id, total_amount, paid_amount, approval_status, date, supplier_name, branch, branch_id')
        .eq('restaurant_id', activeRestaurant.id)
        .eq('date', form.date)
        .in('approval_status', ['approved', 'auto_approved'])
        .limit(100);
      const [canonical, legacy] = await Promise.all([
        base().eq('branch_id', selectedBranchId),
        base().is('branch_id', null).eq('branch', form.branch),
      ]);
      if (canonical.error || legacy.error) throw canonical.error || legacy.error;
      return asRecordArray(Array.from(new Map([...(canonical.data || []), ...(legacy.data || [])]
        .map((record) => [record.id, record])).values()));
    },
    staleTime: 15000,
    enabled: purchasesEnabled,
  });
  const approvedPurchasesForDate = asRecordArray(approvedPurchasesForDateData);

  // Pending purchases (not approved)
  const { data: pendingPurchasesData, isLoading: pendingLoading } = useQuery({
    queryKey: ['pending_purchases_for_date', activeRestaurant?.id, selectedBranchId, form.branch, form.date, form.shift],
    queryFn: async () => {
      if (!activeRestaurant?.id || !form.date || !selectedBranchId || !form.branch) return [];
      const base = () => supabase
        .from('supplier_invoices')
        .select('id, total_amount, approval_status, date, supplier_name, branch, branch_id')
        .eq('restaurant_id', activeRestaurant.id)
        .eq('date', form.date)
        .in('approval_status', ['pending'])
        .limit(50);
      const [canonical, legacy] = await Promise.all([
        base().eq('branch_id', selectedBranchId),
        base().is('branch_id', null).eq('branch', form.branch),
      ]);
      if (canonical.error || legacy.error) throw canonical.error || legacy.error;
      return asRecordArray(Array.from(new Map([...(canonical.data || []), ...(legacy.data || [])]
        .map((record) => [record.id, record])).values()));
    },
    staleTime: 15000,
    enabled: purchasesEnabled,
  });
  const pendingPurchases = asRecordArray(pendingPurchasesData);

  // Fixed and variable expenses are supplied only by the canonical server cash
  // context. The RPC scopes the source rows by restaurant, branch UUID/key and
  // Closing date, so no restaurant-wide browser read can leak an expense into a
  // newly selected branch while a response is still in flight.

  // ── Automatic closing sources (cash register, POS and recorded payments) ──
  // Every read is scoped by the active restaurant, branch and business date. The
  // closing form uses these ERP records as its primary source; manual values are
  // exceptional adjustments only, never a required re-entry step.
  const automaticClosingEnabled = Boolean(salesEntryMode === 'automatic' && automaticTotalsEnabled
    && activeRestaurant?.id && form.date && form.branch && !initial?.id);
  const {
    data: automaticClosingData,
    isLoading: automaticClosingLoading,
    isError: automaticClosingIsError,
    refetch: refetchAutomaticClosing,
  } = useQuery({
    queryKey: ['quick_closing_automatic_sources', activeRestaurant?.id, selectedBranchId, form.branch, form.date],
    enabled: automaticClosingEnabled,
    staleTime: 15000,
    queryFn: async () => {
      const nextDate = format(new Date(`${form.date}T12:00:00`), 'yyyy-MM-dd');
      const nextDay = new Date(`${nextDate}T12:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      const endDate = format(nextDay, 'yyyy-MM-dd');
      const allowAllBranches = form.branch === 'all' && !isManager;
      const scoped = (table, columns, dateColumn, legacyBranchColumn = 'branch') => {
        const base = () => supabase.from(table)
          .select(columns)
          .eq('restaurant_id', activeRestaurant.id)
          .gte(dateColumn, `${form.date}T00:00:00`)
          .lt(dateColumn, `${endDate}T00:00:00`)
          .limit(200);
        if (allowAllBranches) return [base()];
        return [
          selectedBranchId ? base().eq('branch_id', selectedBranchId) : Promise.resolve({ data: [], error: null }),
          base().is('branch_id', null).eq(legacyBranchColumn, form.branch),
        ];
      };
      const posBase = () => supabase.from('pos_reconciliation')
        .select('id, expected_amount, actual_amount, date, branch, branch_id, device_id')
        .eq('restaurant_id', activeRestaurant.id)
        .eq('date', form.date)
        .limit(100);
      const creditBase = () => supabase.from('debt_records')
        .select('id, total_amount, date, branch, branch_id, party_name')
        .eq('restaurant_id', activeRestaurant.id)
        .eq('date', form.date)
        .eq('type', 'receivable')
        .eq('party_type', 'customer')
        .limit(100);
      const posQueries = allowAllBranches
        ? [posBase()]
        : [
            selectedBranchId ? posBase().eq('branch_id', selectedBranchId) : Promise.resolve({ data: [], error: null }),
            posBase().is('branch_id', null).eq('branch', form.branch),
          ];
      const creditQueries = allowAllBranches
        ? [creditBase()]
        : [
            selectedBranchId ? creditBase().eq('branch_id', selectedBranchId) : Promise.resolve({ data: [], error: null }),
            creditBase().is('branch_id', null).eq('branch', form.branch),
          ];
      const [paymentResults, posResults, creditResults] = await Promise.all([
        Promise.all(scoped('payments', 'id, amount, payment_method, status, created_date, branch, branch_id', 'created_date')),
        Promise.all(posQueries),
        Promise.all(creditQueries),
      ]);
      const queryError = [paymentResults, posResults, creditResults]
        .flat()
        .find((result) => result?.error)?.error;
      if (queryError) throw queryError;
      const merge = (...results) => asRecordArray(Array.from(new Map(results.flatMap((result) => asRecordArray(result?.data)).map((record) => [record.id, record])).values()));
      return {
        payments: merge(...paymentResults),
        pos: merge(...posResults),
        credit: merge(...creditResults),
      };
    },
  });
  const automaticClosing = useMemo(() => {
    if (initial?.id) return { cash: 0, network: 0, credit: 0, other: 0, expectedCash: null, openingCash: null, hasData: false, paymentCount: 0 };
    const source = automaticClosingData || {};
    const paymentTotals = asRecordArray(source.payments).reduce((totals, payment) => {
      const status = String(payment.status || '').toLowerCase();
      if (status && !['paid', 'completed', 'success', 'settled'].includes(status)) return totals;
      const amount = Number(payment.amount) || 0;
      const method = String(payment.payment_method || '').toLowerCase();
      if (['cash', 'cash_on_delivery', 'cod'].includes(method)) totals.cash += amount;
      else if (['card', 'network', 'pos', 'visa', 'mastercard', 'mada', 'digital'].includes(method)) totals.network += amount;
      else if (['credit', 'customer_credit', 'on_account'].includes(method)) totals.credit += amount;
      else totals.other += amount;
      return totals;
    }, { cash: 0, network: 0, credit: 0, other: 0 });
    return {
      cash: paymentTotals.cash,
      network: paymentTotals.network,
      credit: paymentTotals.credit,
      other: paymentTotals.other,
      expectedCash: null,
      openingCash: null,
      hasData: Boolean(asRecordArray(source.payments).length || asRecordArray(source.pos).length || asRecordArray(source.credit).length),
      paymentCount: asRecordArray(source.payments).length,
    };
  }, [automaticClosingData, initial?.id]);

  // Query results can arrive in separate React commits while branch resolution is
  // still stabilising. Keep one immutable snapshot for every visual calculation
  // so the sales cards, reconciliation and final review never show mixed totals.
  // The scope marker prevents a previous branch or date's totals from surviving
  // into a new closing while its query is still loading.
  const automaticClosingScope = [
    initial?.id || 'new',
    activeRestaurant?.id || '',
    selectedBranchId || form.branch || '',
    form.date || '',
  ].join(':');
  const [automaticClosingSnapshot, setAutomaticClosingSnapshot] = useState(() => ({
    scope: null,
    cash: 0, network: 0, credit: 0, other: 0, expectedCash: null, openingCash: null, hasData: false, paymentCount: 0,
  }));
  useLayoutEffect(() => {
    setAutomaticClosingSnapshot((previous) => {
      const next = { ...automaticClosing, scope: automaticClosingScope };
      if (previous.scope !== automaticClosingScope) return next;
      const unchanged = previous.cash === next.cash && previous.network === next.network && previous.credit === next.credit && previous.other === next.other && previous.expectedCash === next.expectedCash && previous.openingCash === next.openingCash && previous.hasData === next.hasData && previous.paymentCount === next.paymentCount;
      return unchanged ? previous : next;
    });
  }, [automaticClosing, automaticClosingScope]);
  const snapshotMatchesScope = automaticClosingSnapshot.scope === automaticClosingScope;
  const useAutomaticSales = Boolean(salesEntryMode === 'automatic' && automaticTotalsEnabled
    && !initial?.id && snapshotMatchesScope && automaticClosingSnapshot.hasData);
  const autoSourceLoading = automaticClosingEnabled && automaticClosingLoading && !useAutomaticSales;
  const automaticClosingUnavailable = automaticClosingEnabled && automaticClosingIsError && !useAutomaticSales;

  // The canonical server context is the only source of opening cash and posted
  // physical-cash movements. It is scoped by restaurant, branch, date, shift and
  // cashier, so unrelated shifts or prior days cannot change this Closing.
  const currentClosingId = savedClosing?.id || initial?.id || null;
  const { data: cashLedgerContextData, isLoading: cashLedgerLoading, isError: cashLedgerUnavailable, refetch: refetchCashLedger } = useQuery({
    queryKey: ['sales-closing-cash-ledger-context', activeRestaurant?.id, selectedBranchId, form.branch, form.date, form.shift, effectiveCashierId, currentClosingId],
    enabled: Boolean(activeRestaurant?.id && selectedBranchId && form.date && form.shift && effectiveCashierId),
    staleTime: 15000,
    queryFn: () => loadClosingCashContext(supabase, {
        p_restaurant_id: activeRestaurant.id,
        p_branch_id: selectedBranchId,
        p_branch: form.branch,
        p_date: form.date,
        p_shift: form.shift,
        p_cashier_id: effectiveCashierId,
        p_closing_id: currentClosingId,
    }),
  });
  const cashLedgerContext = cashLedgerContextData || {};
  const ledgerClosingId = cashLedgerContext.resolved_closing_id || currentClosingId;
  // Never infer a zero opening from a missing previous count or from a
  // different cashier's drawer. The backend returns explicit provenance.
  const openingReviewRequired = cashLedgerContext.opening_verified === false;
  const openingReviewReason = cashLedgerContext.opening_status === 'initial_opening_required'
    ? 'No earlier finalized cash count exists. The owner must count and verify the opening drawer balance, even if it is zero.'
    : cashLedgerContext.opening_status === 'ambiguous_previous_shift'
      ? 'The previous shift has multiple possible drawers. The owner must confirm the actual opening drawer count before closing.'
      : 'The previous finalized shift has no verified Actual Cash count. The owner must confirm the physical opening balance before closing.';
  const cashContextReady = Boolean(cashLedgerContextData && cashLedgerContext.opening_verified === true);
  // A separate immutable owner approval resolves a missing historic/initial
  // physical drawer baseline. It never modifies past sales or cash movements.
  const verifyOpeningCash = async () => {
    if (openingVerificationBusy || role !== 'owner') return;
    const raw = openingVerificationAmount.trim();
    const amount = Number(raw);
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isFinite(amount) || amount < 0) {
      setOpeningVerificationError('Enter the physically counted opening cash (0 or a positive amount, max two decimals).');
      return;
    }
    if (openingVerificationReason.trim().length < 10) {
      setOpeningVerificationError('Provide a clear reason with at least 10 characters for the audit log.');
      return;
    }
    const cashierId = effectiveCashierId;
    if (!activeRestaurant?.id || !selectedBranchId || !form.branch || !form.date || !form.shift || !cashierId) {
      setOpeningVerificationError('Select a valid business, branch, shift and cashier before verifying opening cash.');
      return;
    }
    const requestId = openingVerificationRequestId.current
      || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null);
    if (!requestId) {
      setOpeningVerificationError('Your browser could not generate a secure audit request ID. Reload and retry.');
      return;
    }
    openingVerificationRequestId.current = requestId;
    setOpeningVerificationError('');
    setOpeningVerificationBusy(true);
    try {
      const { error } = await supabase.rpc('erp_verify_sales_closing_opening_count', {
        p_restaurant_id: activeRestaurant.id,
        p_branch_id: selectedBranchId,
        p_branch: form.branch,
        p_date: form.date,
        p_shift: form.shift,
        p_cashier_id: cashierId,
        p_counted_cash: amount,
        p_reason: openingVerificationReason.trim(),
        p_request_id: requestId,
      });
      if (error) throw error;
      openingVerificationRequestId.current = null;
      setOpeningVerificationAmount('');
      setOpeningVerificationReason('');
      await refetchCashLedger();
      toast.success('Opening drawer count verified and recorded in the audit log.');
    } catch (error) {
      setOpeningVerificationError(error?.message || 'Could not verify opening cash. Check the prior closing or retry.');
    } finally {
      setOpeningVerificationBusy(false);
    }
  };
  const activeOwnerSettlement = ledgerClosingId && cashLedgerContext.owner_settlement?.closing_id === ledgerClosingId
    ? cashLedgerContext.owner_settlement
    : null;
  const ownerSettlementPaymentApplied = Math.max(0, Number(activeOwnerSettlement?.owner_payment_amount) || 0);
  // ── Closing calculations sourced from the selected ERP scope ──────────────
  const manualCashSales = Math.max(0, Number(cashSalesInput) || 0);
  const manualNetworkTotal = asRecordArray(posEntries).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const manualCreditTotal = asRecordArray(customerCreditSales).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const baseCashSales = useAutomaticSales ? automaticClosingSnapshot.cash : manualCashSales;
  const baseNetworkTotal = useAutomaticSales ? automaticClosingSnapshot.network : manualNetworkTotal;
  const baseCreditTotal = (useAutomaticSales ? automaticClosingSnapshot.credit : 0) + manualCreditTotal;
  const cashSales = sumClosingMoney(baseCashSales, customSourcePaymentTotals.cash);
  const cardTotal = sumClosingMoney(baseNetworkTotal, customSourcePaymentTotals.card);
  const bankTransferTotal = customSourcePaymentTotals.bank_transfer;
  const onlineTotal = customSourcePaymentTotals.online;
  const walletTotal = customSourcePaymentTotals.wallet;
  const creditTotal = sumClosingMoney(baseCreditTotal, customSourcePaymentTotals.credit);
  const otherPaymentTotal = (useAutomaticSales ? automaticClosingSnapshot.other : 0) + customSourcePaymentTotals.other;
  const networkTotal = sumClosingMoney(cardTotal, bankTransferTotal, onlineTotal, walletTotal);
  const totalSales = sumClosingMoney(cashSales, networkTotal, creditTotal, otherPaymentTotal);
  // ERP source breakdown and the drawer's Cash Sales always use the SAME
  // current-shift tender bucket; never add owner/treasury funding as sales.
  const cashSalesBreakdown = useMemo(() => closingCashSalesSources({
    baseCashSales, summaries: customSourceSummaries,
  }), [baseCashSales, customSourceSummaries]);
  const cashSalesSourcesMatched =
    Math.abs(Math.round(cashSalesBreakdown.total * 100) - Math.round(cashSales * 100)) <= 1;

  useEffect(() => {
    if (!initial?.id && cashLedgerContext.opening_cash !== undefined && cashLedgerContext.opening_cash !== null) setOpeningCash(String(cashLedgerContext.opening_cash));
  }, [cashLedgerContext.opening_cash, initial?.id]);

  const opening = openingReviewRequired ? null : Number(cashLedgerContext.opening_cash ?? openingCash) || 0;
  // Blank / incomplete numeric input is not a physical count. 0 is valid only
  // when the operator actually typed zero; never coerce an empty count to zero.
  const hasValidActualCount = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(actualCashCount));
  const actualCount = hasValidActualCount && Number.isFinite(Number(actualCashCount))
    ? Number(actualCashCount) : null;
  const ownerContrib = 0;
  const approvedPurchasesTotal = approvedPurchasesForDate.reduce((sum, purchase) => sum + (Number(purchase.total_amount) || 0), 0);
  // The server context is canonical for both daily fixed allocation and dated
  // variable expenses. Accounting expenses stay separate from purchases, and
  // neither changes Expected Cash unless the ERP cash ledger contains Cash OUT.
  const fixedExpensesToday = Math.max(0, Number(cashLedgerContext.fixed_expense_today) || 0);
  const variableExpensesToday = Math.max(0, Number(cashLedgerContext.variable_expenses_today) || 0);
  const operatingExpensesTotal = fixedExpensesToday + variableExpensesToday;
  const totalDailyExpenses = approvedPurchasesTotal + operatingExpensesTotal;
  const branchWalletAvailable = Math.max(0, Number(cashLedgerContext.branch_wallet_available) || 0);
  const reconciliation = cashReconciliationSnapshot({
    openingCash: opening ?? 0,
    ledgerMovements: asRecordArray(cashLedgerContext.movements).filter(
      (movement) => !isClosingSettlementMovement(movement, ledgerClosingId),
    ),
    currentCashSales: baseCashSales,
    revenueEntries: [
      // POS/network and credit are sales but never physical drawer cash.
      // Include them exactly once in reconciliation's revenue overview.
      { amount: baseNetworkTotal, payment_method: 'card' },
      { amount: baseCreditTotal, payment_method: 'credit' },
      ...(useAutomaticSales ? [{ amount: automaticClosingSnapshot.other, payment_method: 'other' }] : []),
      ...closingSourceRevenueEntries(customSourceSummaries),
    ],
    actualCash: actualCount,
    branchWalletAvailable,
  });
  const ledgerOverdrawn = cashContextReady && reconciliation.ledgerOverdrawn;
  const branchWalletApplied = Math.max(0, Number(activeOwnerSettlement?.wallet_payment_amount ?? reconciliation.branchWalletApplied) || 0);
  const ownerSettlementRequired = Math.max(0, Number(activeOwnerSettlement?.owner_settlement_required ?? reconciliation.ownerPaymentRequired) || 0);
  const ownerSettlementPaymentTarget = Math.max(ownerSettlementRequired, reconciliation.ownerPaymentRequired);
  const ownerSettlementRemaining = Math.max(0, ownerSettlementRequired - ownerSettlementPaymentApplied);
  const ownerSettlementResolved = Boolean(activeOwnerSettlement) && (
    String(activeOwnerSettlement.status || '').toLowerCase() === 'resolved'
    || (ownerSettlementPaymentTarget > 0 && ownerSettlementPaymentApplied >= ownerSettlementPaymentTarget)
    || (reconciliation.shortage > 0 && ownerSettlementRemaining === 0)
  );
  const ownerSettlementStatusLabel = ownerSettlementResolved
    ? 'Resolved'
    : (activeOwnerSettlement?.status || 'PENDING');
  const expectedCash = !cashContextReady ? null : reconciliation.expectedCash;
  const cashDifference = !cashContextReady || ledgerOverdrawn ? null : reconciliation.difference;
  const cashReconcStatus = cashDifference === null ? null : cashDifference === 0 ? 'Balanced' : cashDifference < 0 ? 'Shortage' : 'Overage';
  // Closing Cash for this shift equals the counted physical drawer cash.
  // Wallet settlement and network receipts are never silently added to it.
  const closingCash = actualCount !== null && cashContextReady && !ledgerOverdrawn ? actualCount : null;
  const remainingDifference = cashDifference;
  // Funding never changes this result; it is a settlement flow, not revenue.
  const operatingResult = sumClosingMoney(totalSales, -totalDailyExpenses);

  // Validation checks
  const validations = useMemo(() => [
    {
      key: 'erpData',
      label: 'ERP Sales and Cash Ledger Available',
      passed: !automaticClosingUnavailable && !cashLedgerUnavailable && cashContextReady && !openingReviewRequired && !ledgerOverdrawn,
      message: !effectiveCashierId ? 'Select a valid cashier/operator to load the cash ledger' : openingReviewRequired ? openingReviewReason : ledgerOverdrawn ? (lang === 'fa' ? 'تمویل از خزانه یا اونر را ثبت کنید' : lang === 'ar' ? 'سجّل تمويل الخزينة أو المالك' : 'Record treasury or owner funding') : automaticClosingUnavailable || cashLedgerUnavailable ? 'Cash ledger could not be loaded; recheck branch and shift' : !cashContextReady ? 'Cash ledger is loading or opening count is not verified' : 'Verified cash ledger available',
    },
    {
      key: 'cashier',
      label: 'Cashier Selected',
      passed: Boolean(effectiveCashierId && cashierDisplayName),
      message: effectiveCashierId ? (cashierDisplayName || 'Required') : 'Assign an operator/cashier UUID',
    },
    {
      key: 'branch',
      label: 'Branch Selected',
      passed: !!form.branch,
      message: form.branch || 'Required',
    },
    {
      key: 'shift',
      label: 'Shift Open',
      passed: !!form.shift,
      message: form.shift || 'Required',
    },
    {
      key: 'purchases',
      label: 'Purchases Recorded',
      passed: true,
      message: approvedPurchasesForDate.length > 0 ? `${approvedPurchasesForDate.length} approved` : 'No approved purchases — optional',
    },
    {
      key: 'pos',
      label: 'POS Totals Valid',
      passed: validClosingNetworkEntries(posEntries, posDevices) && !(manualNetworkTotal > 0 && (posLoading || posUnavailable)),
      message: validClosingNetworkEntries(posEntries, posDevices) ? `${currency} ${networkTotal.toLocaleString()}` : (lang === 'fa' ? 'برای هر مبلغ کارت یک حساب شبکه فعال انتخاب کنید.' : lang === 'ar' ? 'اختر حساب شبكة نشطاً لكل مبلغ بطاقة.' : 'Choose an active network account for each card amount.'),
    },
    {
      key: 'credit',
      label: 'Customer Credit Sales Valid',
      passed: customerCreditSales.every((entry) => {
        const amount = Number(entry.amount);
        return Number.isFinite(amount) && amount >= 0 && (amount === 0 || Boolean(entry.customer_id));
      }),
      message: `${currency}\u00A0${manualCreditTotal.toLocaleString()} credit sales`,
    },
    {
      key: 'cashSources',
      label: 'Cash Sales Sources Reconciled',
      passed: cashSalesSourcesMatched,
      message: cashSalesSourcesMatched ? 'Cash tender source totals match' : 'Recheck cash source classification before posting',
    },
    {
      key: 'cash',
      label: 'Cash Totals Valid',
      passed: cashSales >= 0,
      message: `${currency}\u00A0${cashSales.toLocaleString()}`,
    },
    {
      key: 'creditLimit',
      label: 'Credit Limits Not Exceeded',
      passed: !customerCreditSales.some((entry) => (Number(entry.amount) || 0) > (Number(entry.available_credit) || 0)),
      message: 'All credit sales are within the latest available credit shown.',
    },
    {
      key: 'cashBalance',
      label: 'Actual Cash Count Recorded',
      passed: actualCount !== null,
      message: actualCount === null ? 'A verified physical cash count is required by the server' : remainingDifference === 0 ? 'Balanced' : 'Variance will be recorded separately',
    },
    {
      key: 'requiredFields',
      label: 'Required Fields Complete',
      passed: !!form.date && !!form.branch && customClosingFields.every((field) => !field.is_required || hasCustomClosingFieldValue(field)),
      message: form.date || 'Date required',
    },
  ], [form, automaticClosingUnavailable, cashLedgerUnavailable, cashContextReady, openingReviewRequired, ledgerOverdrawn, useAutomaticSales, cashierDisplayName, effectiveCashierId, approvedPurchasesForDate, posEntries, posDevices, posLoading, posUnavailable, lang, customerCreditSales, customClosingFields, customClosingFieldValues, hasCustomClosingFieldValue, cashSales, cashSalesSourcesMatched, networkTotal, creditTotal, actualCount, remainingDifference, requiresCashReconciliation, currency]);

  const allValid = useMemo(() => validations.every(v => v.passed), [validations]);
  const networkCounterTotal = baseNetworkTotal;
  const networkDriversTotal = driverSourcePaymentTotals.card;
  const otherNetworkTotal = Math.max(0, networkTotal - networkCounterTotal - networkDriversTotal);
  const completedClosingFields = useMemo(() => customClosingFields.filter(hasCustomClosingFieldValue).length, [customClosingFields, hasCustomClosingFieldValue]);
  const incompleteRequiredFields = useMemo(
    () => customClosingFields.filter((field) => field.is_required && !hasCustomClosingFieldValue(field)),
    [customClosingFields, hasCustomClosingFieldValue],
  );
  const failedValidations = useMemo(() => validations.filter((validation) => !validation.passed), [validations]);
  const stepFailedValidations = closingStep === 2 ? failedValidations : closingStepIssues(closingStep, validations);
  const attentionCount = stepFailedValidations.length;
  const goToClosingStep = (next) => {
    if (isSubmitting || submissionInFlight.current) return;
    const target = Math.max(0, Math.min(2, next));
    if (target > closingStep && closingStepIssues(closingStep, validations).length) {
      setShowBlockers(true);
      requestAnimationFrame(() => document.getElementById('closing-readiness-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      return;
    }
    setClosingStep(target);
    setShowBlockers(false);
    requestAnimationFrame(() => {
      const heading = document.getElementById('closing-step-heading');
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submissionInFlight.current) return;
    const savingDraft = requestedClosingState === 'draft';
    const explicitDraft = e.nativeEvent?.submitter?.dataset?.closingIntent === 'draft';
    const confirmed = finalConfirmation.current;
    finalConfirmation.current = false;
    // Enter in a field can move forward, but can never finalize a closing.
    if (!explicitDraft && !confirmed) {
      goToClosingStep(Math.min(2, closingStep + 1));
      return;
    }
    if (confirmed && (closingStep !== 2 || !allValid || !cashContextReady || ledgerOverdrawn)) {
      setShowBlockers(true);
      return;
    }

    const invalidCredit = customerCreditSales.find((entry) => {
      const amount = Number(entry.amount);
      return !Number.isFinite(amount) || amount < 0 || (amount > 0 && !entry.customer_id);
    });
    const limitExceededEntry = customerCreditSales.find((entry) => (Number(entry.amount) || 0) > (Number(entry.available_credit) || 0));
    const pendingPaymentEntry = customerCreditSales.find((entry) => (Number(entry.payment_amount) || 0) > 0);
    const nextErrors = {};
    const invalidDriverSourceEntry = customSourceSummaries
      .filter(({ source }) => source.allows_driver_entries === true)
      .flatMap(({ driverEntries }) => driverEntries)
      .find((entry) => {
        const cash = Number(entry.cash_amount ?? entry.cash ?? 0);
        const network = Number(entry.network_amount ?? entry.network ?? 0);
        const total = driverSourceEntryAmounts(entry).total;
        return !entry.driver_id || cash < 0 || network < 0 || total <= 0;
      });
    const duplicateDriverSourceEntry = customSourceSummaries
      .filter(({ source }) => source.allows_driver_entries === true)
      .find(({ driverEntries }) => {
        const ids = driverEntries.map((entry) => String(entry.driver_id || '')).filter(Boolean);
        return new Set(ids).size !== ids.length;
      });
    if (!validClosingNetworkEntries(posEntries, posDevices) || (manualNetworkTotal > 0 && (posLoading || posUnavailable))) nextErrors.pos = 'Choose an active branch network account for each card amount.';
    if (!form.date) nextErrors.date = 'Date is required.';
    if (!form.branch) nextErrors.branch = 'Branch is required.';
    if (!form.shift) nextErrors.shift = 'Shift is required.';
    if (!cashierDisplayName || !effectiveCashierId) nextErrors.cashier = 'Select a valid operator/cashier before saving.';
    if (openingReviewRequired) nextErrors.reconciliation = openingReviewReason;
    if (cashLedgerUnavailable || !cashContextReady) nextErrors.reconciliation = 'Load and verify the ERP cash ledger before saving.';
    if (!savingDraft && ledgerOverdrawn) nextErrors.reconciliation = 'Cash ledger is overdrawn. Reconcile dated cash movements and funding before finalizing.';
    if (!savingDraft && actualCount === null) nextErrors.actualCash = 'Enter the physically counted Actual Cash (0 or positive, up to two decimal places).';
    // Manual daily totals are a supported mode, not an exceptional adjustment.
    // Optional references belong to the audit note; an unwritten note cannot
    // block an otherwise reconciled Closing that has no POS connection.
    if (invalidCredit) nextErrors.credit = 'Select an active branch customer and enter a valid non-negative credit sale amount.';
    if (!savingDraft && pendingPaymentEntry) nextErrors.credit = 'Record or clear the customer debt payment before saving the Sales Closing.';
    if (!savingDraft && limitExceededEntry) nextErrors.credit = `Credit limit exceeded for ${limitExceededEntry.customer_name_snapshot || 'the selected customer'}. Reduce the credit sale to the live available credit.`;
    if (!savingDraft && invalidDriverSourceEntry) nextErrors.driverSources = 'Each driver sales row requires an active branch driver, non-negative Cash and Network amounts, and a positive total.';
    if (!savingDraft && duplicateDriverSourceEntry) nextErrors.driverSources = 'A driver can appear only once per Sales Source and closing shift.';
    customClosingFields.forEach((field) => {
      if (!savingDraft && field.is_required && !hasCustomClosingFieldValue(field)) nextErrors[`custom_${field.id}`] = `${field.label_en} is required.`;
    });
    if (Object.keys(nextErrors).length) {
      setInlineErrors(nextErrors);
      const firstError = Object.keys(nextErrors)[0];
      if (!['actualCash', 'reconciliation', 'sales_notes'].includes(firstError)) setShowFullDetails(true);
      if (['actualCash', 'reconciliation'].includes(firstError)) setClosingStep(1);
      requestAnimationFrame(() => focusField(firstError));
      return;
    }
    setInlineErrors({});
    setRuntimeError(null);
    if (!approvedPurchasesForDate.length) {
      toast.warning('No approved purchases found for this date. Proceeding without purchase data.');
    }

    const selectedBranch = branches.find((branch) =>
      branch.id === form.branch_id ||
      branch.key === form.branch ||
      branch.branch_key === form.branch,
    );
    const branchId = selectedBranch?.id || selectedBranchId || null;
    const cashierId = effectiveCashierId;
    const customerId = form.customer_id || customerCreditSales.find((entry) => entry.customer_id)?.customer_id || null;
    const posDeviceId = posEntries.find((entry) => Number(entry.amount) > 0)?.device_id || null;
    const createdBy = user?.email || ownerFilter?.created_by || '';
    const tenantId = activeRestaurant?.id || user?.organization_id || user?.restaurant_id || '';

    console.log('[UnifiedSalesClosing] handleSubmit started');
    console.log('[UnifiedSalesClosing] isManager:', isManager);
    console.log('[UnifiedSalesClosing] cashierId:', cashierId);
    console.log('[UnifiedSalesClosing] customerId:', customerId);
    console.log('[UnifiedSalesClosing] posDeviceId:', posDeviceId);
    console.log('[UnifiedSalesClosing] activeRestaurant:', activeRestaurant?.id);
    console.log('[UnifiedSalesClosing] branchId:', branchId);
    console.log('[UnifiedSalesClosing] createdBy:', createdBy);

    if (!activeRestaurant?.id || !branchId || !createdBy) {
      console.log('[UnifiedSalesClosing] FAILED: Missing core IDs');
      toast.error('An active business, branch, and authenticated user are required to close sales.');
      return;
    }

    // A network/POS terminal is optional for a manual Closing. Its device
    // inventory must not block a branch's cash or credit-free shift close.
    if (isManager && manualCreditTotal > 0 && custLoading) {
      toast.error('Customer credit accounts are still loading.');
      return;
    }

    // Cashier is always required for all roles
    if (!cashierId) {
      console.log('[UnifiedSalesClosing] FAILED: No cashier ID');
      toast.error('A cashier must be assigned to close sales.');
      return;
    }

    // Note: customerId and posDeviceId are allowed to be null if none exist in the branch.
    // The DB should handle nulls or use its own defaults.
    console.log('[UnifiedSalesClosing] Proceeding with save...');

    submissionInFlight.current = true;
    setIsSubmitting(true);
    try {
      if (customerCreditSales.some((entry) => (Number(entry.amount) || 0) > 0 && entry.customer_id)) {
        // Refresh the display snapshot immediately before save. The transactional
        // RPC re-reads the same canonical rows under lock before it persists.
        await refetchCustomers();
      }
      console.log('[UnifiedSalesClosing] Building payload...');
      // The credit source is saved as a regular sales-source snapshot for audit
      // and revenue presentation; the corresponding outstanding balance is
      // created only by the server as a customer receivable.
      const customerCreditSourceSnapshots = customerCreditSnapshots(creditSources, customerCreditSales).map(snapshot => ({
        ...snapshot,
        branch_id: branchId,
        branch: selectedBranch?.key || selectedBranch?.branch_key || form.branch,
        date: form.date, shift: form.shift, cashier_id: cashierId, cashier_name: cashierDisplayName,
      }));
      const payload = {
        date: form.date,
        branch: selectedBranch?.key || selectedBranch?.branch_key || form.branch,
        shift: form.shift,
        cashier_name: cashierDisplayName,
        cashier_employee_id: form.cashier_employee_id,
        sales_notes: form.sales_notes,
        closing_state: requestedClosingState,
        finalized_at: requestedClosingState === 'finalized' ? new Date().toISOString() : initial?.finalized_at || null,
        finalized_by: requestedClosingState === 'finalized' ? (user?.email || '') : initial?.finalized_by || '',
        closing_audit: [...asRecordArray(initial?.closing_audit), { action: requestedClosingState === 'draft' ? 'draft_saved' : 'closing_finalized', at: new Date().toISOString(), by: user?.email || '', branch_id: branchId }],
        branch_id: branchId,
        // `tenant_id` carries the active organization scope on legacy sales tables.
        tenant_id: tenantId,
        // `created_by` is the authenticated user mapping required by downstream RLS checks.
        created_by: createdBy,
        // Cash-classified source snapshots are added by the transactional RPC.
        // Send only the base ERP/manual cash here so each Today amount is
        // recognized exactly once rather than being added again server-side.
        restaurant_cash: baseCashSales,
        cash: baseCashSales,
        // Driver-linked source payments are reconstructed and validated by the
        // database transaction from `driver_entries`; send only the non-driver
        // portion here to guarantee that no child amount is recognized twice.
        restaurant_network: Math.max(0, networkTotal - driverSourcePaymentTotals.card - driverSourcePaymentTotals.bank_transfer - driverSourcePaymentTotals.online - driverSourcePaymentTotals.wallet),
        network: Math.max(0, networkTotal - driverSourcePaymentTotals.card - driverSourcePaymentTotals.bank_transfer - driverSourcePaymentTotals.online - driverSourcePaymentTotals.wallet),
        restaurant_network_account_id: posDeviceId || '',
        cashier_id: cashierId,
        customer_id: customerId,
        pos_device_id: posDeviceId,
        credit: manualCreditTotal,
        pos_entries_json: JSON.stringify(posEntries.map(({ id, ...rest }) => rest)),
        credit_entries_json: customerCreditSales
          .filter((entry) => (Number(entry.amount) || 0) > 0 && entry.customer_id)
          .map(({ id, source_id, payment_amount, payment_method, ...rest }) => {
            const customer = customers.find((candidate) => String(candidate.id) === String(rest.customer_id));
            const outstandingDebt = Number(customer?.outstanding_balance ?? rest.previous_outstanding_debt) || 0;
            const creditLimit = Number(customer?.credit_limit ?? rest.credit_limit) || 0;
            const amount = Math.max(0, Number(rest.amount) || 0);
            return {
              client_row_id: id,
              source_id: source_id || creditSource?.id || null,
              customer_id: rest.customer_id,
              customer_name_snapshot: customer?.customer_name || customer?.name || rest.customer_name_snapshot || '',
              customer_phone: customer?.phone || rest.customer_phone || '',
              previous_outstanding_debt: outstandingDebt,
              credit_limit: creditLimit,
              available_credit: Math.max(0, creditLimit - outstandingDebt),
              amount,
              notes: rest.notes || '',
            };
          }),
        // Dynamic Sales Sources — `amount` / `today_amount` are the only
        // revenue inputs. Previous and Total are immutable historical context
        // retained for History and never added to current-period accounting.
        // The RPC requires a JSON array. Sending a JSON-encoded string makes
        // Postgres see a scalar and reject the finalization payload.
        sales_sources_json: [
          ...buildSalesSourceClosingSnapshots(customSourceSummaries, {
            branchId,
            branch: selectedBranch?.key || selectedBranch?.branch_key || form.branch,
            date: form.date,
            shift: form.shift,
            cashierId,
            cashierName: cashierDisplayName,
          }).map((snapshot) => ({
            ...snapshot,
            payment_bucket: snapshot.allows_driver_entries === true ? 'other' : paymentBucketForCode(snapshot.default_payment_method),
          })),
          ...customerCreditSourceSnapshots,
        ],
        custom_sources_total: Math.max(0, otherPaymentTotal - driverSourcePaymentTotals.other),
        sales_closing_custom_fields: customClosingFields
          .filter((field) => customClosingFieldValues[field.id] !== undefined && customClosingFieldValues[field.id] !== '')
          .map((field) => ({
            field_id: field.id,
            field_key: field.field_key,
            label_en: field.label_en,
            label_ar: field.label_ar,
            field_type: field.field_type,
            value: customClosingFieldValues[field.id],
          })),

        opening_cash: opening,
        // The transaction layer consumes the physical count directly; closing_cash
        // remains a legacy derived field for existing reports and integrations.
        actual_cash: actualCount,
        closing_cash: closingCash,
        cash_difference: cashDifference ?? 0,
        cash_status: cashReconcStatus || 'Balanced',
        cash_notes: cashNotes || '',
        owner_cash_injection: ownerContrib,
        manager_approval: managerApproved,
        manager_approved_by: managerApproved ? (user?.email || '') : '',

        approved_purchases_total: approvedPurchasesTotal,
        // Preserve the exact current-period expense split for immutable History.
        // Fixed allocation and wallet funding are server-recomputed on finalization.
        fixed_expenses_total: fixedExpensesToday,
        variable_expenses_total: variableExpensesToday,
        expenses_total: operatingExpensesTotal,
        operating_result: operatingResult,

        restaurant_id: activeRestaurant?.id || null,
      };

      console.log('[UnifiedSalesClosing] Calling onSubmit(payload)...');
      const saved = await onSubmit(payload);
      setSavedClosing(saved || { id: initial?.id || null, status: 'saved' });
      invalidateCustomerReceivableQueries(queryClient);
      await Promise.all([refetchCustomers(), refetchCashLedger()]);
      console.log('[UnifiedSalesClosing] onSubmit(payload) SUCCESS');

    } catch (err) {
      const details = closingErrorDetails(err);
      const userMessage = err?.userMessage || 'The Closing service could not complete this request. Please retry using the reference shown below.';
      console.error('[UnifiedSalesClosing] Sales Closing request failed', details);
      setRuntimeError({ ...details, userMessage });
      if (details?.code === 'CLOSING_ALREADY_EXISTS') {
        setInlineErrors({ duplicate: userMessage });
      }
      if (details?.code === 'SALES_CLOSING_CASH_LEDGER_OVERDRAWN') {
        // Another save/payment may have changed the ledger since the preview.
        // Keep all entered amounts and return to the actionable funding step.
        setShowFinalizeReview(false);
        setClosingStep(1);
        setShowFunding(true);
        setShowBlockers(true);
        await refetchCashLedger();
        requestAnimationFrame(() => document.getElementById('closing-funding')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      }
      toast.error(userMessage);
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const recordCustomerCreditPayment = useCallback(async (entry) => {
    const amount = Number(entry?.payment_amount);
    if (!entry?.customer_id || !Number.isFinite(amount) || amount <= 0 || !activeRestaurant?.id || !selectedBranchId || !form.branch) {
      toast.error('Select an active branch customer and enter a valid debt payment amount.');
      return;
    }

    setIsRecordingCustomerDebtPayment(true);
    try {
      const result = await recordCustomerReceivablePayment({
        restaurantId: activeRestaurant.id,
        branchId: selectedBranchId,
        branch: form.branch,
        customerId: entry.customer_id,
        amount,
        date: form.date,
        paymentMethod: entry.payment_method || 'cash',
        notes: entry.notes || '',
      });
      const position = result?.customer_position || {};
      updateCustomerCreditSale(entry.id, {
        payment_amount: '',
        previous_outstanding_debt: Number(position.outstanding_balance) || 0,
        credit_limit: Number(position.credit_limit) || entry.credit_limit || 0,
        available_credit: Number(position.available_credit) || 0,
      });
      invalidateCustomerReceivableQueries(queryClient);
      await Promise.all([refetchCustomers(), refetchCashLedger()]);
      toast.success('Customer debt payment recorded in Debts & Receivables. Sales revenue was not changed.');
    } catch (error) {
      toast.error(customerDebtPaymentErrorMessage(error));
    } finally {
      setIsRecordingCustomerDebtPayment(false);
    }
  }, [activeRestaurant?.id, form.branch, form.date, queryClient, refetchCashLedger, refetchCustomers, selectedBranchId, updateCustomerCreditSale]);

  const recordOwnerPayment = async () => {
    const closingId = savedClosing?.id || initial?.id;
    if (!closingId || !onRecordOwnerPayment) return;
    setIsRecordingOwnerPayment(true);
    try {
      await onRecordOwnerPayment(closingId);
      await refetchCashLedger();
      toast.success('Owner payment was posted to the ERP cash ledger.');
    } catch (error) {
      toast.error(error?.userMessage || error?.message || 'Unable to record the owner payment.');
    } finally {
      setIsRecordingOwnerPayment(false);
    }
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  // Requirement: Remove blocking success state.
  // Save returns immediately to Daily Sales via onSubmit callback.

  return (
    <form id="erp-sales-closing-form" ref={formRef} onSubmit={handleSubmit} className="min-w-0">
      {/* Embedded in the ERP page scroller: a second momentum scroller with
          percentage height can clip expanded content on iOS after keyboard use. */}
      <div id="sales-closing-workspace" className="min-w-0">
        <div className="mx-auto w-full max-w-4xl space-y-3 px-2 py-2 sm:space-y-4 sm:p-4">
          {runtimeError && (
            <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-red-950">
              <p className="text-sm font-bold">Save failed</p>
              <p className="mt-1 text-xs">{runtimeError.userMessage}</p>
              {(import.meta.env.DEV || new URLSearchParams(window.location.search).has('closing_diagnostics')) && (
                <p className="mt-2 text-[11px] font-medium" data-testid="closing-runtime-error-reference">Error: {runtimeError.code} · Request ID: {runtimeError.request_id || 'unavailable'}</p>
              )}
            </div>
          )}
          {savedClosing && (
            <div role="status" className={`rounded-xl border p-3 ${savedClosing._alreadyExists ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold">{savedClosing._alreadyExists ? 'Closing already completed for this branch and shift.' : savedClosing.closing_state === 'draft' ? (lang === 'fa' ? 'پیش‌نویس ذخیره شد؛ هنوز نهایی نشده است.' : lang === 'ar' ? 'تم حفظ المسودة؛ لم يتم الإقفال بعد.' : 'Draft saved. Final reconciliation is still pending.') : 'Daily closing saved successfully.'}</p>
                  {savedClosing.id && <p className="mt-1 text-xs opacity-80">Closing ID: {savedClosing.id}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <Button type="button" variant="outline" className="min-h-11" onClick={onCancel}>Open Closing</Button>
                  <Button type="button" className="min-h-11 bg-emerald-600 hover:bg-emerald-700" onClick={() => onNewClosing?.()} disabled={isOpeningNewClosing} aria-busy={isOpeningNewClosing}>{isOpeningNewClosing ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Opening…</> : 'New Closing'}</Button>
                </div>
              </div>
            </div>
          )}

          <header className="flex items-center justify-between gap-2 px-1 py-1" data-testid="closing-compact-header">
            <div className="min-w-0">
              <h1 className="text-lg font-black tracking-tight text-slate-950 sm:text-2xl">{lang === 'fa' ? 'بستن فروش روزانه' : lang === 'ar' ? 'إقفال المبيعات' : 'Sales Closing'}</h1>
              <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500 sm:text-xs" title={`${form.branch} · ${form.shift} · ${form.date}`}>{form.branch || 'Branch'} · {form.shift || 'Shift'} · {form.date}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" variant="outline" size="sm" className="min-h-10 gap-1 rounded-xl px-2 text-xs sm:px-3" onClick={() => setShowFullDetails(true)} aria-label="Advanced Closing Details" data-testid="closing-open-advanced"><ClipboardCheck className="h-4 w-4" />{lang === 'fa' ? 'جزئیات' : lang === 'ar' ? 'التفاصيل' : 'Details'}</Button>
              <Button type="button" size="icon" variant="ghost" className="h-10 w-10 shrink-0 rounded-xl" onClick={onCancel} disabled={isSubmitting} aria-label="Close Sales Closing"><X className="h-5 w-5" /></Button>
            </div>
          </header>

          <ClosingStepNavigation step={closingStep} onChange={goToClosingStep} disabled={isSubmitting} lang={lang} />
          <h2 id="closing-step-heading" tabIndex={-1} className="px-1 text-xl font-black text-slate-950 outline-none" data-i18n-skip="true">{closingStep === 1 ? (lang === 'fa' ? 'چقدر پول در صندوق است؟' : lang === 'ar' ? 'كم النقد الموجود في الصندوق؟' : 'How much cash is in the drawer?') : stepCopy.steps[closingStep]}</h2>
          {closingStep === 2 && <ClosingControlOverview lang={lang} currency={currency} totalSales={totalSales} expectedCash={expectedCash} actualCash={actualCount} difference={cashDifference} ledgerOverdrawn={ledgerOverdrawn} showNavigation={false} />}

          <div hidden={closingStep !== 2 && (!showBlockers || attentionCount === 0)}>
          <section id="closing-readiness-anchor" data-testid="closing-readiness-summary" className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 ${allValid ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50/75'}`}>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${allValid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}><ShieldCheck className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-slate-900">{allValid ? (lang === 'fa' ? 'آمادهٔ نهایی‌سازی' : lang === 'ar' ? 'جاهز للإقفال' : 'Ready to finalize') : (lang === 'fa' ? `${attentionCount} مورد نیاز به اصلاح` : lang === 'ar' ? `${attentionCount} بنود تحتاج معالجة` : `${attentionCount} required action${attentionCount === 1 ? '' : 's'}`)}</p>

            </div>

            {!allValid && <button type="button" className="min-h-9 rounded-lg px-1.5 text-xs font-bold text-amber-800 underline" data-testid="closing-toggle-blockers" aria-expanded={showBlockers} onClick={() => setShowBlockers(x => !x)}>{lang === 'fa' ? 'بررسی' : lang === 'ar' ? 'مراجعة' : 'Review'}</button>}
          </section>
          {attentionCount > 0 && showBlockers && <section data-testid="closing-blockers" role="status" className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
            {stepFailedValidations.map(validation => <button type="button" key={validation.key} className="flex min-h-10 w-full items-start gap-2 rounded-lg bg-white px-2.5 py-2 text-left text-xs text-amber-900" onClick={() => {
              setClosingStep(['erpData', 'cashBalance'].includes(validation.key) ? 1 : 0);
              if (validation.key === 'erpData' && openingReviewRequired) setShowOpeningVerification(true);
              else if (validation.key !== 'cashBalance' && !(validation.key === 'erpData' && ledgerOverdrawn)) setShowFullDetails(true);
              const anchor = validation.key === 'cashBalance' ? 'quick-closing-actualCash' : validation.key === 'erpData' && openingReviewRequired ? 'opening-cash-needs-review' : validation.key === 'erpData' && ledgerOverdrawn ? 'closing-funding' : null;
              if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({behavior: 'smooth', block: 'center'}));
            }}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0"><strong className="block">{validation.label}</strong><span className="block text-[11px]">{validation.message}</span></span></button>)}
          </section>}

          </div>
          <div hidden={closingStep !== 0} data-testid="closing-step-sales">
          <section data-testid="closing-sales-entry-mode" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Daily sales">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-3 sm:px-5">
              <div><h2 className="text-sm font-black text-slate-950">{lang === 'fa' ? 'فروش امروز' : lang === 'ar' ? 'مبيعات اليوم' : 'Today sales'}</h2><p className="mt-0.5 text-[11px] text-slate-500">{lang === 'fa' ? 'فقط همین تاریخ و شیفت' : lang === 'ar' ? 'لهذا التاريخ والوردية فقط' : 'This date and shift only'}</p></div>
              <div className="text-right"><p className="text-[10px] font-semibold text-slate-500">{lang === 'fa' ? 'مجموع فروش' : lang === 'ar' ? 'الإجمالي' : 'Total sales'}</p><Money currency={currency} value={totalSales} className="text-xl font-black text-blue-700" /></div>
            </div>
            <div className="space-y-3 p-3.5 sm:p-5">
              <details className="rounded-lg border border-slate-100 p-2"><summary className="min-h-10 cursor-pointer text-xs text-slate-500">{lang === 'fa' ? 'روش ثبت فروش' : lang === 'ar' ? 'طريقة إدخال المبيعات' : 'Sales entry options'}</summary><div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-500">{lang === 'fa' ? 'روش ثبت' : lang === 'ar' ? 'طريقة الإدخال' : 'Entry mode'}</span>
                <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Sales entry mode">
                  <button type="button" data-testid="sales-entry-manual" aria-pressed={salesEntryMode === 'manual'} className="min-h-9 rounded-md bg-white px-3 text-xs font-black text-blue-700 shadow-sm" onClick={() => setSalesEntryMode('manual')}>{lang === 'fa' ? 'دستی / آفلاین' : lang === 'ar' ? 'يدوي / أوفلاين' : 'Manual / Offline'}</button>
                  <button type="button" data-testid="sales-entry-automatic" aria-pressed={salesEntryMode === 'automatic'} disabled={!automaticTotalsEnabled || Boolean(initial?.id)} className="min-h-9 rounded-md px-3 text-xs font-bold text-slate-500 disabled:opacity-60" onClick={() => setSalesEntryMode('automatic')}>{lang === 'fa' ? 'POS اتومات' : lang === 'ar' ? 'POS تلقائي' : 'Auto POS'}</button>
                </div>
              </div>
              </details>
              <div data-testid="offline-sales-audit" className="grid min-w-0 grid-cols-1 gap-2.5 min-[360px]:grid-cols-2">
                <div className="min-w-0"><Label htmlFor="quick-closing-cashSales" className="mb-1.5 block text-xs font-bold text-slate-700">{lang === 'fa' ? 'فروش نقدی قبل از پرداخت‌ها' : lang === 'ar' ? 'مبيعات نقدية قبل المدفوعات' : 'Cash sales before payments'}</Label><ClosingNumericInput id="quick-closing-cashSales" value={cashSalesInput} onChange={updateCashSales} prefix={currency} disabled={useAutomaticSales || isSubmitting} inputClassName="h-12 min-w-0 border-slate-200 bg-white text-base font-black" /></div>
                <div className="min-w-0"><Label htmlFor={`quick-closing-network-${posEntries[0]?.id || 'empty'}`} className="mb-1.5 block text-xs font-bold text-slate-700">{lang === 'fa' ? 'شبکه / کارت' : lang === 'ar' ? 'شبكة / بطاقة' : 'Network / Card'}</Label>
                  {posEntries[0] && networkSelector(posEntries[0])}
                  {posEntries[0] && <ClosingNumericInput id={`quick-closing-network-${posEntries[0].id}`} value={posEntries[0].amount ?? ''} onChange={value => updatePos(posEntries[0].id, 'amount', value)} prefix={currency} disabled={isSubmitting} inputClassName="h-12 min-w-0 border-slate-200 bg-white text-base font-black" />}
                </div>
              </div>
              {posUnavailable && <p role="alert" className="text-sm text-red-700">{lang === 'fa' ? 'حساب‌های شبکه بارگذاری نشد.' : lang === 'ar' ? 'تعذر تحميل حسابات الشبكة.' : 'Network accounts could not load.'}<Button type="button" variant="outline" onClick={() => reloadNetworks()}>↻</Button></p>}
              {inlineErrors.pos && <p role="alert" className="text-sm text-red-700">{inlineErrors.pos}</p>}
              {(posEntries.length > 1 || showNetworkDetail) && <div data-testid="closing-extra-network" className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                {posEntries.slice(1).map(entry => <div key={entry.id} className="grid min-w-0 grid-cols-[1fr_auto] items-end gap-2">
                  <div className="col-span-2 min-w-0">{networkSelector(entry)}</div>
                  <span className="min-w-0 flex-1"><ClosingNumericInput id={`quick-closing-network-${entry.id}`} value={entry.amount ?? ''} onChange={value => updatePos(entry.id, 'amount', value)} prefix={currency} disabled={isSubmitting} inputClassName="h-11 bg-white" /></span>
                  <Button type="button" size="icon" variant="ghost" onClick={() => removePos(entry.id)} disabled={isSubmitting} aria-label="Remove network total"><Trash2 className="h-4 w-4" /></Button>
                </div>)}
                <Button type="button" variant="outline" size="sm" className="min-h-10 bg-white" onClick={addPos} disabled={isSubmitting}><PlusCircle className="mr-1.5 h-4 w-4" />{lang === 'fa' ? 'ترمینال دیگر' : lang === 'ar' ? 'إضافة جهاز' : 'Add network total'}</Button>
              </div>}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => {setShowFullDetails(true);}} className="flex min-h-12 min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left" aria-label="Edit customer credit sales"><span className="text-xs font-semibold text-slate-600">{lang === 'fa' ? 'فروش قرضه' : lang === 'ar' ? 'البيع الآجل' : 'Credit sales'}</span><Money currency={currency} value={creditTotal} className="text-sm font-black text-violet-700" /></button>
                <button type="button" onClick={() => setShowFullDetails(true)} className="flex min-h-12 min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left" aria-label="Edit additional sales sources"><span className="text-xs font-semibold text-slate-600">{lang === 'fa' ? 'منابع دیگر' : lang === 'ar' ? 'مصادر أخرى' : 'Other sources'}</span><Money currency={currency} value={Math.max(0, totalSales - cashSales - networkTotal - creditTotal)} className="text-sm font-black text-slate-900" /></button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="text-[11px] text-slate-500">{lang === 'fa' ? 'POS اختیاری؛ فروش تکراری ثبت نکنید' : lang === 'ar' ? 'POS اختياري؛ تجنّب تكرار البيع' : 'POS optional · Do not duplicate posted sales'}</span>
                <button type="button" className="min-h-9 text-[11px] font-bold text-blue-700 underline" onClick={() => setShowNetworkDetail(v => !v)} aria-expanded={showNetworkDetail} data-testid="closing-add-network-toggle">{showNetworkDetail ? (lang === 'fa' ? 'بستن' : lang === 'ar' ? 'إخفاء' : 'Hide') : (lang === 'fa' ? 'شبکه بیشتر' : lang === 'ar' ? 'شبكة إضافية' : 'More network')}</button>
              </div>
              {(manualCashSales > 0 || initial?.sales_notes) && <details className="rounded-lg border border-slate-100 p-2.5"><summary className="cursor-pointer text-[11px] font-bold text-slate-600">{lang === 'fa' ? 'یادداشت فروش (اختیاری)' : lang === 'ar' ? 'ملاحظات البيع (اختياري)' : 'Sale note / reference (optional)'}</summary><Textarea id="offline-sales-reference" value={form.sales_notes || ''} onChange={e => set('sales_notes', e.target.value)} className="mt-2 min-h-14 bg-white" disabled={isSubmitting} /></details>}
            </div>
          </section>

          </div>
          <div hidden={closingStep !== 1} data-testid="closing-step-cash" className="space-y-3">
          {openingReviewRequired && showOpeningVerification && <div id="opening-cash-needs-review" role="alert" data-testid="opening-cash-needs-review" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-black">Opening Cash needs reconciliation</p>
            <p className="mt-1 text-xs leading-6">{openingReviewReason}</p>
            <p className="mt-1 text-xs">Previous shift: {cashLedgerContext.opening_shift || 'Initial'} · {cashLedgerContext.opening_shift_date || '—'} · Records: {cashLedgerContext.opening_prior_count ?? '—'}</p>
            {role === 'owner' ? (
              <div data-testid="owner-verify-opening-cash" className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-white p-3">
                <p className="text-xs font-black">Owner verification · counted opening drawer, not today's sales</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-xs font-bold" htmlFor="opening-verification-count">Opening Cash ({currency}) <span className="text-red-600">*</span>
                    <Input id="opening-verification-count" inputMode="decimal" value={openingVerificationAmount} onChange={event => setOpeningVerificationAmount(event.target.value)} placeholder="0.00" className="mt-1 min-h-11" disabled={openingVerificationBusy} />
                  </label>
                  <label className="block text-xs font-bold" htmlFor="opening-verification-reason">Reason / counted by <span className="text-red-600">*</span>
                    <Input id="opening-verification-reason" value={openingVerificationReason} onChange={event => setOpeningVerificationReason(event.target.value)} placeholder="Physical starting drawer count verified by owner" className="mt-1 min-h-11" disabled={openingVerificationBusy} />
                  </label>
                </div>
                <p className="text-[11px] font-semibold leading-5 text-amber-900">Enter the cash verified at the START of this shift from a signed handover or reliable source record, not the cash currently in the drawer (Actual Cash). If the starting amount cannot be substantiated, do not approve it.</p>
                <p className="text-[11px]">This creates an immutable owner-approved opening record. It does not overwrite earlier closings or add sales revenue.</p>
                {openingVerificationError && <p role="alert" className="text-xs font-bold text-red-700">{openingVerificationError}</p>}
                <Button type="button" size="sm" data-testid="verify-opening-cash-button" disabled={openingVerificationBusy || !openingVerificationAmount.trim() || openingVerificationReason.trim().length < 10} onClick={verifyOpeningCash}>
                  {openingVerificationBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1.5 h-4 w-4" />}Verify Opening Cash
                </Button>
              </div>
            ) : <p className="mt-2 text-xs font-bold">Ask the business Owner to verify the drawer opening before the shift can be finalized.</p>}
            <Button type="button" size="sm" variant="outline" className="mt-2 min-h-10" onClick={() => refetchCashLedger()}><RefreshCw className="mr-1.5 h-4 w-4" />Recheck ledger</Button>
          </div>}
          {automaticClosingUnavailable && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p className="font-black">ERP sales data needs attention</p><p className="mt-1 text-xs">Check the branch and date, then retry before finalizing.</p><Button type="button" size="sm" variant="outline" className="mt-3 min-h-10 border-red-300 bg-white" onClick={() => refetchAutomaticClosing()}><RefreshCw className="mr-1.5 h-4 w-4" />Retry ERP data</Button></div>}

          <ClosingCashSalesSources breakdown={cashSalesBreakdown} closingCashSales={cashSales} currency={currency} lang={lang} />
          <div data-testid="closing-cash-action" className="min-w-0" aria-label="Cash reconciliation">
            <CashReconciliationPanel
              compact
              inputId="quick-closing-actualCash"
              lang={lang}
              currency={currency}
              openingCash={cashContextReady ? opening : null}
              cashSales={reconciliation.cashSales}
              cashIn={reconciliation.cashIn}
              cashOut={reconciliation.cashOut}
              expectedCash={expectedCash}
              closingCash={closingCash}
              openingVerified={cashContextReady && !ledgerOverdrawn}
              openingStatus={cashLedgerContext.opening_status}
              openingSource={cashLedgerContext.opening_source}
              openingShiftDate={cashLedgerContext.opening_shift_date}
              openingShift={cashLedgerContext.opening_shift}
              openingReviewRequired={openingReviewRequired}
              ledgerOverdrawn={ledgerOverdrawn}
              cashFundingRequired={reconciliation.cashFundingRequired}
              movements={asRecordArray(cashLedgerContext.movements).filter(movement => !isClosingSettlementMovement(movement, ledgerClosingId))}
              actualCashValue={actualCashCount}
              actualCash={actualCount}
              difference={cashDifference}
              shortage={reconciliation.shortage}
              overage={reconciliation.overage}
              cashNotes={cashNotes}
              onActualCashChange={handleActualCashChange}
              onCashNotesChange={setCashNotes}
              managerApproved={managerApproved}
              onApprove={() => setManagerApproved(true)}
              actualCashError={inlineErrors.actualCash || inlineErrors.reconciliation}
              ledgerLoading={cashLedgerLoading}
              ledgerUnavailable={cashLedgerUnavailable}
              onRetryLedger={() => refetchCashLedger()}
              branchWalletApplied={branchWalletApplied}
              ownerSettlementRequired={ownerSettlementRequired}
              ownerSettlementRemaining={ownerSettlementRemaining}
              ownerSettlementResolved={ownerSettlementResolved}
              ownerSettlementStatusLabel={ownerSettlementStatusLabel}
              settlementStatus={reconciliation.settlementStatus}
              canRecordOwnerPayment={Boolean(currentClosingId && onRecordOwnerPayment)}
              onRecordOwnerPayment={recordOwnerPayment}
              isRecordingOwnerPayment={isRecordingOwnerPayment}
              disabled={isSubmitting}
              fundingContent={cashContextReady ? <ClosingFundingPanel
                key={`${activeRestaurant?.id}:${selectedBranchId}:${form.date}:${form.shift}:${effectiveCashierId}`}
                restaurantId={activeRestaurant?.id} branchId={selectedBranchId} branchKey={form.branch} date={form.date} shift={form.shift} cashierId={effectiveCashierId}
                expectedCash={expectedCash} actualCash={actualCount} role={role} lang={lang} currency={currency} disabled={isSubmitting}
                onPosted={async () => { setManagerApproved(false); await refetchCashLedger(); }}
              /> : null}
            />
            {openingReviewRequired && <button type="button" className="mt-3 min-h-11 w-full rounded-xl border border-amber-300 bg-amber-50 px-3 text-left text-sm font-bold text-amber-900" onClick={() => setShowOpeningVerification(true)}>
              {lang === 'fa' ? 'تأیید نقد افتتاحیه' : lang === 'ar' ? 'توثيق النقد الافتتاحي' : 'Verify opening cash'}
            </button>}
          </div>
          </div>
          <div hidden={closingStep !== 2} data-testid="closing-step-review" className="space-y-3">
            <ClosingFinalReview
              lang={lang}
              currency={currency}
              cashSales={cashSales}
              networkSales={networkTotal}
              creditSales={creditTotal}
              otherSales={otherPaymentTotal}
              totalSales={totalSales}
              openingCash={opening}
              cashIn={reconciliation.cashIn}
              cashOut={reconciliation.cashOut}
              expectedCash={expectedCash}
              actualCash={actualCount}
              difference={cashDifference}
              ledgerOverdrawn={ledgerOverdrawn}
              cashContextReady={cashContextReady}
              allValid={allValid}
              onEditSales={() => goToClosingStep(0)}
              onEditCash={() => goToClosingStep(1)}
            />
          <details open className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5" data-testid="closing-operating-statement" data-i18n-skip="true">
            <summary className="min-h-11 cursor-pointer text-sm font-bold text-slate-900">{lang === 'fa' ? 'خریدها و مصارف' : lang === 'ar' ? 'المشتريات والمصروفات' : <>Expenses &amp; purchases</>}</summary>
            {cashContextReady && !purchasesLoading && !purchasesUnavailable ? <dl className="mt-2 space-y-3 text-sm">
              {[
                [lang === 'fa' ? 'خریدهای تأییدشده' : lang === 'ar' ? 'المشتريات المعتمدة' : 'Approved purchases', approvedPurchasesTotal],
                [lang === 'fa' ? 'سهم روزانه مصارف ثابت' : lang === 'ar' ? 'نصيب اليوم من المصروفات الثابتة' : 'Daily fixed expense allocation', fixedExpensesToday],
                [lang === 'fa' ? 'مصارف متغیر امروز' : lang === 'ar' ? 'المصروفات المتغيرة اليوم' : 'Today variable expenses', variableExpensesToday],
              ].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2"><dt className="text-slate-600">{label}</dt><dd><Money currency={currency} value={value} className="font-semibold" /></dd></div>)}
              <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3"><dt className="font-bold">{lang === 'fa' ? 'مجموع هزینه روز' : lang === 'ar' ? 'إجمالي تكلفة اليوم' : 'Total daily expenses'}</dt><dd><Money currency={currency} value={totalDailyExpenses} className="font-bold" /></dd></div>
              <div className="flex flex-wrap justify-between gap-2"><dt className="font-bold">{lang === 'fa' ? 'نتیجه عملیاتی تخمینی' : lang === 'ar' ? 'النتيجة التشغيلية التقديرية' : 'Estimated operating result'}</dt><dd><Money currency={currency} value={operatingResult} signed className="font-bold" /></dd></div>
            </dl> : <p role="status" className="mt-2 text-sm text-amber-800">{lang === 'fa' ? 'نتیجه تا بارگذاری خریدها و دفتر نقد قابل تأیید نیست.' : lang === 'ar' ? 'لا يمكن تأكيد النتيجة قبل تحميل المشتريات ودفتر النقد.' : 'The result is unavailable until purchases and the cash ledger are loaded.'}</p>}
            <p className="mt-3 text-xs leading-5 text-slate-500">{lang === 'fa' ? 'بر مبنای خرید و مصارف ثبت‌شده؛ سود حسابداری نهایی نیست. نقد صندوق فقط با حرکات ثبت‌شده نقدی تغییر می‌کند.' : lang === 'ar' ? 'على أساس المشتريات والمصروفات المسجلة؛ ليست الربح المحاسبي النهائي. لا يتغير نقد الصندوق إلا بحركات نقدية مسجلة.' : 'Purchase-basis management estimate, not final accounting profit. Drawer cash changes only through posted cash movements.'}</p>
          </details>

          <section data-testid="quick-closing-auto-summary" className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
            <button type="button" className="flex min-h-12 w-full items-center justify-between gap-3 text-left" onClick={() => setShowFullDetails(true)} aria-label="Open advanced closing records" data-testid="closing-open-advanced-secondary">
              <span className="flex min-w-0 items-center gap-2"><ClipboardCheck className="h-5 w-5 shrink-0 text-blue-600" /><span className="min-w-0"><strong className="block text-xs text-slate-900">{lang === 'fa' ? 'جزئیات پیشرفته ERP' : lang === 'ar' ? 'تفاصيل ERP المتقدمة' : 'Advanced ERP details'}</strong><span className="block truncate text-[11px] text-slate-500">{lang === 'fa' ? 'مشتریان، منابع، شعبه، تطبیق کامل' : lang === 'ar' ? 'العملاء والمصادر والفرع والمطابقة' : 'Customers, sources, branch & full cash ledger'}</span></span></span><ChevronRight className="h-5 w-5 shrink-0 text-blue-600" />
            </button>
          </section>

          </div>
          <Sheet open={Boolean(workspaceTabActive && showFullDetails)} onOpenChange={isOpen => {if (workspaceTabActive) setShowFullDetails(isOpen);}}>
            <SheetContent side="bottom" className="z-50 h-[min(90dvh,900px)] max-h-[90dvh] w-full overflow-y-auto overscroll-contain rounded-t-2xl border-slate-200 bg-slate-50 px-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-5 sm:mx-auto sm:max-w-4xl sm:px-5" data-testid="closing-advanced-sheet">
              <SheetHeader className="mb-4 pr-8 text-left">
                <SheetTitle className="text-base font-black text-slate-950">{lang === 'fa' ? 'جزئیات پیشرفتهٔ کلوزینگ' : lang === 'ar' ? 'تفاصيل إقفال المبيعات' : 'Advanced closing details'}</SheetTitle>
                <SheetDescription className="text-xs">{lang === 'fa' ? 'معلومات شعبه، مشتری، منابع فروش و دفتر کامل صندوق؛ تغییرات ذخیره نشده باقی می‌مانند.' : lang === 'ar' ? 'الفرع والعملاء ومصادر البيع ودفتر النقد، دون فقدان التعديلات.' : 'Business scope, customer credit, sales sources and full cash audit. Your edits remain in the form.'}</SheetDescription>
              </SheetHeader>
              <div className="space-y-3" data-testid="closing-full-details">
            <section className="rounded-2xl border border-slate-200 bg-background p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-black text-slate-950">Business context</h2><p className="mt-0.5 text-[11px] text-slate-500">Change only when this closing belongs to another shift.</p></div><Badge variant="outline">ERP scope</Badge></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{configuredIdentityFields.map((field) => { const fieldKey = field.field_key; const label = closingFieldLabel(fieldKey, field.fallback); if (fieldKey === 'date') return <div key={fieldKey} className={closingFieldVisibilityClass(fieldKey)}><Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</Label><Input id="quick-closing-date" type="date" value={form.date} onChange={event => set('date', event.target.value)} className="min-h-11 text-sm" /></div>; if (fieldKey === 'branch') return <div key={fieldKey} id="quick-closing-branch" className={closingFieldVisibilityClass(fieldKey)}><Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</Label><BranchSelect value={form.branch} onChange={selectClosingBranch} /></div>; if (fieldKey === 'shift') return <div key={fieldKey} id="quick-closing-shift" className={closingFieldVisibilityClass(fieldKey)}><Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</Label><Select value={form.shift} onValueChange={value => set('shift', value)}><SelectTrigger className="min-h-11 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Morning">Morning</SelectItem><SelectItem value="Evening">Evening</SelectItem></SelectContent></Select></div>; return <div key={fieldKey} id="quick-closing-cashier" className={`min-w-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 ${closingFieldVisibilityClass(fieldKey)}`}><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">{label}</p><p className="mt-1 truncate text-sm font-bold text-emerald-900">{cashierDisplayName || (empLoading ? 'Loading…' : empError ? 'Unable to load cashier' : 'No cashier')}</p></div>; })}</div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-background shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-black text-slate-950">Sales breakdown</h2><p className="mt-0.5 text-[11px] text-slate-500">Daily revenue only; historical amounts are not added.</p></div><Money currency={currency} value={totalSales} className="text-base font-black text-blue-700" /></div>
              <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4"><div className="rounded-xl bg-emerald-50 p-3"><Banknote className="h-4 w-4 text-emerald-600" /><p className="mt-2 text-[10px] text-slate-500">Cash</p><Money currency={currency} value={cashSales} className="text-sm font-black" /></div><div className="rounded-xl bg-blue-50 p-3"><Network className="h-4 w-4 text-blue-600" /><p className="mt-2 text-[10px] text-slate-500">Network</p><Money currency={currency} value={networkTotal} className="text-sm font-black" /></div><div className="rounded-xl bg-violet-50 p-3"><CreditCard className="h-4 w-4 text-violet-600" /><p className="mt-2 text-[10px] text-slate-500">Credit</p><Money currency={currency} value={creditTotal} className="text-sm font-black" /></div><div className="rounded-xl bg-amber-50 p-3"><Bike className="h-4 w-4 text-amber-600" /><p className="mt-2 text-[10px] text-slate-500">Delivery apps</p><Money currency={currency} value={onlineTotal} className="text-sm font-black" /></div></div>
              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3 sm:grid-cols-4"><div className="rounded-xl bg-blue-50 p-3"><Building2 className="h-4 w-4 text-blue-600" /><p className="mt-2 text-[10px] text-slate-500">Counter network</p><Money currency={currency} value={networkCounterTotal} className="text-sm font-black" /></div><div className="rounded-xl bg-cyan-50 p-3"><Bike className="h-4 w-4 text-cyan-600" /><p className="mt-2 text-[10px] text-slate-500">Driver network</p><Money currency={currency} value={networkDriversTotal} className="text-sm font-black" /></div><div className="rounded-xl bg-slate-50 p-3"><MoreHorizontal className="h-4 w-4 text-slate-600" /><p className="mt-2 text-[10px] text-slate-500">Other network</p><Money currency={currency} value={otherNetworkTotal} className="text-sm font-black" /></div><div className="rounded-xl border border-blue-200 bg-blue-50 p-3"><Coins className="h-4 w-4 text-blue-700" /><p className="mt-2 text-[10px] text-blue-600">Network total</p><Money currency={currency} value={networkTotal} className="text-sm font-black text-blue-700" /></div></div>
              {isConfiguredClosingFieldShown('sales_sources') && customSources.length > 0 && <div className="space-y-2 border-t border-slate-100 p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-700">Manual sales sources</p>{customSourceSummaries.map(({ source, sourceLabel, today, previous, driverEntries }) => source.allows_driver_entries === true ? <DriverSalesSourceCard key={source.id} source={source} sourceLabel={sourceLabel} entries={driverEntries} drivers={driverSourceDrivers} branchLabel={form.branch} previous={previous} currency={currency} onAdd={() => addDriverSourceEntry(source)} onChange={(clientRowId, patch) => updateDriverSourceEntry(source.id, clientRowId, patch)} onRemove={(clientRowId) => removeDriverSourceEntry(source.id, clientRowId)} isHistoryLoading={sourceHistoryLoading || driverSourceDriversLoading} isHistoryUnavailable={sourceHistoryUnavailable} copy={salesSourceCopy} /> : <CompactSalesSourceRow key={source.id} source={source} sourceLabel={sourceLabel} todayInput={customSourceAmounts[source.id] ?? ''} today={today} previous={previous} currency={currency} onChange={(value) => setCustomAmount(source.id, value)} historyLoading={sourceHistoryLoading} historyUnavailable={sourceHistoryUnavailable} />)}</div>}

            </section>{creditSource && <section className="space-y-3" data-testid="customer-credit-closing-section" data-i18n-skip="true">{custLoading ? <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-muted-foreground shadow-sm">Loading Debt Management customers…</div> : <><div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{customerCreditSales.map((entry, index) => <div key={entry.id} className="min-w-0 space-y-2"><label className="block text-sm font-semibold">{lang === 'fa' ? 'منبع فروش قرضه' : lang === 'ar' ? 'مصدر البيع الآجل' : 'Customer credit sales source'}<select aria-label="Customer credit sales source" className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3" value={creditEntrySourceId(entry, creditSources)} onChange={event => updateCustomerCreditSale(entry.id, 'source_id', event.target.value)} disabled={isSubmitting}>{creditSources.map(source => <option key={source.id} value={source.id}>{lang === 'ar' ? source.name_ar || source.name_en : lang === 'fa' ? source.name_fa || source.name_ar || source.name_en : source.name_en}</option>)}</select></label><CustomerCreditSalesSource entry={entry} idx={index} onRemove={removeCustomerCreditSale} onUpdate={updateCustomerCreditSale} customers={customers} currency={currency} customerSearch={customerSearch} onCustomerSearch={setCustomerSearch} onSelectCustomer={refetchCustomers} onReviewCreditSale={() => { const target = document.getElementById('sales-closing-actions'); target?.scrollIntoView({ behavior: 'smooth', block: 'center' }); target?.focus({ preventScroll: true }); }} onRecordPayment={recordCustomerCreditPayment} isRecordingPayment={isRecordingCustomerDebtPayment} paymentMethods={configuredPaymentMethods} disabled={isSubmitting} /></div>)}</div>{customerCreditSales.length > 0 && customerCreditSales.every((entry) => entry.customer_id) && <div className="flex justify-end"><Button type="button" size="sm" variant="outline" className="min-h-10 rounded-xl bg-white" onClick={addCustomerCreditSale} disabled={isSubmitting}><PlusCircle className="mr-1.5 h-4 w-4" />Add Another Customer</Button></div>}</>}{inlineErrors.credit && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-900">{inlineErrors.credit}</p>}</section>}

            {customClosingFields.length > 0 && <section id="closing-control-fields" className="rounded-2xl border border-slate-200 bg-background p-3 shadow-sm sm:p-4"><div className="mb-3"><h2 className="text-sm font-black text-slate-950">Closing fields</h2><p className="mt-0.5 text-[11px] text-slate-500">Only values for this closing are stored here.</p></div><div className="space-y-2">{customClosingFields.map((field) => <ClosingFieldControlRow key={field.id} field={field} label={closingFieldNameForLanguage(field)} value={customClosingFieldValues[field.id] ?? ''} error={inlineErrors[`custom_${field.id}`]} onChange={(value) => updateCustomClosingField(field.id, value)} />)}</div></section>}

            <p className="rounded-xl bg-sky-50 p-3 text-xs text-sky-900" data-testid="single-cash-ledger-note">
              {lang === 'fa' ? 'تطبیق نقد صندوق، تمویل و ثبت شمارش فقط در کارت صندوق مرحله نقد انجام می‌شود.' : lang === 'ar' ? 'تتم مطابقة النقد والتمويل والعد في بطاقة الصندوق الواحدة.' : 'Cash count, funding and reconciliation are managed in the single Cash Reconciliation card on the Cash step.'}
            </p>
              </div>
            </SheetContent>
          </Sheet>

          {inlineErrors.duplicate && <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p className="text-xs font-bold">{inlineErrors.duplicate}</p></div>}
        </div>
      </div>

      <div id="sales-closing-actions" tabIndex={-1} data-testid="closing-sticky-actions" className="relative mt-4 mb-[calc(5.25rem+env(safe-area-inset-bottom))] border-t border-slate-200 bg-white px-3 py-4 sm:mb-0 sm:px-5">
        {/* The Owner portal scrolls inside a nested workspace with its own fixed
            bottom nav. position:sticky here visually parks this action bar in
            the middle of the iPhone viewport and obscures Cash Reconciliation.
            Keep actions in normal document flow, after every Closing field. */}
        <div className="mx-auto max-w-4xl">
          {closingStep > 0 && <Button type="button" variant="ghost" className="mb-2 min-h-11" disabled={isSubmitting} onClick={() => goToClosingStep(closingStep - 1)}>{stepCopy.back}</Button>}
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-500">{lang === 'fa' ? 'مجموع فروش همین شیفت' : lang === 'ar' ? 'مجموع مبيعات الوردية' : 'Shift sales total'}</span>
            <Money currency={currency} value={totalSales} className="text-lg font-black text-slate-900" />
          </div>
          <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2">
            <Button type="submit" data-closing-intent="draft" variant="outline" className="min-h-12 min-w-0 rounded-xl px-2 text-xs font-bold sm:text-sm" onClick={() => flushSync(() => setRequestedClosingState('draft'))} disabled={isSubmitting || purchasesLoading || cashLedgerLoading || cashLedgerUnavailable || !cashContextReady}><Save className="mr-1 h-4 w-4 shrink-0" />{lang === 'fa' ? 'ذخیره موقت' : lang === 'ar' ? 'حفظ المسودة' : 'Save Draft'}</Button>
            {closingStep < 2 ? <Button type="button" data-testid="closing-next-step" className="min-h-12 min-w-0 whitespace-normal rounded-xl bg-blue-600 px-2 text-xs font-black hover:bg-blue-700 sm:text-sm" disabled={isSubmitting} onClick={() => goToClosingStep(closingStep + 1)}>{stepCopy.next[closingStep]}</Button> : <Button type="button" aria-label="Review & Finalize Closing" data-testid="closing-review-finalize" className="min-h-12 min-w-0 rounded-xl bg-blue-600 px-2 text-xs font-black hover:bg-blue-700 sm:text-sm" disabled={isSubmitting} onClick={() => {
              if (!allValid || cashLedgerLoading || cashLedgerUnavailable || !cashContextReady || ledgerOverdrawn || purchasesLoading) {
                setShowBlockers(true);
                document.getElementById('closing-readiness-anchor')?.scrollIntoView({behavior:'smooth', block:'start'});
                return;
              }
              setShowFinalizeReview(true);
            }}>{isSubmitting ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />{lang === 'fa' ? 'در حال ذخیره...' : lang === 'ar' ? 'جارٍ الحفظ...' : 'Saving…'}</> : <><ShieldCheck className="mr-1 h-4 w-4 shrink-0" />{lang === 'fa' ? 'بررسی و نهایی‌سازی' : lang === 'ar' ? 'مراجعة وإقفال' : 'Review & Finalize'}</>}</Button>}
          </div>
        </div>
      </div>

      <Dialog open={Boolean(workspaceTabActive && showFinalizeReview)} onOpenChange={isOpen => {if (workspaceTabActive) setShowFinalizeReview(isOpen);}}>
        <DialogContent className="max-h-[88dvh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto rounded-2xl p-4 sm:p-6" data-testid="closing-finalize-review">
          <DialogHeader>
            <DialogTitle className="text-left text-lg font-black">{lang === 'fa' ? 'تأیید نهایی کلوزینگ' : lang === 'ar' ? 'تأكيد إقفال المبيعات' : 'Confirm sales closing'}</DialogTitle>
            <DialogDescription className="text-left text-xs">{form.branch} · {form.shift} · {form.date}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
              <span className="text-slate-600">{lang === 'fa' ? 'فروش نقدی' : lang === 'ar' ? 'المبيعات النقدية' : 'Cash Sales'}</span><Money currency={currency} value={cashSales} className="text-right font-black" />
              <span className="text-slate-600">{lang === 'fa' ? 'شبکه / کارت' : lang === 'ar' ? 'شبكة / بطاقة' : 'Network / Card'}</span><Money currency={currency} value={networkTotal} className="text-right font-black" />
              <span className="text-slate-600">{lang === 'fa' ? 'فروش قرضه' : lang === 'ar' ? 'المبيعات الآجلة' : 'Customer Credit'}</span><Money currency={currency} value={creditTotal} className="text-right font-black" />
              {otherPaymentTotal !== 0 && <><span className="text-slate-600">{lang === 'fa' ? 'سایر فروش‌ها' : lang === 'ar' ? 'مبيعات أخرى' : 'Other sales'}</span><Money currency={currency} value={otherPaymentTotal} className="text-right font-black" /></>}
              <span className="font-black text-slate-900">{lang === 'fa' ? 'مجموع فروش' : lang === 'ar' ? 'إجمالي المبيعات' : 'Sales total'}</span><Money currency={currency} value={totalSales} className="text-right text-sm font-black text-blue-700" />
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs">
              <span className="text-blue-900">{lang === 'fa' ? 'موجودی آغاز' : lang === 'ar' ? 'نقد افتتاحي' : 'Opening Cash'}</span><Money currency={currency} value={opening} className="text-right font-black" />
              <span className="text-blue-900">{lang === 'fa' ? 'نقد مورد انتظار' : lang === 'ar' ? 'نقد متوقع' : 'Expected Cash'}</span><Money currency={currency} value={expectedCash} className="text-right font-black" />
              <span className="text-blue-900">{lang === 'fa' ? 'نقد واقعی' : lang === 'ar' ? 'نقد فعلي' : 'Actual Cash'}</span><Money currency={currency} value={actualCount} className="text-right font-black" />
              <span className="font-black text-blue-900">{lang === 'fa' ? 'اختلاف صندوق' : lang === 'ar' ? 'فرق الصندوق' : 'Variance'}</span><Money currency={currency} value={cashDifference} signed className={`text-right text-sm font-black ${cashDifference === 0 ? 'text-emerald-700' : 'text-amber-700'}`} />
            </div>
            {cashDifference !== 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">{lang === 'fa' ? 'کسری یا اضافه به‌صورت جدا ثبت می‌شود و مبلغ فروش را تغییر نمی‌دهد.' : lang === 'ar' ? 'يُسجل العجز أو الفائض بشكل منفصل دون تغيير قيمة المبيعات.' : 'Cash shortage or overage is recorded separately; it does not change sales revenue.'}</p>}
            <p className="text-xs text-slate-600">{lang === 'fa' ? 'قبل از ثبت قطعی، ارقام نقدی و فروش را با اسناد همین شیفت تطبیق کنید.' : lang === 'ar' ? 'راجع أرقام الوردية والمستندات قبل الاعتماد النهائي.' : 'Verify this shift’s amounts against the cash count and sales evidence before posting.'}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="min-h-12 rounded-xl" onClick={() => setShowFinalizeReview(false)}>{lang === 'fa' ? 'ویرایش' : lang === 'ar' ? 'تعديل' : 'Edit'}</Button>
            <Button type="button" data-testid="closing-confirm-finalize" className="min-h-12 rounded-xl bg-blue-600 font-black hover:bg-blue-700" disabled={isSubmitting || !allValid || !cashContextReady || cashDifference === null || ledgerOverdrawn} onClick={() => {
              setShowFinalizeReview(false);
              flushSync(() => setRequestedClosingState('finalized'));
              finalConfirmation.current = true;
              try { formRef.current?.requestSubmit(); } finally { finalConfirmation.current = false; }
            }}><ShieldCheck className="mr-1 h-4 w-4" />{lang === 'fa' ? 'ثبت نهایی' : lang === 'ar' ? 'اعتماد الإقفال' : 'Confirm'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}
