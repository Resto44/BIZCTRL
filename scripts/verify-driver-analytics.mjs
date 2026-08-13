import fs from 'node:fs';
import { buildDriverSalesAnalytics, buildDriverTrendAnalytics, getDriverSaleEntries } from '../src/lib/driverAnalytics.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const drivers = [
  { id: 'driver-ahmad', full_name: 'Ahmad', branch_id: 'branch-a', is_active: true },
  { id: 'driver-sara', full_name: 'Sara', branch_id: 'branch-a', is_active: true },
  { id: 'driver-omar', full_name: 'Omar', branch_id: 'branch-b', is_active: false },
];

const branches = [
  { id: 'branch-a', key: 'A', name: 'Branch A' },
  { id: 'branch-b', key: 'B', name: 'Branch B' },
];

const sale = {
  id: 'daily-sale-1',
  date: '2026-08-13',
  branch_id: 'branch-a',
  // Standard Daily Sales totals include counter activity too.
  restaurant_cash: 920,
  restaurant_network: 580,
  credit: 400,
  drivers_json: JSON.stringify([
    { driver_id: 'driver-ahmad', driver_name: 'Ahmad', cash: 300, network: 200, credit: 100, total: 600 },
    { driver_id: 'driver-sara', driver_name: 'Sara', cash: 120, network: 80, credit: 0, total: 200 },
  ]),
};

const branchBSale = {
  id: 'daily-sale-2',
  date: '2026-08-12',
  branch_id: 'branch-b',
  drivers_json: JSON.stringify([
    { driver_id: 'driver-omar', driver_name: 'Omar', cash: 50, network: 60, credit: 90, total: 200 },
  ]),
};

const entries = getDriverSaleEntries(sale);
assert(entries.length === 2, `Expected 2 driver rows, received ${entries.length}`);
assert(entries[0].revenue === 600, `Expected Ahmad total 600, received ${entries[0].revenue}`);
assert(entries[1].revenue === 200, `Expected Sara total 200, received ${entries[1].revenue}`);

const analytics = buildDriverSalesAnalytics({ drivers, sales: [sale], branchId: 'branch-a' });
const ahmad = analytics.driverRows.find((row) => row.driverId === 'driver-ahmad');
const sara = analytics.driverRows.find((row) => row.driverId === 'driver-sara');
assert(ahmad?.cash === 300 && ahmad?.network === 200 && ahmad?.credit === 100 && ahmad?.revenue === 600, 'Ahmad did not receive only his 600 Driver Sales split');
assert(sara?.cash === 120 && sara?.network === 80 && sara?.credit === 0 && sara?.revenue === 200, 'Sara did not receive only her 200 Driver Sales split');
assert(analytics.totals.revenue === 800, `Expected aggregated Driver Sales 800, received ${analytics.totals.revenue}`);

const includedRange = buildDriverSalesAnalytics({ drivers, sales: [sale], branchId: 'branch-a', dateFrom: '2026-08-13', dateTo: '2026-08-13' });
assert(includedRange.totals.revenue === 800, `Expected the inclusive date range to retain 800, received ${includedRange.totals.revenue}`);

const excludedRange = buildDriverSalesAnalytics({ drivers, sales: [sale], branchId: 'branch-a', dateFrom: '2026-08-14', dateTo: '2026-08-14' });
assert(excludedRange.totals.revenue === 0, `Expected the out-of-range sale to be excluded, received ${excludedRange.totals.revenue}`);

const trends = buildDriverTrendAnalytics({
  drivers,
  sales: [sale, branchBSale],
  branches,
  dateFrom: '2026-08-12',
  dateTo: '2026-08-13',
});
assert(trends.totals.revenue === 1000, `Expected canonical trend revenue 1000, received ${trends.totals.revenue}`);
assert(trends.branchRows.length === 2, `Expected two branch trend rows, received ${trends.branchRows.length}`);
assert(trends.branchRows.find((row) => row.branchId === 'branch-a')?.revenue === 800, 'Branch A trend total must remain 800');
assert(trends.branchRows.find((row) => row.branchId === 'branch-b')?.revenue === 200, 'Branch B trend total must remain 200');
assert(trends.driverRows.find((row) => row.driverId === 'driver-omar')?.credit === 90, 'Driver trend must preserve Omar credit sales');
assert(trends.trendRows.length === 2, `Expected two daily trend rows, received ${trends.trendRows.length}`);
assert(trends.trendRows.find((row) => row.date === '2026-08-13')?.revenue === 800, 'Daily trend must preserve the multi-driver total');
assert(trends.trendRows.find((row) => row.date === '2026-08-12')?.revenue === 200, 'Daily trend must preserve Branch B total');

const read = (relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const trendComponent = read('../src/components/dashboard/DriverTrendAnalytics.jsx');
const ownerWidget = read('../src/components/dashboard/DriverPerformance.jsx');
const managementPage = read('../src/pages/DriverManagement.jsx');
const realtimeHook = read('../src/hooks/useOwnerDashboardRealtime.js');

assert(trendComponent.includes('Trend Analytics') && trendComponent.includes('Branch Breakdown') && trendComponent.includes('Driver Breakdown'), 'Trend Analytics component must provide branch and driver breakdowns.');
assert(trendComponent.includes('Driver Revenue Trend') && trendComponent.includes('Branch Revenue Comparison') && trendComponent.includes('Top Driver Comparison'), 'Trend Analytics component must provide canonical comparison charts.');
assert(trendComponent.includes('grid-cols-2') && trendComponent.includes('sm:grid-cols-4') && trendComponent.includes('xl:grid-cols-7') && trendComponent.includes('md:hidden'), 'Trend Analytics component must retain explicit mobile, tablet, and desktop layouts.');
assert(ownerWidget.includes(".or('driver_id.not.is.null,drivers_json.not.is.null')"), 'Owner Driver Analytics must include canonical multi-driver snapshot records.');
assert(ownerWidget.includes('DriverTrendAnalytics') && managementPage.includes('DriverTrendAnalytics'), 'Owner and Driver Management analytics must share the same trend component.');
assert(managementPage.includes('DRIVER_ANALYTICS_PERIODS') && ownerWidget.includes('DRIVER_ANALYTICS_PERIODS'), 'Owner and Manager analytics must expose all canonical periods.');
assert(realtimeHook.includes('daily_sales:') && realtimeHook.includes("'driver-sales'") && realtimeHook.includes("'driver-performance'"), 'Driver Sales realtime changes must invalidate Driver Analytics query keys.');

console.log('Multi-driver analytics test passed: canonical date ranges, branch comparison, driver comparison, daily trends, responsive layouts, and realtime attribution are enforced.');
