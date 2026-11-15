/** Opening-balance edits must never overwrite concurrently posted stock/cost movements. */
export function inventoryOpeningPayload(form, branches, existing = null) {
  const branch = branches.find(b => b.id && (b.key || b.branch_key) === form.branch);
  if (!branch || !form.product_id) throw new Error('Select a valid product and branch.');
  if (existing && (form.product_id !== existing.product_id || form.branch !== existing.branch || form.unit !== existing.unit)) {
    throw new Error('An existing stock record cannot be moved to another product, branch or unit.');
  }
  for (const field of ['opening_stock', 'low_stock_threshold']) {
    if (form[field] === '' || form[field] == null || !Number.isFinite(Number(form[field])) || Number(form[field]) < 0) throw new Error('Stock values must be valid non-negative numbers.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date || '') || new Date(form.date).toISOString().slice(0,10) !== form.date) throw new Error('Select a valid stock date.');
  return { product_id: form.product_id, product_name: form.product_name, branch: form.branch, branch_id: branch.id,
    unit: form.unit, opening_stock: Number(form.opening_stock), low_stock_threshold: Number(form.low_stock_threshold), date: form.date };
}
