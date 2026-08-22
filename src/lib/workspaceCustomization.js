export const WORKSPACE_CUSTOMIZATION_VERSION = 1;

export const WORKSPACE_SECTION_KEYS = Object.freeze([
  'navigation',
  'labels',
  'fields',
  'forms',
  'tables',
  'reports',
  'workflows',
  'notifications',
  'regional',
  'documents',
]);

export const CUSTOM_FIELD_TYPES = Object.freeze([
  'text',
  'number',
  'decimal',
  'currency',
  'date',
  'datetime',
  'boolean',
  'multiselect',
  'email',
  'phone',
  'url',
  'long_text',
]);

export const PRODUCT_FIELD_KEYS = Object.freeze([
  'name', 'sku', 'barcode', 'brand', 'description', 'status',
]);

export const PRODUCT_TABLE_COLUMNS = Object.freeze([
  { key: 'name', label: 'Product name', required: true },
  { key: 'sku', label: 'SKU' },
  { key: 'category', label: 'Category' },
  { key: 'selling_price', label: 'Selling price' },
  { key: 'current_stock', label: 'Stock' },
  { key: 'status', label: 'Status' },
]);

export const WORKSPACE_NAVIGATION_PATHS = Object.freeze([
  '/owner-command-center', '/sales-dashboard', '/ceo-dashboard',
  '/sales', '/sales-invoices', '/purchases', '/purchase-orders', '/expenses',
  '/inventory', '/inventory-transfers', '/inventory-waste', '/products',
  '/suppliers', '/supplier-portal', '/treasury', '/profit-loss', '/cashflow',
  '/balance-sheet', '/debt-management', '/network-management', '/payroll',
  '/employees', '/employee-attendance', '/employee-control', '/reports',
  '/oracle-analytics', '/branch-analytics', '/alerts', '/branch-management',
  '/role-permissions', '/restaurants', '/settings', '/erp-approval-center',
  '/notifications', '/customize-workspace',
]);

export const DEFAULT_WORKSPACE_CUSTOMIZATION = Object.freeze({
  version: WORKSPACE_CUSTOMIZATION_VERSION,
  navigation: { hidden_paths: [], order: [] },
  labels: {},
  fields: { products: [] },
  forms: { products: { hidden_fields: [], required_fields: [], order: PRODUCT_FIELD_KEYS } },
  tables: {
    products: {
      visible_columns: PRODUCT_TABLE_COLUMNS.map((column) => column.key),
      order: PRODUCT_TABLE_COLUMNS.map((column) => column.key),
      default_sort: 'name',
      default_sort_direction: 'asc',
    },
  },
  reports: { default_date_range: 'month', visible_sections: [] },
  workflows: { purchases: { enabled_states: ['draft', 'submitted', 'approved', 'received'] } },
  notifications: { low_stock_enabled: true, low_stock_threshold: 0 },
  regional: { language: 'en', currency_display: 'symbol', decimal_places: 2, date_format: 'YYYY-MM-DD', first_day_of_week: 'monday' },
  documents: { sales_pattern: 'INV-{YYYYMMDD}-{SEQ:4}', purchase_pattern: 'PUR-{YYYYMMDD}-{SEQ:4}' },
});

const MAX_TEXT_LENGTH = 160;
const safeArray = (value) => Array.isArray(value) ? value : [];
const safeObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const uniqueStrings = (value, allowed = null) => [...new Set(
  safeArray(value)
    .filter((item) => typeof item === 'string')
    .filter((item) => !allowed || allowed.includes(item)),
)];
const orderedKeys = (configured, fallback, allowed) => {
  const permitted = uniqueStrings(configured, allowed);
  return [...permitted, ...fallback.filter((key) => !permitted.includes(key))];
};

export function sanitizePlainText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return '';
  if (/<\s*\/?(?:script|iframe|object|embed|style)\b|javascript\s*:/i.test(trimmed)) return '';
  return trimmed;
}

function normalizeCustomField(field, index) {
  const source = safeObject(field);
  const id = sanitizePlainText(source.id, 72).replace(/[^a-zA-Z0-9_-]/g, '');
  const label = sanitizePlainText(source.label, 80);
  const type = CUSTOM_FIELD_TYPES.includes(source.type) ? source.type : 'text';
  if (!id || !label) return null;
  return {
    id,
    label,
    type,
    placeholder: sanitizePlainText(source.placeholder, 120),
    default_value: typeof source.default_value === 'string' || typeof source.default_value === 'boolean' || typeof source.default_value === 'number'
      ? source.default_value
      : '',
    required: Boolean(source.required),
    visible: source.visible !== false,
    searchable: Boolean(source.searchable),
    sortable: Boolean(source.sortable),
    filterable: Boolean(source.filterable),
    options: uniqueStrings(source.options).map((option) => sanitizePlainText(option, 80)).filter(Boolean).slice(0, 30),
    order: Number.isInteger(source.order) ? source.order : index,
  };
}

export function normalizeWorkspaceCustomization(value) {
  const source = safeObject(value);
  const navigation = safeObject(source.navigation);
  const labels = Object.fromEntries(
    Object.entries(safeObject(source.labels))
      .filter(([key, label]) => typeof key === 'string' && sanitizePlainText(label, 80))
      .map(([key, label]) => [key, sanitizePlainText(label, 80)]),
  );
  const productFields = safeArray(safeObject(source.fields).products)
    .map(normalizeCustomField)
    .filter(Boolean)
    .slice(0, 25)
    .sort((a, b) => a.order - b.order);
  const forms = safeObject(source.forms);
  const productForm = safeObject(forms.products);
  const tables = safeObject(source.tables);
  const productTable = safeObject(tables.products);
  const reports = safeObject(source.reports);
  const workflows = safeObject(source.workflows);
  const purchaseWorkflow = safeObject(workflows.purchases);
  const notifications = safeObject(source.notifications);
  const regional = safeObject(source.regional);
  const documents = safeObject(source.documents);

  const configuredProductColumns = uniqueStrings(productTable.visible_columns, PRODUCT_TABLE_COLUMNS.map((column) => column.key));
  const productTableOrder = orderedKeys(
    productTable.order,
    PRODUCT_TABLE_COLUMNS.map((column) => column.key),
    PRODUCT_TABLE_COLUMNS.map((column) => column.key),
  );

  return {
    version: WORKSPACE_CUSTOMIZATION_VERSION,
    navigation: {
      hidden_paths: uniqueStrings(navigation.hidden_paths, WORKSPACE_NAVIGATION_PATHS),
      order: uniqueStrings(navigation.order, WORKSPACE_NAVIGATION_PATHS),
    },
    labels,
    fields: { products: productFields },
    forms: {
      products: {
        hidden_fields: uniqueStrings(productForm.hidden_fields, PRODUCT_FIELD_KEYS),
        required_fields: uniqueStrings(productForm.required_fields, PRODUCT_FIELD_KEYS),
        order: orderedKeys(productForm.order, PRODUCT_FIELD_KEYS, PRODUCT_FIELD_KEYS),
      },
    },
    tables: {
      products: {
        visible_columns: configuredProductColumns.length ? configuredProductColumns : PRODUCT_TABLE_COLUMNS.map((column) => column.key),
        order: productTableOrder,
        default_sort: PRODUCT_TABLE_COLUMNS.some((column) => column.key === productTable.default_sort) ? productTable.default_sort : 'name',
        default_sort_direction: productTable.default_sort_direction === 'desc' ? 'desc' : 'asc',
      },
    },
    reports: {
      default_date_range: ['today', 'week', 'month', 'quarter', 'year'].includes(reports.default_date_range) ? reports.default_date_range : 'month',
      visible_sections: uniqueStrings(reports.visible_sections),
    },
    workflows: {
      purchases: {
        enabled_states: uniqueStrings(purchaseWorkflow.enabled_states, ['draft', 'submitted', 'approved', 'received', 'paid']).length
          ? uniqueStrings(purchaseWorkflow.enabled_states, ['draft', 'submitted', 'approved', 'received', 'paid'])
          : ['draft', 'submitted', 'approved', 'received'],
      },
    },
    notifications: {
      low_stock_enabled: notifications.low_stock_enabled !== false,
      low_stock_threshold: Math.max(0, Math.min(999999, Number(notifications.low_stock_threshold) || 0)),
    },
    regional: {
      language: ['en', 'ar', 'fa'].includes(regional.language) ? regional.language : 'en',
      currency_display: ['symbol', 'code'].includes(regional.currency_display) ? regional.currency_display : 'symbol',
      decimal_places: Math.max(0, Math.min(4, Number.isInteger(regional.decimal_places) ? regional.decimal_places : 2)),
      date_format: ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'].includes(regional.date_format) ? regional.date_format : 'YYYY-MM-DD',
      first_day_of_week: ['monday', 'sunday', 'saturday'].includes(regional.first_day_of_week) ? regional.first_day_of_week : 'monday',
    },
    documents: {
      sales_pattern: ['INV-{YYYYMMDD}-{SEQ:4}', 'INV-{YYYY}-{SEQ:6}'].includes(documents.sales_pattern) ? documents.sales_pattern : 'INV-{YYYYMMDD}-{SEQ:4}',
      purchase_pattern: ['PUR-{YYYYMMDD}-{SEQ:4}', 'PUR-{YYYY}-{SEQ:6}'].includes(documents.purchase_pattern) ? documents.purchase_pattern : 'PUR-{YYYYMMDD}-{SEQ:4}',
    },
  };
}

export function mergeWorkspaceCustomization(current, patch) {
  const merge = (base, update) => ({ ...safeObject(base), ...safeObject(update) });
  const base = normalizeWorkspaceCustomization(current);
  const next = merge(base, patch);
  next.navigation = merge(base.navigation, patch?.navigation);
  next.fields = merge(base.fields, patch?.fields);
  next.forms = merge(base.forms, patch?.forms);
  next.forms.products = merge(base.forms.products, patch?.forms?.products);
  next.tables = merge(base.tables, patch?.tables);
  next.tables.products = merge(base.tables.products, patch?.tables?.products);
  next.reports = merge(base.reports, patch?.reports);
  next.workflows = merge(base.workflows, patch?.workflows);
  next.workflows.purchases = merge(base.workflows.purchases, patch?.workflows?.purchases);
  next.notifications = merge(base.notifications, patch?.notifications);
  next.regional = merge(base.regional, patch?.regional);
  next.documents = merge(base.documents, patch?.documents);
  next.labels = merge(base.labels, patch?.labels);
  return normalizeWorkspaceCustomization(next);
}

export function getWorkspaceLabel(config, defaultLabel) {
  const replacement = config?.labels?.[defaultLabel];
  return sanitizePlainText(replacement, 80) || defaultLabel;
}

export function reorderList(items, item, direction) {
  const current = [...items];
  const index = current.indexOf(item);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= current.length) return current;
  [current[index], current[target]] = [current[target], current[index]];
  return current;
}

export function isProductFieldVisible(config, fieldKey) {
  return !config?.forms?.products?.hidden_fields?.includes(fieldKey);
}

export function isProductFieldRequired(config, fieldKey) {
  return config?.forms?.products?.required_fields?.includes(fieldKey);
}

export function getProductCustomFields(config) {
  return safeArray(config?.fields?.products).filter((field) => field.visible !== false);
}

export function getCustomizedNavigationGroups(groups, config) {
  const hiddenPaths = new Set(config?.navigation?.hidden_paths || []);
  const order = config?.navigation?.order || [];
  const rank = new Map(order.map((path, index) => [path, index]));
  return groups
    .map((group) => ({
      ...group,
      label: getWorkspaceLabel(config, group.label),
      items: group.items
        .filter((item) => !hiddenPaths.has(item.path))
        .map((item) => ({ ...item, label: getWorkspaceLabel(config, item.label) }))
        .sort((a, b) => (rank.get(a.path) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.path) ?? Number.MAX_SAFE_INTEGER)),
    }))
    .filter((group) => group.items.length > 0);
}
