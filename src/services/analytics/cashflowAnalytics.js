/**
 * cashflowAnalytics.js — Compatibility shim.
 * Provides getDailyCashFlow, getCashFlowSummary, calculateCashBalances
 * used by CashFlowAnalytics dashboard component.
 */

import { base44 } from '@/api/base44Client';
import { formatDate } from '@/lib/helpers';

// ── calculateCashBalances ─────────────────────────────────────────────────────
export function calculateCashBalances(walletTransactions = [], branches = []) {
  const ownerCash = walletTransactions
    .filter(t => t.wallet === 'owner_cash')
    .reduce((s, t) => s + (t.direction === 'in' ? (t.amount || 0) : -(t.amount || 0)), 0);
  const ownerNetwork = walletTransactions
    .filter(t => t.wallet === 'owner_network')
    .reduce((s, t) => s + (t.direction === 'in' ? (t.amount || 0) : -(t.amount || 0)), 0);
  const branchCash = walletTransactions
    .filter(t => t.wallet === 'branch_cash')
    .reduce((s, t) => s + (t.direction === 'in' ? (t.amount || 0) : -(t.amount || 0)), 0);
  return { ownerCash, ownerNetwork, branchCash, total: ownerCash + ownerNetwork + branchCash };
}

// ── getDailyCashFlow ──────────────────────────────────────────────────────────
export async function getDailyCashFlow(ownerFilter, fromStr, toStr, branchKey = 'all') {
  try {
    const [sales, expenses] = await Promise.all([
      base44.entities.DailySales.filter(ownerFilter || {}, '-date', 2000),
      base44.entities.Expense.filter(ownerFilter || {}, '-date', 2000),
    ]);

    const filteredSales = sales.filter(s =>
      s.date >= fromStr && s.date <= toStr &&
      (branchKey === 'all' || s.branch === branchKey)
    );
    const filteredExpenses = expenses.filter(e =>
      e.date >= fromStr && e.date <= toStr &&
      (branchKey === 'all' || e.branch === branchKey || e.branch === 'all')
    );

    const map = {};
    for (const s of filteredSales) {
      if (!map[s.date]) map[s.date] = { date: s.date, cashIn: 0, cashOut: 0 };
      map[s.date].cashIn += (s.cash || 0) + (s.network || 0);
    }
    for (const e of filteredExpenses) {
      if (!map[e.date]) map[e.date] = { date: e.date, cashIn: 0, cashOut: 0 };
      map[e.date].cashOut += e.amount || 0;
    }
    return Object.values(map)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, netFlow: d.cashIn - d.cashOut }));
  } catch {
    return [];
  }
}

// ── getCashFlowSummary ────────────────────────────────────────────────────────
export async function getCashFlowSummary(ownerFilter, fromStr, toStr, branchKey = 'all') {
  try {
    const daily = await getDailyCashFlow(ownerFilter, fromStr, toStr, branchKey);
    const totalIn = daily.reduce((s, d) => s + d.cashIn, 0);
    const totalOut = daily.reduce((s, d) => s + d.cashOut, 0);
    const netFlow = totalIn - totalOut;
    const avgDaily = daily.length > 0 ? netFlow / daily.length : 0;
    const forecast = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i + 1);
      return { date: formatDate(d), value: avgDaily };
    });
    return {
      totalIn, totalOut, netFlow, avgDaily,
      cashFlowForecast: { expectedCase: forecast },
      openingBalance: 0,
      closingBalance: netFlow,
    };
  } catch {
    return { totalIn: 0, totalOut: 0, netFlow: 0, avgDaily: 0, cashFlowForecast: { expectedCase: [] }, openingBalance: 0, closingBalance: 0 };
  }
}
