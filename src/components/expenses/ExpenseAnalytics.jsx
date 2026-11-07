import React, { useMemo, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { formatCurrency } from '@/lib/helpers';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  CartesianGrid, Cell, PieChart, Pie
} from 'recharts';

const categoryKey = e => e.expense_category_id || e.category_id || e.category || '__unknown__';
const expenseAmount = e => { const n=Number(e.amount);return Number.isFinite(n)?n:0; };
const branchKey = e => e.branch_key || e.branch || 'all';

export default function ExpenseAnalytics({ expenses, categories = [] }) {
  const { lang, currency } = useLanguage();
  const { branches } = useTenant();
  const fmt = v => formatCurrency(v, currency);
  const [selectedBranch, setSelectedBranch] = useState('all');

  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  const getCatName = (cat) => {
    if (!cat) return '—';
    if (lang === 'ar' && cat.name_ar) return cat.name_ar;
    if (lang === 'fa' && cat.name_fa) return cat.name_fa;
    return cat.name_en || cat.name;
  };

  const catMap = useMemo(() => {
    const m = {};
    categories.forEach(c => { m[c.id] = c; });
    return m;
  }, [categories]);

  const filtered = useMemo(() =>
    expenses.filter(e => selectedBranch === 'all' || branchKey(e) === selectedBranch || branchKey(e) === 'all'),
    [expenses, selectedBranch]
  );

  // ── Category breakdown ────────────────────────────────────────────────
  const categoryBreakdown = useMemo(() => {
    const map = {};
    filtered.forEach(e => {
      const catId = categoryKey(e);
      const year = e.date?.slice(0, 4);
      if (!map[catId]) map[catId] = { cur: 0, prev: 0 };
      if (year === String(currentYear)) map[catId].cur += expenseAmount(e);
      if (year === String(prevYear)) map[catId].prev += expenseAmount(e);
    });
    return Object.entries(map).map(([catId, vals]) => {
      const cat = catMap[catId];
      return {
        catId,
        label: cat ? getCatName(cat) : catId,
        color: cat?.color || '#888',
        icon: cat?.icon || '📝',
        current: vals.cur,
        previous: vals.prev,
        change: vals.prev > 0 ? ((vals.cur - vals.prev) / vals.prev * 100) : 0,
      };
    }).filter(c => c.current > 0 || c.previous > 0)
      .sort((a, b) => b.current - a.current);
  }, [filtered, currentYear, prevYear, catMap, lang]);

  // ── Monthly trend ─────────────────────────────────────────────────────
  const monthlyTrend = useMemo(() => {
    const activeCatIds = [...new Set(filtered.map(categoryKey))];
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, '0');
      const key = `${currentYear}-${m}`;
      const obj = { month: new Date(currentYear, i, 1).toLocaleString('default', { month: 'short' }), total: 0 };
      activeCatIds.forEach(id => { obj[id] = 0; });
      filtered.filter(e => e.date?.startsWith(key)).forEach(e => {
        const cid = categoryKey(e);
        obj[cid] = (obj[cid] || 0) + expenseAmount(e);
        obj.total += expenseAmount(e);
      });
      return obj;
    });
    return months.filter(m => m.total > 0);
  }, [filtered, currentYear]);

  // ── Branch breakdown ──────────────────────────────────────────────────
  const branchBreakdown = useMemo(() => {
    const map = {};
    expenses.forEach(e => {
      const key=branchKey(e);
      const b=key==='all'?'Shared':(branches.find(br=>br.key===key||br.id===e.branch_id)?.label||key);
      map[b]=(map[b]||0)+expenseAmount(e);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [expenses, branches]);

  // ── Pie data ──────────────────────────────────────────────────────────
  const pieData = useMemo(() =>
    categoryBreakdown.filter(c => c.current > 0).map(c => ({
      name: c.label,
      value: c.current,
      fill: c.color,
    })),
    [categoryBreakdown]
  );

  // ── Anomaly detection ─────────────────────────────────────────────────
  const anomalies = useMemo(() => {
    if (monthlyTrend.length < 3) return [];
    const totals = monthlyTrend.map(m => m.total);
    const avg = totals.reduce((s, v) => s + v, 0) / totals.length;
    const variance = totals.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / totals.length;
    const threshold = avg + 1.5 * Math.sqrt(variance);
    return monthlyTrend.filter(m => m.total > threshold).map(m => ({ ...m, spike: m.total - avg }));
  }, [monthlyTrend]);

  const totalCur = categoryBreakdown.reduce((s, c) => s + c.current, 0);
  const totalPrev = categoryBreakdown.reduce((s, c) => s + c.previous, 0);
  const yoyChange = totalPrev > 0 ? ((totalCur - totalPrev) / totalPrev * 100) : 0;

  const activeCatIds = [...new Set(filtered.map(categoryKey))];

  if (expenses.length === 0) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No expense data to analyze yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Branch filter */}
      <Select value={selectedBranch} onValueChange={setSelectedBranch}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All Branches" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Branches</SelectItem>
          {branches.map(b => <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>)}
        </SelectContent>
      </Select>

      {/* YoY summary */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-2 text-center">
          <p className="text-xs text-muted-foreground">{currentYear}</p>
          <p className="text-sm font-bold">{fmt(totalCur)}</p>
        </Card>
        <Card className="p-2 text-center">
          <p className="text-xs text-muted-foreground">{prevYear}</p>
          <p className="text-sm font-bold text-muted-foreground">{fmt(totalPrev)}</p>
        </Card>
        <Card className={`p-2 text-center ${yoyChange > 10 ? 'bg-red-50 border-red-200' : yoyChange < -10 ? 'bg-emerald-50 border-emerald-200' : ''}`}>
          <p className="text-xs text-muted-foreground">YoY</p>
          <div className="flex items-center justify-center gap-1">
            {yoyChange > 0 ? <TrendingUp className="w-3 h-3 text-red-500" /> : <TrendingDown className="w-3 h-3 text-emerald-600" />}
            <p className={`text-sm font-bold ${yoyChange > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
              {yoyChange > 0 ? '+' : ''}{yoyChange.toFixed(1)}%
            </p>
          </div>
        </Card>
      </div>

      {/* Anomaly alerts */}
      {anomalies.length > 0 && (
        <Card className="p-3 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5" /> Spending Anomalies Detected
          </p>
          {anomalies.map((a, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-amber-200 last:border-0">
              <span className="font-medium">{a.month} {currentYear}</span>
              <span className="text-muted-foreground">Total: {fmt(a.total)}</span>
              <Badge className="bg-amber-100 text-amber-700 border-amber-200">+{fmt(a.spike)} above avg</Badge>
            </div>
          ))}
        </Card>
      )}

      {/* Category breakdown YoY */}
      {categoryBreakdown.length > 0 && (
        <Card className="p-3">
          <p className="text-xs font-semibold mb-3 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-primary" /> Category Breakdown — Year-over-Year
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={categoryBreakdown} margin={{ left: -15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${currency}${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="current" name={String(currentYear)} radius={[3, 3, 0, 0]}>
                {categoryBreakdown.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
              <Bar dataKey="previous" name={String(prevYear)} fill="#cbd5e1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-1.5 mt-3">
            {categoryBreakdown.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                  <span className="truncate">{c.icon} {c.label}</span>
                </span>
                <span className={`font-semibold shrink-0 ml-1 ${c.change > 0 ? 'text-red-500' : c.change < 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  {c.change > 0 ? '+' : ''}{c.change.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Monthly stacked trend */}
      {monthlyTrend.length > 0 && activeCatIds.length > 0 && (
        <Card className="p-3">
          <p className="text-xs font-semibold mb-3">Monthly Expense Trend — {currentYear}</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyTrend} margin={{ left: -15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${currency}${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v, name) => [fmt(v), catMap[name] ? getCatName(catMap[name]) : name]} />
              {activeCatIds.map(id => (
                <Bar key={id} dataKey={id} stackId="a" fill={catMap[id]?.color || '#888'} name={id} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Category pie + branch breakdown */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {pieData.length > 0 && (
          <Card className="p-3">
            <p className="text-xs font-semibold mb-2">Category Share</p>
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={2}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip formatter={v => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-0.5 mt-1">
              {pieData.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
                  <span className="truncate text-muted-foreground flex-1">{d.name}</span>
                  <span className="font-semibold shrink-0">{fmt(d.value)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {branchBreakdown.length > 0 && (
          <Card className="p-3">
            <p className="text-xs font-semibold mb-2">By Branch (All Time)</p>
            <div className="space-y-2">
              {branchBreakdown.map((b, i) => {
                const total = branchBreakdown.reduce((s, x) => s + x.value, 0);
                const pct = total > 0 ? (b.value / total * 100) : 0;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="truncate font-medium">{b.name}</span>
                      <span className="text-muted-foreground shrink-0 ml-1">{fmt(b.value)}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}