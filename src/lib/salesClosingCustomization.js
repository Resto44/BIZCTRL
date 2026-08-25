export const SALES_CLOSING_FIELD_TYPES = [
  'currency', 'number', 'text', 'long_text', 'dropdown', 'date', 'time',
  'checkbox', 'sales_source', 'payment_method', 'customer', 'branch',
  'cashier', 'shift', 'notes',
];

export const CORE_SALES_CLOSING_FIELDS = new Set([
  'branch', 'date', 'shift', 'cashier', 'cash_reconciliation',
]);

export const DEFAULT_SALES_CLOSING_CONFIG = {
  version: 1,
  calculations: { automatic_totals: true },
  validation_rules: { require_cash_reconciliation: true },
  permissions: { owner_only_customization: true },
  layout: { mobile_summary: true, desktop_summary: true },
};

export function normalizeSalesClosingConfig(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ...DEFAULT_SALES_CLOSING_CONFIG,
    ...input,
    calculations: { ...DEFAULT_SALES_CLOSING_CONFIG.calculations, ...(input.calculations || {}) },
    validation_rules: { ...DEFAULT_SALES_CLOSING_CONFIG.validation_rules, ...(input.validation_rules || {}) },
    permissions: { ...DEFAULT_SALES_CLOSING_CONFIG.permissions, ...(input.permissions || {}) },
    layout: { ...DEFAULT_SALES_CLOSING_CONFIG.layout, ...(input.layout || {}) },
  };
}

export function salesClosingFieldKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

export function normalizeSalesClosingField(field, index = 0) {
  const type = SALES_CLOSING_FIELD_TYPES.includes(field?.field_type) ? field.field_type : 'text';
  const label_en = String(field?.label_en || '').trim();
  return {
    id: field?.id || '',
    // New custom fields derive a durable key from their required English label.
    // Explicit keys retain precedence so editing a saved field never changes its
    // historical identity or causes a uniqueness conflict.
    field_key: salesClosingFieldKey(field?.field_key) || salesClosingFieldKey(label_en),
    label_en,
    label_ar: String(field?.label_ar || '').trim(),
    help_text: String(field?.help_text || '').trim(),
    field_type: type,
    options: Array.isArray(field?.options) ? field.options.map((option) => String(option).trim()).filter(Boolean) : [],
    sort_order: Number.isFinite(Number(field?.sort_order)) ? Number(field.sort_order) : index * 10,
    is_active: field?.is_active !== false,
    is_required: Boolean(field?.is_required),
    visible_mobile: field?.visible_mobile !== false,
    visible_desktop: field?.visible_desktop !== false,
    is_system: Boolean(field?.is_system),
  };
}

export function sortSalesClosingFields(fields) {
  return [...(Array.isArray(fields) ? fields : [])]
    .map(normalizeSalesClosingField)
    .sort((a, b) => a.sort_order - b.sort_order || a.label_en.localeCompare(b.label_en));
}

export function isSalesClosingFieldVisible(field, viewport = 'all') {
  if (!field || field.is_active === false) return false;
  if (viewport === 'mobile') return field.visible_mobile !== false;
  if (viewport === 'desktop') return field.visible_desktop !== false;
  return true;
}

export function newSalesClosingCustomField(order = 0) {
  return normalizeSalesClosingField({
    field_key: '',
    label_en: '',
    label_ar: '',
    help_text: '',
    field_type: 'text',
    options: [],
    sort_order: order,
    is_active: true,
    is_required: false,
    visible_mobile: true,
    visible_desktop: true,
    is_system: false,
  }, order);
}
