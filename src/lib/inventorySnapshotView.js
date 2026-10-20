/**
 * Canonical display view of inventory snapshots (NOT a database migration).
 *
 * Each physical product / branch / unit has one latest displayed snapshot.
 * Earlier snapshots remain in history for audit, and no quantities are merged
 * across different units, branches, or unrelated SKUs.
 */
const normalize = (value) => String(value ?? '').trim().toLocaleLowerCase();

export function latestInventorySnapshots(rows = [], branches = []) {
  const branchIds = new Map();
  for (const branch of branches || []) {
    const id = String(branch?.id || branch?.branch_id || '').trim();
    if (!id) continue;
    for (const key of [branch.branch_key, branch.key, branch.name]) {
      if (key) branchIds.set(normalize(key), id);
    }
  }

  const latest = new Map();
  for (const row of rows || []) {
    if (!row) continue;
    const product = normalize(row.product_id || row.product_name || row.name || row.id);
    const branchRaw = String(row.branch_id || row.branch || row.branch_key || '').trim();
    const branch = branchIds.get(normalize(branchRaw)) || normalize(branchRaw);
    const unit = normalize(row.unit || row.unit_name || '');
    const key = `${branch}::${product}::${unit}`;
    // Business date is primary; updated timestamp disambiguates same-day edits.
    const version = `${String(row.date || '0000-00-00').slice(0, 10)}|${String(
      row.last_updated || row.updated_date || row.created_date || '',
    )}`;
    const previous = latest.get(key);
    if (!previous || version > previous.version) latest.set(key, { row, version });
  }
  return [...latest.values()].map(({ row }) => row);
}
