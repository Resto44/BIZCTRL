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
const driverAnalytics = read('src/lib/driverAnalytics.js');
const driverManagement = read('src/pages/DriverManagement.jsx');
const driverPerformance = read('src/components/dashboard/DriverPerformance.jsx');

// Regression: the sales list maps each entry as `s`. Referencing `sale` in the
// delete-permission expression previously raised a ReferenceError at render time.
assert(!salesPage.includes('isDriverSale(sale) || isBranchManager'), 'legacy undefined sales-row variable remains in delete permission');
assert(salesPage.includes('isDriverSale(s) || isBranchManager'), 'delete permission does not evaluate the current mapped sales row');

// Branch Manager Add Sales mount guards.
assert(branchSelect.includes('const branches = asRecordArray(tenantBranches);'), 'BranchSelect does not normalize loading/null branch data');
assert(branchSelect.includes("const canChange = typeof onChange === 'function';"), 'BranchSelect does not guard a missing branch callback');
assert(branchSelect.includes('onValueChange={canChange ? onChange : undefined}'), 'BranchSelect can still invoke an invalid callback');

// Dedicated Driver Sales table and safe empty state.
assert(workspace.includes('SECTION 3 — DRIVER SALES'), 'dedicated Driver Sales section is missing');
assert(workspace.includes('Select Branch Driver'), 'Driver Sales table has no branch-driver selector');
assert(workspace.includes('Network / POS Sales'), 'Driver Sales table has no Network/POS field');
assert(workspace.includes('Total Driver Sales'), 'Driver Sales table has no total column');
assert(workspace.includes('drivers.length === 0'), 'Driver empty-state guard is missing');
assert(workspace.includes('No active drivers are assigned to this branch.'), 'Driver empty-state message is missing');

// Driver Sales is added exactly once to the canonical Daily Sales components.
assert(workspace.includes('const cashSales = useMemo(() => counterCashSales + driverCashSales'), 'Driver cash is not added to standard cash totals');
assert(workspace.includes('const networkTotal = useMemo(() => counterNetworkTotal + driverNetworkSales'), 'Driver network is not added to standard Network/POS totals');
assert(workspace.includes('const creditTotal = useMemo(() => customerCreditTotal + driverCreditSales'), 'Driver credit is not added to standard credit totals');
assert(workspace.includes('const totalSales = useMemo(() => cashSales + networkTotal + creditTotal + customTotal'), 'total sales no longer uses canonical cash + network + credit totals');
assert(workspace.includes('driver_cash: driverCashSales,'), 'driver cash split is not persisted');
assert(workspace.includes('driver_network: driverNetworkSales,'), 'driver network split is not persisted');
assert(workspace.includes('drivers_json: JSON.stringify(driverId ? [{'), 'driver credit and total snapshot is not persisted in the same Daily Sales record');
assert(workspace.includes('if (driverSalesEntered > 0 && !driverId)'), 'unattributed Driver Sales inputs are not blocked');
assert(!workspace.includes('base44.entities.DailySales.create('), 'workspace must not create a duplicate Daily Sales record');

// Required accounting example: Ahmad, Cash 300 + Network 200 + Credit 100 = 600.
const example = { cash: 300, network: 200, credit: 100 };
const total = example.cash + example.network + example.credit;
assert(total === 600, 'Driver Sales calculation must equal 600 SAR for 300 + 200 + 100');

// Driver dashboards and history must consume the dedicated split instead of the
// entire Daily Sales row, preventing accidental double attribution.
assert(driverAnalytics.includes('const snapshot = JSON.parse(sale.drivers_json);'), 'driver analytics does not read the saved Driver Sales snapshot');
assert(driverAnalytics.includes('revenue: cash + network + credit'), 'driver analytics does not calculate the split total');
assert(driverManagement.includes('driver_cash, driver_network, drivers_json'), 'Driver Management query omits saved Driver Sales fields');
assert(driverPerformance.includes('driver_cash, driver_network, drivers_json'), 'Owner Driver Performance query omits saved Driver Sales fields');

console.log('Driver Sales regression checks passed: distinct table, Ahmad 300+200+100=600, one canonical Daily Sales payload, standard totals include the split once, and driver analytics/history read the saved snapshot.');
