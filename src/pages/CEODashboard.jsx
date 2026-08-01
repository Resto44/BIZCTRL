/**
 * CEODashboard — Executive CEO Dashboard
 * Shows: Today's Revenue, Today's Purchases, Today's Gross Profit, Today's Net Profit,
 *        Monthly Revenue, Monthly Profit, Year Revenue, Year Profit,
 *        Receivable, Payable, Cash Register, Treasury, Inventory Value,
 *        Profit Margin, Expense Ratio, Purchase Ratio
 */
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import {
  calculateSalesRevenue, calculateERPAccounting,
  tagExpensesWithCategories, formatDate,
} from '@/lib/helpers';
import { computeProcurementKPIs } from '@/lib/procurementEngine';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import BranchSelect from '@/components/shared/BranchSelect';
import {
  DollarSign, ShoppingCart, TrendingUp, TrendingDown,
  Wallet, Package, CreditCard, Banknote, Activity,
  BarChart3, Target, Zap, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, startOfYear, endOfYear,
  subDays,
} from 'date-fns';

function KpiCard({ title, value, subtitle, icon: Icon, color = 'blue', trend }) {
  const colorMap = {
    blue:   { bg: 'bg-blue-50 dark:bg-blue-950/50',     icon: 'text-blue-600',    border: 'border-blue-100 dark:border-blue-900/60',    val: 'text-blue-700 dark:text-blue-400' },
    green:  { bg: 'bg-emerald-50 dark:bg-emerald-950/50', icon: 'text-emerald-600', border: 'border-emerald-100 dark:border-emerald-900/60', val: 'text-emerald-700 dark:text-emerald-400' },
    amber:  { bg: 'bg-amber-50 dark:bg-amber-950/50',   icon: 'text-amber-600',   border: 'border-amber-100 dark:border-amber-900/60',   val: 'text-amber-700 dark:text-amber-400' },
    red:    { bg: 'bg-red-50 dark:bg-red-950/50',       icon: 'text-red-600',     border: 'border-red-100 dark:border-red-900/60',      val: 'text-red-700 dark:text-red-400' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-950/50', icon: 'text-purple-600',  border: 'border-purple-100 dark:border-purple-900/60', val: 'text-purple-700 dark:text-purple-400' },
    indigo: { bg: 'bg-indigo-50 dark:bg-indigo-950/50', icon: 'text-indigo-600',  border: 'border-indigo-100 dark:border-indigo-900/60', val: 'text-indigo-700 dark:text-indigo-400' },
    orange: { bg: 'bg-orange-50 dark:bg-orange-950/50', icon: 'text-orange-600',  border: 'border-orange-100 dark:border-orange-900/60', val: 'text-orange-700 dark:text-orange-400' },
    cyan:   { bg: 'bg-cyan-50 dark:bg-cyan-950/50',     icon: 'text-cyan-600',    border: 'border-cyan-100 dark:border-cyan-900/60',    val: 'text-cyan-700 dark:text-cyan-400' },
    slate:  { bg: 'bg-slate-50 dark:bg-slate-900/50',   icon: 'text-slate-600',   border: 'border-slate-200 dark:border-slate-700',     val: 'text-slate-700 dark:text-slate-300' },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <Card className={`border ${c.border} transition-all duration-200`}>
      <CardContent className="p-3.5">
        <div className="flex items-start justify-between mb-2">
          <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center`}>
            <Icon className={`w-4 h-4 ${c.icon}`} />
          </div>
          {trend !== undefined && (
            <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
        <p className={`font-black text-lg leading-tight ${c.val}`}>{value}</p>
        <p className="text-[11px] font-medium text-muted-foreground mt-0.5 leading-tight">{title}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function SectionTitle({ children }) {
  return (
    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-4 mb-2">{children}</p>
  );
}

export default function CEODashboard() {
  const { currency } = useLanguage();
  const { activeRestaurant } = useTenant();
  const [branch, setBranch] = useState('all');

  const fmt = (n) => `${currency}${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fmtPct = (n) => `${(n || 0).toFixed(1)}%`;

  const today      = format(new Date(), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const monthEnd   = format(endOfMonth(new Date()), 'yyyy-MM-dd');
  const yearStart  = format(startOfYear(new Date()), 'yyyy-MM-dd');
  const yearEnd    = format(endOfYear(new Date()), 'yyyy-MM-dd');

  const enabled = !!activeRestaurant?.id;
  const orgFilter = activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : null;

  const branchFilter = (arr, field = 'branch') =>
    branch === 'all' ? arr : arr.filter(r => r[field] === branch);

  // ── Data Queries ─────────────────────────────────────────────────────────────
  const { data: todaySales = [], isLoading: loadingTodaySales } = useQuery({
    queryKey: ['ceo_sales_today', orgFilter, today, branch],
    queryFn: () => base44.entities.DailySales.filter({ ...(orgFilter || {}), date: today }, '-date', 100),
    staleTime: 15000, enabled,
  });

  const { data: monthSales = [], isLoading: loadingMonthSales } = useQuery({
    queryKey: ['ceo_sales_month', orgFilter, monthStart, branch],
    queryFn: () => base44.entities.DailySales.filter(orgFilter || {}, '-date', 1000),
    staleTime: 60000, enabled,
    select: (data) => data.filter(s => s.date >= monthStart && s.date <= monthEnd),
  });

  const { data: yearSales = [], isLoading: loadingYearSales } = useQuery({
    queryKey: ['ceo_sales_year', orgFilter, yearStart, branch],
    queryFn: () => base44.entities.DailySales.filter(orgFilter || {}, '-date', 5000),
    staleTime: 120000, enabled,
    select: (data) => data.filter(s => s.date >= yearStart && s.date <= yearEnd),
  });

  const { data: monthPurchases = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ['ceo_purchases_month', activeRestaurant?.id, monthStart, branch],
    queryFn: async () => {
      if (!activeRestaurant?.id) return [];
      const { data, error } = await supabase
        .from('supplier_invoices')
        .select('*')
        .eq('restaurant_id', activeRestaurant.id)
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .in('approval_status', ['approved', 'auto_approved'])
        .order('date', { ascending: false })
        .limit(1000);
      if (error) return [];
      return data || [];
    },
    staleTime: 60000, enabled,
  });

  const { data: yearPurchases = [] } = useQuery({
    queryKey: ['ceo_purchases_year', activeRestaurant?.id, yearStart, branch],
    queryFn: async () => {
      if (!activeRestaurant?.id) return [];
      const { data, error } = await supabase
        .from('supplier_invoices')
        .select('*')
        .eq('restaurant_id', activeRestaurant.id)
        .gte('date', yearStart)
        .lte('date', yearEnd)
        .in('approval_status', ['approved', 'auto_approved'])
        .order('date', { ascending: false })
        .limit(5000);
      if (error) return [];
      return data || [];
    },
    staleTime: 120000, enabled,
  });

  const { data: allSupplierInvoices = [] } = useQuery({
    queryKey: ['ceo_all_invoices', activeRestaurant?.id],
    queryFn: async () => {
      if (!activeRestaurant?.id) return [];
      const { data, error } = await supabase
        .from('supplier_invoices')
        .select('*')
        .eq('restaurant_id', activeRestaurant.id)
        .order('date', { ascending: false })
        .limit(2000);
      if (error) return [];
      return data || [];
    },
    staleTime: 30000, enabled,
  });

  const { data: monthExpenses = [] } = useQuery({
    queryKey: ['ceo_expenses_month', orgFilter, monthStart, branch],
    queryFn: () => base44.entities.Expense.filter(orgFilter || {}, '-date', 500),
    staleTime: 60000, enabled,
    select: (data) => data.filter(e => e.date >= monthStart && e.date <= monthEnd),
  });

  const { data: yearExpenses = [] } = useQuery({
    queryKey: ['ceo_expenses_year', orgFilter, yearStart, branch],
    queryFn: () => base44.entities.Expense.filter(orgFilter || {}, '-date', 2000),
    staleTime: 120000, enabled,
    select: (data) => data.filter(e => e.date >= yearStart && e.date <= yearEnd),
  });

  const { data: expenseCategories = [] } = useQuery({
    queryKey: ['ceo_exp_cats', activeRestaurant?.id],
    queryFn: () => base44.entities.ExpenseCategory
      ? base44.entities.ExpenseCategory.filter(
          activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : {}, 'sort_order', 500)
      : Promise.resolve([]),
    staleTime: 300000, enabled,
  });

  const { data: debtRecords = [] } = useQuery({
    queryKey: ['ceo_debts', orgFilter],
    queryFn: () => base44.entities.DebtRecord.filter(orgFilter || {}, '-date', 500),
    staleTime: 30000, enabled,
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['ceo_inventory', orgFilter],
    queryFn: () => base44.entities.Inventory.filter(orgFilter || {}, 'product_name', 500),
    staleTime: 60000, enabled,
  });

  const { data: walletTransactions = [] } = useQuery({
    queryKey: ['ceo_wallet', orgFilter],
    queryFn: () => base44.entities.WalletTransaction.filter(orgFilter || {}, '-transaction_date', 1000),
    staleTime: 30000, enabled,
  });

  // ── Calculations ─────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const bTodaySales  = branchFilter(todaySales);
    const bMonthSales  = branchFilter(monthSales);
    const bYearSales   = branchFilter(yearSales);
    const bMonthPurch  = branchFilter(monthPurchases);
    const bYearPurch   = branchFilter(yearPurchases);
    const bMonthExp    = branchFilter(monthExpenses, 'branch_key');
    const bYearExp     = branchFilter(yearExpenses, 'branch_key');
    const bInvoices    = branchFilter(allSupplierInvoices);
    const bInventory   = branchFilter(inventory);
    const bWallet      = branchFilter(walletTransactions);
    const bDebts       = branchFilter(debtRecords);

    // Today
    const todayRevenue = bTodaySales.reduce((s, r) => s + (calculateSalesRevenue(r, [])?.total || 0), 0);
    const todayPurchases = bMonthPurch.filter(p => p.date === today).reduce((s, p) => s + (Number(p.total_amount) || 0), 0);
    const todayGrossProfit = todayRevenue - todayPurchases;
    const taggedTodayExp = tagExpensesWithCategories(
      branchFilter(monthExpenses.filter(e => e.date === today), 'branch_key'),
      expenseCategories
    );
    const todayExpTotal = taggedTodayExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const todayNetProfit = todayGrossProfit - todayExpTotal;

    // Latest sale for cash register
    const latestSale = bTodaySales.length > 0
      ? bTodaySales.reduce((latest, s) =>
          (!latest || (s.created_date || s.date) > (latest.created_date || latest.date)) ? s : latest, null)
      : null;
    const cashRegister = latestSale
      ? (Number(latestSale.closing_cash) || Number(latestSale.restaurant_cash) || Number(latestSale.cash) || 0)
      : 0;

    // Monthly
    const monthlyRevenue = bMonthSales.reduce((s, r) => s + (calculateSalesRevenue(r, [])?.total || 0), 0);
    const monthlyPurchases = bMonthPurch.reduce((s, p) => s + (Number(p.total_amount) || 0), 0);
    const taggedMonthExp = tagExpensesWithCategories(bMonthExp, expenseCategories);
    const monthlyExpenses = taggedMonthExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const monthlyGrossProfit = monthlyRevenue - monthlyPurchases;
    const monthlyProfit = monthlyGrossProfit - monthlyExpenses;

    // Yearly
    const yearRevenue = bYearSales.reduce((s, r) => s + (calculateSalesRevenue(r, [])?.total || 0), 0);
    const yearPurchasesTotal = bYearPurch.reduce((s, p) => s + (Number(p.total_amount) || 0), 0);
    const taggedYearExp = tagExpensesWithCategories(bYearExp, expenseCategories);
    const yearExpTotal = taggedYearExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const yearGrossProfit = yearRevenue - yearPurchasesTotal;
    const yearProfit = yearGrossProfit - yearExpTotal;

    // Ratios (monthly basis)
    const profitMargin = monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue) * 100 : 0;
    const expenseRatio = monthlyRevenue > 0 ? (monthlyExpenses / monthlyRevenue) * 100 : 0;
    const purchaseRatio = monthlyRevenue > 0 ? (monthlyPurchases / monthlyRevenue) * 100 : 0;

    // Receivable / Payable
    const receivable = bDebts
      .filter(d => d.type === 'receivable' && d.status !== 'paid' && d.status !== 'written_off')
      .reduce((s, d) => s + (Number(d.remaining_amount) || 0), 0);

    const payableKpis = computeProcurementKPIs(bInvoices, []);
    const payable = payableKpis.outstandingPayables;

    // Treasury (wallet)
    const cashIn  = bWallet.filter(t => t.direction === 'in').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const cashOut = bWallet.filter(t => t.direction === 'out').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const treasury = cashIn - cashOut;

    // Inventory value
    const inventoryValue = bInventory.reduce((s, item) =>
      s + ((item.quantity || 0) * (item.unit_cost || item.avg_cost || item.cost_price || 0)), 0);

    return {
      todayRevenue, todayPurchases, todayGrossProfit, todayNetProfit,
      monthlyRevenue, monthlyProfit,
      yearRevenue, yearProfit,
      receivable, payable, cashRegister, treasury, inventoryValue,
      profitMargin, expenseRatio, purchaseRatio,
    };
  }, [todaySales, monthSales, yearSales, monthPurchases, yearPurchases, monthExpenses, yearExpenses,
      expenseCategories, debtRecords, allSupplierInvoices, inventory, walletTransactions, branch, today]);

  const isLoading = loadingTodaySales || loadingMonthSales || loadingYearSales || loadingPurchases;

  return (
    <div className="space-y-5 pb-20">
      <PageHeader title="CEO Dashboard" />

      <BranchSelect value={branch} onChange={setBranch} includeAll />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 16 }).map((_, i) => (
            <Card key={i} className="border border-border/50">
              <CardContent className="p-4">
                <div className="h-4 w-24 bg-muted rounded mb-3 animate-pulse" />
                <div className="h-7 w-32 bg-muted rounded mb-1 animate-pulse" />
                <div className="h-3 w-20 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <SectionTitle>Today</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard title="Today's Revenue" value={fmt(kpis.todayRevenue)} icon={DollarSign} color="blue" subtitle="All sales today" />
            <KpiCard title="Today's Purchases" value={fmt(kpis.todayPurchases)} icon={ShoppingCart} color="amber" subtitle="Approved invoices" />
            <KpiCard title="Today's Gross Profit" value={fmt(kpis.todayGrossProfit)} icon={TrendingUp} color={kpis.todayGrossProfit >= 0 ? 'green' : 'red'} subtitle="Revenue − Purchases" />
            <KpiCard title="Today's Net Profit" value={fmt(kpis.todayNetProfit)} icon={Activity} color={kpis.todayNetProfit >= 0 ? 'purple' : 'red'} subtitle="Gross − Expenses" />
          </div>

          <SectionTitle>Monthly</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard title="Monthly Revenue" value={fmt(kpis.monthlyRevenue)} icon={DollarSign} color="blue" subtitle="This month" />
            <KpiCard title="Monthly Profit" value={fmt(kpis.monthlyProfit)} icon={TrendingUp} color={kpis.monthlyProfit >= 0 ? 'green' : 'red'} subtitle="Net this month" />
          </div>

          <SectionTitle>Year to Date</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard title="Year Revenue" value={fmt(kpis.yearRevenue)} icon={DollarSign} color="indigo" subtitle="YTD" />
            <KpiCard title="Year Profit" value={fmt(kpis.yearProfit)} icon={TrendingUp} color={kpis.yearProfit >= 0 ? 'green' : 'red'} subtitle="YTD net profit" />
          </div>

          <SectionTitle>Financial Position</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard title="Receivable" value={fmt(kpis.receivable)} icon={CreditCard} color="cyan" subtitle="Open customer debts" />
            <KpiCard title="Payable" value={fmt(kpis.payable)} icon={Banknote} color="orange" subtitle="Outstanding to suppliers" />
            <KpiCard title="Cash Register" value={fmt(kpis.cashRegister)} icon={Wallet} color="green" subtitle="Latest closing cash" />
            <KpiCard title="Treasury" value={fmt(kpis.treasury)} icon={Wallet} color="blue" subtitle="Wallet balance" />
            <KpiCard title="Inventory Value" value={fmt(kpis.inventoryValue)} icon={Package} color="amber" subtitle="Cost × quantity" />
          </div>

          <SectionTitle>Ratios (Monthly)</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard title="Profit Margin" value={`${kpis.profitMargin.toFixed(1)}%`} icon={BarChart3} color="purple" subtitle="Net / Sales" />
            <KpiCard title="Expense Ratio" value={`${kpis.expenseRatio.toFixed(1)}%`} icon={Target} color="orange" subtitle="Exp / Sales" />
            <KpiCard title="Purchase Ratio" value={`${kpis.purchaseRatio.toFixed(1)}%`} icon={Zap} color="red" subtitle="Purch / Sales" />
          </div>
        </>
      )}
    </div>
  );
}
