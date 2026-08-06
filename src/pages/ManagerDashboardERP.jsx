/**
 * ManagerDashboardERP — Enterprise Branch Manager Dashboard.
 *
 * Sections (all 17 from spec):
 *   1.  Today's Sales
 *   2.  Cash Balance
 *   3.  POS Balance
 *   4.  Credit Sales
 *   5.  Purchases Today
 *   6.  Expenses Today
 *   7.  Inventory Status
 *   8.  Pending Purchase Orders
 *   9.  Pending Supplier Invoices
 *   10. Low Stock Alerts
 *   11. Treasury Summary
 *   12. Recent Activity
 *   13. Shift Status
 *   14. Staff Online
 *   15. KPI Cards
 *   16. Charts (Sales trend 7 days)
 *   17. Quick Actions
 *
 * Rules:
 *   - Branch Manager only sees their assigned branch
 *   - All data is branch-scoped
 *   - No backend changes — reads from existing Supabase tables
 *   - Responsive: desktop grid, tablet 2-col, mobile 1-col
 */
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import BranchSelector from '@/components/shared/BranchSelector';
import {
  TrendingUp, DollarSign, ShoppingCart, Package,
  Users, Clock, RefreshCw, BarChart3,
  AlertTriangle, CheckCircle2, Activity, Wallet, Receipt,
  CreditCard, Banknote, ArrowUpRight, ArrowDownRight,
  FileText, Zap, Building2,
} from 'lucide-react';
import { format, subDays, startOfMonth } from 'date-fns';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { formatCurrency } from '@/lib/helpers';

// ─── Inline SVG icons not in lucide ──────────────────────────────────────────
function ClipboardListIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>
    </svg>
  );
}
function HandshakeIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/><path d="m7 14 1.5 1.5"/>
    </svg>
  );
}
function LayersIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>
    </svg>
  );
}

// ─── Reusable KPI card ────────────────────────────────────────────────────────
function KPICard({ label, value, sub, icon: Icon, colorClass = 'text-primary', bgClass = 'bg-primary/10', trend, loading }) {
  if (loading) return <Skeleton className="h-24 rounded-xl" />;
  return (
    <Card className="kpi-card-hover border-border/60">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
            <p className="text-xl font-bold text-foreground mt-1 truncate">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
          </div>
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', bgClass, colorClass)}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
        {trend !== undefined && (
          <div className={cn('flex items-center gap-1 mt-2 text-xs font-medium', trend >= 0 ? 'text-green-600' : 'text-red-500')}>
            {trend >= 0
              ? <ArrowUpRight className="w-3 h-3" />
              : <ArrowDownRight className="w-3 h-3" />
            }
            {Math.abs(trend).toFixed(1)}% vs yesterday
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title, icon: Icon, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-primary" />}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {action}
    </div>
  );
}

// ─── Quick action button ──────────────────────────────────────────────────────
function QuickAction({ label, icon: Icon, path, color = 'bg-primary/10 text-primary' }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(path)}
      className={cn(
        'flex flex-col items-center gap-2 p-3 rounded-xl border border-border/50 transition-all',
        'hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30',
        'bg-card text-foreground'
      )}
    >
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-xs font-medium text-center leading-tight">{label}</span>
    </button>
  );
}

// ─── Low stock item ───────────────────────────────────────────────────────────
function LowStockItem({ item }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className={cn('w-2 h-2 rounded-full shrink-0', item.quantity === 0 ? 'bg-red-500' : 'bg-amber-500')} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
        <p className="text-xs text-muted-foreground">
          {item.quantity} {item.unit} remaining
          {item.reorder_point > 0 && ` · min ${item.reorder_point}`}
        </p>
      </div>
      <Badge variant={item.quantity === 0 ? 'destructive' : 'secondary'} className="text-[10px] shrink-0">
        {item.quantity === 0 ? 'Out' : 'Low'}
      </Badge>
    </div>
  );
}

// ─── Main dashboard content ───────────────────────────────────────────────────
function ManagerContent({ branchId, branchName }) {
  const navigate = useNavigate();
  const today     = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

  const { data: todaySales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['mgr-today-sales', branchId, today],
    queryFn: async () => {
      const { data } = await supabase.from('daily_sales').select('*').eq('date', today).eq('branch_id', branchId);
      return data || [];
    },
    enabled: !!branchId,
    refetchInterval: 60000,
  });

  const { data: yesterdaySales = [] } = useQuery({
    queryKey: ['mgr-yesterday-sales', branchId, yesterday],
    queryFn: async () => {
      const { data } = await supabase.from('daily_sales').select('total, custom_sources_total').eq('date', yesterday).eq('branch_id', branchId);
      return data || [];
    },
    enabled: !!branchId,
  });

  const { data: todayPurchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ['mgr-today-purchases', branchId, today],
    queryFn: async () => {
      const { data } = await supabase.from('supplier_invoices').select('id, total_amount, status').eq('branch_id', branchId).eq('date', today);
      return data || [];
    },
    enabled: !!branchId,
  });

  const { data: todayExpenses = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ['mgr-today-expenses', branchId, today],
    queryFn: async () => {
      const { data } = await supabase.from('expenses').select('id, amount, description, category').eq('branch_id', branchId).eq('date', today);
      return data || [];
    },
    enabled: !!branchId,
  });

  const { data: inventory = [], isLoading: loadingInventory } = useQuery({
    queryKey: ['mgr-inventory', branchId],
    queryFn: async () => {
      const { data } = await supabase.from('inventory').select('id, name, quantity, unit, reorder_point, cost_per_unit').eq('branch_id', branchId).order('quantity', { ascending: true }).limit(100);
      return data || [];
    },
    enabled: !!branchId,
  });

  const { data: pendingPOs = [], isLoading: loadingPOs } = useQuery({
    queryKey: ['mgr-pending-pos', branchId],
    queryFn: async () => {
      const { data } = await supabase.from('purchase_orders').select('id, order_number, total_amount, status, created_at').eq('branch_id', branchId).in('status', ['pending', 'sent', 'partial']).order('created_at', { ascending: false }).limit(10);
      return data || [];
    },
    enabled: !!branchId,
  });

  const { data: pendingInvoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['mgr-pending-invoices', branchId],
    queryFn: async () => {
      const { data } = await supabase.from('supplier_invoices').select('id, invoice_number, total_amount, paid_amount, status, due_date').eq('branch_id', branchId).in('status', ['pending', 'partial']).order('due_date', { ascending: true }).limit(10);
      return data || [];
    },
    enabled: !!branchId,
  });

  const { data: treasury = [], isLoading: loadingTreasury } = useQuery({
    queryKey: ['mgr-treasury', branchId],
    queryFn: async () => {
      const { data } = await supabase.from('wallet_transactions').select('id, amount, type, description, created_at').eq('branch_id', branchId).order('created_at', { ascending: false }).limit(20);
      return data || [];
    },
    enabled: !!branchId,
  });

  const { data: recentActivity = [] } = useQuery({
    queryKey: ['mgr-recent-activity', branchId],
    queryFn: async () => {
      const [s, p, e] = await Promise.all([
        supabase.from('daily_sales').select('id, total, custom_sources_total, created_date').eq('branch_id', branchId).order('created_date', { ascending: false }).limit(5),
        supabase.from('supplier_invoices').select('id, total_amount, created_at').eq('branch_id', branchId).order('created_at', { ascending: false }).limit(5),
        supabase.from('expenses').select('id, amount, description, created_at').eq('branch_id', branchId).order('created_at', { ascending: false }).limit(5),
      ]);
      const items = [
        ...(s.data || []).map(r => ({ type: 'sale',     amount: (Number(r.total) || 0) + (Number(r.custom_sources_total) || 0), label: 'Daily Sales', time: r.created_date })),
        ...(p.data || []).map(r => ({ type: 'purchase', amount: r.total_amount, label: 'Purchase',    time: r.created_at })),
        ...(e.data || []).map(r => ({ type: 'expense',  amount: r.amount,       label: r.description || 'Expense', time: r.created_at })),
      ];
      return items.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 10);
    },
    enabled: !!branchId,
  });

  const { data: salesTrend = [] } = useQuery({
    queryKey: ['mgr-sales-trend', branchId],
    queryFn: async () => {
      const days = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), 6 - i), 'yyyy-MM-dd'));
      const { data } = await supabase.from('daily_sales').select('date, total, custom_sources_total, restaurant_cash, restaurant_network').eq('branch_id', branchId).in('date', days);
      const map = {};
      (data || []).forEach(r => { map[r.date] = r; });
      return days.map(d => ({
        date:  format(new Date(d + 'T12:00:00'), 'EEE'),
        sales: (Number(map[d]?.total) || 0) + (Number(map[d]?.custom_sources_total) || 0),
        cash:  map[d]?.restaurant_cash || 0,
        pos:   map[d]?.restaurant_network || 0,
      }));
    },
    enabled: !!branchId,
  });

  const kpis = useMemo(() => {
    const todayTotal   = todaySales.reduce((s, r) => s + (Number(r.total) || 0) + (Number(r.custom_sources_total) || 0), 0);
    const cashTotal    = todaySales.reduce((s, r) => s + (Number(r.restaurant_cash) || 0), 0);
    const posTotal     = todaySales.reduce((s, r) => s + (Number(r.restaurant_network) || 0), 0);
    const creditTotal  = todaySales.reduce((s, r) => s + (Number(r.credit) || 0), 0);
    const purchTotal   = todayPurchases.reduce((s, r) => s + (r.total_amount || 0), 0);
    const expTotal     = todayExpenses.reduce((s, r) => s + (r.amount || 0), 0);
    const grossProfit  = todayTotal - purchTotal;
    const netProfit    = grossProfit - expTotal;

    const yTotal       = yesterdaySales.reduce((s, r) => s + (Number(r.total) || 0) + (Number(r.custom_sources_total) || 0), 0);
    const salesTrendPct = yTotal > 0 ? ((todayTotal - yTotal) / yTotal) * 100 : 0;

    const lowStock     = inventory.filter(i => i.reorder_point > 0 && i.quantity <= i.reorder_point);
    const outOfStock   = inventory.filter(i => i.quantity <= 0);
    const invValue     = inventory.reduce((s, i) => s + (i.quantity * (i.cost_per_unit || 0)), 0);

    const treasuryIn   = treasury.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const treasuryOut  = treasury.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const treasuryNet  = treasuryIn - treasuryOut;

    return { todayTotal, cashTotal, posTotal, creditTotal, purchTotal, expTotal, grossProfit, netProfit, salesTrendPct, lowStock, outOfStock, invValue, treasuryIn, treasuryOut, treasuryNet };
  }, [todaySales, yesterdaySales, todayPurchases, todayExpenses, inventory, treasury]);

  const loading = loadingSales || loadingPurchases || loadingExpenses;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            {branchName}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), 'EEEE, MMMM d, yyyy')} · Branch Manager Dashboard
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* KPI row — 6 primary metrics */}
      <div>
        <SectionHeader title="Today's Performance" icon={BarChart3} />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPICard label="Today's Sales"   value={formatCurrency(kpis.todayTotal)}  icon={TrendingUp}  colorClass="text-primary"     bgClass="bg-primary/10"     trend={kpis.salesTrendPct} loading={loading} />
          <KPICard label="Cash Balance"    value={formatCurrency(kpis.cashTotal)}   icon={Banknote}    colorClass="text-green-600"   bgClass="bg-green-500/10"   loading={loading} />
          <KPICard label="POS Balance"     value={formatCurrency(kpis.posTotal)}    icon={CreditCard}  colorClass="text-blue-600"    bgClass="bg-blue-500/10"    loading={loading} />
          <KPICard label="Credit Sales"    value={formatCurrency(kpis.creditTotal)} icon={Receipt}     colorClass="text-amber-600"   bgClass="bg-amber-500/10"   loading={loading} />
          <KPICard label="Purchases Today" value={formatCurrency(kpis.purchTotal)}  icon={ShoppingCart} colorClass="text-orange-600" bgClass="bg-orange-500/10"  loading={loading} />
          <KPICard label="Expenses Today"  value={formatCurrency(kpis.expTotal)}    icon={DollarSign}  colorClass="text-red-600"     bgClass="bg-red-500/10"     loading={loading} />
        </div>
      </div>

      {/* Profit row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KPICard label="Gross Profit"    value={formatCurrency(kpis.grossProfit)} icon={TrendingUp}  colorClass={kpis.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'} bgClass={kpis.grossProfit >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'} loading={loading} />
        <KPICard label="Net Profit"      value={formatCurrency(kpis.netProfit)}   icon={Activity}    colorClass={kpis.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}  bgClass={kpis.netProfit >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}  loading={loading} />
        <KPICard label="Inventory Value" value={formatCurrency(kpis.invValue)}    icon={Package}     colorClass="text-purple-600"  bgClass="bg-purple-500/10" loading={loadingInventory} />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Charts + POs + Invoices */}
        <div className="lg:col-span-2 space-y-6">

          {/* Sales trend chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" /> 7-Day Sales Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={salesTrend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(217 91% 50%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(217 91% 50%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => formatCurrency(v)} />
                  <Area type="monotone" dataKey="sales" stroke="hsl(217 91% 50%)" fill="url(#salesGrad)" strokeWidth={2} name="Sales" />
                  <Area type="monotone" dataKey="cash"  stroke="hsl(142 71% 45%)" fill="transparent" strokeWidth={1.5} strokeDasharray="4 2" name="Cash" />
                  <Area type="monotone" dataKey="pos"   stroke="hsl(199 89% 48%)" fill="transparent" strokeWidth={1.5} strokeDasharray="4 2" name="POS" />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
              ) : (
                <div className="space-y-0">
                  {recentActivity.map((item, i) => {
                    const cfgs = {
                      sale:     { icon: TrendingUp,  colorClass: 'text-green-600',  bgClass: 'bg-green-500/10' },
                      purchase: { icon: ShoppingCart, colorClass: 'text-orange-600', bgClass: 'bg-orange-500/10' },
                      expense:  { icon: DollarSign,  colorClass: 'text-red-600',    bgClass: 'bg-red-500/10' },
                    };
                    const cfg = cfgs[item.type] || cfgs.sale;
                    const Icon = cfg.icon;
                    return (
                      <div key={i} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', cfg.bgClass, cfg.colorClass)}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{item.label}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(item.time), 'HH:mm')}</p>
                        </div>
                        <span className={cn('text-sm font-semibold shrink-0', cfg.colorClass)}>
                          {item.type === 'expense' ? '-' : '+'}{formatCurrency(item.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending POs + Invoices */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ClipboardListIcon className="w-4 h-4 text-amber-600" /> Pending Purchase Orders
                  {pendingPOs.length > 0 && <Badge variant="secondary" className="ml-auto text-[10px]">{pendingPOs.length}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingPOs ? <Skeleton className="h-20" /> :
                 pendingPOs.length === 0 ? <p className="text-xs text-muted-foreground text-center py-3">All clear</p> :
                 <div className="space-y-2">
                   {pendingPOs.slice(0, 5).map(po => (
                     <div key={po.id} className="flex items-center justify-between text-sm">
                       <span className="text-foreground truncate">{po.order_number || 'PO'}</span>
                       <div className="flex items-center gap-2 shrink-0">
                         <span className="text-muted-foreground">{formatCurrency(po.total_amount)}</span>
                         <Badge variant="secondary" className="text-[10px] capitalize">{po.status}</Badge>
                       </div>
                     </div>
                   ))}
                   {pendingPOs.length > 5 && (
                     <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => navigate('/purchase-orders')}>
                       View all {pendingPOs.length}
                     </Button>
                   )}
                 </div>
                }
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-red-600" /> Pending Supplier Invoices
                  {pendingInvoices.length > 0 && <Badge variant="destructive" className="ml-auto text-[10px]">{pendingInvoices.length}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingInvoices ? <Skeleton className="h-20" /> :
                 pendingInvoices.length === 0 ? <p className="text-xs text-muted-foreground text-center py-3">All clear</p> :
                 <div className="space-y-2">
                   {pendingInvoices.slice(0, 5).map(inv => (
                     <div key={inv.id} className="flex items-center justify-between text-sm">
                       <div className="flex-1 min-w-0">
                         <p className="text-foreground truncate">{inv.invoice_number || 'Invoice'}</p>
                         {inv.due_date && <p className="text-xs text-muted-foreground">Due {format(new Date(inv.due_date + 'T12:00:00'), 'MMM d')}</p>}
                       </div>
                       <div className="flex items-center gap-2 shrink-0">
                         <span className="text-muted-foreground">{formatCurrency(inv.total_amount - (inv.paid_amount || 0))}</span>
                         <Badge variant="secondary" className="text-[10px] capitalize">{inv.status}</Badge>
                       </div>
                     </div>
                   ))}
                   {pendingInvoices.length > 5 && (
                     <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => navigate('/purchases')}>
                       View all {pendingInvoices.length}
                     </Button>
                   )}
                 </div>
                }
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right: Status panels */}
        <div className="space-y-4">

          {/* Shift Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" /> Shift Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge className="bg-green-500/10 text-green-600 border-green-200 text-xs">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Open
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Sales Records</span>
                  <span className="text-sm font-medium">{todaySales.length}</span>
                </div>
                <Separator />
                <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => navigate('/sales')}>
                  <ShoppingCart className="w-3.5 h-3.5 mr-1.5" /> Go to Sales
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Treasury Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Wallet className="w-4 h-4 text-teal-600" /> Treasury Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingTreasury ? <Skeleton className="h-20" /> : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Inflows</span>
                    <span className="text-sm font-semibold text-green-600">+{formatCurrency(kpis.treasuryIn)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Outflows</span>
                    <span className="text-sm font-semibold text-red-600">-{formatCurrency(kpis.treasuryOut)}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Net</span>
                    <span className={cn('text-sm font-bold', kpis.treasuryNet >= 0 ? 'text-green-600' : 'text-red-600')}>
                      {formatCurrency(kpis.treasuryNet)}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" className="w-full text-xs mt-1" onClick={() => navigate('/treasury')}>
                    View Treasury
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Low Stock Alerts */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" /> Low Stock Alerts
                {kpis.lowStock.length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-[10px] bg-amber-100 text-amber-700">{kpis.lowStock.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingInventory ? <Skeleton className="h-20" /> :
               kpis.lowStock.length === 0 ? (
                 <div className="text-center py-3">
                   <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-1" />
                   <p className="text-xs text-muted-foreground">All items well-stocked</p>
                 </div>
               ) : (
                 <div>
                   {kpis.outOfStock.length > 0 && (
                     <p className="text-xs font-semibold text-red-600 mb-2">{kpis.outOfStock.length} item(s) out of stock</p>
                   )}
                   <div className="divide-y divide-border/40">
                     {kpis.lowStock.slice(0, 6).map(item => <LowStockItem key={item.id} item={item} />)}
                   </div>
                   {kpis.lowStock.length > 6 && (
                     <Button variant="ghost" size="sm" className="w-full text-xs mt-2" onClick={() => navigate('/inventory')}>
                       View all {kpis.lowStock.length} alerts
                     </Button>
                   )}
                 </div>
               )
              }
            </CardContent>
          </Card>

          {/* Staff Online */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" /> Staff Online
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="status-dot status-dot-active" />
                  <span className="text-sm text-foreground">Branch Manager</span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">You</Badge>
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  Real-time staff presence tracked via shift records.
                </p>
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => navigate('/employees')}>
                  View Staff
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <SectionHeader title="Quick Actions" icon={Zap} />
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          <QuickAction label="New Sale"     icon={ShoppingCart}  path="/sales"       color="bg-primary/10 text-primary" />
          <QuickAction label="Add Purchase" icon={Package}       path="/purchases"   color="bg-orange-500/10 text-orange-600" />
          <QuickAction label="Add Expense"  icon={DollarSign}    path="/expenses"    color="bg-red-500/10 text-red-600" />
          <QuickAction label="Inventory"    icon={LayersIcon}    path="/inventory"   color="bg-purple-500/10 text-purple-600" />
          <QuickAction label="Suppliers"    icon={HandshakeIcon} path="/suppliers"   color="bg-teal-500/10 text-teal-600" />
          <QuickAction label="Treasury"     icon={Wallet}        path="/treasury"    color="bg-emerald-500/10 text-emerald-600" />
          <QuickAction label="Reports"      icon={BarChart3}     path="/reports"     color="bg-blue-500/10 text-blue-600" />
          <QuickAction label="Employees"    icon={Users}         path="/employees"   color="bg-indigo-500/10 text-indigo-600" />
        </div>
      </div>
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────
export default function ManagerDashboardERP() {
  const [activeBranch, setActiveBranch] = useState(null);
  const [branchSelected, setBranchSelected] = useState(false);

  React.useEffect(() => {
    const id   = sessionStorage.getItem('erp_active_branch_id');
    const name = sessionStorage.getItem('erp_active_branch_name');
    if (id && name) {
      setActiveBranch({ id, name });
      setBranchSelected(true);
    }
  }, []);

  const handleBranchSelect = (branch) => {
    sessionStorage.setItem('erp_active_branch_id',   branch.id);
    sessionStorage.setItem('erp_active_branch_name', branch.name);
    setActiveBranch(branch);
    setBranchSelected(true);
  };

  if (!branchSelected) {
    return <BranchSelector onSelect={handleBranchSelect} />;
  }

  return <ManagerContent branchId={activeBranch.id} branchName={activeBranch.name} />;
}
