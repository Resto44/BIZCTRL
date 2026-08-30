export const ERP_MASTER_KEY = '__erp_master';

export const PRODUCT_MASTER_STEPS = [
  { id: 'identity', label: 'Identity' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'advanced', label: 'Advanced' },
];

export const DEFAULT_ERP_MASTER = {
  product_type: 'stock',
  costing_method: 'weighted_average',
  wholesale_price: '',
  minimum_selling_price: '',
  price_includes_tax: false,
  discount_allowed: true,
  maximum_discount: '',
  branch_price_override: false,
  price_change_alert_percent: '5',
  price_change_requires_approval: true,
  track_inventory: true,
  allow_negative_stock: false,
  batch_tracking: false,
  expiry_tracking: false,
  serial_tracking: false,
  unit_conversions: [],
  lead_time_days: '',
  minimum_order_qty: '',
  automatic_purchase_suggestion: true,
  sellable: true,
  purchasable: true,
  returnable: true,
  requires_manager_approval: false,
  pos_visibility: 'all',
  purchase_limit: '',
  sales_account: '4100 · Product Sales',
  inventory_account: '1200 · Inventory Asset',
  cogs_account: '5100 · Cost of Goods Sold',
  stock_variance_account: '5200 · Stock Variance',
  owner_access: 'edit',
  manager_access: 'stock',
  employee_access: 'view',
  child_category_id: '',
  branch_par_levels: {},
};

export function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function calculateProductPricing(purchaseCost, sellingPrice) {
  const cost = Math.max(0, toFiniteNumber(purchaseCost));
  const price = Math.max(0, toFiniteNumber(sellingPrice));
  const profit = price - cost;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  const markup = cost > 0 ? (profit / cost) * 100 : 0;
  return { cost, price, profit, margin, markup };
}

export function mergeErpMaster(initial) {
  const saved = initial?.custom_attributes?.[ERP_MASTER_KEY];
  return {
    ...DEFAULT_ERP_MASTER,
    ...(saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}),
    unit_conversions: Array.isArray(saved?.unit_conversions) ? saved.unit_conversions : [],
    branch_par_levels: saved?.branch_par_levels && typeof saved.branch_par_levels === 'object'
      ? saved.branch_par_levels
      : {},
  };
}

export function buildProductMasterPayload({
  form,
  erp,
  categories,
  restaurantId,
  customFields = [],
}) {
  const selectedCategory = categories.find((category) => category.id === form.category_id);
  const customAttributes = { ...(form.custom_attributes || {}) };

  customFields.forEach((field) => {
    if (field.type === 'boolean' && customAttributes[field.id] === undefined) {
      customAttributes[field.id] = Boolean(field.default_value);
    }
  });

  customAttributes[ERP_MASTER_KEY] = {
    ...erp,
    wholesale_price: toFiniteNumber(erp.wholesale_price),
    minimum_selling_price: toFiniteNumber(erp.minimum_selling_price),
    maximum_discount: toFiniteNumber(erp.maximum_discount),
    price_change_alert_percent: toFiniteNumber(erp.price_change_alert_percent, 5),
    lead_time_days: toFiniteNumber(erp.lead_time_days),
    minimum_order_qty: toFiniteNumber(erp.minimum_order_qty),
    purchase_limit: toFiniteNumber(erp.purchase_limit),
    unit_conversions: (erp.unit_conversions || []).map((conversion) => ({
      from_unit: conversion.from_unit || form.unit || '',
      factor: Math.max(0, toFiniteNumber(conversion.factor, 1)),
      to_unit: conversion.to_unit || '',
      barcode: conversion.barcode || '',
    })),
  };

  return {
    name: form.name || form.name_en || form.name_ar,
    name_ar: form.name_ar || null,
    name_en: form.name_en || null,
    name_fa: form.name_fa || null,
    product_id: form.product_id,
    sku: form.sku || null,
    barcode: form.barcode || null,
    category_id: form.category_id || null,
    subcategory_id: form.subcategory_id || null,
    category: selectedCategory?.name || selectedCategory?.name_en || form.category || null,
    brand: form.brand || null,
    supplier_id: form.supplier_id || null,
    unit: form.unit || null,
    purchase_cost: Math.max(0, toFiniteNumber(form.purchase_cost)),
    selling_price: Math.max(0, toFiniteNumber(form.selling_price)),
    default_price: Math.max(0, toFiniteNumber(form.selling_price || form.default_price)),
    default_cost: Math.max(0, toFiniteNumber(form.purchase_cost || form.default_cost)),
    tax_rate: Math.min(100, Math.max(0, toFiniteNumber(form.tax_rate))),
    min_stock: Math.max(0, toFiniteNumber(form.min_stock)),
    max_stock: Math.max(0, toFiniteNumber(form.max_stock)),
    current_stock: Math.max(0, toFiniteNumber(form.current_stock)),
    description: form.description || null,
    image_url: form.image_url || null,
    status: form.status || 'active',
    is_active: form.status === 'active',
    restaurant_id: restaurantId,
    custom_attributes: customAttributes,
  };
}

export function validateBranchStocks(rows) {
  return (rows || []).every((row) => (
    toFiniteNumber(row.opening_stock) >= 0
    && toFiniteNumber(row.reorder_point) >= 0
    && toFiniteNumber(row.par_level) >= 0
  ));
}
