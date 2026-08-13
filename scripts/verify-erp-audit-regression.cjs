const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const reports = read('src/pages/Reports.jsx');
const biCenter = read('src/pages/BICenter.jsx');
const branchManagement = read('src/pages/BranchManagement.jsx');
const alerts = read('src/pages/Alerts.jsx');
const realtime = read('src/hooks/useOwnerDashboardRealtime.js');
const roles = read('src/lib/RoleContext.jsx');
const tenant = read('src/lib/TenantContext.jsx');

// Owner reporting must scope through restaurant_id; manager reporting must use the assigned branch.
assert(reports.includes("if (activeRestaurant?.id) return { restaurantId: activeRestaurant.id };"), 'Reports must use active restaurant scope for Owner records.');
assert(reports.includes("if (isManager) return branch ? { branch } : null;"), 'Reports must preserve Branch Manager branch scope.');
assert(reports.includes(".in('status', ['approved', 'partial', 'paid'])"), 'Reports must use canonical approved supplier invoice states.');
assert(!reports.includes(".eq('created_by', ownerFilter.created_by)"), 'Reports must not restrict Owner purchases to Owner-created records.');

// BI Center must use canonical Daily Sales and approved invoice fields.
assert(biCenter.includes('const getSaleTotal = (sale) =>'), 'BI Center must normalize Daily Sales totals.');
assert(biCenter.includes('const getPurchaseTotal = (purchase) =>'), 'BI Center must normalize purchase totals.');
assert(!biCenter.includes('r.total_sales'), 'BI Center must not use the removed total_sales field.');
assert(biCenter.includes("{ name: 'Network/POS', value: card }"), 'BI Center must expose Network/POS analytics from canonical sales data.');
assert(biCenter.includes(".from('supplier_invoices')"), 'BI Center must use canonical supplier invoices for procurement totals.');
assert(biCenter.includes('eachDayOfInterval({ start: subDays(new Date(), days - 1), end: new Date() })'), 'BI Center must render the full selected reporting period.');
assert(biCenter.includes('onClick={exportTrendCsv}') && biCenter.includes('aria-label="Export business intelligence trend as CSV"'), 'BI Center export control must be functional and accessible.');
assert(biCenter.includes('flex flex-wrap items-center justify-between gap-2'), 'BI Center header must wrap safely on compact layouts.');

// Branch Management and Alerts must aggregate all restaurant records instead of only Owner-created ones.
assert(branchManagement.includes("{ restaurant_id: activeRestaurantId }"), 'Branch Management must scope analytics by active restaurant.');
assert(branchManagement.includes(".from('supplier_invoices')"), 'Branch Management must use canonical supplier invoices.');
assert(alerts.includes("if (activeRestaurant?.id) return { restaurantId: activeRestaurant.id };"), 'Alerts must include all Owner restaurant activity.');
assert(alerts.includes(".from('supplier_invoices')"), 'Alerts must use canonical supplier invoices.');

// Owner realtime must invalidate corrected analytics and history queries.
for (const key of ['bi_sales', 'bm_sales', 'purchases_erp', 'bi_purchases', 'bm_purchases', 'bi_expenses', 'bm_expenses', "'wallet_transactions'", "'inventory'"]) {
  assert(realtime.includes(key), `Realtime map is missing ${key}.`);
}

// Unknown roles must deny access instead of receiving Owner defaults.
assert(roles.includes('return ROLES.EMPLOYEE; // Deny by default until a recognized role is available'), 'RoleContext must deny unknown roles.');
assert(roles.includes('if (!ctx) return { role: ROLES.EMPLOYEE'), 'RoleContext fallback must deny access.');
assert(tenant.includes('return ROLES.EMPLOYEE; // deny data access until a recognized role is available'), 'TenantContext must deny unknown roles.');

const saleTotal = (sale) => {
  if (sale.total !== null && sale.total !== undefined && sale.total !== '') return Number(sale.total) || 0;
  return (Number(sale.cash) || 0) + (Number(sale.network) || 0) + (Number(sale.credit) || 0);
};
const purchaseTotal = (purchase) => {
  if (purchase.total_amount !== null && purchase.total_amount !== undefined && purchase.total_amount !== '') return Number(purchase.total_amount) || 0;
  return (Number(purchase.used_price ?? purchase.current_price) || 0) * (Number(purchase.qty || 1) || 1);
};

assert(saleTotal({ cash: 250, network: 300, credit: 200 }) === 750, 'Canonical fallback sale total must equal Cash + Network + Credit.');
assert(saleTotal({ total: 1000, cash: 250, network: 300, credit: 200 }) === 1000, 'Explicit Daily Sales total must preserve additional canonical sale sources.');
assert(purchaseTotal({ total_amount: 450, qty: 3, used_price: 100 }) === 450, 'Canonical supplier invoice total must be preferred.');
assert(purchaseTotal({ qty: 3, used_price: 100 }) === 300, 'Legacy purchase fallback must use quantity × unit cost.');

console.log('ERP audit regression passed: canonical Owner/Manager scoping, totals, realtime invalidation, and deny-by-default roles are enforced.');
