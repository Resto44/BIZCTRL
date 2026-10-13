import { translateInterface } from './translateInterface.js';
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

export function money(cents, lang = 'en') {
  return new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : lang === 'ar' ? 'ar-SA' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(cents || 0) / 100);
}

export function monthlyLabel(plan, lang = 'en') {
  const months = Number(plan?.billing_period_months || 1);
  if (lang === 'fa') return months === 1 ? '/ماه' : `هر ${months} ماه`;
  if (lang === 'ar') return months === 1 ? '/شهر' : `كل ${months} أشهر`;
  return months === 1 ? '/month' : `every ${months} months`;
}

export function hasDiscount(plan) {
  return Boolean(plan?.discount_active) && Number(plan?.original_price_cents) > Number(plan?.monthly_price_cents);
}

export function discountLabel(plan, lang = 'en') {
  const label = plan?.discount_label || (hasDiscount(plan) ? `${Number(plan?.discount_percent || 0)}% OFF` : '');
  const match = String(label).match(/^(\d+(?:\.\d+)?)% OFF$/i);
  if (match && lang !== 'en') return `${match[1]}٪ ${lang === 'fa' ? 'تخفیف' : 'خصم'}`;
  return translateInterface(label, lang);
}

export function trialDays(plan) {
  return Math.max(0, Number(plan?.trial_days || 0));
}

export function trialDisclosure(plan, lang = 'en') {
  const days = trialDays(plan);
  if (!days) return '';
  if (lang === 'fa') return `ماه اول رایگان (${days} روز آزمایشی). پس از ماه رایگان، اشتراک با ${money(plan?.monthly_price_cents, lang)}${monthlyLabel(plan, lang)} تمدید می‌شود، مگر اینکه لغو شود.`;
  if (lang === 'ar') return `الشهر الأول مجاناً (${days} يوماً تجريبياً). بعد الشهر المجاني، يتجدد اشتراكك بسعر ${money(plan?.monthly_price_cents, lang)}${monthlyLabel(plan, lang)} ما لم يتم إلغاؤه.`;
  return `First month free (${days}-day trial). After the free month, your subscription renews at ${money(plan?.monthly_price_cents)}${monthlyLabel(plan)} unless cancelled.`;
}

export function billingProductLabel(plan, lang = 'en') {
  if (lang !== 'en') return `${translateInterface(plan?.display_name || 'BizCTRL', lang)} · ${monthlyLabel(plan, lang)}`;
  const key = String(plan?.billing_product_key || '').trim();
  if (key) return key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `${plan?.display_name || 'BizCTRL'} Monthly`;
}

export function planFeatures(plan, lang = 'en') {
  const flags = Array.isArray(plan?.feature_flags) ? plan.feature_flags : [];
  return (flags.includes('all')
    ? ['All ERP modules included']
    : flags.map((feature) => PLAN_FEATURE_LABELS[feature] || String(feature).replaceAll('_', ' '))).map(label => translateInterface(label, lang));
}

export function planCapacities(plan, lang = 'en') {
  return [
    Number(plan?.max_users) > 0 ? `${plan.max_users} users` : null,
    Number(plan?.max_branches) > 0 ? `${plan.max_branches} branches` : null,
    Number(plan?.max_employees) > 0 ? `${plan.max_employees} employees` : null,
  ].filter(Boolean).map(label => lang === 'en' ? label : label.replace(/users|branches|employees/g, word => ({fa:{users:'کاربر',branches:'شعبه',employees:'کارمند'},ar:{users:'مستخدمين',branches:'فروع',employees:'موظفين'}}[lang]?.[word] || word)));
}
