export const PUBLIC_PLAN_FIELDS = 'id, display_name, monthly_price_cents, original_price_cents, discount_percent, discount_active, discount_label, trial_days, billing_period_months, billing_product_key, paddle_price_id, max_branches, max_employees, max_users, feature_flags, sort_order';

export const PLAN_FEATURE_LABELS = {
  sales: 'Sales management',
  purchases: 'Purchasing',
  expenses: 'Expense management',
  inventory: 'Inventory management',
  basic_reports: 'Business reports',
  treasury: 'Treasury and finance',
  suppliers: 'Supplier management',
  reports: 'Reports and analytics',
  pdf_exports: 'PDF exports',
  ocr: 'Document processing',
  advanced_analytics: 'Advanced analytics',
  driver_analytics: 'Driver analytics',
  scheduled_reports: 'Scheduled reports',
  cashflow_forecast: 'Cash-flow forecasting',
  network_management: 'Network management',
  ai_copilot: 'AI business copilot',
};

export function money(cents) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(cents || 0) / 100);
}

export function monthlyLabel(plan) {
  return Number(plan?.billing_period_months || 1) === 1 ? '/month' : `every ${Number(plan?.billing_period_months || 1)} months`;
}

export function hasDiscount(plan) {
  return Boolean(plan?.discount_active) && Number(plan?.original_price_cents) > Number(plan?.monthly_price_cents);
}

export function discountLabel(plan) {
  return plan?.discount_label || (hasDiscount(plan) ? `${Number(plan?.discount_percent || 0)}% OFF` : '');
}

export function trialDays(plan) {
  return Math.max(0, Number(plan?.trial_days || 0));
}

export function trialDisclosure(plan) {
  const days = trialDays(plan);
  if (!days) return '';
  return `${days}-day free trial. After the trial, your subscription renews at ${money(plan?.monthly_price_cents)}${monthlyLabel(plan)} unless cancelled.`;
}

export function billingProductLabel(plan) {
  const key = String(plan?.billing_product_key || '').trim();
  if (key) return key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `${plan?.display_name || 'BizCTRL'} Monthly`;
}

export function planFeatures(plan) {
  const flags = Array.isArray(plan?.feature_flags) ? plan.feature_flags : [];
  return flags.includes('all')
    ? ['All ERP modules included']
    : flags.map((feature) => PLAN_FEATURE_LABELS[feature] || String(feature).replaceAll('_', ' '));
}

export function planCapacities(plan) {
  return [
    Number(plan?.max_users) > 0 ? `${plan.max_users} users` : null,
    Number(plan?.max_branches) > 0 ? `${plan.max_branches} branches` : null,
    Number(plan?.max_employees) > 0 ? `${plan.max_employees} employees` : null,
  ].filter(Boolean);
}
