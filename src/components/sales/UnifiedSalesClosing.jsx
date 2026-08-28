/**
 * UnifiedSalesClosing — Canonical ERP Sales Closing module
 *
 * Architecture: single-page, role-aware ERP closing workflow.
 * Design: Material 3 / Enterprise ERP, responsive, mobile-first.
 *
 * Finalized Accounting Rules (PRESERVED — DO NOT MODIFY):
 *  1. Sales Total = Cash Sales + POS Sales + Customer Credit.
 *  2. Never change Sales Total because of cash shortage, overage or owner payments.
 *  3. Expected Cash = Opening Cash + Cash Sales.
 *  4. Cash Difference = Actual Cash - Expected Cash.
 *  5. If Difference < 0 → Cash Shortage.
 *  6. If Difference > 0 → Cash Overage.
 *  7. Owner payment = Owner Capital Contribution, never Sales.
 *  8. Operating Result = Total Sales - Approved Purchases.
 *  9. Opening Cash = Previous Shift Closing Cash (automatic).
 * 10. Closing Cash = Actual Cash + Owner Capital Contribution.
 * 11. Next shift Opening Cash = Previous Closing Cash.
 * 12. Remaining Difference = Closing Cash - Expected Cash.
 *     Shift cannot close until Remaining Difference = 0 or Manager Approval.
 * 13. Sales, Cash Reconciliation, Purchases and Operating Result are independent.
 */
import React, { useState, useMemo, useEffect, useLayoutEffect, useCallback, useDeferredValue, memo } from 'react';
import { flushSync } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useAuth } from '@/lib/AuthContext';
import { useRole, ROLES } from '@/lib/RoleContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import {
  Store, Trash2,
  TrendingDown, TrendingUp, CheckCircle2, XCircle,
  AlertCircle, ShieldCheck,
  Scale, DollarSign, BarChart3,
  AlertTriangle,
  ArrowUpRight, ArrowDownRight,
  ChevronDown, ChevronUp,
  Loader2, RefreshCw, Save, X,
} from 'lucide-react';
import BranchSelect from '@/components/shared/BranchSelect';
import { toast } from 'sonner';
import { useSalesSources } from '@/hooks/useSalesSources';
import { useSalesClosingCustomization } from '@/lib/SalesClosingCustomizationContext';
import { newSalesClosingCustomField } from '@/lib/salesClosingCustomization';
import { buildSalesSourceClosingSnapshots, driverSourceEntryAmounts, driverSourcePaymentBreakdown, driverSourceTodayTotal, salesSourceTodayTotal } from '@/lib/salesSourceClosingLifecycle';
import { SalesClosingFieldDialog, SalesSourceDialog, newSalesClosingSource } from '@/components/sales/SalesClosingCustomizationDialogs';
import ClosingNumericInput from '@/components/sales/ClosingNumericInput';
import CustomerCreditSalesSource from '@/components/sales/CustomerCreditSalesSource';
import { closingErrorDetails } from '@/lib/closing/ClosingRepository';
import { hasCanonicalCustomerScope, loadCanonicalActiveCustomers } from '@/lib/closing/CanonicalCustomerLoader';
import { recordCustomerReceivablePayment, invalidateCustomerReceivableQueries, customerDebtPaymentErrorMessage } from '@/lib/debt/customerReceivableRepository';
import { cashReconciliationSnapshot, paymentMethodForCode } from '@/lib/closing/CashReconciliationLedger';
import { Banknote as BanknoteIcon, CreditCard as CreditCardIcon, UserCheck, PlusCircle, ShoppingBag, Truck, Star, Globe, Smartphone, UtensilsCrossed, Package as PackageIcon, DollarSign as DollarSignIcon, Gift, Users as UsersIcon, Building2 as Building2Icon, Zap as ZapIcon, Activity as ActivityIcon, BarChart3 as BarChart3Icon, Shield } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC ICON REGISTRY (for Sales Sources)
// ─────────────────────────────────────────────────────────────────────────────
const SOURCE_ICON_MAP = {
  Banknote: BanknoteIcon, CreditCard: CreditCardIcon, UserCheck, PlusCircle,
  ShoppingBag, Truck, Star, Globe, Smartphone, UtensilsCrossed,
  Package: PackageIcon, DollarSign: DollarSignIcon, Gift,
  Users: UsersIcon, Building2: Building2Icon, Zap: ZapIcon,
  Activity: ActivityIcon, BarChart3: BarChart3Icon, Shield,
};
function getSourceIcon(iconName) {
  return SOURCE_ICON_MAP[iconName] || BanknoteIcon;
}

const asRecordArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const firstRecord = (value) => asRecordArray(value).at(0) || null;
const newStableRowId = (prefix) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
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
// DESIGN TOKENS — Material 3 / ERP
// ─────────────────────────────────────────────────────────────────────────────
const SECTION_COLORS = {
  shift:        { border: 'border-slate-200',   bg: 'bg-slate-50/50',   icon: 'text-slate-600',   header: 'bg-slate-100/80'   },
  kpi:          { border: 'border-indigo-200',  bg: 'bg-indigo-50/30',  icon: 'text-indigo-600',  header: 'bg-indigo-100/60'  },
  custom:       { border: 'border-teal-200',    bg: 'bg-teal-50/30',    icon: 'text-teal-600',    header: 'bg-teal-100/60'    },
  pos:          { border: 'border-violet-200',  bg: 'bg-violet-50/30',  icon: 'text-violet-600',  header: 'bg-violet-100/60'  },
  credit:       { border: 'border-blue-200',    bg: 'bg-blue-50/30',    icon: 'text-blue-600',    header: 'bg-blue-100/60'    },
  purchases:    { border: 'border-orange-200',  bg: 'bg-orange-50/30',  icon: 'text-orange-600',  header: 'bg-orange-100/60'  },
  reconcile:    { border: 'border-amber-200',   bg: 'bg-amber-50/30',   icon: 'text-amber-600',   header: 'bg-amber-100/60'   },
  operating:    { border: 'border-emerald-200', bg: 'bg-emerald-50/30', icon: 'text-emerald-600', header: 'bg-emerald-100/60' },
  validation:   { border: 'border-cyan-200',    bg: 'bg-cyan-50/30',    icon: 'text-cyan-600',    header: 'bg-cyan-100/60'    },
  save:         { border: 'border-green-200',   bg: 'bg-green-50/30',   icon: 'text-green-600',   header: 'bg-green-100/60'   },
};

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON LOADER
// ─────────────────────────────────────────────────────────────────────────────
const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse bg-muted/60 rounded-lg ${className}`} />
);

const SkeletonCard = () => (
  <div className="rounded-xl border border-border bg-card p-4 space-y-2">
    <Skeleton className="h-3 w-24" />
    <Skeleton className="h-6 w-32" />
    <Skeleton className="h-3 w-16" />
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION HEADER — Material 3 style
// ─────────────────────────────────────────────────────────────────────────────
const SectionHeader = memo(function SectionHeader({
  icon: Icon, title, badge, color = 'shift', sectionNum, collapsible = false, collapsed, onToggle,
}) {
  const c = SECTION_COLORS[color] || SECTION_COLORS.shift;
  const contents = (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
        {false && sectionNum && (
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold bg-white/70 border border-border/50 ${c.icon}`}>
            {sectionNum}
          </span>
        )}
        <Icon className={`h-4 w-4 shrink-0 ${c.icon}`} />
        <span className="min-w-0 truncate text-left text-xs font-bold uppercase tracking-wider text-foreground/80">{title}</span>
      </span>
      <span className="ml-2 flex shrink-0 items-center gap-1.5 sm:gap-2">
        {badge && <span className="max-w-[7.5rem] overflow-hidden text-ellipsis whitespace-nowrap sm:max-w-none">{badge}</span>}
        {false && collapsible && (
          collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />
        )}
      </span>
    </>
  );

  if (false) {
    return (
      <button
        type="button"
        className={`flex w-full min-w-0 items-center justify-between gap-2 px-3 py-3 sm:px-4 ${c.header} border-b border-border/60 text-left transition-colors hover:bg-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50`}
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        {contents}
      </button>
    );
  }

  return <div className={`flex min-w-0 items-center justify-between gap-2 px-3 py-3 sm:px-4 ${c.header} border-b border-border/60`}>{contents}</div>;
});

const AccordionBody = function AccordionBody({ children }) {
  return (
    <div className="grid grid-rows-[1fr] opacity-100">
      <div className="min-h-0 overflow-visible">{children}</div>
    </div>
  );
};

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
  const amount = Number(value) || 0;
  const sign = signed && amount > 0 ? '+' : amount < 0 ? '−' : '';
  return (
    <span className={`inline-flex items-baseline gap-1 whitespace-nowrap tabular-nums ${className}`} dir="ltr">
      {sign && <span>{sign}</span>}
      <span className="text-[0.78em] font-semibold tracking-wide opacity-75">{currency}</span>
      <span>{Math.abs(amount).toLocaleString()}</span>
    </span>
  );
}

const SalesSourceDailyHistoryCard = memo(function SalesSourceDailyHistoryCard({ source, sourceLabel, todayInput, today, previous, currency, onChange, isHistoryLoading, isHistoryUnavailable, copy }) {
  const total = previous + today;
  return (
    <div className="rounded-xl border border-blue-200 bg-background p-3 shadow-sm" data-i18n-skip="true">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-blue-950" data-i18n-skip="true">{sourceLabel}</p>
        </div>
        <Badge variant="outline" className="shrink-0 border-blue-200 bg-blue-50 text-[10px] text-blue-700">{copy.dailySource}</Badge>
      </div>
      <NumInput
        id={`quick-closing-source-${source.id}`}
        label={copy.today}
        value={todayInput}
        onChange={onChange}
        prefix={currency}
        helpText={copy.dailyEditable}
      />
      <div className="mt-3 space-y-2 border-t border-blue-100 pt-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <div><p className="font-medium">{copy.previous}</p><p className="text-[10px] text-muted-foreground">{copy.previousHelp}</p></div>
          {isHistoryLoading ? <span className="text-xs text-muted-foreground">{copy.loadingHistory}</span> : isHistoryUnavailable ? <span className="text-xs text-destructive">{copy.historyUnavailable}</span> : <Money currency={currency} value={previous} className="font-semibold text-muted-foreground" />}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-blue-100 pt-2 text-sm">
          <div><p className="font-bold text-blue-950">{copy.total}</p><p className="text-[10px] text-muted-foreground">{copy.totalHelp}</p></div>
          {isHistoryLoading ? <span className="text-xs text-muted-foreground">{copy.loadingHistory}</span> : isHistoryUnavailable ? <span className="text-xs text-destructive">{copy.historyUnavailable}</span> : <Money currency={currency} value={total} className="font-black text-blue-800" />}
        </div>
      </div>
    </div>
  );
});

const DriverSalesSourceCard = memo(function DriverSalesSourceCard({ source, sourceLabel, entries, drivers, previous, currency, onAdd, onChange, onRemove, isHistoryLoading, isHistoryUnavailable, copy }) {
  const today = driverSourceTodayTotal(entries);
  const total = previous + today;
  const availableDrivers = asRecordArray(drivers).filter((driver) => driver.is_active !== false && driver.status !== 'inactive');

  return (
    <div className="rounded-xl border border-cyan-200 bg-background p-3 shadow-sm" data-i18n-skip="true">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="truncate text-sm font-bold text-cyan-950">{sourceLabel}</p><p className="text-[10px] text-muted-foreground">{source.subcategory || 'Drivers'} · Branch-scoped Driver Master entries</p></div>
        <Badge variant="outline" className="shrink-0 border-cyan-200 bg-cyan-50 text-[10px] text-cyan-700">Driver source</Badge>
      </div>
      <div className="space-y-2">
        {entries.length === 0 ? <p className="rounded-lg border border-dashed border-cyan-200 bg-cyan-50/40 px-3 py-3 text-xs text-cyan-800">No driver sales entered for this source today.</p> : entries.map((entry) => {
          const usedDriverIds = new Set(entries.filter((candidate) => candidate.client_row_id !== entry.client_row_id).map((candidate) => String(candidate.driver_id || '')));
          const amounts = driverSourceEntryAmounts(entry);
          return <div key={entry.client_row_id} className="grid gap-2 rounded-lg border border-cyan-100 bg-cyan-50/30 p-2 sm:grid-cols-[minmax(11rem,1.25fr)_minmax(18rem,1.75fr)_auto]">
            <Select value={entry.driver_id || ''} onValueChange={(driver_id) => {
              const driver = availableDrivers.find((candidate) => String(candidate.id) === String(driver_id));
              onChange(entry.client_row_id, { driver_id, driver_name: driver?.full_name || '' });
            }}><SelectTrigger className="bg-background"><SelectValue placeholder="Select Driver" /></SelectTrigger><SelectContent>{availableDrivers.map((driver) => <SelectItem key={driver.id} value={driver.id} disabled={usedDriverIds.has(String(driver.id))}>{driver.full_name}{driver.driver_id ? ` · ${driver.driver_id}` : ''}</SelectItem>)}</SelectContent></Select>
            <div className="grid grid-cols-3 gap-2"><div><Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Cash</Label><Input type="number" min="0" step="0.01" value={entry.cash_amount ?? entry.cash ?? ''} onChange={(event) => onChange(entry.client_row_id, { cash_amount: event.target.value })} placeholder="SAR 0" className="bg-background" aria-label="Driver cash amount" /></div><div><Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Network / Card</Label><Input type="number" min="0" step="0.01" value={entry.network_amount ?? entry.network ?? ''} onChange={(event) => onChange(entry.client_row_id, { network_amount: event.target.value })} placeholder="SAR 0" className="bg-background" aria-label="Driver network amount" /></div><div className="rounded-md border border-cyan-100 bg-cyan-50 px-2 py-1.5"><p className="text-[10px] font-bold uppercase tracking-wide text-cyan-800">Total</p><Money currency={currency} value={amounts.total} className="text-sm font-black text-cyan-900" /></div></div>
            <Button type="button" variant="ghost" size="icon" className="self-end text-destructive hover:text-destructive" onClick={() => onRemove(entry.client_row_id)} aria-label="Remove driver sale"><Trash2 className="h-4 w-4" /></Button>
            <Textarea value={entry.notes || ''} onChange={(event) => onChange(entry.client_row_id, { notes: event.target.value })} placeholder="Optional note" className="sm:col-span-2" rows={1} />
          </div>;
        })}
      </div>
      {(() => { const breakdown = driverSourcePaymentBreakdown(entries); return <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><Button type="button" size="sm" variant="outline" onClick={onAdd} disabled={availableDrivers.length === 0}><PlusCircle className="mr-1 h-3.5 w-3.5" />Add Driver</Button><div className="grid grid-cols-3 gap-3 text-right"><div><p className="text-[10px] font-bold uppercase tracking-wide text-cyan-700">Driver Cash</p><Money currency={currency} value={breakdown.cash} className="text-sm font-black text-cyan-700" /></div><div><p className="text-[10px] font-bold uppercase tracking-wide text-cyan-700">Driver Network</p><Money currency={currency} value={breakdown.network} className="text-sm font-black text-cyan-700" /></div><div><p className="text-[10px] font-bold uppercase tracking-wide text-cyan-700">Today from drivers</p><Money currency={currency} value={today} className="text-sm font-black text-cyan-700" /></div></div></div>; })()}
      {availableDrivers.length === 0 && <p className="mt-2 text-xs text-amber-700">Create an active Driver Master record for this branch before adding driver sales.</p>}
      <div className="mt-3 space-y-2 border-t border-cyan-100 pt-3">
        <div className="flex items-center justify-between gap-3 text-sm"><div><p className="font-medium">{copy.previous}</p><p className="text-[10px] text-muted-foreground">{copy.previousHelp}</p></div>{isHistoryLoading ? <span className="text-xs text-muted-foreground">{copy.loadingHistory}</span> : isHistoryUnavailable ? <span className="text-xs text-destructive">{copy.historyUnavailable}</span> : <Money currency={currency} value={previous} className="font-semibold text-muted-foreground" />}</div>
        <div className="flex items-center justify-between gap-3 border-t border-cyan-100 pt-2 text-sm"><div><p className="font-bold text-cyan-950">{copy.total}</p><p className="text-[10px] text-muted-foreground">{copy.totalHelp}</p></div>{isHistoryLoading ? <span className="text-xs text-muted-foreground">{copy.loadingHistory}</span> : isHistoryUnavailable ? <span className="text-xs text-destructive">{copy.historyUnavailable}</span> : <Money currency={currency} value={total} className="font-black text-cyan-800" />}</div>
      </div>
    </div>
  );
});
// ─────────────────────────────────────────────────────────────────────────────
// KPI CARD — Large ERP style
// ─────────────────────────────────────────────────────────────────────────────
const KPICard = memo(function KPICard({ label, value, sublabel, icon: Icon, colorClass = 'text-primary', bgClass = 'bg-primary/10', trend, loading }) {
  if (loading) return <SkeletonCard />;
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
      <div className={`p-2.5 rounded-xl ${bgClass} flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${colorClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide truncate">{label}</p>
        <p className="text-xl font-black text-foreground mt-0.5 truncate">{value}</p>
        {sublabel && <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>}
        {trend !== undefined && trend !== null && (
          <div className={`flex items-center gap-0.5 mt-1 text-[10px] font-bold ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend).toFixed(1)}% vs yesterday
          </div>
        )}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────────────────────────────────────
const StatusBadge = memo(function StatusBadge({ status }) {
  if (!status) return null;
  const cfg = {
    Balanced: { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
    Shortage:  { cls: 'bg-red-100 text-red-700 border-red-200', Icon: TrendingDown },
    Overage:   { cls: 'bg-amber-100 text-amber-700 border-amber-200', Icon: TrendingUp },
  };
  const c = cfg[status] || cfg.Balanced;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${c.cls}`}>
      <c.Icon className="w-3 h-3" />{status}
    </span>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION ROW
// ─────────────────────────────────────────────────────────────────────────────
const ValidationRow = memo(function ValidationRow({ label, passed, message }) {
  return (
    <div className={`flex min-w-0 items-start justify-between gap-2 px-3 py-2 rounded-lg border text-xs font-medium
      ${passed ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
      <div className="flex min-w-0 items-center gap-2">
        {passed
          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
          : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
        <span className="min-w-0 leading-snug">{label}</span>
      </div>
      {message && <span className="max-w-[8rem] shrink-0 truncate text-right text-[10px] leading-snug opacity-70 sm:max-w-[12rem]">{message}</span>}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// STICKY SUMMARY BAR
// ─────────────────────────────────────────────────────────────────────────────
const StickySummary = memo(function StickySummary({ totalSales, operatingResult, cashStatus, currency, isSubmitting, className = '' }) {
  return (
    <div className={`sticky top-0 z-30 border-b border-border bg-background/95 shadow-sm backdrop-blur-sm ${className}`}>
      <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-2 sm:px-4">
        <div className="flex shrink-0 items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Live</span>
        </div>
        <div className="flex min-w-0 flex-wrap justify-end gap-x-3 gap-y-1 text-xs sm:gap-x-4">
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-muted-foreground">Revenue</span>
            <span className="font-black text-blue-700">{currency}{'\u00A0'}{totalSales.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-muted-foreground">Result</span>
            <span className={`font-black ${operatingResult >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {operatingResult >= 0 ? '+' : ''}{currency}{'\u00A0'}{operatingResult.toLocaleString()}
            </span>
          </div>
          {cashStatus && <StatusBadge status={cashStatus} />}
        </div>
        {isSubmitting && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Saving...</span>
          </div>
        )}
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
  const navigate = useNavigate();
  const {
    config: closingConfig,
    fields: configuredClosingFields,
    paymentMethods: configuredPaymentMethods,
    canCustomize,
    saveSalesSource,
    saveClosingField,
    isSavingSalesSource,
    isSavingClosingField,
  } = useSalesClosingCustomization();
  // The legacy automatic sources do not carry the Closing's full shift/cashier
  // identity. They must never seed a new Closing with historical branch/day
  // amounts. Current-period sales remain the explicit Today inputs until an
  // ERP feed with branch + date + shift + cashier scope is available.
  const automaticTotalsEnabled = false;
  const requiresCashReconciliation = closingConfig?.validation_rules?.require_cash_reconciliation !== false;
  const showMobileSummary = closingConfig?.layout?.mobile_summary !== false;
  const showDesktopSummary = closingConfig?.layout?.desktop_summary !== false;
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
  const salesClosingWorkspaceCopy = useMemo(() => ({
    title: t('salesClosing.workspace.title'),
    description: t('salesClosing.workspace.description'),
    liveConfiguration: t('salesClosing.workspace.liveConfiguration'),
    addSource: t('salesClosing.workspace.addSource'),
    addField: t('salesClosing.workspace.addField'),
    customize: t('salesClosing.workspace.customize'),
    paymentMethods: t('salesClosing.workspace.paymentMethods'),
    additionalFields: t('salesClosing.workspace.additionalFields'),
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
  const summaryVisibilityClass = !showMobileSummary && !showDesktopSummary
    ? 'hidden'
    : !showMobileSummary
      ? 'hidden sm:block'
      : !showDesktopSummary
        ? 'sm:hidden'
        : '';
  const branches = asRecordArray(tenantBranches);
  const canUseAdvancedClosing = isManager || [ROLES.OWNER, ROLES.GENERAL_MANAGER].includes(role);
  const [closingView, setClosingView] = useState('quick');
  const [sourceEditor, setSourceEditor] = useState(null);
  const [fieldEditor, setFieldEditor] = useState(null);
  const isQuickClosing = closingView === 'quick';
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
  const [requestedClosingState, setRequestedClosingState] = useState(
    initial?.closing_state === 'finalized' ? 'finalized' : 'draft',
  );

  useEffect(() => {
    if (!canUseAdvancedClosing) setClosingView('quick');
  }, [canUseAdvancedClosing]);

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
  const saveInlineSalesSource = useCallback(async (source) => {
    try {
      await saveSalesSource(source);
      setSourceEditor(null);
      toast.success('Sales source saved and is ready to use.');
    } catch (error) {
      toast.error(error?.message || 'Unable to save the sales source.');
    }
  }, [saveSalesSource]);
  const saveInlineClosingField = useCallback(async (field) => {
    try {
      await saveClosingField(field);
      setFieldEditor(null);
      toast.success('Closing field saved and is ready to use.');
    } catch (error) {
      toast.error(error?.message || 'Unable to save the closing field.');
    }
  }, [saveClosingField]);
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
    setCashSalesInput('');
    setOpeningCash('');
    setActualCashCount('');
    setOwnerContributionInput('');
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
  const [actualCashCount, setActualCashCount] = useState(() => {
    if (initial?.closing_cash == null) return '';
    return String(Number(initial.closing_cash) - Number(initial.owner_cash_injection || 0));
  });
  const [ownerContributionInput, setOwnerContributionInput] = useState(initial?.owner_cash_injection ?? '');
  const [cashNotes, setCashNotes] = useState(initial?.cash_notes || '');
  // Keep raw numeric editing values in their own stable state. React batches
  // the related calculations normally; synchronously replacing a keyed parent
  // during a keystroke can dismiss mobile keyboards.
  const updateCalculatedInput = useCallback((setter, value) => {
    setter(value);
  }, []);
  const updateCashSales = useCallback((value) => updateCalculatedInput(setCashSalesInput, value), [updateCalculatedInput]);
  const updateOpeningCash = useCallback((value) => updateCalculatedInput(setOpeningCash, value), [updateCalculatedInput]);
  const updateActualCashCount = useCallback((value) => updateCalculatedInput(setActualCashCount, value), [updateCalculatedInput]);
  const updateOwnerContribution = useCallback((value) => updateCalculatedInput(setOwnerContributionInput, value), [updateCalculatedInput]);
  const [managerApproved, setManagerApproved] = useState(initial?.manager_approval || false);

  // ── POS entries ───────────────────────────────────────────────────────────
  const parsePosEntries = () => {
    if (initial?.pos_entries_json) {
      try {
        const parsed = asRecordArray(JSON.parse(initial.pos_entries_json));
        if (parsed.length) return parsed.map((e, i) => ({ ...e, id: Date.now() + i }));
      } catch { /* ignore */ }
    }
    return [{ id: Date.now(), device_id: '', device_name: '', amount: '', notes: '' }];
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
  const { customSources: customSourcesData, creditSource, isLoading: sourcesLoading } = useSalesSources({ branchId: selectedBranchId });
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

  // Keep the outer New Closing action on the same stable business key as this
  // single canonical workspace. The callback is observational only: it neither
  // persists a draft nor resets any form state while the operator is typing.
  useEffect(() => {
    onSessionContextChange?.({
      date: form.date,
      branch: form.branch,
      branch_id: selectedBranchId,
      shift: form.shift,
      cashier_id: form.cashier_id || form.cashier_employee_id || defaultCashier?.id || user?.id || null,
      cashier_name: cashierDisplayName,
    });
  }, [cashierDisplayName, defaultCashier?.id, form.branch, form.cashier_employee_id, form.cashier_id, form.date, form.shift, onSessionContextChange, selectedBranchId, user?.id]);

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

  // ── POS devices ───────────────────────────────────────────────────────────
  const { data: posDevicesData, isLoading: posLoading } = useQuery({
    queryKey: ['pos_devices_form', activeRestaurant?.id, ownerFilter?.created_by, form.branch, selectedBranchId],
    queryFn: async () => {
      if (isManager && !activeRestaurant?.id) return [];
      if (!isManager && !ownerFilter?.created_by) return [];
      const all = asRecordArray(await base44.entities.NetworkAccount.filter(
        isManager ? { restaurant_id: activeRestaurant.id } : { created_by: ownerFilter.created_by },
        '-created_date',
        200,
      ));
      return all.filter((account) =>
        (account.status === 'active' || account.is_active) &&
        (isManager
          ? matchesBranch(account, form.branch, selectedBranchId)
          : (!form.branch || account.branch === form.branch || account.branch_id === form.branch))
      );
    },
    staleTime: 30000,
    enabled: isManager ? !!activeRestaurant?.id && !!form.branch : !!ownerFilter?.created_by,
  });
  const posDevices = asRecordArray(posDevicesData);

  useEffect(() => {
    if (initial?.id || !isManager || form.pos_device_id || !posDevices.length) return;
    const device = firstRecord(posDevices);
    if (!device?.id) return;
    setForm((previous) => ({ ...previous, pos_device_id: device.id }));
    setPosEntries((previous) => previous.map((entry, index) =>
      index === 0 && !entry.device_id
        ? {
            ...entry,
            device_id: device.id,
            device_name: device.account_name || device.device_name || '',
            provider: device.provider || device.account_type || '',
          }
        : entry,
    ));
  }, [form.pos_device_id, initial?.id, isManager, posDevices]);

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
  const addCustomerCreditSale = () => setCustomerCreditSales((previous) => [...previous, {
    id: newStableRowId('customer-credit'),
    client_row_id: newStableRowId('customer-credit-client'),
    source_id: creditSource?.id || '',
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
  }]);

  // ── Approved Purchases ────────────────────────────────────────────────────
  // BUG FIX: Approved purchases query must work for both Owner (created_by) and
  // Manager (restaurant_id + branch). When isManager, scope by restaurant_id and branch.
  const purchasesEnabled = !!activeRestaurant?.id && !!form.date && !!selectedBranchId && !!form.branch;

  const { data: approvedPurchasesForDateData, isLoading: purchasesLoading } = useQuery({
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
  const automaticClosingEnabled = Boolean(automaticTotalsEnabled && activeRestaurant?.id && form.date && form.branch && !initial?.id);
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
  const useAutomaticSales = Boolean(automaticTotalsEnabled && !initial?.id && snapshotMatchesScope && automaticClosingSnapshot.hasData);
  const autoSourceLoading = automaticTotalsEnabled && automaticClosingLoading && !useAutomaticSales;
  const automaticClosingUnavailable = automaticTotalsEnabled && automaticClosingIsError && !useAutomaticSales;

  // The canonical server context is the only source of opening cash and posted
  // physical-cash movements. It is scoped by restaurant, branch, date, shift and
  // cashier, so unrelated shifts or prior days cannot change this Closing.
  const currentClosingId = savedClosing?.id || initial?.id || null;
  const { data: cashLedgerContextData, isLoading: cashLedgerLoading, isError: cashLedgerUnavailable, refetch: refetchCashLedger } = useQuery({
    queryKey: ['sales-closing-cash-ledger-context', activeRestaurant?.id, selectedBranchId, form.branch, form.date, form.shift, form.cashier_id || form.cashier_employee_id, currentClosingId],
    enabled: Boolean(activeRestaurant?.id && selectedBranchId && form.date && form.shift && (form.cashier_id || form.cashier_employee_id || defaultCashier?.id)),
    staleTime: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('erp_sales_closing_cash_context', {
        p_restaurant_id: activeRestaurant.id,
        p_branch_id: selectedBranchId,
        p_branch: form.branch,
        p_date: form.date,
        p_shift: form.shift,
        p_cashier_id: form.cashier_id || form.cashier_employee_id || defaultCashier?.id || null,
        p_closing_id: currentClosingId,
      });
      if (error) throw error;
      return data || {};
    },
  });
  const cashLedgerContext = cashLedgerContextData || {};
  const activeOwnerSettlement = currentClosingId && cashLedgerContext.owner_settlement?.closing_id === currentClosingId
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
  const cashSales = baseCashSales + customSourcePaymentTotals.cash;
  const cardTotal = baseNetworkTotal + customSourcePaymentTotals.card;
  const bankTransferTotal = customSourcePaymentTotals.bank_transfer;
  const onlineTotal = customSourcePaymentTotals.online;
  const walletTotal = customSourcePaymentTotals.wallet;
  const creditTotal = baseCreditTotal + customSourcePaymentTotals.credit;
  const otherPaymentTotal = (useAutomaticSales ? automaticClosingSnapshot.other : 0) + customSourcePaymentTotals.other;
  const networkTotal = cardTotal + bankTransferTotal + onlineTotal + walletTotal;
  const totalSales = cashSales + networkTotal + creditTotal + otherPaymentTotal;

  useEffect(() => {
    if (!initial?.id && cashLedgerContext.opening_cash !== undefined && cashLedgerContext.opening_cash !== null) setOpeningCash(String(cashLedgerContext.opening_cash));
  }, [cashLedgerContext.opening_cash, initial?.id]);

  const opening = Number(cashLedgerContext.opening_cash ?? openingCash) || 0;
  const actualCount = actualCashCount !== '' ? Number(actualCashCount) : null;
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
  const isCurrentClosingOwnerSettlementMovement = (movement) => (
    movement?.movement_type === 'owner_injection'
    && movement?.source_module === 'OwnerCashInjection'
    && movement?.source_document_id === currentClosingId
  );
  const reconciliation = cashReconciliationSnapshot({
    openingCash: opening,
    ledgerMovements: asRecordArray(cashLedgerContext.movements).filter(
      (movement) => !isCurrentClosingOwnerSettlementMovement(movement),
    ),
    currentCashSales: baseCashSales,
    revenueEntries: customSourceSummaries.flatMap(({ source, today, driverEntries }) => source.allows_driver_entries === true
      ? driverEntries.flatMap((entry) => {
        const amounts = driverSourceEntryAmounts(entry);
        return [
          ...(amounts.cash > 0 ? [{ amount: amounts.cash, payment_method: 'cash' }] : []),
          ...(amounts.network > 0 ? [{ amount: amounts.network, payment_method: 'card' }] : []),
        ];
      })
      : [{ amount: today, payment_method: source.default_payment_method }]),
    actualCash: actualCount,
    branchWalletAvailable,
  });
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
  const expectedCash = reconciliation.expectedCash;
  const cashDifference = reconciliation.difference;
  const cashReconcStatus = cashDifference === null ? null : cashDifference === 0 ? 'Balanced' : cashDifference < 0 ? 'Shortage' : 'Overage';
  const closingCash = actualCount !== null ? actualCount : opening;
  const remainingDifference = cashDifference;
  const operatingResult = totalSales - totalDailyExpenses;

  // Validation checks
  const validations = useMemo(() => [
    {
      key: 'erpData',
      label: 'ERP Sales and Cash Ledger Available',
      passed: !automaticClosingUnavailable && !cashLedgerUnavailable,
      message: automaticClosingUnavailable || cashLedgerUnavailable ? 'Retry required' : (useAutomaticSales ? 'Ledger-scoped sales loaded' : 'No posted sales'),
    },
    {
      key: 'cashier',
      label: 'Cashier Selected',
      passed: !!cashierDisplayName,
      message: cashierDisplayName || 'Required',
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
      passed: posEntries.every(e => !e.device_id || Number(e.amount) >= 0),
      message: `${currency}\u00A0${networkTotal.toLocaleString()}`,
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
      passed: !requiresCashReconciliation || actualCount !== null,
      message: !requiresCashReconciliation ? 'Optional by configuration' : actualCount === null ? 'Actual cash count required' : remainingDifference === 0 ? 'Balanced' : 'Variance will be recorded separately',
    },
    {
      key: 'cashNote',
      label: 'Cash Difference Note',
      passed: !requiresCashReconciliation || cashDifference === null || cashDifference === 0 || Boolean(cashNotes.trim()),
      message: !requiresCashReconciliation || cashDifference === null || cashDifference === 0 ? 'Not required' : 'Required for a difference',
    },
    {
      key: 'requiredFields',
      label: 'Required Fields Complete',
      passed: !!form.date && !!form.branch && customClosingFields.every((field) => !field.is_required || hasCustomClosingFieldValue(field)),
      message: form.date || 'Date required',
    },
  ], [form, automaticClosingUnavailable, cashLedgerUnavailable, useAutomaticSales, cashierDisplayName, approvedPurchasesForDate, posEntries, customerCreditSales, customClosingFields, customClosingFieldValues, hasCustomClosingFieldValue, cashSales, networkTotal, creditTotal, actualCount, remainingDifference, cashDifference, cashNotes, managerApproved, requiresCashReconciliation, currency]);

  const allValid = useMemo(() => validations.every(v => v.passed), [validations]);
  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const savingDraft = requestedClosingState === 'draft';

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
    if (!form.date) nextErrors.date = 'Date is required.';
    if (!form.branch) nextErrors.branch = 'Branch is required.';
    if (!form.shift) nextErrors.shift = 'Shift is required.';
    if (!cashierDisplayName) nextErrors.cashier = 'Cashier is required.';
    if (!savingDraft && requiresCashReconciliation && actualCount === null) nextErrors.actualCash = 'Actual Cash is required.';
    if (!savingDraft && requiresCashReconciliation && cashDifference !== null && cashDifference !== 0 && !cashNotes.trim()) nextErrors.cashNotes = 'A reconciliation note is required for a cash difference.';
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
      focusField(firstError);
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
    const cashierId = form.cashier_id || form.cashier_employee_id || defaultCashier?.id || user?.id || null;
    const customerId = form.customer_id || customerCreditSales.find((entry) => entry.customer_id)?.customer_id || null;
    const posDeviceId = form.pos_device_id || posEntries.find((entry) => entry.device_id)?.device_id || null;
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

    if (isManager && (custLoading || posLoading)) {
      console.log('[UnifiedSalesClosing] FAILED: Data still loading');
      toast.error('Required data is still loading, please wait...');
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
      const customerCreditSourceSnapshot = creditSource && manualCreditTotal > 0 ? {
        source_id: creditSource.id,
        source_key: creditSource.system_key || 'credit',
        name_en: creditSource.name_en || 'Customer Credit',
        name_ar: creditSource.name_ar || null,
        subcategory: creditSource.subcategory || creditSource.category || null,
        amount: manualCreditTotal,
        today_amount: manualCreditTotal,
        previous_amount: 0,
        total_amount: manualCreditTotal,
        default_payment_method: 'credit',
        payment_method: 'credit',
        payment_bucket: 'credit',
        included_in_revenue: true,
        branch_id: branchId,
        branch: selectedBranch?.key || selectedBranch?.branch_key || form.branch,
        date: form.date,
        shift: form.shift,
        cashier_id: cashierId,
        cashier_name: cashierDisplayName,
      } : null;
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
          ...(customerCreditSourceSnapshot ? [customerCreditSourceSnapshot] : []),
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
      toast.error(userMessage);
    } finally {
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

  const showCustomizationCard = Boolean(creditSource) || canCustomize || (isConfiguredClosingFieldShown('sales_sources') && customSources.length > 0) || customClosingFields.length > 0 || (isConfiguredClosingFieldShown('payment_methods') && configuredPaymentMethods.some((method) => method.is_active !== false));

  return (
    <form onSubmit={handleSubmit} className="flex h-full min-h-0 min-w-0 flex-col">
      <StickySummary
        totalSales={totalSales}
        operatingResult={operatingResult}
        cashStatus={cashReconcStatus}
        currency={currency}
        isSubmitting={isSubmitting}
        className={summaryVisibilityClass}
      />

      <div className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="mx-auto w-full max-w-6xl space-y-3 p-3 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] sm:space-y-4 sm:p-4 sm:pb-6">
          <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between" aria-label="Closing mode">
            <div><p className="text-xs font-black uppercase tracking-wide text-slate-900">{isQuickClosing ? 'Quick Closing' : 'Advanced Closing'}</p><p className="text-[11px] text-muted-foreground">{isQuickClosing ? 'Complete the essential cash, payment, and reconciliation fields on one screen.' : 'Review source detail, purchases, expenses, and operating results before saving.'}</p></div>
            {canUseAdvancedClosing && <div className="grid grid-cols-2 gap-1 rounded-lg border bg-background p-1" role="group" aria-label="Closing mode"><Button type="button" size="sm" variant={isQuickClosing ? 'default' : 'ghost'} className="min-h-9" aria-pressed={isQuickClosing} aria-label="Switch to Quick Closing" onClick={() => setClosingView('quick')}>Quick</Button><Button type="button" size="sm" variant={!isQuickClosing ? 'default' : 'ghost'} className="min-h-9" aria-pressed={!isQuickClosing} aria-label="Switch to Advanced Closing" onClick={() => setClosingView('advanced')}>Advanced</Button></div>}
          </section>
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
                  <p className="text-sm font-bold">{savedClosing._alreadyExists ? 'Closing already completed for this branch and shift.' : 'Daily closing saved successfully.'}</p>
                  {savedClosing.id && <p className="mt-1 text-xs opacity-80">Closing ID: {savedClosing.id}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <Button type="button" variant="outline" className="min-h-11" onClick={onCancel}>Open Closing</Button>
                  <Button type="button" className="min-h-11 bg-emerald-600 hover:bg-emerald-700" onClick={() => onNewClosing?.()} disabled={isOpeningNewClosing} aria-busy={isOpeningNewClosing}>{isOpeningNewClosing ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Opening…</> : 'New Closing'}</Button>
                </div>
              </div>
            </div>
          )}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-background shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-3 sm:px-4">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white"><Store className="h-4 w-4" /></div>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-black tracking-tight text-slate-900">Daily Sales Closing</h2>
                  <p className="truncate text-[11px] text-muted-foreground">Review ERP data, enter the physical cash count, then save.</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
              {configuredIdentityFields.map((field) => {
                const fieldKey = field.field_key;
                const label = closingFieldLabel(fieldKey, field.fallback);
                if (fieldKey === 'date') return <div key={fieldKey} className={closingFieldVisibilityClass(fieldKey)}><Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</Label><Input id="quick-closing-date" type="date" value={form.date} onChange={e => set('date', e.target.value)} className="min-h-11 text-sm" /></div>;
                if (fieldKey === 'branch') return <div key={fieldKey} id="quick-closing-branch" className={closingFieldVisibilityClass(fieldKey)}><Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</Label><BranchSelect value={form.branch} onChange={selectClosingBranch} /></div>;
                if (fieldKey === 'shift') return <div key={fieldKey} id="quick-closing-shift" className={closingFieldVisibilityClass(fieldKey)}><Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</Label><Select value={form.shift} onValueChange={v => set('shift', v)}><SelectTrigger className="min-h-11 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Morning">Morning</SelectItem><SelectItem value="Evening">Evening</SelectItem></SelectContent></Select></div>;
                return <div key={fieldKey} id="quick-closing-cashier" className={`min-w-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 ${closingFieldVisibilityClass(fieldKey)}`}><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">{label}</p><p className="mt-1 truncate text-sm font-bold text-emerald-900">{cashierDisplayName || (empLoading ? 'Loading…' : empError ? 'Unable to load cashier' : 'No cashier')}</p></div>;
              })}
            </div>
          </section>

          <section data-testid="quick-closing-auto-summary" className="overflow-hidden rounded-2xl border border-indigo-200 bg-background shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-indigo-100 bg-indigo-50 px-3 py-3 sm:px-4">
              <div className="flex min-w-0 items-center gap-2"><BarChart3 className="h-4 w-4 shrink-0 text-indigo-600" /><h2 className="truncate text-xs font-black uppercase tracking-wide text-indigo-950">Today&apos;s Sales</h2></div>
              <Badge variant="outline" className="shrink-0 border-indigo-200 bg-white text-[10px] text-indigo-700">{autoSourceLoading ? 'Loading ERP data' : useAutomaticSales ? 'Auto-loaded' : 'No source posted'}</Badge>
            </div>
            {automaticClosingUnavailable ? (
              <div role="alert" className="m-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 sm:m-4">
                <p className="font-bold">Unable to load ERP sales data.</p>
                <p className="mt-1 text-xs leading-relaxed">Check the branch and date, then retry before saving this closing.</p>
                <Button type="button" size="sm" variant="outline" className="mt-3 min-h-10 border-red-300 bg-white" onClick={() => refetchAutomaticClosing()}>
                  <RefreshCw className="mr-1.5 h-4 w-4" />Retry ERP data load
                </Button>
              </div>
            ) : autoSourceLoading ? (
              <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4"><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
            ) : (
              <div className="p-3 sm:p-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-[10px] font-bold uppercase text-emerald-800">Cash</p><Money key={`money-cash-${cashSales}`} currency={currency} value={cashSales} className="mt-1 text-lg font-black text-emerald-700" /></div>
                  <div className="rounded-xl border border-violet-100 bg-violet-50 p-3"><p className="text-[10px] font-bold uppercase text-violet-800">Card / Network</p><Money key={`money-network-${networkTotal}`} currency={currency} value={networkTotal} className="mt-1 text-lg font-black text-violet-700" /></div>
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-3"><p className="text-[10px] font-bold uppercase text-blue-800">Customer Credit</p><Money key={`money-credit-${creditTotal}`} currency={currency} value={creditTotal} className="mt-1 text-lg font-black text-blue-700" /></div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-700">Other</p><Money key={`money-other-${otherPaymentTotal}`} currency={currency} value={otherPaymentTotal} className="mt-1 text-lg font-black text-slate-800" /></div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-3">
                  <span className="text-xs font-black uppercase tracking-wide text-indigo-900">Total Sales</span>
                  <Money key={`money-total-${totalSales}`} currency={currency} value={totalSales} className="text-xl font-black text-indigo-700" />
                </div>
                {!useAutomaticSales && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-bold text-amber-900">No posted ERP sales were found for this branch, date and shift.</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-amber-800">Record sales at POS first. Use this exceptional adjustment only when an offline sale cannot be posted before closing.</p>
                    <div className="mt-3"><NumInput id="quick-closing-cashSales" label="Exceptional Cash Adjustment" value={cashSalesInput} onChange={updateCashSales} prefix={currency} helpText="Not required when the ERP has sales data" /></div>
                  </div>
                )}
              </div>
            )}
          </section>

          {showCustomizationCard && (
            <section className="overflow-hidden rounded-2xl border border-blue-200 bg-background shadow-sm" data-i18n-skip="true">
              <div className="flex flex-col gap-2 border-b border-blue-100 bg-blue-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <div className="flex min-w-0 items-center gap-2"><PlusCircle className="h-4 w-4 shrink-0 text-blue-600" /><div><h2 className="truncate text-xs font-black uppercase tracking-wide text-blue-950">{salesClosingWorkspaceCopy.title}</h2><p className="text-[11px] text-blue-800">{salesClosingWorkspaceCopy.description}</p></div></div>
                <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="w-fit border-blue-200 bg-white text-[10px] text-blue-700">{salesClosingWorkspaceCopy.liveConfiguration}</Badge>{canCustomize && <><Button type="button" size="sm" variant="outline" className="min-h-10 border-blue-300 bg-white" onClick={() => setSourceEditor({ mode: 'create', source: newSalesClosingSource(customSources.length * 10 + 10) })}>+ {salesClosingWorkspaceCopy.addSource}</Button><Button type="button" size="sm" variant="outline" className="min-h-10 border-blue-300 bg-white" onClick={() => setFieldEditor({ mode: 'create', field: newSalesClosingCustomField(configuredClosingFields.length * 10 + 10) })}>+ {salesClosingWorkspaceCopy.addField}</Button><Button type="button" size="sm" className="min-h-10" onClick={() => navigate('/sales-closing-customization')}>{salesClosingWorkspaceCopy.customize}</Button></>}</div>
              </div>
              <div className="space-y-4 p-3 sm:p-4">
                {(creditSource || (isConfiguredClosingFieldShown('sales_sources') && customSources.length > 0)) && <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div><p className="text-xs font-bold uppercase tracking-wide text-foreground">{salesSourceCopy.title}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{salesSourceCopy.todayIncluded}</p></div>
                    <div className="text-right"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">{salesSourceCopy.todayTotal}</p><Money currency={currency} value={customTotal + manualCreditTotal} className="text-sm font-black text-blue-700" /></div>
                  </div>
                  {creditSource && (
                    <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
                      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-950">Customer Credit</p>
                          <p className="mt-0.5 text-[11px] leading-5 text-slate-500">Managed by Sales Sources. Customer balances and payments come only from Debt Management.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" className="min-h-10 bg-white" onClick={() => navigate('/debt-management')}>Debt Management</Button>
                          <Button type="button" size="sm" className="min-h-10" onClick={addCustomerCreditSale} disabled={custLoading || !creditSource}><PlusCircle className="mr-1.5 h-4 w-4" />Add Transaction</Button>
                        </div>
                      </div>
                      {custLoading ? (
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-4 text-sm text-muted-foreground">Loading Debt Management customers…</div>
                      ) : customerCreditSales.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-5 text-center">
                          <p className="text-sm font-bold text-slate-800">No customer transaction added</p>
                          <p className="mt-1 text-xs text-slate-500">Add a transaction, then choose a customer from Debt Management.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                          {customerCreditSales.map((entry, index) => (
                            <CustomerCreditSalesSource
                              key={entry.id}
                              entry={entry}
                              idx={index}
                              onRemove={removeCustomerCreditSale}
                              onUpdate={updateCustomerCreditSale}
                              customers={customers}
                              currency={currency}
                              customerSearch={customerSearch}
                              onCustomerSearch={setCustomerSearch}
                              onSelectCustomer={refetchCustomers}
                              onRecordPayment={recordCustomerCreditPayment}
                              isRecordingPayment={isRecordingCustomerDebtPayment}
                              paymentMethods={configuredPaymentMethods}
                              disabled={isSubmitting}
                            />
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-950 px-3 py-3 text-white">
                        <span className="text-xs font-black uppercase tracking-wide text-slate-300">Credit Sale Total</span>
                        <Money currency={currency} value={manualCreditTotal} className="text-lg font-black text-white" />
                      </div>
                      {inlineErrors.credit && <p role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-900">{inlineErrors.credit}</p>}
                    </div>
                  )}
                  {isConfiguredClosingFieldShown('sales_sources') && customSources.length > 0 && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{customSourceSummaries.map(({ source, sourceLabel, today, previous, driverEntries }) => source.allows_driver_entries === true ? <DriverSalesSourceCard key={source.id} source={source} sourceLabel={sourceLabel} entries={driverEntries} drivers={driverSourceDrivers} previous={previous} currency={currency} onAdd={() => addDriverSourceEntry(source)} onChange={(clientRowId, patch) => updateDriverSourceEntry(source.id, clientRowId, patch)} onRemove={(clientRowId) => removeDriverSourceEntry(source.id, clientRowId)} isHistoryLoading={sourceHistoryLoading || driverSourceDriversLoading} isHistoryUnavailable={sourceHistoryUnavailable} copy={salesSourceCopy} /> : <SalesSourceDailyHistoryCard key={source.id} source={source} sourceLabel={sourceLabel} todayInput={customSourceAmounts[source.id] ?? ''} today={today} previous={previous} currency={currency} onChange={(value) => setCustomAmount(source.id, value)} isHistoryLoading={sourceHistoryLoading} isHistoryUnavailable={sourceHistoryUnavailable} copy={salesSourceCopy} />)}</div>}
                </div>}
                {isConfiguredClosingFieldShown('payment_methods') && configuredPaymentMethods.some((method) => method.is_active !== false) && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-800">{salesClosingWorkspaceCopy.paymentMethods}</p><div className="mt-2 flex flex-wrap gap-2">{configuredPaymentMethods.filter((method) => method.is_active !== false).map((method) => <Badge key={method.id} variant="outline" className="bg-background" data-i18n-skip="true">{sourceNameForLanguage(method)}</Badge>)}</div></div>}
                {customClosingFields.length > 0 && <div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground">{salesClosingWorkspaceCopy.additionalFields}</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{customClosingFields.map((field) => { const visibilityClass = field.visible_mobile === false ? 'hidden sm:block' : field.visible_desktop === false ? 'sm:hidden' : ''; const value = customClosingFieldValues[field.id] ?? ''; const error = inlineErrors[`custom_${field.id}`]; const inputId = `quick-closing-custom_${field.id}`; return <div key={field.id} id={`quick-closing-custom_${field.id}`} className={visibilityClass}>{field.field_type === 'long_text' || field.field_type === 'notes' ? <div><Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{closingFieldNameForLanguage(field)}{field.is_required && <span className="ml-1 text-destructive">*</span>}</Label><Textarea id={inputId} value={value} onChange={(event) => updateCustomClosingField(field.id, event.target.value)} className="min-h-20 resize-none text-sm" />{error && <p className="mt-1 text-xs text-destructive">{error}</p>}</div> : field.field_type === 'dropdown' ? <div><Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{closingFieldNameForLanguage(field)}{field.is_required && <span className="ml-1 text-destructive">*</span>}</Label><Select value={value} onValueChange={(next) => updateCustomClosingField(field.id, next)}><SelectTrigger id={inputId} className="min-h-11 text-sm"><SelectValue placeholder={closingFieldNameForLanguage(field)} /></SelectTrigger><SelectContent>{field.options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>{error && <p className="mt-1 text-xs text-destructive">{error}</p>}</div> : field.field_type === 'checkbox' ? <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-input px-3 py-2 text-sm"><span>{closingFieldNameForLanguage(field)}{field.is_required && <span className="ml-1 text-destructive">*</span>}</span><input id={inputId} type="checkbox" checked={Boolean(value)} onChange={(event) => updateCustomClosingField(field.id, event.target.checked)} className="h-4 w-4 accent-primary" /></label> : <div><Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{closingFieldNameForLanguage(field)}{field.is_required && <span className="ml-1 text-destructive">*</span>}</Label>{field.field_type === 'currency' || field.field_type === 'number' ? <ClosingNumericInput id={inputId} value={value} onChange={(next) => updateCustomClosingField(field.id, next)} required={field.is_required} inputClassName="min-h-11 text-sm" /> : <Input id={inputId} type={field.field_type === 'date' ? 'date' : field.field_type === 'time' ? 'time' : 'text'} value={value} onChange={(event) => updateCustomClosingField(field.id, event.target.value)} className="min-h-11 text-sm" />}{error && <p className="mt-1 text-xs text-destructive">{error}</p>}</div>}{field.help_text && <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{field.help_text}</p>}</div>; })}</div></div>}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
            {/* This subtree must retain its identity while Actual Cash updates Difference. */}
            <section className="overflow-hidden rounded-2xl border border-amber-200 bg-background shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-amber-100 bg-amber-50 px-3 py-3 sm:px-4"><div className="flex items-center gap-2"><Scale className="h-4 w-4 text-amber-600" /><h2 className="text-xs font-black uppercase tracking-wide text-amber-950">Cash Reconciliation</h2></div>{cashReconcStatus && <StatusBadge status={cashReconcStatus} />}</div>
              <div className="space-y-3 p-3 sm:p-4">
                {cashLedgerUnavailable ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900"><p className="font-black">ERP cash ledger is unavailable.</p><Button type="button" size="sm" variant="outline" className="mt-2 min-h-10" onClick={() => refetchCashLedger()}><RefreshCw className="mr-1.5 h-4 w-4" />Retry ledger load</Button></div> : <><div className="grid grid-cols-2 gap-2"><div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3"><p className="text-[10px] font-bold uppercase text-amber-800">Expected Cash</p><Money key={`money-expected-${expectedCash}`} currency={currency} value={expectedCash} className="mt-1 text-lg font-black text-amber-800" /></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-700">Opening Cash</p><Money key={`money-opening-${opening}`} currency={currency} value={opening} className="mt-1 text-lg font-black text-slate-800" /></div></div><div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><div><p className="font-bold text-muted-foreground">Cash Sales</p><Money key={`money-ledger-cash-sales-${cashSales}`} currency={currency} value={cashSales} className="mt-1 font-black text-emerald-700" /></div><div><p className="font-bold text-muted-foreground">ERP Cash IN</p><Money key={`money-ledger-cash-in-${reconciliation.cashIn}`} currency={currency} value={reconciliation.cashIn} className="mt-1 font-black text-emerald-700" /></div><div><p className="font-bold text-muted-foreground">ERP Cash OUT</p><Money key={`money-ledger-cash-out-${reconciliation.cashOut}`} currency={currency} value={reconciliation.cashOut} className="mt-1 font-black text-red-700" /></div></div></>}
                <div id="quick-closing-reconciliation">
                  <NumInput id="quick-closing-actualCash" label="Actual Cash" value={actualCashCount} onChange={(value) => { setInlineErrors((current) => ({ ...current, actualCash: undefined, reconciliation: undefined, cashNotes: undefined })); updateActualCashCount(value); }} prefix={currency} required helpText="Enter the physical count in the cash register" error={inlineErrors.actualCash || inlineErrors.reconciliation || inlineErrors.cashNotes} />
                </div>
                {cashDifference !== null && (
                  <div className={`rounded-xl border-2 p-3 ${cashDifference === 0 ? 'border-emerald-200 bg-emerald-50' : cashDifference < 0 ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                    <div className="flex items-center justify-between gap-3"><span className="text-xs font-black uppercase tracking-wide text-foreground">Difference</span><Money key={`money-difference-${cashDifference}`} currency={currency} value={cashDifference} signed className={`text-xl font-black ${cashDifference === 0 ? 'text-emerald-700' : cashDifference < 0 ? 'text-red-700' : 'text-amber-700'}`} /></div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{cashDifference === 0 ? 'Cash balanced.' : 'Review the difference and add a note before closing.'}</p>
                  </div>
                )}
                {cashDifference !== null && cashDifference !== 0 && <div className="space-y-2"><Textarea id="quick-closing-cashNotes" value={cashNotes} onChange={e => { setCashNotes(e.target.value); setInlineErrors((current) => ({ ...current, cashNotes: undefined })); }} placeholder="Reconciliation note is required for a cash difference" className="min-h-20 resize-none text-sm" /><Button type="button" size="sm" variant={managerApproved ? 'default' : 'outline'} className="min-h-11 w-full" onClick={() => setManagerApproved(!managerApproved)}><ShieldCheck className="mr-1.5 h-4 w-4" />{managerApproved ? 'Manager review recorded' : 'Record manager review (optional)'}</Button></div>}
                {reconciliation.shortage > 0 && <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase text-red-950">Funding Required</p><p className="mt-1 text-[11px] text-red-800">A cash shortage is a separate settlement requirement, never sales revenue or operating result.</p></div><Money key={`money-funding-required-${reconciliation.shortage}`} currency={currency} value={reconciliation.shortage} className="text-lg font-black text-red-700" /></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg border border-blue-200 bg-white/80 p-2"><p className="font-bold text-blue-900">Branch Wallet</p><p className="mt-1 text-blue-800">Available <Money currency={currency} value={branchWalletAvailable} className="font-black" /></p><p className="text-blue-800">Applied <Money currency={currency} value={branchWalletApplied} className="font-black" /></p></div><div className="rounded-lg border border-red-200 bg-white/80 p-2"><p className="font-bold text-red-900">Owner</p><p className="mt-1 text-red-800">Required <Money currency={currency} value={ownerSettlementRequired} className="font-black" /></p><p className="text-red-800">Remaining <Money currency={currency} value={ownerSettlementRemaining} className="font-black" /></p></div></div><div className="mt-3 flex items-center justify-between gap-2"><Badge variant="outline" className={ownerSettlementResolved || ownerSettlementRequired === 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-white text-red-800'}>{ownerSettlementRequired === 0 ? reconciliation.settlementStatus : ownerSettlementStatusLabel}</Badge><Button type="button" size="sm" className="min-h-10" disabled={!(currentClosingId && onRecordOwnerPayment) || isRecordingOwnerPayment || ownerSettlementResolved || ownerSettlementRequired === 0} onClick={recordOwnerPayment}>{isRecordingOwnerPayment ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <BanknoteIcon className="mr-1.5 h-4 w-4" />}Record Owner Payment</Button></div></div>}
                {reconciliation.overage > 0 && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"><p className="font-black">Cash Overage</p><p className="mt-1">{currency} {reconciliation.overage.toLocaleString()} is recorded separately and is not added to sales.</p></div>}
              </div>
            </section>

            <section className={`${isQuickClosing ? 'hidden' : ''} overflow-hidden rounded-2xl border border-emerald-200 bg-background shadow-sm`}>
              <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50 px-3 py-3 sm:px-4"><div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /><h2 className="text-xs font-black uppercase tracking-wide text-emerald-950">Operating Result</h2></div><Money key={`money-operating-${operatingResult}`} currency={currency} value={operatingResult} signed className={`text-sm font-black ${operatingResult >= 0 ? 'text-emerald-700' : 'text-red-700'}`} /></div>
              <div className="space-y-2 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3 rounded-lg bg-blue-50 px-3 py-2 text-xs"><span className="font-semibold text-blue-900">Sales</span><Money key={`money-total-${totalSales}`} currency={currency} value={totalSales} className="font-bold text-blue-700" /></div>
                <div className="flex items-center justify-between gap-3 rounded-lg bg-orange-50 px-3 py-2 text-xs"><span className="font-semibold text-orange-900">Purchases</span><Money key={`money-purchases-${approvedPurchasesTotal}`} currency={currency} value={approvedPurchasesTotal} className="font-bold text-orange-700" /></div>
                <div className="flex items-center justify-between gap-3 rounded-lg bg-sky-50 px-3 py-2 text-xs"><span className="font-semibold text-sky-900">Fixed Expense Today</span><Money key={`money-fixed-expenses-${fixedExpensesToday}`} currency={currency} value={fixedExpensesToday} className="font-bold text-sky-700" /></div><div className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2 text-xs"><span className="font-semibold text-rose-900">Variable Expenses</span><Money key={`money-variable-expenses-${variableExpensesToday}`} currency={currency} value={variableExpensesToday} className="font-bold text-rose-700" /></div><div className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2 text-xs"><span className="font-semibold text-rose-900">Total Daily Expenses</span><Money key={`money-total-daily-expenses-${totalDailyExpenses}`} currency={currency} value={totalDailyExpenses} className="font-bold text-rose-700" /></div>
                <div className={`flex items-center justify-between gap-3 rounded-xl border-2 px-3 py-3 text-xs ${operatingResult >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}><span className="font-black uppercase tracking-wide text-foreground">Operating Result</span><Money key={`money-operating-${operatingResult}`} currency={currency} value={operatingResult} signed className={`text-lg font-black ${operatingResult >= 0 ? 'text-emerald-700' : 'text-red-700'}`} /></div>
                <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">Automatically calculated as Daily Sales − Purchases − Fixed Expense Today − Variable Expenses. Funding never changes this result.</p>
              </div>
            </section>
          </div>

          <section className={`${summaryVisibilityClass} overflow-hidden rounded-2xl border border-slate-200 bg-background shadow-sm`}>
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-3 sm:px-4"><h2 className="text-xs font-black uppercase tracking-wide text-slate-900">Daily Closing Summary</h2></div>
            <div className="p-3 sm:p-4">
              <div className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Daily Sales</span><Money key={`money-total-${totalSales}`} currency={currency} value={totalSales} className="font-bold text-foreground" /></div>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Cash Sales</span><Money key={`money-summary-cash-sales-${cashSales}`} currency={currency} value={cashSales} className="font-bold text-emerald-700" /></div>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Card / Non-Cash</span><Money key={`money-summary-non-cash-${networkTotal}`} currency={currency} value={networkTotal} className="font-bold text-violet-700" /></div>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Purchases</span><Money key={`money-purchases-${approvedPurchasesTotal}`} currency={currency} value={approvedPurchasesTotal} className="font-bold text-foreground" /></div>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Fixed Expense Today</span><Money key={`money-fixed-expenses-${fixedExpensesToday}`} currency={currency} value={fixedExpensesToday} className="font-bold text-foreground" /></div><div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Variable Expenses</span><Money key={`money-variable-expenses-${variableExpensesToday}`} currency={currency} value={variableExpensesToday} className="font-bold text-foreground" /></div><div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Total Daily Expenses</span><Money key={`money-total-daily-expenses-${totalDailyExpenses}`} currency={currency} value={totalDailyExpenses} className="font-bold text-foreground" /></div>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Customer Credit</span><Money key={`money-credit-${creditTotal}`} currency={currency} value={creditTotal} className="font-bold text-foreground" /></div>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Expected Cash</span><Money key={`money-expected-${expectedCash}`} currency={currency} value={expectedCash} className="font-bold text-foreground" /></div>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Actual Cash</span>{actualCount === null ? <span className="font-bold text-muted-foreground">—</span> : <Money key={`money-actual-${actualCount}`} currency={currency} value={actualCount} className="font-bold text-foreground" />}</div>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Shortage / Overage</span>{cashDifference === null ? <span className="font-bold text-muted-foreground">—</span> : <Money key={`money-difference-${cashDifference}`} currency={currency} value={cashDifference} signed className={`font-bold ${cashDifference === 0 ? 'text-emerald-700' : 'text-red-700'}`} />}</div>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Required Funding</span><Money key={`money-summary-funding-${reconciliation.requiredFunding}`} currency={currency} value={reconciliation.requiredFunding} className="font-bold text-red-700" /></div><div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Branch Wallet Applied</span><Money key={`money-summary-wallet-applied-${branchWalletApplied}`} currency={currency} value={branchWalletApplied} className="font-bold text-blue-700" /></div><div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Owner Payment Required</span><Money key={`money-summary-owner-settlement-${ownerSettlementRequired}`} currency={currency} value={ownerSettlementRequired} className="font-bold text-red-700" /></div>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="font-bold text-foreground">Operating Result</span><Money key={`money-operating-${operatingResult}`} currency={currency} value={operatingResult} signed className={`font-black ${operatingResult >= 0 ? 'text-emerald-700' : 'text-red-700'}`} /></div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${useAutomaticSales ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{useAutomaticSales ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}<span>Sales {useAutomaticSales ? 'loaded from ERP' : 'source needs review'}</span></div>
                <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${purchasesLoading || cashLedgerLoading ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{purchasesLoading || cashLedgerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}<span>Purchases and expenses loaded</span></div>
                <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${creditTotal >= 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}><CheckCircle2 className="h-4 w-4" /><span>Customer credit loaded</span></div>
                <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${actualCount !== null && (remainingDifference === 0 || managerApproved) ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{actualCount !== null && (remainingDifference === 0 || managerApproved) ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}<span>{actualCount === null ? 'Actual cash is required' : remainingDifference === 0 ? 'Cash balanced' : 'Cash difference requires review'}</span></div>
              </div>
              {inlineErrors.duplicate && <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p className="text-xs font-bold">{inlineErrors.duplicate}</p></div>}
              {!allValid && <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" /><p className="text-xs font-bold text-red-800">{validations.filter(v => !v.passed).map(v => v.label).join(', ')}</p></div>}
            </div>
          </section>
        </div>
      </div>

      <div className="border-t border-border bg-background/95 px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-8px_20px_rgba(15,23,42,0.08)] backdrop-blur sm:px-4">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-2 sm:flex sm:justify-end">
          <Button type="button" variant="outline" className="min-h-12 font-bold sm:w-32" onClick={onCancel} disabled={isSubmitting}><X className="mr-1 h-4 w-4" />Cancel</Button>
          <><Button type="submit" variant="outline" className="min-h-12 font-bold sm:w-40" onClick={() => flushSync(() => setRequestedClosingState('draft'))} disabled={isSubmitting || purchasesLoading || cashLedgerLoading || autoSourceLoading || automaticClosingUnavailable || cashLedgerLoading || cashLedgerUnavailable}><Save className="mr-1.5 h-4 w-4" />Save Draft</Button><Button type="submit" className={`min-h-12 font-black sm:w-52 ${allValid ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-primary'}`} onClick={() => flushSync(() => setRequestedClosingState('finalized'))} disabled={isSubmitting || purchasesLoading || cashLedgerLoading || autoSourceLoading || automaticClosingUnavailable || cashLedgerLoading || cashLedgerUnavailable || !allValid}>{isSubmitting ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Saving…</> : <><Save className="mr-1.5 h-4 w-4" />Finalize Closing</>}</Button></>
        </div>
      </div>
      <SalesClosingFieldDialog editor={fieldEditor} onClose={() => setFieldEditor(null)} onSave={saveInlineClosingField} isSaving={isSavingClosingField} />
      <SalesSourceDialog editor={sourceEditor} onClose={() => setSourceEditor(null)} onSave={saveInlineSalesSource} isSaving={isSavingSalesSource} paymentMethods={configuredPaymentMethods} branches={branches} />
    </form>
  );
}
