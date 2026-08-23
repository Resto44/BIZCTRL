/**
 * Reports.jsx — ERP Sales Analytics Dashboard
 *
 * All calculations come exclusively from salesAnalyticsEngine.js.
 * 9 sections: Executive Summary, Sales Performance, Payment Analytics,
 * Additional Sources, Network Analytics, Branch Performance,
 * Cost Control, Profit Analysis, PDF Report.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { useSalesSources } from '@/hooks/useSalesSources';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus, DollarSign, BarChart3,
  ShoppingCart, CreditCard, Wifi, Building2, AlertTriangle,
  FileText, Loader2, CheckCircle2, ArrowUpRight, ArrowDownRight,
  ChevronDown, ChevronUp, Activity, Target, Package,
} from 'lucide-react';
import {
  computeExecutiveSummary,
  computeSalesPerformance,
  computePaymentAnalytics,
  computeNetworkAnalytics,
  computeBranchPerformance,
  computeCostControl,
  computeProfitAnalysis,
  generateRecommendations,
} from '@/services/salesAnalyticsEngine';
import { generateUltimatePDF } from '@/lib/pdfGenerator';
import { formatCurrency, formatPct, formatDate, getDateRange, computeProductQuantityAnalytics } from '@/lib/helpers';
import { format, startOfMonth } from 'date-fns';

// ─── Color palette ────────────────────────────────────────────────────────────
const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtC(val, currency) { return formatCurrency(val, currency); }
function fmtP(val) { return formatPct(val); }
function growthColor(v) {
  if (v === null || v === undefined) return 'text-muted-foreground';
  return v >= 0 ? 'text-emerald-600' : 'text-red-500';
}
function growthIcon(v) {
  if (v === null || v === undefined) return <Minus className="w-3 h-3" />;
  return v >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />;
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between bg-primary text-primary-foreground px-4 py-2.5 rounded-t-lg font-semibold text-sm"
      >
        <span className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4" />}
          {title}
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="border border-t-0 rounded-b-lg p-3 bg-background">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, trend, icon: Icon, color = 'blue' }) {
  const colorMap = {
    blue:   'bg-blue-50 border-blue-100 dark:bg-blue-950/40 dark:border-blue-900/70',
    green:  'bg-emerald-50 border-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-900/70',
    amber:  'bg-amber-50 border-amber-100 dark:bg-amber-950/40 dark:border-amber-900/70',
    red:    'bg-red-50 border-red-100 dark:bg-red-950/40 dark:border-red-900/70',
    purple: 'bg-purple-50 border-purple-100 dark:bg-purple-950/40 dark:border-purple-900/70',
    cyan:   'bg-cyan-50 border-cyan-100 dark:bg-cyan-950/40 dark:border-cyan-900/70',
    slate:  'bg-slate-50 border-slate-100 dark:bg-slate-900/60 dark:border-slate-700',
  };
  const iconColorMap = {
    blue: 'text-blue-500', green: 'text-emerald-500', amber: 'text-amber-500',
    red: 'text-red-500', purple: 'text-purple-500', cyan: 'text-cyan-500', slate: 'text-slate-400',
  };
  return (
    <div className={`rounded-lg border p-3 ${colorMap[color] || colorMap.blue}`}>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-base font-bold text-foreground mt-0.5 truncate">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
          {trend !== undefined && trend !== null && (
            <div className={`flex items-center gap-0.5 text-xs mt-1 font-medium ${growthColor(trend)}`}>
              {growthIcon(trend)}
              <span>{Math.abs(trend).toFixed(1)}% vs prev</span>
            </div>
          )}
        </div>
        {Icon && <Icon className={`w-5 h-5 flex-shrink-0 ${iconColorMap[color] || iconColorMap.blue}`} />}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Reports() {
  const { t, currency, lang, dir } = useLanguage();
  const { branches, activeRestaurant, isBranchScoped } = useTenant();
  const {
    selectedBranchId,
    selectedBranchKey,
    selectedBranchLabel,
    isAllBranches,
    branchFilter,
    setSelectedBranchId,
  } = useBranchScope();
  const { revenueSources, isLoading: loadingSources } = useSalesSources({
    branchId: isAllBranches ? undefined : selectedBranchId,
  });

  // Reports inherit the same tenant-authorized UUID selection as the Owner dashboard.
  // A branch UUID is always combined with the active restaurant ID; there is no
  // branch-name fallback and no independent report-page selection state.
  const hasScope = Boolean(activeRestaurant?.id);
  const salesFilter = branchFilter || {};
  const expenseFilter = branchFilter || {};
  const walletFilter = branchFilter || {};

  const fetchReportRows = async (table, legacyColumn = 'branch', orderColumn = 'date') => {
    if (!activeRestaurant?.id) return [];
    const createQuery = () => {
      let query = supabase.from(table).select('*').eq('restaurant_id', activeRestaurant.id);
      if (orderColumn) query = query.order(orderColumn, { ascending: false });
      return query.limit(2000);
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
  };

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['sales', 'reports', activeRestaurant?.id, selectedBranchId],
    queryFn: () => fetchReportRows('daily_sales'),
    staleTime: 120000,
    enabled: hasScope,
  });

  const { data: purchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ['purchases_erp', activeRestaurant?.id, selectedBranchId],
    queryFn: async () => {
      if (!activeRestaurant?.id) return [];
      const buildQuery = () => supabase
        .from('supplier_invoices')
        .select('*')
        .eq('restaurant_id', activeRestaurant.id)
        .in('status', ['approved', 'partial', 'paid'])
        .order('date', { ascending: false })
        .limit(2000);
      if (isAllBranches) {
        const { data, error } = await buildQuery();
        return error ? [] : (data || []);
      }
      const [canonicalResult, legacyResult] = await Promise.all([
        buildQuery().eq('branch_id', selectedBranchId),
        selectedBranchKey ? buildQuery().is('branch_id', null).eq('branch', selectedBranchKey) : Promise.resolve({ data: [] }),
      ]);
      if (canonicalResult.error || legacyResult.error) return [];
      return Array.from(new Map([...(canonicalResult.data || []), ...(legacyResult.data || [])]
        .map((record) => [record.id, record])).values());
    },
    staleTime: 120000,
    enabled: hasScope,
  });

  const { data: expenses = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ['expenses', 'reports', activeRestaurant?.id, selectedBranchId],
    queryFn: () => fetchReportRows('expenses', 'branch_key'),
    staleTime: 120000,
    enabled: hasScope,
  });

  const { data: walletTransactions = [] } = useQuery({
    queryKey: ['wallet_transactions', 'reports', activeRestaurant?.id, selectedBranchId],
    queryFn: () => fetchReportRows('wallet_transactions', 'branch', 'transaction_date'),
    staleTime: 60000,
    enabled: hasScope,
  });

  const { data: brandSettingsList = [] } = useQuery({
    queryKey: ['brand_settings'],
    queryFn: () => base44.entities.BrandSettings.list(),
  });

  // Expense categories — needed for fixed vs variable proration
  const { data: expenseCategories = [] } = useQuery({
    queryKey: ['expense_categories_reports'],
    queryFn: () => base44.entities.ExpenseCategory
      ? base44.entities.ExpenseCategory.list('sort_order', 500)
      : Promise.resolve([]),
    staleTime: 300000,
    enabled: hasScope,
  });

  const isLoading = loadingSales || loadingPurchases || loadingExpenses || loadingSources;

  // ── Analytics computations (all from engine) ───────────────────────────────
  const executive = useMemo(
    () => computeExecutiveSummary(sales, purchases, expenses, revenueSources, walletTransactions, expenseCategories),
    [sales, purchases, expenses, revenueSources, walletTransactions, expenseCategories]
  );

  const performance = useMemo(
    () => computeSalesPerformance(sales, revenueSources),
    [sales, revenueSources]
  );

  const payment = useMemo(
    () => computePaymentAnalytics(sales, revenueSources),
    [sales, revenueSources]
  );

  const network = useMemo(
    () => computeNetworkAnalytics(sales, walletTransactions),
    [sales, walletTransactions]
  );

  const scopedBranches = useMemo(
    () => isAllBranches
      ? branches
      : (branches || []).filter((branch) => String(branch.id) === String(selectedBranchId)),
    [branches, isAllBranches, selectedBranchId],
  );

  const branchPerf = useMemo(
    () => computeBranchPerformance(scopedBranches, sales, purchases, expenses, revenueSources, expenseCategories),
    [scopedBranches, sales, purchases, expenses, revenueSources, expenseCategories]
  );

  const cost = useMemo(
    () => computeCostControl(sales, purchases, expenses, revenueSources, expenseCategories),
    [sales, purchases, expenses, revenueSources, expenseCategories]
  );

  const profit = useMemo(
    () => computeProfitAnalysis(sales, purchases, expenses, revenueSources, expenseCategories),
    [sales, purchases, expenses, revenueSources, expenseCategories]
  );

  const recommendations = useMemo(
    () => generateRecommendations(executive, cost, branchPerf),
    [executive, cost, branchPerf]
  );

  // ── Product Quantity Analytics ─────────────────────────────────────────────
  const productQtyAnalytics = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    return computeProductQuantityAnalytics(purchases, isAllBranches ? 'all' : selectedBranchKey, today, monthStart);
  }, [purchases, isAllBranches, selectedBranchKey]);

  // ── PDF Generation ─────────────────────────────────────────────────────────
  const [pdfStatus, setPdfStatus] = useState('idle'); // idle | generating | done | error
  const [pdfError, setPdfError] = useState(null);

  const handleGeneratePDF = useCallback(async () => {
    setPdfStatus('generating');
    setPdfError(null);
    try {
      const dr = getDateRange('month');
      const inventory = await fetchReportRows('inventory');
      await generateUltimatePDF({
        sales, purchases, expenses,
        rangeType: 'month',
        fromStr: formatDate(dr.from),
        toStr: formatDate(dr.to),
        t, lang, currency,
        branches: scopedBranches || [],
        dir,
        brandSettings: brandSettingsList[0] || null,
        inventory,
        supplierInvoices: purchases,
        walletTransactions,
        revenueSources,
        expenseCategories,
      });
      setPdfStatus('done');
      setTimeout(() => setPdfStatus('idle'), 3000);
    } catch (e) {
      console.error('PDF error:', e);
      setPdfError(e.message || 'Generation failed');
      setPdfStatus('error');
    }
  }, [sales, purchases, expenses, scopedBranches, walletTransactions, revenueSources, expenseCategories, brandSettingsList, t, lang, currency, dir, activeRestaurant?.id, selectedBranchId, selectedBranchKey, isAllBranches]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        </div>
      </div>
    );
  }

  // ── PDF button ─────────────────────────────────────────────────────────────
  const PDFButton = (
    <Button
      size="sm"
      onClick={handleGeneratePDF}
      disabled={pdfStatus === 'generating'}
      variant={pdfStatus === 'done' ? 'outline' : 'default'}
      className={`gap-1.5 ${pdfStatus === 'done' ? 'text-emerald-600 border-emerald-300' : ''}`}
    >
      {pdfStatus === 'generating' ? (
        <><Loader2 className="w-4 h-4 animate-spin" />{t('generating_pdf')}</>
      ) : pdfStatus === 'done' ? (
        <><CheckCircle2 className="w-4 h-4" />{t('pdf_ready')}</>
      ) : (
        <><FileText className="w-4 h-4" />{t('generate_pdf_report')}</>
      )}
    </Button>
  );

  return (
    <div className="max-w-full overflow-x-hidden px-3 pb-8">
      <PageHeader title={t('erp_analytics')} action={PDFButton} />
      <div className="mb-3 rounded-lg border bg-card p-3 sm:flex sm:items-end sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="sales-analytics-branch" className="mb-1.5 block text-xs font-semibold text-foreground">Branch</label>
          <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
            <SelectTrigger id="sales-analytics-branch" className="w-full sm:max-w-sm">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {!isBranchScoped && <SelectItem value="all">All Branches</SelectItem>}
              {(branches || []).map((branch) => (
                <SelectItem key={branch.id} value={String(branch.id)}>
                  {branch.name || branch.label || branch.branch_key || branch.key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="mt-2 text-xs font-medium text-muted-foreground sm:mb-2 sm:mt-0">
          {isAllBranches ? 'Showing data for: All Branches' : `Showing data for: ${selectedBranchLabel}`}
        </p>
      </div>

      {pdfError && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-600 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300">
          {pdfError}
        </div>
      )}

      {/* ── 1. EXECUTIVE SUMMARY ─────────────────────────────────────────── */}
      <Section title={t('executive_summary')} icon={Activity} defaultOpen>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-2">
          <KPICard label={t('today')}        value={fmtC(executive.todaySales, currency)}    icon={DollarSign}  color="green" />
          <KPICard label={t('yesterday')}    value={fmtC(executive.yesterdaySales, currency)} icon={DollarSign}  color="slate" />
          <KPICard label={t('this_month')}   value={fmtC(executive.monthSales, currency)}    icon={BarChart3}   color="blue" />
          <KPICard label={t('year_sales')}   value={fmtC(executive.yearSales, currency)}     icon={TrendingUp}  color="purple" />
          <KPICard label={t('sales_growth_pct')} value={executive.salesGrowth != null ? `${executive.salesGrowth >= 0 ? '+' : ''}${executive.salesGrowth.toFixed(1)}%` : '—'} icon={executive.salesGrowth != null && executive.salesGrowth >= 0 ? TrendingUp : TrendingDown} color={executive.salesGrowth != null && executive.salesGrowth >= 0 ? 'green' : 'red'} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <KPICard label={t('gross_profit')}     value={fmtC(executive.grossProfit, currency)}  icon={Target}      color="green" />
          <KPICard label={t('net_profit')}        value={fmtC(executive.netProfit, currency)}    icon={Target}      color={executive.netProfit >= 0 ? 'green' : 'red'} />
          <KPICard label={t('profit_margin')}     value={fmtP(executive.profitMargin)}           icon={Activity}    color="cyan" />
          <KPICard label={t('avg_daily_revenue')} value={fmtC(executive.avgDailyRevenue, currency)} icon={BarChart3} color="amber" />
          <KPICard label={t('avg_ticket')}        value={fmtC(executive.avgTicket, currency)}    icon={ShoppingCart} color="blue" />
        </div>
      </Section>

      {/* ── 2. SALES PERFORMANCE ─────────────────────────────────────────── */}
      <Section title={t('sales_performance')} icon={TrendingUp}>
        {/* Best/Worst/Peak row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2 text-center dark:border-emerald-900/70 dark:bg-emerald-950/40">
            <p className="text-xs text-muted-foreground">{t('best_day')}</p>
            <p className="text-sm font-bold text-emerald-700 truncate">{performance.bestDay ? `${performance.bestDay.date?.slice(5)} — ${fmtC(performance.bestDay.total, currency)}` : '—'}</p>
          </div>
          <div className="rounded-lg border border-red-100 bg-red-50 p-2 text-center dark:border-red-900/70 dark:bg-red-950/40">
            <p className="text-xs text-muted-foreground">{t('worst_day')}</p>
            <p className="text-sm font-bold text-red-600 truncate">{performance.worstDay ? `${performance.worstDay.date?.slice(5)} — ${fmtC(performance.worstDay.total, currency)}` : '—'}</p>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-2 text-center dark:border-blue-900/70 dark:bg-blue-950/40">
            <p className="text-xs text-muted-foreground">{t('peak_day')}</p>
            <p className="text-sm font-bold text-blue-700">{performance.peakDay || '—'}</p>
            <p className="text-xs text-muted-foreground">{t('growth_direction')}: <span className={growthColor(performance.growthDirection === 'up' ? 1 : -1)}>{t(`growth_${performance.growthDirection}`)}</span></p>
          </div>
        </div>

        {/* Daily Sales Trend */}
        {performance.dailyTrend.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">{t('daily_sales_trend')}</p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={performance.dailyTrend}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d?.slice(5) || ''} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${currency}${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmtC(v, currency)} labelFormatter={l => l} />
                <Area type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Monthly Sales Trend */}
        {performance.monthlyTrend.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">{t('monthly_sales_trend')}</p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={performance.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${currency}${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmtC(v, currency)} />
                <Bar dataKey="total" fill="#2563eb" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Year Comparison */}
        {performance.yearComparison.some(d => d.currentYear > 0 || d.prevYear > 0) && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">{t('year_comparison')}</p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={performance.yearComparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${currency}${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmtC(v, currency)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="currentYear" fill="#2563eb" name="Current Year" radius={[2, 2, 0, 0]} />
                <Bar dataKey="prevYear" fill="#94a3b8" name="Prev Year" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* ── 3. PAYMENT ANALYTICS ─────────────────────────────────────────── */}
      <Section title={t('payment_analytics')} icon={CreditCard}>
        {/* Payment Mix Donut */}
        {payment.paymentMix.length > 0 && (
          <div className="mb-3 flex flex-col sm:flex-row gap-3 items-center">
            <div className="w-full sm:w-48 flex-shrink-0">
              <p className="text-xs font-semibold text-muted-foreground mb-1 text-center">{t('payment_mix')}</p>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={payment.paymentMix}
                    dataKey="value"
                    nameKey="name"
                    cx="50%" cy="50%"
                    outerRadius={60}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {payment.paymentMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => fmtC(v, currency)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 w-full overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 font-semibold text-muted-foreground">{t('name')}</th>
                    <th className="text-right py-1 font-semibold text-muted-foreground">{t('today')}</th>
                    <th className="text-right py-1 font-semibold text-muted-foreground">{t('yesterday')}</th>
                    <th className="text-right py-1 font-semibold text-muted-foreground">{t('this_month')}</th>
                    <th className="text-right py-1 font-semibold text-muted-foreground">{t('year_sales')}</th>
                    <th className="text-right py-1 font-semibold text-muted-foreground">{t('pct_of_month')}</th>
                  </tr>
                </thead>
                <tbody>
                  {payment.sources.map((src, i) => (
                    <tr key={src.key} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-1.5 font-medium">
                        <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: COLORS[i % COLORS.length] }} />
                        {src.name}
                      </td>
                      <td className="text-right py-1.5">{fmtC(src.today, currency)}</td>
                      <td className="text-right py-1.5">{fmtC(src.yesterday, currency)}</td>
                      <td className="text-right py-1.5 font-semibold">{fmtC(src.month, currency)}</td>
                      <td className="text-right py-1.5">{fmtC(src.year, currency)}</td>
                      <td className="text-right py-1.5">
                        <Badge variant="outline" className="text-xs">{fmtP(src.pctOfMonth)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Source Comparison Bar */}
        {payment.sources.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">{t('source_comparison')}</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={payment.sources} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => `${currency}${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={60} />
                <Tooltip formatter={v => fmtC(v, currency)} />
                <Bar dataKey="month" fill="#2563eb" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* ── 4. ADDITIONAL SALES SOURCES ──────────────────────────────────── */}
      <Section title={t('additional_sources')} icon={ShoppingCart}>
        {(() => {
          const additionalSrcs = (payment?.sources || []).filter(s => !['cash', 'network', 'credit'].includes(s.key));
          if (isLoading) {
            return (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            );
          }
          if (additionalSrcs.length === 0) {
            return (
              <div className="py-6 text-center">
                <ShoppingCart className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t('no_additional_sources') || 'No additional sales sources recorded for this period.'}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Configure sources in Settings → Sales Sources</p>
              </div>
            );
          }
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {additionalSrcs.map((src, i) => {
                const growth = src.yesterday > 0
                  ? ((src.today - src.yesterday) / src.yesterday) * 100
                  : src.today > 0 ? 100 : 0;
                return (
                  <KPICard
                    key={src.key || src.name || i}
                    label={src.name || '—'}
                    value={fmtC(src.today || 0, currency)}
                    sub={`${t('yesterday')}: ${fmtC(src.yesterday || 0, currency)} · ${t('this_month')}: ${fmtC(src.month || 0, currency)}`}
                    trend={growth}
                    color={['blue', 'green', 'amber', 'purple', 'cyan'][i % 5]}
                  />
                );
              })}
            </div>
          );
        })()}
      </Section>

      {/* ── 5. NETWORK ANALYTICS ─────────────────────────────────────────── */}
      <Section title={t('network_analytics_section')} icon={Wifi}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
          <KPICard label={t('today_network')}     value={fmtC(network.todayNetwork, currency)}     icon={Wifi}    color="blue" />
          <KPICard label={t('yesterday_network')} value={fmtC(network.yesterdayNetwork, currency)} icon={Wifi}    color="slate" />
          <KPICard label={t('month_network')}     value={fmtC(network.monthNetwork, currency)}     icon={Wifi}    color="cyan" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <KPICard label={t('settled')}            value={fmtC(network.settled, currency)}    icon={CheckCircle2} color="green" />
          <KPICard label={t('pending_settlement')} value={fmtC(network.pending, currency)}    icon={AlertTriangle} color={network.pending > 0 ? 'amber' : 'green'} />
          <KPICard label={t('net_difference')}     value={fmtC(network.difference, currency)} icon={Minus}        color={network.difference >= 0 ? 'blue' : 'red'} />
        </div>
      </Section>

      {/* ── 6. BRANCH PERFORMANCE ────────────────────────────────────────── */}
      {branchPerf.length > 0 && (
        <Section title={t('branch_performance')} icon={Building2}>
          {/* Best / Weakest highlight */}
          {branchPerf.length >= 2 && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                <p className="text-xs text-muted-foreground">{t('best_branch')}</p>
                <p className="font-bold text-emerald-700 text-sm truncate">{branchPerf[0]?.label}</p>
                <p className="text-xs text-emerald-600">{fmtC(branchPerf[0]?.profit, currency)} {t('profit')}</p>
              </div>
              <div className="rounded-lg border border-red-100 bg-red-50 p-2 dark:border-red-900/70 dark:bg-red-950/40">
                <p className="text-xs text-muted-foreground">{t('weakest_branch')}</p>
                <p className="font-bold text-red-600 text-sm truncate">{branchPerf[branchPerf.length - 1]?.label}</p>
                <p className="text-xs text-red-500">{fmtC(branchPerf[branchPerf.length - 1]?.profit, currency)} {t('profit')}</p>
              </div>
            </div>
          )}

          {/* Branch table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left py-1.5 px-2 font-semibold">{t('branch')}</th>
                  <th className="text-right py-1.5 px-2 font-semibold">{t('revenue')}</th>
                  <th className="text-right py-1.5 px-2 font-semibold">{t('purchase_cost')}</th>
                  <th className="text-right py-1.5 px-2 font-semibold">{t('total_expenses')}</th>
                  <th className="text-right py-1.5 px-2 font-semibold">{t('net_profit')}</th>
                  <th className="text-right py-1.5 px-2 font-semibold">{t('margin')}</th>
                </tr>
              </thead>
              <tbody>
                {branchPerf.map((b, i) => (
                  <tr key={b.key} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="py-1.5 px-2 font-medium">
                      {i === 0 && <span className="text-emerald-500 mr-1">▲</span>}
                      {i === branchPerf.length - 1 && branchPerf.length > 1 && <span className="text-red-400 mr-1">▼</span>}
                      {b.label}
                    </td>
                    <td className="text-right py-1.5 px-2">{fmtC(b.revenue, currency)}</td>
                    <td className="text-right py-1.5 px-2">{fmtC(b.purchase, currency)}</td>
                    <td className="text-right py-1.5 px-2">{fmtC(b.expense, currency)}</td>
                    <td className={`text-right py-1.5 px-2 font-bold ${b.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmtC(b.profit, currency)}</td>
                    <td className="text-right py-1.5 px-2">
                      <Badge variant={b.margin >= 15 ? 'default' : b.margin >= 5 ? 'secondary' : 'destructive'} className="text-xs">
                        {fmtP(b.margin)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Branch bar chart */}
          {branchPerf.length > 0 && (
            <div className="mt-3">
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={branchPerf}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${currency}${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => fmtC(v, currency)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="revenue" fill="#2563eb" name={t('revenue')} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="profit" fill="#10b981" name={t('profit')} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
      )}

      {/* ── 7. COST CONTROL ──────────────────────────────────────────────── */}
      <Section title={t('cost_control')} icon={AlertTriangle}>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <KPICard
            label={t('food_cost_pct')}
            value={fmtP(cost.foodCostPct)}
            sub={`Prev: ${fmtP(cost.prevFoodCostPct)}`}
            color={cost.foodCostPct > 40 ? 'red' : cost.foodCostPct > 30 ? 'amber' : 'green'}
          />
          <KPICard
            label={t('purchase_ratio')}
            value={fmtP(cost.purchaseRatio)}
            color={cost.purchaseRatio > 40 ? 'red' : cost.purchaseRatio > 30 ? 'amber' : 'green'}
          />
          <KPICard
            label={t('expense_ratio')}
            value={fmtP(cost.expenseRatio)}
            sub={`Prev: ${fmtP(cost.prevExpenseRatio)}`}
            color={cost.expenseRatio > 35 ? 'red' : cost.expenseRatio > 25 ? 'amber' : 'green'}
          />
        </div>
        {cost.alerts.length > 0 && (
          <div className="space-y-1">
            {cost.alerts.map((alert, i) => (
              <div key={i} className={`flex items-center gap-2 p-2 rounded text-xs ${alert.severity === 'critical' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>{t('cost_alert')}: {alert.type === 'food_cost' ? t('food_cost_pct') : t('expense_ratio')} {alert.delta ? `+${alert.delta.toFixed(1)}% vs prev` : `${alert.value?.toFixed(1)}%`}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── 8. PROFIT ANALYSIS ───────────────────────────────────────────── */}
      <Section title={t('profit_analysis')} icon={Target}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          <KPICard label={t('revenue')}       value={fmtC(profit.revenue, currency)}      icon={DollarSign} color="blue" />
          <KPICard label={t('purchase_cost')} value={fmtC(profit.purchaseCost, currency)} icon={ShoppingCart} color="amber" />
          <KPICard label={t('total_expenses')} value={fmtC(profit.expenses, currency)}    icon={AlertTriangle} color="amber" />
          <KPICard label={t('gross_profit')}  value={fmtC(profit.grossProfit, currency)}  icon={Target} color="green" />
          <KPICard label={t('net_profit')}    value={fmtC(profit.netProfit, currency)}    icon={Target} color={profit.netProfit >= 0 ? 'green' : 'red'} />
          <KPICard label={t('profit_margin')} value={fmtP(profit.margin)}                 icon={Activity} color="cyan" />
        </div>

        {/* Profit Trend */}
        {profit.profitTrend.length > 1 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">{t('profit_trend')}</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={profit.profitTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d?.slice(5) || ''} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${currency}${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmtC(v, currency)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="sales"  stroke="#2563eb" strokeWidth={2} dot={false} name={t('revenue')} />
                <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} dot={false} name={t('profit')} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* ── 9. PRODUCT CONSUMPTION ANALYTICS ────────────────────────────── */}
      <Section title="Product Consumption Analytics" icon={Package}>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {productQtyAnalytics.topConsumedMonth && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-2.5 dark:border-purple-900/70 dark:bg-purple-950/40">
              <p className="text-[10px] font-semibold text-purple-600 uppercase tracking-wider mb-1">Top Consumed (Month)</p>
              <p className="text-xs font-bold text-foreground truncate">{productQtyAnalytics.topConsumedMonth.productName}</p>
              <p className="text-sm font-black text-purple-700">
                {productQtyAnalytics.topConsumedMonth.totalQuantity % 1 === 0
                  ? productQtyAnalytics.topConsumedMonth.totalQuantity
                  : productQtyAnalytics.topConsumedMonth.totalQuantity.toFixed(2)
                } {productQtyAnalytics.topConsumedMonth.unit}
              </p>
            </div>
          )}
          {productQtyAnalytics.highestCostMonth && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5">
              <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wider mb-1">Highest Cost (Month)</p>
              <p className="text-xs font-bold text-foreground truncate">{productQtyAnalytics.highestCostMonth.productName}</p>
              <p className="text-sm font-black text-orange-700">{fmtC(productQtyAnalytics.highestCostMonth.totalCost, currency)}</p>
            </div>
          )}
        </div>
        {productQtyAnalytics.monthlyProducts.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Monthly Product Consumption</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1.5 px-2 font-semibold">#</th>
                    <th className="text-left py-1.5 px-2 font-semibold">Product</th>
                    <th className="text-right py-1.5 px-2 font-semibold">Qty</th>
                    <th className="text-right py-1.5 px-2 font-semibold">Unit</th>
                    <th className="text-right py-1.5 px-2 font-semibold">Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {productQtyAnalytics.monthlyProducts.slice(0, 15).map((p, i) => (
                    <tr key={p.productId} className={i % 2 === 0 ? 'bg-muted/20' : ''}>
                      <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5 px-2 font-medium truncate max-w-[120px]">{p.productName}</td>
                      <td className="py-1.5 px-2 text-right font-bold text-purple-700">
                        {p.totalQuantity % 1 === 0 ? p.totalQuantity : p.totalQuantity.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-muted-foreground">{p.unit}</td>
                      <td className="py-1.5 px-2 text-right font-semibold">{fmtC(p.totalCost, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {productQtyAnalytics.todayProducts.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Today's Product Usage</p>
            <div className="space-y-1.5">
              {productQtyAnalytics.todayProducts.slice(0, 8).map((p) => (
                <div key={p.productId} className="flex items-center justify-between rounded-lg border border-purple-100 bg-purple-50/60 px-2 py-1.5 dark:border-purple-900/70 dark:bg-purple-950/40">
                  <div>
                    <p className="text-xs font-semibold text-foreground">{p.productName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      <span className="font-bold text-purple-700">{p.totalQuantity % 1 === 0 ? p.totalQuantity : p.totalQuantity.toFixed(2)}</span> {p.unit}
                    </p>
                  </div>
                  <p className="text-xs font-bold">{fmtC(p.totalCost, currency)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {productQtyAnalytics.todayProducts.length === 0 && productQtyAnalytics.monthlyProducts.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No product consumption data. Add purchase invoices with line items.</p>
        )}
      </Section>

      {/* ── 10. PDF ERP REPORT ───────────────────────────────────────────── */}
      <Section title={t('generate_pdf_report')} icon={FileText}>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            10-page executive PDF: Executive Summary · Sales · Branches · Payment Sources · Network · Profit · Expenses · Inventory · Trends · Recommendations
          </p>
          {/* Recommendations preview */}
          {recommendations.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold">{t('recommendations')}</p>
              {recommendations.map((rec, i) => (
                <div key={i} className={`flex items-start gap-2 p-2 rounded text-xs ${
                  rec.severity === 'critical' ? 'bg-red-50 border border-red-200 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300' :
                  rec.severity === 'warning'  ? 'bg-amber-50 border border-amber-200 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300' :
                  'bg-emerald-50 border border-emerald-200 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300'
                }`}>
                  <span className="flex-shrink-0 mt-0.5">
                    {rec.severity === 'success' ? '✓' : rec.severity === 'critical' ? '⚠' : '→'}
                  </span>
                  <span>{rec.text}</span>
                </div>
              ))}
            </div>
          )}
          <div className="pt-1">
            {PDFButton}
          </div>
        </div>
      </Section>
    </div>
  );
}
