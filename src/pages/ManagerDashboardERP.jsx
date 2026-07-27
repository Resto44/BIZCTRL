import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import BranchSelector from '@/components/shared/BranchSelector';
import {
  LayoutDashboard, TrendingUp, DollarSign, ShoppingCart, Package,
  Users, Clock, LogOut, RefreshCw, GitBranch, BarChart3,
  ChefHat, Truck, AlertTriangle, CheckCircle2, Activity
} from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { calculateERPAccounting, tagExpensesWithCategories } from '@/lib/helpers';

function StatCard({ title, value, sub, icon: Icon, color = 'text-slate-400' }) {
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
      </CardContent>
    </Card>
  );
}

export default function ManagerDashboardERP() {
  const { user, logout } = useAuth();
  const [activeBranch, setActiveBranch] = useState(null);
  const [branchSelected, setBranchSelected] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');

  // Check if branch is already selected in session
  useEffect(() => {
    const storedBranchId = sessionStorage.getItem('erp_active_branch_id');
    const storedBranchName = sessionStorage.getItem('erp_active_branch_name');
    if (storedBranchId && storedBranchName) {
      setActiveBranch({ id: storedBranchId, name: storedBranchName });
      setBranchSelected(true);
    }
  }, []);

  const handleBranchSelect = (branch) => {
    setActiveBranch(branch);
    setBranchSelected(true);
  };

  // Show branch selector if not yet selected
  if (!branchSelected) {
    return <BranchSelector onSelect={handleBranchSelect} />;
  }

  return <ManagerContent user={user} logout={logout} activeBranch={activeBranch} today={today} />;
}

function ManagerContent({ user, logout, activeBranch, today }) {
  const branchId = activeBranch?.id;

  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const monthEnd   = format(endOfMonth(new Date()), 'yyyy-MM-dd');

  const { data: todaySales = [] } = useQuery({
    queryKey: ['manager-today-sales', branchId, today],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from('daily_sales')
        .select('*')
        .eq('date', today)
        .eq('branch_id', branchId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId,
  });

  const { data: todayPurchases = [] } = useQuery({
    queryKey: ['manager-today-purchases', branchId, today],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from('supplier_invoices')
        .select('id, total_amount, date')
        .eq('branch_id', branchId)
        .eq('date', today);
      if (error) return [];
      return data || [];
    },
    enabled: !!branchId,
  });

  const { data: todayExpenses = [] } = useQuery({
    queryKey: ['manager-today-expenses', branchId, today],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from('expenses')
        .select('id, amount, date, category_id')
        .eq('branch_id', branchId)
        .eq('date', today);
      if (error) return [];
      return data || [];
    },
    enabled: !!branchId,
  });

  const { data: monthExpenses = [] } = useQuery({
    queryKey: ['manager-month-expenses', branchId, monthStart],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from('expenses')
        .select('id, amount, date, category_id')
        .eq('branch_id', branchId)
        .gte('date', monthStart)
        .lte('date', monthEnd);
      if (error) return [];
      return data || [];
    },
    enabled: !!branchId,
  });

  const { data: expenseCategories = [] } = useQuery({
    queryKey: ['manager-expense-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_categories').select('id, is_fixed').limit(200);
      if (error) return [];
      return data || [];
    },
    staleTime: 300000,
  });

  const { data: pendingOrders = [] } = useQuery({
    queryKey: ['manager-pending-orders', branchId],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from('delivery_orders')
        .select('id, status, created_at')
        .eq('branch_id', branchId)
        .in('status', ['pending', 'preparing'])
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId,
    refetchInterval: 30000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['manager-employees', branchId],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, is_active')
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId,
  });

  const { data: lowStock = [] } = useQuery({
    queryKey: ['manager-low-stock', branchId],
    queryFn: async () => {
      if (!branchId) return [];
      const { data, error } = await supabase
        .from('inventory')
        .select('id, product_id, quantity, reorder_level, products(name)')
        .eq('branch_id', branchId)
        .lt('quantity', supabase.raw('reorder_level'))
        .limit(10);
      if (error) return [];
      return data || [];
    },
    enabled: !!branchId,
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
  const netProfit = todayMetrics.netProfit;

  const navItems = [
    { label: 'Sales', icon: BarChart3, href: '/sales', color: 'from-emerald-600 to-teal-700' },
    { label: 'Purchases', icon: ShoppingCart, href: '/purchases', color: 'from-blue-600 to-cyan-700' },
    { label: 'Inventory', icon: Package, href: '/inventory', color: 'from-amber-600 to-orange-700' },
    { label: 'Employees', icon: Users, href: '/employees', color: 'from-violet-600 to-purple-700' },
    { label: 'Payroll', icon: DollarSign, href: '/payroll', color: 'from-pink-600 to-rose-700' },
    { label: 'Kitchen', icon: ChefHat, href: '/kds', color: 'from-red-600 to-rose-700' },
    { label: 'Delivery', icon: Truck, href: '/delivery', color: 'from-sky-600 to-blue-700' },
    { label: 'Reports', icon: BarChart3, href: '/reports', color: 'from-slate-600 to-slate-700' },
    { label: 'Expenses', icon: DollarSign, href: '/expenses', color: 'from-orange-600 to-amber-700' },
    { label: 'Suppliers', icon: Package, href: '/suppliers', color: 'from-teal-600 to-emerald-700' },
    { label: 'Attendance', icon: Clock, href: '/employee-attendance', color: 'from-indigo-600 to-blue-700' },
    { label: 'Cash Register', icon: DollarSign, href: '/cash-register', color: 'from-green-600 to-emerald-700' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center">
              <LayoutDashboard className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">Branch Manager</p>
              <p className="text-slate-500 text-xs">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
              <GitBranch className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-300 text-xs font-medium">{activeBranch?.name}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                sessionStorage.removeItem('erp_active_branch_id');
                sessionStorage.removeItem('erp_active_branch_name');
                window.location.reload();
              }}
              className="text-slate-400 hover:text-white text-xs"
            >
              Switch
            </Button>
            <Button variant="ghost" size="sm" onClick={logout} className="text-slate-400 hover:text-white">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-black text-white">Branch Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            {format(new Date(), 'EEEE, MMMM d, yyyy')} · {activeBranch?.name}
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Today's Revenue" value={`$${totalRevenue.toLocaleString()}`} icon={DollarSign} color="text-emerald-400" />
          <StatCard title="Expenses" value={`$${totalExpenses.toLocaleString()}`} icon={ShoppingCart} color="text-red-400" />
          <StatCard title="Net Profit" value={`$${netProfit.toLocaleString()}`} icon={TrendingUp} color="text-blue-400" />
          <StatCard title="Active Staff" value={employees.length} icon={Users} color="text-violet-400" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Pending Orders */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm font-bold flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Pending Orders
                {pendingOrders.length > 0 && (
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs ml-auto">
                    {pendingOrders.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingOrders.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-400 text-sm py-2">
                  <CheckCircle2 className="w-4 h-4" />All caught up!
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingOrders.slice(0, 5).map(order => (
                    <div key={order.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                      <span className="text-white text-xs font-mono">{order.id.slice(0, 8)}…</span>
                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                        {order.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Low Stock */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Low Stock Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lowStock.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-400 text-sm py-2">
                  <CheckCircle2 className="w-4 h-4" />Stock levels OK
                </div>
              ) : (
                <div className="space-y-2">
                  {lowStock.slice(0, 5).map(item => (
                    <div key={item.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                      <span className="text-white text-xs">{item.products?.name || 'Unknown'}</span>
                      <span className="text-red-400 text-xs font-bold">{item.quantity} left</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm font-bold flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                Branch Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-xs">Staff on duty</span>
                <span className="text-white text-sm font-bold">{employees.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-xs">Pending orders</span>
                <span className="text-amber-400 text-sm font-bold">{pendingOrders.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-xs">Low stock items</span>
                <span className="text-red-400 text-sm font-bold">{lowStock.length}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Navigation Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <a
                key={item.label}
                href={item.href}
                className="flex flex-col items-center gap-2 p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors group"
              >
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <span className="text-slate-400 text-[10px] font-medium text-center group-hover:text-white leading-tight">{item.label}</span>
              </a>
            );
          })}
        </div>
      </main>
    </div>
  );
}
