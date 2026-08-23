const asArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

export function normalizeSalesDashboardBranches(value) {
  return asArray(value)
    .map((branch) => {
      const id = branch?.id || null;
      const key = branch?.key || branch?.branch_key || null;
      const label = branch?.label || branch?.name || key || id || '';
      return { ...branch, id, key, label };
    })
    .filter((branch) => branch.id || branch.key);
}

export function saleMatchesBranch(sale, branch) {
  if (!sale || !branch) return false;
  const branchKey = branch.key || branch.branch_key;
  return Boolean(
    (branch.id && sale.branch_id === branch.id)
    || (branchKey && sale.branch === branchKey)
    || (branchKey && sale.branch_key === branchKey)
  );
}

export function salesDashboardBranchLabel(sale, branches) {
  const match = normalizeSalesDashboardBranches(branches).find((branch) => saleMatchesBranch(sale, branch));
  return match?.label || sale?.branch || sale?.branch_key || 'Unassigned';
}
