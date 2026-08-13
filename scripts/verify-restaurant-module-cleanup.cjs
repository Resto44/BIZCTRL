const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

const removedFiles = [
  'src/components/delivery/DeliveryAnalytics.jsx',
  'src/components/delivery/DriverWallets.jsx',
  'src/components/delivery/NewOrderForm.jsx',
  'src/components/delivery/OrderBoard.jsx',
  'src/hooks/useOnlineOrdering.js',
  'src/lib/onlineOrderingRedesign.js',
  'src/lib/onlineOrderingService.js',
  'src/lib/orderPDFGenerator.js',
  'src/pages/AIRecommendations.jsx',
  'src/pages/CustomerDashboard.jsx',
  'src/pages/DeliveryOrders.jsx',
  'src/pages/DriverSettlements.jsx',
  'src/pages/MenuProducts.jsx',
  'src/pages/OnlineOrdering.jsx',
  'src/pages/OnlineOrderingV2.jsx',
  'src/pages/OrderAnalyticsV2.jsx',
  'src/pages/OrderManagementV2.jsx',
  'src/pages/Production.jsx',
  'src/pages/RecipeFoodCosting.jsx',
  'src/pages/Recipes.jsx',
  'src/pages/ReservationTableManagement.jsx',
];
removedFiles.forEach((file) => assert(!exists(file), `removed restaurant artifact remains: ${file}`));

const app = read('src/App.jsx');
const navigation = read('src/lib/navigationConfig.js');
const bottomNav = read('src/components/layout/BottomNav.jsx');
const sidebar = read('src/components/layout/ERPSidebar.jsx');
const managerDashboard = read('src/pages/ManagerDashboardERP.jsx');
const ownerRealtime = read('src/hooks/useOwnerDashboardRealtime.js');
const ownerDashboard = read('src/pages/OwnerDashboard.jsx');
const profitLoss = read('src/pages/ProfitLoss.jsx');
const customerPortal = read('src/pages/CustomerPortal.jsx');
const widgetRegistry = read('src/components/dashboard/DashboardWidgetRegistry.jsx');

const removedPaths = [
  '/delivery', '/menu-products', '/driver-settlements', '/online-ordering',
  '/order-management', '/order-analytics', '/recipe-food-costing', '/recipes',
  '/reservations', '/production', '/order/',
];
removedPaths.forEach((route) => {
  assert(!app.includes(`path="${route}`), `removed route remains in App: ${route}`);
  assert(!navigation.includes(`path: '${route}'`), `removed navigation path remains: ${route}`);
  assert(!bottomNav.includes(`path: '${route}'`), `removed mobile navigation path remains: ${route}`);
  assert(!sidebar.includes(`path: '${route}'`), `removed ERP sidebar path remains: ${route}`);
});

['DeliveryOrders', 'MenuProducts', 'OnlineOrdering', 'OrderManagementV2', 'OrderAnalyticsV2', 'Production', 'Recipes', 'RecipeFoodCosting', 'ReservationTableManagement', 'DriverSettlements'].forEach((name) => {
  assert(!app.includes(name), `removed lazy import or route symbol remains: ${name}`);
});

assert(!navigation.includes('NAV_GROUPS.RESTAURANT'), 'restaurant navigation group remains registered');
assert(!bottomNav.includes("title: 'Restaurant'"), 'restaurant section remains in the mobile More menu');
assert(!managerDashboard.includes('delivery_orders'), 'Manager Dashboard still queries delivery orders');
assert(!managerDashboard.includes('ManagerDeliverySection'), 'Manager Dashboard delivery panel remains');
assert(!ownerRealtime.includes('delivery_orders'), 'Owner realtime hook still subscribes to delivery orders');
assert(!ownerRealtime.includes('order_status_history'), 'Owner realtime hook still subscribes to order workflow');
assert(!ownerDashboard.includes('delivery_orders:'), 'Owner Dashboard still maps delivery event icons');
assert(!profitLoss.includes('base44.entities.Order.filter'), 'Profit & Loss still queries online orders');
assert(!profitLoss.includes('base44.entities.OrderItem.filter'), 'Profit & Loss still queries online order items');
assert(!customerPortal.includes('base44.entities.Order.filter'), 'Customer Portal still queries online orders');
assert(!customerPortal.includes('value="orders"'), 'Customer Portal still renders the online order-history tab');
assert(!widgetRegistry.includes("linkTo: '/order-management'"), 'dashboard widget still links to removed orders route');
assert(!widgetRegistry.includes("id: 'pending_orders'"), 'dashboard pending-orders widget remains');

// Guard the active canonical Driver Sales ERP path against accidental removal.
assert(exists('src/components/sales/ERPSalesWorkspace.jsx'), 'active Add Sales workspace was removed');
assert(exists('src/pages/DriverManagement.jsx'), 'active Driver Management was removed');
assert(exists('src/components/dashboard/DriverPerformance.jsx'), 'active Driver Analytics was removed');

console.log('Restaurant module cleanup regression checks passed: obsolete restaurant modules and queries are removed; active canonical ERP sales and driver features remain.');
