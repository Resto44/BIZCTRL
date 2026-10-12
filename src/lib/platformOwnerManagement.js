const LOCALES = { en: 'en-US', ar: 'ar-SA', fa: 'fa-IR' };
export const PLATFORM_STATUS_OPTIONS = {
  subscriptions: ['TRIAL', 'ACTIVE', 'PENDING_PAYMENT', 'EXPIRED', 'CANCELED', 'SUSPENDED', 'PAST_DUE'],
  users: ['approved', 'pending', 'rejected'],
  payments: ['pending', 'paid', 'rejected', 'failed', 'refunded'],
};
export function formatPlatformMoney(cents, lang = 'en', code = 'USD') {
  if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return '—';
  const unit = String(code || 'USD').trim().toUpperCase();
  try {
    return new Intl.NumberFormat(LOCALES[lang] || LOCALES.en, {
      style: 'currency', currency: unit, currencyDisplay: 'code', maximumFractionDigits: 2,
    }).format(Number(cents) / 100);
  } catch { return '—'; }
}
const integer = (value, min, max = Number.MAX_SAFE_INTEGER) =>
  value !== null && value !== undefined && typeof value !== 'boolean' && String(value).trim() !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
export function validPlatformPlan(form) {
  return Boolean(form && /^[a-z0-9][a-z0-9_-]{1,62}$/.test(form.id) && form.displayName?.trim() &&
    /^[A-Z]{3}$/.test(form.currency || '') &&
    ['monthlyPriceCents','yearlyPriceCents','originalPriceCents'].every(key => integer(form[key], 0, 2147483647)) &&
    Number(form.originalPriceCents) >= Number(form.monthlyPriceCents) &&
    integer(form.billingPeriodMonths, 1, 12) && integer(form.trialDays, 0, 90) &&
    Object.values(form.limits || {}).every(value => integer(value, -1, 2147483647)));
}
export function validPlatformPromotion(promotion, plans = []) {
  const start = new Date(promotion.startsAt).getTime(), end = new Date(promotion.endsAt).getTime();
  return Boolean(promotion.name?.trim() && plans.some(p => p.id === promotion.planId && p.is_active !== false) &&
    integer(promotion.percentOff, 1, 100) && Number.isFinite(start) && Number.isFinite(end) && end > start &&
    (!promotion.maxRedemptions || integer(promotion.maxRedemptions, 1, 2147483647)));
}
export const validTrialDays = value => integer(value, 1, 90);
