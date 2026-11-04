const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalized = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase();
export async function templateCategoryId(scope, mode, key) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['bizctrl-category-v1', scope.tenant, scope.branch || '', mode, key]))));
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
// Append only. Stable IDs make retries and simultaneous imports safe without changing user edits.
export async function installCategoryTemplate({scope, mode, groups, list, create, get, isCurrent = () => true}) {
  if (!uuid.test(scope.tenant) || (scope.branchScoped && !uuid.test(scope.branch || ''))) throw new Error('Select a valid business and branch.');
  if (!groups.length || groups.length > 10) throw new Error('Select between 1 and 10 categories.');
  for (const row of groups.flatMap(g => [g, ...g.children])) {
    if (!row.name?.trim() || row.name.length > 160 || !row.key) throw new Error('Category names must contain 1–160 characters.');
    for (const field of ['name_ar','name_fa']) if ((row[field] || '').length > 160) throw new Error('Category names must contain 1–160 characters.');
  }
  let created = 0, skipped = 0;
  const rows = await list(); // Must throw on read errors; never interpret a failed read as an empty tenant.
  const inScope = row => row.restaurant_id === scope.tenant && (row.branch_id || null) === (scope.branch || null);
  const ensure = async (item, parentId, order) => {
    if (!isCurrent()) throw new Error('Workspace changed. Reopen category templates.');
    const id = await templateCategoryId(scope, mode, item.key);
    const existing = rows.find(r => inScope(r) && (r.id === id || ((r.parent_id || null) === parentId && ['name','name_ar','name_fa'].some(k => normalized(item[k]) && normalized(item[k]) === normalized(r[k])))));
    if (existing) { skipped++; return existing.id; }
    const payload = {id, restaurant_id:scope.tenant, ...(scope.branch ? {branch_id:scope.branch} : {}), parent_id:parentId, name:item.name.trim(), name_ar:item.name_ar?.trim() || null, name_fa:item.name_fa?.trim() || null, icon:'📦', color:'#3B82F6', sort_order:order, is_active:true};
    if (!isCurrent()) throw new Error('Workspace changed. Reopen category templates.');
    try {
      const result = await create(payload);
      rows.push(result); created++; return result.id;
    } catch (error) {
      if (error.code !== '23505') throw error;
      const concurrent = await get(id);
      if (!inScope(concurrent) || (concurrent.parent_id || null) !== parentId) throw error;
      rows.push(concurrent); skipped++; return concurrent.id;
    }
  };
  const nextOrder = parentId => Math.max(-1,...rows.filter(r => inScope(r) && (r.parent_id || null) === parentId).map(r => Number(r.sort_order) || 0)) + 1;
  for (const group of groups) {
    const parent = await ensure(group, null, nextOrder(null));
    for (const child of group.children) await ensure(child, parent, nextOrder(parent));
  }
  return {created, skipped};
}
