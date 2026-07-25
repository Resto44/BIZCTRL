import { subDays, subWeeks, subMonths, subYears, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, format } from 'date-fns';

export function formatDate(d) {
  if (!d) return '';
  return format(d, 'yyyy-MM-dd');
}

export function getDateRange(type) {
  const today = new Date();
  switch (type) {
    case 'week':
      return { from: startOfWeek(today, { weekStartsOn: 6 }), to: endOfWeek(today, { weekStartsOn: 6 }) };
    case 'month':
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case 'year':
      return { from: startOfYear(today), to: endOfYear(today) };
    default:
      return { from: startOfMonth(today), to: endOfMonth(today) };
  }
}

export function getPreviousDateRange(type, customFrom, customTo) {
  const current = getDateRange(type);
  const diffMs = current.to - current.from;
  return {
    from: new Date(current.from - diffMs - 86400000),
    to: new Date(current.from - 86400000),
  };
}

// Normalised field accessors — prefer restaurant_ fields (new schema),
// fall back to legacy cash / network for older records.
export const getSaleCash    = r => Number(r.restaurant_cash    ?? r.cash    ?? 0);
export const getSaleNetwork = r => Number(r.restaurant_network ?? r.network ?? 0);

/**
 * Shared ERP accounting engine.
 *
 * Gross Profit = Sales - Purchases.  Expenses never affect Gross Profit.
 * Daily and weekly fixed-cost deductions are allocated from the complete
 * calendar-month fixed-expense pool; variable expenses are deducted only when
 * they are recorded inside the requested period.
 */
export function calculateERPAccounting({
  sales = [],
  purchases = [],
  periodExpenses = [],
  monthlyExpenses = periodExpenses,
  rangeType = 'month',
  revenueSources = [],
  daysInPeriod = null,
  asOfDate = null,
} = {}) {
  const safeSales = Array.isArray(sales) ? sales : [];
  const safePurchases = Array.isArray(purchases) ? purchases : [];
  const safePeriodExpenses = Array.isArray(periodExpenses) ? periodExpenses : [];
  const safeMonthlyExpenses = Array.isArray(monthlyExpenses) ? monthlyExpenses : [];

  let totalSales = 0;
  let totalCash = 0;
  let totalNetwork = 0;
  let totalCredit = 0;
  let totalCustomSources = 0;

  safeSales.forEach(record => {
    const revenue = calculateSalesRevenue(record, revenueSources);
    totalSales += revenue.total;
    totalCash += revenue.cash;
    totalNetwork += revenue.network;
    totalCredit += revenue.credit;
    totalCustomSources += revenue.customSources;
  });

  const totalPurchaseCost = safePurchases.reduce(
    (sum, record) => sum + (Number(record?.total_amount) || (Number(record?.qty) || 0) * (Number(record?.used_price ?? record?.current_price) || 0)),
    0,
  );

  const isFixedExpense = expense => Boolean(expense?._is_fixed || expense?.is_fixed);
  const amountOf = expense => Number(expense?.amount) || 0;
  const totalFixedExpenses = safeMonthlyExpenses
    .filter(isFixedExpense)
    .reduce((sum, expense) => sum + amountOf(expense), 0);
  const totalVariableExpenses = safePeriodExpenses
    .filter(expense => !isFixedExpense(expense))
    .reduce((sum, expense) => sum + amountOf(expense), 0);

  const accountingDate = asOfDate ? new Date(`${asOfDate}T12:00:00`) : new Date();
  const calendarDays = Number.isNaN(accountingDate.getTime())
    ? new Date().getDate()
    : new Date(accountingDate.getFullYear(), accountingDate.getMonth() + 1, 0).getDate();
  const defaultPeriodDays = rangeType === 'day' ? 1 : rangeType === 'week' ? 7 : calendarDays;
  const periodDays = Math.max(1, Number(daysInPeriod) || defaultPeriodDays);

  let fixedDeduction = totalFixedExpenses;
  if (rangeType === 'day' || rangeType === 'week') {
    fixedDeduction = (totalFixedExpenses / calendarDays) * periodDays;
  }

  const totalExpenses = totalVariableExpenses + fixedDeduction;
  const grossProfit = totalSales - totalPurchaseCost;
  const netProfit = grossProfit - totalExpenses;
  const margin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
  const netMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;
  const creditPct = totalSales > 0 ? (totalCredit / totalSales) * 100 : 0;

  return {
    totalSales,
    totalCredit,
    totalCash,
    totalNetwork,
    totalAdditionalSources: totalCustomSources,
    totalPurchaseCost,
    totalExpenses,
    totalExpensesAll: totalFixedExpenses + totalVariableExpenses,
    totalFixedExpenses,
    totalVariableExpenses,
    fixedDeduction,
    fixedExpensesExcluded: (rangeType === 'day' || rangeType === 'week') && totalFixedExpenses > 0,
    calendarDays,
    periodDays,
    profit: grossProfit,
    grossProfit,
    netProfit,
    margin,
    netMargin,
    creditPct,
  };
}

/**
 * Backwards-compatible dashboard wrapper.  All callers now delegate to the
 * shared ERP accounting engine and may provide the calendar-month fixed pool
 * in the optional final argument.
 */
export function computeDashboardMetrics(
  sales,
  purchases,
  expenses = [],
  rangeType = 'month',
  revenueSources = [],
  daysInPeriod = null,
  daysInMonth = null,
  options = {},
) {
  const asOfDate = options.asOfDate || null;
  const metrics = calculateERPAccounting({
    sales,
    purchases,
    periodExpenses: expenses,
    monthlyExpenses: options.monthlyExpenses || expenses,
    rangeType,
    revenueSources,
    daysInPeriod,
    asOfDate,
  });

  if (daysInMonth && (rangeType === 'day' || rangeType === 'week')) {
    const fixedDeduction = (metrics.totalFixedExpenses / Number(daysInMonth)) * metrics.periodDays;
    const totalExpenses = metrics.totalVariableExpenses + fixedDeduction;
    const netProfit = metrics.grossProfit - totalExpenses;
    return {
      ...metrics,
      calendarDays: Number(daysInMonth),
      fixedDeduction,
      totalExpenses,
      netProfit,
      netMargin: metrics.totalSales > 0 ? (netProfit / metrics.totalSales) * 100 : 0,
    };
  }

  return metrics;
}

export function computeBranchMetrics(sales, purchases, expenses, branchKey) {
  const bs = sales.filter(s => s.branch === branchKey);
  const bp = purchases.filter(p => p.branch === branchKey);
  const be = expenses.filter(e => e.branch === branchKey || e.branch === 'all');
  return computeDashboardMetrics(bs, bp, be);
}

export function formatCurrency(val, currency = '$') {
  if (val === undefined || val === null) return `${currency}0`;
  return `${currency}${Number(val).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatPct(val) {
  if (val === undefined || val === null) return '0%';
  return `${Number(val).toFixed(1)}%`;
}

/**
 * calculateSalesRevenue
 *
 * Calculates total revenue from a single sales record, respecting SalesSource configuration.
 * Parses sales_sources_json and applies included_in_revenue flags.
 *
 * @param {Object} record - Sales record with restaurant_cash, restaurant_network, credit, sales_sources_json
 * @param {Array} revenueSources - Array of SalesSource objects with included_in_revenue flags
 * @returns {Object} { cash, network, credit, customSources, total }
 */
export function calculateSalesRevenue(record, revenueSources = []) {
  const cash = getSaleCash(record);
  const network = getSaleNetwork(record);
  const credit = Number(record.credit) || 0;

  // Check if base sources should be included in revenue
  const cashIncluded = !revenueSources.length || revenueSources.find(s => s.system_key === 'cash')?.included_in_revenue !== false;
  const networkIncluded = !revenueSources.length || revenueSources.find(s => s.system_key === 'network')?.included_in_revenue !== false;
  const creditIncluded = !revenueSources.length || revenueSources.find(s => s.system_key === 'credit')?.included_in_revenue !== false;

  const baseSales = (cashIncluded ? cash : 0) + (networkIncluded ? network : 0) + (creditIncluded ? credit : 0);

  // Parse custom sources from sales_sources_json
  let customSources = 0;
  const rawSources = record?.sales_sources_json;

  if (rawSources) {
    try {
      let entries = [];
      if (typeof rawSources === 'string') {
        entries = JSON.parse(rawSources);
      } else if (Array.isArray(rawSources)) {
        entries = rawSources;
      } else if (typeof rawSources === 'object') {
        entries = [rawSources];
      }

      if (Array.isArray(entries)) {
        entries.forEach(e => {
          if (!e) return;
          const sourceId = e.source_id || e.source_key;
          const sourceConfig = revenueSources?.find(s => s.id === sourceId || s.source_key === sourceId);
          // Include if no config found (default) or if explicitly included
          if (!sourceConfig || sourceConfig.included_in_revenue !== false) {
            customSources += Number(e.amount || 0);
          }
        });
      }
    } catch (err) {
      console.warn('Failed to parse sales_sources_json:', err);
    }
  }

  const total = baseSales + customSources;

  return {
    cash: cashIncluded ? cash : 0,
    network: networkIncluded ? network : 0,
    credit: creditIncluded ? credit : 0,
    customSources,
    total,
    // Raw values for reference
    rawCash: cash,
    rawNetwork: network,
    rawCredit: credit,
  };
}

export function buildDailyProfitTrend(sales, purchases, revenueSources = []) {
  const map = {};
  (sales || []).forEach(s => {
    if (!s || !s.date) return;
    if (!map[s.date]) map[s.date] = { sales: 0, cost: 0 };
    const revenue = calculateSalesRevenue(s, revenueSources);
    map[s.date].sales += (revenue?.total || 0);
  });
  (purchases || []).forEach(p => {
    if (!p || !p.date) return;
    if (!map[p.date]) map[p.date] = { sales: 0, cost: 0 };
    map[p.date].cost += (Number(p.total_amount) || (Number(p.qty) || 0) * (Number(p.used_price || p.current_price) || 0));
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, profit: (v.sales || 0) - (v.cost || 0), sales: v.sales || 0, cost: v.cost || 0 }));
}

/**
 * tagExpensesWithCategories
 *
 * Tags each expense record with `_is_fixed = true` when its category
 * has `is_fixed = true`. This is required before passing expenses to
 * `computeDashboardMetrics` so that fixed-expense daily proration works.
 *
 * @param {Array} expenses - Raw expense records from Supabase
 * @param {Array} categories - ExpenseCategory records with `id` and `is_fixed`
 * @returns {Array} expenses with `_is_fixed` property set
 */
export function tagExpensesWithCategories(expenses = [], categories = []) {
  if (!categories || categories.length === 0) return expenses;
  const catMap = {};
  categories.forEach(c => {
    if (c && c.id) catMap[c.id] = c;
  });
  return expenses.map(e => ({
    ...e,
    _is_fixed: !!(catMap[e.category_id]?.is_fixed || catMap[e.expense_category_id]?.is_fixed),
  }));
}

/**
 * computePurchaseKPIs
 *
 * Computes purchase KPIs from approved supplier invoices.
 * Respects branch filter and date range.
 *
 * @param {Array} invoices - SupplierInvoice records
 * @param {string} branchKey - 'all' or specific branch key
 * @param {string} todayStr - 'yyyy-MM-dd' string for today
 * @param {string} monthStartStr - 'yyyy-MM-dd' string for month start
 * @returns {Object} { todayAmt, todayCount, monthAmt, monthCount, supplierRanking }
 */
export function computePurchaseKPIs(invoices = [], branchKey = 'all', todayStr = '', monthStartStr = '') {
  const approved = invoices.filter(inv => {
    const isApproved = ['approved', 'auto_approved'].includes(inv.approval_status)
      || ['approved', 'paid', 'partial'].includes(inv.status);
    const isBranchMatch = branchKey === 'all' || inv.branch === branchKey;
    return isApproved && isBranchMatch;
  });

  const todayList = approved.filter(inv => inv.date === todayStr);
  const todayAmt = todayList.reduce((s, inv) => s + (Number(inv.total_amount) || 0), 0);
  const todayCount = todayList.length;

  const monthList = approved.filter(inv => inv.date >= monthStartStr && inv.date <= todayStr);
  const monthAmt = monthList.reduce((s, inv) => s + (Number(inv.total_amount) || 0), 0);
  const monthCount = monthList.length;

  // Supplier ranking
  const supplierMap = {};
  approved.forEach(inv => {
    const name = inv.supplier_name || 'Unknown';
    if (!supplierMap[name]) supplierMap[name] = { amount: 0, count: 0 };
    supplierMap[name].amount += (Number(inv.total_amount) || 0);
    supplierMap[name].count += 1;
  });
  const supplierRanking = Object.entries(supplierMap)
    .map(([name, v]) => ({ name, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return { todayAmt, todayCount, monthAmt, monthCount, supplierRanking };
}

/**
 * computeProductQuantityAnalytics
 *
 * Computes product quantity consumption from supplier invoice items (JSONB).
 * Each supplier_invoice has an `items` array with:
 *   { product_id, product_name, unit, quantity, unit_cost, line_total, ... }
 *
 * @param {Array}  invoices         - SupplierInvoice records (with items JSONB)
 * @param {string} branchKey        - 'all' or specific branch key
 * @param {string} todayStr         - 'yyyy-MM-dd' string for today
 * @param {string} monthStartStr    - 'yyyy-MM-dd' string for start of current month
 * @param {string} prevMonthStartStr - 'yyyy-MM-dd' string for start of previous month
 * @param {string} prevMonthEndStr  - 'yyyy-MM-dd' string for end of previous month (exclusive)
 * @returns {Object} {
 *   todayProducts:   [{ productName, productId, unit, totalQuantity, totalCost }],
 *   monthlyProducts: [{ productName, productId, unit, totalQuantity, totalCost }],
 *   prevMonthProducts: [{ productName, productId, unit, totalQuantity, totalCost }],
 *   combinedProducts: [{ productName, productId, unit, todayQty, monthQty, prevMonthQty,
 *                        monthCost, prevMonthCost, diff, trend }],
 *   topConsumedToday,   // product with highest quantity today
 *   topConsumedMonth,   // product with highest quantity this month
 *   topConsumedPrevMonth, // product with highest quantity previous month
 *   highestCostToday,   // product with highest cost today
 *   highestCostMonth,   // product with highest cost this month
 *   fastestGrowing,     // product with highest positive month-over-month growth
 *   mostReduced,        // product with highest negative month-over-month change
 *   weeklyTrend,        // [{ date, totalQuantity, totalCost }] last 7 days
 * }
 */
export function computeProductQuantityAnalytics(
  invoices = [],
  branchKey = 'all',
  todayStr = '',
  monthStartStr = '',
  prevMonthStartStr = '',
  prevMonthEndStr = ''
) {
  // Filter by branch (all invoices count for consumption, no approval filter needed)
  const branchFiltered = branchKey === 'all'
    ? invoices
    : invoices.filter(inv => inv.branch === branchKey);

  // Aggregate items from a list of invoices into product totals
  function aggregateItems(invList) {
    const productMap = {};
    invList.forEach(inv => {
      const items = Array.isArray(inv.items) ? inv.items : [];
      items.forEach(item => {
        if (!item) return;
        const name = (item.product_name || '').trim() || 'Unknown Product';
        const pid  = item.product_id || name;
        const qty  = Number(item.quantity) || 0;
        const cost = Number(item.line_total) || (qty * (Number(item.unit_cost) || 0));
        const unit = (item.unit || '').trim() || 'unit';
        if (!productMap[pid]) {
          productMap[pid] = { productName: name, productId: pid, totalQuantity: 0, unit, totalCost: 0 };
        }
        productMap[pid].totalQuantity += qty;
        productMap[pid].totalCost     += cost;
        // Keep most descriptive unit
        if (unit && unit !== 'unit') productMap[pid].unit = unit;
      });
    });
    return Object.values(productMap).sort((a, b) => b.totalQuantity - a.totalQuantity);
  }

  // Today's invoices
  const todayInvs   = branchFiltered.filter(inv => inv.date === todayStr);
  const todayProducts = aggregateItems(todayInvs);

  // Monthly invoices (current month)
  const monthInvs      = branchFiltered.filter(inv => inv.date >= monthStartStr && inv.date <= todayStr);
  const monthlyProducts = aggregateItems(monthInvs);

  // Previous month invoices
  const prevMonthInvs = prevMonthStartStr
    ? branchFiltered.filter(inv => inv.date >= prevMonthStartStr && inv.date < (prevMonthEndStr || monthStartStr))
    : [];
  const prevMonthProducts = aggregateItems(prevMonthInvs);

  // Build combined product map: merge today + current month + prev month per product
  const combinedMap = {};
  const allProductIds = new Set([
    ...todayProducts.map(p => p.productId),
    ...monthlyProducts.map(p => p.productId),
    ...prevMonthProducts.map(p => p.productId),
  ]);
  allProductIds.forEach(pid => {
    const todayP     = todayProducts.find(p => p.productId === pid);
    const monthP     = monthlyProducts.find(p => p.productId === pid);
    const prevMonthP = prevMonthProducts.find(p => p.productId === pid);
    const productName = (todayP || monthP || prevMonthP)?.productName || 'Unknown';
    const unit        = (todayP || monthP || prevMonthP)?.unit || 'unit';
    const todayQty     = todayP?.totalQuantity     || 0;
    const monthQty     = monthP?.totalQuantity     || 0;
    const prevMonthQty = prevMonthP?.totalQuantity || 0;
    const monthCost     = monthP?.totalCost     || 0;
    const prevMonthCost = prevMonthP?.totalCost || 0;
    const diff = monthQty - prevMonthQty;
    const trend = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
    combinedMap[pid] = { productId: pid, productName, unit, todayQty, monthQty, prevMonthQty, monthCost, prevMonthCost, diff, trend };
  });
  // Sort by current month quantity descending
  const combinedProducts = Object.values(combinedMap).sort((a, b) => b.monthQty - a.monthQty);

  // Top consumed (by quantity)
  const topConsumedToday     = todayProducts[0] || null;
  const topConsumedMonth     = monthlyProducts[0] || null;
  const topConsumedPrevMonth = prevMonthProducts[0] || null;

  // Highest cost product (current month)
  const highestCostToday = todayProducts.length > 0
    ? [...todayProducts].sort((a, b) => b.totalCost - a.totalCost)[0]
    : null;
  const highestCostMonth = monthlyProducts.length > 0
    ? [...monthlyProducts].sort((a, b) => b.totalCost - a.totalCost)[0]
    : null;

  // Fastest growing consumption (highest positive month-over-month diff)
  const fastestGrowing = combinedProducts.filter(p => p.diff > 0).sort((a, b) => b.diff - a.diff)[0] || null;

  // Most reduced consumption (highest negative month-over-month diff)
  const mostReduced = combinedProducts.filter(p => p.diff < 0).sort((a, b) => a.diff - b.diff)[0] || null;

  // Weekly trend — last 7 days, daily totals
  const weeklyTrend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStr + 'T00:00:00');
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayInvs  = branchFiltered.filter(inv => inv.date === dateStr);
    const dayItems = dayInvs.flatMap(inv => Array.isArray(inv.items) ? inv.items : []);
    const totalQuantity = dayItems.reduce((s, it) => s + (Number(it?.quantity) || 0), 0);
    const totalCost     = dayItems.reduce((s, it) => {
      const qty  = Number(it?.quantity) || 0;
      const cost = Number(it?.line_total) || (qty * (Number(it?.unit_cost) || 0));
      return s + cost;
    }, 0);
    weeklyTrend.push({ date: dateStr, totalQuantity, totalCost });
  }

  return {
    todayProducts,
    monthlyProducts,
    prevMonthProducts,
    combinedProducts,
    topConsumedToday,
    topConsumedMonth,
    topConsumedPrevMonth,
    highestCostToday,
    highestCostMonth,
    fastestGrowing,
    mostReduced,
    weeklyTrend,
  };
}
