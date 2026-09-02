export const PRODUCT_PRICE_RULES_KEY = 'erp_product_price_rules_v1';

export const DEFAULT_PRODUCT_PRICE_RULES = Object.freeze({
  minimum_margin: 22,
  max_discount: 10,
  cost_change_review_percent: 5,
  branch_override_requires_approval: true,
  price_includes_vat: true,
  vat_rate: 15,
});

export function productNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseProductPriceRules(value) {
  if (!value) return { ...DEFAULT_PRODUCT_PRICE_RULES };
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return { ...DEFAULT_PRODUCT_PRICE_RULES, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULT_PRODUCT_PRICE_RULES };
  }
}

export function getProductErpMaster(product) {
  const value = product?.custom_attributes?.__erp_master;
  return value && typeof value === 'object' ? value : {};
}

export function getInventoryQuantity(row) {
  return productNumber(row?.quantity ?? row?.opening_stock ?? row?.current_stock);
}

export function getProductCost(product) {
  return Math.max(0, productNumber(product?.purchase_cost ?? product?.default_cost ?? product?.cost_price));
}

export function getProductPrice(product) {
  return Math.max(0, productNumber(product?.selling_price ?? product?.default_price ?? product?.price));
}

function productKeys(product) {
  return [product?.id, product?.product_id].filter(Boolean).map(String);
}

function sameProduct(row, product) {
  const rowId = String(row?.product_id || '');
  return rowId && productKeys(product).includes(rowId);
}

function sameBranch(row, branch) {
  if (!branch) return true;
  const branchValues = [branch.id, branch.key, branch.branch_key, branch.name, branch.label]
    .filter(Boolean)
    .map(String);
  return branchValues.includes(String(row?.branch_id || '')) || branchValues.includes(String(row?.branch || ''));
}

function latestPriceByProduct(history) {
  const map = new Map();
  for (const row of [...history].sort((left, right) => new Date(right?.recorded_at || 0) - new Date(left?.recorded_at || 0))) {
    const key = String(row?.product_id || '');
    if (key && !map.has(key)) map.set(key, row);
  }
  return map;
}

function aggregateAnalytics(analytics) {
  const map = new Map();
  for (const row of analytics) {
    const key = String(row?.product_id || '');
    if (!key) continue;
    const current = map.get(key) || { unitsSold: 0, revenue: 0, cost: 0, profit: 0 };
    current.unitsSold += productNumber(row?.units_sold);
    current.revenue += productNumber(row?.revenue);
    current.cost += productNumber(row?.cost_of_goods);
    current.profit += productNumber(row?.gross_profit);
    map.set(key, current);
  }
  return map;
}

function analyticsForProduct(map, product) {
  for (const key of productKeys(product)) {
    if (map.has(key)) return map.get(key);
  }
  return { unitsSold: 0, revenue: 0, cost: 0, profit: 0 };
}

function historyForProduct(map, product) {
  for (const key of productKeys(product)) {
    if (map.has(key)) return map.get(key);
  }
  return null;
}

function rowReorderPoint(row, product, erp) {
  return Math.max(0, productNumber(
    row?.low_stock_threshold
      ?? row?.min_stock_level
      ?? row?.reorder_point
      ?? product?.reorder_point
      ?? product?.min_stock
      ?? erp?.reorder_point,
  ));
}

function productLabel(product) {
  return product?.name || product?.name_en || product?.name_ar || product?.product_id || 'Unnamed product';
}

export function productTracksInventory(product) {
  const erp = getProductErpMaster(product);
  const productType = String(erp?.product_type || product?.product_type || 'stock').toLowerCase();
  return erp?.track_inventory !== false && !['service', 'non_stock', 'digital'].includes(productType);
}

export function productIdentity(product) {
  return String(product?.id || product?.product_id || product?.sku || productLabel(product));
}

export function buildProductControlSnapshot({
  products = [],
  inventory = [],
  branches = [],
  analytics = [],
  priceHistory = [],
  priceRules = DEFAULT_PRODUCT_PRICE_RULES,
} = {}) {
  const rules = parseProductPriceRules(priceRules);
  const analyticsMap = aggregateAnalytics(analytics);
  const priceMap = latestPriceByProduct(priceHistory);

  const productRows = products.map((product) => {
    const erp = getProductErpMaster(product);
    const tracksInventory = productTracksInventory(product);
    const inventoryRows = inventory.filter((row) => sameProduct(row, product));
    const quantity = inventoryRows.length
      ? inventoryRows.reduce((sum, row) => sum + getInventoryQuantity(row), 0)
      : productNumber(product?.current_stock);
    const reorderPoint = inventoryRows.length
      ? inventoryRows.reduce((sum, row) => sum + rowReorderPoint(row, product, erp), 0)
      : rowReorderPoint(null, product, erp);
    const cost = getProductCost(product);
    const price = getProductPrice(product);
    const unitProfit = price - cost;
    const margin = price > 0 ? (unitProfit / price) * 100 : 0;
    const value = quantity * cost;
    const stockStatus = !tracksInventory
      ? 'untracked'
      : quantity <= 0
        ? 'out'
        : reorderPoint > 0 && quantity <= reorderPoint
          ? 'low'
          : 'healthy';
    const latestPrice = historyForProduct(priceMap, product);
    const threshold = productNumber(erp?.price_change_alert_percent, rules.cost_change_review_percent);
    const costChange = Math.abs(productNumber(latestPrice?.pct_change));
    const minimumSellingPrice = Math.max(0, productNumber(erp?.minimum_selling_price));
    const minimumPriceViolation = minimumSellingPrice > 0 && price < minimumSellingPrice;
    const marginViolation = price > 0 && margin < productNumber(rules.minimum_margin);
    const costChangeReview = Boolean(erp?.price_change_requires_approval) && costChange >= threshold;
    const pricingStatus = minimumPriceViolation ? 'blocked' : marginViolation || costChangeReview ? 'review' : 'compliant';
    const metrics = analyticsForProduct(analyticsMap, product);

    return {
      product,
      label: productLabel(product),
      erp,
      tracksInventory,
      inventoryRows,
      quantity,
      reorderPoint,
      cost,
      price,
      unitProfit,
      margin,
      value,
      stockStatus,
      latestPrice,
      costChange,
      minimumSellingPrice,
      minimumPriceViolation,
      marginViolation,
      costChangeReview,
      pricingStatus,
      metrics,
    };
  });

  const totalProducts = productRows.length;
  const activeProducts = productRows.filter(({ product }) => (
    product?.status ? product.status === 'active' : product?.is_active !== false
  )).length;
  const lowStock = productRows.filter((row) => row.stockStatus === 'low').length;
  const outOfStock = productRows.filter((row) => row.stockStatus === 'out').length;
  const trackedProducts = productRows.filter((row) => row.tracksInventory);
  const healthy = trackedProducts.filter((row) => row.stockStatus === 'healthy').length;
  const inventoryValue = productRows.reduce((sum, row) => sum + row.value, 0);
  const pricedProducts = productRows.filter((row) => row.price > 0);
  const averageMargin = pricedProducts.length
    ? pricedProducts.reduce((sum, row) => sum + row.margin, 0) / pricedProducts.length
    : 0;
  const productsWithLedger = trackedProducts.filter((row) => row.inventoryRows.length || row.product?.current_stock !== undefined).length;
  const stockAccuracy = trackedProducts.length ? (productsWithLedger / trackedProducts.length) * 100 : 100;

  const branchMatrix = branches.map((branch) => {
    const branchRows = inventory.filter((row) => sameBranch(row, branch));
    let stockValue = 0;
    let low = 0;
    let out = 0;
    const productIds = new Set();
    for (const inventoryRow of branchRows) {
      const productRow = productRows.find((candidate) => sameProduct(inventoryRow, candidate.product));
      if (!productRow) continue;
      productIds.add(productRow.product?.id || productRow.product?.product_id);
      const quantity = getInventoryQuantity(inventoryRow);
      const threshold = rowReorderPoint(inventoryRow, productRow.product, productRow.erp);
      stockValue += quantity * productRow.cost;
      if (quantity <= 0) out += 1;
      else if (threshold > 0 && quantity <= threshold) low += 1;
    }
    const tracked = productIds.size;
    const health = tracked ? Math.max(0, Math.round(100 - ((out * 18 + low * 8) / tracked))) : null;
    return { branch, tracked, stockValue, low, out, health };
  });

  const replenishmentQueue = [];
  for (const row of productRows) {
    if (row.inventoryRows.length) {
      for (const inventoryRow of row.inventoryRows) {
        const quantity = getInventoryQuantity(inventoryRow);
        const threshold = rowReorderPoint(inventoryRow, row.product, row.erp);
        if (threshold > 0 && quantity <= threshold) {
          replenishmentQueue.push({
            ...row,
            branch: branches.find((branch) => sameBranch(inventoryRow, branch)),
            quantity,
            reorderPoint: threshold,
            recommendedQuantity: Math.max(0, productNumber(inventoryRow?.reorder_qty ?? row.erp?.minimum_order_quantity, threshold - quantity)),
          });
        }
      }
    } else if (row.reorderPoint > 0 && row.quantity <= row.reorderPoint) {
      replenishmentQueue.push({ ...row, branch: null, recommendedQuantity: Math.max(0, row.reorderPoint - row.quantity) });
    }
  }
  replenishmentQueue.sort((left, right) => (left.quantity - left.reorderPoint) - (right.quantity - right.reorderPoint));

  const financial = analytics.reduce((result, row) => {
    result.revenue += productNumber(row?.revenue);
    result.cost += productNumber(row?.cost_of_goods);
    result.profit += productNumber(row?.gross_profit);
    result.unitsSold += productNumber(row?.units_sold);
    return result;
  }, { revenue: 0, cost: 0, profit: 0, unitsSold: 0 });
  financial.margin = financial.revenue > 0 ? (financial.profit / financial.revenue) * 100 : averageMargin;

  const priceApprovalQueue = productRows
    .filter((row) => row.pricingStatus !== 'compliant')
    .map((row) => ({
      ...row,
      issue: row.minimumPriceViolation
        ? 'Below minimum price'
        : row.costChangeReview
          ? `Cost changed ${row.costChange.toFixed(1)}%`
          : `Margin ${row.margin.toFixed(1)}%`,
      suggestedPrice: Math.max(
        row.minimumSellingPrice,
        productNumber(rules.minimum_margin) >= 100 ? row.price : row.cost / (1 - productNumber(rules.minimum_margin) / 100),
      ),
    }))
    .sort((left, right) => (left.pricingStatus === 'blocked' ? -1 : 1) - (right.pricingStatus === 'blocked' ? -1 : 1));

  const categoryMap = new Map();
  for (const row of pricedProducts) {
    const category = row.product?.category || row.product?.category_name || 'Uncategorized';
    const current = categoryMap.get(category) || { name: category, marginTotal: 0, count: 0 };
    current.marginTotal += row.margin;
    current.count += 1;
    categoryMap.set(category, current);
  }
  const categoryMargins = [...categoryMap.values()]
    .map((row) => ({ ...row, margin: row.count ? row.marginTotal / row.count : 0 }))
    .sort((left, right) => right.margin - left.margin)
    .slice(0, 5);

  const duplicateSkuMap = new Map();
  for (const row of productRows) {
    const sku = String(row.product?.sku || row.product?.product_id || '').trim().toLowerCase();
    if (!sku) continue;
    duplicateSkuMap.set(sku, (duplicateSkuMap.get(sku) || 0) + 1);
  }
  const duplicateSkus = [...duplicateSkuMap.values()].reduce((count, occurrences) => (
    count + Math.max(0, occurrences - 1)
  ), 0);

  const criticalActions = [
    ...productRows.filter((row) => row.stockStatus === 'out').map((row) => ({ ...row, actionType: 'stock', issue: 'Out of stock', severity: 'critical' })),
    ...productRows.filter((row) => row.stockStatus === 'low').map((row) => ({ ...row, actionType: 'stock', issue: 'Low stock', severity: 'warning' })),
    ...priceApprovalQueue.map((row) => ({ ...row, actionType: 'price', severity: row.pricingStatus === 'blocked' ? 'critical' : 'warning' })),
  ].slice(0, 6);

  const topMovers = [...productRows]
    .sort((left, right) => (right.metrics.unitsSold || right.value) - (left.metrics.unitsSold || left.value))
    .slice(0, 5);

  const profitLeaders = [...productRows]
    .filter((row) => row.metrics.profit || row.unitProfit)
    .sort((left, right) => (right.metrics.profit || right.unitProfit) - (left.metrics.profit || left.unitProfit))
    .slice(0, 5);

  return {
    productRows,
    totalProducts,
    activeProducts,
    lowStock,
    outOfStock,
    healthy,
    inventoryValue,
    averageMargin,
    stockAccuracy,
    trackedProducts: trackedProducts.length,
    duplicateSkus,
    branchMatrix,
    replenishmentQueue,
    financial,
    priceApprovalQueue,
    priceControlStatus: {
      compliant: productRows.filter((row) => row.pricingStatus === 'compliant').length,
      review: productRows.filter((row) => row.pricingStatus === 'review').length,
      blocked: productRows.filter((row) => row.pricingStatus === 'blocked').length,
    },
    categoryMargins,
    criticalActions,
    topMovers,
    profitLeaders,
  };
}
