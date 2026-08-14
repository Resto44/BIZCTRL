export const SUPPORTED_LANGUAGES = Object.freeze([
  { code: 'en', nativeName: 'English', direction: 'ltr', locale: 'en-US' },
  { code: 'fa', nativeName: 'فارسی', direction: 'rtl', locale: 'fa-IR' },
  { code: 'ar', nativeName: 'العربية', direction: 'rtl', locale: 'ar-SA' },
]);

export const LANGUAGE_STORAGE_KEY = 'rc_lang';

const DATA_LABEL_KEYS = Object.freeze({
  cash: 'cash',
  network: 'network',
  pos: 'network',
  credit: 'credit',
  approved: 'approved',
  pending: 'pending',
  paid: 'paid',
  unpaid: 'unpaid',
  partial: 'partial',
  overdue: 'overdue',
  received: 'received',
  sent: 'sent',
  draft: 'draft',
  cancelled: 'cancelled',
  active: 'active',
  inactive: 'inactive',
  enabled: 'enabled',
  disabled: 'disabled',
  owner: 'owner',
  manager: 'manager',
  branch_manager: 'branch_manager',
  high: 'task_high',
  medium: 'task_medium',
  low: 'task_low',
  critical: 'severity_critical',
  warning: 'severity_warning',
  info: 'severity_info',
  open: 'status_open',
  resolved: 'resolved',
  closed: 'closed',
  completed: 'completed',
  processing: 'processing',
  present: 'present',
  absent: 'absent',
  late: 'late',
  vacation: 'vacation',
  rent: 'expense_rent',
  salaries: 'expense_salaries',
  utilities: 'expense_utilities',
  marketing: 'expense_marketing',
  maintenance: 'expense_maintenance',
  other: 'expense_other',
});

export function normalizeLanguage(language) {
  return SUPPORTED_LANGUAGES.some((item) => item.code === language) ? language : 'en';
}

export function getLanguageMeta(language) {
  return SUPPORTED_LANGUAGES.find((item) => item.code === normalizeLanguage(language)) || SUPPORTED_LANGUAGES[0];
}

export function interpolate(message, values = {}) {
  if (typeof message !== 'string') return message;
  return message.replace(/{{\s*([\w.-]+)\s*}}/g, (_match, key) => {
    const value = values[key];
    return value === null || value === undefined ? '' : String(value);
  });
}

export function createEnglishPhraseIndex(translations) {
  const index = new Map();
  for (const [key, value] of Object.entries(translations?.en || {})) {
    if (typeof value === 'string' && value.trim()) index.set(value.trim(), key);
  }
  return index;
}

export function translateDataLabel(value, t, fallback = value) {
  if (value === null || value === undefined || value === '') return value;
  const normalized = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  const key = DATA_LABEL_KEYS[normalized];
  return key ? t(key) : fallback;
}

export function formatLocalizedNumber(value, language, options = {}) {
  const meta = getLanguageMeta(language);
  return new Intl.NumberFormat(meta.locale, options).format(Number(value) || 0);
}

export function formatLocalizedDate(value, language, options = {}) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const meta = getLanguageMeta(language);
  return new Intl.DateTimeFormat(meta.locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(date);
}

export function formatLocalizedCurrency(value, language, currency = 'SAR', options = {}) {
  const meta = getLanguageMeta(language);
  const safeCurrency = /^[A-Z]{3}$/.test(String(currency || '')) ? currency : undefined;
  if (safeCurrency) {
    return new Intl.NumberFormat(meta.locale, {
      style: 'currency',
      currency: safeCurrency,
      currencyDisplay: 'code',
      maximumFractionDigits: 2,
      ...options,
    }).format(Number(value) || 0);
  }
  return `${formatLocalizedNumber(value, language, { maximumFractionDigits: 2, ...options })} ${currency || ''}`.trim();
}

export function getDirectionClass(direction, ltrClass, rtlClass) {
  return direction === 'rtl' ? rtlClass : ltrClass;
}
