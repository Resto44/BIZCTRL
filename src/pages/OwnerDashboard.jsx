/**
 * OwnerDashboard — Multi-Branch ERP Control Tower
 *
 * BUSINESS RULES:
 *   Sales revenue is never modified by purchases or expenses.
 *   Gross profit = Sales - Approved Purchases.
 *   Net profit = Gross profit - ERP Expenses.
 *   Cash shortage is never treated as Sales or Profit.
 *   Every displayed value is calculated from tenant- and branch-scoped records.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, subDays } from 'date-fns';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Landmark,
  MapPin,
  Plus,
  Radio,
  Scale,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import QuickAddBranchDialog from '@/components/dashboard/QuickAddBranchDialog';
import { useActiveAlerts } from '@/hooks/useActiveAlerts';
import { useOwnerDashboardRealtime } from '@/hooks/useOwnerDashboardRealtime';
import { useSalesSources } from '@/hooks/useSalesSources';
import { buildActiveAlertCandidates, reconcileActiveAlerts } from '@/lib/activeAlertsEngine';
import { useAuth } from '@/lib/AuthContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { calculateERPAccounting, tagExpensesWithCategories } from '@/lib/helpers';
import { useLanguage } from '@/lib/LanguageContext';
import { useRole } from '@/lib/RoleContext';
import { normalizeSalesDashboardBranches } from '@/lib/salesDashboardBranches';
import { useTenant } from '@/lib/TenantContext';

const COPY = {
  en: {
    title: 'Multi-Branch Control Tower',
    subtitle: 'Live financial and operational command center',
    allBranches: 'All branches',
    live: 'Live',
    syncing: 'Syncing',
    today: 'Today',
    sales: 'Sales',
    netProfit: 'Net Profit',
    margin: 'Net Margin',
    vsYesterday: 'vs yesterday',
    noPriorData: 'No prior-day data',
    branchRanking: 'Branch Command Board',
    branchRankingHint: 'Ranked by today’s verified sales',
    health: 'Health',
    healthHelp: 'Health combines net margin, active alerts, and low-stock risk.',
    profit: 'Profit',
    noBranchData: 'No branch sales have been recorded today.',
    chartTitle: 'Branch Performance',
    chartHint: 'Today’s verified sales and net profit',
    cashPosition: 'Cash Position',
    cashHint: 'Current ERP liquidity snapshot',
    register: 'Cash Register',
    network: 'Network Sales',
    receivables: 'Receivables',
    risks: 'Branch Risks',
    risksHint: 'Active issues requiring owner attention',
    noRisks: 'No active branch risks. Operations are clear.',
    global: 'All branches',
    critical: 'Critical',
    high: 'High',
    warning: 'Medium',
    info: 'Low',
    addBranch: 'Add Branch',
    compare: 'Compare',
    reports: 'Reports',
    alerts: 'Alerts',
    viewAnalytics: 'View full branch analytics',
    retry: 'Retry',
    unable: 'Unable to load this section. Try again.',
    expired: 'Your session has expired. Please sign in again.',
    signIn: 'Sign in again',
    noData: 'No data',
  },
  fa: {
    title: 'مرکز کنترل چند شعبه',
    subtitle: 'فرماندهی زنده مالی و عملیاتی ERP',
    allBranches: 'تمام شعبه‌ها',
    live: 'زنده',
    syncing: 'در حال همگام‌سازی',
    today: 'امروز',
    sales: 'فروش',
    netProfit: 'سود خالص',
    margin: 'حاشیه سود خالص',
    vsYesterday: 'نسبت به دیروز',
    noPriorData: 'دادهٔ روز قبل موجود نیست',
    branchRanking: 'تابلوی فرمان شعبه‌ها',
    branchRankingHint: 'رتبه‌بندی بر اساس فروش تأییدشدهٔ امروز',
    health: 'سلامت',
    healthHelp: 'سلامت از حاشیه سود خالص، هشدارهای فعال و ریسک کمبود موجودی محاسبه می‌شود.',
    profit: 'سود',
    noBranchData: 'امروز هنوز فروش شعبه ثبت نشده است.',
    chartTitle: 'عملکرد شعبه‌ها',
    chartHint: 'فروش و سود خالص تأییدشدهٔ امروز',
    cashPosition: 'وضعیت نقدینگی',
    cashHint: 'نمای زندهٔ نقدینگی ERP',
    register: 'صندوق نقدی',
    network: 'فروش شبکه',
    receivables: 'مطالبات',
    risks: 'ریسک شعبه‌ها',
    risksHint: 'موارد فعالی که نیاز به توجه مالک دارند',
    noRisks: 'هیچ ریسک فعالی وجود ندارد؛ عملیات عادی است.',
    global: 'تمام شعبه‌ها',
    critical: 'بحرانی',
    high: 'زیاد',
    warning: 'متوسط',
    info: 'کم',
    addBranch: 'افزودن شعبه',
    compare: 'مقایسه',
    reports: 'گزارش‌ها',
    alerts: 'هشدارها',
    viewAnalytics: 'مشاهدهٔ تحلیل کامل شعبه‌ها',
    retry: 'تلاش دوباره',
    unable: 'بارگذاری این بخش ممکن نشد. دوباره تلاش کنید.',
    expired: 'نشست شما پایان یافته است. دوباره وارد شوید.',
    signIn: 'ورود دوباره',
    noData: 'بدون داده',
  },
  ar: {
    title: 'برج التحكم متعدد الفروع',
    subtitle: 'مركز القيادة المالية والتشغيلية المباشر',
    allBranches: 'جميع الفروع',
    live: 'مباشر',
    syncing: 'جارٍ التزامن',
    today: 'اليوم',
    sales: 'المبيعات',
    netProfit: 'صافي الربح',
    margin: 'هامش صافي الربح',
    vsYesterday: 'مقارنة بالأمس',
    noPriorData: 'لا توجد بيانات لليوم السابق',
    branchRanking: 'لوحة قيادة الفروع',
    branchRankingHint: 'الترتيب حسب مبيعات اليوم المؤكدة',
    health: 'الصحة',
    healthHelp: 'تجمع الصحة هامش الربح والتنبيهات النشطة ومخاطر المخزون.',
    profit: 'الربح',
    noBranchData: 'لم تُسجّل مبيعات للفروع اليوم بعد.',
    chartTitle: 'أداء الفروع',
    chartHint: 'مبيعات وصافي ربح اليوم المؤكد',
    cashPosition: 'المركز النقدي',
    cashHint: 'لقطة السيولة الحالية في ERP',
    register: 'الصندوق النقدي',
    network: 'مبيعات الشبكة',
    receivables: 'المستحقات',
    risks: 'مخاطر الفروع',
    risksHint: 'مشكلات نشطة تتطلب انتباه المالك',
    noRisks: 'لا توجد مخاطر نشطة؛ العمليات مستقرة.',
    global: 'جميع الفروع',
    critical: 'حرج',
    high: 'مرتفع',
    warning: 'متوسط',
    info: 'منخفض',
    addBranch: 'إضافة فرع',
    compare: 'مقارنة',
    reports: 'التقارير',
    alerts: 'التنبيهات',
    viewAnalytics: 'عرض تحليلات الفروع الكاملة',
    retry: 'إعادة المحاولة',
    unable: 'تعذر تحميل هذا القسم. حاول مجدداً.',
    expired: 'انتهت جلستك. يرجى تسجيل الدخول مجدداً.',
    signIn: 'تسجيل الدخول',
    noData: 'لا بيانات',
  },
};

const approvedPurchase = (record) => (
  ['approved', 'auto_approved'].includes(record?.approval_status)
  || ['approved', 'paid', 'partial'].includes(record?.status)
);

const numeric = (value) => Number(value) || 0;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function recordMatchesBranch(record, branch) {
  if (!record || !branch) return false;
  const recordBranchId = record.branch_id ? String(record.branch_id) : null;
  const branchId = branch.id ? String(branch.id) : null;
  const branchKey = branch.key || branch.branch_key;
  return Boolean(
    (recordBranchId && branchId && recordBranchId === branchId)
    || (branchKey && String(record.branch || '') === String(branchKey))
    || (branchKey && String(record.branch_key || '') === String(branchKey))
  );
}

function latestCashPosition(sales) {
  const latestByBranch = new Map();
  (sales || []).forEach((sale) => {
    const key = String(sale.branch_id || sale.branch || sale.branch_key || '__unassigned__');
    const timestamp = new Date(sale.updated_at || sale.created_at || `${sale.date || '1970-01-01'}T00:00:00`).getTime();
    const current = latestByBranch.get(key);
    if (!current || timestamp >= current.timestamp) latestByBranch.set(key, { sale, timestamp });
  });
  return Array.from(latestByBranch.values()).reduce((sum, item) => (
    sum + numeric(item.sale.closing_cash ?? item.sale.restaurant_cash ?? item.sale.cash)
  ), 0);
}

function healthScore({ metrics, alertCount, lowStockCount }) {
  if (metrics.totalSales <= 0) return null;
  const marginPoints = clamp(Math.round((metrics.netMargin + 10) * 1.5), 0, 60);
  const riskPoints = clamp(40 - (alertCount * 7) - (lowStockCount * 2), 0, 40);
  return clamp(marginPoints + riskPoints, 0, 100);
}

function percentageChange(current, previous) {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function branchLabelForAlert(alert, branches, fallback) {
  const branch = branches.find((item) => recordMatchesBranch(alert, item));
  return branch?.label || alert?.branch || fallback;
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-5" aria-busy="true">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="h-40 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-48 animate-pulse rounded-3xl bg-muted" />
        <div className="h-48 animate-pulse rounded-3xl bg-muted" />
      </div>
    </div>
  );
}

class WidgetErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-red-200 bg-red-50 p-5 text-center dark:border-red-900 dark:bg-red-950/40">
        <AlertCircle className="mx-auto h-6 w-6 text-red-600" />
        <p className="mt-3 text-sm font-semibold">Unable to load this section. Try again.</p>
        <button type="button" onClick={() => this.setState({ hasError: false })} className="mt-3 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Retry</button>
      </div>
    );
  }
}

function Trend({ value, copy, suffix = '%' }) {
  if (value === null || !Number.isFinite(value)) {
    return <span className="text-[10px] font-medium text-blue-100/75 sm:text-xs">{copy.noPriorData}</span>;
  }
  const positive = value >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold sm:text-xs ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>
      <Icon className="h-3.5 w-3.5" />{positive ? '+' : ''}{value.toFixed(1)}{suffix}
      <span className="hidden font-medium text-blue-100/70 min-[390px]:inline">{copy.vsYesterday}</span>
    </span>
  );
}

function HeroMetric({ label, value, change, copy, divider = false, changeSuffix }) {
  return (
    <div className={`min-w-0 px-2 text-center sm:px-5 ${divider ? 'border-s border-white/20' : ''}`}>
      <p className="truncate text-[11px] font-medium text-blue-100 sm:text-sm">{label}</p>
      <p className="mt-1 truncate text-lg font-black tracking-tight text-white sm:text-2xl">{value}</p>
      <div className="mt-1.5"><Trend value={change} copy={copy} suffix={changeSuffix} /></div>
    </div>
  );
}

function SectionHeading({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-black tracking-tight text-foreground sm:text-lg">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function OwnerDashboardContent() {
  const { currency, lang, isRTL } = useLanguage();
  const { branches, activeRestaurant } = useTenant();
  const { role } = useRole();
  const navigate = useNavigate();
  const copy = COPY[lang] || COPY.en;
  const {
    selectedBranchId,
    selectedBranchKey,
    selectedBranchLabel,
    isAllBranches,
    setSelectedBranchId,
  } = useBranchScope();
  const [isQuickAddBranchOpen, setQuickAddBranchOpen] = useState(false);
  const normalizedBranches = useMemo(
    () => normalizeSalesDashboardBranches(branches).filter((branch) => branch.is_active !== false),
    [branches],
  );
  const activeBranchSignature = useMemo(
    () => normalizedBranches.map((branch) => String(branch.id || branch.key)).join('|'),
    [normalizedBranches],
  );
  const { realtimeStatus } = useOwnerDashboardRealtime(activeRestaurant?.id, branches);
  const {
    alerts: persistedActiveAlerts,
    isLoading: loadingActiveAlerts,
  } = useActiveAlerts();
  const { revenueSources } = useSalesSources({
    branchId: isAllBranches ? undefined : selectedBranchId,
    branchKey: isAllBranches ? undefined : selectedBranchKey,
  });

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const enabled = !!(activeRestaurant?.id);

  const formatMoney = useCallback((value, decimals = 0) => {
    const amount = numeric(value).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return `${String(currency || 'SAR').trim()} ${amount}`;
  }, [currency]);

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

  const todaySalesQuery = useQuery({
    queryKey: ['sales_today', activeRestaurant?.id, selectedBranchId, today],
    queryFn: () => fetchBranchScopedRows('daily_sales', { dateColumn: 'date', dateFrom: today, dateTo: today, limit: 2000 }),
    staleTime: 15000,
    enabled,
  });
  const yesterdaySalesQuery = useQuery({
    queryKey: ['sales_yesterday', activeRestaurant?.id, selectedBranchId, yesterday],
    queryFn: () => fetchBranchScopedRows('daily_sales', { dateColumn: 'date', dateFrom: yesterday, dateTo: yesterday, limit: 2000 }),
    staleTime: 60000,
    enabled,
  });
  const todayExpensesQuery = useQuery({
    queryKey: ['expenses_today', activeRestaurant?.id, selectedBranchId, today],
    queryFn: () => fetchBranchScopedRows('expenses', { legacyColumn: 'branch_key', dateColumn: 'date', dateFrom: today, dateTo: today, limit: 2000 }),
    staleTime: 15000,
    enabled,
  });
  const yesterdayExpensesQuery = useQuery({
    queryKey: ['expenses_yesterday', activeRestaurant?.id, selectedBranchId, yesterday],
    queryFn: () => fetchBranchScopedRows('expenses', { legacyColumn: 'branch_key', dateColumn: 'date', dateFrom: yesterday, dateTo: yesterday, limit: 2000 }),
    staleTime: 60000,
    enabled,
  });
  const monthExpensesQuery = useQuery({
    queryKey: ['expenses_month', activeRestaurant?.id, selectedBranchId, monthStart],
    queryFn: () => fetchBranchScopedRows('expenses', { legacyColumn: 'branch_key', dateColumn: 'date', dateFrom: monthStart, dateTo: today, limit: 5000 }),
    staleTime: 60000,
    enabled,
  });
  const expenseCategoriesQuery = useQuery({
    queryKey: ['expense_categories_dash', activeRestaurant?.id],
    queryFn: () => base44.entities.ExpenseCategory
      ? base44.entities.ExpenseCategory.filter({ restaurant_id: activeRestaurant.id }, 'sort_order', 500)
      : Promise.resolve([]),
    staleTime: 300000,
    enabled,
  });
  const supplierInvoicesQuery = useQuery({
    queryKey: ['supplier_invoices', activeRestaurant?.id, selectedBranchId, activeBranchSignature],
    queryFn: () => fetchBranchScopedRows('supplier_invoices', { legacyColumn: 'branch', limit: 5000 }),
    staleTime: 15000,
    enabled,
  });
  const customerDebtsQuery = useQuery({
    queryKey: ['debts_customer_dash', activeRestaurant?.id, selectedBranchId],
    queryFn: () => fetchBranchScopedRows('debt_records', {
      legacyColumn: 'branch',
      filters: { type: 'receivable', party_type: 'customer' },
      limit: 2000,
    }),
    staleTime: 30000,
    enabled,
  });
  const inventoryQuery = useQuery({
    queryKey: ['inventory_dash', activeRestaurant?.id, selectedBranchId],
    queryFn: () => fetchBranchScopedRows('inventory', { legacyColumn: 'branch', orderColumn: 'product_name', ascending: true, limit: 5000 }),
    staleTime: 60000,
    enabled,
  });

  const todaySales = todaySalesQuery.data || [];
  const yesterdaySales = yesterdaySalesQuery.data || [];
  const todayExpenses = todayExpensesQuery.data || [];
  const yesterdayExpenses = yesterdayExpensesQuery.data || [];
  const monthExpenses = monthExpensesQuery.data || [];
  const expenseCategories = expenseCategoriesQuery.data || [];
  const supplierInvoices = supplierInvoicesQuery.data || [];
  const customerDebts = customerDebtsQuery.data || [];
  const inventory = inventoryQuery.data || [];
  const todayPurchases = useMemo(
    () => supplierInvoices.filter((invoice) => invoice.date === today && approvedPurchase(invoice)),
    [supplierInvoices, today],
  );
  const yesterdayPurchases = useMemo(
    () => supplierInvoices.filter((invoice) => invoice.date === yesterday && approvedPurchase(invoice)),
    [supplierInvoices, yesterday],
  );
  const taggedTodayExpenses = useMemo(
    () => tagExpensesWithCategories(todayExpenses, expenseCategories),
    [expenseCategories, todayExpenses],
  );
  const taggedYesterdayExpenses = useMemo(
    () => tagExpensesWithCategories(yesterdayExpenses, expenseCategories),
    [expenseCategories, yesterdayExpenses],
  );
  const taggedMonthExpenses = useMemo(
    () => tagExpensesWithCategories(monthExpenses, expenseCategories),
    [expenseCategories, monthExpenses],
  );
  const todayMetrics = useMemo(() => calculateERPAccounting({
    sales: todaySales,
    purchases: todayPurchases,
    periodExpenses: taggedTodayExpenses,
    monthlyExpenses: taggedMonthExpenses,
    rangeType: 'day',
    revenueSources,
    daysInPeriod: 1,
    asOfDate: today,
  }), [revenueSources, taggedMonthExpenses, taggedTodayExpenses, today, todayPurchases, todaySales]);
  const yesterdayMetrics = useMemo(() => calculateERPAccounting({
    sales: yesterdaySales,
    purchases: yesterdayPurchases,
    periodExpenses: taggedYesterdayExpenses,
    monthlyExpenses: taggedMonthExpenses,
    rangeType: 'day',
    revenueSources,
    daysInPeriod: 1,
    asOfDate: yesterday,
  }), [revenueSources, taggedMonthExpenses, taggedYesterdayExpenses, yesterday, yesterdayPurchases, yesterdaySales]);

  const scopedAlerts = useMemo(() => (
    isAllBranches
      ? persistedActiveAlerts
      : persistedActiveAlerts.filter((alert) => (
        String(alert.branch_id || '') === String(selectedBranchId || '')
        || (!alert.branch_id && String(alert.branch || '') === String(selectedBranchKey || ''))
      ))
  ), [isAllBranches, persistedActiveAlerts, selectedBranchId, selectedBranchKey]);

  const visibleBranches = useMemo(() => (
    isAllBranches
      ? normalizedBranches
      : normalizedBranches.filter((branch) => String(branch.id) === String(selectedBranchId))
  ), [isAllBranches, normalizedBranches, selectedBranchId]);

  const branchRankings = useMemo(() => visibleBranches.map((branch) => {
    const branchSales = todaySales.filter((record) => recordMatchesBranch(record, branch));
    const branchPurchases = todayPurchases.filter((record) => recordMatchesBranch(record, branch));
    const branchTodayExpenses = taggedTodayExpenses.filter((record) => recordMatchesBranch(record, branch));
    const branchMonthExpenses = taggedMonthExpenses.filter((record) => recordMatchesBranch(record, branch));
    const branchInventory = inventory.filter((record) => recordMatchesBranch(record, branch));
    const branchAlerts = scopedAlerts.filter((record) => recordMatchesBranch(record, branch));
    const metrics = calculateERPAccounting({
      sales: branchSales,
      purchases: branchPurchases,
      periodExpenses: branchTodayExpenses,
      monthlyExpenses: branchMonthExpenses,
      rangeType: 'day',
      revenueSources,
      daysInPeriod: 1,
      asOfDate: today,
    });
    const lowStockCount = branchInventory.filter((item) => {
      const quantity = numeric(item.quantity ?? item.opening_stock);
      const threshold = numeric(item.low_stock_threshold ?? item.min_quantity ?? item.reorder_point);
      return quantity <= 0 || (threshold > 0 && quantity <= threshold);
    }).length;
    return {
      ...branch,
      metrics,
      alerts: branchAlerts.length,
      lowStockCount,
      health: healthScore({ metrics, alertCount: branchAlerts.length, lowStockCount }),
    };
  }).sort((left, right) => right.metrics.totalSales - left.metrics.totalSales), [
    inventory,
    revenueSources,
    scopedAlerts,
    taggedMonthExpenses,
    taggedTodayExpenses,
    today,
    todayPurchases,
    todaySales,
    visibleBranches,
  ]);

  const activeAlertCandidates = useMemo(() => buildActiveAlertCandidates({
    inventory,
    todaySales,
    customerDebts,
    supplierInvoices,
    netProfit: todayMetrics.netProfit,
    branches: normalizedBranches,
    today,
    currency: `${String(currency || 'SAR').trim()} `,
  }), [currency, customerDebts, inventory, normalizedBranches, supplierInvoices, today, todayMetrics.netProfit, todaySales]);
  const activeAlertCandidateSignature = useMemo(
    () => JSON.stringify(activeAlertCandidates.map((alert) => ({
      source_key: alert.source_key,
      severity: alert.severity,
      message: alert.message,
    })).sort((left, right) => left.source_key.localeCompare(right.source_key))),
    [activeAlertCandidates],
  );
  const canReconcileActiveAlerts = enabled
    && isAllBranches
    && !todaySalesQuery.isLoading
    && !supplierInvoicesQuery.isLoading
    && !customerDebtsQuery.isLoading
    && !inventoryQuery.isLoading;

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
  }, [activeAlertCandidateSignature, activeAlertCandidates, activeRestaurant.id, canReconcileActiveAlerts]);

  const loading = [
    todaySalesQuery,
    yesterdaySalesQuery,
    todayExpensesQuery,
    monthExpensesQuery,
    expenseCategoriesQuery,
    supplierInvoicesQuery,
    customerDebtsQuery,
    inventoryQuery,
  ].some((query) => query.isLoading);
  const hasQueryError = [
    todaySalesQuery,
    todayExpensesQuery,
    monthExpensesQuery,
    supplierInvoicesQuery,
    customerDebtsQuery,
    inventoryQuery,
  ].some((query) => query.isError);

  const salesChange = percentageChange(todayMetrics.totalSales, yesterdayMetrics.totalSales);
  const profitChange = percentageChange(todayMetrics.netProfit, yesterdayMetrics.netProfit);
  const marginChange = yesterdayMetrics.totalSales > 0
    ? todayMetrics.netMargin - yesterdayMetrics.netMargin
    : null;
  const cashRegister = latestCashPosition(todaySales);
  const receivables = customerDebts.reduce((sum, debt) => (
    sum + numeric(debt.remaining_amount ?? debt.balance ?? debt.total_amount)
  ), 0);
  const chartData = branchRankings.slice(0, 8).map((branch) => ({
    name: branch.label,
    sales: Math.round(branch.metrics.totalSales),
    profit: Math.round(branch.metrics.netProfit),
  }));
  const riskRows = scopedAlerts.slice(0, 3);
  const displayScope = isAllBranches ? copy.allBranches : selectedBranchLabel;
  const isLive = realtimeStatus === 'SUBSCRIBED';

  if (loading) return <DashboardSkeleton />;

  return (
    <div
      data-testid="owner-mega-dashboard"
      className="mx-auto w-full max-w-6xl space-y-4 px-3 pb-8 pt-1 sm:space-y-5 sm:px-5"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <section className="overflow-hidden rounded-[1.75rem] border border-blue-100 bg-gradient-to-br from-white via-blue-50/50 to-indigo-50/70 p-4 shadow-[0_18px_50px_-30px_rgba(37,99,235,0.45)] dark:border-blue-900/60 dark:from-slate-950 dark:via-blue-950/35 dark:to-indigo-950/40 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-300">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25"><BarChart3 className="h-5 w-5" /></span>
              <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{copy.title}</h1>
            </div>
            <p className="mt-2 text-sm font-medium text-muted-foreground">{copy.subtitle}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/85 px-2.5 py-1.5 text-foreground shadow-sm">
                <MapPin className="h-3.5 w-3.5 text-blue-600" />{displayScope}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 ${isLive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300'}`}>
                <Radio className={`h-3.5 w-3.5 ${isLive ? 'animate-pulse' : ''}`} />{isLive ? copy.live : copy.syncing}
              </span>
            </div>
          </div>

          <div className="flex w-full gap-2 sm:w-auto">
            <label className="relative min-w-0 flex-1 sm:w-52">
              <span className="sr-only">{copy.allBranches}</span>
              <Building2 className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-600" />
              <select
                data-testid="owner-branch-selector"
                value={isAllBranches ? 'all' : selectedBranchId || 'all'}
                onChange={(event) => setSelectedBranchId(event.target.value)}
                className="h-11 w-full appearance-none rounded-xl border border-border bg-background ps-9 pe-8 text-xs font-bold text-foreground shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">{copy.allBranches}</option>
                {normalizedBranches.map((branch) => <option key={branch.id || branch.key} value={branch.id}>{branch.label}</option>)}
              </select>
              <ChevronRight className="pointer-events-none absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-muted-foreground" />
            </label>
            <span className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground shadow-sm">
              <CalendarDays className="h-4 w-4 text-blue-600" />{copy.today}
            </span>
          </div>
        </div>

        {hasQueryError && (
          <div role="alert" className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />{copy.unable}
          </div>
        )}

        <div data-testid="owner-control-tower-summary" className="relative mt-5 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-950 px-2 py-5 shadow-2xl shadow-blue-900/20 sm:px-4 sm:py-6">
          <div className="pointer-events-none absolute -end-14 -top-20 h-52 w-52 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 start-1/3 h-40 w-40 rounded-full bg-violet-500/25 blur-3xl" />
          <div className="relative grid grid-cols-3">
            <HeroMetric label={copy.sales} value={formatMoney(todayMetrics.totalSales)} change={salesChange} copy={copy} />
            <HeroMetric label={copy.netProfit} value={formatMoney(todayMetrics.netProfit)} change={profitChange} copy={copy} divider />
            <HeroMetric label={copy.margin} value={`${todayMetrics.netMargin.toFixed(1)}%`} change={marginChange} changeSuffix=" pp" copy={copy} divider />
          </div>
        </div>
      </section>

      <section data-testid="owner-branch-rankings" className="rounded-[1.5rem] border border-border/80 bg-card p-4 shadow-sm sm:p-5">
        <SectionHeading icon={Building2} title={copy.branchRanking} subtitle={copy.branchRankingHint} />
        <div className="mt-4 space-y-2.5">
          {branchRankings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">{copy.noBranchData}</div>
          ) : branchRankings.slice(0, 6).map((branch, index) => {
            const healthTone = branch.health === null
              ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              : branch.health >= 80
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300'
                : branch.health >= 60
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300'
                  : 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300';
            const rankTone = index === 0
              ? 'bg-emerald-600 text-white'
              : index === 1
                ? 'bg-blue-600 text-white'
                : index === 2
                  ? 'bg-amber-500 text-white'
                  : 'bg-muted text-muted-foreground';
            return (
              <button
                type="button"
                key={branch.id || branch.key}
                onClick={() => {
                  setSelectedBranchId(branch.id);
                  navigate('/branch-analytics');
                }}
                className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border/70 bg-background/80 p-3 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_auto]"
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-black ${rankTone}`}>{index + 1}</span>
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300"><MapPin className="h-5 w-5" /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-foreground">{branch.label}</span>
                    <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {copy.health}
                      <span title={copy.healthHelp} className={`rounded-full px-2 py-0.5 font-black ${healthTone}`}>{branch.health ?? '—'}</span>
                    </span>
                  </span>
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{copy.sales}</span>
                  <span className="mt-0.5 block truncate text-sm font-black text-foreground">{formatMoney(branch.metrics.totalSales)}</span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-blue-500" style={{ width: `${clamp((branch.metrics.totalSales / Math.max(branchRankings[0]?.metrics.totalSales || 1, 1)) * 100, 4, 100)}%` }} /></span>
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{copy.profit}</span>
                  <span className={`mt-0.5 block truncate text-sm font-black ${branch.metrics.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{formatMoney(branch.metrics.netProfit)}</span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted"><span className={`block h-full rounded-full ${branch.metrics.netProfit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${clamp(Math.abs(branch.metrics.netMargin), 4, 100)}%` }} /></span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-end sm:hidden">
                    <span className="block text-[10px] font-bold text-muted-foreground">{copy.sales}</span>
                    <span className="block text-xs font-black text-foreground">{formatMoney(branch.metrics.totalSales)}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                </span>
              </button>
            );
          })}
        </div>
        {branchRankings.length > 0 && (
          <button type="button" onClick={() => navigate('/branch-analytics')} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5 text-xs font-black text-blue-700 transition hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70">
            {copy.viewAnalytics}<ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </button>
        )}
      </section>

      <section data-testid="owner-branch-performance" className="rounded-[1.5rem] border border-border/80 bg-card p-4 shadow-sm sm:p-5">
        <SectionHeading icon={BarChart3} title={copy.chartTitle} subtitle={copy.chartHint} />
        {chartData.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">{copy.noBranchData}</div>
        ) : (
          <div className="mt-5 overflow-x-auto pb-1">
            <div className="h-64 min-w-[34rem]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} opacity={0.2} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} interval={0} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} width={48} />
                  <RechartsTooltip
                    formatter={(value, name) => [formatMoney(value), name === 'sales' ? copy.sales : copy.profit]}
                    contentStyle={{ borderRadius: 14, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}
                    labelStyle={{ fontWeight: 800, color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="sales" fill="#2563eb" radius={[7, 7, 0, 0]} maxBarSize={34} />
                  <Bar dataKey="profit" fill="#22c55e" radius={[7, 7, 0, 0]} maxBarSize={34} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section data-testid="owner-cash-position" className="rounded-[1.5rem] border border-border/80 bg-card p-4 shadow-sm sm:p-5">
          <SectionHeading icon={CircleDollarSign} title={copy.cashPosition} subtitle={copy.cashHint} />
          <div className="mt-4 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {[
              { label: copy.register, value: cashRegister, icon: WalletCards, tone: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300' },
              { label: copy.network, value: todayMetrics.totalNetwork, icon: CreditCard, tone: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' },
              { label: copy.receivables, value: receivables, icon: Landmark, tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
            ].map((item) => (
              <div key={item.label} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-background/70 p-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${item.tone}`}><item.icon className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold text-muted-foreground">{item.label}</span>
                  <span className="mt-0.5 block truncate text-sm font-black text-foreground">{formatMoney(item.value)}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section data-testid="owner-branch-risks" className="rounded-[1.5rem] border border-border/80 bg-card p-4 shadow-sm sm:p-5">
          <SectionHeading
            icon={ShieldCheck}
            title={copy.risks}
            subtitle={copy.risksHint}
            action={<span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-black text-rose-700 dark:bg-rose-950/70 dark:text-rose-300">{loadingActiveAlerts ? '…' : scopedAlerts.length}</span>}
          />
          <div className="mt-4 space-y-2.5">
            {riskRows.length === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                <ShieldCheck className="h-5 w-5 shrink-0" />{copy.noRisks}
              </div>
            ) : riskRows.map((alert) => {
              const critical = alert.severity === 'critical' || alert.severity === 'high';
              return (
                <button type="button" key={alert.id} onClick={() => navigate('/alerts')} className={`group flex w-full items-center gap-3 rounded-2xl border p-3 text-start transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${critical ? 'border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/30' : 'border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30'}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${critical ? 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300' : 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300'}`}><AlertTriangle className="h-4.5 w-4.5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-black text-foreground">{alert.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{branchLabelForAlert(alert, normalizedBranches, copy.global)} · {alert.message}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${critical ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>{copy[alert.severity] || alert.severity}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <nav data-testid="owner-mega-actions" aria-label="ERP dashboard actions" className="grid grid-cols-2 gap-2 rounded-[1.5rem] border border-border/80 bg-card p-3 shadow-sm sm:grid-cols-4">
        {[
          role === 'owner' ? { label: copy.addBranch, icon: Plus, onClick: () => setQuickAddBranchOpen(true), tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300' } : null,
          { label: copy.compare, icon: Scale, onClick: () => navigate('/branch-analytics'), tone: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300' },
          { label: copy.reports, icon: BarChart3, onClick: () => navigate('/reports'), tone: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-300' },
          { label: copy.alerts, icon: Bell, onClick: () => navigate('/alerts'), tone: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300' },
        ].filter(Boolean).map((action) => (
          <button type="button" key={action.label} onClick={action.onClick} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background px-3 py-2.5 text-xs font-black text-foreground transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${action.tone}`}><action.icon className="h-4 w-4" /></span>{action.label}
          </button>
        ))}
      </nav>

      <QuickAddBranchDialog open={isQuickAddBranchOpen} onOpenChange={setQuickAddBranchOpen} />
    </div>
  );
}

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
    return <DashboardSkeleton />;
  }

  if (!user || authError?.type === 'auth_required') {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center dark:border-amber-900 dark:bg-amber-950/40">
        <AlertCircle className="mx-auto h-6 w-6 text-amber-600" />
        <p className="mt-3 text-sm font-semibold">Your session has expired. Please sign in again.</p>
        <button type="button" onClick={() => navigate('/erp-login')} className="mt-3 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Sign in again</button>
      </div>
    );
  }

  if (!activeRestaurant || portalIdentityError) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-red-200 bg-red-50 p-5 text-center dark:border-red-900 dark:bg-red-950/40">
        <AlertCircle className="mx-auto h-6 w-6 text-red-600" />
        <p className="mt-3 text-sm font-semibold">Unable to load this section. Try again.</p>
        <button
          type="button"
          onClick={async () => { await checkUserAuth(); await refetchRestaurants(); await refetchPortalIdentity(); }}
          className="mt-3 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
        >
          Retry
        </button>
      </div>
    );
  }

  return <WidgetErrorBoundary><OwnerDashboardContent /></WidgetErrorBoundary>;
}
