import {
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from 'date-fns';

const CONSUMPTION_TYPES = new Set(['recipe_consumption', 'sale', 'stock_out']);

export const OWNER_PRICE_TARGET_MARGIN = 35;
export const OWNER_REPORT_PERIOD_KEYS = ['today', 'week', 'month', 'six-months', 'year'];

export function buildOwnerReportPeriod(periodKey = 'today', now = new Date()) {
  const key = OWNER_REPORT_PERIOD_KEYS.includes(periodKey) ? periodKey : 'today';
  const currentEnd = startOfDay(now);
  let currentStart = currentEnd;
  let previousStart;
  let previousEnd;

  if (key === 'week') {
    currentStart = startOfWeek(currentEnd, { weekStartsOn: 0 });
    previousStart = subDays(currentStart, 7);
    previousEnd = subDays(currentStart, 1);
  } else if (key === 'month') {
    currentStart = startOfMonth(currentEnd);
    previousStart = startOfMonth(subMonths(currentEnd, 1));
    previousEnd = new Date(
      previousStart.getFullYear(),
      previousStart.getMonth(),
      Math.min(currentEnd.getDate(), endOfMonth(previousStart).getDate()),
    );
  } else if (key === 'six-months') {
    currentStart = startOfMonth(subMonths(currentEnd, 5));
    previousStart = startOfMonth(subMonths(currentEnd, 11));
    previousEnd = subMonths(currentEnd, 6);
  } else if (key === 'year') {
    currentStart = startOfYear(currentEnd);
    previousStart = startOfYear(subYears(currentEnd, 1));
    previousEnd = subYears(currentEnd, 1);
  } else {
    previousStart = subDays(currentEnd, 1);
    previousEnd = previousStart;
  }

  const daysInPeriod = differenceInCalendarDays(currentEnd, currentStart) + 1;
  return {
    key,
    rangeType: key === 'today' ? 'day' : key === 'week' ? 'week' : 'month',
    daysInPeriod,
    currentStart: format(currentStart, 'yyyy-MM-dd'),
    currentEnd: format(currentEnd, 'yyyy-MM-dd'),
    previousStart: format(previousStart, 'yyyy-MM-dd'),
    previousEnd: format(previousEnd, 'yyyy-MM-dd'),
    currentStartIso: startOfDay(currentStart).toISOString(),
    currentEndIso: endOfDay(currentEnd).toISOString(),
    previousStartIso: startOfDay(previousStart).toISOString(),
    previousEndIso: endOfDay(previousEnd).toISOString(),
  };
}

export function reportNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function productKey(record) {
  return String(record?.product_id || record?.id || record?.product_name || record?.name || 'unknown');
}

function productName(product) {
  return product?.name || product?.product_name || product?.name_en || product?.name_fa || 'Unknown product';
}

function productUnit(product, fallback = 'unit') {
  return product?.unit || product?.unit_name || product?.unit_abbreviation || fallback;
}

function buildProductMap(products = []) {
  const map = new Map();
  products.forEach((product) => {
    if (product?.id) map.set(String(product.id), product);
    if (product?.product_id) map.set(String(product.product_id), product);
  });
  return map;
}

export function buildInventoryConsumption(transactions = [], products = [], inventory = []) {
  const productMap = buildProductMap(products);
  const stockMap = new Map();

  (inventory || []).forEach((item) => {
    const key = productKey(item);
    const current = stockMap.get(key) || 0;
    stockMap.set(key, current + reportNumber(item.current_stock ?? item.quantity ?? item.opening_stock));
  });

  const usageMap = new Map();
  let wasteQuantity = 0;
  let wasteCost = 0;

  (transactions || []).forEach((transaction) => {
    const type = String(transaction?.transaction_type || transaction?.type || '').toLowerCase();
    const quantity = Math.abs(reportNumber(transaction?.quantity));
    if (quantity <= 0) return;

    const product = productMap.get(productKey(transaction)) || transaction;
    const cost = reportNumber(transaction?.unit_cost)
      || reportNumber(product?.purchase_cost ?? product?.default_cost);

    if (type === 'waste') {
      wasteQuantity += quantity;
      wasteCost += quantity * cost;
      return;
    }

    if (!CONSUMPTION_TYPES.has(type)) return;
    const key = productKey(transaction);
    const current = usageMap.get(key) || {
      productId: key,
      name: productName(product),
      unit: productUnit(product, transaction?.unit || 'unit'),
      quantity: 0,
      cost: 0,
      stock: stockMap.has(key) ? stockMap.get(key) : null,
    };
    current.quantity += quantity;
    current.cost += quantity * cost;
    usageMap.set(key, current);
  });

  const items = Array.from(usageMap.values()).sort((left, right) => right.cost - left.cost || right.quantity - left.quantity);
  return {
    items,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    totalCost: items.reduce((sum, item) => sum + item.cost, 0),
    wasteQuantity,
    wasteCost,
  };
}

export function buildInventoryOverview(inventory = [], products = []) {
  const productMap = buildProductMap(products);
  let totalValue = 0;
  let lowStock = 0;
  let outOfStock = 0;

  (inventory || []).forEach((item) => {
    const product = productMap.get(productKey(item)) || item;
    const quantity = reportNumber(item.current_stock ?? item.quantity ?? item.opening_stock);
    const threshold = reportNumber(item.low_stock_threshold ?? item.min_quantity ?? item.reorder_point ?? product?.min_stock);
    const cost = reportNumber(item.unit_cost ?? item.purchase_cost ?? product?.purchase_cost ?? product?.default_cost);
    totalValue += Math.max(0, quantity) * cost;
    if (quantity <= 0) outOfStock += 1;
    else if (threshold > 0 && quantity <= threshold) lowStock += 1;
  });

  return { totalValue, lowStock, outOfStock, skuCount: (products || []).length };
}

function latestHistoryByProduct(history = []) {
  const latest = new Map();
  [...(history || [])]
    .sort((left, right) => new Date(right.recorded_at || 0) - new Date(left.recorded_at || 0))
    .forEach((row) => {
      const key = productKey(row);
      if (!latest.has(key)) latest.set(key, row);
    });
  return latest;
}

export function buildPriceControlReport(products = [], history = [], targetMargin = OWNER_PRICE_TARGET_MARGIN) {
  const latestHistory = latestHistoryByProduct(history);
  const rows = (products || []).map((product) => {
    const key = productKey(product);
    const latest = latestHistory.get(key) || latestHistory.get(String(product?.id || ''));
    const cost = reportNumber(latest?.new_price)
      || reportNumber(product?.purchase_cost ?? product?.default_cost);
    const sellingPrice = reportNumber(product?.selling_price ?? product?.default_price);
    const margin = sellingPrice > 0 ? ((sellingPrice - cost) / sellingPrice) * 100 : null;
    const suggestedPrice = cost > 0 && targetMargin < 100 ? cost / (1 - targetMargin / 100) : null;
    const costChangePct = latest?.pct_change == null ? null : reportNumber(latest.pct_change);
    const status = margin == null
      ? 'no-data'
      : margin >= targetMargin
        ? 'healthy'
        : margin >= targetMargin - 8
          ? 'watch'
          : 'critical';
    return {
      productId: key,
      name: productName(product),
      unit: productUnit(product),
      cost,
      sellingPrice,
      margin,
      suggestedPrice,
      costChangePct,
      supplier: latest?.supplier_name || null,
      branch: latest?.branch || null,
      recordedAt: latest?.recorded_at || null,
      status,
    };
  }).sort((left, right) => {
    const priority = { critical: 0, watch: 1, healthy: 2, 'no-data': 3 };
    return priority[left.status] - priority[right.status] || (left.margin ?? 999) - (right.margin ?? 999);
  });

  const pricedRows = rows.filter((row) => row.margin != null);
  const changedRows = (history || []).filter((row) => reportNumber(row.difference) !== 0);
  return {
    rows,
    targetMargin,
    averageMargin: pricedRows.length
      ? pricedRows.reduce((sum, row) => sum + row.margin, 0) / pricedRows.length
      : null,
    healthyCount: rows.filter((row) => row.status === 'healthy').length,
    watchCount: rows.filter((row) => row.status === 'watch').length,
    criticalCount: rows.filter((row) => row.status === 'critical').length,
    missingDataCount: rows.filter((row) => row.status === 'no-data').length,
    increaseCount: changedRows.filter((row) => reportNumber(row.difference) > 0).length,
    decreaseCount: changedRows.filter((row) => reportNumber(row.difference) < 0).length,
    changedProductCount: new Set(changedRows.map(productKey)).size,
  };
}

export function buildSupplierPriceComparisons(history = []) {
  const latestByProductSupplier = new Map();
  [...(history || [])]
    .sort((left, right) => new Date(right.recorded_at || 0) - new Date(left.recorded_at || 0))
    .forEach((row) => {
      if (!row?.supplier_name || reportNumber(row?.new_price) <= 0) return;
      const key = `${productKey(row)}::${String(row.supplier_name).toLowerCase()}`;
      if (!latestByProductSupplier.has(key)) latestByProductSupplier.set(key, row);
    });

  const grouped = new Map();
  latestByProductSupplier.forEach((row) => {
    const key = productKey(row);
    const group = grouped.get(key) || { productId: key, name: productName(row), offers: [] };
    group.offers.push({
      supplier: row.supplier_name,
      price: reportNumber(row.new_price),
      branch: row.branch || null,
      recordedAt: row.recorded_at || null,
    });
    grouped.set(key, group);
  });

  return Array.from(grouped.values())
    .filter((group) => group.offers.length > 1)
    .map((group) => {
      const offers = [...group.offers].sort((left, right) => left.price - right.price);
      return {
        ...group,
        offers,
        best: offers[0],
        highest: offers[offers.length - 1],
        saving: offers[offers.length - 1].price - offers[0].price,
      };
    })
    .sort((left, right) => right.saving - left.saving);
}

export function buildBranchPriceInconsistencies(history = []) {
  const latestByProductBranch = new Map();
  [...(history || [])]
    .sort((left, right) => new Date(right.recorded_at || 0) - new Date(left.recorded_at || 0))
    .forEach((row) => {
      if (!row?.branch || reportNumber(row?.new_price) <= 0) return;
      const key = `${productKey(row)}::${String(row.branch).toLowerCase()}`;
      if (!latestByProductBranch.has(key)) latestByProductBranch.set(key, row);
    });

  const grouped = new Map();
  latestByProductBranch.forEach((row) => {
    const key = productKey(row);
    const group = grouped.get(key) || { productId: key, name: productName(row), branches: [] };
    group.branches.push({ branch: row.branch, price: reportNumber(row.new_price) });
    grouped.set(key, group);
  });

  return Array.from(grouped.values())
    .filter((group) => group.branches.length > 1)
    .map((group) => {
      const prices = group.branches.map((branch) => branch.price);
      return { ...group, spread: Math.max(...prices) - Math.min(...prices) };
    })
    .filter((group) => group.spread > 0)
    .sort((left, right) => right.spread - left.spread);
}

export function groupExpensesByCategory(expenses = [], categories = []) {
  const categoryMap = new Map((categories || []).map((category) => [String(category.id), category.name || category.label || 'Other']));
  const totals = new Map();
  (expenses || []).forEach((expense) => {
    const categoryId = expense?.category_id || expense?.expense_category_id;
    const name = categoryMap.get(String(categoryId)) || expense?.category || expense?.category_name || 'Other';
    totals.set(name, (totals.get(name) || 0) + reportNumber(expense?.amount));
  });
  return Array.from(totals, ([name, amount]) => ({ name, amount }))
    .sort((left, right) => right.amount - left.amount);
}

export function aggregateDailyRevenue(sales = [], revenueForRecord = () => 0) {
  const totals = new Map();
  (sales || []).forEach((sale) => {
    if (!sale?.date) return;
    totals.set(sale.date, (totals.get(sale.date) || 0) + reportNumber(revenueForRecord(sale)));
  });
  return Array.from(totals, ([date, salesTotal]) => ({ date, sales: salesTotal }))
    .sort((left, right) => left.date.localeCompare(right.date));
}
