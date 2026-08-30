import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Wallet, TrendingDown, TrendingUp, AlertTriangle,
  Banknote, Clock, BarChart3, Loader2
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';

function KPICard({ label, value, icon: Icon, color = 'blue', sub, trend }) {
  const colors = {
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-100' },
    green:  { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100' },
    amber:  { bg: 'bg-amber-50',  text: 'text-amber-600',  border: 'border-amber-100' },
    red:    { bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100' },
  };
  const c = colors[color] || colors.blue;
  return (
    <Card className={`border ${c.border}`}>
      <CardContent className="p-3">
        <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center mb-2`}>
          <Icon className={`w-4 h-4 ${c.text}`} />
        </div>
        <p className="text-lg font-bold text-foreground leading-tight">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function BranchSettlementRow({ settlement, currency }) {
  const fmt = (n) => `${currency}${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const statusConfig = {
    Draft:      { color: 'bg-gray-100 text-gray-700', label: 'Draft' },
    Submitted:  { color: 'bg-blue-100 text-blue-700', label: 'Pending' },
    Approved:   { color: 'bg-emerald-100 text-emerald-700', label: 'Approved' },
    Rejected:   { color: 'bg-red-100 text-red-700', label: 'Rejected' },
  };
  const sc = statusConfig[settlement.status] || statusConfig.Draft;
  const diff = Number(settlement.difference || 0);

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{settlement.branch}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sc.color}`}>{sc.label}</span>
          {diff !== 0 && (
            <span className={`text-[10px] font-medium ${diff < 0 ? 'text-red-600' : 'text-amber-600'}`}>
              {diff < 0 ? '▼' : '▲'} {fmt(Math.abs(diff))}
            </span>
          )}
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold">{fmt(settlement.expected_closing_cash)}</p>
        <p className="text-[10px] text-muted-foreground">Expected</p>
      </div>
    </div>
  );
}

export default function CashRegisterDashboard({ selectedBranch = 'all' }) {
  const { user } = useAuth();
  const { branches } = useTenant();
  const { currency } = useLanguage();
  const today = format(new Date(), 'yyyy-MM-dd');
  const fmt = (n) => `${currency}${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  // Today's settlements
  const { data: todaySettlements = [], isLoading: loadingSettlements } = useQuery({
    queryKey: ['daily_cash_settlements_today', today, user?.email],
    queryFn: () => base44.entities.DailyCashSettlement.filter({
      date: today,
      created_by: user?.email,
    }, '-created_date', 50),
    enabled: !!user?.email,
    staleTime: 30000,
  });

  // Recent settlements (last 30 days for chart)
  const { data: recentSettlements = [] } = useQuery({
    queryKey: ['daily_cash_settlements_recent', user?.email],
    queryFn: () => base44.entities.DailyCashSettlement.filter({
      created_by: user?.email,
    }, '-date', 200),
    enabled: !!user?.email,
    staleTime: 60000,
  });

  // Today's shortages
  const { data: todayShortages = [] } = useQuery({
    queryKey: ['cash_shortages_today', today, user?.email],
    queryFn: () => base44.entities.CashShortage.filter({
      date: today,
      created_by: user?.email,
    }, '-created_date', 50),
    enabled: !!user?.email,
    staleTime: 30000,
  });

  // Today's injections
  const { data: todayInjections = [] } = useQuery({
    queryKey: ['owner_cash_injections_today', today, user?.email],
    queryFn: () => base44.entities.OwnerCashInjection.filter({
      date: today,
      created_by: user?.email,
    }, '-created_date', 50),
    enabled: !!user?.email,
    staleTime: 30000,
  });

  // Pending shortages (all time)
  const { data: pendingShortages = [] } = useQuery({
    queryKey: ['cash_shortages_pending', user?.email],
    queryFn: () => base44.entities.CashShortage.filter({
      created_by: user?.email,
      status: 'Pending',
    }, '-date', 50),
    enabled: !!user?.email,
    staleTime: 30000,
  });

  // Filter by branch
  const filteredSettlements = useMemo(() =>
    todaySettlements.filter(s => selectedBranch === 'all' || s.branch === selectedBranch),
    [todaySettlements, selectedBranch]
  );

  // KPI computations
  const totalOpening = filteredSettlements.reduce((s, r) => s + Number(r.opening_cash || 0), 0);
  const totalExpected = filteredSettlements.reduce((s, r) => s + Number(r.expected_closing_cash || 0), 0);
  const totalCounted = filteredSettlements.reduce((s, r) => s + Number(r.cash_counted || 0), 0);
  const totalShortage = todayShortages.filter(s => s.type === 'Shortage').reduce((s, r) => s + Number(r.shortage_amount || 0), 0);
  const totalOverage = todayShortages.filter(s => s.type === 'Overage').reduce((s, r) => s + Number(r.overage_amount || 0), 0);
  const totalInjection = todayInjections.reduce((s, r) => s + Number(r.amount || 0), 0);
  const pendingCount = filteredSettlements.filter(s => s.status === 'Draft' || s.status === 'Submitted').length;

  // 7-day chart data
  const chartData = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
      const label = format(subDays(new Date(), 6 - i), 'MM/dd');
      const daySettlements = recentSettlements.filter(s =>
        s.date === d && (selectedBranch === 'all' || s.branch === selectedBranch)
      );
      const opening = daySettlements.reduce((s, r) => s + Number(r.opening_cash || 0), 0);
      const expected = daySettlements.reduce((s, r) => s + Number(r.expected_closing_cash || 0), 0);
      const shortage = daySettlements.reduce((s, r) => s + Number(r.shortage || 0), 0);
      return { date: label, opening, expected, shortage };
    }),
    [recentSettlements, selectedBranch]
  );

  if (loadingSettlements) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-2">
        <KPICard
          label="Today's Opening"
          value={fmt(totalOpening)}
          icon={Wallet}
          color="blue"
        />
        <KPICard
          label="Expected Closing"
          value={fmt(totalExpected)}
          icon={BarChart3}
          color="green"
        />
        <KPICard
          label="Today's Shortage"
          value={fmt(totalShortage)}
          icon={TrendingDown}
          color={totalShortage > 0 ? 'red' : 'green'}
          sub={totalShortage > 0 ? 'Requires attention' : 'No shortage'}
        />
        <KPICard
          label="Today's Overage"
          value={fmt(totalOverage)}
          icon={TrendingUp}
          color={totalOverage > 0 ? 'amber' : 'green'}
        />
        <KPICard
          label="Owner Injection Today"
          value={fmt(totalInjection)}
          icon={Banknote}
          color="purple"
        />
        <KPICard
          label="Pending Settlements"
          value={pendingCount}
          icon={Clock}
          color={pendingCount > 0 ? 'amber' : 'green'}
          sub={pendingCount > 0 ? 'Awaiting action' : 'All settled'}
        />
      </div>

      {/* Pending Shortages Alert */}
      {pendingShortages.length > 0 && (
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700">
                  {pendingShortages.length} Pending Shortage{pendingShortages.length > 1 ? 's' : ''} Require Attention
                </p>
                <p className="text-xs text-red-600">
                  Total: {fmt(pendingShortages.reduce((s, r) => s + Number(r.shortage_amount || 0), 0))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 7-Day Chart */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold">7-Day Cash Overview</CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={50} tickFormatter={v => `${currency}${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8 }}
                formatter={(v, name) => [`${currency}${v.toLocaleString()}`, name]}
              />
              <Bar dataKey="opening" fill="#3b82f6" radius={[4,4,0,0]} name="Opening" />
              <Bar dataKey="expected" fill="#10b981" radius={[4,4,0,0]} name="Expected" />
              <Bar dataKey="shortage" fill="#ef4444" radius={[4,4,0,0]} name="Shortage" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Today's Branch Settlements */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold">Today's Settlements</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {filteredSettlements.length === 0 ? (
            <div className="text-center py-4">
              <Clock className="w-6 h-6 mx-auto mb-1 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No settlements yet today</p>
            </div>
          ) : (
            filteredSettlements.map(s => (
              <BranchSettlementRow key={s.id} settlement={s} currency={currency} />
            ))
          )}
        </CardContent>
      </Card>

      {/* Settlement History (last 7 days) */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold">Settlement History</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="space-y-0 max-h-64 overflow-y-auto">
            {recentSettlements
              .filter(s => s.date !== today && (selectedBranch === 'all' || s.branch === selectedBranch))
              .slice(0, 20)
              .map(s => (
                <BranchSettlementRow key={s.id} settlement={s} currency={currency} />
              ))
            }
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
