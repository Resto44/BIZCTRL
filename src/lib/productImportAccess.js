const SUPERMARKET_PORTALS = new Set(['retail', 'supermarket']);

function normalizePortal(value) {
  return String(value || '').trim().toLowerCase();
}

export function resolveProductImportPortal(organization) {
  const businessType = normalizePortal(organization?.business_type);
  if (businessType) return businessType;
  return normalizePortal(organization?.business_mode);
}

export function isSupermarketProductPortal(organization) {
  return SUPERMARKET_PORTALS.has(resolveProductImportPortal(organization));
}
