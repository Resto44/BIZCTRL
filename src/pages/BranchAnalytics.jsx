/**
 * BranchAnalytics — Enterprise Branch Analytics Dashboard
 * Owner can compare every branch: Sales, Purchases, Expenses, Profit,
 * Employees, Growth, Ranking, Top Branch, Worst Branch
 */
import React, { useState, useMemo, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { calculateSalesRevenue, tagExpensesWithCategories } from '@/lib/helpers';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy, AlertTriangle,
  Building2,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  startOfYear, endOfYear, subMonths,
} from 'date-fns';

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

function getRange(type) {
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  switch (type) {
    case 'today':  return { from: today, to: today };
    case 'week':   return { from: format(startOfWeek(now, { weekStartsOn: 6 }), 'yyyy-MM-dd'), to: format(endOfWeek(now, { weekStartsOn: 6 }), 'yyyy-MM-dd') };
    case 'month':  return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd') };
    case 'year':   return { from: format(startOfYear(now), 'yyyy-MM-dd'), to: format(endOfYear(now), 'yyyy-MM-dd') };
    default:       return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd') };
  }
}

function getPrevRange(type) {
  const now = new Date();
  switch (type) {
    case 'today':  { const y = format(new Date(now - 86400000), 'yyyy-MM-dd'); return { from: y, to: y }; }
    case 'week':   { const prev = subMonths(now, 0); const s = format(startOfWeek(new Date(now - 7 * 86400000), { weekStartsOn: 6 }), 'yyyy-MM-dd'); const e = format(endOfWeek(new Date(now - 7 * 86400000), { weekStartsOn: 6 }), 'yyyy-MM-dd'); return { from: s, to: e }; }
    case 'month':  { const pm = subMonths(now, 1); return { from: format(startOfMonth(pm), 'yyyy-MM-dd'), to: format(endOfMonth(pm), 'yyyy-MM-dd') }; }
    case 'year':   { const py = new Date(now.getFullYear() - 1, 0, 1); return { from: format(startOfYear(py), 'yyyy-MM-dd'), to: format(endOfYear(py), 'yyyy-MM-dd') }; }
    default:       return getRange('month');
  }
}

export default function BranchAnalytics() {
  const { currency } = useLanguage();
  const { activeRestaurant, branches } = useTenant();
  const [rangeType, setRangeType] = useState('month');

  const fmt = (n) => `${currency}${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const enabled = !!activeRestaurant?.id;
  const orgFilter = activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : null;

  const { from, to } = getRange(rangeType);
  const { from: prevFrom, to: prevTo } = getPrevRange(rangeType);

  // ── Data Queries ─────────────────────────────────────────────────────────────
  const { data: allSales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['ba_sales', orgFilter, rangeType],
    queryFn: () => base44.entities.DailySales.filter(orgFilter || {}, '-date', 5000),
    staleTime: 60000, enabled,
  });

  const { data: allPurchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ['ba_purchases', activeRestaurant?.id, rangeType],
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

  const { data: allExpenses = [] } = useQuery({
    queryKey: ['ba_expenses', orgFilter, rangeType],
    queryFn: () => base44.entities.Expense.filter(orgFilter || {}, '-date', 5000),
    staleTime: 60000, enabled,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['ba_employees', orgFilter],
    queryFn: () => base44.entities.Employee.filter(orgFilter || {}, 'name', 500),
    staleTime: 300000, enabled,
  });

  const { data: expenseCategories = [] } = useQuery({
    queryKey: ['ba_exp_cats', activeRestaurant?.id],
    queryFn: () => base44.entities.ExpenseCategory
      ? base44.entities.ExpenseCategory.filter(
          activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : {}, 'sort_order', 500)
      : Promise.resolve([]),
    staleTime: 300000, enabled,
  });

  // ── Branch Metrics ────────────────────────────────────────────────────────────
  const branchMetrics = useMemo(() => {
    const branchList = (branches || []);
    if (!branchList.length) return [];

    return branchList.map(br => {
      const key = br.key || br.id;
      const name = br.name || key;

      const bSales     = allSales.filter(s => s.branch === key && s.date >= from && s.date <= to);
      const bPrevSales = allSales.filter(s => s.branch === key && s.date >= prevFrom && s.date <= prevTo);
      const bPurch     = allPurchases.filter(p => p.branch === key && p.date >= from && p.date <= to);
      const bExp       = allExpenses.filter(e => (e.branch === key || e.branch_key === key) && e.date >= from && e.date <= to);
      const bEmployees = employees.filter(e => e.branch === key || e.branch_key === key);
      const taggedExp  = tagExpensesWithCategories(bExp, expenseCategories);

      const sales     = bSales.reduce((s, r) => s + (calculateSalesRevenue(r, [])?.total || 0), 0);
      const prevSales = bPrevSales.reduce((s, r) => s + (calculateSalesRevenue(r, [])?.total || 0), 0);
      const purchases = bPurch.reduce((s, inv) => s + (Number(inv.total_amount) || 0), 0);
      const expenses  = taggedExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const grossProfit = sales - purchases;
      const netProfit   = grossProfit - expenses;
      const growth = prevSales > 0 ? ((sales - prevSales) / prevSales) * 100 : 0;
      const empCount = bEmployees.length;

      return { key, name, sales, purchases, expenses, grossProfit, netProfit, growth, empCount };
    }).sort((a, b) => b.sales - a.sales);
  }, [branches, allSales, allPurchases, allExpenses, employees, expenseCategories, from, to, prevFrom, prevTo]);

  const topBranch   = branchMetrics[0];
  const worstBranch = branchMetrics[branchMetrics.length - 1];

  const isLoading = loadingSales || loadingPurchases;

  const chartData = branchMetrics.map(b => ({
    name: b.name.length > 10 ? b.name.slice(0, 10) + '…' : b.name,
    Sales: Math.round(b.sales),
    Purchases: Math.round(b.purchases),
    Expenses: Math.round(b.expenses),
    NetProfit: Math.round(b.netProfit),
  }));

  return (
    <div className="space-y-5 pb-20">
      <PageHeader title="Enterprise Branch Dashboard" />

      {/* ── Range Selector ── */}
      <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-1">
        {RANGES.map(r => (
          <Button
            key={r.key}
            size="sm"
            variant={rangeType === r.key ? 'default' : 'outline'}
            onClick={() => setRangeType(r.key)}
            className="text-xs whitespace-nowrap shrink-0"
          >
            {r.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><div className="h-24 bg-muted rounded animate-pulse" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <>
          {/* ── Top / Worst Branch ── */}
          {branchMetrics.length > 1 && (
            <div className="grid grid-cols-2 gap-3">
              {topBranch && (
                <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Trophy className="w-4 h-4 text-emerald-600" />
                      <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Top Branch</span>
                    </div>
                    <p className="text-sm font-black text-foreground">{topBranch.name}</p>
                    <p className="text-xs text-emerald-600 font-semibold">{fmt(topBranch.sales)}</p>
                    <p className="text-[10px] text-muted-foreground">Net: {fmt(topBranch.netProfit)}</p>
                  </CardContent>
                </Card>
              )}
              {worstBranch && worstBranch.key !== topBranch?.key && (
                <Card className="border-red-200 bg-red-50 dark:bg-red-950/30">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Needs Attention</span>
                    </div>
                    <p className="text-sm font-black text-foreground">{worstBranch.name}</p>
                    <p className="text-xs text-red-600 font-semibold">{fmt(worstBranch.sales)}</p>
                    <p className="text-[10px] text-muted-foreground">Net: {fmt(worstBranch.netProfit)}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* ── Branch Comparison Chart ── */}
          {chartData.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-bold text-foreground mb-3">Branch Comparison</p>
                <Suspense fallback={<div className="h-48 flex items-center justify-center text-muted-foreground text-xs">Loading…</div>}>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(v) => fmt(v)} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="Sales" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Purchases" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Expenses" fill="#ef4444" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="NetProfit" fill="#22c55e" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Suspense>
              </CardContent>
            </Card>
          )}

          {/* ── Branch Ranking Table ── */}
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-bold text-foreground mb-3">Branch Ranking</p>
              <div className="space-y-2">
                {branchMetrics.map((b, idx) => (
                  <div key={b.key} className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/20">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                      idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                      idx === 1 ? 'bg-slate-100 text-slate-600' :
                      idx === 2 ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'
                    }`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{b.name}</p>
                      <div className="flex gap-3 mt-0.5">
                        <span className="text-[10px] text-blue-600 font-semibold">S: {fmt(b.sales)}</span>
                        <span className="text-[10px] text-amber-600 font-semibold">P: {fmt(b.purchases)}</span>
                        <span className="text-[10px] text-red-600 font-semibold">E: {fmt(b.expenses)}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-black ${b.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(b.netProfit)}</p>
                      <div className="flex items-center justify-end gap-0.5">
                        {b.growth >= 0 ? <ArrowUpRight className="w-3 h-3 text-emerald-500" /> : <ArrowDownRight className="w-3 h-3 text-red-500" />}
                        <span className={`text-[10px] font-semibold ${b.growth >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{b.growth.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                ))}

                {branchMetrics.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>No branch data available for this period.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── KPI Summary per Branch ── */}
          {branchMetrics.map(b => (
            <Card key={b.key}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="w-4 h-4 text-primary" />
                  <p className="text-sm font-bold text-foreground">{b.name}</p>
                  {b.growth >= 0
                    ? <span className="ml-auto text-[10px] font-bold text-emerald-600 flex items-center gap-0.5"><ArrowUpRight className="w-3 h-3" />{b.growth.toFixed(1)}%</span>
                    : <span className="ml-auto text-[10px] font-bold text-red-500 flex items-center gap-0.5"><ArrowDownRight className="w-3 h-3" />{Math.abs(b.growth).toFixed(1)}%</span>
                  }
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Sales', value: fmt(b.sales), color: 'text-blue-600' },
                    { label: 'Purchases', value: fmt(b.purchases), color: 'text-amber-600' },
                    { label: 'Expenses', value: fmt(b.expenses), color: 'text-red-600' },
                    { label: 'Gross Profit', value: fmt(b.grossProfit), color: b.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600' },
                    { label: 'Net Profit', value: fmt(b.netProfit), color: b.netProfit >= 0 ? 'text-purple-600' : 'text-red-600' },
                    { label: 'Employees', value: b.empCount, color: 'text-cyan-600' },
                  ].map(kpi => (
                    <div key={kpi.label} className="text-center p-2 rounded-lg bg-muted/30">
                      <p className={`text-sm font-black ${kpi.color}`}>{kpi.value}</p>
                      <p className="text-[9px] text-muted-foreground font-medium mt-0.5">{kpi.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
