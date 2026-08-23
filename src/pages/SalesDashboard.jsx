import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useSalesSources } from '@/hooks/useSalesSources';
import { normalizeSalesDashboardBranches, saleMatchesBranch, salesDashboardBranchLabel } from '@/lib/salesDashboardBranches';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { TrendingUp, TrendingDown, Calendar, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/helpers';
import {
  format, subDays, parseISO, getWeek
} from 'date-fns';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'];

function KPICard({ label, value, prev, currency }) {
  const change = prev > 0 ? ((value - prev) / prev) * 100 : null;
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold mt-0.5">{formatCurrency(value, currency)}</p>
      {change !== null && (
        <div className={`flex items-center gap-1 mt-0.5 text-xs font-medium ${change >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {Math.abs(change).toFixed(1)}% vs prev
        </div>
      )}
    </Card>
  );
}

function CustomTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-2.5 shadow-lg text-xs space-y-1">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{formatCurrency(p.value, currency)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Compute total revenue from a daily_sales record, respecting Sales Source configuration.
 * Falls back to legacy cash+network+credit for backward compatibility.
 */
function computeRecordRevenue(record, revenueSources) {
  // Legacy columns always included (backward compat)
  let total = 0;

  // Check if cash source is configured to be included in revenue
  const cashSrc = revenueSources.find(s => s.system_key === 'cash');
  if (!cashSrc || cashSrc.included_in_revenue) {
    total += Number(record.restaurant_cash) || Number(record.cash) || 0;
  }

  // Network/POS
  const networkSrc = revenueSources.find(s => s.system_key === 'network');
  if (!networkSrc || networkSrc.included_in_revenue) {
    total += Number(record.restaurant_network) || Number(record.network) || 0;
  }

  // Credit
  const creditSrc = revenueSources.find(s => s.system_key === 'credit');
  if (!creditSrc || creditSrc.included_in_revenue) {
    total += Number(record.credit) || 0;
  }

  // Custom sources from sales_sources_json
  if (record.sales_sources_json) {
    try {
      const customEntries = JSON.parse(record.sales_sources_json);
      customEntries.forEach(entry => {
        const src = revenueSources.find(s => s.id === entry.source_id || s.system_key === entry.source_key);
        if (!src || src.included_in_revenue) {
          total += Number(entry.amount) || 0;
        }
      });
    } catch { /* ignore */ }
  }

  // Also add custom_sources_total if no JSON breakdown available
  if (!record.sales_sources_json && record.custom_sources_total) {
    total += Number(record.custom_sources_total) || 0;
  }

  return total;
}

export default function SalesDashboard() {
  const { t, currency } = useLanguage();
  const { branches: tenantBranches, activeRestaurant } = useTenant();
  const branches = useMemo(() => normalizeSalesDashboardBranches(tenantBranches), [tenantBranches]);
  const [period, setPeriod] = useState('30d');
  const [branchFilter, setBranchFilter] = useState('all');

  const { sources: salesSources, revenueSources, kpiSources, isLoading: sourcesLoading } = useSalesSources();

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['sales-dashboard', activeRestaurant?.id],
    queryFn: () => base44.entities.DailySales.filter(
      activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : {},
      '-date',
      2000,
    ),
    enabled: Boolean(activeRestaurant?.id),
    staleTime: 120000,
  });

  // Date range
  const { from, fromPrev } = useMemo(() => {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    return {
      from: format(subDays(new Date(), days), 'yyyy-MM-dd'),
      fromPrev: format(subDays(new Date(), days * 2), 'yyyy-MM-dd'),
    };
  }, [period]);

  const selectedBranch = useMemo(
    () => branches.find((branch) => (branch.key || branch.id) === branchFilter) || null,
    [branches, branchFilter],
  );
  const matchesSelectedBranch = (sale) => branchFilter === 'all' || saleMatchesBranch(sale, selectedBranch);

  const filtered = useMemo(() =>
    sales.filter((sale) => sale.date >= from && matchesSelectedBranch(sale)),
    [sales, from, branchFilter, selectedBranch]
  );

  const prevPeriod = useMemo(() =>
    sales.filter((sale) => sale.date >= fromPrev && sale.date < from && matchesSelectedBranch(sale)),
    [sales, from, fromPrev, branchFilter, selectedBranch]
  );

  // Revenue-aware totals (respects included_in_revenue flag)
  const totalCurrent = useMemo(() =>
    filtered.reduce((s, r) => s + computeRecordRevenue(r, revenueSources), 0),
    [filtered, revenueSources]
  );
  const totalPrev = useMemo(() =>
    prevPeriod.reduce((s, r) => s + computeRecordRevenue(r, revenueSources), 0),
    [prevPeriod, revenueSources]
  );

  // Legacy breakdown totals (for KPI cards)
  const cashTotal    = filtered.reduce((s, r) => s + (Number(r.restaurant_cash) || Number(r.cash) || 0), 0);
  const networkTotal = filtered.reduce((s, r) => s + (Number(r.restaurant_network) || Number(r.network) || 0), 0);
  const creditTotal  = filtered.reduce((s, r) => s + (Number(r.credit) || 0), 0);

  // Custom source totals from sales_sources_json
  const customSourceTotals = useMemo(() => {
    const map = {};
    filtered.forEach(record => {
      if (record.sales_sources_json) {
        try {
          const entries = JSON.parse(record.sales_sources_json);
          entries.forEach(e => {
            const key = e.source_id || e.source_key;
            map[key] = (map[key] || 0) + (Number(e.amount) || 0);
          });
        } catch { /* ignore */ }
      }
    });
    return map;
  }, [filtered]);

  // Daily trend — includes custom sources
  const dailyData = useMemo(() => {
    const map = {};
    filtered.forEach(s => {
      const d = s.date;
      if (!map[d]) map[d] = { date: d, Total: 0, Cash: 0, Network: 0, Credit: 0 };
      const rev = computeRecordRevenue(s, revenueSources);
      map[d].Total += rev;
      map[d].Cash += Number(s.restaurant_cash) || Number(s.cash) || 0;
      map[d].Network += Number(s.restaurant_network) || Number(s.network) || 0;
      map[d].Credit += Number(s.credit) || 0;

      // Add custom source columns
      if (s.sales_sources_json) {
        try {
          const entries = JSON.parse(s.sales_sources_json);
          entries.forEach(e => {
            const src = salesSources.find(ss => ss.id === e.source_id || ss.system_key === e.source_key);
            if (src && src.included_in_dashboard_kpi) {
              const colName = src.name_en;
              map[d][colName] = (map[d][colName] || 0) + (Number(e.amount) || 0);
            }
          });
        } catch { /* ignore */ }
      }
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
      ...d,
      label: format(parseISO(d.date), period === '7d' ? 'EEE' : 'MMM d'),
    }));
  }, [filtered, period, revenueSources, salesSources]);

  // Weekly aggregated
  const weeklyData = useMemo(() => {
    const map = {};
    filtered.forEach(s => {
      const wk = `W${getWeek(parseISO(s.date))}-${parseISO(s.date).getFullYear()}`;
      if (!map[wk]) map[wk] = { week: wk, Total: 0 };
      map[wk].Total += computeRecordRevenue(s, revenueSources);
    });
    return Object.values(map).sort((a, b) => a.week.localeCompare(b.week));
  }, [filtered, revenueSources]);

  // Monthly aggregated
  const monthlyData = useMemo(() => {
    const map = {};
    filtered.forEach(s => {
      const mo = format(parseISO(s.date), 'MMM yyyy');
      if (!map[mo]) map[mo] = { month: mo, Total: 0 };
      map[mo].Total += computeRecordRevenue(s, revenueSources);
    });
    return Object.values(map);
  }, [filtered, revenueSources]);

  // Branch comparison
  const branchData = useMemo(() => {
    const map = {};
    filtered.forEach(s => {
      const bl = salesDashboardBranchLabel(s, branches);
      if (!map[bl]) map[bl] = { branch: bl, Total: 0, Cash: 0, Network: 0 };
      map[bl].Total += computeRecordRevenue(s, revenueSources);
      map[bl].Cash += Number(s.restaurant_cash) || Number(s.cash) || 0;
      map[bl].Network += Number(s.restaurant_network) || Number(s.network) || 0;
    });
    return Object.values(map).sort((a, b) => b.Total - a.Total);
  }, [filtered, branches, revenueSources]);

  // Payment mix for pie — dynamic based on kpiSources
  const paymentMix = useMemo(() => {
    const mix = [];
    // Legacy sources
    if (cashTotal > 0) mix.push({ name: 'Cash', value: cashTotal });
    if (networkTotal > 0) mix.push({ name: 'Network / POS', value: networkTotal });
    if (creditTotal > 0) mix.push({ name: 'Customer Credit', value: creditTotal });
    // Custom sources
    Object.entries(customSourceTotals).forEach(([key, val]) => {
      if (val > 0) {
        const src = salesSources.find(s => s.id === key || s.system_key === key);
        if (src && src.included_in_dashboard_kpi) {
          mix.push({ name: src.name_en, value: val });
        }
      }
    });
    return mix.filter(x => x.value > 0);
  }, [cashTotal, networkTotal, creditTotal, customSourceTotals, salesSources]);

  // Top performing day
  const topDay = dailyData.reduce((best, d) => (!best || d.Total > best.Total) ? d : best, null);

  // Dynamic bar chart keys for custom sources
  const customBarKeys = useMemo(() => {
    const keys = new Set();
    dailyData.forEach(d => {
      Object.keys(d).forEach(k => {
        if (!['date', 'label', 'Total', 'Cash', 'Network', 'Credit'].includes(k)) {
          keys.add(k);
        }
      });
    });
    return Array.from(keys);
  }, [dailyData]);

  if (isLoading || sourcesLoading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" /> Loading sales data...
    </div>
  );

  return (
    <div>
      <PageHeader title="Sales Dashboard" />
      {/* Controls */}
      <div className="flex gap-2 mb-4">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="flex-1 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="90d">Last 90 Days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="flex-1 h-9">
            <SelectValue placeholder="All Branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map((branch) => <SelectItem key={branch.id || branch.key} value={branch.key || branch.id}>{branch.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards — dynamic based on Sales Sources */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <KPICard label="Total Revenue" value={totalCurrent} prev={totalPrev} currency={currency} />
        {/* Legacy system sources */}
        {revenueSources.find(s => s.system_key === 'cash')?.included_in_dashboard_kpi !== false && (
          <KPICard label="Cash Sales" value={cashTotal} currency={currency} />
        )}
        {revenueSources.find(s => s.system_key === 'network')?.included_in_dashboard_kpi !== false && (
          <KPICard label="Network / POS" value={networkTotal} currency={currency} />
        )}
        {creditTotal > 0 && revenueSources.find(s => s.system_key === 'credit')?.included_in_dashboard_kpi !== false && (
          <KPICard label="Customer Credit" value={creditTotal} currency={currency} />
        )}
        {/* Dynamic custom source KPI cards */}
        {salesSources
          .filter(s => !s.is_system && s.included_in_dashboard_kpi)
          .map(src => {
            const amt = customSourceTotals[src.id] || customSourceTotals[src.system_key] || 0;
            if (amt === 0) return null;
            return (
              <KPICard key={src.id} label={src.name_en} value={amt} currency={currency} />
            );
          })}
      </div>

      {topDay && (
        <Card className="p-3 mb-4 bg-primary/5 border-primary/20 flex items-center gap-3">
          <Calendar className="w-5 h-5 text-primary shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Peak Day</p>
            <p className="text-sm font-semibold">{topDay.date} — {formatCurrency(topDay.Total, currency)}</p>
          </div>
        </Card>
      )}

      <Tabs defaultValue="daily">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="daily" className="flex-1">Daily</TabsTrigger>
          <TabsTrigger value="weekly" className="flex-1">Weekly</TabsTrigger>
          <TabsTrigger value="branch" className="flex-1">Branches</TabsTrigger>
          <TabsTrigger value="mix" className="flex-1">Mix</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <Card className="p-3">
            <p className="text-xs font-semibold mb-3 text-muted-foreground">Daily Revenue Trend</p>
            {dailyData.length === 0 ? <p className="text-center text-muted-foreground text-sm py-6">No data</p> : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${currency}${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip currency={currency} />} />
                  <Area type="monotone" dataKey="Total" stroke="#3b82f6" fill="url(#totalGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
          <Card className="p-3 mt-3">
            <p className="text-xs font-semibold mb-3 text-muted-foreground">Payment Breakdown</p>
            {dailyData.length === 0 ? <p className="text-center text-muted-foreground text-sm py-6">No data</p> : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip currency={currency} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Cash" stackId="a" fill="#10b981" />
                  <Bar dataKey="Network" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="Credit" stackId="a" fill="#8b5cf6" />
                  {/* Dynamic custom source bars */}
                  {customBarKeys.map((key, i) => (
                    <Bar key={key} dataKey={key} stackId="a" fill={COLORS[(i + 4) % COLORS.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="weekly">
          <Card className="p-3">
            <p className="text-xs font-semibold mb-3 text-muted-foreground">Weekly Revenue</p>
            {weeklyData.length === 0 ? <p className="text-center text-muted-foreground text-sm py-6">No data</p> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip currency={currency} />} />
                  <Bar dataKey="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
          <Card className="p-3 mt-3">
            <p className="text-xs font-semibold mb-3 text-muted-foreground">Monthly Trend</p>
            {monthlyData.length === 0 ? <p className="text-center text-muted-foreground text-sm py-6">No data</p> : (
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip currency={currency} />} />
                  <Line type="monotone" dataKey="Total" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="branch">
          <Card className="p-3">
            <p className="text-xs font-semibold mb-3 text-muted-foreground">Branch Performance Comparison</p>
            {branchData.length === 0 ? <p className="text-center text-muted-foreground text-sm py-6">No data</p> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={branchData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis dataKey="branch" type="category" tick={{ fontSize: 11 }} width={70} />
                  <Tooltip content={<CustomTooltip currency={currency} />} />
                  <Bar dataKey="Total" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
          <div className="space-y-2 mt-3">
            {branchData.map((b, i) => (
              <Card key={b.branch} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: COLORS[i % COLORS.length] }}>{i + 1}</span>
                  <p className="text-sm font-medium">{b.branch}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{formatCurrency(b.Total, currency)}</p>
                  <p className="text-xs text-muted-foreground">{totalCurrent > 0 ? ((b.Total / totalCurrent) * 100).toFixed(1) : 0}% share</p>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="mix">
          <Card className="p-3">
            <p className="text-xs font-semibold mb-3 text-muted-foreground">Payment Method Mix</p>
            {paymentMix.length === 0 ? <p className="text-center text-muted-foreground text-sm py-6">No data</p> : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={paymentMix}
                      cx="50%" cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {paymentMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(v, currency)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {paymentMix.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground">{p.name}:</span>
                      <span className="font-semibold">{formatCurrency(p.value, currency)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
