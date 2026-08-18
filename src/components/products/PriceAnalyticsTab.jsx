/**
 * PriceAnalyticsTab.jsx
 * Product Price Analytics — BizCTRL
 * Shows full price history, analytics summary, and trend charts.
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  TrendingUp, TrendingDown, Minus, BarChart3, DollarSign,
  ArrowUpDown, Calendar, RefreshCw, Package
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { format, subDays, subWeeks, subMonths, subYears, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';

// ── Helpers ──────────────────────────────────────────────────────────────────
function trendIcon(diff) {
  if (diff > 0) return <span className="text-red-500 font-bold">▲</span>;
  if (diff < 0) return <span className="text-green-500 font-bold">▼</span>;
  return <span className="text-gray-400 font-bold">➜</span>;
}

function trendBadge(diff) {
  if (diff > 0) return <Badge className="bg-red-100 text-red-700 text-xs">▲ Increase</Badge>;
  if (diff < 0) return <Badge className="bg-green-100 text-green-700 text-xs">▼ Decrease</Badge>;
  return <Badge variant="secondary" className="text-xs">➜ No Change</Badge>;
}

function pctColor(pct) {
  if (pct > 0) return 'text-red-600';
  if (pct < 0) return 'text-green-600';
  return 'text-gray-500';
}

function getDateRange(filter, customFrom, customTo) {
  const now = new Date();
  switch (filter) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'week':
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'month':
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'year':
      return { from: startOfYear(now), to: endOfYear(now) };
    case 'custom':
      return {
        from: customFrom ? new Date(customFrom) : subDays(now, 30),
        to: customTo ? new Date(customTo) : now,
      };
    default:
      return { from: subDays(now, 30), to: now };
  }
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PriceAnalyticsTab({ currency }) {
  const { ownerFilter } = useTenant();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [dateFilter, setDateFilter] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [chartPeriod, setChartPeriod] = useState('daily');
  const [search, setSearch] = useState('');

  const createdBy = user?.email || ownerFilter?.created_by;

  // ── Fetch price history ───────────────────────────────────────────────────
  const { data: history = [], isLoading, refetch } = useQuery({
    queryKey: ['product_price_history', createdBy],
    queryFn: async () => {
      if (!createdBy) return [];
      const { data, error } = await supabase
        .from('product_price_history')
        .select('*')
        .eq('created_by', createdBy)
        .order('recorded_at', { ascending: false })
        .limit(5000);
      if (error) { console.warn('price history fetch error:', error.message); return []; }
      return data || [];
    },
    staleTime: 30000,
    enabled: !!createdBy,
  });

  // ── Apply date filter ─────────────────────────────────────────────────────
  const { from, to } = useMemo(() => getDateRange(dateFilter, customFrom, customTo), [dateFilter, customFrom, customTo]);

  const filtered = useMemo(() => {
    return history.filter(row => {
      const d = new Date(row.recorded_at);
      const matchDate = d >= from && d <= to;
      const matchSearch = !search ||
        row.product_name?.toLowerCase().includes(search.toLowerCase()) ||
        row.supplier_name?.toLowerCase().includes(search.toLowerCase()) ||
        row.branch?.toLowerCase().includes(search.toLowerCase());
      return matchDate && matchSearch;
    });
  }, [history, from, to, search]);

  // ── Analytics Summary ─────────────────────────────────────────────────────
  const analytics = useMemo(() => {
    if (!filtered.length) return null;

    const increases = filtered.filter(r => (r.difference || 0) > 0);
    const decreases = filtered.filter(r => (r.difference || 0) < 0);

    const biggestIncrease = increases.reduce((max, r) =>
      (r.pct_change || 0) > (max?.pct_change || 0) ? r : max, null);
    const biggestDecrease = decreases.reduce((min, r) =>
      (r.pct_change || 0) < (min?.pct_change || 0) ? r : min, null);

    const avgPctChange = filtered.length > 0
      ? filtered.reduce((s, r) => s + (r.pct_change || 0), 0) / filtered.length
      : 0;

    const uniqueProducts = new Set(filtered.map(r => r.product_id)).size;

    const totalCostSaving = decreases.reduce((s, r) => s + Math.abs(r.difference || 0), 0);
    const totalCostIncrease = increases.reduce((s, r) => s + (r.difference || 0), 0);

    return {
      biggestIncrease,
      biggestDecrease,
      avgPctChange,
      uniqueProducts,
      totalCostSaving,
      totalCostIncrease,
      increaseCount: increases.length,
      decreaseCount: decreases.length,
    };
  }, [filtered]);

  // ── Latest price per product (for the main table) ─────────────────────────
  const latestPerProduct = useMemo(() => {
    const map = {};
    // history is sorted desc by recorded_at; first occurrence = latest
    for (const row of history) {
      if (!map[row.product_id]) {
        map[row.product_id] = row;
      }
    }
    // Filter to only products that have changes in the selected period
    const productIdsInPeriod = new Set(filtered.map(r => r.product_id));
    return Object.values(map)
      .filter(r => productIdsInPeriod.has(r.product_id))
      .filter(r => !search ||
        r.product_name?.toLowerCase().includes(search.toLowerCase()) ||
        r.supplier_name?.toLowerCase().includes(search.toLowerCase()));
  }, [history, filtered, search]);

  // ── Chart Data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!filtered.length) return [];

    const groups = {};
    filtered.forEach(row => {
      const d = new Date(row.recorded_at);
      let key;
      if (chartPeriod === 'daily') key = format(d, 'MMM dd');
      else if (chartPeriod === 'weekly') key = `W${format(d, 'ww')} ${format(d, 'MMM')}`;
      else if (chartPeriod === 'monthly') key = format(d, 'MMM yyyy');
      else key = format(d, 'yyyy');

      if (!groups[key]) groups[key] = { period: key, increases: 0, decreases: 0, avgChange: 0, count: 0 };
      const diff = row.difference || 0;
      if (diff > 0) groups[key].increases++;
      else if (diff < 0) groups[key].decreases++;
      groups[key].avgChange += row.pct_change || 0;
      groups[key].count++;
    });

    return Object.values(groups).map(g => ({
      ...g,
      avgChange: g.count > 0 ? parseFloat((g.avgChange / g.count).toFixed(2)) : 0,
    })).slice(-20); // last 20 periods
  }, [filtered, chartPeriod]);

  const DATE_FILTERS = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'year', label: 'This Year' },
    { key: 'custom', label: 'Custom' },
  ];

  const CHART_PERIODS = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'yearly', label: 'Yearly' },
  ];

  return (
    <div className="space-y-4">

      {/* ── Header Controls ── */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="relative flex-1 min-w-[180px]">
          <Package className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-8 text-sm"
            placeholder="Search product, supplier, branch..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* ── Date Filters ── */}
      <div className="flex flex-wrap gap-2">
        {DATE_FILTERS.map(f => (
          <button key={f.key}
            onClick={() => setDateFilter(f.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${dateFilter === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {dateFilter === 'custom' && (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">From:</label>
            <Input type="date" className="text-xs h-8 w-36" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">To:</label>
            <Input type="date" className="text-xs h-8 w-36" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-center text-muted-foreground text-sm py-8">Loading price history...</p>
      ) : (
        <>
          {/* ── Analytics Summary Cards ── */}
          {analytics && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Card className="p-3">
                <p className="text-xs text-muted-foreground mb-1">Products Changed</p>
                <p className="text-2xl font-bold text-primary">{analytics.uniqueProducts}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground mb-1">Avg Price Change</p>
                <p className={`text-2xl font-bold ${pctColor(analytics.avgPctChange)}`}>
                  {analytics.avgPctChange > 0 ? '+' : ''}{analytics.avgPctChange.toFixed(1)}%
                </p>
              </Card>
              <Card className="p-3 col-span-2 sm:col-span-1">
                <p className="text-xs text-muted-foreground mb-1">Price Increases / Decreases</p>
                <div className="flex items-center gap-3">
                  <span className="text-red-600 font-bold text-lg">▲ {analytics.increaseCount}</span>
                  <span className="text-green-600 font-bold text-lg">▼ {analytics.decreaseCount}</span>
                </div>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground mb-1">Est. Cost Saving</p>
                <p className="text-lg font-bold text-green-600">{currency}{analytics.totalCostSaving.toFixed(2)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground mb-1">Est. Cost Increase</p>
                <p className="text-lg font-bold text-red-600">{currency}{analytics.totalCostIncrease.toFixed(2)}</p>
              </Card>
              <Card className="p-3 col-span-2 sm:col-span-1">
                <p className="text-xs text-muted-foreground mb-1">Total Records</p>
                <p className="text-2xl font-bold">{filtered.length}</p>
              </Card>
            </div>
          )}

          {/* ── Biggest Changes ── */}
          {analytics && (analytics.biggestIncrease || analytics.biggestDecrease) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {analytics.biggestIncrease && (
                <Card className="p-3 border-red-200">
                  <p className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" /> Biggest Price Increase
                  </p>
                  <p className="text-sm font-bold truncate">{analytics.biggestIncrease.product_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {currency}{(analytics.biggestIncrease.previous_price || 0).toFixed(2)} → {currency}{(analytics.biggestIncrease.new_price || 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-red-600 font-semibold">+{(analytics.biggestIncrease.pct_change || 0).toFixed(1)}%</p>
                </Card>
              )}
              {analytics.biggestDecrease && (
                <Card className="p-3 border-green-200">
                  <p className="text-xs font-semibold text-green-600 mb-2 flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5" /> Biggest Price Decrease
                  </p>
                  <p className="text-sm font-bold truncate">{analytics.biggestDecrease.product_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {currency}{(analytics.biggestDecrease.previous_price || 0).toFixed(2)} → {currency}{(analytics.biggestDecrease.new_price || 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-green-600 font-semibold">{(analytics.biggestDecrease.pct_change || 0).toFixed(1)}%</p>
                </Card>
              )}
            </div>
          )}

          {/* ── Charts ── */}
          {chartData.length > 0 && (
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-1">
                  <BarChart3 className="w-4 h-4 text-primary" /> Price Change Trends
                </h3>
                <div className="flex gap-1">
                  {CHART_PERIODS.map(p => (
                    <button key={p.key}
                      onClick={() => setChartPeriod(p.key)}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${chartPeriod === p.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Increases vs Decreases Bar Chart */}
              <p className="text-xs text-muted-foreground mb-2">Increases vs Decreases</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="period" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={40} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="increases" name="Increases" fill="#ef4444" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="decreases" name="Decreases" fill="#22c55e" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              {/* Average % Change Line Chart */}
              <p className="text-xs text-muted-foreground mt-4 mb-2">Average % Change</p>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="period" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={40} />
                  <YAxis tick={{ fontSize: 9 }} unit="%" />
                  <Tooltip formatter={(v) => [`${v}%`, 'Avg Change']} />
                  <Line type="monotone" dataKey="avgChange" name="Avg % Change" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* ── Price History Table ── */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1">
              <ArrowUpDown className="w-4 h-4 text-primary" /> Price History
              <span className="ml-auto text-xs font-normal text-muted-foreground">{filtered.length} records</span>
            </h3>

            {filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No price changes recorded for this period.</p>
                <p className="text-xs mt-1">Price changes are recorded automatically when purchase invoices are approved.</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-xs min-w-[600px]">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-3 font-medium">Product</th>
                      <th className="text-right py-2 pr-3 font-medium">Previous</th>
                      <th className="text-right py-2 pr-3 font-medium">Current</th>
                      <th className="text-right py-2 pr-3 font-medium">Diff</th>
                      <th className="text-right py-2 pr-3 font-medium">%</th>
                      <th className="text-center py-2 pr-3 font-medium">Trend</th>
                      <th className="text-left py-2 pr-3 font-medium">Supplier</th>
                      <th className="text-left py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(row => {
                      const diff = row.difference || 0;
                      const pct = row.pct_change || 0;
                      return (
                        <tr key={row.id} className="border-b border-muted/50 hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-3">
                            <p className="font-medium truncate max-w-[120px]">{row.product_name}</p>
                            {row.branch && <p className="text-muted-foreground text-[10px]">{row.branch}</p>}
                          </td>
                          <td className="py-2 pr-3 text-right text-muted-foreground">
                            {currency}{(row.previous_price || 0).toFixed(2)}
                          </td>
                          <td className="py-2 pr-3 text-right font-semibold">
                            {currency}{(row.new_price || 0).toFixed(2)}
                          </td>
                          <td className={`py-2 pr-3 text-right font-semibold ${diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                            {diff > 0 ? '+' : ''}{currency}{diff.toFixed(2)}
                          </td>
                          <td className={`py-2 pr-3 text-right font-semibold ${pctColor(pct)}`}>
                            {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                          </td>
                          <td className="py-2 pr-3 text-center">
                            {trendIcon(diff)}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground truncate max-w-[100px]">
                            {row.supplier_name || '—'}
                          </td>
                          <td className="py-2 text-muted-foreground whitespace-nowrap">
                            {format(new Date(row.recorded_at), 'dd MMM yy HH:mm')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ── Latest Price per Product ── */}
          {latestPerProduct.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1">
                <Package className="w-4 h-4 text-primary" /> Current vs Previous Price (per Product)
              </h3>
              <div className="space-y-2">
                {latestPerProduct.map(row => {
                  const diff = row.difference || 0;
                  const pct = row.pct_change || 0;
                  return (
                    <div key={row.product_id} className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="flex-1 min-w-[120px]">
                        <p className="text-sm font-semibold truncate">{row.product_name}</p>
                        {row.branch && <p className="text-xs text-muted-foreground">{row.branch}</p>}
                      </div>
                      <div className="flex items-center gap-3 text-xs flex-wrap">
                        <span className="text-muted-foreground">Prev: <strong>{currency}{(row.previous_price || 0).toFixed(2)}</strong></span>
                        <span>Now: <strong>{currency}{(row.new_price || 0).toFixed(2)}</strong></span>
                        <span className={`font-bold ${diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                          {diff > 0 ? '+' : ''}{currency}{diff.toFixed(2)}
                        </span>
                        <span className={`font-bold ${pctColor(pct)}`}>
                          {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                        </span>
                        {trendBadge(diff)}
                      </div>
                      <p className="text-[10px] text-muted-foreground w-full sm:w-auto">
                        {format(new Date(row.recorded_at), 'dd MMM yyyy HH:mm')}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
