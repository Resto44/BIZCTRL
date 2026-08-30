import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  FileText, TrendingDown, Banknote,
  BarChart3, Building2, Loader2, ArrowUpRight
} from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

const REPORT_TYPES = [
  { value: 'daily',    label: 'Daily Settlement Report',  icon: FileText },
  { value: 'monthly',  label: 'Monthly Settlement Report', icon: BarChart3 },
  { value: 'movement', label: 'Cash Movement Report',      icon: ArrowUpRight },
  { value: 'shortage', label: 'Shortage Report',           icon: TrendingDown },
  { value: 'injection',label: 'Owner Injection Report',    icon: Banknote },
  { value: 'branch',   label: 'Branch Comparison',         icon: Building2 },
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function CashRegisterReports({ selectedBranch = 'all' }) {
  const { user } = useAuth();
  const { branches } = useTenant();
  const { currency } = useLanguage();
  const fmt = (n) => `${currency}${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const [reportType, setReportType] = useState('daily');
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Load all settlements in range
  const { data: settlements = [], isLoading: loadingS } = useQuery({
    queryKey: ['settlements_report', user?.email, dateFrom, dateTo],
    queryFn: () => base44.entities.DailyCashSettlement.filter({
      created_by: user?.email,
    }, '-date', 500),
    enabled: !!user?.email,
    staleTime: 60000,
  });

  // Load shortages
  const { data: shortages = [], isLoading: loadingSh } = useQuery({
    queryKey: ['shortages_report', user?.email],
    queryFn: () => base44.entities.CashShortage.filter({
      created_by: user?.email,
    }, '-date', 500),
    enabled: !!user?.email,
    staleTime: 60000,
  });

  // Load injections
  const { data: injections = [], isLoading: loadingI } = useQuery({
    queryKey: ['injections_report', user?.email],
    queryFn: () => base44.entities.OwnerCashInjection.filter({
      created_by: user?.email,
    }, '-date', 500),
    enabled: !!user?.email,
    staleTime: 60000,
  });

  // Load movements
  const { data: movements = [], isLoading: loadingM } = useQuery({
    queryKey: ['movements_report', user?.email],
    queryFn: () => base44.entities.CashMovement.filter({
      created_by: user?.email,
      is_reversed: false,
    }, '-date', 1000),
    enabled: !!user?.email,
    staleTime: 60000,
  });

  // Load approved supplier invoices for unified purchase reporting
  const { data: allInvoicesInRange = [], isLoading: loadingInv } = useQuery({
    queryKey: ['supplier_invoices_report', user?.email, dateFrom, dateTo],
    queryFn: async () => {
      if (!user?.email) return [];
      const { data, error } = await supabase
        .from('supplier_invoices')
        .select('*')
        .eq('created_by', user.email)
        .in('approval_status', ['approved', 'auto_approved'])
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: false });
      if (error) return [];
      return data || [];
    },
    enabled: !!user?.email,
    staleTime: 60000,
  });

  const isLoading = loadingS || loadingSh || loadingI || loadingM || loadingInv;

  // Filter by date range and branch
  const filterRange = (arr) => arr.filter(r =>
    r.date >= dateFrom && r.date <= dateTo &&
    (selectedBranch === 'all' || r.branch === selectedBranch)
  );

  const filteredSettlements = useMemo(() => filterRange(settlements), [settlements, dateFrom, dateTo, selectedBranch]);
  const filteredShortages   = useMemo(() => filterRange(shortages),   [shortages, dateFrom, dateTo, selectedBranch]);
  const filteredInjections  = useMemo(() => filterRange(injections),  [injections, dateFrom, dateTo, selectedBranch]);
  const filteredMovements   = useMemo(() => filterRange(movements),   [movements, dateFrom, dateTo, selectedBranch]);

  // ── Daily Settlement Report ──────────────────────────────────────────────
  const DailyReport = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Total Settlements</p>
          <p className="text-lg font-bold">{filteredSettlements.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Approved</p>
          <p className="text-lg font-bold text-emerald-600">{filteredSettlements.filter(s => s.status === 'Approved').length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Total Cash Sales</p>
          <p className="text-lg font-bold">{fmt(filteredSettlements.reduce((s, r) => s + Number(r.cash_sales || 0), 0))}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Total Shortages</p>
          <p className="text-lg font-bold text-red-600">{fmt(filteredSettlements.reduce((s, r) => s + Number(r.shortage || 0), 0))}</p>
        </CardContent></Card>
      </div>
      <Card>
        <CardContent className="px-4 pb-3 pt-3">
          <div className="max-h-72 overflow-y-auto space-y-0">
            {filteredSettlements.slice(0, 50).map(s => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-xs">
                <div>
                  <p className="font-medium">{s.branch}</p>
                  <p className="text-muted-foreground">{format(parseISO(s.date), 'MMM d, yyyy')}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{fmt(s.expected_closing_cash)}</p>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                    s.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                    s.status === 'Submitted' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>{s.status}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ── Monthly Settlement Report ────────────────────────────────────────────
  const MonthlyReport = () => {
    const monthlyData = useMemo(() => {
      const byMonth = {};
      filteredSettlements.forEach(s => {
        const m = s.date.slice(0, 7);
        if (!byMonth[m]) byMonth[m] = { month: m, sales: 0, expenses: 0, shortage: 0, overage: 0, count: 0, purchases: 0 };
        byMonth[m].sales += Number(s.cash_sales || 0);
        byMonth[m].expenses += Number(s.cash_expenses || 0);
        byMonth[m].shortage += Number(s.shortage || 0);
        byMonth[m].overage += Number(s.overage || 0);
        byMonth[m].count++;
      });

      // Overlay unified purchase data (supplier invoices)
      allInvoicesInRange.forEach(inv => {
        if (selectedBranch !== 'all' && inv.branch !== selectedBranch) return;
        const m = inv.date.slice(0, 7);
        if (byMonth[m]) {
          byMonth[m].purchases += Number(inv.total_amount || 0);
        }
      });

      return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
    }, [filteredSettlements, allInvoicesInRange, selectedBranch]);

    return (
      <div className="space-y-3">
        <Card>
          <CardContent className="px-2 pb-3 pt-3">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={50} tickFormatter={v => `${currency}${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={v => [`${currency}${v.toLocaleString()}`, '']} />
                <Bar dataKey="sales" fill="#10b981" radius={[4,4,0,0]} name="Cash Sales" />
                <Bar dataKey="expenses" fill="#ef4444" radius={[4,4,0,0]} name="Cash Expenses" />
                <Bar dataKey="purchases" fill="#f59e0b" radius={[4,4,0,0]} name="Approved Purchases" />
                <Bar dataKey="shortage" fill="#f59e0b" radius={[4,4,0,0]} name="Shortage" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <div className="space-y-2">
          {monthlyData.map(m => (
            <Card key={m.month}>
              <CardContent className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold">{format(parseISO(m.month + '-01'), 'MMMM yyyy')}</p>
                  <span className="text-xs text-muted-foreground">{m.count} settlements</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>Sales: <span className="font-semibold text-emerald-600">{fmt(m.sales)}</span></div>
                  <div>Expenses: <span className="font-semibold text-red-600">{fmt(m.expenses)}</span></div>
                  <div>Purchases: <span className="font-semibold text-amber-600">{fmt(m.purchases)}</span></div>
                  <div>Shortage: <span className="font-semibold text-amber-600">{fmt(m.shortage)}</span></div>
                  <div>Overage: <span className="font-semibold text-blue-600">{fmt(m.overage)}</span></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  // ── Cash Movement Report ─────────────────────────────────────────────────
  const MovementReport = () => {
    const byType = useMemo(() => {
      const map = {};
      filteredMovements.forEach(m => {
        if (!map[m.movement_type]) map[m.movement_type] = { type: m.movement_type, in: 0, out: 0 };
        if (m.direction === 'in') map[m.movement_type].in += Number(m.amount || 0);
        else map[m.movement_type].out += Number(m.amount || 0);
      });
      return Object.values(map);
    }, [filteredMovements]);

    const totalIn = filteredMovements.filter(m => m.direction === 'in').reduce((s, m) => s + Number(m.amount || 0), 0);
    const totalOut = filteredMovements.filter(m => m.direction === 'out').reduce((s, m) => s + Number(m.amount || 0), 0);

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Card className="border-emerald-200"><CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Cash In</p>
            <p className="text-base font-bold text-emerald-600">{fmt(totalIn)}</p>
          </CardContent></Card>
          <Card className="border-red-200"><CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Cash Out</p>
            <p className="text-base font-bold text-red-600">{fmt(totalOut)}</p>
          </CardContent></Card>
        </div>
        <Card>
          <CardContent className="px-4 pb-3 pt-3">
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {byType.map(t => (
                <div key={t.type} className="flex items-center justify-between py-1.5 border-b border-border last:border-0 text-xs">
                  <span className="text-muted-foreground capitalize">{t.type.replace(/_/g, ' ')}</span>
                  <div className="flex gap-3">
                    {t.in > 0 && <span className="text-emerald-600 font-medium">+{fmt(t.in)}</span>}
                    {t.out > 0 && <span className="text-red-600 font-medium">-{fmt(t.out)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ── Shortage Report ──────────────────────────────────────────────────────
  const ShortageReport = () => {
    const totalShortage = filteredShortages.filter(s => s.type === 'Shortage').reduce((s, r) => s + Number(r.shortage_amount || 0), 0);
    const resolved = filteredShortages.filter(s => s.status === 'Resolved').length;
    const pending = filteredShortages.filter(s => s.status === 'Pending').length;

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Card><CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Shortages</p>
            <p className="text-base font-bold text-red-600">{fmt(totalShortage)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Pending / Resolved</p>
            <p className="text-base font-bold">{pending} / {resolved}</p>
          </CardContent></Card>
        </div>
        <Card>
          <CardContent className="px-4 pb-3 pt-3">
            <div className="space-y-0 max-h-72 overflow-y-auto">
              {filteredShortages.slice(0, 50).map(s => (
                <div key={s.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-xs">
                  <div>
                    <p className="font-medium">{s.branch}</p>
                    <p className="text-muted-foreground">{format(parseISO(s.date), 'MMM d, yyyy')}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${s.type === 'Shortage' ? 'text-red-600' : 'text-amber-600'}`}>
                      {fmt(s.type === 'Shortage' ? s.shortage_amount : s.overage_amount)}
                    </p>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                      s.status === 'Resolved' ? 'bg-emerald-100 text-emerald-700' :
                      s.status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>{s.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ── Owner Injection Report ───────────────────────────────────────────────
  const InjectionReport = () => {
    const total = filteredInjections.reduce((s, r) => s + Number(r.amount || 0), 0);
    const byReason = useMemo(() => {
      const map = {};
      filteredInjections.forEach(i => {
        const r = i.reason || 'Other';
        if (!map[r]) map[r] = 0;
        map[r] += Number(i.amount || 0);
      });
      return Object.entries(map).map(([name, value]) => ({ name, value }));
    }, [filteredInjections]);

    return (
      <div className="space-y-3">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Total Injected</p>
          <p className="text-xl font-bold text-green-600">{fmt(total)}</p>
          <p className="text-xs text-muted-foreground">{filteredInjections.length} transactions</p>
        </CardContent></Card>
        {byReason.length > 0 && (
          <Card>
            <CardContent className="px-2 pb-3 pt-3">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={byReason} cx="50%" cy="50%" outerRadius={60} dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                    {byReason.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => [fmt(v), '']} contentStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="px-4 pb-3 pt-3">
            <div className="space-y-0 max-h-64 overflow-y-auto">
              {filteredInjections.slice(0, 50).map(i => (
                <div key={i.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-xs">
                  <div>
                    <p className="font-medium">{i.branch}</p>
                    <p className="text-muted-foreground">{format(parseISO(i.date), 'MMM d')} · {i.reason || 'Other'}</p>
                  </div>
                  <p className="font-semibold text-green-600">{fmt(i.amount)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ── Branch Comparison ────────────────────────────────────────────────────
  const BranchComparison = () => {
    const branchData = useMemo(() => {
      const map = {};
      filteredSettlements.forEach(s => {
        if (!map[s.branch]) map[s.branch] = { branch: s.branch, sales: 0, shortage: 0, count: 0 };
        map[s.branch].sales += Number(s.cash_sales || 0);
        map[s.branch].shortage += Number(s.shortage || 0);
        map[s.branch].count++;
      });
      return Object.values(map).sort((a, b) => b.sales - a.sales);
    }, [filteredSettlements]);

    return (
      <div className="space-y-3">
        <Card>
          <CardContent className="px-2 pb-3 pt-3">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={branchData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="branch" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={50} tickFormatter={v => `${currency}${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={v => [`${currency}${v.toLocaleString()}`, '']} />
                <Bar dataKey="sales" fill="#10b981" radius={[4,4,0,0]} name="Cash Sales" />
                <Bar dataKey="shortage" fill="#ef4444" radius={[4,4,0,0]} name="Shortage" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <div className="space-y-2">
          {branchData.map((b, i) => (
            <Card key={b.branch}>
              <CardContent className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: COLORS[i % COLORS.length] }}>
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{b.branch}</p>
                      <p className="text-xs text-muted-foreground">{b.count} settlements</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600">{fmt(b.sales)}</p>
                    {b.shortage > 0 && <p className="text-xs text-red-600">-{fmt(b.shortage)} shortage</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  const reportComponents = {
    daily:    <DailyReport />,
    monthly:  <MonthlyReport />,
    movement: <MovementReport />,
    shortage: <ShortageReport />,
    injection:<InjectionReport />,
    branch:   <BranchComparison />,
  };

  return (
    <div className="space-y-3">
      {/* Report Type Selector */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {REPORT_TYPES.map(r => {
          const Icon = r.icon;
          return (
            <button
              key={r.value}
              onClick={() => setReportType(r.value)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                reportType === r.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <Icon className="w-3 h-3" />
              {r.label.split(' ')[0]}
            </button>
          );
        })}
      </div>

      {/* Date Range */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs text-muted-foreground mb-1">From</p>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">To</p>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-xs" />
        </div>
      </div>

      {/* Report Title */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {REPORT_TYPES.find(r => r.value === reportType)?.label}
        </h3>
      </div>

      {/* Report Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        reportComponents[reportType]
      )}
    </div>
  );
}
