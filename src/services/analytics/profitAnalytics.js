/**
 * profitAnalytics.js — Compatibility shim.
 * All net-profit computations now delegate to the shared ERP accounting engine
 * (calculateERPAccounting) so every KPI uses the same formula.
 *
 * Formula:
 *   Net Profit = Sales − Purchases − Variable Expenses − Fixed Allocation
 *
 * Fixed expenses are prorated from the calendar-month pool for day/week ranges.
 */

import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import {
  formatDate,
  getDateRange,
  calculateERPAccounting,
  tagExpensesWithCategories,
  calculateSalesRevenue,
} from '@/lib/helpers';
import { format, startOfMonth, endOfMonth } from 'date-fns';

// ── Core P&L builder ──────────────────────────────────────────────────────────
async function buildPnL(ownerFilter, fromStr, toStr, branchKey = 'all', rangeType = 'month') {
  try {
    const [sales, expenses, expenseCategories] = await Promise.all([
      base44.entities.DailySales.filter(ownerFilter || {}, '-date', 2000),
      base44.entities.Expense.filter(ownerFilter || {}, '-date', 2000),
      base44.entities.ExpenseCategory
        ? base44.entities.ExpenseCategory.filter({}, 'sort_order', 500)
        : Promise.resolve([]),
    ]);

    let purchases = [];
    if (ownerFilter?.created_by) {
      const { data } = await supabase
        .from('supplier_invoices')
        .select('id, total_amount, date, branch')
        .eq('created_by', ownerFilter.created_by)
        .in('approval_status', ['approved', 'auto_approved'])
        .gte('date', fromStr)
        .lte('date', toStr);
      purchases = data || [];
    }

    const filteredSales = sales.filter(s =>
      s.date >= fromStr && s.date <= toStr &&
      (branchKey === 'all' || s.branch === branchKey)
    );
    const filteredPurchases = purchases.filter(p =>
      branchKey === 'all' || !p.branch || p.branch === branchKey
    );

    // Period expenses (variable only for day/week; all for month)
    const filteredExpenses = expenses.filter(e =>
      e.date >= fromStr && e.date <= toStr &&
      (branchKey === 'all' || e.branch === branchKey || e.branch === 'all')
    );

    // Full calendar-month expense pool for fixed-cost proration
    const monthStart = format(startOfMonth(new Date(`${toStr}T12:00:00`)), 'yyyy-MM-dd');
    const monthEnd   = format(endOfMonth(new Date(`${toStr}T12:00:00`)), 'yyyy-MM-dd');
    const monthlyExpenses = expenses.filter(e =>
      e.date >= monthStart && e.date <= monthEnd &&
      (branchKey === 'all' || e.branch === branchKey || e.branch === 'all')
    );

    const taggedPeriod  = tagExpensesWithCategories(filteredExpenses, expenseCategories);
    const taggedMonthly = tagExpensesWithCategories(monthlyExpenses, expenseCategories);

    // Determine daysInPeriod for day/week proration
    let daysInPeriod = null;
    if (rangeType === 'day') daysInPeriod = 1;
    else if (rangeType === 'week') {
      const d1 = new Date(`${fromStr}T12:00:00`);
      const d2 = new Date(`${toStr}T12:00:00`);
      daysInPeriod = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
    }

    const metrics = calculateERPAccounting({
      sales: filteredSales,
      purchases: filteredPurchases,
      periodExpenses: taggedPeriod,
      monthlyExpenses: taggedMonthly,
      rangeType,
      revenueSources: [],
      daysInPeriod,
      asOfDate: toStr,
    });

    return {
      revenue:           metrics.totalSales,
      cogs:              metrics.totalPurchaseCost,
      grossProfit:       metrics.grossProfit,
      operatingExpenses: metrics.totalExpenses,
      netProfit:         metrics.netProfit,
      profitMargin:      metrics.margin,
      netProfitMargin:   metrics.netMargin,
    };
  } catch (err) {
    console.warn('[profitAnalytics] buildPnL error:', err);
    return { revenue: 0, cogs: 0, grossProfit: 0, operatingExpenses: 0, netProfit: 0, profitMargin: 0, netProfitMargin: 0 };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export function getProfitAndLoss(ownerFilter, fromStr, toStr, branchKey = 'all') {
  // Infer rangeType from date span
  const d1 = new Date(`${fromStr}T12:00:00`);
  const d2 = new Date(`${toStr}T12:00:00`);
  const days = Math.round((d2 - d1) / 86400000) + 1;
  const rangeType = days <= 1 ? 'day' : days <= 7 ? 'week' : 'month';
  return buildPnL(ownerFilter, fromStr, toStr, branchKey, rangeType);
}

export function getProfitAndLossToday(ownerFilter, branchKey = 'all') {
  const today = formatDate(new Date());
  return buildPnL(ownerFilter, today, today, branchKey, 'day');
}

export function getProfitAndLossThisWeek(ownerFilter, branchKey = 'all') {
  const dr = getDateRange('week');
  return buildPnL(ownerFilter, formatDate(dr.from), formatDate(dr.to), branchKey, 'week');
}

export function getProfitAndLossThisMonth(ownerFilter, branchKey = 'all') {
  const dr = getDateRange('month');
  return buildPnL(ownerFilter, formatDate(dr.from), formatDate(dr.to), branchKey, 'month');
}

export function getProfitAndLossThisQuarter(ownerFilter, branchKey = 'all') {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const from = new Date(now.getFullYear(), q * 3, 1);
  const to   = new Date(now.getFullYear(), q * 3 + 3, 0);
  return buildPnL(ownerFilter, formatDate(from), formatDate(to), branchKey, 'month');
}

export function getProfitAndLossThisYear(ownerFilter, branchKey = 'all') {
  const year = new Date().getFullYear();
  return buildPnL(ownerFilter, `${year}-01-01`, `${year}-12-31`, branchKey, 'month');
}
