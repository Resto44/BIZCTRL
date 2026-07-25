import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/shared/PageHeader';
import { getDateRange, getPreviousDateRange, formatDate, computeDashboardMetrics, formatCurrency } from '@/lib/helpers';
import { useExpenseCategories } from '@/components/expenses/ExpenseCategoryManager';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';

const RANGES = ['week', 'month', 'year'];
const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const ui = {
  en: {
    title: 'Profit & Loss', totalRevenue: 'Total Revenue', purchaseCost: 'Purchase Cost',
    grossProfit: 'Gross Profit', totalExpenses: 'Total Expenses', netProfit: 'Net Profit',
    wasteCost: 'Waste Cost', wastePct: 'Waste % of Revenue',
    grossMargin: 'Gross Margin', netMargin: 'Net Margin', expensePct: 'Expenses % of Revenue',
    byBranch: 'By Branch', expenseBreakdown: 'Expense Breakdown', revenueTrend: 'Revenue Trend',
    week: 'Week', month: 'Month', year: 'Year', rent: 'Rent', salaries: 'Salaries',
    utilities: 'Utilities', other: 'Other', noData: 'No data for period', branch: 'Branch',
    revenue: 'Revenue', profit: 'Profit', expenses: 'Expenses', summary: 'P&L Summary',
    cashSales: 'Cash Sales', networkSales: 'Network Sales', creditSales: 'Credit Sales',
    prevPeriod: 'vs Prev Period', growth: 'Growth', exportCSV: 'Export CSV', comparePeriod: 'Compare',
  },
  ar: {
    title: 'الأرباح والخسائر', totalRevenue: 'إجمالي الإيرادات', purchaseCost: 'تكلفة المشتريات',
    grossProfit: 'إجمالي الربح', totalExpenses: 'إجمالي المصاريف', netProfit: 'صافي الربح',
    wasteCost: 'تكلفة الهدر', wastePct: 'نسبة الهدر من الإيرادات',
    grossMargin: 'هامش الربح الإجمالي', netMargin: 'هامش الربح الصافي', expensePct: 'نسبة المصاريف',
    byBranch: 'حسب الفرع', expenseBreakdown: 'تفصيل المصاريف', revenueTrend: 'اتجاه الإيرادات',
    week: 'أسبوع', month: 'شهر', year: 'سنة', rent: 'إيجار', salaries: 'رواتب',
    utilities: 'خدمات', other: 'أخرى', noData: 'لا توجد بيانات', branch: 'الفرع',
    revenue: 'الإيرادات', profit: 'الربح', expenses: 'المصاريف', summary: 'ملخص الأرباح والخسائر',
    cashSales: 'مبيعات نقداً', networkSales: 'مبيعات شبكة', creditSales: 'مبيعات آجل',
    prevPeriod: 'مقابل الفترة السابقة', growth: 'نمو', exportCSV: 'تصدير CSV', comparePeriod: 'مقارنة',
  },
  fa: {
    title: 'سود و زیان', totalRevenue: 'درآمد کل', purchaseCost: 'هزینه خرید',
    grossProfit: 'سود ناخالص', totalExpenses: 'مجموع هزینه‌ها', netProfit: 'سود خالص',
    wasteCost: 'هزینه ضایعات', wastePct: 'درصد ضایعات از درآمد',
    grossMargin: 'حاشیه سود ناخالص', netMargin: 'حاشیه سود خالص', expensePct: 'درصد هزینه از درآمد',
    byBranch: 'بر اساس فرع', expenseBreakdown: 'تفکیک هزینه‌ها', revenueTrend: 'روند درآمد',
    week: 'هفته', month: 'ماه', year: 'سال', rent: 'اجاره', salaries: 'حقوق',
    utilities: 'آب و برق', other: 'سایر', noData: 'داده‌ای وجود ندارد', branch: 'فرع',
    revenue: 'درآمد', profit: 'سود', expenses: 'هزینه‌ها', summary: 'خلاصه سود و زیان',
    cashSales: 'فروش نقد', networkSales: 'فروش شبکه', creditSales: 'فروش نسیه',
    prevPeriod: 'در مقایسه با دوره قبل', growth: 'رشد', exportCSV: 'خروجی CSV', comparePeriod: 'مقایسه',
  },
};

function KPICard({ label, value, sub, positive, neutral }) {
  const color = neutral ? 'text-foreground' : positive ? 'text-emerald-600' : 'text-red-500';
  const Icon = neutral ? Minus : positive ? TrendingUp : TrendingDown;
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 shrink-0 ${color}`} />
        <p className={`text-lg font-bold ${color}`}>{value}</p>
      </div>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </Card>
  );
}

export default function ProfitLoss() {
  const { lang, currency } = useLanguage();
  const { branches, activeRestaurant } = useTenant();
  const m = ui[lang] || ui.en;
  const [rangeType, setRangeType] = useState('month');
  const [showComparison, setShowComparison] = useState(false);

  const { data: sales = [] } = useQuery({
    queryKey: ['sales', activeRestaurant?.id],
    queryFn: () => base44.entities.DailySales.filter(activeRestaurant?.id ? { restaurant_id: activeRestaurant.id, organization_id: activeRestaurant.org_id } : {}, '-date', 2000),
    enabled: !!activeRestaurant?.id,
    staleTime: 120000
  });
  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases', activeRestaurant?.id],
    queryFn: () => base44.entities.Purchase.filter(activeRestaurant?.id ? { restaurant_id: activeRestaurant.id, organization_id: activeRestaurant.org_id } : {}, '-date', 2000),
    enabled: !!activeRestaurant?.id,
    staleTime: 120000
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', activeRestaurant?.id],
    queryFn: () => base44.entities.Expense.filter(activeRestaurant?.id ? { restaurant_id: activeRestaurant.id, organization_id: activeRestaurant.org_id } : {}, '-date', 2000),
    enabled: !!activeRestaurant?.id,
    staleTime: 120000
  });
  const { data: expenseCategories = [] } = useExpenseCategories();
  const { data: wastes = [] } = useQuery({
    queryKey: ['inventory_waste', activeRestaurant?.id],
    queryFn: () => base44.entities.InventoryWaste.filter(activeRestaurant?.id ? { restaurant_id: activeRestaurant.id, organization_id: activeRestaurant.org_id } : {}, '-date', 2000),
    enabled: !!activeRestaurant?.id,
    staleTime: 120000
  });

  const dateRange = useMemo(() => getDateRange(rangeType), [rangeType]);
  const fromStr = formatDate(dateRange.from);
  const toStr = formatDate(dateRange.to);

  const fSales = useMemo(() => sales.filter(s => s.date >= fromStr && s.date <= toStr), [sales, fromStr, toStr]);
  const fPurch = useMemo(() => purchases.filter(p => p.date >= fromStr && p.date <= toStr), [purchases, fromStr, toStr]);
  // Tag each expense with _is_fixed based on its category
  const expensesTagged = useMemo(() => {
    const catMap = {};
    expenseCategories.forEach(c => { catMap[c.id] = !!c.is_fixed; });
    return expenses.map(e => ({
      ...e,
      _is_fixed: catMap[e.category_id] ?? catMap[e.expense_category_id] ?? false,
    }));
  }, [expenses, expenseCategories]);
  const fExp = useMemo(() => expensesTagged.filter(e => e.date >= fromStr && e.date <= toStr), [expensesTagged, fromStr, toStr]);
  const monthlyExpensePool = useMemo(() => {
    const monthStart = format(startOfMonth(dateRange.to), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(dateRange.to), 'yyyy-MM-dd');
    return expensesTagged.filter(expense => expense.date >= monthStart && expense.date <= monthEnd);
  }, [dateRange.to, expensesTagged]);
  const fWaste = useMemo(() => wastes.filter(w => w.date >= fromStr && w.date <= toStr), [wastes, fromStr, toStr]);
  const totalWasteCost = useMemo(() => fWaste.reduce((s, w) => s + (w.total_loss || 0), 0), [fWaste]);

  const metrics = useMemo(() => computeDashboardMetrics(
    fSales, fPurch, fExp, rangeType, [], null, null,
    { monthlyExpenses: monthlyExpensePool, asOfDate: toStr },
  ), [fSales, fPurch, fExp, monthlyExpensePool, rangeType, toStr]);

  // Previous period comparison
  const prevDateRange = useMemo(() => getPreviousDateRange(rangeType), [rangeType]);
  const prevFromStr = formatDate(prevDateRange.from);
  const prevToStr = formatDate(prevDateRange.to);
  const prevSales = useMemo(() => sales.filter(s => s.date >= prevFromStr && s.date <= prevToStr), [sales, prevFromStr, prevToStr]);
  const prevPurch = useMemo(() => purchases.filter(p => p.date >= prevFromStr && p.date <= prevToStr), [purchases, prevFromStr, prevToStr]);
  const prevExp = useMemo(() => expensesTagged.filter(e => e.date >= prevFromStr && e.date <= prevToStr), [expensesTagged, prevFromStr, prevToStr]);
  const prevMonthlyExpensePool = useMemo(() => {
    const monthStart = format(startOfMonth(prevDateRange.to), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(prevDateRange.to), 'yyyy-MM-dd');
    return expensesTagged.filter(expense => expense.date >= monthStart && expense.date <= monthEnd);
  }, [expensesTagged, prevDateRange.to]);
  const prevMetrics = useMemo(() => computeDashboardMetrics(
    prevSales, prevPurch, prevExp, rangeType, [], null, null,
    { monthlyExpenses: prevMonthlyExpensePool, asOfDate: prevToStr },
  ), [prevSales, prevPurch, prevExp, prevMonthlyExpensePool, prevToStr, rangeType]);

  const pctChange = (cur, prev) => {
    if (!prev || prev === 0) return null;
    return ((cur - prev) / Math.abs(prev) * 100).toFixed(1);
  };

  const adjustedNetProfit = metrics.netProfit - totalWasteCost;
  const grossMargin = metrics.totalSales > 0 ? (metrics.profit / metrics.totalSales * 100).toFixed(1) : null;
  const netMargin = metrics.totalSales > 0 ? (adjustedNetProfit / metrics.totalSales * 100).toFixed(1) : null;
  const expensePct = metrics.totalSales > 0 ? (metrics.totalExpenses / metrics.totalSales * 100).toFixed(1) : null;
  const wastePct = metrics.totalSales > 0 ? (totalWasteCost / metrics.totalSales * 100).toFixed(1) : null;

  // Expense by category
  const expByCat = useMemo(() => {
    const map = {};
    fExp.forEach(e => { map[e.category] = (map[e.category] || 0) + (e.amount || 0); });
    return Object.entries(map).map(([cat, val]) => ({
      name: m[cat] || cat,
      value: val,
    }));
  }, [fExp, m]);

  // Revenue trend by month
  const monthlyTrend = useMemo(() => {
    const map = {};
    fSales.forEach(s => {
      const mo = s.date?.slice(0, 7);
      if (!mo) return;
      if (!map[mo]) map[mo] = { revenue: 0, cost: 0, exp: 0 };
      map[mo].revenue += (s.cash || 0) + (s.network || 0) + (s.credit || 0);
    });
    fPurch.forEach(p => {
      const mo = p.date?.slice(0, 7);
      if (!mo) return;
      if (!map[mo]) map[mo] = { revenue: 0, cost: 0, exp: 0 };
      map[mo].cost += (p.qty || 0) * (p.used_price || p.current_price || 0);
    });
    fExp.forEach(e => {
      const mo = e.date?.slice(0, 7);
      if (!mo) return;
      if (!map[mo]) map[mo] = { revenue: 0, cost: 0, exp: 0 };
      map[mo].exp += e.amount || 0;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([mo, v]) => ({
      name: mo.slice(5),
      revenue: v.revenue,
      grossProfit: v.revenue - v.cost,
      netProfit: v.revenue - v.cost - v.exp,
    }));
  }, [fSales, fPurch, fExp]);

  // By branch P&L (including waste)
  const branchPL = useMemo(() => branches.map(b => {
    const bs = fSales.filter(s => s.branch === b.key);
    const bp = fPurch.filter(p => p.branch === b.key);
    const be = fExp.filter(e => e.branch === b.key || e.branch === 'all');
    const branchMonthlyExpensePool = monthlyExpensePool.filter(e => e.branch === b.key || e.branch === 'all');
    const bm = computeDashboardMetrics(
      bs, bp, be, rangeType, [], null, null,
      { monthlyExpenses: branchMonthlyExpensePool, asOfDate: toStr },
    );
    const bWaste = fWaste.filter(w => w.branch === b.key).reduce((s, w) => s + (w.total_loss || 0), 0);
    const adjNet = bm.netProfit - bWaste;
    const nm = bm.totalSales > 0 ? (adjNet / bm.totalSales * 100).toFixed(1) : null;
    return { name: b.label, ...bm, netProfit: adjNet, wasteCost: bWaste, netMargin: nm };
  }), [branches, fSales, fPurch, fExp, fWaste, monthlyExpensePool, rangeType, toStr]);

  const exportCSV = () => {
    const rows = [
      ['Metric', 'Current Period', 'Previous Period'],
      ['Total Revenue', metrics.totalSales, prevMetrics.totalSales],
      ['Purchase Cost', metrics.totalPurchaseCost, prevMetrics.totalPurchaseCost],
      ['Gross Profit', metrics.profit, prevMetrics.profit],
      ['Total Expenses', metrics.totalExpenses, prevMetrics.totalExpenses],
      ['Waste Cost', totalWasteCost, ''],
      ['Net Profit', adjustedNetProfit, prevMetrics.netProfit],
      ['Gross Margin %', grossMargin, prevMetrics.totalSales > 0 ? (prevMetrics.profit / prevMetrics.totalSales * 100).toFixed(1) : ''],
      ['Net Margin %', netMargin, prevMetrics.totalSales > 0 ? (prevMetrics.netProfit / prevMetrics.totalSales * 100).toFixed(1) : ''],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pl_${fromStr}_${toStr}.csv`;
    a.click();
  };

  return (
    <div>
      <PageHeader title={m.title} action={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowComparison(v => !v)}>
            {m.comparePeriod}
          </Button>
          <Button size="sm" variant="outline" onClick={exportCSV}>
            {m.exportCSV} ↓
          </Button>
        </div>
      } />

      {/* Range selector */}
      <div className="flex gap-2 mb-5">
        {RANGES.map(r => (
          <Button key={r} size="sm" variant={rangeType === r ? 'default' : 'outline'} onClick={() => setRangeType(r)}>
            {m[r]}
          </Button>
        ))}
      </div>

      {/* Fixed expenses excluded notice */}
      {metrics.fixedExpensesExcluded && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-xs text-amber-800 font-medium">
            ⚠️ Fixed monthly expenses ({formatCurrency(metrics.totalFixedExpenses, currency)}) are excluded from Net Profit on weekly/daily view. Switch to Month or Year to include them.
          </p>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <KPICard label={m.totalRevenue} value={formatCurrency(metrics.totalSales, currency)} neutral />
        <KPICard label={m.purchaseCost} value={formatCurrency(metrics.totalPurchaseCost, currency)} positive={false} neutral={false} />
        <KPICard label={m.grossProfit} value={formatCurrency(metrics.profit, currency)} positive={metrics.profit >= 0} />
        <KPICard label={m.totalExpenses} value={formatCurrency(metrics.totalExpenses, currency)} positive={false} neutral />
        <KPICard label={m.wasteCost} value={formatCurrency(totalWasteCost, currency)} positive={totalWasteCost === 0} neutral={totalWasteCost === 0} />
        <KPICard label={m.netProfit} value={formatCurrency(adjustedNetProfit, currency)} positive={adjustedNetProfit >= 0} />
        <KPICard
          label={m.netMargin}
          value={netMargin !== null ? `${netMargin}%` : '—'}
          sub={grossMargin !== null ? `${m.grossMargin}: ${grossMargin}%` : undefined}
          positive={Number(netMargin) >= 0}
          neutral={netMargin === null}
        />
      </div>

      {/* Period Comparison */}
      {showComparison && (
        <Card className="p-4 mb-5 border-blue-200 bg-blue-50/30">
          <h3 className="text-sm font-semibold mb-3 text-blue-700">{m.prevPeriod}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: m.totalRevenue, cur: metrics.totalSales, prev: prevMetrics.totalSales },
              { label: m.grossProfit, cur: metrics.profit, prev: prevMetrics.profit },
              { label: m.totalExpenses, cur: metrics.totalExpenses, prev: prevMetrics.totalExpenses },
              { label: m.netProfit, cur: adjustedNetProfit, prev: prevMetrics.netProfit },
            ].map((item, i) => {
              const chg = pctChange(item.cur, item.prev);
              const isPos = chg !== null && Number(chg) >= 0;
              return (
                <div key={i} className="bg-white dark:bg-card rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                  <p className="text-sm font-bold">{formatCurrency(item.cur, currency)}</p>
                  <p className="text-xs text-muted-foreground">{m.prevPeriod}: {formatCurrency(item.prev, currency)}</p>
                  {chg !== null && (
                    <p className={`text-xs font-semibold mt-1 ${isPos ? 'text-emerald-600' : 'text-red-500'}`}>
                      {isPos ? '▲' : '▼'} {Math.abs(chg)}%
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* P&L Summary statement */}
      <Card className="p-4 mb-5">
        <h3 className="text-sm font-semibold mb-3">{m.summary}</h3>
        <div className="space-y-1.5">
          {[
            { label: m.cashSales, value: metrics.totalCash, indent: false },
            { label: m.networkSales, value: metrics.totalNetwork, indent: false },
            { label: m.creditSales, value: metrics.totalCredit, indent: false },
            { label: m.totalRevenue, value: metrics.totalSales, bold: true, border: true },
            { label: `— ${m.purchaseCost}`, value: -metrics.totalPurchaseCost, indent: true, negative: true },
            { label: m.grossProfit, value: metrics.profit, bold: true, border: true, colored: true },
            { label: `— ${m.totalExpenses}`, value: -metrics.totalExpenses, indent: true, negative: true },
            { label: `— ${m.wasteCost}`, value: -totalWasteCost, indent: true, negative: true },
            { label: m.netProfit, value: metrics.netProfit - totalWasteCost, bold: true, border: true, colored: true, large: true },
          ].map((row, i) => (
            <div key={i} className={`flex justify-between items-center py-1 text-sm ${row.border ? 'border-t border-border mt-1 pt-2' : ''} ${row.indent ? 'ps-4' : ''}`}>
              <span className={`${row.bold ? 'font-semibold' : 'text-muted-foreground'} ${row.large ? 'text-base' : ''}`}>{row.label}</span>
              <span className={`font-${row.bold ? 'bold' : 'medium'} ${row.large ? 'text-base' : ''} ${row.colored ? (row.value >= 0 ? 'text-emerald-600' : 'text-red-500') : row.negative ? 'text-red-500' : ''}`}>
                {row.negative
                  ? `(${formatCurrency(Math.abs(row.value), currency)})`
                  : formatCurrency(row.value, currency)}
              </span>
            </div>
          ))}
        </div>

        {expensePct !== null && (
          <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground flex justify-between">
            <span>{m.expensePct}</span>
            <span className={`font-semibold ${Number(expensePct) > 40 ? 'text-red-500' : 'text-muted-foreground'}`}>{expensePct}%</span>
          </div>
        )}
        {wastePct !== null && totalWasteCost > 0 && (
          <div className="mt-1 text-xs text-muted-foreground flex justify-between">
            <span>{m.wastePct}</span>
            <span className={`font-semibold ${Number(wastePct) > 5 ? 'text-red-500' : 'text-amber-600'}`}>{wastePct}%</span>
          </div>
        )}
      </Card>

      {/* Monthly trend */}
      {monthlyTrend.length > 0 && (
        <Card className="p-4 mb-5">
          <h3 className="text-sm font-semibold mb-3">{m.revenueTrend}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={v => formatCurrency(v, currency)} />
              <Bar dataKey="revenue" fill="#2563eb" name={m.revenue} radius={[3, 3, 0, 0]} />
              <Bar dataKey="grossProfit" fill="#10b981" name={m.grossProfit} radius={[3, 3, 0, 0]} />
              <Bar dataKey="netProfit" fill="#8b5cf6" name={m.netProfit} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Expense breakdown */}
      {expByCat.length > 0 && (
        <Card className="p-4 mb-5">
          <h3 className="text-sm font-semibold mb-3">{m.expenseBreakdown}</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={expByCat} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={70} />
              <Tooltip formatter={v => formatCurrency(v, currency)} />
              <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                {expByCat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Waste Cost Breakdown */}
      {totalWasteCost > 0 && (
        <Card className="p-4 mb-5 border-red-200 bg-red-50/30">
          <h3 className="text-sm font-semibold mb-1 text-red-700">⚠️ {m.wasteCost}</h3>
          <p className="text-xs text-muted-foreground mb-3">Waste is deducted from Net Profit</p>
          <div className="space-y-2">
            {fWaste.reduce((acc, w) => {
              const key = w.product_name || w.product_id;
              const ex = acc.find(a => a.name === key);
              if (ex) ex.loss += (w.total_loss || 0);
              else acc.push({ name: key, loss: w.total_loss || 0 });
              return acc;
            }, []).sort((a, b) => b.loss - a.loss).slice(0, 5).map((item, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{item.name}</span>
                <span className="font-semibold text-red-600">({formatCurrency(item.loss, currency)})</span>
              </div>
            ))}
            <div className="flex justify-between text-xs font-bold border-t border-red-200 pt-2 mt-1">
              <span>Total Waste Loss</span>
              <span className="text-red-700">({formatCurrency(totalWasteCost, currency)})</span>
            </div>
          </div>
        </Card>
      )}

      {/* Branch P&L */}
      {branchPL.some(b => b.totalSales > 0) && (
        <Card className="p-4 mb-5">
          <h3 className="text-sm font-semibold mb-3">{m.byBranch}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-start pb-2">{m.branch}</th>
                  <th className="text-end pb-2">{m.revenue}</th>
                  <th className="text-end pb-2">{m.grossProfit}</th>
                  <th className="text-end pb-2">{m.expenses}</th>
                  <th className="text-end pb-2">{m.netProfit}</th>
                  <th className="text-end pb-2">{m.netMargin}</th>
                </tr>
              </thead>
              <tbody>
                {branchPL.map(b => (
                  <tr key={b.name} className="border-b border-border/50 last:border-0">
                    <td className="py-2 font-medium">{b.name}</td>
                    <td className="py-2 text-end">{formatCurrency(b.totalSales, currency)}</td>
                    <td className="py-2 text-end">{formatCurrency(b.profit, currency)}</td>
                    <td className="py-2 text-end text-red-500">{formatCurrency(b.totalExpenses, currency)}</td>
                    <td className={`py-2 text-end font-semibold ${b.netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(b.netProfit, currency)}</td>
                    <td className={`py-2 text-end ${b.netMargin !== null && Number(b.netMargin) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{b.netMargin !== null ? `${b.netMargin}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}