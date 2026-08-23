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
import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, memo } from 'react';
import ModeBadge from '@/components/shared/ModeBadge';
import { ModeSpecificDashboardSection } from '@/components/dashboard/DashboardWidgetRegistry';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { useRole } from '@/lib/RoleContext';
import { useAuth } from '@/lib/AuthContext';
import { useNetworkSettlement } from '@/hooks/useNetworkSettlement';
import { useOwnerDashboardRealtime } from '@/hooks/useOwnerDashboardRealtime';
import { useActiveAlerts } from '@/hooks/useActiveAlerts';
import { useNotify } from '@/lib/useNotify';
import { calculateSalesRevenue, calculateERPAccounting, tagExpensesWithCategories, computeProductQuantityAnalytics } from '@/lib/helpers';
import { computeAdditionalSources } from '@/services/salesAnalyticsEngine';
import { buildActiveAlertCandidates, reconcileActiveAlerts } from '@/lib/activeAlertsEngine';
import { useSalesSources } from '@/hooks/useSalesSources';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
// SalesForm removed to enforce single ERP workspace entry point
import PriceChangesWidget from '@/components/dashboard/PriceChangesWidget';
import DriverPerformance from '@/components/dashboard/DriverPerformance';
import QuickActionsDock from '@/components/dashboard/QuickActionsDock';
import OwnerCopilotPanel from '@/components/dashboard/OwnerCopilotPanel';
import CustomizeDashboardDialog from '@/components/dashboard/CustomizeDashboardDialog';
import { useDashboardCustomization } from '@/hooks/useDashboardCustomization';
import { getDashboardCustomizationCopy } from '@/lib/dashboardCustomization';
import { computeProcurementKPIs } from '@/lib/procurementEngine';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package,
  Users, Truck, AlertTriangle, Wifi, CreditCard, Wallet,
  Receipt, Banknote, BarChart3,
  PackagePlus, ArrowLeftRight, FileText, ShoppingBag, Activity,
  Scale, Target, ChevronRight, ArrowUpRight, ArrowDownRight,
  CheckCircle2, XCircle, AlertCircle,
  LayoutDashboard, Layers, Clock, MapPin, Globe, ChevronDown,
  Building2, Radio, Settings2,
} from 'lucide-react';
import {
  format, startOfMonth, startOfWeek, startOfYear,
  endOfMonth, subDays, subWeeks, subMonths,
} from 'date-fns';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';

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

const SectionHeader = memo(({
  icon: Icon,
  title,
  subtitle,
  action,
  color = 'blue',
  summary,
  isExpanded,
  onToggle,
  controls,
}) => {
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
  const header = (
    <>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colorMap[color] || colorMap.blue}`}>
        {Icon && <Icon className="w-4 h-4" />}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <h2 className="truncate text-sm font-bold text-foreground leading-tight">{title}</h2>
        {subtitle && <p className="truncate text-[11px] text-muted-foreground leading-tight">{subtitle}</p>}
      </div>
      {summary !== undefined && summary !== null && (
        <span className="max-w-[8.5rem] truncate rounded-full bg-muted px-2 py-1 text-[10px] font-bold text-foreground sm:max-w-[12rem]">{summary}</span>
      )}
      {onToggle && <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none ${isExpanded ? 'rotate-180' : ''}`} />}
    </>
  );

  return (
    <div className="owner-dashboard-section-header mb-2 flex w-full min-w-0 max-w-full flex-wrap items-start gap-2 sm:flex-nowrap sm:items-center">
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 py-1 text-left transition-colors duration-200 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.99]"
          aria-expanded={isExpanded}
        >
          {header}
        </button>
      ) : <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1.5 py-1">{header}</div>}
      {controls}
      {action && (
        <button onClick={action.onClick} className="shrink-0 rounded-md px-1 py-1 text-xs text-primary hover:bg-primary/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {action.label} <ChevronRight className="inline h-3 w-3" />
        </button>
      )}
    </div>
  );
});

const DashboardCustomizationContext = createContext({});

const DashboardAccordionSection = memo(({
  id,
  expandedId,
  onToggle,
  icon,
  title,
  subtitle,
  summary,
  action,
  color,
  controls,
  children,
}) => {
  const widgetsById = useContext(DashboardCustomizationContext);
  const configuredWidget = widgetsById?.[id];
  if (configuredWidget?.isVisible === false) return null;
  const displayedTitle = configuredWidget?.title ?? title;
  const displayedSubtitle = configuredWidget?.description ?? subtitle;
  const expanded = expandedId === id;
  const order = Number.isInteger(configuredWidget?.order) ? configuredWidget.order : undefined;
  return (
    <section style={order === undefined ? undefined : { order }} className="w-full min-w-0 max-w-full rounded-2xl border border-border/60 bg-card/30 p-2.5 shadow-sm sm:p-3">
      <SectionHeader
        icon={icon}
        title={displayedTitle}
        subtitle={displayedSubtitle}
        summary={summary}
        action={action}
        color={color}
        controls={controls}
        isExpanded={expanded}
        onToggle={() => onToggle(id)}
      />
      <div className={`grid min-w-0 transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="min-h-0 min-w-0 overflow-hidden" aria-hidden={!expanded} inert={expanded ? undefined : ''}>
          <div className="pt-1">{children}</div>
        </div>
      </div>
    </section>
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
      className={`min-w-0 max-w-full border ${c.border} ${onClick ? 'cursor-pointer hover:shadow-md active:scale-[0.98]' : ''} transition-all duration-200`}
      onClick={onClick}
    >
      <CardContent className="p-3.5">
        <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${c.bg}`}>
            <Icon className={`w-4 h-4 ${c.icon}`} />
          </div>
          {trend !== undefined && (
            <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
        <p className={`break-words font-black leading-tight ${large ? 'text-xl' : 'text-lg'} ${c.val}`}>{value}</p>
        <p className="mt-0.5 break-words text-[11px] font-medium leading-tight text-muted-foreground">{title}</p>
        {subtitle && <p className="mt-0.5 break-words text-[10px] leading-tight text-muted-foreground/70">{subtitle}</p>}
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

// ─────────────────────────────────────────────────────────────────────────────
// BRANCH SELECTOR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const BranchSelector = memo(({ branches, selectedBranch, onSelect, t }) => {
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(() => {
    if (selectedBranch === 'all') return t('all_branches');
    const b = (branches || []).find((branch) => String(branch.id) === String(selectedBranch));
    return b ? (b.name || b.label || b.branch_key || selectedBranch) : selectedBranch;
  }, [selectedBranch, branches, t]);

  const isAll = selectedBranch === 'all';

  return (
    <div className="relative w-full min-w-0 max-w-full">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full min-w-0 max-w-full items-center justify-between gap-2 rounded-xl border-2 border-primary/30 bg-primary/5 px-3.5 py-2.5 transition-all hover:bg-primary/10 active:scale-[0.98]"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isAll
            ? <Globe className="w-4 h-4 text-primary shrink-0" />
            : <MapPin className="w-4 h-4 text-primary shrink-0" />
          }
          <div className="min-w-0 text-left">
            <p className="mb-0.5 text-[10px] font-semibold uppercase leading-none tracking-wider text-muted-foreground">{t('selected_branch')}</p>
            <p className="truncate text-sm font-bold leading-tight text-foreground">{selectedLabel}</p>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 w-full max-w-full overflow-hidden rounded-xl border border-border bg-background shadow-xl">
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
            const id = String(br.id);
            const name = br.name || br.label || br.branch_key || id;
            const isSelected = String(selectedBranch) === id;
            return (
              <button
                key={id}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-muted/60 transition-colors ${isSelected ? 'bg-primary/10' : ''}`}
                onClick={() => { onSelect(id); setOpen(false); }}
              >
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                  {br.address && <p className="truncate text-[10px] text-muted-foreground">{br.address}</p>}
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
// LIVE ACTIVITY FEED COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const EVENT_ICON_MAP = {
  daily_sales:            ShoppingBag,
  sales_invoices:         Receipt,
  purchases:              ShoppingCart,
  supplier_invoices:      FileText,
  purchase_orders:        FileText,
  expenses:               Banknote,
  products:               Package,
  product_categories:     Package,
  inventory:              PackagePlus,
  inventory_transfers:    ArrowLeftRight,
  inventory_transactions: PackagePlus,
  inventory_waste:        Package,
  suppliers:              Truck,
  customers:              Users,
  debt_records:           CreditCard,
  debt_payments:          DollarSign,
  wallet_transactions:    Wallet,
  cash_movements:         Banknote,
  cash_register_entries:  DollarSign,
  daily_cash_settlements: DollarSign,
  employees:              Users,
  payroll_runs:           Banknote,
  attendance:             Clock,
  drivers:                Truck,
  branches:               Building2,
  notifications:          AlertCircle,
  network_accounts:       Wifi,
  network_transfers:      ArrowLeftRight,
};

const LiveActivityFeed = memo(({ events, realtimeStatus }) => {
  const isConnected = realtimeStatus === 'SUBSCRIBED';
  const isConnecting = realtimeStatus === 'CONNECTING' || realtimeStatus === 'SUBSCRIBING';

  return (
    <Card className="border border-border/60">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground leading-tight">Live Activity Feed</h2>
              <p className="text-[11px] text-muted-foreground leading-tight">Real-time branch events</p>
            </div>
          </div>
          {/* Connection status badge */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold ${
            isConnected
              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
              : isConnecting
                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? 'bg-emerald-500 animate-pulse' : isConnecting ? 'bg-amber-500 animate-pulse' : 'bg-red-500'
            }`} />
            {isConnected ? 'LIVE' : isConnecting ? 'Connecting…' : 'Offline'}
          </div>
        </div>

        {/* Events list */}
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Radio className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">
              {isConnected ? 'Listening for branch activity…' : 'Waiting for connection…'}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {events.map((ev) => {
              const Icon = EVENT_ICON_MAP[ev.table] || Activity;
              const verbColor = ev.eventType === 'INSERT'
                ? 'text-emerald-600'
                : ev.eventType === 'DELETE'
                  ? 'text-red-500'
                  : 'text-blue-600';
              return (
                <div
                  key={ev.id}
                  className="flex items-start gap-2.5 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="w-6 h-6 rounded-md bg-background border border-border/60 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] leading-tight">
                      <span className="font-semibold text-foreground">{ev.branchPrefix}</span>
                      {' '}
                      <span className={`font-medium ${verbColor}`}>{ev.verb}</span>
                      {' '}
                      <span className="text-muted-foreground">{ev.label}</span>
                      {ev.detail ? <span className="text-muted-foreground"> {ev.detail}</span> : null}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {format(ev.timestamp, 'HH:mm:ss')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
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
          <CardContent className="p-4 flex items-center justify-between gap-3 text-red-600">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-xs font-medium">Unable to load this section. Try again.</span>
            </div>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="shrink-0 rounded-md border border-red-300 px-2 py-1 text-xs font-semibold hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              Retry
            </button>
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
  const {
    activeRestaurant,
    loadingRestaurants,
    loadingPortalIdentity,
    portalIdentityError,
    refetchRestaurants,
    refetchPortalIdentity,
  } = useTenant();
  const { user, isLoadingAuth, authError, checkUserAuth } = useAuth();
  const navigate = useNavigate();

  if (isLoadingAuth || loadingRestaurants || (activeRestaurant && loadingPortalIdentity)) {
    return <div className="space-y-4 p-4"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>;
  }

  if (!user || authError?.type === 'auth_required') {
    return (
      <Card className="mx-auto mt-10 max-w-md border-amber-200 bg-amber-50 dark:bg-amber-950/30">
        <CardContent className="space-y-3 p-5 text-center">
          <AlertCircle className="mx-auto h-6 w-6 text-amber-600" />
          <p className="text-sm font-semibold">Your session has expired. Please sign in again.</p>
          <button type="button" onClick={() => navigate('/erp-login')} className="rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">Sign in again</button>
        </CardContent>
      </Card>
    );
  }

  if (!activeRestaurant || portalIdentityError) {
    return (
      <Card className="mx-auto mt-10 max-w-md border-red-200 bg-red-50 dark:bg-red-950/30">
        <CardContent className="space-y-3 p-5 text-center">
          <AlertCircle className="mx-auto h-6 w-6 text-red-600" />
          <p className="text-sm font-semibold">Unable to load this section. Try again.</p>
          <button
            type="button"
            onClick={async () => { await checkUserAuth(); await refetchRestaurants(); await refetchPortalIdentity(); }}
            className="rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
          >
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  return <OwnerDashboardContent />;
}

function OwnerDashboardContent() {
  const { t, currency, lang } = useLanguage();
  const { branches, ownerFilter, orgId, activeRestaurant } = useTenant();
  const { role, can } = useRole();
  const { user } = useAuth();
  const navigate = useNavigate();
  const notif = useNotify();
  const { autoSettle } = useNetworkSettlement({ orgId, user, currency });
  const {
    selectedBranchId,
    selectedBranchKey,
    selectedBranchLabel,
    isAllBranches,
    setSelectedBranchId,
  } = useBranchScope();

  // ── ENTERPRISE REAL-TIME SYNCHRONIZATION ─────────────────────────────────
  // Subscribe to all ERP tables for this restaurant via Supabase Realtime.
  // Any INSERT/UPDATE/DELETE by any Branch Manager instantly invalidates the
  // affected React Query cache keys — no polling, no page refresh.
  const { liveEvents, realtimeStatus } = useOwnerDashboardRealtime(
    activeRestaurant?.id,
    branches,
  );
  const {
    alerts: persistedActiveAlerts,
    alertCount: activeAlertCount,
    isLoading: loadingActiveAlerts,
  } = useActiveAlerts();

  // The shared branch scope stores only an authenticated tenant branch UUID or `all`.
  // Local components retain the legacy variable name only as a read-only alias.
  const selectedBranch = selectedBranchId;
  const [expandedSection, setExpandedSection] = useState(null);
  const [isDashboardCustomizerOpen, setDashboardCustomizerOpen] = useState(false);
  const [isCopilotOpen, setCopilotOpen] = useState(false);
  const toggleSection = useCallback((sectionId) => {
    setExpandedSection((current) => current === sectionId ? null : sectionId);
  }, []);

  const activeBranchSignature = useMemo(
    () => (branches || []).map((branch) => String(branch.id || '')).filter(Boolean).join('|'),
    [branches],
  );

  // Sales-source configuration is scoped by canonical branch UUID and its cache key
  // includes that UUID, so changing branch cannot reuse all-branch revenue settings.
  const { revenueSources } = useSalesSources({
    branchId: isAllBranches ? undefined : selectedBranchId,
  });

  // Canonical branch reads always start with the active tenant. For a selected
  // branch, canonical UUID rows and legacy rows with no UUID are fetched as two
  // server-filtered result sets and de-duplicated. This preserves historical
  // branch-keyed data without using a branch name or downloading all tenant rows.
  const fetchBranchScopedRows = useCallback(async (table, {
    legacyColumn = 'branch',
    dateColumn,
    dateFrom,
    dateTo,
    filters = {},
    orderColumn = 'date',
    ascending = false,
    limit = 1000,
  } = {}) => {
    if (!activeRestaurant?.id) return [];
    const createQuery = () => {
      let query = supabase.from(table).select('*').eq('restaurant_id', activeRestaurant.id);
      if (dateColumn && dateFrom) query = query.gte(dateColumn, dateFrom);
      if (dateColumn && dateTo) query = query.lte(dateColumn, dateTo);
      Object.entries(filters).forEach(([column, value]) => {
        query = query.eq(column, value);
      });
      if (orderColumn) query = query.order(orderColumn, { ascending });
      return query.limit(limit);
    };
    if (isAllBranches) {
      const { data, error } = await createQuery();
      if (error) throw error;
      return data || [];
    }
    if (!selectedBranchId || !selectedBranchKey) return [];
    const [canonical, legacy] = await Promise.all([
      createQuery().eq('branch_id', selectedBranchId),
      createQuery().is('branch_id', null).eq(legacyColumn, selectedBranchKey),
    ]);
    if (canonical.error || legacy.error) throw canonical.error || legacy.error;
    return Array.from(new Map([...(canonical.data || []), ...(legacy.data || [])]
      .map((record) => [record.id, record])).values());
  }, [activeRestaurant?.id, isAllBranches, selectedBranchId, selectedBranchKey]);

  const { data: dashboardCustomizationMembership } = useQuery({
    queryKey: ['dashboard-customization-membership', activeRestaurant?.id, user?.id],
    enabled: Boolean(activeRestaurant?.id && user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('erp_memberships')
        .select('role, permissions')
        .eq('restaurant_id', activeRestaurant.id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const dashboardCustomization = useDashboardCustomization({
    restaurantId: activeRestaurant?.id,
    lang,
    t,
    selectedBranch,
    selectedBranchLabel,
    activeAlertCount,
  });
  const dashboardCopy = getDashboardCustomizationCopy(lang);
  const canCustomizeDashboard = role === 'owner'
    || can?.manageDashboardCustomization === true
    || dashboardCustomizationMembership?.permissions?.manageDashboardCustomization === true;

  const today       = format(new Date(), 'yyyy-MM-dd');
  const yesterday   = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const weekStart   = format(startOfWeek(new Date(), { weekStartsOn: 6 }), 'yyyy-MM-dd');
  const monthStart  = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const yearStart   = format(startOfYear(new Date()), 'yyyy-MM-dd');
  const prevWeekStart  = format(subWeeks(new Date(), 1), 'yyyy-MM-dd');
  const prevMonthStart = format(subMonths(new Date(), 1), 'yyyy-MM-dd');
  // 6-month trend: start of the month 5 months ago
  const sixMonthStart = format(startOfMonth(subMonths(new Date(), 5)), 'yyyy-MM-dd');

  const enabled = !!(activeRestaurant?.id);

  const fmt = useCallback((n) =>
    `${currency}${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, [currency]);
  const fmtDecimal = useCallback((n) =>
    `${currency}${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, [currency]);
  const fmtPct = useCallback((n) =>
    `${n >= 0 ? '+' : ''}${(n || 0).toFixed(1)}%`, []);

  // ── DATA QUERIES — every key includes tenant ID and selected branch UUID ──
  // This ensures React Query refetches immediately when the central scope changes.

  const { data: todaySales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['sales_today', activeRestaurant?.id, selectedBranchId, today],
    queryFn: () => fetchBranchScopedRows('daily_sales', { dateColumn: 'date', dateFrom: today, dateTo: today, limit: 100 }),
    staleTime: 15000,
    enabled,
  });

  const { data: yesterdaySales = [] } = useQuery({
    queryKey: ['sales_yesterday', activeRestaurant?.id, selectedBranchId, yesterday],
    queryFn: () => fetchBranchScopedRows('daily_sales', { dateColumn: 'date', dateFrom: yesterday, dateTo: yesterday, limit: 100 }),
    staleTime: 60000,
    enabled,
  });

  const { data: weekSales = [] } = useQuery({
    queryKey: ['sales_week', activeRestaurant?.id, selectedBranchId, weekStart],
    queryFn: () => fetchBranchScopedRows('daily_sales', { dateColumn: 'date', dateFrom: weekStart, dateTo: today, limit: 500 }),
    staleTime: 60000,
    enabled,
  });

  const { data: monthSales = [] } = useQuery({
    queryKey: ['sales_month', activeRestaurant?.id, selectedBranchId, monthStart],
    queryFn: () => fetchBranchScopedRows('daily_sales', { dateColumn: 'date', dateFrom: monthStart, dateTo: today, limit: 1000 }),
    staleTime: 60000,
    enabled,
  });

  const { data: yearSales = [] } = useQuery({
    queryKey: ['sales_year', activeRestaurant?.id, selectedBranchId, yearStart],
    queryFn: () => fetchBranchScopedRows('daily_sales', { dateColumn: 'date', dateFrom: yearStart, dateTo: today, limit: 5000 }),
    staleTime: 120000,
    enabled,
  });

  const { data: prevWeekSales = [] } = useQuery({
    queryKey: ['sales_prev_week', activeRestaurant?.id, selectedBranchId, prevWeekStart, weekStart],
    queryFn: () => fetchBranchScopedRows('daily_sales', { dateColumn: 'date', dateFrom: prevWeekStart, dateTo: yesterday, limit: 500 }),
    staleTime: 120000,
    enabled,
  });

  const { data: prevMonthSales = [] } = useQuery({
    queryKey: ['sales_prev_month', activeRestaurant?.id, selectedBranchId, prevMonthStart, monthStart],
    queryFn: () => fetchBranchScopedRows('daily_sales', { dateColumn: 'date', dateFrom: prevMonthStart, dateTo: format(subDays(new Date(monthStart), 1), 'yyyy-MM-dd'), limit: 1000 }),
    staleTime: 120000,
    enabled,
  });

  const { data: todayExpenses = [] } = useQuery({
    queryKey: ['expenses_today', activeRestaurant?.id, selectedBranchId, today],
    queryFn: () => fetchBranchScopedRows('expenses', { legacyColumn: 'branch_key', dateColumn: 'date', dateFrom: today, dateTo: today, limit: 200 }),
    staleTime: 15000,
    enabled,
  });

  const { data: yesterdayExpenses = [] } = useQuery({
    queryKey: ['expenses_yesterday', activeRestaurant?.id, selectedBranchId, yesterday],
    queryFn: () => fetchBranchScopedRows('expenses', { legacyColumn: 'branch_key', dateColumn: 'date', dateFrom: yesterday, dateTo: yesterday, limit: 200 }),
    staleTime: 60000,
    enabled,
  });

  const { data: weekExpenses = [] } = useQuery({
    queryKey: ['expenses_week', activeRestaurant?.id, selectedBranchId, weekStart],
    queryFn: () => fetchBranchScopedRows('expenses', { legacyColumn: 'branch_key', dateColumn: 'date', dateFrom: weekStart, dateTo: today, limit: 500 }),
    staleTime: 60000,
    enabled,
  });

  const { data: monthExpenses = [] } = useQuery({
    queryKey: ['expenses_month', activeRestaurant?.id, selectedBranchId, monthStart],
    queryFn: () => fetchBranchScopedRows('expenses', { legacyColumn: 'branch_key', dateColumn: 'date', dateFrom: monthStart, dateTo: today, limit: 500 }),
    staleTime: 60000,
    enabled,
  });

  // Previous month expenses — needed for Product Consumption Analytics
  const { data: prevMonthExpenses = [] } = useQuery({
    queryKey: ['expenses_prev_month', activeRestaurant?.id, selectedBranchId, prevMonthStart, monthStart],
    queryFn: () => fetchBranchScopedRows('expenses', { legacyColumn: 'branch_key', dateColumn: 'date', dateFrom: prevMonthStart, dateTo: format(subDays(new Date(monthStart), 1), 'yyyy-MM-dd'), limit: 500 }),
    staleTime: 120000,
    enabled,
  });

  // Year-to-date expenses — needed for Yearly Variable Expense KPI
  const { data: yearExpenses = [] } = useQuery({
    queryKey: ['expenses_year', activeRestaurant?.id, selectedBranchId, yearStart],
    queryFn: () => fetchBranchScopedRows('expenses', { legacyColumn: 'branch_key', dateColumn: 'date', dateFrom: yearStart, dateTo: today, limit: 2000 }),
    staleTime: 120000,
    enabled,
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

  const { data: supplierInvoices = [], isLoading: loadingSupplierInvoices } = useQuery({
    queryKey: ['supplier_invoices', activeRestaurant?.id, selectedBranchId, activeBranchSignature],
    queryFn: () => fetchBranchScopedRows('supplier_invoices', { legacyColumn: 'branch', limit: 5000 }),
    staleTime: 15000,
    enabled,
  });

  const { data: customerDebts = [], isLoading: loadingCustomerDebts } = useQuery({
    queryKey: ['debts_customer_dash', activeRestaurant?.id, selectedBranchId],
    queryFn: () => fetchBranchScopedRows('debt_records', {
      legacyColumn: 'branch',
      filters: { type: 'receivable', party_type: 'customer' },
      limit: 500,
    }),
    staleTime: 30000,
    enabled,
  });

  const { data: inventory = [], isLoading: loadingInventory } = useQuery({
    queryKey: ['inventory_dash', activeRestaurant?.id, selectedBranchId],
    queryFn: () => fetchBranchScopedRows('inventory', { legacyColumn: 'branch', orderColumn: 'product_name', ascending: true, limit: 500 }),
    staleTime: 60000,
    enabled,
  });

  const { data: networkAccounts = [] } = useQuery({
    queryKey: ['network_accounts_dash', activeRestaurant?.id, selectedBranchId],
    queryFn: () => fetchBranchScopedRows('network_accounts', { legacyColumn: 'branch_key', orderColumn: 'account_name', ascending: true, limit: 500 }),
    staleTime: 120000,
    enabled,
  });

  const { data: walletTransactions = [] } = useQuery({
    queryKey: ['wallet_transactions_dash', activeRestaurant?.id, selectedBranchId],
    queryFn: () => fetchBranchScopedRows('wallet_transactions', { legacyColumn: 'branch', orderColumn: 'transaction_date', limit: 1000 }),
    staleTime: 30000,
    enabled,
  });

  const { data: todayInvoices = [] } = useQuery({
    queryKey: ['sales_invoices_today', activeRestaurant?.id, selectedBranchId, today],
    queryFn: () => base44.entities.SalesInvoice
      ? fetchBranchScopedRows('sales_invoices', { legacyColumn: 'branch', dateColumn: 'sale_date', dateFrom: today, dateTo: today, orderColumn: 'created_date', limit: 100 })
      : Promise.resolve([]),
    staleTime: 15000,
    enabled,
  });

  const { data: priceHistory = [] } = useQuery({
    queryKey: ['price_history_dash', activeRestaurant?.id, selectedBranchId],
    queryFn: async () => {
      const createdBy = user?.email || ownerFilter?.created_by;
      if (!createdBy) return [];
      const since = subDays(new Date(), 30).toISOString();
      let query = supabase
        .from('product_price_history')
        .select('*')
        .eq('restaurant_id', activeRestaurant.id)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: false })
        .limit(50);
      if (!isAllBranches) query = query.eq('branch_id', selectedBranchId);
      const { data, error } = await query;
      if (error) { console.warn('price history error:', error.message); return []; }
      return data || [];
    },
    staleTime: 60000,
    enabled: !!activeRestaurant?.id,
  });

  // ── MEMOIZED CALCULATIONS ─────────────────────────────────────────────────────

  const sumSales = useCallback((arr) =>
     (arr || []).reduce((s, r) => s + (calculateSalesRevenue(r, revenueSources)?.total || 0), 0), [revenueSources]);

  const sumPurchaseCost = useCallback((arr) =>
     (arr || []).reduce((s, p) => s + ((p.qty || 0) * (p.used_price || p.current_price || 0)), 0), []);

  // ── Expense and Net-Profit Inputs ─────────────────────────────────────────────
  // The shared accounting engine receives a full calendar-month fixed-cost pool
  // and period-only variable expenses, so every owner KPI uses the same formulas.
  const taggedMonthExpenses = useMemo(
    () => tagExpensesWithCategories(monthExpenses, expenseCategories),
    [expenseCategories, monthExpenses],
  );
  const taggedPreviousMonthExpenses = useMemo(
    () => tagExpensesWithCategories(prevMonthExpenses, expenseCategories),
    [expenseCategories, prevMonthExpenses],
  );
  const taggedTodayExpenses = useMemo(
    () => tagExpensesWithCategories(todayExpenses, expenseCategories),
    [expenseCategories, todayExpenses],
  );
  const taggedYesterdayExpenses = useMemo(
    () => tagExpensesWithCategories(yesterdayExpenses, expenseCategories),
    [expenseCategories, yesterdayExpenses],
  );
  const taggedWeekExpenses = useMemo(
    () => tagExpensesWithCategories(weekExpenses, expenseCategories),
    [expenseCategories, weekExpenses],
  );
  const taggedYearExpenses = useMemo(
    () => tagExpensesWithCategories(yearExpenses, expenseCategories),
    [expenseCategories, yearExpenses],
  );

  const periodProfit = useMemo(() => {
    const isApprovedInvoice = invoice => (
      ['approved', 'auto_approved'].includes(invoice.approval_status)
      || ['approved', 'paid', 'partial', 'unpaid'].includes(invoice.status)
      || !invoice.approval_status
    );
    const approvedInvoices = (supplierInvoices || []).filter(isApprovedInvoice);
    const invoicesFor = (startDate, endDate) => approvedInvoices
      .filter(invoice => invoice.date >= startDate && invoice.date <= endDate);
    const weekDaysElapsed = Math.max(1, Math.round((new Date(`${today}T12:00:00`) - new Date(`${weekStart}T12:00:00`)) / 86400000) + 1);
    const createPeriod = ({ sales, startDate, endDate, expenses, fixedPool, rangeType, daysInPeriod }) => {
      const metrics = calculateERPAccounting({
        sales,
        purchases: invoicesFor(startDate, endDate),
        periodExpenses: expenses,
        monthlyExpenses: fixedPool,
        rangeType,
        revenueSources,
        daysInPeriod,
        asOfDate: endDate,
      });
      return {
        ...metrics,
        sales: metrics.totalSales,
        purchases: metrics.totalPurchaseCost,
        variableExpenses: metrics.totalVariableExpenses,
        fixedAllocation: metrics.fixedDeduction,
        expenses: metrics.totalExpenses,
      };
    };
    const yesterdayFixedPool = yesterday < monthStart ? taggedPreviousMonthExpenses : taggedMonthExpenses;

    return {
      today: createPeriod({
        sales: todaySales, startDate: today, endDate: today, expenses: taggedTodayExpenses,
        fixedPool: taggedMonthExpenses, rangeType: 'day', daysInPeriod: 1,
      }),
      yesterday: createPeriod({
        sales: yesterdaySales, startDate: yesterday, endDate: yesterday, expenses: taggedYesterdayExpenses,
        fixedPool: yesterdayFixedPool, rangeType: 'day', daysInPeriod: 1,
      }),
      week: createPeriod({
        sales: weekSales, startDate: weekStart, endDate: today, expenses: taggedWeekExpenses,
        fixedPool: taggedMonthExpenses, rangeType: 'week', daysInPeriod: Math.min(7, weekDaysElapsed),
      }),
      month: createPeriod({
        sales: monthSales, startDate: monthStart, endDate: today, expenses: taggedMonthExpenses,
        fixedPool: taggedMonthExpenses, rangeType: 'month', daysInPeriod: null,
      }),
    };
  }, [monthSales, monthStart, revenueSources, supplierInvoices, taggedMonthExpenses, taggedPreviousMonthExpenses, taggedTodayExpenses, taggedWeekExpenses, taggedYesterdayExpenses, today, todaySales, weekSales, weekStart, yesterday, yesterdaySales]);

  // Year variable expenses — computed outside periodProfit to avoid re-running the full engine
  // Variable = NOT fixed (same logic as calculateERPAccounting: !_is_fixed && !is_fixed)
  const yearVariableExpenses = useMemo(
    () => taggedYearExpenses
      .filter(e => !e._is_fixed && !e.is_fixed)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [taggedYearExpenses],
  );

  const expenseSummary = useMemo(() => ({
    daysInMonth: periodProfit.today.calendarDays,
    monthlyFixed: periodProfit.month.totalFixedExpenses,
    monthlyVariable: periodProfit.month.totalVariableExpenses,
    monthlyTotal: periodProfit.month.totalFixedExpenses + periodProfit.month.totalVariableExpenses,
    dailyFixedAllocation: periodProfit.today.fixedDeduction,
    dailyExpense: periodProfit.today.totalExpenses,
    todayVariable: periodProfit.today.totalVariableExpenses,
    yesterdayVariable: periodProfit.yesterday.totalVariableExpenses,
    weekVariable: periodProfit.week.totalVariableExpenses,
    weekFixedAllocation: periodProfit.week.fixedDeduction,
    weekDaysElapsed: periodProfit.week.periodDays,
    yearVariable: yearVariableExpenses,
  }), [periodProfit, yearVariableExpenses]);

  // ── 6-Month Trend Analytics ──────────────────────────────────────────────────
  // Aggregates Sales, Purchases, Fixed Expenses, Variable Expenses,
  // Gross Profit, and Net Profit for each of the last 6 calendar months.
  // Uses yearSales, supplierInvoices, yearExpenses, expenseCategories already
  // fetched above — no extra network requests.
  const sixMonthTrend = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const mStart = format(startOfMonth(d), 'yyyy-MM-dd');
      const mEnd   = format(endOfMonth(d),   'yyyy-MM-dd');
      const label  = format(d, 'MMM yy');

      // Sales
      const mSales = (yearSales || []).filter(s => s.date >= mStart && s.date <= mEnd);
      const totalSales = mSales.reduce((s, r) => s + (calculateSalesRevenue(r, revenueSources)?.total || 0), 0);

      // Purchases (approved supplier invoices)
      const isApproved = inv => (
        ['approved', 'auto_approved'].includes(inv.approval_status)
        || ['approved', 'paid', 'partial', 'unpaid'].includes(inv.status)
        || !inv.approval_status
      );
      const mInvoices = (supplierInvoices || []).filter(inv => isApproved(inv) && inv.date >= mStart && inv.date <= mEnd);
      const totalPurchases = mInvoices.reduce((s, inv) => s + (Number(inv.total_amount) || 0), 0);

      // Expenses — tag and split fixed vs variable
      const mExpenses = (yearExpenses || []).filter(e => e.date >= mStart && e.date <= mEnd);
      const taggedM   = tagExpensesWithCategories(mExpenses, expenseCategories);
      const fixedExp  = taggedM.filter(e => e._is_fixed || e.is_fixed).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const varExp    = taggedM.filter(e => !e._is_fixed && !e.is_fixed).reduce((s, e) => s + (Number(e.amount) || 0), 0);

      const grossProfit = totalSales - totalPurchases;
      const netProfit   = grossProfit - fixedExp - varExp;

      months.push({ month: label, Sales: Math.round(totalSales), Purchases: Math.round(totalPurchases), FixedExp: Math.round(fixedExp), VarExp: Math.round(varExp), GrossProfit: Math.round(grossProfit), NetProfit: Math.round(netProfit) });
    }
    return months;
  }, [yearSales, supplierInvoices, yearExpenses, expenseCategories, revenueSources]);

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

  // Reconcile only the enterprise view. Branch-filtered dashboards must never clear
  // alerts belonging to another branch.
  const activeAlertCandidates = useMemo(() => buildActiveAlertCandidates({
    inventory,
    todaySales,
    customerDebts,
    supplierInvoices,
    netProfit: execSummary.netProfit,
    branches,
    today,
    currency,
  }), [branches, currency, customerDebts, execSummary.netProfit, inventory, supplierInvoices, today, todaySales]);
  const activeAlertCandidateSignature = useMemo(
    () => JSON.stringify(activeAlertCandidates.map((alert) => ({
      source_key: alert.source_key,
      type: alert.type,
      severity: alert.severity,
      branch_id: alert.branch_id,
      message: alert.message,
    })).sort((a, b) => a.source_key.localeCompare(b.source_key))),
    [activeAlertCandidates],
  );
  const canReconcileActiveAlerts = enabled
    && selectedBranch === 'all'
    && !loadingSales
    && !loadingInventory
    && !loadingCustomerDebts
    && !loadingSupplierInvoices;

  useEffect(() => {
    if (!canReconcileActiveAlerts) return undefined;
    let cancelled = false;
    reconcileActiveAlerts({
      restaurantId: activeRestaurant.id,
      candidates: activeAlertCandidates,
    }).catch((error) => {
      if (!cancelled) console.warn('[OwnerDashboard] active alert reconciliation failed:', error.message);
    });
    return () => { cancelled = true; };
  }, [activeAlertCandidateSignature, activeAlertCandidates, activeRestaurant?.id, canReconcileActiveAlerts]);

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
    // Supplier invoices are already constrained by the central tenant-plus-branch
    // server query; do not re-filter them in the browser by a legacy branch key.
    const branchFilteredInvoices = supplierInvoices;

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
  }, [supplierInvoices, today]);

  // ── Section 5b: Product Quantity Analytics (ERP) ──────────────────────────────
  const productQuantityAnalytics = useMemo(() => {
    return computeProductQuantityAnalytics(
      supplierInvoices,
      isAllBranches ? 'all' : selectedBranchKey,
      today,
      monthStart,
      prevMonthStart,
      monthStart  // prevMonthEnd is exclusive = current monthStart
    );
  }, [supplierInvoices, isAllBranches, selectedBranchKey, today, monthStart, prevMonthStart]);

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

  // ── Section 9: Active Alerts ───────────────────────────────────────────────
  // The displayed count and rows are intentionally derived only from persisted,
  // unresolved active_alerts records. Financial heuristics are reconciled above.
  const dashboardActiveAlerts = useMemo(
    () => persistedActiveAlerts.slice(0, 5),
    [persistedActiveAlerts],
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <DashboardCustomizationContext.Provider value={dashboardCustomization.widgetsById}>
    <div className="w-full min-w-0 max-w-full space-y-6 pb-[calc(var(--quick-shortcuts-height)+1rem)] lg:pb-8">

      {/* ── HEADER ── */}
      <div className="flex w-full min-w-0 max-w-full flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full min-w-0 sm:w-auto">
          <div className="flex min-w-0 items-center gap-2">
            <LayoutDashboard className="h-5 w-5 shrink-0 text-primary" />
            <h1 className="min-w-0 break-words text-xl font-black tracking-tight text-foreground">{t('executive_dashboard')}</h1>
          </div>
          <p className="ml-7 mt-0.5 break-words text-xs text-muted-foreground">{format(new Date(), 'EEEE, MMMM d yyyy')}</p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <button
            onClick={() => navigate('/alerts')}
            className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-full px-2 py-0.5 transition-colors cursor-pointer active:scale-95"
            aria-label={`${activeAlertCount} ${activeAlertCount === 1 ? 'active alert' : 'active alerts'}`}
          >
            {loadingActiveAlerts ? '…' : activeAlertCount} {activeAlertCount === 1 ? t('active_alert') : t('active_alerts')}
          </button>
          {/* Real-time connection indicator */}
          <div
            title={`Realtime: ${realtimeStatus}`}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
              realtimeStatus === 'SUBSCRIBED'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${
              realtimeStatus === 'SUBSCRIBED' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400 animate-pulse'
            }`} />
            {realtimeStatus === 'SUBSCRIBED' ? 'LIVE' : 'Sync…'}
          </div>
          <ModeBadge />
          {canCustomizeDashboard && (
            <button
              type="button"
              onClick={() => setDashboardCustomizerOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{dashboardCopy.customizeDashboard}</span>
            </button>
          )}
          <Badge variant="outline" className="text-xs capitalize">{role}</Badge>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 0 — BRANCH SELECTOR  (always at top)
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="w-full min-w-0 max-w-full space-y-2">
        <BranchSelector
          branches={branches}
          selectedBranch={selectedBranch}
          onSelect={setSelectedBranchId}
          t={t}
        />
        {/* Branch badge below selector */}
        <div className="flex min-w-0 items-start gap-1.5 px-1">
          {selectedBranch === 'all'
            ? <Globe className="w-3.5 h-3.5 text-primary" />
            : <MapPin className="w-3.5 h-3.5 text-primary" />
          }
          <span className="min-w-0 break-words text-[11px] text-muted-foreground">
            {t('showing_data_for')}{' '}
            <strong className="text-foreground">
              {selectedBranch === 'all' ? `🌐 ${t('all_branches')}` : `📍 ${selectedBranchLabel}`}
            </strong>
          </span>
        </div>
      </div>

      <div className="flex w-full min-w-0 max-w-full flex-col gap-6">
      {/* ══════════════════════════════════════════════════════════════════════
          DRIVER PERFORMANCE — restaurant-wide, branch-filter aware
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <DashboardAccordionSection
          id="driver-analytics"
          expandedId={expandedSection}
          onToggle={toggleSection}
          icon={Truck}
          summary="Live data"
          color="cyan"
        >
          <DriverPerformance
            restaurantId={activeRestaurant?.id}
            branches={branches}
            selectedBranch={selectedBranch}
            currency={currency}
            title={dashboardCustomization.widgetsById['driver-analytics']?.title}
            description={dashboardCustomization.widgetsById['driver-analytics']?.description}
          />
        </DashboardAccordionSection>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          ENTERPRISE FINANCIAL CENTER — Quick Access Cards
          Six cards linking to: P&L, Oracle Analytics, Cash Flow,
          Balance Sheet, Branch Analytics, CEO Dashboard.
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <DashboardAccordionSection
          id="financial-center"
          expandedId={expandedSection}
          onToggle={toggleSection}
          icon={LayoutDashboard}
          summary="6 reports"
          color="purple"
        >
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
            {/* 1. Profit & Loss */}
            <button
              onClick={() => navigate('/profit-loss')}
              className="group flex w-full min-w-0 flex-col items-start gap-2 p-3.5 rounded-2xl border border-emerald-100 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 active:scale-95 transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                <FileText className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground leading-tight">Profit &amp; Loss</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Financial Report</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-emerald-500 self-end ml-auto" />
            </button>

            {/* 2. Oracle Analytics */}
            <button
              onClick={() => navigate('/oracle-analytics')}
              className="group flex w-full min-w-0 flex-col items-start gap-2 p-3.5 rounded-2xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 active:scale-95 transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground leading-tight">Oracle Analytics</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">6 Month Trend</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-indigo-500 self-end ml-auto" />
            </button>

            {/* 3. Cash Flow */}
            <button
              onClick={() => navigate('/cashflow')}
              className="group flex w-full min-w-0 flex-col items-start gap-2 p-3.5 rounded-2xl border border-blue-100 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 active:scale-95 transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground leading-tight">Cash Flow</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Cash In / Out</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-blue-500 self-end ml-auto" />
            </button>

            {/* 4. Balance Sheet */}
            <button
              onClick={() => navigate('/balance-sheet')}
              className="group flex w-full min-w-0 flex-col items-start gap-2 p-3.5 rounded-2xl border border-amber-100 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 active:scale-95 transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                <Scale className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground leading-tight">Balance Sheet</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Assets / Liabilities</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-amber-500 self-end ml-auto" />
            </button>

            {/* 5. Branch Analytics */}
            <button
              onClick={() => navigate('/branch-analytics')}
              className="group flex w-full min-w-0 flex-col items-start gap-2 p-3.5 rounded-2xl border border-cyan-100 dark:border-cyan-900/60 bg-cyan-50 dark:bg-cyan-950/30 hover:bg-cyan-100 dark:hover:bg-cyan-950/50 active:scale-95 transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-cyan-100 dark:bg-cyan-900/50 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-cyan-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground leading-tight">Branch Analytics</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Compare Branches</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-cyan-500 self-end ml-auto" />
            </button>

            {/* 6. Executive Dashboard */}
            <button
              onClick={() => navigate('/ceo-dashboard')}
              className="group flex w-full min-w-0 flex-col items-start gap-2 p-3.5 rounded-2xl border border-purple-100 dark:border-purple-900/60 bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-950/50 active:scale-95 transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                <Activity className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground leading-tight">Executive Dashboard</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">CEO View</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-purple-500 self-end ml-auto" />
            </button>
          </div>
        </DashboardAccordionSection>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 0B — 6-MONTH TREND ANALYTICS
          Shows Sales, Purchases, Fixed Expenses, Variable Expenses,
          Gross Profit, and Net Profit for the last 6 calendar months.
          Supports All Branches and Single Branch via selectedBranch.
          Auto-updates when any query key changes (transactions, branch).
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <DashboardAccordionSection
          id="six-month-trend"
          expandedId={expandedSection}
          onToggle={toggleSection}
          icon={BarChart3}
          summary={fmt(sixMonthTrend.at(-1)?.NetProfit || 0)}
          color="indigo"
          action={{ label: 'Reports', onClick: () => navigate('/reports') }}
        >
          <Card className="border-indigo-100 dark:border-indigo-900/60">
            <CardContent className="p-3">
              {/* Legend summary row */}
              <div className="flex flex-wrap gap-2 mb-3 text-[10px] font-semibold">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />Sales</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />Purchases</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-400 inline-block" />Fixed Exp</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-400 inline-block" />Var Exp</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded-sm bg-blue-500 inline-block" /><span className="w-1 inline-block" />Gross Profit</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded-sm bg-purple-500 inline-block" /><span className="w-1 inline-block" />Net Profit</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={sixMonthTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => {
                    if (Math.abs(v) >= 1000000) return `${(v/1000000).toFixed(1)}M`;
                    if (Math.abs(v) >= 1000) return `${(v/1000).toFixed(0)}k`;
                    return v;
                  }} />
                  <RechartsTooltip
                    formatter={(value, name) => [`${currency}${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, name]}
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  />
                  <Bar dataKey="Sales"     fill="#10b981" radius={[3,3,0,0]} maxBarSize={28} />
                  <Bar dataKey="Purchases" fill="#f59e0b" radius={[3,3,0,0]} maxBarSize={28} />
                  <Bar dataKey="FixedExp"  fill="#94a3b8" name="Fixed Exp"  radius={[3,3,0,0]} maxBarSize={28} />
                  <Bar dataKey="VarExp"    fill="#fb923c" name="Var Exp"    radius={[3,3,0,0]} maxBarSize={28} />
                  <Line type="monotone" dataKey="GrossProfit" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Gross Profit" />
                  <Line type="monotone" dataKey="NetProfit"   stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} name="Net Profit" />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </DashboardAccordionSection>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — EXECUTIVE SUMMARY
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <DashboardAccordionSection
          id="executive-summary"
          expandedId={expandedSection}
          onToggle={toggleSection}
          icon={LayoutDashboard}
          summary={fmt(execSummary.salesToday)}
          color="blue"
        >
          {loadingSales ? (
            <div className="grid min-w-0 grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : (
            <div className="grid min-w-0 grid-cols-2 gap-3">
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
              <div className="col-span-2 grid min-w-0 grid-cols-3 gap-2">
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
        </DashboardAccordionSection>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — OPERATING RESULT  (NEVER REMOVE THIS WIDGET)
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <DashboardAccordionSection
          id="operating-result"
          expandedId={expandedSection}
          onToggle={toggleSection}
          icon={Scale}
          summary={fmt(operatingResult.result)}
          color="green"
        >
          <Card className={`border-2 ${operatingResult.result >= 0 ? 'border-emerald-200 dark:border-emerald-800' : 'border-red-200 dark:border-red-800'}`}>
            <CardContent className="p-4 space-y-1">
              <LedgerRow label={t('sales_revenue')}      value={fmt(operatingResult.salesRevenue)}      color="green" bold />
              <LedgerRow label={t('approved_purchases')} value={`− ${fmt(operatingResult.approvedPurchases)}`} color="amber" />
              <LedgerRow label={t('operating_result')}   value={fmt(operatingResult.result)}            color={operatingResult.result >= 0 ? 'green' : 'red'} bold separator />
            </CardContent>
          </Card>
        </DashboardAccordionSection>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 3 — CASH RECONCILIATION
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <DashboardAccordionSection
          id="cash-reconciliation"
          expandedId={expandedSection}
          onToggle={toggleSection}
          icon={Wallet}
          summary={fmt(cashRecon.closingCash)}
          color="amber"
          action={{ label: t('treasury') || 'Treasury', onClick: () => navigate('/treasury') }}
        >
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
        </DashboardAccordionSection>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 4 — SALES ANALYTICS
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <DashboardAccordionSection
          id="sales-analytics"
          expandedId={expandedSection}
          onToggle={toggleSection}
          icon={BarChart3}
          summary={fmt(salesAnalytics.monthAmt)}
          color="green"
          action={{ label: t('reports') || 'Reports', onClick: () => navigate('/reports') }}
        >
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
        </DashboardAccordionSection>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 4B — ADDITIONAL SALES SOURCES
          Dynamic cards — no hardcoded names — reads from sales_sources_json
          Respects branch filter and included_in_dashboard_kpi flag
      ══════════════════════════════════════════════════════════════════════ */}
      {additionalSources.length > 0 && (
        <WidgetErrorBoundary>
          <DashboardAccordionSection
            id="additional-sales-sources"
            expandedId={expandedSection}
            onToggle={toggleSection}
            icon={Building2}
            summary={fmt(additionalSources.reduce((total, source) => total + (Number(source.today) || 0), 0))}
            color="purple"
            action={{ label: t('reports') || 'Reports', onClick: () => navigate('/reports') }}
          >
            <div className="grid min-w-0 grid-cols-2 gap-3">
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
          </DashboardAccordionSection>
        </WidgetErrorBoundary>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 5 — PURCHASE ANALYTICS
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <DashboardAccordionSection
          id="purchase-analytics"
          expandedId={expandedSection}
          onToggle={toggleSection}
          icon={ShoppingCart}
          summary={fmt(purchaseAnalytics.monthAmt)}
          color="amber"
          action={{ label: t('purchases') || 'Purchases', onClick: () => navigate('/enterprise-purchases') }}
        >
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
        </DashboardAccordionSection>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 5b — PRODUCT CONSUMPTION ANALYTICS (ERP)
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <DashboardAccordionSection
          id="product-consumption"
          expandedId={expandedSection}
          onToggle={toggleSection}
          icon={BarChart3}
          summary={`${productQuantityAnalytics.combinedProducts.length} products`}
          color="purple"
          action={{ label: t('purchases') || 'Purchases', onClick: () => navigate('/enterprise-purchases') }}
        >

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
        </DashboardAccordionSection>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 6 — INVENTORY ANALYTICS
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <DashboardAccordionSection
          id="inventory-analytics"
          expandedId={expandedSection}
          onToggle={toggleSection}
          icon={Package}
          summary={fmt(inventoryAnalytics.inventoryValue)}
          color="indigo"
          action={{ label: t('inventory') || 'Inventory', onClick: () => navigate('/inventory') }}
        >
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
        </DashboardAccordionSection>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 6B — VARIABLE EXPENSE KPIs
          Values come ONLY from Variable Expense records (non-fixed categories).
          Fixed Expenses are excluded.
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <DashboardAccordionSection
          id="variable-expenses"
          expandedId={expandedSection}
          onToggle={toggleSection}
          icon={Receipt}
          summary={fmt(expenseSummary.monthlyVariable)}
          color="amber"
          action={{ label: t('expenses_label') || 'Expenses', onClick: () => navigate('/expenses') }}
        >
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              title="Today Variable"
              value={fmt(expenseSummary.todayVariable)}
              subtitle="Variable expenses today"
              icon={Receipt}
              color={expenseSummary.todayVariable > 0 ? 'red' : 'green'}
              onClick={() => navigate('/expenses')}
            />
            <MetricCard
              title="Yesterday Variable"
              value={fmt(expenseSummary.yesterdayVariable)}
              subtitle="Variable expenses yesterday"
              icon={Receipt}
              color="slate"
              onClick={() => navigate('/expenses')}
            />
            <MetricCard
              title="Week Variable"
              value={fmt(expenseSummary.weekVariable)}
              subtitle="Variable expenses this week"
              icon={Receipt}
              color="amber"
              onClick={() => navigate('/expenses')}
            />
            <MetricCard
              title="Month Variable"
              value={fmt(expenseSummary.monthlyVariable)}
              subtitle="Variable expenses this month"
              icon={Receipt}
              color="orange"
              onClick={() => navigate('/expenses')}
            />
            <div className="col-span-2">
              <MetricCard
                title="Year Variable"
                value={fmt(expenseSummary.yearVariable)}
                subtitle="Variable expenses year-to-date"
                icon={Receipt}
                color={expenseSummary.yearVariable > 0 ? 'red' : 'green'}
                large
                onClick={() => navigate('/expenses')}
              />
            </div>
          </div>
        </DashboardAccordionSection>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 7 — CASH FLOW
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <DashboardAccordionSection
          id="cash-flow"
          expandedId={expandedSection}
          onToggle={toggleSection}
          icon={Activity}
          summary={fmt(cashFlow.netCashFlow)}
          color="cyan"
          action={{ label: t('treasury') || 'Treasury', onClick: () => navigate('/treasury') }}
        >
          <Card>
            <CardContent className="p-4 space-y-1">
              <LedgerRow label={t('money_in')}      value={fmt(cashFlow.moneyIn)}                  color="green" />
              <LedgerRow label={t('money_out')}     value={`− ${fmt(cashFlow.moneyOut)}`}          color="red" />
              <LedgerRow label={t('owner_capital')} value={fmt(cashFlow.ownerCapital)}             color="purple" />
              <LedgerRow label={t('expenses_label')}      value={`− ${fmt(cashFlow.expenses)}`}          color="amber" />
              <LedgerRow label={t('net_cash_flow')} value={fmt(cashFlow.netCashFlow)}              color={cashFlow.netCashFlow >= 0 ? 'green' : 'red'} bold separator />
            </CardContent>
          </Card>
        </DashboardAccordionSection>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 8 — PRODUCT PRICE INTELLIGENCE
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <DashboardAccordionSection
          id="price-intelligence"
          expandedId={expandedSection}
          onToggle={toggleSection}
          icon={TrendingUp}
          summary={`${priceIntelligence.length} changes`}
          color="purple"
          action={{ label: t('products') || 'Products', onClick: () => navigate('/product-management') }}
        >
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
        </DashboardAccordionSection>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 9 — ALERTS
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <DashboardAccordionSection
          id="active-alerts"
          expandedId={expandedSection}
          onToggle={toggleSection}
          icon={AlertTriangle}
          summary={loadingActiveAlerts ? 'Loading…' : `${activeAlertCount} active`}
          color="red"
          action={{ label: 'View all', onClick: () => navigate('/alerts') }}
        >
          {loadingActiveAlerts ? (
            <Skeleton className="h-24 w-full" />
          ) : dashboardActiveAlerts.length === 0 ? (
            <Card className="border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20">
              <CardContent className="p-4 flex items-center gap-3 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <div>
                  <p className="text-sm font-bold">0 Active Alerts</p>
                  <p className="text-xs opacity-80">No unresolved alert records require attention.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {dashboardActiveAlerts.map((alert) => {
                const branch = branches.find((item) => item.id === alert.branch_id || item.key === alert.branch || item.branch_key === alert.branch);
                const severityClass = {
                  critical: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
                  high: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
                  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
                  info: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
                }[alert.severity] || 'bg-muted text-muted-foreground';
                return (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => navigate('/alerts')}
                    className="w-full text-left rounded-xl border border-border bg-card p-3 hover:border-primary/50 hover:shadow-sm active:scale-[0.99] transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground truncate">{alert.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{alert.message}</p>
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted-foreground sm:grid-cols-5">
                          <span><strong>Type:</strong> {alert.type.replaceAll('_', ' ')}</span>
                          <span><strong>Branch:</strong> {branch?.name || branch?.label || alert.branch || 'All branches'}</span>
                          <span><strong>Date:</strong> {format(new Date(alert.detected_at), 'MMM d, HH:mm')}</span>
                          <span><strong>Severity:</strong> <b className={`rounded px-1.5 py-0.5 capitalize ${severityClass}`}>{alert.severity}</b></span>
                          <span><strong>Status:</strong> <b className="text-red-600">Active</b></span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </DashboardAccordionSection>
      </WidgetErrorBoundary>



            {/* ── Price Changes Widget (existing component preserved) ── */}
      <WidgetErrorBoundary>
        <DashboardAccordionSection
          id="price-changes"
          expandedId={expandedSection}
          onToggle={toggleSection}
          icon={TrendingUp}
          summary="Recent activity"
          color="purple"
        >
          <PriceChangesWidget />
        </DashboardAccordionSection>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 11 — LIVE ACTIVITY FEED (Enterprise Real-Time)
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <DashboardAccordionSection
          id="live-activity"
          expandedId={expandedSection}
          onToggle={toggleSection}
          icon={Radio}
          summary={realtimeStatus === 'SUBSCRIBED' ? 'LIVE' : 'Syncing'}
          color="green"
        >
          <LiveActivityFeed events={liveEvents} realtimeStatus={realtimeStatus} />
        </DashboardAccordionSection>
      </WidgetErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 10 — MODE-SPECIFIC WIDGETS (Auto-switches by Business Type)
      ══════════════════════════════════════════════════════════════════════ */}
      <WidgetErrorBoundary>
        <DashboardAccordionSection
          id="mode-insights"
          expandedId={expandedSection}
          onToggle={toggleSection}
          icon={Layers}
          summary="Operational"
          color="indigo"
        >
          <ModeSpecificDashboardSection
            lowStockItems={[]}
            expiryAlerts={[]}
            pendingOrders={[]}
          />
        </DashboardAccordionSection>
      </WidgetErrorBoundary>

      <QuickActionsDock onOpenCopilot={() => setCopilotOpen(true)} />
      </div>
    </div>
    <OwnerCopilotPanel
      open={isCopilotOpen}
      onOpenChange={setCopilotOpen}
      restaurantId={activeRestaurant?.id}
      selectedBranchId={selectedBranchId}
      selectedBranchLabel={selectedBranchLabel}
      role={role}
      can={can}
      currency={currency}
      lang={lang}
      userId={user?.id}
    />
    {canCustomizeDashboard && (
      <CustomizeDashboardDialog
        open={isDashboardCustomizerOpen}
        onOpenChange={setDashboardCustomizerOpen}
        widgets={dashboardCustomization.widgets}
        overrides={dashboardCustomization.overrides}
        lang={lang}
        onSave={dashboardCustomization.saveOverrides}
        isSaving={dashboardCustomization.isSaving}
      />
    )}
    </DashboardCustomizationContext.Provider>
  );
}
