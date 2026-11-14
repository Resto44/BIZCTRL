/**
 * Product Master brand vocabulary. Brands are free-text on public.products:
 * no duplicate brand table or implicit relation to the SaaS company's branding.
 * This read-only lookup uses the authenticated, RLS-respecting SQL function.
 */
export function normalizeProductBrand(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

export function existingProductBrand(brands, value) {
  const needle = normalizeProductBrand(value).toLocaleLowerCase();
  if (!needle) return null;
  return (Array.isArray(brands) ? brands : []).find(
    brand => normalizeProductBrand(brand).toLocaleLowerCase() === needle,
  ) || null;
}

export function cleanProductBrands(rows, currentValue = '') {
  const distinct = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const value = normalizeProductBrand(typeof row === 'string' ? row : row?.brand);
    if (!value || value.length > 120) continue;
    const key = value.toLocaleLowerCase();
    if (!distinct.has(key)) distinct.set(key, value);
  }
  const current = normalizeProductBrand(currentValue);
  if (current && current.length <= 120 && !distinct.has(current.toLocaleLowerCase())) {
    distinct.set(current.toLocaleLowerCase(), current);
  }
  return [...distinct.values()].sort((a, b) => a.localeCompare(b, undefined, {
    sensitivity: 'base', numeric: true,
  }));
}

export async function fetchProductBrandChoices(db, restaurantId) {
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(restaurantId || '')) {
    throw new Error('An authorized business is required to load product brands.');
  }
  const { data, error } = await db.rpc('erp_product_brand_choices', {
    p_restaurant_id: restaurantId,
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Product brands could not be verified.');
  return cleanProductBrands(data);
}
