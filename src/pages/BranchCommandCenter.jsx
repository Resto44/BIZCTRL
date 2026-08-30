import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Building2, Award, BarChart3, Shield
} from 'lucide-react';
import { ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts';
import { format } from 'date-fns';

function ScoreGauge({ score, label, color = 'blue' }) {
  const colorMap = {
    blue:   { bar: 'bg-blue-500',   text: 'text-blue-600',   bg: 'bg-blue-50' },
    green:  { bar: 'bg-emerald-500',text: 'text-emerald-600',bg: 'bg-emerald-50' },
    amber:  { bar: 'bg-amber-500',  text: 'text-amber-600',  bg: 'bg-amber-50' },
    red:    { bar: 'bg-red-500',    text: 'text-red-600',    bg: 'bg-red-50' },
    purple: { bar: 'bg-purple-500', text: 'text-purple-600', bg: 'bg-purple-50' },
    cyan:   { bar: 'bg-cyan-500',   text: 'text-cyan-600',   bg: 'bg-cyan-50' },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className={`rounded-xl p-3 ${c.bg}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={`text-sm font-bold ${c.text}`}>{score}%</span>
      </div>
      <Progress value={score} className="h-2" />
    </div>
  );
}

function BranchDashboard({ branch, sales, purchases, expenses, employees, currency }) {
  const revenue = sales.reduce((s, r) => s + (r.total_sales || 0), 0);
  const cost = purchases.reduce((s, r) => s + (r.total_amount || 0), 0);
  const expTotal = expenses.reduce((s, r) => s + (r.amount || 0), 0);
  const profit = revenue - cost - expTotal;
  const cashSales = sales.reduce((s, r) => s + (r.cash || 0), 0);
  const creditSales = sales.reduce((s, r) => s + (r.credit || 0), 0);
  const staffCount = employees.filter(e => e.branch === branch).length;

  const fmt = (n) => `${currency}${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  // Health scores (simplified calculation)
  const salesScore = Math.min(100, revenue > 0 ? 80 : 0);
  const profitScore = Math.min(100, profit > 0 ? Math.round((profit / revenue) * 100 * 3) : 0);
  const cashScore = Math.min(100, cashSales > 0 ? 85 : 0);
  const collectionScore = Math.min(100, creditSales > 0 ? Math.round((cashSales / (cashSales + creditSales)) * 100) : 100);
  const inventoryScore = 75;
  const operationalScore = Math.round((salesScore + profitScore + cashScore + collectionScore + inventoryScore) / 5);

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Revenue',    value: fmt(revenue),   color: 'text-blue-600' },
          { label: 'Profit',     value: fmt(profit),    color: profit >= 0 ? 'text-emerald-600' : 'text-red-500' },
          { label: 'Expenses',   value: fmt(expTotal),  color: 'text-amber-600' },
          { label: 'Cash',       value: fmt(cashSales), color: 'text-cyan-600' },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="p-3">
              <p className={`text-base font-bold ${kpi.color}`}>{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Health Scores */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Branch Health Score — {operationalScore}%
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          <ScoreGauge score={salesScore}       label="Sales Score"       color="blue"   />
          <ScoreGauge score={profitScore}      label="Profit Score"      color="green"  />
          <ScoreGauge score={inventoryScore}   label="Inventory Score"   color="amber"  />
          <ScoreGauge score={cashScore}        label="Cash Score"        color="cyan"   />
          <ScoreGauge score={collectionScore}  label="Collection Score"  color="purple" />
          <ScoreGauge score={operationalScore} label="Operational Score" color={operationalScore >= 70 ? 'green' : operationalScore >= 50 ? 'amber' : 'red'} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function BranchCommandCenter() {
  const { t, currency } = useLanguage();
  const { branches, ownerFilter } = useTenant();
  const [tab, setTab] = useState('dashboard');
  const [selectedBranch, setSelectedBranch] = useState(null);

  const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd');
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: allSales = [] } = useQuery({
    queryKey: ['branch_sales', ownerFilter],
    queryFn: () => base44.entities.DailySales.filter(ownerFilter || {}, '-date', 1000),
    staleTime: 120000,
    enabled: !!ownerFilter?.created_by,
  });
  const { data: allPurchases = [] } = useQuery({
    queryKey: ['branch_purchases', ownerFilter],
    queryFn: () => base44.entities.Purchase.filter(ownerFilter || {}, '-date', 500),
    staleTime: 120000,
    enabled: !!ownerFilter?.created_by,
  });
  const { data: allExpenses = [] } = useQuery({
    queryKey: ['branch_expenses', ownerFilter],
    queryFn: () => base44.entities.Expense.filter(ownerFilter || {}, '-date', 500),
    staleTime: 120000,
    enabled: !!ownerFilter?.created_by,
  });
  const { data: employees = [] } = useQuery({
    queryKey: ['branch_employees', ownerFilter],
    queryFn: () => base44.entities.Employee.filter(ownerFilter || {}),
    staleTime: 300000,
    enabled: !!ownerFilter?.created_by,
  });

  const monthSales = allSales.filter(s => s.date >= monthStart);
  const monthPurchases = allPurchases.filter(p => p.date >= monthStart);
  const monthExpenses = allExpenses.filter(e => e.date >= monthStart);

  // Branch rankings
  const branchData = useMemo(() => {
    const branchNames = [...new Set([
      ...monthSales.map(s => s.branch),
      ...monthPurchases.map(p => p.branch),
      ...branches.map(b => b.name),
    ].filter(Boolean))];

    return branchNames.map(name => {
      const bSales = monthSales.filter(s => s.branch === name);
      const bPurchases = monthPurchases.filter(p => p.branch === name);
      const bExpenses = monthExpenses.filter(e => e.branch === name || e.branch === 'all');
      const revenue = bSales.reduce((s, r) => s + (r.total_sales || 0), 0);
      const cost = bPurchases.reduce((s, r) => s + (r.total_amount || 0), 0);
      const expTotal = bExpenses.reduce((s, r) => s + (r.amount || 0), 0);
      const profit = revenue - cost - expTotal;
      const cashSales = bSales.reduce((s, r) => s + (r.cash || 0), 0);
      const creditSales = bSales.reduce((s, r) => s + (r.credit || 0), 0);
      return { name, revenue, profit, cost, expTotal, cashSales, creditSales };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [monthSales, monthPurchases, monthExpenses, branches]);

  const fmt = (n) => `${currency}${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const medals = ['🥇', '🥈', '🥉'];

  const activeBranch = selectedBranch || branches[0]?.name;

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold">{t('branch_command_center')}</h1>
          <p className="text-xs text-muted-foreground">{branches.length} branches</p>
        </div>
        <Badge variant="outline" className="text-xs">{format(new Date(), 'MMM yyyy')}</Badge>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-3 h-9">
          <TabsTrigger value="dashboard" className="text-xs">{t('overview')}</TabsTrigger>
          <TabsTrigger value="leaderboard" className="text-xs">{t('branch_leaderboard')}</TabsTrigger>
          <TabsTrigger value="comparison" className="text-xs">{t('multi_branch_comparison')}</TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="mt-3 space-y-3">
          {/* Branch selector */}
          {branches.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {branches.map(b => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBranch(b.name)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    activeBranch === b.name
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}

          {activeBranch ? (
            <BranchDashboard
              branch={activeBranch}
              sales={monthSales.filter(s => s.branch === activeBranch)}
              purchases={monthPurchases.filter(p => p.branch === activeBranch)}
              expenses={monthExpenses.filter(e => e.branch === activeBranch || e.branch === 'all')}
              employees={employees}
              currency={currency}
            />
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No branches configured</p>
            </div>
          )}
        </TabsContent>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard" className="mt-3 space-y-3">
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                {t('branch_leaderboard')}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {branchData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">{t('no_data')}</p>
              ) : (
                branchData.map((b, i) => (
                  <div key={b.name} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                    <span className="text-xl w-8 text-center">{medals[i] || `#${i + 1}`}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{b.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">Rev: {fmt(b.revenue)}</span>
                        <span className={`text-xs font-medium ${b.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          Profit: {fmt(b.profit)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant={i === 0 ? 'default' : 'outline'} className="text-[10px]">
                        #{i + 1}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Comparison Tab */}
        <TabsContent value="comparison" className="mt-3 space-y-3">
          {branchData.length > 0 ? (
            <>
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold">Revenue Comparison</CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-3">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={branchData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v) => [`${currency}${v.toLocaleString()}`, '']} />
                      <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Revenue" />
                      <Bar dataKey="profit"  fill="#10b981" radius={[4, 4, 0, 0]} name="Profit" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Comparison table */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-semibold">Detailed Comparison</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-1.5 text-muted-foreground font-medium">Branch</th>
                        <th className="text-right py-1.5 text-muted-foreground font-medium">Revenue</th>
                        <th className="text-right py-1.5 text-muted-foreground font-medium">Profit</th>
                        <th className="text-right py-1.5 text-muted-foreground font-medium">Expenses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branchData.map(b => (
                        <tr key={b.name} className="border-b border-border last:border-0">
                          <td className="py-2 font-medium">{b.name}</td>
                          <td className="py-2 text-right text-blue-600 font-semibold">{fmt(b.revenue)}</td>
                          <td className={`py-2 text-right font-semibold ${b.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(b.profit)}</td>
                          <td className="py-2 text-right text-amber-600 font-semibold">{fmt(b.expTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('no_data')}</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
