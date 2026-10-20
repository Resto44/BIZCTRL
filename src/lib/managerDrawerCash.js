import { enteredDrawerCash } from '@/lib/executiveDrawerCash';

/**
 * The last FINALIZED physical cash count for one authorized branch.
 * Sales totals, preliminary register drafts and expected cash are never
 * substitutes for a counted balance. An old count is explicitly dated;
 * it is not represented as a real-time physical measurement.
 */
const dayValue = row => String(row?.date || '').slice(0, 10);
const timeValue = row => Date.parse(row?.finalized_at || row?.updated_date || row?.created_date || '') || 0;

export function latestFinalizedDrawerCash(records = [], businessDate) {
  const today = String(businessDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return { amount: null, date: null, measuredAt: null, reason: 'invalid_date' };
  const rows = (Array.isArray(records) ? records : [])
    .filter(r => r?.closing_state === 'finalized' && /^\d{4}-\d{2}-\d{2}$/.test(dayValue(r)) && dayValue(r) <= today)
    .sort((a, b) => dayValue(b).localeCompare(dayValue(a)) || timeValue(b) - timeValue(a));
  const latest = rows[0];
  if (!latest) return { amount: null, date: null, measuredAt: null, reason: 'no_finalized_count' };
  const amount = enteredDrawerCash(latest);
  if (amount === null) return { amount: null, date: dayValue(latest), measuredAt: latest.finalized_at || null, reason: 'unverified_count' };
  return {
    amount: Math.round((amount + Number.EPSILON) * 100) / 100,
    date: dayValue(latest),
    measuredAt: latest.finalized_at || null,
    reason: 'last_finalized_count',
  };
}

const BIZ_CURRENCY = {
  '$': 'USD',
  'ر.س': 'SAR',
  '﷼': 'SAR',
  'ريال': 'SAR',
};
export function drawerCurrencyCode(sourceCurrency) {
  const value = String(sourceCurrency || '').trim();
  if (/^[A-Z]{3}$/.test(value)) return value;
  return BIZ_CURRENCY[value] || null;
}

export function displayDrawerCash(amount, sourceCurrency) {
  const iso = drawerCurrencyCode(sourceCurrency);
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return null;
  if (!iso) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: iso,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}
