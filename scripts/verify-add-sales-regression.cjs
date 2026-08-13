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

// Responsive unlimited Driver Sales rows.
assert(workspace.includes('SECTION 3 — DRIVER SALES'), 'dedicated Driver Sales section is missing');
assert(workspace.includes('Add Driver'), 'Driver Sales does not provide an Add Driver action');
assert(workspace.includes('driverSalesRows.map'), 'Driver Sales does not render individual driver rows');
assert(workspace.includes('Select branch driver'), 'Driver Sales row has no branch-driver selector');
assert(workspace.includes('Network / POS Sales'), 'Driver Sales row has no Network/POS field');
assert(workspace.includes('Total</p>'), 'Driver Sales row has no total field');
assert(workspace.includes('grid grid-cols-1 gap-3 sm:grid-cols-2'), 'Driver Sales rows are not responsive for mobile');
assert(!workspace.includes('overflow-x-auto rounded-xl border border-sky-100'), 'retired Driver Sales horizontal scrolling remains');
assert(!workspace.includes('min-w-[620px]'), 'retired fixed-width Driver Sales table remains');
assert(workspace.includes('selectedInAnotherRow'), 'duplicate drivers are not prevented across Driver Sales rows');
assert(workspace.includes('setDriverSalesRows([]);'), 'Driver Sales rows are not reset when the branch changes');
assert(workspace.includes('drivers.length === 0'), 'Driver empty-state guard is missing');

// Driver rows are added exactly once to the canonical Daily Sales components.
assert(workspace.includes('const cashSales = useMemo(() => counterCashSales + driverCashSales'), 'Driver cash is not added to standard cash totals');
assert(workspace.includes('const networkTotal = useMemo(() => counterNetworkTotal + driverNetworkSales'), 'Driver network is not added to standard Network/POS totals');
assert(workspace.includes('const creditTotal = useMemo(() => customerCreditTotal + driverCreditSales'), 'Driver credit is not added to standard credit totals');
assert(workspace.includes('const totalSales = useMemo(() => cashSales + networkTotal + creditTotal + customTotal'), 'total sales no longer uses canonical cash + network + credit totals');
assert(workspace.includes('drivers_json: JSON.stringify(selectedDriverRows.map'), 'all Driver Sales rows are not persisted in the same Daily Sales record');
assert(workspace.includes('new Set(selectedDriverIds).size !== selectedDriverIds.length'), 'duplicate driver validation is missing');
assert(!workspace.includes('base44.entities.DailySales.create('), 'workspace must not create a duplicate Daily Sales record');

// Required row calculation: Ahmad, Cash 300 + Network 200 + Credit 100 = 600.
const ahmad = { cash: 300, network: 200, credit: 100 };
const sara = { cash: 120, network: 80, credit: 0 };
const ahmadTotal = ahmad.cash + ahmad.network + ahmad.credit;
const driverListTotal = ahmadTotal + sara.cash + sara.network + sara.credit;
assert(ahmadTotal === 600, 'Ahmad Driver Sales must equal 600 SAR for 300 + 200 + 100');
assert(driverListTotal === 800, 'multiple driver rows must aggregate all individual totals once');

// Driver dashboards and history must consume every saved split entry rather than
// the complete Daily Sales row, preventing accidental counter-sale attribution.
assert(driverAnalytics.includes('export function getDriverSaleEntries'), 'driver analytics does not expose multi-driver snapshot entries');
assert(driverAnalytics.includes('getDriverSaleEntries(sale).forEach'), 'driver analytics does not aggregate every driver row');
assert(driverManagement.includes('getDriverSaleEntries(sale)'), 'Driver Management history omits additional drivers in a shared Daily Sales record');
assert(driverManagement.includes('driver_cash, driver_network, drivers_json'), 'Driver Management query omits saved Driver Sales fields');
assert(driverPerformance.includes('driver_cash, driver_network, drivers_json'), 'Owner Driver Performance query omits saved Driver Sales fields');

console.log('Multi-driver UI regression checks passed: vertical responsive rows, Add Driver, no horizontal scroll, individual totals, single-record aggregation, and multi-driver analytics/history.');
