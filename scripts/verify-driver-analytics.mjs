import { getDriverSaleAmounts } from '../src/lib/driverAnalytics.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sale = {
  driver_id: 'driver-ahmad',
  // Standard Daily Sales totals can include normal branch activity as well.
  restaurant_cash: 800,
  restaurant_network: 500,
  credit: 400,
  drivers_json: JSON.stringify([{
    driver_id: 'driver-ahmad',
    driver_name: 'Ahmad',
    cash: 300,
    network: 200,
    credit: 100,
    total: 600,
  }]),
};

const amounts = getDriverSaleAmounts(sale);
assert(amounts.cash === 300, `Expected Driver Cash 300, received ${amounts.cash}`);
assert(amounts.network === 200, `Expected Driver Network 200, received ${amounts.network}`);
assert(amounts.credit === 100, `Expected Driver Credit 100, received ${amounts.credit}`);
assert(amounts.revenue === 600, `Expected Driver Total 600, received ${amounts.revenue}`);

console.log('Driver analytics executable test passed: Ahmad cash 300 + network 200 + credit 100 = 600, independent of other Daily Sales amounts.');
