/**
 * OwnerDashboard — Four-page ERP Owner Report Center.
 * Financial values use the shared ERP accounting engine; consumption and rate
 * reports are built only from recorded tenant/branch-scoped ERP rows.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { AlertCircle, AlertTriangle, BarChart3, Building2, CalendarDays, ChevronRight, CircleDollarSign, ClipboardList, Radio, ShoppingBasket, Target } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import OwnerReportCenter from '@/components/dashboard/OwnerReportCenter';
import QuickAddBranchDialog from '@/components/dashboard/QuickAddBranchDialog';
import { useActiveAlerts } from '@/hooks/useActiveAlerts';
import { useOwnerDashboardRealtime } from '@/hooks/useOwnerDashboardRealtime';
import { useSalesSources } from '@/hooks/useSalesSources';
import { buildActiveAlertCandidates, reconcileActiveAlerts } from '@/lib/activeAlertsEngine';
import { useAuth } from '@/lib/AuthContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { calculateERPAccounting, calculateSalesRevenue, tagExpensesWithCategories } from '@/lib/helpers';
import { useLanguage } from '@/lib/LanguageContext';
import {
  aggregateDailyRevenue,
  buildBranchPriceInconsistencies,
  buildInventoryConsumption,
  buildInventoryOverview,
  buildOwnerReportPeriod,
  buildPriceControlReport,
  buildSupplierPriceComparisons,
  groupExpensesByCategory,
  reportNumber,
} from '@/lib/ownerReportCenter';
import { useRole } from '@/lib/RoleContext';
import { normalizeSalesDashboardBranches } from '@/lib/salesDashboardBranches';
import { useTenant } from '@/lib/TenantContext';

const REPORT_PAGES = [
  { key: 'executive', icon: BarChart3, labelKey: 'executive', fallback: 'Executive' },
  { key: 'finance', icon: CircleDollarSign, labelKey: 'finance', fallback: 'Finance' },
  { key: 'operations', icon: ShoppingBasket, labelKey: 'operations', fallback: 'Operations & Consumption' },
  { key: 'price-control', icon: Target, labelKey: 'priceControl', fallback: 'Price Control' },
];
const REPORT_KEYS = new Set(REPORT_PAGES.map((page) => page.key));
const REPORT_PERIODS = [
  { key: 'today', labelKey: 'today', fallback: 'Today' },
  { key: 'week', labelKey: 'thisWeek', fallback: 'This week' },
  { key: 'month', labelKey: 'thisMonth', fallback: 'This month' },
  { key: 'six-months', labelKey: 'sixMonths', fallback: 'Last 6 months' },
  { key: 'year', labelKey: 'thisYear', fallback: 'This year' },
];
const REPORT_PERIOD_KEYS = new Set(REPORT_PERIODS.map((period) => period.key));

const EN = {
  title: 'ERP Owner Report Center', subtitle: 'Complete financial, operational, consumption and pricing intelligence',
  executive: 'Executive', finance: 'Finance', operations: 'Operations & Consumption', priceControl: 'Price Control', allBranches: 'All branches', live: 'Live', syncing: 'Syncing', today: 'Today', thisWeek: 'This week', thisMonth: 'This month', sixMonths: 'Last 6 months', thisYear: 'This year', choosePeriod: 'Report period',
  sales: 'Sales', netProfit: 'Net profit', netMargin: 'Net margin', profit: 'Profit', health: 'Health', executiveSnapshot: 'Executive snapshot', selectedPeriod: 'Selected period', verifiedERP: 'VERIFIED ERP', vsPreviousPeriod: 'vs previous period',
  periodSales: 'Period sales', receivables: 'Receivables', payables: 'Payables', activeRisks: 'Active risks', branchCommand: 'Branch command board', branchCommandHint: 'Ranked by verified sales in the selected period', noBranchData: 'No branch sales have been recorded in this period.',
  ownerAttention: 'Owner attention', ownerAttentionHint: 'Highest-priority ERP exceptions', noRisks: 'No active risks. Operations are clear.', inventoryPulse: 'Inventory pulse', inventoryPulseHint: 'Current stock health across the selected scope', stockValue: 'Stock value', activeProducts: 'Active products', lowStock: 'Low stock', outOfStock: 'Out of stock',
  addBranch: 'Add branch', compare: 'Compare', scheduled: 'Scheduled', alerts: 'Alerts', reportDirectory: 'Complete report directory', reportDirectoryHint: 'Open every ERP report without leaving the dashboard', branchAnalytics: 'Branch analytics', salesAnalytics: 'Sales analytics', biCenter: 'BI center', activityLog: 'Activity log',
  revenue: 'Revenue', grossProfit: 'Gross profit', operatingExpense: 'Operating expense', revenueTrend: 'Revenue trend', revenueTrendHint: 'Verified daily revenue in the selected period', revenueMix: 'Revenue mix', revenueMixHint: 'Payment and configured sales sources', cash: 'Cash', network: 'Network', credit: 'Credit', otherSources: 'Other sources',
  expenseControl: 'Expense control', expenseControlHint: 'Spending by ERP category in the selected period', noExpenseData: 'No expenses recorded for this period.', cashAndObligations: 'Cash & obligations', cashAndObligationsHint: 'Liquidity, receivables and supplier exposure', register: 'Cash register', operatingCash: 'Operating cash', previousPeriodSales: 'Previous period sales', previousPeriodProfit: 'Previous period profit',
  profitLoss: 'Profit & loss', cashFlow: 'Cash flow', balanceSheet: 'Balance sheet', expenses: 'Expenses', purchases: 'Purchases', supplierLedger: 'Supplier ledger', debts: 'Debts', treasury: 'Treasury',
  ingredientsUsed: 'Ingredients used', verifiedMovements: 'Verified stock movements', consumptionCost: 'Consumption cost', wasteCost: 'Waste cost', units: 'units', periodConsumption: 'Ingredient consumption', periodConsumptionHint: 'Calculated from approved sales and inventory movements in the selected period — not purchase quantities', product: 'Product', used: 'Used', usageCost: 'Usage cost', stockLeft: 'Stock left', status: 'Status', review: 'Review', healthy: 'Healthy',
  noConsumptionData: 'No ingredient-consumption movement is recorded in this period. Configure recipes or sales inventory deduction to populate this report.', procurementPulse: 'Procurement pulse', procurementPulseHint: 'Approved supplier receipts in the selected period', purchasedQty: 'Purchased qty', purchaseCost: 'Purchase cost', suppliers: 'Suppliers', stockHealth: 'Stock health', stockHealthHint: 'Availability risks in the selected branch scope', products: 'Products',
  inventoryCommand: 'Inventory command', inventoryLedger: 'Inventory ledger', wasteReport: 'Waste report', stockTransfers: 'Stock transfers', productMaster: 'Product master', procurement: 'Procurement', peoplePayroll: 'People & payroll',
  targetMargin: 'Target margin', averageMargin: 'Average margin', costIncreases: 'Cost increases', needsAction: 'Needs action', critical: 'Critical', watch: 'Watch', 'no-data': 'No data', marginIntelligence: 'Margin intelligence', marginIntelligenceHint: 'Current cost, selling price and target-based recommendation', cost: 'Cost', sellingPrice: 'Selling price', margin: 'Margin', suggestedPrice: 'Suggested price', costChange: 'cost change',
  noPriceData: 'No product price data is available. Add cost and selling prices in Product Master.', supplierComparison: 'Supplier rate comparison', supplierComparisonHint: 'Latest recorded offer per supplier and product', save: 'Save', noSupplierComparison: 'No product has rates from multiple suppliers in the selected period.', branchRateConsistency: 'Branch rate consistency', branchRateConsistencyHint: 'Products with different recorded costs across branches', consistentRates: 'No cross-branch cost difference is recorded in the selected history.',
  rateAudit: 'Rate audit trail', rateAuditHint: 'Supplier cost changes recorded in the selected period', noRateChanges: 'No supplier rate changes were recorded in this period.', priceOptimization: 'Price optimization', purchaseOrders: 'Purchase orders', noPeriodData: 'No recorded data for this period.', unable: 'Some ERP data could not be refreshed. Values shown come from available verified records.',
};

const COPY = {
  en: EN,
  fa: { ...EN,
    title: 'مرکز گزارش‌دهی مالک ERP', subtitle: 'گزارش کامل مالی، عملیاتی، مصرف و کنترول نرخ', executive: 'اجرایی', finance: 'مالی', operations: 'عملیات و مصرف', priceControl: 'کنترول نرخ', allBranches: 'تمام شعبه‌ها', live: 'زنده', syncing: 'در حال همگام‌سازی', today: 'امروز', thisWeek: 'این هفته', thisMonth: 'این ماه', sixMonths: '۶ ماه اخیر', thisYear: 'امسال', choosePeriod: 'بازه گزارش',
    sales: 'فروش', netProfit: 'سود خالص', netMargin: 'حاشیه سود خالص', profit: 'سود', health: 'سلامت', executiveSnapshot: 'خلاصه اجرایی', selectedPeriod: 'بازه انتخاب‌شده', verifiedERP: 'دادهٔ تأییدشده ERP', vsPreviousPeriod: 'نسبت به بازه قبل', periodSales: 'فروش بازه', receivables: 'مطالبات', payables: 'بدهی تأمین‌کننده', activeRisks: 'ریسک‌های فعال',
    branchCommand: 'مرکز فرمان شعبه‌ها', branchCommandHint: 'رتبه‌بندی بر اساس فروش تأییدشده بازه انتخاب‌شده', noBranchData: 'در این بازه هنوز فروش شعبه ثبت نشده است.', ownerAttention: 'نیازمند توجه مالک', ownerAttentionHint: 'مهم‌ترین استثناهای ERP', noRisks: 'ریسک فعالی وجود ندارد؛ عملیات عادی است.', inventoryPulse: 'نبض موجودی', inventoryPulseHint: 'وضعیت موجودی در محدوده انتخاب‌شده', stockValue: 'ارزش موجودی', activeProducts: 'محصولات فعال', lowStock: 'موجودی کم', outOfStock: 'ناموجود',
    addBranch: 'افزودن شعبه', compare: 'مقایسه', scheduled: 'زمان‌بندی', alerts: 'هشدارها', reportDirectory: 'فهرست کامل گزارش‌ها', reportDirectoryHint: 'تمام گزارش‌های ERP را مستقیماً از داشبورد باز کنید', branchAnalytics: 'تحلیل شعبه‌ها', salesAnalytics: 'تحلیل فروش', biCenter: 'مرکز BI', activityLog: 'گزارش فعالیت',
    revenue: 'درآمد', grossProfit: 'سود ناخالص', operatingExpense: 'مصارف عملیاتی', revenueTrend: 'روند درآمد', revenueTrendHint: 'درآمد روزانه تأییدشده بازه انتخاب‌شده', revenueMix: 'ترکیب درآمد', revenueMixHint: 'روش‌های پرداخت و منابع فروش', cash: 'نقد', network: 'شبکه', credit: 'کریدت', otherSources: 'سایر منابع', expenseControl: 'کنترول مصارف', expenseControlHint: 'مصارف بازه انتخاب‌شده بر اساس کتگوری ERP', noExpenseData: 'در این دوره مصرف ثبت نشده است.',
    cashAndObligations: 'نقدینگی و تعهدات', cashAndObligationsHint: 'نقدینگی، مطالبات و تعهدات تأمین‌کننده', register: 'صندوق نقدی', operatingCash: 'نقد عملیاتی', previousPeriodSales: 'فروش بازه قبل', previousPeriodProfit: 'سود بازه قبل', profitLoss: 'سود و زیان', cashFlow: 'جریان نقدی', balanceSheet: 'بیلانس شیت', expenses: 'مصارف', purchases: 'خریدها', supplierLedger: 'حساب تأمین‌کننده', debts: 'دیون', treasury: 'خزانه',
    ingredientsUsed: 'مواد مصرف‌شده', verifiedMovements: 'حرکات تأییدشده موجودی', consumptionCost: 'هزینه مصرف', wasteCost: 'هزینه ضایعات', units: 'واحد', periodConsumption: 'مصرف مواد', periodConsumptionHint: 'محاسبه‌شده از فروش تأییدشده و حرکات موجودی بازه انتخاب‌شده — نه مقدار خرید', product: 'محصول', used: 'مصرف', usageCost: 'هزینه مصرف', stockLeft: 'باقی موجودی', status: 'وضعیت', review: 'بررسی', healthy: 'سالم', noConsumptionData: 'در این بازه حرکت مصرف مواد ثبت نشده است؛ رسپی یا کسر موجودی فروش را تنظیم کنید.',
    procurementPulse: 'نبض خرید', procurementPulseHint: 'رسیدهای تأییدشده تأمین‌کننده در بازه انتخاب‌شده', purchasedQty: 'مقدار خرید', purchaseCost: 'هزینه خرید', suppliers: 'تأمین‌کننده‌ها', stockHealth: 'سلامت موجودی', stockHealthHint: 'ریسک موجودی در محدوده انتخاب‌شده', products: 'محصولات', inventoryCommand: 'مرکز موجودی', inventoryLedger: 'دفتر موجودی', wasteReport: 'گزارش ضایعات', stockTransfers: 'انتقال موجودی', productMaster: 'محصولات', procurement: 'خرید و تدارکات', peoplePayroll: 'کارمندان و معاش',
    targetMargin: 'حاشیه هدف', averageMargin: 'میانگین حاشیه', costIncreases: 'افزایش نرخ خرید', needsAction: 'نیازمند اقدام', critical: 'بحرانی', watch: 'بررسی', 'no-data': 'بدون داده', marginIntelligence: 'هوشمندی حاشیه سود', marginIntelligenceHint: 'هزینه، نرخ فروش و پیشنهاد بر اساس هدف', cost: 'هزینه', sellingPrice: 'نرخ فروش', margin: 'حاشیه', suggestedPrice: 'نرخ پیشنهادی', costChange: 'تغییر هزینه', supplierComparison: 'مقایسه نرخ تأمین‌کننده', supplierComparisonHint: 'آخرین نرخ ثبت‌شده هر تأمین‌کننده و محصول', save: 'صرفه‌جویی', branchRateConsistency: 'یکسانی نرخ شعبه‌ها', branchRateConsistencyHint: 'محصولات دارای هزینه متفاوت میان شعبه‌ها', rateAudit: 'تاریخچه تغییر نرخ', rateAuditHint: 'تغییرات اخیر هزینه تأمین‌کننده در ERP', priceOptimization: 'بهینه‌سازی نرخ', purchaseOrders: 'درخواست‌های خرید', unable: 'بخشی از داده‌های ERP تازه‌سازی نشد؛ ارقام موجود فقط از رکوردهای تأییدشده‌اند.',
  },
  ar: { ...EN, title: 'مركز تقارير مالك ERP', subtitle: 'التقارير المالية والتشغيلية والاستهلاك والتحكم بالأسعار', executive: 'تنفيذي', finance: 'مالي', operations: 'العمليات والاستهلاك', priceControl: 'التحكم بالأسعار', allBranches: 'جميع الفروع', live: 'مباشر', syncing: 'جارٍ التزامن', today: 'اليوم', thisWeek: 'هذا الأسبوع', thisMonth: 'هذا الشهر', sixMonths: 'آخر 6 أشهر', thisYear: 'هذه السنة', choosePeriod: 'فترة التقرير', selectedPeriod: 'الفترة المحددة', vsPreviousPeriod: 'مقارنة بالفترة السابقة', periodSales: 'مبيعات الفترة', previousPeriodSales: 'مبيعات الفترة السابقة', previousPeriodProfit: 'ربح الفترة السابقة', periodConsumption: 'استهلاك المواد' },
};

const approvedPurchase = (record) => ['approved', 'auto_approved'].includes(record?.approval_status) || ['approved', 'paid', 'partial'].includes(record?.status);
const numeric = (value) => reportNumber(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const recordDate = (record) => String(record?.date || record?.created_date || record?.created_at || '').slice(0, 10);

function recordMatchesBranch(record, branch) {
  if (!record || !branch) return false;
  const recordBranchId = record.branch_id ? String(record.branch_id) : null;
  const branchId = branch.id ? String(branch.id) : null;
  const branchKey = branch.key || branch.branch_key;
  return Boolean((recordBranchId && branchId && recordBranchId === branchId) || (branchKey && String(record.branch || '') === String(branchKey)) || (branchKey && String(record.branch_key || '') === String(branchKey)));
}

function latestCashPosition(sales) {
  const latestByBranch = new Map();
  (sales || []).forEach((sale) => {
    const key = String(sale.branch_id || sale.branch || sale.branch_key || '__unassigned__');
    const timestamp = new Date(sale.updated_at || sale.created_at || `${sale.date || '1970-01-01'}T00:00:00`).getTime();
    const current = latestByBranch.get(key);
    if (!current || timestamp >= current.timestamp) latestByBranch.set(key, { sale, timestamp });
  });
  return Array.from(latestByBranch.values()).reduce((sum, item) => sum + numeric(item.sale.closing_cash ?? item.sale.restaurant_cash ?? item.sale.cash), 0);
}

function healthScore({ metrics, alertCount, lowStockCount }) {
  if (metrics.totalSales <= 0) return null;
  return clamp(clamp(Math.round((metrics.netMargin + 10) * 1.5), 0, 60) + clamp(40 - (alertCount * 7) - (lowStockCount * 2), 0, 40), 0, 100);
}

function percentageChange(current, previous) {
  return !Number.isFinite(previous) || previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
}

function uniqueRecords(records) {
  return Array.from(new Map((records || []).map((record, index) => [record.id || `${record.product_id || 'row'}-${index}`, record])).values());
}

function DashboardSkeleton() {
  return <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-5" aria-busy="true"><div className="h-32 animate-pulse rounded-3xl bg-muted" /><div className="h-14 animate-pulse rounded-2xl bg-muted" /><div className="grid gap-3 sm:grid-cols-2"><div className="h-52 animate-pulse rounded-3xl bg-muted" /><div className="h-52 animate-pulse rounded-3xl bg-muted" /></div></div>;
}

class WidgetErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (!this.state.hasError) return this.props.children;
    return <div className="mx-auto mt-10 max-w-md rounded-2xl border border-red-200 bg-red-50 p-5 text-center dark:border-red-900 dark:bg-red-950/40"><AlertCircle className="mx-auto h-6 w-6 text-red-600" /><p className="mt-3 text-sm font-semibold">Unable to load this section. Try again.</p><button type="button" onClick={() => this.setState({ hasError: false })} className="mt-3 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Retry</button></div>;
  }
}

function OwnerDashboardContent() {
  const { currency, lang, isRTL } = useLanguage();
  const { branches, activeRestaurant, ownerFilter } = useTenant();
  const { user } = useAuth();
  const { role } = useRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const copy = COPY[lang] || COPY.en;
  const {
    selectedBranchId,
    selectedBranchKey,
    selectedBranchLabel,
    isAllBranches,
    setSelectedBranchId,
  } = useBranchScope();
  const [isQuickAddBranchOpen, setQuickAddBranchOpen] = useState(false);
  const pageParam = searchParams.get('report');
  const activePage = REPORT_KEYS.has(pageParam) ? pageParam : 'executive';
  const periodParam = searchParams.get('period');
  const activePeriod = REPORT_PERIOD_KEYS.has(periodParam) ? periodParam : 'today';
  const period = useMemo(() => buildOwnerReportPeriod(activePeriod), [activePeriod]);
  const periodLabel = copy[REPORT_PERIODS.find((option) => option.key === activePeriod)?.labelKey] || activePeriod;
  const normalizedBranches = useMemo(() => normalizeSalesDashboardBranches(branches).filter((branch) => branch.is_active !== false), [branches]);
  const branchSignature = useMemo(() => normalizedBranches.map((branch) => String(branch.id || branch.key)).join('|'), [normalizedBranches]);
  const { realtimeStatus } = useOwnerDashboardRealtime(activeRestaurant?.id, branches);
  const { alerts: persistedActiveAlerts, isLoading: loadingActiveAlerts } = useActiveAlerts();
  const { revenueSources } = useSalesSources({ branchId: isAllBranches ? undefined : selectedBranchId, branchKey: isAllBranches ? undefined : selectedBranchKey });

  const today = period.currentEnd;
  const usesAllocatedFixedCosts = activePeriod === 'today' || activePeriod === 'week';
  const currentReferenceDate = new Date(`${period.currentEnd}T12:00:00`);
  const previousReferenceDate = new Date(`${period.previousEnd}T12:00:00`);
  const currentReferenceMonthStart = format(startOfMonth(currentReferenceDate), 'yyyy-MM-dd');
  const previousReferenceMonthStart = format(startOfMonth(previousReferenceDate), 'yyyy-MM-dd');
  const previousReferenceMonthEnd = format(endOfMonth(previousReferenceDate), 'yyyy-MM-dd');
  const createdBy = user?.email || ownerFilter?.created_by || activeRestaurant?.created_by;
  const enabled = !!(activeRestaurant?.id);

  const formatMoney = useCallback((value, decimals = 0) => `${String(currency || 'SAR').trim()} ${numeric(value).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`, [currency]);

  const fetchBranchScopedRows = useCallback(async (table, {
    legacyColumn = 'branch', dateColumn, dateFrom, dateTo, filters = {}, orderColumn = 'date', ascending = false, limit = 1000,
  } = {}) => {
    if (!activeRestaurant?.id) return [];
    const createQuery = () => {
      let query = supabase.from(table).select('*').eq('restaurant_id', activeRestaurant.id);
      if (dateColumn && dateFrom) query = query.gte(dateColumn, dateFrom);
      if (dateColumn && dateTo) query = query.lte(dateColumn, dateTo);
      Object.entries(filters).forEach(([column, value]) => { query = query.eq(column, value); });
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
    return uniqueRecords([...(canonical.data || []), ...(legacy.data || [])]);
  }, [activeRestaurant?.id, isAllBranches, selectedBranchId, selectedBranchKey]);

  const fetchInventoryTransactions = useCallback(async () => {
    if (!activeRestaurant?.id) return [];
    const createQuery = () => supabase.from('inventory_transactions').select('*')
      .eq('restaurant_id', activeRestaurant.id)
      .gte('created_date', period.currentStartIso)
      .lte('created_date', period.currentEndIso)
      .order('created_date', { ascending: false }).limit(5000);
    if (isAllBranches) {
      const { data, error } = await createQuery();
      if (error) throw error;
      return data || [];
    }
    const [canonical, legacy] = await Promise.all([
      createQuery().eq('branch_id', selectedBranchId),
      selectedBranchKey ? createQuery().eq('branch', selectedBranchKey) : Promise.resolve({ data: [], error: null }),
    ]);
    if (canonical.error && legacy.error) throw canonical.error;
    return uniqueRecords([...(canonical.data || []), ...(legacy.data || [])]);
  }, [activeRestaurant?.id, isAllBranches, period.currentEndIso, period.currentStartIso, selectedBranchId, selectedBranchKey]);

  const periodSalesQuery = useQuery({ queryKey: ['sales_report_period', activeRestaurant?.id, selectedBranchId, period.currentStart, period.currentEnd], queryFn: () => fetchBranchScopedRows('daily_sales', { dateColumn: 'date', dateFrom: period.currentStart, dateTo: period.currentEnd, limit: 10000 }), staleTime: 15000, enabled });
  const previousPeriodSalesQuery = useQuery({ queryKey: ['sales_report_previous_period', activeRestaurant?.id, selectedBranchId, period.previousStart, period.previousEnd], queryFn: () => fetchBranchScopedRows('daily_sales', { dateColumn: 'date', dateFrom: period.previousStart, dateTo: period.previousEnd, limit: 10000 }), staleTime: 60000, enabled });
  const periodExpensesQuery = useQuery({ queryKey: ['expenses_report_period', activeRestaurant?.id, selectedBranchId, period.currentStart, period.currentEnd], queryFn: () => fetchBranchScopedRows('expenses', { legacyColumn: 'branch_key', dateColumn: 'date', dateFrom: period.currentStart, dateTo: period.currentEnd, limit: 10000 }), staleTime: 30000, enabled });
  const previousPeriodExpensesQuery = useQuery({ queryKey: ['expenses_report_previous_period', activeRestaurant?.id, selectedBranchId, period.previousStart, period.previousEnd], queryFn: () => fetchBranchScopedRows('expenses', { legacyColumn: 'branch_key', dateColumn: 'date', dateFrom: period.previousStart, dateTo: period.previousEnd, limit: 10000 }), staleTime: 60000, enabled });
  const currentFixedExpensePoolQuery = useQuery({ queryKey: ['expenses_report_fixed_pool', activeRestaurant?.id, selectedBranchId, currentReferenceMonthStart, period.currentEnd], queryFn: () => fetchBranchScopedRows('expenses', { legacyColumn: 'branch_key', dateColumn: 'date', dateFrom: currentReferenceMonthStart, dateTo: period.currentEnd, limit: 5000 }), staleTime: 60000, enabled: enabled && usesAllocatedFixedCosts });
  const previousFixedExpensePoolQuery = useQuery({ queryKey: ['expenses_report_previous_fixed_pool', activeRestaurant?.id, selectedBranchId, previousReferenceMonthStart, previousReferenceMonthEnd], queryFn: () => fetchBranchScopedRows('expenses', { legacyColumn: 'branch_key', dateColumn: 'date', dateFrom: previousReferenceMonthStart, dateTo: previousReferenceMonthEnd, limit: 5000 }), staleTime: 120000, enabled: enabled && usesAllocatedFixedCosts });
  const expenseCategoriesQuery = useQuery({ queryKey: ['expense_categories_dash', activeRestaurant?.id], queryFn: () => base44.entities.ExpenseCategory ? base44.entities.ExpenseCategory.filter({ restaurant_id: activeRestaurant.id }, 'sort_order', 500) : Promise.resolve([]), staleTime: 300000, enabled });
  const supplierInvoicesQuery = useQuery({ queryKey: ['supplier_invoices', activeRestaurant?.id, selectedBranchId, branchSignature], queryFn: () => fetchBranchScopedRows('supplier_invoices', { legacyColumn: 'branch', limit: 5000 }), staleTime: 15000, enabled });
  const customerDebtsQuery = useQuery({ queryKey: ['debts_customer_dash', activeRestaurant?.id, selectedBranchId], queryFn: () => fetchBranchScopedRows('debt_records', { legacyColumn: 'branch', filters: { type: 'receivable', party_type: 'customer' }, limit: 2000 }), staleTime: 30000, enabled });
  const inventoryQuery = useQuery({ queryKey: ['inventory_dash', activeRestaurant?.id, selectedBranchId], queryFn: () => fetchBranchScopedRows('inventory', { legacyColumn: 'branch', orderColumn: 'product_name', ascending: true, limit: 5000 }), staleTime: 60000, enabled });
  const productsQuery = useQuery({ queryKey: ['products', activeRestaurant?.id], queryFn: () => base44.entities.Product.filter({ restaurant_id: activeRestaurant.id }, 'name', 5000), staleTime: 60000, enabled });
  const inventoryTransactionsQuery = useQuery({ queryKey: ['inventory_transactions_report', activeRestaurant?.id, selectedBranchId, period.currentStartIso, period.currentEndIso], queryFn: fetchInventoryTransactions, staleTime: 15000, enabled });
  const priceHistoryQuery = useQuery({
    queryKey: ['product_price_history', createdBy, selectedBranchId, period.currentStartIso, period.currentEndIso],
    queryFn: async () => {
      if (!createdBy) return [];
      let query = supabase.from('product_price_history').select('*').eq('created_by', createdBy).gte('recorded_at', period.currentStartIso).lte('recorded_at', period.currentEndIso).order('recorded_at', { ascending: false }).limit(5000);
      if (!isAllBranches && selectedBranchKey) query = query.eq('branch', selectedBranchKey);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
    enabled: Boolean(createdBy),
  });

  const periodSales = periodSalesQuery.data || [];
  const previousPeriodSales = previousPeriodSalesQuery.data || [];
  const periodExpenses = periodExpensesQuery.data || [];
  const previousPeriodExpenses = previousPeriodExpensesQuery.data || [];
  const expenseCategories = expenseCategoriesQuery.data || [];
  const supplierInvoices = supplierInvoicesQuery.data || [];
  const customerDebts = customerDebtsQuery.data || [];
  const inventory = inventoryQuery.data || [];
  const products = productsQuery.data || [];
  const inventoryTransactions = inventoryTransactionsQuery.data || [];
  const priceHistory = priceHistoryQuery.data || [];

  const periodPurchases = useMemo(() => supplierInvoices.filter((invoice) => {
    const date = recordDate(invoice);
    return date >= period.currentStart && date <= period.currentEnd && approvedPurchase(invoice);
  }), [period.currentEnd, period.currentStart, supplierInvoices]);
  const previousPeriodPurchases = useMemo(() => supplierInvoices.filter((invoice) => {
    const date = recordDate(invoice);
    return date >= period.previousStart && date <= period.previousEnd && approvedPurchase(invoice);
  }), [period.previousEnd, period.previousStart, supplierInvoices]);
  const todaySales = useMemo(() => periodSales.filter((sale) => recordDate(sale) === today), [periodSales, today]);
  const todayPurchases = useMemo(() => periodPurchases.filter((invoice) => recordDate(invoice) === today), [periodPurchases, today]);
  const todayExpenses = useMemo(() => periodExpenses.filter((expense) => recordDate(expense) === today), [periodExpenses, today]);
  const currentFixedExpensePool = useMemo(() => usesAllocatedFixedCosts
    ? (currentFixedExpensePoolQuery.data || [])
    : periodExpenses.filter((expense) => recordDate(expense) >= currentReferenceMonthStart), [currentFixedExpensePoolQuery.data, currentReferenceMonthStart, periodExpenses, usesAllocatedFixedCosts]);
  const previousFixedExpensePool = useMemo(() => usesAllocatedFixedCosts
    ? (previousFixedExpensePoolQuery.data || [])
    : previousPeriodExpenses, [previousFixedExpensePoolQuery.data, previousPeriodExpenses, usesAllocatedFixedCosts]);
  const taggedPeriodExpenses = useMemo(() => tagExpensesWithCategories(periodExpenses, expenseCategories), [expenseCategories, periodExpenses]);
  const taggedPreviousPeriodExpenses = useMemo(() => tagExpensesWithCategories(previousPeriodExpenses, expenseCategories), [expenseCategories, previousPeriodExpenses]);
  const taggedTodayExpenses = useMemo(() => tagExpensesWithCategories(todayExpenses, expenseCategories), [expenseCategories, todayExpenses]);
  const taggedCurrentFixedExpensePool = useMemo(() => tagExpensesWithCategories(currentFixedExpensePool, expenseCategories), [currentFixedExpensePool, expenseCategories]);
  const taggedPreviousFixedExpensePool = useMemo(() => tagExpensesWithCategories(previousFixedExpensePool, expenseCategories), [expenseCategories, previousFixedExpensePool]);

  const periodMetrics = useMemo(() => calculateERPAccounting({
    sales: periodSales,
    purchases: periodPurchases,
    periodExpenses: taggedPeriodExpenses,
    monthlyExpenses: usesAllocatedFixedCosts ? taggedCurrentFixedExpensePool : taggedPeriodExpenses,
    rangeType: period.rangeType,
    revenueSources,
    daysInPeriod: period.daysInPeriod,
    asOfDate: period.currentEnd,
  }), [period.currentEnd, period.daysInPeriod, period.rangeType, periodPurchases, periodSales, revenueSources, taggedCurrentFixedExpensePool, taggedPeriodExpenses, usesAllocatedFixedCosts]);
  const previousPeriodMetrics = useMemo(() => calculateERPAccounting({
    sales: previousPeriodSales,
    purchases: previousPeriodPurchases,
    periodExpenses: taggedPreviousPeriodExpenses,
    monthlyExpenses: usesAllocatedFixedCosts ? taggedPreviousFixedExpensePool : taggedPreviousPeriodExpenses,
    rangeType: period.rangeType,
    revenueSources,
    daysInPeriod: period.daysInPeriod,
    asOfDate: period.previousEnd,
  }), [period.daysInPeriod, period.previousEnd, period.rangeType, previousPeriodPurchases, previousPeriodSales, revenueSources, taggedPreviousFixedExpensePool, taggedPreviousPeriodExpenses, usesAllocatedFixedCosts]);
  const todayMetricsForAlerts = useMemo(() => calculateERPAccounting({ sales: todaySales, purchases: todayPurchases, periodExpenses: taggedTodayExpenses, monthlyExpenses: taggedCurrentFixedExpensePool, rangeType: 'day', revenueSources, daysInPeriod: 1, asOfDate: today }), [revenueSources, taggedCurrentFixedExpensePool, taggedTodayExpenses, today, todayPurchases, todaySales]);

  const scopedAlerts = useMemo(() => isAllBranches ? persistedActiveAlerts : persistedActiveAlerts.filter((alert) => String(alert.branch_id || '') === String(selectedBranchId || '') || (!alert.branch_id && String(alert.branch || '') === String(selectedBranchKey || ''))), [isAllBranches, persistedActiveAlerts, selectedBranchId, selectedBranchKey]);
  const visibleBranches = useMemo(() => isAllBranches ? normalizedBranches : normalizedBranches.filter((branch) => String(branch.id) === String(selectedBranchId)), [isAllBranches, normalizedBranches, selectedBranchId]);
  const branchRankings = useMemo(() => visibleBranches.map((branch) => {
    const branchSales = periodSales.filter((record) => recordMatchesBranch(record, branch));
    const branchPurchases = periodPurchases.filter((record) => recordMatchesBranch(record, branch));
    const branchPeriodExpenses = taggedPeriodExpenses.filter((record) => recordMatchesBranch(record, branch));
    const branchFixedExpensePool = taggedCurrentFixedExpensePool.filter((record) => recordMatchesBranch(record, branch));
    const branchInventory = inventory.filter((record) => recordMatchesBranch(record, branch));
    const branchAlerts = scopedAlerts.filter((record) => recordMatchesBranch(record, branch));
    const metrics = calculateERPAccounting({ sales: branchSales, purchases: branchPurchases, periodExpenses: branchPeriodExpenses, monthlyExpenses: usesAllocatedFixedCosts ? branchFixedExpensePool : branchPeriodExpenses, rangeType: period.rangeType, revenueSources, daysInPeriod: period.daysInPeriod, asOfDate: period.currentEnd });
    const lowStockCount = branchInventory.filter((item) => {
      const quantity = numeric(item.quantity ?? item.opening_stock);
      const threshold = numeric(item.low_stock_threshold ?? item.min_quantity ?? item.reorder_point);
      return quantity <= 0 || (threshold > 0 && quantity <= threshold);
    }).length;
    return { ...branch, metrics, alerts: branchAlerts.length, lowStockCount, health: healthScore({ metrics, alertCount: branchAlerts.length, lowStockCount }) };
  }).sort((left, right) => right.metrics.totalSales - left.metrics.totalSales), [inventory, period.currentEnd, period.daysInPeriod, period.rangeType, periodPurchases, periodSales, revenueSources, scopedAlerts, taggedCurrentFixedExpensePool, taggedPeriodExpenses, usesAllocatedFixedCosts, visibleBranches]);

  const activeAlertCandidates = useMemo(() => buildActiveAlertCandidates({ inventory, todaySales, customerDebts, supplierInvoices, netProfit: todayMetricsForAlerts.netProfit, branches: normalizedBranches, today, currency: `${String(currency || 'SAR').trim()} ` }), [currency, customerDebts, inventory, normalizedBranches, supplierInvoices, today, todayMetricsForAlerts.netProfit, todaySales]);
  const activeAlertSignature = useMemo(() => JSON.stringify(activeAlertCandidates.map((alert) => ({ source_key: alert.source_key, severity: alert.severity, message: alert.message })).sort((left, right) => left.source_key.localeCompare(right.source_key))), [activeAlertCandidates]);
  const canReconcileAlerts = enabled && isAllBranches && !periodSalesQuery.isLoading && !supplierInvoicesQuery.isLoading && !customerDebtsQuery.isLoading && !inventoryQuery.isLoading;

  useEffect(() => {
    if (!canReconcileAlerts) return undefined;
    let cancelled = false;
    reconcileActiveAlerts({ restaurantId: activeRestaurant.id, candidates: activeAlertCandidates }).catch((error) => {
      if (!cancelled) console.warn('[OwnerDashboard] active alert reconciliation failed:', error.message);
    });
    return () => { cancelled = true; };
  }, [activeAlertCandidates, activeAlertSignature, activeRestaurant.id, canReconcileAlerts]);

  const consumption = useMemo(() => buildInventoryConsumption(inventoryTransactions, products, inventory), [inventory, inventoryTransactions, products]);
  const inventoryOverview = useMemo(() => buildInventoryOverview(inventory, products), [inventory, products]);
  const priceReport = useMemo(() => buildPriceControlReport(products, priceHistory), [priceHistory, products]);
  const supplierComparisons = useMemo(() => buildSupplierPriceComparisons(priceHistory), [priceHistory]);
  const branchPriceInconsistencies = useMemo(() => buildBranchPriceInconsistencies(priceHistory), [priceHistory]);
  const expenseGroups = useMemo(() => groupExpensesByCategory(periodExpenses, expenseCategories), [expenseCategories, periodExpenses]);
  const revenueTrend = useMemo(() => aggregateDailyRevenue(periodSales, (sale) => calculateSalesRevenue(sale, revenueSources).total), [periodSales, revenueSources]);
  const receivables = customerDebts.reduce((sum, debt) => sum + numeric(debt.remaining_amount ?? debt.balance ?? debt.total_amount), 0);
  const payables = supplierInvoices.filter(approvedPurchase).reduce((sum, invoice) => sum + Math.max(0, numeric(invoice.remaining_amount ?? invoice.balance ?? (numeric(invoice.total_amount) - numeric(invoice.paid_amount ?? invoice.amount_paid)))), 0);
  const cashRegister = latestCashPosition(periodSales);
  const periodSalesChange = percentageChange(periodMetrics.totalSales, previousPeriodMetrics.totalSales);
  const periodPurchaseQuantity = periodPurchases.reduce((sum, invoice) => sum + (Array.isArray(invoice.items) ? invoice.items.reduce((itemSum, item) => itemSum + numeric(item?.quantity), 0) : numeric(invoice.qty ?? invoice.quantity)), 0);
  const supplierCount = new Set(periodPurchases.map((invoice) => invoice.supplier_id || invoice.supplier_name).filter(Boolean)).size;

  const coreQueries = [periodSalesQuery, previousPeriodSalesQuery, periodExpensesQuery, previousPeriodExpensesQuery, expenseCategoriesQuery, supplierInvoicesQuery, customerDebtsQuery, inventoryQuery];
  if (usesAllocatedFixedCosts) coreQueries.push(currentFixedExpensePoolQuery, previousFixedExpensePoolQuery);
  const loading = coreQueries.some((query) => query.isLoading);
  const hasQueryError = [...coreQueries, inventoryTransactionsQuery, productsQuery, priceHistoryQuery].some((query) => query.isError);
  const displayScope = isAllBranches ? copy.allBranches : selectedBranchLabel;
  const isLive = realtimeStatus === 'SUBSCRIBED';

  const changeReportPage = useCallback((page) => {
    const next = new URLSearchParams(searchParams);
    if (page === 'executive') next.delete('report');
    else next.set('report', page);
    setSearchParams(next, { replace: false });
  }, [searchParams, setSearchParams]);

  const changeReportPeriod = useCallback((nextPeriod) => {
    const next = new URLSearchParams(searchParams);
    if (nextPeriod === 'today') next.delete('period');
    else next.set('period', nextPeriod);
    setSearchParams(next, { replace: false });
  }, [searchParams, setSearchParams]);

  const model = useMemo(() => ({
    formatMoney, periodMetrics, previousPeriodMetrics, periodSalesChange, periodLabel,
    branchRankings, scopedAlerts, inventoryOverview, receivables, payables, cashRegister,
    consumption, priceReport, supplierComparisons, branchPriceInconsistencies, priceHistory,
    expenseGroups, revenueTrend, periodPurchaseQuantity, periodPurchaseCost: periodMetrics.totalPurchaseCost,
    supplierCount, selectBranch: setSelectedBranchId, canAddBranch: role === 'owner',
    openQuickAddBranch: () => setQuickAddBranchOpen(true), loadingActiveAlerts,
  }), [branchPriceInconsistencies, branchRankings, cashRegister, consumption, expenseGroups, formatMoney, inventoryOverview, loadingActiveAlerts, payables, periodLabel, periodMetrics, periodPurchaseQuantity, periodSalesChange, previousPeriodMetrics, priceHistory, priceReport, receivables, revenueTrend, role, scopedAlerts, setSelectedBranchId, supplierComparisons, supplierCount]);

  if (loading) return <DashboardSkeleton />;

  return (
    <div data-testid="owner-mega-dashboard" className="mx-auto box-border w-full min-w-0 max-w-6xl overflow-x-hidden space-y-4 px-3 pb-8 pt-1 sm:space-y-5 sm:px-5" dir={isRTL ? 'rtl' : 'ltr'}>
      <header data-testid="owner-report-center" className="overflow-hidden rounded-[1.75rem] border border-blue-100 bg-gradient-to-br from-white via-blue-50/45 to-indigo-50/70 p-4 shadow-[0_18px_50px_-30px_rgba(37,99,235,0.45)] dark:border-blue-900/60 dark:from-slate-950 dark:via-blue-950/35 dark:to-indigo-950/40 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25"><ClipboardList className="h-5 w-5" /></span><div className="min-w-0"><h1 className="truncate text-xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{copy.title}</h1><p className="mt-1 text-xs font-medium text-muted-foreground sm:text-sm">{copy.subtitle}</p></div></div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold"><span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/85 px-2.5 py-1.5 text-foreground shadow-sm"><Building2 className="h-3.5 w-3.5 text-blue-600" />{displayScope}</span><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 ${isLive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300'}`}><Radio className={`h-3.5 w-3.5 ${isLive ? 'animate-pulse' : ''}`} />{isLive ? copy.live : copy.syncing}</span></div>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <label className="relative min-w-0 flex-1 sm:w-56"><span className="sr-only">{copy.allBranches}</span><Building2 className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-600" /><select data-testid="owner-branch-selector" value={isAllBranches ? 'all' : selectedBranchId || 'all'} onChange={(event) => setSelectedBranchId(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-border bg-background ps-9 pe-8 text-xs font-bold text-foreground shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"><option value="all">{copy.allBranches}</option>{normalizedBranches.map((branch) => <option key={branch.id || branch.key} value={branch.id}>{branch.label}</option>)}</select><ChevronRight className="pointer-events-none absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-muted-foreground" /></label>
            <label className="relative w-32 min-w-0 shrink-0 sm:w-40"><span className="sr-only">{copy.choosePeriod}</span><CalendarDays className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-600" /><select data-testid="owner-period-selector" aria-label={copy.choosePeriod} value={activePeriod} onChange={(event) => changeReportPeriod(event.target.value)} className="h-11 w-full appearance-none truncate rounded-xl border border-border bg-background ps-9 pe-7 text-xs font-bold text-foreground shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">{REPORT_PERIODS.map((option) => <option key={option.key} value={option.key}>{copy[option.labelKey] || option.fallback}</option>)}</select><ChevronRight className="pointer-events-none absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-muted-foreground" /></label>
          </div>
        </div>
        {hasQueryError ? <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{copy.unable}</div> : null}
      </header>

      <nav data-testid="owner-report-nav" aria-label={copy.title} className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-border/80 bg-card p-1.5 shadow-sm">
        <div className="grid min-w-0 grid-cols-2 gap-1 sm:grid-cols-4">
          {REPORT_PAGES.map((page) => {
            const active = activePage === page.key;
            const Icon = page.icon;
            return <button key={page.key} type="button" aria-current={active ? 'page' : undefined} onClick={() => changeReportPage(page.key)} className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-2 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-3 ${active ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Icon className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{copy[page.labelKey] || page.fallback}</span></button>;
          })}
        </div>
      </nav>

      <OwnerReportCenter activePage={activePage} model={model} copy={copy} />
      <QuickAddBranchDialog open={isQuickAddBranchOpen} onOpenChange={setQuickAddBranchOpen} />
    </div>
  );
}

export default function OwnerDashboard() {
  const { activeRestaurant, loadingRestaurants, loadingPortalIdentity, portalIdentityError, refetchRestaurants, refetchPortalIdentity } = useTenant();
  const { user, isLoadingAuth, authError, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  if (isLoadingAuth || loadingRestaurants || (activeRestaurant && loadingPortalIdentity)) return <DashboardSkeleton />;
  if (!user || authError?.type === 'auth_required') return <div className="mx-auto mt-10 max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center dark:border-amber-900 dark:bg-amber-950/40"><AlertCircle className="mx-auto h-6 w-6 text-amber-600" /><p className="mt-3 text-sm font-semibold">Your session has expired. Please sign in again.</p><button type="button" onClick={() => navigate('/erp-login')} className="mt-3 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Sign in again</button></div>;
  if (!activeRestaurant || portalIdentityError) return <div className="mx-auto mt-10 max-w-md rounded-2xl border border-red-200 bg-red-50 p-5 text-center dark:border-red-900 dark:bg-red-950/40"><AlertCircle className="mx-auto h-6 w-6 text-red-600" /><p className="mt-3 text-sm font-semibold">Unable to load this section. Try again.</p><button type="button" onClick={async () => { await checkUserAuth(); await refetchRestaurants(); await refetchPortalIdentity(); }} className="mt-3 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Retry</button></div>;
  return <WidgetErrorBoundary><OwnerDashboardContent /></WidgetErrorBoundary>;
}
