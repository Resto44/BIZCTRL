/**
 * OracleAnalytics — Enterprise Oracle Analytics Dashboard
 * Supports: Today / Yesterday / Week / Month / Quarter / Year / Last 6 Months / Custom
 * Branch filter: All Branches or individual branch
 * KPIs: Sales, Purchases, Fixed Expense, Variable Expense,
 *        Gross Profit, Net Profit, Profit Margin, Growth %
 */
import React, { useState, useMemo, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { tagExpensesWithCategories, calculateSalesRevenue, formatDate } from '@/lib/helpers';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import BranchSelect from '@/components/shared/BranchSelect';
import {
  TrendingUp, DollarSign, ShoppingCart,
  BarChart3, Activity, ArrowUpRight, ArrowDownRight,
  Target, Zap,
} from 'lucide-react';
import {
  format, startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, subDays, subMonths,
} from 'date-fns';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ── Date range presets ────────────────────────────────────────────────────────
const RANGES = ['today', 'yesterday', 'week', 'month', 'quarter', 'year', 'last6months', 'custom'];

function getRange(type, customFrom, customTo) {
  const now = new Date();
  switch (type) {
    case 'today':      return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday':  { const y = subDays(now, 1); return { from: startOfDay(y), to: endOfDay(y) }; }
    case 'week':       return { from: startOfWeek(now, { weekStartsOn: 6 }), to: endOfWeek(now, { weekStartsOn: 6 }) };
    case 'month':      return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'quarter':    return { from: startOfQuarter(now), to: endOfQuarter(now) };
    case 'year':       return { from: startOfYear(now), to: endOfYear(now) };
    case 'last6months':{ const s = startOfMonth(subMonths(now, 5)); return { from: s, to: endOfMonth(now) }; }
    case 'custom':     return { from: new Date(customFrom), to: new Date(customTo) };
    default:           return { from: startOfMonth(now), to: endOfMonth(now) };
  }
}

function getRangeLabel(type) {
  const map = {
    today: 'Today', yesterday: 'Yesterday', week: 'This Week',
    month: 'This Month', quarter: 'This Quarter', year: 'This Year',
    last6months: 'Last 6 Months', custom: 'Custom',
  };
  return map[type] || type;
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ title, value, subtitle, icon: Icon, color = 'blue', trend }) {
  const colorMap = {
    blue:   { bg: 'bg-blue-50 dark:bg-blue-950/50',     icon: 'text-blue-600',    border: 'border-blue-100 dark:border-blue-900/60',    val: 'text-blue-700 dark:text-blue-400' },
    green:  { bg: 'bg-emerald-50 dark:bg-emerald-950/50', icon: 'text-emerald-600', border: 'border-emerald-100 dark:border-emerald-900/60', val: 'text-emerald-700 dark:text-emerald-400' },
    amber:  { bg: 'bg-amber-50 dark:bg-amber-950/50',   icon: 'text-amber-600',   border: 'border-amber-100 dark:border-amber-900/60',   val: 'text-amber-700 dark:text-amber-400' },
    red:    { bg: 'bg-red-50 dark:bg-red-950/50',       icon: 'text-red-600',     border: 'border-red-100 dark:border-red-900/60',      val: 'text-red-700 dark:text-red-400' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-950/50', icon: 'text-purple-600',  border: 'border-purple-100 dark:border-purple-900/60', val: 'text-purple-700 dark:text-purple-400' },
    indigo: { bg: 'bg-indigo-50 dark:bg-indigo-950/50', icon: 'text-indigo-600',  border: 'border-indigo-100 dark:border-indigo-900/60', val: 'text-indigo-700 dark:text-indigo-400' },
    orange: { bg: 'bg-orange-50 dark:bg-orange-950/50', icon: 'text-orange-600',  border: 'border-orange-100 dark:border-orange-900/60', val: 'text-orange-700 dark:text-orange-400' },
    cyan:   { bg: 'bg-cyan-50 dark:bg-cyan-950/50',     icon: 'text-cyan-600',    border: 'border-cyan-100 dark:border-cyan-900/60',    val: 'text-cyan-700 dark:text-cyan-400' },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <Card className={`border ${c.border} transition-all duration-200`}>
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
        <p className={`font-black text-lg leading-tight ${c.val}`}>{value}</p>
        <p className="text-[11px] font-medium text-muted-foreground mt-0.5 leading-tight">{title}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function OracleAnalytics() {
  const { currency } = useLanguage();
  const { activeRestaurant, branches } = useTenant();

  const [rangeType, setRangeType] = useState('month');
  const [branch, setBranch] = useState('all');
  const [customFrom, setCustomFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const fmt = (n) => `${currency}${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fmtPct = (n) => `${(n || 0).toFixed(1)}%`;

  const dateRange = useMemo(() => getRange(rangeType, customFrom, customTo), [rangeType, customFrom, customTo]);
  const fromStr = formatDate(dateRange.from);
  const toStr   = formatDate(dateRange.to);

  // Previous period for growth %
  const prevRange = useMemo(() => {
    const diffMs = dateRange.to - dateRange.from;
    return { from: new Date(dateRange.from - diffMs - 86400000), to: new Date(dateRange.from - 86400000) };
  }, [dateRange]);
  const prevFromStr = formatDate(prevRange.from);
  const prevToStr   = formatDate(prevRange.to);

  const enabled = !!activeRestaurant?.id;
  const orgFilter = activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : null;

  // ── Data Queries ─────────────────────────────────────────────────────────────
  const { data: allSales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['oracle_sales', orgFilter, branch],
    queryFn: () => base44.entities.DailySales.filter(orgFilter || {}, '-date', 5000),
    staleTime: 60000, enabled,
  });

  const { data: allPurchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ['oracle_purchases', activeRestaurant?.id, branch],
    queryFn: async () => {
      if (!activeRestaurant?.id) return [];
      const { data, error } = await supabase
        .from('supplier_invoices')
        .select('*')
        .eq('restaurant_id', activeRestaurant.id)
        .in('approval_status', ['approved', 'auto_approved'])
        .order('date', { ascending: false })
        .limit(5000);
      if (error) return [];
      return data || [];
    },
    staleTime: 60000, enabled,
  });

  const { data: allExpenses = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ['oracle_expenses', orgFilter, branch],
    queryFn: () => base44.entities.Expense.filter(orgFilter || {}, '-date', 5000),
    staleTime: 60000, enabled,
  });

  const { data: expenseCategories = [] } = useQuery({
    queryKey: ['oracle_exp_cats', activeRestaurant?.id],
    queryFn: () => base44.entities.ExpenseCategory
      ? base44.entities.ExpenseCategory.filter(
          activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : {}, 'sort_order', 500)
      : Promise.resolve([]),
    staleTime: 300000, enabled,
  });

  // ── Filter by date + branch ───────────────────────────────────────────────────
  const filterData = (arr, dateField = 'date', branchField = 'branch') =>
    (arr || []).filter(r =>
      r[dateField] >= fromStr && r[dateField] <= toStr &&
      (branch === 'all' || r[branchField] === branch)
    );

  const filterPrev = (arr, dateField = 'date', branchField = 'branch') =>
    (arr || []).filter(r =>
      r[dateField] >= prevFromStr && r[dateField] <= prevToStr &&
      (branch === 'all' || r[branchField] === branch)
    );

  // ── Compute KPIs ─────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const sales = filterData(allSales);
    const purchases = filterData(allPurchases);
    const expenses = filterData(allExpenses, 'date', 'branch_key');
    const taggedExpenses = tagExpensesWithCategories(expenses, expenseCategories);

    const totalSales = sales.reduce((s, r) => s + (calculateSalesRevenue(r, [])?.total || 0), 0);
    const totalPurchases = purchases.reduce((s, inv) => s + (Number(inv.total_amount) || 0), 0);
    const fixedExpenses = taggedExpenses.filter(e => e._is_fixed || e.is_fixed).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const variableExpenses = taggedExpenses.filter(e => !e._is_fixed && !e.is_fixed).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const grossProfit = totalSales - totalPurchases;
    const netProfit = grossProfit - fixedExpenses - variableExpenses;
    const profitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

    // Previous period for growth
    const prevSales = filterPrev(allSales);
    const prevTotal = prevSales.reduce((s, r) => s + (calculateSalesRevenue(r, [])?.total || 0), 0);
    const growth = prevTotal > 0 ? ((totalSales - prevTotal) / prevTotal) * 100 : 0;

    return { totalSales, totalPurchases, fixedExpenses, variableExpenses, grossProfit, netProfit, profitMargin, growth };
  }, [allSales, allPurchases, allExpenses, expenseCategories, fromStr, toStr, prevFromStr, prevToStr, branch]);

  // ── 6-Month Trend Chart ───────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const mStart = format(startOfMonth(d), 'yyyy-MM-dd');
      const mEnd   = format(endOfMonth(d), 'yyyy-MM-dd');
      const label  = format(d, 'MMM yy');

      const mSales = (allSales || []).filter(s => s.date >= mStart && s.date <= mEnd && (branch === 'all' || s.branch === branch));
      const mPurch = (allPurchases || []).filter(p => p.date >= mStart && p.date <= mEnd && (branch === 'all' || p.branch === branch));
      const mExp   = (allExpenses || []).filter(e => e.date >= mStart && e.date <= mEnd && (branch === 'all' || e.branch_key === branch));
      const taggedM = tagExpensesWithCategories(mExp, expenseCategories);

      const totalSales = mSales.reduce((s, r) => s + (calculateSalesRevenue(r, [])?.total || 0), 0);
      const totalPurch = mPurch.reduce((s, inv) => s + (Number(inv.total_amount) || 0), 0);
      const fixedExp   = taggedM.filter(e => e._is_fixed || e.is_fixed).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const varExp     = taggedM.filter(e => !e._is_fixed && !e.is_fixed).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const grossP     = totalSales - totalPurch;
      const netP       = grossP - fixedExp - varExp;
      const margin     = totalSales > 0 ? (netP / totalSales) * 100 : 0;

      months.push({ month: label, Sales: Math.round(totalSales), Purchases: Math.round(totalPurch), FixedExp: Math.round(fixedExp), VarExp: Math.round(varExp), GrossProfit: Math.round(grossP), NetProfit: Math.round(netP), Margin: parseFloat(margin.toFixed(1)) });
    }
    return months;
  }, [allSales, allPurchases, allExpenses, expenseCategories, branch]);

  const isLoading = loadingSales || loadingPurchases || loadingExpenses;

  return (
    <div className="space-y-5 pb-20">
      <PageHeader title="Oracle Analytics Dashboard" />

      {/* ── Date Range Selector ── */}
      <div className="space-y-3">
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-1">
          {RANGES.map(r => (
            <Button
              key={r}
              size="sm"
              variant={rangeType === r ? 'default' : 'outline'}
              onClick={() => setRangeType(r)}
              className="text-xs whitespace-nowrap shrink-0"
            >
              {getRangeLabel(r)}
            </Button>
          ))}
        </div>

        {rangeType === 'custom' && (
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">From</label>
              <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">To</label>
              <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </div>
          </div>
        )}

        <BranchSelect value={branch} onChange={setBranch} includeAll />
      </div>

      {/* ── KPI Cards ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="border border-border/50">
              <CardContent className="p-4">
                <div className="h-4 w-24 bg-muted rounded mb-3 animate-pulse" />
                <div className="h-7 w-32 bg-muted rounded mb-1 animate-pulse" />
                <div className="h-3 w-20 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <KpiCard title="Sales" value={fmt(kpis.totalSales)} icon={DollarSign} color="blue" trend={kpis.growth} subtitle={getRangeLabel(rangeType)} />
          <KpiCard title="Purchases" value={fmt(kpis.totalPurchases)} icon={ShoppingCart} color="amber" subtitle={getRangeLabel(rangeType)} />
          <KpiCard title="Fixed Expense" value={fmt(kpis.fixedExpenses)} icon={Target} color="orange" subtitle={getRangeLabel(rangeType)} />
          <KpiCard title="Variable Expense" value={fmt(kpis.variableExpenses)} icon={Zap} color="red" subtitle={getRangeLabel(rangeType)} />
          <KpiCard title="Gross Profit" value={fmt(kpis.grossProfit)} icon={TrendingUp} color="green" subtitle="Sales − Purchases" />
          <KpiCard title="Net Profit" value={fmt(kpis.netProfit)} icon={Activity} color={kpis.netProfit >= 0 ? 'purple' : 'red'} subtitle="Gross − Expenses" />
          <KpiCard title="Profit Margin" value={fmtPct(kpis.profitMargin)} icon={BarChart3} color="indigo" subtitle="Net / Sales" />
          <KpiCard title="Growth %" value={`${kpis.growth >= 0 ? '+' : ''}${fmtPct(kpis.growth)}`} icon={kpis.growth >= 0 ? ArrowUpRight : ArrowDownRight} color={kpis.growth >= 0 ? 'green' : 'red'} subtitle="vs previous period" />
        </div>
      )}

      {/* ── 6-Month Trend Chart ── */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-bold text-foreground mb-3">6-Month Trend</p>
          <Suspense fallback={<div className="h-48 flex items-center justify-center text-muted-foreground text-xs">Loading chart…</div>}>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Sales" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Sales" />
                <Bar dataKey="Purchases" fill="#f59e0b" radius={[3, 3, 0, 0]} name="Purchases" />
                <Bar dataKey="FixedExp" fill="#f97316" radius={[3, 3, 0, 0]} name="Fixed Exp" />
                <Bar dataKey="VarExp" fill="#ef4444" radius={[3, 3, 0, 0]} name="Var Exp" />
                <Line type="monotone" dataKey="GrossProfit" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Gross Profit" />
                <Line type="monotone" dataKey="NetProfit" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} name="Net Profit" />
              </ComposedChart>
            </ResponsiveContainer>
          </Suspense>
        </CardContent>
      </Card>

      {/* ── Monthly Summary Table ── */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-bold text-foreground mb-3">Monthly Summary</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left py-2 pr-2 font-semibold text-muted-foreground">Month</th>
                  <th className="text-right py-2 px-1 font-semibold text-muted-foreground">Sales</th>
                  <th className="text-right py-2 px-1 font-semibold text-muted-foreground">Purchases</th>
                  <th className="text-right py-2 px-1 font-semibold text-muted-foreground">Gross</th>
                  <th className="text-right py-2 pl-1 font-semibold text-muted-foreground">Net</th>
                  <th className="text-right py-2 pl-1 font-semibold text-muted-foreground">Margin</th>
                </tr>
              </thead>
              <tbody>
                {trendData.map(row => (
                  <tr key={row.month} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="py-2 pr-2 font-medium text-foreground">{row.month}</td>
                    <td className="py-2 px-1 text-right text-blue-600 font-semibold">{fmt(row.Sales)}</td>
                    <td className="py-2 px-1 text-right text-amber-600 font-semibold">{fmt(row.Purchases)}</td>
                    <td className="py-2 px-1 text-right text-emerald-600 font-semibold">{fmt(row.GrossProfit)}</td>
                    <td className={`py-2 pl-1 text-right font-semibold ${row.NetProfit >= 0 ? 'text-purple-600' : 'text-red-600'}`}>{fmt(row.NetProfit)}</td>
                    <td className={`py-2 pl-1 text-right font-semibold ${row.Margin >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>{row.Margin.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
