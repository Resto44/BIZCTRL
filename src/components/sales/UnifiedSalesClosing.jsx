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
import React, { useState, useMemo, useEffect, useLayoutEffect, useCallback, memo } from 'react';
import { flushSync } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
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
import { buildSalesSourceClosingSnapshots, salesSourceTodayTotal } from '@/lib/salesSourceClosingLifecycle';
import { SalesClosingFieldDialog, SalesSourceDialog, newSalesClosingSource } from '@/components/sales/SalesClosingCustomizationDialogs';
import ClosingNumericInput from '@/components/sales/ClosingNumericInput';
import { closingErrorDetails } from '@/lib/closing/ClosingRepository';
import { customerCreditSnapshot, creditEntryRequiresCustomer } from '@/lib/closing/CustomerCreditCalculations';
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
const paymentBucketForCode = (value) => {
  const code = String(value || '').trim().toLowerCase();
  if (['cash', 'cash_on_delivery', 'cod'].includes(code)) return 'cash';
  if (['credit', 'customer_credit', 'on_account'].includes(code)) return 'credit';
  if (['card', 'network', 'pos', 'visa', 'mastercard', 'mada', 'digital'].includes(code)) return 'network';
  return 'other';
};

// A saved closing stores source entries as daily snapshots. When that closing is
// reopened, its aggregate cash field already includes any cash-classified source
// amounts. Reconstruct the snapshot bucket total from the saved record rather
// than current source configuration, which may have changed since the close.
const salesSourceAmountForBucket = (record, bucket) => parseSalesSourceEntries(record)
  .reduce((total, entry) => {
    if (entry?.included_in_revenue === false) return total;
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
// CUSTOMER CREDIT ENTRY
// ─────────────────────────────────────────────────────────────────────────────
function CustomerCreditEntry({ entry, idx, onRemove, onUpdate, customers, currency, canOverride, disabled = false }) {
  const selectedCustomer = customers.find((customer) => String(customer.id) === String(entry.customer_id));
  const customerName = selectedCustomer?.customer_name || selectedCustomer?.name || entry.customer_name_snapshot || entry.customer || '';
  const previousCredit = Number(selectedCustomer?.outstanding_balance ?? entry.previous_credit ?? entry.current_debt) || 0;
  const creditLimit = Number(selectedCustomer?.credit_limit ?? entry.credit_limit) || 0;
  const creditRenderVersion = `${entry.customer_id || 'unselected'}:${entry.today_credit ?? entry.amount ?? 0}`;
  const { todayCredit, availableCredit, newCreditBalance, remainingCreditLimit: remainingCredit, exceededBy, limitExceeded } = customerCreditSnapshot({
    previousCredit,
    creditLimit,
    todayCredit: entry.today_credit ?? entry.amount,
  });

  const selectCustomer = (customerId) => {
    const customer = customers.find((candidate) => String(candidate.id) === String(customerId));
    if (!customer) return;
    const name = customer.customer_name || customer.name || '';
    onUpdate(entry.id, {
      customer_id: customer.id,
      customer: name,
      customer_name_snapshot: name,
      customer_phone: customer.phone || '',
      previous_credit: Number(customer.outstanding_balance) || 0,
      current_debt: Number(customer.outstanding_balance) || 0,
      credit_limit: Number(customer.credit_limit) || 0,
      available_credit: Math.max(0, (Number(customer.credit_limit) || 0) - (Number(customer.outstanding_balance) || 0)),
      manager_override: false,
    });
  };

  return (
    <div className={`space-y-3 rounded-xl border p-3 transition-colors ${limitExceeded ? 'border-red-300 bg-red-50/50' : 'border-border bg-muted/20'}`} data-testid="customer-credit-entry">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-muted-foreground">Customer Credit #{idx + 1}</span>
        {!disabled && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => onRemove(entry.id)} aria-label={`Remove customer ${customerName || idx + 1}`}><Trash2 className="h-3.5 w-3.5" /></Button>}
      </div>

      <div>
        <Label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">Customer</Label>
        <Select value={entry.customer_id || ''} onValueChange={selectCustomer} disabled={disabled || !customers.length}>
          <SelectTrigger className="min-h-11 text-sm" aria-label={`Select customer for credit entry ${idx + 1}`}><SelectValue placeholder={customers.length ? 'Select Customer' : 'No active customers available'} /></SelectTrigger>
          <SelectContent>{customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.customer_name || customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {entry.customer_id && (
        <>
          <div className="rounded-lg border border-border bg-background p-3 text-sm">
            <p className="font-bold text-foreground">{customerName}</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <CreditMetric label="Previous Credit" value={previousCredit} currency={currency} tone="text-red-600" />
              <CreditMetric label="Credit Limit" value={creditLimit} currency={currency} tone="text-blue-600" />
              <CreditMetric label="Available Credit" value={availableCredit} currency={currency} tone="text-emerald-600" />
            </div>
          </div>
          <NumInput id={`quick-closing-credit-${entry.id}`} label="Today Credit" value={entry.today_credit ?? entry.amount ?? ''} onChange={(value) => onUpdate(entry.id, 'today_credit', value)} prefix={currency} disabled={disabled} error={limitExceeded ? 'Credit limit exceeded.' : undefined} />
          <div key={`customer-credit-metrics-${creditRenderVersion}`} className="space-y-3" aria-live="polite">
            <div className={`grid grid-cols-1 gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2 ${limitExceeded ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
              <CreditMetric label="New Credit Balance" value={newCreditBalance} currency={currency} tone={limitExceeded ? 'text-red-700' : 'text-emerald-700'} />
              <CreditMetric label="Remaining Credit Limit" value={remainingCredit} currency={currency} tone={limitExceeded ? 'text-red-700' : 'text-emerald-700'} />
            </div>
            {limitExceeded && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-900"><p className="font-black">Credit limit exceeded.</p><div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1"><span>Credit Limit</span><span className="text-right font-bold">{currency} {creditLimit.toLocaleString()}</span><span>Previous Credit</span><span className="text-right font-bold">{currency} {previousCredit.toLocaleString()}</span><span>Available</span><span className="text-right font-bold">{currency} {availableCredit.toLocaleString()}</span><span>Requested Today</span><span className="text-right font-bold">{currency} {todayCredit.toLocaleString()}</span><span>Exceeded By</span><span className="text-right font-bold">{currency} {exceededBy.toLocaleString()}</span></div>{canOverride && !disabled && <label className="mt-3 flex min-h-11 items-center gap-2 border-t border-red-200 pt-3 font-bold"><input type="checkbox" checked={Boolean(entry.manager_override)} onChange={(event) => onUpdate(entry.id, 'manager_override', event.target.checked)} className="h-4 w-4 accent-red-600" />Authorized manager override</label>}</div>}
          </div>
        </>
      )}
    </div>
  );
}

function CreditMetric({ label, value, currency, tone }) {
  return <div><p className="text-[9px] font-bold uppercase text-muted-foreground">{label}</p><p className={`mt-0.5 font-black ${tone}`}>{currency}{'\u00A0'}{Number(value || 0).toLocaleString()}</p></div>;
}

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
export default function UnifiedSalesClosing({ initial, onSubmit, onCancel, onNewClosing, onRequestCorrection, onSessionContextChange, isOpeningNewClosing = false }) {
  const { currency, lang, t } = useLanguage();
  const { user } = useAuth();
  const { role } = useRole();
  const { ownerFilter, branches: tenantBranches, managerBranch, activeRestaurant, isManager } = useTenant();
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
  const automaticTotalsEnabled = closingConfig?.calculations?.automatic_totals !== false;
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
  const canManageCreditOverride = isManager || [ROLES.OWNER, ROLES.GENERAL_MANAGER].includes(role);
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
  const closingLifecycleState = initial?.closing_state || (initial?.id ? 'finalized' : 'draft');
  const isProtectedClosing = ['finalized', 'correction_requested', 'corrected', 'locked'].includes(closingLifecycleState);
  const [requestedClosingState, setRequestedClosingState] = useState(
    closingLifecycleState === 'finalized' ? 'finalized' : 'draft',
  );

  useEffect(() => {
    if (!canUseAdvancedClosing) setClosingView('quick');
  }, [canUseAdvancedClosing]);

  // ── Form meta state ───────────────────────────────────────────────────────
  const [form, setForm] = useState({
    date: initial?.date || format(new Date(), 'yyyy-MM-dd'),
    branch: initial?.branch || assignedManagerBranch?.key || assignedManagerBranch?.branch_key || managerBranch || branches.at(0)?.key || '',
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

  // Remember the last safe branch and shift for a new closing. Editing an
  // existing closing always preserves the record values instead.
  useEffect(() => {
    if (initial?.id || typeof window === 'undefined' || !branches.length) return;
    try {
      const stored = JSON.parse(window.localStorage.getItem('quick-sales-closing-preferences') || '{}');
      const matchingBranch = branches.find((branch) => branch.key === stored.branch || branch.branch_key === stored.branch);
      if (!matchingBranch) return;
      setForm((previous) => ({
        ...previous,
        branch: matchingBranch.key || matchingBranch.branch_key || previous.branch,
        branch_id: matchingBranch.id || previous.branch_id,
        shift: stored.shift === 'Evening' ? 'Evening' : previous.shift,
      }));
    } catch { /* local preference is optional */ }
  }, [branches, initial?.id]);

  useEffect(() => {
    if (initial?.id || typeof window === 'undefined' || !form.branch) return;
    window.localStorage.setItem('quick-sales-closing-preferences', JSON.stringify({ branch: form.branch, shift: form.shift }));
  }, [form.branch, form.shift, initial?.id]);

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

  // ── Credit entries ────────────────────────────────────────────────────────
  const parseCreditEntries = () => {
    if (initial?.credit_entries_json) {
      try {
        const raw = Array.isArray(initial.credit_entries_json) ? initial.credit_entries_json : JSON.parse(initial.credit_entries_json);
        const parsed = asRecordArray(raw);
        if (parsed.length) return parsed.map((entry) => ({
          ...entry,
          id: entry.client_row_id || newStableRowId('credit'),
          customer_id: entry.customer_id || '',
          customer: entry.customer_name_snapshot || entry.customer || '',
          customer_name_snapshot: entry.customer_name_snapshot || entry.customer || '',
          previous_credit: entry.previous_credit ?? entry.current_debt ?? 0,
          current_debt: entry.previous_credit ?? entry.current_debt ?? 0,
          credit_limit: entry.credit_limit_snapshot ?? entry.credit_limit ?? 0,
          amount: entry.today_credit ?? entry.amount ?? '',
          manager_override: Boolean(entry.manager_override),
        }));
      } catch { /* ignore malformed legacy draft entries */ }
    }
    return [];
  };
  const [creditEntries, setCreditEntries] = useState(parseCreditEntries);

  const addPos = () => setPosEntries(prev => [...prev, { id: Date.now(), device_id: '', device_name: '', amount: '', notes: '' }]);
  const removePos = (id) => setPosEntries(prev => prev.filter(e => e.id !== id));
  const updatePos = (id, field, value) => updateCalculatedInput(setPosEntries, prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  const removeCredit = (id) => setCreditEntries((previous) => previous.filter((entry) => entry.id !== id));
  const updateCredit = (id, fieldOrPatch, value) => updateCalculatedInput(setCreditEntries, (previous) => previous.map((entry) => {
    if (entry.id !== id) return entry;
    const next = typeof fieldOrPatch === 'object' ? { ...entry, ...fieldOrPatch } : { ...entry, [fieldOrPatch]: value };
    if (fieldOrPatch === 'today_credit') {
      const snapshot = customerCreditSnapshot({
        previousCredit: next.previous_credit ?? next.current_debt,
        creditLimit: next.credit_limit,
        todayCredit: value,
      });
      return {
        ...next,
        amount: value,
        today_credit: value,
        available_credit: snapshot.availableCredit,
        new_credit_balance: snapshot.newCreditBalance,
        remaining_credit_limit: snapshot.remainingCreditLimit,
      };
    }
    return next;
  }));

  // ── Dynamic Sales Sources ───────────────────────────────────────────────────────────────
  const { customSources: customSourcesData, isLoading: sourcesLoading } = useSalesSources({ branchId: selectedBranchId });
  const customSources = asRecordArray(customSourcesData);
  const historicalSourceAmounts = useMemo(() => asRecordArray(sourcePreviousBalanceRows)
    .reduce((balances, row) => {
      if (!row?.source_id) return balances;
      balances[row.source_id] = Math.max(0, Number(row.previous_amount) || 0);
      return balances;
    }, {}), [sourcePreviousBalanceRows]);
  // Amounts keyed by source.id
  const [customSourceAmounts, setCustomSourceAmounts] = useState(() => {
    const map = {};
    parseSalesSourceEntries(initial).forEach((entry) => {
      if (entry?.source_id) map[entry.source_id] = String(entry.amount ?? entry.today_amount ?? '');
    });
    return map;
  });
  const setCustomAmount = (sourceId, val) => updateCalculatedInput(setCustomSourceAmounts, prev => ({ ...prev, [sourceId]: val }));
  const customSourceSummaries = useMemo(() => customSources.map((source) => {
    const today = Math.max(0, Number(customSourceAmounts[source.id]) || 0);
    const previous = Math.max(0, Number(historicalSourceAmounts[source.id] ?? 0) || 0);
    return { source, sourceLabel: sourceNameForLanguage(source), today, previous, total: previous + today };
  }), [customSources, customSourceAmounts, historicalSourceAmounts, sourceNameForLanguage]);
  const customSourcePaymentTotals = useMemo(() =>
    customSourceSummaries.reduce((totals, { source, today }) => {
      if (source.included_in_revenue === false) return totals;
      totals[paymentBucketForCode(source.default_payment_method)] += today;
      return totals;
    }, { cash: 0, network: 0, credit: 0, other: 0 }),
    [customSourceSummaries]
  );
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

  // Rule 9: Auto-populate Opening Cash from previous shift's Closing Cash
  // BUG FIX: also support manager context (uses restaurant_id + branch, not created_by)
  useEffect(() => {
    if (!initial?.id && openingCash === '' && form.branch) {
      const canFetch = isManager ? !!activeRestaurant?.id : !!ownerFilter?.created_by;
      if (!canFetch) return;
      let q = supabase
        .from('daily_sales')
        .select('closing_cash, date, shift')
        .eq('branch', form.branch)
        .order('date', { ascending: false })
        .order('created_date', { ascending: false })
        .limit(1);
      if (isManager) {
        q = q.eq('restaurant_id', activeRestaurant.id);
      } else {
        q = q.eq('created_by', ownerFilter.created_by);
      }
      q.then((result = {}) => {
        const previousSale = firstRecord(result.data);
        setOpeningCash(previousSale?.closing_cash ?? 0);
      }).catch(() => setOpeningCash(0));
    }
  }, [ownerFilter?.created_by, form.branch, initial?.id, isManager, activeRestaurant?.id]);

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
  const { data: allCustomersData, isLoading: custLoading } = useQuery({
    queryKey: ['customers_form', activeRestaurant?.id, ownerFilter?.created_by, form.branch, selectedBranchId],
    queryFn: async () => {
      if (isManager && !activeRestaurant?.id) return [];
      if (!isManager && !ownerFilter?.created_by) return [];
      let query = supabase
        .from('customers')
        .select('id, name, customer_name:name, phone, branch, branch_id, credit_limit, outstanding_balance, is_active, restaurant_id')
        .eq('is_active', true);
      query = isManager
        ? query.eq('restaurant_id', activeRestaurant.id)
        : query.eq('created_by', ownerFilter.created_by);
      if (!isManager && activeRestaurant?.id) query = query.eq('restaurant_id', activeRestaurant.id);
      const { data, error } = await query.order('name');
      if (error) {
        console.error('[UnifiedSalesClosing] Customer fetch error:', error);
        return [];
      }
      return asRecordArray(data);
    },
    staleTime: 0, // Always fresh
    enabled: isManager ? !!activeRestaurant?.id && !!form.branch : !!ownerFilter?.created_by,
  });
  const allCustomers = asRecordArray(allCustomersData);

  // ── Filter customers by selected branch ──────────────────────────────────────
  const customers = useMemo(() =>
    isManager
      ? allCustomers.filter((customer) => matchesBranch(customer, form.branch, selectedBranchId))
      : (!form.branch || form.branch === 'all'
          ? allCustomers
          : allCustomers.filter((customer) => customer.branch === form.branch || customer.branch_id === form.branch)),
    [allCustomers, form.branch, isManager, selectedBranchId]
  );
  const addCredit = () => setCreditEntries((previous) => [...previous, {
    id: newStableRowId('credit'),
    client_row_id: newStableRowId('credit-client'),
    customer_id: '',
    customer: '',
    customer_name_snapshot: '',
    customer_phone: '',
    previous_credit: 0,
    current_debt: 0,
    credit_limit: 0,
    available_credit: 0,
    amount: '',
    manager_override: false,
    notes: '',
  }]);

  // ── Approved Purchases ────────────────────────────────────────────────────
  // BUG FIX: Approved purchases query must work for both Owner (created_by) and
  // Manager (restaurant_id + branch). When isManager, scope by restaurant_id and branch.
  const purchasesEnabled = !!activeRestaurant?.id && !!form.date && !!form.branch;

  const { data: approvedPurchasesForDateData, isLoading: purchasesLoading } = useQuery({
    queryKey: ['approved_purchases_for_date', ownerFilter?.created_by, form.date, activeRestaurant?.id, form.branch],
    queryFn: async () => {
      if (!activeRestaurant?.id || !form.date || !form.branch) return [];
      let q = supabase
        .from('supplier_invoices')
        .select('id, total_amount, paid_amount, approval_status, date, supplier_name, branch')
        .eq('restaurant_id', activeRestaurant.id)
        .eq('date', form.date)
        .in('approval_status', ['approved', 'auto_approved'])
        .limit(100);
      if (form.branch !== 'all') q = q.eq('branch', form.branch);
      const { data, error } = await q;
      if (error) return [];
      return asRecordArray(data);
    },
    staleTime: 15000,
    enabled: purchasesEnabled,
  });
  const approvedPurchasesForDate = asRecordArray(approvedPurchasesForDateData);

  // Pending purchases (not approved)
  const { data: pendingPurchasesData, isLoading: pendingLoading } = useQuery({
    queryKey: ['pending_purchases_for_date', ownerFilter?.created_by, form.date, activeRestaurant?.id, form.branch],
    queryFn: async () => {
      if (!activeRestaurant?.id || !form.date || !form.branch) return [];
      let q = supabase
        .from('supplier_invoices')
        .select('id, total_amount, approval_status, date, supplier_name')
        .eq('restaurant_id', activeRestaurant.id)
        .eq('date', form.date)
        .in('approval_status', ['pending'])
        .limit(50);
      if (form.branch !== 'all') q = q.eq('branch', form.branch);
      const { data, error } = await q;
      if (error) return [];
      return asRecordArray(data);
    },
    staleTime: 15000,
    enabled: purchasesEnabled,
  });
  const pendingPurchases = asRecordArray(pendingPurchasesData);

  // ── Recorded expenses for the selected restaurant, branch and closing date ──
  const expensesEnabled = !!activeRestaurant?.id && !!form.date;
  const { data: expensesForDateData, isLoading: expensesLoading } = useQuery({
    queryKey: ['closing_expenses_for_date', activeRestaurant?.id, form.date, form.branch, selectedBranchId],
    queryFn: async () => {
      if (!activeRestaurant?.id || !form.date) return [];
      const baseQuery = () => supabase
        .from('expenses')
        .select('id, amount, date, branch_id, branch_key, status, description')
        .eq('restaurant_id', activeRestaurant.id)
        .eq('date', form.date)
        .limit(500);
      if (!form.branch || form.branch === 'all') {
        const { data, error } = await baseQuery();
        if (error) throw error;
        return asRecordArray(data);
      }
      const [canonical, legacy] = await Promise.all([
        selectedBranchId ? baseQuery().eq('branch_id', selectedBranchId) : Promise.resolve({ data: [], error: null }),
        baseQuery().is('branch_id', null).eq('branch_key', form.branch),
      ]);
      if (canonical.error || legacy.error) throw canonical.error || legacy.error;
      return asRecordArray(Array.from(new Map([...(canonical.data || []), ...(legacy.data || [])]
        .map((record) => [record.id, record])).values()));
    },
    staleTime: 30000,
    enabled: expensesEnabled,
  });
  const expensesForDate = asRecordArray(expensesForDateData);

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
      const settlementBase = () => supabase.from('daily_cash_settlements')
        .select('id, opening_cash, cash_sales, expected_closing_cash, cash_counted, status, branch, branch_id, created_date')
        .eq('restaurant_id', activeRestaurant.id)
        .eq('date', form.date)
        .limit(10);
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
      const settlementQueries = allowAllBranches
        ? [settlementBase()]
        : [
            selectedBranchId ? settlementBase().eq('branch_id', selectedBranchId) : Promise.resolve({ data: [], error: null }),
            settlementBase().is('branch_id', null).eq('branch', form.branch),
          ];
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
      const [settlementResults, paymentResults, posResults, creditResults] = await Promise.all([
        Promise.all(settlementQueries),
        Promise.all(scoped('payments', 'id, amount, payment_method, status, created_date, branch, branch_id', 'created_date')),
        Promise.all(posQueries),
        Promise.all(creditQueries),
      ]);
      const queryError = [settlementResults, paymentResults, posResults, creditResults]
        .flat()
        .find((result) => result?.error)?.error;
      if (queryError) throw queryError;
      const merge = (...results) => asRecordArray(Array.from(new Map(results.flatMap((result) => asRecordArray(result?.data)).map((record) => [record.id, record])).values()));
      return {
        settlements: merge(...settlementResults),
        payments: merge(...paymentResults),
        pos: merge(...posResults),
        credit: merge(...creditResults),
      };
    },
  });
  const automaticClosing = useMemo(() => {
    if (initial?.id) return { cash: 0, network: 0, credit: 0, other: 0, expectedCash: null, openingCash: null, hasData: false, paymentCount: 0 };
    const source = automaticClosingData || {};
    const settlement = firstRecord(source.settlements);
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
    const posExpected = asRecordArray(source.pos).reduce((total, row) => total + (Number(row.expected_amount ?? row.actual_amount) || 0), 0);
    const recordedCredit = asRecordArray(source.credit).reduce((total, row) => total + (Number(row.total_amount) || 0), 0);
    const settlementCash = Number(settlement?.cash_sales) || 0;
    const expectedCash = settlement?.expected_closing_cash == null ? null : Number(settlement.expected_closing_cash) || 0;
    const openingCashValue = settlement?.opening_cash == null ? null : Number(settlement.opening_cash) || 0;
    return {
      cash: paymentTotals.cash > 0 ? paymentTotals.cash : settlementCash,
      network: paymentTotals.network > 0 ? paymentTotals.network : posExpected,
      credit: paymentTotals.credit > 0 ? paymentTotals.credit : recordedCredit,
      other: paymentTotals.other,
      expectedCash,
      openingCash: openingCashValue,
      hasData: Boolean(settlement || asRecordArray(source.payments).length || asRecordArray(source.pos).length || asRecordArray(source.credit).length),
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

  // ── Closing calculations sourced from the selected ERP scope ──────────────
  const manualCashSales = Math.max(0, Number(cashSalesInput) || 0);
  const manualNetworkTotal = asRecordArray(posEntries).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const manualCreditTotal = asRecordArray(creditEntries).reduce((sum, entry) => sum + (Number(entry.today_credit ?? entry.amount) || 0), 0);
  const baseCashSales = useAutomaticSales ? automaticClosingSnapshot.cash : manualCashSales;
  const baseNetworkTotal = useAutomaticSales ? automaticClosingSnapshot.network : manualNetworkTotal;
  // Customer Credit rows are entered directly against Customer Master and must
  // always contribute their Today amount to the Closing, even when unrelated
  // automatic ERP payments are present for the same business session.
  const baseCreditTotal = (useAutomaticSales ? automaticClosingSnapshot.credit : 0) + manualCreditTotal;
  const baseOtherPaymentTotal = useAutomaticSales ? automaticClosingSnapshot.other : 0;
  const cashSales = baseCashSales + customSourcePaymentTotals.cash;
  const networkTotal = baseNetworkTotal + customSourcePaymentTotals.network;
  const creditTotal = baseCreditTotal + customSourcePaymentTotals.credit;
  const otherPaymentTotal = baseOtherPaymentTotal + customSourcePaymentTotals.other;
  const totalSales = cashSales + networkTotal + creditTotal + otherPaymentTotal;

  useEffect(() => {
    if (!initial?.id && automaticClosingSnapshot.openingCash !== null) setOpeningCash(String(automaticClosingSnapshot.openingCash));
  }, [automaticClosingSnapshot.openingCash, initial?.id]);

  const opening = Number(openingCash) || 0;
  const actualCount = actualCashCount !== '' ? Number(actualCashCount) : null;
  const ownerContrib = Number(ownerContributionInput) || 0;
  const expectedCashBase = useAutomaticSales && automaticClosingSnapshot.expectedCash !== null
    ? automaticClosingSnapshot.expectedCash
    : opening + baseCashSales;
  // Automatic settlement expected cash does not include newly entered configured
  // source amounts, so add only the cash-classified source contribution once.
  const expectedCash = expectedCashBase + customSourcePaymentTotals.cash;
  const cashDifference = actualCount !== null ? actualCount - expectedCash : null;
  const cashReconcStatus = cashDifference === null ? null : cashDifference === 0 ? 'Balanced' : cashDifference < 0 ? 'Shortage' : 'Overage';
  const closingCash = actualCount !== null ? actualCount + ownerContrib : opening;
  const remainingDifference = actualCount !== null ? closingCash - expectedCash : null;

  const approvedPurchasesTotal = approvedPurchasesForDate.reduce((sum, purchase) => sum + (Number(purchase.total_amount) || 0), 0);
  const expensesTotal = expensesForDate.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  const operatingResult = totalSales - approvedPurchasesTotal - expensesTotal;

  // Validation checks
  const validations = useMemo(() => [
    {
      key: 'erpData',
      label: 'ERP Sales Data Available',
      passed: !automaticClosingUnavailable,
      message: automaticClosingUnavailable ? 'Retry required' : (useAutomaticSales ? 'Loaded' : 'No posted sales'),
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
      label: 'Credit Totals Valid',
      passed: creditEntries.every((entry) => Number(entry.today_credit ?? entry.amount) <= 0 || Boolean(entry.customer_id)),
      message: `${currency}\u00A0${manualCreditTotal.toLocaleString()} today`,
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
      passed: !creditEntries.some((entry) => {
        const limit = Number(entry.credit_limit) || 0;
        const previous = Number(entry.previous_credit ?? entry.current_debt) || 0;
        const amount = Number(entry.today_credit ?? entry.amount) || 0;
        return amount > Math.max(0, limit - previous) && !entry.manager_override;
      }),
      message: 'All within limits or explicitly overridden',
    },
    {
      key: 'cashBalance',
      label: 'Cash Reconciled',
      passed: !requiresCashReconciliation || (actualCount !== null && (remainingDifference === 0 || managerApproved)),
      message: !requiresCashReconciliation ? 'Optional by configuration' : actualCount === null ? 'Actual cash count required' : remainingDifference === 0 ? 'Balanced' : managerApproved ? 'Manager approved' : 'Needs approval',
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
  ], [form, automaticClosingUnavailable, useAutomaticSales, cashierDisplayName, approvedPurchasesForDate, posEntries, creditEntries, customClosingFields, customClosingFieldValues, hasCustomClosingFieldValue, cashSales, networkTotal, creditTotal, actualCount, remainingDifference, cashDifference, cashNotes, managerApproved, requiresCashReconciliation, currency]);

  const allValid = useMemo(() => validations.every(v => v.passed), [validations]);
  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isProtectedClosing) {
      onRequestCorrection?.();
      return;
    }
    const savingDraft = requestedClosingState === 'draft';

    const invalidCredit = creditEntries.find(creditEntryRequiresCustomer);
    const limitExceededEntry = creditEntries.find((entry) => {
      const limit = Number(entry.credit_limit) || 0;
      const previous = Number(entry.previous_credit ?? entry.current_debt) || 0;
      const amount = Number(entry.amount) || 0;
      return amount > Math.max(0, limit - previous) && !entry.manager_override;
    });
    const nextErrors = {};
    if (!form.date) nextErrors.date = 'Date is required.';
    if (!form.branch) nextErrors.branch = 'Branch is required.';
    if (!form.shift) nextErrors.shift = 'Shift is required.';
    if (!cashierDisplayName) nextErrors.cashier = 'Cashier is required.';
    if (!savingDraft && requiresCashReconciliation && actualCount === null) nextErrors.actualCash = 'Actual Cash is required.';
    if (!savingDraft && requiresCashReconciliation && remainingDifference !== 0 && remainingDifference !== null && !managerApproved) nextErrors.reconciliation = 'Cash difference must be reviewed before closing.';
    if (!savingDraft && requiresCashReconciliation && cashDifference !== null && cashDifference !== 0 && !cashNotes.trim()) nextErrors.cashNotes = 'A reconciliation note is required for a cash difference.';
    if (invalidCredit) nextErrors.credit = 'Select an active Customer Master customer for every Today Credit amount.';
    if (!savingDraft && limitExceededEntry) nextErrors.credit = `Credit limit exceeded for ${limitExceededEntry.customer_name_snapshot || limitExceededEntry.customer}. Correct the amount or perform an authorized manager override.`;
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
    const customerId = form.customer_id || creditEntries.find((entry) => entry.customer_id)?.customer_id || null;
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
      console.log('[UnifiedSalesClosing] Building payload...');
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
        restaurant_network: networkTotal,
        network: networkTotal,
        restaurant_network_account_id: posDeviceId || '',
        cashier_id: cashierId,
        customer_id: customerId,
        pos_device_id: posDeviceId,
        credit: creditTotal,
        pos_entries_json: JSON.stringify(posEntries.map(({ id, ...rest }) => rest)),
        credit_entries_json: creditEntries.map(({ id, ...rest }) => {
          const customer = customers.find((candidate) => String(candidate.id) === String(rest.customer_id));
          const previousCredit = Number(customer?.outstanding_balance ?? rest.previous_credit ?? rest.current_debt) || 0;
          const creditLimit = Number(customer?.credit_limit ?? rest.credit_limit) || 0;
          const todayCredit = Math.max(0, Number(rest.today_credit ?? rest.amount) || 0);
          return {
            ...rest,
            client_row_id: id,
            customer: customer?.customer_name || customer?.name || rest.customer_name_snapshot || rest.customer || '',
            customer_name_snapshot: customer?.customer_name || customer?.name || rest.customer_name_snapshot || rest.customer || '',
            previous_credit: previousCredit,
            credit_limit: creditLimit,
            available_credit: Math.max(0, creditLimit - previousCredit),
            today_credit: todayCredit,
            new_credit_balance: previousCredit + todayCredit,
            remaining_credit_limit: creditLimit - previousCredit - todayCredit,
            manager_override: Boolean(rest.manager_override),
          };
        }),
        // Dynamic Sales Sources — `amount` / `today_amount` are the only
        // revenue inputs. Previous and Total are immutable historical context
        // retained for History and never added to current-period accounting.
        // The RPC requires a JSON array. Sending a JSON-encoded string makes
        // Postgres see a scalar and reject the finalization payload.
        sales_sources_json: buildSalesSourceClosingSnapshots(customSourceSummaries, {
          branchId,
          branch: selectedBranch?.key || selectedBranch?.branch_key || form.branch,
          date: form.date,
          shift: form.shift,
          cashierId,
          cashierName: cashierDisplayName,
        }).map((snapshot) => ({
          ...snapshot,
          payment_bucket: paymentBucketForCode(snapshot.default_payment_method),
        })),
        custom_sources_total: otherPaymentTotal,
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
        // Preserve the exact calculation context for History. Existing records
        // remain untouched; these values are written only with future saves.
        expenses_total: expensesTotal,
        operating_result: operatingResult,

        restaurant_id: activeRestaurant?.id || null,
      };

      console.log('[UnifiedSalesClosing] Calling onSubmit(payload)...');
      const saved = await onSubmit(payload);
      setSavedClosing(saved || { id: initial?.id || null, status: 'saved' });
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

  // ── RENDER ────────────────────────────────────────────────────────────────
  // Requirement: Remove blocking success state.
  // Save returns immediately to Daily Sales via onSubmit callback.

  const showCustomizationCard = canCustomize || (isConfiguredClosingFieldShown('sales_sources') && customSources.length > 0) || customClosingFields.length > 0 || (isConfiguredClosingFieldShown('payment_methods') && configuredPaymentMethods.some((method) => method.is_active !== false));

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
        {isProtectedClosing && <div role="status" className="mx-3 mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm text-violet-900 sm:mx-4"><p className="font-bold">{closingLifecycleState === 'correction_requested' ? 'Correction requested' : 'Finalized Closing'}</p><p className="mt-1 text-xs">Historical financial values are protected. Review this Closing and submit an authorized correction request when a change is needed.</p></div>}
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
                if (fieldKey === 'branch') return <div key={fieldKey} id="quick-closing-branch" className={closingFieldVisibilityClass(fieldKey)}><Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</Label><BranchSelect value={form.branch} onChange={v => { set('branch', v); set('branch_id', ''); setCreditEntries([]); }} /></div>;
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

          <section className="overflow-hidden rounded-2xl border border-blue-200 bg-background shadow-sm" data-testid="customer-credit-card">
            <div className="flex flex-col gap-2 border-b border-blue-100 bg-blue-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <div className="min-w-0"><h2 className="text-xs font-black uppercase tracking-wide text-blue-950">Customer Credit</h2><p className="mt-0.5 text-[11px] text-blue-800">Select active customers from Customer Master. Previous balances are reference-only and never count as today&apos;s sales.</p></div>
              {!isProtectedClosing && <Button type="button" size="sm" className="min-h-10 shrink-0" onClick={addCredit} disabled={custLoading}><PlusCircle className="mr-1.5 h-4 w-4" />Add Customer</Button>}
            </div>
            <div className="space-y-3 p-3 sm:p-4">
              {custLoading ? <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-muted-foreground">Loading Customer Master…</div> : creditEntries.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-muted-foreground">No customer credit has been added to this Closing.</div> : <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{creditEntries.map((entry, index) => <CustomerCreditEntry key={entry.id} entry={entry} idx={index} onRemove={removeCredit} onUpdate={updateCredit} customers={customers} currency={currency} canOverride={canManageCreditOverride} disabled={isProtectedClosing} />)}</div>}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3"><span className="text-xs font-black uppercase tracking-wide text-blue-950">Customer Credit Today Total</span><Money key={`customer-credit-today-total-${manualCreditTotal}`} currency={currency} value={manualCreditTotal} className="text-lg font-black text-blue-700" /></div>
              {inlineErrors.credit && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-900">{inlineErrors.credit}</p>}
            </div>
          </section>

          {showCustomizationCard && (
            <section className="overflow-hidden rounded-2xl border border-blue-200 bg-background shadow-sm" data-i18n-skip="true">
              <div className="flex flex-col gap-2 border-b border-blue-100 bg-blue-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <div className="flex min-w-0 items-center gap-2"><PlusCircle className="h-4 w-4 shrink-0 text-blue-600" /><div><h2 className="truncate text-xs font-black uppercase tracking-wide text-blue-950">{salesClosingWorkspaceCopy.title}</h2><p className="text-[11px] text-blue-800">{salesClosingWorkspaceCopy.description}</p></div></div>
                <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="w-fit border-blue-200 bg-white text-[10px] text-blue-700">{salesClosingWorkspaceCopy.liveConfiguration}</Badge>{canCustomize && <><Button type="button" size="sm" variant="outline" className="min-h-10 border-blue-300 bg-white" onClick={() => setSourceEditor({ mode: 'create', source: newSalesClosingSource(customSources.length * 10 + 10) })}>+ {salesClosingWorkspaceCopy.addSource}</Button><Button type="button" size="sm" variant="outline" className="min-h-10 border-blue-300 bg-white" onClick={() => setFieldEditor({ mode: 'create', field: newSalesClosingCustomField(configuredClosingFields.length * 10 + 10) })}>+ {salesClosingWorkspaceCopy.addField}</Button><Button type="button" size="sm" className="min-h-10" onClick={() => navigate('/sales-closing-customization')}>{salesClosingWorkspaceCopy.customize}</Button></>}</div>
              </div>
              <div className="space-y-4 p-3 sm:p-4">
                {isConfiguredClosingFieldShown('sales_sources') && customSources.length > 0 && <div><div className="mb-2 flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-foreground">{salesSourceCopy.title}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{salesSourceCopy.todayIncluded}</p></div><div className="text-right"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">{salesSourceCopy.todayTotal}</p><Money currency={currency} value={customTotal} className="text-sm font-black text-blue-700" /></div></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{customSourceSummaries.map(({ source, sourceLabel, today, previous }) => <SalesSourceDailyHistoryCard key={source.id} source={source} sourceLabel={sourceLabel} todayInput={customSourceAmounts[source.id] ?? ''} today={today} previous={previous} currency={currency} onChange={(value) => setCustomAmount(source.id, value)} isHistoryLoading={sourceHistoryLoading} isHistoryUnavailable={sourceHistoryUnavailable} copy={salesSourceCopy} />)}</div></div>}
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
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3"><p className="text-[10px] font-bold uppercase text-amber-800">Expected Cash</p><Money key={`money-expected-${expectedCash}`} currency={currency} value={expectedCash} className="mt-1 text-lg font-black text-amber-800" /></div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-700">Opening Cash</p><Money key={`money-opening-${opening}`} currency={currency} value={opening} className="mt-1 text-lg font-black text-slate-800" /></div>
                </div>
                <div id="quick-closing-reconciliation">
                  <NumInput id="quick-closing-actualCash" label="Actual Cash" value={actualCashCount} onChange={(value) => { setInlineErrors((current) => ({ ...current, actualCash: undefined, reconciliation: undefined, cashNotes: undefined })); updateActualCashCount(value); }} prefix={currency} required helpText="Enter the physical count in the cash register" error={inlineErrors.actualCash || inlineErrors.reconciliation || inlineErrors.cashNotes} />
                </div>
                {cashDifference !== null && (
                  <div className={`rounded-xl border-2 p-3 ${cashDifference === 0 ? 'border-emerald-200 bg-emerald-50' : cashDifference < 0 ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                    <div className="flex items-center justify-between gap-3"><span className="text-xs font-black uppercase tracking-wide text-foreground">Difference</span><Money key={`money-difference-${cashDifference}`} currency={currency} value={cashDifference} signed className={`text-xl font-black ${cashDifference === 0 ? 'text-emerald-700' : cashDifference < 0 ? 'text-red-700' : 'text-amber-700'}`} /></div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{cashDifference === 0 ? 'Cash balanced.' : 'Review the difference and add a note before closing.'}</p>
                  </div>
                )}
                {cashDifference !== null && cashDifference !== 0 && (
                  <div className="space-y-2">
                    <Textarea id="quick-closing-cashNotes" value={cashNotes} onChange={e => { setCashNotes(e.target.value); setInlineErrors((current) => ({ ...current, cashNotes: undefined })); }} placeholder="Reconciliation note is required for a cash difference" className="min-h-20 resize-none text-sm" />
                    <Button type="button" size="sm" variant={managerApproved ? 'default' : 'outline'} className="min-h-11 w-full" onClick={() => setManagerApproved(!managerApproved)}><ShieldCheck className="mr-1.5 h-4 w-4" />{managerApproved ? 'Manager approval recorded' : 'Confirm manager review'}</Button>
                  </div>
                )}
              </div>
            </section>

            <section className={`${isQuickClosing ? 'hidden' : ''} overflow-hidden rounded-2xl border border-emerald-200 bg-background shadow-sm`}>
              <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50 px-3 py-3 sm:px-4"><div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /><h2 className="text-xs font-black uppercase tracking-wide text-emerald-950">Operating Result</h2></div><Money key={`money-operating-${operatingResult}`} currency={currency} value={operatingResult} signed className={`text-sm font-black ${operatingResult >= 0 ? 'text-emerald-700' : 'text-red-700'}`} /></div>
              <div className="space-y-2 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3 rounded-lg bg-blue-50 px-3 py-2 text-xs"><span className="font-semibold text-blue-900">Sales</span><Money key={`money-total-${totalSales}`} currency={currency} value={totalSales} className="font-bold text-blue-700" /></div>
                <div className="flex items-center justify-between gap-3 rounded-lg bg-orange-50 px-3 py-2 text-xs"><span className="font-semibold text-orange-900">Purchases</span><Money key={`money-purchases-${approvedPurchasesTotal}`} currency={currency} value={approvedPurchasesTotal} className="font-bold text-orange-700" /></div>
                <div className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2 text-xs"><span className="font-semibold text-rose-900">Expenses</span><Money key={`money-expenses-${expensesTotal}`} currency={currency} value={expensesTotal} className="font-bold text-rose-700" /></div>
                <div className={`flex items-center justify-between gap-3 rounded-xl border-2 px-3 py-3 text-xs ${operatingResult >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}><span className="font-black uppercase tracking-wide text-foreground">Operating Result</span><Money key={`money-operating-${operatingResult}`} currency={currency} value={operatingResult} signed className={`text-lg font-black ${operatingResult >= 0 ? 'text-emerald-700' : 'text-red-700'}`} /></div>
                <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">Automatically calculated as Total Sales − Purchases − Expenses.</p>
              </div>
            </section>
          </div>

          <section className={`${summaryVisibilityClass} overflow-hidden rounded-2xl border border-slate-200 bg-background shadow-sm`}>
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-3 sm:px-4"><h2 className="text-xs font-black uppercase tracking-wide text-slate-900">Daily Closing Summary</h2></div>
            <div className="p-3 sm:p-4">
              <div className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Sales</span><Money key={`money-total-${totalSales}`} currency={currency} value={totalSales} className="font-bold text-foreground" /></div>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Purchases</span><Money key={`money-purchases-${approvedPurchasesTotal}`} currency={currency} value={approvedPurchasesTotal} className="font-bold text-foreground" /></div>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Expenses</span><Money key={`money-expenses-${expensesTotal}`} currency={currency} value={expensesTotal} className="font-bold text-foreground" /></div>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Customer Credit</span><Money key={`money-credit-${creditTotal}`} currency={currency} value={creditTotal} className="font-bold text-foreground" /></div>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Expected Cash</span><Money key={`money-expected-${expectedCash}`} currency={currency} value={expectedCash} className="font-bold text-foreground" /></div>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Actual Cash</span>{actualCount === null ? <span className="font-bold text-muted-foreground">—</span> : <Money key={`money-actual-${actualCount}`} currency={currency} value={actualCount} className="font-bold text-foreground" />}</div>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="text-muted-foreground">Difference</span>{cashDifference === null ? <span className="font-bold text-muted-foreground">—</span> : <Money key={`money-difference-${cashDifference}`} currency={currency} value={cashDifference} signed className={`font-bold ${cashDifference === 0 ? 'text-emerald-700' : 'text-red-700'}`} />}</div>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2"><span className="font-bold text-foreground">Operating Result</span><Money key={`money-operating-${operatingResult}`} currency={currency} value={operatingResult} signed className={`font-black ${operatingResult >= 0 ? 'text-emerald-700' : 'text-red-700'}`} /></div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${useAutomaticSales ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{useAutomaticSales ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}<span>Sales {useAutomaticSales ? 'loaded from ERP' : 'source needs review'}</span></div>
                <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${purchasesLoading || expensesLoading ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{purchasesLoading || expensesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}<span>Purchases and expenses loaded</span></div>
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
          {isProtectedClosing ? <Button type="button" className="min-h-12 font-black sm:w-60 bg-violet-600 hover:bg-violet-700" onClick={() => onRequestCorrection?.()} disabled={isSubmitting || closingLifecycleState === 'correction_requested'}>{closingLifecycleState === 'correction_requested' ? 'Correction Requested' : 'Request Correction'}</Button> : <><Button type="submit" variant="outline" className="min-h-12 font-bold sm:w-40" onClick={() => flushSync(() => setRequestedClosingState('draft'))} disabled={isSubmitting || purchasesLoading || expensesLoading || autoSourceLoading || automaticClosingUnavailable}><Save className="mr-1.5 h-4 w-4" />Save Draft</Button><Button type="submit" className={`min-h-12 font-black sm:w-52 ${allValid ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-primary'}`} onClick={() => flushSync(() => setRequestedClosingState('finalized'))} disabled={isSubmitting || purchasesLoading || expensesLoading || autoSourceLoading || automaticClosingUnavailable || !allValid}>{isSubmitting ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Saving…</> : <><Save className="mr-1.5 h-4 w-4" />Finalize Closing</>}</Button></>}
        </div>
      </div>
      <SalesClosingFieldDialog editor={fieldEditor} onClose={() => setFieldEditor(null)} onSave={saveInlineClosingField} isSaving={isSavingClosingField} />
      <SalesSourceDialog editor={sourceEditor} onClose={() => setSourceEditor(null)} onSave={saveInlineSalesSource} isSaving={isSavingSalesSource} paymentMethods={configuredPaymentMethods} branches={branches} />
    </form>
  );
}
