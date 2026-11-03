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

export const isRestaurantPOSPortal = organization => ['restaurant', 'cafe'].includes(resolveProductImportPortal(organization));

// Sales-capable non-food portals share the guarded, stock-backed commerce POS.
// Restaurant/cafe use their separate recipe/kitchen POS; supplier/employee are roles,
// not business portal modes. Supermarket bulk import remains retail-only.
export const COMMERCE_POS_PORTALS = Object.freeze([
  'retail', 'supermarket', 'warehouse', 'wholesale', 'factory',
  'pharmacy', 'clinic', 'services', 'other',
]);
export const isCommercePOSPortal = organization =>
  COMMERCE_POS_PORTALS.includes(resolveProductImportPortal(organization));

export function businessTouchPosPath(organization) {
  if (isRestaurantPOSPortal(organization)) return '/restaurant/pos';
  if (isCommercePOSPortal(organization)) return '/retail/cashier';
  return null;
}
export function businessPOSControlPath(organization) {
  if (isRestaurantPOSPortal(organization)) return '/owner-command-center';
  if (isCommercePOSPortal(organization)) return '/retail/pos-control';
  return null;
}
