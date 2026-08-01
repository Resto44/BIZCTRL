import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  getDaysInMonth,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns';

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const text = (value) => String(value ?? '').trim();
const normal = (value) => text(value).toLowerCase();
const dateKey = (value) => text(value).slice(0, 10);
const amount = (record, keys = []) => {
  for (const key of keys) {
    if (record?.[key] !== undefined && record?.[key] !== null && record?.[key] !== '') {
      return number(record[key]);
    }
  }
  return 0;
};

const safeArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

function parseJSON(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'object') return [value];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : parsed ? [parsed] : [];
  } catch {
    return [];
  }
}

function noon(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  }
  const key = dateKey(value);
  if (!key) return new Date(NaN);
  return new Date(`${key}T12:00:00`);
}

function safeDate(value) {
  const parsed = noon(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatKey(value) {
  const parsed = safeDate(value);
  return parsed ? format(parsed, 'yyyy-MM-dd') : '';
}

function rangeDays(from, to) {
  const start = safeDate(from);
  const end = safeDate(to);
  if (!start || !end) return 1;
  return Math.max(1, differenceInCalendarDays(end, start) + 1);
}

function dateWithin(value, from, to) {
  const key = dateKey(value);
  return Boolean(key && key >= from && key <= to);
}

function getRecordDate(record, fields = ['date', 'sale_date', 'transaction_date', 'created_date']) {
  for (const field of fields) {
    const key = dateKey(record?.[field]);
    if (key) return key;
  }
  return '';
}

function isCancelled(record = {}) {
  const status = normal(record.status);
  return ['cancelled', 'canceled', 'rejected', 'void', 'voided', 'draft'].includes(status);
}

function isApprovedPurchase(record = {}) {
  const approval = normal(record.approval_status);
  const status = normal(record.status);
  if (approval) return ['approved', 'auto_approved'].includes(approval);
  if (status) return ['approved', 'paid', 'partial', 'received', 'complete', 'completed'].includes(status);
  return true;
}

function sourceIndex(sources = []) {
  const index = new Map();
  safeArray(sources).forEach((source) => {
    [source.id, source.source_key, source.system_key, source.name_en, source.name]
      .filter(Boolean)
      .forEach((key) => index.set(normal(key), source));
  });
  return index;
}

function classifyRevenueChannel(entry = {}, source = {}) {
  const descriptor = normal([
    entry.source_id,
    entry.source_key,
    entry.source_name,
    entry.name,
    entry.type,
    source.id,
    source.source_key,
    source.system_key,
    source.name_en,
    source.name,
    source.description,
  ].filter(Boolean).join(' '));

  if (/refund|return/.test(descriptor)) return 'returns';
  if (/discount/.test(descriptor)) return 'discounts';
  if (/wallet|loyalty|store credit/.test(descriptor)) return 'wallet';
  if (/delivery|driver|courier|talabat|deliveroo|noon/.test(descriptor)) return 'delivery';
  if (/online|website|web order|ecommerce|e-commerce/.test(descriptor)) return 'online';
  if (/credit|receivable/.test(descriptor)) return 'credit';
  if (/network|card|pos|visa|mastercard|mada/.test(descriptor)) return 'network';
  if (/cash/.test(descriptor)) return 'cash';
  return 'other';
}

function saleCash(record = {}) {
  const total = number(record.cash);
  const split = number(record.restaurant_cash) + number(record.driver_cash);
  if (total !== 0 || split === 0) return total;
  return split;
}

function saleNetwork(record = {}) {
  const total = number(record.network);
  const split = number(record.restaurant_network) + number(record.driver_network);
  if (total !== 0 || split === 0) return total;
  return split;
}

function salesRecordKey(record = {}) {
  return `${text(record.branch || record.branch_key || record.branch_id || '__global__')}|${getRecordDate(record)}`;
}

function classifyPurchase(category = '') {
  const value = normal(category);
  if (/packag|container|box|bag|cup|wrap/.test(value)) return 'packaging';
  if (/ingredient|raw|material|beverage|food|produce|meat|dairy|spice/.test(value)) return 'rawMaterial';
  return 'other';
}

function purchaseAmount(record = {}) {
  return amount(record, ['total_amount', 'amount', 'line_total'])
    || number(record.qty) * amount(record, ['used_price', 'current_price', 'unit_cost', 'price']);
}

function purchaseLines(record = {}) {
  const items = parseJSON(record.items);
  if (!items.length) {
    return [{
      name: record.product_name || record.invoice_number || record.notes || 'Unclassified purchase',
      category: record.category || record.product_category || '',
      value: purchaseAmount(record),
    }];
  }

  return items.map((item) => ({
    name: item.product_name || item.name || item.description || record.invoice_number || 'Purchase item',
    category: item.category || item.category_name || item.product_category || record.category || '',
    value: amount(item, ['line_total', 'total_amount', 'amount'])
      || number(item.quantity ?? item.qty) * amount(item, ['unit_cost', 'price', 'used_price']),
  }));
}

function isReturnRecord(record = {}, line = null) {
  const descriptor = normal([
    record.status,
    record.approval_status,
    record.notes,
    line?.name,
    line?.category,
  ].filter(Boolean).join(' '));
  return purchaseAmount(record) < 0 || number(line?.value) < 0 || /return|refund|credit note/.test(descriptor);
}

function categoryIndex(categories = []) {
  const index = new Map();
  safeArray(categories).forEach((category) => {
    [category.id, category.name, category.name_en, category.name_ar, category.name_fa]
      .filter(Boolean)
      .forEach((key) => index.set(normal(key), category));
  });
  return index;
}

function expenseCategory(record = {}, index) {
  const keys = [record.category_id, record.expense_category_id, record.category, record.category_name]
    .filter(Boolean)
    .map(normal);
  for (const key of keys) {
    if (index.has(key)) return index.get(key);
  }
  return {
    id: record.category_id || record.expense_category_id || record.category || 'uncategorized',
    name: record.category_name || record.category || 'Uncategorized',
    is_fixed: Boolean(record.is_fixed),
    expense_type: record.expense_type || '',
  };
}

function isFixedExpense(record = {}, category = {}) {
  if (record.is_fixed === true || category.is_fixed === true) return true;
  const type = normal(record.expense_type || category.expense_type);
  if (type === 'fixed') return true;
  if (type === 'variable') return false;
  const descriptor = normal([
    category.name,
    category.name_en,
    category.name_ar,
    record.category,
  ].filter(Boolean).join(' '));
  return /rent|salary|payroll|internet|electricity|water|insurance|license|licence|subscription/.test(descriptor);
}

function expenseLabel(record = {}, category = {}) {
  return text(category.name || category.name_en || category.name_ar || category.name_fa || record.category || 'Uncategorized');
}

function fixedBucket(label = '') {
  const value = normal(label);
  if (/rent|lease/.test(value)) return 'Rent';
  if (/salary|salar|payroll|wage/.test(value)) return 'Salary';
  if (/internet|wifi|telecom|phone/.test(value)) return 'Internet';
  if (/electric|power/.test(value)) return 'Electricity';
  if (/water/.test(value)) return 'Water';
  if (/insurance/.test(value)) return 'Insurance';
  if (/license|licence|permit/.test(value)) return 'Licenses';
  return label || 'Other Fixed Expenses';
}

function variableBucket(label = '') {
  const value = normal(label);
  if (/fuel|gasoline|diesel/.test(value)) return 'Fuel';
  if (/transport|shipping|delivery|logistic/.test(value)) return 'Transport';
  if (/maintenance|repair/.test(value)) return 'Maintenance';
  if (/clean/.test(value)) return 'Cleaning';
  if (/marketing|advert|promotion/.test(value)) return 'Marketing';
  return label || 'Miscellaneous';
}

function expenseCadence(record = {}, category = {}) {
  const value = normal([
    record.frequency,
    record.recurrence,
    record.cadence,
    record.periodicity,
    category.frequency,
    category.recurrence,
    category.cadence,
    category.name,
    category.name_en,
  ].filter(Boolean).join(' '));
  if (/year|annual/.test(value)) return 'yearly';
  if (/month|monthly/.test(value)) return 'monthly';
  return 'daily';
}

function addValue(target, key, value) {
  target[key] = number(target[key]) + number(value);
}

function totalValues(values = {}) {
  return Object.values(values).reduce((sum, value) => sum + number(value), 0);
}

function productIndex(products = []) {
  const index = new Map();
  safeArray(products).forEach((product) => {
    if (product.id) index.set(String(product.id), product);
    if (product.product_id) index.set(String(product.product_id), product);
  });
  return index;
}

function namedIndex(items = []) {
  const index = new Map();
  safeArray(items).forEach((item) => {
    if (item.id) index.set(String(item.id), item);
  });
  return index;
}

function topEntries(map, limit = 10) {
  return Object.entries(map)
    .map(([name, value]) => ({ name, value: number(value) }))
    .filter((item) => item.value !== 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function normalizeScope(scope = {}, branches = []) {
  const selected = new Set(safeArray(scope.branchKeys).map(String).filter(Boolean));
  const selectedIds = new Set();
  safeArray(branches).forEach((branch) => {
    const key = String(branch.key || branch.branch_key || '');
    if (selected.has(key) && branch.id) selectedIds.add(String(branch.id));
  });

  return {
    mode: scope.mode || 'organization',
    keys: selected,
    ids: selectedIds,
    includeGlobal: scope.includeGlobal !== false,
  };
}

function recordMatchesScope(record = {}, scope) {
  if (['organization', 'all'].includes(scope.mode)) return true;
  const values = [record.branch, record.branch_key, record.branch_id]
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map(String);
  if (!values.length) return scope.includeGlobal;
  if (values.some((value) => ['all', 'global', 'organization', 'org'].includes(normal(value)))) {
    return scope.includeGlobal;
  }
  return values.some((value) => scope.keys.has(value) || scope.ids.has(value));
}

function recordsInRange(records, from, to, scope, dateFields) {
  return safeArray(records).filter((record) => {
    const recordDate = getRecordDate(record, dateFields);
    return dateWithin(recordDate, from, to) && recordMatchesScope(record, scope);
  });
}

function recordsInScope(records, scope) {
  return safeArray(records).filter((record) => recordMatchesScope(record, scope));
}

function monthKey(value) {
  const key = dateKey(value);
  return key ? key.slice(0, 7) : '';
}

function monthRange(month) {
  const start = safeDate(`${month}-01`);
  if (!start) return null;
  return { from: format(start, 'yyyy-MM-dd'), to: format(endOfMonth(start), 'yyyy-MM-dd') };
}

function intersectDays(from, to, month) {
  const bounds = monthRange(month);
  if (!bounds) return 0;
  const start = safeDate(from > bounds.from ? from : bounds.from);
  const end = safeDate(to < bounds.to ? to : bounds.to);
  if (!start || !end || start > end) return 0;
  return differenceInCalendarDays(end, start) + 1;
}

function iterateMonths(from, to) {
  const start = safeDate(from);
  const end = safeDate(to);
  if (!start || !end) return [];
  const months = [];
  let cursor = startOfMonth(start);
  const last = startOfMonth(end);
  while (cursor <= last) {
    months.push(format(cursor, 'yyyy-MM'));
    cursor = addMonths(cursor, 1);
  }
  return months;
}

export function resolveFinancialDateRange(preset = 'month', customFrom, customTo, referenceDate = new Date()) {
  const now = noon(referenceDate);
  let from = now;
  let to = now;

  switch (preset) {
    case 'today':
      break;
    case 'yesterday':
      from = subDays(now, 1);
      to = from;
      break;
    case 'thisWeek':
      from = startOfWeek(now, { weekStartsOn: 6 });
      to = endOfWeek(now, { weekStartsOn: 6 });
      break;
    case 'lastWeek': {
      const previous = subDays(now, 7);
      from = startOfWeek(previous, { weekStartsOn: 6 });
      to = endOfWeek(previous, { weekStartsOn: 6 });
      break;
    }
    case 'lastMonth': {
      const previous = subMonths(now, 1);
      from = startOfMonth(previous);
      to = endOfMonth(previous);
      break;
    }
    case 'quarter':
      from = startOfQuarter(now);
      to = endOfQuarter(now);
      break;
    case 'year':
      from = startOfYear(now);
      to = endOfYear(now);
      break;
    case 'custom': {
      const customStart = safeDate(customFrom);
      const customEnd = safeDate(customTo);
      if (customStart && customEnd) {
        from = customStart <= customEnd ? customStart : customEnd;
        to = customStart <= customEnd ? customEnd : customStart;
      } else if (customStart) {
        from = customStart;
        to = customStart;
      }
      break;
    }
    case 'month':
    default:
      from = startOfMonth(now);
      to = endOfMonth(now);
      break;
  }

  return { from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd') };
}

export function previousFinancialDateRange(range) {
  const days = rangeDays(range?.from, range?.to);
  const currentStart = safeDate(range?.from);
  if (!currentStart) return resolveFinancialDateRange('month');
  const previousTo = subDays(currentStart, 1);
  const previousFrom = subDays(previousTo, days - 1);
  return { from: format(previousFrom, 'yyyy-MM-dd'), to: format(previousTo, 'yyyy-MM-dd') };
}

export function calculateFinancialReport({
  range,
  scope: rawScope,
  branches = [],
  sales = [],
  purchases = [],
  supplierInvoices = [],
  expenses = [],
  expenseCategories = [],
  salesSources = [],
  orders = [],
  orderItems = [],
  products = [],
  categories = [],
  customers = [],
  suppliers = [],
} = {}) {
  const from = range?.from || resolveFinancialDateRange('month').from;
  const to = range?.to || resolveFinancialDateRange('month').to;
  const scope = normalizeScope(rawScope, branches);
  const sourceByKey = sourceIndex(salesSources);
  const categoryByKey = categoryIndex(expenseCategories);
  const productById = productIndex(products);
  const productCategoryById = namedIndex(categories);
  const customerById = namedIndex(customers);
  const supplierById = namedIndex(suppliers);

  const currentSales = recordsInRange(sales, from, to, scope, ['date', 'sale_date', 'created_date']);
  const revenue = {
    cash: 0,
    network: 0,
    credit: 0,
    delivery: 0,
    online: 0,
    wallet: 0,
    other: 0,
    discounts: 0,
    returns: 0,
  };

  const accountedSaleDates = new Set();
  currentSales.forEach((record) => {
    accountedSaleDates.add(salesRecordKey(record));
    revenue.cash += saleCash(record);
    revenue.network += saleNetwork(record);
    revenue.credit += number(record.credit);
    revenue.discounts += Math.abs(amount(record, ['discount', 'discount_amount', 'discounts']));
    revenue.returns += Math.abs(amount(record, ['return_amount', 'refund_amount', 'returns']));

    parseJSON(record.sales_sources_json).forEach((entry) => {
      const lookupKey = normal(entry?.source_id || entry?.source_key || entry?.source_name || entry?.name);
      const source = sourceByKey.get(lookupKey) || {};
      if (source.included_in_revenue === false) return;
      const value = amount(entry, ['amount', 'value', 'total', 'payment_amount', 'sales_amount']);
      const channel = classifyRevenueChannel(entry, source);
      if (channel === 'returns' || channel === 'discounts') {
        revenue[channel] += Math.abs(value);
      } else {
        revenue[channel] += value;
      }
    });

    const unallocatedCustom = amount(record, ['custom_sources_total', 'custom_sources']);
    const configuredCustom = parseJSON(record.sales_sources_json)
      .reduce((sum, entry) => sum + amount(entry, ['amount', 'value', 'total', 'payment_amount', 'sales_amount']), 0);
    if (unallocatedCustom && !configuredCustom) revenue.other += unallocatedCustom;
  });

  const currentOrders = recordsInRange(orders, from, to, scope, ['order_date', 'created_date']);
  currentOrders.forEach((order) => {
    if (isCancelled(order)) return;
    const orderKey = `${text(order.branch || order.branch_key || order.branch_id || '__global__')}|${getRecordDate(order, ['order_date', 'created_date'])}`;
    if (accountedSaleDates.has(orderKey)) return;
    const gross = amount(order, ['total_amount', 'subtotal']);
    const discount = Math.abs(amount(order, ['discount', 'promo_discount']));
    const returned = Math.abs(amount(order, ['refund_amount']));
    const channel = classifyRevenueChannel({
      source_key: order.order_source || order.order_type,
      name: order.order_type,
    });
    revenue[channel] += gross;
    revenue.discounts += discount;
    revenue.returns += returned;
  });

  const grossRevenue = revenue.cash + revenue.network + revenue.credit + revenue.delivery + revenue.online + revenue.wallet + revenue.other;
  const netRevenue = grossRevenue - revenue.discounts - revenue.returns;

  const currentInvoices = recordsInRange(supplierInvoices, from, to, scope, ['date', 'created_date'])
    .filter(isApprovedPurchase);
  const includedInvoiceIds = new Set(currentInvoices.map((invoice) => String(invoice.id)).filter(Boolean));
  const currentPurchases = recordsInRange(purchases, from, to, scope, ['date', 'created_date'])
    .filter((purchase) => !purchase.supplier_invoice_id || !includedInvoiceIds.has(String(purchase.supplier_invoice_id)));
  const purchaseRecords = [...currentInvoices, ...currentPurchases];
  const purchaseAnalysis = { rawMaterial: 0, packaging: 0, other: 0, returns: 0 };
  const supplierTotals = {};

  purchaseRecords.forEach((record) => {
    const supplier = text(record.supplier_name || supplierById.get(String(record.supplier_id))?.name || record.notes || 'Unspecified supplier');
    const recordTotal = purchaseAmount(record);
    if (recordTotal > 0) addValue(supplierTotals, supplier, recordTotal);
    purchaseLines(record).forEach((line) => {
      const value = number(line.value);
      if (isReturnRecord(record, line)) {
        purchaseAnalysis.returns += Math.abs(value || recordTotal);
        return;
      }
      addValue(purchaseAnalysis, classifyPurchase(line.category), Math.abs(value));
    });
  });

  const netPurchaseCost = purchaseAnalysis.rawMaterial + purchaseAnalysis.packaging + purchaseAnalysis.other - purchaseAnalysis.returns;

  const scopedExpenses = recordsInScope(expenses, scope);
  const fixedByMonth = new Map();
  scopedExpenses.forEach((expense) => {
    const category = expenseCategory(expense, categoryByKey);
    if (!isFixedExpense(expense, category)) return;
    const month = monthKey(getRecordDate(expense, ['date', 'created_date']));
    if (!month) return;
    if (!fixedByMonth.has(month)) fixedByMonth.set(month, []);
    fixedByMonth.get(month).push({ expense, category });
  });

  const fixedBreakdown = {};
  iterateMonths(from, to).forEach((month) => {
    const monthEntries = fixedByMonth.get(month) || [];
    if (!monthEntries.length) return;
    const days = intersectDays(from, to, month);
    const divisor = getDaysInMonth(safeDate(`${month}-01`));
    const allocation = days / divisor;
    monthEntries.forEach(({ expense, category }) => {
      addValue(fixedBreakdown, fixedBucket(expenseLabel(expense, category)), number(expense.amount) * allocation);
    });
  });

  const fixedExpense = totalValues(fixedBreakdown);
  const variableBreakdown = {};
  const variableCadence = { daily: 0, monthly: 0, yearly: 0 };
  const allExpenseBreakdown = { ...fixedBreakdown };
  recordsInRange(expenses, from, to, scope, ['date', 'created_date']).forEach((expense) => {
    const category = expenseCategory(expense, categoryByKey);
    if (isFixedExpense(expense, category)) return;
    const label = variableBucket(expenseLabel(expense, category));
    const value = number(expense.amount);
    addValue(variableBreakdown, label, value);
    addValue(allExpenseBreakdown, label, value);
    variableCadence[expenseCadence(expense, category)] += value;
  });

  const variableExpense = totalValues(variableBreakdown);
  const operatingExpense = fixedExpense + variableExpense;
  const cogs = netPurchaseCost;
  const grossProfit = netRevenue - cogs;
  const operatingProfit = grossProfit - operatingExpense;
  const netProfit = netRevenue - netPurchaseCost - fixedExpense - variableExpense;
  const days = rangeDays(from, to);

  const completedOrders = currentOrders.filter((order) => !isCancelled(order));
  const orderById = new Map(completedOrders.map((order) => [String(order.id), order]));
  const productTotals = {};
  const categoryTotals = {};
  safeArray(orderItems).forEach((item) => {
    const order = orderById.get(String(item.order_id));
    if (!order) return;
    const product = productById.get(String(item.product_id)) || {};
    const value = amount(item, ['total_price', 'line_total']) || number(item.quantity) * amount(item, ['unit_price', 'price']);
    const productName = text(product.name || product.name_en || item.product_name || item.product_id || 'Unspecified product');
    const category = productCategoryById.get(String(product.category_id)) || {};
    const categoryName = text(category.name_en || category.name || product.category || 'Uncategorized');
    addValue(productTotals, productName, value);
    addValue(categoryTotals, categoryName, value);
  });

  const customerTotals = {};
  completedOrders.forEach((order) => {
    const customer = customerById.get(String(order.customer_id)) || {};
    const customerName = text(customer.name || customer.full_name || customer.email || order.customer_name || order.customer_id || 'Walk-in customer');
    const value = amount(order, ['total_amount', 'subtotal']) - Math.abs(amount(order, ['refund_amount']));
    addValue(customerTotals, customerName, value);
  });

  return {
    range: { from, to },
    days,
    scope: rawScope || {},
    revenue: {
      ...revenue,
      grossRevenue,
      netRevenue,
    },
    purchases: {
      ...purchaseAnalysis,
      netPurchaseCost,
      cogs,
    },
    expenses: {
      fixed: fixedExpense,
      variable: variableExpense,
      operating: operatingExpense,
      fixedBreakdown,
      variableBreakdown,
      variableCadence,
      allBreakdown: allExpenseBreakdown,
    },
    profit: {
      grossProfit,
      operatingProfit,
      netProfit,
      grossMargin: netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0,
      operatingMargin: netRevenue > 0 ? (operatingProfit / netRevenue) * 100 : 0,
      netMargin: netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0,
      expenseRatio: netRevenue > 0 ? (operatingExpense / netRevenue) * 100 : 0,
      purchaseRatio: netRevenue > 0 ? (netPurchaseCost / netRevenue) * 100 : 0,
      averageDailyRevenue: netRevenue / days,
      averageDailyProfit: netProfit / days,
    },
    topLists: {
      products: topEntries(productTotals),
      categories: topEntries(categoryTotals),
      customers: topEntries(customerTotals),
      suppliers: topEntries(supplierTotals),
      expenseCategories: topEntries(allExpenseBreakdown),
    },
  };
}

export function buildFinancialTrend({
  trend = 'monthly',
  range,
  scope,
  branches = [],
  data = {},
} = {}) {
  const selectedRange = range || resolveFinancialDateRange('month');
  const end = safeDate(selectedRange.to) || new Date();
  const start = safeDate(selectedRange.from) || startOfMonth(end);
  const buckets = [];

  const addBucket = (from, to, label) => {
    buckets.push({ from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd'), label });
  };

  if (trend === 'daily') {
    const visibleStart = differenceInCalendarDays(end, start) > 30 ? subDays(end, 30) : start;
    for (let cursor = visibleStart; cursor <= end; cursor = addDays(cursor, 1)) {
      addBucket(cursor, cursor, format(cursor, 'dd MMM'));
    }
  } else if (trend === 'weekly') {
    const first = startOfWeek(start, { weekStartsOn: 6 });
    for (let cursor = first; cursor <= end; cursor = addDays(cursor, 7)) {
      const bucketEnd = endOfWeek(cursor, { weekStartsOn: 6 });
      addBucket(cursor, bucketEnd > end ? end : bucketEnd, format(cursor, 'dd MMM'));
    }
  } else if (trend === 'yearly') {
    const first = new Date(Math.min(start.getFullYear(), end.getFullYear() - 4), 0, 1, 12);
    for (let cursor = first; cursor <= end; cursor = new Date(cursor.getFullYear() + 1, 0, 1, 12)) {
      const bucketEnd = endOfYear(cursor);
      addBucket(cursor, bucketEnd > end ? end : bucketEnd, format(cursor, 'yyyy'));
    }
  } else {
    const count = trend === 'sixMonths' ? 6 : trend === 'twelveMonths' ? 12 : Math.max(1, differenceInCalendarDays(end, start) > 365 ? 12 : 6);
    const first = startOfMonth(subMonths(end, count - 1));
    for (let cursor = first; cursor <= end; cursor = addMonths(cursor, 1)) {
      const bucketEnd = endOfMonth(cursor);
      addBucket(cursor, bucketEnd > end ? end : bucketEnd, format(cursor, 'MMM yy'));
    }
  }

  return buckets.map((bucket) => {
    const report = calculateFinancialReport({ ...data, range: { from: bucket.from, to: bucket.to }, scope, branches });
    return {
      label: bucket.label,
      revenue: report.revenue.netRevenue,
      purchases: report.purchases.netPurchaseCost,
      fixedExpenses: report.expenses.fixed,
      variableExpenses: report.expenses.variable,
      grossProfit: report.profit.grossProfit,
      netProfit: report.profit.netProfit,
    };
  });
}

export function calculateBranchComparison({
  branches = [],
  range,
  previousRange,
  data = {},
  accessibleBranchKeys = [],
} = {}) {
  const visibleBranches = safeArray(branches).filter((branch) => {
    const key = String(branch.key || branch.branch_key || '');
    return !accessibleBranchKeys.length || accessibleBranchKeys.includes(key);
  });
  const directReports = visibleBranches.map((branch) => {
    const key = String(branch.key || branch.branch_key || '');
    const scope = { mode: 'single', branchKeys: [key], includeGlobal: false };
    const current = calculateFinancialReport({ ...data, range, scope, branches });
    const previous = calculateFinancialReport({ ...data, range: previousRange, scope, branches });
    return { branch, key, current, previous };
  });

  const organization = calculateFinancialReport({ ...data, range, scope: { mode: 'organization' }, branches });
  const directFixed = directReports.reduce((sum, entry) => sum + entry.current.expenses.fixed, 0);
  const directVariable = directReports.reduce((sum, entry) => sum + entry.current.expenses.variable, 0);
  const globalFixed = Math.max(0, organization.expenses.fixed - directFixed);
  const globalVariable = Math.max(0, organization.expenses.variable - directVariable);
  const totalRevenue = directReports.reduce((sum, entry) => sum + entry.current.revenue.netRevenue, 0);

  return directReports.map((entry, index) => {
    const share = totalRevenue > 0
      ? entry.current.revenue.netRevenue / totalRevenue
      : (directReports.length ? 1 / directReports.length : 0);
    const fixed = entry.current.expenses.fixed + (globalFixed * share);
    const variable = entry.current.expenses.variable + (globalVariable * share);
    const expenses = fixed + variable;
    const netProfit = entry.current.revenue.netRevenue - entry.current.purchases.netPurchaseCost - expenses;
    const previousRevenue = entry.previous.revenue.netRevenue;
    const growth = previousRevenue !== 0
      ? ((entry.current.revenue.netRevenue - previousRevenue) / Math.abs(previousRevenue)) * 100
      : 0;
    return {
      branch: entry.branch,
      key: entry.key,
      sales: entry.current.revenue.netRevenue,
      purchases: entry.current.purchases.netPurchaseCost,
      expenses,
      grossProfit: entry.current.revenue.netRevenue - entry.current.purchases.netPurchaseCost,
      netProfit,
      profitMargin: entry.current.revenue.netRevenue > 0 ? (netProfit / entry.current.revenue.netRevenue) * 100 : 0,
      growth,
      sourceIndex: index,
    };
  })
    .sort((a, b) => b.netProfit - a.netProfit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function formatFinancialPercentage(value) {
  return `${number(value).toFixed(1)}%`;
}

export function exportRows(report, comparison = []) {
  const rows = [
    ['Financial Analysis', `${report.range.from} to ${report.range.to}`],
    [],
    ['Revenue', 'Amount'],
    ['Cash Sales', report.revenue.cash],
    ['POS / Network Sales', report.revenue.network],
    ['Credit Sales', report.revenue.credit],
    ['Delivery Sales', report.revenue.delivery],
    ['Online Orders', report.revenue.online],
    ['Wallet Payments', report.revenue.wallet],
    ['Other Revenue', report.revenue.other],
    ['Discounts', -report.revenue.discounts],
    ['Returns', -report.revenue.returns],
    ['Net Revenue', report.revenue.netRevenue],
    [],
    ['Purchases', 'Amount'],
    ['Raw Material Purchases', report.purchases.rawMaterial],
    ['Packaging Purchases', report.purchases.packaging],
    ['Other Purchases', report.purchases.other],
    ['Purchase Returns', -report.purchases.returns],
    ['Net Purchase Cost', report.purchases.netPurchaseCost],
    ['COGS', report.purchases.cogs],
    [],
    ['Expenses', 'Amount'],
    ['Fixed Expenses', report.expenses.fixed],
    ['Variable Expenses', report.expenses.variable],
    ['Operating Expenses', report.expenses.operating],
    [],
    ['Profit', 'Amount'],
    ['Gross Profit', report.profit.grossProfit],
    ['Operating Profit', report.profit.operatingProfit],
    ['Net Profit', report.profit.netProfit],
    ['Gross Margin %', report.profit.grossMargin],
    ['Operating Margin %', report.profit.operatingMargin],
    ['Net Margin %', report.profit.netMargin],
  ];

  if (comparison.length) {
    rows.push([], ['Branch Comparison', 'Sales', 'Purchases', 'Expenses', 'Gross Profit', 'Net Profit', 'Profit Margin %', 'Growth %', 'Rank']);
    comparison.forEach((branch) => {
      rows.push([
        branch.branch?.label || branch.branch?.name || branch.key,
        branch.sales,
        branch.purchases,
        branch.expenses,
        branch.grossProfit,
        branch.netProfit,
        branch.profitMargin,
        branch.growth,
        branch.rank,
      ]);
    });
  }

  return rows;
}
