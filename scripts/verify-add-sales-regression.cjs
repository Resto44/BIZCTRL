const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const salesPage = read('src/pages/Sales.jsx');
const workspace = read('src/components/sales/ERPSalesWorkspace.jsx');
const branchSelect = read('src/components/shared/BranchSelect.jsx');

// Regression: the sales list maps each entry as `s`. Referencing `sale` in the
// delete-permission expression previously raised a ReferenceError at render time.
assert(!salesPage.includes('isDriverSale(sale) || isBranchManager'), 'legacy undefined sales-row variable remains in delete permission');
assert(salesPage.includes('isDriverSale(s) || isBranchManager'), 'delete permission does not evaluate the current mapped sales row');

// Branch Manager Add Sales mount guards.
assert(branchSelect.includes('const branches = asRecordArray(tenantBranches);'), 'BranchSelect does not normalize loading/null branch data');
assert(branchSelect.includes('const canChange = typeof onChange === \'function\';'), 'BranchSelect does not guard a missing branch callback');
assert(branchSelect.includes('onValueChange={canChange ? onChange : undefined}'), 'BranchSelect can still invoke an invalid callback');

// Driver sale form must expose a clear, non-crashing empty state and retain its
// existing driver selector and sales-payload linkage for active drivers.
assert(workspace.includes('drivers.length === 0'), 'Driver empty-state guard is missing');
assert(workspace.includes('No active drivers are assigned to this branch.'), 'Driver empty-state message is missing');
assert(workspace.includes("driver_id: driverId,"), 'Driver ID is not persisted to the existing daily sales payload');
assert(workspace.includes('const totalSales   = useMemo(() => cashSales + networkTotal + creditTotal + customTotal'), 'Cash, network, and credit no longer contribute to total sales');

console.log('Add Sales regression checks passed: no undefined mapped sale variable; BranchSelect is null-safe; Driver Sales supports active and empty driver states; totals retain cash + network + credit.');
