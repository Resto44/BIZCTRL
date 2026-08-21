const RESOURCE_LABELS = {
  users: 'users',
  branches: 'branches',
  employees: 'employees',
  restaurants: 'restaurants',
};

export function limitKey(resource) {
  const normalized = String(resource || '').trim().toLowerCase();
  return normalized === 'erp_memberships' ? 'users' : normalized;
}

export function isSubscriptionLimitReached(error) {
  const value = [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
    error?.cause?.message,
  ].filter(Boolean).join(' ');
  return /SUBSCRIPTION_LIMIT_REACHED/i.test(value);
}

export function subscriptionLimitMessage({ resource, used, limit, planName } = {}) {
  const key = limitKey(resource);
  const label = RESOURCE_LABELS[key] || (key || 'resources');
  const count = Number(used);
  const ceiling = Number(limit);
  const usage = Number.isFinite(count) && Number.isFinite(ceiling) && ceiling > 0
    ? ` You are using ${count} of ${ceiling} ${label}.`
    : '';
  const plan = planName ? ` Your current plan is ${planName}.` : '';
  return `Upgrade Plan required to add more ${label}.${usage}${plan}`;
}

export function subscriptionLimitErrorMessage(error, fallback = 'Unable to complete this action.') {
  if (!isSubscriptionLimitReached(error)) return error?.message || fallback;

  let detail = error?.details;
  if (typeof detail === 'string') {
    try {
      detail = JSON.parse(detail);
    } catch {
      detail = {};
    }
  }
  return detail?.upgrade_message || subscriptionLimitMessage(detail || {});
}

export function resourceWithinLimit(usage, limits, resource) {
  const key = limitKey(resource);
  const used = Number(usage?.[key] || 0);
  const limit = Number(limits?.[key] || 0);
  return limit > 0 && used < limit;
}
