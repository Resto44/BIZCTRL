import React, { useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Building2, Users, DollarSign,
  Package, ShoppingCart, AlertTriangle, BarChart3, LogOut,
  RefreshCw, GitBranch, Activity
} from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { calculateERPAccounting, tagExpensesWithCategories } from '@/lib/helpers';

function StatCard({ title, value, sub, icon: Icon, color = 'text-slate-400', trend }) {
  return (
    <Card className="bg-white/5 border-white/10">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-slate-500 text-xs font-medium mb-1">{title}</p>
            <p className="text-2xl font-black text-white">{value}</p>
            {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
        {trend !== undefined && (
          <div className={`mt-2 text-xs font-semibold ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs last month
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function GMDashboard() {
  const { user, logout } = useAuth();
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: branches = [], isLoading: loadingBranches } = useQuery({
    queryKey: ['gm-branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, is_active, restaurant_id')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const monthEnd   = format(endOfMonth(new Date()), 'yyyy-MM-dd');

  const { data: todaySales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['gm-today-sales', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_sales')
        .select('*')
        .eq('date', today);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: todayPurchases = [] } = useQuery({
    queryKey: ['gm-today-purchases', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_invoices')
        .select('id, total_amount, date')
        .eq('date', today);
      if (error) return [];
      return data || [];
    },
  });

  const { data: todayExpenses = [] } = useQuery({
    queryKey: ['gm-today-expenses', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, amount, date, category_id')
        .eq('date', today);
      if (error) return [];
      return data || [];
    },
  });

  const { data: monthExpenses = [] } = useQuery({
    queryKey: ['gm-month-expenses', monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, amount, date, category_id')
        .gte('date', monthStart)
        .lte('date', monthEnd);
      if (error) return [];
      return data || [];
    },
  });

  const { data: expenseCategories = [] } = useQuery({
    queryKey: ['gm-expense-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_categories').select('id, is_fixed').limit(200);
      if (error) return [];
      return data || [];
    },
    staleTime: 300000,
  });

  const { data: pendingApprovals = [] } = useQuery({
    queryKey: ['gm-pending-approvals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('erp_memberships')
        .select('id, full_name, role, email, created_at, branch_id')
        .eq('status', 'pending')
        .neq('role', 'owner')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const todayMetrics = useMemo(() => {
    const taggedToday   = tagExpensesWithCategories(todayExpenses, expenseCategories);
    const taggedMonthly = tagExpensesWithCategories(monthExpenses, expenseCategories);
    return calculateERPAccounting({
      sales: todaySales,
      purchases: todayPurchases,
      periodExpenses: taggedToday,
      monthlyExpenses: taggedMonthly,
      rangeType: 'day',
      daysInPeriod: 1,
      asOfDate: today,
    });
  }, [todaySales, todayPurchases, todayExpenses, monthExpenses, expenseCategories, today]);

  const totalRevenue = todayMetrics.totalSales;
  const totalExpenses = todayMetrics.totalExpenses;
  const totalProfit = todayMetrics.netProfit;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-700 flex items-center justify-center">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">General Manager</p>
              <p className="text-slate-500 text-xs">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-blue-500/30 text-blue-400 text-xs">
              Cross-Branch Access
            </Badge>
            <Button variant="ghost" size="sm" onClick={logout} className="text-slate-400 hover:text-white">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-black text-white">GM Command Center</h1>
          <p className="text-slate-400 text-sm mt-1">
            {format(new Date(), 'EEEE, MMMM d, yyyy')} · {branches.length} active branches
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Today's Revenue" value={`$${totalRevenue.toLocaleString()}`} icon={DollarSign} color="text-emerald-400" />
          <StatCard title="Today's Expenses" value={`$${totalExpenses.toLocaleString()}`} icon={ShoppingCart} color="text-red-400" />
          <StatCard title="Net Profit" value={`$${totalProfit.toLocaleString()}`} icon={TrendingUp} color="text-blue-400" />
          <StatCard title="Active Branches" value={branches.length} icon={Building2} color="text-violet-400" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Branch Overview */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm font-bold flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-blue-400" />
                Branch Performance Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBranches ? (
                <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
                  <RefreshCw className="w-4 h-4 animate-spin" />Loading…
                </div>
              ) : branches.length === 0 ? (
                <p className="text-slate-500 text-sm py-4">No active branches found.</p>
              ) : (
                <div className="space-y-2">
                  {branches.map(branch => {
                    const branchSales = todaySales.find(s => s.branch_key === branch.branch_key || s.branch_key === branch.id);
                    return (
                      <div key={branch.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-400" />
                          <span className="text-white text-sm font-medium">{branch.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-emerald-400 text-sm font-bold">
                            ${(branchSales?.total_sales || 0).toLocaleString()}
                          </p>
                          <p className="text-slate-500 text-xs">revenue</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Approvals */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Pending Registrations
                {pendingApprovals.length > 0 && (
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs ml-auto">
                    {pendingApprovals.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingApprovals.length === 0 ? (
                <p className="text-slate-500 text-sm py-4">No pending approvals.</p>
              ) : (
                <div className="space-y-2">
                  {pendingApprovals.slice(0, 5).map(reg => (
                    <div key={reg.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                      <div>
                        <p className="text-white text-sm font-medium">{reg.full_name}</p>
                        <p className="text-slate-500 text-xs">{reg.email}</p>
                      </div>
                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs capitalize">
                        {reg.role?.replace('_', ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Navigation Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { label: 'Sales Reports', icon: BarChart3, href: '/reports', color: 'from-blue-600 to-cyan-700' },
            { label: 'Inventory', icon: Package, href: '/inventory', color: 'from-emerald-600 to-teal-700' },
            { label: 'Employees', icon: Users, href: '/employees', color: 'from-amber-600 to-orange-700' },
            { label: 'Financials', icon: DollarSign, href: '/profit-loss', color: 'from-violet-600 to-purple-700' },
            { label: 'Branches', icon: Building2, href: '/branch-management', color: 'from-slate-600 to-slate-700' },
            { label: 'Suppliers', icon: Package, href: '/suppliers', color: 'from-pink-600 to-rose-700' },
            { label: 'Analytics', icon: Activity, href: '/sales-dashboard', color: 'from-sky-600 to-blue-700' },
            { label: 'Approvals', icon: AlertTriangle, href: '/erp-approval-center', color: 'from-amber-600 to-yellow-700' },
          ].map(item => {
            const Icon = item.icon;
            return (
              <a
                key={item.label}
                href={item.href}
                className="flex flex-col items-center gap-2 p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors group"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-slate-300 text-xs font-medium text-center group-hover:text-white">{item.label}</span>
              </a>
            );
          })}
        </div>
      </main>
    </div>
  );
}
