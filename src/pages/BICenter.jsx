import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart3, Download, PieChart
} from 'lucide-react';
import {
  Area, BarChart, Bar, Line, PieChart as RechartsPie,
  Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart
} from 'recharts';
import { format, subDays, subMonths, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

const asNumber = (value) => Number(value) || 0;
const getSaleTotal = (sale) => {
  if (sale?.total !== null && sale?.total !== undefined && sale?.total !== '') {
    return asNumber(sale.total);
  }
  return asNumber(sale?.cash) + asNumber(sale?.network) + asNumber(sale?.credit);
};
const getPurchaseTotal = (purchase) => {
  if (purchase?.total_amount !== null && purchase?.total_amount !== undefined && purchase?.total_amount !== '') {
    return asNumber(purchase.total_amount);
  }
  return asNumber(purchase?.used_price ?? purchase?.current_price) * asNumber(purchase?.qty || 1);
};

export default function BICenter() {
  const { t, currency } = useLanguage();
  const { ownerFilter, activeRestaurant, isManager, managerBranch } = useTenant();
  const [tab, setTab] = useState('revenue');
  const [period, setPeriod] = useState('30');

  const analyticsScope = useMemo(() => {
    const branch = managerBranch || ownerFilter?.branch || null;
    if (isManager) return branch ? { branch } : null;
    if (activeRestaurant?.id) return { restaurantId: activeRestaurant.id };
    return ownerFilter?.created_by ? { createdBy: ownerFilter.created_by } : null;
  }, [activeRestaurant?.id, isManager, managerBranch, ownerFilter?.branch, ownerFilter?.created_by]);
  const salesFilter = analyticsScope?.branch
    ? { branch: analyticsScope.branch }
    : analyticsScope?.restaurantId
      ? { restaurant_id: analyticsScope.restaurantId }
      : analyticsScope?.createdBy
        ? { created_by: analyticsScope.createdBy }
        : null;
  const expenseFilter = analyticsScope?.branch ? { branch_key: analyticsScope.branch } : salesFilter;

  const { data: allSales = [] } = useQuery({
    queryKey: ['bi_sales', salesFilter],
    queryFn: () => base44.entities.DailySales.filter(salesFilter || {}, '-date', 1000),
    staleTime: 120000,
    enabled: !!analyticsScope,
  });
  const { data: allPurchases = [] } = useQuery({
    queryKey: ['bi_purchases', analyticsScope],
    queryFn: async () => {
      if (!analyticsScope) return [];
      let query = supabase
        .from('supplier_invoices')
        .select('id, date, branch, total_amount, status')
        .in('status', ['approved', 'partial', 'paid'])
        .order('date', { ascending: false })
        .limit(500);
      if (analyticsScope.branch) query = query.eq('branch', analyticsScope.branch);
      else if (analyticsScope.restaurantId) query = query.eq('restaurant_id', analyticsScope.restaurantId);
      else if (analyticsScope.createdBy) query = query.eq('created_by', analyticsScope.createdBy);
      const { data, error } = await query;
      return error ? [] : (data || []);
    },
    staleTime: 120000,
    enabled: !!analyticsScope,
  });
  const { data: allExpenses = [] } = useQuery({
    queryKey: ['bi_expenses', expenseFilter],
    queryFn: () => base44.entities.Expense.filter(expenseFilter || {}, '-date', 500),
    staleTime: 120000,
    enabled: !!analyticsScope,
  });

  const days = parseInt(period);
  const startDate = format(subDays(new Date(), days - 1), 'yyyy-MM-dd');

  // Daily revenue chart
  const dailyData = useMemo(() => {
    const interval = eachDayOfInterval({ start: subDays(new Date(), days - 1), end: new Date() });
    return interval.map(date => {
      const d = format(date, 'yyyy-MM-dd');
      const label = format(date, days <= 30 ? 'MM/dd' : 'MMM dd');
      const daySales = allSales.filter(s => s.date === d);
      const dayPurchases = allPurchases.filter(p => p.date === d);
      const dayExpenses = allExpenses.filter(e => e.date === d);
      const revenue = daySales.reduce((sum, sale) => sum + getSaleTotal(sale), 0);
      const cost = dayPurchases.reduce((sum, purchase) => sum + getPurchaseTotal(purchase), 0);
      const expenses = dayExpenses.reduce((s, r) => s + (r.amount || 0), 0);
      return { date: label, revenue, cost, expenses, profit: revenue - cost - expenses };
    });
  }, [allSales, allPurchases, allExpenses, days]);

  // Monthly comparison
  const monthlyData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const m = subMonths(new Date(), 5 - i);
      const mStart = format(startOfMonth(m), 'yyyy-MM-dd');
      const mEnd = format(endOfMonth(m), 'yyyy-MM-dd');
      const label = format(m, 'MMM yy');
      const mSales = allSales.filter(s => s.date >= mStart && s.date <= mEnd);
      const mPurchases = allPurchases.filter(p => p.date >= mStart && p.date <= mEnd);
      const mExpenses = allExpenses.filter(e => e.date >= mStart && e.date <= mEnd);
      const revenue = mSales.reduce((sum, sale) => sum + getSaleTotal(sale), 0);
      const cost = mPurchases.reduce((sum, purchase) => sum + getPurchaseTotal(purchase), 0);
      const expenses = mExpenses.reduce((s, r) => s + (r.amount || 0), 0);
      return { month: label, revenue, cost, expenses, profit: revenue - cost - expenses };
    });
  }, [allSales, allPurchases, allExpenses]);

  // Payment method breakdown
  const paymentData = useMemo(() => {
    const periodSales = allSales.filter(s => s.date >= startDate);
    const cash = periodSales.reduce((s, r) => s + (r.cash || 0), 0);
    const credit = periodSales.reduce((s, r) => s + (r.credit || 0), 0);
    const card = periodSales.reduce((sum, sale) => sum + asNumber(sale.network ?? sale.card), 0);
    const online = periodSales.reduce((s, r) => s + (r.online || 0), 0);
    return [
      { name: 'Cash', value: cash },
      { name: 'Credit', value: credit },
      { name: 'Network/POS', value: card },
      { name: 'Online', value: online },
    ].filter(p => p.value > 0);
  }, [allSales, startDate]);

  // Branch performance
  const branchData = useMemo(() => {
    const periodSales = allSales.filter(s => s.date >= startDate);
    const map = {};
    periodSales.forEach(s => {
      if (!map[s.branch]) map[s.branch] = 0;
      map[s.branch] += getSaleTotal(s);
    });
    return Object.entries(map).map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue);
  }, [allSales, startDate]);

  // Summary KPIs
  const summary = useMemo(() => {
    const periodSales = allSales.filter(s => s.date >= startDate);
    const periodPurchases = allPurchases.filter(p => p.date >= startDate);
    const periodExpenses = allExpenses.filter(e => e.date >= startDate);
    const revenue = periodSales.reduce((sum, sale) => sum + getSaleTotal(sale), 0);
    const cost = periodPurchases.reduce((sum, purchase) => sum + getPurchaseTotal(purchase), 0);
    const expenses = periodExpenses.reduce((s, r) => s + (r.amount || 0), 0);
    const profit = revenue - cost - expenses;
    const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;
    const avgDaily = revenue / days;
    return { revenue, cost, expenses, profit, margin, avgDaily };
  }, [allSales, allPurchases, allExpenses, startDate, days]);

  const fmt = (n) => `${currency}${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const exportTrendCsv = useCallback(() => {
    const rows = [
      ['Date', 'Revenue', 'Procurement Cost', 'Expenses', 'Profit'],
      ...dailyData.map(({ date, revenue, cost, expenses, profit }) => [date, revenue, cost, expenses, profit]),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `business-intelligence-${period}-days.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [dailyData, period]);

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div>
          <h1 className="text-xl font-bold">{t('bi_center')}</h1>
          <p className="text-xs text-muted-foreground">Business Intelligence</p>
        </div>
        <div className="flex shrink-0 gap-2 items-center">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={exportTrendCsv} aria-label="Export business intelligence trend as CSV" title="Export CSV">
            <Download className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Total Revenue',   value: fmt(summary.revenue),  color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-100' },
          { label: 'Net Profit',      value: fmt(summary.profit),   color: summary.profit >= 0 ? 'text-emerald-600' : 'text-red-500', bg: summary.profit >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100' },
          { label: 'Profit Margin',   value: `${summary.margin}%`,  color: parseFloat(summary.margin) >= 30 ? 'text-emerald-600' : 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
          { label: 'Avg Daily Rev',   value: fmt(summary.avgDaily), color: 'text-purple-600',   bg: 'bg-purple-50 border-purple-100' },
        ].map(kpi => (
          <Card key={kpi.label} className={`border ${kpi.bg.split(' ')[1]}`}>
            <CardContent className={`p-3 ${kpi.bg.split(' ')[0]}`}>
              <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-4 h-9">
          <TabsTrigger value="revenue" className="text-xs">Revenue</TabsTrigger>
          <TabsTrigger value="monthly" className="text-xs">Monthly</TabsTrigger>
          <TabsTrigger value="payments" className="text-xs">Payments</TabsTrigger>
          <TabsTrigger value="branches" className="text-xs">Branches</TabsTrigger>
        </TabsList>

        {/* Revenue Trend */}
        <TabsContent value="revenue" className="mt-3 space-y-3">
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-semibold">Revenue & Profit Trend</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={dailyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={Math.floor(dailyData.length / 5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v) => [`${currency}${v.toLocaleString()}`, '']} />
                  <Area type="monotone" dataKey="revenue" fill="url(#revGrad2)" stroke="#3b82f6" strokeWidth={2} name="Revenue" />
                  <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} dot={false} name="Profit" />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Cost breakdown */}
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-semibold">Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {[
                { label: 'Revenue',   value: summary.revenue,  pct: 100,                                                    color: 'bg-blue-500' },
                { label: 'COGS',      value: summary.cost,     pct: summary.revenue > 0 ? (summary.cost / summary.revenue) * 100 : 0,     color: 'bg-amber-500' },
                { label: 'Expenses',  value: summary.expenses, pct: summary.revenue > 0 ? (summary.expenses / summary.revenue) * 100 : 0, color: 'bg-red-400' },
                { label: 'Profit',    value: summary.profit,   pct: parseFloat(summary.margin),                             color: 'bg-emerald-500' },
              ].map(row => (
                <div key={row.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-semibold">{fmt(row.value)} ({row.pct.toFixed(1)}%)</span>
                  </div>
                  <div className="bg-muted rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${row.color}`} style={{ width: `${Math.max(0, Math.min(100, row.pct))}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monthly Comparison */}
        <TabsContent value="monthly" className="mt-3 space-y-3">
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-semibold">6-Month Comparison</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v) => [`${currency}${v.toLocaleString()}`, '']} />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Revenue" />
                  <Bar dataKey="profit"  fill="#10b981" radius={[4, 4, 0, 0]} name="Profit" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-semibold">Monthly Summary Table</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1.5 text-muted-foreground font-medium">Month</th>
                    <th className="text-right py-1.5 text-muted-foreground font-medium">Revenue</th>
                    <th className="text-right py-1.5 text-muted-foreground font-medium">Profit</th>
                    <th className="text-right py-1.5 text-muted-foreground font-medium">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map(m => {
                    const margin = m.revenue > 0 ? ((m.profit / m.revenue) * 100).toFixed(1) : 0;
                    return (
                      <tr key={m.month} className="border-b border-border last:border-0">
                        <td className="py-2 font-medium">{m.month}</td>
                        <td className="py-2 text-right text-blue-600 font-semibold">{fmt(m.revenue)}</td>
                        <td className={`py-2 text-right font-semibold ${m.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(m.profit)}</td>
                        <td className={`py-2 text-right font-semibold ${parseFloat(margin) >= 30 ? 'text-emerald-600' : 'text-amber-600'}`}>{margin}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Methods */}
        <TabsContent value="payments" className="mt-3 space-y-3">
          {paymentData.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <PieChart className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('no_data')}</p>
            </div>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold">Payment Method Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <ResponsiveContainer width="100%" height={180}>
                    <RechartsPie>
                      <Pie data={paymentData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                        {paymentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => [`${currency}${v.toLocaleString()}`, '']} />
                    </RechartsPie>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="px-4 py-3 space-y-2">
                  {paymentData.map((p, i) => {
                    const total = paymentData.reduce((s, d) => s + d.value, 0);
                    const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : 0;
                    return (
                      <div key={p.name} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-sm">{p.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold">{fmt(p.value)}</span>
                          <span className="text-xs text-muted-foreground ml-1">({pct}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Branch Performance */}
        <TabsContent value="branches" className="mt-3 space-y-3">
          {branchData.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('no_data')}</p>
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-semibold">Branch Revenue</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-3">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={branchData} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v) => [`${currency}${v.toLocaleString()}`, '']} />
                    <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
