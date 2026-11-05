import { isWorkspacePathEnabled } from './workspaceCustomization';

export const WELCOME_TOUR_VERSION = '20261103';
export const WELCOME_TOUR_OPEN_EVENT = 'bizctrl:open-welcome-tour';
const NEW_ACCOUNT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function tourStorageKey(userId) {
  return 'bizctrl:welcome-tour:' + WELCOME_TOUR_VERSION + ':' + String(userId || '');
}

export function isNewSaaSUser(createdAt, now = new Date()) {
  const timestamp = Date.parse(createdAt || '');
  const elapsed = now.getTime() - timestamp;
  return Number.isFinite(timestamp) && elapsed >= -5 * 60 * 1000 && elapsed <= NEW_ACCOUNT_WINDOW_MS;
}

export function detectInstallDevice(userAgent = '', installed = false) {
  if (installed) return 'installed';
  if (/iPad|iPhone|iPod/i.test(userAgent)) {
    return /CriOS|FxiOS|OPiOS|EdgiOS|Mercury/i.test(userAgent) ? 'ios-other' : 'ios-safari';
  }
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

const module = (key, path, permission = null) => ({ key, path, permission });
const isRestaurant = mode => mode === 'restaurant' || mode === 'cafe';

export function getWelcomeTourStages({ role = 'owner', mode = 'restaurant', can = {}, configuration = null } = {}) {
  const owner = role === 'owner';
  const supplier = role === 'supplier';
  const employee = role === 'employee';
  const home = owner ? '/owner-command-center' :
    role === 'manager' || role === 'general_manager' ? '/manager-dashboard' :
      employee ? '/employee-dashboard' : '/supplier-portal';
  const permitted = item => {
    if (item.role && item.role !== role) return false;
    if (item.permission && can[item.permission] !== true) return false;
    return isWorkspacePathEnabled(configuration, item.path.split('?')[0]);
  };
  const stage = (key, modules = []) => ({ key, modules: modules.filter(permitted) });
  const stages = [
    stage('install'),
    // Push setup is a guided link to the existing, permission-gated Notification Center.
    // No automatic browser permission requests or push subscriptions occur in the tour.
    stage('notifications', [module('notifications', '/notifications', 'viewAlerts')]),
    stage('setup', owner ? [
      module('settings', '/settings', 'manageSettings'),
      module('branches', '/branch-management', 'viewBrandSettings'),
    ] : []),
    // Creation uses the same Owner/delegated customization permission as SalesSourceManagement.
    // The one-shot ?create=1 flag only opens the existing secure editor; it never saves a record.
    stage('sources', (owner || can.manageDashboardCustomization === true) ? [
      module('salesSources', '/sales-sources?create=1', 'viewSales'),
    ] : []),
    stage('prepare', supplier ? [] : [
      module('products', '/product-management', 'viewInventory'),
      ...(isRestaurant(mode) ? [] : [module('inventory', '/inventory', 'viewInventory')]),
      module('suppliers', '/suppliers', 'viewSuppliers'),
      module('purchases', '/purchases', 'viewPurchases'),
    ]),
    stage('operate', supplier ? [{ key: 'supplierPortal', path: '/supplier-portal', role: 'supplier' }] : [
      ...(isRestaurant(mode) ? [module('restaurantPOS', '/restaurant/pos', 'viewSales')] : []),
      ...(mode === 'retail' ? [module('retailPOS', '/pos', 'uploadSales')] :
        !isRestaurant(mode) ? [module('touchPOS', '/pos', 'uploadSales')] : []),
      module('sales', '/sales', 'viewSales'),
      module('expenses', '/expenses', 'viewExpenses'),
    ]),
    stage('review', [
      ...(supplier ? [] : [{ key: 'home', path: home, role }]),
      module('reports', '/reports', 'viewReports'),
      module('payables', '/purchases?payables=open', 'viewPurchases'),
    ]),
  ];
  // Staff/supplier accounts are guided through only the operations they can actually reach.
  return stages.filter(item => item.key === 'install' || item.key === 'setup' || item.modules.length > 0);
}
