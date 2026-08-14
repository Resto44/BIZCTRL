import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { formatCurrency } from '@/lib/helpers';
import { calculateTreasuryLedgerBalance } from '@/lib/treasuryAccounts';
import { Card } from '@/components/ui/card';
import { format, addDays, subDays, getDaysInMonth, getDate } from 'date-fns';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Legend
} from 'recharts';
import { AlertTriangle, Info } from 'lucide-react';

const DAYS = 30;

export default function CashflowProjection({ accounts = [], transactions = [] }) {
  const { currency } = useLanguage();
  const [showDetails, setShowDetails] = useState(false);

  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const ninetyDaysAgo = format(subDays(today, 90), 'yyyy-MM-dd');

  const { ownerFilter } = useTenant();
  const { data: sales = [] } = useQuery({ queryKey: ['sales', ownerFilter], queryFn: () => base44.entities.DailySales.filter(ownerFilter, '-date', 1000), staleTime: 120000, enabled: !!ownerFilter.created_by });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses', ownerFilter], queryFn: () => base44.entities.Expense.filter(ownerFilter, '-date', 500), staleTime: 120000, enabled: !!ownerFilter.created_by });
  const { data: employees = [] } = useQuery({ queryKey: ['employees', ownerFilter], queryFn: () => base44.entities.Employee.filter(ownerFilter, 'full_name', 500), staleTime: 300000, enabled: !!ownerFilter.created_by });
  const { data: purchases = [] } = useQuery({ queryKey: ['purchases', ownerFilter], queryFn: () => base44.entities.Purchase.filter(ownerFilter, '-date', 500), staleTime: 120000, enabled: !!ownerFilter.created_by });
  const { data: invoices = [] } = useQuery({ queryKey: ['supplier_invoices', ownerFilter], queryFn: () => base44.entities.SupplierInvoice.filter(ownerFilter, '-date', 200), staleTime: 120000, enabled: !!ownerFilter.created_by });

  const projection = useMemo(() => {
    // ── Historical baseline (last 90 days) ──────────────────────────────
    const recentSales = sales.filter(s => s.date >= ninetyDaysAgo && s.date <= todayStr);
    const recentPurchases = purchases.filter(p => p.date >= ninetyDaysAgo && p.date <= todayStr);
    const recentExpenses = expenses.filter(e => e.date >= ninetyDaysAgo && e.date <= todayStr && e.category !== 'salaries' && e.category !== 'rent');

    // Average daily sales (cash + network)
    const totalHistoricalDays = Math.max(1, recentSales.length > 0 ? 90 : 1);
    const totalCashSales = recentSales.reduce((s, r) => s + (r.cash || 0), 0);
    const totalNetworkSales = recentSales.reduce((s, r) => s + (r.network || 0), 0);
    const avgDailyCash = totalCashSales / totalHistoricalDays;
    const avgDailyNetwork = totalNetworkSales / totalHistoricalDays;
    const avgDailySales = avgDailyCash + avgDailyNetwork;

    // Average daily purchase cost
    const totalPurchaseCost = recentPurchases.reduce((s, p) => s + ((p.qty || 0) * (p.used_price || p.current_price || 0)), 0);
    const avgDailyPurchaseCost = totalPurchaseCost / totalHistoricalDays;

    // Average daily other expenses (non-fixed)
    const totalOtherExpenses = recentExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const avgDailyOtherExpenses = totalOtherExpenses / totalHistoricalDays;

    // ── Fixed recurring costs ────────────────────────────────────────────
    const monthlyRent = expenses.filter(e => e.category === 'rent').slice(0, 6)
      .reduce((s, e) => s + (e.amount || 0), 0) / Math.max(1,
        new Set(expenses.filter(e => e.category === 'rent').map(e => e.date?.slice(0, 7))).size || 1
      );
    const monthlyDaySalaries = employees.filter(e => e.is_active !== false).reduce((s, e) => s + (e.base_salary || 0), 0);
    const dailyFixedCost = (monthlyRent + monthlyDaySalaries) / 30;

    // ── Pending AP outflows from supplier invoices ──────────────────────
    const pendingInvoices = invoices.filter(inv => inv.status === 'pending' || inv.status === 'partial')
      .map(inv => ({
        date: inv.due_date || inv.date,
        amount: (inv.amount || 0) - (inv.paid_amount || 0),
      }));

    // ── Opening balance (current wallet balance) ─────────────────────────
    const openingBalance = calculateTreasuryLedgerBalance(accounts, transactions);

    // ── Weekday adjustment factor (Saturday+Friday slower) ───────────────
    const DOW_FACTOR = [1.0, 1.05, 1.0, 0.95, 0.9, 1.15, 1.1]; // Sun–Sat

    // ── Build 30-day projection ──────────────────────────────────────────
    let balance = openingBalance;
    const days = [];

    for (let i = 1; i <= DAYS; i++) {
      const date = addDays(today, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const dow = date.getDay();
      const dayFactor = DOW_FACTOR[dow];
      const dayOfMonth = getDate(date);

      // Inflow: expected sales
      const expectedSales = avgDailySales * dayFactor;

      // Outflow: variable (purchases + other expenses)
      const variableOut = (avgDailyPurchaseCost + avgDailyOtherExpenses) * dayFactor;

      // Outflow: fixed costs (spread daily)
      const fixedOut = dailyFixedCost;

      // Outflow: scheduled AP payments due on this date
      const apOut = pendingInvoices
        .filter(inv => inv.date === dateStr)
        .reduce((s, inv) => s + inv.amount, 0);

      // Outflow: salary payout on last day of month
      const salaryOut = dayOfMonth === getDaysInMonth(date) ? monthlyDaySalaries : 0;

      const netFlow = expectedSales - variableOut - fixedOut - apOut;
      balance += netFlow;

      days.push({
        label: format(date, 'MMM d'),
        day: i,
        dateStr,
        inflow: Math.round(expectedSales),
        outflow: Math.round(variableOut + fixedOut + apOut),
        apOut: Math.round(apOut),
        salaryOut: Math.round(salaryOut),
        netFlow: Math.round(netFlow),
        balance: Math.round(balance),
      });
    }

    return {
      days,
      openingBalance: Math.round(openingBalance),
      avgDailySales: Math.round(avgDailySales),
      avgDailyPurchaseCost: Math.round(avgDailyPurchaseCost),
      monthlyRent: Math.round(monthlyRent),
      monthlyDaySalaries: Math.round(monthlyDaySalaries),
      dailyFixedCost: Math.round(dailyFixedCost),
      pendingAPTotal: Math.round(pendingInvoices.reduce((s, i) => s + i.amount, 0)),
      lowestBalance: Math.round(Math.min(...days.map(d => d.balance))),
      closingBalance: days.length > 0 ? days[days.length - 1].balance : openingBalance,
      negativeDays: days.filter(d => d.balance < 0).length,
    };
  }, [sales, expenses, employees, purchases, accounts, transactions, invoices, ninetyDaysAgo, todayStr]);

  const fmt = v => formatCurrency(v, currency);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Projection uses the last 90 days of sales trends, your fixed costs (rent + salaries from employee records), average inventory purchase rates, and pending supplier invoices.
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Opening Balance</p>
          <p className={`text-base font-bold ${projection.openingBalance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(projection.openingBalance)}</p>
        </Card>
        <Card className={`p-3 ${projection.closingBalance >= 0 ? '' : 'border-red-300 bg-red-50 dark:bg-red-950/20'}`}>
          <p className="text-xs text-muted-foreground">Projected Balance (Day 30)</p>
          <p className={`text-base font-bold ${projection.closingBalance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(projection.closingBalance)}</p>
        </Card>
        <Card className={`p-3 ${projection.lowestBalance < 0 ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : ''}`}>
          <p className="text-xs text-muted-foreground">Lowest Point</p>
          <p className={`text-base font-bold ${projection.lowestBalance >= 0 ? 'text-amber-600' : 'text-red-500'}`}>{fmt(projection.lowestBalance)}</p>
        </Card>
        <Card className={`p-3 ${projection.negativeDays > 0 ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20'}`}>
          <p className="text-xs text-muted-foreground">Days in Negative</p>
          <p className={`text-base font-bold ${projection.negativeDays > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{projection.negativeDays}</p>
        </Card>
      </div>

      {/* Liquidity alert */}
      {projection.negativeDays > 0 && (
        <Card className="p-3 border-red-300 bg-red-50 dark:bg-red-950/20 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-xs text-red-700">Liquidity risk: {projection.negativeDays} day(s) projected to have negative balance. Review pending AP and increase collections.</p>
        </Card>
      )}

      {/* Main projection chart */}
      <Card className="p-4">
        <p className="text-sm font-semibold mb-3">30-Day Liquidity Forecast</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={projection.days}>
            <defs>
              <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={4} />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${currency}${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={v => fmt(v)} labelFormatter={l => `Day: ${l}`} />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: 'Break-even', fill: '#ef4444', fontSize: 9 }} />
            <Area type="monotone" dataKey="balance" stroke="#6366f1" fill="url(#balGrad)" strokeWidth={2} name="Projected Balance" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Inflow vs Outflow chart */}
      <Card className="p-4">
        <p className="text-sm font-semibold mb-3">Daily Inflow vs Outflow</p>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={projection.days}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={4} />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${currency}${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={v => fmt(v)} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Area type="monotone" dataKey="inflow" stroke="#10b981" fill="#10b98122" strokeWidth={1.5} name="Expected Sales" dot={false} />
            <Area type="monotone" dataKey="outflow" stroke="#ef4444" fill="#ef444422" strokeWidth={1.5} name="Projected Costs" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Assumptions breakdown */}
      <Card className="p-4">
        <button className="w-full flex items-center justify-between text-sm font-semibold" onClick={() => setShowDetails(v => !v)}>
          <span>Projection Assumptions</span>
          <span className="text-xs text-muted-foreground">{showDetails ? '▲ Hide' : '▼ Show'}</span>
        </button>
        {showDetails && (
          <div className="mt-3 space-y-2 text-xs">
            {[
              { label: 'Avg Daily Sales (historical)', value: fmt(projection.avgDailySales), color: 'text-emerald-600' },
              { label: 'Avg Daily Purchase Cost', value: fmt(projection.avgDailyPurchaseCost), color: 'text-amber-600' },
              { label: 'Monthly Rent (from expenses)', value: fmt(projection.monthlyRent), color: 'text-red-500' },
              { label: 'Monthly Salaries (from employees)', value: fmt(projection.monthlyDaySalaries), color: 'text-red-500' },
              { label: 'Daily Fixed Cost Total', value: fmt(projection.dailyFixedCost), color: 'text-red-500' },
              { label: 'Pending AP Outflows (due dates)', value: fmt(projection.pendingAPTotal), color: 'text-orange-500' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between border-b border-border pb-1 last:border-0">
                <span className="text-muted-foreground">{item.label}</span>
                <span className={`font-semibold ${item.color}`}>{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}