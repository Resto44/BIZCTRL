/**
 * ERPSalesWorkspace — Enterprise ERP Sales Closing Workspace
 *
 * Architecture: 9-section full-workflow redesign.
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
import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfMonth, subDays } from 'date-fns';
import {
  Store, CreditCard, Trash2, Plus, Search,
  TrendingDown, TrendingUp, CheckCircle2, XCircle,
  AlertCircle, ShieldCheck, User, Info,
  Scale, Banknote, DollarSign, BarChart3,
  ShoppingCart, Users, Clock, Building2,
  Activity, Zap, Target, Package,
  AlertTriangle, CheckSquare, Database,
  ArrowUpRight, ArrowDownRight, Minus,
  ChevronDown, ChevronUp, Eye, EyeOff,
  Loader2, RefreshCw, Save, X,
} from 'lucide-react';
import BranchSelect from '@/components/shared/BranchSelect';
import { toast } from 'sonner';
import { useSalesSources } from '@/hooks/useSalesSources';
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
        {sectionNum && (
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold bg-white/70 border border-border/50 ${c.icon}`}>
            {sectionNum}
          </span>
        )}
        <Icon className={`h-4 w-4 shrink-0 ${c.icon}`} />
        <span className="min-w-0 truncate text-left text-xs font-bold uppercase tracking-wider text-foreground/80">{title}</span>
      </span>
      <span className="ml-2 flex shrink-0 items-center gap-1.5 sm:gap-2">
        {badge && <span className="max-w-[7.5rem] overflow-hidden text-ellipsis whitespace-nowrap sm:max-w-none">{badge}</span>}
        {collapsible && (
          collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />
        )}
      </span>
    </>
  );

  if (collapsible) {
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

const AccordionBody = memo(function AccordionBody({ open, children }) {
  return (
    <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'}`}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// NUMERIC INPUT — ERP style
// ─────────────────────────────────────────────────────────────────────────────
const NumInput = memo(function NumInput({ label, value, onChange, required, prefix, helpText, readOnly, error }) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block tracking-wide">{label}</Label>
      {helpText && <p className="text-[9px] text-muted-foreground mb-1 leading-tight">{helpText}</p>}
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-medium pointer-events-none">{prefix}</span>
        )}
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={value}
          onChange={e => onChange && onChange(e.target.value)}
          required={required}
          readOnly={readOnly}
          placeholder="0.00"
          className={`h-10 ${prefix ? 'pl-8' : ''} text-sm font-medium transition-colors
            ${readOnly ? 'bg-muted/50 cursor-default text-muted-foreground' : 'bg-background'}
            ${error ? 'border-destructive ring-1 ring-destructive/30' : ''}`}
        />
      </div>
      {error && <p className="text-[10px] text-destructive mt-1 font-medium">{error}</p>}
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
function CustomerCreditEntry({ entry, idx, onRemove, onUpdate, customers, currency }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers.slice(0, 20);
    const q = searchQuery.toLowerCase();
    return customers.filter(c =>
      (c.customer_name || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    ).slice(0, 20);
  }, [customers, searchQuery]);

  const selectedCustomer = customers.find(c => c.customer_name === entry.customer);
  const invoiceAmt = Number(entry.amount) || 0;
  const currentDebt = Number(entry.current_debt) || 0;
  const creditLimit = Number(entry.credit_limit) || 0;
  const newDebt = currentDebt + invoiceAmt;
  const availableCredit = Math.max(0, creditLimit - currentDebt);
  const remainingCredit = Math.max(0, creditLimit - newDebt);
  const limitExceeded = creditLimit > 0 && newDebt > creditLimit;
  const creditUsagePct = creditLimit > 0 ? (currentDebt / creditLimit) * 100 : 0;
  const creditScore = creditUsagePct > 80 ? 'Poor' : creditUsagePct > 50 ? 'Fair' : creditUsagePct > 20 ? 'Good' : 'Excellent';
  const creditScoreColor = { Poor: 'text-red-600', Fair: 'text-amber-600', Good: 'text-blue-600', Excellent: 'text-emerald-600' }[creditScore];

  return (
    <div className={`rounded-xl border p-3 space-y-3 transition-colors ${limitExceeded ? 'border-red-300 bg-red-50/50' : 'border-border bg-muted/20'}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground">Customer #{idx + 1}</span>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => onRemove(entry.id)}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Customer Search */}
      <div className="relative">
        <Label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">Customer</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={entry.customer || searchQuery}
            placeholder="Search by name or phone..."
            className="h-10 pl-8 text-sm"
            onChange={e => {
              setSearchQuery(e.target.value);
              if (entry.customer) {
                onUpdate(entry.id, 'customer', '');
                onUpdate(entry.id, 'customer_phone', '');
                onUpdate(entry.id, 'current_debt', 0);
                onUpdate(entry.id, 'credit_limit', 0);
              }
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          />
        </div>
        {showDropdown && filteredCustomers.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-xl shadow-xl max-h-52 overflow-y-auto">
            {filteredCustomers.map(c => (
              <button
                key={c.customer_name}
                type="button"
                className="w-full text-left px-3 py-2.5 hover:bg-muted/60 text-sm border-b border-border/50 last:border-0 transition-colors"
                onMouseDown={() => {
                  onUpdate(entry.id, 'customer', c.customer_name);
                  onUpdate(entry.id, 'customer_id', c.id);
                  onUpdate(entry.id, 'customer_phone', c.phone || '');
                  onUpdate(entry.id, 'current_debt', c.outstanding_balance || 0);
                  onUpdate(entry.id, 'credit_limit', c.credit_limit || 0);
                  setShowDropdown(false);
                  setSearchQuery('');
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{c.customer_name}</p>
                    {c.phone && <p className="text-[10px] text-muted-foreground">{c.phone}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-red-600">{currency}{Number(c.outstanding_balance || 0).toLocaleString()}</p>
                    <p className="text-[9px] text-muted-foreground uppercase">Debt</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Credit Intelligence Panel */}
      {entry.customer && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="bg-background rounded-lg p-2 border border-border">
            <p className="text-[9px] text-muted-foreground uppercase font-bold">Current Debt</p>
            <p className="text-sm font-bold text-red-600">{currency}{currentDebt.toLocaleString()}</p>
          </div>
          <div className="bg-background rounded-lg p-2 border border-border">
            <p className="text-[9px] text-muted-foreground uppercase font-bold">Credit Limit</p>
            <p className="text-sm font-bold text-blue-600">{currency}{creditLimit.toLocaleString()}</p>
          </div>
          <div className="bg-background rounded-lg p-2 border border-border">
            <p className="text-[9px] text-muted-foreground uppercase font-bold">Available Credit</p>
            <p className="text-sm font-bold text-emerald-600">{currency}{availableCredit.toLocaleString()}</p>
          </div>
          <div className="bg-background rounded-lg p-2 border border-border">
            <p className="text-[9px] text-muted-foreground uppercase font-bold">Credit Score</p>
            <p className={`text-sm font-bold ${creditScoreColor}`}>{creditScore}</p>
          </div>
        </div>
      )}

      <NumInput
        label="Invoice Amount"
        value={entry.amount}
        onChange={v => onUpdate(entry.id, 'amount', v)}
        prefix={currency}
        error={limitExceeded ? `Exceeds credit limit by ${currency}${(newDebt - creditLimit).toLocaleString()}` : undefined}
      />

      {entry.customer && invoiceAmt > 0 && (
        <div className={`rounded-lg p-2 border text-xs font-medium ${limitExceeded ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          <div className="flex justify-between">
            <span>Remaining Credit After Sale</span>
            <span className="font-bold">{currency}{remainingCredit.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STICKY SUMMARY BAR
// ─────────────────────────────────────────────────────────────────────────────
const StickySummary = memo(function StickySummary({ totalSales, operatingResult, cashStatus, currency, isSubmitting }) {
  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/95 shadow-sm backdrop-blur-sm">
      <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-2 sm:px-4">
        <div className="flex shrink-0 items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Live</span>
        </div>
        <div className="flex min-w-0 flex-wrap justify-end gap-x-3 gap-y-1 text-xs sm:gap-x-4">
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-muted-foreground">Revenue</span>
            <span className="font-black text-blue-700">{currency}{totalSales.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-muted-foreground">Result</span>
            <span className={`font-black ${operatingResult >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {operatingResult >= 0 ? '+' : ''}{currency}{operatingResult.toLocaleString()}
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
export default function ERPSalesWorkspace({ initial, onSubmit, onCancel }) {
  const { currency } = useLanguage();
  const { user } = useAuth();
  const { ownerFilter, branches: tenantBranches, managerBranch, activeRestaurant, isManager } = useTenant();
  const branches = asRecordArray(tenantBranches);
  const assignedManagerBranch = useMemo(() => {
    if (!isManager) return null;
    return branches.find((branch) =>
      branch.id === user?.branch_id ||
      branch.key === managerBranch ||
      branch.branch_key === managerBranch,
    ) || null;
  }, [branches, isManager, managerBranch, user?.branch_id]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Exclusive accordion state ──────────────────────────────────────────────
  // All cards begin compact. Keeping their bodies mounted prevents input state,
  // queries, and calculations from being lost when a Manager changes sections.
  const [activeSection, setActiveSection] = useState(null);
  const isSectionOpen = useCallback((key) => activeSection === key, [activeSection]);
  const toggleSection = useCallback((key) => {
    setActiveSection((current) => current === key ? null : key);
  }, []);

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
  const set = useCallback((field, value) => setForm(prev => ({ ...prev, [field]: value })), []);

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

  // ── Sales Revenue inputs ──────────────────────────────────────────────────
  const [cashSalesInput, setCashSalesInput] = useState(() => {
    const storedCash = initial?.restaurant_cash !== undefined
      ? Number(initial.restaurant_cash)
      : Number(initial?.cash);
    return Number.isFinite(storedCash) && storedCash ? String(storedCash) : '';
  });

  // ── Cash Reconciliation inputs ────────────────────────────────────────────
  const [openingCash, setOpeningCash] = useState(initial?.opening_cash ?? '');
  const [actualCashCount, setActualCashCount] = useState(() => {
    if (initial?.closing_cash == null) return '';
    return String(Number(initial.closing_cash) - Number(initial.owner_cash_injection || 0));
  });
  const [ownerContributionInput, setOwnerContributionInput] = useState(initial?.owner_cash_injection ?? '');
  const [cashNotes, setCashNotes] = useState(initial?.cash_notes || '');
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
        const parsed = asRecordArray(JSON.parse(initial.credit_entries_json));
        if (parsed.length) return parsed.map((e, i) => ({ ...e, id: Date.now() + i }));
      } catch { /* ignore */ }
    }
    return [];
  };
  const [creditEntries, setCreditEntries] = useState(parseCreditEntries);

  const addPos = () => setPosEntries(prev => [...prev, { id: Date.now(), device_id: '', device_name: '', amount: '', notes: '' }]);
  const removePos = (id) => setPosEntries(prev => prev.filter(e => e.id !== id));
  const updatePos = (id, field, value) => setPosEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  const removeCredit = (id) => setCreditEntries(prev => prev.filter(e => e.id !== id));
  const updateCredit = (id, field, value) => setCreditEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));

  // ── Dynamic Sales Sources ───────────────────────────────────────────────────────────────
  const { customSources: customSourcesData, isLoading: sourcesLoading } = useSalesSources({ branchKey: form.branch });
  const customSources = asRecordArray(customSourcesData);
  // Amounts keyed by source.id
  const [customSourceAmounts, setCustomSourceAmounts] = useState(() => {
    if (initial?.sales_sources_json) {
      try {
        const parsed = asRecordArray(JSON.parse(initial.sales_sources_json));
        const map = {};
        parsed.forEach(e => { map[e.source_id] = String(e.amount || ''); });
        return map;
      } catch { /* ignore */ }
    }
    return {};
  });
  const setCustomAmount = (sourceId, val) => setCustomSourceAmounts(prev => ({ ...prev, [sourceId]: val }));
  const customTotal = useMemo(() =>
    customSources.reduce((s, src) => s + (Number(customSourceAmounts[src.id]) || 0), 0),
    [customSources, customSourceAmounts]
  );
  const sectionNumbers = useMemo(() => {
    const hasCustomSources = customSources.length > 0;
    return {
      shift: '1',
      summary: '2',
      pos: '3',
      credit: '4',
      custom: '5',
      purchases: String(hasCustomSources ? 6 : 5),
      reconciliation: String(hasCustomSources ? 7 : 6),
      operating: String(hasCustomSources ? 8 : 7),
      validation: String(hasCustomSources ? 9 : 8),
      save: String(hasCustomSources ? 10 : 9),
    };
  }, [customSources.length]);

  // ── Employees ─────────────────────────────────────────────────────────────
  const { data: employeesData, isLoading: empLoading } = useQuery({
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
    const candidates = !isManager || !user?.id
      ? employees
      : employees.some((employee) => employee.id === user.id)
        ? employees
        : [{ id: user.id, full_name: user.full_name || user.email || 'Branch Manager' }, ...employees];
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
  const cashierDisplayName = form.cashier_name || selectedCashier?.full_name || '';

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

    // A Branch Manager may be assigned automatically. Owners retain manual choice
    // when multiple cashiers exist, while a sole available cashier is unambiguous.
    if (!isManager && cashiers.length !== 1) return;
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
        console.error('[ERPSalesWorkspace] Customer fetch error:', error);
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
  const defaultCustomer = useMemo(() =>
    customers.find((customer) => /walk[ -]?in|default/i.test(customer.customer_name || customer.name || '')) || firstRecord(customers),
    [customers]
  );

  useEffect(() => {
    if (initial?.id || !isManager || form.customer_id || !defaultCustomer?.id) return;
    setForm((previous) => ({ ...previous, customer_id: defaultCustomer.id }));
    setCreditEntries((previous) => previous.length > 0 ? previous : [{
      id: Date.now(),
      customer: defaultCustomer.customer_name,
      customer_id: defaultCustomer.id,
      customer_phone: defaultCustomer.phone || '',
      current_debt: defaultCustomer.outstanding_balance || 0,
      credit_limit: defaultCustomer.credit_limit || 0,
      amount: '',
      notes: '',
    }]);
  }, [defaultCustomer, form.customer_id, initial?.id, isManager]);

  const addCredit = () => setCreditEntries((previous) => [...previous, {
    id: Date.now(),
    customer: isManager ? defaultCustomer?.customer_name || '' : '',
    customer_id: isManager ? defaultCustomer?.id || '' : '',
    customer_phone: isManager ? defaultCustomer?.phone || '' : '',
    current_debt: isManager ? defaultCustomer?.outstanding_balance || 0 : 0,
    credit_limit: isManager ? defaultCustomer?.credit_limit || 0 : 0,
    amount: '',
    notes: '',
  }]);

  // ── Approved Purchases ────────────────────────────────────────────────────
  // BUG FIX: Approved purchases query must work for both Owner (created_by) and
  // Manager (restaurant_id + branch). When isManager, scope by restaurant_id and branch.
  const purchasesEnabled = isManager
    ? !!activeRestaurant?.id && !!form.date
    : !!ownerFilter?.created_by && !!form.date;

  const { data: approvedPurchasesForDateData, isLoading: purchasesLoading } = useQuery({
    queryKey: ['approved_purchases_for_date', ownerFilter?.created_by, form.date, activeRestaurant?.id, form.branch],
    queryFn: async () => {
      if (!form.date) return [];
      let q = supabase
        .from('supplier_invoices')
        .select('id, total_amount, approval_status, date, supplier_name, branch')
        .eq('date', form.date)
        .in('approval_status', ['approved', 'auto_approved'])
        .limit(100);
      if (isManager) {
        q = q.eq('restaurant_id', activeRestaurant.id);
        if (form.branch && form.branch !== 'all') q = q.eq('branch', form.branch);
      } else {
        if (!ownerFilter?.created_by) return [];
        q = q.eq('created_by', ownerFilter.created_by);
      }
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
      if (!form.date) return [];
      let q = supabase
        .from('supplier_invoices')
        .select('id, total_amount, approval_status, date, supplier_name')
        .eq('date', form.date)
        .in('approval_status', ['pending'])
        .limit(50);
      if (isManager) {
        q = q.eq('restaurant_id', activeRestaurant.id);
        if (form.branch && form.branch !== 'all') q = q.eq('branch', form.branch);
      } else {
        if (!ownerFilter?.created_by) return [];
        q = q.eq('created_by', ownerFilter.created_by);
      }
      const { data, error } = await q;
      if (error) return [];
      return asRecordArray(data);
    },
    staleTime: 15000,
    enabled: purchasesEnabled,
  });
  const pendingPurchases = asRecordArray(pendingPurchasesData);

  // ── Real daily_sales for Live Sales Summary ─────────────────────────────────
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const monthStartStr = format(startOfMonth(new Date()), 'yyyy-MM-dd');

  // BUG FIX: Live Sales Summary queries must work for both Owner (created_by) and
  // Manager (branch-scoped). When isManager, use branch filter; otherwise use created_by.
  const liveSalesEnabled = isManager ? !!activeRestaurant?.id && !!form.branch : !!ownerFilter?.created_by;

  // Today's real sales from daily_sales (all branches or selected branch)
  const { data: realTodaySalesData, isLoading: realTodayLoading } = useQuery({
    queryKey: ['sales_today_live', ownerFilter?.created_by, todayStr, form.branch, activeRestaurant?.id],
    queryFn: async () => {
      let q = supabase
        .from('daily_sales')
        .select('restaurant_cash, restaurant_network, credit, cash, network, branch, sales_sources_json, custom_sources_total')
        .eq('date', todayStr)
        .limit(50);
      if (isManager) {
        q = q.eq('restaurant_id', activeRestaurant.id);
        if (form.branch && form.branch !== 'all') q = q.eq('branch', form.branch);
      } else {
        if (!ownerFilter?.created_by) return [];
        q = q.eq('created_by', ownerFilter.created_by);
        if (form.branch && form.branch !== 'all') q = q.eq('branch', form.branch);
      }
      const { data, error } = await q;
      if (error) return [];
      return asRecordArray(data);
    },
    staleTime: 10000,
    enabled: liveSalesEnabled,
  });
  const realTodaySales = asRecordArray(realTodaySalesData);

  // Yesterday's real sales from daily_sales
  const { data: realYesterdaySalesData } = useQuery({
    queryKey: ['sales_yesterday_live', ownerFilter?.created_by, yesterdayStr, form.branch, activeRestaurant?.id],
    queryFn: async () => {
      let q = supabase
        .from('daily_sales')
        .select('restaurant_cash, restaurant_network, credit, cash, network, branch, sales_sources_json, custom_sources_total')
        .eq('date', yesterdayStr)
        .limit(50);
      if (isManager) {
        q = q.eq('restaurant_id', activeRestaurant.id);
        if (form.branch && form.branch !== 'all') q = q.eq('branch', form.branch);
      } else {
        if (!ownerFilter?.created_by) return [];
        q = q.eq('created_by', ownerFilter.created_by);
        if (form.branch && form.branch !== 'all') q = q.eq('branch', form.branch);
      }
      const { data, error } = await q;
      if (error) return [];
      return asRecordArray(data);
    },
    staleTime: 60000,
    enabled: liveSalesEnabled,
  });
  const realYesterdaySales = asRecordArray(realYesterdaySalesData);

  // Month-to-date real sales from daily_sales
  const { data: realMonthSalesData } = useQuery({
    queryKey: ['sales_month_live', ownerFilter?.created_by, monthStartStr, form.branch, activeRestaurant?.id],
    queryFn: async () => {
      let q = supabase
        .from('daily_sales')
        .select('restaurant_cash, restaurant_network, credit, cash, network, branch, sales_sources_json, custom_sources_total')
        .gte('date', monthStartStr)
        .limit(500);
      if (isManager) {
        q = q.eq('restaurant_id', activeRestaurant.id);
        if (form.branch && form.branch !== 'all') q = q.eq('branch', form.branch);
      } else {
        if (!ownerFilter?.created_by) return [];
        q = q.eq('created_by', ownerFilter.created_by);
        if (form.branch && form.branch !== 'all') q = q.eq('branch', form.branch);
      }
      const { data, error } = await q;
      if (error) return [];
      return asRecordArray(data);
    },
    staleTime: 30000,
    enabled: liveSalesEnabled,
  });
  const realMonthSales = asRecordArray(realMonthSalesData);

  // Yesterday's sales for growth comparison (legacy — kept for growthVsYesterday calc)
  const { data: yesterdaySalesData } = useQuery({
    queryKey: ['yesterday_sales', ownerFilter?.created_by, form.date, form.branch, activeRestaurant?.id],
    queryFn: async () => {
      if (!form.date) return [];
      const yesterday = new Date(form.date);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = format(yesterday, 'yyyy-MM-dd');
      let q = supabase
        .from('daily_sales')
        .select('restaurant_cash, restaurant_network, credit, cash, network, branch')
        .eq('date', yStr)
        .limit(20);
      if (isManager) {
        q = q.eq('restaurant_id', activeRestaurant.id);
        if (form.branch && form.branch !== 'all') q = q.eq('branch', form.branch);
      } else {
        if (!ownerFilter?.created_by) return [];
        q = q.eq('created_by', ownerFilter.created_by);
      }
      const { data, error } = await q;
      if (error) return [];
      return asRecordArray(data);
    },
    staleTime: 60000,
    enabled: isManager ? !!activeRestaurant?.id && !!form.date : !!ownerFilter?.created_by && !!form.date,
  });
  const yesterdaySales = asRecordArray(yesterdaySalesData);

  // ── Daily Sales calculations (RULE-COMPLIANT — DO NOT MODIFY) ─────────────
  // Driver Sales is maintained independently in Driver Management. Daily Sales
  // records contain only counter cash, POS/network, customer credit, and other sources.
  const counterCashSales = useMemo(() => Math.max(0, Number(cashSalesInput) || 0), [cashSalesInput]);
  const cashSales = counterCashSales;
  const counterNetworkTotal = useMemo(() => asRecordArray(posEntries).reduce((s, e) => s + (Number(e.amount) || 0), 0), [posEntries]);
  const networkTotal = counterNetworkTotal;
  const customerCreditTotal = useMemo(() => asRecordArray(creditEntries).reduce((s, e) => s + (Number(e.amount) || 0), 0), [creditEntries]);
  const creditTotal = customerCreditTotal;
  const totalSales = useMemo(() => cashSales + networkTotal + creditTotal + customTotal, [cashSales, networkTotal, creditTotal, customTotal]);

  const opening      = useMemo(() => Number(openingCash) || 0, [openingCash]);
  const actualCount  = useMemo(() => actualCashCount !== '' ? Number(actualCashCount) : null, [actualCashCount]);
  const ownerContrib = useMemo(() => Number(ownerContributionInput) || 0, [ownerContributionInput]);

  // Rule 3: Expected Cash = Opening Cash + Cash Sales
  const expectedCash = useMemo(() => opening + cashSales, [opening, cashSales]);

  // Rule 4: Cash Difference = Actual Cash - Expected Cash
  const cashDifference = useMemo(() => actualCount !== null ? actualCount - expectedCash : null, [actualCount, expectedCash]);

  const cashReconcStatus = useMemo(() => {
    if (cashDifference === null) return null;
    if (cashDifference === 0) return 'Balanced';
    return cashDifference < 0 ? 'Shortage' : 'Overage';
  }, [cashDifference]);

  // Rule 10: Closing Cash = Actual Cash + Owner Capital Contribution
  const closingCash = useMemo(() => actualCount !== null ? (actualCount + ownerContrib) : opening, [actualCount, ownerContrib, opening]);

  // Rule 12: Remaining Difference = Closing Cash - Expected Cash
  const remainingDifference = useMemo(() => actualCount !== null ? (closingCash - expectedCash) : null, [closingCash, expectedCash, actualCount]);

  const cashShortageAmount = useMemo(() => cashDifference !== null ? Math.max(0, -cashDifference) : 0, [cashDifference]);
  const cashOverageAmount  = useMemo(() => cashDifference !== null ? Math.max(0, cashDifference) : 0, [cashDifference]);

  const differencePercentage = useMemo(() => {
    if (expectedCash === 0 || cashDifference === null) return null;
    return (Math.abs(cashDifference) / expectedCash) * 100;
  }, [cashDifference, expectedCash]);

  const riskLevel = useMemo(() => {
    if (differencePercentage === null) return null;
    if (differencePercentage > 10) return 'High';
    if (differencePercentage > 5) return 'Medium';
    return 'Low';
  }, [differencePercentage]);

  // Rule 8: Operating Result = Total Sales - Approved Purchases
  const approvedPurchasesTotal = useMemo(() => approvedPurchasesForDate.reduce((s, p) => s + (Number(p.total_amount) || 0), 0), [approvedPurchasesForDate]);
  const operatingResult = useMemo(() => totalSales - approvedPurchasesTotal, [totalSales, approvedPurchasesTotal]);
  const operatingMarginPct = useMemo(() => totalSales > 0 ? (operatingResult / totalSales) * 100 : 0, [operatingResult, totalSales]);
  const purchasesOwnerContrib = useMemo(() => Math.max(0, approvedPurchasesTotal - totalSales), [approvedPurchasesTotal, totalSales]);

  // Net cash = closing cash - opening cash
  const netCash = useMemo(() => closingCash - opening, [closingCash, opening]);

  // Unique suppliers
  const uniqueSuppliers = useMemo(() => {
    const names = approvedPurchasesForDate.map(p => p.supplier_name).filter(Boolean);
    return [...new Set(names)].length;
  }, [approvedPurchasesForDate]);

  const largestPurchase = useMemo(() => {
    if (!approvedPurchasesForDate.length) return 0;
    return Math.max(...approvedPurchasesForDate.map(p => Number(p.total_amount) || 0));
  }, [approvedPurchasesForDate]);

  // Yesterday's total for growth calc
  const yesterdayTotal = useMemo(() => {
    const branchSales = form.branch !== 'all'
      ? yesterdaySales.filter(s => s.branch === form.branch)
      : yesterdaySales;
    return branchSales.reduce((s, sale) => {
      const cash = Number(sale.restaurant_cash) || Number(sale.cash) || 0;
      const net  = Number(sale.restaurant_network) || Number(sale.network) || 0;
      const cred = Number(sale.credit) || 0;
      return s + cash + net + cred;
    }, 0);
  }, [yesterdaySales, form.branch]);

  const growthVsYesterday = useMemo(() => {
    if (yesterdayTotal === 0 || totalSales === 0) return null;
    return ((totalSales - yesterdayTotal) / yesterdayTotal) * 100;
  }, [totalSales, yesterdayTotal]);

  // ── Real daily_sales aggregation for Live Sales Summary ─────────────────────
  // Helper: sum a field across an array of daily_sales records
  const sumField = (arr, field1, field2) =>
    asRecordArray(arr).reduce((s, r) => s + (Number(r[field1]) || (field2 ? Number(r[field2]) : 0) || 0), 0);

  // Helper: sum custom sources from sales_sources_json + custom_sources_total fallback
  const sumCustom = (arr) =>
    asRecordArray(arr).reduce((s, r) => {
      if (r.sales_sources_json) {
        try {
          const entries = asRecordArray(JSON.parse(r.sales_sources_json));
          return s + entries.reduce((cs, e) => cs + (Number(e.amount) || 0), 0);
        } catch { /* ignore */ }
      }
      return s + (Number(r.custom_sources_total) || 0);
    }, 0);

  const realSummary = useMemo(() => {
    // TODAY
    const todayCash    = sumField(realTodaySales, 'restaurant_cash', 'cash');
    const todayNetwork = sumField(realTodaySales, 'restaurant_network', 'network');
    const todayCredit  = sumField(realTodaySales, 'credit');
    const todayCustom  = sumCustom(realTodaySales);
    const todayTotal   = todayCash + todayNetwork + todayCredit + todayCustom;

    // YESTERDAY
    const yesterdayRealCash    = sumField(realYesterdaySales, 'restaurant_cash', 'cash');
    const yesterdayRealNetwork = sumField(realYesterdaySales, 'restaurant_network', 'network');
    const yesterdayRealCredit  = sumField(realYesterdaySales, 'credit');
    const yesterdayRealCustom  = sumCustom(realYesterdaySales);
    const yesterdayRealTotal   = yesterdayRealCash + yesterdayRealNetwork + yesterdayRealCredit + yesterdayRealCustom;

    // MONTH-TO-DATE
    const monthCash    = sumField(realMonthSales, 'restaurant_cash', 'cash');
    const monthNetwork = sumField(realMonthSales, 'restaurant_network', 'network');
    const monthCredit  = sumField(realMonthSales, 'credit');
    const monthCustom  = sumCustom(realMonthSales);
    const monthTotal   = monthCash + monthNetwork + monthCredit + monthCustom;

    return {
      todayCash, todayNetwork, todayCredit, todayCustom, todayTotal,
      yesterdayRealTotal,
      monthTotal,
    };
  }, [realTodaySales, realYesterdaySales, realMonthSales]);

  // Average ticket (rough estimate: total / estimated transactions)
  const avgTicket = useMemo(() => {
    const txCount = creditEntries.filter(e => Number(e.amount) > 0).length + (cashSales > 0 ? 1 : 0) + posEntries.filter(e => Number(e.amount) > 0).length;
    return txCount > 0 ? totalSales / txCount : 0;
  }, [totalSales, creditEntries, cashSales, posEntries]);

  // Validation checks
  const validations = useMemo(() => [
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
      message: `${currency}${networkTotal.toLocaleString()}`,
    },
    {
      key: 'credit',
      label: 'Credit Totals Valid',
      passed: creditEntries.every(e => !e.customer || (Number(e.amount) >= 0 && e.customer)),
      message: `${currency}${creditTotal.toLocaleString()}`,
    },
    {
      key: 'cash',
      label: 'Cash Totals Valid',
      passed: cashSales >= 0,
      message: `${currency}${cashSales.toLocaleString()}`,
    },
    {
      key: 'creditLimit',
      label: 'Credit Limits Not Exceeded',
      passed: !creditEntries.some(e => {
        const limit = Number(e.credit_limit) || 0;
        const debt = Number(e.current_debt) || 0;
        const amt = Number(e.amount) || 0;
        return limit > 0 && (debt + amt) > limit;
      }),
      message: 'All within limits',
    },
    {
      key: 'cashBalance',
      label: 'Cash Reconciled',
      passed: actualCount !== null && (remainingDifference === 0 || managerApproved),
      message: actualCount === null ? 'Actual cash count required' : remainingDifference === 0 ? 'Balanced' : managerApproved ? 'Manager approved' : 'Needs approval',
    },
    {
      key: 'requiredFields',
      label: 'Required Fields Complete',
      passed: !!form.date && !!form.branch,
      message: form.date || 'Date required',
    },
  ], [form, cashierDisplayName, approvedPurchasesForDate, posEntries, creditEntries, cashSales, networkTotal, creditTotal, actualCount, remainingDifference, managerApproved, currency]);

  const allValid = useMemo(() => validations.every(v => v.passed), [validations]);
  const passedCount = useMemo(() => validations.filter(v => v.passed).length, [validations]);

  // Records that will be created
  const recordsToCreate = useMemo(() => {
    const records = [
      { key: 'daily_sales', label: 'Daily Sales Record', icon: BarChart3, always: true },
      { key: 'cash_reconciliation', label: 'Cash Reconciliation', icon: Scale, always: true },
      { key: 'network_sales', label: 'Network / POS Sales', icon: CreditCard, condition: networkTotal > 0 },
      { key: 'customer_credit', label: 'Customer Credit Entries', icon: User, condition: creditTotal > 0 },
      { key: 'treasury', label: 'Treasury Transactions', icon: Banknote, always: true },
      { key: 'owner_contribution', label: 'Owner Contribution', icon: ShieldCheck, condition: ownerContrib > 0 || purchasesOwnerContrib > 0 },
      { key: 'wallet_transaction', label: 'Wallet Transactions', icon: Activity, always: true },
    ];
    return records.filter(r => r.always || r.condition);
  }, [networkTotal, creditTotal, ownerContrib, purchasesOwnerContrib]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!approvedPurchasesForDate.length) {
      toast.warning("No approved purchases found for this date. Proceeding without purchase data.");
    }

    if (actualCount === null) {
      toast.error('Actual cash count is required before closing the shift.');
      return;
    }

    if (remainingDifference !== 0 && remainingDifference !== null && !managerApproved) {
      toast.error("Cash difference must be balanced or manager approval must be provided.");
      return;
    }

    const invalidCredit = creditEntries.find(en => Number(en.amount) > 0 && !en.customer);
    if (invalidCredit) {
      toast.error('Please select a customer for all credit entries.');
      return;
    }

    const limitExceededEntry = creditEntries.find(en => {
      const limit = Number(en.credit_limit) || 0;
      const debt = Number(en.current_debt) || 0;
      const amt = Number(en.amount) || 0;
      return limit > 0 && (debt + amt) > limit;
    });
    if (limitExceededEntry) {
      toast.error(`Credit limit exceeded for customer: ${limitExceededEntry.customer}`);
      return;
    }

    const selectedBranch = branches.find((branch) =>
      branch.id === form.branch_id ||
      branch.key === form.branch ||
      branch.branch_key === form.branch,
    );
    const branchId = selectedBranch?.id || selectedBranchId || null;
    const cashierId = form.cashier_id || form.cashier_employee_id || user?.id || null;
    const customerId = form.customer_id || creditEntries.find((entry) => entry.customer_id)?.customer_id || defaultCustomer?.id || null;
    const posDeviceId = form.pos_device_id || posEntries.find((entry) => entry.device_id)?.device_id || null;
    const createdBy = user?.email || ownerFilter?.created_by || '';
    const tenantId = activeRestaurant?.id || user?.organization_id || user?.restaurant_id || '';

    console.log('[ERPSalesWorkspace] handleSubmit started');
    console.log('[ERPSalesWorkspace] isManager:', isManager);
    console.log('[ERPSalesWorkspace] cashierId:', cashierId);
    console.log('[ERPSalesWorkspace] customerId:', customerId);
    console.log('[ERPSalesWorkspace] posDeviceId:', posDeviceId);
    console.log('[ERPSalesWorkspace] activeRestaurant:', activeRestaurant?.id);
    console.log('[ERPSalesWorkspace] branchId:', branchId);
    console.log('[ERPSalesWorkspace] createdBy:', createdBy);

    if (!activeRestaurant?.id || !branchId || !createdBy) {
      console.log('[ERPSalesWorkspace] FAILED: Missing core IDs');
      toast.error('An active business, branch, and authenticated user are required to close sales.');
      return;
    }

    if (isManager && (custLoading || posLoading)) {
      console.log('[ERPSalesWorkspace] FAILED: Data still loading');
      toast.error('Required data is still loading, please wait...');
      return;
    }

    // Cashier is always required for all roles
    if (!cashierId) {
      console.log('[ERPSalesWorkspace] FAILED: No cashier ID');
      toast.error('A cashier must be assigned to close sales.');
      return;
    }

    // Note: customerId and posDeviceId are allowed to be null if none exist in the branch.
    // The DB should handle nulls or use its own defaults.
    console.log('[ERPSalesWorkspace] Proceeding with save...');

    setIsSubmitting(true);
    try {
      console.log('[ERPSalesWorkspace] Building payload...');
      const payload = {
        date: form.date,
        branch: selectedBranch?.key || selectedBranch?.branch_key || form.branch,
        shift: form.shift,
        cashier_name: cashierDisplayName,
        cashier_employee_id: form.cashier_employee_id,
        sales_notes: form.sales_notes,
        branch_id: branchId,
        // `tenant_id` carries the active organization scope on legacy sales tables.
        tenant_id: tenantId,
        // `created_by` is the authenticated user mapping required by downstream RLS checks.
        created_by: createdBy,
        restaurant_cash: cashSales,
        cash: cashSales,
        restaurant_network: networkTotal,
        network: networkTotal,
        restaurant_network_account_id: posDeviceId || '',
        cashier_id: cashierId,
        customer_id: customerId,
        pos_device_id: posDeviceId,
        credit: creditTotal,
        pos_entries_json: JSON.stringify(posEntries.map(({ id, ...rest }) => rest)),
        credit_entries_json: JSON.stringify(creditEntries.map(({ id, ...rest }) => rest)),
        // Dynamic Sales Sources — full snapshot for reporting
        sales_sources_json: JSON.stringify(
          customSources
            .filter(src => Number(customSourceAmounts[src.id]) > 0)
            .map(src => ({
              source_id: src.id,
              source_key: src.system_key || src.id,
              name_en: src.name_en,
              name_ar: src.name_ar,
              amount: Number(customSourceAmounts[src.id]) || 0,
              included_in_revenue: src.included_in_revenue,
            }))
        ),
        custom_sources_total: customTotal,

        opening_cash: opening,
        // The live schema stores the actual count plus any owner injection as closing_cash.
        closing_cash: closingCash,
        cash_difference: cashDifference ?? 0,
        cash_status: cashReconcStatus || 'Balanced',
        cash_notes: cashNotes || '',
        owner_cash_injection: ownerContrib,
        manager_approval: managerApproved,
        manager_approved_by: managerApproved ? (user?.email || '') : '',

        approved_purchases_total: approvedPurchasesTotal,

        restaurant_id: activeRestaurant?.id || null,
      };

      console.log('[ERPSalesWorkspace] Calling onSubmit(payload)...');
      await onSubmit(payload);
      console.log('[ERPSalesWorkspace] onSubmit(payload) SUCCESS');

    } catch (err) {
      toast.error(`Save failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  // Requirement: Remove blocking success state.
  // Save returns immediately to Daily Sales via onSubmit callback.

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 min-w-0 flex-col">
      {/* Sticky Summary */}
      <StickySummary
        totalSales={totalSales}
        operatingResult={operatingResult}
        cashStatus={cashReconcStatus}
        currency={currency}
        isSubmitting={isSubmitting}
      />

      <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-3 p-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:space-y-4 sm:p-4 sm:pb-6">

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 1 — SHIFT INFORMATION
          ═══════════════════════════════════════════════════════════════ */}
          <div className={`rounded-2xl border-2 ${SECTION_COLORS.shift.border} overflow-hidden bg-background shadow-sm`}>
            <SectionHeader
              icon={Building2}
              title="Shift Information"
              color="shift"
              sectionNum={sectionNumbers.shift}
              collapsible
              collapsed={!isSectionOpen('shift')}
              onToggle={() => toggleSection('shift')}
              badge={
                <Badge variant="outline" className="text-[10px] font-bold">
                  {form.date} · {form.shift}
                </Badge>
              }
            />
            <AccordionBody open={isSectionOpen('shift')}>
              <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">Date</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={e => set('date', e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">Branch</Label>
                  <BranchSelect value={form.branch} onChange={v => {
                    set('branch', v);
                    set('branch_id', '');
                    // Clear credit entries when branch changes (to avoid showing customers from previous branch)
                    setCreditEntries([]);
                  }} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">Shift</Label>
                  <Select value={form.shift} onValueChange={v => set('shift', v)}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Morning">Morning</SelectItem>
                      <SelectItem value="Evening">Evening</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">
                    Cashier
                    {empLoading && <Loader2 className="w-3 h-3 inline ml-1 animate-spin" />}
                  </Label>
                  {empLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select
                      value={form.cashier_employee_id || form.cashier_id || ''}
                      onValueChange={id => {
                        const employee = cashiers.find((cashier) => cashier.id === id);
                        if (employee) setForm((previous) => ({
                          ...previous,
                          cashier_employee_id: id,
                          cashier_id: id,
                          cashier_name: employee.full_name,
                        }));
                      }}
                    >
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder="Select cashier..." />
                      </SelectTrigger>
                      <SelectContent>
                        {cashiers.map((cashier) => (
                          <SelectItem key={cashier.id} value={cashier.id}>{cashier.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              {/* Shift status indicators */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">Shift Open</span>
                </div>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${form.cashier_name ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                  <User className={`w-3 h-3 ${form.cashier_name ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <span className={`text-[10px] font-bold uppercase ${form.cashier_name ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {cashierDisplayName || 'No Cashier'}
                  </span>
                </div>
              </div>
              </div>
            </AccordionBody>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 2 — LIVE SALES SUMMARY (Real daily_sales data)
          ═══════════════════════════════════════════════════════════════ */}
          <div className={`rounded-2xl border-2 ${SECTION_COLORS.kpi.border} overflow-hidden bg-background shadow-sm`}>
            <SectionHeader
              icon={BarChart3}
              title="Live Sales Summary"
              color="kpi"
              sectionNum={sectionNumbers.summary}
              collapsible
              collapsed={!isSectionOpen('summary')}
              onToggle={() => toggleSection('summary')}
              badge={
                <Badge className="bg-indigo-600 text-white text-[10px] font-bold">
                  {currency}{realSummary.todayTotal.toLocaleString()}
                </Badge>
              }
            />
            <AccordionBody open={isSectionOpen('summary')}>
            {realTodayLoading ? (
              <div className="p-4 grid grid-cols-2 gap-3">
                {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {/* ── TODAY ───────────────────────────────────────────────────────────────────────────────────── */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Today</span>
                    <span className="text-[10px] text-muted-foreground">{todayStr}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <KPICard label="Cash Sales"       value={`${currency}${realSummary.todayCash.toLocaleString()}`}    icon={Banknote}    colorClass="text-emerald-600" bgClass="bg-emerald-100" sublabel="Counter cash" />
                    <KPICard label="POS / Network"    value={`${currency}${realSummary.todayNetwork.toLocaleString()}`} icon={CreditCard}  colorClass="text-violet-600" bgClass="bg-violet-100" sublabel="POS & digital" />
                    <KPICard label="Customer Credit"  value={`${currency}${realSummary.todayCredit.toLocaleString()}`}  icon={User}        colorClass="text-blue-600"   bgClass="bg-blue-100"   sublabel="Credit sales" />
                    {realSummary.todayCustom > 0 && (
                      <KPICard label="Custom Sources"  value={`${currency}${realSummary.todayCustom.toLocaleString()}`}  icon={Star}        colorClass="text-amber-600"  bgClass="bg-amber-100"  sublabel="Other sources" />
                    )}
                    <KPICard label="Total Revenue"    value={`${currency}${realSummary.todayTotal.toLocaleString()}`}   icon={DollarSign}  colorClass="text-indigo-600" bgClass="bg-indigo-100" sublabel={realSummary.todayCustom > 0 ? 'Cash+POS+Credit+Custom' : 'Cash+POS+Credit'} />
                  </div>
                </div>

                {/* ── YESTERDAY ─────────────────────────────────────────────────────────────────────────────────── */}
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Yesterday</span>
                    <span className="text-[10px] text-muted-foreground">{yesterdayStr}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-foreground">{currency}{realSummary.yesterdayRealTotal.toLocaleString()}</span>
                    {realSummary.yesterdayRealTotal > 0 && realSummary.todayTotal > 0 && (
                      <span className={`text-xs font-bold ${
                        realSummary.todayTotal >= realSummary.yesterdayRealTotal ? 'text-emerald-600' : 'text-red-500'
                      }`}>
                        {realSummary.todayTotal >= realSummary.yesterdayRealTotal ? '+' : ''}
                        {(((realSummary.todayTotal - realSummary.yesterdayRealTotal) / realSummary.yesterdayRealTotal) * 100).toFixed(1)}% vs today
                      </span>
                    )}
                  </div>
                </div>

                {/* ── MONTH ──────────────────────────────────────────────────────────────────────────────────────── */}
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Month Running Total</span>
                    <span className="text-[10px] text-muted-foreground">{monthStartStr} → today</span>
                  </div>
                  <span className="text-lg font-black text-indigo-700">{currency}{realSummary.monthTotal.toLocaleString()}</span>
                </div>
              </div>
            )}
            </AccordionBody>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 4 — POS SALES
          ═══════════════════════════════════════════════════════════════ */}
          <div className={`rounded-2xl border-2 ${SECTION_COLORS.pos.border} overflow-hidden bg-background shadow-sm`}>
            <SectionHeader
              icon={CreditCard}
              title="POS Sales"
              color="pos"
              sectionNum={sectionNumbers.pos}
              collapsible
              collapsed={!isSectionOpen('pos')}
              onToggle={() => toggleSection('pos')}
              badge={
                <Badge variant="outline" className="text-violet-700 border-violet-300 text-[10px] font-bold">
                  {currency}{networkTotal.toLocaleString()}
                </Badge>
              }
            />
            <AccordionBody open={isSectionOpen('pos')}>
            <div className="p-4 space-y-3">
              {posLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <>
                  {posEntries.map((entry, idx) => (
                    <div key={entry.id} className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">POS Device #{idx + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:bg-destructive/10"
                          onClick={() => removePos(entry.id)}
                          disabled={posEntries.length === 1}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <Label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">POS Device</Label>
                          <Select
                            value={entry.device_id || '__manual__'}
                            onValueChange={v => {
                              if (v === '__manual__') {
                                updatePos(entry.id, 'device_id', '');
                                updatePos(entry.id, 'device_name', 'Manual Entry');
                                updatePos(entry.id, 'provider', '');
                                set('pos_device_id', '');
                              } else {
                                const d = posDevices.find(pd => pd.id === v);
                                updatePos(entry.id, 'device_id', v);
                                updatePos(entry.id, 'device_name', d?.account_name || d?.device_name || '');
                                updatePos(entry.id, 'provider', d?.provider || d?.account_type || '');
                                set('pos_device_id', v);
                              }
                            }}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="Select device..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__manual__">Manual Entry</SelectItem>
                              {posDevices.map(d => (
                                <SelectItem key={d.id} value={d.id}>
                                  {d.account_name || d.device_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">Provider</Label>
                          <Input
                            value={entry.provider || ''}
                            onChange={e => updatePos(entry.id, 'provider', e.target.value)}
                            placeholder="e.g. Visa, Mastercard"
                            className="h-9 text-xs"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <NumInput
                          label="Amount"
                          value={entry.amount}
                          onChange={v => updatePos(entry.id, 'amount', v)}
                          prefix={currency}
                        />
                        <div>
                          <Label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">Reference #</Label>
                          <Input
                            value={entry.reference || ''}
                            onChange={e => updatePos(entry.id, 'reference', e.target.value)}
                            placeholder="Ref number"
                            className="h-10 text-xs"
                          />
                        </div>
                      </div>
                      {/* Status indicators */}
                      <div className="flex gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                          {Number(entry.amount) > 0 ? 'Settlement Pending' : 'No Amount'}
                        </span>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full h-9 border-dashed border-violet-300 text-violet-700 hover:bg-violet-50"
                    onClick={addPos}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Add POS Device
                  </Button>
                </>
              )}
            </div>
            </AccordionBody>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 4 — CUSTOMER CREDIT
          ═══════════════════════════════════════════════════════════════ */}
          <div className={`rounded-2xl border-2 ${SECTION_COLORS.credit.border} overflow-hidden bg-background shadow-sm`}>
            <SectionHeader
              icon={User}
              title="Customer Credit"
              color="credit"
              sectionNum={sectionNumbers.credit}
              collapsible
              collapsed={!isSectionOpen('credit')}
              onToggle={() => toggleSection('credit')}
              badge={
                <Badge variant="outline" className="text-blue-700 border-blue-300 text-[10px] font-bold">
                  {currency}{creditTotal.toLocaleString()}
                </Badge>
              }
            />
            <AccordionBody open={isSectionOpen('credit')}>
            <div className="p-4 space-y-3">
              {custLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                <>
                  {creditEntries.map((entry, idx) => (
                    <CustomerCreditEntry
                      key={entry.id}
                      entry={entry}
                      idx={idx}
                      onRemove={removeCredit}
                      onUpdate={updateCredit}
                      customers={customers}
                      currency={currency}
                    />
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full h-9 border-dashed border-blue-300 text-blue-700 hover:bg-blue-50"
                    onClick={addCredit}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Credit Customer
                  </Button>
                </>
              )}
            </div>
            </AccordionBody>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 4.5 — CUSTOM SALES SOURCES (Dynamic)
          ═══════════════════════════════════════════════════════════════ */}
          {!sourcesLoading && customSources.length > 0 && (
            <div className="rounded-2xl border-2 border-teal-200 overflow-hidden bg-background shadow-sm">
              <SectionHeader
                icon={ZapIcon}
                title="Additional Sales Sources"
                color="custom"
                sectionNum={sectionNumbers.custom}
                collapsible
                collapsed={!isSectionOpen('custom')}
                onToggle={() => toggleSection('custom')}
                badge={<Badge variant="outline" className="text-teal-700 border-teal-300 text-[10px] font-bold">{currency}{customTotal.toLocaleString()}</Badge>}
              />
              <AccordionBody open={isSectionOpen('custom')}>
              <div className="p-4 space-y-3">
                {customSources.map(src => {
                  const SrcIcon = getSourceIcon(src.icon);
                  return (
                    <div key={src.id} className="rounded-xl border border-border bg-muted/20 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center bg-${src.color || 'slate'}-100`}>
                          <SrcIcon className={`w-4 h-4 text-${src.color || 'slate'}-600`} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">{src.name_en}</p>
                          {src.name_ar && <p className="text-[10px] text-muted-foreground" dir="rtl">{src.name_ar}</p>}
                        </div>
                        {src.requires_reference && (
                          <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Ref Required</span>
                        )}
                      </div>
                      <NumInput
                        label={`${src.name_en} Amount`}
                        value={customSourceAmounts[src.id] || ''}
                        onChange={v => setCustomAmount(src.id, v)}
                        prefix={currency}
                        helpText={src.description || undefined}
                      />
                    </div>
                  );
                })}
              </div>
              </AccordionBody>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 5 — PURCHASE SUMMARY (Auto-loaded)
          ═══════════════════════════════════════════════════════════════ */}
          <div className={`rounded-2xl border-2 ${SECTION_COLORS.purchases.border} overflow-hidden bg-background shadow-sm`}>
            <SectionHeader
              icon={ShoppingCart}
              title="Purchase Summary"
              color="purchases"
              sectionNum={sectionNumbers.purchases}
              collapsible
              collapsed={!isSectionOpen('purchases')}
              onToggle={() => toggleSection('purchases')}
              badge={
                purchasesLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-600" />
                  : <Badge variant="outline" className="text-orange-700 border-orange-300 text-[10px] font-bold">
                      {currency}{approvedPurchasesTotal.toLocaleString()}
                    </Badge>
              }
            />
            <AccordionBody open={isSectionOpen('purchases')}>
              <div className="p-4 space-y-3">
                {purchasesLoading || pendingLoading ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <KPICard
                        label="Approved Purchases"
                        value={`${currency}${approvedPurchasesTotal.toLocaleString()}`}
                        icon={CheckCircle2}
                        colorClass="text-emerald-600"
                        bgClass="bg-emerald-100"
                        sublabel={`${approvedPurchasesForDate.length} invoice(s)`}
                      />
                      <KPICard
                        label="Pending Purchases"
                        value={`${currency}${pendingPurchases.reduce((s, p) => s + (Number(p.total_amount) || 0), 0).toLocaleString()}`}
                        icon={Clock}
                        colorClass="text-amber-600"
                        bgClass="bg-amber-100"
                        sublabel={`${pendingPurchases.length} pending`}
                      />
                      <KPICard
                        label="Largest Purchase"
                        value={largestPurchase > 0 ? `${currency}${largestPurchase.toLocaleString()}` : '—'}
                        icon={Package}
                        colorClass="text-orange-600"
                        bgClass="bg-orange-100"
                        sublabel="Single invoice"
                      />
                      <KPICard
                        label="Suppliers"
                        value={String(uniqueSuppliers)}
                        icon={Store}
                        colorClass="text-rose-600"
                        bgClass="bg-rose-100"
                        sublabel="Unique today"
                      />
                    </div>
                    {/* Operating Cost indicator */}
                    {totalSales > 0 && (
                      <div className="rounded-xl p-3 bg-orange-50 border border-orange-200">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-orange-800">Operating Cost Ratio</span>
                          <span className="text-sm font-black text-orange-700">
                            {totalSales > 0 ? ((approvedPurchasesTotal / totalSales) * 100).toFixed(1) : 0}%
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 bg-orange-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-orange-500 rounded-full transition-all"
                            style={{ width: `${Math.min(100, totalSales > 0 ? (approvedPurchasesTotal / totalSales) * 100 : 0)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {/* Approved invoices list */}
                    {approvedPurchasesForDate.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Approved Invoices</p>
                        {approvedPurchasesForDate.slice(0, 5).map(p => (
                          <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-background border border-border text-xs">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="font-medium">{p.supplier_name || 'Unknown Supplier'}</span>
                            </div>
                            <span className="font-bold text-orange-700">{currency}{Number(p.total_amount).toLocaleString()}</span>
                          </div>
                        ))}
                        {approvedPurchasesForDate.length > 5 && (
                          <p className="text-[10px] text-muted-foreground text-center">
                            +{approvedPurchasesForDate.length - 5} more invoices
                          </p>
                        )}
                      </div>
                    )}
                    {approvedPurchasesForDate.length === 0 && (
                      <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-amber-50 border border-amber-200">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <p className="text-xs font-medium text-amber-800">
                          No approved purchases found for {form.date}. Record purchases before closing.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </AccordionBody>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 6 — CASH RECONCILIATION
          ═══════════════════════════════════════════════════════════════ */}
          <div className={`rounded-2xl border-2 ${SECTION_COLORS.reconcile.border} overflow-hidden bg-background shadow-sm`}>
            <SectionHeader
              icon={Scale}
              title="Cash Reconciliation"
              color="reconcile"
              sectionNum={sectionNumbers.reconciliation}
              collapsible
              collapsed={!isSectionOpen('reconciliation')}
              onToggle={() => toggleSection('reconciliation')}
              badge={cashReconcStatus ? <StatusBadge status={cashReconcStatus} /> : undefined}
            />
            <AccordionBody open={isSectionOpen('reconciliation')}>
            <div className="p-4 space-y-3">
              {/* Cash Sales Input */}
              <NumInput
                label="Cash Sales"
                value={cashSalesInput}
                onChange={setCashSalesInput}
                prefix={currency}
                helpText="Actual cash revenue collected at counter"
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NumInput
                  label="Opening Cash"
                  value={openingCash}
                  onChange={setOpeningCash}
                  prefix={currency}
                  helpText="Auto-fetched from previous shift"
                />
                <NumInput
                  label="Expected Cash"
                  value={expectedCash}
                  readOnly
                  prefix={currency}
                  helpText="Opening + Cash Sales"
                />
              </div>
              <NumInput
                label="Actual Cash Count"
                value={actualCashCount}
                onChange={setActualCashCount}
                prefix={currency}
                helpText="Physical count in register"
              />

              {/* Cash Difference */}
              {cashDifference !== null && (
                <div className={`rounded-xl p-3 border-2 ${
                  cashReconcStatus === 'Shortage' ? 'bg-red-50 border-red-200' :
                  cashReconcStatus === 'Overage'  ? 'bg-amber-50 border-amber-200' :
                  'bg-emerald-50 border-emerald-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">Cash Difference</p>
                    <StatusBadge status={cashReconcStatus} />
                  </div>
                  <p className={`text-2xl font-black ${cashDifference < 0 ? 'text-red-600' : cashDifference > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {cashDifference >= 0 ? '+' : ''}{currency}{Math.abs(cashDifference).toLocaleString()}
                  </p>
                  {differencePercentage !== null && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {differencePercentage.toFixed(2)}% of expected cash
                    </p>
                  )}
                </div>
              )}

              {/* Owner Contribution — only on shortage */}
              {cashReconcStatus === 'Shortage' && (
                <NumInput
                  label="Owner Capital Contribution"
                  value={ownerContributionInput}
                  onChange={setOwnerContributionInput}
                  prefix={currency}
                  helpText="Owner paid to cover shortage — NOT classified as sales revenue"
                />
              )}

              {/* Remaining Difference */}
              {actualCount !== null && (
                <div className={`rounded-xl p-3 border-2 ${remainingDifference === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Remaining Difference</span>
                    <span className={`text-lg font-black ${remainingDifference === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {remainingDifference >= 0 ? '+' : ''}{currency}{Math.abs(remainingDifference).toLocaleString()}
                    </span>
                  </div>
                  {remainingDifference !== 0 && (
                    <div className="mt-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={managerApproved ? 'default' : 'destructive'}
                        className="w-full h-9 text-xs font-bold"
                        onClick={() => setManagerApproved(!managerApproved)}
                      >
                        <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                        {managerApproved ? 'Manager Approved ✓' : 'Require Manager Approval'}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Summary row */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="bg-muted/30 rounded-lg p-2.5 border border-border">
                  <p className="text-[9px] font-bold uppercase text-muted-foreground">Closing Cash</p>
                  <p className="text-sm font-black text-foreground">{currency}{closingCash.toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground">For next shift opening</p>
                </div>
                <div className={`rounded-lg p-2.5 border ${riskLevel === 'High' ? 'bg-red-50 border-red-200' : riskLevel === 'Medium' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <p className="text-[9px] font-bold uppercase text-muted-foreground">Risk Indicator</p>
                  <p className={`text-sm font-black ${riskLevel === 'High' ? 'text-red-700' : riskLevel === 'Medium' ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {riskLevel || '—'}
                  </p>
                  {differencePercentage !== null && (
                    <p className="text-[9px] text-muted-foreground">{differencePercentage.toFixed(1)}% variance</p>
                  )}
                </div>
              </div>
            </div>
            </AccordionBody>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 7 — OPERATING RESULT (NEVER DISAPPEARS)
          ═══════════════════════════════════════════════════════════════ */}
          <div className={`rounded-2xl border-2 ${SECTION_COLORS.operating.border} overflow-hidden bg-background shadow-sm`}>
            <SectionHeader
              icon={TrendingUp}
              title="Operating Result"
              color="operating"
              sectionNum={sectionNumbers.operating}
              collapsible
              collapsed={!isSectionOpen('operating')}
              onToggle={() => toggleSection('operating')}
              badge={
                <Badge className={`text-[10px] font-bold ${operatingResult >= 0 ? 'bg-emerald-600' : 'bg-red-600'} text-white`}>
                  {operatingResult >= 0 ? '+' : ''}{currency}{operatingResult.toLocaleString()}
                </Badge>
              }
            />
            <AccordionBody open={isSectionOpen('operating')}>
            <div className="p-4 space-y-2">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
                  <span className="text-xs font-semibold text-blue-800">Sales Revenue</span>
                  <span className="text-sm font-black text-blue-700">{currency}{totalSales.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-orange-50 border border-orange-200">
                  <span className="text-xs font-semibold text-orange-800">Approved Purchases</span>
                  <span className="text-sm font-black text-orange-700">
                    {purchasesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `${currency}${approvedPurchasesTotal.toLocaleString()}`}
                  </span>
                </div>
                <Separator className="my-1" />
                <div className={`flex justify-between items-center px-3 py-2.5 rounded-xl border-2 ${operatingResult >= 0 ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'}`}>
                  <span className="text-xs font-bold uppercase text-muted-foreground tracking-wide">Gross Operating Result</span>
                  <span className={`text-xl font-black ${operatingResult >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {operatingResult >= 0 ? '+' : ''}{currency}{operatingResult.toLocaleString()}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-muted/30 border border-border">
                    <span className="text-[10px] font-semibold text-muted-foreground">Operating Margin</span>
                    <span className={`text-xs font-black ${operatingMarginPct >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {operatingMarginPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-muted/30 border border-border">
                    <span className="text-[10px] font-semibold text-muted-foreground">Net Cash</span>
                    <span className={`text-xs font-black ${netCash >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {netCash >= 0 ? '+' : ''}{currency}{netCash.toLocaleString()}
                    </span>
                  </div>
                </div>
                {cashShortageAmount > 0 && (
                  <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                    <span className="text-[10px] font-semibold text-red-800">Cash Shortage</span>
                    <span className="text-xs font-black text-red-700">{currency}{cashShortageAmount.toLocaleString()}</span>
                  </div>
                )}
                {ownerContrib > 0 && (
                  <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-purple-50 border border-purple-200">
                    <span className="text-[10px] font-semibold text-purple-800">Owner Contribution (Cash)</span>
                    <span className="text-xs font-black text-purple-700">{currency}{ownerContrib.toLocaleString()}</span>
                  </div>
                )}
                {purchasesOwnerContrib > 0 && (
                  <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-purple-50 border border-purple-200">
                    <span className="text-[10px] font-semibold text-purple-800">Owner Contribution (Purchases Gap)</span>
                    <span className="text-xs font-black text-purple-700">{currency}{purchasesOwnerContrib.toLocaleString()}</span>
                  </div>
                )}
              </div>
              {/* Business rule reminder */}
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-muted/20 border border-border/50">
                <Info className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-[9px] text-muted-foreground leading-relaxed">
                  Sales Revenue is never modified by cash shortage or owner contributions. Operating Result = Sales − Approved Purchases only.
                </p>
              </div>
            </div>
            </AccordionBody>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 8 — VALIDATION CENTER
          ═══════════════════════════════════════════════════════════════ */}
          <div className={`rounded-2xl border-2 ${SECTION_COLORS.validation.border} overflow-hidden bg-background shadow-sm`}>
            <SectionHeader
              icon={CheckSquare}
              title="Validation Center"
              color="validation"
              sectionNum={sectionNumbers.validation}
              collapsible
              collapsed={!isSectionOpen('validation')}
              onToggle={() => toggleSection('validation')}
              badge={
                <Badge className={`text-[10px] font-bold ${allValid ? 'bg-emerald-600' : 'bg-red-500'} text-white`}>
                  {passedCount}/{validations.length}
                </Badge>
              }
            />
            <AccordionBody open={isSectionOpen('validation')}>
              <div className="p-4 space-y-2">
                {validations.map(v => (
                  <ValidationRow key={v.key} label={v.label} passed={v.passed} message={v.message} />
                ))}
                {allValid && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 border-2 border-emerald-300 mt-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-800">All validations passed — ready to close shift</span>
                  </div>
                )}
              </div>
            </AccordionBody>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              SECTION 9 — SAVE PANEL
          ═══════════════════════════════════════════════════════════════ */}
          <div className={`rounded-2xl border-2 ${SECTION_COLORS.save.border} overflow-hidden bg-background shadow-sm`}>
            <SectionHeader
              icon={Database}
              title="Save Panel"
              color="save"
              sectionNum={sectionNumbers.save}
              collapsible
              collapsed={!isSectionOpen('save')}
              onToggle={() => toggleSection('save')}
            />
            <AccordionBody open={isSectionOpen('save')}>
            <div className="p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wide">Records that will be created:</p>
              <div className="space-y-1.5">
                {recordsToCreate.map(r => (
                  <div key={r.key} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                    <r.icon className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                    <span className="text-xs font-medium text-green-800">{r.label}</span>
                    <span className="ml-auto text-[9px] font-bold text-green-600 uppercase">{r.key}</span>
                  </div>
                ))}
              </div>

              {/* Error display */}
              {!allValid && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-red-800">Cannot save — fix validation errors first</p>
                    <p className="text-[10px] text-red-600 mt-0.5">
                      {validations.filter(v => !v.passed).map(v => v.label).join(', ')}
                    </p>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 font-bold"
                  onClick={onCancel}
                  disabled={isSubmitting}
                >
                  <X className="w-4 h-4 mr-1.5" /> Cancel
                </Button>
                <Button
                  type="submit"
                  className={`h-12 font-bold ${allValid ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-primary'}`}
                  disabled={isSubmitting || purchasesLoading || !allValid}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-1.5" /> Close Shift
                    </>
                  )}
                </Button>
              </div>
            </div>
            </AccordionBody>
          </div>

        </div>
      </div>
    </form>
  );
}
