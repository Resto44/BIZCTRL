/**
 * OwnerDashboard — Next Generation Executive Dashboard
 *
 * Architecture: Modular, component-based widgets, real-time calculations,
 * lazy loading, memoized calculations, responsive mobile-first layout,
 * skeleton loading, error boundaries, optimistic updates.
 *
 * BUSINESS RULES (NEVER MODIFY):
 *   Sales Revenue must NEVER be modified.
 *   Purchases must NEVER modify Sales.
 *   Operating Result = Sales − Approved Purchases.
 *   Cash Shortage is NOT Sales. Cash Shortage is NOT Profit.
 *   Cash Shortage must create Owner Capital Contribution only.
 *   Dashboard values must always be calculated from database records.
 *   No manual calculations. No duplicated logic. Single source of truth.
 *
 * SECTIONS:
 *   0. Branch Selector  (NEW — always at top)
 *   1. Executive Summary
 *   2. Operating Result  (NEVER REMOVE)
 *   3. Cash Reconciliation
 *   4. Sales Analytics
 *   5. Purchase Analytics
 *   6. Inventory Analytics
 *   7. Cash Flow
 *   8. Product Price Intelligence
 *   9. Alerts
 */
import React, { useState, useMemo, useCallback, memo } from 'react';
import { useBusinessMode } from '@/lib/BusinessModeContext';
import ModeBadge from '@/components/shared/ModeBadge';
import { ModeSpecificDashboardSection } from '@/components/dashboard/DashboardWidgetRegistry';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useRole } from '@/lib/RoleContext';
import { useAuth } from '@/lib/AuthContext';
import { useNetworkSettlement } from '@/hooks/useNetworkSettlement';
import { useNotify } from '@/lib/useNotify';
import { getSaleCash, getSaleNetwork, calculateSalesRevenue, computeDashboardMetrics, computeProductQuantityAnalytics } from '@/lib/helpers';
import { computeAdditionalSources } from '@/services/salesAnalyticsEngine';
import { useSalesSources } from '@/hooks/useSalesSources';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
// SalesForm removed to enforce single ERP workspace entry point
import PriceChangesWidget from '@/components/dashboard/PriceChangesWidget';
import { toast } from 'sonner';
import {
  generateSalesInvoiceNumber,
  createSalesInvoice,
  generateAndUploadPDF,
} from '@/lib/salesInvoiceService';
import { computeProcurementKPIs, getOverdueInfo } from '@/lib/procurementEngine';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package,
  Users, Truck, AlertTriangle, Wifi, Plus, CreditCard, Wallet,
  Receipt, Banknote, ArrowDownLeft, BarChart3,
  PackagePlus, ArrowLeftRight, FileText, ShoppingBag, Activity,
  Scale, Target, Zap, ChevronRight, ArrowUpRight, ArrowDownRight,
  CheckCircle2, XCircle, AlertCircle,
  LayoutDashboard, Layers, Clock, MapPin, Globe, ChevronDown,
  Building2,
} from 'lucide-react';
import {
  format, startOfMonth, startOfWeek, startOfYear,
  subDays, subWeeks, subMonths, getDaysInMonth, differenceInCalendarDays,
} from 'date-fns';

// ─────────────────────────────────────────────────────────────────────────────
// PRIMITIVE COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

const SkeletonCard = memo(() => (
  <Card className="border border-border/50">
    <CardContent className="p-4">
      <Skeleton className="h-4 w-24 mb-3" />
      <Skeleton className="h-7 w-32 mb-1" />
      <Skeleton className="h-3 w-20" />
    </CardContent>
  </Card>
));

const SectionHeader = memo(({ icon: Icon, title, subtitle, action, color = 'blue' }) => {
  const colorMap = {
    blue:   'bg-blue-100 dark:bg-blue-900/40 text-blue-600',
    green:  'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600',
    amber:  'bg-amber-100 dark:bg-amber-900/40 text-amber-600',
    red:    'bg-red-100 dark:bg-red-900/40 text-red-600',
    purple: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600',
    cyan:   'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600',
    orange: 'bg-orange-100 dark:bg-orange-900/40 text-orange-600',
    indigo: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600',
    slate:  'bg-slate-100 dark:bg-slate-800 text-slate-600',
  };
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colorMap[color] || colorMap.blue}`}>
          {Icon && <Icon className="w-4 h-4" />}
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground leading-tight">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground leading-tight">{subtitle}</p>}
        </div>
      </div>
      {action && (
        <button onClick={action.onClick} className="flex items-center gap-1 text-xs text-primary hover:underline">
          {action.label} <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
});

const MetricCard = memo(({
  title, value, subtitle, icon: Icon, color = 'blue',
  onClick, trend, trendLabel, large = false,
}) => {
  const colorMap = {
    blue:   { bg: 'bg-blue-50 dark:bg-blue-950/50',     icon: 'text-blue-600',    border: 'border-blue-100 dark:border-blue-900/60',    val: 'text-blue-700 dark:text-blue-400' },
    green:  { bg: 'bg-emerald-50 dark:bg-emerald-950/50', icon: 'text-emerald-600', border: 'border-emerald-100 dark:border-emerald-900/60', val: 'text-emerald-700 dark:text-emerald-400' },
    amber:  { bg: 'bg-amber-50 dark:bg-amber-950/50',   icon: 'text-amber-600',   border: 'border-amber-100 dark:border-amber-900/60',   val: 'text-amber-700 dark:text-amber-400' },
    red:    { bg: 'bg-red-50 dark:bg-red-950/50',       icon: 'text-red-600',     border: 'border-red-100 dark:border-red-900/60',      val: 'text-red-700 dark:text-red-400' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-950/50', icon: 'text-purple-600',  border: 'border-purple-100 dark:border-purple-900/60', val: 'text-purple-700 dark:text-purple-400' },
    cyan:   { bg: 'bg-cyan-50 dark:bg-cyan-950/50',     icon: 'text-cyan-600',    border: 'border-cyan-100 dark:border-cyan-900/60',    val: 'text-cyan-700 dark:text-cyan-400' },
    orange: { bg: 'bg-orange-50 dark:bg-orange-950/50', icon: 'text-orange-600',  border: 'border-orange-100 dark:border-orange-900/60', val: 'text-orange-700 dark:text-orange-400' },
    indigo: { bg: 'bg-indigo-50 dark:bg-indigo-950/50', icon: 'text-indigo-600',  border: 'border-indigo-100 dark:border-indigo-900/60', val: 'text-indigo-700 dark:text-indigo-400' },
    slate:  { bg: 'bg-slate-50 dark:bg-slate-900/50',   icon: 'text-slate-600',   border: 'border-slate-200 dark:border-slate-700',     val: 'text-slate-700 dark:text-slate-300' },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <Card
      className={`border ${c.border} ${onClick ? 'cursor-pointer hover:shadow-md active:scale-[0.98]' : ''} transition-all duration-200`}
      onClick={onClick}
    >
      <CardContent className="p-3.5">
        <div className="flex items-start justify-between mb-2">
          <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center`}>
            <Icon className={`w-4 h-4 ${c.icon}`} />
          </div>
          {trend !== undefined && (
            <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
        <p className={`font-black leading-tight ${large ? 'text-xl' : 'text-lg'} ${c.val}`}>{value}</p>
        <p className="text-[11px] font-medium text-muted-foreground mt-0.5 leading-tight">{title}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight">{subtitle}</p>}
        {trendLabel && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{trendLabel}</p>}
      </CardContent>
    </Card>
  );
});

const LedgerRow = memo(({ label, value, color = 'default', bold = false, separator = false }) => {
  const colorMap = {
    default: 'text-foreground',
    green:   'text-emerald-600 dark:text-emerald-400',
    red:     'text-red-600 dark:text-red-400',
    amber:   'text-amber-600 dark:text-amber-400',
    blue:    'text-blue-600 dark:text-blue-400',
    purple:  'text-purple-600 dark:text-purple-400',
    muted:   'text-muted-foreground',
  };
  return (
    <>
      {separator && <div className="border-t border-border/60 my-1.5" />}
      <div className={`flex items-center justify-between py-1.5 px-1 rounded ${bold ? 'bg-muted/30' : ''}`}>
        <span className={`text-xs ${bold ? 'font-semibold' : 'font-medium'} text-muted-foreground`}>{label}</span>
        <span className={`text-sm ${bold ? 'font-black' : 'font-semibold'} ${colorMap[color]}`}>{value}</span>
      </div>
    </>
  );
});

const AlertRow = memo(({ icon: Icon, title, count, severity = 'amber', onClick }) => {
  const severityMap = {
    critical: { bg: 'bg-red-50 dark:bg-red-950/40',    border: 'border-red-200 dark:border-red-800',    icon: 'text-red-600',    badge: 'bg-red-500' },
    high:     { bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-200 dark:border-orange-800', icon: 'text-orange-600', badge: 'bg-orange-500' },
    amber:    { bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800', icon: 'text-amber-600',  badge: 'bg-amber-500' },
    blue:     { bg: 'bg-blue-50 dark:bg-blue-950/40',   border: 'border-blue-200 dark:border-blue-800',  icon: 'text-blue-600',   badge: 'bg-blue-500' },
    green:    { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-800', icon: 'text-emerald-600', badge: 'bg-emerald-500' },
  };
  const s = severityMap[severity] || severityMap.amber;
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border ${s.border} ${s.bg} ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''} transition-all`}
      onClick={onClick}
    >
      <Icon className={`w-4 h-4 shrink-0 ${s.icon}`} />
      <span className="flex-1 text-xs font-medium text-foreground leading-tight">{title}</span>
      <span className={`text-white text-xs font-bold rounded-full px-2.5 py-0.5 ${s.badge} shrink-0 min-w-[24px] text-center`}>{count}</span>
    </div>
  );
});



// ─────────────────────────────────────────────────────────────────────────────
// BRANCH SELECTOR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const BranchSelector = memo(({ branches, selectedBranch, onSelect, t }) => {
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(() => {
    if (selectedBranch === 'all') return t('all_branches');
    const b =  (branches || []).find(br => (br.key || br.id) === selectedBranch);
    return b ? (b.name || b.key || selectedBranch) : selectedBranch;
  }, [selectedBranch, branches, t]);

  const isAll = selectedBranch === 'all';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 active:scale-[0.98] transition-all"
      >
        <div className="flex items-center gap-2">
          {isAll
            ? <Globe className="w-4 h-4 text-primary shrink-0" />
            : <MapPin className="w-4 h-4 text-primary shrink-0" />
          }
          <div className="text-left">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-none mb-0.5">{t('selected_branch')}</p>
            <p className="text-sm font-bold text-foreground leading-tight">{selectedLabel}</p>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-background border border-border rounded-xl shadow-xl overflow-hidden">
          {/* All Branches option */}
          <button
            className={`w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-muted/60 transition-colors ${selectedBranch === 'all' ? 'bg-primary/10' : ''}`}
            onClick={() => { onSelect('all'); setOpen(false); }}
          >
            <Globe className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">{t('all_branches')}</p>
              <p className="text-[10px] text-muted-foreground">{t('aggregate_all_branches')}</p>
            </div>
            {selectedBranch === 'all' && <CheckCircle2 className="w-4 h-4 text-primary ml-auto shrink-0" />}
          </button>

          {/* Divider */}
          { (branches || []).length > 0 && <div className="border-t border-border/60 mx-3" />}

          {/* Individual branches */}
          { (branches || []).map((br) => {
            const key = br.key || br.id;
            const name = br.name || br.key || key;
            const isSelected = selectedBranch === key;
            return (
              <button
                key={key}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-muted/60 transition-colors ${isSelected ? 'bg-primary/10' : ''}`}
                onClick={() => { onSelect(key); setOpen(false); }}
              >
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{name}</p>
                  {br.address && <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{br.address}</p>}
                </div>
                {isSelected && <CheckCircle2 className="w-4 h-4 text-primary ml-auto shrink-0" />}
              </button>
            );
          })}

          { (branches || []).length === 0 && (
            <div className="px-4 py-3 text-xs text-muted-foreground">{t('no_branches_configured')}</div>
          )}
        </div>
      )}

      {/* Backdrop to close dropdown */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ERROR BOUNDARY
// ─────────────────────────────────────────────────────────────────────────────
class WidgetErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/30">
          <CardContent className="p-4 flex items-center gap-2 text-red-600">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-xs font-medium">Widget failed to load. Please refresh.</span>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
export default function OwnerDashboard() {
  const { t, currency } = useLanguage();
  const { branches, ownerFilter, orgId, activeRestaurant } = useTenant();
  const { role } = useRole();
  const { user } = useAuth();
  const navigate = useNavigate();
  const notif = useNotify();
  const qc = useQueryClient();
  const { autoSettle } = useNetworkSettlement({ orgId, user, currency });

  // ── BRANCH SELECTION STATE ────────────────────────────────────────────────
  // 'all' means aggregate all active branches; any other value is a branch key/id.
  const [selectedBranch, setSelectedBranch] = useState('all');

  const activeBranchKeys = useMemo(
    () => (branches || [])
      .map(branch => String(branch.key || branch.branch_key || branch.id || '').trim())
      .filter(Boolean),
    [branches],
  );
  const activeBranchSignature = useMemo(() => activeBranchKeys.join('|'), [activeBranchKeys]);
  const selectedBranchKey = useMemo(() => {
    if (selectedBranch === 'all') return null;
    const branchObj = (branches || []).find(branch => (branch.key || branch.id) === selectedBranch);
    return String(branchObj?.key || branchObj?.branch_key || selectedBranch || '').trim() || null;
  }, [branches, selectedBranch]);
  const isRecordInActiveBranchScope = useCallback((record, field = 'branch') => {
    const recordBranch = String(record?.[field] || '').trim();
    return Boolean(recordBranch)
      && activeBranchKeys.includes(recordBranch)
      && (selectedBranch === 'all' || recordBranch === selectedBranchKey);
  }, [activeBranchKeys, selectedBranch, selectedBranchKey]);

  // Sales-source configuration is branch-aware as well, so revenue inclusion is
  // evaluated against the selected branch rather than a stale owner-wide source list.
  const { revenueSources } = useSalesSources({
    branchKey: selectedBranch === 'all' ? undefined : selectedBranchKey,
  });

  // Build the effective filter: active restaurant + optional selected branch.
  const branchFilter = useMemo(() => {
    if (!activeRestaurant?.id) return null;
    const baseFilter = { restaurant_id: activeRestaurant.id };
    if (selectedBranch === 'all') return baseFilter;
    return { ...baseFilter, branch: selectedBranchKey };
  }, [activeRestaurant?.id, selectedBranch, selectedBranchKey]);

  // Expenses store their branch key in `branch_key`, unlike sales and purchases.
  const expenseBranchFilter = useMemo(() => {
    if (!activeRestaurant?.id) return null;
    const baseFilter = { restaurant_id: activeRestaurant.id };
    if (selectedBranch === 'all') return baseFilter;
    return { ...baseFilter, branch_key: selectedBranchKey };
  }, [activeRestaurant?.id, selectedBranch, selectedBranchKey]);

  // Branch display info for the badge
  const selectedBranchLabel = useMemo(() => {
    if (selectedBranch === 'all') return t('all_branches');
    const b =  (branches || []).find(br => (br.key || br.id) === selectedBranch);
    return b ? (b.name || b.key || selectedBranch) : selectedBranch;
  }, [selectedBranch, branches, t]);

  const today       = format(new Date(), 'yyyy-MM-dd');
  const yesterday   = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const weekStart   = format(startOfWeek(new Date(), { weekStartsOn: 6 }), 'yyyy-MM-dd');
  const monthStart  = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const yearStart   = format(startOfYear(new Date()), 'yyyy-MM-dd');
  const prevWeekStart  = format(subWeeks(new Date(), 1), 'yyyy-MM-dd');
  const prevMonthStart = format(subMonths(new Date(), 1), 'yyyy-MM-dd');

  const enabled = !!(activeRestaurant?.id);

  const fmt = useCallback((n) =>
    `${currency}${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, [currency]);
  const fmtDecimal = useCallback((n) =>
    `${currency}${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, [currency]);
  const fmtPct = useCallback((n) =>
    `${n >= 0 ? '+' : ''}${(n || 0).toFixed(1)}%`, []);

  // ── DATA QUERIES — all use branchFilter + selectedBranch in queryKey ──────
  // This ensures React Query invalidates and refetches when branch changes.

  const { data: todaySales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['sales_today', branchFilter, today, selectedBranch, activeBranchSignature],
    queryFn: () => base44.entities.DailySales.filter({ ...(branchFilter || {}), date: today }, '-date', 100),
    staleTime: 15000,
    enabled,
    select: (data) => data.filter(sale => isRecordInActiveBranchScope(sale, 'branch')),
  });

  const { data: yesterdaySales = [] } = useQuery({
    queryKey: ['sales_yesterday', branchFilter, yesterday, selectedBranch, activeBranchSignature],
    queryFn: () => base44.entities.DailySales.filter({ ...(branchFilter || {}), date: yesterday }, '-date', 100),
    staleTime: 60000,
    enabled,
    select: (data) => data.filter(sale => isRecordInActiveBranchScope(sale, 'branch')),
  });

  const { data: weekSales = [] } = useQuery({
    queryKey: ['sales_week', branchFilter, weekStart, selectedBranch, activeBranchSignature],
    queryFn: () => base44.entities.DailySales.filter(branchFilter || {}, '-date', 500),
    staleTime: 60000,
    enabled,
    select: (data) => data.filter(sale => sale.date >= weekStart && isRecordInActiveBranchScope(sale, 'branch')),
  });

  const { data: monthSales = [] } = useQuery({
    queryKey: ['sales_month', branchFilter, monthStart, selectedBranch, activeBranchSignature],
    queryFn: () => base44.entities.DailySales.filter(branchFilter || {}, '-date', 1000),
    staleTime: 60000,
    enabled,
    select: (data) => data.filter(sale => sale.date >= monthStart && isRecordInActiveBranchScope(sale, 'branch')),
  });

  const { data: yearSales = [] } = useQuery({
    queryKey: ['sales_year', branchFilter, yearStart, selectedBranch, activeBranchSignature],
    queryFn: () => base44.entities.DailySales.filter(branchFilter || {}, '-date', 5000),
    staleTime: 120000,
    enabled,
    select: (data) => data.filter(sale => sale.date >= yearStart && isRecordInActiveBranchScope(sale, 'branch')),
  });

  const { data: prevWeekSales = [] } = useQuery({
    queryKey: ['sales_prev_week', branchFilter, prevWeekStart, weekStart, selectedBranch, activeBranchSignature],
    queryFn: () => base44.entities.DailySales.filter(branchFilter || {}, '-date', 500),
    staleTime: 120000,
    enabled,
    select: (data) => data.filter(sale => sale.date >= prevWeekStart && sale.date < weekStart && isRecordInActiveBranchScope(sale, 'branch')),
  });

  const { data: prevMonthSales = [] } = useQuery({
    queryKey: ['sales_prev_month', branchFilter, prevMonthStart, monthStart, selectedBranch, activeBranchSignature],
    queryFn: () => base44.entities.DailySales.filter(branchFilter || {}, '-date', 1000),
    staleTime: 120000,
    enabled,
    select: (data) => data.filter(sale => sale.date >= prevMonthStart && sale.date < monthStart && isRecordInActiveBranchScope(sale, 'branch')),
  });

  const { data: weekPurchases = [] } = useQuery({
    queryKey: ['purchases_week', branchFilter, weekStart, selectedBranch, activeBranchSignature],
    queryFn: () => base44.entities.Purchase.filter(branchFilter || {}, '-date', 500),
    staleTime: 60000,
    enabled,
    select: (data) => data.filter(purchase => purchase.date >= weekStart && isRecordInActiveBranchScope(purchase, 'branch')),
  });

  const { data: monthPurchases = [] } = useQuery({
    queryKey: ['purchases_month', branchFilter, monthStart, selectedBranch, activeBranchSignature],
    queryFn: () => base44.entities.Purchase.filter(branchFilter || {}, '-date', 1000),
    staleTime: 60000,
    enabled,
    select: (data) => data.filter(purchase => purchase.date >= monthStart && isRecordInActiveBranchScope(purchase, 'branch')),
  });

  const { data: todayExpenses = [] } = useQuery({
    queryKey: ['expenses_today', expenseBranchFilter, today, selectedBranch, activeBranchSignature],
    queryFn: () => base44.entities.Expense.filter({ ...(expenseBranchFilter || {}), date: today }, '-date', 200),
    staleTime: 15000,
    enabled,
    select: (data) => data.filter(expense => isRecordInActiveBranchScope(expense, 'branch_key')),
  });

  const { data: yesterdayExpenses = [] } = useQuery({
    queryKey: ['expenses_yesterday', expenseBranchFilter, yesterday, selectedBranch, activeBranchSignature],
    queryFn: () => base44.entities.Expense.filter({ ...(expenseBranchFilter || {}), date: yesterday }, '-date', 200),
    staleTime: 60000,
    enabled,
    select: (data) => data.filter(expense => isRecordInActiveBranchScope(expense, 'branch_key')),
  });

  const { data: weekExpenses = [] } = useQuery({
    queryKey: ['expenses_week', expenseBranchFilter, weekStart, today, selectedBranch, activeBranchSignature],
    queryFn: () => base44.entities.Expense.filter(expenseBranchFilter || {}, '-date', 500),
    staleTime: 60000,
    enabled,
    select: (data) => data.filter(expense => expense.date >= weekStart && expense.date <= today && isRecordInActiveBranchScope(expense, 'branch_key')),
  });

  const { data: monthExpenses = [] } = useQuery({
    queryKey: ['expenses_month', expenseBranchFilter, monthStart, selectedBranch, activeBranchSignature],
    queryFn: () => base44.entities.Expense.filter(expenseBranchFilter || {}, '-date', 500),
    staleTime: 60000,
    enabled,
    select: (data) => data.filter(expense => expense.date >= monthStart && isRecordInActiveBranchScope(expense, 'branch_key')),
  });

  // Previous month expenses — needed for Product Consumption Analytics
  const { data: prevMonthExpenses = [] } = useQuery({
    queryKey: ['expenses_prev_month', expenseBranchFilter, prevMonthStart, monthStart, selectedBranch, activeBranchSignature],
    queryFn: () => base44.entities.Expense.filter(expenseBranchFilter || {}, '-date', 500),
    staleTime: 120000,
    enabled,
    select: (data) => data.filter(expense => expense.date >= prevMonthStart && expense.date < monthStart && isRecordInActiveBranchScope(expense, 'branch_key')),
  });

  // Expense categories — needed to tag fixed vs variable expenses
  // IMPORTANT: filter by restaurant_id to avoid cross-restaurant category pollution
  const { data: expenseCategories = [] } = useQuery({
    queryKey: ['expense_categories_dash', activeRestaurant?.id],
    queryFn: () => base44.entities.ExpenseCategory
      ? base44.entities.ExpenseCategory.filter(
          activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : {},
          'sort_order', 500
        )
      : Promise.resolve([]),
    staleTime: 300000,
    enabled,
  });

  const { data: supplierInvoices = [] } = useQuery({
    queryKey: ['supplier_invoices', activeRestaurant?.id, selectedBranch, activeBranchSignature],
    queryFn: async () => {
      if (!activeRestaurant?.id) return [];
      const { data, error } = await supabase
        .from('supplier_invoices')
        .select('*')
        .eq('restaurant_id', activeRestaurant.id)
        .order('date', { ascending: false })
        .limit(5000);
      if (error) { console.warn('[OwnerDashboard] supplier_invoices fetch error:', error.message); return []; }
      return (data || []).filter(invoice => isRecordInActiveBranchScope(invoice, 'branch'));
    },
    staleTime: 15000,
    enabled,
  });

  const { data: customerDebts = [] } = useQuery({
    queryKey: ['debts_customer_dash', branchFilter, selectedBranch],
    queryFn: () => base44.entities.DebtRecord.filter(
      { ...(branchFilter || {}), type: 'receivable', party_type: 'customer' },
      '-date', 500
    ),
    staleTime: 30000,
    enabled,
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory_dash', branchFilter, selectedBranch],
    queryFn: () => base44.entities.Inventory.filter(branchFilter || {}, 'product_name', 500),
    staleTime: 60000,
    enabled,
  });

  const { data: networkAccounts = [] } = useQuery({
    queryKey: ['network_accounts_dash', branchFilter, selectedBranch],
    queryFn: () => base44.entities.NetworkAccount.filter(branchFilter || {}),
    staleTime: 120000,
    enabled,
  });

  const { data: walletTransactions = [] } = useQuery({
    queryKey: ['wallet_transactions_dash', branchFilter, selectedBranch],
    queryFn: () => base44.entities.WalletTransaction.filter(branchFilter || {}, '-transaction_date', 1000),
    staleTime: 30000,
    enabled,
  });

  const { data: todayInvoices = [] } = useQuery({
    queryKey: ['sales_invoices_today', branchFilter, today, selectedBranch],
    queryFn: () => base44.entities.SalesInvoice
      ? base44.entities.SalesInvoice.filter({ ...(branchFilter || {}), sale_date: today }, '-created_date', 100)
      : Promise.resolve([]),
    staleTime: 15000,
    enabled,
  });

  const { data: priceHistory = [] } = useQuery({
    queryKey: ['price_history_dash', user?.email || ownerFilter?.created_by],
    queryFn: async () => {
      const createdBy = user?.email || ownerFilter?.created_by;
      if (!createdBy) return [];
      const since = subDays(new Date(), 30).toISOString();
      const { data, error } = await supabase
        .from('product_price_history')
        .select('*')
        .eq('created_by', createdBy)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: false })
        .limit(50);
      if (error) { console.warn('price history error:', error.message); return []; }
      return data || [];
    },
    staleTime: 60000,
    enabled: !!(user?.email || ownerFilter?.created_by),
  });

  // ── MEMOIZED CALCULATIONS ─────────────────────────────────────────────────────

  const sumSales = useCallback((arr) =>
     (arr || []).reduce((s, r) => s + (calculateSalesRevenue(r, revenueSources)?.total || 0), 0), [revenueSources]);

  const sumPurchaseCost = useCallback((arr) =>
     (arr || []).reduce((s, p) => s + ((p.qty || 0) * (p.used_price || p.current_price || 0)), 0), []);

  // ── Expense and Net-Profit Inputs ─────────────────────────────────────────────
  // Expenses are intentionally computed without reference to sales or purchases.
  // Fixed expenses are allocated once per period; variable expenses are summed only
  // from records in that period.
  const expenseSummary = useMemo(() => {
    const categoryById = new Map(
      (expenseCategories || []).map(category => [category.id, category]),
    );
    const isFixedExpense = (expense) => Boolean(
      expense?._is_fixed
      || expense?.is_fixed
      || categoryById.get(expense?.category_id)?.is_fixed
      || categoryById.get(expense?.expense_category_id)?.is_fixed,
    );
    const amountOf = (expense) => Number(expense?.amount) || 0;
    const variableTotal = (expenses) => (expenses || [])
      .filter(expense => !isFixedExpense(expense))
      .reduce((total, expense) => total + amountOf(expense), 0);
    const fixedTotal = (expenses) => (expenses || [])
      .filter(expense => isFixedExpense(expense))
      .reduce((total, expense) => total + amountOf(expense), 0);

    const daysInMonth = getDaysInMonth(new Date());
    const monthlyFixed = fixedTotal(monthExpenses);
    const monthlyVariable = variableTotal(monthExpenses);
    const dailyFixedAllocation = monthlyFixed / daysInMonth;
    const weekDaysElapsed = Math.min(7, Math.max(1, differenceInCalendarDays(new Date(), startOfWeek(new Date(), { weekStartsOn: 6 })) + 1));

    return {
      daysInMonth,
      monthlyFixed,
      monthlyVariable,
      monthlyTotal: monthlyFixed + monthlyVariable,
      dailyFixedAllocation,
      dailyExpense: (monthlyFixed + monthlyVariable) / daysInMonth,
      todayVariable: variableTotal(todayExpenses),
      yesterdayVariable: variableTotal(yesterdayExpenses),
      weekVariable: variableTotal(weekExpenses),
      weekFixedAllocation: dailyFixedAllocation * weekDaysElapsed,
      weekDaysElapsed,
    };
  }, [expenseCategories, monthExpenses, todayExpenses, yesterdayExpenses, weekExpenses]);

  const periodProfit = useMemo(() => {
    const isApprovedInvoice = (invoice) => (
      ['approved', 'auto_approved'].includes(invoice.approval_status)
      || ['approved', 'paid', 'partial', 'unpaid'].includes(invoice.status)
      || !invoice.approval_status
    );
    const sumApprovedInvoices = (startDate, endDate) => (supplierInvoices || [])
      .filter(invoice => isApprovedInvoice(invoice) && invoice.date >= startDate && invoice.date <= endDate)
      .reduce((total, invoice) => total + (Number(invoice.total_amount || invoice.amount) || 0), 0);
    const createPeriod = (sales, purchases, variableExpenses, fixedAllocation) => ({
      sales,
      purchases,
      variableExpenses,
      fixedAllocation,
      grossProfit: sales - purchases,
      expenses: variableExpenses + fixedAllocation,
      netProfit: sales - purchases - variableExpenses - fixedAllocation,
    });

    return {
      today: createPeriod(
        sumSales(todaySales),
        sumApprovedInvoices(today, today),
        expenseSummary.todayVariable,
        expenseSummary.dailyFixedAllocation,
      ),
      yesterday: createPeriod(
        sumSales(yesterdaySales),
        sumApprovedInvoices(yesterday, yesterday),
        expenseSummary.yesterdayVariable,
        expenseSummary.dailyFixedAllocation,
      ),
      week: createPeriod(
        sumSales(weekSales),
        sumApprovedInvoices(weekStart, today),
        expenseSummary.weekVariable,
        expenseSummary.weekFixedAllocation,
      ),
      month: createPeriod(
        sumSales(monthSales),
        sumApprovedInvoices(monthStart, today),
        expenseSummary.monthlyVariable,
        expenseSummary.monthlyFixed,
      ),
    };
  }, [expenseSummary, monthSales, monthStart, sumSales, supplierInvoices, today, todaySales, weekSales, weekStart, yesterday, yesterdaySales]);

  // ── Section 1: Executive Summary ──────────────────────────────────────────────
  const execSummary = useMemo(() => {
    const todayRevenue = (todaySales || []).reduce((acc, r) => {
      const rev = calculateSalesRevenue(r, revenueSources);
      return {
        cash: acc.cash + rev.cash,
        network: acc.network + rev.network,
        credit: acc.credit + rev.credit,
        custom: acc.custom + rev.customSources,
        total: acc.total + rev.total
      };
    }, { cash: 0, network: 0, credit: 0, custom: 0, total: 0 });

    const cashSalesToday = todayRevenue.cash;
    const networkSalesToday = todayRevenue.network;
    const creditSalesToday = todayRevenue.credit;
    const customSalesToday = todayRevenue.custom;
    const salesToday = todayRevenue.total;

    // Use the same selected-branch period calculation for the executive cards.
    const purchasesToday = periodProfit.today.purchases;
    const expensesToday = periodProfit.today.expenses;
    const expensesTodayRaw = (todayExpenses || []).reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    const {
      dailyFixedAllocation,
      monthlyFixed: totalMonthlyFixed,
      todayVariable: totalVariableToday,
      daysInMonth: realDaysInMonth,
    } = expenseSummary;
    const grossProfit = periodProfit.today.grossProfit;
    const netProfit = periodProfit.today.netProfit;

    const latestSale = todaySales.length > 0
      ?  (todaySales || []).reduce((latest, s) =>
          (!latest || (s.created_date || s.date) > (latest.created_date || latest.date)) ? s : latest, null)
      : null;
    const cashInRegister = latestSale
      ? (Number(latestSale.closing_cash) || Number(latestSale.restaurant_cash) || Number(latestSale.cash) || 0)
      : 0;

    // NETWORK BALANCE — Today / Yesterday / Month (POS/Network only, no cash, no credit)
    const networkToday = (todaySales || []).reduce((s, r) =>
      s + (Number(r.restaurant_network) || Number(r.network) || 0), 0);

    const networkYesterday = (yesterdaySales || []).reduce((s, r) =>
      s + (Number(r.restaurant_network) || Number(r.network) || 0), 0);

    const networkMonth = (monthSales || []).reduce((s, r) =>
      s + (Number(r.restaurant_network) || Number(r.network) || 0), 0);

    // Keep legacy networkBalance for any other widgets that may reference it
    const networkBalance = networkMonth;

    // KPI FIX: Customer Credit = total open receivables (live balance from DebtRecord)
    const customerCredit = customerDebts
      .filter(d => d.status !== 'paid' && d.status !== 'written_off')
      .reduce((s, d) => s + (Number(d.remaining_amount) || 0), 0);

    const inventoryValue =  (inventory || []).reduce((s, item) =>
      s + ((item.quantity || 0) * (item.unit_cost || item.avg_cost || item.cost_price || 0)), 0);

    // `supplierInvoices` is already restricted to the selected active-branch scope.
    const payablesKpis = computeProcurementKPIs(supplierInvoices, []);
    const supplierPayables = payablesKpis.outstandingPayables;
    


    const ownerCapitalToday =  (todaySales || []).reduce((s, r) => s + (Number(r.owner_cash_injection) || 0), 0);

    const cashShortageToday = todaySales
      .filter(r => (Number(r.cash_difference) || 0) < 0)
      .reduce((s, r) => s + Math.abs(Number(r.cash_difference) || 0), 0);
    const cashOverageToday = todaySales
      .filter(r => (Number(r.cash_difference) || 0) > 0)
      .reduce((s, r) => s + (Number(r.cash_difference) || 0), 0);

    return {
      salesToday, cashSalesToday, networkSalesToday, creditSalesToday, customSalesToday,
      purchasesToday, expensesToday, expensesTodayRaw,
      dailyFixedAllocation, totalVariableToday, totalMonthlyFixed, realDaysInMonth,
      monthlyExpenses: expenseSummary.monthlyTotal, dailyExpense: expenseSummary.dailyExpense,
      grossProfit, netProfit,
      cashInRegister, networkBalance, networkToday, networkYesterday, networkMonth, customerCredit,
      inventoryValue, supplierPayables,
      ownerCapitalToday, cashShortageToday, cashOverageToday,
    };
  }, [todaySales, yesterdaySales, todayExpenses, customerDebts, inventory, monthSales, supplierInvoices, revenueSources, expenseSummary, periodProfit]);

  // ── Section 2: Operating Result (NEVER REMOVE) ───────────────────────────────
  const operatingResult = useMemo(() => {
    const salesRevenue      = execSummary.salesToday;
    const approvedPurchases = execSummary.purchasesToday;
    const result            = salesRevenue - approvedPurchases;
    return { salesRevenue, approvedPurchases, result };
  }, [execSummary]);

  // ── Section 3: Cash Reconciliation ───────────────────────────────────────────
  const cashRecon = useMemo(() => {
    const openingCash  =  (todaySales || []).reduce((s, r) => s + (Number(r.opening_cash) || 0), 0);
    const cashSales    = execSummary.cashSalesToday;
    const ownerContrib = execSummary.ownerCapitalToday;
    const expensesOut  =  (todayExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const expectedCash = openingCash + cashSales + ownerContrib - expensesOut;
    const actualCash   = execSummary.cashInRegister;
    const cashDiff     = actualCash - expectedCash;
    const remainingDiff = cashDiff - ownerContrib;
    const closingCash  = actualCash;
    return { openingCash, expectedCash, actualCash, cashDiff, ownerContrib, remainingDiff, closingCash };
  }, [todaySales, todayExpenses, execSummary]);

  // ── Section 4: Sales Analytics ────────────────────────────────────────────────
  const salesAnalytics = useMemo(() => {
    const calcSales = (arr) =>  (arr || []).reduce((s, r) =>
      s + (calculateSalesRevenue(r, revenueSources)?.total || 0), 0);

    const todayAmt     = execSummary.salesToday;
    const yesterdayAmt = calcSales(yesterdaySales);
    const weekAmt      = calcSales(weekSales);
    const monthAmt     = calcSales(monthSales);
    const yearAmt      = calcSales(yearSales);
    const prevWeekAmt  = calcSales(prevWeekSales);
    const prevMonthAmt = calcSales(prevMonthSales);

    const weekGrowth  = prevWeekAmt  > 0 ? ((weekAmt  - prevWeekAmt)  / prevWeekAmt)  * 100 : 0;
    const monthGrowth = prevMonthAmt > 0 ? ((monthAmt - prevMonthAmt) / prevMonthAmt) * 100 : 0;

    const daysInMonth = monthSales.length > 0 ? new Set( (monthSales || []).map(s => s.date)).size : 1;
    const avgDailySales = daysInMonth > 0 ? monthAmt / daysInMonth : 0;

    const dailyTotals = {};
    monthSales.forEach(r => {
      const d = r.date;
      dailyTotals[d] = (dailyTotals[d] || 0) + (calculateSalesRevenue(r, revenueSources)?.total || 0);
    });
    const dailyArr = Object.values(dailyTotals);
    const highestDay = dailyArr.length > 0 ? Math.max(...dailyArr) : 0;
    const lowestDay  = dailyArr.length > 0 ? Math.min(...dailyArr) : 0;

    return { todayAmt, yesterdayAmt, weekAmt, monthAmt, yearAmt, weekGrowth, monthGrowth, avgDailySales, highestDay, lowestDay };
  }, [execSummary, yesterdaySales, weekSales, monthSales, yearSales, prevWeekSales, prevMonthSales, revenueSources]);

  // ── Monthly Expenses (Fixed + Variable) ──────────────────────────────────────
  // This display model shares the canonical expense and month net-profit inputs.
  const totalMonthlyExpenses = useMemo(() => ({
    total: expenseSummary.monthlyTotal,
    totalFixed: expenseSummary.monthlyFixed,
    totalVariable: expenseSummary.monthlyVariable,
    monthNetProfit: periodProfit.month.netProfit,
    monthPurchasesAmt: periodProfit.month.purchases,
  }), [expenseSummary, periodProfit]);

  // ── Additional Sales Sources (dynamic, no hardcoded names) ───────────────────
  const additionalSources = useMemo(() => {
    // Use all month+today+yesterday sales for the branch-filtered data
    // computeAdditionalSources auto-detects from sales_sources_json
    const allSalesForSources = [
      ...monthSales,
      // todaySales and yesterdaySales may already be in monthSales; dedup by id
    ];
    const seenIds = new Set(monthSales.map(s => s.id));
    todaySales.forEach(s => { if (!seenIds.has(s.id)) allSalesForSources.push(s); });
    yesterdaySales.forEach(s => { if (!seenIds.has(s.id)) allSalesForSources.push(s); });

    // Get all custom (non-system) sources with today/yesterday/month/growth
    const sources = computeAdditionalSources(allSalesForSources, revenueSources);

    // Add growth % calculation
    return sources.map(src => ({
      ...src,
      growth: src.yesterday > 0
        ? ((src.today - src.yesterday) / src.yesterday) * 100
        : src.today > 0 ? 100 : 0,
    }));
  }, [monthSales, todaySales, yesterdaySales, revenueSources]);

  // ── Section 5: Purchase Analytics ────────────────────────────────────────────
  const purchaseAnalytics = useMemo(() => {
    // Filter invoices by branch for procurement KPIs
    const branchPurchAnObj = (branches || []).find(b => (b.key || b.id) === selectedBranch);
    const branchPurchAnKey = branchPurchAnObj?.key || selectedBranch;

    // Filter by branch to match Procurement Dashboard
    const branchFilteredInvoices = selectedBranch === 'all' 
      ? supplierInvoices 
      : supplierInvoices.filter(inv => inv.branch === branchPurchAnKey);

    // USE EXACT SAME HELPER AS PROCUREMENT DASHBOARD
    const kpis = computeProcurementKPIs(branchFilteredInvoices, []);



    // Calculate additional metrics for backward compatibility
    const startOfW = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const approvedInvoicesForBranch = branchFilteredInvoices.filter(inv => 
      ['approved', 'auto_approved'].includes(inv.approval_status) || 
      ['approved', 'paid', 'partial'].includes(inv.status)
    );

    const weekAmt = approvedInvoicesForBranch
      .filter(inv => inv.date >= startOfW && inv.date <= today)
      .reduce((s, inv) => s + (Number(inv.total_amount) || 0), 0);

    // Supplier ranking by total purchase amount (all approved, branch-filtered)
    const supplierMap = {};
    approvedInvoicesForBranch.forEach(inv => {
      const name = inv.supplier_name || 'Unknown';
      if (!supplierMap[name]) supplierMap[name] = { amount: 0, count: 0 };
      supplierMap[name].amount += (Number(inv.total_amount) || 0);
      supplierMap[name].count += 1;
    });
    const supplierRanking = Object.entries(supplierMap)
      .map(([name, v]) => [name, v.amount, v.count])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const allAmounts = approvedInvoicesForBranch.map(inv => Number(inv.total_amount) || 0);
    const largestPurchase = allAmounts.length > 0 ? Math.max(...allAmounts) : 0;
    const avgPurchase     = allAmounts.length > 0 ? allAmounts.reduce((s, v) => s + v, 0) / allAmounts.length : 0;

    return { 
      todayAmt: kpis.purchasesToday, 
      todayCount: approvedInvoicesForBranch.filter(inv => inv.date === today).length,
      weekAmt, 
      monthAmt: kpis.purchasesThisMonth, 
      monthCount: approvedInvoicesForBranch.filter(inv => inv.date >= format(startOfMonth(new Date()), 'yyyy-MM-dd') && inv.date <= today).length,
      supplierRanking, 
      largestPurchase, 
      avgPurchase,
      outstandingPayables: kpis.outstandingPayables,
      overduePayables: kpis.overduePayables,
    };
  }, [supplierInvoices, selectedBranch, today, branches]);

  // ── Section 5b: Product Quantity Analytics (ERP) ──────────────────────────────
  const productQuantityAnalytics = useMemo(() => {
    const branchObj = (branches || []).find(b => (b.key || b.id) === selectedBranch);
    const branchKey = branchObj?.key || selectedBranch;
    return computeProductQuantityAnalytics(
      supplierInvoices,
      branchKey,
      today,
      monthStart,
      prevMonthStart,
      monthStart  // prevMonthEnd is exclusive = current monthStart
    );
  }, [supplierInvoices, selectedBranch, today, monthStart, prevMonthStart, branches]);

  // ── Section 6: Inventory Analytics ───────────────────────────────────────────
  const inventoryAnalytics = useMemo(() => {
    const inventoryValue = execSummary.inventoryValue;

    const lowStock = inventory.filter(item => {
      const qty = item.quantity || 0;
      const threshold = item.low_stock_threshold || item.min_quantity || item.reorder_point || 0;
      return threshold > 0 && qty > 0 && qty <= threshold;
    });
    const outOfStock = inventory.filter(item => (item.quantity || 0) <= 0);
    const deadStock  = inventory.filter(item => {
      const qty = item.quantity || 0;
      const threshold = item.low_stock_threshold || item.min_quantity || item.reorder_point || 0;
      return qty > 0 && threshold === 0;
    }).slice(0, 3);
    const slowMoving = inventory
      .filter(item => (item.quantity || 0) > (item.low_stock_threshold || item.min_quantity || 0) * 3)
      .slice(0, 3);
    const fastMoving = inventory
      .filter(item => (item.quantity || 0) > 0 && (item.reorder_point || item.min_quantity || 0) > 0)
      .sort((a, b) => (b.quantity || 0) - (a.quantity || 0))
      .slice(0, 3);

    return { inventoryValue, fastMoving, slowMoving, lowStock, outOfStock, deadStock };
  }, [inventory, execSummary]);

  // ── Section 7: Cash Flow ─────────────────────────────────────────────────────
  const cashFlow = useMemo(() => {
    const moneyIn      = execSummary.salesToday;
    const expenses     =  (todayExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const moneyOut     = execSummary.purchasesToday + expenses;
    const ownerCapital = execSummary.ownerCapitalToday;
    const netCashFlow  = moneyIn - moneyOut + ownerCapital;
    return { moneyIn, moneyOut, ownerCapital, expenses, netCashFlow };
  }, [execSummary, todayExpenses]);

  // ── Section 8: Product Price Intelligence ────────────────────────────────────
  const priceIntelligence = useMemo(() => {
    const map = {};
    for (const row of priceHistory) {
      if (!map[row.product_id]) map[row.product_id] = [];
      map[row.product_id].push(row);
    }
    return Object.entries(map).slice(0, 5).map(([pid, rows]) => {
      const sorted   = rows.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
      const latest   = sorted[0];
      const previous = sorted[1];
      const diff     = latest && previous ? (latest.new_price || 0) - (previous.new_price || 0) : 0;
      const pct      = previous?.new_price > 0 ? (diff / previous.new_price) * 100 : 0;
      const since7d  = subDays(new Date(), 7).toISOString();
      const since30d = subDays(new Date(), 30).toISOString();
      return {
        product_id:    pid,
        product_name:  latest?.product_name || 'Unknown',
        latestPrice:   latest?.new_price || 0,
        previousPrice: previous?.new_price || latest?.old_price || 0,
        diff, pct,
        weeklyTrend:  rows.filter(r => r.recorded_at >= since7d).length,
        monthlyTrend: rows.filter(r => r.recorded_at >= since30d).length,
        yearlyTrend:  rows.length,
      };
    });
  }, [priceHistory]);

  // ── Section 9: Alerts ─────────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const salesDays    = new Set( (monthSales || []).map(s => s.date));
    const purchaseDays = new Set( (monthPurchases || []).map(p => p.date));
    const missingPurchaseDays = [...salesDays].filter(d => !purchaseDays.has(d)).length;
    const cashShortage        = todaySales.filter(r => (Number(r.cash_difference) || 0) < 0).length;
    const negativeProfit      = execSummary.netProfit < 0 ? 1 : 0;
    const inventoryAlerts     = inventoryAnalytics.lowStock.length + inventoryAnalytics.outOfStock.length;
    const customerCreditAlerts = customerDebts.filter(d => d.status !== 'paid' && d.status !== 'written_off').length;
    const supplierDueAlerts   = supplierInvoices.filter(inv => inv.status !== 'paid' && inv.due_date && inv.due_date <= today).length;
    return { missingPurchaseDays, cashShortage, negativeProfit, inventoryAlerts, customerCreditAlerts, supplierDueAlerts };
  }, [monthSales, monthPurchases, todaySales, execSummary, inventoryAnalytics, customerDebts, supplierInvoices, today]);

  const totalAlerts = useMemo(() => Object.values(alerts).reduce((s, v) => s + v, 0), [alerts]);



  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-28 max-w-2xl mx-auto">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-black text-foreground tracking-tight">{t('executive_dashboard')}</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 ml-7">{format(new Date(), 'EEEE, MMMM d yyyy')}</p>
        </div>
        <div className="flex items-center gap-2">
          {totalAlerts > 0 && (
            <button
              onClick={() => navigate('/alerts')}
              className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-full px-2 py-0.5 transition-colors cursor-pointer active:scale-95"
              aria-label={`${totalAlerts} alerts`}
            >
              {totalAlerts} {totalAlerts === 1 ? t('active_alert') : t('active_alerts')}
            </button>
          )}
          <ModeBadge />
          <Badge variant="outline" className="text-xs capitalize">{role}</Badge>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 0 — BRANCH SELECTOR  (always at top)
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-2">
        <BranchSelector
          branches={branches}
          selectedBranch={selectedBranch}
          onSelect={setSelectedBranch}
          t={t}
        />
        {/* Branch badge below selector */}
        <div className="flex items-center gap-1.5 px-1">
          {selectedBranch === 'all'
            ? <Globe className="w-3.5 h-3.5 text-primary" />
            : <MapPin className="w-3.5 h-3.5 text-primary" />
          }
          <span className="text-[11px] text-muted-foreground">
            {t('showing_data_for')}{' '}
            <strong className="text-foreground">
              {selectedBranch === 'all' ? `🌐 ${t('all_branches')}` : `📍 ${selectedBranchLabel}`}
            </strong>
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — EXECUTIVE SUMMARY
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <section>
          <SectionHeader icon={LayoutDashboard} title={t('executive_summary')} subtitle={t('todays_kpi')} color="blue" />
          {loadingSales ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <MetricCard title={t('todays_sales')}      value={fmt(execSummary.salesToday)}       subtitle={`${t('cash_label') || 'Cash'} ${fmt(execSummary.cashSalesToday)} · ${t('network_label') || 'Net'} ${fmt(execSummary.networkSalesToday)} · ${t('credit_label') || 'Credit'} ${fmt(execSummary.creditSalesToday)}`} icon={DollarSign}   color="green"  large onClick={() => navigate('/sales')} />
              <MetricCard title={t('todays_purchases')}  value={fmt(execSummary.purchasesToday)}   subtitle={t('approved_invoices')}          icon={ShoppingCart}  color="amber"  large onClick={() => navigate('/enterprise-purchases')} />
              <MetricCard title={t('gross_profit')}       value={fmt(execSummary.grossProfit)}      subtitle={t('sales_minus_purchases')}          icon={execSummary.grossProfit >= 0 ? TrendingUp : TrendingDown} color={execSummary.grossProfit >= 0 ? 'green' : 'red'} onClick={() => navigate('/profit-loss')} />
              <MetricCard title={t('todays_net_profit')} value={fmt(periodProfit.today.netProfit)} subtitle={t('net_profit_subtitle_daily')} icon={periodProfit.today.netProfit >= 0 ? TrendingUp : TrendingDown} color={periodProfit.today.netProfit >= 0 ? 'green' : 'red'} onClick={() => navigate('/profit-loss')} />
              <MetricCard title={t('cash_in_register')}   value={fmt(execSummary.cashInRegister)}   subtitle={t('latest_closing_cash')}        icon={Banknote}      color="blue"   onClick={() => navigate('/sales')} />
              <MetricCard
                title={t('daily_expenses')}
                value={fmtDecimal(expenseSummary.dailyExpense)}
                subtitle={t('monthly_expenses_div_days')}
                icon={Receipt}
                color="amber"
                onClick={() => navigate('/expenses')}
              />
              <MetricCard
                title={t('monthly_expenses')}
                value={fmt(expenseSummary.monthlyTotal)}
                subtitle={`${t('fixed_label')} ${fmt(expenseSummary.monthlyFixed)} + ${t('variable_label')} ${fmt(expenseSummary.monthlyVariable)}`}
                icon={Receipt}
                color={expenseSummary.monthlyTotal > 0 ? 'red' : 'green'}
                onClick={() => navigate('/expenses')}
              />
              <MetricCard title={t('yesterdays_net_profit')} value={fmt(periodProfit.yesterday.netProfit)} subtitle={t('net_profit_subtitle_daily')} icon={periodProfit.yesterday.netProfit >= 0 ? TrendingUp : TrendingDown} color={periodProfit.yesterday.netProfit >= 0 ? 'green' : 'red'} onClick={() => navigate('/profit-loss')} />
              <MetricCard title={t('weekly_net_profit')} value={fmt(periodProfit.week.netProfit)} subtitle={t('net_profit_subtitle_weekly')} icon={periodProfit.week.netProfit >= 0 ? TrendingUp : TrendingDown} color={periodProfit.week.netProfit >= 0 ? 'green' : 'red'} onClick={() => navigate('/profit-loss')} />
              <MetricCard title={t('monthly_net_profit')} value={fmt(periodProfit.month.netProfit)} subtitle={t('net_profit_subtitle_monthly')} icon={periodProfit.month.netProfit >= 0 ? TrendingUp : TrendingDown} color={periodProfit.month.netProfit >= 0 ? 'green' : 'red'} onClick={() => navigate('/profit-loss')} />
              {/* NETWORK BALANCE — 3-column row: Today / Yesterday / Month */}
              <div className="col-span-2 grid grid-cols-3 gap-2">
                <MetricCard title={t('network_today')}     value={fmt(execSummary.networkToday)}     subtitle={t('pos_network_today')}          icon={Wifi}  color="cyan"   onClick={() => navigate('/network-management')} />
                <MetricCard title={t('network_yesterday')} value={fmt(execSummary.networkYesterday)} subtitle={t('pos_network_yesterday')}      icon={Wifi}  color="cyan"   onClick={() => navigate('/network-management')} />
                <MetricCard title={t('month_network')}     value={fmt(execSummary.networkMonth)}     subtitle={t('pos_network_month')}  icon={Wifi}  color="cyan"   onClick={() => navigate('/network-management')} />
              </div>
              <MetricCard title={t('customer_credit')}    value={fmt(execSummary.customerCredit)}   subtitle={t('outstanding_receivables')}    icon={CreditCard}    color="purple" onClick={() => navigate('/debt-management')} />
              <MetricCard title={t('inventory_value')}    value={fmt(execSummary.inventoryValue)}   subtitle={t('at_cost_price')}              icon={Package}       color="indigo" onClick={() => navigate('/inventory')} />
              <MetricCard title={t('supplier_payables')}  value={fmt(execSummary.supplierPayables)} subtitle={t('outstanding_invoices')}       icon={Truck}         color="orange" onClick={() => navigate('/suppliers')} />
              <MetricCard title={t('owner_capital_today')} value={fmt(execSummary.ownerCapitalToday)} subtitle={t('cash_injected_today')}     icon={Wallet}        color="slate" />
              <MetricCard title={t('cash_shortage_today')} value={fmt(execSummary.cashShortageToday)} subtitle={t('not_sales_not_profit')}  icon={AlertTriangle} color={execSummary.cashShortageToday > 0 ? 'red' : 'green'} />
              <MetricCard title={t('cash_overage_today')}  value={fmt(execSummary.cashOverageToday)}  subtitle={t('excess_cash_on_hand')}     icon={CheckCircle2}  color={execSummary.cashOverageToday > 0 ? 'green' : 'slate'} />
            </div>
          )}
        </section>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — OPERATING RESULT  (NEVER REMOVE THIS WIDGET)
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <section>
          <SectionHeader icon={Scale} title={t('operating_result')} subtitle={t('sales_revenue_minus_purchases')} color="green" />
          <Card className={`border-2 ${operatingResult.result >= 0 ? 'border-emerald-200 dark:border-emerald-800' : 'border-red-200 dark:border-red-800'}`}>
            <CardContent className="p-4 space-y-1">
              <LedgerRow label={t('sales_revenue')}      value={fmt(operatingResult.salesRevenue)}      color="green" bold />
              <LedgerRow label={t('approved_purchases')} value={`− ${fmt(operatingResult.approvedPurchases)}`} color="amber" />
              <LedgerRow label={t('operating_result')}   value={fmt(operatingResult.result)}            color={operatingResult.result >= 0 ? 'green' : 'red'} bold separator />
            </CardContent>
          </Card>
        </section>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 3 — CASH RECONCILIATION
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <section>
          <SectionHeader icon={Wallet} title={t('cash_reconciliation')} subtitle={t('todays_cash_position')} color="amber" action={{ label: t('treasury') || 'Treasury', onClick: () => navigate('/treasury') }} />
          <Card>
            <CardContent className="p-4 space-y-1">
              <LedgerRow label={t('opening_cash')}        value={fmt(cashRecon.openingCash)}   color="blue" />
              <LedgerRow label={t('expected_cash')}       value={fmt(cashRecon.expectedCash)}  color="blue" />
              <LedgerRow label={t('actual_cash')}         value={fmt(cashRecon.actualCash)}    color={cashRecon.actualCash >= cashRecon.expectedCash ? 'green' : 'red'} />
              <LedgerRow label={t('cash_difference')}     value={fmt(cashRecon.cashDiff)}      color={cashRecon.cashDiff === 0 ? 'green' : cashRecon.cashDiff > 0 ? 'green' : 'red'} separator />
              <LedgerRow label={t('owner_contribution')}  value={fmt(cashRecon.ownerContrib)}  color="purple" />
              <LedgerRow label={t('remaining_difference')} value={fmt(cashRecon.remainingDiff)} color={cashRecon.remainingDiff === 0 ? 'green' : 'red'} />
              <LedgerRow label={t('closing_cash')}        value={fmt(cashRecon.closingCash)}   color="green" bold separator />
            </CardContent>
          </Card>
        </section>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 4 — SALES ANALYTICS
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <section>
          <SectionHeader icon={BarChart3} title={t('sales_analytics')} subtitle={t('multi_period_sales')} color="green" action={{ label: t('reports') || 'Reports', onClick: () => navigate('/reports') }} />
          <div className="grid grid-cols-2 gap-3">
            <MetricCard title={t('today_label')}            value={fmt(salesAnalytics.todayAmt)}     icon={DollarSign}    color="green" />
            <MetricCard title={t('yesterday_label')}        value={fmt(salesAnalytics.yesterdayAmt)} icon={Clock}         color="slate" />
            <MetricCard title={t('this_week')}        value={fmt(salesAnalytics.weekAmt)}      icon={Activity}      color="blue"   trend={salesAnalytics.weekGrowth}  trendLabel={t('vs_last_week')} />
            <MetricCard title={t('this_month')}       value={fmt(salesAnalytics.monthAmt)}     icon={BarChart3}     color="purple" trend={salesAnalytics.monthGrowth} trendLabel={t('vs_last_month')} />
            <MetricCard title={t('this_year')}        value={fmt(salesAnalytics.yearAmt)}      icon={TrendingUp}    color="indigo" />
            <MetricCard title={t('growth_pct')}         value={fmtPct(salesAnalytics.monthGrowth)} icon={TrendingUp}  color={salesAnalytics.monthGrowth >= 0 ? 'green' : 'red'} />
            <MetricCard title={t('avg_daily_sales')}  value={fmt(salesAnalytics.avgDailySales)} icon={Target}       color="cyan" />
            <MetricCard title={t('highest_sales_day')} value={fmt(salesAnalytics.highestDay)}  icon={ArrowUpRight}  color="green" />
            <MetricCard title={t('lowest_sales_day')}  value={fmt(salesAnalytics.lowestDay)}   icon={ArrowDownRight} color="amber" />
          </div>
        </section>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 4B — ADDITIONAL SALES SOURCES
          Dynamic cards — no hardcoded names — reads from sales_sources_json
          Respects branch filter and included_in_dashboard_kpi flag
      ══════════════════════════════════════════════════════════════════════ */}
      {additionalSources.length > 0 && (
        <WidgetErrorBoundary>
          <section>
            <SectionHeader
              icon={Building2}
              title={t('additional_sales_sources')}
              subtitle={t('delivery_catering_subtitle')}
              color="purple"
              action={{ label: t('reports') || 'Reports', onClick: () => navigate('/reports') }}
            />
            <div className="grid grid-cols-2 gap-3">
              {additionalSources.map((src, i) => {
                const colors = ['purple', 'cyan', 'orange', 'indigo', 'green', 'amber', 'blue', 'red'];
                const color = colors[i % colors.length];
                return (
                  <MetricCard
                    key={src.key || src.name}
                    title={src.name}
                    value={fmt(src.today)}
                    subtitle={`${t('yesterday_label')}: ${fmt(src.yesterday)} · ${t('this_month')}: ${fmt(src.month)}`}
                    icon={ShoppingBag}
                    color={color}
                    trend={src.growth}
                    trendLabel={t('yesterday_label')}
                  />
                );
              })}
            </div>
          </section>
        </WidgetErrorBoundary>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 5 — PURCHASE ANALYTICS
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <section>
          <SectionHeader icon={ShoppingCart} title={t('purchase_analytics')} subtitle={t('approved_invoices_branch')} color="amber" action={{ label: t('purchases') || 'Purchases', onClick: () => navigate('/enterprise-purchases') }} />
          <div className="grid grid-cols-2 gap-3">
            {/* A) Today's Purchases Card — approved invoices only */}
            <MetricCard
              title={t('today_purchases')}
              value={fmt(purchaseAnalytics.todayAmt)}
              subtitle={`${purchaseAnalytics.todayCount} ${t('approved_invoices')}`}
              icon={ShoppingCart}
              color="amber"
              large
              onClick={() => navigate('/enterprise-purchases')}
            />
            {/* B) Monthly Purchases Card — with branch filter */}
            <MetricCard
              title={t('monthly_purchases')}
              value={fmt(purchaseAnalytics.monthAmt)}
              subtitle={`${purchaseAnalytics.monthCount} ${t('approved_invoices')} · ${selectedBranch === 'all' ? t('all_branches') : selectedBranchLabel}`}
              icon={BarChart3}
              color="purple"
              large
              onClick={() => navigate('/enterprise-purchases')}
            />
            <MetricCard title={t('weekly_purchases')}  value={fmt(purchaseAnalytics.weekAmt)}         icon={Activity}     color="blue" />
            <MetricCard title={t('largest_invoice')}   value={fmt(purchaseAnalytics.largestPurchase)} icon={ArrowUpRight} color="red" />
            <MetricCard title={t('avg_invoice')}       value={fmt(purchaseAnalytics.avgPurchase)}     icon={Target}       color="slate" />
            {/* Supplier Payables = unpaid approved invoices */}
            <MetricCard
              title={t('supplier_payables')}
              value={fmt(purchaseAnalytics.outstandingPayables)}
              subtitle={t('unpaid_approved_invoices')}
              icon={CreditCard}
              color="orange"
              onClick={() => navigate('/enterprise-purchases')}
            />
            {/* Overdue Payables */}
            <MetricCard
              title={t('overdue_payables')}
              value={fmt(purchaseAnalytics.overduePayables)}
              subtitle={t('past_due_date')}
              icon={AlertTriangle}
              color={purchaseAnalytics.overduePayables > 0 ? 'red' : 'green'}
              onClick={() => navigate('/enterprise-purchases')}
            />
          </div>
          {purchaseAnalytics.supplierRanking.length > 0 && (
            <Card className="mt-3">
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t('supplier_ranking') || 'Supplier Ranking (Approved)'}</p>
                <div className="space-y-1.5">
                  {purchaseAnalytics.supplierRanking.map(([name, amount, count], i) => (
                    <div key={name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center text-white ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-orange-400' : 'bg-gray-400'}`}>{i + 1}</span>
                        <span className="text-xs font-medium text-foreground truncate max-w-[110px]">{name}</span>
                        <span className="text-[10px] text-muted-foreground">{count}x</span>
                      </div>
                      <span className="text-xs font-bold text-amber-600">{fmt(amount)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 5b — PRODUCT CONSUMPTION ANALYTICS (ERP)
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <section>
          <SectionHeader
            icon={BarChart3}
            title={t('product_consumption_analytics')}
            subtitle={`${t('purchase_items_branch')} · ${selectedBranch === 'all' ? t('all_branches') : selectedBranchLabel}`}
            color="purple"
            action={{ label: t('purchases') || 'Purchases', onClick: () => navigate('/enterprise-purchases') }}
          />

          {/* ── ERP KPI Summary Cards ───────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {productQuantityAnalytics.topConsumedToday && (
              <Card className="border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
                <CardContent className="p-3">
                  <p className="text-[10px] font-semibold text-purple-600 uppercase tracking-wider mb-1">{t('top_today')}</p>
                  <p className="text-xs font-bold text-foreground truncate">{productQuantityAnalytics.topConsumedToday.productName}</p>
                  <p className="text-[11px] font-black text-purple-700 dark:text-purple-400">
                    {productQuantityAnalytics.topConsumedToday.totalQuantity % 1 === 0
                      ? productQuantityAnalytics.topConsumedToday.totalQuantity
                      : productQuantityAnalytics.topConsumedToday.totalQuantity.toFixed(2)
                    } {productQuantityAnalytics.topConsumedToday.unit}
                  </p>
                </CardContent>
              </Card>
            )}
            {productQuantityAnalytics.topConsumedMonth && (
              <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                <CardContent className="p-3">
                  <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-1">{t('top_this_month')}</p>
                  <p className="text-xs font-bold text-foreground truncate">{productQuantityAnalytics.topConsumedMonth.productName}</p>
                  <p className="text-[11px] font-black text-blue-700 dark:text-blue-400">
                    {productQuantityAnalytics.topConsumedMonth.totalQuantity % 1 === 0
                      ? productQuantityAnalytics.topConsumedMonth.totalQuantity
                      : productQuantityAnalytics.topConsumedMonth.totalQuantity.toFixed(2)
                    } {productQuantityAnalytics.topConsumedMonth.unit}
                  </p>
                </CardContent>
              </Card>
            )}
            {productQuantityAnalytics.topConsumedPrevMonth && (
              <Card className="border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20">
                <CardContent className="p-3">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{t('top_prev_month')}</p>
                  <p className="text-xs font-bold text-foreground truncate">{productQuantityAnalytics.topConsumedPrevMonth.productName}</p>
                  <p className="text-[11px] font-black text-slate-600 dark:text-slate-400">
                    {productQuantityAnalytics.topConsumedPrevMonth.totalQuantity % 1 === 0
                      ? productQuantityAnalytics.topConsumedPrevMonth.totalQuantity
                      : productQuantityAnalytics.topConsumedPrevMonth.totalQuantity.toFixed(2)
                    } {productQuantityAnalytics.topConsumedPrevMonth.unit}
                  </p>
                </CardContent>
              </Card>
            )}
            {productQuantityAnalytics.highestCostMonth && (
              <Card className="border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20">
                <CardContent className="p-3">
                  <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wider mb-1">{t('highest_cost')}</p>
                  <p className="text-xs font-bold text-foreground truncate">{productQuantityAnalytics.highestCostMonth.productName}</p>
                  <p className="text-[11px] font-black text-orange-700 dark:text-orange-400">{fmt(productQuantityAnalytics.highestCostMonth.totalCost)}</p>
                </CardContent>
              </Card>
            )}
            {productQuantityAnalytics.fastestGrowing && (
              <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
                <CardContent className="p-3">
                  <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">{t('fastest_growing')}</p>
                  <p className="text-xs font-bold text-foreground truncate">{productQuantityAnalytics.fastestGrowing.productName}</p>
                  <p className="text-[11px] font-black text-emerald-700 dark:text-emerald-400">
                    +{productQuantityAnalytics.fastestGrowing.diff % 1 === 0
                      ? productQuantityAnalytics.fastestGrowing.diff
                      : productQuantityAnalytics.fastestGrowing.diff.toFixed(2)
                    } {productQuantityAnalytics.fastestGrowing.unit}
                  </p>
                </CardContent>
              </Card>
            )}
            {productQuantityAnalytics.mostReduced && (
              <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
                <CardContent className="p-3">
                  <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider mb-1">{t('most_reduced')}</p>
                  <p className="text-xs font-bold text-foreground truncate">{productQuantityAnalytics.mostReduced.productName}</p>
                  <p className="text-[11px] font-black text-red-700 dark:text-red-400">
                    {productQuantityAnalytics.mostReduced.diff % 1 === 0
                      ? productQuantityAnalytics.mostReduced.diff
                      : productQuantityAnalytics.mostReduced.diff.toFixed(2)
                    } {productQuantityAnalytics.mostReduced.unit}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Full ERP Product Table: Today / This Month / Prev Month / Diff / Trend ── */}
          {productQuantityAnalytics.combinedProducts.length === 0 ? (
            <Card className="border-dashed border-border/60">
              <CardContent className="p-4 text-center">
                <Package className="w-6 h-6 text-muted-foreground/40 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">{t('no_purchase_items')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-1 px-3 py-1">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{t('product_col')}</p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider text-right w-12">{t('today_col')}</p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider text-right w-14">{t('this_mo_col')}</p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider text-right w-14">{t('prev_mo_col')}</p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider text-right w-10">{t('trend_col')}</p>
              </div>
              {productQuantityAnalytics.combinedProducts.slice(0, 15).map((p) => {
                const trendColor = p.trend === '↑' ? 'text-emerald-600' : p.trend === '↓' ? 'text-red-500' : 'text-muted-foreground';
                const fmtQty = (q) => q % 1 === 0 ? String(q) : q.toFixed(1);
                return (
                  <div key={p.productId} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-1 items-center px-3 py-2.5 rounded-xl border border-border/60 bg-background hover:bg-muted/30 transition-colors">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{p.productName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-muted-foreground">{p.unit}</span>
                        <span className="text-[9px] text-muted-foreground">{t('cost_label')} {fmt(p.monthCost)}</span>
                        {p.prevMonthCost > 0 && (
                          <span className="text-[9px] text-muted-foreground">{t('prev_label')} {fmt(p.prevMonthCost)}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right w-12">
                      <p className="text-[11px] font-bold text-purple-700 dark:text-purple-400">{p.todayQty > 0 ? fmtQty(p.todayQty) : '—'}</p>
                    </div>
                    <div className="text-right w-14">
                      <p className="text-[11px] font-bold text-blue-700 dark:text-blue-400">{p.monthQty > 0 ? fmtQty(p.monthQty) : '—'}</p>
                    </div>
                    <div className="text-right w-14">
                      <p className="text-[11px] font-semibold text-muted-foreground">{p.prevMonthQty > 0 ? fmtQty(p.prevMonthQty) : '—'}</p>
                    </div>
                    <div className="text-right w-10">
                      <span className={`text-sm font-black ${trendColor}`}>{p.trend}</span>
                      {p.diff !== 0 && (
                        <p className={`text-[8px] font-semibold ${trendColor}`}>
                          {p.diff > 0 ? '+' : ''}{fmtQty(p.diff)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Weekly Trend ─────────────────────────────────────────────────── */}
          {productQuantityAnalytics.weeklyTrend.some(d => d.totalQuantity > 0) && (
            <Card className="border-border/60 mt-3">
              <CardContent className="p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t('seven_day_trend')}</p>
                <div className="flex items-end gap-1 h-16">
                  {productQuantityAnalytics.weeklyTrend.map((d) => {
                    const maxQty = Math.max(...productQuantityAnalytics.weeklyTrend.map(x => x.totalQuantity), 1);
                    const heightPct = maxQty > 0 ? (d.totalQuantity / maxQty) * 100 : 0;
                    const isToday = d.date === today;
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className={`w-full rounded-t-sm transition-all ${
                            isToday ? 'bg-purple-500' : 'bg-purple-200 dark:bg-purple-800'
                          }`}
                          style={{ height: `${Math.max(heightPct, 4)}%` }}
                          title={`${d.date}: ${d.totalQuantity} units, ${fmt(d.totalCost)}`}
                        />
                        <p className={`text-[8px] font-medium ${
                          isToday ? 'text-purple-600 font-bold' : 'text-muted-foreground'
                        }`}>
                          {d.date.slice(8)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 6 — INVENTORY ANALYTICS
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <section>
          <SectionHeader icon={Package} title={t('inventory_analytics')} subtitle={t('stock_health_overview')} color="indigo" action={{ label: t('inventory') || 'Inventory', onClick: () => navigate('/inventory') }} />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <MetricCard title={t('inventory_value')}  value={fmt(inventoryAnalytics.inventoryValue)} icon={Package}       color="indigo" large />
            <MetricCard title={t('low_stock_items_label')}  value={inventoryAnalytics.lowStock.length}      icon={AlertTriangle} color={inventoryAnalytics.lowStock.length > 0 ? 'amber' : 'green'} large onClick={() => navigate('/inventory')} />
            <MetricCard title={t('out_of_stock_label')}     value={inventoryAnalytics.outOfStock.length}    icon={XCircle}       color={inventoryAnalytics.outOfStock.length > 0 ? 'red' : 'green'} onClick={() => navigate('/inventory')} />
            <MetricCard title={t('dead_stock_items')} value={inventoryAnalytics.deadStock.length}     icon={Layers}        color="slate" />
          </div>
          {inventoryAnalytics.lowStock.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
              <CardContent className="p-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">{t('low_stock_items_label')}</p>
                <div className="space-y-1">
                  { (inventoryAnalytics.lowStock || []).slice(0, 5).map(item => (
                    <div key={item.id} className="flex items-center justify-between">
                      <span className="text-xs text-foreground truncate max-w-[160px]">{item.product_name}</span>
                      <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">{item.quantity} {t('left_label')}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {inventoryAnalytics.outOfStock.length > 0 && (
            <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 mt-2">
              <CardContent className="p-3">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2">{t('out_of_stock_label')}</p>
                <div className="space-y-1">
                  { (inventoryAnalytics.outOfStock || []).slice(0, 5).map(item => (
                    <div key={item.id} className="flex items-center justify-between">
                      <span className="text-xs text-foreground truncate max-w-[160px]">{item.product_name}</span>
                      <Badge variant="destructive" className="text-[10px]">{t('zero_units')}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 7 — CASH FLOW
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <section>
          <SectionHeader icon={Activity} title={t('cash_flow')} subtitle={t('todays_money_movement')} color="cyan" action={{ label: t('treasury') || 'Treasury', onClick: () => navigate('/treasury') }} />
          <Card>
            <CardContent className="p-4 space-y-1">
              <LedgerRow label={t('money_in')}      value={fmt(cashFlow.moneyIn)}                  color="green" />
              <LedgerRow label={t('money_out')}     value={`− ${fmt(cashFlow.moneyOut)}`}          color="red" />
              <LedgerRow label={t('owner_capital')} value={fmt(cashFlow.ownerCapital)}             color="purple" />
              <LedgerRow label={t('expenses_label')}      value={`− ${fmt(cashFlow.expenses)}`}          color="amber" />
              <LedgerRow label={t('net_cash_flow')} value={fmt(cashFlow.netCashFlow)}              color={cashFlow.netCashFlow >= 0 ? 'green' : 'red'} bold separator />
            </CardContent>
          </Card>
        </section>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 8 — PRODUCT PRICE INTELLIGENCE
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <section>
          <SectionHeader icon={TrendingUp} title={t('price_intelligence')} subtitle={t('price_changes_subtitle')} color="purple" action={{ label: t('products') || 'Products', onClick: () => navigate('/product-management') }} />
          {priceIntelligence.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-center text-xs text-muted-foreground">
                {t('no_price_changes')}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              { (priceIntelligence || []).map(item => (
                <Card key={item.product_id} className="border border-border/60">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-foreground truncate max-w-[160px]">{item.product_name}</span>
                      <span className={`text-xs font-bold flex items-center gap-0.5 ${item.diff > 0 ? 'text-red-600' : item.diff < 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                        {item.diff > 0 ? <ArrowUpRight className="w-3 h-3" /> : item.diff < 0 ? <ArrowDownRight className="w-3 h-3" /> : null}
                        {item.pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <p className="text-muted-foreground">{t('latest_label')}</p>
                        <p className="font-bold text-foreground">{fmt(item.latestPrice)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t('previous_label')}</p>
                        <p className="font-semibold text-muted-foreground">{fmt(item.previousPrice)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t('difference_label')}</p>
                        <p className={`font-bold ${item.diff > 0 ? 'text-red-600' : item.diff < 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                          {item.diff >= 0 ? '+' : ''}{fmt(item.diff)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
                      <span>{t('weekly_label')} <strong>{item.weeklyTrend}</strong></span>
                      <span>{t('monthly_label')} <strong>{item.monthlyTrend}</strong></span>
                      <span>{t('yearly_label')} <strong>{item.yearlyTrend}</strong></span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 9 — ALERTS
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <section>
          <SectionHeader icon={AlertTriangle} title={t('alerts_label')} subtitle={`${totalAlerts} ${totalAlerts === 1 ? t('active_alert') : t('active_alerts')}`} color="red" />
          <div className="space-y-2">
            <AlertRow icon={ShoppingBag}  title={t('missing_purchases')}       count={alerts.missingPurchaseDays}    severity={alerts.missingPurchaseDays > 0 ? 'amber' : 'green'}    onClick={() => navigate('/enterprise-purchases')} />
            <AlertRow icon={AlertTriangle} title={t('cash_shortage_alert')}  count={alerts.cashShortage}           severity={alerts.cashShortage > 0 ? 'critical' : 'green'}        onClick={() => navigate('/sales')} />
            <AlertRow icon={TrendingDown}  title={t('negative_profit')}        count={alerts.negativeProfit}         severity={alerts.negativeProfit > 0 ? 'critical' : 'green'}      onClick={() => navigate('/profit-loss')} />
            <AlertRow icon={Package}       title={t('inventory_alerts')}       count={alerts.inventoryAlerts}        severity={alerts.inventoryAlerts > 0 ? 'amber' : 'green'}        onClick={() => navigate('/inventory')} />
            <AlertRow icon={Users}         title={t('customer_credit_alerts')} count={alerts.customerCreditAlerts}   severity={alerts.customerCreditAlerts > 0 ? 'blue' : 'green'}    onClick={() => navigate('/debt-management')} />
            <AlertRow icon={Truck}         title={t('supplier_due_alerts')}    count={alerts.supplierDueAlerts}      severity={alerts.supplierDueAlerts > 0 ? 'high' : 'green'}       onClick={() => navigate('/suppliers')} />
          </div>
        </section>
      </WidgetErrorBoundary>



            {/* ── Price Changes Widget (existing component preserved) ── */}
      <WidgetErrorBoundary>
        <PriceChangesWidget />
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 10 — MODE-SPECIFIC WIDGETS (Auto-switches by Business Type)
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <section>
          <SectionHeader
            icon={Layers}
            title={t('mode_specific_insights')}
            subtitle={t('mode_specific_subtitle')}
            color="indigo"
          />
          <ModeSpecificDashboardSection
            lowStockItems={alerts.inventoryAlerts > 0 ? [] : []}
            expiryAlerts={[]}
            pendingOrders={[]}
          />
        </section>
      </WidgetErrorBoundary>
    </div>
  );
}
