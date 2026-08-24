/**
 * salesAnalyticsEngine.js
 *
 * Single source of truth for ALL ERP sales analytics calculations.
 * Consumes: daily_sales, sales_sources_json, cash register, network/POS,
 *           customer credit, purchases, expenses, inventory, treasury.
 *
 * NO duplicated calculations — every metric is derived here.
 */

import {
  getSaleCash,
  getSaleNetwork,
  calculateSalesRevenue,
  computeDashboardMetrics,
  computeBranchMetrics,
  buildDailyProfitTrend,
  formatDate,
  tagExpensesWithCategories,
} from '@/lib/helpers';

import {
  startOfDay, endOfDay,
  startOfMonth, endOfMonth,
  startOfYear, endOfYear,
  subDays, subMonths, subYears,
  format,
} from 'date-fns';

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function todayStr()     { return format(new Date(), 'yyyy-MM-dd'); }
export function yesterdayStr() { return format(subDays(new Date(), 1), 'yyyy-MM-dd'); }
export function monthStartStr(){ return format(startOfMonth(new Date()), 'yyyy-MM-dd'); }
export function monthEndStr()  { return format(endOfMonth(new Date()), 'yyyy-MM-dd'); }
export function yearStartStr() { return format(startOfYear(new Date()), 'yyyy-MM-dd'); }
export function yearEndStr()   { return format(endOfYear(new Date()), 'yyyy-MM-dd'); }
export function prevMonthStartStr() { return format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'); }
export function prevMonthEndStr()   { return format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'); }
export function prevYearStartStr()  { return format(startOfYear(subYears(new Date(), 1)), 'yyyy-MM-dd'); }
export function prevYearEndStr()    { return format(endOfYear(subYears(new Date(), 1)), 'yyyy-MM-dd'); }

// ─── Filter helpers ───────────────────────────────────────────────────────────

export function filterByDate(arr, from, to) {
  return (arr || []).filter(r => r && r.date >= from && r.date <= to);
}

export function filterByBranch(arr, branchKey) {
  if (!branchKey || branchKey === 'all') return arr;
  return arr.filter(r => r.branch === branchKey);
}

// ─── 1. EXECUTIVE SUMMARY ────────────────────────────────────────────────────

/**
 * Computes all Executive Summary KPIs.
 * @param {Array} sales
 * @param {Array} purchases
 * @param {Array} expenses
 * @param {Array} revenueSources
 * @param {Array} walletTransactions - for network settlement
 * @returns {Object} executiveSummary
 */
export function computeExecutiveSummary(sales, purchases, expenses, revenueSources = [], walletTransactions = [], expenseCategories = []) {
  const today = todayStr();
  const yesterday = yesterdayStr();
  const mStart = monthStartStr();
  const mEnd   = monthEndStr();
  const yStart = yearStartStr();
  const yEnd   = yearEndStr();
  const pmStart = prevMonthStartStr();
  const pmEnd   = prevMonthEndStr();

  const todaySales     = filterByDate(sales, today, today);
  const yesterdaySales = filterByDate(sales, yesterday, yesterday);
  const monthSales     = filterByDate(sales, mStart, mEnd);
  const yearSales      = filterByDate(sales, yStart, yEnd);
  const prevMonthSales = filterByDate(sales, pmStart, pmEnd);

  const todayPurchases = filterByDate(purchases, today, today);
  const yesterdayPurchases = filterByDate(purchases, yesterday, yesterday);
  const monthPurchases = filterByDate(purchases, mStart, mEnd);
  const yearPurchases  = filterByDate(purchases, yStart, yEnd);

  // Tag expenses with _is_fixed from categories for correct proration.
  // The daily calls receive the complete applicable month pool for fixed costs.
  const taggedExpenses = tagExpensesWithCategories(expenses, expenseCategories);
  const monthExpenses  = filterByDate(taggedExpenses, mStart, mEnd);
  const yearExpenses   = filterByDate(taggedExpenses, yStart, yEnd);
  const todayExpenses  = filterByDate(taggedExpenses, today, today);
  const yesterdayExpenses = filterByDate(taggedExpenses, yesterday, yesterday);
  const yesterdayDate = subDays(new Date(), 1);
  const yesterdayMonthExpenses = filterByDate(
    taggedExpenses,
    format(startOfMonth(yesterdayDate), 'yyyy-MM-dd'),
    format(endOfMonth(yesterdayDate), 'yyyy-MM-dd'),
  );

  const todayMetrics = computeDashboardMetrics(
    todaySales, todayPurchases, todayExpenses, 'day', revenueSources, 1, null,
    { monthlyExpenses: monthExpenses, asOfDate: today },
  );
  const yesterdayMetrics = computeDashboardMetrics(
    yesterdaySales, yesterdayPurchases, yesterdayExpenses, 'day', revenueSources, 1, null,
    { monthlyExpenses: yesterdayMonthExpenses, asOfDate: yesterday },
  );
  const monthMetrics = computeDashboardMetrics(monthSales, monthPurchases, monthExpenses, 'month', revenueSources, null, null, { monthlyExpenses: monthExpenses, asOfDate: mEnd });
  const yearMetrics = computeDashboardMetrics(yearSales, yearPurchases, yearExpenses, 'year', revenueSources, null, null, { monthlyExpenses: yearExpenses, asOfDate: yEnd });
  const prevMonthExpenses = filterByDate(taggedExpenses, pmStart, pmEnd);
  const prevMonthMetrics = computeDashboardMetrics(
    prevMonthSales, filterByDate(purchases, pmStart, pmEnd), prevMonthExpenses, 'month', revenueSources, null, null,
    { monthlyExpenses: prevMonthExpenses, asOfDate: pmEnd },
  );

  // Sales Growth % (month vs prev month)
  const salesGrowth = prevMonthMetrics.totalSales > 0
    ? ((monthMetrics.totalSales - prevMonthMetrics.totalSales) / prevMonthMetrics.totalSales) * 100
    : null;

  // Average Daily Revenue (current month)
  const daysInMonth = monthSales.length > 0
    ? new Set(monthSales.map(s => s.date)).size
    : 1;
  const avgDailyRevenue = monthMetrics.totalSales / Math.max(daysInMonth, 1);

  // Average Ticket (total sales / number of records as proxy)
  const ticketCount = monthSales.length || 1;
  const avgTicket = monthMetrics.totalSales / ticketCount;

  return {
    todaySales:       todayMetrics.totalSales,
    yesterdaySales:   yesterdayMetrics.totalSales,
    monthSales:       monthMetrics.totalSales,
    yearSales:        yearMetrics.totalSales,
    grossProfit:      monthMetrics.profit,
    netProfit:        monthMetrics.netProfit,
    salesGrowth,
    profitMargin:     monthMetrics.margin,
    netMargin:        monthMetrics.netMargin,
    avgDailyRevenue,
    avgTicket,
    // Today expense breakdown (for KPI cards)
    todayExpenses:         todayMetrics.totalExpenses,
    todayExpensesFixed:    todayMetrics.fixedDeduction,
    todayExpensesVariable: todayMetrics.totalVariableExpenses,
    // Monthly expense breakdown
    monthExpenses:         monthMetrics.totalExpensesAll,
    monthExpensesFixed:    monthMetrics.totalFixedExpenses,
    monthExpensesVariable: monthMetrics.totalVariableExpenses,
    // raw for downstream use
    todayMetrics,
    monthMetrics,
    yearMetrics,
    prevMonthMetrics,
  };
}

// ─── 2. SALES PERFORMANCE ────────────────────────────────────────────────────

/**
 * Builds daily sales trend, monthly trend, and year comparison.
 * @param {Array} sales
 * @param {Array} revenueSources
 * @returns {Object} salesPerformance
 */
export function computeSalesPerformance(sales, revenueSources = []) {
  const today = todayStr();
  const mStart = monthStartStr();
  const mEnd   = monthEndStr();
  const yStart = yearStartStr();
  const yEnd   = yearEndStr();
  const pyStart = prevYearStartStr();
  const pyEnd   = prevYearEndStr();

  // Daily trend for current month
  const monthSales = filterByDate(sales, mStart, mEnd);
  const dailyMap = {};
  monthSales.forEach(s => {
    if (!s.date) return;
    const rev = calculateSalesRevenue(s, revenueSources);
    dailyMap[s.date] = (dailyMap[s.date] || 0) + (rev?.total || 0);
  });
  const dailyTrend = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total }));

  // Monthly trend for current year
  const yearSales = filterByDate(sales, yStart, yEnd);
  const monthlyMap = {};
  yearSales.forEach(s => {
    if (!s.date) return;
    const month = s.date.slice(0, 7); // YYYY-MM
    const rev = calculateSalesRevenue(s, revenueSources);
    monthlyMap[month] = (monthlyMap[month] || 0) + (rev?.total || 0);
  });
  const monthlyTrend = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, total }));

  // Year comparison (current vs previous year by month)
  const prevYearSales = filterByDate(sales, pyStart, pyEnd);
  const prevYearMonthlyMap = {};
  prevYearSales.forEach(s => {
    if (!s.date) return;
    const month = s.date.slice(5, 7); // MM only for comparison
    const rev = calculateSalesRevenue(s, revenueSources);
    prevYearMonthlyMap[month] = (prevYearMonthlyMap[month] || 0) + (rev?.total || 0);
  });
  const yearComparisonMap = {};
  yearSales.forEach(s => {
    if (!s.date) return;
    const month = s.date.slice(5, 7);
    const rev = calculateSalesRevenue(s, revenueSources);
    yearComparisonMap[month] = (yearComparisonMap[month] || 0) + (rev?.total || 0);
  });
  const yearComparison = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    return {
      month: m,
      currentYear: yearComparisonMap[m] || 0,
      prevYear: prevYearMonthlyMap[m] || 0,
    };
  });

  // Best/worst day
  const bestDay  = dailyTrend.reduce((best, d) => (!best || d.total > best.total) ? d : best, null);
  const worstDay = dailyTrend.reduce((worst, d) => (!worst || d.total < worst.total) ? d : worst, null);

  // Peak sales time — approximate from date distribution (day-of-week)
  const dowMap = {};
  monthSales.forEach(s => {
    if (!s.date) return;
    const dow = new Date(s.date).toLocaleDateString('en-US', { weekday: 'short' });
    const rev = calculateSalesRevenue(s, revenueSources);
    dowMap[dow] = (dowMap[dow] || 0) + (rev?.total || 0);
  });
  const peakDay = Object.entries(dowMap).sort(([, a], [, b]) => b - a)[0]?.[0] || null;

  // Growth direction
  const growthDirection = dailyTrend.length >= 2
    ? (dailyTrend[dailyTrend.length - 1].total >= dailyTrend[0].total ? 'up' : 'down')
    : 'neutral';

  return { dailyTrend, monthlyTrend, yearComparison, bestDay, worstDay, peakDay, growthDirection };
}

// ─── 3. PAYMENT ANALYTICS ────────────────────────────────────────────────────

/**
 * Breaks down sales by payment source (cash, network, credit, custom sources).
 * Auto-detects custom sources from sales_sources_json — never hardcoded.
 * @param {Array} sales
 * @param {Array} revenueSources - SalesSource config array
 * @returns {Object} paymentAnalytics
 */
export function computePaymentAnalytics(sales, revenueSources = []) {
  const today     = todayStr();
  const yesterday = yesterdayStr();
  const mStart    = monthStartStr();
  const mEnd      = monthEndStr();
  const yStart    = yearStartStr();
  const yEnd      = yearEndStr();

  /**
   * Resolves a clean display name for a custom sales source entry.
   * Priority: name_ar > name_en (embedded in JSON) > revenueSources config name > source_key (never UUID).
   * A UUID is detected as a string matching the UUID v4 pattern.
   */
  function resolveSourceLabel(entry, srcConfig) {
    // 1. Prefer multilingual names embedded in the JSON entry (written by UnifiedSalesClosing)
    if (entry.name_ar && entry.name_ar.trim()) return entry.name_ar.trim();
    if (entry.name_en && entry.name_en.trim()) return entry.name_en.trim();
    // 2. Fall back to revenueSources config
    if (srcConfig) {
      if (srcConfig.name_ar && srcConfig.name_ar.trim()) return srcConfig.name_ar.trim();
      if (srcConfig.name_en && srcConfig.name_en.trim()) return srcConfig.name_en.trim();
      if (srcConfig.name_fa && srcConfig.name_fa.trim()) return srcConfig.name_fa.trim();
      if (srcConfig.name && srcConfig.name.trim()) return srcConfig.name.trim();
      if (srcConfig.label && srcConfig.label.trim()) return srcConfig.label.trim();
      // Use system_key only if it's not a UUID
      const sk = srcConfig.system_key || srcConfig.source_key || '';
      if (sk && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sk)) return sk;
    }
    // 3. Use source_key from entry if not a UUID
    const entryKey = entry.source_key || '';
    if (entryKey && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entryKey)) return entryKey;
    // 4. Last resort: use 'Other Source' rather than exposing a UUID
    return 'Other Source';
  }

  /**
   * Builds a stable lookup key for grouping source amounts across time periods.
   * Uses source_id (UUID) as the stable key so amounts aggregate correctly
   * even if display names differ between records.
   */
  function resolveSourceKey(entry, srcConfig) {
    // Prefer the stable UUID id from config
    if (srcConfig?.id) return srcConfig.id;
    // Fall back to source_id from entry
    if (entry.source_id) return entry.source_id;
    // Fall back to source_key if not a UUID
    const sk = entry.source_key || '';
    if (sk && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sk)) return sk;
    // Last resort: use the display label as key
    return resolveSourceLabel(entry, srcConfig);
  }

  function sumBySource(arr) {
    const result = { cash: 0, network: 0, credit: 0, customSources: {}, customLabels: {}, total: 0 };
    arr.forEach(s => {
      const rev = calculateSalesRevenue(s, revenueSources);
      result.cash    += rev.cash;
      result.network += rev.network;
      result.credit  += rev.credit;
      result.total   += rev.total;

      // Parse custom sources
      const rawSources = s?.sales_sources_json;
      if (rawSources) {
        try {
          let entries = typeof rawSources === 'string' ? JSON.parse(rawSources) : rawSources;
          if (!Array.isArray(entries)) entries = [entries];
          entries.forEach(e => {
            if (!e) return;
            const srcConfig = revenueSources.find(r =>
              r.id === (e.source_id || e.source_key) ||
              r.source_key === (e.source_id || e.source_key)
            );
            // Skip sources excluded from revenue
            if (srcConfig && srcConfig.included_in_revenue === false) return;
            const stableKey = resolveSourceKey(e, srcConfig);
            const displayLabel = resolveSourceLabel(e, srcConfig);
            result.customSources[stableKey] = (result.customSources[stableKey] || 0) + Number(e.amount || 0);
            // Store the best label we've seen for this key
            if (!result.customLabels[stableKey]) result.customLabels[stableKey] = displayLabel;
          });
        } catch (_) {}
      }
    });
    return result;
  }

  const todayData     = sumBySource(filterByDate(sales, today, today));
  const yesterdayData = sumBySource(filterByDate(sales, yesterday, yesterday));
  const monthData     = sumBySource(filterByDate(sales, mStart, mEnd));
  const yearData      = sumBySource(filterByDate(sales, yStart, yEnd));

  // Collect all stable custom source keys seen across all periods
  const allCustomKeys = new Set([
    ...Object.keys(todayData.customSources),
    ...Object.keys(yesterdayData.customSources),
    ...Object.keys(monthData.customSources),
    ...Object.keys(yearData.customSources),
  ]);

  // Build per-source rows — use stable key internally, clean label for display
  const buildRow = (name, key, data) => ({
    name,
    key,
    today:     data.today,
    yesterday: data.yesterday,
    month:     data.month,
    year:      data.year,
    pctOfMonth: monthData.total > 0 ? (data.month / monthData.total) * 100 : 0,
  });

  const sources = [
    buildRow('Cash',    'cash',    { today: todayData.cash,    yesterday: yesterdayData.cash,    month: monthData.cash,    year: yearData.cash }),
    buildRow('Network', 'network', { today: todayData.network, yesterday: yesterdayData.network, month: monthData.network, year: yearData.network }),
    buildRow('Credit',  'credit',  { today: todayData.credit,  yesterday: yesterdayData.credit,  month: monthData.credit,  year: yearData.credit }),
    ...[...allCustomKeys].map(stableKey => {
      // Resolve best display label: prefer month data (most records), then today, yesterday, year
      const label =
        monthData.customLabels[stableKey] ||
        todayData.customLabels[stableKey] ||
        yesterdayData.customLabels[stableKey] ||
        yearData.customLabels[stableKey] ||
        stableKey;
      return buildRow(label, stableKey, {
        today:     todayData.customSources[stableKey]     || 0,
        yesterday: yesterdayData.customSources[stableKey] || 0,
        month:     monthData.customSources[stableKey]     || 0,
        year:      yearData.customSources[stableKey]      || 0,
      });
    }),
  ].filter(s => s.month > 0 || s.today > 0 || s.yesterday > 0);

  // Payment mix for donut chart
  const paymentMix = sources.map(s => ({ name: s.name, value: s.month })).filter(s => s.value > 0);

  return { sources, paymentMix, monthTotal: monthData.total };
}

// ─── 4. ADDITIONAL SALES SOURCES ENGINE ──────────────────────────────────────
// (Handled inside computePaymentAnalytics — auto-detected from sales_sources_json)

/**
 * Returns only the custom (non-system) sources breakdown.
 * @param {Array} sales
 * @param {Array} revenueSources
 */
export function computeAdditionalSources(sales, revenueSources = []) {
  const { sources } = computePaymentAnalytics(sales, revenueSources);
  return sources.filter(s => !['cash', 'network', 'credit'].includes(s.key));
}

// ─── 5. NETWORK ANALYTICS ────────────────────────────────────────────────────

/**
 * Computes network/POS analytics including settlement status.
 * @param {Array} sales
 * @param {Array} walletTransactions - treasury settlement records
 * @returns {Object} networkAnalytics
 */
export function computeNetworkAnalytics(sales, walletTransactions = []) {
  const today     = todayStr();
  const yesterday = yesterdayStr();
  const mStart    = monthStartStr();
  const mEnd      = monthEndStr();

  const getNetwork = arr => arr.reduce((s, r) => s + getSaleNetwork(r), 0);

  const todayNetwork     = getNetwork(filterByDate(sales, today, today));
  const yesterdayNetwork = getNetwork(filterByDate(sales, yesterday, yesterday));
  const monthNetwork     = getNetwork(filterByDate(sales, mStart, mEnd));

  // Settlements from treasury (wallet transactions of type sent_to_owner)
  const monthSettlements = (walletTransactions || [])
    .filter((transaction) => {
      const date = transaction?.transaction_date || transaction?.date || '';
      const type = transaction?.transaction_type || transaction?.type || '';
      return date >= mStart && date <= mEnd && ['sent_to_owner', 'branch_to_owner_network'].includes(type);
    })
    .reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);

  const pending    = Math.max(0, monthNetwork - monthSettlements);
  const difference = monthNetwork - monthSettlements;

  return {
    todayNetwork,
    yesterdayNetwork,
    monthNetwork,
    settled:    monthSettlements,
    pending,
    difference,
  };
}

// ─── 6. BRANCH PERFORMANCE ───────────────────────────────────────────────────

/**
 * Computes per-branch revenue, purchase, expense, profit, and margin.
 * Ranks branches best → weakest.
 * @param {Array} branches - [{key, label}]
 * @param {Array} sales
 * @param {Array} purchases
 * @param {Array} expenses
 * @param {Array} revenueSources
 * @returns {Array} branchPerformance sorted by profit desc
 */
export function computeBranchPerformance(branches, sales, purchases, expenses, revenueSources = [], expenseCategories = []) {
  const mStart = monthStartStr();
  const mEnd   = monthEndStr();

  const mSales     = filterByDate(sales, mStart, mEnd);
  const mPurchases = filterByDate(purchases, mStart, mEnd);
  // Tag expenses with _is_fixed before filtering
  const taggedExpenses = tagExpensesWithCategories(expenses, expenseCategories);
  const mExpenses  = filterByDate(taggedExpenses, mStart, mEnd);

  const result = (branches || []).map(branch => {
    const bKey = branch.key || branch.id || branch;
    const bLabel = branch.label || branch.name || bKey;

    const bSales     = mSales.filter(s => s.branch === bKey);
    const bPurchases = mPurchases.filter(p => p.branch === bKey);
    const bExpenses  = mExpenses.filter(e => e.branch_key === bKey || e.branch_key === 'all');

    const m = computeDashboardMetrics(bSales, bPurchases, bExpenses, 'month', revenueSources);

    return {
      key:      bKey,
      label:    bLabel,
      revenue:  m.totalSales,
      purchase: m.totalPurchaseCost,
      expense:  m.totalExpensesAll,
      profit:   m.netProfit,
      margin:   m.netMargin,
    };
  });

  return result.sort((a, b) => b.profit - a.profit);
}

// ─── 7. COST CONTROL ─────────────────────────────────────────────────────────

/**
 * Computes food cost %, purchase ratio, expense ratio, and alerts.
 * @param {Array} sales
 * @param {Array} purchases
 * @param {Array} expenses
 * @param {Array} revenueSources
 * @returns {Object} costControl
 */
export function computeCostControl(sales, purchases, expenses, revenueSources = [], expenseCategories = []) {
  const mStart = monthStartStr();
  const mEnd   = monthEndStr();
  const pmStart = prevMonthStartStr();
  const pmEnd   = prevMonthEndStr();

  const taggedExpenses = tagExpensesWithCategories(expenses, expenseCategories);
  const m  = computeDashboardMetrics(filterByDate(sales, mStart, mEnd), filterByDate(purchases, mStart, mEnd), filterByDate(taggedExpenses, mStart, mEnd), 'month', revenueSources);
  const pm = computeDashboardMetrics(filterByDate(sales, pmStart, pmEnd), filterByDate(purchases, pmStart, pmEnd), filterByDate(taggedExpenses, pmStart, pmEnd), 'month', revenueSources);

  const foodCostPct     = m.totalSales > 0 ? (m.totalPurchaseCost / m.totalSales) * 100 : 0;
  const purchaseRatio   = m.totalSales > 0 ? (m.totalPurchaseCost / m.totalSales) * 100 : 0;
  const expenseRatio    = m.totalSales > 0 ? (m.totalExpensesAll  / m.totalSales) * 100 : 0;

  const prevFoodCostPct   = pm.totalSales > 0 ? (pm.totalPurchaseCost / pm.totalSales) * 100 : 0;
  const prevExpenseRatio  = pm.totalSales > 0 ? (pm.totalExpensesAll  / pm.totalSales) * 100 : 0;

  const alerts = [];
  if (foodCostPct > prevFoodCostPct + 5)   alerts.push({ type: 'food_cost',  severity: 'warning', delta: foodCostPct - prevFoodCostPct });
  if (expenseRatio > prevExpenseRatio + 5)  alerts.push({ type: 'expenses',   severity: 'warning', delta: expenseRatio - prevExpenseRatio });
  if (foodCostPct > 40)                     alerts.push({ type: 'food_cost',  severity: 'critical', value: foodCostPct });
  if (expenseRatio > 35)                    alerts.push({ type: 'expenses',   severity: 'critical', value: expenseRatio });

  return { foodCostPct, purchaseRatio, expenseRatio, prevFoodCostPct, prevExpenseRatio, alerts };
}

// ─── 8. PROFIT ANALYSIS ──────────────────────────────────────────────────────

/**
 * Computes gross profit, net profit, margin, and profit trend chart data.
 * Formula: Revenue - Purchase Cost - Expenses
 * @param {Array} sales
 * @param {Array} purchases
 * @param {Array} expenses
 * @param {Array} revenueSources
 * @returns {Object} profitAnalysis
 */
export function computeProfitAnalysis(sales, purchases, expenses, revenueSources = [], expenseCategories = []) {
  const mStart = monthStartStr();
  const mEnd   = monthEndStr();
  const yStart = yearStartStr();
  const yEnd   = yearEndStr();

  const taggedExpenses = tagExpensesWithCategories(expenses, expenseCategories);
  const monthM = computeDashboardMetrics(filterByDate(sales, mStart, mEnd), filterByDate(purchases, mStart, mEnd), filterByDate(taggedExpenses, mStart, mEnd), 'month', revenueSources);
  const yearM  = computeDashboardMetrics(filterByDate(sales, yStart, yEnd), filterByDate(purchases, yStart, yEnd), filterByDate(taggedExpenses, yStart, yEnd), 'year', revenueSources);

  // Profit trend (daily for current month)
  const profitTrend = buildDailyProfitTrend(filterByDate(sales, mStart, mEnd), filterByDate(purchases, mStart, mEnd), revenueSources);

  return {
    revenue:      monthM.totalSales,
    purchaseCost: monthM.totalPurchaseCost,
    expenses:     monthM.totalExpensesAll,
    grossProfit:  monthM.profit,
    netProfit:    monthM.netProfit,
    margin:       monthM.margin,
    netMargin:    monthM.netMargin,
    yearRevenue:  yearM.totalSales,
    yearNetProfit: yearM.netProfit,
    profitTrend,
  };
}

// ─── 9. PDF REPORT DATA ───────────────────────────────────────────────────────

/**
 * Aggregates all sections into a single payload for PDF generation.
 * @param {Array} sales
 * @param {Array} purchases
 * @param {Array} expenses
 * @param {Array} inventory
 * @param {Array} branches
 * @param {Array} revenueSources
 * @param {Array} walletTransactions
 * @returns {Object} pdfPayload
 */
export function buildPDFPayload(sales, purchases, expenses, inventory, branches, revenueSources = [], walletTransactions = [], expenseCategories = []) {
  return {
    executive:   computeExecutiveSummary(sales, purchases, expenses, revenueSources, walletTransactions, expenseCategories),
    performance: computeSalesPerformance(sales, revenueSources),
    payment:     computePaymentAnalytics(sales, revenueSources),
    network:     computeNetworkAnalytics(sales, walletTransactions),
    branches:    computeBranchPerformance(branches, sales, purchases, expenses, revenueSources, expenseCategories),
    cost:        computeCostControl(sales, purchases, expenses, revenueSources, expenseCategories),
    profit:      computeProfitAnalysis(sales, purchases, expenses, revenueSources, expenseCategories),
    inventory:   buildInventorySummary(inventory),
    generatedAt: new Date().toISOString(),
  };
}

// ─── INVENTORY SUMMARY (for PDF page 8) ──────────────────────────────────────

export function buildInventorySummary(inventory = []) {
  const totalItems  = inventory.length;
  const lowStock    = inventory.filter(i => (i.opening_stock || 0) <= (i.low_stock_threshold || 5));
  const totalValue  = inventory.reduce((s, i) => s + ((i.opening_stock || 0) * (i.unit_cost || 0)), 0);
  return { totalItems, lowStockCount: lowStock.length, lowStockItems: lowStock.slice(0, 10), totalValue };
}

// ─── RECOMMENDATIONS ENGINE ───────────────────────────────────────────────────

/**
 * Generates text recommendations based on computed metrics.
 * @param {Object} executive - from computeExecutiveSummary
 * @param {Object} cost      - from computeCostControl
 * @param {Array}  branches  - from computeBranchPerformance
 * @returns {Array} recommendations [{type, severity, text}]
 */
export function generateRecommendations(executive, cost, branches) {
  const recs = [];

  if (executive.netProfit < 0) {
    recs.push({ type: 'profit', severity: 'critical', text: 'Net profit is negative. Reduce purchase costs and variable expenses immediately.' });
  } else if (executive.netMargin < 10) {
    recs.push({ type: 'profit', severity: 'warning', text: 'Net margin is below 10%. Review pricing and cost structure.' });
  }

  if (cost.foodCostPct > 35) {
    recs.push({ type: 'food_cost', severity: 'warning', text: `Food cost at ${cost.foodCostPct.toFixed(1)}% — target below 30%. Renegotiate supplier prices.` });
  }

  if (cost.expenseRatio > 30) {
    recs.push({ type: 'expenses', severity: 'warning', text: `Expense ratio at ${cost.expenseRatio.toFixed(1)}% — review fixed and variable overhead.` });
  }

  if (executive.salesGrowth !== null && executive.salesGrowth < -10) {
    recs.push({ type: 'growth', severity: 'critical', text: `Sales declined ${Math.abs(executive.salesGrowth).toFixed(1)}% vs last month. Investigate root cause.` });
  }

  const weakest = branches?.[branches.length - 1];
  if (weakest && weakest.profit < 0) {
    recs.push({ type: 'branch', severity: 'warning', text: `Branch "${weakest.label}" is unprofitable. Consider operational review.` });
  }

  if (recs.length === 0) {
    recs.push({ type: 'general', severity: 'success', text: 'All key metrics are within healthy ranges. Focus on growth and expansion.' });
  }

  return recs;
}
