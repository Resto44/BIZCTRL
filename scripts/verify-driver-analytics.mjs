import { buildDriverSalesAnalytics, getDriverSaleEntries } from '../src/lib/driverAnalytics.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const drivers = [
  { id: 'driver-ahmad', full_name: 'Ahmad', branch_id: 'branch-a', is_active: true },
  { id: 'driver-sara', full_name: 'Sara', branch_id: 'branch-a', is_active: true },
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

console.log('Multi-driver analytics executable test passed: Ahmad 300+200+100=600, Sara 120+80+0=200, and inclusive date-range filtering preserves canonical attribution.');
