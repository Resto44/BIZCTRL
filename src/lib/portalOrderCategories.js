// ERP portal orders: grouping is display-only; the server authoritatively checks
// tenant, branch, product IDs and unit prices at the moment of submission.
export const PORTAL_ORDER_ALL = '__all__';

const safeName = value => typeof value === 'string' ? value.trim() : '';
const keyOf = item => safeName(item?.category_key) || 'uncategorized';

export function portalOrderCategories(catalog = [], lang = 'en') {
  const groups = new Map();
  for (const item of Array.isArray(catalog) ? catalog : []) {
    if (!item || !item.id) continue;
    const key = keyOf(item);
    const fallback = safeName(item.category) || 'Other';
    const label = safeName(item['category_' + lang]) || fallback;
    if (!groups.has(key)) groups.set(key, { key, label, count: 0 });
    groups.get(key).count += 1;
  }
  return [...groups.values()];
}

export function selectedPortalCategory(categories, value) {
  if (value === PORTAL_ORDER_ALL) return PORTAL_ORDER_ALL;
  if (categories.some(group => group.key === value)) return value;
  // Show the first meaningful POS category rather than 250 items at once.
  return categories.length > 1 ? categories[0].key : PORTAL_ORDER_ALL;
}

export function filterPortalOrderProducts(catalog = [], categoryKey = PORTAL_ORDER_ALL, search = '') {
  const query = safeName(search).toLocaleLowerCase();
  return (Array.isArray(catalog) ? catalog : []).filter(item => {
    if (categoryKey !== PORTAL_ORDER_ALL && keyOf(item) !== categoryKey) return false;
    if (!query) return true;
    return [item.name, item.name_ar, item.name_fa, item.category, item.category_ar, item.category_fa]
      .some(value => safeName(value).toLocaleLowerCase().includes(query));
  });
}
