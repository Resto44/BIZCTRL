const COUNTERS = {
  sales: ['negative_amounts'],
  supplier_invoices: ['overpaid', 'missing_organization'],
  daily_sales: ['missing_branch_id', 'legacy_branch_name', 'recent_missing_branch_id'],
  branch_references: [],
  rls: [],
};
const count = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

// Validate the complete read-only contract before showing any green health state.
// The existing RPC's sales.alerts counts reconciliation mismatches only.
// Flags count findings, not distinct invoices: an invoice can have two findings.
export function parsePlatformIntegritySnapshot(data) {
  if (!data || data.read_only !== true || data.scope !== 'platform_owner_only' ||
      data.financial_changes !== 0 || typeof data.generated_at !== 'string' ||
      !Number.isFinite(Date.parse(data.generated_at)) || !Array.isArray(data.groups) ||
      data.groups.length !== Object.keys(COUNTERS).length) {
    throw new Error('INVALID_PLATFORM_INTEGRITY_SNAPSHOT');
  }
  const seen = new Set();
  const groups = data.groups.map(group => {
    if (!group || !Object.hasOwn(COUNTERS, group.key) || seen.has(group.key) ||
        !count(group.alerts) || (group.key === 'branch_references' ? group.total !== null : !count(group.total)) ||
        !COUNTERS[group.key].every(key => count(group[key]))) {
      throw new Error('INVALID_PLATFORM_INTEGRITY_SNAPSHOT');
    }
    seen.add(group.key);
    return { ...group, findings: group.alerts + (group.key === 'sales' ? group.negative_amounts : 0) };
  });
  return {
    generated_at: data.generated_at,
    groups,
    flags: groups.reduce((sum, group) => sum + group.findings, 0),
    // Table counts and overlapping branch checks are not financial record counts.
    records: groups.filter(group => ['sales', 'supplier_invoices', 'daily_sales'].includes(group.key))
      .reduce((sum, group) => sum + group.total, 0),
    tables: groups.find(group => group.key === 'rls').total,
  };
}
